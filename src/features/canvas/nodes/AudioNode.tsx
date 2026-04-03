import { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Headphones, LoaderCircle, Music4, Wand2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES, type AudioNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { useCanvasStore } from '@/stores/canvasStore';

type AudioNodeProps = NodeProps & {
  id: string;
  data: AudioNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 320;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 220;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 800;

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const AudioNode = memo(({ id, data, selected, width, height }: AudioNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const timerRef = useRef<number | null>(null);
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.audio, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const handleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight);
  const audioSrc = useMemo(
    () => (data.filePath ? resolveLocalAssetUrl(data.filePath) : null),
    [data.filePath]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handlePickAudio = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
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
      taskStatus: 'idle',
      taskMessage: null,
      taskOutputSummary: null,
    });
  };

  const handleRunTask = () => {
    if (!data.filePath) {
      updateNodeData(id, {
        taskStatus: 'error',
        taskMessage: t('node.audio.missingAudio'),
      });
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    updateNodeData(id, {
      taskStatus: 'running',
      taskMessage: t('node.media.processing'),
      taskOutputSummary: null,
      lastExecutedAt: Date.now(),
    });

    timerRef.current = window.setTimeout(() => {
      updateNodeData(id, {
        taskStatus: 'success',
        taskMessage: t('node.media.ready'),
        taskOutputSummary: t('node.audio.mockResult', {
          duration: formatSeconds(data.durationSec),
        }),
      });
      timerRef.current = null;
    }, 900);
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
        icon={<Music4 className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {t('node.audio.title')}
        </div>
        <button
          type="button"
          className="rounded-md border border-[rgba(255,255,255,0.12)] bg-bg-dark/60 px-2 py-1 text-xs text-text-dark transition-colors hover:border-[rgba(255,255,255,0.22)]"
          onClick={(event) => {
            event.stopPropagation();
            void handlePickAudio();
          }}
        >
          {data.filePath ? t('node.media.changeFile') : t('node.media.selectFile')}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/50 p-4">
          {audioSrc ? (
            <audio
              src={audioSrc}
              controls
              className="w-full"
              onLoadedMetadata={(event) => {
                const durationSec = Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : null;
                updateNodeData(id, { durationSec });
              }}
            />
          ) : (
            <div className="flex h-[88px] flex-col items-center justify-center gap-2 text-text-muted">
              <Headphones className="h-8 w-8 opacity-60" />
              <span className="text-sm">{t('node.audio.empty')}</span>
            </div>
          )}
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.audio.duration')}
            </div>
            <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.durationSec)}</div>
          </div>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.audio.mode')}
            </div>
            <div className="mt-1 text-sm text-text-dark">
              {t(`node.audio.mode.${data.taskMode}`)}
            </div>
          </div>
        </div>

        <textarea
          value={data.prompt}
          onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
          placeholder={t('node.audio.promptPlaceholder')}
          className="nodrag nowheel min-h-[76px] w-full resize-none rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 px-3 py-2 text-sm text-text-dark outline-none placeholder:text-text-muted/70"
        />

        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.12)] bg-bg-dark/50 px-3 py-2 text-sm text-text-dark transition-colors hover:border-[rgba(255,255,255,0.2)]"
            onClick={(event) => {
              event.stopPropagation();
              handleRunTask();
            }}
          >
            {data.taskStatus === 'running' ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {t('node.media.runTask')}
          </button>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 px-3 py-2 text-xs text-text-muted">
            <div>{t(`node.media.status.${data.taskStatus}`)}</div>
            {data.taskMessage ? <div className="mt-1">{data.taskMessage}</div> : null}
          </div>
        </div>

        <div className="min-h-[54px] rounded-xl border border-[rgba(255,255,255,0.08)] bg-bg-dark/30 px-3 py-2 text-sm text-text-muted">
          {data.taskOutputSummary || t('node.media.outputPlaceholder')}
        </div>
      </div>

      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!border-surface-dark !bg-accent"
        style={handleStyle}
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

AudioNode.displayName = 'AudioNode';
