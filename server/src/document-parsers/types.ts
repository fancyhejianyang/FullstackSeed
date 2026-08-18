export type DocumentParseContentType = 'text' | 'pdf' | 'word';

export interface DocumentParseContext {
  contentType: DocumentParseContentType;
  contentText?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  file?: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    source: 'local' | 'remote';
  };
}

export interface DocumentParser {
  supports(contentType: DocumentParseContentType): boolean;
  parse(context: DocumentParseContext): Promise<string> | string;
}
