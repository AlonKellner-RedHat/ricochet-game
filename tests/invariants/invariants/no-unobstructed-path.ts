/**
 * No Unobstructed Path Invariant
 *
 * Asserts that for every polygon vertex, there are no obstacles between
 * the player/origin and that vertex UNLESS the obstacle is the source
 * of the vertex (i.e., the vertex is on the obstacle's surface).
 *
 * This invariant detects when rays bypass obstructions.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Invariant, InvariantContext } from "../types";
import { assertNoViolations } from "../types";

/**
 * Cross product helper for 2D vectors.
 */
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Find intersection point of a ray (defined by two points) with a segment.
 * Returns the intersection point if it exists and lies on the segment.
 * The ray extends from rayStart through rayEnd (and beyond).
 */
function raySegmentIntersection(
  rayStart: { x: number; y: number },
  rayEnd: { x: number; y: number },
  segStart: { x: number; y: number },
  segEnd: { x: number; y: number }
): { x: number; y: number } | null {
  const d1x = rayEnd.x - rayStart.x;
  const d1y = rayEnd.y - rayStart.y;
  const d2x = segEnd.x - segStart.x;
  const d2y = segEnd.y - segStart.y;

  const crossD = cross(d1x, d1y, d2x, d2y);

  // Check for near-parallel using normalized cross product
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  if (len1 < 1e-10 || len2 < 1e-10) return null;

  const normalizedCross = Math.abs(crossD) / (len1 * len2);
  if (normalizedCross < 0.001) return null; // Nearly parallel

  const qp = { x: segStart.x - rayStart.x, y: segStart.y - rayStart.y };

  const t = cross(qp.x, qp.y, d2x, d2y) / crossD;
  const u = cross(qp.x, qp.y, d1x, d1y) / crossD;

  // t >= 0 means intersection is in ray direction (not behind rayStart)
  // u in [0, 1] means intersection is on the segment
  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      x: rayStart.x + t * d1x,
      y: rayStart.y + t * d1y,
    };
  }

  return null;
}

/**
 * Check if a line segment intersects another segment (not at endpoints).
 * Returns true if segments strictly intersect in their interiors.
 * Uses normalized cross product for robust collinearity detection.
 */
function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = q2.x - q1.x;
  const d2y = q2.y - q1.y;

  const crossD = cross(d1x, d1y, d2x, d2y);

  // Use normalized cross product for robust collinearity detection
  // This avoids false positives when rays are nearly collinear with surfaces
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  if (len1 < 1e-10 || len2 < 1e-10) return false;

  const normalizedCross = Math.abs(crossD) / (len1 * len2);
  // sin(angle) < 0.001 means angle < ~0.06 degrees - treat as collinear
  if (normalizedCross < 0.001) return false;

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
function isPointOnSurface(point: { x: number; y: number }, surface: Surface): boolean {
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
function isPointAtSurfaceEndpoint(point: { x: number; y: number }, surface: Surface): boolean {
  const { start, end } = surface.segment;
  const eps = 2; // 2 pixel tolerance

  const atStart = Math.abs(point.x - start.x) < eps && Math.abs(point.y - start.y) < eps;
  const atEnd = Math.abs(point.x - end.x) < eps && Math.abs(point.y - end.y) < eps;

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
      if (!stage) continue;

      const origin = stage.origin;
      const polygon = stage.polygon;

      if (polygon.length === 0) continue;

      // Check each polygon vertex
      for (let i = 0; i < polygon.length; i++) {
        const vertexXY = polygon[i];
        if (!vertexXY) continue;

        // Determine the check start point:
        // - For windowed cones (reflection stages): start from where ray crosses startLine
        // - For non-windowed (player stage): start from origin
        let checkStart = origin;

        if (stage.isWindowed && stage.startLine) {
          // Find where the ray from origin to vertex crosses the startLine (window)
          const intersection = raySegmentIntersection(
            origin,
            vertexXY,
            stage.startLine.start,
            stage.startLine.end
          );
          if (intersection) {
            checkStart = intersection;
          } else {
            // If ray doesn't cross startLine, it might be a window endpoint vertex
            // Skip this vertex as it's part of the window itself
            continue;
          }
        }

        // Skip vertices that are too close to checkStart
        const distToStart = Math.hypot(vertexXY.x - checkStart.x, vertexXY.y - checkStart.y);
        if (distToStart < 1) continue;

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

          // Check if the surface intersects the ray from checkStart to vertex
          // For windowed cones, this only checks obstacles AFTER the window
          const intersects = segmentsIntersect(
            checkStart,
            vertexXY,
            surface.segment.start,
            surface.segment.end
          );

          if (intersects) {
            const stageName = stage.surfaceId ?? "player";
            const startDesc = stage.isWindowed ? "window" : "origin";
            violations.push(
              `Stage ${stageIndex} (${stageName}): Vertex ${i} at (${vertexXY.x.toFixed(2)}, ${vertexXY.y.toFixed(2)}) ` +
                `is obstructed by surface '${surface.id}' from ${startDesc} (${checkStart.x.toFixed(2)}, ${checkStart.y.toFixed(2)})`
            );
          }
        }
      }
    }

    assertNoViolations(this.id, violations);
  },
};
