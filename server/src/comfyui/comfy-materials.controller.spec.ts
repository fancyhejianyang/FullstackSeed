import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { ComfyMaterialsController } from './comfy-materials.controller';

describe('ComfyMaterialsController task input upload', () => {
  it('uses task creation permission and stores the selected local file', async () => {
    const uploadTaskInput = jest.fn().mockResolvedValue({ id: 21 });
    const controller = new ComfyMaterialsController({
      uploadTaskInput,
    } as never);
    const file = {
      buffer: Buffer.from('video'),
      originalname: 'pose.mp4',
      mimetype: 'video/mp4',
      size: 5,
    };

    await expect(
      controller.uploadTaskInput({ userId: 7 } as never, file, '动作参考视频'),
    ).resolves.toEqual({ id: 21 });
    expect(uploadTaskInput).toHaveBeenCalledWith(7, file, '动作参考视频');
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        Reflect.get(
          ComfyMaterialsController.prototype,
          'uploadTaskInput',
        ) as object,
      ),
    ).toEqual(['ComfyTask.create']);
  });
});
