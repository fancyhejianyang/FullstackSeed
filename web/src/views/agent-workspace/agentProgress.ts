import type {
  AgentExecutionProgress,
  AgentProgressStage,
} from "@/api/agentWorkspace";

const labels: Record<AgentProgressStage, string> = {
  recognizing_image: "正在识别图片并理解内容",
  generating_image: "正在生成图片，请稍候",
  understanding: "正在理解需求",
  querying: "正在搜索业务数据",
  retrieving: "正在检索参考资料",
  preparing_draft: "正在整理录入草稿",
  generating: "AI 正在思考并生成回答",
  summarizing: "正在整理回答依据",
};

export function isAgentProgressActive(progress: AgentExecutionProgress) {
  return ["queued", "running", "submitting", "verifying"].includes(
    progress.status,
  );
}

export function agentProgressText(
  progress: AgentExecutionProgress | null,
  unavailable = false,
) {
  if (unavailable) return "正在等待处理结果，进度暂不可用";
  if (!progress) return "正在连接 Agent";
  if (progress.status === "cancelled") return "已停止";
  if (!isAgentProgressActive(progress)) return "正在同步处理结果";
  if (progress.status === "queued") return "正在排队等待处理";
  if (progress.status === "submitting") return "正在提交业务数据";
  if (progress.status === "verifying") return "正在核实执行结果";
  return (progress.stage && labels[progress.stage]) || "AI 正在处理";
}

/** 单请求串行轮询；代次隔离防止停止/新一轮后旧响应回写。 */
export function createAgentProgressPoller(options: {
  fetchProgress: (requestId: string) => Promise<AgentExecutionProgress | null>;
  onProgress: (progress: AgentExecutionProgress | null) => void;
  onUnavailable: () => void;
  intervalMs?: number;
}) {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    generation += 1;
    clearTimeout(timer);
    timer = undefined;
  }
  function start(requestId: string) {
    stop();
    const current = generation;
    let failures = 0;
    const poll = async () => {
      try {
        const progress = await options.fetchProgress(requestId);
        if (current !== generation) return;
        // 不接受其它请求的阶段，即使调用方意外返回错误结果。
        if (progress && progress.requestId !== requestId)
          throw new Error("进度请求不匹配");
        failures = 0;
        options.onProgress(progress);
        if (progress && !isAgentProgressActive(progress)) return;
      } catch {
        if (current !== generation) return;
        failures += 1;
        options.onUnavailable();
        if (failures >= 3) return;
      }
      if (current === generation) {
        timer = setTimeout(
          () => void poll(),
          failures ? 3000 : (options.intervalMs ?? 1200),
        );
      }
    };
    void poll();
  }
  return { start, stop };
}
