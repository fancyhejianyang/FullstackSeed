import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

/** 启动失败也按 Nest 生命周期关闭，确保调度器先结束任务、再关闭数据库连接。 */
export async function initializeApplication(
  app: Pick<INestApplication, 'enableShutdownHooks' | 'close'>,
  initialize: () => Promise<void>,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  try {
    // Windows 控制台支持 SIGBREAK；taskkill /F 等强杀不会触发优雅退出。
    const signals: NodeJS.Signals[] =
      platform === 'win32' ? ['SIGINT', 'SIGBREAK'] : ['SIGINT', 'SIGTERM'];
    app.enableShutdownHooks(signals);
    await initialize();
  } catch (error) {
    try {
      await app.close();
    } catch (closeError) {
      Logger.error(
        `应用启动失败后清理资源失败：${closeError instanceof Error ? closeError.message : String(closeError)}`,
        closeError instanceof Error ? closeError.stack : undefined,
        'Bootstrap',
      );
    }
    throw error;
  }
}
