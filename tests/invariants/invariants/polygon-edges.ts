/**
 * Polygon Edges Invariant - Provenance-Based
 *
 * Every edge of a visibility polygon must be valid based on source point provenance:
 * 1. Ray edges: HitPoint ↔ Endpoint/JunctionPoint
 * 2. Boundary rays: OriginPoint ↔ HitPoint
 * 3. Surface edges: Same-surface points
 * 4. Junction edges: JunctionPoint to adjacent surface
 * 5. Window edges: OriginPoint ↔ OriginPoint
 *
 * This provenance-based approach is more robust than geometric checks because:
 * - No floating-point tolerance needed
 * - Edge validity is determined by point types, not geometry
 * - Better error messages (specific surface/point info)
 */

import type { Invariant, InvariantContext, VisibilityStage } from "../types";
import { assertNoViolations } from "../types";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { validateEdgeByProvenance } from "./polygon-edges-provenance";

// Legacy tolerance for fallback geometric checks
const TOLERANCE = 1e-3;

/**
 * Legacy: Check if two points are collinear with the origin (on the same ray from origin).
 * Used as fallback when source points are not available.
 */
function arePointsCollinearWithOrigin(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  origin: { x: number; y: number }
): boolean {
  const v1x = p1.x - origin.x;
  const v1y = p1.y - origin.y;
  const v2x = p2.x - origin.x;
  const v2y = p2.y - origin.y;

  const cross = v1x * v2y - v1y * v2x;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (mag1 < TOLERANCE || mag2 < TOLERANCE) {
    return true;
  }

  return Math.abs(cross) < TOLERANCE * mag1 * mag2;
}

/**
 * Legacy: Check if an edge lies along a surface.
 * Used as fallback when source points are not available.
 */
function isEdgeAlongSurface(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  context: InvariantContext
): boolean {
  const allSurfaces = context.scene.allChains.flatMap((c) => c.getSurfaces());
  for (const surface of allSurfaces) {
    const seg = surface.segment;
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < TOLERANCE) continue;

    const cross1 = (p1.x - seg.start.x) * dy - (p1.y - seg.start.y) * dx;
    const cross2 = (p2.x - seg.start.x) * dy - (p2.y - seg.start.y) * dx;

    if (Math.abs(cross1) < TOLERANCE * len && Math.abs(cross2) < TOLERANCE * len) {
      return true;
    }
  }
  return false;
}

/**
 * Legacy: Check if an edge lies along a screen boundary.
 * Used as fallback when source points are not available.
 */
function isEdgeAlongScreenBoundary(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  context: InvariantContext
): boolean {
  const { minX, minY, maxX, maxY } = context.screenBounds;

  if (Math.abs(p1.y - minY) < TOLERANCE && Math.abs(p2.y - minY) < TOLERANCE) {
    return true;
  }
  if (Math.abs(p1.y - maxY) < TOLERANCE && Math.abs(p2.y - maxY) < TOLERANCE) {
    return true;
  }
  if (Math.abs(p1.x - minX) < TOLERANCE && Math.abs(p2.x - minX) < TOLERANCE) {
    return true;
  }
  if (Math.abs(p1.x - maxX) < TOLERANCE && Math.abs(p2.x - maxX) < TOLERANCE) {
    return true;
  }

  return false;
}

/**
 * Validate edges using provenance (preferred) or fall back to geometric checks.
 */
function validateStageEdges(
  stage: VisibilityStage,
  context: InvariantContext
): string[] {
  const violations: string[] = [];
  const n = stage.polygon.length;

  if (n < 3) return violations;

  const hasSourcePoints = stage.sourcePoints && stage.sourcePoints.length === n;

  for (let i = 0; i < n; i++) {
    const p1 = stage.polygon[i]!;
    const p2 = stage.polygon[(i + 1) % n]!;

    let isValid = false;
    let reason: string | undefined;

    if (hasSourcePoints) {
      // Use provenance-based validation (robust, no epsilon)
      const s1 = stage.sourcePoints![i]!;
      const s2 = stage.sourcePoints![(i + 1) % n]!;
      const result = validateEdgeByProvenance(s1, s2, stage.origin);
      isValid = result.valid;
      reason = result.reason;
    } else {
      // Fall back to legacy geometric checks (with epsilon tolerance)
      const isRay = arePointsCollinearWithOrigin(p1, p2, stage.origin);
      const isSurface = isEdgeAlongSurface(p1, p2, context);
      const isScreen = isEdgeAlongScreenBoundary(p1, p2, context);
      isValid = isRay || isSurface || isScreen;
      reason = "not along a surface, screen boundary, or ray from origin (legacy check)";
    }

    if (!isValid) {
      const edgeInfo = `Edge ${i}→${(i + 1) % n} from (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) to (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`;
      violations.push(`${edgeInfo}: ${reason ?? "invalid edge"}`);
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

    assertNoViolations("polygon-edges", allViolations);
  },
};
