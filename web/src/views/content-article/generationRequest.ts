import { generateContentArticle } from '@/api/contentArticle';

type Payload = Parameters<typeof generateContentArticle>[1];

// 失败响应可能是任务已落库但回执丢失。再次点击先重放原请求，避免再次计费。
export function createGenerationSubmitter() {
  const pending = new Map<number, Payload>();
  return async (
    articleId: number,
    resolve: () => Promise<Omit<Payload, 'requestId'> | null>,
  ) => {
    let payload = pending.get(articleId);
    if (!payload) {
      const selection = await resolve();
      if (!selection) return false;
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      payload = {
        ...selection,
        requestId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      };
      pending.set(articleId, payload);
    }
    try {
      await generateContentArticle(articleId, payload);
      pending.delete(articleId);
      return true;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      // 明确拒绝的请求没有入队，允许修正后重新选择；网络/服务端异常保留请求号。
      if (
        status &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429
      )
        pending.delete(articleId);
      throw error;
    }
  };
}
