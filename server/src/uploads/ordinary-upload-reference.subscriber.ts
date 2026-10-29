import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  DataSource,
  In,
  type EntityManager,
  type EntitySubscriberInterface,
  type InsertEvent,
  type ObjectLiteral,
  type UpdateEvent,
} from 'typeorm';
import { ManagedFile } from '../managed-files/entities/managed-file.entity';
import { ORDINARY_UPLOAD_REFERENCE_FIELDS } from './ordinary-upload-references';
import { OrdinaryUploadsService } from './ordinary-uploads.service';

/** Keep normal repository writes and the cleanup worker on the same file lock. */
@Injectable()
export class OrdinaryUploadReferenceSubscriber
  implements EntitySubscriberInterface<ObjectLiteral>, OnModuleDestroy
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: OrdinaryUploadsService,
  ) {
    dataSource.subscribers.push(this);
  }

  onModuleDestroy() {
    const index = this.dataSource.subscribers.indexOf(this);
    if (index >= 0) this.dataSource.subscribers.splice(index, 1);
  }

  beforeInsert(event: InsertEvent<ObjectLiteral>) {
    return this.guard(event);
  }

  beforeUpdate(event: UpdateEvent<ObjectLiteral>) {
    return this.guard(event);
  }

  private async guard(
    event: InsertEvent<ObjectLiteral> | UpdateEvent<ObjectLiteral>,
  ) {
    const fields = ORDINARY_UPLOAD_REFERENCE_FIELDS[event.metadata.tableName];
    if (!fields || !event.entity) return;
    const text = fields
      .map((field) => {
        const value: unknown = event.entity?.[field];
        if (typeof value === 'string') return value;
        return value && typeof value === 'object' ? JSON.stringify(value) : '';
      })
      .join('\n');
    // A filename locates candidates; the full registered URL must also occur.
    // This handles URLs embedded in Markdown/HTML/JSON without guessing domains.
    const names = Array.from(
      new Set(
        text.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+/g,
        ) ?? [],
      ),
    );
    if (!names.length) return;
    const files = await event.manager.getRepository(ManagedFile).find({
      where: { scope: 'uploads', fileName: In(names) },
      withDeleted: true,
    });
    const urls = files
      .filter((file) => text.includes(file.publicUrl))
      .map((file) => file.publicUrl);
    if (!urls.length) return;

    const reserve = (manager: EntityManager) =>
      this.uploads.assertAvailable(manager, urls);
    if (event.manager.queryRunner?.isTransactionActive) {
      // repository.save / existing business transactions retain the lock until commit.
      await reserve(event.manager);
    } else {
      // repository.update may have no transaction. Reserve another 24 hours first:
      // cleanup can no longer claim this file while the following statement runs.
      // A failed business write leaves only an expiring, unreferenced reservation.
      await event.manager.transaction(reserve);
    }
  }
}
