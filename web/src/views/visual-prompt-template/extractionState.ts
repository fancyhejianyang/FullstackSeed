import type {
  VisualPromptTask,
  VisualPromptTaskStatus,
} from "@/api/visualPromptTemplate";

export type VisualPromptExtractionStatus =
  | "submitting"
  | VisualPromptTaskStatus;

export interface VisualPromptExtractionState {
  runId: string;
  taskId: number | null;
  status: VisualPromptExtractionStatus;
  stage: string;
}

interface RunVisualPromptExtractionOptions<T extends VisualPromptTask> {
  templateId: number;
  states: Map<number, VisualPromptExtractionState>;
  createRunId: () => string;
  submit: (requestId: string) => Promise<T>;
  getTask: (taskId: number) => Promise<T>;
  wait: () => Promise<void>;
}

export function visualPromptExtractionLabel(
  state?: VisualPromptExtractionState,
) {
  if (!state) return "AI 提炼";
  if (state.status === "submitting") return "提交中";
  if (state.status === "pending") return "排队中";
  if (state.status === "running") return "提炼中";
  return "处理中";
}

export function updateVisualPromptExtractionState(
  states: Map<number, VisualPromptExtractionState>,
  templateId: number,
  runId: string,
  task: Pick<VisualPromptTask, "id" | "status" | "stage">,
) {
  const current = states.get(templateId);
  if (!current || current.runId !== runId) return false;
  states.set(templateId, {
    runId,
    taskId: task.id,
    status: task.status,
    stage: task.stage,
  });
  return true;
}

export function clearVisualPromptExtractionState(
  states: Map<number, VisualPromptExtractionState>,
  templateId: number,
  runId: string,
) {
  if (states.get(templateId)?.runId !== runId) return false;
  states.delete(templateId);
  return true;
}

export async function runVisualPromptExtraction<T extends VisualPromptTask>(
  options: RunVisualPromptExtractionOptions<T>,
) {
  if (options.states.has(options.templateId)) {
    throw new Error("该提示词总结正在排队或提炼");
  }
  const runId = options.createRunId();
  options.states.set(options.templateId, {
    runId,
    taskId: null,
    status: "submitting",
    stage: "正在提交 AI 提炼",
  });
  try {
    let task = await options.submit(runId);
    if (
      !updateVisualPromptExtractionState(
        options.states,
        options.templateId,
        runId,
        task,
      )
    ) {
      return task;
    }
    while (["pending", "running"].includes(task.status)) {
      await options.wait();
      task = await options.getTask(task.id);
      if (
        !updateVisualPromptExtractionState(
          options.states,
          options.templateId,
          runId,
          task,
        )
      ) {
        return task;
      }
    }
    return task;
  } finally {
    clearVisualPromptExtractionState(options.states, options.templateId, runId);
  }
}
