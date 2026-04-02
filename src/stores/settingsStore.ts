import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_GRSAI_CREDIT_TIER_ID,
  PRICE_DISPLAY_CURRENCY_MODES,
  type GrsaiCreditTierId,
  type PriceDisplayCurrencyMode,
} from '@/features/canvas/pricing/types';
import { getModelProvider } from '@/features/canvas/models';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';
export type ProviderApiKeys = Record<string, string>;
export type ActiveProviderInterfaceIds = Record<string, string>;
export const DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL = 'nano-banana-pro';

export interface ProviderInterfaceConfig {
  id: string;
  providerId: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  uploadBaseUrl: string;
}

interface SettingsState {
  isHydrated: boolean;
  apiKeys: ProviderApiKeys;
  providerInterfaces: ProviderInterfaceConfig[];
  activeProviderInterfaceIds: ActiveProviderInterfaceIds;
  grsaiNanoBananaProModel: string;
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  setProviderApiKey: (providerId: string, key: string) => void;
  setProviderInterfaces: (
    providerId: string,
    interfaces: ProviderInterfaceConfig[],
    activeInterfaceId?: string
  ) => void;
  setGrsaiNanoBananaProModel: (model: string) => void;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setDownloadPresetPaths: (paths: string[]) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setShowNodePrice: (enabled: boolean) => void;
  setPriceDisplayCurrencyMode: (mode: PriceDisplayCurrencyMode) => void;
  setUsdToCnyRate: (rate: number) => void;
  setPreferDiscountedPrice: (enabled: boolean) => void;
  setGrsaiCreditTierId: (tierId: GrsaiCreditTierId) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
  setAutoCheckAppUpdateOnLaunch: (enabled: boolean) => void;
  setEnableUpdateDialog: (enabled: boolean) => void;
}

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return '#3B82F6';
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeApiKey(input: string): string {
  return input.trim();
}

function normalizeProviderUrl(input: string | null | undefined): string {
  return (input ?? '').trim().replace(/\/+$/u, '');
}

function createProviderInterfaceId(providerId: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${providerId}-${randomPart}`;
}

function getProviderInterfaceDefaults(providerId: string) {
  const provider = getModelProvider(providerId);
  return {
    name: provider.name || providerId.toUpperCase(),
    baseUrl: normalizeProviderUrl(provider.defaultBaseUrl),
    uploadBaseUrl: normalizeProviderUrl(provider.defaultUploadBaseUrl),
  };
}

export function createDefaultProviderInterface(
  providerId: string,
  apiKey = '',
  name?: string
): ProviderInterfaceConfig {
  const defaults = getProviderInterfaceDefaults(providerId);
  return {
    id: createProviderInterfaceId(providerId),
    providerId,
    name: (name ?? defaults.name).trim() || defaults.name,
    apiKey: normalizeApiKey(apiKey),
    baseUrl: defaults.baseUrl,
    uploadBaseUrl: defaults.uploadBaseUrl,
  };
}

function normalizeProviderInterface(
  input: Partial<ProviderInterfaceConfig> | null | undefined
): ProviderInterfaceConfig | null {
  const providerId = typeof input?.providerId === 'string' ? input.providerId.trim() : '';
  if (!providerId) {
    return null;
  }

  const defaults = getProviderInterfaceDefaults(providerId);

  return {
    id:
      typeof input?.id === 'string' && input.id.trim().length > 0
        ? input.id.trim()
        : createProviderInterfaceId(providerId),
    providerId,
    name:
      typeof input?.name === 'string' && input.name.trim().length > 0
        ? input.name.trim()
        : defaults.name,
    apiKey: normalizeApiKey(typeof input?.apiKey === 'string' ? input.apiKey : ''),
    baseUrl: normalizeProviderUrl(
      typeof input?.baseUrl === 'string' ? input.baseUrl : defaults.baseUrl
    ),
    uploadBaseUrl: normalizeProviderUrl(
      typeof input?.uploadBaseUrl === 'string'
        ? input.uploadBaseUrl
        : defaults.uploadBaseUrl
    ),
  };
}

function normalizeProviderInterfaces(
  input: ProviderInterfaceConfig[] | null | undefined
): ProviderInterfaceConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seenIds = new Set<string>();
  return input.reduce<ProviderInterfaceConfig[]>((acc, item) => {
    const normalized = normalizeProviderInterface(item);
    if (!normalized) {
      return acc;
    }

    if (seenIds.has(normalized.id)) {
      normalized.id = createProviderInterfaceId(normalized.providerId);
    }
    seenIds.add(normalized.id);
    acc.push(normalized);
    return acc;
  }, []);
}

function getProviderInterfacesByProviderId(
  providerInterfaces: ProviderInterfaceConfig[],
  providerId: string
): ProviderInterfaceConfig[] {
  return providerInterfaces.filter((item) => item.providerId === providerId);
}

function normalizeActiveProviderInterfaceIds(
  input: ActiveProviderInterfaceIds | null | undefined,
  providerInterfaces: ProviderInterfaceConfig[]
): ActiveProviderInterfaceIds {
  const raw = input ?? {};
  const next: ActiveProviderInterfaceIds = {};
  const providerIds = new Set(providerInterfaces.map((item) => item.providerId));

  providerIds.forEach((providerId) => {
    const preferredId = typeof raw[providerId] === 'string' ? raw[providerId].trim() : '';
    const interfaces = getProviderInterfacesByProviderId(providerInterfaces, providerId);
    const resolvedId =
      interfaces.find((item) => item.id === preferredId)?.id ?? interfaces[0]?.id ?? '';
    if (resolvedId) {
      next[providerId] = resolvedId;
    }
  });

  return next;
}

export function getActiveProviderInterface(
  state: Pick<SettingsState, 'providerInterfaces' | 'activeProviderInterfaceIds'>,
  providerId: string
): ProviderInterfaceConfig | undefined {
  const normalizedProviderId = providerId.trim();
  if (!normalizedProviderId) {
    return undefined;
  }

  const interfaces = getProviderInterfacesByProviderId(
    state.providerInterfaces,
    normalizedProviderId
  );
  const preferredId = state.activeProviderInterfaceIds[normalizedProviderId];
  return interfaces.find((item) => item.id === preferredId) ?? interfaces[0];
}

function buildApiKeysFromProviderInterfaces(
  providerInterfaces: ProviderInterfaceConfig[],
  activeProviderInterfaceIds: ActiveProviderInterfaceIds,
  fallbackApiKeys: ProviderApiKeys = {}
): ProviderApiKeys {
  const nextApiKeys = normalizeApiKeys(fallbackApiKeys);
  const providerIds = new Set<string>([
    ...Object.keys(nextApiKeys),
    ...providerInterfaces.map((item) => item.providerId),
    ...Object.keys(activeProviderInterfaceIds),
  ]);

  providerIds.forEach((providerId) => {
    const activeInterface =
      getActiveProviderInterface({ providerInterfaces, activeProviderInterfaceIds }, providerId);
    nextApiKeys[providerId] = activeInterface?.apiKey ?? nextApiKeys[providerId] ?? '';
  });

  return nextApiKeys;
}

function normalizePriceDisplayCurrencyMode(
  input: PriceDisplayCurrencyMode | string | null | undefined
): PriceDisplayCurrencyMode {
  return PRICE_DISPLAY_CURRENCY_MODES.includes(input as PriceDisplayCurrencyMode)
    ? (input as PriceDisplayCurrencyMode)
    : 'auto';
}

function normalizeUsdToCnyRate(input: number | string | null | undefined): number {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 7.2;
  }

  return Math.min(100, Math.max(0.01, Math.round(numeric * 100) / 100));
}

function normalizeGrsaiCreditTierId(
  input: GrsaiCreditTierId | string | null | undefined
): GrsaiCreditTierId {
  switch (input) {
    case 'tier-10':
    case 'tier-20':
    case 'tier-49':
    case 'tier-99':
    case 'tier-499':
    case 'tier-999':
      return input;
    default:
      return DEFAULT_GRSAI_CREDIT_TIER_ID;
  }
}

function normalizeGrsaiNanoBananaProModel(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (trimmed === DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL || trimmed.startsWith('nano-banana-pro-')) {
    return trimmed;
  }
  return DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL;
}

function normalizeCanvasEdgeRoutingMode(
  input: CanvasEdgeRoutingMode | string | null | undefined
): CanvasEdgeRoutingMode {
  if (input === 'orthogonal' || input === 'smartOrthogonal' || input === 'spline') {
    return input;
  }
  return 'spline';
}

function normalizeApiKeys(input: ProviderApiKeys | null | undefined): ProviderApiKeys {
  if (!input) {
    return {};
  }

  return Object.entries(input).reduce<ProviderApiKeys>((acc, [providerId, key]) => {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      return acc;
    }

    acc[normalizedProviderId] = normalizeApiKey(key);
    return acc;
  }, {});
}

export function hasConfiguredApiKey(apiKeys: ProviderApiKeys): boolean {
  return getConfiguredApiKeyCount(apiKeys) > 0;
}

export function getConfiguredApiKeyCount(
  apiKeys: ProviderApiKeys,
  providerIds?: readonly string[]
): number {
  const keysToCount = providerIds
    ? providerIds.map((providerId) => apiKeys[providerId] ?? '')
    : Object.values(apiKeys);

  return keysToCount.reduce((count, key) => {
    return normalizeApiKey(key).length > 0 ? count + 1 : count;
  }, 0);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isHydrated: false,
      apiKeys: {},
      providerInterfaces: [],
      activeProviderInterfaceIds: {},
      grsaiNanoBananaProModel: DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL,
      hideProviderGuidePopover: false,
      downloadPresetPaths: [],
      useUploadFilenameAsNodeTitle: true,
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
      showNodePrice: true,
      priceDisplayCurrencyMode: 'auto',
      usdToCnyRate: 7.2,
      preferDiscountedPrice: false,
      grsaiCreditTierId: DEFAULT_GRSAI_CREDIT_TIER_ID,
      uiRadiusPreset: 'default',
      themeTonePreset: 'neutral',
      accentColor: '#3B82F6',
      canvasEdgeRoutingMode: 'spline',
      autoCheckAppUpdateOnLaunch: true,
      enableUpdateDialog: true,
      setProviderApiKey: (providerId, key) =>
        set((state) => {
          const normalizedProviderId = providerId.trim();
          if (!normalizedProviderId) {
            return state;
          }

          const normalizedKey = normalizeApiKey(key);
          const providerInterfaces = [...state.providerInterfaces];
          const activeProviderInterfaceIds = { ...state.activeProviderInterfaceIds };
          const activeInterface = getActiveProviderInterface(state, normalizedProviderId);

          if (activeInterface) {
            const targetIndex = providerInterfaces.findIndex((item) => item.id === activeInterface.id);
            if (targetIndex >= 0) {
              providerInterfaces[targetIndex] = {
                ...providerInterfaces[targetIndex],
                apiKey: normalizedKey,
              };
            }
          } else if (normalizedKey.length > 0) {
            const nextInterface = createDefaultProviderInterface(normalizedProviderId, normalizedKey);
            providerInterfaces.push(nextInterface);
            activeProviderInterfaceIds[normalizedProviderId] = nextInterface.id;
          }

          return {
            providerInterfaces,
            activeProviderInterfaceIds,
            apiKeys: {
              ...state.apiKeys,
              [normalizedProviderId]: normalizedKey,
            },
          };
        }),
      setProviderInterfaces: (providerId, interfaces, activeInterfaceId) =>
        set((state) => {
          const normalizedProviderId = providerId.trim();
          if (!normalizedProviderId) {
            return state;
          }

          const normalizedInterfaces = normalizeProviderInterfaces(
            interfaces.map((item) => ({
              ...item,
              providerId: normalizedProviderId,
            }))
          );
          const providerInterfaces = [
            ...state.providerInterfaces.filter((item) => item.providerId !== normalizedProviderId),
            ...normalizedInterfaces,
          ];
          const activeProviderInterfaceIds = {
            ...state.activeProviderInterfaceIds,
          };
          const resolvedActiveInterfaceId =
            normalizedInterfaces.find((item) => item.id === activeInterfaceId)?.id ??
            normalizedInterfaces[0]?.id;

          if (resolvedActiveInterfaceId) {
            activeProviderInterfaceIds[normalizedProviderId] = resolvedActiveInterfaceId;
          } else {
            delete activeProviderInterfaceIds[normalizedProviderId];
          }

          return {
            providerInterfaces,
            activeProviderInterfaceIds,
            apiKeys: buildApiKeysFromProviderInterfaces(
              providerInterfaces,
              activeProviderInterfaceIds,
              state.apiKeys
            ),
          };
        }),
      setGrsaiNanoBananaProModel: (model) =>
        set({
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(model),
        }),
      setHideProviderGuidePopover: (hide) => set({ hideProviderGuidePopover: hide }),
      setDownloadPresetPaths: (paths) => {
        const uniquePaths = Array.from(
          new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))
        ).slice(0, 8);
        set({ downloadPresetPaths: uniquePaths });
      },
      setUseUploadFilenameAsNodeTitle: (enabled) => set({ useUploadFilenameAsNodeTitle: enabled }),
      setStoryboardGenKeepStyleConsistent: (enabled) =>
        set({ storyboardGenKeepStyleConsistent: enabled }),
      setStoryboardGenDisableTextInImage: (enabled) =>
        set({ storyboardGenDisableTextInImage: enabled }),
      setStoryboardGenAutoInferEmptyFrame: (enabled) =>
        set({ storyboardGenAutoInferEmptyFrame: enabled }),
      setIgnoreAtTagWhenCopyingAndGenerating: (enabled) =>
        set({ ignoreAtTagWhenCopyingAndGenerating: enabled }),
      setEnableStoryboardGenGridPreviewShortcut: (enabled) =>
        set({ enableStoryboardGenGridPreviewShortcut: enabled }),
      setShowStoryboardGenAdvancedRatioControls: (enabled) =>
        set({ showStoryboardGenAdvancedRatioControls: enabled }),
      setShowNodePrice: (enabled) => set({ showNodePrice: enabled }),
      setPriceDisplayCurrencyMode: (priceDisplayCurrencyMode) =>
        set({
          priceDisplayCurrencyMode:
            normalizePriceDisplayCurrencyMode(priceDisplayCurrencyMode),
        }),
      setUsdToCnyRate: (usdToCnyRate) =>
        set({ usdToCnyRate: normalizeUsdToCnyRate(usdToCnyRate) }),
      setPreferDiscountedPrice: (enabled) => set({ preferDiscountedPrice: enabled }),
      setGrsaiCreditTierId: (grsaiCreditTierId) =>
        set({ grsaiCreditTierId: normalizeGrsaiCreditTierId(grsaiCreditTierId) }),
      setUiRadiusPreset: (uiRadiusPreset) => set({ uiRadiusPreset }),
      setThemeTonePreset: (themeTonePreset) => set({ themeTonePreset }),
      setAccentColor: (color) => set({ accentColor: normalizeHexColor(color) }),
      setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) =>
        set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) }),
      setAutoCheckAppUpdateOnLaunch: (enabled) => set({ autoCheckAppUpdateOnLaunch: enabled }),
      setEnableUpdateDialog: (enabled) => set({ enableUpdateDialog: enabled }),
    }),
    {
      name: 'settings-storage',
      version: 11,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('failed to hydrate settings storage', error);
          }
          useSettingsStore.setState({ isHydrated: true });
        };
      },
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as {
          apiKey?: string;
          apiKeys?: ProviderApiKeys;
          providerInterfaces?: ProviderInterfaceConfig[];
          activeProviderInterfaceIds?: ActiveProviderInterfaceIds;
          ignoreAtTagWhenCopyingAndGenerating?: boolean;
          grsaiNanoBananaProModel?: string;
          hideProviderGuidePopover?: boolean;
          canvasEdgeRoutingMode?: CanvasEdgeRoutingMode | string;
          autoCheckAppUpdateOnLaunch?: boolean;
          enableUpdateDialog?: boolean;
          enableStoryboardGenGridPreviewShortcut?: boolean;
          showStoryboardGenAdvancedRatioControls?: boolean;
          storyboardGenAutoInferEmptyFrame?: boolean;
          showNodePrice?: boolean;
          priceDisplayCurrencyMode?: PriceDisplayCurrencyMode | string;
          usdToCnyRate?: number | string;
          preferDiscountedPrice?: boolean;
          grsaiCreditTierId?: GrsaiCreditTierId | string;
        };

        const migratedApiKeys = normalizeApiKeys(state.apiKeys);
        const migratedProviderInterfaces = normalizeProviderInterfaces(state.providerInterfaces);
        const providerInterfaces =
          migratedProviderInterfaces.length > 0
            ? migratedProviderInterfaces
            : Object.entries(migratedApiKeys).reduce<ProviderInterfaceConfig[]>(
                (acc, [providerId, apiKey]) => {
                  acc.push(createDefaultProviderInterface(providerId, apiKey));
                  return acc;
                },
                []
              );
        const activeProviderInterfaceIds = normalizeActiveProviderInterfaceIds(
          state.activeProviderInterfaceIds,
          providerInterfaces
        );
        const resolvedApiKeys = buildApiKeysFromProviderInterfaces(
          providerInterfaces,
          activeProviderInterfaceIds,
          migratedApiKeys
        );
        const legacyProviderInterfaces = state.apiKey
          ? [createDefaultProviderInterface('ppio', normalizeApiKey(state.apiKey))]
          : [];
        const legacyActiveProviderInterfaceIds = normalizeActiveProviderInterfaceIds(
          {},
          legacyProviderInterfaces
        );
        const ignoreAtTagWhenCopyingAndGenerating =
          state.ignoreAtTagWhenCopyingAndGenerating ?? true;
        if (
          migratedProviderInterfaces.length > 0 ||
          Object.keys(migratedApiKeys).length > 0
        ) {
          return {
            ...(persistedState as object),
            isHydrated: true,
            apiKeys: resolvedApiKeys,
            providerInterfaces,
            activeProviderInterfaceIds,
            ignoreAtTagWhenCopyingAndGenerating,
            grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
              state.grsaiNanoBananaProModel
            ),
            hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
            canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
            autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
            enableUpdateDialog: state.enableUpdateDialog ?? true,
            enableStoryboardGenGridPreviewShortcut:
              state.enableStoryboardGenGridPreviewShortcut ?? false,
            showStoryboardGenAdvancedRatioControls:
              state.showStoryboardGenAdvancedRatioControls ?? false,
            storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
            showNodePrice: state.showNodePrice ?? true,
            priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
              state.priceDisplayCurrencyMode
            ),
            usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
            preferDiscountedPrice: state.preferDiscountedPrice ?? false,
            grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
          };
        }

        return {
          ...(persistedState as object),
          isHydrated: true,
          apiKeys: buildApiKeysFromProviderInterfaces(
            legacyProviderInterfaces.length > 0 ? legacyProviderInterfaces : providerInterfaces,
            legacyProviderInterfaces.length > 0
              ? legacyActiveProviderInterfaceIds
              : activeProviderInterfaceIds,
            state.apiKey ? { ppio: normalizeApiKey(state.apiKey) } : {}
          ),
          providerInterfaces:
            legacyProviderInterfaces.length > 0 && providerInterfaces.length === 0
              ? legacyProviderInterfaces
              : providerInterfaces,
          activeProviderInterfaceIds:
            legacyProviderInterfaces.length > 0 && providerInterfaces.length === 0
              ? legacyActiveProviderInterfaceIds
              : activeProviderInterfaceIds,
          ignoreAtTagWhenCopyingAndGenerating,
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
            state.grsaiNanoBananaProModel
          ),
          hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
          canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
          autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
          enableUpdateDialog: state.enableUpdateDialog ?? true,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut ?? false,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls ?? false,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
          showNodePrice: state.showNodePrice ?? true,
          priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
            state.priceDisplayCurrencyMode
          ),
          usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
          preferDiscountedPrice: state.preferDiscountedPrice ?? false,
          grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
        };
      },
    }
  )
);
