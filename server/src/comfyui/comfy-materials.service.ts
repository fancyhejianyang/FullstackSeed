import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { UploadedStorageFile } from '../uploads/uploads.service';
import { ComfyFilesService } from './comfy-files.service';
import {
  QueryComfyMaterialDto,
  UpdateComfyMaterialDto,
} from './dto/comfyui.dto';
import {
  ComfyMaterial,
  type ComfyMediaType,
} from './entities/comfy-material.entity';

export type ComfyMaterialListMediaType = ComfyMediaType | 'mixed';

export interface ComfyMaterialListItem {
  id: string;
  materialIds: number[];
  itemCount: number;
  items: ComfyMaterial[];
  name: string;
  sourceType: 'input' | 'output';
  mediaType: ComfyMaterialListMediaType;
  fileUrl: string | null;
  size: number;
  sourceTaskId: number | null;
  isFavorite: boolean;
  createdAt: Date;
}

export function comfyMaterialGroupKey(material: ComfyMaterial) {
  return material.sourceType === 'output' && material.sourceTaskId !== null
    ? `task:${material.sourceTaskId}`
    : `material:${material.id}`;
}

export function buildComfyMaterialListItem(
  groupKey: string,
  groupItems: ComfyMaterial[],
): ComfyMaterialListItem {
  const items = [...groupItems].sort((left, right) => right.id - left.id);
  const first = items[0];
  if (!first) throw new Error(`素材分组 ${groupKey} 没有可用记录`);
  const mediaTypes = new Set(items.map((item) => item.mediaType));
  const isTaskGroup = groupKey.startsWith('task:');
  return {
    id: groupKey,
    materialIds: items.map((item) => item.id),
    itemCount: items.length,
    items,
    name: isTaskGroup ? `任务 #${first.sourceTaskId} 生成结果` : first.name,
    sourceType: first.sourceType,
    mediaType: mediaTypes.size === 1 ? first.mediaType : 'mixed',
    fileUrl: first.fileUrl,
    size: items.reduce((total, item) => total + Number(item.size || 0), 0),
    sourceTaskId: first.sourceTaskId,
    isFavorite: items.every((item) => item.isFavorite),
    createdAt: first.createdAt,
  };
}

@Injectable()
export class ComfyMaterialsService {
  constructor(
    @InjectRepository(ComfyMaterial)
    private readonly materials: Repository<ComfyMaterial>,
    private readonly files: ComfyFilesService,
  ) {}

  async findAll(userId: number, query: QueryComfyMaterialDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const groupKeySql =
      "CASE WHEN material.sourceType = 'output' AND material.sourceTaskId IS NOT NULL " +
      "THEN CONCAT('task:', material.sourceTaskId) ELSE CONCAT('material:', material.id) END";
    const baseQuery = this.materials
      .createQueryBuilder('material')
      .where('material.userId = :userId', { userId });
    if (query.keyword) {
      baseQuery.andWhere('material.name LIKE :keyword', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.sourceType) {
      baseQuery.andWhere('material.sourceType = :sourceType', {
        sourceType: query.sourceType,
      });
    }
    if (query.mediaType) {
      baseQuery.andWhere('material.mediaType = :mediaType', {
        mediaType: query.mediaType,
      });
    }
    const [groups, totalRow] = await Promise.all([
      baseQuery
        .clone()
        .select(groupKeySql, 'groupKey')
        .addSelect('MAX(material.id)', 'latestId')
        .groupBy(groupKeySql)
        .orderBy('MAX(material.id)', 'DESC')
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .getRawMany<{ groupKey: string; latestId: string }>(),
      baseQuery
        .clone()
        .select(`COUNT(DISTINCT ${groupKeySql})`, 'total')
        .getRawOne<{ total: string }>(),
    ]);
    if (!groups.length)
      return { list: [], total: Number(totalRow?.total || 0) };

    const materialIds = groups
      .filter((group) => group.groupKey.startsWith('material:'))
      .map((group) => Number(group.groupKey.slice('material:'.length)));
    const taskIds = groups
      .filter((group) => group.groupKey.startsWith('task:'))
      .map((group) => Number(group.groupKey.slice('task:'.length)));
    const detailQuery = this.materials
      .createQueryBuilder('material')
      .where('material.userId = :userId', { userId });
    if (materialIds.length && taskIds.length) {
      detailQuery.andWhere(
        "(material.id IN (:...materialIds) OR (material.sourceType = 'output' AND material.sourceTaskId IN (:...taskIds)))",
        { materialIds, taskIds },
      );
    } else if (materialIds.length) {
      detailQuery.andWhere('material.id IN (:...materialIds)', { materialIds });
    } else {
      detailQuery.andWhere(
        "material.sourceType = 'output' AND material.sourceTaskId IN (:...taskIds)",
        { taskIds },
      );
    }
    const materials = await detailQuery
      .orderBy('material.id', 'DESC')
      .getMany();
    const itemsByGroup = new Map<string, ComfyMaterial[]>();
    for (const material of materials) {
      const key = comfyMaterialGroupKey(material);
      const items = itemsByGroup.get(key) || [];
      items.push(material);
      itemsByGroup.set(key, items);
    }
    const list = groups.flatMap((group) => {
      const items = itemsByGroup.get(group.groupKey) || [];
      return items.length
        ? [buildComfyMaterialListItem(group.groupKey, items)]
        : [];
    });
    return { list, total: Number(totalRow?.total || 0) };
  }

  async options(userId: number) {
    return this.materials.find({
      where: { userId, mediaType: In(['image', 'video']) },
      select: ['id', 'name', 'sourceType', 'mediaType', 'fileUrl', 'mimeType'],
      order: { id: 'DESC' },
      take: 200,
    });
  }

  async upload(userId: number, file: UploadedStorageFile, name?: string) {
    return this.storeInput(userId, file, name, 'configured');
  }

  async uploadTaskInput(
    userId: number,
    file: UploadedStorageFile,
    name?: string,
  ) {
    return this.storeInput(userId, file, name, 'local');
  }

  private async storeInput(
    userId: number,
    file: UploadedStorageFile,
    name: string | undefined,
    storagePolicy: 'configured' | 'local',
  ) {
    const material = await this.materials.save(
      this.materials.create({
        userId,
        name: name?.trim() || file.originalname || '输入素材',
        sourceType: 'input',
        mediaType: this.mediaType(file.mimetype, file.originalname),
        fileId: null,
        fileUrl: null,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        sourceTaskId: null,
        isFavorite: false,
      }),
    );
    try {
      const managed = await this.files.store(file, {
        ownerId: userId,
        materialId: material.id,
        storagePolicy,
      });
      material.fileId = managed.id;
      material.fileUrl = managed.publicUrl;
      return this.materials.save(material);
    } catch (error) {
      await this.materials.softDelete(material.id);
      throw error;
    }
  }

  async createOutput(
    userId: number,
    taskId: number,
    file: UploadedStorageFile,
  ) {
    const material = await this.materials.save(
      this.materials.create({
        userId,
        name: file.originalname || `任务 ${taskId} 输出`,
        sourceType: 'output',
        mediaType: this.mediaType(file.mimetype, file.originalname),
        fileId: null,
        fileUrl: null,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        sourceTaskId: taskId,
        isFavorite: false,
      }),
    );
    try {
      const managed = await this.files.store(file, {
        ownerId: userId,
        materialId: material.id,
      });
      material.fileId = managed.id;
      material.fileUrl = managed.publicUrl;
      const saved = await this.materials.save(material);
      return { material: saved, managed };
    } catch (error) {
      await this.materials.softDelete(material.id);
      throw error;
    }
  }

  async findOwned(id: number, userId: number) {
    const item = await this.materials.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('ComfyUI 素材不存在');
    return item;
  }

  async update(id: number, userId: number, dto: UpdateComfyMaterialDto) {
    const item = await this.findOwned(id, userId);
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.isFavorite !== undefined) item.isFavorite = dto.isFavorite;
    return this.materials.save(item);
  }

  async updateGroupFavorite(
    ids: number[],
    userId: number,
    isFavorite: boolean,
  ) {
    const uniqueIds = Array.from(new Set(ids));
    const items = await this.materials.find({
      where: { id: In(uniqueIds), userId },
    });
    if (items.length !== uniqueIds.length) {
      throw new NotFoundException('部分 ComfyUI 素材不存在');
    }
    for (const item of items) item.isFavorite = isFavorite;
    await this.materials.save(items);
    return { ids: uniqueIds, isFavorite };
  }

  async remove(id: number, userId: number) {
    const item = await this.findOwned(id, userId);
    await this.materials.softDelete(id);
    await this.files.release(userId, id, item.fileId);
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) await this.remove(id, userId);
    return { ids: uniqueIds };
  }

  private mediaType(mimeType?: string, fileName = ''): ComfyMediaType {
    const mime = (mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName)) return 'image';
    if (/\.(mp4|webm|mov|mkv)$/i.test(fileName)) return 'video';
    return 'file';
  }
}
