import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ImagePlus, MessageSquare, Send, StopCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { CANVAS_NODE_TYPES, type ChatMessage, type ChatNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';

type ChatNodeProps = NodeProps & { id: string; data: ChatNodeData; selected?: boolean };

const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 320;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 1200;

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const ChatNode = memo(({ id, data, selected, width, height }: ChatNodeProps) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const customApiInterfaces = useSettingsStore((state) => state.customApiInterfaces);

  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const targetHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left');
  const sourceHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right');

  const messages: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
  const inputText = typeof data.inputText === 'string' ? data.inputText : '';
  const isStreaming = Boolean(data.isStreaming);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [localInput, setLocalInput] = useState(inputText);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // resolve selected interface + model
  const selectedInterface = customApiInterfaces.find((i) => i.id === data.interfaceId) ?? customApiInterfaces[0] ?? null;
  const selectedModel = data.modelId || selectedInterface?.modelIds[0] || '';

  const handlePickImages = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const base64s = await Promise.all(files.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    setPendingImages((prev) => [...prev, ...base64s].slice(0, 4));
    e.target.value = '';
  }, []);

  const handleSend = useCallback(async () => {
    const text = localInput.trim();
    if (!text || isStreaming || !selectedInterface) return;

    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text };
    const assistantMsg: ChatMessage = { id: generateId(), role: 'assistant', content: '' };
    const nextMessages = [...messages, userMsg, assistantMsg];

    setLocalInput('');
    setPendingImages([]);
    updateNodeData(id, { messages: nextMessages, inputText: '', isStreaming: true });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const response = await fetch(`${selectedInterface.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${selectedInterface.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: ctrl.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta?.content ?? '';
              accumulated += delta;
              const updated = nextMessages.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: accumulated } : m
              );
              updateNodeData(id, { messages: updated });
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'AbortError') {
        const updated = nextMessages.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: '[错误] 请求失败' } : m
        );
        updateNodeData(id, { messages: updated });
      }
    } finally {
      abortRef.current = null;
      updateNodeData(id, { isStreaming: false });
    }
  }, [id, isStreaming, localInput, messages, selectedInterface, selectedModel, updateNodeData]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.chat, data);

  return (
    <div
      className={`tapnow-node-card group relative overflow-visible transition-colors duration-150 ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}`}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<MessageSquare className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(v) => updateNodeData(id, { displayName: v })}
      />

      {/* model selector */}
      <div className="flex items-center gap-1.5 px-2 pt-8 pb-1">
        <select
          className="nodrag nowheel h-7 flex-1 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-text-dark outline-none"
          value={data.interfaceId || ''}
          onChange={(e) => {
            const iface = customApiInterfaces.find((i) => i.id === e.target.value);
            updateNodeData(id, { interfaceId: e.target.value, modelId: iface?.modelIds[0] ?? '' });
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {customApiInterfaces.length === 0 && <option value="">未配置 API</option>}
          {customApiInterfaces.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select
          className="nodrag nowheel h-7 flex-1 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-text-dark outline-none"
          value={selectedModel}
          onChange={(e) => updateNodeData(id, { modelId: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(selectedInterface?.modelIds ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* messages */}
      <div className="nodrag nowheel ui-scrollbar flex flex-col gap-2 overflow-y-auto px-2 py-1" style={{ height: resolvedHeight - 140 }}>
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            {t('node.chat.emptyHint', { defaultValue: '发送消息开始对话' })}
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 ${
                msg.role === 'user'
                  ? 'bg-accent/80 text-white'
                  : 'tapnow-node-panel text-text-dark'
              }`}
            >
              {msg.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{msg.content || '▋'}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* input */}
            {pendingImages && pendingImages.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pb-1">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="h-10 rounded object-cover" />
              <button
                type="button"
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                onClick={(e) => { e.stopPropagation(); setPendingImages((p) => p.filter((_, j) => j !== i)); }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="absolute bottom-2 left-2 right-2 flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePickImages}
        />
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:text-accent"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <textarea
          className="nodrag nowheel ui-scrollbar flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-dark outline-none placeholder:text-text-muted focus:border-accent/50"
          rows={2}
          placeholder={t('node.chat.inputPlaceholder', { defaultValue: '输入消息...' })}
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30"
            onClick={handleStop}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <StopCircle className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40"
            disabled={(!localInput.trim() && pendingImages.length === 0) || !selectedInterface}
            onClick={() => void handleSend()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>

      <NodeResizeHandle minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} maxWidth={MAX_WIDTH} maxHeight={MAX_HEIGHT} />
    </div>
  );
});

ChatNode.displayName = 'ChatNode';
