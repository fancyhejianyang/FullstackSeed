import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export interface DataImportFieldMapping {
  templateField: string;
  fieldProp: string;
  fieldLabel: string;
}

@Entity('data_import_configs')
export class DataImportConfig extends BaseEntity {
  @Column({ length: 80 })
  moduleId: string;

  @Column({ length: 100 })
  moduleName: string;

  @Column({ length: 100 })
  modelName: string;

  @Column({ length: 100 })
  tableName: string;

  @Column({ type: 'simple-json' })
  fieldProps: string[];

  @Column({ type: 'simple-json' })
  fieldLabels: string[];

  @Column({ type: 'simple-json', nullable: true })
  fieldMappings: DataImportFieldMapping[] | null;

  @Column({ length: 255 })
  templateName: string;

  @Column({ type: 'int', default: 0 })
  templateSize: number;

  @Column({ length: 120, default: '' })
  templateMimeType: string;

  @Column({ type: 'longblob', nullable: true, select: false })
  templateContent: Buffer | null;
}
