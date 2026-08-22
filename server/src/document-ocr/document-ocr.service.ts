import { BadRequestException, Injectable } from '@nestjs/common';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { type DocumentParseContext } from '../document-parsers/types';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';

export interface OcrRecognizeResult {
  text: string;
  engine: 'mineru' | 'vision-model';
}

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
export class DocumentOcrService {
  constructor(
    private readonly aiFeatureConfigsService: AiFeatureConfigsService,
    private readonly knowledgeAiProvidersService: KnowledgeAiProvidersService,
    private readonly mineruConfigsService: MineruConfigsService,
  ) {}

  /**
   * OCR 是手动解析链路的兜底能力：普通文本 PDF 先由 pdf-parse 提取。
   * 如果没有文本，就读取启用的 OCR 功能配置，按配置选择 MinerU 或视觉模型。
   */
  async recognizePdf(context: DocumentParseContext): Promise<OcrRecognizeResult> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('OCR 识别缺少文件内容');
    }

    const config = await this.aiFeatureConfigsService.findEnabledByFeature('ocr');
    if (!config) {
      throw new BadRequestException('PDF 未提取到文本，请先配置并启用 OCR 功能配置');
    }

    return config.useMineru
      ? this.recognizePdfWithMineru(context, config)
      : this.recognizePdfWithVisionModel(context, config);
  }

  async recognizeImage(context: DocumentParseContext): Promise<OcrRecognizeResult> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('图片 OCR 识别缺少文件内容');
    }

    const config = await this.aiFeatureConfigsService.findEnabledByFeature('ocr');
    if (!config) {
      throw new BadRequestException('请先配置并启用 OCR 功能配置');
    }

    return config.useMineru
      ? this.recognizeImageWithMineru(context, config)
      : this.recognizeImageWithVisionModel(context, config);
  }

  private async recognizePdfWithMineru(
    context: DocumentParseContext,
    config: AiFeatureConfig,
  ): Promise<OcrRecognizeResult> {
    if (!context.fileUrl) {
      throw new BadRequestException('MinerU OCR 需要文件访问地址');
    }
    if (!config.mineruConfigId) {
      throw new BadRequestException('OCR 功能配置缺少 MinerU 配置');
    }
    const task = await this.mineruConfigsService.createParseTask(
      context.fileUrl,
      context.fileName || context.file?.fileName,
      config.mineruConfigId,
    );
    const result = await this.mineruConfigsService.waitForSuccess(
      task.taskId,
      task.configId,
    );
    const text = result.markdown.trim();
    if (!text) {
      throw new BadRequestException('MinerU OCR 未返回识别文本');
    }
    return { text, engine: 'mineru' };
  }

  private async recognizePdfWithVisionModel(
    context: DocumentParseContext,
    config: AiFeatureConfig,
  ): Promise<OcrRecognizeResult> {
    if (!config.providerId || !config.model) {
      throw new BadRequestException('OCR 功能配置缺少大模型账号或视觉模型');
    }
    const file = context.file;
    if (!file?.buffer.length) {
      throw new BadRequestException('OCR 识别缺少文件内容');
    }
    const imageDataUrls = await this.renderPdfPages(file.buffer);
    const target = await this.knowledgeAiProvidersService.resolveVisionTarget({
      id: config.providerId,
      model: config.model,
    });
    const result = await this.knowledgeAiProvidersService.callVisionOcr({
      target,
      imageDataUrls,
      systemPrompt: this.buildSystemPrompt(config),
    });
    if (!result.isSuccess || !result.answer.trim()) {
      throw new BadRequestException(result.errorMessage || '视觉模型 OCR 未返回识别文本');
    }
    return { text: result.answer.trim(), engine: 'vision-model' };
  }

  private async recognizeImageWithMineru(
    context: DocumentParseContext,
    config: AiFeatureConfig,
  ): Promise<OcrRecognizeResult> {
    if (!context.fileUrl) {
      throw new BadRequestException('MinerU 图片 OCR 需要文件访问地址');
    }
    if (!config.mineruConfigId) {
      throw new BadRequestException('OCR 功能配置缺少 MinerU 配置');
    }
    const task = await this.mineruConfigsService.createParseTask(
      context.fileUrl,
      context.fileName || context.file?.fileName,
      config.mineruConfigId,
    );
    const result = await this.mineruConfigsService.waitForSuccess(
      task.taskId,
      task.configId,
    );
    const text = result.markdown.trim();
    if (!text) {
      throw new BadRequestException('MinerU 图片 OCR 未返回识别文本');
    }
    return { text, engine: 'mineru' };
  }

  private async recognizeImageWithVisionModel(
    context: DocumentParseContext,
    config: AiFeatureConfig,
  ): Promise<OcrRecognizeResult> {
    if (!config.providerId || !config.model) {
      throw new BadRequestException('OCR 功能配置缺少大模型账号或视觉模型');
    }
    const file = context.file;
    if (!file?.buffer.length) {
      throw new BadRequestException('图片 OCR 识别缺少文件内容');
    }
    const target = await this.knowledgeAiProvidersService.resolveVisionTarget({
      id: config.providerId,
      model: config.model,
    });
    const result = await this.knowledgeAiProvidersService.callVisionOcr({
      target,
      imageDataUrls: [this.toImageDataUrl(file.buffer, file.mimeType, file.fileName)],
      systemPrompt: this.buildSystemPrompt(config),
    });
    if (!result.isSuccess || !result.answer.trim()) {
      throw new BadRequestException(result.errorMessage || '视觉模型 OCR 未返回识别文本');
    }
    return { text: result.answer.trim(), engine: 'vision-model' };
  }

  private async renderPdfPages(buffer: Buffer) {
    const PDFParse = this.loadPdfParseClass();
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getScreenshot({
        first: 8,
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
        error instanceof Error ? `PDF OCR 图片渲染失败：${error.message}` : 'PDF OCR 图片渲染失败',
      );
    } finally {
      await parser.destroy?.();
    }
  }

  private loadPdfParseClass(): PdfParseClass {
    try {
      const requireFn = eval('require') as NodeRequire;
      const module = requireFn('pdf-parse') as PdfParseModule;
      if (module.PDFParse) return module.PDFParse;
    } catch {
      // 由下方统一抛业务异常。
    }
    throw new BadRequestException('PDF OCR 依赖 pdf-parse 未安装或不支持页面渲染');
  }

  private buildSystemPrompt(config: AiFeatureConfig) {
    return [config.systemPrompt, config.rules]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  private toImageDataUrl(buffer: Buffer, mimeType?: string, fileName?: string) {
    const mime = this.resolveImageMimeType(mimeType, fileName);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private resolveImageMimeType(mimeType?: string, fileName?: string) {
    if (mimeType?.startsWith('image/')) return mimeType;
    const lowerName = (fileName || '').toLowerCase();
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.bmp')) return 'image/bmp';
    return 'image/jpeg';
  }
}
