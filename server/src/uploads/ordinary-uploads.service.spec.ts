import type { EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { ManagedFile } from '../managed-files/entities/managed-file.entity';
import type { UploadsService } from './uploads.service';
import {
  OrdinaryUploadsService,
  UPLOAD_RETENTION_MS,
} from './ordinary-uploads.service';

const url = '/uploads/uploads/development/objects/2/2/1/file.txt';
const user = { userId: 2, isAdmin: false } as AuthUser;

function fixture() {
  const record = {
    id: 5,
    ownerId: 2,
    publicUrl: url,
    scope: 'uploads',
    status: 'staged',
    deleteAfter: new Date(0),
  };
  const repository = {
    find: jest.fn().mockResolvedValue([record]),
    findOne: jest.fn().mockResolvedValue(record),
    update: jest
      .fn<Promise<void>, [number, Partial<ManagedFile>]>()
      .mockResolvedValue(undefined),
  };
  const manager = {
    queryRunner: { isTransactionActive: true },
    getRepository: jest.fn().mockReturnValue(repository),
  };
  const rootRepository = {
    ...repository,
    manager: {
      transaction: jest.fn(
        async (run: (value: EntityManager) => Promise<unknown>) =>
          run(manager as unknown as EntityManager),
      ),
    },
  };
  const storage = {
    readManagedFile: jest.fn(),
    readLegacyUpload: jest.fn(),
    deleteManagedFile: jest.fn(),
  };
  const service = new OrdinaryUploadsService(
    rootRepository as unknown as Repository<ManagedFile>,
    storage as unknown as UploadsService,
  );
  return {
    service,
    repository,
    record,
    manager: manager as unknown as EntityManager,
    storage,
  };
}

describe('ordinary upload lifecycle safety', () => {
  it('refuses unprotected binding without a transaction', async () => {
    const test = fixture();
    const manager = {
      ...test.manager,
      queryRunner: { isTransactionActive: false },
    } as unknown as EntityManager;
    await expect(test.service.assertAvailable(manager, [url])).rejects.toThrow(
      '事务',
    );
    expect(test.repository.update).not.toHaveBeenCalled();
  });

  it.each(['deleting', 'deleted'])(
    'does not resurrect an attachment after cleanup entered %s',
    async (status) => {
      const test = fixture();
      test.record.status = status;
      await expect(
        test.service.assertAvailable(test.manager, [url]),
      ).rejects.toThrow('已过期或正在清理');
      expect(test.repository.update).not.toHaveBeenCalled();
    },
  );

  it('keeps a saved attachment eligible for future reference checks with at least 24 hours of grace', async () => {
    const test = fixture();
    const earliestDelete = Date.now() + UPLOAD_RETENTION_MS;
    await test.service.assertAvailable(test.manager, [url]);
    const change = test.repository.update.mock.calls[0]?.[1] as {
      status: string;
      deleteAfter: Date;
    };
    expect(change.status).toBe('staged');
    expect(change.deleteAfter.getTime()).toBeGreaterThanOrEqual(earliestDelete);
  });

  it('never shortens an existing longer reservation', async () => {
    const test = fixture();
    test.record.deleteAfter = new Date(Date.now() + 3 * UPLOAD_RETENTION_MS);
    await test.service.assertAvailable(test.manager, [url]);
    const change = test.repository.update.mock.calls[0]?.[1] as {
      deleteAfter: Date;
    };
    expect(change.deleteAfter).toEqual(test.record.deleteAfter);
  });

  it('does not allow another ordinary user to release the attachment', async () => {
    const test = fixture();
    await expect(
      test.service.release(url, { ...user, userId: 99 }),
    ).resolves.toEqual({ released: false });
    expect(test.repository.update).not.toHaveBeenCalled();
    expect(test.storage.deleteManagedFile).not.toHaveBeenCalled();
  });

  it('an owner removal schedules delayed review without physically deleting the file', async () => {
    const test = fixture();
    const earliestDelete = Date.now() + UPLOAD_RETENTION_MS;
    await expect(test.service.release(url, user)).resolves.toEqual({
      released: true,
    });
    const change = test.repository.update.mock.calls[0]?.[1] as {
      status: string;
      deleteAfter: Date;
    };
    expect(change.status).toBe('pending_delete');
    expect(change.deleteAfter.getTime()).toBeGreaterThanOrEqual(earliestDelete);
    expect(test.storage.deleteManagedFile).not.toHaveBeenCalled();
  });

  it.each(['deleted', 'deleting'])(
    'does not bypass a %s registration through the legacy download path',
    async (status) => {
      const test = fixture();
      test.record.status = status;
      await expect(
        test.service.download(url, 'file.txt', 'http://localhost:4000'),
      ).rejects.toThrow('已失效');
      expect(test.storage.readManagedFile).not.toHaveBeenCalled();
      expect(test.storage.readLegacyUpload).not.toHaveBeenCalled();
    },
  );
});
