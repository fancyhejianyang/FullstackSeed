import request from '@/utils/request';
import type { KnowledgeAiProvider } from './knowledgeAiProvider';
export type ProviderOption = Pick<
  KnowledgeAiProvider,
  | 'id'
  | 'name'
  | 'isEnabled'
  | 'models'
  | 'textModels'
  | 'visionModels'
  | 'imageGenerationModels'
  | 'embeddingModels'
>;
export interface MineruOption {
  id: number;
  name: string;
  isEnabled: boolean;
}
export function getThirdPartyOptions() {
  return request.get<
    unknown,
    { providers: ProviderOption[]; mineruConfigs: MineruOption[] }
  >('/third-party-config/options');
}
export interface ThirdPartySummary {
  key: string;
  name: string;
  path: string;
  status: 'configured' | 'empty' | 'unsupported' | 'unavailable';
  total: number;
  enabled: number;
  updatedAt: string | null;
}
export function getThirdPartyOverview() {
  return request.get<unknown, ThirdPartySummary[]>(
    '/third-party-config/overview',
  );
}
