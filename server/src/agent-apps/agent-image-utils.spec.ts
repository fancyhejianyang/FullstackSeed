import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { get } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AGENT_IMAGE_LIMIT, downloadGeneratedImage } from './agent-image-utils';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ get: jest.fn() }));
const lookupMock = lookup as unknown as jest.Mock<
  Promise<LookupAddress[]>,
  [string, { all: true; family: 4 }]
>;
const getMock = get as unknown as jest.Mock<
  ClientRequest,
  [URL, RequestOptions, (response: IncomingMessage) => void]
>;

function response(status: number, data = Buffer.from('image')) {
  const emitter = new EventEmitter();
  const request = Object.assign(emitter, {
    setTimeout: jest.fn(),
    destroy: jest.fn((error: Error) => {
      emitter.emit('error', error);
      return emitter;
    }),
  });
  getMock.mockImplementationOnce((_url, _options, callback) => {
    setImmediate(() => {
      const stream = Object.assign(new PassThrough(), { statusCode: status });
      callback(stream as unknown as IncomingMessage);
      stream.end(data);
    });
    return request as unknown as ClientRequest;
  });
  return request;
}

describe('generated image download boundary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  it('pins the validated IP and never forwards provider authorization to the image host', async () => {
    const request = response(200);
    await expect(
      downloadGeneratedImage(
        'https://cdn.example/image.png?signature=signed',
        new AbortController().signal,
      ),
    ).resolves.toEqual(Buffer.from('image'));
    const options = getMock.mock.calls[0][1];
    const callback = jest.fn();
    options.lookup!('cdn.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
    ]);
    expect(options.headers).toBeUndefined();
    expect(request.setTimeout).toHaveBeenCalledWith(
      30000,
      expect.any(Function),
    );
  });

  it('rejects non-HTTPS, userinfo, unusual ports and mixed public/private DNS answers', async () => {
    for (const value of [
      'http://cdn.example/a.png',
      'https://name:secret@cdn.example/a.png',
      'https://cdn.example:8443/a.png',
    ]) {
      await expect(
        downloadGeneratedImage(value, new AbortController().signal),
      ).rejects.toThrow('不安全');
    }
    lookupMock.mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(
      downloadGeneratedImage(
        'https://cdn.example/a.png',
        new AbortController().signal,
      ),
    ).rejects.toThrow('公网');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('does not follow redirects and caps downloaded image size', async () => {
    response(302);
    await expect(
      downloadGeneratedImage(
        'https://cdn.example/a.png',
        new AbortController().signal,
      ),
    ).rejects.toThrow('不跟随重定向');
    expect(getMock).toHaveBeenCalledTimes(1);
    response(200, Buffer.alloc(AGENT_IMAGE_LIMIT + 1));
    await expect(
      downloadGeneratedImage(
        'https://cdn.example/a.png',
        new AbortController().signal,
      ),
    ).rejects.toThrow('10 MB');
  });

  it('does not start downloading if cancellation happened during DNS lookup', async () => {
    const controller = new AbortController();
    lookupMock.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve([{ address: '8.8.8.8', family: 4 }]);
    });
    await expect(
      downloadGeneratedImage('https://cdn.example/a.png', controller.signal),
    ).rejects.toThrow();
    expect(getMock).not.toHaveBeenCalled();
  });
});
