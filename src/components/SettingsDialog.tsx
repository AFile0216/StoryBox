import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Eye, EyeOff, FolderOpen, Plus, RefreshCw, Trash2, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { UiButton, UiCheckbox, UiInput, UiSelect } from '@/components/ui';
import {
  createDefaultCustomApiInterface,
  createDefaultComfyWorkflow,
  useSettingsStore,
  type ComfyUiProviderConfig,
  type CustomApiInterfaceConfig,
} from '@/stores/settingsStore';
import { UI_CONTENT_OVERLAY_INSET_CLASS, UI_DIALOG_TRANSITION_MS } from '@/components/ui/motion';
import { useDialogTransition } from '@/components/ui/useDialogTransition';
import {
  DEFAULT_CUSTOM_API_BASE_URL,
  parseModelIdsInput,
  stringifyModelIds,
} from '@/features/canvas/models/customInterfaces';
import {
  DEFAULT_COMFYUI_BASE_URL,
  parseNodeIdList,
  stringifyNodeIdList,
} from '@/features/providers/comfyUi';
import { checkProviderHealth, saveAppSettings } from '@/commands/app';
import type { SettingsCategory } from '@/features/settings/settingsEvents';
import type { AppTaskType, PersistedAppSettings, ProviderRouteConfig } from '@/types/app';
import { PromptTemplateDialog } from '@/features/prompt-enhancement/ui/PromptTemplateDialog';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategory;
  onCheckUpdate?: () => Promise<'has-update' | 'up-to-date' | 'failed'>;
}

interface SettingsCheckboxCardProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const TASK_TYPES: Array<{ value: AppTaskType; key: string }> = [
  { value: 'text-to-image', key: 'settings.taskTypeTextToImage' },
  { value: 'image-to-image', key: 'settings.taskTypeImageToImage' },
  { value: 'image-to-video', key: 'settings.taskTypeImageToVideo' },
  { value: 'audio-to-video', key: 'settings.taskTypeAudioToVideo' },
  { value: 'reverse-prompt', key: 'settings.taskTypeReversePrompt' },
];

function SettingsCheckboxCard({
  title,
  description,
  checked,
  onCheckedChange,
}: SettingsCheckboxCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCheckedChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCheckedChange(!checked);
        }
      }}
      className="ui-card w-full p-4 text-left transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-px hover:border-[var(--ui-border-strong)]"
    >
      <div className="flex items-start gap-3">
        <UiCheckbox
          checked={checked}
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 shrink-0"
        />
        <div>
          <h3 className="text-sm font-medium text-text-dark">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

function toPersistedSettings(input: {
  customApiInterfaces: CustomApiInterfaceConfig[];
  comfyUi: ComfyUiProviderConfig;
  providerRoutes: ProviderRouteConfig[];
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
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  versionFeed: PersistedAppSettings['versionFeed'];
}): PersistedAppSettings {
  return {
    customApiInterfaces: input.customApiInterfaces,
    comfyUi: input.comfyUi,
    providerRoutes: input.providerRoutes,
    autoCheckAppUpdateOnLaunch: input.autoCheckAppUpdateOnLaunch,
    enableUpdateDialog: input.enableUpdateDialog,
    versionFeed: input.versionFeed,
    downloadPresetPaths: input.downloadPresetPaths,
    useUploadFilenameAsNodeTitle: input.useUploadFilenameAsNodeTitle,
    storyboardGenKeepStyleConsistent: input.storyboardGenKeepStyleConsistent,
    storyboardGenDisableTextInImage: input.storyboardGenDisableTextInImage,
    storyboardGenAutoInferEmptyFrame: input.storyboardGenAutoInferEmptyFrame,
    ignoreAtTagWhenCopyingAndGenerating: input.ignoreAtTagWhenCopyingAndGenerating,
    enableStoryboardGenGridPreviewShortcut: input.enableStoryboardGenGridPreviewShortcut,
    showStoryboardGenAdvancedRatioControls: input.showStoryboardGenAdvancedRatioControls,
    uiRadiusPreset: input.uiRadiusPreset,
    themeTonePreset: input.themeTonePreset,
    themeContrastPreset: input.themeContrastPreset,
    accentColor: input.accentColor,
    canvasEdgeRoutingMode: input.canvasEdgeRoutingMode,
  };
}

function renderStatus(message: string | undefined) {
  if (!message) {
    return null;
  }
  return <p className="mt-1 text-xs text-text-muted">{message}</p>;
}

export function SettingsDialog({
  isOpen,
  onClose,
  initialCategory = 'general',
  onCheckUpdate,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const {
    customApiInterfaces,
    comfyUi,
    providerRoutes,
    downloadPresetPaths,
    useUploadFilenameAsNodeTitle,
    storyboardGenKeepStyleConsistent,
    storyboardGenDisableTextInImage,
    storyboardGenAutoInferEmptyFrame,
    ignoreAtTagWhenCopyingAndGenerating,
    enableStoryboardGenGridPreviewShortcut,
    showStoryboardGenAdvancedRatioControls,
    uiRadiusPreset,
    themeTonePreset,
    themeContrastPreset,
    accentColor,
    canvasEdgeRoutingMode,
    autoCheckAppUpdateOnLaunch,
    enableUpdateDialog,
    versionFeed,
    setCustomApiInterfaces,
    setComfyUi,
    setProviderRoutes,
    setVersionFeed,
    setDownloadPresetPaths,
    setUseUploadFilenameAsNodeTitle,
    setStoryboardGenKeepStyleConsistent,
    setStoryboardGenDisableTextInImage,
    setStoryboardGenAutoInferEmptyFrame,
    setIgnoreAtTagWhenCopyingAndGenerating,
    setEnableStoryboardGenGridPreviewShortcut,
    setShowStoryboardGenAdvancedRatioControls,
    setUiRadiusPreset,
    setThemeTonePreset,
    setThemeContrastPreset,
    setAccentColor,
    setCanvasEdgeRoutingMode,
    setAutoCheckAppUpdateOnLaunch,
    setEnableUpdateDialog,
    promptEnhancement,
    setPromptEnhancement,
  } = useSettingsStore();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [appVersion, setAppVersion] = useState('');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [localCustomApiInterfaces, setLocalCustomApiInterfaces] = useState(customApiInterfaces);
  const [localComfyUi, setLocalComfyUi] = useState(comfyUi);
  const [localProviderRoutes, setLocalProviderRoutes] = useState(providerRoutes);
  const [localDownloadPathInput, setLocalDownloadPathInput] = useState('');
  const [localDownloadPresetPaths, setLocalDownloadPresetPaths] = useState(downloadPresetPaths);
  const [localUseUploadFilenameAsNodeTitle, setLocalUseUploadFilenameAsNodeTitle] = useState(useUploadFilenameAsNodeTitle);
  const [localStoryboardGenKeepStyleConsistent, setLocalStoryboardGenKeepStyleConsistent] = useState(storyboardGenKeepStyleConsistent);
  const [localStoryboardGenDisableTextInImage, setLocalStoryboardGenDisableTextInImage] = useState(storyboardGenDisableTextInImage);
  const [localStoryboardGenAutoInferEmptyFrame, setLocalStoryboardGenAutoInferEmptyFrame] = useState(storyboardGenAutoInferEmptyFrame);
  const [localIgnoreAtTagWhenCopyingAndGenerating, setLocalIgnoreAtTagWhenCopyingAndGenerating] = useState(ignoreAtTagWhenCopyingAndGenerating);
  const [localEnableStoryboardGenGridPreviewShortcut, setLocalEnableStoryboardGenGridPreviewShortcut] = useState(enableStoryboardGenGridPreviewShortcut);
  const [localShowStoryboardGenAdvancedRatioControls, setLocalShowStoryboardGenAdvancedRatioControls] = useState(showStoryboardGenAdvancedRatioControls);
  const [localUiRadiusPreset, setLocalUiRadiusPreset] = useState(uiRadiusPreset);
  const [localThemeTonePreset, setLocalThemeTonePreset] = useState(themeTonePreset);
  const [localThemeContrastPreset, setLocalThemeContrastPreset] = useState(themeContrastPreset);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  const [localCanvasEdgeRoutingMode, setLocalCanvasEdgeRoutingMode] = useState(canvasEdgeRoutingMode);
  const [localAutoCheckAppUpdateOnLaunch, setLocalAutoCheckAppUpdateOnLaunch] = useState(autoCheckAppUpdateOnLaunch);
  const [localEnableUpdateDialog, setLocalEnableUpdateDialog] = useState(enableUpdateDialog);
  const [localVersionFeed, setLocalVersionFeed] = useState(versionFeed);
  const [checkUpdateStatus, setCheckUpdateStatus] = useState<'' | 'checking' | 'has-update' | 'up-to-date' | 'failed'>('');
  const [saveStatus, setSaveStatus] = useState<'' | 'saved' | 'failed'>('');
  const [isSaving, setIsSaving] = useState(false);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, boolean>>({});
  const [providerHealth, setProviderHealth] = useState<Record<string, string>>({});
  const { shouldRender, isVisible } = useDialogTransition(isOpen, UI_DIALOG_TRANSITION_MS);

  useEffect(() => {
    let mounted = true;
    void getVersion()
      .then((version) => {
        if (mounted) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (mounted) {
          setAppVersion('');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveCategory(initialCategory);
    setLocalCustomApiInterfaces(customApiInterfaces);
    setLocalComfyUi(comfyUi);
    setLocalProviderRoutes(providerRoutes);
    setLocalDownloadPresetPaths(downloadPresetPaths);
    setLocalUseUploadFilenameAsNodeTitle(useUploadFilenameAsNodeTitle);
    setLocalStoryboardGenKeepStyleConsistent(storyboardGenKeepStyleConsistent);
    setLocalStoryboardGenDisableTextInImage(storyboardGenDisableTextInImage);
    setLocalStoryboardGenAutoInferEmptyFrame(storyboardGenAutoInferEmptyFrame);
    setLocalIgnoreAtTagWhenCopyingAndGenerating(ignoreAtTagWhenCopyingAndGenerating);
    setLocalEnableStoryboardGenGridPreviewShortcut(enableStoryboardGenGridPreviewShortcut);
    setLocalShowStoryboardGenAdvancedRatioControls(showStoryboardGenAdvancedRatioControls);
    setLocalUiRadiusPreset(uiRadiusPreset);
    setLocalThemeTonePreset(themeTonePreset);
    setLocalThemeContrastPreset(themeContrastPreset);
    setLocalAccentColor(accentColor);
    setLocalCanvasEdgeRoutingMode(canvasEdgeRoutingMode);
    setLocalAutoCheckAppUpdateOnLaunch(autoCheckAppUpdateOnLaunch);
    setLocalEnableUpdateDialog(enableUpdateDialog);
    setLocalVersionFeed(versionFeed);
    setLocalDownloadPathInput('');
    setCheckUpdateStatus('');
    setSaveStatus('');
    setIsSaving(false);
    setRevealedApiKeys({});
    setProviderHealth({});
  }, [
    accentColor,
    autoCheckAppUpdateOnLaunch,
    canvasEdgeRoutingMode,
    comfyUi,
    customApiInterfaces,
    downloadPresetPaths,
    enableStoryboardGenGridPreviewShortcut,
    enableUpdateDialog,
    ignoreAtTagWhenCopyingAndGenerating,
    initialCategory,
    isOpen,
    providerRoutes,
    showStoryboardGenAdvancedRatioControls,
    storyboardGenAutoInferEmptyFrame,
    storyboardGenDisableTextInImage,
    storyboardGenKeepStyleConsistent,
    themeContrastPreset,
    themeTonePreset,
    uiRadiusPreset,
    useUploadFilenameAsNodeTitle,
    versionFeed,
  ]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus('');
    setCustomApiInterfaces(localCustomApiInterfaces);
    setComfyUi(localComfyUi);
    setProviderRoutes(localProviderRoutes);
    setVersionFeed(localVersionFeed);
    setDownloadPresetPaths(localDownloadPresetPaths);
    setUseUploadFilenameAsNodeTitle(localUseUploadFilenameAsNodeTitle);
    setStoryboardGenKeepStyleConsistent(localStoryboardGenKeepStyleConsistent);
    setStoryboardGenDisableTextInImage(localStoryboardGenDisableTextInImage);
    setStoryboardGenAutoInferEmptyFrame(localStoryboardGenAutoInferEmptyFrame);
    setIgnoreAtTagWhenCopyingAndGenerating(localIgnoreAtTagWhenCopyingAndGenerating);
    setEnableStoryboardGenGridPreviewShortcut(localEnableStoryboardGenGridPreviewShortcut);
    setShowStoryboardGenAdvancedRatioControls(localShowStoryboardGenAdvancedRatioControls);
    setUiRadiusPreset(localUiRadiusPreset);
    setThemeTonePreset(localThemeTonePreset);
    setThemeContrastPreset(localThemeContrastPreset);
    setAccentColor(localAccentColor);
    setCanvasEdgeRoutingMode(localCanvasEdgeRoutingMode);
    setAutoCheckAppUpdateOnLaunch(localAutoCheckAppUpdateOnLaunch);
    setEnableUpdateDialog(localEnableUpdateDialog);

    try {
      await saveAppSettings(
        toPersistedSettings({
          customApiInterfaces: localCustomApiInterfaces,
          comfyUi: localComfyUi,
          providerRoutes: localProviderRoutes,
          versionFeed: localVersionFeed,
          downloadPresetPaths: localDownloadPresetPaths,
          useUploadFilenameAsNodeTitle: localUseUploadFilenameAsNodeTitle,
          storyboardGenKeepStyleConsistent: localStoryboardGenKeepStyleConsistent,
          storyboardGenDisableTextInImage: localStoryboardGenDisableTextInImage,
          storyboardGenAutoInferEmptyFrame: localStoryboardGenAutoInferEmptyFrame,
          ignoreAtTagWhenCopyingAndGenerating: localIgnoreAtTagWhenCopyingAndGenerating,
          enableStoryboardGenGridPreviewShortcut: localEnableStoryboardGenGridPreviewShortcut,
          showStoryboardGenAdvancedRatioControls: localShowStoryboardGenAdvancedRatioControls,
          uiRadiusPreset: localUiRadiusPreset,
          themeTonePreset: localThemeTonePreset,
          themeContrastPreset: localThemeContrastPreset,
          accentColor: localAccentColor,
          canvasEdgeRoutingMode: localCanvasEdgeRoutingMode,
          autoCheckAppUpdateOnLaunch: localAutoCheckAppUpdateOnLaunch,
          enableUpdateDialog: localEnableUpdateDialog,
        })
      );
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus(''), 1500);
    } catch (error) {
      console.error('Failed to save app settings', error);
      setSaveStatus('failed');
    } finally {
      setIsSaving(false);
    }
  }, [
    localAccentColor,
    localAutoCheckAppUpdateOnLaunch,
    localCanvasEdgeRoutingMode,
    localComfyUi,
    localCustomApiInterfaces,
    localDownloadPresetPaths,
    localEnableStoryboardGenGridPreviewShortcut,
    localEnableUpdateDialog,
    localIgnoreAtTagWhenCopyingAndGenerating,
    localProviderRoutes,
    localShowStoryboardGenAdvancedRatioControls,
    localStoryboardGenAutoInferEmptyFrame,
    localStoryboardGenDisableTextInImage,
    localStoryboardGenKeepStyleConsistent,
    localThemeContrastPreset,
    localThemeTonePreset,
    localUiRadiusPreset,
    localUseUploadFilenameAsNodeTitle,
    localVersionFeed,
    setAccentColor,
    setAutoCheckAppUpdateOnLaunch,
    setCanvasEdgeRoutingMode,
    setComfyUi,
    setCustomApiInterfaces,
    setDownloadPresetPaths,
    setEnableStoryboardGenGridPreviewShortcut,
    setEnableUpdateDialog,
    setIgnoreAtTagWhenCopyingAndGenerating,
    setProviderRoutes,
    setShowStoryboardGenAdvancedRatioControls,
    setThemeContrastPreset,
    setStoryboardGenAutoInferEmptyFrame,
    setStoryboardGenDisableTextInImage,
    setStoryboardGenKeepStyleConsistent,
    setThemeTonePreset,
    setUiRadiusPreset,
    setUseUploadFilenameAsNodeTitle,
    setVersionFeed,
  ]);

  const handleCheckUpdate = useCallback(async () => {
    if (!onCheckUpdate) {
      return;
    }
    setCheckUpdateStatus('checking');
    setCheckUpdateStatus(await onCheckUpdate());
  }, [onCheckUpdate]);

  const handleAddCustomApiInterface = useCallback(() => {
    setLocalCustomApiInterfaces((previous) => [
      ...previous,
      createDefaultCustomApiInterface({
        name: `${t('settings.customApiFallbackName')} ${previous.length + 1}`,
      }),
    ]);
  }, [t]);

  const handleRemoveCustomApiInterface = useCallback((interfaceId: string) => {
    setLocalCustomApiInterfaces((previous) =>
      previous.length <= 1 ? previous : previous.filter((item) => item.id !== interfaceId)
    );
  }, []);

  const handlePickDownloadPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      setLocalDownloadPresetPaths((previous) =>
        previous.includes(selected) ? previous : [...previous, selected].slice(0, 8)
      );
    } catch (error) {
      console.error('Failed to pick download path', error);
    }
  }, []);

  const handleAddDownloadPathFromInput = useCallback(() => {
    const next = localDownloadPathInput.trim();
    if (!next) {
      return;
    }
    setLocalDownloadPresetPaths((previous) =>
      previous.includes(next) ? previous : [...previous, next].slice(0, 8)
    );
    setLocalDownloadPathInput('');
  }, [localDownloadPathInput]);

  const customRouteOptions = useMemo(
    () => localCustomApiInterfaces.map((item) => ({ id: item.id, label: item.name })),
    [localCustomApiInterfaces]
  );
  const comfyRouteOptions = useMemo(
    () =>
      localComfyUi.workflows.map((workflow) => ({
        id: workflow.id,
        label: `${workflow.name} (${workflow.taskType})`,
      })),
    [localComfyUi.workflows]
  );

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <div className={`fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} z-50 flex items-center justify-center p-3 md:p-5`}>
      <div
        className={`absolute inset-0 bg-black/68 backdrop-blur-[2px] transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div className="relative w-[min(96vw,1220px)]">
        <div
          className={`relative mx-auto flex h-[min(90vh,800px)] w-full overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-shadow-panel)] transition-[opacity,transform] duration-200 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
        >
          <button onClick={onClose} className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-colors hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark">
            <X className="h-5 w-5 text-text-muted" />
          </button>

          <div className="w-[210px] border-r border-[var(--ui-border-soft)] bg-[rgba(var(--bg-rgb),0.52)] px-3 py-3">
            <div className="px-2 py-3">
              <span className="ui-display-title text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                {t('settings.title')}
              </span>
            </div>
            {(['general', 'providers', 'prompt', 'appearance', 'experimental', 'about'] as SettingsCategory[]).map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`mb-1 w-full rounded-[var(--ui-radius-lg)] px-3 py-2.5 text-left transition-all duration-150 ${
                  activeCategory === category
                    ? 'border border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(var(--accent-rgb),0.15)] text-text-dark shadow-[0_8px_20px_rgba(var(--accent-rgb),0.14)]'
                    : 'border border-transparent text-text-muted hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark'
                }`}
              >
                <span className="text-sm">{t(`settings.${category}`)}</span>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-[var(--ui-border-soft)] px-6 py-5">
              <h2 className="ui-display-title text-[14px] uppercase tracking-[0.08em] text-text-dark">{t(`settings.${activeCategory}`)}</h2>
              <p className="mt-1 text-sm text-text-muted">{t(`settings.${activeCategory}Desc`)}</p>
            </div>

            <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
              {activeCategory === 'general' && (
                <>
                  <SettingsCheckboxCard
                    checked={localStoryboardGenKeepStyleConsistent}
                    onCheckedChange={setLocalStoryboardGenKeepStyleConsistent}
                    title={t('settings.storyboardGenKeepStyleConsistent')}
                    description={t('settings.storyboardGenKeepStyleConsistentDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localIgnoreAtTagWhenCopyingAndGenerating}
                    onCheckedChange={setLocalIgnoreAtTagWhenCopyingAndGenerating}
                    title={t('settings.ignoreAtTagWhenCopyingAndGenerating')}
                    description={t('settings.ignoreAtTagWhenCopyingAndGeneratingDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localStoryboardGenDisableTextInImage}
                    onCheckedChange={setLocalStoryboardGenDisableTextInImage}
                    title={t('settings.storyboardGenDisableTextInImage')}
                    description={t('settings.storyboardGenDisableTextInImageDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localUseUploadFilenameAsNodeTitle}
                    onCheckedChange={setLocalUseUploadFilenameAsNodeTitle}
                    title={t('settings.useUploadFilenameAsNodeTitle')}
                    description={t('settings.useUploadFilenameAsNodeTitleDesc')}
                  />
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.downloadPresetPaths')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.downloadPresetPathsDesc')}</p>
                    <div className="mb-2 mt-3 flex items-center gap-2">
                      <input
                        value={localDownloadPathInput}
                        onChange={(event) => setLocalDownloadPathInput(event.target.value)}
                        placeholder={t('settings.downloadPathPlaceholder')}
                        className="h-9 flex-1 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-sm text-text-dark"
                      />
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                        onClick={handleAddDownloadPathFromInput}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('settings.addPath')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                        onClick={() => void handlePickDownloadPath()}
                      >
                        <FolderOpen className="mr-1 h-3.5 w-3.5" />
                        {t('settings.chooseFolder')}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {localDownloadPresetPaths.length === 0 ? (
                        <div className="rounded-[var(--ui-radius-lg)] border border-dashed border-[var(--ui-border-soft)] px-3 py-2 text-xs text-text-muted">
                          {t('settings.noDownloadPresetPaths')}
                        </div>
                      ) : (
                        localDownloadPresetPaths.map((path) => (
                          <div key={path} className="flex items-center justify-between gap-3 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2">
                            <span className="truncate text-xs text-text-dark">{path}</span>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-[var(--ui-surface-field)]"
                              onClick={() =>
                                setLocalDownloadPresetPaths((previous) => previous.filter((item) => item !== path))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
              {activeCategory === 'providers' && (
                <>
                  <div className="ui-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-text-dark">{t('settings.customApiListTitle')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('settings.customApiListHint')}</p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                        onClick={handleAddCustomApiInterface}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('settings.addCustomApi')}
                      </button>
                    </div>
                  </div>
                  {localCustomApiInterfaces.map((apiInterface, index) => {
                    const isRevealed = Boolean(revealedApiKeys[apiInterface.id]);
                    return (
                      <div key={apiInterface.id} className="ui-card p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-medium text-text-dark">
                              {apiInterface.name || `${t('settings.customApiFallbackName')} ${index + 1}`}
                            </h3>
                            {renderStatus(providerHealth[apiInterface.id] ?? t('settings.customApiCardHint'))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                              onClick={() =>
                                void checkProviderHealth('custom-api', apiInterface.baseUrl).then((result) =>
                                  setProviderHealth((previous) => ({ ...previous, [apiInterface.id]: result.message }))
                                ).catch((error) =>
                                  setProviderHealth((previous) => ({ ...previous, [apiInterface.id]: String(error) }))
                                )
                              }
                            >
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              {t('settings.testConnection')}
                            </button>
                            {localCustomApiInterfaces.length > 1 && (
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-black/20 hover:text-text-dark"
                                onClick={() => handleRemoveCustomApiInterface(apiInterface.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input
                            value={apiInterface.name}
                            onChange={(event) =>
                              setLocalCustomApiInterfaces((previous) =>
                                previous.map((item) =>
                                  item.id === apiInterface.id ? { ...item, name: event.target.value } : item
                                )
                              )
                            }
                            placeholder={t('settings.customApiNamePlaceholder')}
                            className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                          />
                          <input
                            value={apiInterface.baseUrl}
                            onChange={(event) =>
                              setLocalCustomApiInterfaces((previous) =>
                                previous.map((item) =>
                                  item.id === apiInterface.id ? { ...item, baseUrl: event.target.value } : item
                                )
                              )
                            }
                            placeholder={DEFAULT_CUSTOM_API_BASE_URL}
                            className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                          />
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <UiSelect
                            value={apiInterface.requestMode}
                            onChange={(event) =>
                              setLocalCustomApiInterfaces((previous) =>
                                previous.map((item) =>
                                  item.id === apiInterface.id
                                    ? { ...item, requestMode: event.target.value as CustomApiInterfaceConfig['requestMode'] }
                                    : item
                                )
                              )
                            }
                            className="h-9 text-sm"
                          >
                            <option value="images">{t('settings.customApiRequestModeImages')}</option>
                            <option value="chat-completions">{t('settings.customApiRequestModeChatCompletions')}</option>
                          </UiSelect>
                          <div className="relative">
                            <input
                              type={isRevealed ? 'text' : 'password'}
                              value={apiInterface.apiKey}
                              onChange={(event) =>
                                setLocalCustomApiInterfaces((previous) =>
                                  previous.map((item) =>
                                    item.id === apiInterface.id ? { ...item, apiKey: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t('settings.enterApiKey')}
                              className="w-full rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 pr-10 text-sm text-text-dark"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-2 rounded p-1 hover:bg-[var(--ui-surface-field)]"
                              onClick={() =>
                                setRevealedApiKeys((previous) => ({
                                  ...previous,
                                  [apiInterface.id]: !isRevealed,
                                }))
                              }
                            >
                              {isRevealed ? <EyeOff className="h-4 w-4 text-text-muted" /> : <Eye className="h-4 w-4 text-text-muted" />}
                            </button>
                          </div>
                        </div>
                        <label className="mt-3 flex items-start gap-3 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2.5">
                          <UiCheckbox
                            checked={apiInterface.omitSizeParams}
                            onCheckedChange={(checked) =>
                              setLocalCustomApiInterfaces((previous) =>
                                previous.map((item) =>
                                  item.id === apiInterface.id ? { ...item, omitSizeParams: checked } : item
                                )
                              )
                            }
                            className="mt-0.5"
                          />
                          <div>
                            <div className="text-xs font-medium text-text-dark">{t('settings.customApiOmitSizeParams')}</div>
                            <p className="mt-1 text-xs text-text-muted">{t('settings.customApiOmitSizeParamsHint')}</p>
                          </div>
                        </label>
                        <textarea
                          value={stringifyModelIds(apiInterface.modelIds)}
                          onChange={(event) =>
                            setLocalCustomApiInterfaces((previous) =>
                              previous.map((item) =>
                                item.id === apiInterface.id ? { ...item, modelIds: parseModelIdsInput(event.target.value) } : item
                              )
                            )
                          }
                          rows={5}
                          placeholder={t('settings.customApiModelsPlaceholder')}
                          className="ui-scrollbar mt-3 w-full resize-y rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                        />
                      </div>
                    );
                  })}
                  <div className="ui-card p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-text-dark">{t('settings.comfyTitle')}</h3>
                        {renderStatus(providerHealth.comfyui ?? t('settings.comfyDesc'))}
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                        onClick={() =>
                          void checkProviderHealth('comfyui', localComfyUi.baseUrl).then((result) =>
                            setProviderHealth((previous) => ({ ...previous, comfyui: result.message }))
                          ).catch((error) =>
                            setProviderHealth((previous) => ({ ...previous, comfyui: String(error) }))
                          )
                        }
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        {t('settings.testConnection')}
                      </button>
                    </div>
                    <SettingsCheckboxCard
                      checked={localComfyUi.enabled}
                      onCheckedChange={(checked) =>
                        setLocalComfyUi((previous) => ({ ...previous, enabled: checked }))
                      }
                      title={t('settings.comfyEnabled')}
                      description={t('settings.comfyEnabledDesc')}
                    />
                    <input
                      value={localComfyUi.baseUrl}
                      onChange={(event) =>
                        setLocalComfyUi((previous) => ({ ...previous, baseUrl: event.target.value }))
                      }
                      placeholder={DEFAULT_COMFYUI_BASE_URL}
                      className="mt-3 w-full rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-text-muted">{t('settings.comfyWorkflowHint')}</div>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark"
                        onClick={() =>
                          setLocalComfyUi((previous) => ({
                            ...previous,
                            workflows: [
                              ...previous.workflows,
                              createDefaultComfyWorkflow('text-to-image', {
                                name: `${t('settings.comfyWorkflowFallbackName')} ${previous.workflows.length + 1}`,
                              }),
                            ],
                          }))
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('settings.addComfyWorkflow')}
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {localComfyUi.workflows.map((workflow, index) => (
                        <div key={workflow.id} className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-text-dark">
                                {workflow.name || `${t('settings.comfyWorkflowFallbackName')} ${index + 1}`}
                              </div>
                              <div className="mt-1 text-xs text-text-muted">{workflow.taskType}</div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-[var(--ui-surface-field)]"
                              onClick={() =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.filter((item) => item.id !== workflow.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              value={workflow.name}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id ? { ...item, name: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder={t('settings.comfyWorkflowName')}
                              className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                            />
                            <UiSelect
                              value={workflow.taskType}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id
                                      ? { ...item, taskType: event.target.value as AppTaskType }
                                      : item
                                  ),
                                }))
                              }
                              className="h-9 text-sm"
                            >
                              {TASK_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {t(option.key)}
                                </option>
                              ))}
                            </UiSelect>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <input
                              value={workflow.outputNodeId}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id ? { ...item, outputNodeId: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder={t('settings.comfyOutputNodeId')}
                              className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                            />
                            <input
                              value={workflow.imageInputNodeId}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id ? { ...item, imageInputNodeId: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder={t('settings.comfyImageInputNodeId')}
                              className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                            />
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <input
                              value={stringifyNodeIdList(workflow.positivePromptNodeIds)}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id ? { ...item, positivePromptNodeIds: parseNodeIdList(event.target.value) } : item
                                  ),
                                }))
                              }
                              placeholder={t('settings.comfyPositivePromptNodes')}
                              className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                            />
                            <input
                              value={stringifyNodeIdList(workflow.negativePromptNodeIds)}
                              onChange={(event) =>
                                setLocalComfyUi((previous) => ({
                                  ...previous,
                                  workflows: previous.workflows.map((item) =>
                                    item.id === workflow.id ? { ...item, negativePromptNodeIds: parseNodeIdList(event.target.value) } : item
                                  ),
                                }))
                              }
                              placeholder={t('settings.comfyNegativePromptNodes')}
                              className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                            />
                          </div>
                          <textarea
                            value={workflow.promptApiJson}
                            onChange={(event) =>
                              setLocalComfyUi((previous) => ({
                                ...previous,
                                workflows: previous.workflows.map((item) =>
                                  item.id === workflow.id ? { ...item, promptApiJson: event.target.value } : item
                                ),
                              }))
                            }
                            rows={8}
                            placeholder={t('settings.comfyPromptApiJson')}
                            className="ui-scrollbar mt-3 w-full resize-y rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.providerRoutingTitle')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.providerRoutingDesc')}</p>
                    <div className="mt-3 space-y-3">
                      {localProviderRoutes.map((route) => (
                        <div key={route.taskType} className="grid gap-3 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3 md:grid-cols-[180px_160px_1fr]">
                          <div className="text-sm text-text-dark">
                            {t(TASK_TYPES.find((item) => item.value === route.taskType)?.key ?? '')}
                          </div>
                          <UiSelect
                            value={route.providerKind}
                            onChange={(event) =>
                              setLocalProviderRoutes((previous) =>
                                previous.map((item) =>
                                  item.taskType === route.taskType
                                    ? { ...item, providerKind: event.target.value === 'comfyui' ? 'comfyui' : 'custom-api', targetId: null }
                                    : item
                                )
                              )
                            }
                            className="h-9 text-sm"
                          >
                            <option value="custom-api">{t('settings.providers')}</option>
                            <option value="comfyui">{t('settings.comfyTitle')}</option>
                          </UiSelect>
                          <UiSelect
                            value={route.targetId ?? ''}
                            onChange={(event) =>
                              setLocalProviderRoutes((previous) =>
                                previous.map((item) =>
                                  item.taskType === route.taskType ? { ...item, targetId: event.target.value || null } : item
                                )
                              )
                            }
                            className="h-9 text-sm"
                          >
                            <option value="">{t('settings.routeUseDefault')}</option>
                            {(route.providerKind === 'comfyui' ? comfyRouteOptions : customRouteOptions).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </UiSelect>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {activeCategory === 'appearance' && (
                <>
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.radiusPreset')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.radiusPresetDesc')}</p>
                    <UiSelect
                      value={localUiRadiusPreset}
                      onChange={(event) => setLocalUiRadiusPreset(event.target.value as typeof localUiRadiusPreset)}
                      className="mt-3 h-9 text-sm"
                    >
                      <option value="compact">{t('settings.radiusCompact')}</option>
                      <option value="default">{t('settings.radiusDefault')}</option>
                      <option value="large">{t('settings.radiusLarge')}</option>
                    </UiSelect>
                  </div>
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.themeTone')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.themeToneDesc')}</p>
                    <UiSelect
                      value={localThemeTonePreset}
                      onChange={(event) =>
                        setLocalThemeTonePreset(event.target.value as typeof localThemeTonePreset)
                      }
                      className="mt-3 h-9 text-sm"
                    >
                      <option value="neutral">{t('settings.toneNeutral')}</option>
                      <option value="warm">{t('settings.toneWarm')}</option>
                      <option value="cool">{t('settings.toneCool')}</option>
                    </UiSelect>
                  </div>
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.themeContrast')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.themeContrastDesc')}</p>
                    <UiSelect
                      value={localThemeContrastPreset}
                      onChange={(event) =>
                        setLocalThemeContrastPreset(event.target.value as typeof localThemeContrastPreset)
                      }
                      className="mt-3 h-9 text-sm"
                    >
                      <option value="balanced">{t('settings.contrastBalanced')}</option>
                      <option value="high">{t('settings.contrastHigh')}</option>
                      <option value="soft">{t('settings.contrastSoft')}</option>
                    </UiSelect>
                  </div>
                </>
              )}
              {activeCategory === 'prompt' && (
                <>
                  <div className="ui-card p-4">
                    <h3 className="mb-3 text-sm font-medium text-text-dark">{t('settings.promptAutoEnhanceTitle', { defaultValue: 'Auto Enhancement' })}</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-sm text-text-dark">{t('settings.promptEnhanceEnable', { defaultValue: 'Enable prompt enhancement' })}</span>
                          <p className="mt-0.5 text-xs text-text-muted">{t('settings.promptEnhanceEnableDesc', { defaultValue: 'Append quality tags, prefix and suffix during generation.' })}</p>
                        </div>
                        <UiCheckbox
                          checked={promptEnhancement.enabled}
                          onCheckedChange={(checked) => setPromptEnhancement({ enabled: checked })}
                        />
                      </label>

                      {promptEnhancement.enabled ? (
                        <>
                          <label className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-sm text-text-dark">{t('settings.promptAutoQuality', { defaultValue: 'Auto append quality tags' })}</span>
                              <p className="mt-0.5 text-xs text-text-muted">{t('settings.promptAutoQualityDesc', { defaultValue: 'Automatically append quality hints at the end of prompts.' })}</p>
                            </div>
                            <UiCheckbox
                              checked={promptEnhancement.autoAppendQualityTags}
                              onCheckedChange={(checked) => setPromptEnhancement({ autoAppendQualityTags: checked })}
                            />
                          </label>

                          {promptEnhancement.autoAppendQualityTags ? (
                            <div>
                              <label className="mb-1.5 block text-xs text-text-muted">{t('settings.promptQualityTags', { defaultValue: 'Quality tags' })}</label>
                              <textarea
                                value={promptEnhancement.qualityTags}
                                onChange={(event) => setPromptEnhancement({ qualityTags: event.target.value })}
                                placeholder="masterpiece, best quality, highly detailed"
                                rows={2}
                                className="w-full resize-none rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/50 focus:border-[rgba(var(--accent-rgb),0.6)] focus:outline-none"
                              />
                            </div>
                          ) : null}

                          <div>
                            <label className="mb-1.5 block text-xs text-text-muted">{t('settings.promptCustomPrefix', { defaultValue: 'Custom Prefix' })}</label>
                            <UiInput
                              value={promptEnhancement.customPrefix}
                              onChange={(event) => setPromptEnhancement({ customPrefix: event.target.value })}
                              placeholder={t('settings.promptCustomPrefixPlaceholder', { defaultValue: 'Inserted before prompt, e.g. 8k wallpaper' })}
                            />
                          </div>

                          <div>
                            <label className="mb-1.5 block text-xs text-text-muted">{t('settings.promptCustomSuffix', { defaultValue: 'Custom Suffix' })}</label>
                            <UiInput
                              value={promptEnhancement.customSuffix}
                              onChange={(event) => setPromptEnhancement({ customSuffix: event.target.value })}
                              placeholder={t('settings.promptCustomSuffixPlaceholder', { defaultValue: 'Inserted after prompt, e.g. trending on artstation' })}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="ui-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-text-dark">{t('settings.promptTemplateLibraryTitle', { defaultValue: 'Prompt Template Library' })}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('settings.promptTemplateLibraryDesc', { defaultValue: 'Manage built-in and custom templates for fast insertion.' })}</p>
                      </div>
                      <UiButton
                        type="button"
                        variant="muted"
                        size="sm"
                        onClick={() => setShowTemplateDialog(true)}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        {t('settings.promptTemplateManage', { defaultValue: 'Manage Templates' })}
                      </UiButton>
                    </div>
                  </div>
                </>
              )}
{activeCategory === 'experimental' && (
                <>
                  <SettingsCheckboxCard
                    checked={localEnableStoryboardGenGridPreviewShortcut}
                    onCheckedChange={setLocalEnableStoryboardGenGridPreviewShortcut}
                    title={t('settings.enableStoryboardGenGridPreviewShortcut')}
                    description={t('settings.enableStoryboardGenGridPreviewShortcutDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localShowStoryboardGenAdvancedRatioControls}
                    onCheckedChange={setLocalShowStoryboardGenAdvancedRatioControls}
                    title={t('settings.showStoryboardGenAdvancedRatioControls')}
                    description={t('settings.showStoryboardGenAdvancedRatioControlsDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localStoryboardGenAutoInferEmptyFrame}
                    onCheckedChange={setLocalStoryboardGenAutoInferEmptyFrame}
                    title={t('settings.storyboardGenAutoInferEmptyFrame')}
                    description={t('settings.storyboardGenAutoInferEmptyFrameDesc')}
                  />
                </>
              )}
              {activeCategory === 'about' && (
                <>
                  <div className="ui-card p-4 space-y-2 text-sm">
                    <p className="text-text-dark">
                      {t('settings.aboutVersionLabel')}:{' '}
                      <span className="text-text-muted">{appVersion || t('settings.aboutVersionUnknown')}</span>
                    </p>
                    <p className="text-text-dark">
                      {t('settings.aboutRepositoryLabel')}:{' '}
                      <span className="break-all text-text-muted">{localVersionFeed.githubRepo}</span>
                    </p>
                  </div>
                  <div className="ui-card p-4">
                    <h3 className="text-sm font-medium text-text-dark">{t('settings.versionFeedTitle')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('settings.versionFeedDesc')}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <UiSelect
                        value={localVersionFeed.source}
                        onChange={(event) =>
                          setLocalVersionFeed((previous) => ({
                            ...previous,
                            source: event.target.value === 'custom' ? 'custom' : 'github',
                          }))
                        }
                        className="h-9 text-sm"
                      >
                        <option value="github">{t('settings.versionFeedSourceGithub')}</option>
                        <option value="custom">{t('settings.versionFeedSourceCustom')}</option>
                      </UiSelect>
                      <input
                        value={localVersionFeed.githubRepo}
                        onChange={(event) =>
                          setLocalVersionFeed((previous) => ({ ...previous, githubRepo: event.target.value }))
                        }
                        placeholder={t('settings.versionFeedGithubRepo')}
                        className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                      />
                    </div>
                    <input
                      value={localVersionFeed.customFeedUrl}
                      onChange={(event) =>
                        setLocalVersionFeed((previous) => ({ ...previous, customFeedUrl: event.target.value }))
                      }
                      placeholder={t('settings.versionFeedCustomUrl')}
                      className="mt-3 w-full rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark"
                    />
                  </div>
                  <SettingsCheckboxCard
                    checked={localAutoCheckAppUpdateOnLaunch}
                    onCheckedChange={setLocalAutoCheckAppUpdateOnLaunch}
                    title={t('settings.autoCheckUpdateOnLaunch')}
                    description={t('settings.autoCheckUpdateOnLaunchDesc')}
                  />
                  <SettingsCheckboxCard
                    checked={localEnableUpdateDialog}
                    onCheckedChange={setLocalEnableUpdateDialog}
                    title={t('settings.enableUpdateDialog')}
                    description={t('settings.enableUpdateDialogDesc')}
                  />
                  <div className="pt-1">
                    <UiButton
                      type="button"
                      variant="muted"
                      onClick={() => void handleCheckUpdate()}
                      disabled={checkUpdateStatus === 'checking'}
                    >
                      {checkUpdateStatus === 'checking' ? t('settings.checkingUpdate') : t('settings.checkUpdateNow')}
                    </UiButton>
                    {checkUpdateStatus !== '' && (
                      <p className={`mt-2 rounded-[var(--ui-radius-lg)] px-2 py-1 text-xs ${
                        checkUpdateStatus === 'failed'
                          ? 'ui-status-error'
                          : checkUpdateStatus === 'has-update'
                            ? 'ui-status-warning'
                            : 'ui-status-info'
                      }`}>
                        {checkUpdateStatus === 'has-update' && t('settings.checkUpdateHasUpdate')}
                        {checkUpdateStatus === 'up-to-date' && t('settings.checkUpdateUpToDate')}
                        {checkUpdateStatus === 'failed' && t('settings.checkUpdateFailed')}
                        {checkUpdateStatus === 'checking' && t('settings.checkingUpdate')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--ui-border-soft)] px-6 py-4">
              {saveStatus === 'saved' ? (
                <span className="ui-status-success mr-auto rounded-[var(--ui-radius-lg)] px-2 py-1 text-xs">
                  {t('common.success', { defaultValue: 'Success' })}
                </span>
              ) : null}
              {saveStatus === 'failed' ? (
                <span className="ui-status-error mr-auto rounded-[var(--ui-radius-lg)] px-2 py-1 text-xs">
                  {t('common.error', { defaultValue: 'Error' })}
                </span>
              ) : null}
              <UiButton type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                {t('common.close')}
              </UiButton>
              <UiButton type="button" variant="primary" onClick={() => void handleSave()} loading={isSaving}>
                {t('common.save')}
              </UiButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PromptTemplateDialog
      isOpen={showTemplateDialog}
      onClose={() => setShowTemplateDialog(false)}
    />
    </>
  );
}



