/**
 * No Unobstructed Path Invariant
 *
 * Asserts that for every polygon vertex, there are no obstacles between
 * the player/origin and that vertex UNLESS the obstacle is the source
 * of the vertex (i.e., the vertex is on the obstacle's surface).
 *
 * This invariant detects when rays bypass obstructions.
 */

import type { Invariant, InvariantContext } from "../types";
import { assertNoViolations } from "../types";
import type { Surface } from "@/surfaces/Surface";

/**
 * Check if a line segment intersects another segment (not at endpoints).
 * Returns true if segments strictly intersect in their interiors.
 */
function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  // Cross product helper
  const cross = (ax: number, ay: number, bx: number, by: number) =>
    ax * by - ay * bx;

  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = q2.x - q1.x;
  const d2y = q2.y - q1.y;

  const crossD = cross(d1x, d1y, d2x, d2y);

  // Parallel segments
  if (Math.abs(crossD) < 1e-10) return false;

  const qp = { x: q1.x - p1.x, y: q1.y - p1.y };

  const t = cross(qp.x, qp.y, d2x, d2y) / crossD;
  const u = cross(qp.x, qp.y, d1x, d1y) / crossD;

  // Strict interior intersection (not at endpoints)
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/**
 * Check if a point is on a surface segment (within tolerance).
 */
function isPointOnSurface(
  point: { x: number; y: number },
  surface: Surface
): boolean {
  const { start, end } = surface.segment;

  // Vector from start to end
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 < 1e-10) {
    // Degenerate segment
    const dist2 = (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
    return dist2 < 4; // Within 2 pixels
  }

  // Project point onto line
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2;

  if (t < -0.01 || t > 1.01) return false;

  // Distance to line
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  const dist2 = (point.x - projX) ** 2 + (point.y - projY) ** 2;

  return dist2 < 4; // Within 2 pixels
}

/**
 * Check if a point is at an endpoint of the surface.
 */
function isPointAtSurfaceEndpoint(
  point: { x: number; y: number },
  surface: Surface
): boolean {
  const { start, end } = surface.segment;
  const eps = 2; // 2 pixel tolerance

  const atStart =
    Math.abs(point.x - start.x) < eps && Math.abs(point.y - start.y) < eps;
  const atEnd =
    Math.abs(point.x - end.x) < eps && Math.abs(point.y - end.y) < eps;

  return atStart || atEnd;
}

export const noUnobstructedPathInvariant: Invariant = {
  id: "no-unobstructed-path",
  name: "No unobstructed path to polygon vertices",
  description:
    "For each polygon vertex, verifies that no obstacles block the path from origin to vertex (unless the vertex is on the obstacle).",

  assert(context: InvariantContext): void {
    const violations: string[] = [];

    // Get all surfaces from all chains (for obstruction checking)
    const allSurfaces: Surface[] = [];
    for (const chain of context.scene.allChains) {
      allSurfaces.push(...chain.getSurfaces());
    }

    for (let stageIndex = 0; stageIndex < context.visibilityStages.length; stageIndex++) {
      const stage = context.visibilityStages[stageIndex];
      const origin = stage.origin;
      const polygon = stage.polygon;

      if (polygon.length === 0) continue;

      // Check each polygon vertex
      for (let i = 0; i < polygon.length; i++) {
        const vertexXY = polygon[i];
        if (!vertexXY) continue;

        // Skip vertices that are too close to origin (likely origin points)
        const distToOrigin = Math.hypot(vertexXY.x - origin.x, vertexXY.y - origin.y);
        if (distToOrigin < 1) continue;

        // Check all surfaces for obstruction
        for (const surface of allSurfaces) {
          // Skip screen boundaries
          if (surface.id.startsWith("screen-")) continue;

          // Skip the window surface for reflection stages
          // In reflection stages, rays MUST pass through the window
          if (stage.surfaceId && surface.id === stage.surfaceId) continue;

          // Skip if the vertex is on this surface (source surface)
          if (isPointOnSurface(vertexXY, surface)) continue;

          // Skip if the vertex is at an endpoint of this surface
          if (isPointAtSurfaceEndpoint(vertexXY, surface)) continue;

          // Check if the surface intersects the ray from origin to vertex
          const intersects = segmentsIntersect(
            origin,
            vertexXY,
            surface.segment.start,
            surface.segment.end
          );

          if (intersects) {
            const stageName = stage.surfaceId ?? "player";
            violations.push(
              `Stage ${stageIndex} (${stageName}): Vertex ${i} at (${vertexXY.x.toFixed(2)}, ${vertexXY.y.toFixed(2)}) ` +
                `is obstructed by surface '${surface.id}' from origin (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`
            );
          }
        }
      }
    }

    assertNoViolations(this.id, violations);
  },
};
