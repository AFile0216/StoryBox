import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Copy, FileText, LoaderCircle, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type TextAnnotationMode,
  type TextAnnotationNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  canvasAiGateway,
  graphImageResolver,
} from '@/features/canvas/application/canvasServices';
import { filterReferencedImages } from '@/features/canvas/application/referenceTokenEditing';
import { imageUrlToDataUrl, resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { parseAndNormalizeReversePromptResult } from '@/features/canvas/application/reversePromptSchema';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';
import { NodeMaterialStrip } from '@/features/canvas/ui/NodeMaterialStrip';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';

type TextAnnotationNodeProps = NodeProps & {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 960;

const TEXT_MODES: TextAnnotationMode[] = ['text-to-image', 'reverse-prompt'];

function buildCustomModelId(interfaceId: string, modelId: string): string {
  return `openai-compatible/${interfaceId}/${encodeURIComponent(modelId)}`;
}

function extractChatContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) {
    return '';
  }
  const message = first.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === 'string') {
    return message.content;
  }
  const content = first.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).text : ''))
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join('\n')
      .trim();
  }
  return '';
}

function buildReverseSystemPrompt(): string {
  return [
    '你是专业影视画面反推提示词引擎。',
    '任务：先对图像进行细节分析，再输出可复现提示词。',
    '分析必须覆盖：画面细节、环境、人物服饰与配饰、风格、构图、色彩。',
    '最终必须仅返回 JSON，不要返回其他文本。',
    'JSON结构必须固定为：',
    '{ "analysis": "...", "prompts": { "mj": {...}, "nanobanana": {...}, "jimeng": {...} } }',
    '其中 prompts 下三个对象都必须存在。',
  ].join('\n');
}

export const TextAnnotationNode = memo(({
  id,
  data,
  selected,
  width,
  height,
}: TextAnnotationNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const customApiInterfaces = useSettingsStore((state) => state.customApiInterfaces);
  const copyTimerRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const mode = TEXT_MODES.includes(data.mode) ? data.mode : 'text-to-image';
  const prompt = typeof data.content === 'string' ? data.content : '';
  const isGenerating = data.isGenerating === true;
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.textAnnotation, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight);
  const targetHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left');
  const sourceHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right');
  const selectGridClass = resolvedWidth < 560 ? 'grid-cols-1' : 'grid-cols-3';

  const selectedInterface = useMemo(() => {
    const byId = customApiInterfaces.find((item) => item.id === data.interfaceId);
    return byId ?? customApiInterfaces[0] ?? null;
  }, [customApiInterfaces, data.interfaceId]);
  const selectedModel = data.modelId || selectedInterface?.modelIds[0] || '';

  const incomingImages = useMemo(
    () => graphImageResolver.collectInputImages(id, nodes, edges),
    [edges, id, nodes]
  );
  const referencedImages = useMemo(
    () => filterReferencedImages(incomingImages, prompt),
    [incomingImages, prompt]
  );

  useEffect(() => {
    if (!data.interfaceId && selectedInterface) {
      updateNodeData(id, { interfaceId: selectedInterface.id });
    }
    if (!selectedModel && selectedInterface?.modelIds[0]) {
      updateNodeData(id, { modelId: selectedInterface.modelIds[0] });
    }
  }, [data.interfaceId, id, selectedInterface, selectedModel, updateNodeData]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    },
    []
  );

  const handleCopy = useCallback(async () => {
    const value = mode === 'reverse-prompt'
      ? data.reversePromptJson || ''
      : prompt;
    if (!value.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 1400);
  }, [data.reversePromptJson, mode, prompt]);

  const handleGenerateTextToImage = useCallback(async () => {
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt || !selectedInterface || !selectedModel) {
      updateNodeData(id, {
        generationError: !cleanedPrompt
          ? t('node.imageEdit.promptRequired', { defaultValue: '请输入提示词' })
          : t('node.imageEdit.modelRequired', { defaultValue: '请先选择可用模型' }),
      });
      return;
    }
    if (!selectedInterface.apiKey.trim()) {
      updateNodeData(id, {
        generationError: t('node.imageEdit.apiKeyRequired', { defaultValue: '请先完成接口配置' }),
      });
      return;
    }

    updateNodeData(id, {
      isGenerating: true,
      generationError: null,
      interfaceId: selectedInterface.id,
      modelId: selectedModel,
    });

    try {
      const outputImage = await canvasAiGateway.generateImage({
        prompt: cleanedPrompt,
        model: buildCustomModelId(selectedInterface.id, selectedModel),
        size: '1K',
        aspectRatio: '1:1',
        referenceImages: referencedImages,
        runtimeConfig: {
          providerType: 'custom-api',
          interfaceId: selectedInterface.id,
          interfaceName: selectedInterface.name,
          apiKey: selectedInterface.apiKey,
          baseUrl: selectedInterface.baseUrl,
          apiModel: selectedModel,
          omitSizeParams: selectedInterface.omitSizeParams,
          requestMode: selectedInterface.requestMode,
        },
      });

      updateNodeData(id, {
        generatedImageUrl: outputImage,
        generatedPreviewImageUrl: outputImage,
        isGenerating: false,
        generationError: null,
        lastGeneratedAt: Date.now(),
      });
    } catch (error) {
      updateNodeData(id, {
        isGenerating: false,
        generationError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [id, prompt, referencedImages, selectedInterface, selectedModel, t, updateNodeData]);

  const handleGenerateReversePrompt = useCallback(async () => {
    if (!selectedInterface || !selectedModel) {
      updateNodeData(id, {
        generationError: t('node.imageEdit.modelRequired', { defaultValue: '请先选择可用模型' }),
      });
      return;
    }
    if (!selectedInterface.apiKey.trim()) {
      updateNodeData(id, {
        generationError: t('node.imageEdit.apiKeyRequired', { defaultValue: '请先完成接口配置' }),
      });
      return;
    }

    const imageSource = data.generatedImageUrl || referencedImages[0] || incomingImages[0] || null;
    if (!imageSource) {
      updateNodeData(id, {
        generationError: t('node.textAnnotation.needImage', { defaultValue: '请先提供图片用于反推' }),
      });
      return;
    }

    updateNodeData(id, {
      isGenerating: true,
      generationError: null,
      interfaceId: selectedInterface.id,
      modelId: selectedModel,
    });

    try {
      const imageDataUrl = await imageUrlToDataUrl(imageSource);
      const response = await fetch(`${selectedInterface.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${selectedInterface.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          stream: false,
          messages: [
            { role: 'system', content: buildReverseSystemPrompt() },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请分析这张图并输出固定 JSON，必须含 analysis 和 prompts.mj/nanobanana/jimeng。',
                },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const rawText = extractChatContent(payload);
      const normalized = parseAndNormalizeReversePromptResult(
        rawText,
        '模型未返回有效 JSON，已输出固定结构空结果。'
      );
      const normalizedJson = JSON.stringify(normalized, null, 2);

      updateNodeData(id, {
        content: normalizedJson,
        reversePromptJson: normalizedJson,
        reversePromptResult: normalized,
        isGenerating: false,
        generationError: null,
        lastGeneratedAt: Date.now(),
      });
    } catch (error) {
      updateNodeData(id, {
        isGenerating: false,
        generationError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    data.generatedImageUrl,
    id,
    incomingImages,
    referencedImages,
    selectedInterface,
    selectedModel,
    t,
    updateNodeData,
  ]);

  const handleGenerate = useCallback(async () => {
    if (mode === 'reverse-prompt') {
      await handleGenerateReversePrompt();
      return;
    }
    await handleGenerateTextToImage();
  }, [handleGenerateReversePrompt, handleGenerateTextToImage, mode]);

  const previewImage = data.generatedPreviewImageUrl || data.generatedImageUrl || null;
  const modeLabel = t(`node.textAnnotation.mode.${mode}`, {
    defaultValue: mode === 'text-to-image' ? '文生图' : '图片反推提示词',
  });

  return (
    <div
      className={`
        tapnow-node-card group relative flex h-full w-full flex-col overflow-visible p-2 transition-colors duration-150
        ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}
      `}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileText className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <NodeMaterialStrip nodeId={id} className="mt-6" />

      <div className={`mt-2 flex min-h-0 flex-1 flex-col ${uiDensity.stackGap}`}>
        <div className={`grid ${selectGridClass} ${uiDensity.sectionGap}`}>
          <select
            value={mode}
            onChange={(event) =>
              updateNodeData(id, {
                mode: event.target.value as TextAnnotationMode,
                generationError: null,
              })
            }
            className="h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-xs text-text-dark outline-none"
          >
            {TEXT_MODES.map((item) => (
              <option key={item} value={item}>
                {t(`node.textAnnotation.mode.${item}`, {
                  defaultValue: item === 'text-to-image' ? '文生图' : '图片反推提示词',
                })}
              </option>
            ))}
          </select>

          <select
            value={selectedInterface?.id ?? ''}
            onChange={(event) => {
              const nextInterface = customApiInterfaces.find((item) => item.id === event.target.value);
              updateNodeData(id, {
                interfaceId: event.target.value,
                modelId: nextInterface?.modelIds[0] ?? '',
              });
            }}
            className="h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-xs text-text-dark outline-none"
          >
            {customApiInterfaces.length === 0 ? <option value="">{t('settings.providers')}</option> : null}
            {customApiInterfaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            value={selectedModel}
            onChange={(event) => updateNodeData(id, { modelId: event.target.value })}
            className="h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-xs text-text-dark outline-none"
          >
            {(selectedInterface?.modelIds ?? []).map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        </div>

        {previewImage ? (
          <div className="tapnow-node-surface h-[130px] overflow-hidden">
            <img
              src={resolveImageDisplayUrl(previewImage)}
              alt="text-node-generated"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <ReferenceAwareTextarea
            nodeId={id}
            value={prompt}
            onChange={(value) => updateNodeData(id, { content: value, generationError: null })}
            placeholder={
              mode === 'reverse-prompt'
                ? t('node.textAnnotation.reversePlaceholder', {
                  defaultValue: '输入 @图片1 引用后点击生成，输出固定 JSON 结构',
                })
                : t('node.textAnnotation.placeholder', { mode: modeLabel })
            }
            minHeightClassName="min-h-[120px]"
            className={`h-full ${uiDensity.panelPadding} ${uiDensity.bodyText}`}
            referenceMediaTypes={['image']}
          />
        </div>

        <div className={`grid grid-cols-2 ${uiDensity.sectionGap}`}>
          <button
            type="button"
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--ui-border-soft)] px-3 text-xs font-medium text-text-dark hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 ${uiDensity.buttonText}`}
            onClick={(event) => {
              event.stopPropagation();
              void handleCopy();
            }}
            disabled={!prompt.trim()}
          >
            <Copy className="h-3.5 w-3.5" />
            {copyState === 'copied'
              ? t('common.copied', { defaultValue: 'Copied' })
              : copyState === 'error'
                ? t('common.error', { defaultValue: 'Error' })
                : t('common.copyText', { defaultValue: 'Copy text' })}
          </button>

          <button
            type="button"
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60 ${uiDensity.buttonText}`}
            onClick={(event) => {
              event.stopPropagation();
              void handleGenerate();
            }}
            disabled={isGenerating || !selectedInterface || !selectedModel}
          >
            {isGenerating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {t('canvas.generate', { defaultValue: '生成' })}
          </button>
        </div>

        {data.generationError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
            {data.generationError}
          </div>
        ) : null}
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

TextAnnotationNode.displayName = 'TextAnnotationNode';

