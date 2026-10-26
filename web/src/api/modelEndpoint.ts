import request from "@/utils/request";
import type { ModelPlatform } from "@/utils/modelPlatform";

export type ModelFunction =
  | "chat"
  | "vision"
  | "embedding"
  | "textToImage"
  | "imageToImage"
  | "textToVideo"
  | "imageToVideo"
  | "referenceToVideo"
  | "startEndToVideo"
  | ExtendedModelFunction;
export type ExtendedModelFunction =
  | "omniVideo"
  | "motionControl"
  | "avatarVideo"
  | "videoUnderstanding"
  | "multimodalEmbedding"
  | "textTo3d"
  | "imageTo3d"
  | "multiViewTo3d"
  | "threeDComponent"
  | "threeDFormat"
  | "threeDTexture"
  | "threeDUv"
  | "threeDRetopology"
  | "threeDRiggingCheck"
  | "threeDRigging"
  | "threeDAnimation"
  | "threeDMotion"
  | "worldScene"
  | "worldPanorama"
  | "speechRecognition"
  | "speechRecognitionAsync"
  | "speechSynthesis"
  | "voiceClone"
  | "voiceDesign"
  | "dubbing"
  | "musicGeneration"
  | "musicEasyGeneration"
  | "instrumentalGeneration";
export type ModelProtocol =
  | "openaiChat"
  | "openaiEmbedding"
  | "openaiImages"
  | "dashscopeImage"
  | "dashscopeVideo"
  | "tokenhubHunyuanImage"
  | "tokenhubHunyuanImageChat"
  | "tokenhubSeedreamImage"
  | "tokenhubViduImage"
  | "tokenhubHunyuanVideo"
  | "tokenhubViduVideo"
  | "tokenhubWandImage"
  | "tokenhubKlingImage"
  | "tokenhubWandVideo"
  | "tokenhubPixverseVideo"
  | "tokenhubKlingVideo"
  | "tokenhubMinimaxVideo"
  | "tokenhubMinimaxVideoV2"
  | "tokenhubYoutuVideo"
  | "tokenhub3d"
  | "tokenhubWorldScene"
  | "tokenhubWorldPanorama"
  | "tokenhubAsrSync"
  | "tokenhubAsrAsync"
  | "tokenhubTts"
  | "tokenhubVoiceClone"
  | "tokenhubVoiceDesign"
  | "tokenhubDubbing"
  | "tokenhubMusic"
  | "tokenhubMurekaMusic"
  | "tokenhubMultimodalEmbedding";
export type ModelCategory =
  | "language"
  | "image"
  | "video"
  | "threeD"
  | "audio"
  | "understanding"
  | "embedding";
export interface ModelEndpointForm {
  platformType: ModelPlatform;
  modelCode: string;
  modelName: string;
  functionType: ModelFunction;
  protocol: ModelProtocol;
  apiPath: string;
  taskApiPath: string;
  executionMode: "sync" | "async";
  isActive: boolean;
}
export interface ModelEndpoint extends ModelEndpointForm {
  id: number;
  source: "builtin" | "configured";
  isReadOnly: boolean;
  createdAt?: string;
  updatedAt?: string;
  taskMethod?: "GET" | "POST";
  category?: ModelCategory;
  documentationUrl?: string | null;
}
export interface ModelEndpointOptions {
  categories?: Array<{ value: ModelCategory; label: string }>;
  platforms: Array<{ value: ModelPlatform; label: string }>;
  functions: Array<{ value: ModelFunction; label: string }>;
  protocols: Array<{
    value: ModelProtocol;
    label: string;
    functions: ModelFunction[];
    executionMode: "sync" | "async";
    taskMethod?: "GET" | "POST";
  }>;
}
export interface QueryModelEndpointParams {
  source?: "builtin" | "configured";
  category?: ModelCategory | "";
  page?: number;
  pageSize?: number;
  keyword?: string;
  platformType?: ModelPlatform | "";
  functionType?: ModelFunction | "";
  isActive?: boolean | "";
}
export function getModelEndpoints(params: QueryModelEndpointParams) {
  return request.get<unknown, { list: ModelEndpoint[]; total: number }>(
    "/model-endpoints",
    { params },
  );
}
export function getModelEndpointOptions() {
  return request.get<unknown, ModelEndpointOptions>("/model-endpoints/options");
}
export function getModelEndpoint(id: number) {
  return request.get<unknown, ModelEndpoint>(`/model-endpoints/${id}`);
}
export function createModelEndpoint(data: ModelEndpointForm) {
  return request.post<unknown, ModelEndpoint>("/model-endpoints", data);
}
export function updateModelEndpoint(
  id: number,
  data: Partial<ModelEndpointForm>,
) {
  return request.patch<unknown, ModelEndpoint>(`/model-endpoints/${id}`, data);
}
export function deleteModelEndpoint(id: number) {
  return request.delete(`/model-endpoints/${id}`);
}
export function batchDeleteModelEndpoints(ids: Array<string | number>) {
  return request.post("/model-endpoints/batch-delete", {
    ids: ids.map(Number),
  });
}

export function importOfficialModelEndpoints() {
  return request.post<
    unknown,
    {
      added: number;
      skipped: number;
      total: number;
      unverifiedModels: string[];
    }
  >("/model-endpoints/import-official");
}

export interface ModelEndpointTestResult {
  requestId: string;
  status: "running" | "accepted" | "succeeded" | "failed" | "unknown";
  message: string;
  httpStatus: number | null;
  responseBody: string;
  taskId: string | null;
  elapsedMilliseconds: number;
  checkedAt: string;
  model?: string;
  apiPath?: string;
  providerId?: number;
  modelRemoved?: boolean;
}
export interface ModelEndpointTestOptions {
  card: ModelEndpoint;
  accounts: Array<{
    id: number;
    name: string;
    models?: Array<{ code: string; name: string }>;
    apiPath?: string;
  }>;
  requestBody: Record<string, unknown>;
  recentTest: { providerId: number; result: ModelEndpointTestResult } | null;
  accountCatalogRequired?: boolean;
}
export function getModelEndpointTestOptions(id: number) {
  return request.get<unknown, ModelEndpointTestOptions>(
    `/model-endpoint-tests/${id}/accounts`,
    { silentError: true },
  );
}
export function testModelEndpoint(
  id: number,
  data: {
    providerId: number;
    model?: string;
    requestId: string;
    requestBody: Record<string, unknown>;
  },
) {
  return request.post<unknown, ModelEndpointTestResult>(
    `/model-endpoint-tests/${id}`,
    data,
    { timeout: 75000, silentError: true },
  );
}
export function queryModelEndpointTest(id: number, requestId: string) {
  return request.get<unknown, ModelEndpointTestResult>(
    `/model-endpoint-tests/${id}/${requestId}`,
    { timeout: 35000, silentError: true },
  );
}
