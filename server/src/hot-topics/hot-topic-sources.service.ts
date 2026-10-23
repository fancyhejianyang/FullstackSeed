import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Not, Repository } from 'typeorm';
import { HotTopicSource } from './entities/hot-topic.entity';
import {
  HotTopicSourceQueryDto,
  SaveHotTopicSourceDto,
  UpdateHotTopicSourceDto,
} from './dto/hot-topic.dto';
import { normalizeHotTopicLink } from './hot-topic-network';
import {
  platformSource,
  type ConfigurableHotSourceKind,
} from './hot-topic.types';

/** Credentials are never returned, including to administrators or task snapshots. */
export function sourceView(row: HotTopicSource) {
  const { apiToken, accountName, accountId, ...safe } = row;
  void accountName;
  void accountId;
  const legacyAccount = row.kind === 'douyinAccount';
  return {
    ...safe,
    kind: legacyAccount ? ('douyinHot' as const) : row.kind,
    isEnabled: legacyAccount ? false : row.isEnabled,
    hasApiToken: Boolean(apiToken),
  };
}

export function validateSource(
  row: Pick<
    HotTopicSource,
    'kind' | 'accessMode' | 'url' | 'accountName' | 'accountId' | 'apiToken'
  >,
) {
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
    throw new BadRequestException(
      '请将访问密钥填入密钥字段，不要放在来源地址中',
    );
  if (row.kind === 'douyinAccount')
    throw new BadRequestException(
      '指定账号来源已移除，请改用平台热点页面、RSS 或授权 JSON Feed',
    );
  const platform = platformSource(row.kind);
  if (platform) {
    if (!['page', 'search'].includes(row.accessMode))
      throw new BadRequestException(
        `${platform.label}来源请选择公开页面或 AI 搜索`,
      );
  } else if (row.accessMode !== 'feed')
    throw new BadRequestException('RSS / JSON 来源使用 Feed 接入方式');
  if (row.apiToken && (row.kind !== 'jsonFeed' || url.protocol !== 'https:'))
    throw new BadRequestException('访问密钥仅可用于 HTTPS 授权 JSON Feed');
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
        accessMode: true,
        url: true,
        apiToken: true,
        isEnabled: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      where: {
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
      where: { isEnabled: true, kind: Not('douyinAccount') },
      order: { id: 'DESC' },
      select: {
        id: true,
        name: true,
        kind: true,
        accessMode: true,
        url: true,
        isEnabled: true,
        description: true,
      },
    });
    return rows.map(sourceView);
  }
  private async record(id: number) {
    const row = await this.repository
      .createQueryBuilder('source')
      .addSelect('source.apiToken')
      .where('source.id = :id', { id })
      .getOne();
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
      accessMode: dto.accessMode,
      url: dto.url.trim(),
      accountName: '',
      accountId: '',
      apiToken: dto.apiToken?.trim() || null,
      isEnabled: dto.isEnabled ?? false,
      description: dto.description?.trim() ?? '',
    });
    validateSource(row);
    return sourceView(await this.repository.save(row));
  }
  async update(id: number, dto: UpdateHotTopicSourceDto) {
    const row = await this.record(id);
    const { apiToken, clearApiToken, ...fields } = dto;
    if (Object.values(fields).some((value) => value === null))
      throw new BadRequestException(
        '来源字段不能为 null，请使用空字符串或明确的启停状态',
      );
    Object.assign(row, fields);
    if (row.kind === 'douyinAccount') row.kind = 'douyinHot';
    row.name = row.name.trim();
    row.url = row.url.trim();
    row.accountName = '';
    row.accountId = '';
    if (clearApiToken) row.apiToken = null;
    else if (apiToken?.trim()) row.apiToken = apiToken.trim();
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
      .addSelect('source.apiToken')
      .where('source.id IN (:...ids)', { ids })
      .andWhere('source.isEnabled = :enabled', { enabled: true })
      .andWhere('source.kind != :legacyKind', {
        legacyKind: 'douyinAccount',
      })
      .getMany();
    return rows as Array<HotTopicSource & { kind: ConfigurableHotSourceKind }>;
  }
}
