import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, Repository, type FindOptionsWhere } from 'typeorm';
import { createHash } from 'crypto';
import { extname } from 'node:path';
import {
  BatchDeleteKnowledgeBaseDto,
  CreateKnowledgeBaseCategoryDto,
  CreateKnowledgeBaseChunkDto,
  CreateKnowledgeBaseDocumentDto,
  CreateKnowledgeBaseMineruTaskDto,
  CreateKnowledgeBaseDto,
  ParseKnowledgeBaseDto,
  ParseKnowledgeBaseDocumentDto,
  ParseKnowledgeBaseDocumentRequestDto,
  QueryKnowledgeBaseCategoryDto,
  QueryKnowledgeBaseChunkDto,
  QueryKnowledgeBaseDocumentDto,
  QueryKnowledgeBaseDto,
  ReplaceKnowledgeBaseDocumentChunksDto,
  UpdateKnowledgeBaseCategoryDto,
  UpdateKnowledgeBaseChunkDto,
  UpdateKnowledgeBaseDocumentDto,
  UpdateKnowledgeBaseDto,
} from './dto/knowledge-base.dto';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { DocumentParsersService } from '../document-parsers/document-parsers.service';
import { DocumentOcrService } from '../document-ocr/document-ocr.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';
import { TaskQueueService } from '../task-queue/task-queue.service';
import { KnowledgeChunkConfigsService } from '../knowledge-chunk-configs/knowledge-chunk-configs.service';
import type { KnowledgeChunkConfig } from '../knowledge-chunk-configs/entities/knowledge-chunk-config.entity';
import { KnowledgeEmbeddingService } from '../knowledge-vectors/knowledge-embedding.service';
import { KnowledgeVectorService } from '../knowledge-vectors/knowledge-vector.service';
import { LogRecordsService } from '../log-records/log-records.service';
import type { Metadata } from 'chromadb';
import { KnowledgeTaskFileLogger } from './knowledge-task-file-logger.service';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { StoredFilesService } from '../stored-files/stored-files.service';
import { DocumentParseRulesService } from '../document-parse-rules/document-parse-rules.service';

export interface KnowledgeBaseCategoryTreeNode extends KnowledgeBaseCategory {
  children: KnowledgeBaseCategoryTreeNode[];
}

const KNOWLEDGE_PARSE_MODE = {
  manual: 'manual',
  ai: 'ai',
  ocr: 'ocr',
  mineru: 'mineru',
} as const;

const KNOWLEDGE_CHUNK_VECTOR_STATUS = {
  pending: 'pending',
  processing: 'processing',
  success: 'success',
  failed: 'failed',
} as const;

type KnowledgeParseMode =
  (typeof KNOWLEDGE_PARSE_MODE)[keyof typeof KNOWLEDGE_PARSE_MODE];

@Injectable()
export class KnowledgeBasesService implements OnModuleInit {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly baseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseCategory)
    private readonly categoryRepository: Repository<KnowledgeBaseCategory>,
    @InjectRepository(KnowledgeBaseDocument)
    private readonly documentRepository: Repository<KnowledgeBaseDocument>,
    @InjectRepository(KnowledgeBaseChunk)
    private readonly chunkRepository: Repository<KnowledgeBaseChunk>,
    private readonly documentParsersService: DocumentParsersService,
    private readonly documentOcrService: DocumentOcrService,
    private readonly mineruConfigsService: MineruConfigsService,
    private readonly taskQueueService: TaskQueueService,
    private readonly chunkConfigsService: KnowledgeChunkConfigsService,
    private readonly embeddingService: KnowledgeEmbeddingService,
    private readonly vectorService: KnowledgeVectorService,
    private readonly logRecordsService: LogRecordsService,
    private readonly taskFileLogger: KnowledgeTaskFileLogger,
    private readonly aiFeatureConfigsService: AiFeatureConfigsService,
    private readonly providersService: KnowledgeAiProvidersService,
    private readonly storedFilesService: StoredFilesService,
    private readonly documentParseRulesService: DocumentParseRulesService,
  ) {}

  async onModuleInit() {
    await this.resumeProcessingMineruDocuments();
  }

  private async resolveOcrFeatureConfig(): Promise<AiFeatureConfig> {
    const config =
      await this.aiFeatureConfigsService.findEnabledByFeature('ocr');
    if (!config) {
      throw new BadRequestException('请先配置并启用 OCR 功能配置');
    }
    if (config.useMineru && !config.mineruConfigId) {
      throw new BadRequestException('OCR 功能配置缺少 MinerU 配置');
    }
    if (!config.useMineru && (!config.providerId || !config.model?.trim())) {
      throw new BadRequestException('OCR 功能配置缺少大模型账号或视觉模型');
    }
    return config;
  }

  private async resolveDocumentParseFeatureConfig(): Promise<AiFeatureConfig> {
    const config =
      await this.aiFeatureConfigsService.findEnabledByFeature('documentParse');
    if (!config) {
      throw new BadRequestException('请先配置并启用文档解析功能配置');
    }
    if (config.useMineru && !config.mineruConfigId) {
      throw new BadRequestException('文档解析功能配置缺少 MinerU 配置');
    }
    if (!config.useMineru && (!config.providerId || !config.model?.trim())) {
      throw new BadRequestException('文档解析功能配置缺少大模型账号或模型');
    }
    return config;
  }

  private async resolveEnabledMineruParseConfig(): Promise<AiFeatureConfig | null> {
    const [documentParseConfig, ocrConfig] = await Promise.all([
      this.aiFeatureConfigsService.findEnabledByFeature('documentParse'),
      this.aiFeatureConfigsService.findEnabledByFeature('ocr'),
    ]);
    const config = [documentParseConfig, ocrConfig].find(
      (item) => item?.useMineru,
    );
    if (!config) return null;
    if (!config.mineruConfigId) {
      throw new BadRequestException('AI 模型解析启用了 MinerU，但缺少 MinerU 配置');
    }
    return config;
  }

  private async resolveMineruOcrFeatureConfig(): Promise<AiFeatureConfig> {
    const config = await this.resolveOcrFeatureConfig();
    if (!config.useMineru) {
      throw new BadRequestException('当前 OCR 功能配置未启用 MinerU');
    }
    return config;
  }

  private async resumeProcessingMineruDocuments() {
    const documents = await this.documentRepository.find({
      where: {
        sourceType: In([
          KNOWLEDGE_PARSE_MODE.ai,
          KNOWLEDGE_PARSE_MODE.ocr,
          KNOWLEDGE_PARSE_MODE.mineru,
        ]),
        status: 'processing',
        description: Like('%任务ID：%'),
      },
      order: { id: 'ASC' },
    });

    for (const document of documents) {
      const taskId = this.extractMineruTaskId(document.description);
      if (!taskId) continue;
      await this.taskFileLogger.write('mineru.resume.submit', {
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        taskId,
        sourceName: document.sourceName,
      });
      this.taskQueueService.add(
        'knowledge-base-document.resume-mineru',
        {
          documentId: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          taskId,
        },
        () => this.executeResumeMineruDocument(document.id, taskId),
      );
    }
  }

  private async executeResumeMineruDocument(
    documentId: number,
    taskId: string,
  ) {
    const document = await this.findDocument(documentId);
    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    await this.taskFileLogger.write('mineru.resume.start', {
      documentId,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId,
      sourceName: document.sourceName,
    });
    let result: Awaited<ReturnType<MineruConfigsService['waitForSuccess']>>;
    try {
      const ocrConfig = await this.resolveMineruOcrFeatureConfig();
      result = await this.mineruConfigsService.waitForSuccess(taskId, {
        configId: ocrConfig.mineruConfigId,
        onProgress: (status) =>
          base
            ? this.updateBaseMineruProgress(base, document, status)
            : this.updateDocumentMineruProgress(document, status),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'AI 模型解析恢复失败';
      document.status = 'failed';
      document.description = errorMessage;
      await this.documentRepository.save(document);
      if (base) {
        await this.updateBaseProcess(base, {
          processStage: 'failed',
          parseStatus: 'failed',
          lastProcessMessage: errorMessage,
        });
      }
      await this.taskFileLogger.write('mineru.resume.failed', {
        documentId,
        knowledgeBaseId: document.knowledgeBaseId,
        taskId,
        errorMessage,
      });
      throw error;
    }

    if (base?.parseStatus === 'processing') {
      const content = this.resolveMineruParsedContent(result);
      const savedDocument = await this.saveBaseDocument(
        base,
        content,
        KNOWLEDGE_PARSE_MODE.ai,
      );
      await this.updateBaseProcess(base, {
        processStage: 'parsed',
        parseStatus: 'success',
        chunkStatus: 'pending',
        indexStatus: 'pending',
        lastProcessMessage: 'AI 模型解析恢复完成，等待分片',
      });
      await this.recordKnowledgeProcessLog(base, {
        action: this.getParseLogAction(KNOWLEDGE_PARSE_MODE.ai),
        isSuccess: true,
        message: 'AI 模型解析恢复完成，等待分片',
        data: {
          documentId: savedDocument.id,
          parseMode: KNOWLEDGE_PARSE_MODE.ai,
        },
      });
      await this.taskFileLogger.write('mineru.resume.base.success', {
        documentId: savedDocument.id,
        knowledgeBaseId: base.id,
        taskId,
        contentLength: result.markdown.length,
      });
      return {
        documentId: savedDocument.id,
        knowledgeBaseId: base.id,
        processStage: 'parsed',
      };
    }

    const saved = await this.applyThirdPartyMarkdown(
      document,
      result.markdown,
      document.sourceName,
      result.raw,
    );
    await this.recordKnowledgeDocumentProcessLog(saved.document, {
      action: this.getParseLogAction(KNOWLEDGE_PARSE_MODE.ai),
      isSuccess: true,
      message: 'AI 模型解析恢复完成',
      data: {
        documentId: saved.document.id,
        knowledgeBaseId: saved.document.knowledgeBaseId,
        chunkCount: saved.chunkCount,
        parseMode: KNOWLEDGE_PARSE_MODE.ai,
      },
    });
    await this.taskFileLogger.write('mineru.resume.document.success', {
      documentId: saved.document.id,
      knowledgeBaseId: saved.document.knowledgeBaseId,
      taskId,
      chunkCount: saved.chunkCount,
      contentLength: result.markdown.length,
    });
    return {
      documentId: saved.document.id,
      knowledgeBaseId: saved.document.knowledgeBaseId,
      chunkCount: saved.chunkCount,
    };
  }

  async findBases(query: QueryKnowledgeBaseDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.baseRepository
      .createQueryBuilder('base')
      .orderBy('base.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword?.trim()) {
      qb.where(
        'base.name LIKE :keyword OR base.description LIKE :keyword OR base.hitKeywords LIKE :keyword OR base.colloquialDescription LIKE :keyword',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    if (query.categoryId) {
      qb.andWhere('base.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findBase(id: number) {
    const base = await this.baseRepository.findOne({ where: { id } });
    if (!base) throw new NotFoundException('知识库不存在');
    if (base.contentText?.trim()) return base;

    const document = await this.documentRepository.findOne({
      where: { knowledgeBaseId: id, status: 'parsed' },
      order: { id: 'DESC' },
    });
    if (document?.content) {
      base.contentText = document.content;
    }
    return base;
  }

  async createBase(dto: CreateKnowledgeBaseDto) {
    await this.assertRequiredCategory(dto.categoryId);
    const contentType = dto.contentType ?? 'text';
    const textFileUrl =
      contentType === 'text' ? dto.fileUrl?.trim() || '' : '';
    const contentText = textFileUrl
      ? await this.readTextSource(textFileUrl, dto.fileName)
      : dto.contentText?.trim() || null;
    return this.baseRepository.save(
      this.baseRepository.create({
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        hitKeywords: dto.hitKeywords?.trim() || null,
        colloquialDescription: dto.colloquialDescription?.trim() || null,
        matchPriority: dto.matchPriority ?? 1,
        contentType,
        contentText: contentType === 'text' ? contentText : null,
        fileName:
          contentType === 'text'
            ? textFileUrl
              ? dto.fileName?.trim() ?? ''
              : ''
            : (dto.fileName?.trim() ?? ''),
        fileUrl:
          contentType === 'text' ? textFileUrl : (dto.fileUrl?.trim() ?? ''),
        processStage: this.resolveInitialProcessStage(
          contentType,
          contentText,
          textFileUrl || dto.fileUrl,
        ),
        parseStatus: 'pending',
        chunkStatus: 'pending',
        indexStatus: 'pending',
        lastProcessMessage: null,
        containsImages: false,
        allowFileUpload: contentType !== 'text' || Boolean(textFileUrl),
        isEnabled: dto.isEnabled ?? true,
      }),
    );
  }

  async updateBase(id: number, dto: UpdateKnowledgeBaseDto) {
    const base = await this.findBase(id);
    const nextContentType = dto.contentType ?? base.contentType;
    const textFileUrl =
      nextContentType === 'text' ? dto.fileUrl?.trim() || '' : '';
    const textFileContent = textFileUrl
      ? await this.readTextSource(textFileUrl, dto.fileName)
      : null;
    const contentChanged =
      dto.contentType !== undefined ||
      dto.contentText !== undefined ||
      dto.fileName !== undefined ||
      dto.fileUrl !== undefined;
    const retrievalMetadataChanged =
      dto.name !== undefined ||
      dto.hitKeywords !== undefined ||
      dto.colloquialDescription !== undefined ||
      dto.matchPriority !== undefined;
    if (dto.categoryId !== undefined) {
      await this.assertRequiredCategory(dto.categoryId);
      base.categoryId = dto.categoryId;
    }
    if (dto.name !== undefined) base.name = dto.name.trim();
    if (dto.description !== undefined) {
      base.description = dto.description.trim() || null;
    }
    if (dto.hitKeywords !== undefined) {
      base.hitKeywords = dto.hitKeywords.trim() || null;
    }
    if (dto.colloquialDescription !== undefined) {
      base.colloquialDescription = dto.colloquialDescription.trim() || null;
    }
    if (dto.matchPriority !== undefined) {
      base.matchPriority = dto.matchPriority;
    }
    if (dto.contentType !== undefined) base.contentType = dto.contentType;
    if (dto.contentText !== undefined) {
      base.contentText = dto.contentText.trim() || null;
    }
    if (dto.fileName !== undefined) base.fileName = dto.fileName.trim();
    if (dto.fileUrl !== undefined) base.fileUrl = dto.fileUrl.trim();
    if (nextContentType === 'text') {
      if (textFileUrl) {
        base.contentText = textFileContent;
        base.fileName = dto.fileName?.trim() ?? '';
        base.fileUrl = textFileUrl;
        base.allowFileUpload = true;
      } else if (
        dto.contentType !== undefined ||
        dto.contentText !== undefined ||
        dto.fileName !== undefined ||
        dto.fileUrl !== undefined
      ) {
        base.fileName = '';
        base.fileUrl = '';
        base.allowFileUpload = false;
      }
    } else if (dto.contentType !== undefined) {
      base.contentText = null;
      base.allowFileUpload = true;
    }
    if (dto.containsImages !== undefined) {
      base.containsImages = dto.containsImages;
    }
    if (dto.allowFileUpload !== undefined) {
      base.allowFileUpload = dto.allowFileUpload;
    }
    if (contentChanged) {
      base.processStage = this.resolveInitialProcessStage(
        base.contentType,
        base.contentText,
        base.fileUrl,
      );
      base.parseStatus = 'pending';
      base.chunkStatus = 'pending';
      base.indexStatus = 'pending';
      base.lastProcessMessage = null;
    }
    if (dto.isEnabled !== undefined) base.isEnabled = dto.isEnabled;
    const saved = await this.baseRepository.save(base);
    if (!contentChanged && retrievalMetadataChanged) {
      await this.markBaseIndexPendingByBaseId(saved.id);
      saved.indexStatus = 'pending';
      saved.lastProcessMessage = '检索辅助信息已变更，等待重新索引';
    }
    return saved;
  }

  async removeBase(id: number) {
    await this.findBase(id);
    await this.deleteVectorsByCondition({ knowledgeBaseId: id });
    await this.chunkRepository.softDelete({ knowledgeBaseId: id });
    await this.documentRepository.softDelete({ knowledgeBaseId: id });
    await this.baseRepository.softDelete(id);
    return { id };
  }

  async batchRemoveBases(dto: BatchDeleteKnowledgeBaseDto) {
    const ids = Array.from(new Set(dto.ids));
    if (!ids.length) return { ids: [] };
    const count = await this.baseRepository.count({ where: { id: In(ids) } });
    if (count !== ids.length) throw new NotFoundException('部分知识库不存在');
    await this.deleteVectorsByCondition({ knowledgeBaseId: In(ids) });
    await this.chunkRepository.softDelete({ knowledgeBaseId: In(ids) });
    await this.documentRepository.softDelete({ knowledgeBaseId: In(ids) });
    await this.baseRepository.softDelete(ids);
    return { ids };
  }

  async parseBase(id: number, dto: ParseKnowledgeBaseDto = {}) {
    const base = await this.findBase(id);
    const parseMode = this.resolveParseMode(dto.parseMode);
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      chunkStatus: 'pending',
      indexStatus: 'pending',
      lastProcessMessage: `${this.getParseModeLabel(parseMode)}任务已提交，等待执行`,
    });
    const task = this.taskQueueService.add(
      'knowledge-base.parse',
      { knowledgeBaseId: id, parseMode },
      () => this.executeParseBase(id, dto),
    );
    await this.taskFileLogger.write('base.parse.submit', {
      knowledgeBaseId: id,
      knowledgeBaseName: base.name,
      parseMode,
      queueTaskId: task.taskId,
      contentType: base.contentType,
      fileName: base.fileName,
      fileUrl: base.fileUrl,
    });
    return task;
  }

  private async executeParseBase(id: number, dto: ParseKnowledgeBaseDto = {}) {
    const base = await this.findBase(id);
    const parseMode = this.resolveParseMode(dto.parseMode);
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      chunkStatus: 'pending',
      indexStatus: 'pending',
      lastProcessMessage: `正在${this.getParseModeLabel(parseMode)}内容`,
    });
    await this.taskFileLogger.write('base.parse.start', {
      knowledgeBaseId: id,
      knowledgeBaseName: base.name,
      parseMode,
      contentType: base.contentType,
      fileName: base.fileName,
      fileUrl: base.fileUrl,
    });
    try {
      const content = await this.parseBaseContentByMode(base, parseMode);
      const document = await this.saveBaseDocument(base, content, parseMode);
      await this.resetDocumentChunks(document.id);
      await this.updateBaseProcess(base, {
        processStage: 'parsed',
        parseStatus: 'success',
        chunkStatus: 'pending',
        indexStatus: 'pending',
        lastProcessMessage: `${this.getParseModeLabel(parseMode)}完成，等待分片`,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: this.getParseLogAction(parseMode),
        isSuccess: true,
        message: `${this.getParseModeLabel(parseMode)}完成，等待分片`,
        data: { documentId: document.id, parseMode },
      });
      await this.taskFileLogger.write('base.parse.success', {
        knowledgeBaseId: id,
        knowledgeBaseName: base.name,
        documentId: document.id,
        parseMode,
        contentLength: content.length,
      });
      return { id, documentId: document.id, processStage: 'parsed', parseMode };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '解析失败';
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        parseStatus: 'failed',
        lastProcessMessage: errorMessage,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: this.getParseLogAction(parseMode),
        isSuccess: false,
        message: errorMessage,
        errorMessage,
        data: { parseMode },
      });
      await this.taskFileLogger.write('base.parse.failed', {
        knowledgeBaseId: id,
        knowledgeBaseName: base.name,
        parseMode,
        errorMessage,
      });
      throw error;
    }
  }

  async chunkBase(id: number) {
    const base = await this.findBase(id);
    if (base.parseStatus !== 'success') {
      throw new BadRequestException('请先完成解析');
    }
    await this.updateBaseProcess(base, {
      processStage: 'chunking',
      chunkStatus: 'processing',
      indexStatus: 'pending',
      lastProcessMessage: '分片任务已提交，等待执行',
    });
    return this.taskQueueService.add(
      'knowledge-base.chunk',
      { knowledgeBaseId: id },
      () => this.executeChunkBase(id),
    );
  }

  private async executeChunkBase(id: number) {
    const base = await this.findBase(id);
    if (base.parseStatus !== 'success') {
      throw new BadRequestException('请先完成解析');
    }
    await this.updateBaseProcess(base, {
      processStage: 'chunking',
      chunkStatus: 'processing',
      indexStatus: 'pending',
      lastProcessMessage: '正在生成分片',
    });
    try {
      const chunkConfig = await this.chunkConfigsService.findDefaultConfig();
      const document = await this.findBaseDocument(base.id);
      if (!document?.content) {
        throw new BadRequestException('当前知识库文档缺少正文内容');
      }
      await this.deleteVectorsByCondition({ documentId: document.id });
      await this.chunkRepository.softDelete({ documentId: document.id });
      const chunkCount = await this.saveDocumentChunks(document, chunkConfig);
      await this.updateBaseProcess(base, {
        processStage: 'chunked',
        chunkStatus: 'success',
        indexStatus: 'pending',
        lastProcessMessage: `分片完成，共 ${chunkCount} 个分片`,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: 'chunk',
        isSuccess: true,
        message: `分片完成，共 ${chunkCount} 个分片`,
        data: { documentId: document.id, chunkCount },
      });
      return {
        id,
        documentId: document.id,
        chunkCount,
        processStage: 'chunked',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分片失败';
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        chunkStatus: 'failed',
        lastProcessMessage: errorMessage,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: 'chunk',
        isSuccess: false,
        message: errorMessage,
        errorMessage,
      });
      throw error;
    }
  }

  async indexBase(id: number) {
    const base = await this.findBase(id);
    if (base.chunkStatus !== 'success') {
      throw new BadRequestException('请先完成分片');
    }
    await this.updateBaseProcess(base, {
      processStage: 'indexing',
      indexStatus: 'processing',
      lastProcessMessage: '索引任务已提交，等待执行',
    });
    return this.taskQueueService.add(
      'knowledge-base.index',
      { knowledgeBaseId: id },
      () => this.executeIndexBase(id),
    );
  }

  private async executeIndexBase(id: number) {
    const base = await this.findBase(id);
    if (base.chunkStatus !== 'success') {
      throw new BadRequestException('请先完成分片');
    }
    await this.updateBaseProcess(base, {
      processStage: 'indexing',
      indexStatus: 'processing',
      lastProcessMessage: '正在写入索引',
    });
    let processingChunkIds: number[] = [];
    try {
      const chunks = await this.chunkRepository.find({
        where: { knowledgeBaseId: id },
        order: { sort: 'ASC', chunkIndex: 'ASC', id: 'ASC' },
      });
      if (!chunks.length) {
        throw new BadRequestException('当前知识库没有可索引的分片');
      }

      const documentIds = Array.from(
        new Set(chunks.map((chunk) => chunk.documentId)),
      );
      const documents = await this.documentRepository.find({
        where: { id: In(documentIds) },
      });
      const documentMap = new Map(documents.map((item) => [item.id, item]));
      const indexItems = chunks
        .map((chunk) => {
          const document = documentMap.get(chunk.documentId);
          const vectorText = this.buildVectorDocumentText(
            base,
            document,
            chunk,
          );
          const contentHash = this.buildContentHash(vectorText);
          return {
            chunk,
            document,
            vectorId: this.buildChunkVectorId(chunk),
            vectorText,
            contentHash,
          };
        })
        .filter(
          (item) =>
            item.chunk.vectorStatus !== KNOWLEDGE_CHUNK_VECTOR_STATUS.success ||
            item.chunk.contentHash !== item.contentHash ||
            item.chunk.vectorId !== item.vectorId,
        );

      if (!indexItems.length) {
        await this.updateBaseProcess(base, {
          processStage: 'indexed',
          indexStatus: 'success',
          lastProcessMessage: `索引已是最新状态，共 ${chunks.length} 个分片无需重建`,
        });
        await this.recordKnowledgeProcessLog(base, {
          action: 'index',
          isSuccess: true,
          message: `索引已是最新状态，共 ${chunks.length} 个分片无需重建`,
          data: {
            chunkCount: chunks.length,
            indexedCount: 0,
            skippedCount: chunks.length,
          },
        });
        return {
          id,
          chunkCount: chunks.length,
          indexedCount: 0,
          skippedCount: chunks.length,
          processStage: 'indexed',
        };
      }

      processingChunkIds = indexItems.map((item) => item.chunk.id);
      await this.chunkRepository.update(
        { id: In(processingChunkIds) },
        {
          vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.processing,
          vectorError: null,
        },
      );

      const embeddings = await this.embeddingService.embedDocuments(
        indexItems.map((item) => item.vectorText),
      );
      await this.vectorService.upsertChunks(
        indexItems.map((item, index) => ({
          id: item.vectorId,
          embedding: embeddings[index],
          document: item.vectorText,
          metadata: this.buildVectorMetadata(base, item.document, item.chunk),
        })),
      );

      const now = new Date();
      await this.chunkRepository.save(
        indexItems.map((item) => {
          item.chunk.vectorId = item.vectorId;
          item.chunk.contentHash = item.contentHash;
          item.chunk.vectorStatus = KNOWLEDGE_CHUNK_VECTOR_STATUS.success;
          item.chunk.vectorError = null;
          item.chunk.vectorizedAt = now;
          item.chunk.tokenCount = item.chunk.content.length;
          return item.chunk;
        }),
      );
      await this.updateBaseProcess(base, {
        processStage: 'indexed',
        indexStatus: 'success',
        lastProcessMessage: `索引完成：写入 ${indexItems.length} 个分片，跳过 ${chunks.length - indexItems.length} 个未变化分片`,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: 'index',
        isSuccess: true,
        message: `索引完成：写入 ${indexItems.length} 个分片，跳过 ${chunks.length - indexItems.length} 个未变化分片`,
        data: {
          chunkCount: chunks.length,
          indexedCount: indexItems.length,
          skippedCount: chunks.length - indexItems.length,
        },
      });
      return {
        id,
        chunkCount: chunks.length,
        indexedCount: indexItems.length,
        skippedCount: chunks.length - indexItems.length,
        processStage: 'indexed',
      };
    } catch (error) {
      if (processingChunkIds.length) {
        await this.chunkRepository.update(
          { id: In(processingChunkIds) },
          {
            vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.failed,
            vectorError: error instanceof Error ? error.message : '索引失败',
          },
        );
      }
      const errorMessage = error instanceof Error ? error.message : '索引失败';
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        indexStatus: 'failed',
        lastProcessMessage: errorMessage,
      });
      await this.recordKnowledgeProcessLog(base, {
        action: 'index',
        isSuccess: false,
        message: errorMessage,
        errorMessage,
        data: { processingChunkIds },
      });
      throw error;
    }
  }

  async findCategories(query: QueryKnowledgeBaseCategoryDto) {
    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('category.id', 'ASC');
    if (query.parentId) {
      qb.andWhere('category.parentId = :parentId', {
        parentId: query.parentId,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(category.name LIKE :keyword OR category.code LIKE :keyword OR category.description LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    return qb.getMany();
  }

  async findCategoryTree(query: QueryKnowledgeBaseCategoryDto) {
    const categories = await this.findCategories({
      keyword: query.keyword,
    });
    return this.buildCategoryTree(categories);
  }

  async findCategory(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('知识库分类不存在');
    return category;
  }

  /**
   * 生成下一个分类编码（层级 + 序号）：
   * 顶级 = CAT_001 / CAT_002 …；非顶级 = 父分类编码_001 / _002 …
   */
  async nextCategoryCode(parentId?: number | null) {
    let prefix = 'CAT';
    if (parentId) {
      const parent = await this.findCategory(parentId);
      prefix = parent.code?.trim() || `CAT_${parent.id}`;
    }
    const siblings = await this.categoryRepository.find({
      where: parentId ? { parentId } : { parentId: IsNull() },
      select: ['code'],
    });
    return { code: this.nextSequentialCode(siblings, prefix) };
  }

  /** 取同前缀下最大序号 + 1，格式化为 3 位零填充，如 CAT_001 */
  private nextSequentialCode(
    existing: Array<{ code?: string | null }>,
    prefix: string,
  ): string {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}_(\\d+)$`);
    let max = 0;
    for (const item of existing) {
      const match = regex.exec(item.code ?? '');
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}_${String(max + 1).padStart(3, '0')}`;
  }

  async createCategory(dto: CreateKnowledgeBaseCategoryDto) {
    await this.assertParentCategory(dto.parentId);
    return this.categoryRepository.save(
      this.categoryRepository.create({
        parentId: dto.parentId ?? null,
        name: dto.name.trim(),
        code: dto.code?.trim() ?? '',
        description: dto.description?.trim() || null,
      }),
    );
  }

  async updateCategory(id: number, dto: UpdateKnowledgeBaseCategoryDto) {
    const category = await this.findCategory(id);
    await this.assertParentCategory(dto.parentId, id);
    if (dto.parentId !== undefined) category.parentId = dto.parentId ?? null;
    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.code !== undefined) category.code = dto.code.trim();
    if (dto.description !== undefined) {
      category.description = dto.description.trim() || null;
    }
    return this.categoryRepository.save(category);
  }

  async removeCategory(id: number) {
    await this.findCategory(id);
    const categories = await this.categoryRepository.find();
    const categoryIds = [id, ...this.collectDescendantIds(categories, id)];
    const usedCount = await this.baseRepository.count({
      where: { categoryId: In(categoryIds) },
    });
    const documentCount = await this.documentRepository.count({
      where: { categoryId: In(categoryIds) },
    });
    if (usedCount > 0 || documentCount > 0) {
      throw new BadRequestException('该分类下存在知识库或文档，不能删除');
    }
    await this.categoryRepository.softDelete(categoryIds);
    return { id, ids: categoryIds };
  }

  async findDocuments(query: QueryKnowledgeBaseDocumentDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.documentRepository
      .createQueryBuilder('document')
      .orderBy('document.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.knowledgeBaseId) {
      qb.andWhere('document.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId: query.knowledgeBaseId,
      });
    }
    if (query.categoryId) {
      qb.andWhere('document.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(document.title LIKE :keyword OR document.sourceName LIKE :keyword OR document.content LIKE :keyword OR document.hitKeywords LIKE :keyword OR document.colloquialDescription LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findDocument(id: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) throw new NotFoundException('知识库文档不存在');
    return document;
  }

  async createDocument(dto: CreateKnowledgeBaseDocumentDto) {
    const base = await this.findBase(dto.knowledgeBaseId);
    const categoryId = dto.categoryId ?? base.categoryId;
    await this.assertCategoryExists(categoryId);
    return this.documentRepository.save(
      this.documentRepository.create({
        knowledgeBaseId: dto.knowledgeBaseId,
        categoryId,
        title: dto.title.trim(),
        sourceType: dto.sourceType?.trim() || 'manual',
        sourceName: dto.sourceName?.trim() ?? '',
        content: dto.content?.trim() || null,
        status: dto.status?.trim() || 'draft',
        description: dto.description?.trim() || null,
        hitKeywords: dto.hitKeywords?.trim() || null,
        colloquialDescription: dto.colloquialDescription?.trim() || null,
        matchPriority: dto.matchPriority ?? 1,
      }),
    );
  }

  async createMineruTask(id: number, dto: CreateKnowledgeBaseMineruTaskDto) {
    const document = await this.findDocument(id);
    const ocrConfig = await this.resolveMineruOcrFeatureConfig();
    await this.assertSupportedDocumentFileForDocument(
      document,
      dto.fileUrl,
      dto.fileName,
    );
    await this.taskFileLogger.write('document.mineru.createTask.start', {
      documentId: id,
      knowledgeBaseId: document.knowledgeBaseId,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      mineruConfigId: ocrConfig.mineruConfigId,
      mineruConfigName: ocrConfig.mineruConfigName,
    });
    const task = await this.mineruConfigsService.createParseTask(
      dto.fileUrl.trim(),
      dto.fileName?.trim(),
      ocrConfig.mineruConfigId,
    );
    await this.taskFileLogger.write('document.mineru.createTask.success', {
      documentId: id,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId: task.taskId,
      configId: task.configId,
      configName: task.configName,
    });
    return task;
  }

  async queryMineruTask(id: number, taskId: string) {
    const document = await this.findDocument(id);
    const ocrConfig = await this.resolveMineruOcrFeatureConfig();
    const result = await this.mineruConfigsService.queryParseTaskByConfig(
      taskId,
      ocrConfig.mineruConfigId!,
    );
    await this.taskFileLogger.write('document.mineru.query', {
      documentId: id,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      mineruConfigId: ocrConfig.mineruConfigId,
      mineruConfigName: ocrConfig.mineruConfigName,
      status: result.status,
      progress: result.progress,
      message: result.message,
      markdownLength: result.markdown.length,
      rawSummary: this.buildMineruRawSummary(result.raw),
    });
    if (!this.mineruConfigsService.isSuccessStatus(result.status)) {
      return {
        ...result,
        isCompleted: false,
        documentId: id,
        chunkCount: 0,
      };
    }
    const saved = await this.applyThirdPartyMarkdown(
      document,
      result.markdown,
      undefined,
      result.raw,
    );
    return {
      ...result,
      isCompleted: true,
      documentId: id,
      chunkCount: saved.chunkCount,
    };
  }

  async parseDocumentWithMineru(
    id: number,
    dto: ParseKnowledgeBaseDocumentDto,
  ) {
    const document = await this.findDocument(id);
    const ocrConfig = await this.resolveMineruOcrFeatureConfig();
    await this.assertSupportedDocumentFileForDocument(
      document,
      dto.fileUrl,
      dto.fileName,
    );
    if (dto.waitForResult === false) {
      await this.taskFileLogger.write('document.mineru.createTask.start', {
        documentId: id,
        knowledgeBaseId: document.knowledgeBaseId,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        ocrFeatureConfigId: ocrConfig.id,
        ocrFeatureConfigName: ocrConfig.name,
        mineruConfigId: ocrConfig.mineruConfigId,
        mineruConfigName: ocrConfig.mineruConfigName,
      });
      const task = await this.mineruConfigsService.createParseTask(
        dto.fileUrl.trim(),
        dto.fileName?.trim(),
        ocrConfig.mineruConfigId,
      );
      await this.taskFileLogger.write('document.mineru.createTask.success', {
        documentId: id,
        knowledgeBaseId: document.knowledgeBaseId,
        taskId: task.taskId,
        configId: task.configId,
        configName: task.configName,
        waitForResult: false,
      });
      return {
        ...task,
        documentId: id,
        isCompleted: false,
        chunkCount: 0,
      };
    }
    return this.executeDocumentThirdPartyParse(document, dto);
  }

  async parseDocument(id: number, dto: ParseKnowledgeBaseDocumentRequestDto) {
    const parseMode = this.resolveParseMode(dto.parseMode);
    const document = await this.findDocument(id);
    if (
      parseMode === KNOWLEDGE_PARSE_MODE.ai &&
      !dto.fileUrl &&
      document.sourceType !== 'text'
    ) {
      document.status = 'failed';
      document.description = 'AI 模型解析需要提供文件 URL';
      await this.documentRepository.save(document);
      throw new BadRequestException('AI 模型解析需要提供文件 URL');
    }
    if (parseMode === KNOWLEDGE_PARSE_MODE.ai && dto.fileUrl) {
      await this.assertSupportedDocumentFileForDocument(
        document,
        dto.fileUrl,
        dto.fileName,
      );
    }
    document.status = 'processing';
    document.description = `${this.getParseModeLabel(parseMode)}任务已提交，等待执行`;
    await this.documentRepository.save(document);
    const task = this.taskQueueService.add(
      'knowledge-base-document.parse',
      { documentId: id, parseMode },
      () => this.executeParseDocument(id, dto),
    );
    await this.taskFileLogger.write('document.parse.submit', {
      documentId: id,
      knowledgeBaseId: document.knowledgeBaseId,
      parseMode,
      queueTaskId: task.taskId,
      fileName: dto.fileName || document.sourceName,
      fileUrl: dto.fileUrl,
    });
    return task;
  }

  private async executeParseDocument(
    id: number,
    dto: ParseKnowledgeBaseDocumentRequestDto,
  ) {
    const parseMode = this.resolveParseMode(dto.parseMode);
    const document = await this.findDocument(id);
    document.status = 'processing';
    document.description = `正在${this.getParseModeLabel(parseMode)}内容`;
    await this.documentRepository.save(document);
    await this.taskFileLogger.write('document.parse.start', {
      documentId: id,
      knowledgeBaseId: document.knowledgeBaseId,
      parseMode,
      sourceName: document.sourceName,
    });
    try {
      const result = await this.parseDocumentByMode(document, dto, parseMode);
      await this.recordKnowledgeDocumentProcessLog(document, {
        action: this.getParseLogAction(parseMode),
        isSuccess: true,
        message: `${this.getParseModeLabel(parseMode)}完成`,
        data: {
          documentId: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          parseMode,
        },
      });
      await this.taskFileLogger.write('document.parse.success', {
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        parseMode,
        chunkCount: result.chunkCount,
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '解析失败';
      document.status = 'failed';
      document.description = errorMessage;
      await this.documentRepository.save(document);
      await this.recordKnowledgeDocumentProcessLog(document, {
        action: this.getParseLogAction(parseMode),
        isSuccess: false,
        message: errorMessage,
        errorMessage,
        data: {
          documentId: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          parseMode,
        },
      });
      await this.taskFileLogger.write('document.parse.failed', {
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        parseMode,
        errorMessage,
      });
      throw error;
    }
  }

  private async parseDocumentByMode(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentRequestDto,
    parseMode: KnowledgeParseMode,
  ) {
    if (parseMode === KNOWLEDGE_PARSE_MODE.ai) {
      return this.executeDocumentAiModelParse(document, {
        fileUrl: dto.fileUrl!,
        fileName: dto.fileName,
        waitForResult: dto.waitForResult,
      });
    }

    const content = await this.documentParsersService.parse({
      contentType: this.resolveDocumentManualContentType(document),
      contentText: document.content,
      fileUrl: dto.fileUrl,
      fileName: document.sourceName,
    });
    document.content = this.normalizeParsedContent(content);
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.manual;
    const saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.resetDocumentChunks(saved.id);
    saved.description = '手动解析完成，等待分片';
    await this.documentRepository.save(saved);
    await this.taskFileLogger.write('document.manual.parse.saved', {
      documentId: saved.id,
      knowledgeBaseId: saved.knowledgeBaseId,
      contentLength: content.length,
    });
    return {
      document: saved,
      documentId: saved.id,
      isCompleted: true,
      chunkCount: 0,
      parseMode,
    };
  }

  private async executeDocumentAiModelParse(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
  ) {
    const mineruConfig = await this.resolveEnabledMineruParseConfig();
    if (mineruConfig && dto.fileUrl?.trim()) {
      return this.executeDocumentThirdPartyParse(document, dto, mineruConfig);
    }
    const fileName = dto.fileName?.trim() || document.sourceName;
    const contentType = this.resolveAiModelParseContentType(
      document.sourceType,
      fileName,
      document.content,
    );
    if (contentType === 'pdf' || contentType === 'image') {
      return this.executeDocumentVisionOcrParse(
        document,
        dto,
        await this.resolveOcrFeatureConfig(),
      );
    }
    return this.executeDocumentTextModelParse(
      document,
      dto,
      contentType,
      await this.resolveDocumentParseFeatureConfig(),
    );
  }

  private async executeDocumentTextModelParse(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
    contentType: 'text' | 'word',
    config: AiFeatureConfig,
  ) {
    const fileName = dto.fileName?.trim() || document.sourceName;
    const sourceContent = await this.resolveDocumentTextModelSourceContent(
      document,
      dto,
      contentType,
    );
    const result = await this.providersService.callChat({
      id: config.providerId!,
      model: config.model!,
      systemPrompt:
        config.systemPrompt ||
        '你是文档解析助手。请将输入内容整理为适合知识库保存的正文。',
      question: this.buildDocumentParseQuestion({
        content: sourceContent,
        fileName,
        contentType,
        rules: config.rules,
        responseFormat: config.responseFormat,
      }),
    });
    if (!result.isSuccess) {
      throw new BadRequestException(result.errorMessage || '文档解析模型调用失败');
    }
    const content = this.normalizeParsedContent(result.answer);
    if (!content) {
      throw new BadRequestException('文档解析模型结果缺少解析正文');
    }
    document.content = content;
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.ai;
    document.sourceName = fileName || document.sourceName;
    let saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.resetDocumentChunks(saved.id);
    saved.description = 'AI 模型解析完成，等待分片';
    saved = await this.documentRepository.save(saved);
    await this.taskFileLogger.write('document.ai-text-parse.success', {
      documentId: saved.id,
      knowledgeBaseId: saved.knowledgeBaseId,
      providerId: result.providerId,
      providerName: result.providerName,
      model: result.model,
      contentType,
      sourceContentLength: sourceContent.length,
      contentLength: content.length,
      elapsedMilliseconds: result.elapsedMilliseconds,
    });
    return {
      document: saved,
      documentId: saved.id,
      isCompleted: true,
      chunkCount: 0,
      parseMode: KNOWLEDGE_PARSE_MODE.ai,
    };
  }

  private async executeDocumentVisionOcrParse(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
    ocrConfig: AiFeatureConfig,
  ) {
    const fileUrl = dto.fileUrl?.trim();
    if (!fileUrl) {
      throw new BadRequestException('AI 模型解析需要提供文件 URL');
    }
    const fileName = dto.fileName?.trim() || document.sourceName;
    const contentType = this.resolveOcrContentType(document.sourceType, fileName);
    const file = await this.storedFilesService.read(fileUrl, fileName);
    const imageDataUrls = await this.documentOcrService.buildVisionOcrImageDataUrls(
      {
        contentType,
        fileUrl,
        fileName,
        file,
      },
    );
    const target = await this.providersService.resolveVisionTarget({
      id: ocrConfig.providerId!,
      model: ocrConfig.model!,
    });
    await this.taskFileLogger.write('document.vision-ocr.start', {
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      fileName,
      fileUrl,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      providerId: target.providerId,
      providerName: target.providerName,
      model: target.model,
      imageCount: imageDataUrls.length,
    });
    const result = await this.providersService.callVisionOcr({
      target,
      imageDataUrls,
      systemPrompt: ocrConfig.systemPrompt,
      rules: ocrConfig.rules,
      responseFormat: ocrConfig.responseFormat,
    });
    if (!result.isSuccess) {
      throw new BadRequestException(
        result.errorMessage || '视觉模型 OCR 调用失败',
      );
    }
    const content = this.normalizeParsedContent(result.answer);
    if (!content) {
      throw new BadRequestException('视觉模型 OCR 结果缺少解析正文');
    }
    document.content = content;
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.ai;
    document.sourceName = fileName;
    let saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.resetDocumentChunks(saved.id);
    saved.description = 'AI 模型解析完成，等待分片';
    saved = await this.documentRepository.save(saved);
    await this.taskFileLogger.write('document.vision-ocr.success', {
      documentId: saved.id,
      knowledgeBaseId: saved.knowledgeBaseId,
      providerId: result.providerId,
      providerName: result.providerName,
      model: result.model,
      imageCount: imageDataUrls.length,
      contentLength: content.length,
      elapsedMilliseconds: result.elapsedMilliseconds,
    });
    return {
      document: saved,
      documentId: saved.id,
      isCompleted: true,
      chunkCount: 0,
      parseMode: KNOWLEDGE_PARSE_MODE.ai,
    };
  }

  private async executeDocumentThirdPartyParse(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
    resolvedOcrConfig?: AiFeatureConfig,
  ) {
    const ocrConfig =
      resolvedOcrConfig ?? (await this.resolveMineruOcrFeatureConfig());
    await this.taskFileLogger.write('document.mineru.createTask.start', {
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      mineruConfigId: ocrConfig.mineruConfigId,
      mineruConfigName: ocrConfig.mineruConfigName,
    });
    const task = await this.mineruConfigsService.createParseTask(
      dto.fileUrl.trim(),
      dto.fileName?.trim(),
      ocrConfig.mineruConfigId,
    );
    await this.taskFileLogger.write('document.mineru.createTask.success', {
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId: task.taskId,
      configId: task.configId,
      configName: task.configName,
    });
    document.status = 'processing';
    document.description = `AI 模型解析任务已创建，任务ID：${task.taskId}`;
    await this.documentRepository.save(document);
    const result = await this.mineruConfigsService.waitForSuccess(task.taskId, {
      configId: task.configId,
      onProgress: (status) =>
        this.updateDocumentMineruProgress(document, status),
    });
    const content = await this.enhanceMineruWordContentWithSourceLinks({
      content: result.markdown,
      contentType: document.sourceType,
      fileUrl: dto.fileUrl,
      fileName: dto.fileName || this.resolveFileName(dto.fileUrl),
      knowledgeBaseId: document.knowledgeBaseId,
      documentId: document.id,
      taskId: task.taskId,
    });
    const saved = await this.applyThirdPartyMarkdown(
      document,
      content,
      dto.fileName || this.resolveFileName(dto.fileUrl),
      result.raw,
    );
    await this.taskFileLogger.write('document.mineru.parse.success', {
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId: task.taskId,
      chunkCount: saved.chunkCount,
      markdownLength: result.markdown.length,
    });
    return {
      ...result,
      documentId: document.id,
      isCompleted: true,
      chunkCount: saved.chunkCount,
      parseMode: KNOWLEDGE_PARSE_MODE.ai,
    };
  }

  async updateDocument(id: number, dto: UpdateKnowledgeBaseDocumentDto) {
    const document = await this.findDocument(id);
    const retrievalMetadataChanged =
      dto.title !== undefined ||
      dto.content !== undefined ||
      dto.sourceName !== undefined ||
      dto.hitKeywords !== undefined ||
      dto.colloquialDescription !== undefined ||
      dto.matchPriority !== undefined;
    const knowledgeBaseId = dto.knowledgeBaseId ?? document.knowledgeBaseId;
    const base = await this.findBase(knowledgeBaseId);
    const categoryId =
      dto.categoryId !== undefined
        ? dto.categoryId
        : dto.knowledgeBaseId !== undefined
          ? base.categoryId
          : document.categoryId;
    await this.assertCategoryExists(categoryId);
    if (dto.knowledgeBaseId !== undefined)
      document.knowledgeBaseId = dto.knowledgeBaseId;
    if (dto.knowledgeBaseId !== undefined || dto.categoryId !== undefined) {
      document.categoryId = categoryId ?? null;
    }
    if (dto.title !== undefined) document.title = dto.title.trim();
    if (dto.sourceType !== undefined)
      document.sourceType = dto.sourceType.trim() || 'manual';
    if (dto.sourceName !== undefined)
      document.sourceName = dto.sourceName.trim();
    if (dto.content !== undefined)
      document.content = dto.content.trim() || null;
    if (dto.status !== undefined)
      document.status = dto.status.trim() || 'draft';
    if (dto.description !== undefined) {
      document.description = dto.description.trim() || null;
    }
    if (dto.hitKeywords !== undefined) {
      document.hitKeywords = dto.hitKeywords.trim() || null;
    }
    if (dto.colloquialDescription !== undefined) {
      document.colloquialDescription = dto.colloquialDescription.trim() || null;
    }
    if (dto.matchPriority !== undefined) {
      document.matchPriority = dto.matchPriority;
    }
    const saved = await this.documentRepository.save(document);
    await this.chunkRepository.update(
      { documentId: saved.id },
      {
        knowledgeBaseId: saved.knowledgeBaseId,
        categoryId: saved.categoryId,
      },
    );
    if (retrievalMetadataChanged) {
      await this.markBaseIndexPendingByDocument(saved.id, true);
    }
    return saved;
  }

  async removeDocument(id: number) {
    await this.findDocument(id);
    await this.deleteVectorsByCondition({ documentId: id });
    await this.chunkRepository.softDelete({ documentId: id });
    await this.documentRepository.softDelete(id);
    return { id };
  }

  async findChunks(query: QueryKnowledgeBaseChunkDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.chunkRepository
      .createQueryBuilder('chunk')
      .orderBy('chunk.sort', 'ASC')
      .addOrderBy('chunk.chunkIndex', 'ASC')
      .addOrderBy('chunk.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.knowledgeBaseId) {
      qb.andWhere('chunk.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId: query.knowledgeBaseId,
      });
    }
    if (query.documentId) {
      qb.andWhere('chunk.documentId = :documentId', {
        documentId: query.documentId,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(chunk.title LIKE :keyword OR chunk.content LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findIndexes(query: QueryKnowledgeBaseChunkDto) {
    const { list, total } = await this.findChunks(query);
    if (!list.length) return { list: [], total };

    const baseIds = Array.from(
      new Set(list.map((chunk) => chunk.knowledgeBaseId)),
    );
    const documentIds = Array.from(
      new Set(list.map((chunk) => chunk.documentId)),
    );
    const [bases, documents] = await Promise.all([
      this.baseRepository.find({ where: { id: In(baseIds) } }),
      this.documentRepository.find({ where: { id: In(documentIds) } }),
    ]);
    const baseMap = new Map(bases.map((base) => [base.id, base]));
    const documentMap = new Map(
      documents.map((document) => [document.id, document]),
    );

    return {
      list: list.map((chunk) => {
        const base = baseMap.get(chunk.knowledgeBaseId);
        if (!base) {
          throw new NotFoundException('知识库不存在');
        }
        const document = documentMap.get(chunk.documentId);
        const indexText = this.buildVectorDocumentText(base, document, chunk);
        return {
          id: chunk.id,
          knowledgeBaseId: chunk.knowledgeBaseId,
          documentId: chunk.documentId,
          chunkId: chunk.id,
          chunkIndex: chunk.chunkIndex,
          title: chunk.title || document?.title || base.name,
          vectorId: chunk.vectorId,
          vectorStatus: chunk.vectorStatus,
          vectorError: chunk.vectorError,
          vectorizedAt: chunk.vectorizedAt,
          indexedContentHash: chunk.contentHash,
          currentContentHash: this.buildContentHash(indexText),
          indexText,
          metadata: this.buildVectorMetadata(base, document, chunk),
        };
      }),
      total,
    };
  }

  async findChunk(id: number) {
    const chunk = await this.chunkRepository.findOne({ where: { id } });
    if (!chunk) throw new NotFoundException('知识库分片不存在');
    return chunk;
  }

  async createChunk(dto: CreateKnowledgeBaseChunkDto) {
    const document = await this.findDocument(dto.documentId);
    const nextOrder = await this.nextChunkOrder(document.id);
    const chunk = await this.chunkRepository.save(
      this.chunkRepository.create({
        knowledgeBaseId: document.knowledgeBaseId,
        categoryId: document.categoryId,
        documentId: document.id,
        chunkIndex: dto.chunkIndex ?? nextOrder,
        title: dto.title?.trim() ?? '',
        content: dto.content.trim(),
        coreContent: dto.coreContent?.trim() || null,
        manualStartOffset: dto.manualStartOffset ?? null,
        manualEndOffset: dto.manualEndOffset ?? null,
        contextBeforeLength: dto.contextBeforeLength ?? 0,
        contextAfterLength: dto.contextAfterLength ?? 0,
        tokenCount: dto.tokenCount ?? dto.content.trim().length,
        sort: dto.sort ?? nextOrder,
        vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.pending,
        vectorError: null,
      }),
    );
    // 单条创建后同步文档分片状态（与整表 replace 保持一致）
    await this.syncDocumentChunkState(document.id);
    return chunk;
  }

  async replaceDocumentChunks(
    documentId: number,
    dto: ReplaceKnowledgeBaseDocumentChunksDto,
  ) {
    const document = await this.findDocument(documentId);
    const chunks = dto.chunks
      .map((item) => ({
        title: item.title?.trim() || '',
        content: item.content,
        coreContent: item.coreContent?.trim() || null,
        manualStartOffset: item.manualStartOffset ?? null,
        manualEndOffset: item.manualEndOffset ?? null,
        contextBeforeLength: item.contextBeforeLength ?? 0,
        contextAfterLength: item.contextAfterLength ?? 0,
      }))
      .filter((item) => item.content.trim());
    await this.deleteVectorsByCondition({ documentId });
    await this.chunkRepository.softDelete({ documentId });
    if (chunks.length) {
      await this.chunkRepository.save(
        chunks.map((chunk, index) =>
          this.chunkRepository.create({
            knowledgeBaseId: document.knowledgeBaseId,
            categoryId: document.categoryId,
            documentId: document.id,
            chunkIndex: index,
            title: chunk.title || `${document.title} #${index + 1}`,
            content: chunk.content,
            coreContent: chunk.coreContent,
            manualStartOffset: chunk.manualStartOffset,
            manualEndOffset: chunk.manualEndOffset,
            contextBeforeLength: chunk.contextBeforeLength,
            contextAfterLength: chunk.contextAfterLength,
            tokenCount: chunk.content.length,
            sort: index,
            vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.pending,
            vectorError: null,
          }),
        ),
      );
    }
    document.description = chunks.length
      ? `手动分片完成，共 ${chunks.length} 个分片`
      : '手动分片已清空，等待重新分片';
    await this.documentRepository.save(document);
    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    const processStage = chunks.length ? 'chunked' : 'parsed';
    if (base) {
      await this.updateBaseProcess(base, {
        processStage,
        chunkStatus: chunks.length ? 'success' : 'pending',
        indexStatus: 'pending',
        lastProcessMessage: document.description,
      });
    }
    return { documentId, chunkCount: chunks.length, processStage };
  }

  async updateChunk(id: number, dto: UpdateKnowledgeBaseChunkDto) {
    const chunk = await this.findChunk(id);
    if (dto.documentId !== undefined) {
      const document = await this.findDocument(dto.documentId);
      chunk.documentId = document.id;
      chunk.knowledgeBaseId = document.knowledgeBaseId;
      chunk.categoryId = document.categoryId;
    }
    if (dto.chunkIndex !== undefined) chunk.chunkIndex = dto.chunkIndex;
    if (dto.title !== undefined) chunk.title = dto.title.trim();
    if (dto.content !== undefined) chunk.content = dto.content.trim();
    if (dto.coreContent !== undefined)
      chunk.coreContent = dto.coreContent.trim() || null;
    if (dto.manualStartOffset !== undefined)
      chunk.manualStartOffset = dto.manualStartOffset ?? null;
    if (dto.manualEndOffset !== undefined)
      chunk.manualEndOffset = dto.manualEndOffset ?? null;
    if (dto.contextBeforeLength !== undefined)
      chunk.contextBeforeLength = dto.contextBeforeLength;
    if (dto.contextAfterLength !== undefined)
      chunk.contextAfterLength = dto.contextAfterLength;
    if (dto.tokenCount !== undefined) {
      chunk.tokenCount = dto.tokenCount;
    } else if (dto.content !== undefined) {
      chunk.tokenCount = chunk.content.length;
    }
    if (dto.sort !== undefined) chunk.sort = dto.sort;
    chunk.vectorStatus = KNOWLEDGE_CHUNK_VECTOR_STATUS.pending;
    chunk.vectorError = null;
    chunk.vectorizedAt = null;
    chunk.contentHash = null;
    const saved = await this.chunkRepository.save(chunk);
    await this.markBaseIndexPendingByDocument(saved.documentId);
    return saved;
  }

  async removeChunk(id: number) {
    const chunk = await this.findChunk(id);
    const { documentId } = chunk;
    await this.deleteVectorsByIds(chunk.vectorId ? [chunk.vectorId] : []);
    await this.chunkRepository.softDelete(id);
    await this.reorderDocumentChunks(documentId);
    // 单条删除后同步文档分片状态（删空时回退为 parsed/pending）
    await this.syncDocumentChunkState(documentId);
    return { id };
  }

  // 汇总某文档未删除分片数量，并据此同步文档描述与知识库处理状态
  private async syncDocumentChunkState(documentId: number) {
    const document = await this.findDocument(documentId);
    const count = await this.chunkRepository.count({ where: { documentId } });
    document.description = count
      ? `手动分片完成，共 ${count} 个分片`
      : '手动分片已清空，等待重新分片';
    await this.documentRepository.save(document);
    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    if (base) {
      await this.updateBaseProcess(base, {
        processStage: count ? 'chunked' : 'parsed',
        chunkStatus: count ? 'success' : 'pending',
        indexStatus: 'pending',
        lastProcessMessage: document.description,
      });
    }
  }

  private async nextChunkOrder(documentId: number) {
    const latest = await this.chunkRepository.findOne({
      where: { documentId },
      order: { sort: 'DESC', chunkIndex: 'DESC', id: 'DESC' },
    });
    return Math.max(latest?.sort ?? -1, latest?.chunkIndex ?? -1) + 1;
  }

  private async reorderDocumentChunks(documentId: number) {
    const chunks = await this.chunkRepository.find({
      where: { documentId },
      order: { sort: 'ASC', chunkIndex: 'ASC', id: 'ASC' },
    });
    if (!chunks.length) return;
    await this.chunkRepository.save(
      chunks.map((chunk, index) => {
        chunk.chunkIndex = index;
        chunk.sort = index;
        return chunk;
      }),
    );
  }

  private async markBaseIndexPendingByDocument(
    documentId: number,
    resetChunks = false,
  ) {
    const document = await this.findDocument(documentId);
    const count = await this.chunkRepository.count({ where: { documentId } });
    if (!count) return;
    if (resetChunks) {
      await this.chunkRepository.update(
        { documentId },
        {
          vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.pending,
          vectorError: null,
          vectorizedAt: null,
          contentHash: null,
        },
      );
    }
    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    if (!base) return;
    await this.updateBaseProcess(base, {
      processStage: 'chunked',
      chunkStatus: 'success',
      indexStatus: 'pending',
      lastProcessMessage: '分片已变更，等待重新索引',
    });
  }

  private async markBaseIndexPendingByBaseId(knowledgeBaseId: number) {
    const count = await this.chunkRepository.count({
      where: { knowledgeBaseId },
    });
    if (!count) return;
    await this.chunkRepository.update(
      { knowledgeBaseId },
      {
        vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.pending,
        vectorError: null,
        vectorizedAt: null,
        contentHash: null,
      },
    );
    const base = await this.baseRepository.findOne({
      where: { id: knowledgeBaseId },
    });
    if (!base) return;
    await this.updateBaseProcess(base, {
      processStage: 'chunked',
      chunkStatus: 'success',
      indexStatus: 'pending',
      lastProcessMessage: '检索辅助信息已变更，等待重新索引',
    });
  }

  private buildChunkVectorId(chunk: KnowledgeBaseChunk) {
    return `kb:${chunk.knowledgeBaseId}:doc:${chunk.documentId}:chunk:${chunk.id}`;
  }

  private buildContentHash(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private buildVectorDocumentText(
    base: KnowledgeBase,
    document: KnowledgeBaseDocument | undefined,
    chunk: KnowledgeBaseChunk,
  ) {
    const hitKeywords = document?.hitKeywords || base.hitKeywords || '';
    const colloquialDescription =
      document?.colloquialDescription || base.colloquialDescription || '';
    // 检索辅助信息只用于提升召回，不作为 AI 回答指令。
    return [
      `标题：${chunk.title || document?.title || base.name}`,
      `知识库：${base.name}`,
      document?.sourceName ? `来源：${document.sourceName}` : '',
      hitKeywords ? `检索关键字：${hitKeywords}` : '',
      colloquialDescription ? `常见问法/说法：${colloquialDescription}` : '',
      `匹配优先级：${document?.matchPriority ?? base.matchPriority ?? 1}`,
      '正文：',
      chunk.content,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildVectorMetadata(
    base: KnowledgeBase,
    document: KnowledgeBaseDocument | undefined,
    chunk: KnowledgeBaseChunk,
  ): Metadata {
    return {
      knowledgeBaseId: chunk.knowledgeBaseId,
      knowledgeBaseName: base.name,
      categoryId: chunk.categoryId ?? 0,
      documentId: chunk.documentId,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      sort: chunk.sort,
      title: chunk.title || document?.title || base.name,
      sourceName: document?.sourceName || base.name,
      contentType: base.contentType,
      fileName: base.fileName || '',
      fileUrl: base.fileUrl || '',
      hitKeywords: document?.hitKeywords || base.hitKeywords || '',
      colloquialDescription:
        document?.colloquialDescription || base.colloquialDescription || '',
            matchPriority: document?.matchPriority ?? base.matchPriority ?? 1,
      manualStartOffset: chunk.manualStartOffset ?? -1,
      manualEndOffset: chunk.manualEndOffset ?? -1,
    };
  }

  private async deleteVectorsByCondition(
    where:
      | FindOptionsWhere<KnowledgeBaseChunk>
      | FindOptionsWhere<KnowledgeBaseChunk>[],
  ) {
    const chunks = await this.chunkRepository.find({ where });
    await this.deleteVectorsByIds(
      chunks
        .map((chunk) => chunk.vectorId)
        .filter((id): id is string => Boolean(id)),
    );
  }

  private async deleteVectorsByIds(vectorIds: string[]) {
    if (!vectorIds.length) return;
    await this.vectorService.deleteChunks(vectorIds);
  }

  private async resetDocumentChunks(documentId: number) {
    await this.deleteVectorsByCondition({ documentId });
    await this.chunkRepository.softDelete({ documentId });
    const document = await this.findDocument(documentId);
    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    if (!base) return;
    await this.updateBaseProcess(base, {
      processStage: 'parsed',
      parseStatus: 'success',
      chunkStatus: 'pending',
      indexStatus: 'pending',
      lastProcessMessage: '解析完成，等待分片',
    });
  }

  private buildCategoryTree(list: KnowledgeBaseCategory[]) {
    const map = new Map<number, KnowledgeBaseCategoryTreeNode>();
    const roots: KnowledgeBaseCategoryTreeNode[] = [];
    list.forEach((item) => map.set(item.id, { ...item, children: [] }));
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  private resolveInitialProcessStage(
    contentType: string,
    contentText?: string | null,
    fileUrl?: string | null,
  ) {
    if (contentType === 'text') {
      return contentText?.trim() ? 'ready' : 'draft';
    }
    return fileUrl?.trim() ? 'uploaded' : 'draft';
  }

  private async readTextSource(fileUrl: string, fileName?: string | null) {
    const sourceName = fileName?.trim() || fileUrl;
    const extension = extname(sourceName.split('?')[0]).toLowerCase();
    if (!['.txt', '.md'].includes(extension)) {
      throw new BadRequestException('文本文件仅支持 .txt 或 .md 格式');
    }

    const file = await this.storedFilesService.read(fileUrl, fileName);
    const content = this.storedFilesService.decodeText(file.buffer).trim();
    if (!content) {
      throw new BadRequestException('上传的文本文件内容为空');
    }
    return this.normalizeParsedContent(content);
  }

  private async updateBaseProcess(
    base: KnowledgeBase,
    payload: Partial<
      Pick<
        KnowledgeBase,
        | 'processStage'
        | 'parseStatus'
        | 'chunkStatus'
        | 'indexStatus'
        | 'lastProcessMessage'
      >
    >,
  ) {
    Object.assign(base, payload);
    return this.baseRepository.save(base);
  }

  private resolveParseMode(mode?: string | null): KnowledgeParseMode {
    return mode === KNOWLEDGE_PARSE_MODE.ai ||
      mode === KNOWLEDGE_PARSE_MODE.ocr ||
      mode === KNOWLEDGE_PARSE_MODE.mineru
      ? KNOWLEDGE_PARSE_MODE.ai
      : KNOWLEDGE_PARSE_MODE.manual;
  }

  private getParseModeLabel(mode: KnowledgeParseMode) {
    return mode === KNOWLEDGE_PARSE_MODE.manual ? '手动解析' : 'AI 模型解析';
  }

  private getParseLogAction(mode: KnowledgeParseMode) {
    return mode === KNOWLEDGE_PARSE_MODE.manual ? 'manualParse' : 'aiModelParse';
  }

  private async recordKnowledgeProcessLog(
    base: KnowledgeBase,
    payload: {
      action: string;
      isSuccess: boolean;
      message: string;
      errorMessage?: string | null;
      data?: Record<string, unknown>;
    },
  ) {
    await this.logRecordsService
      .recordInternalAction({
        moduleId: 'knowledge-processing',
        action: payload.action,
        recordId: base.id,
        summary: `${base.name}：${payload.message}`,
        isSuccess: payload.isSuccess,
        errorMessage: payload.errorMessage ?? null,
        afterData: {
          knowledgeBaseId: base.id,
          knowledgeBaseName: base.name,
          processStage: base.processStage,
          parseStatus: base.parseStatus,
          chunkStatus: base.chunkStatus,
          indexStatus: base.indexStatus,
          ...(payload.data ?? {}),
        },
      })
      .catch(() => undefined);
  }

  private async recordKnowledgeDocumentProcessLog(
    document: KnowledgeBaseDocument,
    payload: {
      action: string;
      isSuccess: boolean;
      message: string;
      errorMessage?: string | null;
      data?: Record<string, unknown>;
    },
  ) {
    await this.logRecordsService
      .recordInternalAction({
        moduleId: 'knowledge-processing',
        action: payload.action,
        recordId: document.knowledgeBaseId || document.id,
        summary: `${document.title}：${payload.message}`,
        isSuccess: payload.isSuccess,
        errorMessage: payload.errorMessage ?? null,
        afterData: {
          documentId: document.id,
          documentTitle: document.title,
          knowledgeBaseId: document.knowledgeBaseId,
          status: document.status,
          ...(payload.data ?? {}),
        },
      })
      .catch(() => undefined);
  }

  private async parseBaseContentByMode(
    base: KnowledgeBase,
    parseMode: KnowledgeParseMode,
  ) {
    if (base.contentType === 'text') {
      const content = base.contentText?.trim();
      if (!content) {
        throw new BadRequestException('文本知识库缺少文本内容');
      }
      if (parseMode === KNOWLEDGE_PARSE_MODE.manual) {
        return content;
      }
      return this.parseBaseWithAiModelConfig(base);
    }
    if (!base.fileUrl) {
      throw new BadRequestException('文件知识库缺少上传文件');
    }
    this.assertSupportedDocumentFile(base.fileUrl, base.fileName);

    if (parseMode === KNOWLEDGE_PARSE_MODE.manual) {
      return this.documentParsersService.parse({
        contentType: base.contentType as 'text' | 'pdf' | 'word' | 'image',
        contentText: base.contentText,
        fileUrl: base.fileUrl,
        fileName: base.fileName,
      });
    }

    return this.parseBaseWithAiModelConfig(base);
  }

  private async parseBaseWithAiModelConfig(base: KnowledgeBase) {
    const mineruConfig = await this.resolveEnabledMineruParseConfig();
    if (mineruConfig && base.fileUrl) {
      return this.parseBaseWithThirdParty(base, mineruConfig);
    }
    const contentType = this.resolveAiModelParseContentType(
      base.contentType,
      base.fileName || base.fileUrl,
      base.contentText,
    );
    if (contentType === 'pdf' || contentType === 'image') {
      return this.parseBaseWithVisionOcr(base, await this.resolveOcrFeatureConfig());
    }
    return this.parseBaseWithDocumentModel(
      base,
      contentType,
      await this.resolveDocumentParseFeatureConfig(),
    );
  }

  private async parseBaseWithVisionOcr(
    base: KnowledgeBase,
    ocrConfig: AiFeatureConfig,
  ) {
    if (!base.fileUrl) {
      throw new BadRequestException('AI 模型解析缺少文件 URL');
    }
    const contentType = this.resolveOcrContentType(
      base.contentType,
      base.fileName || base.fileUrl,
    );
    const file = await this.storedFilesService.read(base.fileUrl, base.fileName);
    const imageDataUrls = await this.documentOcrService.buildVisionOcrImageDataUrls(
      {
        contentType,
        fileUrl: base.fileUrl,
        fileName: base.fileName,
        file,
      },
    );
    const target = await this.providersService.resolveVisionTarget({
      id: ocrConfig.providerId!,
      model: ocrConfig.model!,
    });
    await this.taskFileLogger.write('base.vision-ocr.start', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      fileName: base.fileName,
      fileUrl: base.fileUrl,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      providerId: target.providerId,
      providerName: target.providerName,
      model: target.model,
      imageCount: imageDataUrls.length,
    });
    const result = await this.providersService.callVisionOcr({
      target,
      imageDataUrls,
      systemPrompt: ocrConfig.systemPrompt,
      rules: ocrConfig.rules,
      responseFormat: ocrConfig.responseFormat,
    });
    if (!result.isSuccess) {
      throw new BadRequestException(
        result.errorMessage || '视觉模型 OCR 调用失败',
      );
    }
    const content = result.answer.trim();
    if (!content) {
      throw new BadRequestException('视觉模型 OCR 结果缺少解析正文');
    }
    await this.taskFileLogger.write('base.vision-ocr.success', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      providerId: result.providerId,
      providerName: result.providerName,
      model: result.model,
      imageCount: imageDataUrls.length,
      contentLength: content.length,
      elapsedMilliseconds: result.elapsedMilliseconds,
    });
    return content;
  }

  private async parseBaseWithDocumentModel(
    base: KnowledgeBase,
    contentType: 'text' | 'word',
    config: AiFeatureConfig,
  ) {
    const sourceContent = await this.resolveBaseTextModelSourceContent(
      base,
      contentType,
    );
    const parts = await this.documentParseRulesService.splitText(
      sourceContent,
      contentType,
    );
    const results: string[] = [];
    let elapsedMilliseconds = 0;
    let providerResult: Awaited<ReturnType<KnowledgeAiProvidersService['callChat']>> | undefined;
    for (const part of parts) {
      const result = await this.providersService.callChat({
        id: config.providerId!,
        model: config.model!,
        systemPrompt:
          config.systemPrompt ||
          '你是文档解析助手。请将输入内容整理为适合知识库保存的正文。',
        question: this.buildDocumentParseQuestion({
          content: part.content,
          fileName: base.fileName || base.name,
          contentType,
          rules: config.rules,
          responseFormat: config.responseFormat,
        }),
      });
      if (!result.isSuccess) {
        throw new BadRequestException(
          result.errorMessage || `文档解析模型调用失败（第 ${part.index + 1} 段）`,
        );
      }
      const parsedPart = result.answer.trim();
      if (!parsedPart) {
        throw new BadRequestException(
          `文档解析模型结果缺少解析正文（第 ${part.index + 1} 段）`,
        );
      }
      results.push(parsedPart);
      elapsedMilliseconds += result.elapsedMilliseconds;
      providerResult = result;
    }
    const content = results.join('\n\n').trim();
    if (!content || !providerResult) {
      throw new BadRequestException('文档解析模型结果缺少解析正文');
    }
    await this.taskFileLogger.write('base.ai-text-parse.success', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      providerId: providerResult.providerId,
      providerName: providerResult.providerName,
      model: providerResult.model,
      contentType,
      sourceContentLength: sourceContent.length,
      contentLength: content.length,
      partCount: parts.length,
      elapsedMilliseconds,
    });
    return content;
  }

  private async parseBaseWithThirdParty(
    base: KnowledgeBase,
    resolvedOcrConfig?: AiFeatureConfig,
  ) {
    const ocrConfig =
      resolvedOcrConfig ?? (await this.resolveMineruOcrFeatureConfig());
    await this.taskFileLogger.write('base.mineru.createTask.start', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      fileName: base.fileName,
      fileUrl: base.fileUrl,
      ocrFeatureConfigId: ocrConfig.id,
      ocrFeatureConfigName: ocrConfig.name,
      mineruConfigId: ocrConfig.mineruConfigId,
      mineruConfigName: ocrConfig.mineruConfigName,
    });
    const task = await this.mineruConfigsService.createParseTask(
      base.fileUrl,
      base.fileName,
      ocrConfig.mineruConfigId,
    );
    await this.taskFileLogger.write('base.mineru.createTask.success', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      taskId: task.taskId,
      configId: task.configId,
      configName: task.configName,
      pollIntervalSeconds: task.pollIntervalSeconds,
      timeoutMinutes: task.timeoutMinutes,
    });
    const document = await this.markBaseDocumentParsing(
      base,
      task.taskId,
      base.fileName,
    );
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      lastProcessMessage: `AI 模型解析任务已创建，任务ID：${task.taskId}`,
    });
    try {
      const result = await this.mineruConfigsService.waitForSuccess(
        task.taskId,
        {
          configId: task.configId,
          onProgress: (status) =>
            this.updateBaseMineruProgress(base, document, status),
        },
      );
      await this.taskFileLogger.write('base.mineru.wait.success', {
        knowledgeBaseId: base.id,
        knowledgeBaseName: base.name,
        documentId: document.id,
        taskId: task.taskId,
        markdownLength: result.markdown.length,
      });
      const content = this.resolveMineruParsedContent(result);
      return this.enhanceMineruWordContentWithSourceLinks({
        content,
        contentType: base.contentType,
        fileUrl: base.fileUrl,
        fileName: base.fileName,
        knowledgeBaseId: base.id,
        documentId: document.id,
        taskId: task.taskId,
      });
    } catch (error) {
      document.status = 'failed';
      document.description =
        error instanceof Error ? error.message : 'AI 模型解析失败';
      await this.documentRepository.save(document);
      await this.taskFileLogger.write('base.mineru.wait.failed', {
        knowledgeBaseId: base.id,
        knowledgeBaseName: base.name,
        documentId: document.id,
        taskId: task.taskId,
        errorMessage: document.description,
      });
      throw error;
    }
  }

  private async markBaseDocumentParsing(
    base: KnowledgeBase,
    taskId: string,
    fileName?: string | null,
  ) {
    const current = await this.documentRepository.findOne({
      where: { knowledgeBaseId: base.id },
      order: { id: 'DESC' },
    });
    const document =
      current ??
      this.documentRepository.create({
        knowledgeBaseId: base.id,
        categoryId: base.categoryId,
        sort: 0,
      });
    document.knowledgeBaseId = base.id;
    document.categoryId = base.categoryId;
    document.title = base.name;
    document.sourceType = KNOWLEDGE_PARSE_MODE.ai;
    document.sourceName = fileName || base.fileName || base.name;
    document.status = 'processing';
    document.description = `AI 模型解析任务已创建，任务ID：${taskId}`;
    document.hitKeywords = base.hitKeywords;
    document.colloquialDescription = base.colloquialDescription;
    document.matchPriority = base.matchPriority;
    return this.documentRepository.save(document);
  }

  private async updateBaseMineruProgress(
    base: KnowledgeBase,
    document: KnowledgeBaseDocument,
    status: {
      taskId: string;
      status: string;
      progress: number | null;
      message: string;
      raw?: unknown;
    },
  ) {
    const message = this.buildMineruProgressMessage(status);
    await this.taskFileLogger.write('base.mineru.progress', {
      knowledgeBaseId: base.id,
      knowledgeBaseName: base.name,
      documentId: document.id,
      taskId: status.taskId,
      status: status.status,
      progress: status.progress,
      message: status.message,
      rawSummary: this.buildMineruRawSummary(status.raw),
    });
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      lastProcessMessage: message,
    });
    document.status = 'processing';
    document.description = message;
    await this.documentRepository.save(document);
  }

  private async updateDocumentMineruProgress(
    document: KnowledgeBaseDocument,
    status: {
      taskId: string;
      status: string;
      progress: number | null;
      message: string;
      raw?: unknown;
    },
  ) {
    const message = this.buildMineruProgressMessage(status);
    await this.taskFileLogger.write('document.mineru.progress', {
      documentId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      taskId: status.taskId,
      status: status.status,
      progress: status.progress,
      message: status.message,
      rawSummary: this.buildMineruRawSummary(status.raw),
    });
    document.status = 'processing';
    document.description = message;
    await this.documentRepository.save(document);

    const base = await this.baseRepository.findOne({
      where: { id: document.knowledgeBaseId },
    });
    if (!base) return;
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      lastProcessMessage: message,
    });
  }

  private buildMineruProgressMessage(status: {
    taskId: string;
    status: string;
    progress: number | null;
    message: string;
  }) {
    const remoteStatus = status.status ? `，状态：${status.status}` : '';
    const progress =
      status.progress === null || status.progress === undefined
        ? ''
        : `，进度：${status.progress}%`;
    const remoteMessage = status.message ? `，${status.message}` : '';
    return `AI 模型解析中，任务ID：${status.taskId}${remoteStatus}${progress}${remoteMessage}`;
  }

  private buildMineruRawSummary(value: unknown) {
    if (value === undefined) return null;
    try {
      return JSON.stringify(value).slice(0, 2000);
    } catch {
      return 'MinerU 原始响应无法序列化';
    }
  }

  private buildMineruEmptyContentMessage(raw?: unknown) {
    const rawSummary = this.buildMineruRawSummary(raw);
    return rawSummary
      ? `AI 模型解析结果缺少解析正文；MinerU 返回：${rawSummary}`
      : 'AI 模型解析结果缺少解析正文';
  }

  private resolveMineruParsedContent(result: {
    markdown: string;
    raw?: unknown;
  }) {
    const content = result.markdown.trim();
    if (!content) {
      throw new BadRequestException(
        this.buildMineruEmptyContentMessage(result.raw),
      );
    }
    return content;
  }

  private async enhanceMineruWordContentWithSourceLinks(params: {
    content: string;
    contentType?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    knowledgeBaseId?: number;
    documentId?: number;
    taskId?: string;
  }) {
    if (!this.shouldExtractSourceWordLinks(params)) return params.content;
    try {
      const linkedContent = await this.documentParsersService.parse({
        contentType: 'word',
        fileUrl: params.fileUrl ?? undefined,
        fileName: params.fileName ?? undefined,
      });
      if (!this.hasLinkedText(linkedContent)) return params.content;
      await this.taskFileLogger.write('mineru.word.links.enhanced', {
        knowledgeBaseId: params.knowledgeBaseId,
        documentId: params.documentId,
        taskId: params.taskId,
        fileName: params.fileName,
        mineruContentLength: params.content.length,
        linkedContentLength: linkedContent.length,
      });
      return linkedContent;
    } catch (error) {
      await this.taskFileLogger.write('mineru.word.links.failed', {
        knowledgeBaseId: params.knowledgeBaseId,
        documentId: params.documentId,
        taskId: params.taskId,
        fileName: params.fileName,
        errorMessage:
          error instanceof Error ? error.message : 'Word 链接兜底提取失败',
      });
      return params.content;
    }
  }

  private shouldExtractSourceWordLinks(params: {
    content: string;
    contentType?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
  }) {
    if (this.hasLinkedText(params.content)) return false;
    const fileName = params.fileName?.toLowerCase() ?? '';
    const fileUrl = params.fileUrl?.toLowerCase() ?? '';
    return (
      params.contentType === 'word' ||
      fileName.endsWith('.docx') ||
      fileUrl.includes('.docx')
    );
  }

  private hasLinkedText(content?: string | null) {
    return !!content?.includes('（链接：');
  }

  private extractMineruTaskId(value?: string | null) {
    const match = value?.match(/任务ID：([^，,；;\s]+)/);
    return match?.[1] ?? '';
  }

  private async findBaseDocument(knowledgeBaseId: number) {
    const document = await this.documentRepository.findOne({
      where: { knowledgeBaseId },
      order: { id: 'DESC' },
    });
    if (!document) {
      throw new BadRequestException('请先解析生成知识库文档');
    }
    return document;
  }

  private async saveBaseDocument(
    base: KnowledgeBase,
    content: string,
    parseMode: KnowledgeParseMode,
  ) {
    const normalizedContent = this.normalizeParsedContent(content);
    if (!normalizedContent) {
      throw new BadRequestException(
        `${this.getParseModeLabel(parseMode)}结果缺少解析正文`,
      );
    }
    const current = await this.documentRepository.findOne({
      where: { knowledgeBaseId: base.id },
      order: { id: 'DESC' },
    });
    const document =
      current ??
      this.documentRepository.create({
        knowledgeBaseId: base.id,
        categoryId: base.categoryId,
        sort: 0,
      });
    document.knowledgeBaseId = base.id;
    document.categoryId = base.categoryId;
    document.title = base.name;
    document.sourceType = base.contentType === 'text' ? 'text' : parseMode;
    document.sourceName =
      base.contentType === 'text' ? base.name : base.fileName || base.name;
    document.content = normalizedContent;
    document.status = 'parsed';
    document.description = `${this.getParseModeLabel(parseMode)}完成，等待分片`;
    document.hitKeywords = base.hitKeywords;
    document.colloquialDescription = base.colloquialDescription;
    document.matchPriority = base.matchPriority;
    const saved = await this.documentRepository.save(document);
    base.contentText = normalizedContent;
    return saved;
  }

  private async saveDocumentChunks(
    document: KnowledgeBaseDocument,
    config?: KnowledgeChunkConfig,
  ) {
    const chunkConfig =
      config ?? (await this.chunkConfigsService.findDefaultConfig());
    const chunks = this.splitMarkdown(
      document.content ?? '',
      chunkConfig,
      this.resolveChunkDeadline(chunkConfig),
    );
    if (!chunks.length) return 0;
    await this.chunkRepository.save(
      chunks.map((chunk, index) =>
        this.chunkRepository.create({
          knowledgeBaseId: document.knowledgeBaseId,
          categoryId: document.categoryId,
          documentId: document.id,
          chunkIndex: index,
          title: `${document.title} #${index + 1}`,
          content: chunk,
          tokenCount: chunk.length,
          sort: index,
          vectorStatus: KNOWLEDGE_CHUNK_VECTOR_STATUS.pending,
          vectorError: null,
        }),
      ),
    );
    return chunks.length;
  }

  private async applyThirdPartyMarkdown(
    document: KnowledgeBaseDocument,
    markdown: string,
    fileName?: string,
    raw?: unknown,
  ) {
    const content = this.normalizeParsedContent(markdown);
    if (!content) {
      throw new BadRequestException(this.buildMineruEmptyContentMessage(raw));
    }
    document.content = content;
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.ai;
    if (fileName) document.sourceName = fileName;
    if (!document.hitKeywords || !document.colloquialDescription) {
      const base = await this.baseRepository.findOne({
        where: { id: document.knowledgeBaseId },
      });
      document.hitKeywords = document.hitKeywords || base?.hitKeywords || null;
      document.colloquialDescription =
        document.colloquialDescription || base?.colloquialDescription || null;
      document.matchPriority =
        document.matchPriority || base?.matchPriority || 1;
    }
    let saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.resetDocumentChunks(saved.id);
    saved.description = 'AI 模型解析完成，等待分片';
    saved = await this.documentRepository.save(saved);
    return { document: saved, chunkCount: 0 };
  }

  private resolveDocumentManualContentType(
    document: KnowledgeBaseDocument,
  ): 'text' | 'pdf' | 'word' | 'image' {
    if (document.sourceType === 'pdf') return 'pdf';
    if (document.sourceType === 'word') return 'word';
    if (document.sourceType === 'image') return 'image';
    return 'text';
  }

  private resolveAiModelParseContentType(
    sourceType?: string | null,
    fileName?: string | null,
    contentText?: string | null,
  ): 'text' | 'pdf' | 'word' | 'image' {
    if (sourceType === 'pdf') return 'pdf';
    if (sourceType === 'word') return 'word';
    if (sourceType === 'image') return 'image';
    if (sourceType === 'text') return 'text';
    const name = (fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (/\.(docx?|wps)$/.test(name)) return 'word';
    if (/\.(png|jpe?g|webp|bmp)$/.test(name)) return 'image';
    if (/\.(txt|md)$/.test(name) || contentText?.trim()) return 'text';
    return 'text';
  }

  private async resolveDocumentTextModelSourceContent(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
    contentType: 'text' | 'word',
  ) {
    if (contentType === 'text') {
      const content = document.content?.trim();
      if (!content) throw new BadRequestException('文本内容为空，无法进行文档解析');
      return content;
    }
    const fileUrl = dto.fileUrl?.trim();
    if (!fileUrl) throw new BadRequestException('Word 文档解析需要提供文件 URL');
    return this.documentParsersService.parse({
      contentType,
      fileUrl,
      fileName: dto.fileName?.trim() || document.sourceName,
    });
  }

  private async resolveBaseTextModelSourceContent(
    base: KnowledgeBase,
    contentType: 'text' | 'word',
  ) {
    if (contentType === 'text') {
      const content = base.contentText?.trim();
      if (!content) throw new BadRequestException('文本知识库缺少文本内容');
      return content;
    }
    if (!base.fileUrl) throw new BadRequestException('Word 文档解析需要提供文件 URL');
    return this.documentParsersService.parse({
      contentType,
      fileUrl: base.fileUrl,
      fileName: base.fileName,
    });
  }

  private buildDocumentParseQuestion(params: {
    content: string;
    fileName?: string | null;
    contentType: 'text' | 'word';
    rules?: string | null;
    responseFormat?: string | null;
  }) {
    const formatMap: Record<string, string> = {
      text: '纯文本',
      markdown: 'Markdown',
      json: 'JSON',
    };
    return [
      `文件名称：${params.fileName || '-'}`,
      `文件类型：${params.contentType === 'word' ? 'Word' : '文本'}`,
      `返回格式：${formatMap[params.responseFormat || 'text'] || '纯文本'}`,
      params.rules ? `业务规则：${params.rules}` : '',
      '请整理以下文档正文，保留可用于知识库检索和回答的有效内容。',
      '如果内容中包含“（链接：URL）”，必须保留在对应语句后面，不要移除链接。',
      '只返回整理后的正文，不要输出解释。',
      '',
      params.content,
    ]
      .filter((item) => item !== '')
      .join('\n');
  }

  private resolveOcrContentType(
    sourceType?: string | null,
    fileName?: string | null,
  ): 'pdf' | 'image' {
    if (sourceType === 'pdf') return 'pdf';
    if (sourceType === 'image') return 'image';
    const name = (fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (/\.(png|jpe?g|webp|bmp)$/.test(name)) return 'image';
    throw new BadRequestException(
      '视觉模型 OCR 仅支持图片或 PDF，请在 OCR 配置中切换 MinerU，或选择手动解析',
    );
  }

  private async syncBaseParsedContent(
    document: KnowledgeBaseDocument,
    content: string,
  ) {
    await this.baseRepository.update(document.knowledgeBaseId, {
      contentText: content.trim(),
    });
  }

  private splitMarkdown(
    content: string,
    config: KnowledgeChunkConfig,
    deadline: number,
  ): string[] {
    const text = this.normalizeParsedContent(content);
    if (!text) return [];
    const chunkSize = config.chunkSize || 1200;
    const overlap = Math.min(config.chunkOverlap || 0, chunkSize - 1);
    if (config.separator === 'paragraph') {
      return this.splitByParagraph(text, chunkSize, overlap, deadline);
    }
    return this.splitByLength(text, chunkSize, overlap, deadline);
  }

  private normalizeParsedContent(content: string) {
    return content
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private splitByLength(
    text: string,
    chunkSize: number,
    overlap: number,
    deadline: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      this.assertChunkDeadline(deadline);
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return chunks.filter(Boolean);
  }

  private splitByParagraph(
    text: string,
    chunkSize: number,
    overlap: number,
    deadline: number,
  ): string[] {
    this.assertChunkDeadline(deadline);
    const paragraphs = text
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!paragraphs.length) {
      return this.splitByLength(text, chunkSize, overlap, deadline);
    }
    const chunks: string[] = [];
    let current = '';
    for (const paragraph of paragraphs) {
      this.assertChunkDeadline(deadline);
      const next = current ? `${current}\n\n${paragraph}` : paragraph;
      if (next.length <= chunkSize) {
        current = next;
        continue;
      }
      if (current) chunks.push(current);
      if (paragraph.length > chunkSize) {
        chunks.push(
          ...this.splitByLength(paragraph, chunkSize, overlap, deadline),
        );
        current = '';
      } else {
        current = paragraph;
      }
    }
    if (current) chunks.push(current);
    if (!overlap) return chunks.filter(Boolean);
    return chunks.map((chunk, index) => {
      if (index === 0) return chunk;
      const prevTail = chunks[index - 1].slice(-overlap);
      return `${prevTail}\n${chunk}`.trim();
    });
  }

  private resolveChunkDeadline(config: KnowledgeChunkConfig) {
    const minutes = Math.max(1, config.timeoutMinutes || 5);
    return Date.now() + minutes * 60 * 1000;
  }

  private assertChunkDeadline(deadline: number) {
    if (Date.now() <= deadline) return;
    throw new BadRequestException('自动分片超时，请调大超时时间或改用手动分片');
  }

  private assertSupportedDocumentFile(fileUrl: string, fileName?: string) {
    const supported = new Set([
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.md',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.bmp',
    ]);
    const name = (fileName || this.resolveFileName(fileUrl)).toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (!supported.has(ext)) {
      throw new BadRequestException(
        '解析仅支持 .pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .png .jpg .jpeg .webp .bmp',
      );
    }
  }

  private async assertSupportedDocumentFileForDocument(
    document: KnowledgeBaseDocument,
    fileUrl: string,
    fileName?: string,
  ) {
    try {
      this.assertSupportedDocumentFile(fileUrl, fileName);
    } catch (error) {
      document.status = 'failed';
      document.description =
        error instanceof Error ? error.message : '文档格式不支持';
      await this.documentRepository.save(document);
      throw error;
    }
  }

  private resolveFileName(fileUrl: string) {
    try {
      const pathname = new URL(fileUrl).pathname;
      return decodeURIComponent(pathname.split('/').pop() || '');
    } catch {
      return fileUrl.split('/').pop() || '';
    }
  }

  private collectDescendantIds(
    list: KnowledgeBaseCategory[],
    parentId: number,
  ) {
    const childrenMap = new Map<number, KnowledgeBaseCategory[]>();
    list.forEach((item) => {
      if (!item.parentId) return;
      const children = childrenMap.get(item.parentId) ?? [];
      children.push(item);
      childrenMap.set(item.parentId, children);
    });
    const ids: number[] = [];
    const stack = [...(childrenMap.get(parentId) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      ids.push(current.id);
      stack.push(...(childrenMap.get(current.id) ?? []));
    }
    return ids;
  }

  private async assertCategoryExists(categoryId?: number | null) {
    if (!categoryId) return;
    await this.findCategory(categoryId);
  }

  private async assertRequiredCategory(categoryId?: number | null) {
    if (!categoryId) {
      throw new BadRequestException('请选择知识库分类');
    }
    await this.assertCategoryExists(categoryId);
  }

  private async assertParentCategory(
    parentId?: number | null,
    currentId?: number,
  ) {
    if (!parentId) return;
    if (currentId && parentId === currentId) {
      throw new BadRequestException('上级分类不能选择自己');
    }
    await this.findCategory(parentId);
  }
}
