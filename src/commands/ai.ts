import { invoke, isTauri } from '@tauri-apps/api/core';

export interface GenerateRequest {
  prompt: string;
  model: string;
  size: string;
  aspect_ratio: string;
  reference_images?: string[];
  extra_params?: Record<string, unknown>;
  runtime_config?: {
    providerType: 'custom-api' | 'comfyui';
    interfaceId?: string;
    interfaceName?: string;
    apiKey?: string;
    baseUrl: string;
    apiModel?: string;
    omitSizeParams?: boolean;
    requestMode?: 'images' | 'chat-completions';
    workflowId?: string;
    workflowName?: string;
    workflowPromptApiJson?: string;
    imageInputNodeId?: string;
    imageInputField?: string;
    outputNodeId?: string;
    positivePromptNodeIds?: string[];
    negativePromptNodeIds?: string[];
  };
}

export type GenerationJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';

export interface GenerationJobStatus {
  job_id: string;
  status: GenerationJobState;
  result?: string | null;
  error?: string | null;
}

const BASE64_PREVIEW_HEAD = 96;
const BASE64_PREVIEW_TAIL = 24;
const TAURI_ONLY_ERROR_MESSAGE =
  'Current environment is not a Tauri container. Please run with `npm run tauri dev`.';

function truncateText(value: string, max = 200): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...(${value.length} chars)`;
}

function truncateBase64Like(value: string): string {
  if (!value) {
    return value;
  }

  if (value.startsWith('data:')) {
    const [meta, payload = ''] = value.split(',', 2);
    if (payload.length <= BASE64_PREVIEW_HEAD + BASE64_PREVIEW_TAIL) {
      return value;
    }
    return `${meta},${payload.slice(0, BASE64_PREVIEW_HEAD)}...${payload.slice(-BASE64_PREVIEW_TAIL)}(${payload.length} chars)`;
  }

  const base64Like = /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 256;
  if (!base64Like) {
    return truncateText(value, 280);
  }

  return `${value.slice(0, BASE64_PREVIEW_HEAD)}...${value.slice(-BASE64_PREVIEW_TAIL)}(${value.length} chars)`;
}

function sanitizeGenerateRequestForLog(request: GenerateRequest): Record<string, unknown> {
  return {
    prompt: truncateText(request.prompt, 240),
    model: request.model,
    size: request.size,
    aspect_ratio: request.aspect_ratio,
    reference_images_count: request.reference_images?.length ?? 0,
    reference_images_preview: (request.reference_images ?? []).map((item) =>
      truncateBase64Like(item)
    ),
    extra_params: request.extra_params ?? {},
    runtime_config: request.runtime_config
        ? {
          providerType: request.runtime_config.providerType,
          interfaceId: request.runtime_config.interfaceId,
          interfaceName: request.runtime_config.interfaceName,
          apiKeyMasked: request.runtime_config.apiKey
            ? `${request.runtime_config.apiKey.slice(0, 4)}***${request.runtime_config.apiKey.slice(-2)}`
            : '',
          baseUrl: request.runtime_config.baseUrl,
          apiModel: request.runtime_config.apiModel,
          omitSizeParams: request.runtime_config.omitSizeParams,
          requestMode: request.runtime_config.requestMode,
          workflowId: request.runtime_config.workflowId,
          workflowName: request.runtime_config.workflowName,
        }
      : undefined,
  };
}

function toInvokeRequest(request: GenerateRequest): Record<string, unknown> {
  return {
    prompt: request.prompt,
    model: request.model,
    size: request.size,
    aspect_ratio: request.aspect_ratio,
    reference_images: request.reference_images,
    extra_params: request.extra_params,
    runtime_config: request.runtime_config
        ? {
          provider_type: request.runtime_config.providerType,
          interface_id: request.runtime_config.interfaceId,
          interface_name: request.runtime_config.interfaceName,
          api_key: request.runtime_config.apiKey,
          base_url: request.runtime_config.baseUrl,
          api_model: request.runtime_config.apiModel,
          omit_size_params: request.runtime_config.omitSizeParams,
          request_mode: request.runtime_config.requestMode,
          workflow_id: request.runtime_config.workflowId,
          workflow_name: request.runtime_config.workflowName,
          workflow_prompt_api_json: request.runtime_config.workflowPromptApiJson,
          image_input_node_id: request.runtime_config.imageInputNodeId,
          image_input_field: request.runtime_config.imageInputField,
          output_node_id: request.runtime_config.outputNodeId,
          positive_prompt_node_ids: request.runtime_config.positivePromptNodeIds,
          negative_prompt_node_ids: request.runtime_config.negativePromptNodeIds,
        }
      : undefined,
  };
}

interface ErrorWithDetails extends Error {
  details?: string;
}

function normalizeInvokeError(error: unknown): { message: string; details?: string } {
  if (error instanceof Error) {
    const detailsText =
      'details' in error
        ? typeof (error as { details?: unknown }).details === 'string'
          ? (error as { details?: string }).details
          : undefined
        : undefined;
    return { message: error.message || 'Generation failed', details: detailsText };
  }

  if (typeof error === 'string') {
    return { message: error || 'Generation failed', details: error || undefined };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.error === 'string' && record.error) ||
      (typeof record.msg === 'string' && record.msg) ||
      'Generation failed';
    let details: string | undefined;
    try {
      details = truncateText(JSON.stringify(record, null, 2), 2000);
    } catch {
      details = truncateText(String(record), 2000);
    }
    return { message, details };
  }

  return { message: 'Generation failed' };
}

function createErrorWithDetails(message: string, details?: string): ErrorWithDetails {
  const error: ErrorWithDetails = new Error(message);
  if (details) {
    error.details = details;
  }
  return error;
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  console.info('[AI] setApiKey noop', {
    provider,
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}***${apiKey.slice(-2)}` : '',
    tauri: isTauri(),
  });
}

export async function generateImage(request: GenerateRequest): Promise<string> {
  const startedAt = performance.now();
  console.info('[AI] generate_image request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauri(),
  });

  if (!isTauri()) {
    throw new Error(TAURI_ONLY_ERROR_MESSAGE);
  }

  try {
    const rawResult = await invoke<unknown>('generate_image', {
      request: toInvokeRequest(request),
    });
    if (typeof rawResult !== 'string') {
      throw createErrorWithDetails(
        'Generation returned non-string payload',
        truncateText(
          (() => {
            try {
              return JSON.stringify(rawResult, null, 2);
            } catch {
              return String(rawResult);
            }
          })(),
          2000
        )
      );
    }
    const result = rawResult.trim();
    if (!result) {
      throw createErrorWithDetails('Generation returned empty image source');
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.info('[AI] generate_image success', {
      elapsedMs,
      resultPreview: truncateText(result, 220),
    });
    return result;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const normalizedError = normalizeInvokeError(error);
    console.error('[AI] generate_image failed', {
      elapsedMs,
      request: sanitizeGenerateRequestForLog(request),
      error,
      normalizedError,
    });
    const commandError: ErrorWithDetails = new Error(normalizedError.message);
    commandError.details = normalizedError.details;
    throw commandError;
  }
}

export async function submitGenerateImageJob(request: GenerateRequest): Promise<string> {
  console.info('[AI] submit_generate_image_job request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauri(),
  });

  if (!isTauri()) {
    throw new Error(TAURI_ONLY_ERROR_MESSAGE);
  }

  const jobId = await invoke<string>('submit_generate_image_job', {
    request: toInvokeRequest(request),
  });
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('submit_generate_image_job returned invalid job id');
  }
  return jobId.trim();
}

export async function getGenerateImageJob(jobId: string): Promise<GenerationJobStatus> {
  if (!isTauri()) {
    throw new Error(TAURI_ONLY_ERROR_MESSAGE);
  }

  const result = await invoke<GenerationJobStatus>('get_generate_image_job', { jobId });
  if (!result || typeof result !== 'object' || typeof result.status !== 'string') {
    throw new Error('get_generate_image_job returned invalid payload');
  }
  return result;
}

export async function listModels(): Promise<string[]> {
  return await invoke('list_models');
}
