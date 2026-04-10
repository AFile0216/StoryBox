import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildApiKeysFromCustomInterfaces,
  buildCustomInterfacesFromLegacyProviders,
  createDefaultCustomApiInterface,
  getCustomInterfaceById,
  normalizeCustomApiInterfaces,
  type CustomApiInterfaceConfig,
  type LegacyProviderInterfaceConfig,
} from '@/features/canvas/models/customInterfaces';
import {
  createDefaultComfyUiConfig,
  createDefaultComfyWorkflow,
  normalizeComfyWorkflow,
} from '@/features/providers/comfyUi';
import type {
  BootstrapAppResult,
  ComfyUiProviderConfig,
  ComfyWorkflowTemplateConfig,
  PersistedAppSettings,
  ProviderRouteConfig,
  VersionFeedSettings,
} from '@/types/app';
import {
  DEFAULT_PROMPT_ENHANCEMENT_CONFIG,
  type PromptEnhancementConfig,
  type PromptTemplate,
} from '@/features/prompt-enhancement/domain/promptTemplate';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type ThemeContrastPreset = 'balanced' | 'high' | 'soft';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';
export type ProviderApiKeys = Record<string, string>;

interface SettingsState {
  isHydrated: boolean;
  bootstrap: BootstrapAppResult | null;
  apiKeys: ProviderApiKeys;
  customApiInterfaces: CustomApiInterfaceConfig[];
  comfyUi: ComfyUiProviderConfig;
  providerRoutes: ProviderRouteConfig[];
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  themeContrastPreset: ThemeContrastPreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  versionFeed: VersionFeedSettings;
  promptEnhancement: PromptEnhancementConfig;
  promptTemplates: PromptTemplate[];
  setBootstrap: (bootstrap: BootstrapAppResult | null) => void;
  setCustomApiInterfaces: (interfaces: CustomApiInterfaceConfig[]) => void;
  setComfyUi: (config: ComfyUiProviderConfig) => void;
  upsertComfyWorkflow: (workflow: Partial<ComfyWorkflowTemplateConfig>) => void;
  removeComfyWorkflow: (workflowId: string) => void;
  setProviderRoutes: (routes: ProviderRouteConfig[]) => void;
  setVersionFeed: (versionFeed: VersionFeedSettings) => void;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setDownloadPresetPaths: (paths: string[]) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setThemeContrastPreset: (preset: ThemeContrastPreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
  setAutoCheckAppUpdateOnLaunch: (enabled: boolean) => void;
  setEnableUpdateDialog: (enabled: boolean) => void;
  setPromptEnhancement: (config: Partial<PromptEnhancementConfig>) => void;
  setPromptTemplates: (templates: PromptTemplate[]) => void;
  applyPersistedAppSettings: (settings: PersistedAppSettings | null | undefined) => void;
  exportPersistedAppSettings: () => PersistedAppSettings;
}

const DEFAULT_GITHUB_REPO = 'AFile0216/StoryBox';
const DEFAULT_VERSION_FEED: VersionFeedSettings = {
  source: 'github',
  githubRepo: DEFAULT_GITHUB_REPO,
  customFeedUrl: '',
};

const DEFAULT_PROVIDER_ROUTES: ProviderRouteConfig[] = [
  { taskType: 'text-to-image', providerKind: 'custom-api', targetId: null },
  { taskType: 'image-to-image', providerKind: 'custom-api', targetId: null },
  { taskType: 'image-to-video', providerKind: 'comfyui', targetId: null },
  { taskType: 'audio-to-video', providerKind: 'comfyui', targetId: null },
  { taskType: 'reverse-prompt', providerKind: 'custom-api', targetId: null },
];

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return '#3B82F6';
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
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

  return Object.entries(input).reduce<ProviderApiKeys>((acc, [key, value]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = value.trim();
    return acc;
  }, {});
}

function normalizeVersionFeed(input: Partial<VersionFeedSettings> | null | undefined): VersionFeedSettings {
  return {
    source: input?.source === 'custom' ? 'custom' : 'github',
    githubRepo: (input?.githubRepo ?? DEFAULT_GITHUB_REPO).trim() || DEFAULT_GITHUB_REPO,
    customFeedUrl: (input?.customFeedUrl ?? '').trim(),
  };
}

function normalizeProviderRoutes(
  input: ProviderRouteConfig[] | null | undefined
): ProviderRouteConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_PROVIDER_ROUTES;
  }

  const seen = new Set<string>();
  const normalized = input.reduce<ProviderRouteConfig[]>((acc, route) => {
    if (!route?.taskType || seen.has(route.taskType)) {
      return acc;
    }
    seen.add(route.taskType);
    acc.push({
      taskType: route.taskType,
      providerKind: route.providerKind === 'comfyui' ? 'comfyui' : 'custom-api',
      targetId: route.targetId?.trim() || null,
    });
    return acc;
  }, []);

  for (const fallback of DEFAULT_PROVIDER_ROUTES) {
    if (!seen.has(fallback.taskType)) {
      normalized.push(fallback);
    }
  }

  return normalized;
}

function normalizeDownloadPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))).slice(0, 8);
}

export function hasConfiguredApiKey(apiKeys: ProviderApiKeys): boolean {
  return Object.values(apiKeys).some((key) => key.trim().length > 0);
}

export function getConfiguredApiKeyCount(
  apiKeys: ProviderApiKeys,
  interfaceIds?: readonly string[]
): number {
  const keysToCount = interfaceIds
    ? interfaceIds.map((interfaceId) => apiKeys[interfaceId] ?? '')
    : Object.values(apiKeys);

  return keysToCount.reduce((count, key) => (key.trim().length > 0 ? count + 1 : count), 0);
}

export function getConfiguredProviderCount(
  state: Pick<SettingsState, 'customApiInterfaces' | 'comfyUi'>
): number {
  const customApiCount = state.customApiInterfaces.filter(
    (item) => item.apiKey.trim().length > 0 && item.modelIds.length > 0
  ).length;
  const comfyCount =
    state.comfyUi.enabled &&
    state.comfyUi.baseUrl.trim().length > 0 &&
    state.comfyUi.workflows.some(
      (workflow) =>
        workflow.promptApiJson.trim().length > 0 &&
        workflow.outputNodeId.trim().length > 0
    )
      ? 1
      : 0;

  return customApiCount + comfyCount;
}

export function getCustomApiInterface(
  state: Pick<SettingsState, 'customApiInterfaces'>,
  interfaceId: string | null | undefined
): CustomApiInterfaceConfig | undefined {
  return getCustomInterfaceById(state.customApiInterfaces, interfaceId);
}

function applySettingsState(
  set: (partial: Partial<SettingsState>) => void,
  settings: PersistedAppSettings
): void {
  const customApiInterfaces = normalizeCustomApiInterfaces(settings.customApiInterfaces);
  const comfyUi = createDefaultComfyUiConfig(settings.comfyUi);
  set({
    apiKeys: buildApiKeysFromCustomInterfaces(customApiInterfaces),
    customApiInterfaces,
    comfyUi,
    providerRoutes: normalizeProviderRoutes(settings.providerRoutes),
    autoCheckAppUpdateOnLaunch: settings.autoCheckAppUpdateOnLaunch ?? true,
    enableUpdateDialog: settings.enableUpdateDialog ?? true,
    versionFeed: normalizeVersionFeed(settings.versionFeed),
    downloadPresetPaths: normalizeDownloadPaths(settings.downloadPresetPaths),
    useUploadFilenameAsNodeTitle: settings.useUploadFilenameAsNodeTitle ?? true,
    storyboardGenKeepStyleConsistent: settings.storyboardGenKeepStyleConsistent ?? true,
    storyboardGenDisableTextInImage: settings.storyboardGenDisableTextInImage ?? true,
    storyboardGenAutoInferEmptyFrame: settings.storyboardGenAutoInferEmptyFrame ?? true,
    ignoreAtTagWhenCopyingAndGenerating:
      settings.ignoreAtTagWhenCopyingAndGenerating ?? true,
    enableStoryboardGenGridPreviewShortcut:
      settings.enableStoryboardGenGridPreviewShortcut ?? false,
    showStoryboardGenAdvancedRatioControls:
      settings.showStoryboardGenAdvancedRatioControls ?? false,
    uiRadiusPreset: settings.uiRadiusPreset ?? 'default',
    themeTonePreset: settings.themeTonePreset ?? 'neutral',
    themeContrastPreset: settings.themeContrastPreset ?? 'balanced',
    accentColor: normalizeHexColor(settings.accentColor ?? '#3B82F6'),
    canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(settings.canvasEdgeRoutingMode),
    promptEnhancement: settings.promptEnhancement ?? DEFAULT_PROMPT_ENHANCEMENT_CONFIG,
    promptTemplates: settings.promptTemplates ?? [],
  });
}

export { createDefaultCustomApiInterface, type CustomApiInterfaceConfig };
export { createDefaultComfyWorkflow, type ComfyUiProviderConfig, type ComfyWorkflowTemplateConfig };

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      isHydrated: false,
      bootstrap: null,
      apiKeys: {},
      customApiInterfaces: [createDefaultCustomApiInterface()],
      comfyUi: createDefaultComfyUiConfig(),
      providerRoutes: DEFAULT_PROVIDER_ROUTES,
      hideProviderGuidePopover: false,
      downloadPresetPaths: [],
      useUploadFilenameAsNodeTitle: true,
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
      uiRadiusPreset: 'default',
      themeTonePreset: 'neutral',
      themeContrastPreset: 'balanced',
      accentColor: '#3B82F6',
      canvasEdgeRoutingMode: 'spline',
      autoCheckAppUpdateOnLaunch: true,
      enableUpdateDialog: true,
      versionFeed: DEFAULT_VERSION_FEED,
      promptEnhancement: DEFAULT_PROMPT_ENHANCEMENT_CONFIG,
      promptTemplates: [],
      setBootstrap: (bootstrap) => set({ bootstrap }),
      setCustomApiInterfaces: (interfaces) => {
        const normalized = normalizeCustomApiInterfaces(interfaces);
        const resolved = normalized.length > 0 ? normalized : [createDefaultCustomApiInterface()];
        set({
          customApiInterfaces: resolved,
          apiKeys: buildApiKeysFromCustomInterfaces(resolved),
        });
      },
      setComfyUi: (config) => {
        set({ comfyUi: createDefaultComfyUiConfig(config) });
      },
      upsertComfyWorkflow: (workflow) => {
        const current = get().comfyUi;
        const nextWorkflow = normalizeComfyWorkflow(workflow, current.workflows.length);
        const existingIndex = current.workflows.findIndex((item) => item.id === nextWorkflow.id);
        const nextWorkflows = [...current.workflows];
        if (existingIndex >= 0) {
          nextWorkflows[existingIndex] = nextWorkflow;
        } else {
          nextWorkflows.push(nextWorkflow);
        }
        set({
          comfyUi: createDefaultComfyUiConfig({
            ...current,
            workflows: nextWorkflows,
            defaultWorkflowId: current.defaultWorkflowId || nextWorkflow.id,
          }),
        });
      },
      removeComfyWorkflow: (workflowId) => {
        const current = get().comfyUi;
        const nextWorkflows = current.workflows.filter((item) => item.id !== workflowId);
        set({
          comfyUi: createDefaultComfyUiConfig({
            ...current,
            workflows: nextWorkflows,
            defaultWorkflowId:
              current.defaultWorkflowId === workflowId
                ? nextWorkflows[0]?.id ?? null
                : current.defaultWorkflowId,
          }),
        });
      },
      setProviderRoutes: (routes) => set({ providerRoutes: normalizeProviderRoutes(routes) }),
      setVersionFeed: (versionFeed) => set({ versionFeed: normalizeVersionFeed(versionFeed) }),
      setHideProviderGuidePopover: (hide) => set({ hideProviderGuidePopover: hide }),
      setDownloadPresetPaths: (paths) => set({ downloadPresetPaths: normalizeDownloadPaths(paths) }),
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
      setUiRadiusPreset: (uiRadiusPreset) => set({ uiRadiusPreset }),
      setThemeTonePreset: (themeTonePreset) => set({ themeTonePreset }),
      setThemeContrastPreset: (themeContrastPreset) => set({ themeContrastPreset }),
      setAccentColor: (color) => set({ accentColor: normalizeHexColor(color) }),
      setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) =>
        set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) }),
      setAutoCheckAppUpdateOnLaunch: (enabled) => set({ autoCheckAppUpdateOnLaunch: enabled }),
      setEnableUpdateDialog: (enabled) => set({ enableUpdateDialog: enabled }),
      setPromptEnhancement: (config) =>
        set((state) => ({
          promptEnhancement: { ...state.promptEnhancement, ...config },
        })),
      setPromptTemplates: (templates) => set({ promptTemplates: templates }),
      applyPersistedAppSettings: (settings) => {
        if (!settings) {
          return;
        }
        applySettingsState(set, settings);
      },
      exportPersistedAppSettings: () => {
        const state = get();
        return {
          customApiInterfaces: state.customApiInterfaces,
          comfyUi: state.comfyUi,
          providerRoutes: state.providerRoutes,
          autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch,
          enableUpdateDialog: state.enableUpdateDialog,
          versionFeed: state.versionFeed,
          downloadPresetPaths: state.downloadPresetPaths,
          useUploadFilenameAsNodeTitle: state.useUploadFilenameAsNodeTitle,
          storyboardGenKeepStyleConsistent: state.storyboardGenKeepStyleConsistent,
          storyboardGenDisableTextInImage: state.storyboardGenDisableTextInImage,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame,
          ignoreAtTagWhenCopyingAndGenerating: state.ignoreAtTagWhenCopyingAndGenerating,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls,
          uiRadiusPreset: state.uiRadiusPreset,
          themeTonePreset: state.themeTonePreset,
          themeContrastPreset: state.themeContrastPreset,
          accentColor: state.accentColor,
          canvasEdgeRoutingMode: state.canvasEdgeRoutingMode,
          promptEnhancement: state.promptEnhancement,
          promptTemplates: state.promptTemplates,
        };
      },
    }),
    {
      name: 'settings-storage',
      version: 16,
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
          apiKeys?: ProviderApiKeys;
          providerInterfaces?: LegacyProviderInterfaceConfig[];
          customApiInterfaces?: CustomApiInterfaceConfig[];
          comfyUi?: ComfyUiProviderConfig;
          providerRoutes?: ProviderRouteConfig[];
          versionFeed?: VersionFeedSettings;
          apiKey?: string;
          ignoreAtTagWhenCopyingAndGenerating?: boolean;
          hideProviderGuidePopover?: boolean;
          canvasEdgeRoutingMode?: CanvasEdgeRoutingMode | string;
          autoCheckAppUpdateOnLaunch?: boolean;
          enableUpdateDialog?: boolean;
          enableStoryboardGenGridPreviewShortcut?: boolean;
          showStoryboardGenAdvancedRatioControls?: boolean;
          storyboardGenAutoInferEmptyFrame?: boolean;
          downloadPresetPaths?: string[];
          useUploadFilenameAsNodeTitle?: boolean;
          storyboardGenKeepStyleConsistent?: boolean;
          storyboardGenDisableTextInImage?: boolean;
          uiRadiusPreset?: UiRadiusPreset;
          themeTonePreset?: ThemeTonePreset;
          themeContrastPreset?: ThemeContrastPreset;
          accentColor?: string;
        };

        const normalizedApiKeys = normalizeApiKeys(state.apiKeys);
        let customApiInterfaces = normalizeCustomApiInterfaces(state.customApiInterfaces);

        if (customApiInterfaces.length === 0) {
          customApiInterfaces = buildCustomInterfacesFromLegacyProviders(
            state.providerInterfaces,
            normalizedApiKeys
          );
        }

        if (customApiInterfaces.length === 0 && typeof state.apiKey === 'string' && state.apiKey.trim()) {
          customApiInterfaces = [
            createDefaultCustomApiInterface({
              apiKey: state.apiKey.trim(),
            }),
          ];
        }

        if (customApiInterfaces.length === 0) {
          customApiInterfaces = [createDefaultCustomApiInterface()];
        }

        const comfyUi = createDefaultComfyUiConfig(state.comfyUi);

        return {
          ...(persistedState as object),
          isHydrated: true,
          bootstrap: null,
          apiKeys: buildApiKeysFromCustomInterfaces(customApiInterfaces),
          customApiInterfaces,
          comfyUi,
          providerRoutes: normalizeProviderRoutes(state.providerRoutes),
          versionFeed: normalizeVersionFeed(state.versionFeed),
          ignoreAtTagWhenCopyingAndGenerating:
            state.ignoreAtTagWhenCopyingAndGenerating ?? true,
          hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
          canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
          autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
          enableUpdateDialog: state.enableUpdateDialog ?? true,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut ?? false,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls ?? false,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
          downloadPresetPaths: normalizeDownloadPaths(state.downloadPresetPaths ?? []),
          useUploadFilenameAsNodeTitle: state.useUploadFilenameAsNodeTitle ?? true,
          storyboardGenKeepStyleConsistent: state.storyboardGenKeepStyleConsistent ?? true,
          storyboardGenDisableTextInImage: state.storyboardGenDisableTextInImage ?? true,
          uiRadiusPreset: state.uiRadiusPreset ?? 'default',
          themeTonePreset: state.themeTonePreset ?? 'neutral',
          themeContrastPreset: state.themeContrastPreset ?? 'balanced',
          accentColor: normalizeHexColor(state.accentColor ?? '#3B82F6'),
          promptEnhancement: (state as any).promptEnhancement ?? DEFAULT_PROMPT_ENHANCEMENT_CONFIG,
          promptTemplates: (state as any).promptTemplates ?? [],
        };
      },
    }
  )
);
