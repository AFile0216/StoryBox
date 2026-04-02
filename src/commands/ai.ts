import { invoke, isTauri } from '@tauri-apps/api/core';
import { getModelProvider } from '@/features/canvas/models';
import { getActiveProviderInterface, useSettingsStore } from '@/stores/settingsStore';

export interface GenerateRequest {
  prompt: string;
  model: string;
  size: string;
  aspect_ratio: string;
  reference_images?: string[];
  extra_params?: Record<string, unknown>;
}

export type GenerationJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';

export interface GenerationJobStatus {
  job_id: string;
  status: GenerationJobState;
  result?: string | null;
  error?: string | null;
}

interface ConfigureProviderRuntimeRequest {
  provider: string;
  api_key: string;
  base_url?: string;
  upload_base_url?: string;
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

function resolveProviderRuntimeRequest(
  providerId: string,
  apiKey: string
): ConfigureProviderRuntimeRequest {
  const state = useSettingsStore.getState();
  const activeInterface = getActiveProviderInterface(state, providerId);
  const provider = getModelProvider(providerId);
  const resolvedApiKey = (activeInterface?.apiKey ?? apiKey).trim();
  const resolvedBaseUrl = (
    activeInterface?.baseUrl ||
    provider.defaultBaseUrl ||
    ''
  ).trim();
  const resolvedUploadBaseUrl = (
    activeInterface?.uploadBaseUrl ||
    provider.defaultUploadBaseUrl ||
    ''
  ).trim();

  return {
    provider: providerId,
    api_key: resolvedApiKey,
    base_url: resolvedBaseUrl || undefined,
    upload_base_url: resolvedUploadBaseUrl || undefined,
  };
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  const request = resolveProviderRuntimeRequest(provider, apiKey);
  console.info('[AI] configure_provider_runtime', {
    provider: request.provider,
    apiKeyMasked: request.api_key
      ? `${request.api_key.slice(0, 4)}***${request.api_key.slice(-2)}`
      : '',
    baseUrl: request.base_url,
    uploadBaseUrl: request.upload_base_url,
    tauri: isTauri(),
  });
  if (!isTauri()) {
    throw new Error(TAURI_ONLY_ERROR_MESSAGE);
  }
  return await invoke('configure_provider_runtime', { config: request });
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
    const rawResult = await invoke<unknown>('generate_image', { request });
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

  const jobId = await invoke<string>('submit_generate_image_job', { request });
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
