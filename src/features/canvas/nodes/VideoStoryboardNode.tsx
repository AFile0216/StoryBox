import { memo, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, ImagePlus, LoaderCircle, Scissors, Trash2, Video } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type VideoStoryboardNodeData,
  type VideoStoryboardSegment,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoStoryboardNodeProps = NodeProps & {
  id: string;
  data: VideoStoryboardNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 420;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createSegmentId(): string {
  return `story-segment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortSegments(segments: VideoStoryboardSegment[]): VideoStoryboardSegment[] {
  return [...segments]
    .sort((left, right) => {
      if (left.startSec !== right.startSec) {
        return left.startSec - right.startSec;
      }
      return left.order - right.order;
    })
    .map((segment, index) => ({
      ...segment,
      order: index,
    }));
}

export const VideoStoryboardNode = memo(({
  id,
  data,
  selected,
  width,
  height,
}: VideoStoryboardNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playheadSec, setPlayheadSec] = useState(data.currentTimeSec ?? 0);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'running'>('idle');
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.videoStoryboard, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const durationSec = Number.isFinite(data.durationSec) ? Math.max(0, data.durationSec ?? 0) : 0;
  const safeRangeMax = Math.max(durationSec || 0, data.selectionEndSec || 0, 1);
  const videoSrc = useMemo(
    () => (data.filePath ? resolveLocalAssetUrl(data.filePath) : null),
    [data.filePath]
  );
  const activeSegment = data.activeSegmentId
    ? data.segments.find((segment) => segment.id === data.activeSegmentId) ?? null
    : null;

  const patchSelection = (nextStartSec: number, nextEndSec: number) => {
    const clampedStart = clamp(nextStartSec, 0, safeRangeMax);
    const clampedEnd = clamp(Math.max(nextEndSec, clampedStart + 0.1), 0.1, safeRangeMax);
    updateNodeData(id, {
      selectionStartSec: Math.min(clampedStart, clampedEnd - 0.1),
      selectionEndSec: clampedEnd,
    });
  };

  const handlePickVideo = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'],
        },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    updateNodeData(id, {
      filePath: normalizedPath,
      sourceFileName: fileName,
      currentTimeSec: 0,
      selectionStartSec: 0,
      selectionEndSec: 3,
      activeSegmentId: null,
      draftText: '',
    });
    setPlayheadSec(0);
  };

  const handleSaveSegment = () => {
    const nextStartSec = clamp(data.selectionStartSec, 0, safeRangeMax);
    const nextEndSec = clamp(Math.max(data.selectionEndSec, nextStartSec + 0.1), 0.1, safeRangeMax);
    const nextText = data.draftText.trim();
    const nextSegments = sortSegments(
      activeSegment
        ? data.segments.map((segment) =>
            segment.id === activeSegment.id
              ? {
                  ...segment,
                  startSec: nextStartSec,
                  endSec: nextEndSec,
                  text: nextText,
                  status: 'saved',
                }
              : segment
          )
        : [
            ...data.segments,
            {
              id: createSegmentId(),
              startSec: nextStartSec,
              endSec: nextEndSec,
              text: nextText,
              order: data.segments.length,
              keyframeDataUrl: data.lastCaptureDataUrl ?? null,
              status: 'saved',
            },
          ]
    );
    const resolvedActiveSegment = activeSegment
      ? nextSegments.find((segment) => segment.id === activeSegment.id) ?? nextSegments[0] ?? null
      : nextSegments[nextSegments.length - 1] ?? null;

    updateNodeData(id, {
      segments: nextSegments,
      activeSegmentId: resolvedActiveSegment?.id ?? null,
      lastCaptureDataUrl: null,
    });
  };

  const handleSelectSegment = (segment: VideoStoryboardSegment) => {
    updateNodeData(id, {
      activeSegmentId: segment.id,
      selectionStartSec: segment.startSec,
      selectionEndSec: segment.endSec,
      draftText: segment.text,
      currentTimeSec: segment.startSec,
    });
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startSec;
    }
    setPlayheadSec(segment.startSec);
  };

  const handleDeleteSegment = (segmentId: string) => {
    const nextSegments = sortSegments(data.segments.filter((segment) => segment.id !== segmentId));
    updateNodeData(id, {
      segments: nextSegments,
      activeSegmentId: data.activeSegmentId === segmentId ? null : data.activeSegmentId,
      draftText: data.activeSegmentId === segmentId ? '' : data.draftText,
    });
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current) {
      return;
    }
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    setCaptureStatus('running');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const keyframeDataUrl = canvas.toDataURL('image/png');
      if (activeSegment) {
        updateNodeData(id, {
          segments: data.segments.map((segment) =>
            segment.id === activeSegment.id ? { ...segment, keyframeDataUrl } : segment
          ),
          lastCaptureDataUrl: keyframeDataUrl,
        });
      } else {
        updateNodeData(id, { lastCaptureDataUrl: keyframeDataUrl });
      }
    } finally {
      setCaptureStatus('idle');
    }
  };

  return (
    <div
      className={`
        group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border bg-surface-dark/90 p-2 transition-colors duration-150
        ${selected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
          : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'}
      `}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Clapperboard className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {t('node.videoStoryboard.title')}
        </div>
        <button
          type="button"
          className="rounded-md border border-[rgba(255,255,255,0.12)] bg-bg-dark/60 px-2 py-1 text-xs text-text-dark transition-colors hover:border-[rgba(255,255,255,0.22)]"
          onClick={(event) => {
            event.stopPropagation();
            void handlePickVideo();
          }}
        >
          {data.filePath ? t('node.media.changeFile') : t('node.media.selectFile')}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative min-h-[180px] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/50">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="h-full w-full object-contain"
                onLoadedMetadata={(event) => {
                  const nextDurationSec = Number.isFinite(event.currentTarget.duration)
                    ? event.currentTarget.duration
                    : null;
                  updateNodeData(id, {
                    durationSec: nextDurationSec,
                    selectionEndSec:
                      nextDurationSec && nextDurationSec < data.selectionEndSec
                        ? nextDurationSec
                        : data.selectionEndSec,
                  });
                  event.currentTarget.currentTime = data.currentTimeSec ?? 0;
                }}
                onTimeUpdate={(event) => {
                  setPlayheadSec(event.currentTarget.currentTime);
                }}
                onPause={(event) => {
                  updateNodeData(id, { currentTimeSec: event.currentTarget.currentTime });
                }}
              />
            ) : (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-text-muted">
                <Video className="h-8 w-8 opacity-60" />
                <span className="px-4 text-center text-sm">{t('node.videoStoryboard.empty')}</span>
              </div>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.currentTime')}
              </div>
              <div className="mt-1 text-sm text-text-dark">{formatSeconds(playheadSec)}</div>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.rangeStart')}
              </div>
              <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.selectionStartSec)}</div>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.rangeEnd')}
              </div>
              <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.selectionEndSec)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.timeline')}
              </div>
              <div className="text-xs text-text-muted">
                {t('node.videoStoryboard.duration')}: {formatSeconds(data.durationSec)}
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="range"
                min={0}
                max={safeRangeMax}
                step={0.1}
                value={clamp(data.selectionStartSec, 0, safeRangeMax)}
                onChange={(event) => {
                  patchSelection(Number(event.target.value), data.selectionEndSec);
                }}
              />
              <input
                type="range"
                min={0}
                max={safeRangeMax}
                step={0.1}
                value={clamp(data.selectionEndSec, 0.1, safeRangeMax)}
                onChange={(event) => {
                  patchSelection(data.selectionStartSec, Number(event.target.value));
                }}
              />

              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                <input
                  type="number"
                  min={0}
                  max={safeRangeMax}
                  step={0.1}
                  value={Number(data.selectionStartSec.toFixed(1))}
                  onChange={(event) => patchSelection(Number(event.target.value), data.selectionEndSec)}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark outline-none"
                />
                <input
                  type="number"
                  min={0}
                  max={safeRangeMax}
                  step={0.1}
                  value={Number(data.selectionEndSec.toFixed(1))}
                  onChange={(event) => patchSelection(data.selectionStartSec, Number(event.target.value))}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark outline-none"
                />
                <button
                  type="button"
                  className="rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark"
                  onClick={(event) => {
                    event.stopPropagation();
                    patchSelection(playheadSec, data.selectionEndSec);
                  }}
                >
                  {t('node.videoStoryboard.useCurrentForStart')}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark"
                  onClick={(event) => {
                    event.stopPropagation();
                    patchSelection(data.selectionStartSec, playheadSec);
                  }}
                >
                  {t('node.videoStoryboard.useCurrentForEnd')}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoStoryboard.segmentText')}
            </div>
            <textarea
              value={data.draftText}
              onChange={(event) => updateNodeData(id, { draftText: event.target.value })}
              placeholder={t('node.videoStoryboard.segmentPlaceholder')}
              className="nodrag nowheel min-h-[110px] w-full resize-none rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 px-3 py-2 text-sm text-text-dark outline-none placeholder:text-text-muted/70"
            />
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_1fr]">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark"
                onClick={(event) => {
                  event.stopPropagation();
                  handleSaveSegment();
                }}
              >
                <Scissors className="h-4 w-4" />
                {activeSegment
                  ? t('node.videoStoryboard.updateSegment')
                  : t('node.videoStoryboard.addSegment')}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCaptureFrame();
                }}
              >
                {captureStatus === 'running' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {t('node.videoStoryboard.captureFrame')}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark"
                onClick={(event) => {
                  event.stopPropagation();
                  updateNodeData(id, {
                    activeSegmentId: null,
                    draftText: '',
                    lastCaptureDataUrl: null,
                  });
                }}
              >
                {t('node.videoStoryboard.clearDraft')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoStoryboard.latestCapture')}
            </div>
            {data.lastCaptureDataUrl ? (
              <img
                src={data.lastCaptureDataUrl}
                alt={t('node.videoStoryboard.captureAlt')}
                className="h-[140px] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-[rgba(255,255,255,0.12)] text-sm text-text-muted">
                {t('node.videoStoryboard.noCapture')}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.segmentList')}
              </div>
              <div className="text-xs text-text-muted">
                {t('node.videoStoryboard.segmentCount', { count: data.segments.length })}
              </div>
            </div>

            <div className="ui-scrollbar flex max-h-full flex-col gap-2 overflow-y-auto pr-1">
              {data.segments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.12)] px-3 py-4 text-sm text-text-muted">
                  {t('node.videoStoryboard.noSegments')}
                </div>
              ) : (
                data.segments
                  .slice()
                  .sort((left, right) => left.order - right.order)
                  .map((segment) => {
                    const isActive = segment.id === data.activeSegmentId;
                    return (
                      <div
                        key={segment.id}
                        className={`rounded-lg border px-3 py-2 transition-colors ${
                          isActive
                            ? 'border-accent/50 bg-accent/12'
                            : 'border-[rgba(255,255,255,0.08)] bg-bg-dark/35'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectSegment(segment);
                            }}
                          >
                            <div className="text-xs uppercase tracking-[0.12em] text-text-muted">
                              {formatSeconds(segment.startSec)} - {formatSeconds(segment.endSec)}
                            </div>
                            <div className="mt-1 line-clamp-3 text-sm text-text-dark">
                              {segment.text || t('node.videoStoryboard.emptySegmentText')}
                            </div>
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-white/5 hover:text-text-dark"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteSegment(segment.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {segment.keyframeDataUrl ? (
                          <img
                            src={segment.keyframeDataUrl}
                            alt={t('node.videoStoryboard.captureAlt')}
                            className="mt-2 h-20 w-full rounded-md object-cover"
                          />
                        ) : null}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
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

VideoStoryboardNode.displayName = 'VideoStoryboardNode';
