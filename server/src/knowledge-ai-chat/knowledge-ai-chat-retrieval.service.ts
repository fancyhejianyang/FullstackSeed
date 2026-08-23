import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { KnowledgeBaseChunk } from '../knowledge-bases/entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfigsService } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.service';
import { KnowledgeEmbeddingService } from '../knowledge-vectors/knowledge-embedding.service';
import { KnowledgeVectorService } from '../knowledge-vectors/knowledge-vector.service';

interface RetrievalCandidate {
  key: string;
  title: string;
  content: string;
  sourceName: string;
  hitKeywords: string;
  colloquialDescription: string;
  matchPriority: number;
  score: number;
}

@Injectable()
export class KnowledgeAiChatRetrievalService {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseDocument)
    private readonly documentRepository: Repository<KnowledgeBaseDocument>,
    @InjectRepository(KnowledgeBaseChunk)
    private readonly chunkRepository: Repository<KnowledgeBaseChunk>,
    private readonly retrievalConfigsService: KnowledgeRetrievalConfigsService,
    private readonly embeddingService: KnowledgeEmbeddingService,
    private readonly vectorService: KnowledgeVectorService,
  ) {}

  async buildReferenceContext(question: string, configId?: number | null) {
    if (!configId) return '';

    const config = await this.retrievalConfigsService.findUsableConfig(configId);
    const baseIds = await this.resolveKnowledgeBaseIds(
      config.knowledgeBaseIds ?? [],
      config.categoryIds ?? [],
    );
    if (!baseIds.length) return '';

    const retrievalMode = config.retrievalMode || 'hybrid';
    const textWeight = Number(config.textWeight ?? 0.8);
    const vectorWeight = Number(config.vectorWeight ?? 1);
    const textScored =
      retrievalMode === 'vector'
        ? []
        : (await this.findCandidates(baseIds)).map((candidate) => ({
            ...candidate,
            score:
              this.scoreCandidate(
                candidate,
                this.buildSearchTerms(question),
                question,
              ) * textWeight,
          }));
    const vectorScored =
      retrievalMode === 'fullText'
        ? []
        : await this.findVectorCandidates(
            question,
            baseIds,
            config.topK || 10,
            vectorWeight,
          );

    const scored = this.mergeCandidates(textScored, vectorScored)
      .filter((candidate) => candidate.score >= Number(config.minScore ?? 0))
      .sort((a, b) => b.score - a.score || b.matchPriority - a.matchPriority)
      .slice(0, config.topK || 10);

    if (!scored.length) return '';

    return scored
      .map((candidate, index) => {
        const source = candidate.sourceName ? `来源：${candidate.sourceName}\n` : '';
        return [
          `[${index + 1}] ${candidate.title}`,
          source,
          this.truncate(candidate.content, 900),
        ]
        .filter(Boolean)
        .join('\n');
      })
      .join('\n\n');
  }

  private mergeCandidates(
    textCandidates: RetrievalCandidate[],
    vectorCandidates: RetrievalCandidate[],
  ) {
    const map = new Map<string, RetrievalCandidate>();
    for (const candidate of [...textCandidates, ...vectorCandidates]) {
      const current = map.get(candidate.key);
      if (!current) {
        map.set(candidate.key, { ...candidate });
        continue;
      }
      current.score += candidate.score;
      current.matchPriority = Math.max(
        current.matchPriority,
        candidate.matchPriority,
      );
      if (candidate.content.length > current.content.length) {
        current.content = candidate.content;
      }
    }
    return Array.from(map.values());
  }

  private async resolveKnowledgeBaseIds(
    selectedBaseIds: number[],
    selectedCategoryIds: number[],
  ) {
    const qb = this.knowledgeBaseRepository
      .createQueryBuilder('base')
      .where('base.isEnabled = :enabled', { enabled: true });

    if (selectedBaseIds.length || selectedCategoryIds.length) {
      qb.andWhere(
        new Brackets((scope) => {
          if (selectedBaseIds.length) {
            scope.orWhere('base.id IN (:...selectedBaseIds)', {
              selectedBaseIds,
            });
          }
          if (selectedCategoryIds.length) {
            scope.orWhere('base.categoryId IN (:...selectedCategoryIds)', {
              selectedCategoryIds,
            });
          }
        }),
      );
    }

    const bases = await qb.getMany();
    return bases.map((item) => item.id);
  }

  private async findCandidates(baseIds: number[]) {
    const [documents, chunks, bases] = await Promise.all([
      this.documentRepository.find({
        where: { knowledgeBaseId: In(baseIds) },
        order: { matchPriority: 'DESC', id: 'ASC' },
        take: 1000,
      }),
      this.chunkRepository.find({
        where: { knowledgeBaseId: In(baseIds) },
        order: { sort: 'ASC', chunkIndex: 'ASC' },
        take: 1500,
      }),
      this.knowledgeBaseRepository.find({
        where: { id: In(baseIds) },
        order: { matchPriority: 'DESC', id: 'ASC' },
      }),
    ]);
    const documentMap = new Map(documents.map((item) => [item.id, item]));
    const baseMap = new Map(bases.map((item) => [item.id, item]));

    if (chunks.length) {
      return chunks
        .map((chunk) => {
          const document = documentMap.get(chunk.documentId);
          const base = baseMap.get(chunk.knowledgeBaseId);
          return this.toCandidate({
            key: `chunk:${chunk.id}`,
            title: chunk.title || document?.title || base?.name || '知识片段',
            content: chunk.content,
            sourceName: document?.sourceName || base?.name || '',
            hitKeywords: document?.hitKeywords || base?.hitKeywords || '',
            colloquialDescription:
              document?.colloquialDescription ||
              base?.colloquialDescription ||
              '',
            matchPriority:
              document?.matchPriority ?? base?.matchPriority ?? chunk.sort ?? 0,
          });
        })
        .filter((item): item is RetrievalCandidate => Boolean(item));
    }

    const documentCandidates = documents
      .map((document) =>
        this.toCandidate({
          key: `document:${document.id}`,
          title: document.title,
          content: document.content || '',
          sourceName: document.sourceName,
          hitKeywords: document.hitKeywords || '',
          colloquialDescription: document.colloquialDescription || '',
          matchPriority: document.matchPriority,
        }),
      )
      .filter((item): item is RetrievalCandidate => Boolean(item));
    const baseCandidates = bases
      .map((base) =>
        this.toCandidate({
          key: `base:${base.id}`,
          title: base.name,
          content: base.contentText || '',
          sourceName: base.name,
          hitKeywords: base.hitKeywords || '',
          colloquialDescription: base.colloquialDescription || '',
          matchPriority: base.matchPriority,
        }),
      )
      .filter((item): item is RetrievalCandidate => Boolean(item));

    return [...documentCandidates, ...baseCandidates];
  }

  private async findVectorCandidates(
    question: string,
    baseIds: number[],
    topK: number,
    vectorWeight: number,
  ) {
    try {
      const embedding = await this.embeddingService.embedQuery(question);
      const results = await this.vectorService.search({
        embedding,
        topK,
        where: { knowledgeBaseId: { $in: baseIds } },
      });
      return results
        .map((item) => {
          const metadata = item.metadata ?? {};
          return this.toCandidate({
            key: `chunk:${Number(metadata.chunkId || 0)}`,
            title: String(metadata.title || '知识片段'),
            content: item.document || '',
            sourceName: String(metadata.sourceName || ''),
            hitKeywords: String(metadata.hitKeywords || ''),
            colloquialDescription: String(metadata.colloquialDescription || ''),
            matchPriority: Number(metadata.matchPriority || 0),
            score:
              item.score * 10 * vectorWeight +
              Number(metadata.matchPriority || 0) * 0.2,
          });
        })
        .filter((item): item is RetrievalCandidate => Boolean(item));
    } catch {
      return [];
    }
  }

  private toCandidate(
    input: Omit<RetrievalCandidate, 'score'> & { score?: number },
  ) {
    const content = input.content.trim();
    if (!content) return null;
    return { ...input, content, score: input.score ?? 0 };
  }

  private buildSearchTerms(question: string) {
    const normalized = question.toLowerCase().trim();
    const terms = new Set<string>();
    for (const item of normalized.match(/[a-z0-9_]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? []) {
      terms.add(item);
      if (/^[\u4e00-\u9fa5]+$/.test(item) && item.length > 2) {
        for (let index = 0; index < item.length - 1 && index < 30; index += 1) {
          terms.add(item.slice(index, index + 2));
        }
      }
    }
    return Array.from(terms);
  }

  private scoreCandidate(
    candidate: RetrievalCandidate,
    terms: string[],
    question: string,
  ) {
    const title = candidate.title.toLowerCase();
    const content = candidate.content.toLowerCase();
    const keywords = candidate.hitKeywords.toLowerCase();
    const colloquial = candidate.colloquialDescription.toLowerCase();
    const normalizedQuestion = question.toLowerCase().trim();
    let score = Math.max(0, candidate.matchPriority) * 0.2;

    if (normalizedQuestion && content.includes(normalizedQuestion)) score += 8;
    for (const term of terms) {
      if (title.includes(term)) score += 4;
      if (keywords.includes(term)) score += 5;
      if (colloquial.includes(term)) score += 3;
      if (content.includes(term)) score += 1;
    }
    return score;
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
}
