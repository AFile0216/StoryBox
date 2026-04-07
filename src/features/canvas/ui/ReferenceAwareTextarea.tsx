import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { graphImageResolver } from '@/features/canvas/application/canvasServices';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import {
  findReferenceTokens,
  insertReferenceToken,
  removeTextRange,
  resolveReferenceAwareDeleteRange,
} from '@/features/canvas/application/referenceTokenEditing';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { useCanvasStore } from '@/stores/canvasStore';

interface ReferenceAwareTextareaProps {
  nodeId: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onBeforeChange?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMouseDown?: (event: MouseEvent<HTMLTextAreaElement>) => void;
  onWheelCapture?: (event: WheelEvent<HTMLTextAreaElement>) => void;
  minHeightClassName?: string;
  className?: string;
}

interface PickerAnchor {
  left: number;
  top: number;
}

const PICKER_FALLBACK_ANCHOR: PickerAnchor = { left: 8, top: 8 };
const PICKER_Y_OFFSET_PX = 20;

function getTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  caretIndex: number
): PickerAnchor {
  const mirror = document.createElement('div');
  const computed = window.getComputedStyle(textarea);
  const mirrorStyle = mirror.style;

  mirrorStyle.position = 'absolute';
  mirrorStyle.visibility = 'hidden';
  mirrorStyle.pointerEvents = 'none';
  mirrorStyle.whiteSpace = 'pre-wrap';
  mirrorStyle.overflowWrap = 'break-word';
  mirrorStyle.wordBreak = 'break-word';
  mirrorStyle.boxSizing = computed.boxSizing;
  mirrorStyle.width = `${textarea.clientWidth}px`;
  mirrorStyle.font = computed.font;
  mirrorStyle.lineHeight = computed.lineHeight;
  mirrorStyle.letterSpacing = computed.letterSpacing;
  mirrorStyle.padding = computed.padding;
  mirrorStyle.border = computed.border;
  mirrorStyle.textTransform = computed.textTransform;
  mirrorStyle.textIndent = computed.textIndent;

  mirror.textContent = textarea.value.slice(0, caretIndex);

  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(caretIndex, caretIndex + 1) || ' ';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const left = marker.offsetLeft - textarea.scrollLeft;
  const top = marker.offsetTop - textarea.scrollTop;

  document.body.removeChild(mirror);

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
  };
}

function resolvePickerAnchor(
  container: HTMLDivElement | null,
  textarea: HTMLTextAreaElement,
  caretIndex: number
): PickerAnchor {
  if (!container) {
    return PICKER_FALLBACK_ANCHOR;
  }

  const containerRect = container.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const caretOffset = getTextareaCaretOffset(textarea, caretIndex);

  return {
    left: Math.max(0, textareaRect.left - containerRect.left + caretOffset.left),
    top: Math.max(0, textareaRect.top - containerRect.top + caretOffset.top + PICKER_Y_OFFSET_PX),
  };
}

function renderTextWithHighlights(text: string, maxImageCount: number): ReactNode {
  if (!text) {
    return ' ';
  }

  const segments: ReactNode[] = [];
  let lastIndex = 0;
  const referenceTokens = findReferenceTokens(text, maxImageCount);

  for (const token of referenceTokens) {
    if (token.start > lastIndex) {
      segments.push(
        <span key={`plain-${lastIndex}`}>{text.slice(lastIndex, token.start)}</span>
      );
    }

    segments.push(
      <span
        key={`ref-${token.start}`}
        className="relative z-0 text-white [text-shadow:0.24px_0_currentColor,-0.24px_0_currentColor] before:absolute before:-inset-x-[4px] before:-inset-y-[1px] before:-z-10 before:rounded-[7px] before:bg-accent/55 before:content-['']"
      >
        {token.token}
      </span>
    );

    lastIndex = token.end;
  }

  if (lastIndex < text.length) {
    segments.push(<span key={`plain-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return segments;
}

export function ReferenceAwareTextarea({
  nodeId,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  onBeforeChange,
  textareaRef,
  onKeyDown,
  onMouseDown,
  onWheelCapture,
  minHeightClassName = 'min-h-[140px]',
  className = '',
}: ReferenceAwareTextareaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRefFallback = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickerCursor, setPickerCursor] = useState<number | null>(null);
  const [pickerActiveIndex, setPickerActiveIndex] = useState(0);
  const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor>(PICKER_FALLBACK_ANCHOR);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const resolvedValue = value ?? '';

  const incomingImages = useMemo(
    () => graphImageResolver.collectInputImages(nodeId, nodes, edges),
    [edges, nodeId, nodes]
  );
  const incomingImageItems = useMemo(
    () =>
      incomingImages.map((imageUrl, index) => ({
        imageUrl,
        displayUrl: resolveImageDisplayUrl(imageUrl),
        label: `图${index + 1}`,
      })),
    [incomingImages]
  );
  const incomingImageViewerList = useMemo(
    () => incomingImageItems.map((item) => resolveImageDisplayUrl(item.imageUrl)),
    [incomingImageItems]
  );

  const resolvedTextareaRef = textareaRef ?? textareaRefFallback;
  const syncHighlightScroll = useCallback(() => {
    if (!resolvedTextareaRef.current || !highlightRef.current) {
      return;
    }

    highlightRef.current.scrollTop = resolvedTextareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = resolvedTextareaRef.current.scrollLeft;
  }, [resolvedTextareaRef]);

  useEffect(() => {
    if (incomingImages.length === 0) {
      setShowImagePicker(false);
      setPickerCursor(null);
      setPickerActiveIndex(0);
      return;
    }

    setPickerActiveIndex((previous) => Math.min(previous, incomingImages.length - 1));
  }, [incomingImages.length]);

  useEffect(() => {
    const handleOutside = (event: globalThis.MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setShowImagePicker(false);
      setPickerCursor(null);
    };

    document.addEventListener('mousedown', handleOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
    };
  }, []);

  const closePicker = useCallback(() => {
    setShowImagePicker(false);
    setPickerCursor(null);
    setPickerActiveIndex(0);
  }, []);

  const insertImageReference = useCallback((imageIndex: number) => {
    const marker = `@图${imageIndex + 1}`;
    const cursor = pickerCursor ?? resolvedValue.length;
    const { nextText, nextCursor } = insertReferenceToken(resolvedValue, cursor, marker);

    onChange(nextText);
    closePicker();

    requestAnimationFrame(() => {
      resolvedTextareaRef.current?.focus();
      resolvedTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      syncHighlightScroll();
    });
  }, [closePicker, onChange, pickerCursor, resolvedTextareaRef, resolvedValue, syncHighlightScroll]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const selectionStart = event.currentTarget.selectionStart ?? resolvedValue.length;
      const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
      const deleteRange = resolveReferenceAwareDeleteRange(
        resolvedValue,
        selectionStart,
        selectionEnd,
        event.key === 'Backspace' ? 'backward' : 'forward',
        incomingImages.length
      );

      if (deleteRange) {
        event.preventDefault();
        const { nextText, nextCursor } = removeTextRange(resolvedValue, deleteRange);
        onChange(nextText);
        requestAnimationFrame(() => {
          resolvedTextareaRef.current?.focus();
          resolvedTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
          syncHighlightScroll();
        });
        return;
      }
    }

    if (showImagePicker && incomingImages.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setPickerActiveIndex((previous) => (previous + 1) % incomingImages.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setPickerActiveIndex((previous) =>
          previous === 0 ? incomingImages.length - 1 : previous - 1
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        insertImageReference(pickerActiveIndex);
        return;
      }
    }

    if (event.key === '@' && incomingImages.length > 0) {
      event.preventDefault();
      const cursor = event.currentTarget.selectionStart ?? resolvedValue.length;
      setPickerAnchor(resolvePickerAnchor(rootRef.current, event.currentTarget, cursor));
      setPickerCursor(cursor);
      setShowImagePicker(true);
      setPickerActiveIndex(0);
      return;
    }

    if (event.key === 'Escape' && showImagePicker) {
      event.preventDefault();
      closePicker();
    }
    onKeyDown?.(event);
  }, [
    closePicker,
    incomingImages.length,
    insertImageReference,
    onChange,
    onKeyDown,
    pickerActiveIndex,
    resolvedValue,
    showImagePicker,
    syncHighlightScroll,
  ]);

  return (
    <div ref={rootRef} className="relative">
      <div className={`tapnow-node-field relative ${minHeightClassName} overflow-hidden ${className}`}>
        <div
          ref={highlightRef}
          aria-hidden="true"
          className="ui-scrollbar pointer-events-none absolute inset-0 overflow-y-auto overflow-x-hidden px-3 py-2 text-sm leading-6 text-text-dark"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="min-h-full whitespace-pre-wrap break-words">
            {renderTextWithHighlights(resolvedValue, incomingImages.length)}
          </div>
        </div>

        <textarea
          ref={resolvedTextareaRef}
          value={resolvedValue}
          autoFocus={autoFocus}
          onChange={(event) => {
            onBeforeChange?.();
            onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onScroll={syncHighlightScroll}
          onMouseDown={(event) => {
            event.stopPropagation();
            onMouseDown?.(event);
          }}
          onWheelCapture={(event) => {
            event.stopPropagation();
            onWheelCapture?.(event);
          }}
          placeholder={placeholder}
          className="ui-scrollbar nodrag nowheel relative z-10 h-full w-full resize-none overflow-y-auto overflow-x-hidden border-none bg-transparent px-3 py-2 text-sm leading-6 text-transparent caret-text-dark outline-none placeholder:text-text-muted/70 whitespace-pre-wrap break-words"
          style={{ scrollbarGutter: 'stable' }}
        />
      </div>

      {showImagePicker && incomingImageItems.length > 0 && (
        <div
          className="absolute z-30 w-[148px] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.16)] bg-surface shadow-xl"
          style={{ left: pickerAnchor.left, top: pickerAnchor.top }}
          onMouseDown={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="ui-scrollbar max-h-[196px] overflow-y-auto">
            {incomingImageItems.map((item, index) => (
              <button
                key={`${item.imageUrl}-${index}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  insertImageReference(index);
                }}
                onMouseEnter={() => setPickerActiveIndex(index)}
                className={`flex w-full items-center gap-2 border border-transparent px-2 py-2 text-left text-sm text-text-dark transition-colors ${
                  pickerActiveIndex === index
                    ? 'bg-accent/12'
                    : 'bg-surface hover:bg-[rgba(15,23,42,0.06)] dark:hover:bg-white/5'
                }`}
              >
                <CanvasNodeImage
                  src={item.displayUrl}
                  alt={item.label}
                  viewerSourceUrl={resolveImageDisplayUrl(item.imageUrl)}
                  viewerImageList={incomingImageViewerList}
                  className="h-8 w-8 rounded-lg object-cover"
                  draggable={false}
                />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
