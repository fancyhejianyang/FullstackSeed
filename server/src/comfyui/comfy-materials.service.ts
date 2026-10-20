import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const qb = this.materials
      .createQueryBuilder('material')
      .where('material.userId = :userId', { userId })
      .orderBy('material.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword) {
      qb.andWhere('material.name LIKE :keyword', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.sourceType) {
      qb.andWhere('material.sourceType = :sourceType', {
        sourceType: query.sourceType,
      });
    }
    if (query.mediaType) {
      qb.andWhere('material.mediaType = :mediaType', {
        mediaType: query.mediaType,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async options(userId: number) {
    return this.materials.find({
      where: { userId, sourceType: 'input', mediaType: 'image' },
      select: ['id', 'name', 'fileUrl', 'mimeType'],
      order: { id: 'DESC' },
      take: 200,
    });
  }

  async upload(userId: number, file: UploadedStorageFile, name?: string) {
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
