/**
 * HighlightRenderer - Render dashed polygon outlines for light cone highlighting
 *
 * Draws cones of light as dashed polygon outlines to show which portions
 * of the current visibility reach a target surface.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dash pattern configuration for dashed lines.
 */
export interface DashPattern {
  /** Length of each dash in pixels */
  readonly dashLength: number;
  /** Length of each gap in pixels */
  readonly gapLength: number;
}

/**
 * Configuration for the highlight renderer.
 */
export interface HighlightRendererConfig {
  /** Line color (hex) */
  readonly color: number;
  /** Line alpha (0-1) */
  readonly alpha: number;
  /** Line width in pixels */
  readonly lineWidth: number;
  /** Dash pattern */
  readonly dashPattern: DashPattern;
}

/**
 * A line segment for dashed rendering.
 */
export interface DashSegment {
  readonly start: Vector2;
  readonly end: Vector2;
}

// =============================================================================
// DASHED PATH GENERATION
// =============================================================================

/**
 * Generate dash segments along a line from start to end.
 *
 * @param start Starting point
 * @param end Ending point
 * @param pattern Dash pattern to use
 * @returns Array of dash segments to render
 */
export function generateDashedPath(
  start: Vector2,
  end: Vector2,
  pattern: DashPattern
): DashSegment[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return [];
  }

  // Normalize direction
  const dirX = dx / length;
  const dirY = dy / length;

  const segments: DashSegment[] = [];
  let pos = 0;
  let inDash = true;

  while (pos < length) {
    if (inDash) {
      // Draw a dash
      const dashEnd = Math.min(pos + pattern.dashLength, length);
      segments.push({
        start: {
          x: start.x + dirX * pos,
          y: start.y + dirY * pos,
        },
        end: {
          x: start.x + dirX * dashEnd,
          y: start.y + dirY * dashEnd,
        },
      });
      pos = dashEnd;
      inDash = false;
    } else {
      // Skip the gap
      pos = Math.min(pos + pattern.gapLength, length);
      inDash = true;
    }
  }

  return segments;
}

// =============================================================================
// PHASER GRAPHICS INTERFACE
// =============================================================================

/**
 * Minimal graphics interface for rendering.
 * This allows the renderer to work with Phaser graphics or mock objects.
 */
interface GraphicsLike {
  clear(): void;
  lineStyle(width: number, color: number, alpha: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  strokePath(): void;
  beginPath(): void;
}

// =============================================================================
// HIGHLIGHT RENDERER CLASS
// =============================================================================

/**
 * Renderer for dashed polygon outlines highlighting light cones.
 */
export class HighlightRenderer {
  private readonly graphics: GraphicsLike;
  private readonly config: HighlightRendererConfig;

  constructor(graphics: GraphicsLike, config: HighlightRendererConfig) {
    this.graphics = graphics;
    this.config = config;
  }

  /**
   * Render a single polygon outline with dashed lines.
   *
   * @param polygon Polygon vertices (at least 3)
   */
  renderPolygonOutline(polygon: readonly Vector2[]): void {
    this.graphics.clear();

    if (polygon.length < 3) {
      return;
    }

    this.renderPolygonOutlineInternal(polygon);
  }

  /**
   * Render multiple polygon outlines.
   * Clears once at the beginning, then renders all polygons.
   *
   * @param polygons Array of polygons to render
   */
  renderMultipleOutlines(polygons: readonly (readonly Vector2[])[]): void {
    console.log("[HighlightRenderer] renderMultipleOutlines:", polygons.length, "polygons");
    this.graphics.clear();

    for (const polygon of polygons) {
      if (polygon.length >= 3) {
        console.log("[HighlightRenderer] Rendering polygon with", polygon.length, "vertices:", polygon.slice(0, 3));
        this.renderPolygonOutlineInternal(polygon);
      }
    }
  }

  /**
   * Clear the highlight rendering.
   */
  clear(): void {
    this.graphics.clear();
  }

  /**
   * Internal method to render a single polygon (doesn't clear).
   */
  private renderPolygonOutlineInternal(polygon: readonly Vector2[]): void {
    const { color, alpha, lineWidth, dashPattern } = this.config;

    this.graphics.lineStyle(lineWidth, color, alpha);

    // Draw dashed lines for each edge of the polygon
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      if (!start || !end) continue;

      const dashSegments = generateDashedPath(start, end, dashPattern);

      for (const segment of dashSegments) {
        this.graphics.beginPath();
        this.graphics.moveTo(segment.start.x, segment.start.y);
        this.graphics.lineTo(segment.end.x, segment.end.y);
        this.graphics.strokePath();
      }
    }
  }
}
