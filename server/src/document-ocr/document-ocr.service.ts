import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createWorker } from 'tesseract.js';
import { type DocumentParseContext } from '../document-parsers/types';
import { KnowledgeChunkConfigsService } from '../knowledge-chunk-configs/knowledge-chunk-configs.service';

export interface OcrRecognizeResult {
  text: string;
  engine: 'local-tesseract';
}

type LocalOcrWorker = Awaited<ReturnType<typeof createWorker>>;
type LocalOcrImage = Parameters<LocalOcrWorker['recognize']>[0];
type TesseractWorkerOptions = NonNullable<Parameters<typeof createWorker>[2]>;

type PdfParseClass = new (options: { data: Buffer }) => {
  getScreenshot: (options?: {
    first?: number;
    desiredWidth?: number;
    imageDataUrl?: boolean;
    imageBuffer?: boolean;
  }) => Promise<{
    pages: Array<{
      dataUrl?: string;
      pageNumber: number;
    }>;
  }>;
  destroy?: () => Promise<void> | void;
};

type PdfParseModule = {
  PDFParse?: PdfParseClass;
};

@Injectable()
export class DocumentOcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentOcrService.name);
  private readonly localOcrLanguages =
    process.env.TESSERACT_LANGS?.trim() || 'chi_sim';
  private readonly localOcrInitTimeoutMs = Number(
    process.env.TESSERACT_INIT_TIMEOUT_MS || 30000,
  );
  private readonly localOcrRecognizeTimeoutMs = Number(
    process.env.TESSERACT_RECOGNIZE_TIMEOUT_MS || 60000,
  );
  private readonly allowRemoteLanguageDownload =
    process.env.TESSERACT_ALLOW_REMOTE_LANG_DOWNLOAD === 'true';
  private readonly warmupOnStart =
    process.env.TESSERACT_WARMUP_ON_START === 'true';
  private localOcrWorker: LocalOcrWorker | null = null;
  private localOcrWorkerPromise: Promise<LocalOcrWorker> | null = null;
  private localOcrRecognizeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly chunkConfigsService: KnowledgeChunkConfigsService,
  ) {}

  onModuleInit() {
    if (!this.warmupOnStart) return;
    void this.getLocalOcrWorker('预热')
      .then(() => this.logger.log('本地 OCR Worker 预热完成'))
      .catch((error) => {
        this.logger.warn(
          error instanceof Error
            ? `本地 OCR Worker 预热失败：${error.message}`
            : '本地 OCR Worker 预热失败',
        );
      });
  }

  async onModuleDestroy() {
    await this.localOcrWorker?.terminate();
    this.localOcrWorker = null;
    this.localOcrWorkerPromise = null;
  }

  /**
   * OCR 是手动解析链路的兜底能力：普通文本 PDF 先由 pdf-parse 提取。
   * 如果没有文本，就把 PDF 页面渲染为图片后走本地 OCR，不进入 MinerU。
   */
  async recognizePdf(
    context: DocumentParseContext,
  ): Promise<OcrRecognizeResult> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('OCR 识别缺少文件内容');
    }

    this.logger.debug('手动 PDF OCR 开始渲染 PDF 页面');
    const maxPages = await this.resolvePdfOcrMaxPages();
    const imageDataUrls = await this.renderPdfPages(
      context.file.buffer,
      maxPages,
    );
    this.logger.debug(
      `手动 PDF OCR 渲染完成，共 ${imageDataUrls.length} 页，配置最多 ${maxPages} 页，开始本地 OCR`,
    );
    return this.recognizeImagesWithLocalOcr(imageDataUrls, 'PDF');
  }

  async recognizeImage(
    context: DocumentParseContext,
  ): Promise<OcrRecognizeResult> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('图片 OCR 识别缺少文件内容');
    }

    this.logger.debug('手动图片 OCR 进入本地 OCR');
    return this.recognizeImageWithLocalOcr(context);
  }

  async buildVisionOcrImageDataUrls(context: DocumentParseContext) {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('视觉模型 OCR 缺少文件内容');
    }
    if (context.contentType === 'image') {
      const mimeType = context.file.mimeType || 'image/png';
      return [`data:${mimeType};base64,${context.file.buffer.toString('base64')}`];
    }
    if (context.contentType === 'pdf') {
      const maxPages = await this.resolvePdfOcrMaxPages();
      return this.renderPdfPages(context.file.buffer, maxPages);
    }
    throw new BadRequestException(
      '视觉模型 OCR 仅支持图片或 PDF，请在 OCR 配置中切换 MinerU，或选择手动解析',
    );
  }

  private async recognizeImageWithLocalOcr(
    context: DocumentParseContext,
  ): Promise<OcrRecognizeResult> {
    const file = context.file;
    if (!file?.buffer.length) {
      throw new BadRequestException('图片 OCR 识别缺少文件内容');
    }

    return this.recognizeImagesWithLocalOcr([file.buffer], '图片');
  }

  private async recognizeImagesWithLocalOcr(
    images: LocalOcrImage[],
    sourceLabel: string,
  ): Promise<OcrRecognizeResult> {
    try {
      const worker = await this.getLocalOcrWorker(sourceLabel);
      const texts: string[] = [];
      for (let index = 0; index < images.length; index += 1) {
        this.logger.debug(
          `本地${sourceLabel} OCR 开始识别第 ${index + 1}/${images.length} 张图`,
        );
        const result = await this.withTimeout(
          this.recognizeWithLocalWorker(worker, images[index]),
          this.localOcrRecognizeTimeoutMs,
          `本地${sourceLabel} OCR 识别第 ${index + 1} 张图超时`,
        );
        const text = result.data.text.trim();
        if (text) {
          texts.push(
            images.length > 1 ? `## 第 ${index + 1} 页\n${text}` : text,
          );
        }
      }
      const text = texts.join('\n\n').trim();
      if (!text) {
        throw new BadRequestException(`本地${sourceLabel} OCR 未识别到文本`);
      }
      return { text, engine: 'local-tesseract' };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error
          ? `本地${sourceLabel} OCR 识别失败：${error.message}`
          : `本地${sourceLabel} OCR 识别失败`,
      );
    }
  }

  private async getLocalOcrWorker(
    sourceLabel: string,
  ): Promise<LocalOcrWorker> {
    if (this.localOcrWorker) return this.localOcrWorker;
    if (this.localOcrWorkerPromise) return this.localOcrWorkerPromise;

    this.logger.debug(
      `本地${sourceLabel} OCR 初始化 Tesseract Worker，语言：${this.localOcrLanguages}`,
    );
    this.localOcrWorkerPromise = this.withTimeout(
      createWorker(
        this.localOcrLanguages,
        undefined,
        this.buildTesseractWorkerOptions(sourceLabel),
      ),
      this.localOcrInitTimeoutMs,
      `本地${sourceLabel} OCR 初始化超时，请检查 Tesseract 语言包是否可下载，或配置 TESSERACT_LANG_PATH 指向本地语言包目录`,
    )
      .then((worker) => {
        this.localOcrWorker = worker;
        return worker;
      })
      .catch((error) => {
        this.localOcrWorkerPromise = null;
        throw error;
      });

    return this.localOcrWorkerPromise;
  }

  private recognizeWithLocalWorker(
    worker: LocalOcrWorker,
    image: LocalOcrImage,
  ) {
    const task = this.localOcrRecognizeQueue.then(() =>
      worker.recognize(image),
    );
    this.localOcrRecognizeQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private buildTesseractWorkerOptions(
    sourceLabel: string,
  ): Partial<TesseractWorkerOptions> {
    const localLanguage = this.resolveLocalLanguagePackage();
    const options: Partial<TesseractWorkerOptions> = {
      logger: (message) => {
        const status = message.status || 'status';
        const progress =
          typeof message.progress === 'number'
            ? ` ${(message.progress * 100).toFixed(0)}%`
            : '';
        this.logger.debug(`本地${sourceLabel} OCR ${status}${progress}`);
      },
      errorHandler: (error) => {
        this.logger.error(
          `本地${sourceLabel} OCR Worker 错误：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    };
    if (localLanguage) {
      options.langPath = localLanguage.langPath;
      options.cachePath =
        process.env.TESSERACT_CACHE_PATH?.trim() || localLanguage.langPath;
      options.gzip = localLanguage.gzip;
      options.cacheMethod = 'readOnly';
      this.logger.debug(
        `本地${sourceLabel} OCR 使用本地语言包目录：${localLanguage.langPath}`,
      );
      return options;
    }

    if (!this.allowRemoteLanguageDownload) {
      throw new BadRequestException(
        `本地${sourceLabel} OCR 语言包缺失：${this.localOcrLanguages}。请将对应 .traineddata 文件放到 TESSERACT_LANG_PATH 目录，或设置 TESSERACT_LANGS=chi_sim 只启用中文简体`,
      );
    }

    return options;
  }

  private resolveLocalLanguagePackage() {
    const langPath = resolve(
      process.env.TESSERACT_LANG_PATH?.trim() || process.cwd(),
    );
    const langs = this.localOcrLanguages.split('+').filter(Boolean);
    const plainFiles = langs.map((lang) =>
      resolve(langPath, `${lang}.traineddata`),
    );
    const gzipFiles = langs.map((lang) =>
      resolve(langPath, `${lang}.traineddata.gz`),
    );
    const hasPlain = plainFiles.every((file) => existsSync(file));
    const hasGzip = gzipFiles.every((file) => existsSync(file));

    if (hasPlain) return { langPath, gzip: false };
    if (hasGzip) return { langPath, gzip: true };
    return null;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new BadRequestException(timeoutMessage)),
        timeoutMs,
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  private async resolvePdfOcrMaxPages() {
    const config = await this.chunkConfigsService.findDefaultManualConfig();
    return Math.max(1, Number(config.pdfOcrMaxPages || 8));
  }

  private async renderPdfPages(buffer: Buffer, maxPages: number) {
    const PDFParse = this.loadPdfParseClass();
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getScreenshot({
        first: maxPages,
        desiredWidth: 1600,
        imageDataUrl: true,
        imageBuffer: false,
      });
      const imageDataUrls = result.pages
        .map((page) => page.dataUrl)
        .filter((url): url is string => !!url);
      if (!imageDataUrls.length) {
        throw new BadRequestException('PDF OCR 图片渲染失败');
      }
      return imageDataUrls;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error
          ? `PDF OCR 图片渲染失败：${error.message}`
          : 'PDF OCR 图片渲染失败',
      );
    } finally {
      await parser.destroy?.();
    }
  }

  private loadPdfParseClass(): PdfParseClass {
    try {
      const requireFn = eval('require') as NodeRequire;
      const module = requireFn('pdf-parse') as PdfParseModule;
      if (typeof module.PDFParse === 'function') return module.PDFParse;
    } catch (error) {
      this.logger.debug(
        error instanceof Error
          ? `加载 pdf-parse PDFParse 失败：${error.message}`
          : '加载 pdf-parse PDFParse 失败',
      );
    }
    throw new BadRequestException(
      'PDF OCR 依赖 pdf-parse 的 PDFParse.getScreenshot 页面渲染能力，请确认已安装支持该能力的 pdf-parse 版本',
    );
  }
}
