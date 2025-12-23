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

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { ScreenBounds, PropagationResult } from "./ConePropagator";
import { propagateCone } from "./ConePropagator";
import { coneCoverage } from "./ConeSection";
import { buildOutline, simplifyOutline, type ValidRegionOutline } from "./OutlineBuilder";
import { TrajectoryDebugLogger, type VisibilityDebugInfo } from "../TrajectoryDebugLogger";

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
  shadowAlpha: 0.35,  // Darker in shadow
  litAlpha: 0.15,     // Slightly darker in lit areas (subtle tint)
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
   * @param player Player position
   * @param plannedSurfaces Planned surfaces (windows)
   * @param allSurfaces All surfaces in the scene
   */
  render(
    player: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): void {
    // Calculate valid region
    const propagationResult = propagateCone(player, plannedSurfaces, allSurfaces);
    const rawOutline = buildOutline(propagationResult, this.screenBounds, allSurfaces);
    const outline = simplifyOutline(rawOutline);

    this.lastOutline = outline;

    // Log visibility data if debug logging is enabled
    this.logVisibility(propagationResult, outline);

    // Clear previous render
    this.graphics.clear();

    // If no valid region, darken entire screen
    if (!outline.isValid || outline.vertices.length < 3) {
      this.renderFullOverlay();
      return;
    }

    // Render the overlay with valid region cutout
    this.renderOverlayWithCutout(outline);

    // Debug: show outline
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
   * Render overlay with valid region having a subtle brightness difference.
   *
   * Strategy:
   * 1. Draw full screen with shadow alpha
   * 2. Draw valid region as triangle fan from origin with ERASE to cut out
   * 3. Draw valid region again with lit alpha (lighter tint)
   *
   * Triangle fan rendering from origin ensures correct fill for visibility polygons.
   */
  private renderOverlayWithCutout(outline: ValidRegionOutline): void {
    const { minX, minY, maxX, maxY } = this.screenBounds;
    const vertices = outline.vertices;
    const origin = outline.origin;

    // Filter out origin vertices from the outline (we use the actual origin)
    const edgeVertices = vertices.filter(v => v.type !== "origin");
    if (edgeVertices.length < 2) {
      this.renderFullOverlay();
      return;
    }

    this.graphics.setBlendMode(BlendModes.NORMAL);

    // Step 1: Draw full screen with shadow alpha
    this.graphics.fillStyle(this.config.overlayColor, this.config.shadowAlpha);
    this.graphics.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Step 2: Erase the valid region using triangle fan from origin
    this.graphics.setBlendMode(BlendModes.ERASE);
    this.graphics.fillStyle(0xffffff, 1.0);

    // Draw triangle fan: origin -> vertex[i] -> vertex[i+1]
    for (let i = 0; i < edgeVertices.length; i++) {
      const v1 = edgeVertices[i]!;
      const v2 = edgeVertices[(i + 1) % edgeVertices.length]!;

      this.graphics.beginPath();
      this.graphics.moveTo(origin.x, origin.y);
      this.graphics.lineTo(v1.position.x, v1.position.y);
      this.graphics.lineTo(v2.position.x, v2.position.y);
      this.graphics.closePath();
      this.graphics.fillPath();
    }

    // Step 3: Draw valid region with lit alpha (subtle tint)
    this.graphics.setBlendMode(BlendModes.NORMAL);
    this.graphics.fillStyle(this.config.overlayColor, this.config.litAlpha);

    // Draw triangle fan again for the lit tint
    for (let i = 0; i < edgeVertices.length; i++) {
      const v1 = edgeVertices[i]!;
      const v2 = edgeVertices[(i + 1) % edgeVertices.length]!;

      this.graphics.beginPath();
      this.graphics.moveTo(origin.x, origin.y);
      this.graphics.lineTo(v1.position.x, v1.position.y);
      this.graphics.lineTo(v2.position.x, v2.position.y);
      this.graphics.closePath();
      this.graphics.fillPath();
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
    const edgeVertices = vertices.filter(v => v.type !== "origin");
    if (edgeVertices.length < 2) return;

    // Draw edges between consecutive vertices (the outline perimeter)
    this.graphics.lineStyle(
      this.config.outlineWidth,
      this.config.outlineColor,
      1.0
    );

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
  private logVisibility(propagation: PropagationResult, outline: ValidRegionOutline): void {
    if (!TrajectoryDebugLogger.isEnabled()) return;

    const cone = propagation.finalCone ?? [];
    const vertices = outline.vertices ?? [];

    const visibilityInfo: VisibilityDebugInfo = {
      origin: propagation.finalOrigin ? { ...propagation.finalOrigin } : { x: 0, y: 0 },
      coneSections: cone.map(s => ({
        startAngle: s.startAngle,
        endAngle: s.endAngle,
      })),
      coneSpan: coneCoverage(cone),
      outlineVertices: vertices.map(v => ({
        position: { ...v.position },
        type: v.type,
      })),
      isValid: outline.isValid,
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

