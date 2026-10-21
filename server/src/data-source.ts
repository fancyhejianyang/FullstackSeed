import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index < 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'fullstack_seed',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  // 迁移目录内同时保留 Jest 规格测试；使用 extglob 明确排除 *.spec，
  // 避免 TypeORM CLI 将测试文件当作迁移加载并触发 `describe is not defined`。
  migrations: [__dirname + '/migrations/!(*.spec){.ts,.js}'],
  synchronize: false,
});

export default dataSource;
