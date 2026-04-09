import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Play, Pause, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl, resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import type { VideoEditorTimelineClip } from '@/features/canvas/domain/canvasNodes';

export interface VideoEditorSourceClipItem {
  id: string;
  label: string;
  imageUrl: string | null;
  previewImageUrl?: string | null;
}

interface VideoEditorModalProps {
  filePath: string | null;
  durationSec: number;
  sourceClips: VideoEditorSourceClipItem[];
  initialTimelineClips: VideoEditorTimelineClip[];
  initialPlayheadSec: number;
  onSave: (clips: VideoEditorTimelineClip[], playheadSec: number) => void;
  onGenerate: (clips: VideoEditorTimelineClip[]) => void;
  onClose: () => void;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';

interface SequenceDragState {
  clipId: string;
  mode: DragMode;
  originX: number;
  startSec: number;
  durationSec: number;
  timelineMaxSec: number;
  trackWidth: number;
}

const DEFAULT_CLIP_DURATION_SEC = 2;
const MIN_CLIP_DURATION_SEC = 0.5;

function createSequenceClipId(): string {
  return `video-seq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '0.0s';
  }
  return `${Math.max(0, value).toFixed(1)}s`;
}

function sortTimelineClips(clips: VideoEditorTimelineClip[]): VideoEditorTimelineClip[] {
  return [...clips].sort((left, right) => {
    if (left.startSec !== right.startSec) {
      return left.startSec - right.startSec;
    }
    return left.id.localeCompare(right.id);
  });
}

export const VideoEditorModal = memo(({
  filePath,
  durationSec,
  sourceClips,
  initialTimelineClips,
  initialPlayheadSec,
  onSave,
  onGenerate,
  onClose,
}: VideoEditorModalProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const tickerRef = useRef<number | null>(null);

  const [timelineClips, setTimelineClips] = useState<VideoEditorTimelineClip[]>(
    () => sortTimelineClips(initialTimelineClips)
  );
  const [playheadSec, setPlayheadSec] = useState(initialPlayheadSec);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragState, setDragState] = useState<SequenceDragState | null>(null);

  const sourceClipMap = useMemo(
    () => new Map(sourceClips.map((clip) => [clip.id, clip])),
    [sourceClips]
  );
  const timelineMaxSec = useMemo(() => {
    const timelineEnd = timelineClips.reduce(
      (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
      0
    );
    return Math.max(2, durationSec || 0, timelineEnd);
  }, [durationSec, timelineClips]);
  const activeSequenceClip = useMemo(
    () =>
      timelineClips.find((clip) =>
        playheadSec >= clip.startSec
        && playheadSec <= clip.startSec + clip.durationSec
      ) ?? null,
    [playheadSec, timelineClips]
  );
  const activeSourceClip = activeSequenceClip
    ? sourceClipMap.get(activeSequenceClip.sourceClipId) ?? null
    : null;

  const videoSrc = filePath ? resolveLocalAssetUrl(filePath) : null;
  const activePreviewUrl = activeSourceClip?.previewImageUrl
    || activeSourceClip?.imageUrl
    || null;

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave(sortTimelineClips(timelineClips), playheadSec);
  }, [onSave, playheadSec, timelineClips]);

  useEffect(() => {
    setTimelineClips(sortTimelineClips(initialTimelineClips));
  }, [initialTimelineClips]);

  useEffect(() => {
    setPlayheadSec((previous) => clamp(previous, 0, timelineMaxSec));
  }, [timelineMaxSec]);

  useEffect(() => {
    return () => {
      stopTicker();
    };
  }, [stopTicker]);

  useEffect(() => {
    if (!videoRef.current || activePreviewUrl) {
      return;
    }
    const targetTime = clamp(playheadSec, 0, durationSec || timelineMaxSec);
    if (Math.abs(videoRef.current.currentTime - targetTime) > 0.03) {
      videoRef.current.currentTime = targetTime;
    }
  }, [activePreviewUrl, durationSec, playheadSec, timelineMaxSec]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaPx = event.clientX - dragState.originX;
      const deltaSec = (deltaPx / dragState.trackWidth) * dragState.timelineMaxSec;
      setTimelineClips((previous) =>
        sortTimelineClips(previous.map((clip) => {
          if (clip.id !== dragState.clipId) {
            return clip;
          }

          if (dragState.mode === 'move') {
            const maxStart = Math.max(0, dragState.timelineMaxSec - dragState.durationSec);
            return {
              ...clip,
              startSec: clamp(dragState.startSec + deltaSec, 0, maxStart),
            };
          }

          if (dragState.mode === 'resize-left') {
            const clipEnd = dragState.startSec + dragState.durationSec;
            const nextStart = clamp(
              dragState.startSec + deltaSec,
              0,
              clipEnd - MIN_CLIP_DURATION_SEC
            );
            return {
              ...clip,
              startSec: nextStart,
              durationSec: clipEnd - nextStart,
            };
          }

          const maxDuration = Math.max(
            MIN_CLIP_DURATION_SEC,
            dragState.timelineMaxSec - dragState.startSec
          );
          return {
            ...clip,
            durationSec: clamp(dragState.durationSec + deltaSec, MIN_CLIP_DURATION_SEC, maxDuration),
          };
        }))
      );
    };

    const handleUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stopTicker();
      return;
    }

    setIsPlaying(true);
    stopTicker();
    tickerRef.current = window.setInterval(() => {
      setPlayheadSec((previous) => {
        const next = previous + 0.05;
        if (next >= timelineMaxSec) {
          stopTicker();
          setIsPlaying(false);
          return timelineMaxSec;
        }
        return next;
      });
    }, 50);
  }, [isPlaying, stopTicker, timelineMaxSec]);

  const handleTimelineDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const clipId = event.dataTransfer.getData('storybox/source-clip-id');
    if (!clipId || !sourceClipMap.has(clipId)) {
      return;
    }

    const rect = timelineTrackRef.current?.getBoundingClientRect();
    let startSec = timelineClips.length > 0
      ? Math.max(...timelineClips.map((clip) => clip.startSec + clip.durationSec))
      : 0;
    if (rect && rect.width > 0) {
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      startSec = ratio * timelineMaxSec;
    }

    const maxStart = Math.max(0, timelineMaxSec - DEFAULT_CLIP_DURATION_SEC);
    setTimelineClips((previous) => sortTimelineClips([
      ...previous,
      {
        id: createSequenceClipId(),
        sourceClipId: clipId,
        startSec: clamp(startSec, 0, maxStart),
        durationSec: DEFAULT_CLIP_DURATION_SEC,
      },
    ]));
  }, [sourceClipMap, timelineClips, timelineMaxSec]);

  const handleTimelineDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleRemoveSequenceClip = useCallback((clipId: string) => {
    setTimelineClips((previous) => previous.filter((clip) => clip.id !== clipId));
  }, []);

  const handleSequenceMouseDown = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    clip: VideoEditorTimelineClip,
    mode: DragMode
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const trackRect = timelineTrackRef.current?.getBoundingClientRect();
    if (!trackRect || trackRect.width <= 0) {
      return;
    }

    setDragState({
      clipId: clip.id,
      mode,
      originX: event.clientX,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      timelineMaxSec,
      trackWidth: trackRect.width,
    });
  }, [timelineMaxSec]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg-dark"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
        <span className="text-sm font-medium text-text-dark">
          {t('node.videoEditor.editorTitle', { defaultValue: '视频编辑器' })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.15)] px-3 py-1.5 text-xs text-text-dark hover:bg-white/5"
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5" />
            {t('common.save', { defaultValue: '保存' })}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            onClick={() => {
              const normalized = sortTimelineClips(timelineClips);
              onSave(normalized, playheadSec);
              onGenerate(normalized);
              onClose();
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('node.videoEditor.generatePreview', { defaultValue: '生成预览' })}
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-white/5 hover:text-text-dark"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-[rgba(255,255,255,0.08)] p-4">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-black">
            {activePreviewUrl ? (
              <img
                src={resolveImageDisplayUrl(activePreviewUrl)}
                alt="timeline-preview"
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="h-full w-full object-contain"
                onLoadedMetadata={(event) => {
                  if (Math.abs(event.currentTarget.currentTime - playheadSec) > 0.05) {
                    event.currentTarget.currentTime = playheadSec;
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                {t('node.videoEditor.missingVideo', { defaultValue: '请先选择视频文件' })}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-text-muted hover:text-white"
                  onClick={togglePlay}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <span>{t('node.videoEditor.timeline', { defaultValue: '时间轴' })}</span>
              </div>
              <span>{formatSeconds(playheadSec)} / {formatSeconds(timelineMaxSec)}</span>
            </div>

            <div
              ref={timelineTrackRef}
              className="relative h-16 rounded-md border border-[rgba(255,255,255,0.1)] bg-white/5"
              onDragOver={handleTimelineDragOver}
              onDrop={handleTimelineDrop}
            >
              {timelineClips.map((clip) => {
                const source = sourceClipMap.get(clip.sourceClipId);
                const left = `${(clip.startSec / timelineMaxSec) * 100}%`;
                const width = `${Math.max(3, (clip.durationSec / timelineMaxSec) * 100)}%`;
                return (
                  <div
                    key={clip.id}
                    className={`absolute bottom-2 top-2 rounded border border-accent/45 bg-accent/25 ${
                      activeSequenceClip?.id === clip.id ? 'ring-1 ring-accent/60' : ''
                    }`}
                    style={{ left, width }}
                    onMouseDown={(event) => handleSequenceMouseDown(event, clip, 'move')}
                  >
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-white hover:bg-red-500"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveSequenceClip(clip.id);
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                    <div
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-black/25 hover:bg-black/40"
                      onMouseDown={(event) => handleSequenceMouseDown(event, clip, 'resize-left')}
                    />
                    <div className="mx-2 mt-1 truncate text-[10px] text-white">
                      {source?.label ?? 'Clip'}
                    </div>
                    <div className="mx-2 truncate text-[10px] text-white/80">
                      {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                    </div>
                    <div
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/25 hover:bg-black/40"
                      onMouseDown={(event) => handleSequenceMouseDown(event, clip, 'resize-right')}
                    />
                  </div>
                );
              })}
              <div
                className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-white/90"
                style={{ left: `${(playheadSec / timelineMaxSec) * 100}%` }}
              />
            </div>

            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={timelineMaxSec}
                step={0.1}
                value={clamp(playheadSec, 0, timelineMaxSec)}
                onChange={(event) => setPlayheadSec(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {activeSequenceClip
                ? `${formatSeconds(activeSequenceClip.startSec)}-${formatSeconds(activeSequenceClip.startSec + activeSequenceClip.durationSec)}`
                : t('node.videoEditor.noSequence', { defaultValue: '拖拽分镜到时间轴开始编排' })}
            </div>
          </div>
        </div>

        <div className="flex w-[280px] shrink-0 flex-col p-4">
          <div className="mb-2 text-sm font-medium text-text-dark">
            {t('node.videoEditor.sourceClips', { defaultValue: '分镜栏' })}
          </div>
          <div className="ui-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {sourceClips.length === 0 ? (
              <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/30 px-3 py-4 text-xs text-text-muted">
                {t('node.videoEditor.noSourceClips', { defaultValue: '未检测到分镜图片，请连接分镜节点' })}
              </div>
            ) : (
              sourceClips.map((clip) => {
                const previewUrl = clip.previewImageUrl || clip.imageUrl;
                return (
                  <div
                    key={clip.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('storybox/source-clip-id', clip.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="cursor-grab rounded-lg border border-[rgba(255,255,255,0.1)] bg-bg-dark/30 p-2 transition-colors hover:border-[rgba(255,255,255,0.22)] active:cursor-grabbing"
                  >
                    {previewUrl ? (
                      <img
                        src={resolveImageDisplayUrl(previewUrl)}
                        alt={clip.label}
                        className="mb-1.5 h-20 w-full rounded object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="mb-1.5 flex h-20 items-center justify-center rounded bg-white/5 text-xs text-text-muted">
                        {clip.label}
                      </div>
                    )}
                    <div className="truncate text-xs text-text-dark">{clip.label}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

VideoEditorModal.displayName = 'VideoEditorModal';
