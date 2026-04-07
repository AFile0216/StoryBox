import type { AppTaskType, ComfyUiProviderConfig, ComfyWorkflowTemplateConfig } from '@/types/app';

export const COMFYUI_PROVIDER_ID = 'comfyui';
export const DEFAULT_COMFYUI_BASE_URL = 'http://127.0.0.1:8188';

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `comfy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeString(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function createComfyWorkflowId(): string {
  return `comfy-workflow-${createRandomId()}`;
}

export function createDefaultComfyWorkflow(
  taskType: AppTaskType = 'text-to-image',
  overrides: Partial<ComfyWorkflowTemplateConfig> = {}
): ComfyWorkflowTemplateConfig {
  return {
    id: normalizeString(overrides.id) || createComfyWorkflowId(),
    name: normalizeString(overrides.name) || 'ComfyUI Workflow',
    taskType,
    promptApiJson: normalizeString(overrides.promptApiJson),
    outputNodeId: normalizeString(overrides.outputNodeId),
    positivePromptNodeIds: overrides.positivePromptNodeIds ?? [],
    negativePromptNodeIds: overrides.negativePromptNodeIds ?? [],
    imageInputNodeId: normalizeString(overrides.imageInputNodeId),
    imageInputField: normalizeString(overrides.imageInputField) || 'image',
    widthNodeId: normalizeString(overrides.widthNodeId),
    heightNodeId: normalizeString(overrides.heightNodeId),
    seedNodeId: normalizeString(overrides.seedNodeId),
    stepsNodeId: normalizeString(overrides.stepsNodeId),
    cfgNodeId: normalizeString(overrides.cfgNodeId),
    denoiseNodeId: normalizeString(overrides.denoiseNodeId),
  };
}

export function normalizeComfyWorkflow(
  workflow: Partial<ComfyWorkflowTemplateConfig> | null | undefined,
  index = 0
): ComfyWorkflowTemplateConfig {
  const taskType = workflow?.taskType ?? 'text-to-image';
  return createDefaultComfyWorkflow(taskType, {
    ...workflow,
    name: normalizeString(workflow?.name) || `ComfyUI Workflow ${index + 1}`,
    positivePromptNodeIds: normalizeIdList(workflow?.positivePromptNodeIds),
    negativePromptNodeIds: normalizeIdList(workflow?.negativePromptNodeIds),
  });
}

export function normalizeIdList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      return acc;
    }
    seen.add(normalized);
    acc.push(normalized);
    return acc;
  }, []);
}

export function parseNodeIdList(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return normalizeIdList(
    value
      .split(/[,\r\n]/u)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function stringifyNodeIdList(values: string[] | null | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

export function createDefaultComfyUiConfig(
  overrides: Partial<ComfyUiProviderConfig> = {}
): ComfyUiProviderConfig {
  const workflows = Array.isArray(overrides.workflows)
    ? overrides.workflows.map((workflow, index) => normalizeComfyWorkflow(workflow, index))
    : [];
  return {
    enabled: overrides.enabled === true,
    baseUrl: normalizeString(overrides.baseUrl) || DEFAULT_COMFYUI_BASE_URL,
    defaultWorkflowId:
      normalizeString(overrides.defaultWorkflowId) || workflows[0]?.id || null,
    workflows,
    healthStatus: overrides.healthStatus ?? 'idle',
    lastHealthMessage: overrides.lastHealthMessage ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
  };
}
