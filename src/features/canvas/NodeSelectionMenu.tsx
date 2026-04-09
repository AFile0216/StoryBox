import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UI_POPOVER_TRANSITION_MS } from '@/components/ui/motion';

import { CANVAS_NODE_TYPES, type CanvasNodeType } from '@/features/canvas/domain/canvasNodes';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';

interface NodeSelectionMenuProps {
  position: { x: number; y: number };
  allowedTypes?: CanvasNodeType[];
  onSelect: (type: CanvasNodeType) => void;
  onClose: () => void;
}

export function NodeSelectionMenu({ position, allowedTypes, onSelect, onClose }: NodeSelectionMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const allowedTypeSet = useMemo(() => (allowedTypes ? new Set(allowedTypes) : null), [allowedTypes]);

  const orderMap = useMemo(() => new Map<CanvasNodeType, number>([
    [CANVAS_NODE_TYPES.upload, 0],
    [CANVAS_NODE_TYPES.chat, 1],
    [CANVAS_NODE_TYPES.textAnnotation, 2],
    [CANVAS_NODE_TYPES.imageEdit, 3],
    [CANVAS_NODE_TYPES.video, 4],
    [CANVAS_NODE_TYPES.videoEditor, 5],
    [CANVAS_NODE_TYPES.videoStoryboard, 6],
    [CANVAS_NODE_TYPES.audio, 7],
    [CANVAS_NODE_TYPES.storyboardGen, 8],
  ]), []);

  const menuItems = useMemo(() => {
    const candidates = !allowedTypeSet || !allowedTypes
      ? nodeCatalog.getMenuDefinitions()
      : Array.from(new Set(allowedTypes)).map((type) => nodeCatalog.getDefinition(type));

    const dedupedByLabel = new Map<string, (typeof candidates)[number]>();
    for (const definition of candidates) {
      const existing = dedupedByLabel.get(definition.menuLabelKey);
      if (!existing) { dedupedByLabel.set(definition.menuLabelKey, definition); continue; }
      if (!existing.visibleInMenu && definition.visibleInMenu) {
        dedupedByLabel.set(definition.menuLabelKey, definition);
      }
    }
    return Array.from(dedupedByLabel.values()).sort((left, right) => {
      const leftOrder = orderMap.get(left.type) ?? Number.POSITIVE_INFINITY;
      const rightOrder = orderMap.get(right.type) ?? Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.type.localeCompare(right.type);
    });
  }, [allowedTypeSet, allowedTypes, orderMap]);

  useEffect(() => { requestAnimationFrame(() => setIsVisible(true)); }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, UI_POPOVER_TRANSITION_MS);
  }, [onClose]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      handleClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [handleClose]);

  return (
    <div
      ref={menuRef}
      data-node-menu="true"
      className={`
        absolute z-50 w-max max-w-[180px] overflow-hidden rounded-lg
        border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)]
        shadow-[var(--ui-shadow-panel)]
        transition-all duration-120
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}
      `}
      style={{ left: position.x, top: position.y }}
    >
      <div className="py-1">
        {menuItems.map((item, index) => {
          return (
            <button
              key={item.type}
              className="w-full whitespace-nowrap px-3 py-1.5 text-left text-sm leading-5 text-text-dark transition-colors hover:bg-[var(--ui-surface-field)]"
              style={{ transitionDelay: isVisible ? `${index * 10}ms` : '0ms' }}
              onClick={() => {
                handleClose();
                setTimeout(() => onSelect(item.type), UI_POPOVER_TRANSITION_MS + 10);
              }}
            >
              {t(item.menuLabelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
