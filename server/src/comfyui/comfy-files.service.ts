import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ManagedFile } from '../managed-files/entities/managed-file.entity';
import { ManagedFileReference } from '../managed-files/entities/managed-file-reference.entity';
import { StoredFilesService } from '../stored-files/stored-files.service';
import {
  UploadsService,
  type UploadedStorageFile,
} from '../uploads/uploads.service';

const RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ComfyFilesService {
  constructor(
    @InjectRepository(ManagedFile)
    private readonly files: Repository<ManagedFile>,
    @InjectRepository(ManagedFileReference)
    private readonly references: Repository<ManagedFileReference>,
    private readonly uploads: UploadsService,
    private readonly storedFiles: StoredFilesService,
  ) {}

  async store(
    file: UploadedStorageFile,
    context: { ownerId: number; materialId: number; revision?: number },
  ) {
    const target = await this.uploads.reserveManagedFile(file, {
      scope: 'comfyui',
      ownerId: context.ownerId,
      businessId: context.materialId,
      revision: context.revision ?? 1,
    });
    const managed = await this.files.save(
      this.files.create({
        ownerId: context.ownerId,
        scope: 'comfyui',
        environment: this.environmentName(),
        storageProvider: target.provider,
        storageIdentity: target.storageIdentity,
        objectKey: target.objectKey,
        publicUrl: target.url,
        fileName: target.fileName,
        mimeType: target.mimeType,
        size: target.size,
        status: 'staged',
        deleteAfter: new Date(Date.now() + RETENTION_MS),
        retryAt: null,
        errorMessage: null,
      }),
    );
    try {
      await this.uploads.writeManagedFile(file, target);
      await this.files.manager.transaction(async (manager) => {
        await manager.getRepository(ManagedFileReference).save({
          fileId: managed.id,
          ownerId: context.ownerId,
          businessType: 'comfy-material',
          businessId: context.materialId,
          role: 'file',
        });
        await manager.getRepository(ManagedFile).update(managed.id, {
          status: 'ready',
          deleteAfter: null,
          retryAt: null,
          errorMessage: null,
        });
      });
      return { ...managed, status: 'ready' as const, deleteAfter: null };
    } catch {
      await this.files.update(managed.id, {
        status: 'pending_delete',
        errorMessage: '文件写入未完成，已进入安全清理队列',
      });
      throw new BadRequestException('ComfyUI 素材保存失败');
    }
  }

  async read(fileId: number, ownerId: number) {
    const file = await this.files.findOne({
      where: { id: fileId, ownerId, scope: 'comfyui', status: 'ready' },
    });
    if (!file) throw new BadRequestException('ComfyUI 输入素材不存在');
    const content = await this.storedFiles.read(file.publicUrl, file.fileName);
    return { ...content, managedFile: file };
  }

  async release(ownerId: number, materialId: number, fileId: number | null) {
    if (!fileId) return;
    await this.files.manager.transaction(async (manager) => {
      await manager.getRepository(ManagedFileReference).softDelete({
        ownerId,
        businessType: 'comfy-material',
        businessId: materialId,
        role: 'file',
      });
      if (
        !(await manager.getRepository(ManagedFileReference).exists({
          where: { fileId, deletedAt: IsNull() },
        }))
      ) {
        await manager.getRepository(ManagedFile).update(
          { id: fileId, scope: 'comfyui', status: 'ready' },
          {
            status: 'pending_delete',
            deleteAfter: new Date(Date.now() + RETENTION_MS),
            retryAt: null,
          },
        );
      }
    });
  }

  private environmentName() {
    const value = (process.env.NODE_ENV || 'development').toLowerCase();
    return /^[a-z0-9_-]+$/.test(value) ? value : 'development';
  }
}
