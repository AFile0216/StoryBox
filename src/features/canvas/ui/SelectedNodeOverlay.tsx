import { memo, useMemo } from 'react';

import { useCanvasStore } from '@/stores/canvasStore';
import { NodeActionToolbar } from './NodeActionToolbar';
import { NodeSettingsPopover } from './NodeSettingsPopover';

export const SelectedNodeOverlay = memo(() => {
  const nodes = useCanvasStore((state) => state.nodes);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }

    return nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  if (!selectedNode) {
    return null;
  }

  return (
    <>
      <NodeActionToolbar node={selectedNode} />
      <NodeSettingsPopover node={selectedNode} />
    </>
  );
});

SelectedNodeOverlay.displayName = 'SelectedNodeOverlay';
