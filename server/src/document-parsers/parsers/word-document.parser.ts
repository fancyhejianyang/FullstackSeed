import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

type WordExtractorDocument = {
  getBody: () => string;
};

type WordExtractorClass = new () => {
  extract: (source: Buffer) => Promise<WordExtractorDocument>;
};

@Injectable()
export class WordDocumentParser implements DocumentParser {
  supports(contentType: DocumentParseContentType) {
    return contentType === 'word';
  }

  async parse(context: DocumentParseContext): Promise<string> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('Word 解析缺少文件内容');
    }
    if (this.isDoc(context.file.fileName)) {
      return this.parseLegacyDoc(context.file.buffer);
    }
    if (!this.isDocx(context.file.fileName)) {
      throw new BadRequestException(
        '手动 Word 解析仅支持 .doc 或 .docx 文件',
      );
    }
    const mammoth = this.loadMammoth();
    const [rawResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer: context.file.buffer }),
      mammoth.convertToHtml({ buffer: context.file.buffer }),
    ]);
    const text =
      this.normalizeText(this.convertHtmlToLinkedText(htmlResult.value)) ||
      this.normalizeText(rawResult.value);
    if (!text) {
      throw new BadRequestException('Word 文档未提取到正文内容');
    }
    return text;
  }

  private isDocx(fileName?: string | null) {
    return (fileName || '').toLowerCase().endsWith('.docx');
  }

  private isDoc(fileName?: string | null) {
    return (fileName || '').toLowerCase().endsWith('.doc');
  }

  private async parseLegacyDoc(buffer: Buffer) {
    const WordExtractor = this.loadWordExtractor();
    let result: WordExtractorDocument;
    try {
      result = await new WordExtractor().extract(buffer);
    } catch {
      throw new BadRequestException(
        '手动 Word 解析失败，无法读取 .doc 文件内容',
      );
    }
    const text = this.normalizeText(result.getBody());
    if (!text) {
      throw new BadRequestException('Word 文档未提取到正文内容');
    }
    return text;
  }

  private loadMammoth(): {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  } {
    try {
      const requireFn = eval('require') as NodeRequire;
      return requireFn('mammoth') as {
        extractRawText: (input: {
          buffer: Buffer;
        }) => Promise<{ value: string }>;
        convertToHtml: (input: {
          buffer: Buffer;
        }) => Promise<{ value: string }>;
      };
    } catch {
      throw new BadRequestException(
        '手动 Word 解析依赖 mammoth 未安装，请安装依赖后重试',
      );
    }
  }

  private loadWordExtractor(): WordExtractorClass {
    try {
      // word-extractor 没有内置 TypeScript 类型，运行时加载可保持解析器模块解耦。
      const requireFn = eval('require') as NodeRequire;
      return requireFn('word-extractor') as WordExtractorClass;
    } catch {
      throw new BadRequestException(
        '手动 .doc 解析依赖 word-extractor 未安装，请安装依赖后重试',
      );
    }
  }

  private convertHtmlToLinkedText(html?: string) {
    if (!html) return '';
    const withLinks = html.replace(
      /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote: string, href: string, label: string) => {
        const text = this.decodeHtml(this.stripTags(label)).trim();
        const link = this.cleanHref(href);
        if (!text) return link ? `（链接：${link}）` : '';
        return link ? `${text}（链接：${link}）` : text;
      },
    );
    return this.decodeHtml(
      withLinks
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- ')
        .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
  }

  private stripTags(text: string) {
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '');
  }

  private decodeHtml(text: string) {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_match, code: string) =>
        String.fromCharCode(Number(code)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
        String.fromCharCode(parseInt(code, 16)),
      );
  }

  private cleanHref(href: string) {
    const decoded = this.decodeHtml(href).trim();
    const match = decoded.match(/https?:\/\/[^\s"'<>）)]+/i);
    const link = match?.[0] || decoded;
    return link.replace(/[，。,.;；]+$/g, '').trim();
  }

  private normalizeText(text?: string) {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
