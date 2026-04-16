import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Clapperboard, ImageUp, LayoutGrid, Sparkles, Type, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { UI_POPOVER_TRANSITION_MS } from '@/components/ui/motion';
import { CANVAS_NODE_TYPES, type CanvasNodeType } from '@/features/canvas/domain/canvasNodes';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import {
  SLASH_PRESET_MENU_DEFINITIONS,
  type SlashPresetId,
} from '@/features/canvas/application/slashPresets';

type ScriptPresetId = 'plain-text-script';

export interface NodeMenuSelection {
  type: CanvasNodeType;
  scriptPresetId?: ScriptPresetId;
  slashPresetId?: SlashPresetId;
}

interface NodeSelectionMenuProps {
  position: { x: number; y: number };
  allowedTypes?: CanvasNodeType[];
  onSelect: (selection: NodeMenuSelection) => void;
  onClose: () => void;
}

interface NodeSelectionMenuItem {
  key: string;
  type: CanvasNodeType;
  menuLabelKey: string;
  menuIcon: 'upload' | 'sparkles' | 'layout' | 'text' | 'video' | 'audio';
  order: number;
  scriptPresetId?: ScriptPresetId;
  slashPresetId?: SlashPresetId;
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
  const [safePosition, setSafePosition] = useState(position);

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
        [CANVAS_NODE_TYPES.storyboardCompose, 8],
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

    const baseItems: NodeSelectionMenuItem[] = Array.from(dedupedByLabel.values()).map((definition) => ({
      key: definition.type,
      type: definition.type,
      menuLabelKey: definition.menuLabelKey,
      menuIcon: definition.menuIcon,
      order: orderMap.get(definition.type) ?? Number.POSITIVE_INFINITY,
    }));

    const canShowScriptPreset =
      !allowedTypeSet || allowedTypeSet.has(CANVAS_NODE_TYPES.textAnnotation);
    if (canShowScriptPreset) {
      baseItems.unshift({
        key: 'script-preset',
        type: CANVAS_NODE_TYPES.textAnnotation,
        menuLabelKey: 'node.menu.scriptPreset',
        menuIcon: 'text',
        order: (orderMap.get(CANVAS_NODE_TYPES.textAnnotation) ?? 1) - 0.1,
        scriptPresetId: 'plain-text-script' as const,
      });
    }

    const slashItems: NodeSelectionMenuItem[] = SLASH_PRESET_MENU_DEFINITIONS
      .map((definition, index) => ({
        key: `slash-${definition.id}`,
        type: definition.primaryType,
        menuLabelKey: definition.titleKey,
        menuIcon: definition.menuIcon,
        order: 100 + index,
        slashPresetId: definition.id,
      }));

    return [...baseItems, ...slashItems].sort((left, right) => {
      const leftOrder = left.order;
      const rightOrder = right.order;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.key.localeCompare(right.key);
    });
  }, [allowedTypeSet, allowedTypes, orderMap]);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  useEffect(() => {
    const menuElement = menuRef.current;
    if (!menuElement) {
      setSafePosition(position);
      return;
    }
    const offsetParent = menuElement.offsetParent as HTMLElement | null;
    if (!offsetParent) {
      setSafePosition(position);
      return;
    }

    const parentRect = offsetParent.getBoundingClientRect();
    const menuRect = menuElement.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, parentRect.width - menuRect.width - margin);
    const maxTop = Math.max(margin, parentRect.height - menuRect.height - margin);
    const nextX = Math.min(Math.max(margin, position.x), maxLeft);
    const nextY = Math.min(Math.max(margin, position.y), maxTop);
    setSafePosition({ x: nextX, y: nextY });
  }, [isVisible, menuItems.length, position]);

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
      className={`absolute z-50 w-auto min-w-[172px] max-w-[70vw] overflow-hidden rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-elevation-2)] transition-all duration-120 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
      style={{ left: safePosition.x, top: safePosition.y }}
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
              key={item.key}
              className="group flex w-full items-center gap-2.5 rounded-[var(--ui-radius-lg)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--ui-surface-field)]"
              style={{ transitionDelay: isVisible ? `${index * 10}ms` : '0ms' }}
              onClick={() => {
                handleClose();
                setTimeout(
                  () =>
                    onSelect({
                      type: item.type,
                      scriptPresetId: item.scriptPresetId,
                      slashPresetId: item.slashPresetId,
                    }),
                  UI_POPOVER_TRANSITION_MS + 10
                );
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
