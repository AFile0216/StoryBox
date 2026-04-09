import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { Film, Pause, Play, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type VideoPreviewFrameItem,
  type VideoPreviewNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveImageDisplayUrl, resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function findActiveFrame(frames: VideoPreviewFrameItem[], timeSec: number): VideoPreviewFrameItem | null {
  return frames.find((frame) => timeSec >= frame.startSec && timeSec <= frame.startSec + frame.durationSec) ?? null;
}

export const VideoPreviewNode = memo(({ id, data, selected, width, height }: VideoPreviewNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const tickerRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(data.currentTimeSec ?? 0);
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
  const sequenceFrames = useMemo(
    () =>
      [...(data.frames ?? [])]
        .filter((frame) => Number.isFinite(frame.startSec) && Number.isFinite(frame.durationSec) && frame.durationSec > 0)
        .sort((left, right) => left.startSec - right.startSec),
    [data.frames]
  );
  const sequenceDurationSec = useMemo(
    () => sequenceFrames.reduce((max, frame) => Math.max(max, frame.startSec + frame.durationSec), 0),
    [sequenceFrames]
  );
  const timelineMaxSec = useMemo(
    () => Math.max(1, data.durationSec ?? 0, sequenceDurationSec),
    [data.durationSec, sequenceDurationSec]
  );
  const activeFrame = useMemo(
    () => findActiveFrame(sequenceFrames, playheadSec) ?? sequenceFrames[0] ?? null,
    [playheadSec, sequenceFrames]
  );
  const activeFramePreview = activeFrame?.previewImageUrl || activeFrame?.imageUrl || data.posterImageUrl || null;

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setPlayheadSec(clamp(data.currentTimeSec ?? 0, 0, timelineMaxSec));
  }, [data.currentTimeSec, timelineMaxSec]);

  useEffect(() => {
    return () => {
      stopTicker();
    };
  }, [stopTicker]);

  useEffect(() => {
    setPlayheadSec((previous) => clamp(previous, 0, timelineMaxSec));
  }, [timelineMaxSec]);

  useEffect(() => {
    if (!isPlaying) {
      stopTicker();
      return;
    }

    stopTicker();
    tickerRef.current = window.setInterval(() => {
      setPlayheadSec((previous) => {
        const next = previous + 0.05;
        if (next >= timelineMaxSec) {
          stopTicker();
          setIsPlaying(false);
          const clamped = timelineMaxSec;
          updateNodeData(id, { currentTimeSec: clamped });
          return clamped;
        }
        return next;
      });
    }, 50);

    return () => {
      stopTicker();
    };
  }, [id, isPlaying, stopTicker, timelineMaxSec, updateNodeData]);

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
        ) : activeFramePreview ? (
          <img
            src={resolveImageDisplayUrl(activeFramePreview)}
            alt={activeFrame?.label ?? 'sequence-preview'}
            className="h-full w-full object-contain"
            draggable={false}
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

      {videoSrc === null && sequenceFrames.length > 0 ? (
        <div className="mt-2 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded px-1 text-text-muted hover:text-text-dark"
              onClick={(event) => {
                event.stopPropagation();
                setIsPlaying((previous) => {
                  if (previous) {
                    updateNodeData(id, { currentTimeSec: playheadSec });
                  }
                  return !previous;
                });
              }}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <span>{formatSeconds(playheadSec)} / {formatSeconds(timelineMaxSec)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={timelineMaxSec}
            step={0.1}
            value={clamp(playheadSec, 0, timelineMaxSec)}
            onChange={(event) => {
              const next = Number(event.target.value);
              setPlayheadSec(next);
              updateNodeData(id, { currentTimeSec: next });
            }}
            className="w-full"
          />
        </div>
      ) : null}

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {t('node.video.file', { defaultValue: '文件' })}
          </div>
          <div className="mt-1 truncate text-sm text-text-dark">
            {data.sourceFileName || activeFrame?.label || t('node.media.notSelected', { defaultValue: '未选择' })}
          </div>
        </div>
        <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {t('node.video.duration', { defaultValue: '时长' })}
          </div>
          <div className="mt-1 text-sm text-text-dark">{formatSeconds(timelineMaxSec)}</div>
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
