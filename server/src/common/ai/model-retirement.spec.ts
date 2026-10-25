import { isRetiredModelError } from './model-retirement';

describe('官方模型已退役错误识别', () => {
  it.each([
    'The model has been retired.',
    'The requested model "selected-model" has been decommissioned.',
    'Model selected-model was taken offline.',
    'This model is permanently retired.',
    '所选模型已下线，请使用新版本。',
    '模型 selected-model 已经停止服务。',
    '模型“selected-model”已永久退役。',
  ])('识别当前调用的明确完成退役错误：%s', (message) => {
    expect(isRetiredModelError({ error: { message } }, 'selected-model')).toBe(
      true,
    );
  });

  it('支持中文错误字段、JSON 错误和固定空白归一化', () => {
    expect(
      isRetiredModelError(
        JSON.stringify({ error: { message_zh: '该模型已下线。' } }),
        'selected-model',
      ),
    ).toBe(true);
    expect(
      isRetiredModelError(
        { Message: 'Model\nselected-model\thas been retired.' },
        'selected-model',
      ),
    ).toBe(true);
  });

  it.each([
    'The model has not been retired.',
    'The model is not retired.',
    'The model will be retired tomorrow.',
    'The model is scheduled to be decommissioned.',
    'The model is temporarily offline.',
    'The model has been retired temporarily for maintenance.',
    'The model has been retired. It will be restored tomorrow.',
    'The model is no longer available.',
    'The model has been deprecated.',
    'The model is discontinued.',
    'The model does not exist.',
    'The model is not available in this region.',
    'Model other-model has been retired.',
    'Model selected-model-next has been retired.',
    'Invalid prompt: The model has been retired.',
    'Provider has been taken offline, create a new session.',
    '模型 selected-model 即将下线',
    '该模型尚未下线。',
    '模型 other-model 已下线。',
    '模型已停止新购。',
    '模型维护中。',
    '模型已下线，维护完成后恢复。',
    '模型不存在。',
    'No free trial quota is available for the service and postpaid billing is not enabled',
    'Access to model denied. Please make sure you are eligible for using the model',
  ])('保留否定、未来、其他模型或非退役错误：%s', (message) => {
    expect(isRetiredModelError({ error: { message } }, 'selected-model')).toBe(
      false,
    );
  });

  it('不扫描模型回答、请求回显、凭据或会话供应商下线', () => {
    const value = {
      choices: [{ message: { content: 'The model has been retired.' } }],
      messages: [{ role: 'user', content: 'The model has been retired.' }],
      prompt: 'The model has been retired.',
      secretKey: 'The model has been retired.',
      error: { input: 'The model has been retired.' },
    };
    expect(isRetiredModelError(value, 'selected-model')).toBe(false);
    expect(
      isRetiredModelError(
        { error: { code: 410001, message: 'The model has been retired.' } },
        'selected-model',
      ),
    ).toBe(false);
    expect(
      isRetiredModelError(
        { message: '模型已下线。', error: { code: '410001' } },
        'selected-model',
      ),
    ).toBe(false);
    expect(
      isRetiredModelError(
        { error: { message: '模型已下线。', detail: '维护后恢复' } },
        'selected-model',
      ),
    ).toBe(false);
  });

  it('约束递归深度、文本长度并处理循环对象', () => {
    const value: Record<string, unknown> = {};
    value.error = value;
    expect(isRetiredModelError(value, 'selected-model')).toBe(false);
    expect(
      isRetiredModelError(
        { message: `The model has been retired.${' '.repeat(8192)}` },
        'selected-model',
      ),
    ).toBe(false);
  });
});
