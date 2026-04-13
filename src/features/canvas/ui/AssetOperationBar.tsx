import { memo, useMemo, useState } from 'react';
import { Box, Image as ImageIcon, MapPin, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type AssetCategory, useAssetStore } from '@/stores/assetStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useProjectStore } from '@/stores/projectStore';

const CATEGORY_META: Array<{
  id: AssetCategory;
  icon: typeof ImageIcon;
  labelKey: string;
  fallback: string;
}> = [
  { id: 'local', icon: ImageIcon, labelKey: 'asset.category.local', fallback: '本地' },
  { id: 'character', icon: UserRound, labelKey: 'asset.category.character', fallback: '人物' },
  { id: 'scene', icon: MapPin, labelKey: 'asset.category.scene', fallback: '场景' },
  { id: 'prop', icon: Box, labelKey: 'asset.category.prop', fallback: '道具' },
];

export const AssetOperationBar = memo(() => {
  const { t } = useTranslation();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);

  const activeCategory = useAssetStore((state) =>
    currentProjectId ? state.getActiveCategory(currentProjectId) : 'local'
  );
  const setActiveCategory = useAssetStore((state) => state.setActiveCategory);
  const archiveNodeToCategory = useAssetStore((state) => state.archiveNodeToCategory);
  const getProjectAssetCount = useAssetStore((state) => state.getProjectAssetCount);
  const [hint, setHint] = useState('');

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  if (!currentProjectId) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[min(98vw,1160px)] -translate-x-1/2 px-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] px-2 py-2 shadow-[var(--ui-elevation-2)] backdrop-blur-xl md:flex-nowrap">
        <select
          value="default"
          className="h-9 min-w-[168px] flex-1 rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs text-text-dark outline-none sm:min-w-[220px] sm:max-w-[280px] sm:flex-none"
          onChange={() => {
            // reserved for multi-library extension
          }}
        >
          <option value="default">{t('asset.library.default', { defaultValue: '选择资产库' })}</option>
        </select>

        <div className="ui-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
          {CATEGORY_META.map((item) => {
            const Icon = item.icon;
            const isActive = activeCategory === item.id;
            const count = getProjectAssetCount(currentProjectId, item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveCategory(currentProjectId, item.id)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs transition-colors ${
                  isActive
                    ? 'border-accent/40 bg-accent/14 text-accent'
                    : 'border-transparent text-text-muted hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(item.labelKey, { defaultValue: item.fallback })}</span>
                <span className="rounded-md border border-[var(--ui-border-soft)] bg-black/20 px-1.5 py-0.5 text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!selectedNode}
          onClick={() => {
            const created = archiveNodeToCategory(currentProjectId, selectedNode, activeCategory);
            if (created > 0) {
              setHint(
                t('asset.archiveSuccess', {
                  defaultValue: '已归档 {{count}} 条素材',
                  count: created,
                })
              );
            } else {
              setHint(t('asset.archiveEmpty', { defaultValue: '该节点没有可归档素材' }));
            }
            window.setTimeout(() => setHint(''), 1400);
          }}
          className="inline-flex h-9 items-center rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 text-xs font-medium text-text-dark transition-colors hover:border-accent/35 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45 sm:ml-auto"
        >
          {t('asset.archiveSelected', { defaultValue: '归档选中节点' })}
        </button>
      </div>
      {hint ? (
        <div className="mt-1 px-2 text-center text-[11px] text-text-muted">{hint}</div>
      ) : null}
    </div>
  );
});

AssetOperationBar.displayName = 'AssetOperationBar';

