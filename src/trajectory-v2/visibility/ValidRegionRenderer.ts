/**
 * ValidRegionRenderer - Render dark overlay with valid region cutout
 *
 * Uses Phaser graphics to render a semi-transparent dark overlay over
 * the entire screen, with the valid cursor region "cut out" (kept bright).
 *
 * The overlay is rendered by:
 * 1. Drawing a full-screen dark rectangle
 * 2. Drawing the valid region polygon with blend mode to cut out the dark area
 */

import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createReflectionCache, type ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { type SourcePoint, isEndpoint, isHitPoint, Endpoint } from "@/trajectory-v2/geometry/SourcePoint";
import { type SurfaceChain, isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { TrajectoryDebugLogger, type VisibilityDebugInfo } from "../TrajectoryDebugLogger";
import type { ScreenBounds } from "./AnalyticalPropagation";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
  type SourceSegment,
  type RangeLimitConfig,
} from "./ConeProjectionV2";
import type { ValidRegionOutline } from "./OutlineBuilder";
import { preparePolygonForRendering } from "./RenderingDedup";
import { type Segment, type WindowConfig, getWindowSegments } from "./WindowConfig";
import { createReflectedTargetSet, type RayTarget } from "./ReflectedTargets";
import { toVisibilityVertices } from "./VisibilityVertexConverter";
import { buildPolygonEdges, type ArcConfig } from "./ArcSectionBuilder";
import { drawPolygonEdges } from "./EdgeRenderer";

/**
 * Configuration for the valid region overlay.
 */
export interface ValidRegionConfig {
  /** Opacity of the dark overlay for shadowed (invalid) regions (0-1) */
  readonly shadowAlpha: number;
  /** Opacity of the dark overlay for lit (valid) regions (0-1) */
  readonly litAlpha: number;
  /** Color of the dark overlay */
  readonly overlayColor: number;
  /** Whether to show the valid region outline for debugging */
  readonly showOutline: boolean;
  /** Outline color (for debugging) */
  readonly outlineColor: number;
  /** Outline width (for debugging) */
  readonly outlineWidth: number;
}

/**
 * Default configuration.
 *
 * The subtle effect uses a small alpha difference between lit and shadow areas.
 * Shadowed areas are slightly darker than lit areas.
 */
export const DEFAULT_VALID_REGION_CONFIG: ValidRegionConfig = {
  shadowAlpha: 0.7, // Very dark in shadow
  litAlpha: 0.5, // Lit areas also quite dark
  overlayColor: 0x000000,
  showOutline: false,
  outlineColor: 0x00ffff,
  outlineWidth: 2,
};

/**
 * Interface for Phaser-compatible graphics object.
 */
export interface IValidRegionGraphics {
  clear(): void;
  fillStyle(color: number, alpha?: number): void;
  lineStyle(width: number, color: number, alpha?: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  /**
   * Draw a circular arc.
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param radius - Arc radius
   * @param startAngle - Start angle in radians
   * @param endAngle - End angle in radians
   * @param anticlockwise - If true, draw counterclockwise (default: false)
   */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
  closePath(): void;
  fillPath(): void;
  strokePath(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  setBlendMode(blendMode: number): void;
}

/**
 * Blend modes (Phaser-compatible values).
 */
export const BlendModes = {
  NORMAL: 0,
  ADD: 1,
  MULTIPLY: 2,
  SCREEN: 3,
  ERASE: 4,
} as const;

/**
 * Calculate and render the valid region overlay.
 *
 * Uses ConeProjection for all visibility calculations:
 * - 360° visibility: full cone from player
 * - Umbrella mode: cone through umbrella window from player
 * - Planned surfaces: cone through last surface window from reflected player image
 */
/**
 * Represents a single stage in the visibility calculation chain.
 * Each stage has source points, polygon, and origin.
 */
export interface VisibilityStage {
  readonly sourcePoints: readonly SourcePoint[];
  readonly polygon: readonly Vector2[];
  readonly origin: Vector2;
  readonly isValid: boolean;
}

export class ValidRegionRenderer {
  private graphics: IValidRegionGraphics;
  private config: ValidRegionConfig;
  private screenBounds: ScreenBounds;
  private screenChain: SurfaceChain;
  private lastOutline: ValidRegionOutline | null = null;
  private lastSourcePoints: readonly SourcePoint[] = [];
  private lastOrigin: Vector2 | null = null;
  private lastAllChains: readonly SurfaceChain[] = [];

  /** All visibility stages from the last render (Stage 1, Stage 2, etc.) */
  private visibilityStages: VisibilityStage[] = [];
  
  /** Current range limit configuration for arc rendering */
  private currentRangeLimit: RangeLimitConfig | null = null;

  /**
   * Mapping from coordinate keys to connected surface IDs.
   * Used for junction provenance detection in extractVisibleSurfaceSegments.
   */
  private junctionPointToSurfaces: Map<string, Set<string>> = new Map();

  constructor(
    graphics: IValidRegionGraphics,
    screenBounds: ScreenBounds,
    config: Partial<ValidRegionConfig> = {}
  ) {
    this.graphics = graphics;
    this.screenBounds = screenBounds;
    this.screenChain = createScreenBoundaryChain(screenBounds);
    this.config = { ...DEFAULT_VALID_REGION_CONFIG, ...config };
  }

  /**
   * Build junction mapping from chains.
   * Maps coordinate keys to sets of surface IDs that share that point.
   * Used for junction provenance detection in extractVisibleSurfaceSegments.
   */
  private buildJunctionMapping(chains: readonly SurfaceChain[]): void {
    this.junctionPointToSurfaces.clear();

    for (const chain of chains) {
      // Skip if chain doesn't have getSurfaces method (defensive check for legacy code)
      if (typeof chain.getSurfaces !== "function") {
        continue;
      }

      const surfaces = chain.getSurfaces();

      for (const surface of surfaces) {
        // Add surface start point
        const startKey = `${surface.segment.start.x},${surface.segment.start.y}`;
        if (!this.junctionPointToSurfaces.has(startKey)) {
          this.junctionPointToSurfaces.set(startKey, new Set());
        }
        this.junctionPointToSurfaces.get(startKey)!.add(surface.id);

        // Add surface end point
        const endKey = `${surface.segment.end.x},${surface.segment.end.y}`;
        if (!this.junctionPointToSurfaces.has(endKey)) {
          this.junctionPointToSurfaces.set(endKey, new Set());
        }
        this.junctionPointToSurfaces.get(endKey)!.add(surface.id);
      }
    }
  }

  /**
   * Update screen bounds (e.g., on resize).
   */
  setScreenBounds(bounds: ScreenBounds): void {
    this.screenBounds = bounds;
    this.screenChain = createScreenBoundaryChain(bounds);
  }

  /**
   * Get the last computed visibility polygon.
   *
   * Returns the vertices of the visibility polygon from the most recent
   * render() call. This can be used to clip highlight cones to only
   * show portions that are actually visible.
   *
   * @returns Array of polygon vertices, or empty array if no valid polygon
   */
  getLastVisibilityPolygon(): readonly Vector2[] {
    if (!this.lastOutline) {
      console.log("[ValidRegionRenderer] getLastVisibilityPolygon: no lastOutline");
      return [];
    }
    if (!this.lastOutline.isValid) {
      console.log("[ValidRegionRenderer] getLastVisibilityPolygon: lastOutline is not valid");
      return [];
    }
    const result = this.lastOutline.vertices.map((v) => v.position);
    console.log("[ValidRegionRenderer] getLastVisibilityPolygon:", result.length, "vertices");
    return result;
  }

  /**
   * Get visible points on a target surface using provenance.
   *
   * Finds vertices in the visibility polygon that originated from the
   * target surface (via endpoint or hit provenance). This is the most
   * accurate way to determine the visible portion of a surface.
   *
   * @param targetSurfaceId The ID of the surface to find visible points for
   * @returns Array of visible points on the surface, in order along the polygon
   */
  getVisibleSurfacePoints(targetSurfaceId: string): readonly Vector2[] {
    if (this.lastSourcePoints.length === 0) {
      return [];
    }

    // Find runs of consecutive points on the target surface
    // For each run, output only the first and last point (extremes)
    // This merges intermediate points that are just ray intersections

    const result: Vector2[] = [];
    let currentRun: Vector2[] = [];

    const flushRun = () => {
      if (currentRun.length === 0) return;

      if (currentRun.length === 1) {
        // Single point - include it
        result.push(currentRun[0]!);
      } else {
        // Multiple consecutive points - only include first and last
        result.push(currentRun[0]!);
        result.push(currentRun[currentRun.length - 1]!);
      }
      currentRun = [];
    };

    for (const sourcePoint of this.lastSourcePoints) {
      // Check if this point comes from the target surface
      let coords: Vector2 | null = null;

      if (isEndpoint(sourcePoint)) {
        if (sourcePoint.surface.id === targetSurfaceId) {
          coords = sourcePoint.computeXY();
        }
      } else if (isHitPoint(sourcePoint)) {
        if (sourcePoint.hitSurface.id === targetSurfaceId) {
          coords = sourcePoint.computeXY();
        }
      }

      if (coords) {
        // Add to current run
        currentRun.push(coords);
      } else {
        // Different surface - flush current run
        flushRun();
      }
    }

    // Flush final run
    flushRun();

    // Deduplicate the result
    const seen = new Set<string>();
    const dedupedResult: Vector2[] = [];
    for (const p of result) {
      const key = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedResult.push(p);
      }
    }

    return dedupedResult;
  }

  /**
   * Get the last origin used for visibility calculation.
   */
  getLastOrigin(): Vector2 | null {
    return this.lastOrigin;
  }

  /**
   * Get all visibility stages from the last render.
   * Stage 0 is always player visibility (with umbrella if present).
   * Stage 1+ are reflected visibilities through planned surfaces.
   */
  getVisibilityStages(): readonly VisibilityStage[] {
    return this.visibilityStages;
  }

  /**
   * Get visible segments on a target surface.
   *
   * This is the UNIFIED source of truth for determining which portions
   * of a surface receive light. Returns multiple segments if there are gaps
   * (e.g., umbrella hole mode with 2 cones).
   *
   * Used by:
   * 1. Reflection window calculation (each segment = a window)
   * 2. Highlight cone rendering (each segment = a cone)
   *
   * @param targetSurfaceId The surface to find visible segments for
   * @returns Array of visible segments with preserved SourcePoint provenance
   */
  getVisibleSurfaceSegments(targetSurfaceId: string): readonly SourceSegment[] {
    if (this.lastSourcePoints.length === 0) {
      return [];
    }
    // Reuse the private implementation with a dummy segment parameter
    return this.extractVisibleSurfaceSegments(
      targetSurfaceId,
      this.lastSourcePoints,
      { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } // unused
    );
  }

  /**
   * Extract visible segments on a surface from source points.
   *
   * Uses provenance to find which portions of a surface are visible,
   * converting source points to window segments for reflection.
   *
   * DETECTS GAPS: Iterates through angularly-sorted source points and
   * tracks consecutive runs of points on the target surface. When a
   * point from a different surface interrupts the run, a new segment starts.
   *
   * This is the UNIFIED source of truth for:
   * 1. Reflection windows (each segment = a window)
   * 2. Highlight cones (each segment = a cone)
   *
   * @param targetSurfaceId Surface to extract visible segments for
   * @param sourcePoints Source points from visibility calculation (angularly sorted)
   * @param _surfaceSegment The full surface segment (unused, kept for API)
   * @returns Array of visible segments (may be empty, one, or multiple)
   */
  private extractVisibleSurfaceSegments(
    targetSurfaceId: string,
    sourcePoints: readonly SourcePoint[],
    _surfaceSegment: Segment
  ): SourceSegment[] {
    const segments: SourceSegment[] = [];
    let currentRunStart: Vector2 | null = null;
    let currentRunEnd: Vector2 | null = null;
    // Preserve SourcePoint provenance for segment boundaries
    let currentRunStartSource: SourcePoint | undefined = undefined;
    let currentRunEndSource: SourcePoint | undefined = undefined;

    for (const sp of sourcePoints) {
      // Check if this point is on the target surface using provenance
      let isOnTarget = false;
      let coords: Vector2 | null = null;

      if (isEndpoint(sp) && sp.surface.id === targetSurfaceId) {
        // Endpoint is on its surface
        isOnTarget = true;
        coords = sp.computeXY();
      } else if (isJunctionPoint(sp)) {
        // JunctionPoint - check if it connects to target surface using provenance
        const beforeSurface = sp.getSurfaceBefore();
        const afterSurface = sp.getSurfaceAfter();
        if (beforeSurface?.id === targetSurfaceId || afterSurface?.id === targetSurfaceId) {
          isOnTarget = true;
          coords = sp.computeXY();
        }
      } else if (isHitPoint(sp)) {
        // HitPoint: directly on target surface
        if (sp.hitSurface.id === targetSurfaceId) {
          isOnTarget = true;
          coords = sp.computeXY();
        } else if (sp.s === 0 || sp.s === 1) {
          // HitPoint at s=0 (surface start) or s=1 (surface end)
          // This might be a junction that connects to the target surface
          // Use the junction mapping to check (provenance-based)
          const hitCoords = sp.computeXY();
          const coordKey = `${hitCoords.x},${hitCoords.y}`;
          const connectedSurfaces = this.junctionPointToSurfaces.get(coordKey);
          if (connectedSurfaces?.has(targetSurfaceId)) {
            isOnTarget = true;
            coords = hitCoords;
          }
        }
      }

      if (isOnTarget && coords) {
        // Extend current run, preserving SourcePoint provenance
        if (currentRunStart === null) {
          currentRunStart = coords;
          currentRunStartSource = sp;
        }
        currentRunEnd = coords;
        currentRunEndSource = sp;
      } else {
        // Gap detected - emit current run as segment if valid
        if (
          currentRunStart &&
          currentRunEnd &&
          (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
        ) {
          segments.push({
            start: currentRunStart,
            end: currentRunEnd,
            startSource: currentRunStartSource,
            endSource: currentRunEndSource,
          });
        }
        currentRunStart = null;
        currentRunEnd = null;
        currentRunStartSource = undefined;
        currentRunEndSource = undefined;
      }
    }

    // Emit final run
    if (
      currentRunStart &&
      currentRunEnd &&
      (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)
    ) {
      segments.push({
        start: currentRunStart,
        end: currentRunEnd,
        startSource: currentRunStartSource,
        endSource: currentRunEndSource,
      });
    }

    return segments;
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<ValidRegionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate and render the valid region for given player and surfaces.
   *
   * Uses either:
   * - ConeProjection (new algorithm) when umbrella/window config is provided
   * - Legacy visibility calculator when no umbrella
   *
   * For planned surfaces, visibility is constrained to the reflective side
   * of the last planned surface (V.5 first principle).
   *
   * @param player Player position
   * @param plannedSurfaces Planned surfaces (windows)
   * @param allChains All surface chains in the scene
   * @param windowConfig Optional window configuration for cone projection (single or multi-window)
   * @param externalCache Optional external ReflectionCache for sharing with trajectory system
   */
  render(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allChains: readonly SurfaceChain[],
    windowConfig: WindowConfig | null = null,
    externalCache?: ReflectionCache,
    rangeLimit?: RangeLimitConfig
  ): void {
    // Store range limit for arc rendering
    this.currentRangeLimit = rangeLimit ?? null;
    
    // Combine user chains with screen boundary chain
    // Screen boundaries are just another SurfaceChain - no special handling
    const allChainsWithScreen: readonly SurfaceChain[] = [...allChains, this.screenChain];

    // Store chains for junction provenance detection in extractVisibleSurfaceSegments
    this.lastAllChains = allChainsWithScreen;
    this.buildJunctionMapping(allChainsWithScreen);

    // Unified ConeProjection algorithm for all cases:
    // - 360° visibility: full cone from player
    // - Umbrella mode: cone through umbrella window from player
    // - Umbrella hole mode: multiple cones through multiple windows
    // - Planned surfaces: cone through last surface window from reflected player image
    let visibilityResult: {
      polygons: readonly (readonly Vector2[])[];
      origin: Vector2;
      isValid: boolean;
    };

    // Clear stages for this render
    this.visibilityStages = [];

    // Use external cache if provided, otherwise create a new one for this render
    // External cache enables sharing with trajectory system for cache hits
    const reflectionCache = externalCache ?? createReflectionCache();

    // =========================================================================
    // STAGE 1: Player visibility (with umbrella if present, or full 360°)
    // This stage is ALWAYS computed first, as it informs subsequent stages.
    // =========================================================================
    const stage1SourcePoints: SourcePoint[] = [];
    const stage1Polygons: (readonly Vector2[])[] = [];

    if (windowConfig) {
      // Umbrella mode - windowed visibility from player
      const umbrellaWindows = getWindowSegments(windowConfig);
      for (const window of umbrellaWindows) {
        const cone = createConeThroughWindow(player, window.start, window.end);
        const sourcePoints = projectConeV2(cone, allChainsWithScreen, undefined, reflectionCache, undefined, rangeLimit);
        stage1SourcePoints.push(...sourcePoints);
        const polygon = preparePolygonForRendering(sourcePoints);
        if (polygon.length >= 3) {
          stage1Polygons.push(polygon);
        }
      }
    } else {
      // Full 360° visibility from player
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, allChainsWithScreen, undefined, reflectionCache, undefined, rangeLimit);
      stage1SourcePoints.push(...sourcePoints);
      const polygon = preparePolygonForRendering(sourcePoints);
      if (polygon.length >= 3) {
        stage1Polygons.push(polygon);
      }
    }

    // Store Stage 1
    const stage1: VisibilityStage = {
      sourcePoints: stage1SourcePoints,
      polygon: stage1Polygons.length > 0 ? stage1Polygons.flat() : [],
      origin: player,
      isValid: stage1Polygons.length > 0,
    };
    this.visibilityStages.push(stage1);

    // =========================================================================
    // STAGE 2+: Reflected visibility through planned surfaces (CASCADING)
    // Each stage uses the PREVIOUS stage's source points to determine visible windows.
    // This ensures proper light propagation through multiple reflections.
    // =========================================================================
    if (plannedSurfaces.length > 0) {
      // Track the current state through the cascade
      let currentSourcePoints: readonly SourcePoint[] = stage1SourcePoints;
      let currentOrigin = player;
      let lastValidStagePolygons: (readonly Vector2[])[] = stage1Polygons;

      // Iterate through each planned surface to compute cascading stages
      for (let surfaceIndex = 0; surfaceIndex < plannedSurfaces.length; surfaceIndex++) {
        const currentSurface = plannedSurfaces[surfaceIndex]!;

        // Extract visible segments on this surface from the PREVIOUS stage's source points
        const visibleSegments = this.extractVisibleSurfaceSegments(
          currentSurface.id,
          currentSourcePoints,
          currentSurface.segment
        );

        if (visibleSegments.length === 0) {
          // No light reaches this surface - stop cascading
          break;
        }

        // Check if current origin is on the reflective side of this surface.
        // If not, light cannot reflect off this surface - stop cascading.
        if (!this.isOriginOnReflectiveSide(currentOrigin, currentSurface)) {
          break;
        }

        // Reflect origin through this surface only (incremental reflection)
        // Uses ReflectionCache for memoization and bidirectional identity
        currentOrigin = reflectionCache.reflect(currentOrigin, currentSurface);

        // Collect all ray targets for this stage (endpoints and junctions from all chains)
        // These will be reflected through the current surface for image-space ray casting
        const allRayTargets: RayTarget[] = [];
        for (const chain of allChainsWithScreen) {
          // Add endpoints
          for (const surface of chain.getSurfaces()) {
            allRayTargets.push(new Endpoint(surface, "start"));
            allRayTargets.push(new Endpoint(surface, "end"));
          }
          // Add junction points
          for (const junction of chain.getJunctionPoints()) {
            allRayTargets.push(junction);
          }
        }

        // Create reflected targets for this stage
        // This enables ray casting in image space (reflectedOrigin -> reflectedTarget)
        const reflectedTargets = createReflectedTargetSet(
          allRayTargets,
          currentSurface,
          reflectionCache
        );

        // Compute visibility through visible windows
        const stageSourcePoints: SourcePoint[] = [];
        const stagePolygons: (readonly Vector2[])[] = [];

        // Reflect range limit center to match the current origin image
        // This ensures the range limit circle follows the reflected player position,
        // matching how the trajectory uses originImage as the range limit center
        const stageRangeLimit = rangeLimit
          ? { pair: rangeLimit.pair, center: currentOrigin }
          : undefined;

        for (const window of visibleSegments) {
          // Pass SourcePoint provenance through the cascade
          // This preserves JunctionPoint info so segment extraction works correctly
          const cone = createConeThroughWindow(
            currentOrigin,
            window.start,
            window.end,
            window.startSource,  // Preserved JunctionPoint/Endpoint/HitPoint
            window.endSource
          );
          const sourcePoints = projectConeV2(
            cone,
            allChainsWithScreen,
            currentSurface.id, // Exclude the current reflection surface
            reflectionCache,
            reflectedTargets,   // Pass reflected targets for image-space ray casting
            stageRangeLimit     // Uses reflected center for this stage
          );
          stageSourcePoints.push(...sourcePoints);
          const polygon = preparePolygonForRendering(sourcePoints);
          if (polygon.length >= 3) {
            stagePolygons.push(polygon);
          }
        }

        // Store this stage
        const stage: VisibilityStage = {
          sourcePoints: stageSourcePoints,
          polygon: stagePolygons.length > 0 ? stagePolygons.flat() : [],
          origin: currentOrigin,
          isValid: stagePolygons.length > 0,
        };
        this.visibilityStages.push(stage);

        // Update current state for next iteration
        currentSourcePoints = stageSourcePoints;
        if (stagePolygons.length > 0) {
          lastValidStagePolygons = stagePolygons;
        }
      }

      // Use the last stage for rendering and highlight mode
      const lastStage = this.visibilityStages[this.visibilityStages.length - 1];
      if (lastStage?.isValid) {
        this.lastSourcePoints = lastStage.sourcePoints;
        this.lastOrigin = lastStage.origin;
        visibilityResult = {
          polygons: lastValidStagePolygons,
          origin: lastStage.origin,
          isValid: true,
        };
      } else {
        // Fall back to stage 1 if no valid reflected stages
        this.lastSourcePoints = stage1SourcePoints;
        this.lastOrigin = player;
        visibilityResult = {
          polygons: stage1Polygons,
          origin: player,
          isValid: stage1Polygons.length > 0,
        };
      }
    } else {
      // No planned surfaces - use Stage 1 (already computed above)
      this.lastSourcePoints = stage1SourcePoints;
      this.lastOrigin = player;

      visibilityResult = {
        polygons: stage1Polygons,
        origin: player,
        isValid: stage1Polygons.length > 0 && stage1Polygons.some((p) => p.length >= 3),
      };
    }

    // Convert to ValidRegionOutline format for compatibility (uses first polygon for legacy)
    const firstPolygon = visibilityResult.polygons[0] ?? [];
    const outline: ValidRegionOutline = {
      vertices: firstPolygon.map((pos, i) => ({
        position: pos,
        type: "surface" as const,
        sourceId: `vertex-${i}`,
      })),
      origin: visibilityResult.origin,
      isValid: visibilityResult.isValid,
    };

    this.lastOutline = outline;

    // Log visibility data if debug logging is enabled
    this.logVisibilitySimple({
      polygon: firstPolygon,
      origin: visibilityResult.origin,
      isValid: visibilityResult.isValid,
    });

    // Clear previous render
    this.graphics.clear();

    // If no valid stages, darken entire screen
    if (this.visibilityStages.length === 0 || !this.visibilityStages.some((s) => s.isValid)) {
      this.renderFullOverlay();
      return;
    }

    // Render all visibility stages with progressive opacity
    // Earlier stages fade into background, later stages stand out
    // Use polygon drawing (not triangle fan) when we have a window (umbrella or planned surfaces)
    // Triangle fan from player only works for 360° visibility
    const hasWindow = windowConfig !== null || plannedSurfaces.length > 0;
    this.renderAllStagesWithCutout(hasWindow);

    // Debug: show outline (for first polygon only)
    if (this.config.showOutline) {
      this.renderOutline(outline);
    }
  }

  /**
   * Render full-screen dark overlay (no valid region).
   */
  private renderFullOverlay(): void {
    const { minX, minY, maxX, maxY } = this.screenBounds;

    this.graphics.setBlendMode(BlendModes.NORMAL);
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Render all visibility stages with progressive opacity.
   *
   * Strategy:
   * 1. Draw full screen with shadow alpha
   * 2. For each stage (earliest to latest):
   *    - Calculate visibility percentage using formula: 10 + 40 / (2^depth)
   *    - Convert to overlay alpha
   *    - Erase and redraw polygons with calculated alpha
   *
   * Earlier stages are rendered first (dimmest) so later stages (brighter)
   * paint over them where they overlap.
   *
   * @param hasWindow Whether visibility is through a window (umbrella or planned surfaces)
   */
  private renderAllStagesWithCutout(hasWindow: boolean): void {
    const { minX, minY, maxX, maxY } = this.screenBounds;
    const totalStages = this.visibilityStages.length;

    if (totalStages === 0) {
      this.renderFullOverlay();
      return;
    }

    this.graphics.setBlendMode(BlendModes.NORMAL);

    // Step 1: Draw full screen with shadow alpha
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Step 2: For each stage, ERASE the polygon area then FILL with stage alpha
    //
    // We draw from EARLIEST to LATEST (Stage 0 first, Stage N last).
    // For each stage:
    //   a) ERASE the polygon to remove existing overlay (shadow or earlier stage)
    //   b) FILL the polygon with this stage's overlay alpha
    //
    // For nested stages (Stage N inside Stage 0):
    // - Stage 0: ERASE (removes shadow), FILL with 0.58 alpha
    // - Stage N: ERASE (removes Stage 0's 0.58), FILL with 0.50 alpha
    // Result: Stage N region has 0.50 alpha (brighter)
    //
    // NOTE: ERASE (destination-out) requires Canvas mode or WebGL with proper
    // blend mode support. In WebGL, ERASE may not work correctly.
    for (let stageIndex = 0; stageIndex < totalStages; stageIndex++) {
      const stage = this.visibilityStages[stageIndex]!;
      if (!stage.isValid || stage.polygon.length < 3) continue;

      const visibility = this.calculateStageVisibility(stageIndex, totalStages);
      const overlayAlpha = this.visibilityToOverlayAlpha(visibility);
      // Convert flat polygon array to vertex format for drawing (fallback)
      const vertices = stage.polygon.map((pos) => ({ position: pos }));

      // Determine if this stage uses a window (all stages after stage 0 do, or stage 0 if hasWindow)
      const stageHasWindow = stageIndex > 0 || hasWindow;

      // Step 2a: ERASE the polygon area (removes shadow/earlier stage overlay)
      this.graphics.setBlendMode(BlendModes.ERASE);
      this.graphics.fillStyle(0xffffff, 1.0);

      // Use arc-aware rendering when range limit is active
      if (this.currentRangeLimit) {
        this.drawPolygonWithArcs(stage.sourcePoints);
      } else if (stageHasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(stage.origin, vertices);
      }

      // Step 2b: FILL with the stage's calculated alpha (lower alpha = brighter)
      this.graphics.setBlendMode(BlendModes.NORMAL);
      this.graphics.fillStyle(this.config.overlayColor, overlayAlpha);

      // Use arc-aware rendering when range limit is active
      if (this.currentRangeLimit) {
        this.drawPolygonWithArcs(stage.sourcePoints);
      } else if (stageHasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(stage.origin, vertices);
      }
    }
  }

  /**
   * Draw a triangle fan from origin to vertices.
   */
  private drawTriangleFan(origin: Vector2, vertices: Array<{ position: Vector2 }>): void {
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i]!;
      const v2 = vertices[(i + 1) % vertices.length]!;

      this.graphics.beginPath();
      this.graphics.moveTo(origin.x, origin.y);
      this.graphics.lineTo(v1.position.x, v1.position.y);
      this.graphics.lineTo(v2.position.x, v2.position.y);
      this.graphics.closePath();
      this.graphics.fillPath();
    }
  }

  /**
   * Draw a simple filled polygon from vertices (for planned surfaces).
   */
  private drawPolygon(vertices: Array<{ position: Vector2 }>): void {
    if (vertices.length < 3) return;

    this.graphics.beginPath();
    this.graphics.moveTo(vertices[0]!.position.x, vertices[0]!.position.y);

    for (let i = 1; i < vertices.length; i++) {
      this.graphics.lineTo(vertices[i]!.position.x, vertices[i]!.position.y);
    }

    this.graphics.closePath();
    this.graphics.fillPath();
  }

  /**
   * Draw a polygon with arc support for range limit edges.
   *
   * Converts SourcePoint[] to VisibilityVertex[], then builds PolygonEdge[],
   * and finally draws with native arc primitives for consecutive range_limit vertices.
   */
  private drawPolygonWithArcs(sourcePoints: readonly SourcePoint[]): void {
    if (sourcePoints.length < 3) return;

    // Convert to visibility vertices with provenance tracking
    const vertices = toVisibilityVertices(sourcePoints);

    // Build arc config if range limit is active
    const arcConfig: ArcConfig | null = this.currentRangeLimit
      ? {
          center: this.currentRangeLimit.center,
          radius: this.currentRangeLimit.pair.radius,
        }
      : null;

    // If we have arc config, use edge-based rendering
    if (arcConfig) {
      const edges = buildPolygonEdges(vertices, arcConfig);
      drawPolygonEdges(this.graphics, edges);
    } else {
      // Fallback to simple polygon drawing
      const positions = vertices.map((v) => ({ position: v.position }));
      this.drawPolygon(positions);
    }
  }

  /**
   * Render the outline for debugging.
   * Shows triangle fan edges from origin to each vertex.
   */
  private renderOutline(outline: ValidRegionOutline): void {
    const vertices = outline.vertices;
    const origin = outline.origin;

    // Filter out origin vertices
    const edgeVertices = vertices.filter((v) => v.type !== "origin");
    if (edgeVertices.length < 2) return;

    // Draw edges between consecutive vertices (the outline perimeter)
    this.graphics.lineStyle(this.config.outlineWidth, this.config.outlineColor, 1.0);

    for (let i = 0; i < edgeVertices.length; i++) {
      const v1 = edgeVertices[i]!;
      const v2 = edgeVertices[(i + 1) % edgeVertices.length]!;

      this.graphics.beginPath();
      this.graphics.moveTo(v1.position.x, v1.position.y);
      this.graphics.lineTo(v2.position.x, v2.position.y);
      this.graphics.strokePath();
    }

    // Draw rays from origin to each vertex (triangle fan spokes)
    this.graphics.lineStyle(1, 0x888888, 0.3);

    for (const v of edgeVertices) {
      this.graphics.beginPath();
      this.graphics.moveTo(origin.x, origin.y);
      this.graphics.lineTo(v.position.x, v.position.y);
      this.graphics.strokePath();
    }

    // Draw origin point
    const originSize = 5;
    this.graphics.fillStyle(0xff0000, 1.0);
    this.graphics.fillRect(
      origin.x - originSize / 2,
      origin.y - originSize / 2,
      originSize,
      originSize
    );
  }

  /**
   * Get the last calculated outline (for debugging/testing).
   */
  getLastOutline(): ValidRegionOutline | null {
    return this.lastOutline;
  }

  /**
   * Log visibility data for debugging.
   */
  private logVisibilitySimple(result: {
    polygon: readonly Vector2[];
    origin: Vector2;
    isValid: boolean;
  }): void {
    if (!TrajectoryDebugLogger.isEnabled()) return;

    const visibilityInfo: VisibilityDebugInfo = {
      origin: { ...result.origin },
      coneSections: [{ startAngle: 0, endAngle: 2 * Math.PI }],
      coneSpan: 360,
      outlineVertices: result.polygon.map((pos) => ({
        position: { ...pos },
        type: "surface" as const,
      })),
      isValid: result.isValid,
    };

    TrajectoryDebugLogger.logVisibility(visibilityInfo);
  }

  /**
   * Clear the overlay.
   */
  clear(): void {
    this.graphics.clear();
    this.lastOutline = null;
  }

  /**
   * Calculate visibility percentage for a stage based on its depth.
   *
   * Uses the formula: visibility = 32 / (4^depth)
   * Where depth is distance from the latest stage (0 = latest).
   *
   * Examples:
   * - background: 0%
   * - polygon N (latest, depth 0): 32 / 1 = 32%
   * - polygon N-1 (depth 1): 32 / 4 = 8%
   * - polygon N-2 (depth 2): 32 / 16 = 2%
   * - polygon N-3 (depth 3): 32 / 64 = 0.5%
   *
   * @param stageIndex The stage index (0-based, 0 = earliest)
   * @param totalStages Total number of stages
   * @returns Visibility percentage (asymptotically approaching 0)
   */
  private calculateStageVisibility(stageIndex: number, totalStages: number): number {
    const depth = totalStages - 1 - stageIndex;
    return 32 / 4 ** depth;
  }

  /**
   * Convert visibility percentage to overlay alpha.
   *
   * Visibility directly maps to how much of the scene shows through:
   * - 0% visibility → shadowAlpha (darkest, for background)
   * - 32% visibility → shadowAlpha * 0.68 (brightest polygon)
   *
   * Formula: overlayAlpha = shadowAlpha * (1 - visibility / 100)
   *
   * @param visibility Visibility percentage (0-100)
   * @returns Overlay alpha (0 to shadowAlpha)
   */
  private visibilityToOverlayAlpha(visibility: number): number {
    const { shadowAlpha } = this.config;
    return shadowAlpha * (1 - visibility / 100);
  }

  /**
   * Check if the given origin point is on the reflective side of a surface.
   *
   * This is used to prevent reflecting light through surfaces when the light
   * comes from the non-reflective (back) side.
   *
   * @param origin The light origin point
   * @param surface The surface to check
   * @returns true if origin is on the reflective side, false otherwise
   */
  private isOriginOnReflectiveSide(origin: Vector2, surface: Surface): boolean {
    // Calculate direction from origin toward the surface center
    const midpoint = {
      x: (surface.segment.start.x + surface.segment.end.x) / 2,
      y: (surface.segment.start.y + surface.segment.end.y) / 2,
    };
    const direction = {
      x: midpoint.x - origin.x,
      y: midpoint.y - origin.y,
    };

    // canReflectFrom checks if incoming light from this direction can reflect
    return surface.canReflectFrom(direction);
  }
}
