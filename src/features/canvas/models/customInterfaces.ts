export const CUSTOM_OPENAI_PROVIDER_ID = 'openai-compatible';
export const DEFAULT_CUSTOM_API_BASE_URL = 'https://api.siliconflow.cn/v1';
export type CustomApiRequestMode = 'images' | 'chat-completions';

export interface CustomApiInterfaceConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  modelIds: string[];
  omitSizeParams: boolean;
  requestMode: CustomApiRequestMode;
}

export interface LegacyProviderInterfaceConfig {
  id?: string;
  providerId?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  uploadBaseUrl?: string;
}

const LEGACY_PROVIDER_MODEL_DEFAULTS: Record<string, string[]> = {
  ppio: ['gemini-3.1-flash'],
  grsai: ['grsai/nano-banana-2', 'grsai/nano-banana-pro'],
  kie: ['nano-banana-2', 'nano-banana-pro'],
  fal: ['nano-banana-2', 'nano-banana-pro'],
};

function normalizeString(input: string | null | undefined): string {
  return (input ?? '').trim();
}

function normalizeBaseUrl(input: string | null | undefined): string {
  return normalizeString(input).replace(/\/+$/u, '');
}

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCustomApiInterfaceId(): string {
  return `custom-api-${createRandomId()}`;
}

export function parseModelIdsInput(input: string | null | undefined): string[] {
  if (!input) {
    return [];
  }

  const seen = new Set<string>();
  return input
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export function stringifyModelIds(modelIds: string[] | null | undefined): string {
  return Array.isArray(modelIds) ? modelIds.join('\n') : '';
}

export function createDefaultCustomApiInterface(
  overrides: Partial<CustomApiInterfaceConfig> = {}
): CustomApiInterfaceConfig {
  return {
    id: normalizeString(overrides.id) || createCustomApiInterfaceId(),
    name: normalizeString(overrides.name) || 'Custom API 1',
    apiKey: normalizeString(overrides.apiKey),
    baseUrl: normalizeBaseUrl(overrides.baseUrl) || DEFAULT_CUSTOM_API_BASE_URL,
    modelIds: normalizeModelIds(overrides.modelIds),
    omitSizeParams: overrides.omitSizeParams === true,
    requestMode: overrides.requestMode === 'chat-completions' ? 'chat-completions' : 'images',
  };
}

export function normalizeModelIds(input: string[] | null | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  return input.reduce<string[]>((acc, item) => {
    const normalized = normalizeString(item);
    if (!normalized || seen.has(normalized)) {
      return acc;
    }
    seen.add(normalized);
    acc.push(normalized);
    return acc;
  }, []);
}

export function normalizeCustomApiInterfaces(
  input: CustomApiInterfaceConfig[] | null | undefined
): CustomApiInterfaceConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seenIds = new Set<string>();
  return input.reduce<CustomApiInterfaceConfig[]>((acc, item, index) => {
    const nextId = normalizeString(item?.id) || createCustomApiInterfaceId();
    const resolvedId = seenIds.has(nextId) ? createCustomApiInterfaceId() : nextId;
    seenIds.add(resolvedId);
    acc.push({
      id: resolvedId,
      name: normalizeString(item?.name) || `Custom API ${index + 1}`,
      apiKey: normalizeString(item?.apiKey),
      baseUrl: normalizeBaseUrl(item?.baseUrl) || DEFAULT_CUSTOM_API_BASE_URL,
      modelIds: normalizeModelIds(item?.modelIds),
      omitSizeParams: item?.omitSizeParams === true,
      requestMode: item?.requestMode === 'chat-completions' ? 'chat-completions' : 'images',
    });
    return acc;
  }, []);
}

export function buildApiKeysFromCustomInterfaces(
  customApiInterfaces: CustomApiInterfaceConfig[]
): Record<string, string> {
  return customApiInterfaces.reduce<Record<string, string>>((acc, item) => {
    acc[item.id] = normalizeString(item.apiKey);
    return acc;
  }, {});
}

export function buildCustomInterfacesFromLegacyProviders(
  providerInterfaces: LegacyProviderInterfaceConfig[] | null | undefined,
  apiKeys: Record<string, string> | null | undefined
): CustomApiInterfaceConfig[] {
  const normalizedProviderInterfaces = Array.isArray(providerInterfaces)
    ? providerInterfaces
    : [];
  const fallbackApiKeys = apiKeys ?? {};

  return normalizedProviderInterfaces.map((item, index) => {
    const providerId = normalizeString(item.providerId);
    const legacyModels = LEGACY_PROVIDER_MODEL_DEFAULTS[providerId] ?? [];
    return createDefaultCustomApiInterface({
      name:
        normalizeString(item.name) ||
        (providerId ? `${providerId.toUpperCase()} API` : `Custom API ${index + 1}`),
      apiKey: normalizeString(item.apiKey) || normalizeString(fallbackApiKeys[providerId]),
      baseUrl: normalizeBaseUrl(item.baseUrl) || DEFAULT_CUSTOM_API_BASE_URL,
      modelIds: legacyModels,
      omitSizeParams: false,
      requestMode: 'images',
    });
  });
}

export function getCustomInterfaceById(
  customApiInterfaces: CustomApiInterfaceConfig[],
  interfaceId: string | null | undefined
): CustomApiInterfaceConfig | undefined {
  const normalizedId = normalizeString(interfaceId);
  if (!normalizedId) {
    return undefined;
  }
  return customApiInterfaces.find((item) => item.id === normalizedId);
}
