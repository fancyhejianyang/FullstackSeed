import {
  EXTENDED_IMAGE_PROTOCOLS,
  EXTENDED_VIDEO_PROTOCOLS,
} from '../common/ai/tokenhub-adapters';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  In,
  IsNull,
  LessThan,
  Like,
  Repository,
  type UpdateResult,
} from 'typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import {
  imageGenerationResult,
  imageGenerationRequest,
} from '../common/ai/image-generation';
import {
  downloadGeneratedImage,
  downloadGeneratedVideo,
  imageMime,
  readMediaJson,
  videoMime,
} from '../common/ai/image-utils';
import {
  videoGenerationRequest,
  videoTaskId,
  videoTaskResult,
} from '../common/ai/video-generation';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import type { MediaProtocol } from '../model-endpoints/model-endpoint.constants';
import { ManagedFilesService } from '../managed-files/managed-files.service';
import type { UploadedStorageFile } from '../uploads/uploads.service';
import {
  AI_MATERIAL_IMAGE_REFERENCE_LIMIT_BYTES,
  AI_MATERIAL_STYLE_VERSION,
  AI_MATERIAL_VIDEO_REFERENCE_LIMIT_BYTES,
  buildMaterialPrompt,
  materialMediaType,
  materialNeedsReferenceImage,
  materialNeedsReferenceMedia,
  type AiMaterialGenerationMode,
  type AiMaterialReferenceMedia,
} from './ai-material.constants';
import {
  BatchDeleteAiMaterialDto,
  CreateAiMaterialDto,
  GenerateAiMaterialDto,
  QueryAiMaterialDto,
  QueryMaterialTaskDto,
  UpdateAiMaterialDto,
} from './dto/ai-material.dto';
import { AiMaterial } from './entities/ai-material.entity';
import {
  MaterialGenerationTask,
  type MaterialTaskStatus,
} from './entities/material-generation-task.entity';
import {
  describeMaterialGenerationFailure,
  materialGenerationTimeout,
  materialLeaseExpiredMessage,
  materialTaskLease,
  MaterialProviderHttpError,
  type MaterialGenerationPhase,
} from './material-generation-error';

const ACTIVE_STATUSES: MaterialTaskStatus[] = ['pending', 'running', 'storing'];
@Injectable()
export class AiMaterialsService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = randomUUID();
  private readonly logger = new Logger(AiMaterialsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private stopped = false;
  private activeAbort?: AbortController;

  constructor(
    @InjectRepository(AiMaterial)
    private readonly materials: Repository<AiMaterial>,
    @InjectRepository(MaterialGenerationTask)
    private readonly tasks: Repository<MaterialGenerationTask>,
    @InjectRepository(AiFeatureConfig)
    private readonly configRepository: Repository<AiFeatureConfig>,
    private readonly configs: AiFeatureConfigsService,
    private readonly providers: KnowledgeAiProvidersService,
    private readonly managedFiles: ManagedFilesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() =>
        this.logger.warn('素材生成任务调度暂不可用，将稍后检查'),
      );
    }, 2000);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.activeAbort?.abort();
  }

  async findAll(query: QueryAiMaterialDto, userId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      userId,
      ...(query.status ? { generationStatus: query.status as never } : {}),
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
      ...(query.keyword?.trim()
        ? { prompt: Like(`%${query.keyword.trim()}%`) }
        : {}),
    };
    const [rows, total] = await this.materials.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const configIds = Array.from(new Set(rows.map((row) => row.aiConfigId)));
    const configs = configIds.length
      ? await this.configRepository.find({
          select: { id: true, name: true, model: true },
          where: { id: In(configIds) },
          withDeleted: true,
        })
      : [];
    const configMap = new Map(configs.map((config) => [config.id, config]));
    return {
      list: rows.map((row) => {
        const { prompt, customStyle, referenceMedia, ...summary } = row;
        const config = configMap.get(row.aiConfigId);
        return {
          ...summary,
          currentMediaUrl: row.currentImageUrl,
          promptPreview: prompt.slice(0, 160),
          aiConfigName: config?.name ?? `配置 #${row.aiConfigId}`,
          aiModel: config?.model ?? '',
          hasCustomStyle: !!customStyle,
          referenceCount: referenceMedia?.length ?? 0,
        };
      }),
      total,
    };
  }

  async findOne(id: number, userId: number) {
    const material = await this.material(id, userId);
    const config = await this.configRepository.findOne({
      select: { id: true, name: true, model: true },
      where: { id: material.aiConfigId },
      withDeleted: true,
    });
    const latestTask = await this.tasks.findOne({
      select: {
        id: true,
        status: true,
        resultFileId: true,
        providerTaskId: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      where: { materialId: id, userId },
      order: { id: 'DESC' },
    });
    return {
      ...material,
      currentMediaUrl: material.currentImageUrl,
      aiConfigName: config?.name ?? `配置 #${material.aiConfigId}`,
      aiModel: config?.model ?? '',
      referenceCount: material.referenceMedia?.length ?? 0,
      latestTask,
    };
  }

  async create(
    dto: CreateAiMaterialDto,
    userId: number,
    referenceImage?: UploadedStorageFile,
  ) {
    const generationMode = dto.generationMode ?? 'textToImage';
    const mediaType = materialMediaType(generationMode);
    await this.assertConfig(dto.aiConfigId, generationMode);
    const source = this.referenceImage(generationMode, referenceImage);
    const referenceMedia = this.referenceMedia(
      generationMode,
      dto.referenceMedia,
    );
    const material = await this.materials.manager.transaction(
      async (manager) => {
        const materials = manager.getRepository(AiMaterial);
        const material = await materials.save(
          materials.create({
            userId,
            prompt: dto.prompt.trim(),
            styleKey: dto.styleKey,
            customStyle:
              dto.styleKey === 'custom'
                ? dto.customStyle?.trim() || null
                : null,
            aiConfigId: dto.aiConfigId,
            generationMode,
            mediaType,
            currentMediaType: null,
            videoResolution: dto.videoResolution ?? '720P',
            videoRatio: dto.videoRatio ?? 'adaptive',
            videoDuration: dto.videoDuration ?? 5,
            referenceFileId: null,
            referenceImageUrl: null,
            referenceMedia,
            currentFileId: null,
            currentImageUrl: null,
            version: 1,
            generationRevision: 0,
            generationStatus: 'idle',
            generationError: null,
          }),
        );
        if (!source) return material;
        const file = await this.managedFiles.stageAndStore(source, {
          ownerId: userId,
          materialId: material.id,
          revision: material.version,
        });
        await this.managedFiles.replaceMaterialSourceReference(manager, {
          ownerId: userId,
          materialId: material.id,
          newFileId: file.id,
          oldFileId: null,
        });
        material.referenceFileId = file.id;
        material.referenceImageUrl = file.publicUrl;
        return materials.save(material);
      },
    );
    return { ...material, currentMediaUrl: material.currentImageUrl };
  }

  async update(
    id: number,
    dto: UpdateAiMaterialDto,
    userId: number,
    referenceImage?: UploadedStorageFile,
  ) {
    const material = await this.material(id, userId);
    const nextConfigId = dto.aiConfigId ?? material.aiConfigId;
    const generationMode = dto.generationMode ?? material.generationMode;
    const mediaType = materialMediaType(generationMode);
    await this.assertConfig(nextConfigId, generationMode);
    const source = this.referenceImage(generationMode, referenceImage, true);
    const referenceMedia =
      dto.referenceMedia !== undefined ||
      generationMode !== material.generationMode
        ? this.referenceMedia(generationMode, dto.referenceMedia)
        : material.referenceMedia;
    if (
      materialNeedsReferenceImage(generationMode) &&
      !source &&
      !material.referenceFileId
    )
      throw new BadRequestException('图生图/图生视频必须上传参考图片');
    const nextStyle = dto.styleKey ?? material.styleKey;
    const customStyle =
      nextStyle === 'custom'
        ? (dto.customStyle ?? material.customStyle)?.trim() || null
        : null;
    if (nextStyle === 'custom' && !customStyle)
      throw new BadRequestException('请填写自定义风格');
    const stagedSource = source
      ? await this.managedFiles.stageAndStore(source, {
          ownerId: userId,
          materialId: id,
          revision: material.version + 1,
        })
      : null;
    const updated = await this.materials.manager.transaction(
      async (manager) => {
        const materials = manager.getRepository(AiMaterial);
        const current = await materials.findOne({
          where: { id, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) throw new NotFoundException('素材不存在');
        if (current.version !== material.version)
          throw new ConflictException('素材已更新，请刷新后重试');
        if (dto.prompt !== undefined) current.prompt = dto.prompt.trim();
        current.styleKey = nextStyle;
        current.customStyle = customStyle;
        current.aiConfigId = nextConfigId;
        current.generationMode = generationMode;
        current.mediaType = mediaType;
        current.videoResolution =
          dto.videoResolution ?? material.videoResolution;
        current.videoRatio = dto.videoRatio ?? material.videoRatio;
        current.videoDuration = dto.videoDuration ?? material.videoDuration;
        current.version += 1;
        if (!materialNeedsReferenceImage(generationMode)) {
          await this.managedFiles.releaseMaterialSourceReference(
            manager,
            userId,
            id,
            current.referenceFileId,
          );
          current.referenceFileId = null;
          current.referenceImageUrl = null;
        } else if (stagedSource) {
          await this.managedFiles.replaceMaterialSourceReference(manager, {
            ownerId: userId,
            materialId: id,
            newFileId: stagedSource.id,
            oldFileId: current.referenceFileId,
          });
          current.referenceFileId = stagedSource.id;
          current.referenceImageUrl = stagedSource.publicUrl;
        } else if (!current.referenceFileId) {
          throw new BadRequestException('图生图/图生视频必须上传参考图片');
        }
        current.referenceMedia = referenceMedia;
        if (
          !ACTIVE_STATUSES.includes(
            current.generationStatus as MaterialTaskStatus,
          )
        ) {
          current.generationStatus = 'idle';
          current.generationError = null;
        }
        return materials.save(current);
      },
    );
    return { ...updated, currentMediaUrl: updated.currentImageUrl };
  }

  async remove(id: number, userId: number) {
    await this.assertNotActive(id, userId);
    await this.materials.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AiMaterial);
      const tasks = manager.getRepository(MaterialGenerationTask);
      const material = await repo.findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!material) throw new NotFoundException('素材不存在');
      if (
        await tasks.exists({
          where: {
            userId,
            materialId: id,
            status: In(ACTIVE_STATUSES),
          },
        })
      )
        throw new ConflictException('素材正在生成，请完成后再删除');
      await this.managedFiles.releaseMaterialReference(
        manager,
        userId,
        id,
        material.currentFileId,
      );
      await this.managedFiles.releaseMaterialSourceReference(
        manager,
        userId,
        id,
        material.referenceFileId,
      );
      await repo.softDelete({ id, userId });
    });
    return { id };
  }

  async batchRemove(dto: BatchDeleteAiMaterialDto, userId: number) {
    const ids = Array.from(new Set(dto.ids));
    for (const id of ids) await this.assertNotActive(id, userId);
    for (const id of ids) await this.remove(id, userId);
    return { ids };
  }

  configOptions(query: QueryAiMaterialDto) {
    return this.configs.materialGenerationOptions(query);
  }

  async submit(materialId: number, dto: GenerateAiMaterialDto, userId: number) {
    const existing = await this.tasks.findOne({
      where: { userId, requestId: dto.requestId },
    });
    if (existing) {
      if (
        existing.materialId !== materialId ||
        existing.materialVersion !== dto.version
      )
        throw new ConflictException('请求号已用于不同素材或版本');
      return this.taskSummary(existing);
    }
    const material = await this.material(materialId, userId);
    if (material.version !== dto.version)
      throw new ConflictException('素材已更新，请刷新后重新生成');
    const config = await this.assertConfig(
      material.aiConfigId,
      material.generationMode,
    );
    if (
      materialNeedsReferenceImage(material.generationMode) &&
      !material.referenceFileId
    )
      throw new BadRequestException(
        '图生图/图生视频素材缺少参考图片，请先编辑素材',
      );
    if (
      materialNeedsReferenceMedia(material.generationMode) &&
      !material.referenceMedia?.length
    )
      throw new BadRequestException(
        '多参考生视频素材缺少参考素材，请先编辑素材',
      );
    const snapshot = {
      requestVersion: material.version,
      revision: material.generationRevision + 1,
      prompt: material.prompt,
      styleKey: material.styleKey,
      styleVersion: AI_MATERIAL_STYLE_VERSION,
      customStyle: material.customStyle,
      finalPrompt: buildMaterialPrompt({
        prompt: material.prompt,
        styleKey: material.styleKey,
        customStyle: material.customStyle,
        defaultRequirement: config.systemPrompt,
      }),
      generationMode: material.generationMode,
      mediaType: material.mediaType,
      videoResolution: material.videoResolution,
      videoRatio: material.videoRatio,
      videoDuration: material.videoDuration,
      referenceFileId: material.referenceFileId,
      referenceMedia: material.referenceMedia,
      config: {
        id: config.id,
        name: config.name,
        providerId: config.providerId!,
        providerName: config.providerName ?? '',
        model: config.model!,
      },
    };
    try {
      return await this.tasks.manager.transaction(async (manager) => {
        const materials = manager.getRepository(AiMaterial);
        const current = await materials.findOne({
          where: { id: materialId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current || current.version !== dto.version)
          throw new ConflictException('素材已更新或删除，请刷新后重试');
        const tasks = manager.getRepository(MaterialGenerationTask);
        const task = await tasks.save(
          tasks.create({
            userId,
            materialId,
            materialVersion: dto.version,
            requestId: dto.requestId,
            status: 'pending',
            activeMaterialId: materialId,
            activeUserId: null,
            snapshot,
            resultFileId: null,
            providerTaskId: null,
            workerId: null,
            leaseExpiresAt: null,
            startedAt: null,
            finishedAt: null,
            errorMessage: null,
          }),
        );
        current.generationStatus = 'pending';
        current.generationError = null;
        await materials.save(current);
        return this.taskSummary(task);
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        const duplicateRequest = await this.tasks.findOne({
          where: { userId, requestId: dto.requestId },
        });
        if (duplicateRequest) {
          if (
            duplicateRequest.materialId !== materialId ||
            duplicateRequest.materialVersion !== dto.version
          )
            throw new ConflictException('请求号已用于不同素材或版本');
          return this.taskSummary(duplicateRequest);
        }
        throw new ConflictException(
          '该素材已有排队或生成任务，请等待完成后再提交',
        );
      }
      throw error;
    }
  }

  async listTasks(query: QueryMaterialTaskDto, userId: number) {
    const where = {
      userId,
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.tasks.findAndCount({
      select: {
        id: true,
        materialId: true,
        materialVersion: true,
        status: true,
        resultFileId: true,
        providerTaskId: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      where,
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list: rows, total };
  }

  async taskDetail(id: number, userId: number) {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('素材生成任务不存在');
    return { ...this.taskSummary(task), snapshot: task.snapshot };
  }

  async tick() {
    if (this.stopped || this.draining) return;
    this.draining = true;
    try {
      await this.expireLeases();
      const task = await this.tasks
        .createQueryBuilder('task')
        .where('task.status = :pendingStatus', { pendingStatus: 'pending' })
        .andWhere('task.deletedAt IS NULL')
        .andWhere(
          `NOT EXISTS (
            SELECT 1
            FROM material_generation_tasks active_task
            WHERE active_task.activeUserId = task.userId
              AND active_task.status IN (:...executionStatuses)
              AND active_task.deletedAt IS NULL
          )`,
          { executionStatuses: ['running', 'storing'] },
        )
        .orderBy('task.id', 'ASC')
        .getOne();
      if (!task || this.stopped) return;
      let claim: UpdateResult;
      try {
        claim = await this.tasks.update(
          { id: task.id, status: 'pending', deletedAt: IsNull() },
          {
            status: 'running',
            activeUserId: task.userId,
            workerId: this.workerId,
            startedAt: new Date(),
            leaseExpiresAt: new Date(
              Date.now() +
                materialTaskLease(task.snapshot?.mediaType ?? 'image'),
            ),
          },
        );
      } catch (error) {
        if (this.isDuplicateEntry(error)) return;
        throw error;
      }
      if (claim.affected !== 1) return;
      await this.materials.update(
        { id: task.materialId, userId: task.userId },
        { generationStatus: 'running', generationError: null },
      );
      await this.run(task.id);
    } finally {
      this.draining = false;
    }
  }

  private async run(taskId: number) {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) return;
    this.activeAbort = new AbortController();
    let resultFileId: number | null = null;
    let phase: MaterialGenerationPhase = 'resolvingConfig';
    try {
      const mediaType =
        task.snapshot.mediaType ??
        materialMediaType(task.snapshot.generationMode ?? 'textToImage');
      const signal = AbortSignal.any([
        this.activeAbort.signal,
        AbortSignal.timeout(materialGenerationTimeout(mediaType)),
      ]);
      const target = await this.providers.resolveMediaTarget(
        task.snapshot.config.providerId,
        task.snapshot.config.model,
        mediaType === 'video' ? 'videoGeneration' : 'imageGeneration',
        task.snapshot.generationMode ?? 'textToImage',
      );
      const generationMode = task.snapshot.generationMode ?? 'textToImage';
      phase = 'readingReference';
      const reference = materialNeedsReferenceImage(generationMode)
        ? await this.managedFiles.readMaterialImage(
            task.snapshot.referenceFileId ?? 0,
            task.userId,
            generationMode === 'imageToVideo'
              ? AI_MATERIAL_VIDEO_REFERENCE_LIMIT_BYTES
              : AI_MATERIAL_IMAGE_REFERENCE_LIMIT_BYTES,
          )
        : null;
      const referenceImageDataUrl = reference
        ? `data:${reference.mimeType};base64,${reference.buffer.toString('base64')}`
        : undefined;
      let buffer: Buffer;
      let mime: string;
      let extension: string;
      if (mediaType === 'video') {
        const generated = await this.generateVideo(
          task,
          target,
          generationMode,
          referenceImageDataUrl,
          task.snapshot.referenceMedia ?? undefined,
          signal,
          (nextPhase) => {
            phase = nextPhase;
          },
        );
        phase = 'downloadingVideo';
        buffer = await downloadGeneratedVideo(generated, signal);
        mime = videoMime(buffer);
        extension = 'mp4';
      } else {
        phase = 'requestingProvider';
        const response = await fetch(target.url, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            Authorization: `Bearer ${target.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            imageGenerationRequest(
              target.model,
              task.snapshot.finalPrompt,
              target.protocol,
              referenceImageDataUrl,
            ),
          ),
        });
        await this.assertProviderResponse(response);
        phase = 'parsingResponse';
        const generated = await imageGenerationResult(
          await readMediaJson(response),
          target,
          signal,
          async (providerTaskId) => {
            phase = 'pollingProvider';
            await this.tasks.update(
              { id: task.id, status: 'running', workerId: this.workerId },
              { providerTaskId },
            );
          },
        );
        phase = 'downloadingImage';
        buffer =
          generated.data ??
          (await downloadGeneratedImage(generated.url, signal));
        mime = imageMime(buffer);
        extension = {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
        }[mime]!;
      }
      await this.tasks.update(
        { id: task.id, status: 'running', workerId: this.workerId },
        { status: 'storing' },
      );
      await this.materials.update(
        { id: task.materialId, userId: task.userId },
        { generationStatus: 'storing' },
      );
      phase = mediaType === 'video' ? 'storingVideo' : 'storingImage';
      const file = await this.managedFiles.stageAndStore(
        {
          originalname: `ai-material.${extension}`,
          mimetype: mime,
          size: buffer.length,
          buffer,
        },
        {
          ownerId: task.userId,
          materialId: task.materialId,
          revision: task.snapshot.revision,
        },
      );
      resultFileId = file.id;
      phase = 'attachingResult';
      const attached = await this.tasks.manager.transaction(async (manager) => {
        const tasks = manager.getRepository(MaterialGenerationTask);
        const materials = manager.getRepository(AiMaterial);
        const currentTask = await tasks.findOne({
          where: {
            id: task.id,
            status: 'storing',
            workerId: this.workerId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        const material = await materials.findOne({
          where: { id: task.materialId, userId: task.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !currentTask ||
          !material ||
          material.version !== task.materialVersion ||
          !currentTask.leaseExpiresAt ||
          currentTask.leaseExpiresAt <= new Date()
        )
          return false;
        await this.managedFiles.replaceMaterialReference(manager, {
          ownerId: task.userId,
          materialId: task.materialId,
          newFileId: file.id,
          oldFileId: material.currentFileId,
        });
        material.currentFileId = file.id;
        material.currentImageUrl = file.publicUrl;
        material.currentMediaType = mediaType;
        material.generationRevision = task.snapshot.revision;
        material.generationStatus = 'succeeded';
        material.generationError = null;
        await materials.save(material);
        currentTask.status = 'succeeded';
        currentTask.resultFileId = file.id;
        currentTask.finishedAt = new Date();
        currentTask.activeMaterialId = null;
        currentTask.activeUserId = null;
        currentTask.leaseExpiresAt = null;
        currentTask.errorMessage = null;
        await tasks.save(currentTask);
        return true;
      });
      if (!attached) throw new Error('version_conflict');
    } catch (error) {
      const failure = describeMaterialGenerationFailure(error, {
        phase,
        mediaType:
          task.snapshot.mediaType ??
          materialMediaType(task.snapshot.generationMode ?? 'textToImage'),
        serviceStopped: this.stopped,
        manuallyAborted: this.activeAbort.signal.aborted,
      });
      const status: MaterialTaskStatus = failure.status;
      const message = failure.message;
      await this.tasks.update(
        {
          id: task.id,
          status: In(['running', 'storing']),
          workerId: this.workerId,
        },
        {
          status,
          resultFileId,
          finishedAt: new Date(),
          activeMaterialId: null,
          activeUserId: null,
          leaseExpiresAt: null,
          errorMessage: message,
        },
      );
      await this.materials.update(
        {
          id: task.materialId,
          userId: task.userId,
          generationStatus: In(['pending', 'running', 'storing']),
        },
        { generationStatus: status, generationError: message },
      );
    } finally {
      this.activeAbort = undefined;
    }
  }

  private async generateVideo(
    task: MaterialGenerationTask,
    target: {
      url: string;
      taskUrlTemplate: string | null;
      secretKey: string;
      model: string;
      protocol: MediaProtocol;
    },
    generationMode: AiMaterialGenerationMode,
    referenceImageDataUrl: string | undefined,
    referenceMedia: AiMaterialReferenceMedia[] | undefined,
    signal: AbortSignal,
    setPhase: (phase: MaterialGenerationPhase) => void,
  ) {
    if (
      ![
        'dashscope',
        'tokenhubHunyuanVideo',
        'tokenhubViduVideo',
        ...EXTENDED_VIDEO_PROTOCOLS,
      ].includes(target.protocol) ||
      !target.taskUrlTemplate
    )
      throw new BadRequestException('视频生成配置缺少有效的异步协议或查询路径');
    setPhase('requestingProvider');
    const response = await fetch(target.url, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        Authorization: `Bearer ${target.secretKey}`,
        'Content-Type': 'application/json',
        ...(target.protocol === 'dashscope'
          ? { 'X-DashScope-Async': 'enable' }
          : {}),
      },
      body: JSON.stringify(
        videoGenerationRequest(
          {
            model: target.model,
            prompt: task.snapshot.finalPrompt,
            generationMode,
            referenceImageDataUrl,
            referenceMedia,
            resolution: task.snapshot.videoResolution ?? '720P',
            ratio: task.snapshot.videoRatio ?? 'adaptive',
            duration: task.snapshot.videoDuration ?? 5,
          },
          target.protocol,
        ),
      ),
    });
    await this.assertProviderResponse(response);
    setPhase('parsingResponse');
    const providerTaskId = videoTaskId(
      await readMediaJson(response),
      target.protocol,
    );
    await this.tasks.update(
      { id: task.id, status: 'running', workerId: this.workerId },
      { providerTaskId },
    );
    const taskUrl = target.taskUrlTemplate.replace(
      '{taskId}',
      encodeURIComponent(providerTaskId),
    );
    setPhase('pollingProvider');
    for (;;) {
      await this.waitForPoll(
        signal,
        target.protocol === 'tokenhubViduVideo' ? 5000 : 3000,
      );
      const statusResponse = await fetch(taskUrl, {
        method: 'GET',
        redirect: 'error',
        signal,
        headers: { Authorization: `Bearer ${target.secretKey}` },
      });
      await this.assertProviderResponse(statusResponse);
      const result = videoTaskResult(
        await readMediaJson(statusResponse),
        target.protocol,
      );
      if (result.status === 'pending') continue;
      if (result.status === 'succeeded') return result.videoUrl!;
      throw new BadRequestException(
        `视频生成失败${result.errorMessage ? `：${result.errorMessage}` : ''}`,
      );
    }
  }

  private async assertProviderResponse(response: Response) {
    if (response.ok) return;
    const statusCode = response.status;
    let providerResponse: unknown;
    try {
      providerResponse = await readMediaJson(response, 64 * 1024);
    } catch {
      await response.body?.cancel().catch(() => undefined);
    }
    throw new MaterialProviderHttpError(statusCode, providerResponse);
  }

  private waitForPoll(signal: AbortSignal, milliseconds = 3000) {
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      const onAbort = () => {
        clearTimeout(timer);
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('The operation was aborted', 'AbortError'),
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async expireLeases() {
    const expired = await this.tasks.find({
      select: {
        id: true,
        userId: true,
        materialId: true,
        materialVersion: true,
        snapshot: true,
      },
      where: [
        { status: 'running', leaseExpiresAt: LessThan(new Date()) },
        { status: 'storing', leaseExpiresAt: LessThan(new Date()) },
      ],
    });
    for (const task of expired) {
      const mediaType = task.snapshot?.mediaType ?? 'image';
      const result = await this.tasks.update(
        { id: task.id, status: In(['running', 'storing']) },
        {
          status: 'interrupted',
          finishedAt: new Date(),
          activeMaterialId: null,
          activeUserId: null,
          leaseExpiresAt: null,
          errorMessage: materialLeaseExpiredMessage(mediaType),
        },
      );
      if (result.affected === 1)
        await this.materials.update(
          {
            id: task.materialId,
            userId: task.userId,
            generationStatus: In(['pending', 'running', 'storing']),
          },
          {
            generationStatus: 'interrupted',
            generationError: materialLeaseExpiredMessage(mediaType),
          },
        );
    }
  }

  private async assertConfig(
    id: number,
    generationMode: AiMaterialGenerationMode = 'textToImage',
  ) {
    const mediaType = materialMediaType(generationMode);
    const config =
      mediaType === 'video'
        ? await this.configs.findUsableVideoGenerationConfig(id, generationMode)
        : await this.configs.findUsableImageGenerationConfig(
            id,
            generationMode,
          );
    const target = await this.providers.resolveMediaTarget(
      config.providerId!,
      config.model!,
      mediaType === 'video' ? 'videoGeneration' : 'imageGeneration',
      generationMode,
    );
    if (
      (materialNeedsReferenceImage(generationMode) ||
        materialNeedsReferenceMedia(generationMode)) &&
      ![
        'dashscope',
        'tokenhubHunyuanImage',
        'tokenhubHunyuanImageChat',
        'tokenhubSeedreamImage',
        'tokenhubViduImage',
        'tokenhubHunyuanVideo',
        'tokenhubViduVideo',
        ...EXTENDED_IMAGE_PROTOCOLS,
        ...EXTENDED_VIDEO_PROTOCOLS,
      ].includes(target.protocol)
    )
      throw new BadRequestException('所选模型协议不支持当前参考素材生成场景');
    return config;
  }

  private referenceImage(
    generationMode: AiMaterialGenerationMode,
    file?: UploadedStorageFile,
    optional = false,
  ) {
    if (!materialNeedsReferenceImage(generationMode)) {
      if (file) throw new BadRequestException('当前生成模式不接收单张参考图片');
      return undefined;
    }
    if (!file) {
      if (optional) return undefined;
      throw new BadRequestException('图生图/图生视频必须上传参考图片');
    }
    if (!file.buffer?.length) throw new BadRequestException('参考图片内容为空');
    const limit =
      materialMediaType(generationMode) === 'video'
        ? AI_MATERIAL_VIDEO_REFERENCE_LIMIT_BYTES
        : AI_MATERIAL_IMAGE_REFERENCE_LIMIT_BYTES;
    if (file.size > limit || file.buffer.length > limit)
      throw new BadRequestException(
        `参考图片不能超过 ${limit / 1024 / 1024}MB`,
      );
    const mimeType = imageMime(file.buffer, limit);
    return { ...file, mimetype: mimeType };
  }

  private referenceMedia(
    generationMode: AiMaterialGenerationMode,
    value?: AiMaterialReferenceMedia[] | null,
  ) {
    if (!materialNeedsReferenceMedia(generationMode)) {
      if (value?.length)
        throw new BadRequestException('当前生成模式不接收多参考素材');
      return null;
    }
    const media = (value ?? []).map((item) => ({
      type: item.type,
      url: item.url.trim(),
    }));
    if (!media.length)
      throw new BadRequestException('多参考生视频至少需要一个参考素材');
    const imageCount = media.filter(
      (item) => item.type === 'reference_image',
    ).length;
    const videoCount = media.filter(
      (item) => item.type === 'reference_video',
    ).length;
    if (imageCount > 10) throw new BadRequestException('参考图片最多 10 个');
    if (videoCount > 5) throw new BadRequestException('参考视频最多 5 个');
    for (const item of media) {
      let url: URL;
      try {
        url = new URL(item.url);
      } catch {
        throw new BadRequestException('参考素材地址格式无效');
      }
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new BadRequestException(
          '参考素材必须使用无账号信息的公开 HTTPS 地址',
        );
    }
    return media;
  }

  private async material(id: number, userId: number) {
    const material = await this.materials.findOne({ where: { id, userId } });
    if (!material) throw new NotFoundException('素材不存在');
    return material;
  }

  private async assertNotActive(id: number, userId: number) {
    await this.material(id, userId);
    if (
      await this.tasks.exists({
        where: { userId, materialId: id, status: In(ACTIVE_STATUSES) },
      })
    )
      throw new ConflictException('素材正在生成，请完成后再删除');
  }

  private taskSummary(task: MaterialGenerationTask) {
    return {
      id: task.id,
      materialId: task.materialId,
      materialVersion: task.materialVersion,
      status: task.status,
      resultFileId: task.resultFileId,
      providerTaskId: task.providerTaskId,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    };
  }

  private isDuplicateEntry(error: unknown) {
    return (error as { code?: string }).code === 'ER_DUP_ENTRY';
  }
}
