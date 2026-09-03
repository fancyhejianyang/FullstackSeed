import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaveDocumentParseRuleDto } from './dto/document-parse-rule.dto';
import { DocumentParseRule } from './entities/document-parse-rule.entity';

export interface TextParsePart {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

@Injectable()
export class DocumentParseRulesService implements OnModuleInit {
  constructor(
    @InjectRepository(DocumentParseRule)
    private readonly ruleRepository: Repository<DocumentParseRule>,
  ) {}

  async onModuleInit() {
    const existing = await this.ruleRepository.findOne({ order: { id: 'ASC' } });
    if (existing) return;
    await this.ruleRepository.save(
      this.ruleRepository.create({
        name: '系统默认文档解析规则',
        textMaxSizeMb: 1,
        textMaxLines: 5000,
        pdfPagesPerPart: 10,
        wordParagraphsPerPart: 200,
        preferSentenceBoundary: true,
        isEnabled: true,
      }),
    );
  }

  async findCurrent() {
    const rule = await this.findCurrentEntity();
    return this.toView(rule);
  }

  async saveCurrent(dto: SaveDocumentParseRuleDto) {
    const rule = await this.findCurrentEntity();
    Object.assign(rule, this.toPayload(dto));
    this.assertValid(rule);
    return this.toView(await this.ruleRepository.save(rule));
  }

  async getActiveRule() {
    const rule = await this.ruleRepository.findOne({
      where: { isEnabled: true },
      order: { id: 'DESC' },
    });
    if (!rule) throw new BadRequestException('请先启用文档解析规则');
    return rule;
  }

  /**
   * 将大文本切成可独立送入解析模型的片段。
   * 目标大小和行数只负责触发切分，真正的切点优先落在句末或段落末尾。
   */
  async splitText(
    content: string,
    contentType: 'text' | 'word' = 'text',
  ): Promise<TextParsePart[]> {
    const rule = await this.getActiveRule();
    return this.splitTextByRule(
      content,
      rule,
      contentType === 'word' ? rule.wordParagraphsPerPart : rule.textMaxLines,
    );
  }

  splitTextByRule(
    content: string,
    rule: DocumentParseRule,
    maxLines = rule.textMaxLines,
  ): TextParsePart[] {
    const normalized = content.replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];

    const maxBytes = rule.textMaxSizeMb * 1024 * 1024;
    const lines = normalized.split('\n');
    const parts: TextParsePart[] = [];
    let current: string[] = [];
    let currentBytes = 0;
    let currentLines = 0;
    let offset = 0;

    const flush = () => {
      const value = current.join('\n').trim();
      if (!value) return;
      const endOffset = offset + value.length;
      parts.push({
        index: parts.length,
        content: value,
        startOffset: Math.max(0, endOffset - value.length),
        endOffset,
      });
      current = [];
      currentBytes = 0;
      currentLines = 0;
    };

    for (const line of lines) {
      const lineBytes = Buffer.byteLength(line, 'utf8');
      const exceeds =
        current.length > 0 &&
        (currentBytes + lineBytes + 1 > maxBytes ||
          currentLines + 1 > maxLines);
      if (exceeds) flush();

      if (lineBytes > maxBytes) {
        flush();
        const lineParts = this.splitLongLine(line, maxBytes, rule.preferSentenceBoundary);
        for (const linePart of lineParts) {
          parts.push({
            index: parts.length,
            content: linePart,
            startOffset: offset,
            endOffset: offset + linePart.length,
          });
          offset += linePart.length;
        }
        offset += 1;
        continue;
      }

      current.push(line);
      currentBytes += lineBytes + (current.length > 1 ? 1 : 0);
      currentLines += 1;
      offset += line.length + 1;
    }
    flush();
    return parts.length ? parts : [{ index: 0, content: normalized, startOffset: 0, endOffset: normalized.length }];
  }

  private splitLongLine(value: string, maxBytes: number, preferBoundary: boolean) {
    const result: string[] = [];
    let rest = value.trim();
    while (rest) {
      let end = this.findByteSafeEnd(rest, maxBytes);
      if (preferBoundary) {
        const boundary = this.findBoundary(rest.slice(0, end));
        if (boundary > 0) end = boundary;
      }
      result.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    return result;
  }

  private findByteSafeEnd(value: string, maxBytes: number) {
    let bytes = 0;
    let end = 0;
    for (const char of value) {
      const charBytes = Buffer.byteLength(char, 'utf8');
      if (bytes + charBytes > maxBytes) break;
      bytes += charBytes;
      end += char.length;
    }
    return Math.max(1, end);
  }

  private findBoundary(value: string) {
    const matches = [...value.matchAll(/[。！？!?；;](?:[”"』》）)】」』])?|\n{2,}|[.!?](?=\s|$)/g)];
    const last = matches.at(-1);
    return last?.index === undefined ? 0 : last.index + last[0].length;
  }

  private async findCurrentEntity() {
    const rule = await this.ruleRepository.findOne({ order: { id: 'ASC' } });
    if (!rule) throw new BadRequestException('文档解析规则不存在');
    return rule;
  }

  private toPayload(dto: SaveDocumentParseRuleDto): Partial<DocumentParseRule> {
    const payload: Partial<DocumentParseRule> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.textMaxSizeMb !== undefined) payload.textMaxSizeMb = dto.textMaxSizeMb;
    if (dto.textMaxLines !== undefined) payload.textMaxLines = dto.textMaxLines;
    if (dto.pdfPagesPerPart !== undefined) payload.pdfPagesPerPart = dto.pdfPagesPerPart;
    if (dto.wordParagraphsPerPart !== undefined) {
      payload.wordParagraphsPerPart = dto.wordParagraphsPerPart;
    }
    if (dto.preferSentenceBoundary !== undefined) {
      payload.preferSentenceBoundary = dto.preferSentenceBoundary;
    }
    if (dto.isEnabled !== undefined) payload.isEnabled = dto.isEnabled;
    return payload;
  }

  private assertValid(rule: DocumentParseRule) {
    if (!rule.name.trim()) throw new BadRequestException('文档解析规则名称不能为空');
    if (rule.textMaxSizeMb < 1 || rule.textMaxLines < 100) {
      throw new BadRequestException('文本拆分参数不合法');
    }
    if (rule.pdfPagesPerPart < 1 || rule.wordParagraphsPerPart < 10) {
      throw new BadRequestException('PDF 或 Word 拆分参数不合法');
    }
  }

  private toView(rule: DocumentParseRule) {
    return {
      id: rule.id,
      name: rule.name,
      textMaxSizeMb: rule.textMaxSizeMb,
      textMaxLines: rule.textMaxLines,
      pdfPagesPerPart: rule.pdfPagesPerPart,
      wordParagraphsPerPart: rule.wordParagraphsPerPart,
      preferSentenceBoundary: !!rule.preferSentenceBoundary,
      isEnabled: !!rule.isEnabled,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
