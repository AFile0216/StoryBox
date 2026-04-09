import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { ImagePlus, LoaderCircle, Pause, Play, Plus, Scissors, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { VideoStoryboardSegment } from '@/features/canvas/domain/canvasNodes';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';

interface StoryboardEditorModalProps {
  nodeId: string;
  filePath: string | null;
  durationSec: number;
  segments: VideoStoryboardSegment[];
  onSave: (segments: VideoStoryboardSegment[]) => void;
  onClose: () => void;
}

function formatSecondsLabel(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '0.0s';
  }
  return `${Math.max(0, value).toFixed(1)}s`;
}

function formatSegmentRange(startSec: number, endSec: number): string {
  return `${formatSecondsLabel(startSec)}-${formatSecondsLabel(endSec)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function composeSegmentText(segment: Partial<VideoStoryboardSegment>): string {
  return [
    segment.visualDesc ? `画面: ${segment.visualDesc}` : '',
    segment.dialogue ? `对白: ${segment.dialogue}` : '',
    segment.notes ? `备注: ${segment.notes}` : '',
    segment.keyframeReference ? `关键帧提取: ${segment.keyframeReference}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractKeyframeReference(canvas: HTMLCanvasElement, timeSec: number): string {
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = 48;
  analysisCanvas.height = 48;
  const analysisCtx = analysisCanvas.getContext('2d');
  if (!analysisCtx) {
    return `关键帧 ${formatSecondsLabel(timeSec)}，请补充画面主体与镜头语言。`;
  }

  analysisCtx.drawImage(canvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const imageData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    totalR += imageData[i];
    totalG += imageData[i + 1];
    totalB += imageData[i + 2];
    count += 1;
  }
  if (count === 0) {
    return `关键帧 ${formatSecondsLabel(timeSec)}，请补充画面主体与镜头语言。`;
  }

  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const brightness = (avgR + avgG + avgB) / 3;
  const tone =
    avgR - avgB > 18
      ? '整体偏暖色调'
      : avgB - avgR > 18
        ? '整体偏冷色调'
        : '整体色调较中性';
  const lighting =
    brightness > 175
      ? '画面明亮'
      : brightness < 90
        ? '画面偏暗'
        : '画面对比适中';

  return `时间点 ${formatSecondsLabel(timeSec)}，${tone}，${lighting}。请补充主体动作、景别与镜头运动。`;
}

const SEGMENT_COLORS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#d946ef',
  '#f43f5e',
  '#06b6d4',
  '#14b8a6',
];

export const StoryboardEditorModal = memo(({
  nodeId,
  filePath,
  durationSec,
  segments: initialSegments,
  onSave,
  onClose,
}: StoryboardEditorModalProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const seekingRef = useRef(false);
  const playheadTextRef = useRef<HTMLSpanElement>(null);
  const playheadBadgeRef = useRef<HTMLSpanElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const playheadTickRafRef = useRef<number | null>(null);
  const timelineInputRef = useRef<HTMLInputElement>(null);

  const [segments, setSegments] = useState<VideoStoryboardSegment[]>(
    () => [...initialSegments].sort((a, b) => a.order - b.order)
  );
  const [activeId, setActiveId] = useState<string | null>(
    initialSegments.length > 0 ? initialSegments[0].id : null
  );
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(Math.min(5, durationSec || 5));
  const [capturing, setCapturing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const safeMax = Math.max(durationSec || 0, outPoint, 1);
  const videoSrc = filePath ? resolveLocalAssetUrl(filePath) : null;
  const activeSegment = segments.find((item) => item.id === activeId) ?? null;

  const updatePlayheadUI = useCallback((time: number) => {
    const safeTime = clamp(Number.isFinite(time) ? time : 0, 0, safeMax);
    const playheadPercent = safeMax > 0 ? (safeTime / safeMax) * 100 : 0;
    if (playheadTextRef.current) {
      playheadTextRef.current.textContent = `${formatSecondsLabel(safeTime)} / ${formatSecondsLabel(durationSec)}`;
    }
    if (playheadBadgeRef.current) {
      playheadBadgeRef.current.textContent = formatSecondsLabel(safeTime);
      playheadBadgeRef.current.style.left = `${playheadPercent}%`;
    }
    if (playheadLineRef.current) {
      playheadLineRef.current.style.left = `${playheadPercent}%`;
    }
    if (timelineInputRef.current && timelineInputRef.current.value !== String(safeTime)) {
      timelineInputRef.current.value = String(safeTime);
    }
  }, [durationSec, safeMax]);

  const stopPlayheadTicker = useCallback(() => {
    if (playheadTickRafRef.current !== null) {
      cancelAnimationFrame(playheadTickRafRef.current);
      playheadTickRafRef.current = null;
    }
  }, []);

  const startPlayheadTicker = useCallback(() => {
    stopPlayheadTicker();
    const tick = () => {
      const video = videoRef.current;
      if (!video) {
        playheadTickRafRef.current = null;
        return;
      }
      updatePlayheadUI(video.currentTime);
      if (!video.paused && !video.ended) {
        playheadTickRafRef.current = requestAnimationFrame(tick);
        return;
      }
      playheadTickRafRef.current = null;
    };
    playheadTickRafRef.current = requestAnimationFrame(tick);
  }, [stopPlayheadTicker, updatePlayheadUI]);

  const requestSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    pendingSeekRef.current = clamp(time, 0, safeMax);
    updatePlayheadUI(pendingSeekRef.current);

    const flushSeek = () => {
      const next = pendingSeekRef.current;
      if (!videoRef.current || next === null) {
        return;
      }
      pendingSeekRef.current = null;

      const target = clamp(next, 0, safeMax);
      if (Math.abs(videoRef.current.currentTime - target) < 0.01) {
        if (pendingSeekRef.current !== null) {
          flushSeek();
        }
        return;
      }

      if (seekingRef.current) {
        pendingSeekRef.current = target;
        return;
      }
      seekingRef.current = true;
      if (typeof videoRef.current.fastSeek === 'function') {
        videoRef.current.fastSeek(target);
      } else {
        videoRef.current.currentTime = target;
      }
    };

    if (seekRafRef.current !== null) {
      cancelAnimationFrame(seekRafRef.current);
    }
    seekRafRef.current = requestAnimationFrame(() => {
      seekRafRef.current = null;
      flushSeek();
    });
  }, [safeMax, updatePlayheadUI]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleSeeked = () => {
      seekingRef.current = false;
      if (pendingSeekRef.current !== null) {
        requestSeek(pendingSeekRef.current);
      }
    };

    video.addEventListener('seeked', handleSeeked);
    return () => {
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [requestSeek]);

  useEffect(() => {
    onSave(segments.map((segment, index) => ({ ...segment, order: index, status: 'saved' as const })));
  }, [segments, onSave]);

  useEffect(() => {
    const frameStep = 1 / 30;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') {
        return;
      }
      const video = videoRef.current;
      if (!video) {
        return;
      }
      if (event.key === 'i') {
        setInPoint(video.currentTime);
        return;
      }
      if (event.key === 'o') {
        setOutPoint(video.currentTime);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        requestSeek(video.currentTime - frameStep);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        requestSeek(video.currentTime + frameStep);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [requestSeek]);

  useEffect(() => {
    updatePlayheadUI(videoRef.current?.currentTime ?? 0);
  }, [updatePlayheadUI]);

  useEffect(() => {
    return () => {
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
      }
      stopPlayheadTicker();
    };
  }, [stopPlayheadTicker]);

  const patchActive = useCallback((patch: Partial<VideoStoryboardSegment>) => {
    if (!activeId) {
      return;
    }
    setSegments((previous) =>
      previous.map((segment) => {
        if (segment.id !== activeId) {
          return segment;
        }
        const next = { ...segment, ...patch };
        return {
          ...next,
          text: composeSegmentText(next),
        };
      })
    );
  }, [activeId]);

  const handleSelectSegment = (segment: VideoStoryboardSegment) => {
    setActiveId(segment.id);
    setInPoint(segment.startSec);
    setOutPoint(segment.endSec);
    requestSeek(segment.startSec);
  };

  const handleAddSegment = () => {
    const newSegment: VideoStoryboardSegment = {
      id: createId(),
      startSec: inPoint,
      endSec: outPoint,
      text: '',
      visualDesc: '',
      dialogue: '',
      notes: '',
      tags: [],
      keyframeDataUrl: null,
      keyframeReference: '',
      order: segments.length,
      status: 'draft',
    };
    setSegments((previous) => [...previous, newSegment]);
    setActiveId(newSegment.id);
  };

  const handleDeleteSegment = (segmentId: string) => {
    setSegments((previous) => {
      const next = previous.filter((segment) => segment.id !== segmentId).map((segment, index) => ({
        ...segment,
        order: index,
      }));
      if (activeId === segmentId) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleUpdateRange = () => {
    if (!activeId) {
      return;
    }
    setSegments((previous) =>
      previous.map((segment) => {
        if (segment.id !== activeId) {
          return segment;
        }
        return {
          ...segment,
          startSec: inPoint,
          endSec: outPoint,
        };
      })
    );
  };

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || !activeSegment || !video.videoWidth || !video.videoHeight) {
      return;
    }
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const keyframeDataUrl = canvas.toDataURL('image/jpeg', 0.84);
      const extractedReference = extractKeyframeReference(canvas, video.currentTime);
      patchActive({
        keyframeDataUrl,
        keyframeReference: extractedReference,
        visualDesc: activeSegment.visualDesc?.trim() ? activeSegment.visualDesc : extractedReference,
      });
    } finally {
      setCapturing(false);
    }
  };

  const handleSave = () => {
    onSave(segments.map((segment, index) => ({ ...segment, order: index, status: 'saved' as const })));
    onClose();
  };

  const togglePlay = () => {
    if (!videoRef.current) {
      return;
    }
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const handleAddTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag || !activeSegment) {
      return;
    }
    const currentTags = activeSegment.tags ?? [];
    if (currentTags.includes(nextTag)) {
      setTagInput('');
      return;
    }
    patchActive({ tags: [...currentTags, nextTag] });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    patchActive({
      tags: (activeSegment?.tags ?? []).filter((item) => item !== tag),
    });
  };

  const timelineMarkers = useMemo(() => {
    return segments.map((segment, index) => ({
      id: segment.id,
      left: `${(segment.startSec / safeMax) * 100}%`,
      width: `${Math.max(0.5, ((segment.endSec - segment.startSec) / safeMax) * 100)}%`,
      active: segment.id === activeId,
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    }));
  }, [activeId, safeMax, segments]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-dark" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
        <span className="text-sm font-medium text-text-dark">
          {t('node.videoStoryboard.editorTitle', { defaultValue: '分镜编辑器' })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/80"
            onClick={handleSave}
          >
            {t('common.save', { defaultValue: '保存' })}
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
        <div className="flex w-[60%] min-w-0 flex-col gap-3 border-r border-[rgba(255,255,255,0.08)] p-4">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                preload="auto"
                className="h-full w-full cursor-pointer object-contain"
                onClick={togglePlay}
                onTimeUpdate={(event) => updatePlayheadUI(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) => updatePlayheadUI(event.currentTarget.currentTime)}
                onPlay={() => {
                  setIsPlaying(true);
                  startPlayheadTicker();
                }}
                onPause={(event) => {
                  setIsPlaying(false);
                  stopPlayheadTicker();
                  updatePlayheadUI(event.currentTarget.currentTime);
                }}
                onEnded={(event) => {
                  setIsPlaying(false);
                  stopPlayheadTicker();
                  updatePlayheadUI(event.currentTarget.currentTime);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                {t('node.videoStoryboard.empty', { defaultValue: '请选择视频文件' })}
              </div>
            )}
          </div>

          <div className="shrink-0 rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <button type="button" className="text-text-muted hover:text-white" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <span>{t('node.videoStoryboard.timeline', { defaultValue: '时间轴' })}</span>
              </div>
              <span ref={playheadTextRef}>{formatSecondsLabel(0)} / {formatSecondsLabel(durationSec)}</span>
            </div>

            <div className="relative mb-3 h-6 rounded-md bg-white/5">
              {timelineMarkers.map((marker) => (
                <div
                  key={marker.id}
                  className="pointer-events-none absolute top-0 h-full rounded-sm transition-colors"
                  style={{
                    left: marker.left,
                    width: marker.width,
                    backgroundColor: marker.color,
                    opacity: marker.active ? 1 : 0.4,
                  }}
                />
              ))}
              <div
                ref={playheadLineRef}
                className="pointer-events-none absolute top-0 h-full w-0.5 bg-white/80"
                style={{ left: '0%' }}
              />
              <span
                ref={playheadBadgeRef}
                className="pointer-events-none absolute left-0 top-0 z-10 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] leading-none text-white"
              >
                {formatSecondsLabel(0)}
              </span>
              <input
                ref={timelineInputRef}
                type="range"
                min={0}
                max={safeMax}
                step={0.01}
                defaultValue={0}
                onInput={(event: FormEvent<HTMLInputElement>) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  requestSeek(value);
                }}
                onMouseDown={() => videoRef.current?.pause()}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-7 text-xs text-text-muted">IN</span>
                <input
                  type="range"
                  min={0}
                  max={safeMax}
                  step={0.1}
                  value={clamp(inPoint, 0, safeMax)}
                  onInput={(event: FormEvent<HTMLInputElement>) => {
                    const value = Number((event.target as HTMLInputElement).value);
                    setInPoint(value);
                    requestSeek(value);
                  }}
                  onMouseDown={() => videoRef.current?.pause()}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={safeMax}
                  step={0.1}
                  value={Number(inPoint.toFixed(1))}
                  onChange={(event) => setInPoint(Number(event.target.value))}
                  className="w-20 rounded border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-2 py-1 text-xs text-text-dark outline-none"
                />
                <button
                  type="button"
                  className="rounded border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-text-muted hover:text-text-dark"
                  onClick={() => setInPoint(videoRef.current?.currentTime ?? 0)}
                >
                  {t('node.videoStoryboard.useCurrentForStart', { defaultValue: '用当前' })}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-7 text-xs text-text-muted">OUT</span>
                <input
                  type="range"
                  min={0}
                  max={safeMax}
                  step={0.1}
                  value={clamp(outPoint, 0, safeMax)}
                  onInput={(event: FormEvent<HTMLInputElement>) => {
                    const value = Number((event.target as HTMLInputElement).value);
                    setOutPoint(value);
                    requestSeek(value);
                  }}
                  onMouseDown={() => videoRef.current?.pause()}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={safeMax}
                  step={0.1}
                  value={Number(outPoint.toFixed(1))}
                  onChange={(event) => setOutPoint(Number(event.target.value))}
                  className="w-20 rounded border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-2 py-1 text-xs text-text-dark outline-none"
                />
                <button
                  type="button"
                  className="rounded border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-text-muted hover:text-text-dark"
                  onClick={() => setOutPoint(videoRef.current?.currentTime ?? 0)}
                >
                  {t('node.videoStoryboard.useCurrentForEnd', { defaultValue: '用当前' })}
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-xs text-text-dark hover:bg-white/5"
                onClick={handleAddSegment}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('node.videoStoryboard.addSegment', { defaultValue: '新建分镜' })}
              </button>
              {activeId ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-xs text-text-dark hover:bg-white/5"
                    onClick={handleUpdateRange}
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    {t('node.videoStoryboard.updateSegment', { defaultValue: '更新时间范围' })}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-xs text-text-dark hover:bg-white/5"
                    onClick={() => void handleCaptureFrame()}
                    disabled={capturing}
                  >
                    {capturing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {t('node.videoStoryboard.captureFrame', { defaultValue: '截取关键帧' })}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-[40%] min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoStoryboard.segmentList', { defaultValue: '分镜列表' })} ({segments.length})
            </span>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="ui-scrollbar w-[210px] shrink-0 overflow-y-auto border-r border-[rgba(255,255,255,0.08)] p-2">
              {segments.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-text-muted">
                  {t('node.videoStoryboard.noSegments', { defaultValue: '暂无分镜' })}
                </div>
              ) : (
                segments.map((segment, index) => {
                  const isActive = segment.id === activeId;
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      className={`relative mb-2 w-full overflow-hidden rounded-lg border p-2 text-left transition-colors ${
                        isActive
                          ? 'border-accent/50 bg-accent/12'
                          : 'border-[rgba(255,255,255,0.08)] bg-bg-dark/35 hover:border-[rgba(255,255,255,0.18)]'
                      }`}
                      onClick={() => handleSelectSegment(segment)}
                    >
                      <div
                        className="absolute bottom-0 left-0 top-0 w-1"
                        style={{ backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
                      />
                      {segment.keyframeDataUrl ? (
                        <img src={segment.keyframeDataUrl} alt="" className="mb-1.5 h-16 w-full rounded object-cover" />
                      ) : (
                        <div className="mb-1.5 flex h-16 items-center justify-center rounded bg-white/5 text-xs text-text-muted">
                          #{index + 1}
                        </div>
                      )}
                      <div className="text-[10px] text-text-muted">
                        {formatSegmentRange(segment.startSec, segment.endSec)}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-text-dark">
                        {segment.visualDesc || segment.text || t('node.videoStoryboard.emptySegmentText', { defaultValue: '暂无描述' })}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="ui-scrollbar min-w-0 flex-1 overflow-y-auto p-4">
              {activeSegment ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-dark">
                      {formatSegmentRange(activeSegment.startSec, activeSegment.endSec)}
                      <span className="ml-2 text-text-muted">
                        ({(activeSegment.endSec - activeSegment.startSec).toFixed(1)}s)
                      </span>
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-white/5 hover:text-red-400"
                      onClick={() => handleDeleteSegment(activeSegment.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <ScriptField
                    nodeId={nodeId}
                    label={t('node.videoStoryboard.visualDesc', { defaultValue: '画面描述' })}
                    value={activeSegment.visualDesc ?? ''}
                    onChange={(value) => patchActive({ visualDesc: value })}
                    placeholder={t('node.videoStoryboard.visualDescPlaceholder', { defaultValue: '景别、运镜、画面内容…' })}
                  />
                  <ScriptField
                    nodeId={nodeId}
                    label={t('node.videoStoryboard.dialogue', { defaultValue: '对白/旁白' })}
                    value={activeSegment.dialogue ?? ''}
                    onChange={(value) => patchActive({ dialogue: value })}
                    placeholder={t('node.videoStoryboard.dialoguePlaceholder', { defaultValue: '台词或旁白文字…' })}
                  />
                  <ScriptField
                    nodeId={nodeId}
                    label={t('node.videoStoryboard.notes', { defaultValue: '备注' })}
                    value={activeSegment.notes ?? ''}
                    onChange={(value) => patchActive({ notes: value })}
                    placeholder={t('node.videoStoryboard.notesPlaceholder', { defaultValue: '拍摄要求、道具、情绪…' })}
                  />
                  <ScriptField
                    nodeId={nodeId}
                    label={t('node.videoStoryboard.captureReference', { defaultValue: '关键帧参考提取' })}
                    value={activeSegment.keyframeReference ?? ''}
                    onChange={(value) => patchActive({ keyframeReference: value })}
                    placeholder={t('node.videoStoryboard.captureReferencePlaceholder', { defaultValue: '截图后会自动提取，可手动编辑。' })}
                  />

                  <div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {t('node.videoStoryboard.tags', { defaultValue: '标签' })}
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {(activeSegment.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-text-dark"
                        >
                          {tag}
                          <button
                            type="button"
                            className="text-text-muted hover:text-text-dark"
                            onClick={() => handleRemoveTag(tag)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder={t('node.videoStoryboard.tagPlaceholder', { defaultValue: '输入标签后回车' })}
                        className="flex-1 rounded border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-2 py-1 text-xs text-text-dark outline-none placeholder:text-text-muted/60"
                      />
                      <button
                        type="button"
                        className="rounded border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-text-muted hover:text-text-dark"
                        onClick={handleAddTag}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                  {t('node.videoStoryboard.selectOrAdd', { defaultValue: '选择或新建分镜' })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

StoryboardEditorModal.displayName = 'StoryboardEditorModal';

function ScriptField({
  nodeId,
  label,
  value,
  onChange,
  placeholder,
}: {
  nodeId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
      <ReferenceAwareTextarea
        nodeId={nodeId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeightClassName="min-h-[92px]"
        className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 text-sm"
        referenceMediaTypes={['image']}
      />
    </div>
  );
}
