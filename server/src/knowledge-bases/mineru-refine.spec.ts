import { KnowledgeBasesService } from './knowledge-bases.service';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';

describe('MinerU model refinement', () => {
  function setup() {
    const service = Object.create(KnowledgeBasesService.prototype) as KnowledgeBasesService & Record<string, any>;
    const callChat = jest.fn().mockResolvedValue({ isSuccess: true, answer: '# 整理结果\n正文', elapsedMilliseconds: 10 });
    Object.assign(service, {
      providersService: { callChat },
      documentParseRulesService: { splitText: jest.fn().mockResolvedValue([{ content: '原始识别内容' }]) },
      taskFileLogger: { write: jest.fn().mockResolvedValue(undefined) },
      documentRepository: { save: jest.fn(async (value) => value) },
      baseRepository: { findOne: jest.fn().mockResolvedValue(null) },
      syncBaseParsedContent: jest.fn(), resetDocumentChunks: jest.fn(),
    });
    return { service: service as any, callChat };
  }
  const config = { id: 1, providerId: 2, model: 'text-model', systemPrompt: '保留产品参数表', temperature: 0, useMineru: true } as AiFeatureConfig;

  it('passes the configured prompt, model and OCR text to the model before storing', async () => {
    const { service, callChat } = setup();
    const document = { id: 5, knowledgeBaseId: 6, title: '产品说明', content: '旧正文' };
    await service.applyThirdPartyMarkdown(document, '原始识别内容', '说明.pdf', {}, config);
    expect(callChat).toHaveBeenCalledWith(expect.objectContaining({ id: 2, model: 'text-model', temperature: 0, systemPrompt: expect.stringContaining('保留产品参数表'), question: expect.stringContaining('原始识别内容') }));
    expect(document.content).toBe('# 整理结果\n正文');
    expect(service.syncBaseParsedContent).toHaveBeenCalledWith(document, document.content);
  });

  it('does not store raw OCR or partial output when a later segment fails', async () => {
    const { service, callChat } = setup();
    service.documentParseRulesService.splitText.mockResolvedValue([{ content: '第一段' }, { content: '第二段' }]);
    callChat.mockResolvedValueOnce({ isSuccess: true, answer: '# 第一段' }).mockResolvedValueOnce({ isSuccess: false, errorMessage: '超时' });
    const document = { id: 5, knowledgeBaseId: 6, title: '产品说明', content: '旧正文', status: 'processing' };
    await expect(service.applyThirdPartyMarkdown(document, '原始识别内容', undefined, {}, config)).rejects.toThrow('第 2 段');
    expect(document.content).toBe('旧正文');
    expect(document.status).toBe('failed');
    expect(service.syncBaseParsedContent).not.toHaveBeenCalled();
    expect(service.taskFileLogger.write).toHaveBeenCalledWith('mineru.refine.failed', expect.objectContaining({ errorMessage: expect.stringContaining('超时') }));
  });

  it('rejects missing model settings and empty model responses', async () => {
    const { service, callChat } = setup();
    await expect(service.refineMineruMarkdown('正文', { ...config, providerId: null })).rejects.toThrow('补充');
    expect(callChat).not.toHaveBeenCalled();
    callChat.mockResolvedValue({ isSuccess: true, answer: ' ' });
    await expect(service.refineMineruMarkdown('正文', config)).rejects.toThrow('正文为空');
  });
});
