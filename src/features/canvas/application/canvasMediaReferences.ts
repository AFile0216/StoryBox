import {
  isAudioNode,
  isAudioPreviewNode,
  isExportImageNode,
  isImageEditNode,
  isStoryboardComposeNode,
  isStoryboardGenNode,
  isStoryboardSplitNode,
  isTextAnnotationNode,
  isUploadNode,
  isVideoEditorNode,
  isVideoNode,
  isVideoPreviewNode,
  isVideoStoryboardNode,
  type CanvasEdge,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveImageDisplayUrl } from './imageData';

export type CanvasMediaKind = 'image' | 'video' | 'audio';
export type CanvasMediaOrigin = 'local' | 'generated' | 'linked';

export interface CanvasMediaReference {
  key: string;
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  mediaKind: CanvasMediaKind;
  sourceUrl: string;
  displayUrl: string;
  origin: Exclude<CanvasMediaOrigin, 'linked'>;
}

export interface NodeMaterialItem {
  key: string;
  mediaKind: CanvasMediaKind;
  sourceUrl: string;
  displayUrl: string;
  origin: CanvasMediaOrigin;
  title: string;
  sourceNodeId?: string;
  sourceNodeTitle?: string;
}

const LOCAL_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/|file:\/\/)/u;

function isLikelyLocalPath(value: string | null | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return LOCAL_PATH_PATTERN.test(trimmed);
}

function createRefKey(nodeId: string, mediaKind: CanvasMediaKind, sourceUrl: string): string {
  return `${nodeId}:${mediaKind}:${sourceUrl}`;
}

function createNodeTitle(node: CanvasNode): string {
  return resolveNodeDisplayName(node.type, node.data);
}

function pushImageReference(
  result: CanvasMediaReference[],
  node: CanvasNode,
  sourceUrl: string | null | undefined,
  origin: Exclude<CanvasMediaOrigin, 'linked'>
): void {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
    return;
  }
  const normalizedSourceUrl = sourceUrl.trim();
  result.push({
    key: createRefKey(node.id, 'image', normalizedSourceUrl),
    nodeId: node.id,
    nodeType: node.type,
    nodeTitle: createNodeTitle(node),
    mediaKind: 'image',
    sourceUrl: normalizedSourceUrl,
    displayUrl: resolveImageDisplayUrl(normalizedSourceUrl),
    origin,
  });
}

function pushMediaPathReference(
  result: CanvasMediaReference[],
  node: CanvasNode,
  mediaKind: 'video' | 'audio',
  path: string | null | undefined,
  origin: Exclude<CanvasMediaOrigin, 'linked'>
): void {
  if (typeof path !== 'string' || path.trim().length === 0) {
    return;
  }
  const normalizedPath = path.trim();
  result.push({
    key: createRefKey(node.id, mediaKind, normalizedPath),
    nodeId: node.id,
    nodeType: node.type,
    nodeTitle: createNodeTitle(node),
    mediaKind,
    sourceUrl: normalizedPath,
    displayUrl: resolveImageDisplayUrl(normalizedPath),
    origin,
  });
}

export function collectNodeOwnedMediaReferences(node: CanvasNode): CanvasMediaReference[] {
  const result: CanvasMediaReference[] = [];

  if (isUploadNode(node)) {
    const source = node.data.previewImageUrl || node.data.imageUrl;
    pushImageReference(result, node, source, 'local');
    return result;
  }

  if (isImageEditNode(node) || isExportImageNode(node) || isStoryboardGenNode(node)) {
    const source = node.data.previewImageUrl || node.data.imageUrl;
    pushImageReference(result, node, source, 'generated');
    return result;
  }

  if (isStoryboardSplitNode(node) || isStoryboardComposeNode(node)) {
    node.data.frames.forEach((frame) => {
      pushImageReference(result, node, frame.previewImageUrl || frame.imageUrl, 'generated');
    });
    return result;
  }

  if (isTextAnnotationNode(node)) {
    const textGeneratedImage = (node.data as { generatedImageUrl?: string | null }).generatedImageUrl;
    pushImageReference(result, node, textGeneratedImage, 'generated');
    return result;
  }

  if (isVideoNode(node)) {
    const origin: Exclude<CanvasMediaOrigin, 'linked'> = isLikelyLocalPath(node.data.filePath) ? 'local' : 'generated';
    pushMediaPathReference(result, node, 'video', node.data.outputFilePath || node.data.filePath, origin);
    return result;
  }

  if (isVideoPreviewNode(node) || isVideoEditorNode(node) || isVideoStoryboardNode(node)) {
    const source = node.data.filePath || (node.data as { outputFilePath?: string | null }).outputFilePath;
    const origin: Exclude<CanvasMediaOrigin, 'linked'> = isLikelyLocalPath(source) ? 'local' : 'generated';
    pushMediaPathReference(result, node, 'video', source, origin);
    if (isVideoPreviewNode(node) && Array.isArray(node.data.frames)) {
      node.data.frames.forEach((frame) => {
        pushImageReference(result, node, frame.previewImageUrl || frame.imageUrl, 'generated');
      });
    }
    return result;
  }

  if (isAudioNode(node) || isAudioPreviewNode(node)) {
    const source = node.data.filePath;
    const origin: Exclude<CanvasMediaOrigin, 'linked'> = isLikelyLocalPath(source) ? 'local' : 'generated';
    pushMediaPathReference(result, node, 'audio', source, origin);
    return result;
  }

  return result;
}

function dedupeMaterialItems(items: NodeMaterialItem[]): NodeMaterialItem[] {
  const seen = new Set<string>();
  const result: NodeMaterialItem[] = [];
  for (const item of items) {
    const key = `${item.mediaKind}:${item.sourceUrl}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function collectCanvasMediaReferences(nodes: CanvasNode[]): CanvasMediaReference[] {
  return nodes.flatMap((node) => collectNodeOwnedMediaReferences(node));
}

export function collectCanvasReferenceImages(nodes: CanvasNode[]): CanvasMediaReference[] {
  return collectCanvasMediaReferences(nodes).filter((item) => item.mediaKind === 'image');
}

export function collectCanvasReferenceVideos(nodes: CanvasNode[]): CanvasMediaReference[] {
  return collectCanvasMediaReferences(nodes).filter((item) => item.mediaKind === 'video');
}

export function collectNodeMaterialItems(
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  maxItems = 8
): NodeMaterialItem[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const selfNode = nodeMap.get(nodeId);
  if (!selfNode) {
    return [];
  }

  const ownItems: NodeMaterialItem[] = collectNodeOwnedMediaReferences(selfNode).map((reference) => ({
    key: `own:${reference.key}`,
    mediaKind: reference.mediaKind,
    sourceUrl: reference.sourceUrl,
    displayUrl: reference.displayUrl,
    origin: reference.origin,
    title: reference.nodeTitle,
    sourceNodeId: reference.nodeId,
    sourceNodeTitle: reference.nodeTitle,
  }));

  const linkedSourceNodeIds = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source)
    .filter((sourceId, index, list) => list.indexOf(sourceId) === index);

  const linkedItems: NodeMaterialItem[] = linkedSourceNodeIds.flatMap((sourceId) => {
    const sourceNode = nodeMap.get(sourceId);
    if (!sourceNode) {
      return [];
    }
    const sourceTitle = createNodeTitle(sourceNode);
    return collectNodeOwnedMediaReferences(sourceNode).map((reference) => ({
      key: `linked:${reference.key}`,
      mediaKind: reference.mediaKind,
      sourceUrl: reference.sourceUrl,
      displayUrl: reference.displayUrl,
      origin: 'linked' as const,
      title: sourceTitle,
      sourceNodeId: sourceNode.id,
      sourceNodeTitle: sourceTitle,
    }));
  });

  return dedupeMaterialItems([...ownItems, ...linkedItems]).slice(0, Math.max(1, maxItems));
}
