function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type ResponsiveNodeDensity = 'compact' | 'regular' | 'comfortable';

export interface ResponsiveNodeClasses {
  density: ResponsiveNodeDensity;
  panelPadding: string;
  bodyText: string;
  metaText: string;
  buttonText: string;
  titleText: string;
  sectionGap: string;
  stackGap: string;
  modeGridCols: string;
  controlGridCols: string;
}

export function resolveAdaptiveHandleStyle(
  width?: number,
  height?: number,
  side: 'left' | 'right' = 'left'
) {
  const basis = Math.min(width ?? 240, height ?? 200);
  const size = clamp(Math.round(basis * 0.035), 10, 16);
  const offset = Math.max(6, Math.round(size * 0.6));

  return {
    width: size,
    height: size,
    borderWidth: 2,
    [side]: -offset,
  };
}

export function resolveResponsiveTextScale(width?: number, height?: number) {
  const basis = Math.min(width ?? 360, height ?? 280);
  if (basis < 240) {
    return 'compact';
  }
  if (basis > 520) {
    return 'comfortable';
  }
  return 'regular';
}

export function resolveResponsiveNodeClasses(width?: number, height?: number) {
  const density = resolveResponsiveTextScale(width, height);
  if (density === 'compact') {
    return {
      density,
      panelPadding: 'px-2 py-2',
      bodyText: 'text-xs leading-5',
      metaText: 'text-[10px] leading-4',
      buttonText: 'text-xs',
      titleText: 'text-xs',
      sectionGap: 'gap-1.5',
      stackGap: 'gap-2',
      modeGridCols: 'grid-cols-1',
      controlGridCols: 'grid-cols-1',
    } satisfies ResponsiveNodeClasses;
  }
  if (density === 'comfortable') {
    return {
      density,
      panelPadding: 'px-3 py-3',
      bodyText: 'text-sm leading-6',
      metaText: 'text-xs leading-5',
      buttonText: 'text-sm',
      titleText: 'text-sm',
      sectionGap: 'gap-2.5',
      stackGap: 'gap-3',
      modeGridCols: 'grid-cols-3',
      controlGridCols: 'grid-cols-3',
    } satisfies ResponsiveNodeClasses;
  }
  return {
    density,
    panelPadding: 'px-3 py-2',
    bodyText: 'text-sm leading-6',
    metaText: 'text-[11px] leading-4',
    buttonText: 'text-sm',
    titleText: 'text-xs',
    sectionGap: 'gap-2',
    stackGap: 'gap-2.5',
    modeGridCols: 'grid-cols-2',
    controlGridCols: 'grid-cols-2',
  } satisfies ResponsiveNodeClasses;
}
