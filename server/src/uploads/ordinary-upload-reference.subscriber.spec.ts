import type { DataSource, InsertEvent, ObjectLiteral } from 'typeorm';
import { OrdinaryUploadReferenceSubscriber } from './ordinary-upload-reference.subscriber';
import type { OrdinaryUploadsService } from './ordinary-uploads.service';

const fileName = 'd14a386e-9afb-4b91-80f9-58fb06c22a51.png';
const url = `/uploads/uploads/development/objects/2/2/1/${fileName}`;

function fixture(inTransaction = true) {
  const repository = {
    find: jest.fn().mockResolvedValue([{ fileName, publicUrl: url }]),
  };
  const transactionManager = { queryRunner: { isTransactionActive: true } };
  const manager = {
    queryRunner: { isTransactionActive: inTransaction },
    getRepository: jest.fn().mockReturnValue(repository),
    transaction: jest.fn(async (run: (value: unknown) => Promise<void>) =>
      run(transactionManager),
    ),
  };
  const uploads = { assertAvailable: jest.fn().mockResolvedValue(undefined) };
  const source = { subscribers: [] as unknown[] };
  const subscriber = new OrdinaryUploadReferenceSubscriber(
    source as unknown as DataSource,
    uploads as unknown as OrdinaryUploadsService,
  );
  const event = (tableName: string, entity: ObjectLiteral) =>
    ({
      metadata: { tableName },
      entity,
      manager,
    }) as unknown as InsertEvent<ObjectLiteral>;
  return {
    repository,
    manager,
    transactionManager,
    uploads,
    source,
    subscriber,
    event,
  };
}

describe('ordinary upload business reference protection', () => {
  it('reserves URLs embedded in JSON using the active business transaction', async () => {
    const test = fixture();
    await test.subscriber.beforeInsert(
      test.event('content_generation_tasks', { snapshot: { coverUrl: url } }),
    );
    expect(test.uploads.assertAvailable).toHaveBeenCalledWith(test.manager, [
      url,
    ]);
    expect(test.manager.transaction).not.toHaveBeenCalled();
  });

  it('reserves a cleanup grace period before a non-transactional repository update', async () => {
    const test = fixture(false);
    await test.subscriber.beforeInsert(
      test.event('demo', { content: `![附件](${url})` }),
    );
    expect(test.manager.transaction).toHaveBeenCalledTimes(1);
    expect(test.uploads.assertAvailable).toHaveBeenCalledWith(
      test.transactionManager,
      [url],
    );
  });

  it('does not mistake a filename from another location for a stored reference', async () => {
    const test = fixture();
    await test.subscriber.beforeInsert(
      test.event('content_articles', {
        coverUrl: `https://other.example/${fileName}`,
      }),
    );
    expect(test.uploads.assertAvailable).not.toHaveBeenCalled();
  });

  it('blocks business writes once cleanup has claimed the referenced file', async () => {
    const test = fixture();
    test.uploads.assertAvailable.mockRejectedValueOnce(new Error('附件已过期'));
    await expect(
      test.subscriber.beforeInsert(test.event('demo', { imageUrl: url })),
    ).rejects.toThrow('附件已过期');
  });

  it('ignores unrelated rows and unregisters on shutdown', async () => {
    const test = fixture();
    await test.subscriber.beforeInsert(
      test.event('managed_files', { publicUrl: url }),
    );
    expect(test.repository.find).not.toHaveBeenCalled();
    test.subscriber.onModuleDestroy();
    expect(test.source.subscribers).toEqual([]);
  });
});
