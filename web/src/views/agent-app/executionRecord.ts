import type { AgentExecution } from "@/api/agentWorkspace";

export function toolLabel(toolKey: string) {
  const labels: Record<string, string> = {
    "model.chat": "模型对话",
    "knowledge.answer": "知识增强",
    "product.query": "产品/SKU 查询",
    "productSku.create": "受控新增 SKU",
    "media.vision": "图片识别",
    "media.imageGeneration": "图片生成",
  };
  return Object.prototype.hasOwnProperty.call(labels, toolKey)
    ? labels[toolKey]
    : toolKey;
}

export function statusReasonLabel(reason: string | null) {
  if (!reason) return "-";
  const labels: Record<string, string> = {
    completed: "处理完成",
    waiting_input: "等待补充",
    waiting_confirmation: "等待确认",
    user_cancelled: "用户停止",
    execution_timeout: "执行超时",
    provider_or_runtime_error: "模型或运行失败",
    execution_failed: "执行失败",
    business_write_failed: "业务写入失败",
    stale_lease: "进程中断回收",
  };
  return Object.prototype.hasOwnProperty.call(labels, reason)
    ? labels[reason]
    : reason;
}

export function routingSummary(row: AgentExecution) {
  const trace = row.parameterSummary?.modelRouting;
  if (!trace) return "—";
  const strategies = {
    priority: "优先顺序",
    balanced: "均衡使用",
    intent: "意图调度",
    fixed: "指定模型",
  };
  const intents = {
    chat: "问答",
    query: "查询",
    write: "录入",
    analysis: "分析",
  };
  const purposes = { routing: "识别", planning: "规划", answer: "回答" };
  const reasons: Record<string, string> = {
    account_auth: "账号鉴权失败",
    account_balance: "账号余额不足",
    quota: "额度不足",
    rate_limit: "限流",
    timeout: "超时",
    context_length: "上下文超限",
    model_unavailable: "模型不可用",
    request_failed: "请求失败",
    invalid_output: "识别格式无效",
  };
  return [
    `${strategies[trace.strategy] || "未知策略"}${trace.selectedModel ? ` · ${trace.selectedModel}` : ""}`,
    trace.decision
      ? `${intents[trace.decision.intent] || "未知意图"} · ${trace.decision.complexity === "complex" ? "复杂" : "简单"}${trace.decision.source === "fallback" ? "（保守回退）" : ""}`
      : "",
    ...(Array.isArray(trace.attempts) ? trace.attempts : []).map(
      (attempt) =>
        `${purposes[attempt.purpose] || "模型调用"}：${attempt.model} · ${attempt.status === "succeeded" ? "成功" : reasons[attempt.reason ?? ""] || "失败"}${attempt.totalTokens == null ? "" : ` · ${attempt.totalTokens} tokens`}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
