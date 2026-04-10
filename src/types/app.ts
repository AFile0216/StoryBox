import type { CustomApiInterfaceConfig } from '@/features/canvas/models/customInterfaces';
import type { PromptEnhancementConfig, PromptTemplate } from '@/features/prompt-enhancement/domain/promptTemplate';

export type ProviderKind = 'custom-api' | 'comfyui';
export type VersionFeedSource = 'github' | 'custom';
export type ProviderHealthStatus = 'idle' | 'checking' | 'healthy' | 'unreachable' | 'error';
export type AppTaskType =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-to-video'
  | 'audio-to-video'
  | 'reverse-prompt';

export interface ComfyWorkflowTemplateConfig {
  id: string;
  name: string;
  taskType: AppTaskType;
  promptApiJson: string;
  outputNodeId: string;
  positivePromptNodeIds: string[];
  negativePromptNodeIds: string[];
  imageInputNodeId: string;
  imageInputField: string;
  widthNodeId: string;
  heightNodeId: string;
  seedNodeId: string;
  stepsNodeId: string;
  cfgNodeId: string;
  denoiseNodeId: string;
}

export interface ComfyUiProviderConfig {
  enabled: boolean;
  baseUrl: string;
  defaultWorkflowId: string | null;
  workflows: ComfyWorkflowTemplateConfig[];
  healthStatus?: ProviderHealthStatus;
  lastHealthMessage?: string | null;
  lastCheckedAt?: number | null;
}

export interface ProviderRouteConfig {
  taskType: AppTaskType;
  providerKind: ProviderKind;
  targetId: string | null;
}

export interface VersionFeedSettings {
  source: VersionFeedSource;
  githubRepo: string;
  customFeedUrl: string;
}

export interface PersistedAppSettings {
  customApiInterfaces: CustomApiInterfaceConfig[];
  comfyUi: ComfyUiProviderConfig;
  providerRoutes: ProviderRouteConfig[];
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  versionFeed: VersionFeedSettings;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  uiRadiusPreset: 'compact' | 'default' | 'large';
  themeTonePreset: 'neutral' | 'warm' | 'cool';
  themeContrastPreset: 'balanced' | 'high' | 'soft';
  accentColor: string;
  canvasEdgeRoutingMode: 'spline' | 'orthogonal' | 'smartOrthogonal';
  promptEnhancement?: PromptEnhancementConfig;
  promptTemplates?: PromptTemplate[];
}

export interface BootstrapDirectories {
  appDataDir: string;
  appConfigDir: string;
  cacheDir: string;
  logDir: string;
  projectsDir: string;
  mediaDir: string;
}

export interface BootstrapAppResult {
  appVersion: string;
  directories: BootstrapDirectories;
  settings: PersistedAppSettings | null;
}

export interface ProviderHealthCheckResult {
  providerKind: ProviderKind;
  status: ProviderHealthStatus;
  message: string;
  checkedAt: number;
}

export interface AppVersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  source: VersionFeedSource;
  latestUrl: string | null;
}
