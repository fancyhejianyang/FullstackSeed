import request from "@/utils/request";

export type AiMaterialStyleKey =
  | "original"
  | "photorealistic"
  | "watercolor"
  | "flatIllustration"
  | "cinematic"
  | "custom";
export type AiMaterialGenerationMode = "textToImage" | "imageToImage";
export type AiMaterialStatus =
  | "idle"
  | "pending"
  | "running"
  | "storing"
  | "succeeded"
  | "failed"
  | "interrupted";

export interface MaterialTaskSummary {
  id: number;
  materialId: number;
  materialVersion: number;
  status: Exclude<AiMaterialStatus, "idle"> | "unknown";
  resultFileId: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AiMaterialSummary {
  id: number;
  generationMode: AiMaterialGenerationMode;
  styleKey: AiMaterialStyleKey;
  aiConfigId: number;
  aiConfigName: string;
  aiModel: string;
  currentFileId: number | null;
  currentImageUrl: string | null;
  referenceFileId: number | null;
  referenceImageUrl: string | null;
  version: number;
  generationRevision: number;
  generationStatus: AiMaterialStatus;
  generationError: string | null;
  promptPreview: string;
  hasCustomStyle: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiMaterial extends Omit<AiMaterialSummary, "promptPreview"> {
  prompt: string;
  customStyle: string | null;
  latestTask: MaterialTaskSummary | null;
}

export interface AiMaterialForm {
  prompt: string;
  generationMode: AiMaterialGenerationMode;
  styleKey: AiMaterialStyleKey;
  customStyle?: string | null;
  aiConfigId: number | "";
  referenceImageUrl?: string | null;
  referenceImageFile?: File | null;
}

export interface AiMaterialListResult {
  list: AiMaterialSummary[];
  total: number;
}

export interface AiMaterialConfigOption {
  id: number;
  name: string;
  model: string;
  supportsImageToImage: boolean;
}

export function getAiMaterials(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: AiMaterialStatus | "";
}) {
  return request.get<unknown, AiMaterialListResult>("/ai-materials", {
    params,
  });
}

export function getAiMaterial(id: number) {
  return request.get<unknown, AiMaterial>(`/ai-materials/${id}`);
}

export function getAiMaterialConfigOptions() {
  return request.get<
    unknown,
    { list: AiMaterialConfigOption[]; total: number }
  >("/ai-materials/config-options", { params: { pageSize: 100 } });
}

export function createAiMaterial(data: AiMaterialForm) {
  return request.post<unknown, AiMaterial>(
    "/ai-materials",
    toMaterialFormData(data),
  );
}

export function updateAiMaterial(id: number, data: AiMaterialForm) {
  return request.patch<unknown, AiMaterial>(
    `/ai-materials/${id}`,
    toMaterialFormData(data),
  );
}

function toMaterialFormData(data: AiMaterialForm) {
  const body = new FormData();
  body.append("prompt", data.prompt);
  body.append("generationMode", data.generationMode);
  body.append("styleKey", data.styleKey);
  body.append("aiConfigId", String(data.aiConfigId));
  if (data.customStyle) body.append("customStyle", data.customStyle);
  if (data.generationMode === "imageToImage" && data.referenceImageFile) {
    body.append("referenceImage", data.referenceImageFile);
  }
  return body;
}

export function deleteAiMaterial(id: number) {
  return request.delete<unknown, { id: number }>(`/ai-materials/${id}`);
}

export function batchDeleteAiMaterials(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    "/ai-materials/batch-delete",
    {
      ids: ids.map(Number),
    },
  );
}

export function generateAiMaterial(
  id: number,
  version: number,
  requestId: string,
) {
  return request.post<unknown, MaterialTaskSummary>(
    `/ai-materials/${id}/generate`,
    {
      version,
      requestId,
    },
  );
}
