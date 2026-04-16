import { useEffect, type MutableRefObject } from 'react';

import type {
  ArrangeAlignMode,
  ArrangeDistributeMode,
  CanvasEdge,
  CanvasNode,
} from '@/stores/canvasStore';

interface ClipboardSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface UseCanvasKeyboardShortcutsOptions {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedUploadNodeId: string | null;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  groupNodes: (nodeIds: string[]) => string | null;
  arrangeAlignNodes: (nodeIds: string[], mode: ArrangeAlignMode) => boolean;
  arrangeDistributeNodes: (nodeIds: string[], mode: ArrangeDistributeMode) => boolean;
  autoLayoutNodesLeftToRight: (nodeIds: string[]) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  scheduleCanvasPersist: (delayMs?: number) => void;
  copiedSnapshotRef: MutableRefObject<ClipboardSnapshot | null>;
  duplicateNodesRef: MutableRefObject<((sourceNodeIds: string[]) => string | null) | null>;
  pasteImageHandledRef: MutableRefObject<boolean>;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

function isInsideGlobalUndoScope(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  return Boolean(element.closest('[data-global-canvas-undo="true"]'));
}

function resolveArrangeAlignMode(event: KeyboardEvent): ArrangeAlignMode | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'arrowleft') {
    return 'left';
  }
  if (key === 'arrowright') {
    return 'right';
  }
  if (key === 'arrowup') {
    return 'top';
  }
  if (key === 'arrowdown') {
    return 'bottom';
  }
  return null;
}

function resolveArrangeDistributeMode(event: KeyboardEvent): ArrangeDistributeMode | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'h') {
    return 'horizontal';
  }
  if (key === 'v') {
    return 'vertical';
  }
  return null;
}

function shouldTriggerAutoLayoutShortcut(event: KeyboardEvent): boolean {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  return event.key.toLowerCase() === 'l';
}

export function useCanvasKeyboardShortcuts({
  nodes,
  edges,
  selectedNodeId,
  selectedNodeIds,
  selectedUploadNodeId,
  deleteNode,
  deleteNodes,
  groupNodes,
  arrangeAlignNodes,
  arrangeDistributeNodes,
  autoLayoutNodesLeftToRight,
  undo,
  redo,
  scheduleCanvasPersist,
  copiedSnapshotRef,
  duplicateNodesRef,
  pasteImageHandledRef,
}: UseCanvasKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const commandPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const isUndo = commandPressed && key === 'z' && !event.shiftKey;
      const isRedo = commandPressed && (key === 'y' || (key === 'z' && event.shiftKey));
      const arrangeAlignMode = resolveArrangeAlignMode(event);
      const arrangeDistributeMode = resolveArrangeDistributeMode(event);
      const isAutoLayoutShortcut = shouldTriggerAutoLayoutShortcut(event);
      const forceGlobalUndo =
        (isUndo || isRedo)
        && isInsideGlobalUndoScope(event.target);
      if (isTypingTarget(event.target) && !forceGlobalUndo) {
        return;
      }

      const isGroup = commandPressed && key === 'g';
      const isCopy = commandPressed && key === 'c' && !event.shiftKey;
      const isPaste = commandPressed && key === 'v' && !event.shiftKey;

      if (isCopy) {
        if (selectedNodeIds.length === 0) {
          return;
        }
        event.preventDefault();
        const selectedIdSet = new Set(selectedNodeIds);
        copiedSnapshotRef.current = {
          nodes: nodes.filter((node) => selectedIdSet.has(node.id)),
          edges: edges.filter(
            (edge) => selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target)
          ),
        };
        return;
      }

      if (isPaste) {
        if (selectedUploadNodeId) {
          pasteImageHandledRef.current = false;
          window.setTimeout(() => {
            if (pasteImageHandledRef.current) {
              pasteImageHandledRef.current = false;
              return;
            }

            if (!copiedSnapshotRef.current || copiedSnapshotRef.current.nodes.length === 0) {
              return;
            }

            void duplicateNodesRef.current?.(copiedSnapshotRef.current.nodes.map((node) => node.id));
          }, 0);
          return;
        }

        if (!copiedSnapshotRef.current || copiedSnapshotRef.current.nodes.length === 0) {
          return;
        }
        event.preventDefault();
        void duplicateNodesRef.current?.(copiedSnapshotRef.current.nodes.map((node) => node.id));
        return;
      }

      if (isUndo || isRedo) {
        event.preventDefault();
        const changed = isUndo ? undo() : redo();
        if (changed) {
          scheduleCanvasPersist(0);
        }
        return;
      }

      if (arrangeAlignMode) {
        if (selectedNodeIds.length < 2) {
          return;
        }
        event.preventDefault();
        const changed = arrangeAlignNodes(selectedNodeIds, arrangeAlignMode);
        if (changed) {
          scheduleCanvasPersist(0);
        }
        return;
      }

      if (arrangeDistributeMode) {
        if (selectedNodeIds.length < 3) {
          return;
        }
        event.preventDefault();
        const changed = arrangeDistributeNodes(selectedNodeIds, arrangeDistributeMode);
        if (changed) {
          scheduleCanvasPersist(0);
        }
        return;
      }

      if (isAutoLayoutShortcut) {
        if (selectedNodeIds.length < 2) {
          return;
        }
        event.preventDefault();
        const changed = autoLayoutNodesLeftToRight(selectedNodeIds);
        if (changed) {
          scheduleCanvasPersist(0);
        }
        return;
      }

      if (isGroup) {
        if (selectedNodeIds.length < 2) {
          return;
        }
        event.preventDefault();
        const createdGroupId = groupNodes(selectedNodeIds);
        if (createdGroupId) {
          scheduleCanvasPersist(0);
        }
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      const idsToDelete = selectedNodeIds.length > 0
        ? selectedNodeIds
        : selectedNodeId
          ? [selectedNodeId]
          : [];
      if (idsToDelete.length === 0) {
        return;
      }

      event.preventDefault();
      if (idsToDelete.length === 1) {
        deleteNode(idsToDelete[0]);
      } else {
        deleteNodes(idsToDelete);
      }
      scheduleCanvasPersist(0);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    copiedSnapshotRef,
    deleteNode,
    deleteNodes,
    duplicateNodesRef,
    edges,
    arrangeAlignNodes,
    arrangeDistributeNodes,
    autoLayoutNodesLeftToRight,
    groupNodes,
    nodes,
    pasteImageHandledRef,
    redo,
    scheduleCanvasPersist,
    selectedNodeId,
    selectedNodeIds,
    selectedUploadNodeId,
    undo,
  ]);
}
