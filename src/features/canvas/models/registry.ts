import { useSettingsStore } from '@/stores/settingsStore';
import {
  CUSTOM_OPENAI_PROVIDER_ID,
  type CustomApiInterfaceConfig,
} from './customInterfaces';
import { COMFYUI_PROVIDER_ID } from '@/features/providers/comfyUi';
import { GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS } from './providers/grsai';
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

const DIRECT_PROVIDER_IDS = new Set(['grsai']);
const GRSAI_PROVIDER_ID = 'grsai';
const GRSAI_NANO_BANANA_2_MODEL = 'nano-banana-2';
const GRSAI_NANO_BANANA_PRO_MODEL = 'nano-banana-pro';
const DEFAULT_GRSAI_PRO_VARIANT = 'nano-banana-pro';

const DEFAULT_PROVIDER: ModelProviderDefinition = {
  id: CUSTOM_OPENAI_PROVIDER_ID,
  name: 'Custom API',
  label: 'Custom API',
  defaultBaseUrl: '',
  supportsCustomBaseUrl: true,
};

const COMFYUI_PROVIDER: ModelProviderDefinition = {
  id: COMFYUI_PROVIDER_ID,
  name: 'ComfyUI',
  label: 'ComfyUI',
  defaultBaseUrl: '',
  supportsCustomBaseUrl: true,
};

const PLACEHOLDER_MODEL_ID = `${CUSTOM_OPENAI_PROVIDER_ID}/unconfigured`;

export const DEFAULT_IMAGE_MODEL_ID = PLACEHOLDER_MODEL_ID;

function encodeModelName(modelName: string): string {
  return encodeURIComponent(modelName);
}

interface DirectProviderModelRef {
  providerId: string;
  modelName: string;
  requestModel: string;
}

function isLikelyGrsaiInterface(apiInterface: CustomApiInterfaceConfig): boolean {
  const normalizedId = apiInterface.id.trim().toLowerCase();
  const normalizedName = apiInterface.name.trim().toLowerCase();
  const normalizedBaseUrl = apiInterface.baseUrl.trim().toLowerCase();
  return normalizedId === GRSAI_PROVIDER_ID
    || normalizedName.includes(GRSAI_PROVIDER_ID)
    || normalizedBaseUrl.includes('grsai.');
}

function resolveGrsaiFallbackModelRef(
  apiInterface: CustomApiInterfaceConfig,
  rawModel: string
): DirectProviderModelRef | null {
  if (!isLikelyGrsaiInterface(apiInterface)) {
    return null;
  }

  const fallbackModelName = rawModel.trim().toLowerCase();
  if (
    fallbackModelName === GRSAI_NANO_BANANA_2_MODEL
    || fallbackModelName === GRSAI_NANO_BANANA_PRO_MODEL
    || fallbackModelName.startsWith(`${GRSAI_NANO_BANANA_PRO_MODEL}-`)
  ) {
    return {
      providerId: GRSAI_PROVIDER_ID,
      modelName: fallbackModelName,
      requestModel: `${GRSAI_PROVIDER_ID}/${fallbackModelName}`,
    };
  }
  return null;
}

function resolveDirectProviderModelRef(
  apiInterface: CustomApiInterfaceConfig,
  apiModel: string
): DirectProviderModelRef | null {
  const normalized = apiModel.trim();
  if (!normalized) {
    return null;
  }

  const [rawProviderId, ...restParts] = normalized.split('/');
  if (!rawProviderId || restParts.length === 0) {
    return resolveGrsaiFallbackModelRef(apiInterface, normalized);
  }

  const providerId = rawProviderId.trim().toLowerCase();
  const modelName = restParts.join('/').trim();
  if (!modelName || !DIRECT_PROVIDER_IDS.has(providerId)) {
    return resolveGrsaiFallbackModelRef(apiInterface, normalized);
  }

  return {
    providerId,
    modelName,
    requestModel: `${providerId}/${modelName}`,
  };
}

function formatDirectProviderDisplayName(providerId: string, modelName: string): string {
  const normalizedModel = modelName.toLowerCase();
  if (providerId === GRSAI_PROVIDER_ID) {
    if (normalizedModel === GRSAI_NANO_BANANA_2_MODEL) {
      return 'Nano Banana 2';
    }
    if (normalizedModel === GRSAI_NANO_BANANA_PRO_MODEL) {
      return 'Nano Banana Pro';
    }
  }
  return modelName;
}

function resolveGrsaiProVariant(extraParams?: Record<string, unknown>): string {
  const variant = typeof extraParams?.grsai_pro_model === 'string'
    ? extraParams.grsai_pro_model.trim().toLowerCase()
    : DEFAULT_GRSAI_PRO_VARIANT;
  return GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS.includes(
    variant as (typeof GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS)[number]
  )
    ? variant
    : DEFAULT_GRSAI_PRO_VARIANT;
}

function resolveGrsaiProResolutions(extraParams?: Record<string, unknown>): ResolutionOption[] {
  const variant = resolveGrsaiProVariant(extraParams);
  if (variant === 'nano-banana-pro-vip') {
    return DEFAULT_RESOLUTIONS.filter((item) => item.value !== '4K');
  }
  if (variant === 'nano-banana-pro-4k-vip') {
    return DEFAULT_RESOLUTIONS.filter((item) => item.value === '4K');
  }
  return DEFAULT_RESOLUTIONS;
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
  const directProviderModel = resolveDirectProviderModelRef(apiInterface, apiModel);
  const resolvedModelName = directProviderModel?.modelName ?? apiModel;
  const resolvedProviderId = directProviderModel?.providerId ?? CUSTOM_OPENAI_PROVIDER_ID;
  const resolvedRequestModel = directProviderModel
    ? directProviderModel.requestModel
    : `${CUSTOM_OPENAI_PROVIDER_ID}/${apiInterface.id}/${encodeModelName(apiModel)}`;
  const isGrsaiNanoBananaPro =
    directProviderModel?.providerId === GRSAI_PROVIDER_ID
    && directProviderModel.modelName.toLowerCase() === GRSAI_NANO_BANANA_PRO_MODEL;

  return {
    id: `${CUSTOM_OPENAI_PROVIDER_ID}/${apiInterface.id}/${encodeModelName(apiModel)}`,
    mediaType: 'image',
    displayName: directProviderModel
      ? formatDirectProviderDisplayName(directProviderModel.providerId, directProviderModel.modelName)
      : apiModel,
    providerId: resolvedProviderId,
    providerKind: 'custom-api',
    interfaceId: apiInterface.id,
    interfaceName: apiInterface.name,
    apiModel: resolvedModelName,
    description: directProviderModel
      ? `Generate or edit images through ${directProviderModel.providerId.toUpperCase()}.`
      : 'Generate or edit images through a custom OpenAI-compatible API.',
    eta: '30s',
    expectedDurationMs: 30000,
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: DEFAULT_ASPECT_RATIOS.map((value) => ({ value, label: value })),
    resolutions: DEFAULT_RESOLUTIONS,
    resolveResolutions: isGrsaiNanoBananaPro
      ? ({ extraParams }) => resolveGrsaiProResolutions(extraParams)
      : undefined,
    extraParamsSchema: isGrsaiNanoBananaPro
      ? [
        {
          key: 'grsai_pro_model',
          label: 'Pro Variant',
          type: 'enum',
          defaultValue: DEFAULT_GRSAI_PRO_VARIANT,
          options: GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS.map((variant) => ({
            value: variant,
            label: variant,
          })),
        },
      ]
      : undefined,
    defaultExtraParams: isGrsaiNanoBananaPro
      ? {
        grsai_pro_model: DEFAULT_GRSAI_PRO_VARIANT,
      }
      : undefined,
    resolveRequest: ({ referenceImageCount }) => ({
      requestModel: resolvedRequestModel,
      modeLabel: referenceImageCount > 0 ? 'edit' : 'generate',
    }),
  };
}

function buildComfyWorkflowModel(
  workflow: ReturnType<typeof useSettingsStore.getState>['comfyUi']['workflows'][number]
): ImageModelDefinition {
  const taskType = workflow.taskType === 'image-to-image' ? 'image-to-image' : 'text-to-image';
  return {
    id: `${COMFYUI_PROVIDER_ID}/${workflow.id}`,
    mediaType: 'image',
    displayName: workflow.name,
    providerId: COMFYUI_PROVIDER_ID,
    providerKind: 'comfyui',
    interfaceId: COMFYUI_PROVIDER_ID,
    interfaceName: 'ComfyUI',
    workflowId: workflow.id,
    taskType,
    description: 'Generate images through a local ComfyUI workflow.',
    eta: '30s',
    expectedDurationMs: 30000,
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: DEFAULT_ASPECT_RATIOS.map((value) => ({ value, label: value })),
    resolutions: DEFAULT_RESOLUTIONS,
    resolveRequest: ({ referenceImageCount }) => ({
      requestModel: `${COMFYUI_PROVIDER_ID}/${workflow.id}`,
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
    providerKind: 'custom-api',
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

function buildConfiguredImageModels(): ImageModelDefinition[] {
  const { customApiInterfaces, comfyUi } = useSettingsStore.getState();
  const customModels = customApiInterfaces.flatMap((apiInterface) =>
    apiInterface.modelIds.map((apiModel) => buildCustomImageModel(apiInterface, apiModel))
  );
  const comfyModels =
    comfyUi.enabled
      ? comfyUi.workflows
          .filter((workflow) => workflow.promptApiJson.trim() && workflow.outputNodeId.trim())
          .map((workflow) => buildComfyWorkflowModel(workflow))
      : [];
  const models = [...customModels, ...comfyModels];

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
  return [DEFAULT_PROVIDER, COMFYUI_PROVIDER];
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
  return _providerId === COMFYUI_PROVIDER_ID ? COMFYUI_PROVIDER : DEFAULT_PROVIDER;
}
