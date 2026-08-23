import { BadRequestException, Injectable } from '@nestjs/common';
import { ChromaClient, type Collection, type Metadata, type Where } from 'chromadb';

export interface KnowledgeVectorUpsertItem {
  id: string;
  embedding: number[];
  document: string;
  metadata: Metadata;
}

export interface KnowledgeVectorSearchResult {
  id: string;
  document: string;
  metadata: Metadata;
  score: number;
}

@Injectable()
export class KnowledgeVectorService {
  private client: ChromaClient | null = null;
  private collectionPromise: Promise<Collection> | null = null;

  async upsertChunks(items: KnowledgeVectorUpsertItem[]) {
    if (!items.length) return;
    const collection = await this.getCollection();
    try {
      await collection.upsert({
        ids: items.map((item) => item.id),
        embeddings: items.map((item) => item.embedding),
        documents: items.map((item) => item.document),
        metadatas: items.map((item) => this.cleanMetadata(item.metadata)),
      });
    } catch (error) {
      throw new BadRequestException(
        `Chroma 向量写入失败：${this.getErrorMessage(error)}`,
      );
    }
  }

  async deleteChunks(vectorIds: string[]) {
    const ids = Array.from(new Set(vectorIds.filter(Boolean)));
    if (!ids.length) return;
    const collection = await this.getCollection();
    try {
      await collection.delete({ ids });
    } catch (error) {
      throw new BadRequestException(
        `Chroma 向量删除失败：${this.getErrorMessage(error)}`,
      );
    }
  }

  async search(options: {
    embedding: number[];
    topK: number;
    where?: Where;
  }): Promise<KnowledgeVectorSearchResult[]> {
    const collection = await this.getCollection();
    try {
      const result = await collection.query<Metadata>({
        queryEmbeddings: [options.embedding],
        nResults: Math.max(1, options.topK),
        where: options.where,
        include: ['documents', 'metadatas', 'distances'],
      });
      return result.rows()[0]?.map((row) => ({
        id: row.id,
        document: row.document ?? '',
        metadata: row.metadata ?? {},
        score: this.distanceToScore(row.distance),
      })) ?? [];
    } catch (error) {
      throw new BadRequestException(
        `Chroma 向量检索失败：${this.getErrorMessage(error)}`,
      );
    }
  }

  private async getCollection() {
    if (!this.collectionPromise) {
      this.collectionPromise = this.getClient().getOrCreateCollection({
        name: process.env.CHROMA_COLLECTION || 'knowledge_chunks',
        metadata: {
          source: 'FullstackSeed',
          purpose: 'knowledge-base',
        },
      });
    }
    return this.collectionPromise;
  }

  private getClient() {
    if (this.client) return this.client;
    const url = this.parseChromaUrl(process.env.CHROMA_URL || 'http://localhost:8000');
    const headers = process.env.CHROMA_TOKEN
      ? { Authorization: `Bearer ${process.env.CHROMA_TOKEN}` }
      : undefined;
    this.client = new ChromaClient({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      ssl: url.protocol === 'https:',
      tenant: process.env.CHROMA_TENANT || 'default_tenant',
      database: process.env.CHROMA_DATABASE || 'default_database',
      headers,
    });
    return this.client;
  }

  private parseChromaUrl(value: string) {
    try {
      return new URL(value);
    } catch {
      throw new BadRequestException('CHROMA_URL 配置不是合法 URL');
    }
  }

  private cleanMetadata(metadata: Metadata): Metadata {
    return Object.entries(metadata).reduce<Metadata>((result, [key, value]) => {
      if (value === undefined || value === null) return result;
      result[key] = value;
      return result;
    }, {});
  }

  private distanceToScore(distance?: number | null) {
    if (typeof distance !== 'number' || Number.isNaN(distance)) return 0;
    return 1 / (1 + Math.max(0, distance));
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
