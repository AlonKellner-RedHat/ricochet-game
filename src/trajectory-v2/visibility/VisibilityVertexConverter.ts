/**
 * VisibilityVertexConverter - Convert SourcePoint array to VisibilityVertex array.
 *
 * This module bridges the gap between the cone projection output (SourcePoint[])
 * and the edge-based rendering pipeline (VisibilityVertex[]).
 *
 * Key responsibility: detect the source/provenance of each point:
 * - ArcHitPoint -> "range_limit" (ray hit the arc)
 * - ArcIntersectionPoint -> "range_limit" (surface crosses the arc)
 * - ArcJunctionPoint -> "range_limit" (semi-circle boundary)
 * - Endpoint with screen boundary surface -> "screen"
 * - Everything else -> "surface"
 */

import {
  type SourcePoint,
  isArcHitPoint,
  isArcIntersectionPoint,
  isArcJunctionPoint,
  isEndpoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  type VisibilityVertex,
  type VertexSource,
  createVisibilityVertex,
} from "./VisibilityVertex";

/**
 * Check if a SourcePoint represents a screen boundary.
 *
 * Screen boundary surfaces have IDs starting with "screen-".
 */
function isScreenBoundaryPoint(point: SourcePoint): boolean {
  if (isEndpoint(point)) {
    return point.surface.id.startsWith("screen-");
  }
  return false;
}

/**
 * Determine the source/provenance of a SourcePoint.
 *
 * Uses type-based detection (provenance over geometry):
 * - ArcHitPoint -> "range_limit" (ray hit the arc)
 * - ArcIntersectionPoint -> "range_limit" (surface crosses the arc)
 * - ArcJunctionPoint -> "range_limit" (semi-circle boundary)
 * - Endpoint on screen boundary -> "screen"
 * - Everything else -> "surface"
 */
function getVertexSource(point: SourcePoint): VertexSource {
  // All arc-related points map to "range_limit" for arc edge detection
  if (isArcHitPoint(point)) {
    return "range_limit";
  }
  if (isArcIntersectionPoint(point)) {
    return "range_limit";
  }
  if (isArcJunctionPoint(point)) {
    return "range_limit";
  }
  if (isScreenBoundaryPoint(point)) {
    return "screen";
  }
  return "surface";
}

/**
 * Convert an array of SourcePoints to VisibilityVertices.
 *
 * Each vertex tracks its source/provenance, which enables:
 * - Arc detection: consecutive "range_limit" vertices form arc edges
 * - Different rendering for different boundary types
 *
 * @param points - Array of SourcePoints from projectConeV2
 * @returns Array of VisibilityVertices with source tracking
 */
export function toVisibilityVertices(
  points: readonly SourcePoint[]
): VisibilityVertex[] {
  return points.map((point) => {
    const position = point.computeXY();
    const source = getVertexSource(point);
    return createVisibilityVertex(position, source);
  });
}
