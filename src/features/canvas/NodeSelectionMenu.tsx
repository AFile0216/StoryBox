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

const MENU_DESCRIPTION_FALLBACK: Partial<Record<CanvasNodeType, string>> = {
  [CANVAS_NODE_TYPES.upload]: '导入图片并作为画布起点',
  [CANVAS_NODE_TYPES.chat]: '对话式协助与任务指令',
  [CANVAS_NODE_TYPES.textAnnotation]: '记录提示词、旁白与结构化文本',
  [CANVAS_NODE_TYPES.imageEdit]: '文本生图、图生图与画面处理',
  [CANVAS_NODE_TYPES.video]: '视频生成与任务编排',
  [CANVAS_NODE_TYPES.videoEditor]: '分镜与文字时间线排布',
  [CANVAS_NODE_TYPES.videoStoryboard]: '视频分镜切分与描述',
  [CANVAS_NODE_TYPES.audio]: '音频生成与预览',
  [CANVAS_NODE_TYPES.storyboardGen]: '分镜批量生成与合成',
};

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
      if (!existing) {
        dedupedByLabel.set(definition.menuLabelKey, definition);
        continue;
      }
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

  const resolvedDescriptionMap = useMemo(
    () =>
      menuItems.reduce((result, item) => {
        result[item.type] = t(`node.menuDesc.${item.type}`, {
          defaultValue: MENU_DESCRIPTION_FALLBACK[item.type] ?? '创建该节点',
        });
        return result;
      }, {} as Record<CanvasNodeType, string>),
    [menuItems, t]
  );

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
      className={`absolute z-50 w-[292px] max-w-[70vw] overflow-hidden rounded-[12px] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-shadow-panel)] transition-all duration-120 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-[var(--ui-border-soft)] px-4 py-2.5">
        <div className="ui-display-title text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {t('canvas.quickCreate', { defaultValue: '快速创建' })}
        </div>
      </div>
      <div className="max-h-[58vh] overflow-y-auto px-2 py-2">
        {menuItems.map((item, index) => {
          const Icon = MENU_ICON_MAP[item.menuIcon] ?? Sparkles;
          return (
            <button
              key={item.type}
              className="group flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--ui-surface-field)]"
              style={{ transitionDelay: isVisible ? `${index * 10}ms` : '0ms' }}
              onClick={() => {
                handleClose();
                setTimeout(() => onSelect(item.type), UI_POPOVER_TRANSITION_MS + 10);
              }}
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[rgba(var(--accent-rgb),0.12)] text-[rgba(var(--accent-rgb),0.95)]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-dark">{t(item.menuLabelKey)}</span>
                <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                  {resolvedDescriptionMap[item.type]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
