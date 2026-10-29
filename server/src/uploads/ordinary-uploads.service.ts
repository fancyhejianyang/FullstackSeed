import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ManagedFile } from '../managed-files/entities/managed-file.entity';
import {
  UploadsService,
  type UploadedStorageFile,
  type UploadResult,
} from './uploads.service';
import { validatePublicUpload } from './upload-policy';

export const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OrdinaryUploadsService {
  constructor(
    @InjectRepository(ManagedFile)
    private readonly files: Repository<ManagedFile>,
    private readonly uploads: UploadsService,
  ) {}

  async upload(
    file: UploadedStorageFile,
    ownerId: number,
    requestOrigin = '',
  ): Promise<UploadResult> {
    const validated = validatePublicUpload(file);
    const target = await this.uploads.reserveManagedFile(validated, {
      scope: 'uploads',
      ownerId,
      businessId: ownerId,
      revision: 1,
      requestOrigin,
    });
    const environment = (process.env.NODE_ENV || 'development').toLowerCase();
    const registered = await this.files.save(
      this.files.create({
        ownerId,
        scope: 'uploads',
        environment: /^[a-z0-9_-]+$/.test(environment)
          ? environment
          : 'development',
        storageProvider: target.provider,
        storageIdentity: target.storageIdentity,
        objectKey: target.objectKey,
        publicUrl: target.url,
        fileName: target.fileName,
        mimeType: target.mimeType,
        size: target.size,
        status: 'staged',
        deleteAfter: new Date(Date.now() + UPLOAD_RETENTION_MS),
        retryAt: null,
        errorMessage: null,
      }),
    );
    try {
      await this.uploads.writeManagedFile(validated, target);
    } catch {
      await this.files.update(registered.id, {
        status: 'pending_delete',
        errorMessage: '上传未完成，等待延后清理',
      });
      throw new BadRequestException('文件保存失败，请重试');
    }
    return {
      url: target.url,
      fileName: target.fileName,
      originalName: target.originalName,
      mimeType: target.mimeType,
      size: target.size,
      fileId: registered.id,
    };
  }

  async release(url: string, user: AuthUser) {
    return this.files.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ManagedFile);
      const file = await repo.findOne({
        where: { publicUrl: url, scope: 'uploads' },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !file ||
        (!user.isAdmin && file.ownerId !== user.userId) ||
        ['deleting', 'deleted'].includes(file.status)
      )
        return { released: false };
      await repo.update(file.id, {
        status: 'pending_delete',
        deleteAfter: new Date(Date.now() + UPLOAD_RETENTION_MS),
        retryAt: null,
      });
      return { released: true };
    });
  }

  /** Called within the business transaction, sharing the cleanup row lock. */
  async assertAvailable(manager: EntityManager, urls: string[]) {
    if (!urls.length) return;
    if (!manager.queryRunner?.isTransactionActive)
      throw new BadRequestException('附件引用必须在业务保存事务中校验');
    const repo = manager.getRepository(ManagedFile);
    const files = await repo.find({
      where: { scope: 'uploads', publicUrl: In([...new Set(urls)].sort()) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const file of files) {
      if (['deleting', 'deleted'].includes(file.status))
        throw new BadRequestException('附件已过期或正在清理，请重新上传');
      await repo.update(file.id, {
        status: 'staged',
        deleteAfter: new Date(
          Math.max(
            file.deleteAfter?.getTime() || 0,
            Date.now() + UPLOAD_RETENTION_MS,
          ),
        ),
        retryAt: null,
        errorMessage: null,
      });
    }
  }

  async download(url: string, name: string | undefined, requestOrigin: string) {
    const file = await this.files.findOne({
      where: { publicUrl: url, scope: 'uploads' },
    });
    if (file && ['deleting', 'deleted'].includes(file.status))
      throw new NotFoundException('附件已失效');
    try {
      const buffer = file
        ? await this.uploads.readManagedFile({
            provider: file.storageProvider,
            objectKey: file.objectKey,
            storageIdentity: file.storageIdentity,
          })
        : await this.uploads.readLegacyUpload(url, requestOrigin);
      return {
        buffer,
        name: Array.from(
          name || file?.fileName || url.split('/').pop() || '附件',
        )
          .map((character) =>
            character.charCodeAt(0) < 32 ||
            character.charCodeAt(0) === 127 ||
            '/\\'.includes(character)
              ? '_'
              : character,
          )
          .join('')
          .slice(0, 255),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new NotFoundException('附件不存在或暂时无法下载');
    }
  }
}
