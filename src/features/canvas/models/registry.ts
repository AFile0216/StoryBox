import { useSettingsStore } from '@/stores/settingsStore';
import {
  CUSTOM_OPENAI_PROVIDER_ID,
  type CustomApiInterfaceConfig,
} from './customInterfaces';
import type {
  ImageModelDefinition,
  ImageModelRuntimeContext,
  ModelProviderDefinition,
  ResolutionOption,
} from './types';

const DEFAULT_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '2:3',
  '3:2',
  '5:4',
  '4:5',
  '21:9',
] as const;

const DEFAULT_RESOLUTIONS: ResolutionOption[] = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const DEFAULT_PROVIDER: ModelProviderDefinition = {
  id: CUSTOM_OPENAI_PROVIDER_ID,
  name: 'Custom API',
  label: 'Custom API',
  defaultBaseUrl: '',
  supportsCustomBaseUrl: true,
};

const PLACEHOLDER_MODEL_ID = `${CUSTOM_OPENAI_PROVIDER_ID}/unconfigured`;

export const DEFAULT_IMAGE_MODEL_ID = PLACEHOLDER_MODEL_ID;

function encodeModelName(modelName: string): string {
  return encodeURIComponent(modelName);
}

export function decodeCustomImageModelId(
  modelId: string
): { interfaceId: string; apiModel: string } | null {
  const normalized = modelId.trim();
  const prefix = `${CUSTOM_OPENAI_PROVIDER_ID}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const remaining = normalized.slice(prefix.length);
  const separatorIndex = remaining.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex >= remaining.length - 1) {
    return null;
  }

  const interfaceId = remaining.slice(0, separatorIndex);
  const encodedModelName = remaining.slice(separatorIndex + 1);
  if (!interfaceId || !encodedModelName) {
    return null;
  }

  try {
    return {
      interfaceId,
      apiModel: decodeURIComponent(encodedModelName),
    };
  } catch {
    return {
      interfaceId,
      apiModel: encodedModelName,
    };
  }
}

function buildCustomImageModel(
  apiInterface: CustomApiInterfaceConfig,
  apiModel: string
): ImageModelDefinition {
  return {
    id: `${CUSTOM_OPENAI_PROVIDER_ID}/${apiInterface.id}/${encodeModelName(apiModel)}`,
    mediaType: 'image',
    displayName: apiModel,
    providerId: CUSTOM_OPENAI_PROVIDER_ID,
    interfaceId: apiInterface.id,
    interfaceName: apiInterface.name,
    apiModel,
    description: 'Generate or edit images through a custom OpenAI-compatible API.',
    eta: '30s',
    expectedDurationMs: 30000,
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: DEFAULT_ASPECT_RATIOS.map((value) => ({ value, label: value })),
    resolutions: DEFAULT_RESOLUTIONS,
    resolveRequest: ({ referenceImageCount }) => ({
      requestModel: `${CUSTOM_OPENAI_PROVIDER_ID}/${apiInterface.id}/${encodeModelName(apiModel)}`,
      modeLabel: referenceImageCount > 0 ? 'edit' : 'generate',
    }),
  };
}

function buildPlaceholderModel(): ImageModelDefinition {
  return {
    id: PLACEHOLDER_MODEL_ID,
    mediaType: 'image',
    displayName: 'Configure a model in Settings',
    providerId: CUSTOM_OPENAI_PROVIDER_ID,
    description: 'Add a custom API interface and model name in Settings before generating.',
    eta: '30s',
    expectedDurationMs: 30000,
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: DEFAULT_ASPECT_RATIOS.map((value) => ({ value, label: value })),
    resolutions: DEFAULT_RESOLUTIONS,
    resolveRequest: () => ({
      requestModel: PLACEHOLDER_MODEL_ID,
      modeLabel: 'generate',
    }),
  };
}

function getConfiguredInterfaces(): CustomApiInterfaceConfig[] {
  return useSettingsStore.getState().customApiInterfaces;
}

function buildConfiguredImageModels(): ImageModelDefinition[] {
  const customApiInterfaces = getConfiguredInterfaces();
  const models = customApiInterfaces.flatMap((apiInterface) =>
    apiInterface.modelIds.map((apiModel) => buildCustomImageModel(apiInterface, apiModel))
  );

  if (models.length === 0) {
    return [buildPlaceholderModel()];
  }

  return models.sort((left, right) => {
    const interfaceCompare = (left.interfaceName ?? '').localeCompare(right.interfaceName ?? '');
    if (interfaceCompare !== 0) {
      return interfaceCompare;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export function listImageModels(): ImageModelDefinition[] {
  return buildConfiguredImageModels();
}

export function listModelProviders(): ModelProviderDefinition[] {
  return [DEFAULT_PROVIDER];
}

export function getImageModel(modelId: string): ImageModelDefinition {
  const models = buildConfiguredImageModels();
  return models.find((model) => model.id === modelId) ?? models[0] ?? buildPlaceholderModel();
}

export function resolveImageModelResolutions(
  model: ImageModelDefinition,
  context: ImageModelRuntimeContext = {}
): ResolutionOption[] {
  const resolvedOptions = model.resolveResolutions?.(context);
  return resolvedOptions && resolvedOptions.length > 0 ? resolvedOptions : model.resolutions;
}

export function resolveImageModelResolution(
  model: ImageModelDefinition,
  requestedResolution: string | undefined,
  context: ImageModelRuntimeContext = {}
): ResolutionOption {
  const resolutionOptions = resolveImageModelResolutions(model, context);

  return (
    (requestedResolution
      ? resolutionOptions.find((item) => item.value === requestedResolution)
      : undefined) ??
    resolutionOptions.find((item) => item.value === model.defaultResolution) ??
    resolutionOptions[0] ??
    model.resolutions[0]
  );
}

export function getModelProvider(_providerId: string): ModelProviderDefinition {
  return DEFAULT_PROVIDER;
}
