import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';

import { CANVAS_NODE_TYPES, type CanvasNodeType } from '@/features/canvas/domain/canvasNodes';
import { prepareNodeImage, prepareNodeImageFromFile } from '@/features/canvas/application/imageData';

interface DroppedMediaPayload {
  type: 'video' | 'audio' | 'image';
  file?: File;
  path?: string;
  name: string;
  mimeType?: string | null;
}

interface UseCanvasMediaDropOptions {
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Record<string, unknown>
  ) => string;
  reactFlowInstance: ReactFlowInstance;
  scheduleCanvasPersist: (delayMs?: number) => void;
}

function isVideoMimeType(mimeType: string | undefined | null): boolean {
  if (!mimeType) {
    return false;
  }
  return mimeType.toLowerCase().startsWith('video/');
}

function isAudioMimeType(mimeType: string | undefined | null): boolean {
  if (!mimeType) {
    return false;
  }
  return mimeType.toLowerCase().startsWith('audio/');
}

function isImageMimeType(mimeType: string | undefined | null): boolean {
  if (!mimeType) {
    return false;
  }
  return mimeType.toLowerCase().startsWith('image/');
}

function isVideoFilename(fileName: string | undefined | null): boolean {
  if (!fileName) {
    return false;
  }
  return /\.(mp4|mov|m4v|webm|mkv|avi)$/iu.test(fileName);
}

function isAudioFilename(fileName: string | undefined | null): boolean {
  if (!fileName) {
    return false;
  }
  return /\.(mp3|wav|ogg|m4a|flac|aac)$/iu.test(fileName);
}

function isImageFilename(fileName: string | undefined | null): boolean {
  if (!fileName) {
    return false;
  }
  return /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/iu.test(fileName);
}

function resolveMediaTypeByNameOrPath(
  nameOrPath: string | undefined | null
): 'video' | 'audio' | 'image' | null {
  if (!nameOrPath) {
    return null;
  }
  if (isVideoFilename(nameOrPath)) {
    return 'video';
  }
  if (isAudioFilename(nameOrPath)) {
    return 'audio';
  }
  if (isImageFilename(nameOrPath)) {
    return 'image';
  }
  return null;
}

function resolveDroppedFilePathFromUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.toLowerCase().startsWith('file://')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const decodedPath = decodeURIComponent(parsed.pathname);
    return decodedPath.replace(/^\/([A-Za-z]:[\\/])/, '$1');
  } catch {
    return null;
  }
}

function resolveDroppedMediaPayloads(dataTransfer: DataTransfer | null): DroppedMediaPayload[] {
  if (!dataTransfer) {
    return [];
  }

  const payloads: DroppedMediaPayload[] = [];
  const dedupeKeys = new Set<string>();
  const appendPayload = (payload: DroppedMediaPayload) => {
    const keyBase = payload.path || payload.name;
    const dedupeKey = `${payload.type}:${keyBase.trim().toLowerCase()}`;
    if (!keyBase || dedupeKeys.has(dedupeKey)) {
      return;
    }
    dedupeKeys.add(dedupeKey);
    payloads.push(payload);
  };

  const files = Array.from(dataTransfer.files ?? []);
  for (const file of files) {
    const fromPath = ((file as File & { path?: string }).path ?? '').trim();
    const resolvedType = isVideoMimeType(file.type)
      ? 'video'
      : isAudioMimeType(file.type)
        ? 'audio'
        : isImageMimeType(file.type)
          ? 'image'
          : resolveMediaTypeByNameOrPath(file.name || fromPath);
    if (!resolvedType) {
      continue;
    }
    appendPayload({
      type: resolvedType,
      file,
      path: fromPath || undefined,
      name: file.name || fromPath.split(/[/\\]/u).pop() || `media-${Date.now()}`,
      mimeType: file.type || null,
    });
  }

  const uriListText = dataTransfer.getData('text/uri-list') || '';
  const plainText = dataTransfer.getData('text/plain') || '';
  const pathCandidates = [...uriListText.split(/\r?\n/u), ...plainText.split(/\r?\n/u)];
  for (const rawCandidate of pathCandidates) {
    const candidate = rawCandidate.trim();
    if (!candidate || candidate.startsWith('#')) {
      continue;
    }
    const resolvedPath = resolveDroppedFilePathFromUri(candidate);
    if (!resolvedPath) {
      continue;
    }
    const resolvedType = resolveMediaTypeByNameOrPath(resolvedPath);
    if (!resolvedType) {
      continue;
    }
    appendPayload({
      type: resolvedType,
      path: resolvedPath,
      name: resolvedPath.split(/[/\\]/u).pop() || resolvedPath,
      mimeType: null,
    });
  }

  return payloads;
}

function hasPotentialFileDrop(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  if ((dataTransfer.files?.length ?? 0) > 0) {
    return true;
  }

  if (Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file')) {
    return true;
  }

  const types = Array.from(dataTransfer.types ?? []).map((item) => item.toLowerCase());
  if (types.includes('files') || types.includes('text/uri-list')) {
    return true;
  }

  const uriListText = dataTransfer.getData('text/uri-list') || '';
  const plainText = dataTransfer.getData('text/plain') || '';
  return /file:\/\//iu.test(uriListText) || /file:\/\//iu.test(plainText);
}

export function useCanvasMediaDrop({
  addNode,
  reactFlowInstance,
  scheduleCanvasPersist,
}: UseCanvasMediaDropOptions) {
  const handleCanvasMediaDragOver = useCallback((event: Pick<DragEvent, 'preventDefault' | 'dataTransfer'>) => {
    const mediaPayloads = resolveDroppedMediaPayloads(event.dataTransfer);
    if (mediaPayloads.length === 0 && !hasPotentialFileDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleCanvasMediaDrop = useCallback(
    async (event: Pick<DragEvent, 'preventDefault' | 'stopPropagation' | 'dataTransfer' | 'clientX' | 'clientY'>) => {
      const mediaPayloads = resolveDroppedMediaPayloads(event.dataTransfer);
      if (mediaPayloads.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const flowPoint = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      let created = 0;

      for (let index = 0; index < mediaPayloads.length; index += 1) {
        const payload = mediaPayloads[index];
        const droppedPath = payload.path?.trim() ?? '';
        const filePath = ((payload.file as File & { path?: string } | undefined)?.path ?? '').trim();
        const sourceFileName = payload.name || droppedPath.split(/[/\\]/u).pop() || `media-${Date.now()}`;
        const nodePosition = {
          x: flowPoint.x + index * 32,
          y: flowPoint.y + index * 20,
        };

        if (payload.type === 'image') {
          try {
            const prepared = payload.file
              ? await prepareNodeImageFromFile(payload.file)
              : await prepareNodeImage(droppedPath || filePath);
            addNode(
              CANVAS_NODE_TYPES.upload as CanvasNodeType,
              nodePosition,
              {
                imageUrl: prepared.imageUrl,
                previewImageUrl: prepared.previewImageUrl,
                aspectRatio: prepared.aspectRatio,
                sourceFileName,
                displayName: sourceFileName,
              }
            );
            created += 1;
          } catch (error) {
            console.error('[canvas-media-drop] failed to import dropped image', {
              sourceFileName,
              droppedPath,
              filePath,
              error,
            });
          }
          continue;
        }

        const resolvedPath = droppedPath || filePath || (payload.file ? URL.createObjectURL(payload.file) : '');
        if (!resolvedPath) {
          continue;
        }

        if (payload.type === 'video') {
          addNode(
            CANVAS_NODE_TYPES.videoPreview as CanvasNodeType,
            nodePosition,
            {
              filePath: resolvedPath,
              sourceFileName,
              mimeType: payload.mimeType ?? payload.file?.type ?? null,
              displayName: sourceFileName,
            }
          );
        } else {
          addNode(
            CANVAS_NODE_TYPES.audioPreview as CanvasNodeType,
            nodePosition,
            {
              filePath: resolvedPath,
              sourceFileName,
              mimeType: payload.mimeType ?? payload.file?.type ?? null,
              displayName: sourceFileName,
            }
          );
        }
        created += 1;
      }

      if (created > 0) {
        scheduleCanvasPersist(0);
      }
    },
    [addNode, reactFlowInstance, scheduleCanvasPersist]
  );

  return {
    handleCanvasMediaDragOver,
    handleCanvasMediaDrop,
  };
}
