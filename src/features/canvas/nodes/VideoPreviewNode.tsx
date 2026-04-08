import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { Film, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES, type VideoPreviewNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  resolveAdaptiveHandleStyle,
  resolveResponsiveNodeClasses,
} from '@/features/canvas/ui/nodeMetrics';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoPreviewNodeProps = NodeProps & {
  id: string;
  data: VideoPreviewNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const VideoPreviewNode = memo(({ id, data, selected, width, height }: VideoPreviewNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.videoPreview, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = useMemo(
    () => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight),
    [resolvedHeight, resolvedWidth]
  );
  const targetHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'),
    [resolvedHeight, resolvedWidth]
  );
  const sourceHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'),
    [resolvedHeight, resolvedWidth]
  );
  const videoSrc = useMemo(
    () => (data.filePath ? resolveLocalAssetUrl(data.filePath) : null),
    [data.filePath]
  );

  const handlePickVideo = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    updateNodeData(id, {
      filePath: normalizedPath,
      sourceFileName: fileName,
      durationSec: null,
    });
  };

  return (
    <div
      className={`tapnow-node-card group relative flex h-full flex-col overflow-visible p-2 transition-colors duration-150 ${
        selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'
      }`}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Film className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <div className={`tapnow-node-pill px-2 py-1 uppercase tracking-[0.12em] ${uiDensity.metaText}`}>
          {t('node.video.title', { defaultValue: '视频' })}
        </div>
        <button
          type="button"
          className={`tapnow-node-button px-2 py-1 ${uiDensity.metaText}`}
          onClick={(event) => {
            event.stopPropagation();
            void handlePickVideo();
          }}
        >
          {data.filePath ? t('node.media.changeFile', { defaultValue: '更换文件' }) : t('node.media.selectFile', { defaultValue: '选择文件' })}
        </button>
      </div>

      <div className="tapnow-node-surface relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden">
        {videoSrc ? (
          <video
            src={videoSrc}
            controls
            className="h-full w-full object-contain"
            onLoadedMetadata={(event) => {
              const durationSec = Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : null;
              updateNodeData(id, { durationSec });
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <Video className="h-8 w-8 opacity-60" />
            <span className="px-4 text-center text-sm">
              {t('node.video.empty', { defaultValue: '选择本地视频后即可预览。' })}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {t('node.video.file', { defaultValue: '文件' })}
          </div>
          <div className="mt-1 truncate text-sm text-text-dark">
            {data.sourceFileName || t('node.media.notSelected', { defaultValue: '未选择' })}
          </div>
        </div>
        <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {t('node.video.duration', { defaultValue: '时长' })}
          </div>
          <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.durationSec)}</div>
        </div>
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!border-surface-dark !bg-accent"
        style={targetHandleStyle}
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!border-surface-dark !bg-accent"
        style={sourceHandleStyle}
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

VideoPreviewNode.displayName = 'VideoPreviewNode';
