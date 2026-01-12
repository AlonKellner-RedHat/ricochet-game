/**
 * Adjacent Vertices Relationship Invariant
 *
 * Validates that all adjacent polygon vertices have a direct provenance relationship:
 * 1. Shared surface - both points are on the same surface
 * 2. Continuation ray - Endpoint/Junction → HitPoint or blocking JunctionPoint via ray
 * 3. Origin relationships - OriginPoint ↔ any point
 *
 * This invariant detects missing intermediate vertices in the polygon.
 */

import type { Invariant, InvariantContext, VisibilityStage } from "../types";
import { assertNoViolations } from "../types";
import {
  type SourcePoint,
  isHitPoint,
  isEndpoint,
  isOriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { sharesAnySurface, getSourceSurfaceIds } from "./polygon-edges-provenance";

/**
 * Check if two points are collinear with the origin (lie on the same ray).
 * Used to detect continuation ray relationships.
 *
 * Both points must be on the same ray from origin in the same direction.
 * Order doesn't matter - either point can be closer or farther from origin.
 *
 * @param origin - Ray origin
 * @param p1 - First point on potential ray
 * @param p2 - Second point on potential ray
 * @returns true if both points lie on the same ray from origin
 */
function isRayThroughPoint(
  origin: Vector2,
  p1: Vector2,
  p2: Vector2
): boolean {
  // Vector from origin to p1
  const toP1X = p1.x - origin.x;
  const toP1Y = p1.y - origin.y;

  // Vector from origin to p2
  const toP2X = p2.x - origin.x;
  const toP2Y = p2.y - origin.y;

  // Cross product - should be zero for collinear points
  const cross = toP1X * toP2Y - toP1Y * toP2X;

  // Normalize by magnitudes for relative tolerance
  const magP1 = Math.sqrt(toP1X * toP1X + toP1Y * toP1Y);
  const magP2 = Math.sqrt(toP2X * toP2X + toP2Y * toP2Y);

  if (magP1 < 1e-10 || magP2 < 1e-10) {
    return true; // One point is at origin
  }

  const normalizedCross = Math.abs(cross) / (magP1 * magP2);

  // sin(angle) < 0.001 means angle < ~0.06 degrees
  if (normalizedCross >= 0.001) {
    return false; // Not collinear
  }

  // Check that points are in the same direction from origin (not opposite)
  // Dot product should be positive
  const dot = toP1X * toP2X + toP1Y * toP2Y;
  if (dot < 0) {
    return false; // Points are in opposite directions from origin
  }

  return true;
}

/**
 * Check if two points are on the same ray from origin (collinear continuation path).
 * This covers:
 * - Endpoint → Endpoint (intermediate points on same ray)
 * - Endpoint/Junction → HitPoint (direct continuation)
 * - Endpoint/Junction → blocking JunctionPoint (continuation to blocking junction)
 *
 * Note: HitPoints do NOT have continuation rays. Only Endpoints and JunctionPoints
 * can be the source of a continuation ray.
 */
function isContinuationPair(
  s1: SourcePoint,
  s2: SourcePoint,
  origin: Vector2
): boolean {
  // Helper to check if a point could be a continuation result
  // This includes Endpoints because multiple endpoints may lie on the same ray
  const isContinuationResult = (sp: SourcePoint): boolean =>
    isHitPoint(sp) || isJunctionPoint(sp) || isEndpoint(sp);

  // Helper to check if a point could be a continuation source
  const isContinuationSource = (sp: SourcePoint): boolean =>
    isEndpoint(sp) || isJunctionPoint(sp);

  // Check: s1 is source, s2 is its continuation result
  if (isContinuationSource(s1) && isContinuationResult(s2)) {
    const sourcePos = s1.computeXY();
    const hitPos = s2.computeXY();
    // Don't accept if they're the same point (a junction can't continue to itself)
    if (sourcePos.x === hitPos.x && sourcePos.y === hitPos.y) {
      return false;
    }
    return isRayThroughPoint(origin, hitPos, sourcePos);
  }

  // Check reverse: s2 is source, s1 is its continuation result
  if (isContinuationSource(s2) && isContinuationResult(s1)) {
    const sourcePos = s2.computeXY();
    const hitPos = s1.computeXY();
    // Don't accept if they're the same point
    if (sourcePos.x === hitPos.x && sourcePos.y === hitPos.y) {
      return false;
    }
    return isRayThroughPoint(origin, hitPos, sourcePos);
  }

  return false;
}

/**
 * Describe a SourcePoint for error messages.
 */
function describePoint(sp: SourcePoint): string {
  const xy = sp.computeXY();
  const pos = `(${xy.x.toFixed(1)}, ${xy.y.toFixed(1)})`;

  if (isHitPoint(sp)) {
    return `HitPoint[${sp.hitSurface.id}]${pos}`;
  }
  if (isEndpoint(sp)) {
    return `Endpoint[${sp.surface.id}]${pos}`;
  }
  if (isJunctionPoint(sp)) {
    const ids = getSourceSurfaceIds(sp);
    return `Junction[${ids.join("+")}]${pos}`;
  }
  if (isOriginPoint(sp)) {
    return `Origin${pos}`;
  }
  return `Unknown${pos}`;
}

/**
 * Validate that two adjacent vertices have a direct relationship.
 */
export function validateAdjacentRelationship(
  s1: SourcePoint,
  s2: SourcePoint,
  origin: Vector2
): { valid: boolean; reason?: string } {
  // Case 1: Either is OriginPoint - always valid (boundary rays, window edges)
  if (isOriginPoint(s1) || isOriginPoint(s2)) {
    return { valid: true };
  }

  // Case 2: Shared surface - includes HitPoint+HitPoint on same surface
  if (sharesAnySurface(s1, s2)) {
    return { valid: true };
  }

  // Case 3: Continuation ray (Endpoint/Junction → HitPoint or blocking JunctionPoint)
  if (isContinuationPair(s1, s2, origin)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `No direct relationship: ${describePoint(s1)} ↔ ${describePoint(s2)}`,
  };
}

/**
 * Validate all adjacent vertex pairs in a visibility stage.
 */
function validateStageAdjacency(
  stage: VisibilityStage,
  _context: InvariantContext
): string[] {
  const violations: string[] = [];
  const n = stage.polygon.length;

  if (n < 3) return violations;

  // Require source points for this invariant
  if (!stage.sourcePoints || stage.sourcePoints.length !== n) {
    // Skip stages without provenance data
    return violations;
  }

  for (let i = 0; i < n; i++) {
    const s1 = stage.sourcePoints[i]!;
    const s2 = stage.sourcePoints[(i + 1) % n]!;

    const result = validateAdjacentRelationship(s1, s2, stage.origin);

    if (!result.valid) {
      violations.push(`Vertices ${i}→${(i + 1) % n}: ${result.reason}`);
    }
  }

  return violations;
}

export const adjacentVerticesRelatedInvariant: Invariant = {
  id: "adjacent-vertices-related",
  name: "Adjacent Vertices Have Direct Relationship",
  description:
    "Each pair of adjacent polygon vertices must share a surface or be connected by a continuation ray",

  assert: (context: InvariantContext): void => {
    const allViolations: string[] = [];

    for (const stage of context.visibilityStages) {
      const stageViolations = validateStageAdjacency(stage, context);
      if (stageViolations.length > 0) {
        allViolations.push(
          `Stage ${stage.stageIndex} (${stage.surfaceId ?? "player"}): ${stageViolations.join("; ")}`
        );
      }
    }

    assertNoViolations("adjacent-vertices-related", allViolations);
  },
};
