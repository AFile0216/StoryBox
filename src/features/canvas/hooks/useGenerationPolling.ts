import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';

import { useCanvasStore } from '@/stores/canvasStore';
import { canvasAiGateway } from '@/features/canvas/application/canvasServices';
import { prepareNodeImage } from '@/features/canvas/application/imageData';
import {
  buildGenerationErrorReport,
  CURRENT_RUNTIME_SESSION_ID,
} from '@/features/canvas/application/generationErrorReport';
import { showErrorDialog } from '@/features/canvas/application/errorDialog';
import { embedStoryboardImageMetadata } from '@/commands/image';
import { CANVAS_NODE_TYPES, type CanvasNode, type CanvasNodeData } from '@/features/canvas/domain/canvasNodes';

interface GenerationStoryboardMetadata {
  gridRows: number;
  gridCols: number;
  frameNotes: string[];
}

interface UseGenerationPollingOptions {
  apiKeys: Record<string, string>;
  nodes: CanvasNode[];
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  t: TFunction;
}

const GENERATION_JOB_POLL_INTERVAL_MS = 1400;

export function useGenerationPolling({
  apiKeys,
  nodes,
  updateNodeData,
  t,
}: UseGenerationPollingOptions) {
  const activeGenerationPollNodeIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const sleep = (delayMs: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      });

    const pendingExportNodes = nodes.filter((node) => {
      if (node.type !== CANVAS_NODE_TYPES.exportImage) {
        return false;
      }
      const data = node.data as Record<string, unknown>;
      return data.isGenerating === true && typeof data.generationJobId === 'string' && data.generationJobId.length > 0;
    });

    for (const pendingNode of pendingExportNodes) {
      if (activeGenerationPollNodeIdsRef.current.has(pendingNode.id)) {
        continue;
      }
      activeGenerationPollNodeIdsRef.current.add(pendingNode.id);

      void (async () => {
        try {
          while (true) {
            const currentNode = useCanvasStore.getState().nodes.find((node) => node.id === pendingNode.id);
            if (!currentNode) {
              break;
            }

            const currentData = currentNode.data as Record<string, unknown>;
            const jobId = typeof currentData.generationJobId === 'string' ? currentData.generationJobId : '';
            const isGenerating = currentData.isGenerating === true;
            if (!jobId || !isGenerating) {
              break;
            }

            const generationProviderId = typeof currentData.generationProviderId === 'string'
              ? currentData.generationProviderId
              : '';
            if (generationProviderId) {
              const providerApiKey = apiKeys[generationProviderId] ?? '';
              if (providerApiKey) {
                await canvasAiGateway.setApiKey(generationProviderId, providerApiKey).catch((error) => {
                  console.warn('[GenerationJob] set_api_key failed before poll', {
                    nodeId: pendingNode.id,
                    generationProviderId,
                    error,
                  });
                });
              }
            }

            const status = await canvasAiGateway.getGenerateImageJob(jobId).catch((error) => {
              console.warn('[GenerationJob] poll failed', { nodeId: pendingNode.id, jobId, error });
              return null;
            });
            if (!status) {
              await sleep(GENERATION_JOB_POLL_INTERVAL_MS);
              continue;
            }

            if (status.status === 'queued' || status.status === 'running') {
              await sleep(GENERATION_JOB_POLL_INTERVAL_MS);
              continue;
            }

            if (status.status === 'succeeded' && typeof status.result === 'string' && status.result.trim()) {
              const prepared = await prepareNodeImage(status.result);
              const storyboardMetadataRaw = currentData.generationStoryboardMetadata as GenerationStoryboardMetadata | undefined;
              const hasStoryboardMetadata = Boolean(
                storyboardMetadataRaw
                && Number.isFinite(storyboardMetadataRaw.gridRows)
                && Number.isFinite(storyboardMetadataRaw.gridCols)
                && Array.isArray(storyboardMetadataRaw.frameNotes)
              );
              let imageWithMetadata = prepared.imageUrl;
              if (hasStoryboardMetadata && storyboardMetadataRaw) {
                imageWithMetadata = await embedStoryboardImageMetadata(prepared.imageUrl, {
                  gridRows: Math.max(1, Math.round(storyboardMetadataRaw.gridRows)),
                  gridCols: Math.max(1, Math.round(storyboardMetadataRaw.gridCols)),
                  frameNotes: storyboardMetadataRaw.frameNotes,
                }).catch((error) => {
                  console.warn('[GenerationJob] embed storyboard metadata failed', {
                    nodeId: pendingNode.id,
                    error,
                  });
                  return prepared.imageUrl;
                });
              }
              const previewWithMetadata = prepared.previewImageUrl === prepared.imageUrl
                ? imageWithMetadata
                : prepared.previewImageUrl;

              updateNodeData(pendingNode.id, {
                imageUrl: imageWithMetadata,
                previewImageUrl: previewWithMetadata,
                aspectRatio: prepared.aspectRatio,
                isGenerating: false,
                generationStartedAt: null,
                generationJobId: null,
                generationProviderId: null,
                generationClientSessionId: null,
                generationStoryboardMetadata: undefined,
                generationError: null,
                generationErrorDetails: null,
                generationDebugContext: undefined,
              });
              break;
            }

            const errorMessage = status.error ?? (status.status === 'not_found' ? 'generation job not found' : 'generation failed');
            const generationClientSessionId = typeof currentData.generationClientSessionId === 'string'
              ? currentData.generationClientSessionId
              : '';
            const shouldShowDialog = generationClientSessionId === CURRENT_RUNTIME_SESSION_ID;
            if (shouldShowDialog) {
              const reportText = buildGenerationErrorReport({
                errorMessage,
                errorDetails: status.error ?? undefined,
                context: currentData.generationDebugContext,
              });
              void showErrorDialog(errorMessage, t('common.error'), status.error ?? undefined, reportText);
            }
            updateNodeData(pendingNode.id, {
              isGenerating: false,
              generationStartedAt: null,
              generationJobId: null,
              generationProviderId: null,
              generationClientSessionId: null,
              generationStoryboardMetadata: undefined,
              generationError: errorMessage,
              generationErrorDetails: status.error ?? null,
            });
            break;
          }
        } finally {
          activeGenerationPollNodeIdsRef.current.delete(pendingNode.id);
        }
      })();
    }
  }, [apiKeys, nodes, t, updateNodeData]);
}
