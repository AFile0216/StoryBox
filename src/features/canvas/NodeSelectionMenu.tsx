import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Clapperboard, ImageUp, LayoutGrid, Sparkles, Type, type LucideIcon } from 'lucide-react';
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

const MENU_ICON_MAP: Record<string, LucideIcon> = {
  upload: ImageUp,
  sparkles: Sparkles,
  layout: LayoutGrid,
  text: Type,
  video: Clapperboard,
  audio: AudioLines,
};

export function NodeSelectionMenu({ position, allowedTypes, onSelect, onClose }: NodeSelectionMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const allowedTypeSet = useMemo(() => (allowedTypes ? new Set(allowedTypes) : null), [allowedTypes]);

  const orderMap = useMemo(
    () =>
      new Map<CanvasNodeType, number>([
        [CANVAS_NODE_TYPES.upload, 0],
        [CANVAS_NODE_TYPES.textAnnotation, 1],
        [CANVAS_NODE_TYPES.imageEdit, 2],
        [CANVAS_NODE_TYPES.video, 3],
        [CANVAS_NODE_TYPES.videoEditor, 4],
        [CANVAS_NODE_TYPES.videoStoryboard, 5],
        [CANVAS_NODE_TYPES.audio, 6],
        [CANVAS_NODE_TYPES.storyboardGen, 7],
      ]),
    []
  );

  const menuItems = useMemo(() => {
    const candidates = !allowedTypeSet || !allowedTypes
      ? nodeCatalog.getMenuDefinitions()
      : Array.from(new Set(allowedTypes)).map((type) => nodeCatalog.getDefinition(type));

    const dedupedByLabel = new Map<string, (typeof candidates)[number]>();
    for (const definition of candidates) {
      const existing = dedupedByLabel.get(definition.menuLabelKey);
      if (!existing || (!existing.visibleInMenu && definition.visibleInMenu)) {
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

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, UI_POPOVER_TRANSITION_MS);
  }, [onClose]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      handleClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [handleClose]);

  return (
    <div
      ref={menuRef}
      data-node-menu="true"
      className={`absolute z-50 w-auto min-w-[168px] max-w-[70vw] overflow-hidden rounded-[12px] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-shadow-panel)] transition-all duration-120 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-[var(--ui-border-soft)] px-3 py-2">
        <div className="ui-display-title text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {t('canvas.quickCreate', { defaultValue: 'Quick Create' })}
        </div>
      </div>

      <div className="max-h-[58vh] overflow-y-auto px-1.5 py-1.5">
        {menuItems.map((item, index) => {
          const Icon = MENU_ICON_MAP[item.menuIcon] ?? Sparkles;
          return (
            <button
              key={item.type}
              className="group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--ui-surface-field)]"
              style={{ transitionDelay: isVisible ? `${index * 10}ms` : '0ms' }}
              onClick={() => {
                handleClose();
                setTimeout(() => onSelect(item.type), UI_POPOVER_TRANSITION_MS + 10);
              }}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[rgba(var(--accent-rgb),0.12)] text-[rgba(var(--accent-rgb),0.95)]">
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-dark">
                {t(item.menuLabelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
