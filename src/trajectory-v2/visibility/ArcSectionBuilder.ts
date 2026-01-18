/**
 * ArcSectionBuilder - Converts visibility vertices to polygon edges.
 *
 * This module detects consecutive "range_limit" vertices and creates ArcEdge
 * entries for them, while other consecutive vertices become LineEdge entries.
 *
 * Algorithm:
 * For each pair of adjacent vertices (v[i], v[i+1]):
 *   - If BOTH are "range_limit" -> create ArcEdge
 *   - Otherwise -> create LineEdge
 *
 * This follows provenance-based detection (per project rules):
 * We use vertex source type, not geometric inference.
 */

import type { Vector2 } from "@/types";
import type { VisibilityVertex } from "./VisibilityVertex";
import {
  type PolygonEdge,
  createLineEdge,
  createArcEdge,
} from "./PolygonEdge";

/**
 * Arc configuration for the range limit circle.
 */
export interface ArcConfig {
  /** Center of the range limit circle */
  readonly center: Vector2;
  /** Radius of the range limit circle */
  readonly radius: number;
}

/**
 * Build polygon edges from visibility vertices.
 *
 * Detects consecutive "range_limit" vertices and creates arc edges for them.
 * All other edges are line edges.
 *
 * @param vertices - Sorted visibility vertices forming a closed polygon
 * @param arcConfig - Configuration for the range limit arc
 * @returns Array of polygon edges (closed loop)
 */
export function buildPolygonEdges(
  vertices: readonly VisibilityVertex[],
  arcConfig: ArcConfig
): PolygonEdge[] {
  // Need at least 2 vertices to form edges
  if (vertices.length < 2) {
    return [];
  }

  const edges: PolygonEdge[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const v1 = vertices[i]!;
    const v2 = vertices[(i + 1) % n]!; // Wrap around for closed polygon

    // Check if both vertices are from range_limit
    if (v1.source === "range_limit" && v2.source === "range_limit") {
      // Create arc edge
      // Anticlockwise is determined by the polygon winding order
      // For now, default to clockwise (false) - can be refined if needed
      edges.push(
        createArcEdge(
          v1.position,
          v2.position,
          arcConfig.center,
          arcConfig.radius,
          false // clockwise
        )
      );
    } else {
      // Create line edge
      edges.push(createLineEdge(v1.position, v2.position));
    }
  }

  return edges;
}
