export type DeleteDirection = 'backward' | 'forward';
export type ReferenceMediaType = 'image' | 'video';

export interface TextRange {
  start: number;
  end: number;
}

export interface ReferenceTokenMatch extends TextRange {
  token: string;
  value: number;
}

interface TokenRange extends TextRange {
  blockStart: number;
  blockEnd: number;
}

const IMAGE_PREFIX = '\u56FE';
const VIDEO_PREFIX = '\u89C6\u9891';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveMaxReferenceNumber(maxCount?: number): number {
  if (typeof maxCount !== 'number' || !Number.isFinite(maxCount)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(maxCount));
}

function isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function resolveMediaPrefix(mediaType: ReferenceMediaType): string {
  return mediaType === 'video' ? VIDEO_PREFIX : IMAGE_PREFIX;
}

function findReferenceTokensByPrefix(
  text: string,
  prefix: string,
  maxCount?: number
): ReferenceTokenMatch[] {
  const tokens: ReferenceTokenMatch[] = [];
  const maxReferenceNumber = resolveMaxReferenceNumber(maxCount);
  const marker = `@${prefix}`;
  const markerLength = marker.length;

  for (let index = 0; index < text.length; index += 1) {
    if (text.slice(index, index + markerLength) !== marker) {
      continue;
    }

    const digitsStart = index + markerLength;
    if (!isAsciiDigit(text[digitsStart] ?? '')) {
      continue;
    }

    let digitsEnd = digitsStart;
    while (isAsciiDigit(text[digitsEnd] ?? '')) {
      digitsEnd += 1;
    }

    if (maxReferenceNumber === Number.POSITIVE_INFINITY) {
      const fullValue = Number(text.slice(digitsStart, digitsEnd));
      if (Number.isFinite(fullValue) && fullValue >= 1) {
        tokens.push({
          start: index,
          end: digitsEnd,
          token: text.slice(index, digitsEnd),
          value: fullValue,
        });
        index = digitsEnd - 1;
      }
      continue;
    }

    let bestEnd = -1;
    let bestValue = 0;
    let rollingValue = 0;

    for (let cursor = digitsStart; cursor < digitsEnd; cursor += 1) {
      rollingValue = rollingValue * 10 + Number(text[cursor]);

      if (rollingValue >= 1 && rollingValue <= maxReferenceNumber) {
        bestEnd = cursor + 1;
        bestValue = rollingValue;
      }

      if (rollingValue > maxReferenceNumber) {
        break;
      }
    }

    if (bestEnd > 0) {
      tokens.push({
        start: index,
        end: bestEnd,
        token: text.slice(index, bestEnd),
        value: bestValue,
      });
      index = bestEnd - 1;
    }
  }

  return tokens;
}

export function findReferenceTokens(text: string, maxImageCount?: number): ReferenceTokenMatch[] {
  return findReferenceTokensByPrefix(text, IMAGE_PREFIX, maxImageCount);
}

export function findMediaReferenceTokens(
  text: string,
  mediaType: ReferenceMediaType,
  maxCount?: number
): ReferenceTokenMatch[] {
  return findReferenceTokensByPrefix(text, resolveMediaPrefix(mediaType), maxCount);
}

function toTokenRanges(tokens: ReferenceTokenMatch[], text: string): TokenRange[] {
  return tokens.map((token) => {
    const blockStart = token.start > 0 && text[token.start - 1] === ' ' ? token.start - 1 : token.start;
    const blockEnd = token.end < text.length && text[token.end] === ' ' ? token.end + 1 : token.end;
    return {
      start: token.start,
      end: token.end,
      blockStart,
      blockEnd,
    };
  });
}

type DeleteResolverOptions =
  | number
  | {
      imageCount?: number;
      videoCount?: number;
      mediaTypes?: ReferenceMediaType[];
    };

function resolveTokenRangesForDelete(text: string, options?: DeleteResolverOptions): TokenRange[] {
  const mediaTypes =
    typeof options === 'object' && Array.isArray(options.mediaTypes) && options.mediaTypes.length > 0
      ? options.mediaTypes
      : (['image'] as ReferenceMediaType[]);

  const ranges: TokenRange[] = [];
  for (const mediaType of mediaTypes) {
    const maxCount =
      typeof options === 'number'
        ? mediaType === 'image'
          ? options
          : undefined
        : mediaType === 'video'
          ? options?.videoCount
          : options?.imageCount;
    ranges.push(...toTokenRanges(findMediaReferenceTokens(text, mediaType, maxCount), text));
  }

  return ranges.sort((left, right) => left.start - right.start);
}

export function insertReferenceToken(
  text: string,
  cursor: number,
  marker: string
): { nextText: string; nextCursor: number } {
  const safeCursor = clamp(cursor, 0, text.length);
  const before = text.slice(0, safeCursor);
  const after = text.slice(safeCursor);
  const previousChar = before.length > 0 ? before.charAt(before.length - 1) : '';
  const nextChar = after.length > 0 ? after.charAt(0) : '';
  const needsLeadingSpace = before.length > 0 && !/\s/.test(previousChar);
  const needsTrailingSpace = !(after.length > 0 && /\s/.test(nextChar));
  const insertion = `${needsLeadingSpace ? ' ' : ''}${marker}${needsTrailingSpace ? ' ' : ''}`;

  return {
    nextText: `${before}${insertion}${after}`,
    nextCursor: before.length + insertion.length,
  };
}

export function resolveReferenceAwareDeleteRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  direction: DeleteDirection,
  options?: DeleteResolverOptions
): TextRange | null {
  const safeStart = clamp(selectionStart, 0, text.length);
  const safeEnd = clamp(selectionEnd, 0, text.length);
  const selectionMin = Math.min(safeStart, safeEnd);
  const selectionMax = Math.max(safeStart, safeEnd);
  const tokenRanges = resolveTokenRangesForDelete(text, options);

  if (selectionMin !== selectionMax) {
    let expandedStart = selectionMin;
    let expandedEnd = selectionMax;
    let touchedToken = false;

    for (const tokenRange of tokenRanges) {
      if (tokenRange.blockEnd <= expandedStart || tokenRange.blockStart >= expandedEnd) {
        continue;
      }

      touchedToken = true;
      expandedStart = Math.min(expandedStart, tokenRange.blockStart);
      expandedEnd = Math.max(expandedEnd, tokenRange.blockEnd);
    }

    if (!touchedToken) {
      return null;
    }

    return {
      start: expandedStart,
      end: expandedEnd,
    };
  }

  const point = direction === 'backward' ? Math.max(0, selectionMin - 1) : selectionMin;
  for (const tokenRange of tokenRanges) {
    if (point >= tokenRange.blockStart && point < tokenRange.blockEnd) {
      return {
        start: tokenRange.blockStart,
        end: tokenRange.blockEnd,
      };
    }
  }

  return null;
}

export function removeTextRange(
  text: string,
  range: TextRange
): { nextText: string; nextCursor: number } {
  const safeStart = clamp(Math.min(range.start, range.end), 0, text.length);
  const safeEnd = clamp(Math.max(range.start, range.end), 0, text.length);
  const before = text.slice(0, safeStart);
  const after = text.slice(safeEnd);

  if (before.endsWith(' ') && after.startsWith(' ')) {
    return {
      nextText: `${before}${after.slice(1)}`,
      nextCursor: safeStart,
    };
  }

  return {
    nextText: `${before}${after}`,
    nextCursor: safeStart,
  };
}

function extractReferencedIndices(
  text: string,
  mediaType: ReferenceMediaType,
  maxCount?: number
): number[] {
  const tokens = findMediaReferenceTokens(text, mediaType, maxCount);
  const indices = tokens.map((token) => token.value - 1);
  return [...new Set(indices)].sort((left, right) => left - right);
}

export function extractReferencedImageIndices(text: string, maxImageCount?: number): number[] {
  return extractReferencedIndices(text, 'image', maxImageCount);
}

export function extractReferencedVideoIndices(text: string, maxVideoCount?: number): number[] {
  return extractReferencedIndices(text, 'video', maxVideoCount);
}

function filterReferencedMedia(
  allMedia: string[],
  prompt: string,
  mediaType: ReferenceMediaType
): string[] {
  const referencedIndices = extractReferencedIndices(prompt, mediaType, allMedia.length);
  if (referencedIndices.length === 0) {
    return allMedia;
  }
  return referencedIndices
    .filter((index) => index >= 0 && index < allMedia.length)
    .map((index) => allMedia[index]);
}

export function filterReferencedImages(allImages: string[], prompt: string): string[] {
  return filterReferencedMedia(allImages, prompt, 'image');
}

export function filterReferencedVideos(allVideos: string[], prompt: string): string[] {
  return filterReferencedMedia(allVideos, prompt, 'video');
}
