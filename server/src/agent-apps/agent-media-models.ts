/** 媒体模型使用独立能力目录；引用不存密钥或由客户端提交供应商地址。 */
export interface AgentModelReference {
  providerId: number;
  model: string;
}

export interface AgentMediaModels {
  vision: AgentModelReference | null;
  imageGeneration: AgentModelReference | null;
}
