import request from '@/utils/request';

export interface DocumentParseRule {
  id: number;
  name: string;
  textMaxSizeMb: number;
  textMaxLines: number;
  pdfPagesPerPart: number;
  wordParagraphsPerPart: number;
  preferSentenceBoundary: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentParseRuleForm {
  name: string;
  textMaxSizeMb: number;
  textMaxLines: number;
  pdfPagesPerPart: number;
  wordParagraphsPerPart: number;
  preferSentenceBoundary: boolean;
  isEnabled: boolean;
}

export function getCurrentDocumentParseRule() {
  return request.get<unknown, DocumentParseRule>('/document-parse-rules/current');
}

export function saveCurrentDocumentParseRule(data: DocumentParseRuleForm) {
  return request.post<unknown, DocumentParseRule>(
    '/document-parse-rules/current',
    data,
  );
}
