import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentOcrService } from '../../document-ocr/document-ocr.service';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

type PdfParseResult = {
  text?: string;
};

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;
type PdfParseClass = new (options: { data: Buffer }) => {
  getText: () => Promise<PdfParseResult>;
  destroy?: () => Promise<void> | void;
};
type PdfParseModule =
  | PdfParseFn
  | {
      default?: PdfParseFn;
      PDFParse?: PdfParseClass;
    };

@Injectable()
export class PdfDocumentParser implements DocumentParser {
  constructor(private readonly documentOcrService: DocumentOcrService) {}

  supports(contentType: DocumentParseContentType) {
    return contentType === 'pdf';
  }

  async parse(context: DocumentParseContext): Promise<string> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('PDF 解析缺少文件内容');
    }

    const pdfParse = this.loadPdfParse();
    const result = await pdfParse(context.file.buffer);
    const text = this.normalizeText(result.text);
    if (text) return text;

    const ocrResult = this.documentOcrService.recognizePdf(context);
    return this.normalizeText(ocrResult.text);
  }

  private loadPdfParse(): PdfParseFn {
    try {
      // pdf-parse 是 CommonJS 包；用运行时加载可以避免类型声明影响构建。
      const requireFn = eval('require') as NodeRequire;
      const module = requireFn('pdf-parse') as PdfParseModule;
      const pdfParse = typeof module === 'function' ? module : module.default;
      if (pdfParse) {
        return pdfParse;
      }

      const PDFParse = typeof module === 'object' ? module.PDFParse : undefined;
      if (PDFParse) {
        return async (buffer) => {
          const parser = new PDFParse({ data: buffer });
          try {
            return await parser.getText();
          } finally {
            await parser.destroy?.();
          }
        };
      }
      throw new Error('pdf-parse parser not found');
    } catch {
      throw new BadRequestException(
        '手动 PDF 解析依赖 pdf-parse 未安装，请安装依赖后重试或选择 MinerU 解析',
      );
    }
  }

  private normalizeText(text?: string) {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
