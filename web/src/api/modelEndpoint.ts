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
  | "startEndToVideo";
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
  | "tokenhubViduVideo";
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
  createdAt: string;
  updatedAt: string;
}
export interface ModelEndpointOptions {
  platforms: Array<{ value: ModelPlatform; label: string }>;
  functions: Array<{ value: ModelFunction; label: string }>;
  protocols: Array<{
    value: ModelProtocol;
    label: string;
    functions: ModelFunction[];
    executionMode: "sync" | "async";
  }>;
}
export interface QueryModelEndpointParams {
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
