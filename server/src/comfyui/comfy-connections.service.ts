import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  CreateComfyConnectionDto,
  QueryComfyConnectionDto,
  UpdateComfyConnectionDto,
} from './dto/comfyui.dto';
import { ComfyClientService } from './comfy-client.service';
import { ComfyConnection } from './entities/comfy-connection.entity';
import { ComfyWorkflow } from './entities/comfy-workflow.entity';

@Injectable()
export class ComfyConnectionsService {
  constructor(
    @InjectRepository(ComfyConnection)
    private readonly connections: Repository<ComfyConnection>,
    @InjectRepository(ComfyWorkflow)
    private readonly workflows: Repository<ComfyWorkflow>,
    private readonly client: ComfyClientService,
  ) {}

  async findAll(query: QueryComfyConnectionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      ...(query.keyword ? { name: Like(`%${query.keyword}%`) } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
    };
    const [list, total] = await this.connections.findAndCount({
      where,
      order: { isDefault: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      list: list.map((item) => ({ ...item, secretConfigured: false })),
      total,
    };
  }

  async findOne(id: number) {
    const item = await this.connections.findOne({ where: { id } });
    if (!item) throw new NotFoundException('ComfyUI 服务配置不存在');
    const secretConfigured = await this.hasSecret(id);
    return { ...item, secretConfigured };
  }

  async options() {
    return this.connections.find({
      where: { isEnabled: true },
      select: ['id', 'name', 'isDefault', 'lastTestStatus'],
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async create(dto: CreateComfyConnectionDto) {
    const baseUrl = this.normalizeBaseUrl(dto.baseUrl);
    this.validateAuth(dto.authType ?? 'none', dto.username, dto.secret);
    if (await this.connections.exists({ where: { name: dto.name.trim() } })) {
      throw new ConflictException('配置名称已存在');
    }
    const isDefault = dto.isDefault || !(await this.connections.count());
    if (isDefault) await this.clearDefaultConnection();
    const saved = await this.connections.save(
      this.connections.create({
        ...dto,
        name: dto.name.trim(),
        baseUrl,
        authType: dto.authType ?? 'none',
        username: dto.username?.trim() || null,
        secret: dto.secret?.trim() || null,
        description: dto.description?.trim() || null,
        isDefault,
        lastTestStatus: 'untested',
        lastTestedAt: null,
        lastTestMessage: null,
        capabilitySnapshot: null,
      }),
    );
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateComfyConnectionDto) {
    const current = await this.getWithSecret(id);
    if (
      dto.name &&
      dto.name.trim() !== current.name &&
      (await this.connections.exists({ where: { name: dto.name.trim() } }))
    ) {
      throw new ConflictException('配置名称已存在');
    }
    const authType = dto.authType ?? current.authType;
    const username = dto.username ?? current.username ?? undefined;
    const secret = dto.clearSecret
      ? undefined
      : dto.secret?.trim() || current.secret || undefined;
    this.validateAuth(authType, username, secret);
    if (dto.isDefault) await this.clearDefaultConnection();
    Object.assign(current, {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.baseUrl !== undefined
        ? { baseUrl: this.normalizeBaseUrl(dto.baseUrl) }
        : {}),
      ...(dto.username !== undefined
        ? { username: dto.username.trim() || null }
        : {}),
      ...(dto.secret !== undefined
        ? { secret: dto.secret.trim() || null }
        : {}),
      ...(dto.clearSecret ? { secret: null } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() || null }
        : {}),
    });
    delete (current as ComfyConnection & { clearSecret?: boolean }).clearSecret;
    await this.connections.save(current);
    return this.findOne(id);
  }

  async remove(id: number) {
    const current = await this.findOne(id);
    if (await this.workflows.exists({ where: { connectionId: id } })) {
      throw new ConflictException('该服务仍被工作流使用，无法删除');
    }
    await this.connections.softDelete(id);
    if (current.isDefault) {
      const next = await this.connections.findOne({
        where: { isEnabled: true },
        order: { id: 'ASC' },
      });
      if (next) await this.connections.update(next.id, { isDefault: true });
    }
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) await this.remove(id);
    return { ids: uniqueIds };
  }

  async test(id: number) {
    const connection = await this.getWithSecret(id);
    const testedAt = new Date();
    try {
      const stats = await this.client.systemStats(connection);
      const snapshot = this.summarizeCapabilities(stats);
      connection.lastTestStatus = 'available';
      connection.lastTestedAt = testedAt;
      connection.lastTestMessage = '连接成功';
      connection.capabilitySnapshot = snapshot;
      await this.connections.save(connection);
      return { status: 'available', testedAt, capabilitySnapshot: snapshot };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : '连接失败';
      await this.connections.update(id, {
        lastTestStatus: 'unavailable',
        lastTestedAt: testedAt,
        lastTestMessage: message,
      });
      throw error;
    }
  }

  async getWithSecret(id: number) {
    const item = await this.connections
      .createQueryBuilder('connection')
      .addSelect('connection.secret')
      .where('connection.id = :id', { id })
      .andWhere('connection.deletedAt IS NULL')
      .getOne();
    if (!item) throw new NotFoundException('ComfyUI 服务配置不存在');
    return item;
  }

  private async hasSecret(id: number) {
    const row = await this.connections
      .createQueryBuilder('connection')
      .addSelect('connection.secret')
      .where('connection.id = :id', { id })
      .getOne();
    return !!row?.secret;
  }

  private normalizeBaseUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException('ComfyUI 服务地址格式无效');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new BadRequestException('ComfyUI 服务地址仅支持 HTTP/HTTPS');
    }
    if (!this.isAllowedHost(url.hostname)) {
      throw new BadRequestException(
        '同机直连仅允许 localhost、回环地址、host.docker.internal 或私有网段地址',
      );
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  }

  private isAllowedHost(hostname: string) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)
    )
      return true;
    const parts = host.split('.').map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  private validateAuth(
    authType: string,
    username?: string | null,
    secret?: string | null,
  ) {
    if (authType === 'basic' && (!username?.trim() || !secret?.trim())) {
      throw new BadRequestException('Basic 认证需要账号和密码');
    }
    if (authType === 'bearer' && !secret?.trim()) {
      throw new BadRequestException('Bearer 认证需要访问令牌');
    }
  }

  private async clearDefaultConnection() {
    await this.connections.update({ isDefault: true }, { isDefault: false });
  }

  private summarizeCapabilities(stats: Record<string, unknown>) {
    const system = (stats.system ?? {}) as Record<string, unknown>;
    const devices = Array.isArray(stats.devices) ? stats.devices : [];
    return {
      os: system.os ?? null,
      pythonVersion: system.python_version ?? null,
      embeddedPython: system.embedded_python ?? null,
      deviceCount: devices.length,
    };
  }
}
