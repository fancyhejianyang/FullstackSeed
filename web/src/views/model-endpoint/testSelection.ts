import type { ModelEndpointTestOptions } from "@/api/modelEndpoint";

/** 仅说明后端排除原因，不将这些账号加入可选目录。 */
export function getExcludedEndpointTestAccountsHint(
  data: ModelEndpointTestOptions | null | undefined,
): string {
  if (!data?.excludedAccounts?.length) return "";
  return `未列为候选的同平台启用账号：${data.excludedAccounts
    .map((account) => `${account.name}：${account.reason}`)
    .join("；")}。`;
}

/** 只回填已返回的账号与目录，不发起测试或改变供应商配置。 */
export function getInitialEndpointTestForm(data: ModelEndpointTestOptions): {
  providerId: number | "";
  model: string;
  requestBody: string;
} {
  const previous = data.recentTest;
  const isBuiltin = data.card.source === "builtin";
  const restoringRemovedModel = previous?.result.modelRemoved === true;
  const accounts = isBuiltin
    ? data.accounts.filter((account) => account.models?.length)
    : data.accounts;
  const previousAccount = previous
    ? accounts.find((account) => account.id === previous.providerId)
    : undefined;
  const account = restoringRemovedModel
    ? undefined
    : (previousAccount ??
      (isBuiltin || accounts.length === 1 ? accounts[0] : undefined));
  const model = isBuiltin
    ? (account?.models?.find(
        (item) =>
          item.code === (previousAccount ? previous?.result.model : undefined),
      )?.code ??
      account?.models?.[0]?.code ??
      "")
    : (previous?.result.model ?? "");

  return {
    providerId: account?.id ?? "",
    model,
    // 显式同步模板，不依赖相同模型值是否触发 Vue watch。
    requestBody: JSON.stringify(
      isBuiltin
        ? { ...data.requestBody, model: model || "REPLACE_WITH_MODEL_CODE" }
        : data.requestBody,
      null,
      2,
    ),
  };
}
