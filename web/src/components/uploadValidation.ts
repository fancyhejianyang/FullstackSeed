const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml',
  tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', m4v: 'video/x-m4v', mp3: 'audio/mpeg', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  json: 'application/json', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** accept is also checked for drag/drop, where the browser's file picker cannot enforce it. */
export function matchesUploadAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  const rules = accept.toLowerCase().split(',').map((rule) => rule.trim()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const extension = name.split('.').pop() ?? '';
  // Some browsers provide no MIME for local documents/videos. Only then infer from the extension.
  const mime = file.type.toLowerCase() || mimeByExtension[extension] || '';
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule === '*/*') return true;
    if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
    return mime === rule;
  });
}

export function validateUploadFile(file: File, accept: string, maxSizeMb: number): void {
  if (!file.size) throw new Error('不能上传空文件');
  if (maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`文件不能超过 ${maxSizeMb}MB`);
  }
  if (!matchesUploadAccept(file, accept)) throw new Error(`文件类型不符合要求（${accept}）`);
}

/** Decode the actual bytes before accepting an image; changing a file extension is insufficient. */
export function validateUploadImage(file: File, signal: AbortSignal): Promise<void> {
  if (!matchesUploadAccept(file, 'image/*')) return Promise.reject(new Error('请选择图片文件'));
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      image.onload = null;
      image.onerror = null;
      image.src = '';
      URL.revokeObjectURL(objectUrl);
      if (error) reject(error);
      else resolve();
    };
    const aborted = () => finish(new DOMException('已取消', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('图片读取超时，请重新选择')), 15000);
    signal.addEventListener('abort', aborted, { once: true });
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? undefined : new Error('图片内容无效'));
    image.onerror = () => finish(new Error('图片无法读取，请选择有效的图片'));
    if (signal.aborted) aborted();
    else image.src = objectUrl;
  });
}
