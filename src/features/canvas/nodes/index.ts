import { AudioNode } from './AudioNode';
import type { NodeTypes } from '@xyflow/react';

import { ChatNode } from './ChatNode';
import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageNode } from './ImageNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { UploadNode } from './UploadNode';
import { VideoNode } from './VideoNode';
import { VideoEditorNode } from './VideoEditorNode';
import { VideoPreviewNode } from './VideoPreviewNode';
import { VideoStoryboardNode } from './VideoStoryboardNode';

export const nodeTypes: NodeTypes = {
  audioNode: AudioNode,
  chatNode: ChatNode,
  exportImageNode: ImageNode,
  groupNode: GroupNode,
  imageNode: ImageEditNode,
  storyboardGenNode: StoryboardGenNode,
  storyboardNode: StoryboardNode,
  textAnnotationNode: TextAnnotationNode,
  uploadNode: UploadNode,
  videoNode: VideoNode,
  videoEditorNode: VideoEditorNode,
  videoPreviewNode: VideoPreviewNode,
  videoStoryboardNode: VideoStoryboardNode,
};

export {
  AudioNode,
  ChatNode,
  GroupNode,
  ImageEditNode,
  ImageNode,
  StoryboardGenNode,
  StoryboardNode,
  TextAnnotationNode,
  UploadNode,
  VideoNode,
  VideoEditorNode,
  VideoPreviewNode,
  VideoStoryboardNode,
};
