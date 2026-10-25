const catalogFields = [
  "models",
  "textModels",
  "visionModels",
  "imageGenerationModels",
  "videoGenerationModels",
  "embeddingModels",
] as const;

type CatalogField = (typeof catalogFields)[number];
type ModelCatalog = { id: number } & Partial<
  Record<CatalogField, string | null>
>;
export interface RemovedModelResult {
  modelRemoved?: boolean;
  providerId?: number;
  model?: string;
}

/** 只响应服务端已持久化的移除结果，不根据失败文案猜测。 */
export function removeRetiredModelOptions<T extends ModelCatalog>(
  providers: T[],
  result: RemovedModelResult,
): T[] {
  const model = result.model?.trim();
  if (result.modelRemoved !== true || !result.providerId || !model)
    return providers;
  return providers.map((provider) => {
    if (provider.id !== result.providerId) return provider;
    const catalogs: Partial<Record<CatalogField, string>> = {};
    for (const field of catalogFields) {
      const value = provider[field];
      if (typeof value !== "string") continue;
      catalogs[field] = value
        .split(/\r?\n/)
        .filter((line) => line.split("#", 1)[0]?.trim() !== model)
        .join("\n");
    }
    return { ...provider, ...catalogs };
  });
}

export function removedModelMatchesSelection(
  result: RemovedModelResult,
  providerId: string | number | null | undefined,
  model: string | null | undefined,
): boolean {
  return (
    result.modelRemoved === true &&
    !!result.providerId &&
    !!result.model?.trim() &&
    result.providerId === Number(providerId) &&
    result.model.trim() === model?.trim()
  );
}
