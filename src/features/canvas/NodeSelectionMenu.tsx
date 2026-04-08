import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, LayoutGrid, Music4, Sparkles, Type, Upload, Video } from 'lucide-react';
import { UI_POPOVER_TRANSITION_MS } from '@/components/ui/motion';

import type { CanvasNodeType } from '@/features/canvas/domain/canvasNodes';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import type { MenuIconKey } from '@/features/canvas/domain/nodeRegistry';

interface NodeSelectionMenuProps {
  position: { x: number; y: number };
  allowedTypes?: CanvasNodeType[];
  onSelect: (type: CanvasNodeType) => void;
  onClose: () => void;
}

const iconMap: Record<MenuIconKey, typeof Upload> = {
  audio: Music4,
  upload: Upload,
  sparkles: Sparkles,
  layout: LayoutGrid,
  text: Type,
  video: Video,
};

export function NodeSelectionMenu({ position, allowedTypes, onSelect, onClose }: NodeSelectionMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const allowedTypeSet = useMemo(() => (allowedTypes ? new Set(allowedTypes) : null), [allowedTypes]);

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
    return Array.from(dedupedByLabel.values());
  }, [allowedTypeSet, allowedTypes]);

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

  const subLabel = (icon: string) => {
    if (icon === 'text') return 'Notes, prompts, references';
    if (icon === 'video') return 'Video clips and storyboard nodes';
    if (icon === 'audio') return 'Music and audio driven tasks';
    if (icon === 'layout') return 'Storyboard and grouped content';
    if (icon === 'upload') return 'Upload media into canvas';
    return 'Generate or transform with AI';
  };

  return (
    <div
      ref={menuRef}
      data-node-menu="true"
      className={`
        absolute z-50 min-w-[280px] overflow-hidden rounded-[24px]
        border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)]
        shadow-[var(--ui-shadow-panel)] backdrop-blur-xl
        transition-all duration-150
        ${isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0'}
      `}
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-[var(--ui-border-soft)] bg-gradient-to-br from-accent/10 via-emerald-500/5 to-transparent px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
          {allowedTypes ? 'Connect And Create' : 'Quick Create'}
        </div>
        <div className="mt-1 text-sm font-medium text-text-dark">
          {allowedTypes ? 'Create the next node on canvas' : 'Double-click canvas to add content'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {menuItems.map((item, index) => {
          const Icon = iconMap[item.menuIcon] ?? Image;
          return (
            <button
              key={item.type}
              className="group flex min-h-[92px] w-full flex-col items-start justify-between rounded-[18px] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-3 text-left transition-all hover:-translate-y-[1px] hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-panel)]"
              style={{ transitionDelay: isVisible ? `${index * 30}ms` : '0ms' }}
              onClick={() => {
                handleClose();
                setTimeout(() => onSelect(item.type), UI_POPOVER_TRANSITION_MS + 10);
              }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-dark transition-colors group-hover:border-accent/40 group-hover:text-accent">
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3">
                <div className="text-sm font-medium text-text-dark">{t(item.menuLabelKey)}</div>
                <div className="mt-1 text-[11px] leading-5 text-text-muted">{subLabel(item.menuIcon)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
