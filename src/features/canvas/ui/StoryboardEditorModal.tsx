import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { X, Scissors, ImagePlus, Trash2, Plus, LoaderCircle, Play, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { VideoStoryboardSegment } from '@/features/canvas/domain/canvasNodes';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';

interface StoryboardEditorModalProps {
  nodeId: string;
  filePath: string | null;
  durationSec: number;
  segments: VideoStoryboardSegment[];
  onSave: (segments: VideoStoryboardSegment[]) => void;
  onClose: () => void;
}

function formatSec(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function createId() {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const StoryboardEditorModal = memo(({
  filePath,
  durationSec,
  segments: initialSegments,
  onSave,
  onClose,
}: StoryboardEditorModalProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [segments, setSegments] = useState<VideoStoryboardSegment[]>(() =>
    [...initialSegments].sort((a, b) => a.order - b.order)
  );
  const [activeId, setActiveId] = useState<string | null>(
    initialSegments.length > 0 ? initialSegments[0].id : null
  );
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(Math.min(5, durationSec || 5));
  const [playhead, setPlayhead] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const FRAME = 1 / 30;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const video = videoRef.current;
      if (!video) return;
      if (e.key === 'i') { setInPoint(video.currentTime); return; }
      if (e.key === 'o') { setOutPoint(video.currentTime); return; }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - FRAME);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + FRAME);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const videoSrc = filePath ? resolveLocalAssetUrl(filePath) : null;
  const safeMax = Math.max(durationSec || 0, outPoint, 1);
  const activeSegment = segments.find((s) => s.id === activeId) ?? null;

    // Auto-sync changes to parent so it flows to the storyboard gen node immediately
  useEffect(() => {
    onSave(segments.map((s, i) => ({ ...s, order: i, status: 'saved' as const })));
  }, [segments, onSave]);

  const patchActive = useCallback((patch: Partial<VideoStoryboardSegment>) => {
    if (!activeId) return;
    setSegments((prev) => prev.map((s) => {
      if (s.id !== activeId) return s;
      const next = { ...s, ...patch };
      const parts = [];
      if (next.visualDesc) parts.push('画面: ' + next.visualDesc);
      if (next.dialogue) parts.push('对白: ' + next.dialogue);
      if (next.notes) parts.push('备注: ' + next.notes);
      next.text = parts.join('
');
      return next;
    }));
  }, [activeId]);

  const handleSelectSegment = (seg: VideoStoryboardSegment) => {
    setActiveId(seg.id);
    setInPoint(seg.startSec);
    setOutPoint(seg.endSec);
    if (videoRef.current) videoRef.current.currentTime = seg.startSec;
    setPlayhead(seg.startSec);
  };

  const handleAddSegment = () => {
    const newSeg: VideoStoryboardSegment = {
      id: createId(),
      startSec: inPoint,
      endSec: outPoint,
      text: '',
      visualDesc: '',
      dialogue: '',
      notes: '',
      tags: [],
      order: segments.length,
      keyframeDataUrl: null,
      status: 'draft',
    };
    setSegments((prev) => [...prev, newSeg]);
    setActiveId(newSeg.id);
  };

  const handleUpdateRange = () => {
    if (!activeId) return;
    setSegments((prev) => prev.map((s) =>
      s.id === activeId ? { ...s, startSec: inPoint, endSec: outPoint } : s
    ));
  };

  const handleDeleteSegment = (id: string) => {
    setSegments((prev) => {
      const next = prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current || !activeId) return;
    const video = videoRef.current;
    if (!video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      patchActive({ keyframeDataUrl: dataUrl });
    } finally {
      setCapturing(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || !activeSegment) return;
    if (!(activeSegment.tags ?? []).includes(tag)) {
      patchActive({ tags: [...(activeSegment.tags ?? []), tag] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    patchActive({ tags: (activeSegment?.tags ?? []).filter((t) => t !== tag) });
  };

  const handleSave = () => {
    onSave(segments.map((s, i) => ({ ...s, order: i, status: 'saved' as const })));
    onClose();
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play();
      else videoRef.current.pause();
    }
  };

  // Timeline segment markers
  const timelineMarkers = segments.map((s) => ({
    id: s.id,
    left: `${(s.startSec / safeMax) * 100}%`,
    width: `${Math.max(0.5, ((s.endSec - s.startSec) / safeMax) * 100)}%`,
    active: s.id === activeId,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg-dark"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
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
            {t('common.save', { defaultValue: '保存至节点' })}
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

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-0">
        {/* Left: Video + Timeline (60%) */}
        <div className="flex w-[60%] min-w-0 flex-col gap-3 border-r border-[rgba(255,255,255,0.08)] p-4">
          {/* Video player */}
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                className="h-full w-full object-contain cursor-pointer"
                onClick={togglePlay}
                onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted text-sm">
                {t('node.videoStoryboard.empty')}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="shrink-0 rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  className="text-text-muted hover:text-white"
                  onClick={togglePlay}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <span>{t('node.videoStoryboard.timeline')}</span>
              </div>
              <span>{formatSec(playhead)} / {formatSec(durationSec)}</span>
            </div>

            {/* Segment markers bar */}
            <div className="relative mb-3 h-6 overflow-hidden rounded-md bg-white/5">
              {timelineMarkers.map((m) => (
                <div
                  key={m.id}
                  className={`absolute top-0 h-full rounded-sm transition-colors ${m.active ? 'bg-accent/70' : 'bg-accent/30'}`}
                  style={{ left: m.left, width: m.width }}
                />
              ))}
              {/* Playhead */}
              <div
                className="absolute top-0 h-full w-0.5 bg-white/80 pointer-events-none"
                style={{ left: `${(playhead / safeMax) * 100}%` }}
              />
            </div>

            {/* In/Out sliders */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-text-muted">IN</span>
                <input
                  type="range" min={0} max={safeMax} step={0.1}
                  value={clamp(inPoint, 0, safeMax)}
                  onChange={(e) => {
                    setInPoint(Number(e.target.value));
                    if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                  }}
                  onMouseDown={() => videoRef.current?.pause()}
                  className="flex-1"
                />
                <input
                  type="number" min={0} max={safeMax} step={0.1}
                  value={Number(inPoint.toFixed(1))}
                  onChange={(e) => setInPoint(Number(e.target.value))}
                  className="w-20 rounded border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-2 py-1 text-xs text-text-dark outline-none"
                />
                <button
                  type="button"
                  className="rounded border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-text-muted hover:text-text-dark"
                  onClick={() => setInPoint(playhead)}
                >
                  {t('node.videoStoryboard.useCurrentForStart', { defaultValue: '用当前' })}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-text-muted">OUT</span>
                <input
                  type="range" min={0} max={safeMax} step={0.1}
                  value={clamp(outPoint, 0, safeMax)}
                  onChange={(e) => {
                    setOutPoint(Number(e.target.value));
                    if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
                  }}
                  onMouseDown={() => videoRef.current?.pause()}
                  className="flex-1"
                />
                <input
                  type="number" min={0} max={safeMax} step={0.1}
                  value={Number(outPoint.toFixed(1))}
                  onChange={(e) => setOutPoint(Number(e.target.value))}
                  className="w-20 rounded border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-2 py-1 text-xs text-text-dark outline-none"
                />
                <button
                  type="button"
                  className="rounded border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-text-muted hover:text-text-dark"
                  onClick={() => setOutPoint(playhead)}
                >
                  {t('node.videoStoryboard.useCurrentForEnd', { defaultValue: '用当前' })}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-xs text-text-dark hover:bg-white/5"
                onClick={handleAddSegment}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('node.videoStoryboard.addSegment', { defaultValue: '新建分镜' })}
              </button>
              {activeId && (
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
                    {t('node.videoStoryboard.captureFrame', { defaultValue: '截取帧' })}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Storyboard list (40%) */}
        <div className="flex w-[40%] min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoStoryboard.segmentList')} ({segments.length})
            </span>
          </div>

          <div className="flex min-h-0 flex-1 gap-0">
            {/* Shot list */}
            <div className="ui-scrollbar w-[200px] shrink-0 overflow-y-auto border-r border-[rgba(255,255,255,0.08)] p-2">
              {segments.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-text-muted">
                  {t('node.videoStoryboard.noSegments')}
                </div>
              ) : (
                segments.map((seg, idx) => {
                  const isActive = seg.id === activeId;
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      className={`mb-2 w-full rounded-lg border p-2 text-left transition-colors ${
                        isActive
                          ? 'border-accent/50 bg-accent/12'
                          : 'border-[rgba(255,255,255,0.08)] bg-bg-dark/35 hover:border-[rgba(255,255,255,0.18)]'
                      }`}
                      onClick={() => handleSelectSegment(seg)}
                    >
                      {seg.keyframeDataUrl ? (
                        <img
                          src={seg.keyframeDataUrl}
                          alt=""
                          className="mb-1.5 h-16 w-full rounded object-cover"
                        />
                      ) : (
                        <div className="mb-1.5 flex h-16 items-center justify-center rounded bg-white/5 text-xs text-text-muted">
                          #{idx + 1}
                        </div>
                      )}
                      <div className="text-[10px] text-text-muted">
                        {formatSec(seg.startSec)} – {formatSec(seg.endSec)}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-text-dark">
                        {seg.visualDesc || seg.text || t('node.videoStoryboard.emptySegmentText')}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Script editor */}
            <div className="ui-scrollbar min-w-0 flex-1 overflow-y-auto p-4">
              {activeSegment ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-dark">
                      {formatSec(activeSegment.startSec)} – {formatSec(activeSegment.endSec)}
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
                    label={t('node.videoStoryboard.visualDesc', { defaultValue: '画面描述' })}
                    value={activeSegment.visualDesc ?? ''}
                    onChange={(v) => patchActive({ visualDesc: v })}
                    placeholder={t('node.videoStoryboard.visualDescPlaceholder', { defaultValue: '景别、运镜、画面内容…' })}
                  />
                  <ScriptField
                    label={t('node.videoStoryboard.dialogue', { defaultValue: '对白/旁白' })}
                    value={activeSegment.dialogue ?? ''}
                    onChange={(v) => patchActive({ dialogue: v })}
                    placeholder={t('node.videoStoryboard.dialoguePlaceholder', { defaultValue: '台词或旁白文字…' })}
                  />
                  <ScriptField
                    label={t('node.videoStoryboard.notes', { defaultValue: '备注' })}
                    value={activeSegment.notes ?? ''}
                    onChange={(v) => patchActive({ notes: v })}
                    placeholder={t('node.videoStoryboard.notesPlaceholder', { defaultValue: '拍摄要求、道具、情绪…' })}
                  />

                  {/* Tags */}
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
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
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
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark outline-none placeholder:text-text-muted/60 focus:border-[rgba(255,255,255,0.2)]"
      />
    </div>
  );
}
