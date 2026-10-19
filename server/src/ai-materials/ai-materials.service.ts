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
import { In, IsNull, LessThan, Like, Repository } from 'typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import {
  generationResult,
  imageGenerationRequest,
} from '../common/ai/image-generation';
import {
  downloadGeneratedImage,
  imageMime,
  readMediaJson,
} from '../common/ai/image-utils';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { ManagedFilesService } from '../managed-files/managed-files.service';
import type { UploadedStorageFile } from '../uploads/uploads.service';
import {
  AI_MATERIAL_STYLE_VERSION,
  buildMaterialPrompt,
  type AiMaterialGenerationMode,
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

const ACTIVE_STATUSES: MaterialTaskStatus[] = ['pending', 'running', 'storing'];
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024;

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
        const { prompt, customStyle, ...summary } = row;
        const config = configMap.get(row.aiConfigId);
        return {
          ...summary,
          promptPreview: prompt.slice(0, 160),
          aiConfigName: config?.name ?? `配置 #${row.aiConfigId}`,
          aiModel: config?.model ?? '',
          hasCustomStyle: !!customStyle,
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
      aiConfigName: config?.name ?? `配置 #${material.aiConfigId}`,
      aiModel: config?.model ?? '',
      latestTask,
    };
  }

  async create(
    dto: CreateAiMaterialDto,
    userId: number,
    referenceImage?: UploadedStorageFile,
  ) {
    const generationMode = dto.generationMode ?? 'textToImage';
    await this.assertConfig(dto.aiConfigId, generationMode);
    const source = this.referenceImage(generationMode, referenceImage);
    return this.materials.manager.transaction(async (manager) => {
      const materials = manager.getRepository(AiMaterial);
      const material = await materials.save(
        materials.create({
          userId,
          prompt: dto.prompt.trim(),
          styleKey: dto.styleKey,
          customStyle:
            dto.styleKey === 'custom' ? dto.customStyle?.trim() || null : null,
          aiConfigId: dto.aiConfigId,
          generationMode,
          referenceFileId: null,
          referenceImageUrl: null,
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
    });
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
    await this.assertConfig(nextConfigId, generationMode);
    const source = this.referenceImage(generationMode, referenceImage, true);
    if (
      generationMode === 'imageToImage' &&
      !source &&
      !material.referenceFileId
    )
      throw new BadRequestException('图生图必须上传参考图片');
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
    return this.materials.manager.transaction(async (manager) => {
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
      current.version += 1;
      if (generationMode === 'textToImage') {
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
        throw new BadRequestException('图生图必须上传参考图片');
      }
      if (
        !ACTIVE_STATUSES.includes(
          current.generationStatus as MaterialTaskStatus,
        )
      ) {
        current.generationStatus = 'idle';
        current.generationError = null;
      }
      return materials.save(current);
    });
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
    return this.configs.imageGenerationOptions(query);
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
    if (material.generationMode === 'imageToImage' && !material.referenceFileId)
      throw new BadRequestException('图生图素材缺少参考图片，请先编辑素材');
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
      referenceFileId: material.referenceFileId,
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
            activeUserId: userId,
            snapshot,
            resultFileId: null,
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
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException('已有素材正在生成，请等待完成后再提交');
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
      const task = await this.tasks.findOne({
        where: { status: 'pending' },
        order: { id: 'ASC' },
      });
      if (!task || this.stopped) return;
      const claim = await this.tasks.update(
        { id: task.id, status: 'pending', deletedAt: IsNull() },
        {
          status: 'running',
          workerId: this.workerId,
          startedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + 150000),
        },
      );
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
    try {
      const signal = AbortSignal.any([
        this.activeAbort.signal,
        AbortSignal.timeout(120000),
      ]);
      const target = await this.providers.resolveMediaTarget(
        task.snapshot.config.providerId,
        task.snapshot.config.model,
        'imageGeneration',
      );
      const generationMode = task.snapshot.generationMode ?? 'textToImage';
      const reference =
        generationMode === 'imageToImage'
          ? await this.managedFiles.readMaterialImage(
              task.snapshot.referenceFileId ?? 0,
              task.userId,
            )
          : null;
      const referenceImageDataUrl = reference
        ? `data:${reference.mimeType};base64,${reference.buffer.toString('base64')}`
        : undefined;
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
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('provider_failed');
      }
      const generated = generationResult(
        await readMediaJson(response),
        target.protocol,
      );
      const buffer =
        generated.data ?? (await downloadGeneratedImage(generated.url, signal));
      const mime = imageMime(buffer);
      const extension = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      }[mime]!;
      await this.tasks.update(
        { id: task.id, status: 'running', workerId: this.workerId },
        { status: 'storing' },
      );
      await this.materials.update(
        { id: task.materialId, userId: task.userId },
        { generationStatus: 'storing' },
      );
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
      const interrupted = this.stopped || this.activeAbort.signal.aborted;
      const message =
        error instanceof Error && error.message === 'version_conflict'
          ? '素材生成期间已被修改，新图未覆盖当前结果'
          : interrupted
            ? '生成已中断，供应商可能已计费；原素材未修改'
            : '生成失败，供应商可能已计费；原素材未修改，请检查配置后重试';
      const status: MaterialTaskStatus = interrupted ? 'interrupted' : 'failed';
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

  private async expireLeases() {
    const expired = await this.tasks.find({
      select: {
        id: true,
        userId: true,
        materialId: true,
        materialVersion: true,
      },
      where: [
        { status: 'running', leaseExpiresAt: LessThan(new Date()) },
        { status: 'storing', leaseExpiresAt: LessThan(new Date()) },
      ],
    });
    for (const task of expired) {
      const result = await this.tasks.update(
        { id: task.id, status: In(['running', 'storing']) },
        {
          status: 'interrupted',
          finishedAt: new Date(),
          activeMaterialId: null,
          activeUserId: null,
          leaseExpiresAt: null,
          errorMessage: '执行中断或超时，供应商可能已计费；不会自动重试',
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
            generationError: '执行中断或超时，原素材未修改',
          },
        );
    }
  }

  private async assertConfig(
    id: number,
    generationMode: AiMaterialGenerationMode = 'textToImage',
  ) {
    const config = await this.configs.findUsableImageGenerationConfig(
      id,
      generationMode,
    );
    const target = await this.providers.resolveMediaTarget(
      config.providerId!,
      config.model!,
      'imageGeneration',
    );
    if (generationMode === 'imageToImage' && target.protocol !== 'dashscope')
      throw new BadRequestException(
        '图生图当前仅支持 DashScope 多模态生图协议',
      );
    return config;
  }

  private referenceImage(
    generationMode: AiMaterialGenerationMode,
    file?: UploadedStorageFile,
    optional = false,
  ) {
    if (generationMode === 'textToImage') {
      if (file) throw new BadRequestException('文生图不接收参考图片');
      return undefined;
    }
    if (!file) {
      if (optional) return undefined;
      throw new BadRequestException('图生图必须上传参考图片');
    }
    if (!file.buffer?.length) throw new BadRequestException('参考图片内容为空');
    if (
      file.size > MAX_REFERENCE_IMAGE_SIZE ||
      file.buffer.length > MAX_REFERENCE_IMAGE_SIZE
    )
      throw new BadRequestException('参考图片不能超过 5MB');
    const mimeType = imageMime(file.buffer, MAX_REFERENCE_IMAGE_SIZE);
    return { ...file, mimetype: mimeType };
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
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    };
  }
}
