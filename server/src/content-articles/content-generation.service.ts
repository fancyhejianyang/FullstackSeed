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
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { ContentTemplatesService } from '../content-templates/content-templates.service';
import { ContentArticle } from './entities/content-article.entity';
import {
  buildContentWritingPrompt,
  parseContentWritingResponse,
} from './content-writing';
import {
  ContentGenerationTask,
  type ContentTaskStatus,
} from './entities/content-generation-task.entity';
import {
  GenerateContentTaskDto,
  QueryContentArticleDto,
  QueryContentTaskDto,
} from './dto/content-article.dto';

const SUMMARY_FIELDS = {
  id: true,
  articleId: true,
  articleVersion: true,
  status: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  errorMessage: true,
  totalTokens: true,
} as const;

@Injectable()
export class ContentGenerationService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = randomUUID();
  private readonly logger = new Logger(ContentGenerationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private stopped = false;
  private activeAbort?: AbortController;
  constructor(
    @InjectRepository(ContentGenerationTask)
    private readonly tasks: Repository<ContentGenerationTask>,
    @InjectRepository(ContentArticle)
    private readonly articles: Repository<ContentArticle>,
    private readonly configs: AiFeatureConfigsService,
    private readonly providers: KnowledgeAiProvidersService,
    private readonly templates: ContentTemplatesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() =>
        this.logger.warn('内容生成任务调度暂不可用，将稍后检查'),
      );
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.activeAbort?.abort();
  }

  configOptions(query: QueryContentArticleDto) {
    return this.configs.contentCreationOptions(query);
  }

  async submit(articleId: number, dto: GenerateContentTaskDto, userId: number) {
    const existing = await this.tasks.findOne({
      where: { userId, requestId: dto.requestId },
    });
    if (existing) {
      this.assertSameRequest(existing, articleId, dto);
      await this.article(articleId, userId);
      return this.summary(existing);
    }
    const article = await this.article(articleId, userId);
    if (article.version !== dto.version)
      throw new ConflictException('文章已更新，请重新打开后生成');
    if (!article.idea.trim())
      throw new BadRequestException('请先填写并保存想法');
    const config = await this.configs.findUsableContentCreationConfig(
      dto.aiConfigId,
    );
    // 仅校验配置，不调用计费 API；秘密不持久化到任务快照。
    await this.providers.resolveChatTarget({
      id: config.providerId!,
      model: config.model!,
    });
    const template = dto.templateId
      ? await this.templates.findOne(dto.templateId, userId)
      : null;
    const snapshot = {
      requestVersion: dto.version,
      title: article.title,
      idea: article.idea,
      template: template
        ? {
            id: template.id,
            name: template.name,
            instruction: template.instruction,
          }
        : { id: null, name: '通用写作', instruction: '' },
      config: {
        id: config.id,
        name: config.name,
        providerId: config.providerId!,
        providerName: config.providerName ?? '',
        model: config.model!,
        temperature: config.temperature,
        thinkingParameters: config.enableThinking
          ? config.thinkingParameters
          : null,
        systemPrompt: config.systemPrompt ?? '',
        responseFormat: config.responseFormat as 'text' | 'markdown',
      },
    };
    try {
      return await this.tasks.manager.transaction(async (manager) => {
        const articleRepo = manager.getRepository(ContentArticle);
        const current = await articleRepo.findOne({
          where: { id: articleId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current || current.version !== dto.version)
          throw new ConflictException('文章已更新或删除，请重新打开后生成');
        const preferencesChanged =
          current.aiConfigId !== dto.aiConfigId ||
          (current.templateId ?? null) !== (dto.templateId ?? null);
        const articleVersion = current.version + (preferencesChanged ? 1 : 0);
        if (preferencesChanged) {
          await articleRepo.update(
            { id: articleId, userId, version: current.version },
            {
              aiConfigId: dto.aiConfigId,
              templateId: dto.templateId ?? null,
              version: articleVersion,
            },
          );
        }
        const repo = manager.getRepository(ContentGenerationTask);
        return this.summary(
          await repo.save(
            repo.create({
              articleId,
              userId,
              articleVersion,
              requestId: dto.requestId,
              status: 'pending',
              activeArticleId: articleId,
              activeUserId: userId,
              snapshot,
            }),
          ),
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        const retried = await this.tasks.findOne({
          where: { userId, requestId: dto.requestId, articleId },
        });
        if (retried) {
          this.assertSameRequest(retried, articleId, dto);
          return this.summary(retried);
        }
        throw new ConflictException(
          '已有文章正在排队或生成，请等待完成后再提交',
        );
      }
      throw error;
    }
  }

  private assertSameRequest(
    task: ContentGenerationTask,
    articleId: number,
    dto: GenerateContentTaskDto,
  ) {
    if (task.articleId !== articleId)
      throw new ConflictException('请求号已用于其它文章');
    if (
      (task.snapshot.requestVersion ?? task.articleVersion) !== dto.version ||
      task.snapshot.config.id !== dto.aiConfigId ||
      task.snapshot.template.id !== (dto.templateId ?? null)
    )
      throw new ConflictException('请求号已用于不同生成参数，请重新提交');
  }

  async listAll(query: QueryContentTaskDto, userId: number) {
    const builder = this.tasks
      .createQueryBuilder('task')
      .innerJoin(
        ContentArticle,
        'article',
        'article.id = task.articleId AND article.userId = :userId AND article.deletedAt IS NULL',
        { userId },
      )
      .where('task.userId = :userId', { userId });
    if (query.articleId)
      builder.andWhere('task.articleId = :articleId', {
        articleId: query.articleId,
      });
    if (query.status)
      builder.andWhere('task.status = :status', { status: query.status });
    if (query.keyword?.trim())
      builder.andWhere('article.title LIKE :keyword', {
        keyword: `%${query.keyword.trim()}%`,
      });
    const total = await builder.getCount();
    builder.select([]);
    for (const field of Object.keys(SUMMARY_FIELDS))
      builder.addSelect(`task.${field}`, field);
    const list = await builder
      .addSelect('article.title', 'articleTitle')
      .orderBy('task.id', 'DESC')
      .offset(((query.page ?? 1) - 1) * (query.pageSize ?? 10))
      .limit(query.pageSize ?? 10)
      .getRawMany<
        ReturnType<ContentGenerationService['summary']> & {
          articleTitle: string;
        }
      >();
    return { list, total };
  }

  async preview(articleId: number, userId: number) {
    const article = await this.article(articleId, userId);
    const latest = await this.tasks.findOne({
      select: { id: true },
      where: { articleId, userId },
      order: { id: 'DESC' },
    });
    // 最新一次即使失败/排队也返回真实状态，不回退到更早的成功稿。
    return {
      article,
      latestTask: latest ? await this.detail(latest.id, userId) : null,
    };
  }

  async list(articleId: number, query: QueryContentArticleDto, userId: number) {
    await this.article(articleId, userId);
    const [list, total] = await this.tasks.findAndCount({
      select: SUMMARY_FIELDS,
      where: { articleId, userId },
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list, total };
  }
  async detail(id: number, userId: number) {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('生成任务不存在');
    await this.article(task.articleId, userId);
    return {
      ...this.summary(task),
      snapshot: task.snapshot,
      result: task.result,
      editorNotes: task.editorNotes ?? null,
    };
  }
  async latest(articleIds: number[], userId: number) {
    if (!articleIds.length) return [];
    const latestIds = this.tasks
      .createQueryBuilder('recent')
      .select('MAX(recent.id)')
      .where('recent.userId = :userId', { userId })
      .andWhere('recent.articleId IN (:...articleIds)', { articleIds })
      .groupBy('recent.articleId');
    return this.tasks
      .createQueryBuilder('task')
      .select(Object.keys(SUMMARY_FIELDS).map((field) => `task.${field}`))
      .where(`task.id IN (${latestIds.getQuery()})`)
      .setParameters(latestIds.getParameters())
      .getMany();
  }
  async adopt(id: number, version: number, userId: number) {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('生成任务不存在');
    return this.tasks.manager.transaction(async (manager) => {
      const articles = manager.getRepository(ContentArticle);
      const article = await articles.findOne({
        where: { id: task.articleId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!article) throw new NotFoundException('内容不存在');
      const repo = manager.getRepository(ContentGenerationTask);
      const current = await repo.findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.status !== 'succeeded' || !current.result)
        throw new ConflictException('该任务没有可采用的正文');
      if (
        article.version !== version ||
        article.version !== current.articleVersion
      )
        throw new ConflictException(
          '文章在提交任务后已修改，不能直接覆盖；请复制候选正文后手动合并',
        );
      article.content = current.result;
      const saved = await articles.save(article);
      await repo.update(id, { status: 'adopted' });
      return saved;
    });
  }

  async tick() {
    if (this.stopped || this.draining) return;
    this.draining = true;
    try {
      // 过期的运行租约只能转为中断，绝不能再次调用供应商。
      await this.tasks.update(
        { status: 'running', leaseExpiresAt: LessThan(new Date()) },
        {
          status: 'interrupted',
          finishedAt: new Date(),
          activeArticleId: null,
          activeUserId: null,
          errorMessage:
            '执行中断或超时，供应商可能已计费；请核实后手动重新生成',
        },
      );
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
      await this.run(task);
    } finally {
      this.draining = false;
    }
  }
  private async run(task: ContentGenerationTask) {
    this.activeAbort = new AbortController();
    let status: ContentTaskStatus = 'failed';
    let result: string | null = null;
    let editorNotes: string[] | null = null;
    let totalTokens: number | null = null;
    let errorMessage: string | null =
      '生成失败，原文未修改；供应商可能已计费，请检查配置后手动重试';
    try {
      await this.article(task.articleId, task.userId);
      const { config, title, idea } = task.snapshot;
      const response = await this.providers.withExecutionSignal(
        AbortSignal.any([this.activeAbort.signal, AbortSignal.timeout(120000)]),
        () =>
          this.providers.callChat({
            id: config.providerId,
            model: config.model,
            temperature: config.temperature,
            thinkingParameters: config.thinkingParameters,
            systemPrompt: buildContentWritingPrompt(
              task.snapshot,
              new Date(),
              task.createdAt,
            ),
            question: JSON.stringify({ title, idea }),
          }),
      );
      totalTokens = response.usage?.totalTokens ?? null;
      if (response.isSuccess) {
        const parsed = parseContentWritingResponse(response.answer ?? '');
        if (parsed) {
          status =
            parsed.outcome === 'needs_input' ? 'needs_input' : 'succeeded';
          result = parsed.outcome === 'draft' ? parsed.body : null;
          editorNotes = parsed.notes;
          errorMessage = null;
        } else {
          errorMessage =
            '模型未返回有效的正文与编辑提示结构，未采用响应、未修改原文；可能已计费，请检查模型或提示词后手动重试';
        }
      }
    } catch {
      /* 不记录供应商原始错误、密钥或内部思考内容。 */
    }
    if (this.stopped) {
      status = 'interrupted';
      result = null;
      editorNotes = null;
      errorMessage = '服务停止，任务已中断；供应商可能已计费，请核实后重试';
    }
    this.activeAbort = undefined;
    // 只允许当前租约写回；过期/已恢复的任务不能被迟到响应改成成功。
    await this.tasks.update(
      {
        id: task.id,
        status: 'running',
        workerId: this.workerId,
        leaseExpiresAt: MoreThan(new Date()),
      },
      {
        status,
        result,
        editorNotes,
        totalTokens,
        errorMessage,
        finishedAt: new Date(),
        activeArticleId: null,
        activeUserId: null,
        leaseExpiresAt: null,
      },
    );
  }
  private async article(id: number, userId: number) {
    const article = await this.articles.findOne({ where: { id, userId } });
    if (!article) throw new NotFoundException('内容不存在');
    return article;
  }
  private summary(task: ContentGenerationTask) {
    return {
      id: task.id,
      articleId: task.articleId,
      articleVersion: task.articleVersion,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      errorMessage: task.errorMessage,
      totalTokens: task.totalTokens,
    };
  }
}
