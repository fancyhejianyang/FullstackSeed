import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MODULE_MODEL_MAP,
  type ModuleModelFieldMeta,
  type ModuleModelMeta,
  type ModuleModelSummary,
} from './module-models.map';

@Injectable()
export class ModuleModelsService {
  findAll(): ModuleModelSummary[] {
    return Object.values(MODULE_MODEL_MAP).map((meta) => this.toSummary(meta));
  }

  findOne(moduleId: string): ModuleModelMeta {
    const meta = MODULE_MODEL_MAP[this.normalizeModuleId(moduleId)];
    if (!meta) {
      throw new NotFoundException('模块模型不存在');
    }
    return meta;
  }

  findFields(moduleId: string): ModuleModelFieldMeta[] {
    return this.findOne(moduleId).fields;
  }

  private normalizeModuleId(moduleId: string) {
    return moduleId.trim().toLowerCase();
  }

  private toSummary(meta: ModuleModelMeta): ModuleModelSummary {
    return {
      moduleId: meta.moduleId,
      moduleName: meta.moduleName,
      modelName: meta.modelName,
      tableName: meta.tableName,
      routePath: meta.routePath,
      permissionPrefix: meta.permissionPrefix,
    };
  }
}
