import type { ComfyInputBinding } from "@/api/comfyUi";

const promptRoles = new Set(["mainPrompt", "positivePrompt", "negativePrompt"]);

export interface ComfyTaskParameterDraft {
  parameters: Record<string, unknown>;
  missingMaterialLabels: string[];
}

export function buildComfyTaskParameterDraft(
  bindings: ComfyInputBinding[],
  parameterSnapshot?: Record<string, unknown>,
  availableMaterialIds: ReadonlySet<number> = new Set(),
): ComfyTaskParameterDraft {
  const parameters: Record<string, unknown> = {};
  const missingMaterialLabels: string[] = [];

  for (const binding of bindings) {
    const hasSnapshotValue =
      parameterSnapshot !== undefined &&
      Object.prototype.hasOwnProperty.call(parameterSnapshot, binding.key);
    let value = hasSnapshotValue
      ? parameterSnapshot[binding.key]
      : promptRoles.has(binding.semanticRole || "normal")
        ? ""
        : (binding.defaultValue ?? (binding.type === "boolean" ? false : ""));

    if (
      (binding.type === "image" || binding.type === "video") &&
      value !== "" &&
      value != null &&
      !availableMaterialIds.has(Number(value))
    ) {
      value = "";
      missingMaterialLabels.push(binding.label);
    }

    parameters[binding.key] = value;
  }

  return { parameters, missingMaterialLabels };
}
