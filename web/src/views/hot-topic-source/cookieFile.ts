export const COOKIE_FILE_BYTE_LIMIT = 64 * 1024;

export function validateCookieFile(file: { name: string; size: number }) {
  if (!/\.txt$/i.test(file.name)) return '请选择 .txt 格式的 Cookie 文件';
  if (!file.size) return 'Cookie 文件不能为空';
  if (file.size > COOKIE_FILE_BYTE_LIMIT) return 'Cookie 文件不能超过 64 KB';
  return '';
}

/** 只在点击保存后读取本地文件，不产生公开上传地址。 */
export async function readCookieFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
): Promise<string> {
  const error = validateCookieFile(file);
  if (error) throw new Error(error);
  let content: string;
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > COOKIE_FILE_BYTE_LIMIT)
      throw new Error('Cookie 文件不能超过 64 KB');
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Cookie 文件读取失败，请选择 UTF-8 编码的 .txt 文件');
  }
  if (
    !content.split(/\r?\n/).some((line) => {
      const row = line.startsWith('#HttpOnly_') ? line.slice(10) : line;
      return !row.startsWith('#') && row.split('\t').length === 7;
    })
  )
    throw new Error('请选择浏览器导出的 Netscape 格式 cookies.txt 文件');
  return content;
}
