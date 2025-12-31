/**
 * Polygon Vertices Invariant
 *
 * Every vertex of a visibility polygon must be on one of:
 * 1. A surface segment (endpoint or along the segment)
 * 2. A screen boundary
 * 3. The origin point (player or reflected image)
 *
 * This ensures the visibility polygon is geometrically valid and derived
 * from actual scene geometry.
 */

import type { Invariant, InvariantContext, VisibilityStage } from "../types";
import { assertNoViolations } from "../types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/** Tolerance for point-on-line checks */
const TOLERANCE = 1e-6;

/**
 * Check if a point is on a line segment.
 */
function isPointOnSegment(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): boolean {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;

  // Check collinearity using cross product
  const cross =
    (point.x - segStart.x) * dy - (point.y - segStart.y) * dx;
  if (Math.abs(cross) > TOLERANCE * Math.sqrt(dx * dx + dy * dy)) {
    return false;
  }

  // Check if point is within segment bounds
  const t =
    Math.abs(dx) > Math.abs(dy)
      ? (point.x - segStart.x) / dx
      : (point.y - segStart.y) / dy;

  return t >= -TOLERANCE && t <= 1 + TOLERANCE;
}

/**
 * Check if a point is on any surface.
 */
function isPointOnAnySurface(
  point: Vector2,
  context: InvariantContext
): boolean {
  for (const surface of context.scene.allSurfaces) {
    if (isPointOnSegment(point, surface.segment.start, surface.segment.end)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a point is on the screen boundary.
 */
function isPointOnScreenBoundary(
  point: Vector2,
  context: InvariantContext
): boolean {
  const { minX, minY, maxX, maxY } = context.screenBounds;

  // Check each edge
  const onLeft = Math.abs(point.x - minX) < TOLERANCE;
  const onRight = Math.abs(point.x - maxX) < TOLERANCE;
  const onTop = Math.abs(point.y - minY) < TOLERANCE;
  const onBottom = Math.abs(point.y - maxY) < TOLERANCE;

  if (onLeft || onRight) {
    return point.y >= minY - TOLERANCE && point.y <= maxY + TOLERANCE;
  }
  if (onTop || onBottom) {
    return point.x >= minX - TOLERANCE && point.x <= maxX + TOLERANCE;
  }

  return false;
}

/**
 * Check if a point is at the origin.
 */
function isPointAtOrigin(point: Vector2, origin: Vector2): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return dx * dx + dy * dy < TOLERANCE * TOLERANCE;
}

/**
 * Validate all vertices in a single visibility stage.
 */
function validateStageVertices(
  stage: VisibilityStage,
  context: InvariantContext
): string[] {
  const violations: string[] = [];

  for (let i = 0; i < stage.polygon.length; i++) {
    const vertex = stage.polygon[i]!;

    const onSurface = isPointOnAnySurface(vertex, context);
    const onScreen = isPointOnScreenBoundary(vertex, context);
    const atOrigin = isPointAtOrigin(vertex, stage.origin);

    if (!onSurface && !onScreen && !atOrigin) {
      violations.push(
        `Vertex ${i} at (${vertex.x.toFixed(2)}, ${vertex.y.toFixed(2)}) ` +
          `is not on any surface, screen boundary, or origin`
      );
    }
  }

  return violations;
}

export const polygonVerticesInvariant: Invariant = {
  id: "polygon-vertices",
  name: "Polygon Vertices On Sources",
  description:
    "Every polygon vertex must be on a surface, screen boundary, or origin",

  assert: (context: InvariantContext): void => {
    const allViolations: string[] = [];

    for (const stage of context.visibilityStages) {
      const stageViolations = validateStageVertices(stage, context);
      if (stageViolations.length > 0) {
        allViolations.push(
          `Stage ${stage.stageIndex} (${stage.surfaceId ?? "player"}): ${stageViolations.join("; ")}`
        );
      }
    }

    assertNoViolations("polygon-vertices", allViolations);
  },
};

