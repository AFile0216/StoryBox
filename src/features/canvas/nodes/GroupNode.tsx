import { memo, useMemo } from 'react';
import { ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { CANVAS_NODE_TYPES, type GroupNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { useCanvasStore } from '@/stores/canvasStore';

type GroupNodeProps = {
  id: string;
  data: GroupNodeData;
  selected?: boolean;
};

export const GroupNode = memo(({ id, data, selected }: GroupNodeProps) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const toggleGroupCollapsed = useCanvasStore((state) => state.toggleGroupCollapsed);
  const nodes = useCanvasStore((state) => state.nodes);
  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.group, data),
    [data]
  );
  const childCount = useMemo(
    () => nodes.filter((node) => node.parentId === id).length,
    [id, nodes]
  );
  const collapsed = data.collapsed === true;
  const collapseLabel = t('node.group.collapse', { defaultValue: '折叠分组' });
  const expandLabel = t('node.group.expand', { defaultValue: '展开分组' });
  const collapsedHint = t('node.group.collapsedHint', {
    defaultValue: '当前分组已折叠，展开后可查看组内节点。',
  });
  const memberCountLabel = t('node.group.memberCount', {
    count: childCount,
    defaultValue: `${childCount} 个节点`,
  });

  return (
    <div
      className={`group relative h-full w-full overflow-visible rounded-[18px] border ${selected
        ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.35)]'
        : 'border-[rgba(15,23,42,0.2)] dark:border-[rgba(255,255,255,0.26)]'
        }`}
      style={{
        backgroundColor: 'var(--group-node-bg)',
      }}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<LayoutGrid className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, {
          displayName: nextTitle,
          label: nextTitle,
        })}
      />
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {memberCountLabel}
        </span>
        <button
          type="button"
          className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/20 text-text-muted transition-colors hover:text-text-dark"
          onClick={(event) => {
            event.stopPropagation();
            toggleGroupCollapsed(id);
          }}
          aria-label={collapsed ? expandLabel : collapseLabel}
          title={collapsed ? expandLabel : collapseLabel}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {collapsed ? (
        <div className="absolute inset-x-3 top-14 rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-xs text-text-muted">
          {collapsedHint}
        </div>
      ) : null}
      <NodeResizeHandle minWidth={220} minHeight={140} maxWidth={2200} maxHeight={1600} />
    </div>
  );
});

GroupNode.displayName = 'GroupNode';
