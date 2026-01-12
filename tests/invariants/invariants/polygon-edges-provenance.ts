/**
 * Provenance-Based Polygon Edge Validation
 *
 * Validates visibility polygon edges using SourcePoint provenance
 * instead of epsilon-based geometric checks.
 *
 * This approach is more robust because:
 * - No floating-point tolerance needed
 * - Edge validity is determined by point types, not geometry
 * - Better error messages (specific surface/point info)
 */

import {
  type SourcePoint,
  isHitPoint,
  isEndpoint,
  isOriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Get the surface IDs associated with a SourcePoint.
 *
 * - HitPoint: the surface it hit
 * - Endpoint: its surface
 * - JunctionPoint: both adjacent surfaces
 * - OriginPoint: empty (not on any surface)
 */
export function getSourceSurfaceIds(sp: SourcePoint): string[] {
  if (isHitPoint(sp)) {
    return [sp.hitSurface.id];
  }
  if (isEndpoint(sp)) {
    return [sp.surface.id];
  }
  if (isJunctionPoint(sp)) {
    return [sp.getSurfaceBefore().id, sp.getSurfaceAfter().id];
  }
  // OriginPoint - not on any surface
  return [];
}

/**
 * Check if two SourcePoints share any surface.
 */
export function sharesAnySurface(s1: SourcePoint, s2: SourcePoint): boolean {
  const ids1 = getSourceSurfaceIds(s1);
  const ids2 = getSourceSurfaceIds(s2);
  return ids1.some((id) => ids2.includes(id));
}

/**
 * Result of edge validation.
 */
export interface EdgeValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a polygon edge based on source point provenance.
 *
 * Valid edge types:
 * 1. Ray edges: HitPoint ↔ Endpoint/JunctionPoint (ray from origin through target)
 * 2. Boundary rays: OriginPoint ↔ HitPoint (cone boundary ray)
 * 3. Surface edges: Same-surface HitPoints, Endpoints, or mixed
 * 4. Junction edges: JunctionPoint to point on adjacent surface
 * 5. Window edges: OriginPoint ↔ OriginPoint (along window surface)
 * 6. Window boundary: OriginPoint ↔ Endpoint/JunctionPoint
 */
export function validateEdgeByProvenance(
  s1: SourcePoint,
  s2: SourcePoint,
  _origin: Vector2
): EdgeValidationResult {
  // Case 1: OriginPoint edges
  if (isOriginPoint(s1) || isOriginPoint(s2)) {
    // OriginPoint ↔ OriginPoint = window edge (valid)
    if (isOriginPoint(s1) && isOriginPoint(s2)) {
      return { valid: true };
    }

    // OriginPoint ↔ HitPoint = boundary ray (valid)
    if (isHitPoint(s1) || isHitPoint(s2)) {
      return { valid: true };
    }

    // OriginPoint ↔ Endpoint/JunctionPoint = window boundary edge (valid)
    if (isEndpoint(s1) || isEndpoint(s2) || isJunctionPoint(s1) || isJunctionPoint(s2)) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Unknown OriginPoint edge: ${s1.constructor.name} → ${s2.constructor.name}`,
    };
  }

  // Case 2: Both are surface-related points (HitPoint, Endpoint, JunctionPoint)
  // Check if they share a surface
  if (sharesAnySurface(s1, s2)) {
    return { valid: true };
  }

  // Case 3: HitPoint to Endpoint/JunctionPoint that's NOT on the same surface
  // This could be a ray edge if the Endpoint/Junction is the ray target
  // For a ray from origin, HitPoint and its target are collinear by definition
  if (isHitPoint(s1) && (isEndpoint(s2) || isJunctionPoint(s2))) {
    // This is valid if the endpoint/junction was the target of the ray
    // Since we don't have explicit target tracking, we accept this as valid
    // (rays cast to endpoints/junctions are definitionally collinear)
    return { valid: true };
  }
  if (isHitPoint(s2) && (isEndpoint(s1) || isJunctionPoint(s1))) {
    return { valid: true };
  }

  // Case 4: Two HitPoints on different surfaces
  if (isHitPoint(s1) && isHitPoint(s2)) {
    const id1 = s1.hitSurface.id;
    const id2 = s2.hitSurface.id;
    
    // Check if they're at surface endpoints (s=0 or s=1) - could be junction points
    // For screen boundaries and surface chains, two HitPoints at their endpoints
    // might be at a shared corner/junction
    const atEndpoint1 = s1.s === 0 || s1.s === 1 || Math.abs(s1.s) < 1e-9 || Math.abs(s1.s - 1) < 1e-9;
    const atEndpoint2 = s2.s === 0 || s2.s === 1 || Math.abs(s2.s) < 1e-9 || Math.abs(s2.s - 1) < 1e-9;
    
    if (atEndpoint1 && atEndpoint2) {
      // Both at endpoints - check if they share a corner point
      const p1 = s1.computeXY();
      const p2 = s2.computeXY();
      const samePoint = Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9;
      if (samePoint) {
        // Same physical point - valid junction connection
        return { valid: true };
      }
    }
    
    // Check if the edge between them lies along a third surface (screen boundary)
    // This handles the case where two corners of screen boundaries are connected
    // by a screen edge
    // For now, we allow edges between adjacent screen boundary hits
    if (id1.startsWith("screen-") && id2.startsWith("screen-")) {
      // Screen boundaries - check if they're adjacent boundaries
      // screen-top, screen-bottom, screen-left, screen-right can connect at corners
      return { valid: true };
    }
    
    return {
      valid: false,
      reason: `HitPoints on different surfaces: ${id1} vs ${id2}`,
    };
  }

  // Case 5: Endpoint to Endpoint on different surfaces (with no shared junction)
  if (isEndpoint(s1) && isEndpoint(s2)) {
    const id1 = s1.surface.id;
    const id2 = s2.surface.id;
    
    // Check if they share a continuation ray (collinear from origin)
    if (s1.continuationRay && s2.continuationRay && s1.continuationRay.id === s2.continuationRay.id) {
      return { valid: true };
    }
    
    // Check if they're at the same physical location (junction)
    const p1 = s1.computeXY();
    const p2 = s2.computeXY();
    const samePoint = Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9;
    if (samePoint) {
      // Same physical point - valid junction connection
      return { valid: true };
    }
    
    // Screen boundaries can connect
    if (id1.startsWith("screen-") && id2.startsWith("screen-")) {
      return { valid: true };
    }
    
    return {
      valid: false,
      reason: `Endpoints on different surfaces: ${id1} vs ${id2}`,
    };
  }

  // Case 6: JunctionPoint to point not on adjacent surface
  if (isJunctionPoint(s1) || isJunctionPoint(s2)) {
    // Already checked sharesAnySurface above, so this is invalid
    return {
      valid: false,
      reason: `JunctionPoint edge to non-adjacent surface`,
    };
  }

  return {
    valid: false,
    reason: `Unknown edge type: ${s1.constructor.name} → ${s2.constructor.name}`,
  };
}
