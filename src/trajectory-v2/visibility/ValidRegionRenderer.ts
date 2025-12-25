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
import { RayBasedVisibilityCalculator } from "@/trajectory-v2/calculators/RayBasedVisibilityCalculator";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type {
  IVisibilityCalculator,
  VisibilityResult,
} from "@/trajectory-v2/interfaces/IVisibilityCalculator";
import {
  TrajectoryDebugLogger,
  type IntermediatePolygonDebugInfo,
  type VisibilityDebugInfo,
  type ValidPolygonDebugInfo,
  type PlannedPolygonDebugInfo,
} from "../TrajectoryDebugLogger";
import { propagateWithIntermediates } from "./AnalyticalPropagation";
import {
  createFullCone,
  createConeThroughWindow,
  projectCone,
  type Segment,
} from "./ConeProjection";
import type { ScreenBounds } from "./ConePropagator";
import type { ValidRegionOutline } from "./OutlineBuilder";

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
  /** Whether to show intermediate polygons */
  readonly showIntermediatePolygons: boolean;
  /** Base alpha for intermediate polygons (most faded) */
  readonly intermediateAlphaBase: number;
  /** Alpha decay factor for each step toward final */
  readonly intermediateAlphaDecay: number;
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
  showIntermediatePolygons: false,
  intermediateAlphaBase: 0.08, // Most faded for step 0
  intermediateAlphaDecay: 0.85, // Each step less faded
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
 */
export class ValidRegionRenderer {
  private graphics: IValidRegionGraphics;
  private config: ValidRegionConfig;
  private screenBounds: ScreenBounds;
  private lastOutline: ValidRegionOutline | null = null;
  private visibilityCalculator: IVisibilityCalculator;

  constructor(
    graphics: IValidRegionGraphics,
    screenBounds: ScreenBounds,
    config: Partial<ValidRegionConfig> = {},
    visibilityCalculator?: IVisibilityCalculator
  ) {
    this.graphics = graphics;
    this.screenBounds = screenBounds;
    this.config = { ...DEFAULT_VALID_REGION_CONFIG, ...config };
    // Default to ray-based (new analytical algorithm)
    this.visibilityCalculator = visibilityCalculator ?? new RayBasedVisibilityCalculator();
  }

  /**
   * Set a different visibility calculator.
   *
   * Use this to switch between angle-based and ray-based implementations.
   */
  setVisibilityCalculator(calculator: IVisibilityCalculator): void {
    this.visibilityCalculator = calculator;
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
   */
  render(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    umbrella: Segment | null = null
  ): void {
    // Use new ConeProjection algorithm when umbrella is provided
    // This is the clean, simple algorithm that properly handles windowed cones
    let visibilityResult: { polygon: readonly Vector2[]; origin: Vector2; isValid: boolean };

    if (umbrella) {
      // Create cone through umbrella window
      const cone = createConeThroughWindow(player, umbrella.start, umbrella.end);
      const polygon = projectCone(cone, allSurfaces, this.screenBounds);

      visibilityResult = {
        polygon,
        origin: player,
        isValid: polygon.length >= 3,
      };
    } else {
      // Use legacy calculator for backward compatibility
      visibilityResult = this.visibilityCalculator.calculate(
        player,
        allSurfaces,
        this.screenBounds,
        plannedSurfaces
      );
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

    // Calculate polygons for logging and optional visualization
    let intermediatePolygons: IntermediatePolygonDebugInfo[] | undefined;
    let validPolygons: ValidPolygonDebugInfo[] | undefined;
    let plannedPolygonsDebug: PlannedPolygonDebugInfo[] | undefined;

    if (plannedSurfaces.length > 0) {
      const propagation = propagateWithIntermediates(
        player,
        plannedSurfaces,
        allSurfaces,
        this.screenBounds
      );

      // Legacy format for compatibility
      intermediatePolygons = propagation.steps.map((step) => ({
        stepIndex: step.index,
        origin: { ...step.origin },
        vertexCount: step.polygon.length,
        vertices: step.polygon.map((v) => ({ ...v })),
        isValid: step.isValid,
        windowSurfaceId: step.window?.surface.id,
      }));

      // New format: valid polygons (N+1 for N surfaces)
      validPolygons = propagation.validPolygons.map((vp) => ({
        stepIndex: vp.index,
        origin: { ...vp.origin },
        vertexCount: vp.polygon.length,
        vertices: vp.polygon.map((v) => ({ ...v })),
        isValid: vp.isValid,
      }));

      // New format: planned polygons (N for N surfaces)
      plannedPolygonsDebug = propagation.plannedPolygons.map((pp) => ({
        stepIndex: pp.index,
        origin: { ...pp.origin },
        vertexCount: pp.polygon.length,
        vertices: pp.polygon.map((v) => ({ ...v })),
        isValid: pp.isValid,
        targetSurfaceId: pp.targetSurface.id,
      }));
    }

    // Log visibility data if debug logging is enabled
    this.logVisibilitySimple(visibilityResult, intermediatePolygons, validPolygons, plannedPolygonsDebug);

    // Clear previous render
    this.graphics.clear();

    // If no valid region, darken entire screen
    if (!outline.isValid || outline.vertices.length < 3) {
      this.renderFullOverlay();
      return;
    }

    // Render intermediate polygons if enabled
    if (this.config.showIntermediatePolygons && intermediatePolygons && intermediatePolygons.length > 1) {
      this.renderIntermediatePolygons(intermediatePolygons);
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
   * Render intermediate polygons with faded alphas.
   * Each step is rendered with decreasing opacity from base to final.
   */
  private renderIntermediatePolygons(intermediates: IntermediatePolygonDebugInfo[]): void {
    const totalSteps = intermediates.length;

    for (let i = 0; i < totalSteps - 1; i++) {
      // Skip the final polygon (it's rendered as the main cutout)
      const step = intermediates[i]!;

      if (!step.isValid || step.vertices.length < 3) continue;

      // Calculate alpha for this step (earlier steps are more faded)
      // Alpha increases from base toward final
      const stepsFromEnd = totalSteps - 1 - i;
      const alpha = this.config.intermediateAlphaBase * Math.pow(
        1 / this.config.intermediateAlphaDecay,
        i
      );

      // Render the intermediate polygon with subtle tint
      this.graphics.setBlendMode(BlendModes.NORMAL);
      this.graphics.fillStyle(0x4488ff, Math.min(alpha, 0.3)); // Blue tint, capped

      this.graphics.beginPath();
      this.graphics.moveTo(step.vertices[0]!.x, step.vertices[0]!.y);

      for (let j = 1; j < step.vertices.length; j++) {
        this.graphics.lineTo(step.vertices[j]!.x, step.vertices[j]!.y);
      }

      this.graphics.closePath();
      this.graphics.fillPath();

      // Draw outline for the intermediate polygon
      this.graphics.lineStyle(1, 0x4488ff, alpha * 2);

      for (let j = 0; j < step.vertices.length; j++) {
        const v1 = step.vertices[j]!;
        const v2 = step.vertices[(j + 1) % step.vertices.length]!;

        this.graphics.beginPath();
        this.graphics.moveTo(v1.x, v1.y);
        this.graphics.lineTo(v2.x, v2.y);
        this.graphics.strokePath();
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
   * Log visibility data for debugging (new simple algorithm).
   */
  private logVisibilitySimple(
    result: {
      polygon: readonly Vector2[];
      origin: Vector2;
      isValid: boolean;
    },
    intermediatePolygons?: IntermediatePolygonDebugInfo[],
    validPolygons?: ValidPolygonDebugInfo[],
    plannedPolygons?: PlannedPolygonDebugInfo[]
  ): void {
    if (!TrajectoryDebugLogger.isEnabled()) return;

    const visibilityInfo: VisibilityDebugInfo = {
      origin: { ...result.origin },
      coneSections: [{ startAngle: 0, endAngle: 2 * Math.PI }], // Full circle for simple visibility
      coneSpan: 360,
      outlineVertices: result.polygon.map((pos, i) => ({
        position: { ...pos },
        type: "surface" as const,
      })),
      isValid: result.isValid,
      intermediatePolygons, // Legacy
      validPolygons,
      plannedPolygons,
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
