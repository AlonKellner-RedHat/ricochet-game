/**
 * Adjacent Vertices Relationship Invariant
 *
 * Validates that all adjacent polygon vertices have a direct provenance relationship:
 * 1. Shared surface - both points are on the same surface
 * 2. Continuation ray - Endpoint/Junction → HitPoint via ray through the target
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
 * Check if a ray from origin through hitPos passes through targetPos.
 * Used to detect continuation ray relationships.
 *
 * @param origin - Ray origin
 * @param hitPos - Where the ray hit a surface (HitPoint position)
 * @param targetPos - The potential target (Endpoint/Junction position)
 * @returns true if targetPos lies on the ray from origin to hitPos
 */
function isRayThroughPoint(
  origin: Vector2,
  hitPos: Vector2,
  targetPos: Vector2
): boolean {
  // Vector from origin to hit
  const toHitX = hitPos.x - origin.x;
  const toHitY = hitPos.y - origin.y;

  // Vector from origin to target
  const toTargetX = targetPos.x - origin.x;
  const toTargetY = targetPos.y - origin.y;

  // Cross product - should be zero for collinear points
  const cross = toHitX * toTargetY - toHitY * toTargetX;

  // Normalize by magnitudes for relative tolerance
  const magHit = Math.sqrt(toHitX * toHitX + toHitY * toHitY);
  const magTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

  if (magHit < 1e-10 || magTarget < 1e-10) {
    return true; // One point is at origin
  }

  const normalizedCross = Math.abs(cross) / (magHit * magTarget);

  // sin(angle) < 0.001 means angle < ~0.06 degrees
  if (normalizedCross >= 0.001) {
    return false; // Not collinear
  }

  // Also check that target is between origin and hit (or beyond hit in same direction)
  // Dot product should be positive (same direction)
  const dot = toHitX * toTargetX + toHitY * toTargetY;
  if (dot < 0) {
    return false; // Target is behind origin relative to hit direction
  }

  // Target should be closer to or at the same distance as hit (not beyond)
  // For continuation: target is BEFORE hit on the ray
  return magTarget <= magHit + 1e-6;
}

/**
 * Check if two points form a continuation pair:
 * - One is an Endpoint or JunctionPoint (the target)
 * - The other is a HitPoint (the continuation hit)
 * - The ray from origin through the HitPoint passes through the target
 *
 * Note: HitPoints do NOT have continuation rays. Only Endpoints and JunctionPoints
 * can be the source of a continuation ray.
 */
function isContinuationPair(
  s1: SourcePoint,
  s2: SourcePoint,
  origin: Vector2
): boolean {
  // Check: s1 is Endpoint/Junction, s2 is its continuation HitPoint
  if ((isEndpoint(s1) || isJunctionPoint(s1)) && isHitPoint(s2)) {
    const targetPos = s1.computeXY();
    const hitPos = s2.computeXY();
    return isRayThroughPoint(origin, hitPos, targetPos);
  }

  // Check reverse: s2 is Endpoint/Junction, s1 is its continuation HitPoint
  if ((isEndpoint(s2) || isJunctionPoint(s2)) && isHitPoint(s1)) {
    const targetPos = s2.computeXY();
    const hitPos = s1.computeXY();
    return isRayThroughPoint(origin, hitPos, targetPos);
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

  // Case 3: Continuation ray (Endpoint/Junction → HitPoint only)
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
