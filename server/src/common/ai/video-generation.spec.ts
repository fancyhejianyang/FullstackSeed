import { BadRequestException } from '@nestjs/common';
import {
  videoGenerationRequest,
  videoTaskId,
  videoTaskResult,
} from './video-generation';

describe('video generation protocol', () => {
  it('为图生视频注入首帧和固定视频参数', () => {
    expect(
      videoGenerationRequest({
        model: 'wan2.6-i2v',
        prompt: '镜头向前推进',
        generationMode: 'imageToVideo',
        referenceImageDataUrl: 'data:image/png;base64,AAAA',
        resolution: '720P',
        ratio: '16:9',
        duration: 5,
      }),
    ).toMatchObject({
      input: {
        media: [{ type: 'first_frame', url: 'data:image/png;base64,AAAA' }],
      },
      parameters: { resolution: '720P', ratio: '16:9', duration: 5 },
    });
  });

  it('拒绝缺少首帧的图生视频请求', () => {
    expect(() =>
      videoGenerationRequest({
        model: 'wan2.6-i2v',
        prompt: '移动',
        generationMode: 'imageToVideo',
        resolution: '720P',
        ratio: '16:9',
        duration: 5,
      }),
    ).toThrow(BadRequestException);
  });

  it('解析异步任务编号、运行状态与视频地址', () => {
    expect(videoTaskId({ output: { task_id: 'task-1' } })).toBe('task-1');
    expect(videoTaskResult({ output: { task_status: 'RUNNING' } })).toEqual({
      status: 'pending',
    });
    expect(
      videoTaskResult({
        output: { task_status: 'SUCCEEDED', video_url: 'https://a/b.mp4' },
      }),
    ).toEqual({ status: 'succeeded', videoUrl: 'https://a/b.mp4' });
  });
});
