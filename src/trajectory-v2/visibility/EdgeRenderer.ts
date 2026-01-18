/**
 * EdgeRenderer - Render visibility polygon edges with arc support.
 *
 * This module provides functions to draw PolygonEdge arrays,
 * handling both LineEdge (lineTo) and ArcEdge (arc) types.
 *
 * NOTE: Arc angles are computed at render time using Math.atan2.
 * This is acceptable per project rules since:
 * 1. Rendering is the final output step
 * 2. No decisions are made based on these angles
 * 3. The arc points are already determined by provenance
 */

import type { IValidRegionGraphics } from "./ValidRegionRenderer";
import {
  type PolygonEdge,
  isLineEdge,
  isArcEdge,
} from "./PolygonEdge";

/**
 * Draw a polygon from edges to the graphics context.
 *
 * Handles both LineEdge and ArcEdge types:
 * - LineEdge: uses lineTo()
 * - ArcEdge: uses arc() with angles computed from from/to points
 *
 * @param graphics - The graphics context to draw to
 * @param edges - Array of polygon edges (closed loop)
 */
export function drawPolygonEdges(
  graphics: IValidRegionGraphics,
  edges: readonly PolygonEdge[]
): void {
  if (edges.length === 0) {
    return;
  }

  graphics.beginPath();

  // Start at the first edge's from point
  const firstEdge = edges[0]!;
  graphics.moveTo(firstEdge.from.x, firstEdge.from.y);

  // Draw each edge
  for (const edge of edges) {
    if (isLineEdge(edge)) {
      graphics.lineTo(edge.to.x, edge.to.y);
    } else if (isArcEdge(edge)) {
      // Compute angles from the from/to points relative to center
      // This is acceptable at render time (no decisions based on angles)
      const startAngle = Math.atan2(
        edge.from.y - edge.center.y,
        edge.from.x - edge.center.x
      );
      const endAngle = Math.atan2(
        edge.to.y - edge.center.y,
        edge.to.x - edge.center.x
      );

      graphics.arc(
        edge.center.x,
        edge.center.y,
        edge.radius,
        startAngle,
        endAngle,
        edge.anticlockwise
      );
    }
  }

  graphics.closePath();
  graphics.fillPath();
}

/**
 * Stroke a polygon edges outline.
 *
 * Similar to drawPolygonEdges but uses strokePath instead of fillPath.
 *
 * @param graphics - The graphics context to draw to
 * @param edges - Array of polygon edges (closed loop)
 */
export function strokePolygonEdges(
  graphics: IValidRegionGraphics,
  edges: readonly PolygonEdge[]
): void {
  if (edges.length === 0) {
    return;
  }

  graphics.beginPath();

  // Start at the first edge's from point
  const firstEdge = edges[0]!;
  graphics.moveTo(firstEdge.from.x, firstEdge.from.y);

  // Draw each edge
  for (const edge of edges) {
    if (isLineEdge(edge)) {
      graphics.lineTo(edge.to.x, edge.to.y);
    } else if (isArcEdge(edge)) {
      const startAngle = Math.atan2(
        edge.from.y - edge.center.y,
        edge.from.x - edge.center.x
      );
      const endAngle = Math.atan2(
        edge.to.y - edge.center.y,
        edge.to.x - edge.center.x
      );

      graphics.arc(
        edge.center.x,
        edge.center.y,
        edge.radius,
        startAngle,
        endAngle,
        edge.anticlockwise
      );
    }
  }

  graphics.closePath();
  graphics.strokePath();
}
