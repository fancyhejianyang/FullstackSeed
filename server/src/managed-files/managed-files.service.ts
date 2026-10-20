import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThanOrEqual,
  Repository,
  type EntityManager,
} from 'typeorm';
import { imageMime } from '../common/ai/image-utils';
import { StoredFilesService } from '../stored-files/stored-files.service';
import {
  UploadsService,
  type UploadedStorageFile,
} from '../uploads/uploads.service';
import { ManagedFile } from './entities/managed-file.entity';
import { ManagedFileReference } from './entities/managed-file-reference.entity';

const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024;

@Injectable()
export class ManagedFilesService {
  constructor(
    @InjectRepository(ManagedFile)
    private readonly files: Repository<ManagedFile>,
    @InjectRepository(ManagedFileReference)
    private readonly references: Repository<ManagedFileReference>,
    private readonly uploads: UploadsService,
    private readonly storedFiles: StoredFilesService,
  ) {}

  async stageAndStore(
    file: UploadedStorageFile,
    context: {
      ownerId: number;
      materialId: number;
      revision: number;
    },
  ) {
    const target = await this.uploads.reserveManagedFile(file, {
      scope: 'ai-materials',
      ownerId: context.ownerId,
      businessId: context.materialId,
      revision: context.revision,
    });
    const staged = await this.files.save(
      this.files.create({
        ownerId: context.ownerId,
        scope: 'ai-materials',
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
      return staged;
    } catch {
      await this.files.update(staged.id, {
        status: 'pending_delete',
        errorMessage: '文件写入未完成，已进入安全清理队列',
      });
      throw new BadRequestException('生成图片保存失败，原素材未修改');
    }
  }

  async replaceMaterialReference(
    manager: EntityManager,
    payload: {
      ownerId: number;
      materialId: number;
      newFileId: number;
      oldFileId: number | null;
    },
  ) {
    return this.replaceMaterialRoleReference(manager, {
      ...payload,
      role: 'current',
    });
  }

  async replaceMaterialSourceReference(
    manager: EntityManager,
    payload: {
      ownerId: number;
      materialId: number;
      newFileId: number;
      oldFileId: number | null;
    },
  ) {
    return this.replaceMaterialRoleReference(manager, {
      ...payload,
      role: 'source',
    });
  }

  private async replaceMaterialRoleReference(
    manager: EntityManager,
    payload: {
      ownerId: number;
      materialId: number;
      newFileId: number;
      oldFileId: number | null;
      role: 'current' | 'source';
    },
  ) {
    const files = manager.getRepository(ManagedFile);
    const refs = manager.getRepository(ManagedFileReference);
    const next = await files.findOne({
      where: {
        id: payload.newFileId,
        ownerId: payload.ownerId,
        scope: 'ai-materials',
        status: 'staged',
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!next) throw new BadRequestException('生成文件状态无效');
    const currentReference = await refs.findOne({
      where: {
        ownerId: payload.ownerId,
        businessType: 'ai-material',
        businessId: payload.materialId,
        role: payload.role,
      },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    const previousFileId = currentReference?.fileId ?? payload.oldFileId;
    await refs.save(
      currentReference
        ? Object.assign(currentReference, {
            fileId: next.id,
            deletedAt: null,
          })
        : refs.create({
            fileId: next.id,
            ownerId: payload.ownerId,
            businessType: 'ai-material',
            businessId: payload.materialId,
            role: payload.role,
          }),
    );
    await files.update(next.id, {
      status: 'ready',
      deleteAfter: null,
      retryAt: null,
      errorMessage: null,
    });
    if (previousFileId && previousFileId !== next.id) {
      await this.markUnreferenced(manager, previousFileId);
    }
  }

  async releaseMaterialReference(
    manager: EntityManager,
    ownerId: number,
    materialId: number,
    fileId: number | null,
  ) {
    return this.releaseMaterialRoleReference(
      manager,
      ownerId,
      materialId,
      fileId,
      'current',
    );
  }

  async releaseMaterialSourceReference(
    manager: EntityManager,
    ownerId: number,
    materialId: number,
    fileId: number | null,
  ) {
    return this.releaseMaterialRoleReference(
      manager,
      ownerId,
      materialId,
      fileId,
      'source',
    );
  }

  private async releaseMaterialRoleReference(
    manager: EntityManager,
    ownerId: number,
    materialId: number,
    fileId: number | null,
    role: 'current' | 'source',
  ) {
    if (!fileId) return;
    await manager.getRepository(ManagedFileReference).softDelete({
      fileId,
      ownerId,
      businessType: 'ai-material',
      businessId: materialId,
      role,
    });
    await this.markUnreferenced(manager, fileId);
  }

  async readMaterialImage(fileId: number, ownerId: number) {
    const file = await this.files.findOne({
      where: {
        id: fileId,
        ownerId,
        scope: 'ai-materials',
        status: In(['ready', 'pending_delete']),
      },
    });
    if (!file) throw new BadRequestException('图生图参考图片不存在或不可用');
    if (Number(file.size) > MAX_REFERENCE_IMAGE_SIZE)
      throw new BadRequestException('图生图参考图片不能超过 5MB');
    const content = await this.storedFiles.read(file.publicUrl, file.fileName);
    if (content.buffer.length > MAX_REFERENCE_IMAGE_SIZE)
      throw new BadRequestException('图生图参考图片不能超过 5MB');
    return {
      buffer: content.buffer,
      mimeType: imageMime(content.buffer, MAX_REFERENCE_IMAGE_SIZE),
    };
  }

  async cleanupPreview(scope = 'ai-materials', limit = 100) {
    if (!['ai-materials', 'comfyui'].includes(scope))
      throw new BadRequestException('受管文件清理范围无效');
    const environment = this.environmentName();
    const candidates = await this.files.find({
      where: [
        {
          scope,
          environment,
          status: 'staged',
          deleteAfter: LessThanOrEqual(new Date()),
        },
        {
          scope,
          environment,
          status: 'pending_delete',
          deleteAfter: LessThanOrEqual(new Date()),
        },
        {
          scope,
          environment,
          status: 'delete_failed',
          retryAt: LessThanOrEqual(new Date()),
        },
      ],
      order: { id: 'ASC' },
      take: Math.min(200, Math.max(1, limit)),
    });
    const totalSize = candidates.reduce(
      (sum, file) => sum + Number(file.size || 0),
      0,
    );
    return {
      scope,
      environment,
      count: candidates.length,
      totalSize,
      fileIds: candidates.map((file) => file.id),
      list: candidates.map((file) => ({
        id: file.id,
        status: file.status,
        size: Number(file.size),
        createdAt: file.createdAt,
        deleteAfter: file.deleteAfter,
      })),
    };
  }

  async cleanup(fileIds: number[], scope = 'ai-materials') {
    if (!['ai-materials', 'comfyui'].includes(scope))
      throw new BadRequestException('受管文件清理范围无效');
    const ids = Array.from(new Set(fileIds)).slice(0, 200);
    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      const claimed = await this.files.manager.transaction(async (manager) => {
        const files = manager.getRepository(ManagedFile);
        const refs = manager.getRepository(ManagedFileReference);
        const file = await files.findOne({
          where: {
            id,
            scope,
            environment: this.environmentName(),
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !file ||
          !['staged', 'pending_delete', 'delete_failed'].includes(
            file.status,
          ) ||
          (file.status === 'delete_failed'
            ? !file.retryAt || file.retryAt > new Date()
            : !file.deleteAfter || file.deleteAfter > new Date())
        )
          return null;
        if (await refs.exists({ where: { fileId: id, deletedAt: IsNull() } }))
          return null;
        file.status = 'deleting';
        await files.save(file);
        return file;
      });
      if (!claimed) continue;
      try {
        await this.uploads.deleteManagedFile({
          provider: claimed.storageProvider,
          objectKey: claimed.objectKey,
          storageIdentity: claimed.storageIdentity,
        });
        await this.files.update(
          { id: claimed.id, status: 'deleting' },
          {
            status: 'deleted',
            deleteAfter: null,
            retryAt: null,
            errorMessage: null,
          },
        );
        deleted += 1;
      } catch {
        await this.files.update(
          { id: claimed.id, status: 'deleting' },
          {
            status: 'delete_failed',
            retryAt: new Date(Date.now() + 60 * 60 * 1000),
            errorMessage: '删除失败，请检查当前存储位置及删除权限',
          },
        );
        failed += 1;
      }
    }
    return { requested: ids.length, deleted, failed };
  }

  private async markUnreferenced(manager: EntityManager, fileId: number) {
    const refs = manager.getRepository(ManagedFileReference);
    if (await refs.exists({ where: { fileId, deletedAt: IsNull() } })) return;
    await manager.getRepository(ManagedFile).update(
      { id: fileId, status: 'ready' },
      {
        status: 'pending_delete',
        deleteAfter: new Date(Date.now() + RETENTION_MS),
        retryAt: null,
      },
    );
  }

  private environmentName() {
    const value = (process.env.NODE_ENV || 'development').toLowerCase();
    return /^[a-z0-9_-]+$/.test(value) ? value : 'development';
  }
}
