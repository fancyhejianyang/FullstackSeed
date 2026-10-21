import request from "@/utils/request";

export type AiMaterialStyleKey =
  | "original"
  | "photorealistic"
  | "watercolor"
  | "flatIllustration"
  | "cinematic"
  | "custom";
export type AiMaterialGenerationMode =
  | "textToImage"
  | "imageToImage"
  | "textToVideo"
  | "imageToVideo"
  | "referenceToVideo";
export type AiMaterialReferenceMediaType =
  | "reference_image"
  | "reference_video";
export interface AiMaterialReferenceMedia {
  type: AiMaterialReferenceMediaType;
  url: string;
}
export type AiMaterialMediaType = "image" | "video";
export type AiMaterialVideoResolution = "480P" | "720P" | "1080P";
export type AiMaterialVideoRatio =
  | "adaptive"
  | "21:9"
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4";
export type AiMaterialVideoDuration = number;
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
  providerTaskId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AiMaterialSummary {
  id: number;
  generationMode: AiMaterialGenerationMode;
  mediaType: AiMaterialMediaType;
  currentMediaType: AiMaterialMediaType | null;
  videoResolution: AiMaterialVideoResolution;
  videoRatio: AiMaterialVideoRatio;
  videoDuration: AiMaterialVideoDuration;
  styleKey: AiMaterialStyleKey;
  aiConfigId: number;
  aiConfigName: string;
  aiModel: string;
  currentFileId: number | null;
  currentImageUrl: string | null;
  currentMediaUrl: string | null;
  referenceFileId: number | null;
  referenceImageUrl: string | null;
  referenceCount: number;
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
  referenceMedia: AiMaterialReferenceMedia[] | null;
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
  referenceMedia?: AiMaterialReferenceMedia[] | null;
  videoResolution: AiMaterialVideoResolution;
  videoRatio: AiMaterialVideoRatio;
  videoDuration: AiMaterialVideoDuration;
}

export interface AiMaterialListResult {
  list: AiMaterialSummary[];
  total: number;
}

export interface AiMaterialConfigOption {
  id: number;
  name: string;
  model: string;
  featureType: "imageGeneration" | "videoGeneration";
  supportsImageToImage: boolean;
  supportsImageToVideo: boolean;
}

export function getAiMaterials(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: AiMaterialStatus | "";
  mediaType?: AiMaterialMediaType | "";
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
  body.append("videoResolution", data.videoResolution);
  body.append("videoRatio", data.videoRatio);
  body.append("videoDuration", String(data.videoDuration));
  if (data.customStyle) body.append("customStyle", data.customStyle);
  if (
    ["imageToImage", "imageToVideo"].includes(data.generationMode) &&
    data.referenceImageFile
  ) {
    body.append("referenceImage", data.referenceImageFile);
  }
  if (data.generationMode === "referenceToVideo") {
    body.append("referenceMedia", JSON.stringify(data.referenceMedia ?? []));
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
