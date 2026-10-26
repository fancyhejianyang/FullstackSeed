import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { HotTopicSource } from './entities/hot-topic.entity';
import {
  HotTopicSourceQueryDto,
  SaveHotTopicSourceDto,
  UpdateHotTopicSourceDto,
} from './dto/hot-topic.dto';
import { normalizeHotTopicLink } from './hot-topic-network';
import {
  CONFIGURABLE_HOT_SOURCE_KINDS,
  fixedHotSourceUrl,
  isConfigurableHotSourceKind,
  platformSource,
  type ConfigurableHotSourceKind,
} from './hot-topic.types';

export function sourceView(row: HotTopicSource) {
  const { apiToken, accountName, accountId, accessMode, ...safe } = row;
  void apiToken;
  void accountName;
  void accountId;
  void accessMode;
  const supported = isConfigurableHotSourceKind(row.kind);
  const fixedUrl = supported ? fixedHotSourceUrl(row.kind) : null;
  return {
    ...safe,
    // Legacy account, RSS and JSON Feed records are kept only in the database
    // audit trail. They cannot be returned as executable source configurations.
    kind: supported ? row.kind : ('douyinHot' as const),
    ...(fixedUrl ? { url: fixedUrl } : {}),
    isEnabled: supported ? row.isEnabled : false,
  };
}

export function validateSource(
  row: Pick<
    HotTopicSource,
    'kind' | 'accessMode' | 'url' | 'accountName' | 'accountId'
  >,
) {
  if (!isConfigurableHotSourceKind(row.kind))
    throw new BadRequestException(
      '该热点来源类型已移除，请选择当前支持的来源类型',
    );
  let url: URL;
  try {
    url = new URL(row.url);
  } catch {
    throw new BadRequestException('来源地址格式不正确');
  }
  if (
    url.protocol !== 'https:' ||
    !normalizeHotTopicLink(row.url) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new BadRequestException('来源只支持不含凭据和片段的公网 HTTPS 地址');
  if (
    [...url.searchParams.keys()].some((key) =>
      [
        'token',
        'accesstoken',
        'apikey',
        'key',
        'secret',
        'secretkey',
        'password',
        'authorization',
        'bearer',
      ].includes(key.toLowerCase().replace(/[_-]/g, '')),
    )
  )
    throw new BadRequestException('来源只支持公开访问，请移除地址中的访问密钥');
  const fixedUrl = fixedHotSourceUrl(row.kind);
  if (fixedUrl) {
    const label = row.kind === 'douyinHot' ? '抖音热搜' : '网易国内新闻';
    const endpointLabel =
      row.kind === 'douyinHot' ? '固定热搜接口' : '固定新闻接口';
    if (url.href !== fixedUrl)
      throw new BadRequestException(`${label}使用系统${endpointLabel}地址`);
    return;
  }
  const platform = platformSource(row.kind);
  if (!platform) throw new BadRequestException('热点来源类型不受支持');
}

function applyFixedSourceDefaults(
  row: Pick<HotTopicSource, 'kind' | 'accessMode' | 'url'>,
) {
  const fixedUrl = fixedHotSourceUrl(row.kind);
  row.accessMode = 'page';
  if (fixedUrl) row.url = fixedUrl;
}

@Injectable()
export class HotTopicSourcesService {
  constructor(
    @InjectRepository(HotTopicSource)
    private readonly repository: Repository<HotTopicSource>,
  ) {}

  async findAll(query: HotTopicSourceQueryDto) {
    const [list, total] = await this.repository.findAndCount({
      select: {
        id: true,
        name: true,
        kind: true,
        url: true,
        isEnabled: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      where: {
        kind: In(CONFIGURABLE_HOT_SOURCE_KINDS),
        ...(query.keyword?.trim()
          ? { name: Like(`%${query.keyword.trim()}%`) }
          : {}),
        ...(query.isEnabled !== undefined
          ? { isEnabled: query.isEnabled }
          : {}),
      },
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list: list.map(sourceView), total };
  }
  async options() {
    const rows = await this.repository.find({
      where: {
        isEnabled: true,
        kind: In(CONFIGURABLE_HOT_SOURCE_KINDS),
      },
      order: { id: 'DESC' },
      select: {
        id: true,
        name: true,
        kind: true,
        url: true,
        isEnabled: true,
        description: true,
      },
    });
    return rows.map(sourceView);
  }
  private async record(id: number) {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('热点来源不存在');
    return row;
  }
  async findOne(id: number) {
    return sourceView(await this.record(id));
  }
  async create(dto: SaveHotTopicSourceDto) {
    const row = this.repository.create({
      name: dto.name.trim(),
      kind: dto.kind,
      accessMode: 'page',
      url: dto.url.trim(),
      accountName: '',
      accountId: '',
      isEnabled: dto.isEnabled ?? false,
      description: dto.description?.trim() ?? '',
    });
    applyFixedSourceDefaults(row);
    validateSource(row);
    return sourceView(await this.repository.save(row));
  }
  async update(id: number, dto: UpdateHotTopicSourceDto) {
    const row = await this.record(id);
    if (Object.values(dto).some((value) => value === null))
      throw new BadRequestException(
        '来源字段不能为 null，请使用空字符串或明确的启停状态',
      );
    Object.assign(row, dto);
    if (!isConfigurableHotSourceKind(row.kind)) row.kind = 'douyinHot';
    row.name = row.name.trim();
    row.url = row.url.trim();
    row.accountName = '';
    row.accountId = '';
    applyFixedSourceDefaults(row);
    validateSource(row);
    return sourceView(await this.repository.save(row));
  }
  async remove(id: number) {
    await this.record(id);
    await this.repository.softDelete(id);
    return { id };
  }
  async batchRemove(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    if (
      (await this.repository.count({ where: { id: In(uniqueIds) } })) !==
      uniqueIds.length
    )
      throw new NotFoundException('部分热点来源不存在');
    await this.repository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }
  async selected(ids: number[]) {
    if (!ids.length) return [];
    const rows = await this.repository
      .createQueryBuilder('source')
      .where('source.id IN (:...ids)', { ids })
      .andWhere('source.isEnabled = :enabled', { enabled: true })
      .andWhere('source.kind IN (:...kinds)', {
        kinds: CONFIGURABLE_HOT_SOURCE_KINDS,
      })
      .getMany();
    return rows as Array<HotTopicSource & { kind: ConfigurableHotSourceKind }>;
  }
}
