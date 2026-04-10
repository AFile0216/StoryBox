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
    return '0.0s';
  }
  return `${Math.max(0, value).toFixed(1)}s`;
}

function findActiveFrame(frames: VideoPreviewFrameItem[], timeSec: number): VideoPreviewFrameItem | null {
  return frames.find((frame) => timeSec >= frame.startSec && timeSec < frame.startSec + frame.durationSec) ?? null;
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
  const sequenceTextClips = useMemo(
    () =>
      [...(data.textClips ?? [])]
        .filter((clip) => Number.isFinite(clip.startSec) && Number.isFinite(clip.durationSec) && clip.durationSec > 0)
        .sort((left, right) => left.startSec - right.startSec),
    [data.textClips]
  );
  const sequenceDurationSec = useMemo(
    () => Math.max(
      sequenceFrames.reduce((max, frame) => Math.max(max, frame.startSec + frame.durationSec), 0),
      sequenceTextClips.reduce((max, clip) => Math.max(max, clip.startSec + clip.durationSec), 0)
    ),
    [sequenceFrames, sequenceTextClips]
  );
  const timelineMaxSec = useMemo(
    () => Math.max(1, data.durationSec ?? 0, sequenceDurationSec),
    [data.durationSec, sequenceDurationSec]
  );
  const playheadPercent = useMemo(
    () => (timelineMaxSec > 0 ? clamp((playheadSec / timelineMaxSec) * 100, 0, 100) : 0),
    [playheadSec, timelineMaxSec]
  );
  const rulerStepSec = useMemo(() => {
    if (timelineMaxSec <= 12) {
      return 1;
    }
    if (timelineMaxSec <= 40) {
      return 2;
    }
    return 5;
  }, [timelineMaxSec]);
  const rulerMarks = useMemo(() => {
    const marks: number[] = [];
    for (let sec = 0; sec <= timelineMaxSec + 0.0001; sec += rulerStepSec) {
      marks.push(Number(sec.toFixed(3)));
    }
    if (marks[marks.length - 1] < timelineMaxSec) {
      marks.push(timelineMaxSec);
    }
    return marks;
  }, [rulerStepSec, timelineMaxSec]);
  const activeFrame = useMemo(
    () => findActiveFrame(sequenceFrames, playheadSec),
    [playheadSec, sequenceFrames]
  );
  const activeTextClips = useMemo(
    () => sequenceTextClips.filter((clip) => playheadSec >= clip.startSec && playheadSec < clip.startSec + clip.durationSec),
    [playheadSec, sequenceTextClips]
  );
  const activeFramePreview = activeFrame?.previewImageUrl || activeFrame?.imageUrl || null;
  const hasSequencePreview = sequenceFrames.length > 0;

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
          {data.filePath
            ? t('node.media.changeFile', { defaultValue: '更换文件' })
            : t('node.media.selectFile', { defaultValue: '选择文件' })}
        </button>
      </div>

      <div className="tapnow-node-surface relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden">
        {hasSequencePreview ? (
          <div className="relative h-full w-full bg-black">
            {activeFramePreview ? (
              <img
                src={resolveImageDisplayUrl(activeFramePreview)}
                alt={activeFrame?.label ?? 'sequence-preview'}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : null}
            {activeTextClips.length > 0 ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 px-8 pb-6">
                {activeTextClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="max-w-[80%] rounded-md bg-black/55 px-3 py-1 text-center font-medium text-white"
                    style={{
                      color: clip.color || '#ffffff',
                      fontSize: `${Math.max(12, clip.fontSize ?? 24)}px`,
                    }}
                  >
                    {clip.text}
                  </div>
                ))}
              </div>
            ) : null}
            {!activeFramePreview ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="ui-timecode rounded border border-white/20 bg-black/55 px-2 py-1 text-[11px] text-white/75">
                  {t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                </div>
              </div>
            ) : null}
          </div>
        ) : videoSrc ? (
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

      {hasSequencePreview ? (
        <div className="mt-2 rounded-lg border border-[var(--ui-border-soft)] bg-[rgba(8,14,22,0.7)] p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-white/5 text-text-muted hover:bg-white/10 hover:text-text-dark"
              aria-label={isPlaying
                ? t('node.videoEditor.pause', { defaultValue: '暂停播放' })
                : t('node.videoEditor.play', { defaultValue: '播放时间线' })}
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
            <span className="ui-timecode">{formatSeconds(playheadSec)} / {formatSeconds(timelineMaxSec)}</span>
          </div>
          <div className="relative mb-2 h-10 overflow-hidden rounded-md border border-white/12 bg-black/35">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_46px)] opacity-30" />
            {rulerMarks.map((sec) => {
              const left = timelineMaxSec > 0 ? (sec / timelineMaxSec) * 100 : 0;
              return (
                <div
                  key={sec}
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/20"
                  style={{ left: `${left}%` }}
                >
                  <span className="ui-timecode absolute left-1 top-0 text-[9px] text-white/65">
                    {formatSeconds(sec)}
                  </span>
                </div>
              );
            })}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-accent/95 shadow-[0_0_8px_rgba(249,115,22,0.9)]"
              style={{ left: `${playheadPercent}%` }}
            />
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
            aria-label={t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[rgb(var(--accent-rgb))]"
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
          <div className="ui-timecode mt-1 text-sm text-text-dark">{formatSeconds(timelineMaxSec)}</div>
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

