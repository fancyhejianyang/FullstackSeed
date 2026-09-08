import { Repository } from 'typeorm';
import { StorageConfigService } from '../storage-config/storage-config.service';
import { UploadsService } from '../uploads/uploads.service';
import { MineruConfig } from './entities/mineru-config.entity';
import { MineruConfigsService } from './mineru-configs.service';

interface MineruConfigInternals {
  replaceMineruMarkdownImageUrls: (
    content: string,
    markdownFileName: string,
    imageUrls: Map<string, string>,
  ) => string;
}

describe('MineruConfigsService', () => {
  it('replaces relative archive image paths with stored image URLs', () => {
    const service = new MineruConfigsService(
      {} as Repository<MineruConfig>,
      {} as StorageConfigService,
      {} as UploadsService,
    );
    const internals = service as unknown as MineruConfigInternals;

    const content = internals.replaceMineruMarkdownImageUrls(
      '办理步骤如下：\n![价格保护流程](images/checkin.png)\n![外部图片](https://cdn.example.com/a.png)',
      'report.md',
      new Map([['images/checkin.png', '/uploads/2026/09/08/checkin.png']]),
    );

    expect(content).toBe(
      '办理步骤如下：\n![价格保护流程](/uploads/2026/09/08/checkin.png)\n![外部图片](https://cdn.example.com/a.png)',
    );
  });
});
