/**
 * Visibility Module - Ray-casting visibility for valid cursor region highlighting
 *
 * Exports:
 * - AnalyticalPropagation: Unified visibility polygon construction (buildVisibilityPolygon, propagateWithIntermediates)
 * - PropagationTypes: Type definitions for propagation results
 * - ValidRegionRenderer: Dark overlay rendering with visibility cutout
 * - RaySector: Position-based angular sector operations (angle-free)
 * - ConeProjectionV2: Visibility polygon construction using SourcePoints
 * - WindowConfig: Window configuration utilities
 * - HighlightMode: Reaching cone calculation
 * - HighlightRenderer: Surface highlight rendering
 * - RenderingDedup: Polygon deduplication for rendering
 */

export * from "./AnalyticalPropagation";
export * from "./PropagationTypes";
export * from "./ValidRegionRenderer";
export * from "./RaySector";
export * from "./ConeProjectionV2";
export * from "./WindowConfig";
export * from "./HighlightMode";
export * from "./HighlightRenderer";
export * from "./RenderingDedup";
