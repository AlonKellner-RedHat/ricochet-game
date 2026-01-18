/**
 * VisibilityVertex - Vertex with source provenance for visibility polygons.
 *
 * Each vertex tracks where it came from (provenance), which enables:
 * - Arc detection: consecutive "range_limit" vertices form arc edges
 * - Different rendering for surface vs screen boundaries
 *
 * This follows the project rule: "Provenance over geometry"
 */

import type { Vector2 } from "@/types";

/**
 * Source of a visibility vertex.
 *
 * - "surface": Hit a surface boundary (obstacle, mirror, etc.)
 * - "screen": Hit screen/room boundary
 * - "range_limit": Hit range limit circle
 */
export type VertexSource = "surface" | "screen" | "range_limit";

/**
 * A vertex in a visibility polygon with source tracking.
 */
export interface VisibilityVertex {
  /** Position of the vertex */
  readonly position: Vector2;
  /** Where this vertex came from (provenance) */
  readonly source: VertexSource;
}

/**
 * Create a visibility vertex with source tracking.
 *
 * @param position - Position of the vertex
 * @param source - Where this vertex came from
 */
export function createVisibilityVertex(
  position: Vector2,
  source: VertexSource
): VisibilityVertex {
  return {
    position,
    source,
  };
}
