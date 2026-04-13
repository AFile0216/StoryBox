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
import { Magnet, Pause, Play, Save, Sparkles, Trash2, Type, X } from 'lucide-react';
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
const SNAP_THRESHOLD_RATIO = 0.01;
const SNAP_THRESHOLD_MIN_SEC = 0.08;
const SNAP_THRESHOLD_MAX_SEC = 0.4;

function createSequenceClipId(): string {
  return `video-seq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createTextClipId(): string {
  return `video-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function resolveClipEndSec(clip: TimelineClipLike): number {
  const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
  const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
  return startSec + durationSec;
}

function toTimelinePercent(valueSec: number, timelineSec: number): number {
  const safeTimelineSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(timelineSec, 2));
  const safeValueSec = Math.max(0, toFiniteNumber(valueSec, 0));
  return clamp((safeValueSec / safeTimelineSec) * 100, 0, 100);
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
  const sanitized = clips
    .filter((clip) => typeof clip.id === 'string' && clip.id.trim().length > 0)
    .map((clip) => ({
      ...clip,
      startSec: Math.max(0, toFiniteNumber(clip.startSec, 0)),
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC)),
    }));
  const sorted = sortTrackClips(
    sanitized
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
  let candidate = Math.max(0, toFiniteNumber(preferredStartSec, 0));
  const safeDurationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(durationSec, MIN_CLIP_DURATION_SEC));

  for (const clip of sorted) {
    const clipStart = Math.max(0, toFiniteNumber(clip.startSec, 0));
    const clipEnd = clipStart + Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));

    if (candidate + safeDurationSec <= clipStart) {
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
  const safeTimeSec = Math.max(0, toFiniteNumber(timeSec, 0));
  return clips.find(
    (clip) => {
      const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
      const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
      return safeTimeSec >= startSec && safeTimeSec < startSec + durationSec;
    }
  ) ?? null;
}

function collectTrackEdges<T extends TimelineClipLike>(clips: T[], excludeClipId?: string): number[] {
  const edges: number[] = [];
  clips.forEach((clip) => {
    if (excludeClipId && clip.id === excludeClipId) {
      return;
    }
    const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
    const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
    edges.push(startSec);
    edges.push(startSec + durationSec);
  });
  return edges;
}

function resolveSnapThresholdSec(timelineMaxSec: number): number {
  return clamp(
    timelineMaxSec * SNAP_THRESHOLD_RATIO,
    SNAP_THRESHOLD_MIN_SEC,
    SNAP_THRESHOLD_MAX_SEC
  );
}

function findClosestAnchor(
  targetSec: number,
  anchors: number[],
  thresholdSec: number
): { anchor: number; delta: number } | null {
  let matched: { anchor: number; delta: number } | null = null;
  for (const anchor of anchors) {
    const delta = Math.abs(anchor - targetSec);
    if (delta > thresholdSec) {
      continue;
    }
    if (!matched || delta < matched.delta) {
      matched = { anchor, delta };
    }
  }
  return matched;
}

function resolveSnappedClip(
  clip: TimelineClipLike,
  mode: DragMode,
  anchors: number[],
  thresholdSec: number
): Pick<TimelineClipLike, 'startSec' | 'durationSec'> {
  if (anchors.length === 0) {
    return { startSec: clip.startSec, durationSec: clip.durationSec };
  }

  const clipEnd = clip.startSec + clip.durationSec;
  if (mode === 'move') {
    const snapStart = findClosestAnchor(clip.startSec, anchors, thresholdSec);
    const snapEnd = findClosestAnchor(clipEnd, anchors, thresholdSec);

    if (!snapStart && !snapEnd) {
      return { startSec: clip.startSec, durationSec: clip.durationSec };
    }
    if (!snapEnd || (snapStart && snapStart.delta <= snapEnd.delta)) {
      return {
        startSec: Math.max(0, snapStart!.anchor),
        durationSec: clip.durationSec,
      };
    }
    return {
      startSec: Math.max(0, snapEnd.anchor - clip.durationSec),
      durationSec: clip.durationSec,
    };
  }

  if (mode === 'resize-left') {
    const snapStart = findClosestAnchor(clip.startSec, anchors, thresholdSec);
    if (!snapStart) {
      return { startSec: clip.startSec, durationSec: clip.durationSec };
    }
    const nextStart = Math.max(0, Math.min(snapStart.anchor, clipEnd - MIN_CLIP_DURATION_SEC));
    return {
      startSec: nextStart,
      durationSec: clipEnd - nextStart,
    };
  }

  const snapEnd = findClosestAnchor(clipEnd, anchors, thresholdSec);
  if (!snapEnd) {
    return { startSec: clip.startSec, durationSec: clip.durationSec };
  }
  const nextEnd = Math.max(clip.startSec + MIN_CLIP_DURATION_SEC, snapEnd.anchor);
  return {
    startSec: clip.startSec,
    durationSec: nextEnd - clip.startSec,
  };
}

function applyDragToTrack<T extends TimelineClipLike>(
  clips: T[],
  dragState: ClipDragState,
  deltaSec: number,
  snapAnchors: number[],
  snapEnabled: boolean
): T[] {
  const snapThresholdSec = resolveSnapThresholdSec(dragState.timelineMaxSec);
  return normalizeTrackClips(clips.map((clip) => {
    if (clip.id !== dragState.clipId) {
      return clip;
    }

    if (dragState.mode === 'move') {
      const movedClip = {
        ...clip,
        startSec: Math.max(0, dragState.startSec + deltaSec),
      };
      if (!snapEnabled) {
        return movedClip;
      }
      const snapped = resolveSnappedClip(movedClip, dragState.mode, snapAnchors, snapThresholdSec);
      return {
        ...movedClip,
        ...snapped,
      };
    }

    if (dragState.mode === 'resize-left') {
      const clipEnd = dragState.startSec + dragState.durationSec;
      const nextStart = Math.max(
        0,
        Math.min(dragState.startSec + deltaSec, clipEnd - MIN_CLIP_DURATION_SEC)
      );
      const resizedClip = {
        ...clip,
        startSec: nextStart,
        durationSec: clipEnd - nextStart,
      };
      if (!snapEnabled) {
        return resizedClip;
      }
      const snapped = resolveSnappedClip(resizedClip, dragState.mode, snapAnchors, snapThresholdSec);
      return {
        ...resizedClip,
        ...snapped,
      };
    }

    const resizedClip = {
      ...clip,
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, dragState.durationSec + deltaSec),
    };
    if (!snapEnabled) {
      return resizedClip;
    }
    const snapped = resolveSnappedClip(resizedClip, dragState.mode, snapAnchors, snapThresholdSec);
    return {
      ...resizedClip,
      ...snapped,
    };
  }));
}

function resolveTimelineDuration(
  durationSec: number,
  timelineClips: VideoEditorTimelineClip[],
  textClips: VideoEditorTextClip[]
): number {
  const videoEnd = timelineClips.reduce(
    (max, clip) => Math.max(max, resolveClipEndSec(clip)),
    0
  );
  const textEnd = textClips.reduce(
    (max, clip) => Math.max(max, resolveClipEndSec(clip)),
    0
  );
  const safeDurationSec = Math.max(0, toFiniteNumber(durationSec, 0));

  return Math.max(2, safeDurationSec, videoEnd, textEnd);
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
  const timelineClipsRef = useRef<VideoEditorTimelineClip[]>([]);
  const textClipsRef = useRef<VideoEditorTextClip[]>([]);

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
  const [activeVideoClipId, setActiveVideoClipId] = useState<string | null>(null);
  const [activeTextClipId, setActiveTextClipId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const sourceClipMap = useMemo(
    () => new Map(sourceClips.map((clip) => [clip.id, clip])),
    [sourceClips]
  );

  const timelineMaxSec = useMemo(
    () => resolveTimelineDuration(durationSec, timelineClips, textClips),
    [durationSec, textClips, timelineClips]
  );
  const safeTimelineMaxSec = useMemo(
    () => Math.max(2, toFiniteNumber(timelineMaxSec, 2)),
    [timelineMaxSec]
  );
  const playheadPercent = useMemo(
    () => toTimelinePercent(playheadSec, safeTimelineMaxSec),
    [playheadSec, safeTimelineMaxSec]
  );

  const activeVideoClip = useMemo(
    () => findActiveTrackClip(timelineClips, playheadSec),
    [playheadSec, timelineClips]
  );
  const selectedVideoClip = useMemo(
    () => timelineClips.find((clip) => clip.id === activeVideoClipId) ?? activeVideoClip ?? null,
    [activeVideoClip, activeVideoClipId, timelineClips]
  );
  const activeSourceClip = useMemo(
    () => (activeVideoClip ? sourceClipMap.get(activeVideoClip.sourceClipId) ?? null : null),
    [activeVideoClip, sourceClipMap]
  );
  const activePreviewUrl = activeSourceClip?.previewImageUrl || activeSourceClip?.imageUrl || null;
  const activeTextOverlays = useMemo(
    () => sortTrackClips(textClips).filter(
      (clip) => {
        const clipStartSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
        const clipEndSec = resolveClipEndSec(clip);
        return playheadSec >= clipStartSec && playheadSec < clipEndSec && clip.text.trim();
      }
    ),
    [playheadSec, textClips]
  );

  const hasReferenceVideo = Boolean(filePath);

  const rulerStepSec = useMemo(() => {
    if (safeTimelineMaxSec <= 12) {
      return 1;
    }
    if (safeTimelineMaxSec <= 40) {
      return 2;
    }
    return 5;
  }, [safeTimelineMaxSec]);

  const rulerMarks = useMemo(() => {
    const marks: number[] = [];
    for (let sec = 0; sec <= safeTimelineMaxSec + 0.0001; sec += rulerStepSec) {
      marks.push(Number(sec.toFixed(3)));
    }
    if (marks.length === 0 || marks[marks.length - 1] < safeTimelineMaxSec) {
      marks.push(safeTimelineMaxSec);
    }
    return marks;
  }, [rulerStepSec, safeTimelineMaxSec]);

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
    setPlayheadSec((previous) => clamp(previous, 0, safeTimelineMaxSec));
  }, [safeTimelineMaxSec]);

  useEffect(() => {
    timelineClipsRef.current = timelineClips;
  }, [timelineClips]);

  useEffect(() => {
    textClipsRef.current = textClips;
  }, [textClips]);

  useEffect(() => {
    if (!activeVideoClipId) {
      return;
    }
    if (!timelineClips.some((clip) => clip.id === activeVideoClipId)) {
      setActiveVideoClipId(null);
    }
  }, [activeVideoClipId, timelineClips]);

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
        setTimelineClips((previous) => {
          const snapAnchors = [
            ...collectTrackEdges(previous, dragState.clipId),
            ...collectTrackEdges(textClipsRef.current),
          ];
          return applyDragToTrack(previous, dragState, deltaSec, snapAnchors, snapEnabled);
        });
      } else {
        setTextClips((previous) => {
          const snapAnchors = [
            ...collectTrackEdges(previous, dragState.clipId),
            ...collectTrackEdges(timelineClipsRef.current),
          ];
          return applyDragToTrack(previous, dragState, deltaSec, snapAnchors, snapEnabled);
        });
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
  }, [dragState, snapEnabled]);

  useEffect(() => {
    if (!isPlaying) {
      stopTicker();
      return;
    }

    stopTicker();
    tickerRef.current = window.setInterval(() => {
      setPlayheadSec((previous) => {
        const next = previous + 0.05;
        if (next >= safeTimelineMaxSec) {
          stopTicker();
          setIsPlaying(false);
          return safeTimelineMaxSec;
        }
        return next;
      });
    }, 50);

    return () => {
      stopTicker();
    };
  }, [isPlaying, safeTimelineMaxSec, stopTicker]);

  const handleTimelineDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const sourceClipId = event.dataTransfer.getData('storybox/source-clip-id');
    if (!sourceClipId || !sourceClipMap.has(sourceClipId)) {
      return;
    }

    const rect = videoTrackRef.current?.getBoundingClientRect();
    const safeTimelineSec = Math.max(2, toFiniteNumber(timelineMaxSec, 2));
    let startSec = timelineClips.length > 0
      ? Math.max(...timelineClips.map((clip) => resolveClipEndSec(clip)))
      : 0;

    if (rect && rect.width > 0) {
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      startSec = ratio * safeTimelineSec;
    }

    setTimelineClips((previous) => {
      const snapAnchors = [
        ...collectTrackEdges(previous),
        ...collectTrackEdges(textClipsRef.current),
      ];
      const snapThresholdSec = resolveSnapThresholdSec(safeTimelineSec);
      const snappedStart = snapEnabled
        ? findClosestAnchor(startSec, snapAnchors, snapThresholdSec)?.anchor ?? startSec
        : startSec;
      const safeStart = findAvailableStartSec(previous, snappedStart, DEFAULT_CLIP_DURATION_SEC);
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
  }, [snapEnabled, sourceClipMap, timelineClips, timelineMaxSec]);

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
    setPlayheadSec(ratio * safeTimelineMaxSec);
  }, [safeTimelineMaxSec]);

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
      timelineMaxSec: safeTimelineMaxSec,
      trackWidth: rect.width,
    });
  }, [safeTimelineMaxSec]);

  const handleRemoveVideoClip = useCallback((clipId: string) => {
    setTimelineClips((previous) => previous.filter((clip) => clip.id !== clipId));
    setActiveVideoClipId((previous) => (previous === clipId ? null : previous));
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

  const handleUpdateVideoClipNote = useCallback((clipId: string, value: string) => {
    setTimelineClips((previous) => previous.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }
      return {
        ...clip,
        note: value,
      };
    }));
  }, []);

  return (
    <div
      className="nodrag nowheel fixed inset-0 z-50 p-3 md:p-5 lg:p-6"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-elevation-3)]">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border-soft)] px-4 py-2">
          <span className="ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
            {t('node.videoEditor.editorTitle', { defaultValue: '视频编辑器' })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-1.5 text-xs text-text-dark hover:bg-[var(--ui-hover-surface)]"
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
              {t('node.videoEditor.generateTextNode', { defaultValue: '生成文本节点' })}
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark"
              aria-label={t('common.close', { defaultValue: '关闭' })}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_clamp(360px,34vw,520px)]">
          <div className="flex min-w-0 flex-1 flex-col border-b border-[var(--ui-border-soft)] p-4 md:p-5 xl:border-b-0 xl:border-r">
            <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-track-bg)]">
              {activePreviewUrl ? (
                <img
                  src={resolveImageDisplayUrl(activePreviewUrl)}
                  alt="timeline-preview"
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : null}

              {!activePreviewUrl ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="ui-timecode rounded-md border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-3 py-1 text-xs text-white/85">
                    {t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                  </div>
                </div>
              ) : null}

              {activeTextOverlays.length > 0 ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 px-6 pb-8 md:px-10">
                  {activeTextOverlays.map((clip) => (
                    <div
                      key={clip.id}
                      className="ui-safe-text ui-clamp-2 max-w-[min(84%,680px)] rounded-md border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-3 py-1 text-center font-medium text-white"
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
                <span className="rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-2 py-1 text-[11px] text-white">
                  {activePreviewUrl
                    ? (activeSourceClip?.label || t('node.videoEditor.previewFrame', { defaultValue: '当前分镜' }))
                    : t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                </span>
                {hasReferenceVideo ? (
                  <span className="rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] px-2 py-1 text-[10px] text-white/80">
                    {t('node.videoEditor.referenceVideoConnected', { defaultValue: '已连接参考视频' })}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-overlay-panel)] p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark"
                    aria-label={isPlaying
                      ? t('node.videoEditor.pause', { defaultValue: '暂停播放' })
                      : t('node.videoEditor.play', { defaultValue: '播放时间线' })}
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
                  <span className="ui-display-title text-[11px] font-medium uppercase tracking-[0.12em] text-sky-300">
                    {t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
                  </span>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors ${
                      snapEnabled
                        ? 'border-sky-300/55 bg-sky-400/18 text-sky-100'
                        : 'border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)]'
                    }`}
                    onClick={() => setSnapEnabled((previous) => !previous)}
                  >
                    <Magnet className="h-3 w-3" />
                    {snapEnabled
                      ? t('node.videoEditor.snapOn', { defaultValue: '吸附：开' })
                      : t('node.videoEditor.snapOff', { defaultValue: '吸附：关' })}
                  </button>
                </div>
                <span className="ui-timecode text-[11px] text-text-dark">{formatSeconds(playheadSec)} / {formatSeconds(safeTimelineMaxSec)}</span>
              </div>

              <div
                ref={timelineTrackRef}
                className="relative overflow-hidden rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-track-bg)]"
                onMouseDown={handleTrackMouseDown}
              >
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,var(--ui-track-grid)_0,var(--ui-track-grid)_1px,transparent_1px,transparent_56px)] opacity-35" />

                <div className="relative h-7 border-b border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)]">
                  {rulerMarks.map((sec) => {
                    const left = toTimelinePercent(sec, safeTimelineMaxSec);
                    return (
                      <div
                        key={sec}
                        className="pointer-events-none absolute bottom-0 top-0"
                        style={{ left: `${left}%` }}
                      >
                        <div className="h-2 w-px bg-[var(--ui-track-mark)]" />
                        <span className="ui-timecode absolute top-2 -translate-x-1/2 text-[10px] text-[rgba(var(--text-rgb),0.76)]">
                          {formatSeconds(sec)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="relative h-[120px]">
                  {rulerMarks.map((sec) => {
                    const left = toTimelinePercent(sec, safeTimelineMaxSec);
                    return (
                      <div
                        key={`grid-${sec}`}
                        className="pointer-events-none absolute bottom-0 top-0 w-px bg-[var(--ui-track-grid)]"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}

                  <div
                    ref={videoTrackRef}
                    className="nodrag nowheel absolute left-0 right-0 top-0 h-[60px] border-b border-[var(--ui-border-soft)] bg-[linear-gradient(180deg,rgba(56,189,248,0.12),rgba(var(--surface-rgb),0.14))]"
                    onDragOver={handleTimelineDragOver}
                    onDrop={handleTimelineDrop}
                  >
                    <div className="ui-timecode absolute left-2 top-1 rounded border border-cyan-300/30 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-cyan-100/90">
                      {t('node.videoEditor.videoTrack', { defaultValue: '视频轨' })}
                    </div>

                    {timelineClips.map((clip) => {
                      const source = sourceClipMap.get(clip.sourceClipId);
                      const left = `${toTimelinePercent(clip.startSec, safeTimelineMaxSec)}%`;
                      const width = `${Math.max(3, toTimelinePercent(clip.durationSec, safeTimelineMaxSec))}%`;
                      const isSelected = activeVideoClipId === clip.id;
                      const isPlayheadActive = activeVideoClip?.id === clip.id;
                      return (
                        <div
                          key={clip.id}
                          className={`absolute bottom-2 top-6 rounded-md border border-cyan-300/60 bg-gradient-to-r from-cyan-500/45 to-sky-500/45 shadow-[0_8px_18px_rgba(6,182,212,0.22)] ${
                            isSelected ? 'ring-2 ring-cyan-100/90' : isPlayheadActive ? 'ring-1 ring-cyan-200/80' : ''
                          }`}
                          style={{ left, width }}
                          onMouseDown={(event) => {
                            setActiveVideoClipId(clip.id);
                            handleClipMouseDown(event, clip, 'move', 'video');
                          }}
                        >
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] text-white hover:bg-red-500"
                            aria-label={t('common.delete', { defaultValue: '删除' })}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveVideoClip(clip.id);
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                          <div
                            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                            onMouseDown={(event) => {
                              setActiveVideoClipId(clip.id);
                              handleClipMouseDown(event, clip, 'resize-left', 'video');
                            }}
                          />
                          <div className="mx-2 mt-1 truncate text-[10px] font-medium text-white">{source?.label ?? 'Clip'}</div>
                          <div className="ui-timecode mx-2 truncate text-[10px] text-white/90">
                            {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                          </div>
                          <div
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                            onMouseDown={(event) => {
                              setActiveVideoClipId(clip.id);
                              handleClipMouseDown(event, clip, 'resize-right', 'video');
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="absolute left-0 right-0 top-[60px] h-[60px] bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(var(--surface-rgb),0.14))]">
                    <div className="ui-timecode absolute left-2 top-1 rounded border border-amber-300/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-amber-100/90">
                      {t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}
                    </div>

                    {textClips.map((clip) => {
                      const left = `${toTimelinePercent(clip.startSec, safeTimelineMaxSec)}%`;
                      const width = `${Math.max(3, toTimelinePercent(clip.durationSec, safeTimelineMaxSec))}%`;
                      const isActive = activeTextClipId === clip.id;
                      return (
                        <div
                          key={clip.id}
                          className={`absolute bottom-2 top-6 rounded-md border border-amber-300/60 bg-gradient-to-r from-amber-500/50 to-orange-500/45 shadow-[0_8px_16px_rgba(251,146,60,0.2)] ${
                            isActive ? 'ring-1 ring-amber-100/85' : ''
                          }`}
                          style={{ left, width }}
                          onMouseDown={(event) => {
                            setActiveTextClipId(clip.id);
                            handleClipMouseDown(event, clip, 'move', 'text');
                          }}
                        >
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] text-white hover:bg-red-500"
                            aria-label={t('common.delete', { defaultValue: '删除' })}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveTextClip(clip.id);
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                          <div
                            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                            onMouseDown={(event) => {
                              setActiveTextClipId(clip.id);
                              handleClipMouseDown(event, clip, 'resize-left', 'text');
                            }}
                          />
                          <div className="mx-2 mt-1 truncate text-[10px] font-medium text-white">{clip.text || 'Text'}</div>
                          <div className="ui-timecode mx-2 truncate text-[10px] text-white/90">
                            {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                          </div>
                          <div
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
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
                    className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-accent/95 shadow-[0_0_8px_rgba(249,115,22,0.9)]"
                    style={{ left: `${playheadPercent}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-1.5 py-0.5 ui-timecode text-[10px] text-white">
                      {formatSeconds(playheadSec)}
                    </div>
                    <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border border-[var(--ui-overlay-inverse-border)] bg-accent" />
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <input
                  type="range"
                  min={0}
                  max={safeTimelineMaxSec}
                  step={0.1}
                  value={clamp(playheadSec, 0, safeTimelineMaxSec)}
                  onChange={(event) => setPlayheadSec(Number(event.target.value))}
                  aria-label={t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--ui-track-bg)] accent-[rgb(var(--accent-rgb))]"
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 p-4 md:p-5">
            <div className="grid min-h-0 flex-1 gap-4 2xl:grid-cols-2">
              <div className="flex min-h-0 min-w-0 flex-col">
              <div className="mb-2 ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
                {t('node.videoEditor.sourceClips', { defaultValue: '分镜栏' })}
              </div>
              <div className="ui-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3 pr-2">
                {sourceClips.length === 0 ? (
                  <div className="rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-4 text-xs text-text-muted">
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
                        className="nodrag nowheel cursor-grab rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] p-2 transition-colors hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-hover-surface)] active:cursor-grabbing"
                      >
                        {previewUrl ? (
                          <img
                            src={resolveImageDisplayUrl(previewUrl)}
                            alt={clip.label}
                            className="mb-1.5 h-20 w-full rounded-lg object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="mb-1.5 flex h-20 items-center justify-center rounded bg-[var(--ui-hover-surface)] text-xs text-text-muted">
                            {clip.label}
                          </div>
                        )}
                        <div className="truncate text-xs font-medium text-text-dark">{clip.label}</div>
                        <div className="ui-timecode mt-1 text-[10px] text-text-muted">{formatSeconds(DEFAULT_CLIP_DURATION_SEC)} default</div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-3 rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                <div className="text-[11px] text-text-muted">
                  {t('node.videoEditor.currentRange', { defaultValue: '当前时间线范围' })}
                </div>
                <div className="ui-timecode mt-1 text-xs font-medium text-text-dark">
                  {selectedVideoClip
                    ? `${formatSeconds(selectedVideoClip.startSec)}-${formatSeconds(selectedVideoClip.startSec + selectedVideoClip.durationSec)}`
                    : `${formatSeconds(playheadSec)}-${formatSeconds(playheadSec)}`}
                </div>
                <div className="mt-2 text-[11px] text-text-muted">
                  {t('node.videoEditor.clipNote', { defaultValue: '分镜备注' })}
                </div>
                <textarea
                  value={selectedVideoClip?.note ?? ''}
                  disabled={!selectedVideoClip}
                  onChange={(event) => {
                    if (!selectedVideoClip) {
                      return;
                    }
                    handleUpdateVideoClipNote(selectedVideoClip.id, event.target.value);
                  }}
                  placeholder={selectedVideoClip
                    ? t('node.videoEditor.notePlaceholder', { defaultValue: '填写该时间段分镜备注' })
                    : t('node.videoEditor.noSelectedClipForNote', { defaultValue: '请先在时间轴选择一个分镜片段' })}
                  className="mt-1 h-20 w-full resize-none rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1 text-xs text-text-dark outline-none disabled:opacity-60"
                />
              </div>
            </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="mb-2 ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
                {t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}
              </div>
              <div className="flex min-h-0 flex-1 flex-col rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1">
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
                    className="rounded-md border border-amber-300/55 bg-amber-500/86 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
                    onClick={handleAddTextClip}
                  >
                    {t('node.videoEditor.addTextClip', { defaultValue: '添加' })}
                  </button>
                </div>

                <div className="ui-scrollbar mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
                  {textClips.length === 0 ? (
                    <div className="rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-2 text-xs text-text-muted">
                      {t('node.videoEditor.noTextClips', { defaultValue: '暂无文字片段' })}
                    </div>
                  ) : (
                    sortTrackClips(textClips).map((clip) => (
                      <div
                        key={clip.id}
                        className={`rounded-lg border p-2 ${
                          activeTextClipId === clip.id
                            ? 'border-amber-300/70 bg-amber-500/16'
                            : 'border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)]'
                        }`}
                        onMouseDown={() => setActiveTextClipId(clip.id)}
                      >
                        <input
                          type="text"
                          value={clip.text}
                          onChange={(event) => handleUpdateTextClip(clip.id, event.target.value)}
                          onFocus={() => setActiveTextClipId(clip.id)}
                          className="w-full rounded border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 text-xs text-text-dark outline-none"
                        />
                        <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
                          <span className="ui-timecode">
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
      </div>
    </div>
  );
});

VideoEditorModal.displayName = 'VideoEditorModal';

