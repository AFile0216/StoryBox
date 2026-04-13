import { memo, useMemo, useState } from 'react';
import { AudioLines, Film, FileText, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAssetStore, type AssetCategory } from '@/stores/assetStore';
import { useProjectStore } from '@/stores/projectStore';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';

interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS: Array<{ id: AssetCategory; labelKey: string; fallback: string }> = [
  { id: 'local', labelKey: 'asset.category.local', fallback: 'Local' },
  { id: 'character', labelKey: 'asset.category.character', fallback: 'Character' },
  { id: 'scene', labelKey: 'asset.category.scene', fallback: 'Scene' },
  { id: 'prop', labelKey: 'asset.category.prop', fallback: 'Prop' },
];

function resolveMediaIcon(mediaType: string) {
  if (mediaType === 'video') {
    return <Film className="h-7 w-7 opacity-70" />;
  }
  if (mediaType === 'audio') {
    return <AudioLines className="h-7 w-7 opacity-70" />;
  }
  if (mediaType === 'text') {
    return <FileText className="h-7 w-7 opacity-70" />;
  }
  return <ImageIcon className="h-7 w-7 opacity-70" />;
}

function resolveSourceLabel(sourceType: 'local' | 'generated' | 'linked', t: ReturnType<typeof useTranslation>['t']): string {
  if (sourceType === 'local') {
    return t('asset.source.local', { defaultValue: 'Local' });
  }
  if (sourceType === 'generated') {
    return t('asset.source.generated', { defaultValue: 'Generated' });
  }
  return t('asset.source.linked', { defaultValue: 'Linked' });
}

export const HistoryDialog = memo(({ isOpen, onClose }: HistoryDialogProps) => {
  const { t } = useTranslation();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const getProjectAssets = useAssetStore((state) => state.getProjectAssets);
  const updateAssetCategory = useAssetStore((state) => state.updateAssetCategory);
  const removeAsset = useAssetStore((state) => state.removeAsset);
  const clearProjectAssets = useAssetStore((state) => state.clearProjectAssets);
  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'all'>('all');

  const assets = useMemo(
    () => (currentProjectId ? getProjectAssets(currentProjectId, activeCategory) : []),
    [activeCategory, currentProjectId, getProjectAssets]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-4 backdrop-blur-sm">
      <div className="flex h-[min(92vh,920px)] w-[min(98vw,1320px)] flex-col overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-elevation-3)]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border-soft)] bg-gradient-to-r from-accent/10 to-transparent px-4 md:px-6">
          <h2 className="text-lg font-semibold text-text-dark">
            {t('app.assetManager', { defaultValue: 'Asset Manager' })}
          </h2>

          <div className="flex items-center gap-3">
            {currentProjectId && assets.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(t('asset.clearConfirm', { defaultValue: 'Clear all assets for current project?' }))) {
                    clearProjectAssets(currentProjectId);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('asset.clear', { defaultValue: 'Clear Assets' })}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--ui-surface-field)] hover:text-text-dark"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--ui-border-soft)] px-4 py-3 md:px-6">
          <div className="ui-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                activeCategory === 'all'
                  ? 'border-accent/40 bg-accent/12 text-accent'
                  : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:text-text-dark'
              }`}
            >
              {t('asset.category.all', { defaultValue: 'All' })}
            </button>

            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveCategory(option.id)}
                className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                  activeCategory === option.id
                    ? 'border-accent/40 bg-accent/12 text-accent'
                    : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:text-text-dark'
                }`}
              >
                {t(option.labelKey, { defaultValue: option.fallback })}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-scrollbar flex-1 overflow-y-auto p-4 md:p-6">
          {!currentProjectId ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              {t('asset.noProject', { defaultValue: 'Open a project to view assets.' })}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              {t('asset.empty', { defaultValue: 'No assets in this category.' })}
            </div>
          ) : (
            <div className="[--ui-grid-min:240px] ui-grid-fluid">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative overflow-hidden rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)]"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black/20">
                    {asset.mediaType === 'image' && asset.mediaUrl ? (
                      <img
                        src={resolveImageDisplayUrl(asset.mediaUrl)}
                        alt={asset.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-muted">
                        {resolveMediaIcon(asset.mediaType)}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeAsset(currentProjectId, asset.id)}
                      className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-red-500/80 group-hover:opacity-100"
                      title={t('common.delete', { defaultValue: 'Delete' })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <div className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                      {resolveSourceLabel(asset.sourceType, t)}
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    <div className="ui-safe-text ui-clamp-2 text-xs leading-5 text-text-dark">
                      {asset.textContent || asset.title}
                    </div>

                    <div className="ui-ellipsis text-[10px] text-text-muted" title={asset.nodeTitle}>
                      {asset.nodeTitle}
                    </div>

                    <select
                      value={asset.category}
                      onChange={(event) =>
                        updateAssetCategory(currentProjectId, asset.id, event.target.value as AssetCategory)
                      }
                      className="h-7 w-full rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] px-2 text-[11px] text-text-dark outline-none"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {t(option.labelKey, { defaultValue: option.fallback })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

HistoryDialog.displayName = 'HistoryDialog';
