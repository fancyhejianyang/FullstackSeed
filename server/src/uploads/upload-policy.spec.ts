import {
  PUBLIC_UPLOAD_LIMIT,
  uploadMimeType,
  validatePublicUpload,
} from './upload-policy';

describe('ordinary upload boundary', () => {
  const upload = (
    originalname: string,
    buffer: Buffer,
    mimetype = 'application/octet-stream',
  ) => ({ originalname, buffer, size: buffer.length, mimetype });

  it.each(['payload.html', 'script.svg', 'shell.exe', 'filename'])(
    'rejects active/unsupported files %s',
    (name) => {
      expect(() => uploadMimeType(name)).toThrow('不支持此文件类型');
    },
  );

  it('rejects empty and oversized content even without multipart middleware', () => {
    expect(() =>
      validatePublicUpload(upload('file.txt', Buffer.alloc(0))),
    ).toThrow('文件内容为空');
    expect(() =>
      validatePublicUpload(
        upload('file.txt', Buffer.alloc(PUBLIC_UPLOAD_LIMIT + 1)),
      ),
    ).toThrow('20 MB');
  });

  it('does not trust an image MIME or extension alone', () => {
    expect(() =>
      validatePublicUpload(
        upload('image.png', Buffer.from('<svg/>'), 'image/png'),
      ),
    ).toThrow('内容与扩展名');
    expect(() =>
      validatePublicUpload(
        upload(
          'image.jpg',
          Buffer.from('89504e470d0a1a0a', 'hex'),
          'image/jpeg',
        ),
      ),
    ).toThrow('内容与扩展名');
  });

  it('normalizes the served MIME from supported extension', () => {
    const file = validatePublicUpload(
      upload('notes.TXT', Buffer.from('<script>text</script>'), 'text/html'),
    );
    expect(file.mimetype).toBe('text/plain');
  });
});
