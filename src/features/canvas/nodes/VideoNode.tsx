import { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Clapperboard,
  Film,
  Image,
  ImagePlay,
  LoaderCircle,
  Music,
  Upload,
  Video,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type CanvasNodeType,
  type VideoNodeData,
  type VideoNodeTaskMode,
} from '@/features/canvas/domain/canvasNodes';
import { graphImageResolver } from '@/features/canvas/application/canvasServices';
import { filterReferencedVideos } from '@/features/canvas/application/referenceTokenEditing';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';
import { useCanvasStore } from '@/stores/canvasStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';

type VideoNodeProps = NodeProps & { id: string; data: VideoNodeData; selected?: boolean };

const DEFAULT_WIDTH = 540;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 420;
const MIN_HEIGHT = 420;
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 960;

const VIDEO_ASPECT_RATIO_OPTIONS = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '4:5',
  '5:4',
  '16:9',
  '9:16',
  '18:9',
  '9:18',
  '19:9',
  '9:19',
  '20:9',
  '9:20',
  '21:9',
  '9:21',
] as const;

const VIDEO_DURATION_OPTIONS = [2, 4, 5, 6, 7, 8, 10, 12, 15] as const;

const MODE_OPTIONS: VideoNodeTaskMode[] = [
  'reference',
  'image-to-video',
  'first-last-frame',
  'audio-to-video',
  'video-storyboard-generation',
];

const MODE_LABELS: Record<VideoNodeTaskMode, string> = {
  reference: '参考视频',
  'image-to-video': '图生视频',
  'first-last-frame': '首尾帧',
  'audio-to-video': '音频生视频',
  'video-storyboard-generation': '视频分镜',
};

const MODE_ICONS: Record<VideoNodeTaskMode, typeof Image> = {
  reference: Video,
  'image-to-video': ImagePlay,
  'first-last-frame': Film,
  'audio-to-video': Music,
  'video-storyboard-generation': Clapperboard,
};

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const VideoNode = memo(({ id, data, selected, width, height }: VideoNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const customApiInterfaces = useSettingsStore((state) => state.customApiInterfaces);
  const addHistoryRecord = useHistoryStore((state) => state.addRecord);
  const timerRef = useRef<number | null>(null);

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.video, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = useMemo(
    () => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight),
    [resolvedWidth, resolvedHeight]
  );
  const targetHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'),
    [resolvedHeight, resolvedWidth]
  );
  const sourceHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'),
    [resolvedHeight, resolvedWidth]
  );

  const selectedInterface = useMemo(() => {
    const byId = customApiInterfaces.find((item) => item.id === data.interfaceId);
    return byId ?? customApiInterfaces[0] ?? null;
  }, [customApiInterfaces, data.interfaceId]);

  const selectedModel = data.modelId || selectedInterface?.modelIds[0] || '';
  const activeMode: VideoNodeTaskMode = data.taskMode || 'image-to-video';
  const selectedAspectRatio =
    typeof data.aspectRatio === 'string' && data.aspectRatio.trim()
      ? data.aspectRatio
      : '16:9';
  const selectedDuration = Number.isFinite(data.generationSeconds)
    ? Number(data.generationSeconds)
    : 5;

  useEffect(() => {
    if (!data.interfaceId && selectedInterface) {
      updateNodeData(id, { interfaceId: selectedInterface.id });
    }
    if (!selectedModel && selectedInterface?.modelIds[0]) {
      updateNodeData(id, { modelId: selectedInterface.modelIds[0] });
    }
  }, [data.interfaceId, id, selectedInterface, selectedModel, updateNodeData]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handlePickFile = async (
    type: 'video' | 'audio'
  ) => {
    const isVideo = type === 'video';
    const selectedPath = await open({
      multiple: false,
      filters: [
        isVideo
          ? { name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] }
          : { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    if (isVideo) {
      updateNodeData(id, {
        filePath: normalizedPath,
        sourceFileName: fileName,
        taskStatus: 'idle',
        taskMessage: null,
        taskOutputSummary: null,
      });
      return;
    }
    updateNodeData(id, {
      audioFilePath: normalizedPath,
      audioSourceFileName: fileName,
      taskStatus: 'idle',
      taskMessage: null,
      taskOutputSummary: null,
    });
  };

  const handleCreateStoryboardNode = () => {
    if (!data.filePath) {
      return;
    }
    const position = findNodePosition(id, 560, 460);
    const nextId = addNode(CANVAS_NODE_TYPES.videoStoryboard as CanvasNodeType, position, {
      filePath: data.filePath,
      sourceFileName: data.sourceFileName ?? null,
      mimeType: data.mimeType ?? null,
      durationSec: data.durationSec ?? null,
      displayName: `${data.sourceFileName ?? resolvedTitle} Storyboard`,
    });
    addEdge(id, nextId, { relation: 'video-flow' });
  };

  const createPreviewNodeFromPath = (path: string | null, name?: string | null) => {
    if (!path) {
      return null;
    }
    const position = findNodePosition(id, 560, 420);
    const nextId = addNode(CANVAS_NODE_TYPES.videoPreview as CanvasNodeType, position, {
      filePath: path,
      sourceFileName: name ?? path.split(/[/\\]/u).pop() ?? path,
      displayName: `${name ?? resolvedTitle} Preview`,
    });
    addEdge(id, nextId, { relation: 'video-flow', autoGenerated: true });
    return nextId;
  };

  const handleRunTask = () => {
    const incomingVideos = graphImageResolver.collectInputVideos(id, nodes, edges);
    const filteredReferencedVideos = filterReferencedVideos(incomingVideos, data.prompt ?? '');
    const hasVideoSource = Boolean(data.filePath) || filteredReferencedVideos.length > 0;
    const hasAudioSource = Boolean(data.audioFilePath);
    const missingVideo = activeMode !== 'audio-to-video' && !hasVideoSource;
    const missingAudio = activeMode === 'audio-to-video' && !hasAudioSource;

    if (missingVideo || missingAudio) {
      updateNodeData(id, {
        taskStatus: 'error',
        taskMessage: missingAudio
          ? t('node.audio.missingAudio', { defaultValue: '请先上传音频素材' })
          : t('node.video.missingVideo', { defaultValue: '请先上传视频素材' }),
      });
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    updateNodeData(id, {
      taskStatus: 'running',
      taskMessage: t('node.media.processing', { defaultValue: '处理中...' }),
      taskOutputSummary: null,
      lastExecutedAt: Date.now(),
      modelId: selectedModel,
      aspectRatio: selectedAspectRatio,
      generationSeconds: selectedDuration,
    });

    timerRef.current = window.setTimeout(() => {
      const outputPath =
        activeMode === 'audio-to-video'
          ? data.outputFilePath
            || data.filePath
            || filteredReferencedVideos[0]
            || data.audioFilePath
            || null
          : data.outputFilePath
            || data.filePath
            || filteredReferencedVideos[0]
            || null;
      if (!outputPath) {
        updateNodeData(id, {
          taskStatus: 'error',
          taskMessage: t('node.video.missingVideo', { defaultValue: '未找到可预览的视频输出' }),
        });
        timerRef.current = null;
        return;
      }

      updateNodeData(id, {
        taskStatus: 'success',
        taskMessage: t('node.media.ready', { defaultValue: '任务完成' }),
        taskOutputSummary: t('node.video.mockResult', {
          mode: MODE_LABELS[activeMode],
          duration: formatSeconds(data.durationSec),
        }),
        outputFilePath: outputPath,
      });

      createPreviewNodeFromPath(outputPath, data.sourceFileName ?? data.audioSourceFileName);
      addHistoryRecord({
        nodeId: id,
        type: 'video',
        mediaUrl: outputPath,
        prompt: data.prompt ?? '',
        model: selectedModel || 'unknown',
        filePath: outputPath,
      });
      timerRef.current = null;
    }, 900);
  };

  const imageSlots = [{ key: 'img1', label: '图1', active: false }];
  const videoSlots = [{ key: 'v1', label: '视频1', active: Boolean(data.filePath) }];
  const audioSlots = [{ key: 'a1', label: '音频1', active: Boolean(data.audioFilePath) }];

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
        icon={<Video className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(value) => updateNodeData(id, { displayName: value })}
      />

      <div className="mb-2 mt-7 grid grid-cols-2 gap-2">
        {MODE_OPTIONS.map((mode) => {
          const Icon = MODE_ICONS[mode] ?? Film;
          const active = activeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                updateNodeData(id, { taskMode: mode });
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 transition-all ${
                active
                  ? 'border-accent/50 bg-accent/12 text-accent'
                  : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:border-accent/30 hover:text-text-dark'
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className={`text-xs font-medium ${uiDensity.metaText}`}>{MODE_LABELS[mode]}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-2">
        <div className={`mb-1.5 text-[10px] uppercase tracking-[0.12em] text-text-muted ${uiDensity.metaText}`}>素材栏</div>
        <div className="flex flex-wrap gap-1.5">
          {imageSlots.map((slot) => (
            <button
              key={slot.key}
              type="button"
              onClick={(event) => event.stopPropagation()}
              className={`flex h-10 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${
                slot.active
                  ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                  : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'
              }`}
            >
              <Image className="h-3 w-3" />
              {slot.label}
            </button>
          ))}
          {videoSlots.map((slot) => (
            <button
              key={slot.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handlePickFile('video');
              }}
              className={`flex h-10 min-w-[58px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${
                slot.active
                  ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                  : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'
              }`}
            >
              <Video className="h-3 w-3" />
              {slot.label}
            </button>
          ))}
          {audioSlots.map((slot) => (
            <button
              key={slot.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handlePickFile('audio');
              }}
              className={`flex h-10 min-w-[58px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors ${
                slot.active
                  ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                  : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-muted hover:border-accent/30 hover:text-text-dark'
              }`}
            >
              <Music className="h-3 w-3" />
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <select
          className={`nodrag nowheel h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`}
          value={selectedInterface?.id ?? ''}
          onChange={(event) => {
            event.stopPropagation();
            const nextInterface = customApiInterfaces.find((item) => item.id === event.target.value);
            updateNodeData(id, {
              interfaceId: event.target.value,
              modelId: nextInterface?.modelIds[0] ?? '',
            });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {customApiInterfaces.length === 0 && (
            <option value="">未配置接口</option>
          )}
          {customApiInterfaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className={`nodrag nowheel h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`}
          value={selectedModel}
          onChange={(event) => {
            event.stopPropagation();
            updateNodeData(id, { modelId: event.target.value });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {(selectedInterface?.modelIds ?? []).map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2 flex-1">
        <ReferenceAwareTextarea
          nodeId={id}
          value={data.prompt}
          onChange={(value) => updateNodeData(id, { prompt: value })}
          placeholder={t('node.video.promptPlaceholder', { defaultValue: '描述视频生成目标...' })}
          minHeightClassName="min-h-[90px]"
          className={`h-full ${uiDensity.panelPadding} ${uiDensity.bodyText}`}
          referenceMediaTypes={['image', 'video']}
        />
      </div>

      <div className="grid grid-cols-[1fr_112px_112px_auto_auto] items-center gap-2">
        <select
          className={`nodrag nowheel h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`}
          value={activeMode}
          onChange={(event) => {
            event.stopPropagation();
            updateNodeData(id, { taskMode: event.target.value as VideoNodeTaskMode });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <option value="image-to-video">{MODE_LABELS['image-to-video']}</option>
          <option value="first-last-frame">{MODE_LABELS['first-last-frame']}</option>
          <option value="audio-to-video">{MODE_LABELS['audio-to-video']}</option>
          <option value="reference">{MODE_LABELS.reference}</option>
          <option value="video-storyboard-generation">{MODE_LABELS['video-storyboard-generation']}</option>
        </select>
        <select
          className={`nodrag nowheel h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`}
          value={selectedAspectRatio}
          onChange={(event) => {
            event.stopPropagation();
            updateNodeData(id, { aspectRatio: event.target.value });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
        <select
          className={`nodrag nowheel h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark outline-none ${uiDensity.metaText}`}
          value={String(selectedDuration)}
          onChange={(event) => {
            event.stopPropagation();
            updateNodeData(id, { generationSeconds: Number(event.target.value) });
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {VIDEO_DURATION_OPTIONS.map((seconds) => (
            <option key={seconds} value={String(seconds)}>
              {seconds}s
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRunTask();
          }}
          className={`flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent/80 ${uiDensity.buttonText}`}
        >
          {data.taskStatus === 'running' ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          生成
        </button>
        {data.filePath ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCreateStoryboardNode();
            }}
            className={`flex h-8 items-center gap-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-text-dark hover:bg-[var(--ui-surface-panel)] ${uiDensity.metaText}`}
            title="生成视频分镜节点"
          >
            <Clapperboard className="h-3.5 w-3.5" />
            分镜
          </button>
        ) : (
          <div />
        )}
      </div>

      {data.taskMessage ? (
        <div className={`mt-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 text-text-muted ${uiDensity.metaText}`}>
          {data.taskMessage}
          {data.taskStatus === 'success' ? (
            <span className="ml-2 text-text-dark">
              {t('node.video.duration', { defaultValue: '时长' })}: {selectedDuration}s
            </span>
          ) : null}
        </div>
      ) : null}

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
      <NodeResizeHandle minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} maxWidth={MAX_WIDTH} maxHeight={MAX_HEIGHT} />
    </div>
  );
});

VideoNode.displayName = 'VideoNode';
