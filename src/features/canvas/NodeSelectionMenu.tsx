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

export function NodeSelectionMenu({
  position,
  allowedTypes,
  onSelect,
  onClose,
}: NodeSelectionMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const allowedTypeSet = useMemo(
    () => (allowedTypes ? new Set(allowedTypes) : null),
    [allowedTypes]
  );

  const menuItems = useMemo(() => {
    const candidates = !allowedTypeSet || !allowedTypes
      ? nodeCatalog.getMenuDefinitions()
      : Array.from(new Set(allowedTypes)).map((type) => nodeCatalog.getDefinition(type));

    const dedupedByLabel = new Map<string, (typeof candidates)[number]>();
    for (const definition of candidates) {
      const existing = dedupedByLabel.get(definition.menuLabelKey);
      if (!existing) {
        dedupedByLabel.set(definition.menuLabelKey, definition);
        continue;
      }

      // Prefer user-visible definitions when multiple internal node types share the same label.
      if (!existing.visibleInMenu && definition.visibleInMenu) {
        dedupedByLabel.set(definition.menuLabelKey, definition);
      }
    }

    return Array.from(dedupedByLabel.values());
  }, [allowedTypeSet, allowedTypes]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
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
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [handleClose]);

  return (
    <div
      ref={menuRef}
      className={`
        absolute z-50 min-w-[280px] overflow-hidden rounded-[24px] border border-white/15 bg-[rgba(12,17,25,0.94)] shadow-[0_24px_80px_rgba(2,6,23,0.42)]
        transition-all duration-150
        ${isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0'}
      `}
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-white/8 bg-[linear-gradient(135deg,rgba(96,165,250,0.18),rgba(16,185,129,0.08)_58%,rgba(255,255,255,0.02))] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
          {allowedTypes ? 'Connect And Create' : 'Quick Create'}
        </div>
        <div className="mt-1 text-sm font-medium text-white/90">
          {allowedTypes ? 'Create the next node on canvas' : 'Double-click canvas to add content'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
      {menuItems.map((item, index) => {
        const Icon = iconMap[item.menuIcon] ?? Image;
        return (
          <button
            key={item.type}
            className="group flex min-h-[92px] w-full flex-col items-start justify-between rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition-all hover:-translate-y-[1px] hover:border-white/18 hover:bg-white/[0.06]"
            style={{ transitionDelay: isVisible ? `${index * 30}ms` : '0ms' }}
            onClick={() => {
              handleClose();
              setTimeout(() => onSelect(item.type), UI_POPOVER_TRANSITION_MS + 10);
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/85 transition-colors group-hover:border-white/20 group-hover:bg-white/[0.1]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium text-white/92">{t(item.menuLabelKey)}</div>
              <div className="mt-1 text-[11px] leading-5 text-white/48">
                {item.menuIcon === 'text'
                  ? 'Notes, prompts, references'
                  : item.menuIcon === 'video'
                    ? 'Video clips and storyboard nodes'
                    : item.menuIcon === 'audio'
                      ? 'Music and audio driven tasks'
                      : item.menuIcon === 'layout'
                        ? 'Storyboard and grouped content'
                        : item.menuIcon === 'upload'
                          ? 'Upload media into canvas'
                          : 'Generate or transform with AI'}
              </div>
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}
