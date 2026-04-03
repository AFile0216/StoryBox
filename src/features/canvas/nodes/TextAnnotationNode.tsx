import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';

import {
  CANVAS_NODE_TYPES,
  type TextAnnotationMode,
  type TextAnnotationNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { UiSelect } from '@/components/ui';
import { useCanvasStore } from '@/stores/canvasStore';

type TextAnnotationNodeProps = NodeProps & {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 340;
const DEFAULT_HEIGHT = 220;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 140;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 960;

const TEXT_MODES: TextAnnotationMode[] = [
  'plain-text',
  'text-to-image-prompt',
  'text-to-music-prompt',
  'text-to-video-prompt',
  'reverse-prompt',
];

export const TextAnnotationNode = memo(({
  id,
  data,
  selected,
  width,
  height,
}: TextAnnotationNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const content = typeof data.content === 'string' ? data.content : '';
  const mode = (data.mode ?? 'plain-text') as TextAnnotationMode;
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.textAnnotation, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const handleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight);
  const handleMarkdownLinkClick = useCallback((href?: string) => {
    if (!href) {
      return;
    }
    void openUrl(href);
  }, []);

  return (
    <div
      className={`
        tapnow-node-card group relative h-full w-full overflow-visible p-2 transition-colors duration-150
        ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}
      `}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileText className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="mb-2 mt-6 flex items-center gap-2">
        <span className="tapnow-node-pill px-2 py-1 text-[11px] uppercase tracking-[0.12em]">
          {t('node.textAnnotation.modeLabel')}
        </span>
        <UiSelect
          value={mode}
          onChange={(event) =>
            updateNodeData(id, {
              mode: event.target.value as TextAnnotationMode,
            })
          }
          className="h-8 text-xs"
        >
          {TEXT_MODES.map((item) => (
            <option key={item} value={item}>
              {t(`node.textAnnotation.mode.${item}`)}
            </option>
          ))}
        </UiSelect>
      </div>

      {selected ? (
        <textarea
          autoFocus
          value={content}
          onChange={(event) => {
            updateNodeData(id, { content: event.target.value });
          }}
          placeholder={t('node.textAnnotation.placeholder', {
            mode: t(`node.textAnnotation.mode.${mode}`),
          })}
          className="tapnow-node-field nodrag nowheel h-[calc(100%-72px)] w-full resize-none px-3 py-2 text-sm leading-6 text-text-dark outline-none placeholder:text-text-muted/70"
        />
      ) : (
        <div className="tapnow-node-panel nodrag nowheel h-[calc(100%-72px)] overflow-auto px-3 py-2 text-sm leading-6 text-text-dark">
          <div className="tapnow-node-pill mb-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
            {t(`node.textAnnotation.mode.${mode}`)}
          </div>
          {content.trim().length > 0 ? (
            <div className="markdown-body break-words [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+_p]:mt-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-black/30 [&_pre]:p-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault();
                        handleMarkdownLinkClick(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="pt-1 text-text-muted">{t('node.textAnnotation.empty')}</div>
          )}
        </div>
      )}

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!border-surface-dark !bg-accent"
        style={handleStyle}
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!border-surface-dark !bg-accent"
        style={handleStyle}
      />

      <NodeResizeHandle
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxWidth={MAX_WIDTH}
        maxHeight={MAX_HEIGHT}
      />
    </div>
  );
});

TextAnnotationNode.displayName = 'TextAnnotationNode';
