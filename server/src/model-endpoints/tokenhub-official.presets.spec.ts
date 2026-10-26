import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateModelEndpointDto } from './dto/model-endpoint.dto';
import { MODEL_ENDPOINT_PRESETS } from './model-endpoint.presets';
import {
  CATEGORY_LABELS,
  modelCategory,
  protocolTaskMethod,
} from './model-endpoint.constants';
import {
  TOKENHUB_DOCUMENTATION,
  TOKENHUB_OFFICIAL_PRESETS,
  TOKENHUB_UNVERIFIED_MODELS,
} from './tokenhub-official.presets';
import { endpointTestTemplate } from '../knowledge-ai-providers/model-endpoint-test.utils';

describe('腾讯官方目录快照 2026-10-25', () => {
  it('覆盖七类且每个模型场景唯一，不再创建联网搜索卡片', async () => {
    const cards = TOKENHUB_OFFICIAL_PRESETS;
    expect(cards).toHaveLength(248);
    expect(new Set(cards.map((card) => card.modelCode)).size).toBe(126);
    expect(
      new Set(cards.map((card) => `${card.modelCode}:${card.functionType}`))
        .size,
    ).toBe(cards.length);
    expect(
      new Set(cards.map((card) => modelCategory(card.functionType))),
    ).toEqual(new Set(Object.keys(CATEGORY_LABELS)));
    for (const card of cards) {
      expect(
        await validate(plainToInstance(CreateModelEndpointDto, card)),
      ).toHaveLength(0);
      expect(
        TOKENHUB_DOCUMENTATION[`${card.modelCode}:${card.functionType}`],
      ).toMatch(
        /^https:\/\/cloud\.tencent\.com\/document\/product\/1823\/\d+$/,
      );
      expect(endpointTestTemplate(card)).toMatchObject({
        model: card.modelCode,
      });
      if (card.executionMode === 'async')
        expect(card.taskApiPath?.includes('{taskId}')).toBe(
          protocolTaskMethod(card.protocol) === 'GET',
        );
    }
    expect(MODEL_ENDPOINT_PRESETS).toHaveLength(250);
    expect(cards.some((card) => card.functionType === 'webSearch')).toBe(false);
  });

  it('同步/异步语音与 TTS 路径以详细指南为准', () => {
    expect(
      TOKENHUB_OFFICIAL_PRESETS.filter(
        (card) => card.functionType === 'speechRecognition',
      ).map((card) => card.apiPath),
    ).toEqual([
      '/v1/wand/asrproxy/sync_transcribe',
      '/v1/wand/asrproxy/sync_transcribe',
    ]);
    expect(
      TOKENHUB_OFFICIAL_PRESETS.find(
        (card) => card.modelCode === 'minimax-speech-2.8-hd',
      )?.apiPath,
    ).toBe('/v1/wand/minimax-tts/sync_tts');
    const v2 = TOKENHUB_OFFICIAL_PRESETS.find(
      (card) => card.modelCode === 'minimax-video-h3',
    );
    expect(v2).toMatchObject({
      apiPath: '/v1/wand/minimax-video-v2/generation',
      taskApiPath: '/v1/wand/minimax-video-v2/tasks/{taskId}',
    });
  });

  it('不登记已下线别名、未核实端点或不支持的场景', () => {
    const models = new Set(
      TOKENHUB_OFFICIAL_PRESETS.map((card) => card.modelCode),
    );
    for (const code of [
      ...TOKENHUB_UNVERIFIED_MODELS,
      'qwen3.5-plus',
      'qwen3.5-flash',
      'kl-video-v3',
    ])
      expect(models.has(code)).toBe(false);
    expect(
      TOKENHUB_OFFICIAL_PRESETS.filter(
        (card) => card.modelCode === 'vidu-video-q4-preview',
      )
        .map((card) => card.functionType)
        .sort(),
    ).toEqual(['imageToVideo', 'referenceToVideo']);
    expect(
      TOKENHUB_OFFICIAL_PRESETS.filter(
        (card) => card.modelCode === 'minimax-video-v2.3-fast',
      ).map((card) => card.functionType),
    ).toEqual(['imageToVideo']);
    expect(models.has('wand-vega-image-1.5-pro')).toBe(true);
  });
});
