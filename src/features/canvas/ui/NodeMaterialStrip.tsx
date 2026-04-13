import { memo, useMemo } from 'react';
import { AudioLines, Image as ImageIcon, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { collectNodeMaterialItems } from '@/features/canvas/application/canvasMediaReferences';
import { useCanvasStore } from '@/stores/canvasStore';

interface NodeMaterialStripProps {
  nodeId: string;
  className?: string;
  maxItems?: number;
}

function resolveOriginLabel(
  origin: 'local' | 'generated' | 'linked',
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (origin === 'local') {
    return t('asset.source.local', { defaultValue: '本地' });
  }
  if (origin === 'generated') {
    return t('asset.source.generated', { defaultValue: '生成' });
  }
  return t('asset.source.linked', { defaultValue: '引用' });
}

export const NodeMaterialStrip = memo(({
  nodeId,
  className = '',
  maxItems = 4,
}: NodeMaterialStripProps) => {
  const { t } = useTranslation();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);

  const materialItems = useMemo(
    () => collectNodeMaterialItems(nodeId, nodes, edges, maxItems),
    [edges, maxItems, nodeId, nodes]
  );

  if (materialItems.length === 0) {
    return null;
  }

  return (
    <div className={`tapnow-node-panel nodrag nowheel flex items-center gap-2 overflow-x-auto p-1.5 ${className}`}>
      {materialItems.map((item, index) => (
        <div
          key={item.key}
          className="flex h-12 min-w-[112px] items-center gap-2 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-1.5"
          title={`${item.title} · ${resolveOriginLabel(item.origin, t)}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--ui-border-soft)] bg-black/25">
            {item.mediaKind === 'image' ? (
              <img
                src={item.displayUrl}
                alt={item.title}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : item.mediaKind === 'video' ? (
              <Video className="h-4 w-4 text-text-muted" />
            ) : item.mediaKind === 'audio' ? (
              <AudioLines className="h-4 w-4 text-text-muted" />
            ) : (
              <ImageIcon className="h-4 w-4 text-text-muted" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium text-text-dark">
              @{item.mediaKind === 'image' ? t('asset.token.image', { defaultValue: '图' }) : item.mediaKind === 'video' ? t('asset.token.video', { defaultValue: '视频' }) : t('asset.token.audio', { defaultValue: '音频' })}{index + 1}
            </div>
            <div className="truncate text-[10px] text-text-muted">{resolveOriginLabel(item.origin, t)}</div>
          </div>
        </div>
      ))}
    </div>
  );
});

NodeMaterialStrip.displayName = 'NodeMaterialStrip';
