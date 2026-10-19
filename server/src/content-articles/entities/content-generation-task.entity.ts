import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
export type ContentTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'needs_input'
  | 'failed'
  | 'interrupted'
  | 'adopted';
export interface ContentGenerationSnapshot {
  requestVersion?: number; // 首次记住生成偏好可能递增文章版本，重试仍绑定原请求版本。
  title: string;
  idea: string;
  template: { id: number | null; name: string; instruction: string };
  config: {
    id: number;
    name: string;
    providerId: number;
    providerName: string;
    model: string;
    temperature: number;
    thinkingParameters: Record<string, unknown> | null;
    systemPrompt: string;
    responseFormat?: 'text' | 'markdown'; // 历史快照无此项，按 Markdown 处理。
  };
}
@Entity('content_generation_tasks')
@Index('UQ_content_task_request', ['userId', 'requestId'], { unique: true })
@Index('IDX_content_task_article', ['userId', 'articleId', 'id'])
@Index('IDX_content_task_queue', ['status', 'id'])
export class ContentGenerationTask extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'int' }) articleId: number;
  @Column({ type: 'int' }) articleVersion: number;
  @Column({ type: 'varchar', length: 36 }) requestId: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ContentTaskStatus;
  @Index('UQ_content_task_active_article', { unique: true })
  @Column({ type: 'int', nullable: true })
  activeArticleId: number | null;
  @Index('UQ_content_task_active_user', { unique: true })
  @Column({ type: 'int', nullable: true })
  activeUserId: number | null;
  @Column({ type: 'json' }) snapshot: ContentGenerationSnapshot;
  @Column({ type: 'mediumtext', nullable: true }) result: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) generatedTitle:
    | string
    | null;
  @Column({ type: 'json', nullable: true }) editorNotes: string[] | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) errorMessage:
    | string
    | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) workerId:
    | string
    | null;
  @Column({ type: 'datetime', nullable: true }) leaseExpiresAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
  @Column({ type: 'int', nullable: true }) totalTokens: number | null;
}
