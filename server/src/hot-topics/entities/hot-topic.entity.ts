import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  HotPreferenceInput,
  HotRunStatus,
  HotSourceAccess,
  HotSourceKind,
  HotSourceOutcome,
  HotTopicCandidate,
  HotTopicDecision,
  HotTopicMode,
} from '../hot-topic.types';

@Entity('hot_topic_sources')
export class HotTopicSource extends BaseEntity {
  @Column({ length: 120 }) name: string;
  @Column({ type: 'varchar', length: 30 }) kind: HotSourceKind;
  @Column({ type: 'varchar', length: 20 }) accessMode: HotSourceAccess;
  @Column({ length: 2048 }) url: string;
  @Column({ length: 120, default: '' }) accountName: string;
  @Column({ length: 160, default: '' }) accountId: string;
  @Column({ type: 'text', nullable: true, select: false }) apiToken:
    | string
    | null;
  @Column({ type: 'boolean', default: false }) isEnabled: boolean;
  @Column({ length: 2000, default: '' }) description: string;
}

@Entity('hot_topic_preferences')
export class HotTopicPreference
  extends BaseEntity
  implements HotPreferenceInput
{
  @Index({ unique: true }) @Column({ type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 20, default: 'aiSearch' })
  mode: HotTopicMode;
  @Column({ type: 'int', nullable: true }) aiConfigId: number | null;
  @Column({ type: 'simple-json' }) sourceIds: number[];
  @Column({ type: 'text' }) interests: string;
  @Column({ type: 'text' }) exclusions: string;
  @Column({ length: 1000, default: '' }) audience: string;
  @Column({ length: 1000, default: '' }) writingStyle: string;
  @Column({ type: 'int', default: 24 }) lookbackHours: number;
  @Column({ type: 'int', default: 10 }) maxResults: number;
  @Column({ type: 'boolean', default: false }) scheduleEnabled: boolean;
  @Column({ length: 5, default: '08:30' }) scheduleTime: string;
  @Column({ length: 40, default: 'Asia/Shanghai' }) timeZone: string;
  @Column({ type: 'datetime', nullable: true }) nextRunAt: Date | null;
}

@Entity('hot_topic_runs')
@Index(['userId', 'requestId'], { unique: true })
export class HotTopicRun extends BaseEntity {
  @Index() @Column({ type: 'int' }) userId: number;
  @Column({ length: 100 }) requestId: string;
  @Index({ unique: true })
  @Column({ type: 'int', nullable: true })
  activeUserId: number | null;
  @Column({ type: 'varchar', length: 20 }) action: 'discover' | 'recommend';
  @Column({ type: 'varchar', length: 20, default: 'manual' }) trigger:
    | 'manual'
    | 'schedule';
  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: HotRunStatus;
  @Column({ length: 30, default: 'queued' }) stage: string;
  @Column({ type: 'simple-json' }) preferences: HotPreferenceInput;
  @Column({ type: 'simple-json', nullable: true }) sources:
    | HotSourceOutcome[]
    | null;
  @Column({ type: 'boolean', default: false }) searchExecuted: boolean;
  @Column({ type: 'int', default: 0 }) candidateCount: number;
  @Column({ type: 'int', default: 0 }) topicCount: number;
  @Column({ type: 'int', nullable: true }) totalTokens: number | null;
  @Column({ length: 2000, default: '' }) message: string;
  @Column({ type: 'text', nullable: true }) errorMessage: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) workerId:
    | string
    | null;
  @Column({ type: 'datetime', nullable: true }) leaseExpiresAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
}

@Entity('hot_topics')
@Index(['userId', 'urlHash'], { unique: true })
export class HotTopic extends BaseEntity {
  @Index() @Column({ type: 'int' }) userId: number;
  @Column({ length: 64 }) urlHash: string;
  @Column({ length: 500 }) title: string;
  @Column({ type: 'text' }) summary: string;
  @Column({ length: 2048 }) url: string;
  @Column({ length: 120 }) sourceName: string;
  @Column({ type: 'int', nullable: true }) sourceId: number | null;
  @Column({ length: 40 }) platform: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) accountName:
    | string
    | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) accountId:
    | string
    | null;
  @Column({ type: 'boolean', default: false }) accountMatched: boolean;
  @Column({ type: 'int', nullable: true }) rank: number | null;
  @Column({ type: 'double', nullable: true }) heat: number | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) publishedAt:
    | string
    | null;
  @Index() @Column({ length: 40 }) fetchedAt: string;
  @Column({ type: 'varchar', length: 20 }) acquisition:
    | 'page'
    | 'feed'
    | 'aiSearch';
  @Column({ type: 'json' }) candidates: HotTopicCandidate[];
  @Column({ type: 'varchar', length: 20, default: 'unreviewed' })
  recommendationLevel: 'unreviewed' | 'high' | 'medium' | 'low';
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'simple-json' }) suggestedAngles: string[];
  @Column({ type: 'varchar', length: 20, default: 'titleOnly' })
  materialCompleteness: 'titleOnly' | 'summary';
  @Column({ type: 'varchar', length: 20, default: 'new' })
  decision: HotTopicDecision;
  @Column({ type: 'int', nullable: true }) articleId: number | null;
  @Column({ type: 'int', nullable: true }) articleTaskId: number | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) selectionRequestId:
    | string
    | null;
}
