import type { CreateModelEndpointDto } from './dto/model-endpoint.dto';
import {
  PROTOCOLS,
  type ModelFunction,
  type ModelProtocol,
} from './model-endpoint.constants';

/** 来源：腾讯 TokenHub 135745/135746/136609/137202/135756；不按名称拼接口。 */
export const MODEL_ENDPOINT_PRESETS: CreateModelEndpointDto[] = [];
function add(
  modelCode: string,
  modelName: string,
  protocol: ModelProtocol,
  apiPath: string,
  functions: ModelFunction[],
  taskApiPath = '',
) {
  for (const functionType of functions)
    MODEL_ENDPOINT_PRESETS.push({
      platformType: 'tencentTokenhub',
      modelCode,
      modelName,
      functionType,
      protocol,
      apiPath: '/v1/wand' + apiPath,
      taskApiPath: taskApiPath ? '/v1/wand' + taskApiPath : '',
      executionMode: PROTOCOLS[protocol].mode,
      isActive: true,
    });
}
add(
  'hy-image-v3',
  '混元 Image 3.0',
  'tokenhubHunyuanImage',
  '/hunyuan-image/v3-generation',
  ['textToImage', 'imageToImage'],
);
add(
  'hy-image-v3.5-preview',
  '混元 Image 3.5 Preview',
  'tokenhubHunyuanImageChat',
  '/hunyuan-image/v35-generation',
  ['textToImage', 'imageToImage'],
);
add(
  'seedream-image-v5.0-pro',
  'Seedream Image 5.0 Pro',
  'tokenhubSeedreamImage',
  '/si-image/generation',
  ['textToImage', 'imageToImage'],
);
add(
  'vidu-image-q2',
  'Vidu Image Q2',
  'tokenhubViduImage',
  '/vidu-image/generation',
  ['textToImage', 'imageToImage'],
  '/vidu-image/tasks/{taskId}',
);
add(
  'hy-video-v1.5',
  '混元 Video 1.5',
  'tokenhubHunyuanVideo',
  '/hunyuan-video/generation',
  ['textToVideo', 'imageToVideo'],
  '/hunyuan-video/tasks/{taskId}',
);
add(
  'vidu-video-q2',
  'Vidu Video Q2',
  'tokenhubViduVideo',
  '/vidu/text-to-video',
  ['textToVideo'],
  '/vidu/tasks/{taskId}',
);
add(
  'vidu-video-q2-pro',
  'Vidu Video Q2 Pro',
  'tokenhubViduVideo',
  '/vidu/image-to-video',
  ['imageToVideo'],
  '/vidu/tasks/{taskId}',
);
add(
  'vidu-video-q2-pro',
  'Vidu Video Q2 Pro',
  'tokenhubViduVideo',
  '/vidu/reference-to-video',
  ['referenceToVideo'],
  '/vidu/tasks/{taskId}',
);
add(
  'vidu-video-q2-pro',
  'Vidu Video Q2 Pro',
  'tokenhubViduVideo',
  '/vidu/start-end-to-video',
  ['startEndToVideo'],
  '/vidu/tasks/{taskId}',
);
MODEL_ENDPOINT_PRESETS.push(
  {
    platformType: 'aliyunBailian',
    modelCode: 'qwen-plus',
    modelName: '千问 Plus',
    functionType: 'chat',
    protocol: 'openaiChat',
    apiPath: '/compatible-mode/v1/chat/completions',
    executionMode: 'sync',
    isActive: true,
  },
  {
    platformType: 'aliyunBailian',
    modelCode: 'qwen-vl-plus',
    modelName: '千问 VL Plus',
    functionType: 'vision',
    protocol: 'openaiChat',
    apiPath: '/compatible-mode/v1/chat/completions',
    executionMode: 'sync',
    isActive: true,
  },
);
