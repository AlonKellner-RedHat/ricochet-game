/**
 * Polygon Edges Invariant
 *
 * Every edge of a visibility polygon must either:
 * 1. Lie along a surface segment
 * 2. Lie along a screen boundary
 * 3. Be collinear with the origin (a ray from origin through both endpoints)
 *
 * This ensures the polygon is constructed correctly from shadow rays and surface occlusions.
 */

import { expect } from "vitest";
import type { Invariant, InvariantContext, VisibilityStage } from "../types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/** Tolerance for collinearity checks */
const TOLERANCE = 1e-6;

/**
 * Check if two points are collinear with the origin (on the same ray from origin).
 */
function arePointsCollinearWithOrigin(
  p1: Vector2,
  p2: Vector2,
  origin: Vector2
): boolean {
  // Vector from origin to p1
  const v1x = p1.x - origin.x;
  const v1y = p1.y - origin.y;

  // Vector from origin to p2
  const v2x = p2.x - origin.x;
  const v2y = p2.y - origin.y;

  // Cross product - should be zero if collinear
  const cross = v1x * v2y - v1y * v2x;

  // Normalize by the magnitudes to get a relative measure
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (mag1 < TOLERANCE || mag2 < TOLERANCE) {
    // One point is at origin
    return true;
  }

  return Math.abs(cross) < TOLERANCE * mag1 * mag2;
}

/**
 * Check if an edge lies along a surface.
 */
function isEdgeAlongSurface(
  p1: Vector2,
  p2: Vector2,
  context: InvariantContext
): boolean {
  for (const surface of context.scene.allSurfaces) {
    const seg = surface.segment;

    // Check if both points are on the surface's line
    // Using cross product for collinearity
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < TOLERANCE) continue;

    const cross1 =
      (p1.x - seg.start.x) * dy - (p1.y - seg.start.y) * dx;
    const cross2 =
      (p2.x - seg.start.x) * dy - (p2.y - seg.start.y) * dx;

    if (
      Math.abs(cross1) < TOLERANCE * len &&
      Math.abs(cross2) < TOLERANCE * len
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an edge lies along a screen boundary.
 */
function isEdgeAlongScreenBoundary(
  p1: Vector2,
  p2: Vector2,
  context: InvariantContext
): boolean {
  const { minX, minY, maxX, maxY } = context.screenBounds;

  // Check horizontal boundaries
  if (
    Math.abs(p1.y - minY) < TOLERANCE &&
    Math.abs(p2.y - minY) < TOLERANCE
  ) {
    return true; // Top edge
  }
  if (
    Math.abs(p1.y - maxY) < TOLERANCE &&
    Math.abs(p2.y - maxY) < TOLERANCE
  ) {
    return true; // Bottom edge
  }

  // Check vertical boundaries
  if (
    Math.abs(p1.x - minX) < TOLERANCE &&
    Math.abs(p2.x - minX) < TOLERANCE
  ) {
    return true; // Left edge
  }
  if (
    Math.abs(p1.x - maxX) < TOLERANCE &&
    Math.abs(p2.x - maxX) < TOLERANCE
  ) {
    return true; // Right edge
  }

  return false;
}

/**
 * Validate all edges in a single visibility stage.
 */
function validateStageEdges(
  stage: VisibilityStage,
  context: InvariantContext
): string[] {
  const violations: string[] = [];
  const n = stage.polygon.length;

  if (n < 3) return violations; // Not enough vertices for edges

  for (let i = 0; i < n; i++) {
    const p1 = stage.polygon[i]!;
    const p2 = stage.polygon[(i + 1) % n]!;

    const isRay = arePointsCollinearWithOrigin(p1, p2, stage.origin);
    const isSurface = isEdgeAlongSurface(p1, p2, context);
    const isScreen = isEdgeAlongScreenBoundary(p1, p2, context);

    if (!isRay && !isSurface && !isScreen) {
      violations.push(
        `Edge ${i}→${(i + 1) % n} from (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) ` +
          `to (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}) ` +
          `is not along a surface, screen boundary, or ray from origin`
      );
    }
  }

  return violations;
}

export const polygonEdgesInvariant: Invariant = {
  id: "polygon-edges",
  name: "Polygon Edges Follow Rays/Surfaces",
  description:
    "Each polygon edge must lie along a surface, screen boundary, or ray from origin",

  assert: (context: InvariantContext): void => {
    const allViolations: string[] = [];

    for (const stage of context.visibilityStages) {
      const stageViolations = validateStageEdges(stage, context);
      if (stageViolations.length > 0) {
        allViolations.push(
          `Stage ${stage.stageIndex} (${stage.surfaceId ?? "player"}): ${stageViolations.join("; ")}`
        );
      }
    }

    expect(
      allViolations.length,
      `Polygon edges invariant violated:\n${allViolations.join("\n")}`
    ).toBe(0);
  },
};

