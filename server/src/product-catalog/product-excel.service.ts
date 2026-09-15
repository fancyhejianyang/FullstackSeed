import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { ValueType, Workbook } from 'exceljs';
import { Product } from './entities/product.entity';

export const PRODUCT_TEMPLATE_HEADERS = [
  '产品名称',
  '产品别名',
  '产品分类',
  '产品描述',
  '是否启用',
];
export interface ProductImportResult {
  importedCount: number;
  errors: Array<{ row: number; message: string }>;
}

@Injectable()
export class ProductExcelService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async createTemplate() {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('产品列表');
    sheet.addRow(PRODUCT_TEMPLATE_HEADERS);
    sheet.columns.forEach((column, index) => {
      column.width = [30, 35, 22, 65, 16][index];
    });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF304156' },
    };
    sheet.getRow(1).height = 28;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (let row = 2; row <= 1001; row++) {
      sheet.getRow(row).alignment = { vertical: 'top', wrapText: true };
      for (let col = 1; col <= 5; col++) sheet.getCell(row, col).numFmt = '@';
      sheet.getCell(row, 5).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"是,否"'],
        showErrorMessage: true,
        errorTitle: '请选择是否启用',
        error: '仅允许填写是或否',
      };
    }
    const help = workbook.addWorksheet('填写说明');
    help.columns = [{ width: 24 }, { width: 95 }];
    help.addRows([
      ['填写项目', '说明'],
      ['产品名称', '必填，最多一百六十字。每行一个产品，同名同分类视为重复。'],
      [
        '产品别名',
        '可选，多个别名用顿号、分号或换行分隔，每个别名最多一百六十字。',
      ],
      ['产品分类', '可选，最多八十字。'],
      ['产品描述', '可选，填写产品介绍。'],
      ['是否启用', '填写“是”或“否”，留空默认启用。'],
      [
        '填写方式',
        '在“产品列表”从第二行填写，保留全部中文表头，不添加编号列，不使用公式或合并单元格。',
      ],
      [
        '导入规则',
        '仅新增产品，内部编码自动生成。单次最多一千个产品；发现错误时整份文件不写入。',
      ],
      [
        '重复处理',
        '文件内重复或与已有产品同名同分类时提示行号，请修改或移除重复行后重新导入。',
      ],
    ]);
    help.getRow(1).font = { bold: true };
    help.eachRow((row) => {
      row.alignment = { wrapText: true, vertical: 'top' };
      row.height = 34;
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importProducts(file?: {
    originalname: string;
    buffer: Buffer;
  }): Promise<ProductImportResult> {
    if (!file || !/\.xlsx$/i.test(file.originalname))
      throw new BadRequestException('请选择模板格式的 .xlsx 文件');
    if (file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('文件不能超过 5 MB');
    const workbook = new Workbook();
    try {
      await workbook.xlsx.load(
        file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException(
        '无法读取 Excel，请使用导出的模板保存为 .xlsx 文件',
      );
    }
    const sheet = workbook.getWorksheet('产品列表');
    if (!sheet)
      throw new BadRequestException('缺少“产品列表”工作表，请使用导出的模板');
    const errors: ProductImportResult['errors'] = [];
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      const header = cell.text.trim();
      if (cell.isMerged || cell.type === ValueType.Formula)
        errors.push({ row: 1, message: '表头不支持公式或合并单元格' });
      if (!PRODUCT_TEMPLATE_HEADERS.includes(header) || headers.has(header))
        errors.push({ row: 1, message: `未知或重复的表头：${header}` });
      headers.set(header, column);
    });
    for (const header of PRODUCT_TEMPLATE_HEADERS) {
      if (!headers.has(header))
        errors.push({ row: 1, message: `缺少表头：${header}` });
    }
    if (errors.length) return { importedCount: 0, errors };
    const rows: Array<{ row: number; product: Partial<Product> }> = [];
    const keys = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || !row.hasValues) return;
      if (rows.length >= 1000)
        throw new BadRequestException('单次最多导入 1000 个产品');
      row.eachCell((cell, column) => {
        if (
          cell.isMerged ||
          cell.type === ValueType.Formula ||
          cell.type === ValueType.Error
        ) {
          errors.push({
            row: rowNumber,
            message: '不支持公式、错误值或合并单元格，请填写文本',
          });
        }
        if (![...headers.values()].includes(column))
          errors.push({
            row: rowNumber,
            message: '表头之外存在数据，请移除多余列',
          });
      });
      const values = PRODUCT_TEMPLATE_HEADERS.map((header) =>
        row.getCell(headers.get(header)!).text.trim(),
      );
      if (values.every((value) => !value)) return;
      const [name, aliasText, category, description, enabled] = values;
      const aliases = [
        ...new Set(
          aliasText
            .split(/[、;；\r\n]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
      if (!name || name.length > 160)
        errors.push({
          row: rowNumber,
          message: '产品名称必填且不能超过 160 字',
        });
      if (category.length > 80)
        errors.push({ row: rowNumber, message: '产品分类不能超过 80 字' });
      if (aliases.some((alias) => alias.length > 160))
        errors.push({ row: rowNumber, message: '单个产品别名不能超过 160 字' });
      if (Buffer.byteLength(JSON.stringify(aliases), 'utf8') > 60000)
        errors.push({
          row: rowNumber,
          message: '产品别名总长度过长，请缩短内容',
        });
      if (Buffer.byteLength(description, 'utf8') > 60000)
        errors.push({ row: rowNumber, message: '产品描述过长，请缩短内容' });
      if (enabled && !['是', '否'].includes(enabled))
        errors.push({ row: rowNumber, message: '是否启用只能填写“是”或“否”' });
      const key = this.key(name, category);
      if (keys.has(key))
        errors.push({ row: rowNumber, message: '文件内存在同名同分类的产品' });
      keys.add(key);
      rows.push({
        row: rowNumber,
        product: {
          name,
          aliases,
          category,
          description: description || null,
          isEnabled: enabled !== '否',
        },
      });
    });
    if (!rows.length)
      throw new BadRequestException('模板中没有可导入的产品，请从第二行填写');
    if (errors.length) return { importedCount: 0, errors };
    return this.products.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Product);
      const existing = await repository.find({
        where: { name: In(rows.map(({ product }) => product.name!)) },
      });
      const existingKeys = new Set(
        existing.map((product) => this.key(product.name, product.category)),
      );
      for (const item of rows) {
        if (
          existingKeys.has(this.key(item.product.name!, item.product.category!))
        )
          errors.push({ row: item.row, message: '产品库已存在同名同分类产品' });
      }
      if (errors.length) return { importedCount: 0, errors };
      await repository.save(
        rows.map(({ product }) =>
          repository.create({
            ...product,
            productCode: `P${randomUUID().replace(/-/g, '')}`,
          }),
        ),
      );
      return { importedCount: rows.length, errors: [] };
    });
  }

  private key(name: string, category: string) {
    return JSON.stringify([
      name.trim().normalize('NFKC').toLowerCase(),
      category.trim().normalize('NFKC').toLowerCase(),
    ]);
  }
}
