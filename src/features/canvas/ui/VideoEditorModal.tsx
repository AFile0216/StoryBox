import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Magnet,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  resolveImageDisplayUrl,
  resolveLocalAssetUrl,
} from '@/features/canvas/application/imageData';
import type {
  VideoEditorAudioAsset,
  VideoEditorAudioClip,
  VideoEditorTextClip,
  VideoEditorTimelineClip,
} from '@/features/canvas/domain/canvasNodes';

export interface VideoEditorSourceClipItem {
  id: string;
  label: string;
  imageUrl: string | null;
  previewImageUrl?: string | null;
}

export interface VideoEditorSourceAudioItem {
  id: string;
  label: string;
  filePath: string;
  durationSec?: number | null;
  origin: 'linked' | 'local';
}

export interface VideoEditorSavePayload {
  timelineClips: VideoEditorTimelineClip[];
  textClips: VideoEditorTextClip[];
  audioClips: VideoEditorAudioClip[];
  localAudioAssets: VideoEditorAudioAsset[];
  videoTrackIds: string[];
  textTrackIds: string[];
  audioTrackIds: string[];
  playheadSec: number;
}

export interface VideoEditorGeneratePayload {
  timelineClips: VideoEditorTimelineClip[];
  textClips: VideoEditorTextClip[];
  audioClips: VideoEditorAudioClip[];
}

interface VideoEditorModalProps {
  filePath: string | null;
  durationSec: number;
  sourceClips: VideoEditorSourceClipItem[];
  sourceAudios: VideoEditorSourceAudioItem[];
  initialTimelineClips: VideoEditorTimelineClip[];
  initialTextClips: VideoEditorTextClip[];
  initialAudioClips: VideoEditorAudioClip[];
  initialLocalAudioAssets: VideoEditorAudioAsset[];
  initialVideoTrackIds: string[];
  initialTextTrackIds: string[];
  initialAudioTrackIds: string[];
  initialPlayheadSec: number;
  onSave: (payload: VideoEditorSavePayload) => void;
  onGenerate: (payload: VideoEditorGeneratePayload) => void;
  onClose: () => void;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';
type TrackKind = 'video' | 'text' | 'audio';

interface TimelineClipLike {
  id: string;
  startSec: number;
  durationSec: number;
  trackId?: string;
}

interface ClipDragState {
  trackKind: TrackKind;
  trackId: string;
  clipId: string;
  mode: DragMode;
  originX: number;
  startSec: number;
  durationSec: number;
  timelineMaxSec: number;
  trackWidth: number;
}

interface VideoEditorSnapshot {
  timelineClips: VideoEditorTimelineClip[];
  textClips: VideoEditorTextClip[];
  audioClips: VideoEditorAudioClip[];
  localAudioAssets: VideoEditorAudioAsset[];
  videoTrackIds: string[];
  textTrackIds: string[];
  audioTrackIds: string[];
  playheadSec: number;
  activeVideoClipId: string | null;
  activeTextClipId: string | null;
  activeAudioClipId: string | null;
}

interface TextEditorState {
  clipId: string;
  draft: string;
  x: number;
  y: number;
}

interface DragTrackTarget {
  kind: TrackKind;
  trackId: string;
}

const DEFAULT_CLIP_DURATION_SEC = 2;
const DEFAULT_AUDIO_CLIP_DURATION_SEC = 3;
const MIN_CLIP_DURATION_SEC = 0.5;
const SNAP_THRESHOLD_RATIO = 0.01;
const SNAP_THRESHOLD_MIN_SEC = 0.08;
const SNAP_THRESHOLD_MAX_SEC = 0.4;
const EDITOR_HISTORY_LIMIT = 40;
const DEFAULT_VIDEO_TRACK_ID = 'video-track-1';
const DEFAULT_TEXT_TRACK_ID = 'text-track-1';
const DEFAULT_AUDIO_TRACK_ID = 'audio-track-1';
const SOURCE_CLIP_TRANSFER_KEY = 'storybox/source-clip-id';
const SOURCE_CLIP_TRANSFER_KEY_FALLBACK = 'application/x-storybox-source-clip-id';
const SOURCE_AUDIO_TRANSFER_KEY = 'storybox/source-audio-id';
const SOURCE_AUDIO_TRANSFER_KEY_FALLBACK = 'application/x-storybox-source-audio-id';
const WAVEFORM_BUCKET_COUNT = 56;
const AUDIO_SEEK_TOLERANCE_SEC = 0.12;
const FALLBACK_WAVEFORM_BINS = Array.from(
  { length: WAVEFORM_BUCKET_COUNT },
  (_, index) => clamp(0.22 + Math.abs(Math.sin(index * 0.42)) * 0.42, 0.08, 1)
);

function createTrackId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createSequenceClipId(): string {
  return `video-seq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createTextClipId(): string {
  return `video-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createAudioClipId(): string {
  return `video-audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createAudioAssetId(): string {
  return `audio-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createAudioContextInstance(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const AudioContextCtor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  return new AudioContextCtor();
}

async function decodeWaveformBins(
  context: AudioContext,
  audioUrl: string,
  bucketCount = WAVEFORM_BUCKET_COUNT
): Promise<number[]> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`waveform fetch failed: ${response.status}`);
  }
  const audioData = await response.arrayBuffer();
  const decoded = await context.decodeAudioData(audioData.slice(0));
  const channelCount = Math.max(1, decoded.numberOfChannels);
  const sampleLength = decoded.length;
  if (sampleLength <= 0) {
    return FALLBACK_WAVEFORM_BINS;
  }

  const downsample = Math.max(1, Math.floor(sampleLength / Math.max(8, bucketCount)));
  const samples = Math.ceil(sampleLength / downsample);
  const merged = new Float32Array(samples);
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = decoded.getChannelData(channelIndex);
    let writeIndex = 0;
    for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex += downsample) {
      const value = channelData[sampleIndex] ?? 0;
      merged[writeIndex] += Math.abs(value) / channelCount;
      writeIndex += 1;
      if (writeIndex >= samples) {
        break;
      }
    }
  }

  const bins = new Array(bucketCount).fill(0);
  const chunkSize = Math.max(1, Math.floor(merged.length / bucketCount));
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * chunkSize;
    const end = Math.min(merged.length, start + chunkSize);
    let max = 0;
    for (let i = start; i < end; i += 1) {
      if (merged[i] > max) {
        max = merged[i];
      }
    }
    bins[bucketIndex] = max;
  }

  const maxBin = bins.reduce((max, value) => Math.max(max, value), 0);
  if (maxBin <= 0.0001) {
    return FALLBACK_WAVEFORM_BINS;
  }
  return bins.map((value) => clamp(value / maxBin, 0.08, 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function resolveClipEndSec(clip: TimelineClipLike): number {
  const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
  const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
  return startSec + durationSec;
}

function toTimelinePercent(valueSec: number, timelineSec: number): number {
  const safeTimelineSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(timelineSec, 2));
  const safeValueSec = Math.max(0, toFiniteNumber(valueSec, 0));
  return clamp((safeValueSec / safeTimelineSec) * 100, 0, 100);
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '0.0s';
  }
  return `${Math.max(0, value).toFixed(1)}s`;
}

function resolveDroppedValue(event: ReactDragEvent<HTMLElement>, keys: string[]): string | null {
  for (const key of keys) {
    const rawValue = event.dataTransfer.getData(key);
    const normalized = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function uniqueTrackIds(ids: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  ids.forEach((id) => {
    const normalized = typeof id === 'string' ? id.trim() : '';
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function resolveTrackId(
  candidate: string | null | undefined,
  trackIds: string[],
  fallbackTrackId: string
): string {
  const normalized = typeof candidate === 'string' ? candidate.trim() : '';
  if (normalized && trackIds.includes(normalized)) {
    return normalized;
  }
  return trackIds[0] ?? fallbackTrackId;
}

function resolveInitialTrackIds<T extends { trackId?: string }>(
  initialTrackIds: string[] | undefined,
  clips: T[],
  fallbackTrackId: string
): string[] {
  return uniqueTrackIds([
    ...(initialTrackIds ?? []),
    ...clips.map((clip) => clip.trackId),
    fallbackTrackId,
  ]);
}

function sortTrackClips<T extends TimelineClipLike>(clips: T[]): T[] {
  return [...clips].sort((left, right) => {
    if (left.startSec !== right.startSec) {
      return left.startSec - right.startSec;
    }
    return left.id.localeCompare(right.id);
  });
}

function normalizeTrackClips<T extends TimelineClipLike>(
  clips: T[],
  trackIds: string[],
  fallbackTrackId: string
): T[] {
  const safeTrackIds = uniqueTrackIds([...trackIds, fallbackTrackId]);
  const grouped = new Map<string, T[]>();
  safeTrackIds.forEach((trackId) => grouped.set(trackId, []));

  clips.forEach((clip) => {
    if (typeof clip.id !== 'string' || clip.id.trim().length === 0) {
      return;
    }
    const normalizedTrackId = resolveTrackId(clip.trackId, safeTrackIds, fallbackTrackId);
    const sanitizedClip = {
      ...clip,
      trackId: normalizedTrackId,
      startSec: Math.max(0, toFiniteNumber(clip.startSec, 0)),
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC)),
    } as T;
    grouped.get(normalizedTrackId)?.push(sanitizedClip);
  });

  const normalized: T[] = [];
  safeTrackIds.forEach((trackId) => {
    const sorted = sortTrackClips(grouped.get(trackId) ?? []);
    let previousEnd = 0;
    sorted.forEach((clip) => {
      const nextStart = Math.max(clip.startSec, previousEnd);
      const nextDuration = Math.max(MIN_CLIP_DURATION_SEC, clip.durationSec);
      normalized.push({
        ...clip,
        trackId,
        startSec: nextStart,
        durationSec: nextDuration,
      } as T);
      previousEnd = nextStart + nextDuration;
    });
  });

  return normalized;
}

function findAvailableStartSecInTrack<T extends TimelineClipLike>(
  clips: T[],
  trackId: string,
  trackIds: string[],
  fallbackTrackId: string,
  preferredStartSec: number,
  durationSec: number
): number {
  const resolvedTrackId = resolveTrackId(trackId, trackIds, fallbackTrackId);
  const trackClips = sortTrackClips(
    clips.filter((clip) => resolveTrackId(clip.trackId, trackIds, fallbackTrackId) === resolvedTrackId)
  );
  let candidate = Math.max(0, toFiniteNumber(preferredStartSec, 0));
  const safeDurationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(durationSec, MIN_CLIP_DURATION_SEC));

  for (const clip of trackClips) {
    const clipStart = Math.max(0, toFiniteNumber(clip.startSec, 0));
    const clipEnd = clipStart + Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));

    if (candidate + safeDurationSec <= clipStart) {
      break;
    }
    if (candidate >= clipEnd) {
      continue;
    }
    candidate = clipEnd;
  }

  return candidate;
}

function findActiveTrackClip<T extends TimelineClipLike>(
  clips: T[],
  timeSec: number,
  trackIds: string[],
  fallbackTrackId: string
): T | null {
  const safeTimeSec = Math.max(0, toFiniteNumber(timeSec, 0));
  const sorted = [...clips].sort((left, right) => {
    const leftTrack = resolveTrackId(left.trackId, trackIds, fallbackTrackId);
    const rightTrack = resolveTrackId(right.trackId, trackIds, fallbackTrackId);
    if (leftTrack !== rightTrack) {
      return trackIds.indexOf(leftTrack) - trackIds.indexOf(rightTrack);
    }
    if (left.startSec !== right.startSec) {
      return left.startSec - right.startSec;
    }
    return left.id.localeCompare(right.id);
  });

  return sorted.find((clip) => {
    const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
    const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
    return safeTimeSec >= startSec && safeTimeSec < startSec + durationSec;
  }) ?? null;
}

function collectTrackEdges<T extends TimelineClipLike>(clips: T[], excludeClipId?: string): number[] {
  const edges: number[] = [];
  clips.forEach((clip) => {
    if (excludeClipId && clip.id === excludeClipId) {
      return;
    }
    const startSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
    const durationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
    edges.push(startSec);
    edges.push(startSec + durationSec);
  });
  return edges;
}

function collectTrackEdgesForTrack<T extends TimelineClipLike>(
  clips: T[],
  targetTrackId: string,
  trackIds: string[],
  fallbackTrackId: string,
  excludeClipId?: string
): number[] {
  const resolvedTrackId = resolveTrackId(targetTrackId, trackIds, fallbackTrackId);
  const inTrack = clips.filter((clip) => resolveTrackId(clip.trackId, trackIds, fallbackTrackId) === resolvedTrackId);
  return collectTrackEdges(inTrack, excludeClipId);
}

function resolveSnapThresholdSec(timelineMaxSec: number): number {
  return clamp(
    timelineMaxSec * SNAP_THRESHOLD_RATIO,
    SNAP_THRESHOLD_MIN_SEC,
    SNAP_THRESHOLD_MAX_SEC
  );
}

function findClosestAnchor(
  targetSec: number,
  anchors: number[],
  thresholdSec: number
): { anchor: number; delta: number } | null {
  let matched: { anchor: number; delta: number } | null = null;
  for (const anchor of anchors) {
    const delta = Math.abs(anchor - targetSec);
    if (delta > thresholdSec) {
      continue;
    }
    if (!matched || delta < matched.delta) {
      matched = { anchor, delta };
    }
  }
  return matched;
}

function resolveSnappedClip(
  clip: TimelineClipLike,
  mode: DragMode,
  anchors: number[],
  thresholdSec: number
): Pick<TimelineClipLike, 'startSec' | 'durationSec'> {
  if (anchors.length === 0) {
    return { startSec: clip.startSec, durationSec: clip.durationSec };
  }

  const clipEnd = clip.startSec + clip.durationSec;
  if (mode === 'move') {
    const snapStart = findClosestAnchor(clip.startSec, anchors, thresholdSec);
    const snapEnd = findClosestAnchor(clipEnd, anchors, thresholdSec);

    if (!snapStart && !snapEnd) {
      return { startSec: clip.startSec, durationSec: clip.durationSec };
    }
    if (!snapEnd || (snapStart && snapStart.delta <= snapEnd.delta)) {
      return {
        startSec: Math.max(0, snapStart!.anchor),
        durationSec: clip.durationSec,
      };
    }
    return {
      startSec: Math.max(0, snapEnd.anchor - clip.durationSec),
      durationSec: clip.durationSec,
    };
  }

  if (mode === 'resize-left') {
    const snapStart = findClosestAnchor(clip.startSec, anchors, thresholdSec);
    if (!snapStart) {
      return { startSec: clip.startSec, durationSec: clip.durationSec };
    }
    const nextStart = Math.max(0, Math.min(snapStart.anchor, clipEnd - MIN_CLIP_DURATION_SEC));
    return {
      startSec: nextStart,
      durationSec: clipEnd - nextStart,
    };
  }

  const snapEnd = findClosestAnchor(clipEnd, anchors, thresholdSec);
  if (!snapEnd) {
    return { startSec: clip.startSec, durationSec: clip.durationSec };
  }
  const nextEnd = Math.max(clip.startSec + MIN_CLIP_DURATION_SEC, snapEnd.anchor);
  return {
    startSec: clip.startSec,
    durationSec: nextEnd - clip.startSec,
  };
}

function resolveDragSnapGuideSec(
  dragState: ClipDragState,
  deltaSec: number,
  anchors: number[],
  snapEnabled: boolean
): number | null {
  if (!snapEnabled || anchors.length === 0) {
    return null;
  }

  const snapThresholdSec = resolveSnapThresholdSec(dragState.timelineMaxSec);
  if (dragState.mode === 'move') {
    const startSec = Math.max(0, dragState.startSec + deltaSec);
    const endSec = startSec + dragState.durationSec;
    const snapStart = findClosestAnchor(startSec, anchors, snapThresholdSec);
    const snapEnd = findClosestAnchor(endSec, anchors, snapThresholdSec);
    if (!snapStart && !snapEnd) {
      return null;
    }
    if (!snapEnd || (snapStart && snapStart.delta <= snapEnd.delta)) {
      return snapStart?.anchor ?? null;
    }
    return snapEnd.anchor;
  }

  if (dragState.mode === 'resize-left') {
    const startSec = Math.max(
      0,
      Math.min(dragState.startSec + deltaSec, dragState.startSec + dragState.durationSec - MIN_CLIP_DURATION_SEC)
    );
    return findClosestAnchor(startSec, anchors, snapThresholdSec)?.anchor ?? null;
  }

  const endSec = Math.max(
    dragState.startSec + MIN_CLIP_DURATION_SEC,
    dragState.startSec + dragState.durationSec + deltaSec
  );
  return findClosestAnchor(endSec, anchors, snapThresholdSec)?.anchor ?? null;
}

function applyCenterCrossSwap<T extends TimelineClipLike>(
  clips: T[],
  dragClipId: string,
  targetTrackId: string,
  trackIds: string[],
  fallbackTrackId: string,
  previousCenterSec: number,
  currentCenterSec: number
): T[] {
  if (!Number.isFinite(previousCenterSec) || !Number.isFinite(currentCenterSec)) {
    return clips;
  }

  const direction = currentCenterSec - previousCenterSec;
  if (Math.abs(direction) < 0.0001) {
    return clips;
  }

  const resolvedTrackId = resolveTrackId(targetTrackId, trackIds, fallbackTrackId);
  const draggingClip = clips.find((clip) => clip.id === dragClipId);
  if (!draggingClip) {
    return clips;
  }

  const siblings = sortTrackClips(
    clips.filter((clip) => (
      clip.id !== dragClipId
      && resolveTrackId(clip.trackId, trackIds, fallbackTrackId) === resolvedTrackId
    ))
  );
  if (siblings.length === 0) {
    return clips;
  }

  const crossed = siblings.find((clip) => {
    const center = clip.startSec + clip.durationSec / 2;
    if (direction > 0) {
      return center > previousCenterSec && center <= currentCenterSec;
    }
    return center < previousCenterSec && center >= currentCenterSec;
  });
  if (!crossed) {
    return clips;
  }

  const nextDragStart = crossed.startSec;
  const nextCrossedStart = draggingClip.startSec;
  return clips.map((clip) => {
    if (clip.id === dragClipId) {
      return {
        ...clip,
        trackId: resolvedTrackId,
        startSec: nextDragStart,
      } as T;
    }
    if (clip.id === crossed.id) {
      return {
        ...clip,
        startSec: nextCrossedStart,
      } as T;
    }
    return clip;
  });
}

function applyDragToTrack<T extends TimelineClipLike>(
  clips: T[],
  dragState: ClipDragState,
  trackIds: string[],
  fallbackTrackId: string,
  deltaSec: number,
  snapAnchors: number[],
  snapEnabled: boolean,
  targetTrackIdOverride?: string,
  normalizeAfterApply = true
): T[] {
  const targetTrackId = resolveTrackId(
    targetTrackIdOverride ?? dragState.trackId,
    trackIds,
    fallbackTrackId
  );
  const snapThresholdSec = resolveSnapThresholdSec(dragState.timelineMaxSec);
  const next = clips.map((clip) => {
    if (clip.id !== dragState.clipId) {
      return clip;
    }

    if (dragState.mode === 'move') {
      const movedClip = {
        ...clip,
        trackId: targetTrackId,
        startSec: Math.max(0, dragState.startSec + deltaSec),
      };
      if (!snapEnabled) {
        return movedClip;
      }
      const snapped = resolveSnappedClip(movedClip, dragState.mode, snapAnchors, snapThresholdSec);
      return {
        ...movedClip,
        ...snapped,
      };
    }

    if (dragState.mode === 'resize-left') {
      const clipEnd = dragState.startSec + dragState.durationSec;
      const nextStart = Math.max(
        0,
        Math.min(dragState.startSec + deltaSec, clipEnd - MIN_CLIP_DURATION_SEC)
      );
      const resizedClip = {
        ...clip,
        trackId: targetTrackId,
        startSec: nextStart,
        durationSec: clipEnd - nextStart,
      };
      if (!snapEnabled) {
        return resizedClip;
      }
      const snapped = resolveSnappedClip(resizedClip, dragState.mode, snapAnchors, snapThresholdSec);
      return {
        ...resizedClip,
        ...snapped,
      };
    }

    const resizedClip = {
      ...clip,
      trackId: targetTrackId,
      durationSec: Math.max(MIN_CLIP_DURATION_SEC, dragState.durationSec + deltaSec),
    };
    if (!snapEnabled) {
      return resizedClip;
    }
    const snapped = resolveSnappedClip(resizedClip, dragState.mode, snapAnchors, snapThresholdSec);
    return {
      ...resizedClip,
      ...snapped,
    };
  });

  if (!normalizeAfterApply) {
    return next;
  }
  return normalizeTrackClips(next, trackIds, fallbackTrackId);
}

function resolveTimelineDuration(
  durationSec: number,
  timelineClips: VideoEditorTimelineClip[],
  textClips: VideoEditorTextClip[],
  audioClips: VideoEditorAudioClip[]
): number {
  const videoEnd = timelineClips.reduce(
    (max, clip) => Math.max(max, resolveClipEndSec(clip)),
    0
  );
  const textEnd = textClips.reduce(
    (max, clip) => Math.max(max, resolveClipEndSec(clip)),
    0
  );
  const audioEnd = audioClips.reduce(
    (max, clip) => Math.max(max, resolveClipEndSec(clip)),
    0
  );
  const safeDurationSec = Math.max(0, toFiniteNumber(durationSec, 0));

  return Math.max(2, safeDurationSec, videoEnd, textEnd, audioEnd);
}

function cloneTimelineClips(clips: VideoEditorTimelineClip[]): VideoEditorTimelineClip[] {
  return clips.map((clip) => ({ ...clip }));
}

function cloneTextClips(clips: VideoEditorTextClip[]): VideoEditorTextClip[] {
  return clips.map((clip) => ({ ...clip }));
}

function cloneAudioClips(clips: VideoEditorAudioClip[]): VideoEditorAudioClip[] {
  return clips.map((clip) => ({ ...clip }));
}

function cloneAudioAssets(assets: VideoEditorAudioAsset[]): VideoEditorAudioAsset[] {
  return assets.map((asset) => ({ ...asset }));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function areTimelineClipsEqual(
  left: VideoEditorTimelineClip[],
  right: VideoEditorTimelineClip[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftClip = left[index];
    const rightClip = right[index];
    if (
      leftClip.id !== rightClip.id
      || leftClip.sourceClipId !== rightClip.sourceClipId
      || leftClip.trackId !== rightClip.trackId
      || leftClip.startSec !== rightClip.startSec
      || leftClip.durationSec !== rightClip.durationSec
      || leftClip.note !== rightClip.note
    ) {
      return false;
    }
  }
  return true;
}

function areTextClipsEqual(
  left: VideoEditorTextClip[],
  right: VideoEditorTextClip[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftClip = left[index];
    const rightClip = right[index];
    if (
      leftClip.id !== rightClip.id
      || leftClip.trackId !== rightClip.trackId
      || leftClip.text !== rightClip.text
      || leftClip.startSec !== rightClip.startSec
      || leftClip.durationSec !== rightClip.durationSec
      || leftClip.color !== rightClip.color
      || leftClip.fontSize !== rightClip.fontSize
    ) {
      return false;
    }
  }
  return true;
}

function areAudioClipsEqual(
  left: VideoEditorAudioClip[],
  right: VideoEditorAudioClip[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftClip = left[index];
    const rightClip = right[index];
    if (
      leftClip.id !== rightClip.id
      || leftClip.audioAssetId !== rightClip.audioAssetId
      || leftClip.audioFilePath !== rightClip.audioFilePath
      || leftClip.label !== rightClip.label
      || leftClip.trackId !== rightClip.trackId
      || leftClip.startSec !== rightClip.startSec
      || leftClip.durationSec !== rightClip.durationSec
      || leftClip.volume !== rightClip.volume
    ) {
      return false;
    }
  }
  return true;
}

function areAudioAssetsEqual(
  left: VideoEditorAudioAsset[],
  right: VideoEditorAudioAsset[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftAsset = left[index];
    const rightAsset = right[index];
    if (
      leftAsset.id !== rightAsset.id
      || leftAsset.label !== rightAsset.label
      || leftAsset.filePath !== rightAsset.filePath
      || leftAsset.durationSec !== rightAsset.durationSec
    ) {
      return false;
    }
  }
  return true;
}

function areSnapshotsEqual(left: VideoEditorSnapshot, right: VideoEditorSnapshot): boolean {
  return (
    left.playheadSec === right.playheadSec
    && left.activeVideoClipId === right.activeVideoClipId
    && left.activeTextClipId === right.activeTextClipId
    && left.activeAudioClipId === right.activeAudioClipId
    && areStringArraysEqual(left.videoTrackIds, right.videoTrackIds)
    && areStringArraysEqual(left.textTrackIds, right.textTrackIds)
    && areStringArraysEqual(left.audioTrackIds, right.audioTrackIds)
    && areTimelineClipsEqual(left.timelineClips, right.timelineClips)
    && areTextClipsEqual(left.textClips, right.textClips)
    && areAudioClipsEqual(left.audioClips, right.audioClips)
    && areAudioAssetsEqual(left.localAudioAssets, right.localAudioAssets)
  );
}

export const VideoEditorModal = memo(({
  filePath,
  durationSec,
  sourceClips,
  sourceAudios,
  initialTimelineClips,
  initialTextClips,
  initialAudioClips,
  initialLocalAudioAssets,
  initialVideoTrackIds,
  initialTextTrackIds,
  initialAudioTrackIds,
  initialPlayheadSec,
  onSave,
  onGenerate,
  onClose,
}: VideoEditorModalProps) => {
  const { t } = useTranslation();
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const tickerRef = useRef<number | null>(null);
  const audioElementMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const waveformAudioContextRef = useRef<AudioContext | null>(null);
  const waveformLoadingPathSetRef = useRef<Set<string>>(new Set());
  const timelineClipsRef = useRef<VideoEditorTimelineClip[]>([]);
  const textClipsRef = useRef<VideoEditorTextClip[]>([]);
  const audioClipsRef = useRef<VideoEditorAudioClip[]>([]);
  const dragSnapshotRef = useRef<VideoEditorSnapshot | null>(null);
  const dragHistoryPushedRef = useRef(false);
  const dragTargetTrackIdRef = useRef<string | null>(null);
  const dragLastCenterSecRef = useRef<number | null>(null);
  const autoImportedSourceClipIdsRef = useRef<Set<string>>(new Set());
  const textEditorPanelRef = useRef<HTMLDivElement | null>(null);

  const [videoTrackIds, setVideoTrackIds] = useState<string[]>(() => (
    resolveInitialTrackIds(initialVideoTrackIds, initialTimelineClips, DEFAULT_VIDEO_TRACK_ID)
  ));
  const [textTrackIds, setTextTrackIds] = useState<string[]>(() => (
    resolveInitialTrackIds(initialTextTrackIds, initialTextClips, DEFAULT_TEXT_TRACK_ID)
  ));
  const [audioTrackIds, setAudioTrackIds] = useState<string[]>(() => (
    resolveInitialTrackIds(initialAudioTrackIds, initialAudioClips, DEFAULT_AUDIO_TRACK_ID)
  ));

  const [timelineClips, setTimelineClips] = useState<VideoEditorTimelineClip[]>(() => (
    normalizeTrackClips(
      initialTimelineClips,
      resolveInitialTrackIds(initialVideoTrackIds, initialTimelineClips, DEFAULT_VIDEO_TRACK_ID),
      DEFAULT_VIDEO_TRACK_ID
    )
  ));
  const [textClips, setTextClips] = useState<VideoEditorTextClip[]>(() => (
    normalizeTrackClips(
      initialTextClips,
      resolveInitialTrackIds(initialTextTrackIds, initialTextClips, DEFAULT_TEXT_TRACK_ID),
      DEFAULT_TEXT_TRACK_ID
    )
  ));
  const [audioClips, setAudioClips] = useState<VideoEditorAudioClip[]>(() => (
    normalizeTrackClips(
      initialAudioClips,
      resolveInitialTrackIds(initialAudioTrackIds, initialAudioClips, DEFAULT_AUDIO_TRACK_ID),
      DEFAULT_AUDIO_TRACK_ID
    )
  ));
  const [localAudioAssets, setLocalAudioAssets] = useState<VideoEditorAudioAsset[]>(
    () => cloneAudioAssets(initialLocalAudioAssets)
  );

  const [playheadSec, setPlayheadSec] = useState(Math.max(0, initialPlayheadSec));
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragState, setDragState] = useState<ClipDragState | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [activeVideoClipId, setActiveVideoClipId] = useState<string | null>(null);
  const [activeTextClipId, setActiveTextClipId] = useState<string | null>(null);
  const [activeAudioClipId, setActiveAudioClipId] = useState<string | null>(null);
  const [selectedVideoTrackId, setSelectedVideoTrackId] = useState<string>(() => (
    resolveInitialTrackIds(initialVideoTrackIds, initialTimelineClips, DEFAULT_VIDEO_TRACK_ID)[0]
    ?? DEFAULT_VIDEO_TRACK_ID
  ));
  const [selectedTextTrackId, setSelectedTextTrackId] = useState<string>(() => (
    resolveInitialTrackIds(initialTextTrackIds, initialTextClips, DEFAULT_TEXT_TRACK_ID)[0]
    ?? DEFAULT_TEXT_TRACK_ID
  ));
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string>(() => (
    resolveInitialTrackIds(initialAudioTrackIds, initialAudioClips, DEFAULT_AUDIO_TRACK_ID)[0]
    ?? DEFAULT_AUDIO_TRACK_ID
  ));
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [undoStack, setUndoStack] = useState<VideoEditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<VideoEditorSnapshot[]>([]);
  const [textEditorState, setTextEditorState] = useState<TextEditorState | null>(null);
  const [isVideoNoteEditing, setIsVideoNoteEditing] = useState(false);
  const [dragHoverTrack, setDragHoverTrack] = useState<DragTrackTarget | null>(null);
  const [dragSnapGuideSec, setDragSnapGuideSec] = useState<number | null>(null);
  const [waveformByPath, setWaveformByPath] = useState<Record<string, number[]>>({});

  const sourceClipMap = useMemo(
    () => new Map(sourceClips.map((clip) => [clip.id, clip])),
    [sourceClips]
  );

  useEffect(() => {
    const connectedSourceClipIds = sourceClips
      .map((clip) => clip.id)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);
    const connectedSourceSet = new Set(connectedSourceClipIds);
    const importedSet = autoImportedSourceClipIdsRef.current;

    [...importedSet].forEach((id) => {
      if (!connectedSourceSet.has(id)) {
        importedSet.delete(id);
      }
    });

    if (connectedSourceClipIds.length === 0) {
      return;
    }

    setTimelineClips((previous) => {
      const existingSourceIds = new Set(previous.map((clip) => clip.sourceClipId));
      existingSourceIds.forEach((id) => importedSet.add(id));

      const pendingSourceIds = connectedSourceClipIds.filter(
        (sourceClipId) => !existingSourceIds.has(sourceClipId) && !importedSet.has(sourceClipId)
      );
      if (pendingSourceIds.length === 0) {
        return previous;
      }

      const resolvedTrackIds = resolveInitialTrackIds(
        videoTrackIds,
        previous,
        DEFAULT_VIDEO_TRACK_ID
      );
      const targetTrackId = resolveTrackId(
        selectedVideoTrackId,
        resolvedTrackIds,
        DEFAULT_VIDEO_TRACK_ID
      );

      const nextClips = [...previous];
      let cursorSec = nextClips.reduce(
        (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
        0
      );

      pendingSourceIds.forEach((sourceClipId) => {
        const startSec = findAvailableStartSecInTrack(
          nextClips,
          targetTrackId,
          resolvedTrackIds,
          DEFAULT_VIDEO_TRACK_ID,
          cursorSec,
          DEFAULT_CLIP_DURATION_SEC
        );
        nextClips.push({
          id: createSequenceClipId(),
          sourceClipId,
          trackId: targetTrackId,
          startSec,
          durationSec: DEFAULT_CLIP_DURATION_SEC,
        });
        cursorSec = startSec + DEFAULT_CLIP_DURATION_SEC;
        importedSet.add(sourceClipId);
      });

      return normalizeTrackClips(nextClips, resolvedTrackIds, DEFAULT_VIDEO_TRACK_ID);
    });
  }, [selectedVideoTrackId, sourceClips, videoTrackIds]);

  const audioSourceItems = useMemo(() => {
    const deduped = new Map<string, VideoEditorSourceAudioItem>();
    sourceAudios.forEach((source) => {
      deduped.set(source.id, source);
    });
    localAudioAssets.forEach((asset) => {
      if (!asset.filePath || asset.filePath.trim().length === 0) {
        return;
      }
      deduped.set(asset.id, {
        id: asset.id,
        label: asset.label,
        filePath: asset.filePath,
        durationSec: asset.durationSec,
        origin: 'local',
      });
    });
    return [...deduped.values()];
  }, [localAudioAssets, sourceAudios]);

  const audioSourceMap = useMemo(
    () => new Map(audioSourceItems.map((item) => [item.id, item])),
    [audioSourceItems]
  );

  useEffect(() => {
    const distinctAudioPaths = [...new Set(
      audioClips
        .map((clip) => (typeof clip.audioFilePath === 'string' ? clip.audioFilePath.trim() : ''))
        .filter((path) => path.length > 0)
    )];
    if (distinctAudioPaths.length === 0) {
      return;
    }

    let cancelled = false;
    distinctAudioPaths.forEach((audioPath) => {
      if (waveformByPath[audioPath] || waveformLoadingPathSetRef.current.has(audioPath)) {
        return;
      }
      waveformLoadingPathSetRef.current.add(audioPath);

      void (async () => {
        try {
          const context = waveformAudioContextRef.current ?? createAudioContextInstance();
          if (context) {
            waveformAudioContextRef.current = context;
          }
          const bins = context
            ? await decodeWaveformBins(context, resolveLocalAssetUrl(audioPath), WAVEFORM_BUCKET_COUNT)
            : FALLBACK_WAVEFORM_BINS;
          if (cancelled) {
            return;
          }
          setWaveformByPath((previous) => (
            previous[audioPath]
              ? previous
              : { ...previous, [audioPath]: bins }
          ));
        } catch {
          if (cancelled) {
            return;
          }
          setWaveformByPath((previous) => (
            previous[audioPath]
              ? previous
              : { ...previous, [audioPath]: FALLBACK_WAVEFORM_BINS }
          ));
        } finally {
          waveformLoadingPathSetRef.current.delete(audioPath);
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [audioClips, waveformByPath]);

  useEffect(() => {
    const clipById = new Map(audioClips.map((clip) => [clip.id, clip]));
    const audioMap = audioElementMapRef.current;

    // Dispose elements for removed clips.
    for (const [clipId, element] of audioMap.entries()) {
      if (clipById.has(clipId)) {
        continue;
      }
      element.pause();
      element.src = '';
      audioMap.delete(clipId);
    }

    // Keep pool in sync.
    for (const clip of audioClips) {
      const audioPath = typeof clip.audioFilePath === 'string' ? clip.audioFilePath.trim() : '';
      if (!audioPath) {
        continue;
      }

      let element = audioMap.get(clip.id);
      const resolvedSrc = resolveLocalAssetUrl(audioPath);
      if (!element) {
        element = new Audio(resolvedSrc);
        element.preload = 'auto';
        element.crossOrigin = 'anonymous';
        audioMap.set(clip.id, element);
      } else if (element.src !== resolvedSrc) {
        element.pause();
        element.src = resolvedSrc;
      }
      element.volume = clamp(toFiniteNumber(clip.volume, 1), 0, 1);
    }

    if (!isPlaying) {
      audioMap.forEach((element) => {
        if (!element.paused) {
          element.pause();
        }
      });
      return;
    }

    const syncTimeSec = Math.max(0, playheadSec);
    audioClips.forEach((clip) => {
      const element = audioMap.get(clip.id);
      if (!element) {
        return;
      }
      const clipStartSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
      const clipDurationSec = Math.max(MIN_CLIP_DURATION_SEC, toFiniteNumber(clip.durationSec, MIN_CLIP_DURATION_SEC));
      const clipEndSec = clipStartSec + clipDurationSec;
      const shouldPlay = syncTimeSec >= clipStartSec && syncTimeSec < clipEndSec;

      if (!shouldPlay) {
        if (!element.paused) {
          element.pause();
        }
        return;
      }

      const expectedSec = clamp(syncTimeSec - clipStartSec, 0, clipDurationSec);
      if (Math.abs((element.currentTime || 0) - expectedSec) > AUDIO_SEEK_TOLERANCE_SEC) {
        try {
          element.currentTime = expectedSec;
        } catch {
          // Ignore seeking failures while media is preparing.
        }
      }

      if (element.paused) {
        const playPromise = element.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch(() => undefined);
        }
      }
    });
  }, [audioClips, isPlaying, playheadSec]);

  const timelineMaxSec = useMemo(
    () => resolveTimelineDuration(durationSec, timelineClips, textClips, audioClips),
    [audioClips, durationSec, textClips, timelineClips]
  );
  const safeTimelineMaxSec = useMemo(
    () => Math.max(2, toFiniteNumber(timelineMaxSec, 2)),
    [timelineMaxSec]
  );
  const playheadPercent = useMemo(
    () => toTimelinePercent(playheadSec, safeTimelineMaxSec),
    [playheadSec, safeTimelineMaxSec]
  );

  const activeVideoClip = useMemo(
    () => findActiveTrackClip(timelineClips, playheadSec, videoTrackIds, DEFAULT_VIDEO_TRACK_ID),
    [playheadSec, timelineClips, videoTrackIds]
  );
  const selectedVideoClip = useMemo(
    () => timelineClips.find((clip) => clip.id === activeVideoClipId) ?? activeVideoClip ?? null,
    [activeVideoClip, activeVideoClipId, timelineClips]
  );

  const activeSourceClip = useMemo(
    () => (activeVideoClip ? sourceClipMap.get(activeVideoClip.sourceClipId) ?? null : null),
    [activeVideoClip, sourceClipMap]
  );
  const activePreviewUrl = activeSourceClip?.previewImageUrl || activeSourceClip?.imageUrl || null;

  const activeTextOverlays = useMemo(
    () => sortTrackClips(textClips)
      .filter((clip) => {
        const clipStartSec = Math.max(0, toFiniteNumber(clip.startSec, 0));
        const clipEndSec = resolveClipEndSec(clip);
        return playheadSec >= clipStartSec && playheadSec < clipEndSec && clip.text.trim();
      }),
    [playheadSec, textClips]
  );

  const hasReferenceVideo = Boolean(filePath);

  const rulerStepSec = useMemo(() => {
    if (safeTimelineMaxSec <= 12) {
      return 1;
    }
    if (safeTimelineMaxSec <= 40) {
      return 2;
    }
    return 5;
  }, [safeTimelineMaxSec]);

  const rulerMarks = useMemo(() => {
    const marks: number[] = [];
    for (let sec = 0; sec <= safeTimelineMaxSec + 0.0001; sec += rulerStepSec) {
      marks.push(Number(sec.toFixed(3)));
    }
    if (marks.length === 0 || marks[marks.length - 1] < safeTimelineMaxSec) {
      marks.push(safeTimelineMaxSec);
    }
    return marks;
  }, [rulerStepSec, safeTimelineMaxSec]);

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const normalizeTextTracks = useCallback((
    clips: VideoEditorTextClip[],
    trackIds = textTrackIds
  ): VideoEditorTextClip[] => (
    normalizeTrackClips(
      clips
        .map((clip) => ({
          ...clip,
          text: clip.text.trim(),
        }))
        .filter((clip) => clip.text.length > 0),
      trackIds,
      DEFAULT_TEXT_TRACK_ID
    )
  ), [textTrackIds]);

  const buildSavePayload = useCallback((): VideoEditorSavePayload => {
    const normalizedVideoTrackIds = resolveInitialTrackIds(videoTrackIds, timelineClips, DEFAULT_VIDEO_TRACK_ID);
    const normalizedTextTrackIds = resolveInitialTrackIds(textTrackIds, textClips, DEFAULT_TEXT_TRACK_ID);
    const normalizedAudioTrackIds = resolveInitialTrackIds(audioTrackIds, audioClips, DEFAULT_AUDIO_TRACK_ID);

    const normalizedTimelineClips = normalizeTrackClips(
      timelineClips,
      normalizedVideoTrackIds,
      DEFAULT_VIDEO_TRACK_ID
    );
    const normalizedTextClips = normalizeTextTracks(textClips, normalizedTextTrackIds);
    const normalizedAudioClips = normalizeTrackClips(
      audioClips,
      normalizedAudioTrackIds,
      DEFAULT_AUDIO_TRACK_ID
    );

    const normalizedLocalAudioAssets = localAudioAssets.filter(
      (asset) => typeof asset.filePath === 'string' && asset.filePath.trim().length > 0
    );

    return {
      timelineClips: normalizedTimelineClips,
      textClips: normalizedTextClips,
      audioClips: normalizedAudioClips,
      localAudioAssets: normalizedLocalAudioAssets,
      videoTrackIds: normalizedVideoTrackIds,
      textTrackIds: normalizedTextTrackIds,
      audioTrackIds: normalizedAudioTrackIds,
      playheadSec,
    };
  }, [audioClips, audioTrackIds, localAudioAssets, normalizeTextTracks, playheadSec, textClips, textTrackIds, timelineClips, videoTrackIds]);

  const handleSave = useCallback(() => {
    onSave(buildSavePayload());
  }, [buildSavePayload, onSave]);

  const buildSnapshot = useCallback((): VideoEditorSnapshot => ({
    timelineClips: cloneTimelineClips(timelineClips),
    textClips: cloneTextClips(textClips),
    audioClips: cloneAudioClips(audioClips),
    localAudioAssets: cloneAudioAssets(localAudioAssets),
    videoTrackIds: [...videoTrackIds],
    textTrackIds: [...textTrackIds],
    audioTrackIds: [...audioTrackIds],
    playheadSec,
    activeVideoClipId,
    activeTextClipId,
    activeAudioClipId,
  }), [activeAudioClipId, activeTextClipId, activeVideoClipId, audioClips, audioTrackIds, localAudioAssets, playheadSec, textClips, textTrackIds, timelineClips, videoTrackIds]);

  const pushUndoSnapshot = useCallback((snapshot: VideoEditorSnapshot) => {
    setUndoStack((previous) => {
      const last = previous[previous.length - 1];
      if (last && areSnapshotsEqual(last, snapshot)) {
        return previous;
      }
      return [...previous, snapshot].slice(-EDITOR_HISTORY_LIMIT);
    });
    setRedoStack([]);
  }, []);

  const restoreSnapshot = useCallback((snapshot: VideoEditorSnapshot) => {
    stopTicker();
    setIsPlaying(false);
    setDragState(null);
    dragSnapshotRef.current = null;
    dragHistoryPushedRef.current = false;
    setTimelineClips(cloneTimelineClips(snapshot.timelineClips));
    setTextClips(cloneTextClips(snapshot.textClips));
    setAudioClips(cloneAudioClips(snapshot.audioClips));
    setLocalAudioAssets(cloneAudioAssets(snapshot.localAudioAssets));
    setVideoTrackIds([...snapshot.videoTrackIds]);
    setTextTrackIds([...snapshot.textTrackIds]);
    setAudioTrackIds([...snapshot.audioTrackIds]);
    setPlayheadSec(snapshot.playheadSec);
    setActiveVideoClipId(snapshot.activeVideoClipId);
    setActiveTextClipId(snapshot.activeTextClipId);
    setActiveAudioClipId(snapshot.activeAudioClipId);
    setSelectedVideoTrackId(snapshot.videoTrackIds[0] ?? DEFAULT_VIDEO_TRACK_ID);
    setSelectedTextTrackId(snapshot.textTrackIds[0] ?? DEFAULT_TEXT_TRACK_ID);
    setSelectedAudioTrackId(snapshot.audioTrackIds[0] ?? DEFAULT_AUDIO_TRACK_ID);
    setTextEditorState(null);
    setIsVideoNoteEditing(false);
  }, [stopTicker]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    const current = buildSnapshot();
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-EDITOR_HISTORY_LIMIT));
    restoreSnapshot(previous);
  }, [buildSnapshot, restoreSnapshot, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    const current = buildSnapshot();
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-EDITOR_HISTORY_LIMIT));
    restoreSnapshot(next);
  }, [buildSnapshot, redoStack, restoreSnapshot]);

  const pushCurrentToUndo = useCallback(() => {
    pushUndoSnapshot(buildSnapshot());
  }, [buildSnapshot, pushUndoSnapshot]);

  useEffect(() => {
    setPlayheadSec((previous) => clamp(previous, 0, safeTimelineMaxSec));
  }, [safeTimelineMaxSec]);

  useEffect(() => {
    timelineClipsRef.current = timelineClips;
  }, [timelineClips]);

  useEffect(() => {
    textClipsRef.current = textClips;
  }, [textClips]);

  useEffect(() => {
    audioClipsRef.current = audioClips;
  }, [audioClips]);

  useEffect(() => {
    if (!activeVideoClipId) {
      return;
    }
    if (!timelineClips.some((clip) => clip.id === activeVideoClipId)) {
      setActiveVideoClipId(null);
      setIsVideoNoteEditing(false);
    }
  }, [activeVideoClipId, timelineClips]);

  useEffect(() => {
    if (!activeTextClipId) {
      return;
    }
    if (!textClips.some((clip) => clip.id === activeTextClipId)) {
      setActiveTextClipId(null);
      setTextEditorState((previous) => (previous?.clipId === activeTextClipId ? null : previous));
    }
  }, [activeTextClipId, textClips]);

  useEffect(() => {
    if (!activeAudioClipId) {
      return;
    }
    if (!audioClips.some((clip) => clip.id === activeAudioClipId)) {
      setActiveAudioClipId(null);
    }
  }, [activeAudioClipId, audioClips]);

  useEffect(() => {
    if (!videoTrackIds.includes(selectedVideoTrackId)) {
      setSelectedVideoTrackId(videoTrackIds[0] ?? DEFAULT_VIDEO_TRACK_ID);
    }
  }, [selectedVideoTrackId, videoTrackIds]);

  useEffect(() => {
    if (!textTrackIds.includes(selectedTextTrackId)) {
      setSelectedTextTrackId(textTrackIds[0] ?? DEFAULT_TEXT_TRACK_ID);
    }
  }, [selectedTextTrackId, textTrackIds]);

  useEffect(() => {
    if (!audioTrackIds.includes(selectedAudioTrackId)) {
      setSelectedAudioTrackId(audioTrackIds[0] ?? DEFAULT_AUDIO_TRACK_ID);
    }
  }, [audioTrackIds, selectedAudioTrackId]);

  useEffect(() => {
    return () => {
      stopTicker();
      audioElementMapRef.current.forEach((element) => {
        element.pause();
        element.src = '';
      });
      audioElementMapRef.current.clear();
      if (waveformAudioContextRef.current) {
        const context = waveformAudioContextRef.current;
        waveformAudioContextRef.current = null;
        void context.close().catch(() => undefined);
      }
    };
  }, [stopTicker]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      const commandPressed = event.ctrlKey || event.metaKey;
      const isUndo = commandPressed && key === 'z' && !event.shiftKey;
      const isRedo = commandPressed && (key === 'y' || (key === 'z' && event.shiftKey));
      if (isUndo || isRedo) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (isUndo) {
          handleUndo();
        } else {
          handleRedo();
        }
        return;
      }

      if (event.key === 'Escape' && textEditorState) {
        event.preventDefault();
        setTextEditorState(null);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [handleRedo, handleUndo, textEditorState]);

  useEffect(() => {
    if (!textEditorState) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const panel = textEditorPanelRef.current;
      if (!panel) {
        return;
      }
      if (panel.contains(event.target as Node)) {
        return;
      }
      setTextEditorState(null);
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [textEditorState]);

  const resolveTrackIdFromPointer = useCallback((
    trackKind: TrackKind,
    clientY: number,
    fallbackTrackId: string
  ): string => {
    const timelineRoot = timelineTrackRef.current;
    if (!timelineRoot || !Number.isFinite(clientY)) {
      return fallbackTrackId;
    }

    const trackElements = [...timelineRoot.querySelectorAll<HTMLElement>(
      `[data-video-editor-track-kind="${trackKind}"]`
    )];
    if (trackElements.length === 0) {
      return fallbackTrackId;
    }

    let nearestTrackId = fallbackTrackId;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const element of trackElements) {
      const trackId = element.dataset.videoEditorTrackId?.trim();
      if (!trackId) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return trackId;
      }
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - centerY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTrackId = trackId;
      }
    }

    return nearestTrackId;
  }, []);

  useEffect(() => {
    if (!dragState) {
      setDragHoverTrack(null);
      setDragSnapGuideSec(null);
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaPx = event.clientX - dragState.originX;
      const deltaSec = (deltaPx / dragState.trackWidth) * dragState.timelineMaxSec;
      const currentDragTrackId = dragTargetTrackIdRef.current ?? dragState.trackId;
      const targetTrackId = dragState.mode === 'move'
        ? resolveTrackIdFromPointer(dragState.trackKind, event.clientY, currentDragTrackId)
        : dragState.trackId;

      dragTargetTrackIdRef.current = targetTrackId;
      setDragHoverTrack({ kind: dragState.trackKind, trackId: targetTrackId });

      if (dragState.trackKind === 'video' && selectedVideoTrackId !== targetTrackId) {
        setSelectedVideoTrackId(targetTrackId);
      }
      if (dragState.trackKind === 'text' && selectedTextTrackId !== targetTrackId) {
        setSelectedTextTrackId(targetTrackId);
      }
      if (dragState.trackKind === 'audio' && selectedAudioTrackId !== targetTrackId) {
        setSelectedAudioTrackId(targetTrackId);
      }

      if (
        !dragHistoryPushedRef.current
        && dragSnapshotRef.current
        && (Math.abs(deltaPx) > 1 || targetTrackId !== dragState.trackId)
      ) {
        pushUndoSnapshot(dragSnapshotRef.current);
        dragHistoryPushedRef.current = true;
      }

      if (dragState.trackKind === 'video') {
        const snapAnchors = [
          ...collectTrackEdgesForTrack(
            timelineClipsRef.current,
            targetTrackId,
            videoTrackIds,
            DEFAULT_VIDEO_TRACK_ID,
            dragState.clipId
          ),
          ...collectTrackEdges(textClipsRef.current),
          ...collectTrackEdges(audioClipsRef.current),
        ];
        setDragSnapGuideSec(resolveDragSnapGuideSec(dragState, deltaSec, snapAnchors, snapEnabled));

        setTimelineClips((previous) => {
          let moved = applyDragToTrack(
            previous,
            dragState,
            videoTrackIds,
            DEFAULT_VIDEO_TRACK_ID,
            deltaSec,
            snapAnchors,
            snapEnabled,
            targetTrackId,
            false
          );

          const movedClip = moved.find((clip) => clip.id === dragState.clipId);
          if (!movedClip) {
            return moved;
          }

          if (dragState.mode === 'move') {
            const previousCenter = dragLastCenterSecRef.current
              ?? (dragState.startSec + dragState.durationSec / 2);
            const currentCenter = movedClip.startSec + movedClip.durationSec / 2;
            moved = applyCenterCrossSwap(
              moved,
              dragState.clipId,
              targetTrackId,
              videoTrackIds,
              DEFAULT_VIDEO_TRACK_ID,
              previousCenter,
              currentCenter
            );
            const finalClip = moved.find((clip) => clip.id === dragState.clipId);
            if (finalClip) {
              dragLastCenterSecRef.current = finalClip.startSec + finalClip.durationSec / 2;
            }
            return moved;
          }

          dragLastCenterSecRef.current = movedClip.startSec + movedClip.durationSec / 2;
          return moved;
        });
        return;
      }

      if (dragState.trackKind === 'text') {
        const snapAnchors = [
          ...collectTrackEdgesForTrack(
            textClipsRef.current,
            targetTrackId,
            textTrackIds,
            DEFAULT_TEXT_TRACK_ID,
            dragState.clipId
          ),
          ...collectTrackEdges(timelineClipsRef.current),
          ...collectTrackEdges(audioClipsRef.current),
        ];
        setDragSnapGuideSec(resolveDragSnapGuideSec(dragState, deltaSec, snapAnchors, snapEnabled));

        setTextClips((previous) => {
          let moved = applyDragToTrack(
            previous,
            dragState,
            textTrackIds,
            DEFAULT_TEXT_TRACK_ID,
            deltaSec,
            snapAnchors,
            snapEnabled,
            targetTrackId,
            false
          );

          const movedClip = moved.find((clip) => clip.id === dragState.clipId);
          if (!movedClip) {
            return moved;
          }

          if (dragState.mode === 'move') {
            const previousCenter = dragLastCenterSecRef.current
              ?? (dragState.startSec + dragState.durationSec / 2);
            const currentCenter = movedClip.startSec + movedClip.durationSec / 2;
            moved = applyCenterCrossSwap(
              moved,
              dragState.clipId,
              targetTrackId,
              textTrackIds,
              DEFAULT_TEXT_TRACK_ID,
              previousCenter,
              currentCenter
            );
            const finalClip = moved.find((clip) => clip.id === dragState.clipId);
            if (finalClip) {
              dragLastCenterSecRef.current = finalClip.startSec + finalClip.durationSec / 2;
            }
            return moved;
          }

          dragLastCenterSecRef.current = movedClip.startSec + movedClip.durationSec / 2;
          return moved;
        });
        return;
      }

      const snapAnchors = [
        ...collectTrackEdgesForTrack(
          audioClipsRef.current,
          targetTrackId,
          audioTrackIds,
          DEFAULT_AUDIO_TRACK_ID,
          dragState.clipId
        ),
        ...collectTrackEdges(timelineClipsRef.current),
        ...collectTrackEdges(textClipsRef.current),
      ];
      setDragSnapGuideSec(resolveDragSnapGuideSec(dragState, deltaSec, snapAnchors, snapEnabled));

      setAudioClips((previous) => {
        let moved = applyDragToTrack(
          previous,
          dragState,
          audioTrackIds,
          DEFAULT_AUDIO_TRACK_ID,
          deltaSec,
          snapAnchors,
          snapEnabled,
          targetTrackId,
          false
        );

        const movedClip = moved.find((clip) => clip.id === dragState.clipId);
        if (!movedClip) {
          return moved;
        }

        if (dragState.mode === 'move') {
          const previousCenter = dragLastCenterSecRef.current
            ?? (dragState.startSec + dragState.durationSec / 2);
          const currentCenter = movedClip.startSec + movedClip.durationSec / 2;
          moved = applyCenterCrossSwap(
            moved,
            dragState.clipId,
            targetTrackId,
            audioTrackIds,
            DEFAULT_AUDIO_TRACK_ID,
            previousCenter,
            currentCenter
          );
          const finalClip = moved.find((clip) => clip.id === dragState.clipId);
          if (finalClip) {
            dragLastCenterSecRef.current = finalClip.startSec + finalClip.durationSec / 2;
          }
          return moved;
        }

        dragLastCenterSecRef.current = movedClip.startSec + movedClip.durationSec / 2;
        return moved;
      });
    };

    const handleUp = () => {
      if (!dragHistoryPushedRef.current) {
        setDragState(null);
        dragSnapshotRef.current = null;
        dragTargetTrackIdRef.current = null;
        dragLastCenterSecRef.current = null;
        setDragHoverTrack(null);
        setDragSnapGuideSec(null);
        return;
      }

      const committedTrackId = dragTargetTrackIdRef.current ?? dragState.trackId;
      if (dragState.trackKind === 'video') {
        setTimelineClips((previous) => normalizeTrackClips(
          previous.map((clip) => (
            clip.id === dragState.clipId ? { ...clip, trackId: committedTrackId } : clip
          )),
          videoTrackIds,
          DEFAULT_VIDEO_TRACK_ID
        ));
        setSelectedVideoTrackId(
          resolveTrackId(committedTrackId, videoTrackIds, DEFAULT_VIDEO_TRACK_ID)
        );
      } else if (dragState.trackKind === 'text') {
        setTextClips((previous) => normalizeTrackClips(
          previous.map((clip) => (
            clip.id === dragState.clipId ? { ...clip, trackId: committedTrackId } : clip
          )),
          textTrackIds,
          DEFAULT_TEXT_TRACK_ID
        ));
        setSelectedTextTrackId(
          resolveTrackId(committedTrackId, textTrackIds, DEFAULT_TEXT_TRACK_ID)
        );
      } else {
        setAudioClips((previous) => normalizeTrackClips(
          previous.map((clip) => (
            clip.id === dragState.clipId ? { ...clip, trackId: committedTrackId } : clip
          )),
          audioTrackIds,
          DEFAULT_AUDIO_TRACK_ID
        ));
        setSelectedAudioTrackId(
          resolveTrackId(committedTrackId, audioTrackIds, DEFAULT_AUDIO_TRACK_ID)
        );
      }

      setDragState(null);
      dragSnapshotRef.current = null;
      dragHistoryPushedRef.current = false;
      dragTargetTrackIdRef.current = null;
      dragLastCenterSecRef.current = null;
      setDragHoverTrack(null);
      setDragSnapGuideSec(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [
    audioTrackIds,
    dragState,
    pushUndoSnapshot,
    resolveTrackIdFromPointer,
    selectedAudioTrackId,
    selectedTextTrackId,
    selectedVideoTrackId,
    snapEnabled,
    textTrackIds,
    videoTrackIds,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      stopTicker();
      return;
    }

    stopTicker();
    tickerRef.current = window.setInterval(() => {
      setPlayheadSec((previous) => {
        const next = previous + 0.05;
        if (next >= safeTimelineMaxSec) {
          stopTicker();
          setIsPlaying(false);
          return safeTimelineMaxSec;
        }
        return next;
      });
    }, 50);

    return () => {
      stopTicker();
    };
  }, [isPlaying, safeTimelineMaxSec, stopTicker]);

  const handleTrackMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-video-editor-clip="true"]')) {
      return;
    }

    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setPlayheadSec(ratio * safeTimelineMaxSec);
  }, [safeTimelineMaxSec]);

  const handleClipMouseDown = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    clip: TimelineClipLike,
    mode: DragMode,
    trackKind: TrackKind,
    trackId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    dragSnapshotRef.current = buildSnapshot();
    dragHistoryPushedRef.current = false;
    dragTargetTrackIdRef.current = trackId;
    dragLastCenterSecRef.current = clip.startSec + clip.durationSec / 2;
    setDragHoverTrack({ kind: trackKind, trackId });
    setDragSnapGuideSec(null);

    setDragState({
      trackKind,
      trackId,
      clipId: clip.id,
      mode,
      originX: event.clientX,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      timelineMaxSec: safeTimelineMaxSec,
      trackWidth: rect.width,
    });
  }, [buildSnapshot, safeTimelineMaxSec]);

  const handleAddVideoTrack = useCallback(() => {
    pushCurrentToUndo();
    const nextTrackId = createTrackId('video-track');
    setVideoTrackIds((previous) => uniqueTrackIds([...previous, nextTrackId]));
    setSelectedVideoTrackId(nextTrackId);
  }, [pushCurrentToUndo]);

  const handleAddAudioTrack = useCallback(() => {
    pushCurrentToUndo();
    const nextTrackId = createTrackId('audio-track');
    setAudioTrackIds((previous) => uniqueTrackIds([...previous, nextTrackId]));
    setSelectedAudioTrackId(nextTrackId);
  }, [pushCurrentToUndo]);

  const handleAddTextTrack = useCallback(() => {
    pushCurrentToUndo();
    const nextTrackId = createTrackId('text-track');
    setTextTrackIds((previous) => uniqueTrackIds([...previous, nextTrackId]));
    setSelectedTextTrackId(nextTrackId);
  }, [pushCurrentToUndo]);

  const insertVideoClipToTrack = useCallback((sourceClipId: string, preferredTrackId?: string, dropClientX?: number) => {
    if (!sourceClipMap.has(sourceClipId)) {
      return;
    }

    const targetTrackId = resolveTrackId(
      preferredTrackId ?? selectedVideoTrackId,
      videoTrackIds,
      DEFAULT_VIDEO_TRACK_ID
    );
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    const safeTimelineSec = Math.max(2, toFiniteNumber(timelineMaxSec, 2));
    let startSec = findAvailableStartSecInTrack(
      timelineClips,
      targetTrackId,
      videoTrackIds,
      DEFAULT_VIDEO_TRACK_ID,
      playheadSec,
      DEFAULT_CLIP_DURATION_SEC
    );

    if (rect && rect.width > 0 && Number.isFinite(dropClientX)) {
      const ratio = clamp(((dropClientX as number) - rect.left) / rect.width, 0, 1);
      startSec = ratio * safeTimelineSec;
    }

    pushCurrentToUndo();
    const nextId = createSequenceClipId();
    setTimelineClips((previous) => {
      const snapAnchors = [
        ...collectTrackEdgesForTrack(previous, targetTrackId, videoTrackIds, DEFAULT_VIDEO_TRACK_ID),
        ...collectTrackEdges(textClipsRef.current),
        ...collectTrackEdges(audioClipsRef.current),
      ];
      const snapThresholdSec = resolveSnapThresholdSec(safeTimelineSec);
      const snappedStart = snapEnabled
        ? findClosestAnchor(startSec, snapAnchors, snapThresholdSec)?.anchor ?? startSec
        : startSec;
      const safeStart = findAvailableStartSecInTrack(
        previous,
        targetTrackId,
        videoTrackIds,
        DEFAULT_VIDEO_TRACK_ID,
        snappedStart,
        DEFAULT_CLIP_DURATION_SEC
      );
      setPlayheadSec(clamp(safeStart, 0, safeTimelineSec));
      return normalizeTrackClips([
        ...previous,
        {
          id: nextId,
          sourceClipId,
          trackId: targetTrackId,
          startSec: safeStart,
          durationSec: DEFAULT_CLIP_DURATION_SEC,
        },
      ], videoTrackIds, DEFAULT_VIDEO_TRACK_ID);
    });
    setSelectedVideoTrackId(targetTrackId);
    setActiveVideoClipId(nextId);
  }, [playheadSec, pushCurrentToUndo, selectedVideoTrackId, snapEnabled, sourceClipMap, timelineClips, timelineMaxSec, videoTrackIds]);

  const insertAudioClipToTrack = useCallback((sourceAudioId: string, preferredTrackId?: string, dropClientX?: number) => {
    const sourceAudio = audioSourceMap.get(sourceAudioId);
    if (!sourceAudio) {
      return;
    }

    const targetTrackId = resolveTrackId(
      preferredTrackId ?? selectedAudioTrackId,
      audioTrackIds,
      DEFAULT_AUDIO_TRACK_ID
    );
    const clipDuration = Math.max(
      MIN_CLIP_DURATION_SEC,
      toFiniteNumber(sourceAudio.durationSec, DEFAULT_AUDIO_CLIP_DURATION_SEC)
    );

    const rect = timelineTrackRef.current?.getBoundingClientRect();
    const safeTimelineSec = Math.max(2, toFiniteNumber(timelineMaxSec, 2));
    let startSec = findAvailableStartSecInTrack(
      audioClips,
      targetTrackId,
      audioTrackIds,
      DEFAULT_AUDIO_TRACK_ID,
      playheadSec,
      clipDuration
    );

    if (rect && rect.width > 0 && Number.isFinite(dropClientX)) {
      const ratio = clamp(((dropClientX as number) - rect.left) / rect.width, 0, 1);
      startSec = ratio * safeTimelineSec;
    }

    pushCurrentToUndo();
    const nextId = createAudioClipId();
    setAudioClips((previous) => {
      const snapAnchors = [
        ...collectTrackEdgesForTrack(previous, targetTrackId, audioTrackIds, DEFAULT_AUDIO_TRACK_ID),
        ...collectTrackEdges(timelineClipsRef.current),
        ...collectTrackEdges(textClipsRef.current),
      ];
      const snapThresholdSec = resolveSnapThresholdSec(safeTimelineSec);
      const snappedStart = snapEnabled
        ? findClosestAnchor(startSec, snapAnchors, snapThresholdSec)?.anchor ?? startSec
        : startSec;
      const safeStart = findAvailableStartSecInTrack(
        previous,
        targetTrackId,
        audioTrackIds,
        DEFAULT_AUDIO_TRACK_ID,
        snappedStart,
        clipDuration
      );
      setPlayheadSec(clamp(safeStart, 0, safeTimelineSec));
      return normalizeTrackClips([
        ...previous,
        {
          id: nextId,
          audioAssetId: sourceAudio.id,
          audioFilePath: sourceAudio.filePath,
          label: sourceAudio.label,
          trackId: targetTrackId,
          startSec: safeStart,
          durationSec: clipDuration,
          volume: 1,
        },
      ], audioTrackIds, DEFAULT_AUDIO_TRACK_ID);
    });
    setSelectedAudioTrackId(targetTrackId);
    setActiveAudioClipId(nextId);
  }, [audioClips, audioSourceMap, audioTrackIds, playheadSec, pushCurrentToUndo, selectedAudioTrackId, snapEnabled, timelineMaxSec]);

  const handleVideoTrackDrop = useCallback((trackId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceClipId = resolveDroppedValue(event, [
      SOURCE_CLIP_TRANSFER_KEY,
      SOURCE_CLIP_TRANSFER_KEY_FALLBACK,
      'text/plain',
    ]);
    if (!sourceClipId) {
      return;
    }
    insertVideoClipToTrack(sourceClipId, trackId, event.clientX);
  }, [insertVideoClipToTrack]);

  const handleAudioTrackDrop = useCallback((trackId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceAudioId = resolveDroppedValue(event, [
      SOURCE_AUDIO_TRANSFER_KEY,
      SOURCE_AUDIO_TRANSFER_KEY_FALLBACK,
      'text/plain',
    ]);
    if (!sourceAudioId) {
      return;
    }
    insertAudioClipToTrack(sourceAudioId, trackId, event.clientX);
  }, [insertAudioClipToTrack]);

  const handleTimelineDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleModalDragOverGuard = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleModalDropGuard = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleRemoveVideoClip = useCallback((clipId: string) => {
    if (!timelineClips.some((clip) => clip.id === clipId)) {
      return;
    }
    pushCurrentToUndo();
    setTimelineClips((previous) => previous.filter((clip) => clip.id !== clipId));
    setActiveVideoClipId((previous) => (previous === clipId ? null : previous));
  }, [pushCurrentToUndo, timelineClips]);

  const handleRemoveTextClip = useCallback((clipId: string) => {
    if (!textClips.some((clip) => clip.id === clipId)) {
      return;
    }
    pushCurrentToUndo();
    setTextClips((previous) => previous.filter((clip) => clip.id !== clipId));
    setActiveTextClipId((previous) => (previous === clipId ? null : previous));
    setTextEditorState((previous) => (previous?.clipId === clipId ? null : previous));
  }, [pushCurrentToUndo, textClips]);

  const handleRemoveAudioClip = useCallback((clipId: string) => {
    if (!audioClips.some((clip) => clip.id === clipId)) {
      return;
    }
    pushCurrentToUndo();
    setAudioClips((previous) => previous.filter((clip) => clip.id !== clipId));
    setActiveAudioClipId((previous) => (previous === clipId ? null : previous));
  }, [audioClips, pushCurrentToUndo]);

  const handleAddTextClip = useCallback(() => {
    const value = textDraft.trim();
    if (!value) {
      return;
    }

    const targetTrackId = resolveTrackId(selectedTextTrackId, textTrackIds, DEFAULT_TEXT_TRACK_ID);
    const nextId = createTextClipId();
    pushCurrentToUndo();
    setTextClips((previous) => {
      const safeStart = findAvailableStartSecInTrack(
        previous,
        targetTrackId,
        textTrackIds,
        DEFAULT_TEXT_TRACK_ID,
        playheadSec,
        DEFAULT_CLIP_DURATION_SEC
      );
      return normalizeTrackClips([
        ...previous,
        {
          id: nextId,
          trackId: targetTrackId,
          text: value,
          startSec: safeStart,
          durationSec: DEFAULT_CLIP_DURATION_SEC,
          color: '#ffffff',
          fontSize: 28,
        },
      ], textTrackIds, DEFAULT_TEXT_TRACK_ID);
    });
    setActiveTextClipId(nextId);
    setTextDraft('');
  }, [playheadSec, pushCurrentToUndo, selectedTextTrackId, textDraft, textTrackIds]);

  const handleUpdateTextClip = useCallback((clipId: string, value: string) => {
    const targetClip = textClips.find((clip) => clip.id === clipId);
    if (!targetClip || targetClip.text === value) {
      return;
    }
    pushCurrentToUndo();
    setTextClips((previous) => previous.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }
      return {
        ...clip,
        text: value,
      };
    }));
  }, [pushCurrentToUndo, textClips]);

  const handleUpdateVideoClipNote = useCallback((clipId: string, value: string) => {
    const targetClip = timelineClips.find((clip) => clip.id === clipId);
    if (!targetClip || targetClip.note === value) {
      return;
    }
    pushCurrentToUndo();
    setTimelineClips((previous) => previous.map((clip) => {
      if (clip.id !== clipId) {
        return clip;
      }
      return {
        ...clip,
        note: value,
      };
    }));
  }, [pushCurrentToUndo, timelineClips]);

  const handleUploadAudio = useCallback(async () => {
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
    if (!normalizedPath) {
      return;
    }

    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    const existingAsset = localAudioAssets.find((asset) => asset.filePath === normalizedPath);
    const nextAsset: VideoEditorAudioAsset = existingAsset ?? {
      id: createAudioAssetId(),
      label: fileName,
      filePath: normalizedPath,
      durationSec: null,
    };

    pushCurrentToUndo();
    if (!existingAsset) {
      setLocalAudioAssets((previous) => [...previous, nextAsset]);
    }
    insertAudioClipToTrack(nextAsset.id, selectedAudioTrackId);
  }, [insertAudioClipToTrack, localAudioAssets, pushCurrentToUndo, selectedAudioTrackId]);

  const openTextEditorAt = useCallback((clipId: string, clientX: number, clientY: number) => {
    const clip = textClips.find((item) => item.id === clipId);
    if (!clip) {
      return;
    }
    const maxX = Math.max(24, window.innerWidth - 380);
    const maxY = Math.max(24, window.innerHeight - 240);
    setActiveTextClipId(clipId);
    setTextEditorState({
      clipId,
      draft: clip.text,
      x: clamp(clientX + 8, 12, maxX),
      y: clamp(clientY + 8, 12, maxY),
    });
  }, [textClips]);

  const openTextEditor = useCallback((clipId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openTextEditorAt(clipId, event.clientX, event.clientY);
  }, [openTextEditorAt]);

  const handleSaveTextEditor = useCallback(() => {
    if (!textEditorState) {
      return;
    }
    handleUpdateTextClip(textEditorState.clipId, textEditorState.draft);
    setTextEditorState(null);
  }, [handleUpdateTextClip, textEditorState]);

  const allTimelineRows = useMemo(() => {
    return videoTrackIds.length + audioTrackIds.length + textTrackIds.length;
  }, [audioTrackIds.length, textTrackIds.length, videoTrackIds.length]);

  return (
    <div
      className="nodrag nowheel fixed inset-0 z-50 p-3 md:p-5 lg:p-6"
      onMouseDown={(event) => event.stopPropagation()}
      onDragOver={handleModalDragOverGuard}
      onDrop={handleModalDropGuard}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-elevation-3)]">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border-soft)] px-4 py-2">
          <span className="ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
            {t('node.videoEditor.editorTitle', { defaultValue: '视频编辑器' })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              aria-label={t('common.undo', { defaultValue: '撤销' })}
              title={t('common.undo', { defaultValue: '撤销' })}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              aria-label={t('common.redo', { defaultValue: '重做' })}
              title={t('common.redo', { defaultValue: '重做' })}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-1.5 text-xs text-text-dark hover:bg-[var(--ui-hover-surface)]"
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5" />
              {t('common.save', { defaultValue: '保存' })}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
              onClick={() => {
                const payload = buildSavePayload();
                onSave(payload);
                onGenerate({
                  timelineClips: payload.timelineClips,
                  textClips: payload.textClips,
                  audioClips: payload.audioClips,
                });
                onClose();
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('node.videoEditor.generateTextNode', { defaultValue: '生成文本节点' })}
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark"
              aria-label={t('common.close', { defaultValue: '关闭' })}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_clamp(360px,34vw,520px)]">
          <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] border-b border-[var(--ui-border-soft)] p-4 md:p-5 xl:border-b-0 xl:border-r">
            <div className="relative min-h-[160px] min-w-0 overflow-hidden rounded-[var(--ui-radius-2xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-track-bg)]">
              {activePreviewUrl ? (
                <img
                  src={resolveImageDisplayUrl(activePreviewUrl)}
                  alt="timeline-preview"
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : null}

              {!activePreviewUrl ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="ui-timecode rounded-md border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-3 py-1 text-xs text-white/85">
                    {t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                  </div>
                </div>
              ) : null}

              {activeTextOverlays.length > 0 ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 px-6 pb-8 md:px-10">
                  {activeTextOverlays.map((clip) => (
                    <div
                      key={clip.id}
                      className="ui-safe-text ui-clamp-2 max-w-[min(84%,680px)] rounded-md border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-3 py-1 text-center font-medium text-white"
                      style={{
                        color: clip.color || '#ffffff',
                        fontSize: `${Math.max(14, clip.fontSize ?? 28)}px`,
                      }}
                    >
                      {clip.text}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-2 py-1 text-[11px] text-white">
                  {activePreviewUrl
                    ? (activeSourceClip?.label || t('node.videoEditor.previewFrame', { defaultValue: '当前分镜' }))
                    : t('node.videoEditor.blackFrame', { defaultValue: '黑场（无分镜）' })}
                </span>
                {hasReferenceVideo ? (
                  <span className="rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] px-2 py-1 text-[10px] text-white/80">
                    {t('node.videoEditor.referenceVideoConnected', { defaultValue: '已连接参考视频' })}
                  </span>
                ) : null}
                <span className="rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] px-2 py-1 text-[10px] text-white/80">
                  {`${allTimelineRows} tracks`}
                </span>
              </div>
            </div>

            <div className="mt-4 min-h-[250px] shrink-0 rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-overlay-panel)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark"
                    aria-label={isPlaying
                      ? t('node.videoEditor.pause', { defaultValue: '暂停播放' })
                      : t('node.videoEditor.play', { defaultValue: '播放时间线' })}
                    onClick={() => {
                      if (isPlaying) {
                        setIsPlaying(false);
                        stopTicker();
                        return;
                      }
                      setIsPlaying(true);
                    }}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <span className="ui-display-title text-[11px] font-medium uppercase tracking-[0.12em] text-sky-300">
                    {t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
                  </span>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors ${
                      snapEnabled
                        ? 'border-sky-300/55 bg-sky-400/18 text-sky-100'
                        : 'border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] text-text-muted hover:bg-[var(--ui-hover-surface)]'
                    }`}
                    onClick={() => setSnapEnabled((previous) => !previous)}
                  >
                    <Magnet className="h-3 w-3" />
                    {snapEnabled
                      ? t('node.videoEditor.snapOn', { defaultValue: '吸附：开' })
                      : t('node.videoEditor.snapOff', { defaultValue: '吸附：关' })}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-0.5 text-[10px] text-text-muted hover:bg-[var(--ui-hover-surface)]"
                    onClick={handleAddVideoTrack}
                  >
                    <Plus className="h-3 w-3" />
                    {t('node.videoEditor.addVideoTrack', { defaultValue: '新增分镜轨' })}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-0.5 text-[10px] text-text-muted hover:bg-[var(--ui-hover-surface)]"
                    onClick={handleAddAudioTrack}
                  >
                    <Volume2 className="h-3 w-3" />
                    {t('node.videoEditor.addAudioTrack', { defaultValue: '新增音频轨' })}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-0.5 text-[10px] text-text-muted hover:bg-[var(--ui-hover-surface)]"
                    onClick={handleAddTextTrack}
                  >
                    <Type className="h-3 w-3" />
                    {t('node.videoEditor.addTextTrack', { defaultValue: '新增文字轨' })}
                  </button>
                </div>
                <span className="ui-timecode text-[11px] text-text-dark">{formatSeconds(playheadSec)} / {formatSeconds(safeTimelineMaxSec)}</span>
              </div>

              <div
                ref={timelineTrackRef}
                className="relative overflow-hidden rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-track-bg)]"
                onMouseDown={handleTrackMouseDown}
                onDragOver={handleTimelineDragOver}
              >
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,var(--ui-track-grid)_0,var(--ui-track-grid)_1px,transparent_1px,transparent_56px)] opacity-35" />

                <div className="relative h-7 border-b border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)]">
                  {rulerMarks.map((sec) => {
                    const left = toTimelinePercent(sec, safeTimelineMaxSec);
                    return (
                      <div
                        key={sec}
                        className="pointer-events-none absolute bottom-0 top-0"
                        style={{ left: `${left}%` }}
                      >
                        <div className="h-2 w-px bg-[var(--ui-track-mark)]" />
                        <span className="ui-timecode absolute top-2 -translate-x-1/2 text-[10px] text-[rgba(var(--text-rgb),0.76)]">
                          {formatSeconds(sec)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="relative px-2 py-2">
                  <div className="flex flex-col gap-2">
                    {videoTrackIds.map((trackId, trackIndex) => {
                      const clipsInTrack = sortTrackClips(
                        timelineClips.filter(
                          (clip) => resolveTrackId(clip.trackId, videoTrackIds, DEFAULT_VIDEO_TRACK_ID) === trackId
                        )
                      );
                      return (
                        <div
                          key={trackId}
                          data-video-editor-track-kind="video"
                          data-video-editor-track-id={trackId}
                          className={`order-20 nodrag nowheel relative h-[56px] rounded-lg border border-[var(--ui-border-soft)] bg-[linear-gradient(180deg,rgba(56,189,248,0.12),rgba(var(--surface-rgb),0.14))] ${
                            selectedVideoTrackId === trackId ? 'ring-1 ring-cyan-200/80' : ''
                          } ${
                            dragHoverTrack?.kind === 'video' && dragHoverTrack.trackId === trackId
                              ? 'ring-2 ring-cyan-300/90 shadow-[0_0_0_1px_rgba(56,189,248,0.35)_inset]'
                              : ''
                          }`}
                          onMouseDown={() => setSelectedVideoTrackId(trackId)}
                          onDragOver={handleTimelineDragOver}
                          onDrop={(event) => handleVideoTrackDrop(trackId, event)}
                        >
                          <div className="ui-timecode absolute left-2 top-1 rounded border border-cyan-300/30 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-cyan-100/90">
                            {`${t('node.videoEditor.videoTrack', { defaultValue: '视频轨' })} ${trackIndex + 1}`}
                          </div>

                          {clipsInTrack.length === 0 ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-2 top-6 flex items-center justify-center text-[10px] text-text-muted">
                              {t('node.videoEditor.dropHint', { defaultValue: '拖入分镜到视频轨' })}
                            </div>
                          ) : null}

                          {clipsInTrack.map((clip) => {
                            const source = sourceClipMap.get(clip.sourceClipId);
                            const left = `${toTimelinePercent(clip.startSec, safeTimelineMaxSec)}%`;
                            const width = `${Math.max(3, toTimelinePercent(clip.durationSec, safeTimelineMaxSec))}%`;
                            const isSelected = activeVideoClipId === clip.id;
                            const isPlayheadActive = activeVideoClip?.id === clip.id;
                            const isEditing = isVideoNoteEditing && selectedVideoClip?.id === clip.id;
                            return (
                              <div
                                key={clip.id}
                                data-video-editor-clip="true"
                                className={`absolute bottom-1 top-6 rounded-md border border-cyan-300/60 bg-gradient-to-r from-cyan-500/45 to-sky-500/45 shadow-[0_8px_18px_rgba(6,182,212,0.22)] transition-[left,width] duration-150 ease-out ${
                                  isEditing
                                    ? 'ring-2 ring-yellow-200/90'
                                    : isSelected
                                      ? 'ring-2 ring-cyan-100/90'
                                      : isPlayheadActive
                                        ? 'ring-1 ring-cyan-200/80'
                                        : ''
                                }`}
                                style={{ left, width }}
                                onMouseDown={(event) => {
                                  setActiveVideoClipId(clip.id);
                                  setSelectedVideoTrackId(trackId);
                                  handleClipMouseDown(event, clip, 'move', 'video', trackId);
                                }}
                              >
                                <button
                                  type="button"
                                  className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] text-white hover:bg-red-500"
                                  aria-label={t('common.delete', { defaultValue: '删除' })}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveVideoClip(clip.id);
                                  }}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                                <div
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveVideoClipId(clip.id);
                                    setSelectedVideoTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-left', 'video', trackId);
                                  }}
                                />
                                <div className="mx-2 mt-1 truncate text-[10px] font-medium text-white">{source?.label ?? 'Clip'}</div>
                                <div className="ui-timecode mx-2 truncate text-[10px] text-white/90">
                                  {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                                </div>
                                <div
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveVideoClipId(clip.id);
                                    setSelectedVideoTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-right', 'video', trackId);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {audioTrackIds.map((trackId, trackIndex) => {
                      const clipsInTrack = sortTrackClips(
                        audioClips.filter(
                          (clip) => resolveTrackId(clip.trackId, audioTrackIds, DEFAULT_AUDIO_TRACK_ID) === trackId
                        )
                      );
                      return (
                        <div
                          key={trackId}
                          data-video-editor-track-kind="audio"
                          data-video-editor-track-id={trackId}
                          className={`order-30 nodrag nowheel relative h-[56px] rounded-lg border border-[var(--ui-border-soft)] bg-[linear-gradient(180deg,rgba(168,85,247,0.14),rgba(var(--surface-rgb),0.14))] ${
                            selectedAudioTrackId === trackId ? 'ring-1 ring-purple-200/80' : ''
                          } ${
                            dragHoverTrack?.kind === 'audio' && dragHoverTrack.trackId === trackId
                              ? 'ring-2 ring-purple-300/90 shadow-[0_0_0_1px_rgba(168,85,247,0.35)_inset]'
                              : ''
                          }`}
                          onMouseDown={() => setSelectedAudioTrackId(trackId)}
                          onDragOver={handleTimelineDragOver}
                          onDrop={(event) => handleAudioTrackDrop(trackId, event)}
                        >
                          <div className="ui-timecode absolute left-2 top-1 rounded border border-purple-300/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-purple-100/90">
                            {`${t('node.videoEditor.audioTrack', { defaultValue: '音频轨' })} ${trackIndex + 1}`}
                          </div>

                          {clipsInTrack.length === 0 ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-2 top-6 flex items-center justify-center text-[10px] text-text-muted">
                              {t('node.videoEditor.audioDropHint', { defaultValue: '拖入音频到音频轨' })}
                            </div>
                          ) : null}

                          {clipsInTrack.map((clip) => {
                            const left = `${toTimelinePercent(clip.startSec, safeTimelineMaxSec)}%`;
                            const width = `${Math.max(3, toTimelinePercent(clip.durationSec, safeTimelineMaxSec))}%`;
                            const isSelected = activeAudioClipId === clip.id;
                            const waveformBins = waveformByPath[clip.audioFilePath] ?? FALLBACK_WAVEFORM_BINS;
                            return (
                              <div
                                key={clip.id}
                                data-video-editor-clip="true"
                                className={`absolute bottom-1 top-6 rounded-md border border-purple-300/60 bg-gradient-to-r from-purple-500/45 to-fuchsia-500/40 shadow-[0_8px_18px_rgba(168,85,247,0.22)] transition-[left,width] duration-150 ease-out ${
                                  isSelected ? 'ring-2 ring-purple-100/90' : ''
                                }`}
                                style={{ left, width }}
                                onMouseDown={(event) => {
                                  setActiveAudioClipId(clip.id);
                                  setSelectedAudioTrackId(trackId);
                                  handleClipMouseDown(event, clip, 'move', 'audio', trackId);
                                }}
                              >
                                <button
                                  type="button"
                                  className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] text-white hover:bg-red-500"
                                  aria-label={t('common.delete', { defaultValue: '删除' })}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveAudioClip(clip.id);
                                  }}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                                <div
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveAudioClipId(clip.id);
                                    setSelectedAudioTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-left', 'audio', trackId);
                                  }}
                                />
                                <div className="pointer-events-none absolute inset-x-2 bottom-1 h-4 overflow-hidden rounded-sm bg-white/10">
                                  <div className="flex h-full items-end gap-px">
                                    {waveformBins.map((value, index) => (
                                      <span
                                        key={`${clip.id}-wave-${index}`}
                                        className="block flex-1 rounded-sm bg-white/70"
                                        style={{ height: `${Math.max(14, Math.round(value * 100))}%` }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="mx-2 mt-1 truncate text-[10px] font-medium text-white">{clip.label}</div>
                                <div className="ui-timecode mx-2 truncate text-[10px] text-white/90">
                                  {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                                </div>
                                <div
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveAudioClipId(clip.id);
                                    setSelectedAudioTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-right', 'audio', trackId);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {textTrackIds.map((trackId, trackIndex) => {
                      const clipsInTrack = sortTrackClips(
                        textClips.filter(
                          (clip) => resolveTrackId(clip.trackId, textTrackIds, DEFAULT_TEXT_TRACK_ID) === trackId
                        )
                      );
                      return (
                        <div
                          key={trackId}
                          data-video-editor-track-kind="text"
                          data-video-editor-track-id={trackId}
                          className={`order-10 nodrag nowheel relative h-[56px] rounded-lg border border-[var(--ui-border-soft)] bg-[linear-gradient(180deg,rgba(245,158,11,0.14),rgba(var(--surface-rgb),0.14))] ${
                            selectedTextTrackId === trackId ? 'ring-1 ring-amber-200/80' : ''
                          } ${
                            dragHoverTrack?.kind === 'text' && dragHoverTrack.trackId === trackId
                              ? 'ring-2 ring-amber-300/90 shadow-[0_0_0_1px_rgba(245,158,11,0.35)_inset]'
                              : ''
                          }`}
                          onMouseDown={() => setSelectedTextTrackId(trackId)}
                        >
                          <div className="ui-timecode absolute left-2 top-1 rounded border border-amber-300/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-amber-100/90">
                            {`${t('node.videoEditor.textTrack', { defaultValue: '文字轨' })} ${trackIndex + 1}`}
                          </div>

                          {clipsInTrack.length === 0 ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-2 top-6 flex items-center justify-center text-[10px] text-text-muted">
                              {t('node.videoEditor.textTrackHint', { defaultValue: '添加文字后可在此调整时序' })}
                            </div>
                          ) : null}

                          {clipsInTrack.map((clip) => {
                            const left = `${toTimelinePercent(clip.startSec, safeTimelineMaxSec)}%`;
                            const width = `${Math.max(3, toTimelinePercent(clip.durationSec, safeTimelineMaxSec))}%`;
                            const isActive = activeTextClipId === clip.id;
                            const isEditing = textEditorState?.clipId === clip.id;
                            return (
                              <div
                                key={clip.id}
                                data-video-editor-clip="true"
                                className={`absolute bottom-1 top-6 rounded-md border border-amber-300/60 bg-gradient-to-r from-amber-500/50 to-orange-500/45 shadow-[0_8px_16px_rgba(251,146,60,0.2)] transition-[left,width] duration-150 ease-out ${
                                  isEditing
                                    ? 'ring-2 ring-yellow-100/90'
                                    : isActive
                                      ? 'ring-1 ring-amber-100/85'
                                      : ''
                                }`}
                                style={{ left, width }}
                                onMouseDown={(event) => {
                                  setActiveTextClipId(clip.id);
                                  setSelectedTextTrackId(trackId);
                                  handleClipMouseDown(event, clip, 'move', 'text', trackId);
                                }}
                                onContextMenu={(event) => openTextEditor(clip.id, event)}
                              >
                                <button
                                  type="button"
                                  className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-media-chip-border)] bg-[var(--ui-overlay-inverse)] text-white hover:bg-red-500"
                                  aria-label={t('common.delete', { defaultValue: '删除' })}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveTextClip(clip.id);
                                  }}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                                <div
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveTextClipId(clip.id);
                                    setSelectedTextTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-left', 'text', trackId);
                                  }}
                                />
                                <div className="mx-2 mt-1 truncate text-[10px] font-medium text-white">{clip.text || 'Text'}</div>
                                <div className="ui-timecode mx-2 truncate text-[10px] text-white/90">
                                  {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                                </div>
                                <div
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-[var(--ui-overlay-inverse)] hover:bg-[var(--ui-overlay-inverse-strong)]"
                                  onMouseDown={(event) => {
                                    setActiveTextClipId(clip.id);
                                    setSelectedTextTrackId(trackId);
                                    handleClipMouseDown(event, clip, 'resize-right', 'text', trackId);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {dragSnapGuideSec !== null ? (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-sky-300/95 shadow-[0_0_10px_rgba(56,189,248,0.85)]"
                      style={{ left: `${toTimelinePercent(dragSnapGuideSec, safeTimelineMaxSec)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-sky-300/70 bg-sky-500/80 px-1.5 py-0.5 ui-timecode text-[10px] text-white">
                        {formatSeconds(dragSnapGuideSec)}
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-accent/95 shadow-[0_0_8px_rgba(249,115,22,0.9)]"
                    style={{ left: `${playheadPercent}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-[var(--ui-media-chip-border)] bg-[var(--ui-media-chip)] px-1.5 py-0.5 ui-timecode text-[10px] text-white">
                      {formatSeconds(playheadSec)}
                    </div>
                    <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border border-[var(--ui-overlay-inverse-border)] bg-accent" />
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <input
                  type="range"
                  min={0}
                  max={safeTimelineMaxSec}
                  step={0.1}
                  value={clamp(playheadSec, 0, safeTimelineMaxSec)}
                  onChange={(event) => setPlayheadSec(Number(event.target.value))}
                  aria-label={t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--ui-track-bg)] accent-[rgb(var(--accent-rgb))]"
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 p-4 md:p-5">
            <div className="grid min-h-0 flex-1 gap-4 2xl:grid-cols-2">
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="mb-2 ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
                  {t('node.videoEditor.sourceClips', { defaultValue: '分镜栏' })}
                  <span className="ml-2 text-[10px] text-text-muted">
                    {`${t('node.videoEditor.videoTrack', { defaultValue: '视频轨' })}: ${selectedVideoTrackId}`}
                  </span>
                </div>
                <div className="ui-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3 pr-2">
                  {sourceClips.length === 0 ? (
                    <div className="rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-4 text-xs text-text-muted">
                      {t('node.videoEditor.noSourceClips', { defaultValue: '未检测到分镜图片，请连接分镜节点' })}
                    </div>
                  ) : (
                    sourceClips.map((clip) => {
                      const previewUrl = clip.previewImageUrl || clip.imageUrl;
                      return (
                        <div
                          key={clip.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(SOURCE_CLIP_TRANSFER_KEY, clip.id);
                            event.dataTransfer.setData(SOURCE_CLIP_TRANSFER_KEY_FALLBACK, clip.id);
                            event.dataTransfer.setData('text/plain', clip.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="nodrag nowheel rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] p-2"
                        >
                          {previewUrl ? (
                            <img
                              src={resolveImageDisplayUrl(previewUrl)}
                              alt={clip.label}
                              className="mb-1.5 h-20 w-full rounded-lg object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="mb-1.5 flex h-20 items-center justify-center rounded bg-[var(--ui-hover-surface)] text-xs text-text-muted">
                              {clip.label}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-text-dark">{clip.label}</div>
                              <div className="ui-timecode mt-1 text-[10px] text-text-muted">{formatSeconds(DEFAULT_CLIP_DURATION_SEC)} default</div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded border border-cyan-300/55 bg-cyan-500/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-cyan-500"
                              onClick={() => insertVideoClipToTrack(clip.id, selectedVideoTrackId)}
                            >
                              <Plus className="h-3 w-3" />
                              {t('node.videoEditor.addToTrack', { defaultValue: '加入' })}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-text-muted">
                      {t('node.videoEditor.audioSources', { defaultValue: '音频素材' })}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1 text-[10px] text-text-muted hover:bg-[var(--ui-hover-surface)]"
                      onClick={() => void handleUploadAudio()}
                    >
                      <Upload className="h-3 w-3" />
                      {t('node.videoEditor.uploadAudio', { defaultValue: '上传音频' })}
                    </button>
                  </div>
                  <div className="mb-2 text-[10px] text-text-muted">
                    {`${t('node.videoEditor.audioTrack', { defaultValue: '音频轨' })}: ${selectedAudioTrackId}`}
                  </div>
                  <div className="ui-scrollbar max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {audioSourceItems.length === 0 ? (
                      <div className="rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-2 text-xs text-text-muted">
                        {t('node.videoEditor.noAudioSource', { defaultValue: '暂无可用音频，请连接音频节点或上传音频' })}
                      </div>
                    ) : (
                      audioSourceItems.map((audio) => (
                        <div
                          key={audio.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(SOURCE_AUDIO_TRANSFER_KEY, audio.id);
                            event.dataTransfer.setData(SOURCE_AUDIO_TRANSFER_KEY_FALLBACK, audio.id);
                            event.dataTransfer.setData('text/plain', audio.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="flex items-center justify-between gap-2 rounded border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs text-text-dark">{audio.label}</div>
                            <div className="ui-timecode text-[10px] text-text-muted">
                              {audio.durationSec ? formatSeconds(audio.durationSec) : formatSeconds(DEFAULT_AUDIO_CLIP_DURATION_SEC)}
                              <span className="ml-1">{audio.origin === 'linked' ? 'linked' : 'local'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-purple-300/55 bg-purple-500/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-purple-500"
                            onClick={() => insertAudioClipToTrack(audio.id, selectedAudioTrackId)}
                          >
                            <Plus className="h-3 w-3" />
                            {t('node.videoEditor.addToTrack', { defaultValue: '加入' })}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                  <div className="text-[11px] text-text-muted">
                    {t('node.videoEditor.currentRange', { defaultValue: '当前时间线范围' })}
                  </div>
                  <div className="ui-timecode mt-1 text-xs font-medium text-text-dark">
                    {selectedVideoClip
                      ? `${formatSeconds(selectedVideoClip.startSec)}-${formatSeconds(selectedVideoClip.startSec + selectedVideoClip.durationSec)}`
                      : `${formatSeconds(playheadSec)}-${formatSeconds(playheadSec)}`}
                  </div>
                  <div className="mt-2 text-[11px] text-text-muted">
                    {t('node.videoEditor.clipNote', { defaultValue: '分镜备注' })}
                  </div>
                  <textarea
                    value={selectedVideoClip?.note ?? ''}
                    disabled={!selectedVideoClip}
                    onFocus={() => setIsVideoNoteEditing(true)}
                    onBlur={() => setIsVideoNoteEditing(false)}
                    onChange={(event) => {
                      if (!selectedVideoClip) {
                        return;
                      }
                      handleUpdateVideoClipNote(selectedVideoClip.id, event.target.value);
                    }}
                    placeholder={selectedVideoClip
                      ? t('node.videoEditor.notePlaceholder', { defaultValue: '填写该时间段分镜备注' })
                      : t('node.videoEditor.noSelectedClipForNote', { defaultValue: '请先在时间轴选择一个分镜片段' })}
                    className="mt-1 h-20 w-full resize-none rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1 text-xs text-text-dark outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="mb-2 ui-display-title text-sm font-medium uppercase tracking-[0.08em] text-text-dark">
                  {t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}
                  <span className="ml-2 text-[10px] text-text-muted">
                    {`${t('node.videoEditor.textTrack', { defaultValue: '文字轨' })}: ${selectedTextTrackId}`}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1">
                      <Type className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <input
                        type="text"
                        value={textDraft}
                        onChange={(event) => setTextDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddTextClip();
                          }
                        }}
                        className="w-full bg-transparent text-xs text-text-dark outline-none"
                        placeholder={t('node.videoEditor.textPlaceholder', { defaultValue: '输入文字后添加到文字轨' })}
                      />
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-amber-300/55 bg-amber-500/86 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
                      onClick={handleAddTextClip}
                    >
                      {t('node.videoEditor.addTextClip', { defaultValue: '添加' })}
                    </button>
                  </div>

                  <div className="ui-scrollbar mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
                    {textClips.length === 0 ? (
                      <div className="rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-3 py-2 text-xs text-text-muted">
                        {t('node.videoEditor.noTextClips', { defaultValue: '暂无文字片段' })}
                      </div>
                    ) : (
                      sortTrackClips(textClips).map((clip) => (
                        <div
                          key={clip.id}
                          className={`rounded-lg border p-2 ${
                            activeTextClipId === clip.id
                              ? 'border-amber-300/70 bg-amber-500/16'
                              : 'border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)]'
                          }`}
                          onMouseDown={() => setActiveTextClipId(clip.id)}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="ui-timecode text-[10px] text-text-muted">
                              {`${resolveTrackId(clip.trackId, textTrackIds, DEFAULT_TEXT_TRACK_ID)}`}
                            </span>
                            <button
                              type="button"
                              className="rounded border border-[var(--ui-border-soft)] px-1.5 py-0.5 text-[10px] text-text-muted hover:bg-[var(--ui-hover-surface)]"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openTextEditorAt(clip.id, event.clientX, event.clientY);
                              }}
                            >
                              {t('common.edit', { defaultValue: '编辑' })}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={clip.text}
                            onChange={(event) => handleUpdateTextClip(clip.id, event.target.value)}
                            onFocus={() => setActiveTextClipId(clip.id)}
                            className="w-full rounded border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 text-xs text-text-dark outline-none"
                          />
                          <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
                            <span className="ui-timecode">
                              {formatSeconds(clip.startSec)}-{formatSeconds(clip.startSec + clip.durationSec)}
                            </span>
                            <button
                              type="button"
                              className="text-red-300 hover:text-red-200"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveTextClip(clip.id);
                              }}
                            >
                              {t('common.delete', { defaultValue: '删除' })}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {textEditorState ? (
        <div
          ref={textEditorPanelRef}
          className="fixed z-[60] w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] p-3 shadow-[0_16px_36px_rgba(15,23,42,0.45)]"
          style={{ left: textEditorState.x, top: textEditorState.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-dark">
              {t('node.videoEditor.textEditorTitle', { defaultValue: '文字轨内容编辑' })}
            </span>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-[var(--ui-hover-surface)] hover:text-text-dark"
              onClick={() => setTextEditorState(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            value={textEditorState.draft}
            onChange={(event) => {
              const value = event.target.value;
              setTextEditorState((previous) => (previous ? { ...previous, draft: value } : previous));
            }}
            className="h-28 w-full resize-none rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-muted-surface)] px-2 py-1.5 text-sm text-text-dark outline-none"
            placeholder={t('node.videoEditor.textPlaceholder', { defaultValue: '输入文字后添加到文字轨' })}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-[var(--ui-border-soft)] px-2.5 py-1 text-xs text-text-muted hover:bg-[var(--ui-hover-surface)]"
              onClick={() => setTextEditorState(null)}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
            <button
              type="button"
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/80"
              onClick={handleSaveTextEditor}
            >
              {t('common.confirm', { defaultValue: '确认' })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

VideoEditorModal.displayName = 'VideoEditorModal';
