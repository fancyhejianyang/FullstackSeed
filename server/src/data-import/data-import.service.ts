import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { MODULE_MODEL_MAP } from '../module-models/module-models.map';
import {
  CreateDataImportConfigDto,
  QueryDataImportConfigDto,
} from './dto/data-import.dto';
import {
  DataImportConfig,
  type DataImportFieldMapping,
} from './entities/data-import-config.entity';

export interface UploadedTemplateFile {
  originalname: string;
  mimetype?: string;
  size: number;
}

@Injectable()
export class DataImportService {
  constructor(
    @InjectRepository(DataImportConfig)
    private readonly dataImportConfigRepository: Repository<DataImportConfig>,
  ) {}

  async findAll(query: QueryDataImportConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const moduleId = query.moduleId?.trim().toLowerCase();

    const baseWhere = moduleId ? { moduleId } : {};
    const where = keyword
      ? [
          { ...baseWhere, moduleName: Like(`%${keyword}%`) },
          { ...baseWhere, templateName: Like(`%${keyword}%`) },
        ]
      : baseWhere;

    const [list, total] = await this.dataImportConfigRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { list, total };
  }

  async createConfig(
    dto: CreateDataImportConfigDto,
    template: UploadedTemplateFile | undefined,
  ) {
    if (!template) {
      throw new BadRequestException('请上传模板文件');
    }

    const moduleId = dto.moduleId.trim().toLowerCase();
    const meta = MODULE_MODEL_MAP[moduleId];
    if (!meta) {
      throw new BadRequestException('模块不存在');
    }

    const fieldProps = this.parseFieldProps(dto.fieldProps);
    const importableFields = meta.fields.filter((field) => !field.readonly);
    const fieldMap = new Map(importableFields.map((field) => [field.prop, field]));
    const invalidFields = fieldProps.filter((prop) => !fieldMap.has(prop));
    if (invalidFields.length) {
      throw new BadRequestException(
        `字段不存在或不可导入：${invalidFields.join(', ')}`,
      );
    }

    const fieldLabels = fieldProps.map(
      (prop) => fieldMap.get(prop)?.label ?? prop,
    );
    const fieldMappings = this.parseFieldMappings(
      dto.fieldMappings,
      fieldProps,
      fieldMap,
    );

    return this.dataImportConfigRepository.save(
      this.dataImportConfigRepository.create({
        moduleId: meta.moduleId,
        moduleName: meta.moduleName,
        modelName: meta.modelName,
        tableName: meta.tableName,
        fieldProps,
        fieldLabels,
        fieldMappings,
        templateName: template.originalname,
        templateSize: template.size,
        templateMimeType: template.mimetype ?? '',
      }),
    );
  }

  private parseFieldProps(value: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('字段集合格式错误');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('字段集合必须是数组');
    }

    const fieldProps = Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    if (!fieldProps.length) {
      throw new BadRequestException('请至少选择一个导入字段');
    }
    return fieldProps;
  }

  private parseFieldMappings(
    value: string | undefined,
    fieldProps: string[],
    fieldMap: Map<string, { label: string }>,
  ): DataImportFieldMapping[] {
    if (!value) {
      return fieldProps.map((fieldProp) => ({
        templateField: fieldMap.get(fieldProp)?.label ?? fieldProp,
        fieldProp,
        fieldLabel: fieldMap.get(fieldProp)?.label ?? fieldProp,
      }));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('字段映射格式错误');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('字段映射必须是数组');
    }

    const selected = new Set(fieldProps);
    const mappings = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const templateField =
          typeof record.templateField === 'string'
            ? record.templateField.trim()
            : '';
        const fieldProp =
          typeof record.fieldProp === 'string' ? record.fieldProp.trim() : '';
        if (!templateField || !fieldProp || !selected.has(fieldProp)) {
          return null;
        }
        return {
          templateField,
          fieldProp,
          fieldLabel: fieldMap.get(fieldProp)?.label ?? fieldProp,
        };
      })
      .filter((item): item is DataImportFieldMapping => !!item);

    if (!mappings.length) {
      throw new BadRequestException('请至少配置一组字段映射');
    }

    return mappings;
  }
}
