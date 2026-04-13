import type { Edge, Node, XYPosition } from '@xyflow/react';

export const CANVAS_NODE_TYPES = {
  upload: 'uploadNode',
  imageEdit: 'imageNode',
  exportImage: 'exportImageNode',
  textAnnotation: 'textAnnotationNode',
  video: 'videoNode',
  videoPreview: 'videoPreviewNode',
  videoEditor: 'videoEditorNode',
  audio: 'audioNode',
  audioPreview: 'audioPreviewNode',
  videoStoryboard: 'videoStoryboardNode',
  group: 'groupNode',
  storyboardSplit: 'storyboardNode',
  storyboardGen: 'storyboardGenNode',
  chat: 'chatNode',
} as const;

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[keyof typeof CANVAS_NODE_TYPES];

export const DEFAULT_ASPECT_RATIO = '1:1';
export const AUTO_REQUEST_ASPECT_RATIO = 'auto';
export const DEFAULT_NODE_WIDTH = 220;
export const EXPORT_RESULT_NODE_DEFAULT_WIDTH = 384;
export const EXPORT_RESULT_NODE_LAYOUT_HEIGHT = 288;
export const EXPORT_RESULT_NODE_MIN_WIDTH = 168;
export const EXPORT_RESULT_NODE_MIN_HEIGHT = 168;

export const IMAGE_SIZES = ['0.5K', '1K', '2K', '4K'] as const;
export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface NodeDisplayData {
  displayName?: string;
  [key: string]: unknown;
}

export interface NodeImageData extends NodeDisplayData {
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio: string;
  isSizeManuallyAdjusted?: boolean;
  [key: string]: unknown;
}

export interface UploadImageNodeData extends NodeImageData {
  sourceFileName?: string | null;
}

export type ExportImageNodeResultKind =
  | 'generic'
  | 'storyboardGenOutput'
  | 'storyboardSplitExport'
  | 'storyboardFrameEdit';

export interface ExportImageNodeData extends NodeImageData {
  resultKind?: ExportImageNodeResultKind;
}

export interface GroupNodeData extends NodeDisplayData {
  label: string;
  collapsed?: boolean;
  expandedWidth?: number | null;
  expandedHeight?: number | null;
  [key: string]: unknown;
}

export type TextAnnotationMode =
  | 'text-to-image'
  | 'reverse-prompt'
  | 'plain-text'
  | 'text-to-image-prompt'
  | 'text-to-music-prompt'
  | 'text-to-video-prompt';

export interface TextReversePromptResult {
  analysis: string;
  prompts: {
    mj: Record<string, unknown>;
    nanobanana: Record<string, unknown>;
    jimeng: Record<string, unknown>;
  };
}

export interface TextAnnotationNodeData extends NodeDisplayData {
  content: string;
  mode: TextAnnotationMode;
  lastAppliedTaskType?: string | null;
  interfaceId?: string;
  modelId?: string;
  isGenerating?: boolean;
  lastGeneratedAt?: number | null;
  generationError?: string | null;
  generatedImageUrl?: string | null;
  generatedPreviewImageUrl?: string | null;
  reversePromptJson?: string | null;
  reversePromptResult?: TextReversePromptResult | null;
  [key: string]: unknown;
}

export type MediaTaskStatus = 'idle' | 'running' | 'success' | 'error';

export interface MediaFileNodeData extends NodeDisplayData {
  filePath: string | null;
  sourceFileName?: string | null;
  mimeType?: string | null;
  durationSec?: number | null;
}

export type VideoNodeTaskMode =
  | 'reference'
  | 'image-to-video'
  | 'first-last-frame'
  | 'audio-to-video'
  | 'video-storyboard-generation';

export interface VideoNodeData extends MediaFileNodeData {
  audioFilePath?: string | null;
  audioSourceFileName?: string | null;
  autoOpenPicker?: boolean;
  prompt: string;
  taskMode: VideoNodeTaskMode;
  interfaceId?: string;
  modelId?: string;
  aspectRatio?: string;
  generationSeconds?: number;
  taskStatus: MediaTaskStatus;
  taskMessage?: string | null;
  taskOutputSummary?: string | null;
  outputFilePath?: string | null;
  lastExecutedAt?: number | null;
}

export interface VideoPreviewFrameItem {
  id: string;
  sourceClipId: string;
  label: string;
  startSec: number;
  durationSec: number;
  imageUrl: string | null;
  previewImageUrl?: string | null;
}

export interface VideoEditorTextClip {
  id: string;
  text: string;
  startSec: number;
  durationSec: number;
  color?: string;
  fontSize?: number;
}

export interface VideoPreviewNodeData extends MediaFileNodeData {
  posterImageUrl?: string | null;
  frames?: VideoPreviewFrameItem[];
  textClips?: VideoEditorTextClip[];
  currentTimeSec?: number;
}

export interface AudioNodeData extends MediaFileNodeData {
  autoOpenPicker?: boolean;
  prompt: string;
  taskMode: 'text-to-music' | 'audio-to-video';
  taskStatus: MediaTaskStatus;
  taskMessage?: string | null;
  taskOutputSummary?: string | null;
  lastExecutedAt?: number | null;
}

export interface AudioPreviewNodeData extends MediaFileNodeData {}

export type ImageEditTaskMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-to-video'
  | 'super-resolution';

export type SuperResolutionLevel = '2x' | '4x' | '8x';

export interface ImageEditNodeData extends NodeImageData {
  prompt: string;
  model: string;
  size: ImageSize;
  requestAspectRatio?: string;
  taskMode?: ImageEditTaskMode;
  superResolutionLevel?: SuperResolutionLevel;
  extraParams?: Record<string, unknown>;
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationDurationMs?: number;
}

export interface StoryboardFrameItem {
  id: string;
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio?: string;
  note: string;
  order: number;
}

export interface StoryboardExportOptions {
  showFrameIndex: boolean;
  showFrameNote: boolean;
  notePlacement: 'overlay' | 'bottom';
  imageFit: 'cover' | 'contain';
  frameIndexPrefix: string;
  cellGap: number;
  outerPadding: number;
  fontSize: number;
  backgroundColor: string;
  textColor: string;
}

export interface StoryboardSplitNodeData {
  displayName?: string;
  aspectRatio: string;
  frameAspectRatio?: string;
  gridRows: number;
  gridCols: number;
  frames: StoryboardFrameItem[];
  exportOptions?: StoryboardExportOptions;
  [key: string]: unknown;
}

export interface StoryboardGenFrameItem {
  id: string;
  description: string;
  referenceIndex: number | null;
}

export type StoryboardRatioControlMode = 'overall' | 'cell';

export interface StoryboardGenNodeData {
  displayName?: string;
  sourceStoryboardNodeId?: string | null;
  syncedFromStoryboardAt?: number | null;
  gridRows: number;
  gridCols: number;
  frames: StoryboardGenFrameItem[];
  ratioControlMode?: StoryboardRatioControlMode;
  model: string;
  size: ImageSize;
  requestAspectRatio: string;
  extraParams?: Record<string, unknown>;
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio: string;
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationDurationMs?: number;
  [key: string]: unknown;
}

export type VideoStoryboardSegmentStatus = 'draft' | 'saved';

export interface VideoStoryboardSegment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  visualDesc?: string;
  dialogue?: string;
  notes?: string;
  tags?: string[];
  order: number;
  keyframeDataUrl?: string | null;
  keyframeReference?: string;
  status: VideoStoryboardSegmentStatus;
}

export interface VideoStoryboardNodeData extends MediaFileNodeData {
  currentTimeSec: number;
  selectionStartSec: number;
  selectionEndSec: number;
  draftText: string;
  activeSegmentId: string | null;
  linkedStoryboardGenNodeId?: string | null;
  segments: VideoStoryboardSegment[];
  lastCaptureDataUrl?: string | null;
}

export interface VideoEditorTimelineClip {
  id: string;
  sourceClipId: string;
  startSec: number;
  durationSec: number;
  note?: string;
}

export interface VideoEditorNodeData extends MediaFileNodeData {
  timelineClips: VideoEditorTimelineClip[];
  textClips: VideoEditorTextClip[];
  currentTimeSec: number;
  autoOpenEditor?: boolean;
  taskStatus: MediaTaskStatus;
  taskMessage?: string | null;
  taskOutputSummary?: string | null;
  outputFilePath?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs for vision support
}

export interface ChatNodeData extends NodeDisplayData {
  messages: ChatMessage[];
  inputText: string;
  interfaceId: string;
  modelId: string;
  isStreaming?: boolean;
  [key: string]: unknown;
}

export type CanvasNodeData =
  | UploadImageNodeData
  | ExportImageNodeData
  | TextAnnotationNodeData
  | VideoNodeData
  | VideoPreviewNodeData
  | VideoEditorNodeData
  | AudioNodeData
  | AudioPreviewNodeData
  | VideoStoryboardNodeData
  | GroupNodeData
  | ImageEditNodeData
  | StoryboardSplitNodeData
  | StoryboardGenNodeData
  | ChatNodeData;

export type CanvasEdgeRelation =
  | 'default'
  | 'text-flow'
  | 'image-flow'
  | 'video-flow'
  | 'audio-flow'
  | 'storyboard-map'
  | 'auto-generated';

export type CanvasEdgeLineStyle = 'solid' | 'dashed';
export type CanvasEdgeRoutingStyle = 'inherit' | 'spline' | 'orthogonal';

export interface CanvasEdgeData {
  relation?: CanvasEdgeRelation;
  autoGenerated?: boolean;
  color?: string | null;
  lineStyle?: CanvasEdgeLineStyle | null;
  routingStyle?: CanvasEdgeRoutingStyle | null;
  label?: string | null;
  [key: string]: unknown;
}

export type CanvasNode = Node<CanvasNodeData, CanvasNodeType>;
export type CanvasEdge = Edge<CanvasEdgeData>;

export interface NodeCreationDto {
  type: CanvasNodeType;
  position: XYPosition;
  data?: Partial<CanvasNodeData>;
}

export interface StoryboardNodeCreationDto {
  position: XYPosition;
  rows: number;
  cols: number;
  frames: StoryboardFrameItem[];
}

export const NODE_TOOL_TYPES = {
  crop: 'crop',
  annotate: 'annotate',
  splitStoryboard: 'split-storyboard',
} as const;

export type NodeToolType = (typeof NODE_TOOL_TYPES)[keyof typeof NODE_TOOL_TYPES];

export interface ActiveToolDialog {
  nodeId: string;
  toolType: NodeToolType;
}

export function isUploadNode(
  node: CanvasNode | null | undefined
): node is Node<UploadImageNodeData, typeof CANVAS_NODE_TYPES.upload> {
  return node?.type === CANVAS_NODE_TYPES.upload;
}

export function isImageEditNode(
  node: CanvasNode | null | undefined
): node is Node<ImageEditNodeData, typeof CANVAS_NODE_TYPES.imageEdit> {
  return node?.type === CANVAS_NODE_TYPES.imageEdit;
}

export function isExportImageNode(
  node: CanvasNode | null | undefined
): node is Node<ExportImageNodeData, typeof CANVAS_NODE_TYPES.exportImage> {
  return node?.type === CANVAS_NODE_TYPES.exportImage;
}

export function isGroupNode(
  node: CanvasNode | null | undefined
): node is Node<GroupNodeData, typeof CANVAS_NODE_TYPES.group> {
  return node?.type === CANVAS_NODE_TYPES.group;
}

export function isTextAnnotationNode(
  node: CanvasNode | null | undefined
): node is Node<TextAnnotationNodeData, typeof CANVAS_NODE_TYPES.textAnnotation> {
  return node?.type === CANVAS_NODE_TYPES.textAnnotation;
}

export function isVideoNode(
  node: CanvasNode | null | undefined
): node is Node<VideoNodeData, typeof CANVAS_NODE_TYPES.video> {
  return node?.type === CANVAS_NODE_TYPES.video;
}

export function isVideoPreviewNode(
  node: CanvasNode | null | undefined
): node is Node<VideoPreviewNodeData, typeof CANVAS_NODE_TYPES.videoPreview> {
  return node?.type === CANVAS_NODE_TYPES.videoPreview;
}

export function isVideoEditorNode(
  node: CanvasNode | null | undefined
): node is Node<VideoEditorNodeData, typeof CANVAS_NODE_TYPES.videoEditor> {
  return node?.type === CANVAS_NODE_TYPES.videoEditor;
}

export function isAudioNode(
  node: CanvasNode | null | undefined
): node is Node<AudioNodeData, typeof CANVAS_NODE_TYPES.audio> {
  return node?.type === CANVAS_NODE_TYPES.audio;
}

export function isAudioPreviewNode(
  node: CanvasNode | null | undefined
): node is Node<AudioPreviewNodeData, typeof CANVAS_NODE_TYPES.audioPreview> {
  return node?.type === CANVAS_NODE_TYPES.audioPreview;
}

export function isVideoStoryboardNode(
  node: CanvasNode | null | undefined
): node is Node<VideoStoryboardNodeData, typeof CANVAS_NODE_TYPES.videoStoryboard> {
  return node?.type === CANVAS_NODE_TYPES.videoStoryboard;
}

export function isStoryboardSplitNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardSplitNodeData, typeof CANVAS_NODE_TYPES.storyboardSplit> {
  return node?.type === CANVAS_NODE_TYPES.storyboardSplit;
}

export function isStoryboardGenNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardGenNodeData, typeof CANVAS_NODE_TYPES.storyboardGen> {
  return node?.type === CANVAS_NODE_TYPES.storyboardGen;
}

export function nodeHasImage(node: CanvasNode | null | undefined): boolean {
  if (!node) {
    return false;
  }

  if (isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node)) {
    return Boolean(node.data.imageUrl);
  }

  if (isStoryboardSplitNode(node)) {
    return node.data.frames.some((frame) => Boolean(frame.imageUrl));
  }

  if (isStoryboardGenNode(node)) {
    return Boolean(node.data.imageUrl);
  }

  return false;
}
