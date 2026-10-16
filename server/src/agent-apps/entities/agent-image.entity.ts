import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/** 私有图片不进入公开 uploads 目录；只经本人会话鉴权接口读取。 */
@Entity('agent_images')
@Index('IDX_agent_images_owner_session', ['userId', 'sessionId'])
export class AgentImage extends BaseEntity {
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'varchar', length: 40 })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'varchar', length: 16 })
  source: 'upload' | 'generated';

  @Column({ type: 'longblob', select: false })
  data: Buffer;
}
