import { create } from 'zustand';

import type { ActiveToolDialog, CanvasNode } from '@/features/canvas/domain/canvasNodes';

interface ToolDialogState {
  activeToolDialog: ActiveToolDialog | null;
  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
  syncToolDialogWithNodes: (nodes: CanvasNode[]) => void;
}

function resolveActiveToolDialog(
  activeToolDialog: ActiveToolDialog | null,
  nodes: CanvasNode[]
): ActiveToolDialog | null {
  if (!activeToolDialog) {
    return null;
  }
  return nodes.some((node) => node.id === activeToolDialog.nodeId) ? activeToolDialog : null;
}

export const useToolDialogStore = create<ToolDialogState>((set) => ({
  activeToolDialog: null,

  openToolDialog: (dialog) => {
    set({ activeToolDialog: dialog });
  },

  closeToolDialog: () => {
    set({ activeToolDialog: null });
  },

  syncToolDialogWithNodes: (nodes) => {
    set((state) => {
      const nextDialog = resolveActiveToolDialog(state.activeToolDialog, nodes);
      return nextDialog === state.activeToolDialog
        ? {}
        : { activeToolDialog: nextDialog };
    });
  },
}));
