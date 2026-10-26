import { Logger } from '@nestjs/common';
import { initializeApplication } from './application-lifecycle';

function fixture() {
  return {
    app: {
      enableShutdownHooks: jest.fn().mockReturnThis(),
      close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    },
    initialize: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
}

describe('应用启动与关闭生命周期', () => {
  afterEach(() => jest.restoreAllMocks());

  it('Windows 在配置和监听前注册 SIGINT 与 SIGBREAK', async () => {
    const { app } = fixture();
    const initialize = jest.fn(() => {
      expect(app.enableShutdownHooks).toHaveBeenCalledWith([
        'SIGINT',
        'SIGBREAK',
      ]);
      return Promise.resolve();
    });

    await initializeApplication(app, initialize, 'win32');

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(app.close).not.toHaveBeenCalled();
  });

  it.each<NodeJS.Platform>(['linux', 'darwin'])(
    '%s 使用 SIGINT 与 SIGTERM，成功启动不关闭应用',
    async (platform) => {
      const { app, initialize } = fixture();

      await initializeApplication(app, initialize, platform);

      expect(app.enableShutdownHooks).toHaveBeenCalledWith([
        'SIGINT',
        'SIGTERM',
      ]);
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(app.close).not.toHaveBeenCalled();
    },
  );

  it('初始化失败后关闭应用，并保留原始错误', async () => {
    const { app, initialize } = fixture();
    const error = new Error('客服调度锁仍被另一实例持有');
    initialize.mockRejectedValue(error);

    await expect(initializeApplication(app, initialize, 'linux')).rejects.toBe(
      error,
    );

    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('等待关闭完成后才向调用方返回启动失败', async () => {
    const { app, initialize } = fixture();
    const error = new Error('监听失败');
    initialize.mockRejectedValue(error);
    let finishClose!: () => void;
    app.close.mockReturnValue(
      new Promise<void>((resolve) => {
        finishClose = resolve;
      }),
    );
    let settled = false;
    const result = initializeApplication(app, initialize, 'linux').catch(
      (caught: unknown) => {
        settled = true;
        return caught;
      },
    );

    await Promise.resolve();
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    finishClose();
    await expect(result).resolves.toBe(error);
  });

  it('关闭失败时记录清理错误，但仍向调用方抛出原始启动错误', async () => {
    const { app, initialize } = fixture();
    const error = new Error('Swagger 配置失败');
    const closeError = new Error('关闭应用失败');
    initialize.mockRejectedValue(error);
    app.close.mockRejectedValue(closeError);
    const log = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);

    await expect(initializeApplication(app, initialize, 'linux')).rejects.toBe(
      error,
    );

    expect(log).toHaveBeenCalledWith(
      '应用启动失败后清理资源失败：关闭应用失败',
      closeError.stack,
      'Bootstrap',
    );
    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
