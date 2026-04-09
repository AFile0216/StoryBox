import {
  isExportImageNode,
  isImageEditNode,
  isUploadNode,
  isVideoNode,
  isVideoEditorNode,
  isVideoPreviewNode,
  isVideoStoryboardNode,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { GraphImageResolver } from './ports';

export class DefaultGraphImageResolver implements GraphImageResolver {
  collectInputImages(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceNodeIds = edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);

    const images = sourceNodeIds
      .map((sourceId) => nodeById.get(sourceId))
      .flatMap((node) => this.extractImages(node));

    return [...new Set(images)];
  }

  collectInputVideos(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceNodeIds = edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);

    const videos = sourceNodeIds
      .map((sourceId) => nodeById.get(sourceId))
      .flatMap((node) => this.extractVideos(node));

    return [...new Set(videos)];
  }

  private extractImages(node: CanvasNode | undefined): string[] {
    if (!node) {
      return [];
    }

    if (isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node)) {
      return node.data.imageUrl ? [node.data.imageUrl] : [];
    }

    return [];
  }

  private extractVideos(node: CanvasNode | undefined): string[] {
    if (!node) {
      return [];
    }

    if (isVideoNode(node) || isVideoPreviewNode(node) || isVideoEditorNode(node) || isVideoStoryboardNode(node)) {
      const candidatePaths = [
        node.data.filePath,
        (node.data as { outputFilePath?: string | null }).outputFilePath,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return candidatePaths.length > 0 ? candidatePaths : [];
    }

    return [];
  }
}
