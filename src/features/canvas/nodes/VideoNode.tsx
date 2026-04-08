import { memo, useMemo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, Film, Image, ImagePlay, LoaderCircle, Music, Upload, Video } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES, type CanvasNodeType, type VideoNodeData, type VideoNodeTaskMode } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoNodeProps = NodeProps & { id: string; data: VideoNodeData; selected?: boolean };

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 380;
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 960;

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) return '--:--';
  const total = Math.max(0, Math.floor(value));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const MAIN_MODES: VideoNodeTaskMode[] = ['image-to-video', 'first-last-frame'];
const MODE_LABELS: Record<VideoNodeTaskMode, string> = {
  reference: '参考视频',
  'image-to-video': '图生视频',
  'first-last-frame': '首尾帧生视频',
  'video-storyboard-generation': '视频分镜生成',
};
const MODE_ICONS: Record<string, typeof Image> = {
  'image-to-video': ImagePlay,
  'first-last-frame': Film,
};

export const VideoNode = memo(({ id, data, selected, width, height }: VideoNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const timerRef = useRef<number | null>(null);

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.video, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = useMemo(() => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight), [resolvedWidth, resolvedHeight]);
  const targetHandleStyle = useMemo(() => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'), [resolvedHeight, resolvedWidth]);
  const sourceHandleStyle = useMemo(() => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'), [resolvedHeight, resolvedWidth]);

  const activeMode: VideoNodeTaskMode = data.taskMode || 'image-to-video';

  const handlePickFile = async (field: string, extensions: string[], namePrefix: string) => {
    const sel = await open({ multiple: false, filters: [{ name: namePrefix, extensions }] });
    if (!sel || Array.isArray(sel)) return;
    const path = (sel as string).trim();
    const fileName = path.split(/[/\\]/u).pop() ?? path;
    if (field === 'filePath') {
      updateNodeData(id, { filePath: path, sourceFileName: fileName, taskStatus: 'idle', taskMessage: null, taskOutputSummary: null });
    }
  };

  const handlePickVideo = () => handlePickFile('filePath', ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'], 'Video');

  const handleRunTask = () => {
    if (!data.filePath) { updateNodeData(id, { taskStatus: 'error', taskMessage: t('node.video.missingVideo', { defaultValue: '请先上传素材' }) }); return; }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    updateNodeData(id, { taskStatus: 'running', taskMessage: t('node.media.processing'), taskOutputSummary: null, lastExecutedAt: Date.now() });
    timerRef.current = window.setTimeout(() => {
      updateNodeData(id, { taskStatus: 'success', taskMessage: t('node.media.ready'), taskOutputSummary: t('node.video.mockResult', { mode: MODE_LABELS[activeMode], duration: formatSeconds(data.durationSec) }) });
      timerRef.current = null;
    }, 900);
  };

  const handleCreateStoryboardNode = () => {
    if (!data.filePath) return;
    const position = findNodePosition(id, 560, 460);
    const nextId = addNode(CANVAS_NODE_TYPES.videoStoryboard as CanvasNodeType, position, {
      filePath: data.filePath,
      sourceFileName: data.sourceFileName ?? null,
      mimeType: data.mimeType ?? null,
      durationSec: data.durationSec ?? null,
      displayName: `${data.sourceFileName ?? resolvedTitle} Storyboard`,
    });
    addEdge(id, nextId);
  };

  const imgSlots = [{ key: 'img1', label: '图1', active: true }];
  const videoSlots = [{ key: 'v1', label: '视频1', active: Boolean(data.filePath) }, { key: 'v2', label: '视频2', active: false }, { key: 'v3', label: '视频3', active: false }];
  const audioSlots = [{ key: 'a1', label: '音频1', active: false }, { key: 'a2', label: '音频2', active: false }, { key: 'a3', label: '音频3', active: false }];

  return (
    <div className={`tapnow-node-card group relative flex h-full flex-col overflow-visible p-2 transition-colors duration-150 ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}`} style={{ width: resolvedWidth, height: resolvedHeight }} onClick={() => setSelectedNode(id)}>
      <NodeHeader className={NODE_HEADER_FLOATING_POSITION_CLASS} icon={<Video className="h-4 w-4" />} titleText={resolvedTitle} editable onTitleChange={(v) => updateNodeData(id, { displayName: v })} />

      <div className="mb-2 mt-7 grid grid-cols-2 gap-2">
        {MAIN_MODES.map((mode) => {
          const Icon = MODE_ICONS[mode] ?? Film;
          const active = activeMode === mode;
          return (
            <button key={mode} type="button" onClick={(e) => { e.stopPropagation(); updateNodeData(id, { taskMode: mode }); }} className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 transition-all ${active ? 'border-accent/50 bg-accent/12 text-accent' : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:border-accent/30 hover:text-text-dark'}`}>
              <Icon className="h-6 w-6" />
              <span className={`text-xs font-medium ${uiDensity.metaText}`}>{MODE_LABELS[mode]}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-2">
        <div className={`mb-1.5 text-[10px] uppercase tracking-[0.12em] text-text-muted ${uiDensity.metaText}`}>素材栏</div>
        <div className="flex flex-wrap gap-1.5">
          {imgSlots.map((s) => (
            <button key={s.key} type="button" onClick={(e) => { e.stopPropagation(); }} className={`flex h-10 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${s.active ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'}`}>
              <Image className="h-3 w-3" />{s.label}
            </button>
          ))}
          {videoSlots.map((s) => (
            <button key={s.key} type="button" onClick={(e) => { e.stopPropagation(); void handlePickVideo(); }} className={`flex h-10 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${s.active ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'}`}>
              <Video className="h-3 w-3" />{s.label}
            </button>
          ))}
          {audioSlots.map((s) => (
            <button key={s.key} type="button" onClick={(e) => e.stopPropagation()} className={`flex h-10 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${s.active ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'}`}>
              <Music className="h-3 w-3" />{s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 mb-2">
        <ReferenceAwareTextarea nodeId={id} value={data.prompt} onChange={(v) => updateNodeData(id, { prompt: v })} placeholder={t('node.video.promptPlaceholder', { defaultValue: '描述你想生成什么样的视频...' })} minHeightClassName="min-h-[80px]" className={`h-full ${uiDensity.panelPadding} ${uiDensity.bodyText}`} />
      </div>

      <div className="flex items-center gap-2">
        <select className={`nodrag nowheel h-8 flex-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`} value={data.taskMode} onChange={(e) => { e.stopPropagation(); updateNodeData(id, { taskMode: e.target.value as VideoNodeTaskMode }); }} onPointerDown={(e) => e.stopPropagation()}>
          <option value="image-to-video">图生视频</option>
          <option value="first-last-frame">首尾帧生视频</option>
          <option value="reference">参考视频</option>
          <option value="video-storyboard-generation">分镜生成</option>
        </select>
        <select className={`nodrag nowheel h-8 w-24 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`} onPointerDown={(e) => e.stopPropagation()}>
          <option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option>
        </select>
        <button type="button" onClick={(e) => { e.stopPropagation(); handleRunTask(); }} className={`flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent/80 ${uiDensity.buttonText}`}>
          {data.taskStatus === 'running' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          生成
        </button>
        {data.filePath && (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleCreateStoryboardNode(); }} className={`flex h-8 items-center gap-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark hover:bg-[var(--ui-surface-panel)] ${uiDensity.metaText}`} title="生成视频分镜节点">
            <Clapperboard className="h-3.5 w-3.5" />分镜
          </button>
        )}
      </div>

      {data.taskMessage && <div className={`mt-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 text-text-muted ${uiDensity.metaText}`}>{data.taskMessage}</div>}

      <Handle type="target" id="target" position={Position.Left} className="!border-surface-dark !bg-accent" style={targetHandleStyle} />
      <Handle type="source" id="source" position={Position.Right} className="!border-surface-dark !bg-accent" style={sourceHandleStyle} />
      <NodeResizeHandle minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} maxWidth={MAX_WIDTH} maxHeight={MAX_HEIGHT} />
    </div>
  );
});

VideoNode.displayName = 'VideoNode';
