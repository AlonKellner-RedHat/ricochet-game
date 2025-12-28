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
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import {
  TrajectoryDebugLogger,
  type VisibilityDebugInfo,
} from "../TrajectoryDebugLogger";
import {
  createFullCone,
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
  type Segment,
} from "./ConeProjectionV2";
import type { ScreenBounds } from "./ConePropagator";
import { preparePolygonForRendering } from "./RenderingDedup";
import type { ValidRegionOutline } from "./OutlineBuilder";
import {
  propagateThroughSurfaces,
  type PropagationResult,
  type PropagationStage,
} from "./SectorPropagation";

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
   * Update configuration.
   */
  setConfig(config: Partial<ValidRegionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate and render the valid region for given player and surfaces.
   *
   * Uses either:
   * - ConeProjection (new algorithm) when umbrella is provided
   * - Legacy visibility calculator when no umbrella
   *
   * For planned surfaces, visibility is constrained to the reflective side
   * of the last planned surface (V.5 first principle).
   *
   * @param player Player position
   * @param plannedSurfaces Planned surfaces (windows)
   * @param allSurfaces All surfaces in the scene
   * @param umbrella Optional umbrella segment for windowed cone projection
   * @param useMultiStagePropagation If true, uses new multi-stage propagation with progressive opacity
   */
  render(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    umbrella: Segment | null = null,
    useMultiStagePropagation = false
  ): void {
    // Use multi-stage propagation for planned surfaces when enabled
    if (useMultiStagePropagation && plannedSurfaces.length > 0) {
      this.renderMultiStage(player, plannedSurfaces, allSurfaces);
      return;
    }

    // Unified ConeProjection algorithm for all cases:
    // - 360° visibility: full cone from player
    // - Umbrella mode: cone through umbrella window from player
    // - Planned surfaces: cone through last surface window from reflected player image
    let visibilityResult: { polygon: readonly Vector2[]; origin: Vector2; isValid: boolean };

    if (umbrella || plannedSurfaces.length > 0) {
      // Calculate origin and window
      let origin = player;
      let window: Segment;

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
        window = { start: lastSurface.segment.start, end: lastSurface.segment.end };
        excludeSurfaceId = lastSurface.id;
      } else {
        // Umbrella mode - no surface to exclude (umbrella is not in allSurfaces)
        window = umbrella!;
      }

      // Create and project cone through window using epsilon-free ConeProjectionV2
      // Exclude the window surface from obstacles to prevent self-blocking
      const cone = createConeThroughWindow(origin, window.start, window.end);
      const sourcePoints = projectConeV2(cone, allSurfaces, this.screenBounds, excludeSurfaceId);
      // Convert SourcePoints to Vector2 and apply visual deduplication
      const rawPolygon = toVector2Array(sourcePoints);
      const polygon = preparePolygonForRendering(rawPolygon);

      visibilityResult = { polygon, origin, isValid: polygon.length >= 3 };
    } else {
      // Full 360° visibility from player using epsilon-free ConeProjectionV2
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, allSurfaces, this.screenBounds);
      // Convert SourcePoints to Vector2 and apply visual deduplication
      const rawPolygon = toVector2Array(sourcePoints);
      const polygon = preparePolygonForRendering(rawPolygon);
      visibilityResult = { polygon, origin: player, isValid: polygon.length >= 3 };
    }

    // Convert to ValidRegionOutline format for compatibility
    const outline: ValidRegionOutline = {
      vertices: visibilityResult.polygon.map((pos, i) => ({
        position: pos,
        type: "surface" as const,
        sourceId: `vertex-${i}`,
      })),
      origin: visibilityResult.origin,
      isValid: visibilityResult.isValid,
    };

    this.lastOutline = outline;

    // Log visibility data if debug logging is enabled
    this.logVisibilitySimple(visibilityResult);

    // Clear previous render
    this.graphics.clear();

    // If no valid region, darken entire screen
    if (!outline.isValid || outline.vertices.length < 3) {
      this.renderFullOverlay();
      return;
    }

    // Render the overlay with valid region cutout
    // Use polygon drawing (not triangle fan) when we have a window (umbrella or planned surfaces)
    // Triangle fan from player only works for 360° visibility
    const hasWindow = umbrella !== null || plannedSurfaces.length > 0;
    this.renderOverlayWithCutout(outline, hasWindow);

    // Debug: show outline
    if (this.config.showOutline) {
      this.renderOutline(outline);
    }
  }

  /**
   * Render multi-stage visibility with progressive opacity.
   *
   * This implements the first principle:
   * **Light that is reflected through a surface must have first reached that surface.**
   *
   * Each stage's opacity increases progressively:
   * - Stage 0 (initial): Most transparent (20% with 5 surfaces)
   * - Final stage: Fully visible (100%)
   *
   * Earlier polygons are more transparent because they represent "earlier"
   * light in the chain, making the final destination most prominent.
   */
  private renderMultiStage(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): void {
    // Calculate propagation through all surfaces
    const result = propagateThroughSurfaces(
      player,
      plannedSurfaces,
      allSurfaces,
      this.screenBounds
    );

    // Clear previous render
    this.graphics.clear();

    // If no valid stages, darken entire screen
    if (!result.isValid) {
      this.renderFullOverlay();
      return;
    }

    // Step 1: Draw full screen with shadow alpha
    const { minX, minY, maxX, maxY } = this.screenBounds;
    this.graphics.setBlendMode(BlendModes.NORMAL);
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Step 2: Render each stage with its specific opacity
    // Later stages are rendered on top with higher opacity
    for (const stage of result.stages) {
      this.renderStage(stage, player);
    }

    // Update lastOutline with final stage for compatibility
    const finalStage = result.stages[result.stages.length - 1];
    if (finalStage && finalStage.polygons.length > 0) {
      const mainPolygon = finalStage.polygons[0]!;
      this.lastOutline = {
        vertices: mainPolygon.map((pos, i) => ({
          position: pos,
          type: "surface" as const,
          sourceId: `vertex-${i}`,
        })),
        origin: finalStage.origin,
        isValid: mainPolygon.length >= 3,
      };
    }
  }

  /**
   * Render a single propagation stage with its specific opacity.
   */
  private renderStage(stage: PropagationStage, player: Vector2): void {
    for (const polygon of stage.polygons) {
      if (polygon.length < 3) continue;

      // Prepare polygon for rendering
      const preparedPolygon = preparePolygonForRendering([...polygon]);
      if (preparedPolygon.length < 3) continue;

      const vertices = preparedPolygon.map((pos) => ({ position: pos }));

      // Erase this region from the shadow
      this.graphics.setBlendMode(BlendModes.ERASE);
      this.graphics.fillStyle(0xffffff, 1.0);

      // For initial stage (no window), use triangle fan from player
      // For windowed stages, use polygon drawing
      const hasWindow = stage.surfaceIndex >= 0;
      if (hasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(player, vertices);
      }

      // Draw lit region with stage-specific opacity
      // litAlpha is the base, modulated by stage opacity
      const stageAlpha = this.config.litAlpha * stage.opacity;
      this.graphics.setBlendMode(BlendModes.NORMAL);
      this.graphics.fillStyle(this.config.overlayColor, stageAlpha);

      if (hasWindow) {
        this.drawPolygon(vertices);
      } else {
        this.drawTriangleFan(player, vertices);
      }
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
  private logVisibilitySimple(
    result: {
      polygon: readonly Vector2[];
      origin: Vector2;
      isValid: boolean;
    }
  ): void {
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
