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
import { Pause, Play, Save, Sparkles, Trash2, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { VideoEditorTextClip, VideoEditorTimelineClip } from '@/features/canvas/domain/canvasNodes';

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
  initialTextClips: VideoEditorTextClip[];
  initialPlayheadSec: number;
  onSave: (clips: VideoEditorTimelineClip[], textClips: VideoEditorTextClip[], playheadSec: number) => void;
  onGenerate: (clips: VideoEditorTimelineClip[], textClips: VideoEditorTextClip[]) => void;
  onClose: () => void;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';
type TrackType = 'video' | 'text';

interface TimelineClipLike {
  id: string;
  startSec: number;
  durationSec: number;
}

interface ClipDragState {
  trackType: TrackType;
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

function createTextClipId(): string {
  return `video-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

function sortTrackClips<T extends TimelineClipLike>(clips: T[]): T[] {
  return [...clips].sort((left, right) => {
    if (left.startSec !== right.startSec) {
      return left.startSec - right.startSec;
    }
    return left.id.localeCompare(right.id);
  });
}

function normalizeTrackClips<T extends TimelineClipLike>(clips: T[]): T[] {
  const sorted = sortTrackClips(
    clips.map((clip) => ({
      ...clip,
      startSec: Math.max(0, clip.startSec),
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, clip.durationSec),
    }))
  );

  const normalized: T[] = [];
  let previousEnd = 0;
  for (const clip of sorted) {
    const nextStart = Math.max(clip.startSec, previousEnd);
    const nextDuration = Math.max(MIN_CLIP_DURATION_SEC, clip.durationSec);
    normalized.push({
      ...clip,
      startSec: nextStart,
      durationSec: nextDuration,
    });
    previousEnd = nextStart + nextDuration;
  }

  return normalized;
}

function findAvailableStartSec<T extends TimelineClipLike>(
  clips: T[],
  preferredStartSec: number,
  durationSec: number
): number {
  const sorted = sortTrackClips(clips);
  let candidate = Math.max(0, preferredStartSec);

  for (const clip of sorted) {
    const clipStart = clip.startSec;
    const clipEnd = clip.startSec + clip.durationSec;

    if (candidate + durationSec <= clipStart) {
      break;
    }
    if (candidate >= clipEnd) {
      continue;
    }
    candidate = clipEnd;
  }

  return candidate;
}

function findActiveTrackClip<T extends TimelineClipLike>(clips: T[], timeSec: number): T | null {
  return clips.find(
    (clip) => timeSec >= clip.startSec && timeSec < clip.startSec + clip.durationSec
  ) ?? null;
}

function applyDragToTrack<T extends TimelineClipLike>(
  clips: T[],
  dragState: ClipDragState,
  deltaSec: number
): T[] {
  return normalizeTrackClips(clips.map((clip) => {
    if (clip.id !== dragState.clipId) {
      return clip;
    }

    if (dragState.mode === 'move') {
      return {
        ...clip,
        startSec: Math.max(0, dragState.startSec + deltaSec),
      };
    }

    if (dragState.mode === 'resize-left') {
      const clipEnd = dragState.startSec + dragState.durationSec;
      const nextStart = Math.max(
        0,
        Math.min(dragState.startSec + deltaSec, clipEnd - MIN_CLIP_DURATION_SEC)
      );
      return {
        ...clip,
        startSec: nextStart,
        durationSec: clipEnd - nextStart,
      };
    }

    return {
      ...clip,
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, dragState.durationSec + deltaSec),
    };
  }));
}

function resolveTimelineDuration(
  durationSec: number,
  timelineClips: VideoEditorTimelineClip[],
  textClips: VideoEditorTextClip[]
): number {
  const videoEnd = timelineClips.reduce(
    (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
    0
  );
  const textEnd = textClips.reduce(
    (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
    0
  );

  return Math.max(2, durationSec, videoEnd, textEnd);
}

export const VideoEditorModal = memo(({
  filePath,
  durationSec,
  sourceClips,
  initialTimelineClips,
  initialTextClips,
  initialPlayheadSec,
  onSave,
  onGenerate,
  onClose,
}: VideoEditorModalProps) => {
  const { t } = useTranslation();
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const videoTrackRef = useRef<HTMLDivElement | null>(null);
  const tickerRef = useRef<number | null>(null);

  const [timelineClips, setTimelineClips] = useState<VideoEditorTimelineClip[]>(
    () => normalizeTrackClips(initialTimelineClips)
  );
  const [textClips, setTextClips] = useState<VideoEditorTextClip[]>(
    () => normalizeTrackClips(initialTextClips)
  );
  const [playheadSec, setPlayheadSec] = useState(Math.max(0, initialPlayheadSec));
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragState, setDragState] = useState<ClipDragState | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [activeTextClipId, setActiveTextClipId] = useState<string | null>(null);

  const sourceClipMap = useMemo(
    () => new Map(sourceClips.map((clip) => [clip.id, clip])),
    [sourceClips]
  );

  const timelineMaxSec = useMemo(
    () => resolveTimelineDuration(durationSec, timelineClips, textClips),
    [durationSec, textClips, timelineClips]
  );
  const playheadPercent = useMemo(
    () => (timelineMaxSec > 0 ? clamp((playheadSec / timelineMaxSec) * 100, 0, 100) : 0),
    [playheadSec, timelineMaxSec]
  );

  const activeVideoClip = useMemo(
    () => findActiveTrackClip(timelineClips, playheadSec),
    [playheadSec, timelineClips]
  );
  const activeSourceClip = useMemo(
    () => (activeVideoClip ? sourceClipMap.get(activeVideoClip.sourceClipId) ?? null : null),
    [activeVideoClip, sourceClipMap]
  );
  const activePreviewUrl = activeSourceClip?.previewImageUrl || activeSourceClip?.imageUrl || null;
  const activeTextOverlays = useMemo(
    () => sortTrackClips(textClips).filter(
      (clip) => playheadSec >= clip.startSec && playheadSec < clip.startSec + clip.durationSec && clip.text.trim()
    ),
    [playheadSec, textClips]
  );

  const hasReferenceVideo = Boolean(filePath);

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

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const normalizeTextTracks = useCallback((clips: VideoEditorTextClip[]): VideoEditorTextClip[] => (
    normalizeTrackClips(
      clips
        .map((clip) => ({
          ...clip,
          text: clip.text.trim(),
        }))
        .filter((clip) => clip.text.length > 0)
    )
  ), []);

  const handleSave = useCallback(() => {
    onSave(normalizeTrackClips(timelineClips), normalizeTextTracks(textClips), playheadSec);
  }, [normalizeTextTracks, onSave, playheadSec, textClips, timelineClips]);

  useEffect(() => {
    setTimelineClips(normalizeTrackClips(initialTimelineClips));
  }, [initialTimelineClips]);

  useEffect(() => {
    setTextClips(normalizeTrackClips(initialTextClips));
  }, [initialTextClips]);

  useEffect(() => {
    setPlayheadSec((previous) => clamp(previous, 0, timelineMaxSec));
  }, [timelineMaxSec]);

  useEffect(() => {
    return () => {
      stopTicker();
    };
  }, [stopTicker]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaPx = event.clientX - dragState.originX;
      const deltaSec = (deltaPx / dragState.trackWidth) * dragState.timelineMaxSec;

      if (dragState.trackType === 'video') {
        setTimelineClips((previous) => applyDragToTrack(previous, dragState, deltaSec));
      } else {
        setTextClips((previous) => applyDragToTrack(previous, dragState, deltaSec));
      }
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
          return timelineMaxSec;
        }
        return next;
      });
    }, 50);

    return () => {
      stopTicker();
    };
  }, [isPlaying, stopTicker, timelineMaxSec]);

  const handleTimelineDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const sourceClipId = event.dataTransfer.getData('storybox/source-clip-id');
    if (!sourceClipId || !sourceClipMap.has(sourceClipId)) {
      return;
    }

    const rect = videoTrackRef.current?.getBoundingClientRect();
    let startSec = timelineClips.length > 0
      ? Math.max(...timelineClips.map((clip) => clip.startSec + clip.durationSec))
      : 0;

    if (rect && rect.width > 0) {
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      startSec = ratio * timelineMaxSec;
    }

    setTimelineClips((previous) => {
      const safeStart = findAvailableStartSec(previous, startSec, DEFAULT_CLIP_DURATION_SEC);
      return normalizeTrackClips([
        ...previous,
        {
          id: createSequenceClipId(),
          sourceClipId,
          startSec: safeStart,
          durationSec: DEFAULT_CLIP_DURATION_SEC,
        },
      ]);
    });
  }, [sourceClipMap, timelineClips, timelineMaxSec]);

  const handleTimelineDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleTrackMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setPlayheadSec(ratio * timelineMaxSec);
  }, [timelineMaxSec]);

  const handleClipMouseDown = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    clip: TimelineClipLike,
    mode: DragMode,
    trackType: TrackType
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    setDragState({
      trackType,
      clipId: clip.id,
      mode,
      originX: event.clientX,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      timelineMaxSec,
      trackWidth: rect.width,
    });
  }, [timelineMaxSec]);

  const handleRemoveVideoClip = useCallback((clipId: string) => {
    setTimelineClips((previous) => previous.filter((clip) => clip.id !== clipId));
  }, []);

  const handleRemoveTextClip = useCallback((clipId: string) => {
    setTextClips((previous) => previous.filter((clip) => clip.id !== clipId));
    setActiveTextClipId((previous) => (previous === clipId ? null : previous));
  }, []);

  const handleAddTextClip = useCallback(() => {
    const value = textDraft.trim();
    if (!value) {
      return;
    }

    const nextId = createTextClipId();
    setTextClips((previous) => {
      const safeStart = findAvailableStartSec(previous, playheadSec, DEFAULT_CLIP_DURATION_SEC);
      return normalizeTrackClips([
        ...previous,
        {
          id: nextId,
          text: value,
          startSec: safeStart,
          durationSec: DEFAULT_CLIP_DURATION_SEC,
          color: '#ffffff',
          fontSize: 28,
        },
      ]);
    });
    setActiveTextClipId(nextId);
    setTextDraft('');
  }, [playheadSec, textDraft]);

  const handleUpdateTextClip = useCallback((clipId: string, value: string) => {
    setTextClips((previous) => previous.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }
      return {
        ...clip,
        text: value,
      };
    }));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 p-6"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[26px] border border-[rgba(255,255,255,0.18)] bg-bg-dark/95 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
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
                const normalizedTimelineClips = normalizeTrackClips(timelineClips);
                const normalizedTextClips = normalizeTextTracks(textClips);
                onSave(normalizedTimelineClips, normalizedTextClips, playheadSec);
                onGenerate(normalizedTimelineClips, normalizedTextClips);
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
          <div className="flex min-w-0 flex-1 flex-col border-r border-[rgba(255,255,255,0.08)] p-5">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.2)] bg-black">
              {activePreviewUrl ? (
                <img
                  src={resolveImageDisplayUrl(activePreviewUrl)}
                  alt="timeline-preview"
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : null}

              {activeTextOverlays.length > 0 ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 px-10 pb-8">
                  {activeTextOverlays.map((clip) => (
                    <div
                      key={clip.id}
                      className="max-w-[80%] rounded-md bg-black/55 px-3 py-1 text-center font-medium text-white"
                      style={{
                        color: clip.color || '#ffffff',
                        fontSize: `${Math.max(14, clip.fontSize ?? 28)}px`,
                      }}
                    >
                      {clip.text}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="rounded bg-black/55 px-2 py-1 text-[11px] text-white/85">
                  {activePreviewUrl
                    ? (activeSourceClip?.label || t('node.videoEditor.previewFrame', { defaultValue: '当前分镜' }))
                    : t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                </span>
                {hasReferenceVideo ? (
                  <span className="rounded bg-black/45 px-2 py-1 text-[10px] text-white/65">
                    {t('node.videoEditor.referenceVideoConnected', { defaultValue: '已连接参考视频' })}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-[16px] border border-[rgba(255,255,255,0.14)] bg-bg-dark/50 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      if (isPlaying) {
                        setIsPlaying(false);
                        stopTicker();
                        return;
                      }
                      setIsPlaying(true);
                    }}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <span className="font-medium text-sky-300">
                    {t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
                  </span>
                </div>
                <span>{formatSeconds(playheadSec)} / {formatSeconds(timelineMaxSec)}</span>
              </div>

              <div
                ref={timelineTrackRef}
                className="relative overflow-hidden rounded-md border border-[rgba(255,255,255,0.12)] bg-white/5"
                onMouseDown={handleTrackMouseDown}
              >
                <div className="relative h-7 border-b border-[rgba(255,255,255,0.08)]">
                  {rulerMarks.map((sec) => {
                    const left = timelineMaxSec > 0 ? (sec / timelineMaxSec) * 100 : 0;
                    return (
                      <div
                        key={sec}
                        className="pointer-events-none absolute bottom-0 top-0"
                        style={{ left: `${left}%` }}
                      >
                        <div className="h-2 w-px bg-white/35" />
                        <span className="absolute top-2 -translate-x-1/2 text-[10px] text-white/65">
                          {formatSeconds(sec)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="relative h-[120px]">
                  <div
                    ref={videoTrackRef}
                    className="absolute left-0 right-0 top-0 h-[60px] border-b border-[rgba(255,255,255,0.08)]"
                    onDragOver={handleTimelineDragOver}
                    onDrop={handleTimelineDrop}
                  >
                    <div className="absolute left-2 top-1 rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/70">
                      {t('node.videoEditor.videoTrack', { defaultValue: '视频轨' })}
                    </div>

                    {timelineClips.map((clip) => {
                      const source = sourceClipMap.get(clip.sourceClipId);
                      const left = `${(clip.startSec / timelineMaxSec) * 100}%`;
                      const width = `${Math.max(3, (clip.durationSec / timelineMaxSec) * 100)}%`;
                      return (
                        <div
                          key={clip.id}
                          className={`absolute bottom-2 top-6 rounded border border-sky-400/55 bg-sky-500/35 ${
                            activeVideoClip?.id === clip.id ? 'ring-1 ring-sky-300/80' : ''
                          }`}
                          style={{ left, width }}
                          onMouseDown={(event) => handleClipMouseDown(event, clip, 'move', 'video')}
                        >
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white hover:bg-red-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveVideoClip(clip.id);
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                          <div
                            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-black/25 hover:bg-black/40"
                            onMouseDown={(event) => handleClipMouseDown(event, clip, 'resize-left', 'video')}
                          />
                          <div className="mx-2 mt-1 truncate text-[10px] text-white">{source?.label ?? 'Clip'}</div>
                          <div className="mx-2 truncate text-[10px] text-white/85">
                            {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                          </div>
                          <div
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/25 hover:bg-black/40"
                            onMouseDown={(event) => handleClipMouseDown(event, clip, 'resize-right', 'video')}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="absolute left-0 right-0 top-[60px] h-[60px]">
                    <div className="absolute left-2 top-1 rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white/70">
                      {t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}
                    </div>

                    {textClips.map((clip) => {
                      const left = `${(clip.startSec / timelineMaxSec) * 100}%`;
                      const width = `${Math.max(3, (clip.durationSec / timelineMaxSec) * 100)}%`;
                      const isActive = activeTextClipId === clip.id;
                      return (
                        <div
                          key={clip.id}
                          className={`absolute bottom-2 top-6 rounded border border-amber-400/55 bg-amber-500/35 ${
                            isActive ? 'ring-1 ring-amber-300/85' : ''
                          }`}
                          style={{ left, width }}
                          onMouseDown={(event) => {
                            setActiveTextClipId(clip.id);
                            handleClipMouseDown(event, clip, 'move', 'text');
                          }}
                        >
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white hover:bg-red-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveTextClip(clip.id);
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                          <div
                            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-black/25 hover:bg-black/40"
                            onMouseDown={(event) => {
                              setActiveTextClipId(clip.id);
                              handleClipMouseDown(event, clip, 'resize-left', 'text');
                            }}
                          />
                          <div className="mx-2 mt-1 truncate text-[10px] text-white">{clip.text || 'Text'}</div>
                          <div className="mx-2 truncate text-[10px] text-white/85">
                            {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                          </div>
                          <div
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/25 hover:bg-black/40"
                            onMouseDown={(event) => {
                              setActiveTextClipId(clip.id);
                              handleClipMouseDown(event, clip, 'resize-right', 'text');
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-red-300/95"
                    style={{ left: `${playheadPercent}%` }}
                  />
                </div>
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
            </div>
          </div>

          <div className="flex w-[320px] shrink-0 flex-col p-5">
            <div className="mb-2 text-sm font-medium text-text-dark">
              {t('node.videoEditor.sourceClips', { defaultValue: '分镜栏' })}
            </div>
            <div className="ui-scrollbar max-h-[40%] space-y-2 overflow-y-auto rounded-[16px] border border-[rgba(255,255,255,0.14)] bg-bg-dark/30 p-3 pr-2">
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
                      className="cursor-grab rounded-xl border border-[rgba(255,255,255,0.1)] bg-bg-dark/40 p-2 transition-colors hover:border-[rgba(255,255,255,0.22)] active:cursor-grabbing"
                    >
                      {previewUrl ? (
                        <img
                          src={resolveImageDisplayUrl(previewUrl)}
                          alt={clip.label}
                          className="mb-1.5 h-20 w-full rounded-lg object-cover"
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

            <div className="mt-4 text-sm font-medium text-text-dark">
              {t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}
            </div>
            <div className="mt-2 rounded-[16px] border border-[rgba(255,255,255,0.14)] bg-bg-dark/30 p-3">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[rgba(255,255,255,0.14)] bg-black/30 px-2 py-1">
                  <Type className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <input
                    type="text"
                    value={textDraft}
                    onChange={(event) => setTextDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddTextClip();
                      }
                    }}
                    className="w-full bg-transparent text-xs text-text-dark outline-none"
                    placeholder={t('node.videoEditor.textPlaceholder', { defaultValue: '输入文字后添加到文字轨' })}
                  />
                </div>
                <button
                  type="button"
                  className="rounded-md bg-amber-500/80 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
                  onClick={handleAddTextClip}
                >
                  {t('node.videoEditor.addTextClip', { defaultValue: '添加' })}
                </button>
              </div>

              <div className="ui-scrollbar mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                {textClips.length === 0 ? (
                  <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/20 px-3 py-2 text-xs text-text-muted">
                    {t('node.videoEditor.noTextClips', { defaultValue: '暂无文字片段' })}
                  </div>
                ) : (
                  sortTrackClips(textClips).map((clip) => (
                    <div
                      key={clip.id}
                      className={`rounded-lg border p-2 ${
                        activeTextClipId === clip.id
                          ? 'border-amber-300/60 bg-amber-500/15'
                          : 'border-[rgba(255,255,255,0.12)] bg-black/25'
                      }`}
                      onMouseDown={() => setActiveTextClipId(clip.id)}
                    >
                      <input
                        type="text"
                        value={clip.text}
                        onChange={(event) => handleUpdateTextClip(clip.id, event.target.value)}
                        onFocus={() => setActiveTextClipId(clip.id)}
                        className="w-full rounded border border-[rgba(255,255,255,0.14)] bg-black/30 px-2 py-1 text-xs text-text-dark outline-none"
                      />
                      <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
                        <span>
                          {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                        </span>
                        <button
                          type="button"
                          className="text-red-300 hover:text-red-200"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveTextClip(clip.id);
                          }}
                        >
                          {t('common.delete', { defaultValue: '删除' })}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoEditorModal.displayName = 'VideoEditorModal';

