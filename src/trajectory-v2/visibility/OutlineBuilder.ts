/**
 * OutlineBuilder - Construct the final valid region polygon
 *
 * Takes the cone propagation result and builds a polygon outline that defines
 * the valid cursor region. The outline is formed by:
 * 1. Blocking surface intersections (shadow edges)
 * 2. Screen border intersections (where cone reaches edge)
 *
 * The resulting polygon can be used to render a dark overlay with the
 * valid region "cut out" (kept bright).
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { PropagationResult, ScreenBounds } from "./ConePropagator";
import { type Cone, type ConeSection, normalizeAngle, isConeEmpty } from "./ConeSection";
import { raySegmentIntersect, distanceSquared } from "@/trajectory-v2/geometry/GeometryOps";

/**
 * A vertex in the outline polygon.
 */
export interface OutlineVertex {
  readonly position: Vector2;
  readonly type: "surface" | "screen" | "origin";
}

/**
 * The complete outline polygon for the valid region.
 */
export interface ValidRegionOutline {
  /** Vertices in order (clockwise or counter-clockwise) */
  readonly vertices: readonly OutlineVertex[];
  /** Whether the region is valid (non-empty) */
  readonly isValid: boolean;
  /** The origin point (for reference) */
  readonly origin: Vector2;
}

/**
 * Build the valid region outline from propagation results.
 *
 * @param result Cone propagation result
 * @param screenBounds Screen boundaries
 * @param allSurfaces Optional: all surfaces to check for ray hits (for accurate shadows)
 * @returns Polygon outline for the valid region
 */
/**
 * Check if a point is on the reflective side of a surface.
 */
function isOnReflectiveSide(
  point: Vector2,
  surface: Surface
): boolean {
  const normal = surface.getNormal();
  const midpoint = {
    x: (surface.segment.start.x + surface.segment.end.x) / 2,
    y: (surface.segment.start.y + surface.segment.end.y) / 2,
  };
  
  // Point is on reflective side if (point - midpoint) · normal > 0
  const dx = point.x - midpoint.x;
  const dy = point.y - midpoint.y;
  return dx * normal.x + dy * normal.y >= -0.1; // Small tolerance for points on surface
}

export function buildOutline(
  result: PropagationResult,
  screenBounds: ScreenBounds,
  allSurfaces: readonly Surface[] = []
): ValidRegionOutline {
  if (!result.success || isConeEmpty(result.finalCone)) {
    return {
      vertices: [],
      isValid: false,
      origin: result.finalOrigin,
    };
  }

  const origin = result.finalOrigin;
  const cone = result.finalCone;

  // Exclude surfaces we've passed through (the windows)
  // These are in result.passedSurfaces
  const passedSurfaces = result.passedSurfaces ?? [];
  const passedIds = new Set(passedSurfaces.map(s => s.id));
  const blockingSurfaces = allSurfaces.filter(s => !passedIds.has(s.id));

  // Build vertices by sweeping through angles
  const vertices: OutlineVertex[] = [];

  for (const section of cone) {
    const sectionVertices = buildSectionOutlineWithSurfaces(
      origin,
      section,
      blockingSurfaces,
      screenBounds
    );
    vertices.push(...sectionVertices);
  }

  // Sort all vertices globally by angle from origin for correct triangle fan rendering
  let sortedVertices = sortVerticesByAngle(origin, vertices);

  // If there are planned surfaces, filter vertices to only those on the reflective
  // side of the last surface (light only exits on reflective side)
  // BUT keep the origin vertex (it's needed for polygon closure even if on wrong side)
  if (passedSurfaces.length > 0) {
    const lastSurface = passedSurfaces[passedSurfaces.length - 1]!;
    sortedVertices = sortedVertices.filter(v => 
      v.type === "origin" || isOnReflectiveSide(v.position, lastSurface)
    );
  }

  return {
    vertices: sortedVertices,
    isValid: sortedVertices.length >= 3,
    origin,
  };
}

/**
 * Check if a position has integer coordinates (likely an exact surface endpoint).
 */
function hasIntegerCoordinates(pos: Vector2): boolean {
  return Number.isInteger(pos.x) && Number.isInteger(pos.y);
}

/**
 * Sort vertices by angle from origin (for triangle fan rendering).
 * For non-full-circle cones, includes the origin vertex for proper polygon closure.
 * Uses normalized angles (0 to 2π) to avoid wrap-around discontinuity.
 *
 * IMPORTANT: When deduplicating, prefer vertices with integer coordinates
 * (exact surface endpoints) over computed intersection points.
 */
function sortVerticesByAngle(
  origin: Vector2,
  vertices: OutlineVertex[]
): OutlineVertex[] {
  // Check if we have an origin vertex (for sector-shaped polygons)
  const hasOriginVertex = vertices.some(v => v.type === "origin");
  
  // Filter out origin vertices for sorting (will add back at correct position)
  const edgeVertices = vertices.filter(v => v.type !== "origin");

  // Sort by normalized angle from origin (0 to 2π)
  edgeVertices.sort((a, b) => {
    const angleA = normalizeAngle(Math.atan2(a.position.y - origin.y, a.position.x - origin.x));
    const angleB = normalizeAngle(Math.atan2(b.position.y - origin.y, b.position.x - origin.x));
    return angleA - angleB;
  });

  // Remove near-duplicate positions, preferring exact endpoints (integer coords)
  const unique: OutlineVertex[] = [];
  const EPSILON_SQ = 1.0; // 1 pixel threshold

  for (const v of edgeVertices) {
    if (unique.length === 0) {
      unique.push(v);
    } else {
      const lastIdx = unique.length - 1;
      const last = unique[lastIdx]!;
      const dx = v.position.x - last.position.x;
      const dy = v.position.y - last.position.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq > EPSILON_SQ) {
        // Different position - add it
        unique.push(v);
      } else {
        // Near-duplicate: prefer the one with integer coordinates (exact endpoint)
        const lastIsExact = hasIntegerCoordinates(last.position);
        const currIsExact = hasIntegerCoordinates(v.position);
        
        if (!lastIsExact && currIsExact) {
          // Replace last with current (exact) vertex
          unique[lastIdx] = v;
        }
        // Otherwise keep the existing one
      }
    }
  }

  // For sector-shaped polygons (non-full-circle cones), add the origin at the end
  // to close the polygon properly. This is needed for point-in-polygon tests.
  if (hasOriginVertex && unique.length >= 2) {
    unique.push({
      position: origin,
      type: "origin",
    });
  }

  return unique;
}

/**
 * Build outline vertices for a single cone section using vertex-based resolution.
 *
 * This uses the standard visibility polygon algorithm:
 * 1. Collect critical angles (surface endpoints + screen corners)
 * 2. Sort angles within the cone section
 * 3. Cast ray at each critical angle and find closest hit
 *
 * This provides perfect accuracy - no sampling artifacts.
 */
function buildSectionOutlineWithSurfaces(
  origin: Vector2,
  section: ConeSection,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): OutlineVertex[] {
  // 1. Collect all critical angles within this section
  const criticalAngles = collectCriticalAngles(origin, surfaces, screenBounds, section);

  // 2. Sort angles within the section
  const sortedAngles = sortAnglesInSection(criticalAngles, section);

  // 3. Cast ray at each critical angle and find closest hit
  const vertices: OutlineVertex[] = [];
  for (const angle of sortedAngles) {
    const hit = castRayAndFindHit(origin, angle, surfaces, screenBounds);
    vertices.push(hit);
  }

  // 4. Add origin if cone is not full circle
  const angleSpan = getSectionSpan(section);
  if (angleSpan < 2 * Math.PI - 0.01) {
    vertices.push({
      position: origin,
      type: "origin",
    });
  }

  return vertices;
}

/**
 * Collect angles to all critical points within the cone section.
 * Critical points are: surface segment endpoints + screen corners + screen edge points.
 */
function collectCriticalAngles(
  origin: Vector2,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds,
  section: ConeSection
): number[] {
  const angles: number[] = [];
  const EPSILON = 0.001; // Offset for boundary rays (~0.06°) - must be larger than dedup threshold

  // Add section boundary angles
  angles.push(normalizeAngle(section.startAngle));
  angles.push(normalizeAngle(section.endAngle));

  // Add intermediate angles if section is narrow (ensures at least 3 points for polygon)
  const sectionSpan = getSectionSpan(section);
  if (sectionSpan < Math.PI / 4) { // Less than 45 degrees
    // Add midpoint and quarter points
    const startAngle = normalizeAngle(section.startAngle);
    const midAngle = normalizeAngle(startAngle + sectionSpan / 2);
    const quarterAngle = normalizeAngle(startAngle + sectionSpan / 4);
    const threeQuarterAngle = normalizeAngle(startAngle + (3 * sectionSpan) / 4);
    angles.push(midAngle, quarterAngle, threeQuarterAngle);
  }

  // Add angles to all surface segment endpoints
  for (const surface of surfaces) {
    const startAngle = Math.atan2(
      surface.segment.start.y - origin.y,
      surface.segment.start.x - origin.x
    );
    const endAngle = Math.atan2(
      surface.segment.end.y - origin.y,
      surface.segment.end.x - origin.x
    );

    // For each endpoint, add the angle plus tiny offsets on either side
    // This ensures we catch visibility changes at vertices
    for (const baseAngle of [startAngle, endAngle]) {
      const normalized = normalizeAngle(baseAngle);
      if (isAngleInSection(normalized, section)) {
        angles.push(normalized);
        angles.push(normalizeAngle(baseAngle - EPSILON));
        angles.push(normalizeAngle(baseAngle + EPSILON));
      }
    }
  }

  // Add angles to screen corners
  const { minX, minY, maxX, maxY } = screenBounds;
  const corners = [
    { x: maxX, y: minY }, // top-right
    { x: maxX, y: maxY }, // bottom-right
    { x: minX, y: maxY }, // bottom-left
    { x: minX, y: minY }, // top-left
  ];

  for (const corner of corners) {
    const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
    const normalized = normalizeAngle(angle);
    if (isAngleInSection(normalized, section)) {
      angles.push(normalized);
    }
  }

  return angles;
}

/**
 * Sort angles within a cone section, relative to the section's start angle.
 * Also removes duplicates.
 */
function sortAnglesInSection(
  angles: number[],
  section: ConeSection
): number[] {
  const startAngle = normalizeAngle(section.startAngle);

  // Filter to only angles in section and sort by offset from start
  const filtered = angles.filter(a => isAngleInSection(a, section));

  // Sort by angular distance from startAngle (accounting for wrap-around)
  filtered.sort((a, b) => {
    const aOffset = normalizeAngle(a - startAngle);
    const bOffset = normalizeAngle(b - startAngle);
    return aOffset - bOffset;
  });

  // Remove duplicates (angles within small threshold)
  const unique: number[] = [];
  for (const angle of filtered) {
    if (unique.length === 0) {
      unique.push(angle);
    } else {
      const prev = unique[unique.length - 1]!;
      const diff = Math.abs(normalizeAngle(angle - prev));
      if (diff > 0.0001 && diff < 2 * Math.PI - 0.0001) {
        unique.push(angle);
      }
    }
  }

  return unique;
}

/**
 * Cast a ray at the given angle and find the closest hit (surface or screen edge).
 *
 * IMPORTANT: When a hit is at a surface endpoint, return the EXACT endpoint
 * coordinates, not the computed intersection. This ensures V.6 principle
 * (nearest surface edge in outline) is satisfied with perfect precision.
 */
function castRayAndFindHit(
  origin: Vector2,
  angle: number,
  surfaces: readonly Surface[],
  screenBounds: ScreenBounds
): OutlineVertex {
  const rayEnd: Vector2 = {
    x: origin.x + Math.cos(angle) * 10000,
    y: origin.y + Math.sin(angle) * 10000,
  };

  // Find closest surface hit
  let closestHit: { point: Vector2; distSq: number; surface: Surface } | null = null;

  for (const surface of surfaces) {
    const hit = raySegmentIntersect(
      { from: origin, to: rayEnd },
      surface.segment.start,
      surface.segment.end
    );

    if (hit.hit) {
      const distSq = distanceSquared(origin, hit.point);
      if (!closestHit || distSq < closestHit.distSq) {
        closestHit = { point: hit.point, distSq, surface };
      }
    }
  }

  if (closestHit) {
    // CRITICAL: Check if the hit point is at a surface endpoint.
    // If so, use the EXACT endpoint coordinates for precision.
    const ENDPOINT_EPSILON_SQ = 4; // 2 pixels squared
    
    const startDistSq = distanceSquared(closestHit.point, closestHit.surface.segment.start);
    const endDistSq = distanceSquared(closestHit.point, closestHit.surface.segment.end);
    
    let exactPosition: Vector2;
    if (startDistSq < ENDPOINT_EPSILON_SQ) {
      // Hit is at the start endpoint - use exact coordinates
      exactPosition = closestHit.surface.segment.start;
    } else if (endDistSq < ENDPOINT_EPSILON_SQ) {
      // Hit is at the end endpoint - use exact coordinates
      exactPosition = closestHit.surface.segment.end;
    } else {
      // Hit is in the middle of the segment - use computed intersection
      exactPosition = closestHit.point;
    }
    
    return {
      position: exactPosition,
      type: "surface",
    };
  }

  // Ray reaches screen edge
  const screenHit = findScreenEdgeHit(origin, angle, screenBounds);
  return {
    position: screenHit,
    type: "screen",
  };
}

/**
 * Check if an angle is within a cone section.
 */
function isAngleInSection(angle: number, section: ConeSection): boolean {
  const TWO_PI = 2 * Math.PI;
  const span = getSectionSpan(section);

  if (span >= TWO_PI - 0.01) {
    // Full circle
    return true;
  }

  const normalizedAngle = normalizeAngle(angle);
  const normalizedStart = normalizeAngle(section.startAngle);
  const normalizedEnd = normalizeAngle(section.endAngle);

  if (normalizedStart <= normalizedEnd) {
    return normalizedAngle >= normalizedStart - 0.0001 && normalizedAngle <= normalizedEnd + 0.0001;
  } else {
    // Wraps around
    return normalizedAngle >= normalizedStart - 0.0001 || normalizedAngle <= normalizedEnd + 0.0001;
  }
}

/**
 * Get the angular span of a cone section.
 */
function getSectionSpan(section: ConeSection): number {
  const startAngle = normalizeAngle(section.startAngle);
  const endAngle = normalizeAngle(section.endAngle);

  return endAngle >= startAngle
    ? endAngle - startAngle
    : (2 * Math.PI - startAngle) + endAngle;
}

/**
 * Cast a ray from origin at given angle to screen edge.
 */
function castRayToScreenEdge(
  origin: Vector2,
  angle: number,
  bounds: ScreenBounds
): Vector2 {
  // Create a ray long enough to reach any screen edge
  const maxDist = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY
  ) * 2;

  return {
    x: origin.x + Math.cos(angle) * maxDist,
    y: origin.y + Math.sin(angle) * maxDist,
  };
}

/**
 * Find the closest blocking surface intersection at a given angle.
 */
function findClosestBlockAtAngle(
  origin: Vector2,
  angle: number,
  rayEnd: Vector2,
  blockingSurfaces: readonly BlockingInfo[]
): { point: Vector2; info: BlockingInfo } | null {
  let closest: { point: Vector2; info: BlockingInfo; distSq: number } | null = null;

  for (const info of blockingSurfaces) {
    // Check if this surface's angular range includes this angle
    const surfaceSection = info.section;
    const inRange = isAngleInRange(angle, surfaceSection.startAngle, surfaceSection.endAngle);

    if (!inRange) continue;

    // Cast ray to surface
    const surface = info.surface;
    const hit = raySegmentIntersect(
      { from: origin, to: rayEnd },
      surface.segment.start,
      surface.segment.end
    );

    if (hit.hit) {
      const distSq = (hit.point.x - origin.x) ** 2 + (hit.point.y - origin.y) ** 2;
      if (!closest || distSq < closest.distSq) {
        closest = { point: hit.point, info, distSq };
      }
    }
  }

  return closest ? { point: closest.point, info: closest.info } : null;
}

/**
 * Check if an angle is within a range (handles wrap-around).
 */
function isAngleInRange(angle: number, start: number, end: number): boolean {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);

  if (s <= e) {
    return a >= s && a <= e;
  } else {
    return a >= s || a <= e;
  }
}

/**
 * Find where a ray at given angle hits the screen edge.
 */
function findScreenEdgeHit(
  origin: Vector2,
  angle: number,
  bounds: ScreenBounds
): Vector2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Calculate intersection with each edge
  const candidates: { point: Vector2; t: number }[] = [];

  // Left edge (x = minX)
  if (cos < 0) {
    const t = (bounds.minX - origin.x) / cos;
    const y = origin.y + sin * t;
    if (t > 0 && y >= bounds.minY && y <= bounds.maxY) {
      candidates.push({ point: { x: bounds.minX, y }, t });
    }
  }

  // Right edge (x = maxX)
  if (cos > 0) {
    const t = (bounds.maxX - origin.x) / cos;
    const y = origin.y + sin * t;
    if (t > 0 && y >= bounds.minY && y <= bounds.maxY) {
      candidates.push({ point: { x: bounds.maxX, y }, t });
    }
  }

  // Top edge (y = minY)
  if (sin < 0) {
    const t = (bounds.minY - origin.y) / sin;
    const x = origin.x + cos * t;
    if (t > 0 && x >= bounds.minX && x <= bounds.maxX) {
      candidates.push({ point: { x, y: bounds.minY }, t });
    }
  }

  // Bottom edge (y = maxY)
  if (sin > 0) {
    const t = (bounds.maxY - origin.y) / sin;
    const x = origin.x + cos * t;
    if (t > 0 && x >= bounds.minX && x <= bounds.maxX) {
      candidates.push({ point: { x, y: bounds.maxY }, t });
    }
  }

  // Return closest hit
  if (candidates.length === 0) {
    // Fallback: origin is at screen edge or invalid
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, origin.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, origin.y)),
    };
  }

  candidates.sort((a, b) => a.t - b.t);
  return candidates[0]!.point;
}

/**
 * Simplify the outline by removing collinear points.
 */
export function simplifyOutline(outline: ValidRegionOutline): ValidRegionOutline {
  if (outline.vertices.length < 3) return outline;

  const simplified: OutlineVertex[] = [];
  const vertices = outline.vertices;

  for (let i = 0; i < vertices.length; i++) {
    const prev = vertices[(i - 1 + vertices.length) % vertices.length]!;
    const curr = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;

    // Check if points are collinear
    const cross =
      (curr.position.x - prev.position.x) * (next.position.y - prev.position.y) -
      (curr.position.y - prev.position.y) * (next.position.x - prev.position.x);

    if (Math.abs(cross) > 1) {
      // Not collinear, keep this point
      simplified.push(curr);
    }
  }

  return {
    ...outline,
    vertices: simplified,
  };
}

