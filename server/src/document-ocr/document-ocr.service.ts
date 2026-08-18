import { BadRequestException, Injectable } from '@nestjs/common';
import { type DocumentParseContext } from '../document-parsers/types';

export interface OcrRecognizeResult {
  text: string;
  engine: 'qwen-vision';
}

@Injectable()
export class DocumentOcrService {
  /**
   * OCR 是手动解析链路的兜底能力：普通文本 PDF 先由 pdf-parse 提取；
   * 如果没有提取到文本，通常说明文件是扫描件或图片型 PDF。
   *
   * 后续接入 Qwen VL/其它视觉模型时，只需要在这里完成：
   * 1. 将 PDF 页面转成图片；
   * 2. 调用已启用的大模型视觉账号；
   * 3. 返回识别后的 Markdown/纯文本。
   */
  recognizePdf(context: DocumentParseContext): OcrRecognizeResult {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('OCR 识别缺少文件内容');
    }

    throw new BadRequestException(
      'PDF 未提取到文本，疑似扫描件；手动 OCR 服务已预留，请接入 Qwen 视觉模型或选择 MinerU 解析',
    );
  }
}
