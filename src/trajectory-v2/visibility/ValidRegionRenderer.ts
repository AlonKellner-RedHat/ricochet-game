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
import { type SourcePoint, isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { TrajectoryDebugLogger, type VisibilityDebugInfo } from "../TrajectoryDebugLogger";
import {
  createConeThroughWindow,
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "./ConeProjectionV2";
import type { ScreenBounds } from "./ConePropagator";
import type { ValidRegionOutline } from "./OutlineBuilder";
import { preparePolygonForRendering } from "./RenderingDedup";
import { type Segment, type WindowConfig, getWindowSegments, isMultiWindow } from "./WindowConfig";

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
export class ValidRegionRenderer {
  private graphics: IValidRegionGraphics;
  private config: ValidRegionConfig;
  private screenBounds: ScreenBounds;
  private lastOutline: ValidRegionOutline | null = null;
  private lastSourcePoints: readonly SourcePoint[] = [];
  private lastOrigin: Vector2 | null = null;

  constructor(
    graphics: IValidRegionGraphics,
    screenBounds: ScreenBounds,
    config: Partial<ValidRegionConfig> = {}
  ) {
    this.graphics = graphics;
    this.screenBounds = screenBounds;
    this.config = { ...DEFAULT_VALID_REGION_CONFIG, ...config };
  }

  /**
   * Update screen bounds (e.g., on resize).
   */
  setScreenBounds(bounds: ScreenBounds): void {
    this.screenBounds = bounds;
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

    // #region agent log
    if (dedupedResult.length > 0) {
      fetch('http://localhost:7244/ingest/35819445-5c83-4f31-b501-c940886787b5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ValidRegionRenderer.ts:180',message:'getVisibleSurfacePoints result',data:{targetSurfaceId,pointCount:dedupedResult.length,points:dedupedResult},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'POINTS'})}).catch(()=>{});
    }
    // #endregion

    return dedupedResult;
  }

  /**
   * Get the last origin used for visibility calculation.
   */
  getLastOrigin(): Vector2 | null {
    return this.lastOrigin;
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
   * @param allSurfaces All surfaces in the scene
   * @param windowConfig Optional window configuration for cone projection (single or multi-window)
   */
  render(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    windowConfig: WindowConfig | null = null
  ): void {
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

    if (windowConfig || plannedSurfaces.length > 0) {
      // Calculate origin and windows
      let origin = player;
      let windows: readonly Segment[];

      // ID of the window surface to exclude from obstacles
      // This prevents floating-point issues where the window blocks itself
      let excludeSurfaceId: string | undefined;

      if (plannedSurfaces.length > 0) {
        // Reflect player through all planned surfaces to get player image
        for (const surface of plannedSurfaces) {
          origin = reflectPointThroughLine(origin, surface.segment.start, surface.segment.end);
        }
        // Last planned surface is the window
        const lastSurface = plannedSurfaces[plannedSurfaces.length - 1]!;
        windows = [{ start: lastSurface.segment.start, end: lastSurface.segment.end }];
        excludeSurfaceId = lastSurface.id;
      } else {
        // Umbrella mode - get all window segments from config
        // (single window for full umbrella, multiple for umbrella hole)
        windows = getWindowSegments(windowConfig!);
      }

      // Project cone(s) through each window - supports multi-window (umbrella hole)
      const allPolygons: (readonly Vector2[])[] = [];
      const allSourcePoints: SourcePoint[] = [];
      for (const window of windows) {
        const cone = createConeThroughWindow(origin, window.start, window.end);
        const sourcePoints = projectConeV2(cone, allSurfaces, this.screenBounds, excludeSurfaceId);
        allSourcePoints.push(...sourcePoints);
        const rawPolygon = toVector2Array(sourcePoints);
        const polygon = preparePolygonForRendering(rawPolygon);
        if (polygon.length >= 3) {
          allPolygons.push(polygon);
        }
      }

      // Store source points and origin for provenance-based highlight mode
      // For planned surfaces: use reflected origin (player image)
      // For umbrella mode: use player position
      this.lastSourcePoints = allSourcePoints;
      this.lastOrigin = plannedSurfaces.length > 0 ? origin : player;

      visibilityResult = {
        polygons: allPolygons,
        origin,
        isValid: allPolygons.length > 0 && allPolygons.some((p) => p.length >= 3),
      };
    } else {
      // Full 360° visibility from player using epsilon-free ConeProjectionV2
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, allSurfaces, this.screenBounds);
      // Store source points for provenance-based operations
      this.lastSourcePoints = sourcePoints;
      this.lastOrigin = player;
      // Convert SourcePoints to Vector2 and apply visual deduplication
      const rawPolygon = toVector2Array(sourcePoints);
      const polygon = preparePolygonForRendering(rawPolygon);
      visibilityResult = {
        polygons: polygon.length >= 3 ? [polygon] : [],
        origin: player,
        isValid: polygon.length >= 3,
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

    // If no valid region, darken entire screen
    if (!visibilityResult.isValid || visibilityResult.polygons.length === 0) {
      this.renderFullOverlay();
      return;
    }

    // Render the overlay with valid region cutout
    // Use polygon drawing (not triangle fan) when we have a window (umbrella or planned surfaces)
    // Triangle fan from player only works for 360° visibility
    const hasWindow = windowConfig !== null || plannedSurfaces.length > 0;
    this.renderOverlayWithCutoutMulti(
      visibilityResult.polygons,
      visibilityResult.origin,
      hasWindow
    );

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
   * Render overlay with multiple valid regions (for umbrella hole mode).
   *
   * Strategy:
   * 1. Draw full screen with shadow alpha
   * 2. For each polygon, erase and draw with lit alpha
   *
   * @param polygons Array of visibility polygons
   * @param origin The visibility origin (player or reflected image)
   * @param hasWindow Whether visibility is through a window (umbrella or planned surfaces)
   */
  private renderOverlayWithCutoutMulti(
    polygons: readonly (readonly Vector2[])[],
    origin: Vector2,
    hasWindow: boolean
  ): void {
    const { minX, minY, maxX, maxY } = this.screenBounds;

    this.graphics.setBlendMode(BlendModes.NORMAL);

    // Step 1: Draw full screen with shadow alpha
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Step 2 & 3: For each polygon, erase and draw with lit alpha
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;

      // Convert to vertex format for drawing
      const vertices = polygon.map((pos) => ({ position: pos }));

      // Erase this polygon area
      this.graphics.setBlendMode(BlendModes.ERASE);
      this.graphics.fillStyle(0xffffff, 1.0);

      if (hasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(origin, vertices);
      }

      // Draw with lit alpha
      this.graphics.setBlendMode(BlendModes.NORMAL);
      this.graphics.fillStyle(this.config.overlayColor, this.config.litAlpha);

      if (hasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(origin, vertices);
      }
    }
  }

  /**
   * Render overlay with valid region having a subtle brightness difference.
   *
   * Strategy:
   * 1. Draw full screen with shadow alpha
   * 2. Draw valid region with ERASE to cut out
   * 3. Draw valid region again with lit alpha (lighter tint)
   *
   * When there's a window (umbrella or planned surfaces), the visibility
   * polygon does NOT include the origin. Using a triangle fan from origin
   * would incorrectly include the area between origin and the window.
   * Instead, we render the polygon directly.
   *
   * For full 360° visibility (no window), we use triangle fan from origin
   * (the player) which gives correct visibility filling.
   *
   * @deprecated Use renderOverlayWithCutoutMulti for multi-polygon support
   */
  private renderOverlayWithCutout(outline: ValidRegionOutline, hasWindow: boolean): void {
    const { minX, minY, maxX, maxY } = this.screenBounds;
    const vertices = outline.vertices;
    const origin = outline.origin;

    // Filter out origin vertices from the outline (we use the actual origin)
    const edgeVertices = vertices.filter((v) => v.type !== "origin");
    if (edgeVertices.length < 2) {
      this.renderFullOverlay();
      return;
    }

    this.graphics.setBlendMode(BlendModes.NORMAL);

    // Step 1: Draw full screen with shadow alpha
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Step 2: Erase the valid region
    this.graphics.setBlendMode(BlendModes.ERASE);
    this.graphics.fillStyle(0xffffff, 1.0);

    if (hasWindow) {
      // For windowed visibility (umbrella or planned surfaces),
      // draw the polygon directly - origin is not part of the polygon
      this.drawPolygon(edgeVertices);
    } else {
      // For full 360° visibility, use triangle fan from player
      this.drawTriangleFan(origin, edgeVertices);
    }

    // Step 3: Draw valid region with lit alpha (subtle tint)
    this.graphics.setBlendMode(BlendModes.NORMAL);
    this.graphics.fillStyle(this.config.overlayColor, this.config.litAlpha);

    if (hasWindow) {
      this.drawPolygon(edgeVertices);
    } else {
      this.drawTriangleFan(origin, edgeVertices);
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
}
