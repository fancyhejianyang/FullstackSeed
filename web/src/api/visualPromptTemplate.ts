import request from "@/utils/request";

export type VisualPromptMediaType = "image" | "video";

export interface VisualPromptTemplateForm {
  name: string;
  mediaType: VisualPromptMediaType;
  targetModel?: string;
  sourcePlatform?: string;
  aiConfigId: number | "";
  sourcePrompt: string;
  sourceNegativePrompt?: string;
  positiveTemplate?: string;
  negativeTemplate?: string;
  styleSummary?: string;
  modelRules?: string;
  variables?: string[];
  isEnabled: boolean;
}

export interface VisualPromptTemplate {
  id: number;
  name: string;
  mediaType: VisualPromptMediaType;
  aiConfigId: number;
  aiConfigName: string;
  targetModel: string | null;
  sourcePlatform: string | null;
  sourcePrompt: string;
  sourceNegativePrompt: string | null;
  positiveTemplate: string | null;
  negativeTemplate: string | null;
  styleSummary: string | null;
  modelRules: string | null;
  variables: string[] | null;
  isEnabled: boolean;
  version: number;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VisualPromptTemplateSummary = Pick<
  VisualPromptTemplate,
  | "id"
  | "name"
  | "mediaType"
  | "targetModel"
  | "styleSummary"
  | "aiConfigName"
  | "version"
  | "isEnabled"
  | "extractedAt"
  | "updatedAt"
>;

export type VisualPromptTemplateOption = Pick<
  VisualPromptTemplate,
  "id" | "name" | "mediaType" | "targetModel" | "styleSummary" | "version"
>;

export interface VisualPromptComposeResult {
  positivePrompt: string;
  negativePrompt: string;
  notes: string;
  templateId: number;
  templateVersion: number;
  targetModel: string;
}

export function getVisualPromptTemplates(params: Record<string, unknown>) {
  return request.get<
    unknown,
    { list: VisualPromptTemplateSummary[]; total: number }
  >("/visual-prompt-templates", { params });
}
export function getVisualPromptTemplate(id: number) {
  return request.get<unknown, VisualPromptTemplate>(
    `/visual-prompt-templates/${id}`,
  );
}
export function getVisualPromptTemplateOptions(params: {
  mediaType: VisualPromptMediaType;
  targetModel?: string;
}) {
  return request.get<unknown, VisualPromptTemplateOption[]>(
    "/visual-prompt-templates/options",
    { params },
  );
}
export function getVisualPromptAiConfigOptions() {
  return request.get<
    unknown,
    Array<{ id: number; name: string; model: string | null }>
  >("/visual-prompt-templates/ai-config-options");
}
export function createVisualPromptTemplate(data: VisualPromptTemplateForm) {
  return request.post<unknown, VisualPromptTemplate>(
    "/visual-prompt-templates",
    data,
  );
}
export function updateVisualPromptTemplate(
  id: number,
  data: VisualPromptTemplateForm,
) {
  return request.patch<unknown, VisualPromptTemplate>(
    `/visual-prompt-templates/${id}`,
    data,
  );
}
export function extractVisualPromptTemplate(id: number) {
  return request.post<unknown, VisualPromptTemplate>(
    `/visual-prompt-templates/${id}/extract`,
  );
}
export function composeVisualPromptTemplate(
  id: number,
  data: { idea: string; targetModel?: string },
) {
  return request.post<unknown, VisualPromptComposeResult>(
    `/visual-prompt-templates/${id}/compose`,
    data,
  );
}
export function deleteVisualPromptTemplate(id: number) {
  return request.delete(`/visual-prompt-templates/${id}`);
}
export function batchDeleteVisualPromptTemplates(ids: Array<string | number>) {
  return request.post("/visual-prompt-templates/batch-delete", {
    ids: ids.map(Number),
  });
}
