import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import type { UploadedStorageFile } from './uploads.service';

export const PUBLIC_UPLOAD_LIMIT = 20 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export function uploadMimeType(name: string) {
  const type = MIME_TYPES[extname(name).toLowerCase()];
  if (!type)
    throw new BadRequestException(
      '不支持此文件类型，请上传图片、文档、压缩包或音视频文件',
    );
  return type;
}

/** Browser MIME is not a trust boundary; use the extension allowlist and verify binary signatures. */
export function validatePublicUpload(
  file: UploadedStorageFile,
): UploadedStorageFile {
  if (!file.buffer?.length) throw new BadRequestException('文件内容为空');
  if (
    file.buffer.length > PUBLIC_UPLOAD_LIMIT ||
    file.size > PUBLIC_UPLOAD_LIMIT
  )
    throw new BadRequestException('文件不能超过 20 MB');
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = uploadMimeType(file.originalname);
  const bytes = file.buffer;
  const prefix = (hex: string) =>
    bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const ascii = (start: number, end: number) =>
    bytes.toString('ascii', start, end);
  const zip = prefix('504b0304') || prefix('504b0506') || prefix('504b0708');
  const signatures: Record<string, boolean> = {
    '.png': bytes.length >= 24 && prefix('89504e470d0a1a0a'),
    '.jpg': prefix('ffd8ff'),
    '.jpeg': prefix('ffd8ff'),
    '.webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
    '.gif': ['GIF87a', 'GIF89a'].includes(ascii(0, 6)),
    '.bmp': prefix('424d'),
    '.avif': ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32)),
    '.pdf': ascii(0, 5) === '%PDF-',
    '.zip': zip,
    '.docx': zip,
    '.xlsx': zip,
    '.pptx': zip,
    '.doc': prefix('d0cf11e0a1b11ae1'),
    '.xls': prefix('d0cf11e0a1b11ae1'),
    '.ppt': prefix('d0cf11e0a1b11ae1'),
    '.rar': prefix('526172211a07'),
    '.7z': prefix('377abcaf271c'),
    '.mp4': ascii(4, 8) === 'ftyp',
    '.mov': ['ftyp', 'moov', 'wide', 'mdat'].includes(ascii(4, 8)),
    '.webm': prefix('1a45dfa3'),
    '.wav': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE',
    '.ogg': ascii(0, 4) === 'OggS',
    '.mp3':
      ascii(0, 3) === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
  };
  if (signatures[extension] === false)
    throw new BadRequestException('文件内容与扩展名不一致或文件已损坏');
  if (
    file.mimetype?.startsWith('image/') &&
    file.mimetype !== mimeType &&
    file.mimetype !== 'image/jpg'
  )
    throw new BadRequestException('图片格式与扩展名不一致');
  return { ...file, mimetype: mimeType, size: bytes.length };
}
