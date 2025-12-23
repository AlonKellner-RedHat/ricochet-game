/**
 * Section-Based Visibility Propagation
 *
 * This module implements a clean, section-based algorithm for computing
 * visibility through planned surfaces. Angular sections (pairs of boundary rays)
 * propagate through each planned surface via reflection.
 *
 * Key Concepts:
 * - Ray: Defined by two points (source, target) - ray extends infinitely through target
 * - AngularSection: The region between two rays from the same source
 * - Propagation: Sections are reflected through each planned surface in sequence
 */

import type { Vector2 } from "../geometry/types";
import type { Surface } from "@/surfaces/Surface";

// =============================================================================
// Core Types
// =============================================================================

/**
 * A ray defined by two points.
 * The ray starts at `source` and passes through `target`, extending infinitely.
 * This representation preserves exactness (no angle calculations needed).
 */
export interface Ray {
  source: Vector2;  // Where the ray originates
  target: Vector2;  // A point the ray passes through (NOT the endpoint)
}

/**
 * An angular section bounded by two rays from the same source.
 * Represents the "wedge" of visibility between the left and right boundaries.
 */
export interface AngularSection {
  source: Vector2;  // Origin of both boundary rays (player or player image)
  left: Vector2;    // Target point for left boundary ray
  right: Vector2;   // Target point for right boundary ray
}

/**
 * Result of visibility propagation through a surface chain.
 */
export interface PropagatedVisibility {
  sections: AngularSection[];  // Visible angular sections after propagation
  origin: Vector2;             // Current effective origin (final player image)
}

/**
 * Screen bounds for clipping visibility.
 */
export interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// =============================================================================
// Core Operations
// =============================================================================

/**
 * Reflect a point through a line defined by two points.
 * Uses exact arithmetic (no normalization).
 */
export function reflectPointThroughLine(
  point: Vector2,
  lineStart: Vector2,
  lineEnd: Vector2
): Vector2 {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSquared = dx * dx + dy * dy;

  if (lenSquared < 1e-10) {
    return { ...point }; // Degenerate line, return original point
  }

  // Project point onto line
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSquared;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  // Reflect: point' = 2 * projection - point
  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
  };
}

/**
 * Reflect a ray through a surface line.
 * Both source and target are reflected.
 */
export function reflectRay(ray: Ray, surface: Surface): Ray {
  const { start, end } = surface.segment;
  return {
    source: reflectPointThroughLine(ray.source, start, end),
    target: reflectPointThroughLine(ray.target, start, end),
  };
}

/**
 * Reflect an angular section through a surface line.
 * The source and both boundary targets are reflected.
 */
export function reflectSection(section: AngularSection, surface: Surface): AngularSection {
  const { start, end } = surface.segment;
  return {
    source: reflectPointThroughLine(section.source, start, end),
    left: reflectPointThroughLine(section.left, start, end),
    right: reflectPointThroughLine(section.right, start, end),
  };
}

/**
 * Check if a point is to the left of a ray (using cross product).
 * Returns positive if left, negative if right, zero if on the ray.
 */
export function crossProduct(
  raySource: Vector2,
  rayTarget: Vector2,
  point: Vector2
): number {
  const dx1 = rayTarget.x - raySource.x;
  const dy1 = rayTarget.y - raySource.y;
  const dx2 = point.x - raySource.x;
  const dy2 = point.y - raySource.y;
  return dx1 * dy2 - dy1 * dx2;
}

/**
 * Check if a point is within an angular section.
 * A point is within if it's to the right of the left ray AND to the left of the right ray.
 */
export function isPointInSection(point: Vector2, section: AngularSection): boolean {
  const leftCross = crossProduct(section.source, section.left, point);
  const rightCross = crossProduct(section.source, section.right, point);
  
  // Point should be to the right of left ray (negative cross) 
  // and to the left of right ray (positive cross)
  // OR the section spans more than 180 degrees (need different logic)
  
  // For now, assume sections are less than 180 degrees (convex)
  return leftCross <= 0 && rightCross >= 0;
}

/**
 * Find the intersection point of a ray with a line segment.
 * Returns null if no intersection or intersection is behind the ray source.
 */
export function raySegmentIntersection(
  ray: Ray,
  segmentStart: Vector2,
  segmentEnd: Vector2
): Vector2 | null {
  const rayDx = ray.target.x - ray.source.x;
  const rayDy = ray.target.y - ray.source.y;
  const segDx = segmentEnd.x - segmentStart.x;
  const segDy = segmentEnd.y - segmentStart.y;

  const denom = rayDx * segDy - rayDy * segDx;
  if (Math.abs(denom) < 1e-10) {
    return null; // Parallel
  }

  const t = ((segmentStart.x - ray.source.x) * segDy - (segmentStart.y - ray.source.y) * segDx) / denom;
  const u = ((segmentStart.x - ray.source.x) * rayDy - (segmentStart.y - ray.source.y) * rayDx) / denom;

  // t >= 0 means intersection is in front of ray source
  // 0 <= u <= 1 means intersection is within segment bounds
  if (t >= -1e-10 && u >= -1e-10 && u <= 1 + 1e-10) {
    return {
      x: ray.source.x + t * rayDx,
      y: ray.source.y + t * rayDy,
    };
  }

  return null;
}

/**
 * Calculate which sections of a target surface are visible from an origin point.
 * Returns angular sections representing visible portions of the surface.
 *
 * @param origin The point from which visibility is calculated
 * @param targetSurface The surface we're checking visibility to
 * @param obstacles Other surfaces that may block visibility
 */
export function calculateVisibleSectionsOnSurface(
  origin: Vector2,
  targetSurface: Surface,
  obstacles: readonly Surface[]
): AngularSection[] {
  const surfaceStart = targetSurface.segment.start;
  const surfaceEnd = targetSurface.segment.end;

  // Collect all "critical points" on the target surface
  // These are points where visibility might change (surface endpoints, shadow edges)
  const criticalPoints: Vector2[] = [surfaceStart, surfaceEnd];

  // Add shadow edges cast by obstacle endpoints onto the target surface
  for (const obstacle of obstacles) {
    if (obstacle.id === targetSurface.id) continue;

    for (const endpoint of [obstacle.segment.start, obstacle.segment.end]) {
      // Cast ray from origin through obstacle endpoint
      const ray: Ray = { source: origin, target: endpoint };
      const intersection = raySegmentIntersection(ray, surfaceStart, surfaceEnd);
      
      if (intersection) {
        criticalPoints.push(intersection);
      }
    }
  }

  // Sort critical points along the surface
  const surfaceDx = surfaceEnd.x - surfaceStart.x;
  const surfaceDy = surfaceEnd.y - surfaceStart.y;
  const surfaceLen = Math.sqrt(surfaceDx * surfaceDx + surfaceDy * surfaceDy);

  if (surfaceLen < 1e-10) {
    return []; // Degenerate surface
  }

  // Project points onto surface and sort by parameter t
  const sortedPoints = criticalPoints
    .map(p => {
      const t = ((p.x - surfaceStart.x) * surfaceDx + (p.y - surfaceStart.y) * surfaceDy) / (surfaceLen * surfaceLen);
      return { point: p, t: Math.max(0, Math.min(1, t)) };
    })
    .sort((a, b) => a.t - b.t);

  // Remove duplicates
  const uniquePoints: Vector2[] = [];
  for (const { point } of sortedPoints) {
    if (uniquePoints.length === 0 || 
        Math.abs(point.x - uniquePoints[uniquePoints.length - 1]!.x) > 0.01 ||
        Math.abs(point.y - uniquePoints[uniquePoints.length - 1]!.y) > 0.01) {
      uniquePoints.push(point);
    }
  }

  // For each adjacent pair of points, check if the midpoint is visible
  const visibleSections: AngularSection[] = [];

  for (let i = 0; i < uniquePoints.length - 1; i++) {
    const left = uniquePoints[i]!;
    const right = uniquePoints[i + 1]!;

    // Check visibility of midpoint
    const mid = {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
    };

    if (isPointVisibleFrom(origin, mid, obstacles, targetSurface)) {
      visibleSections.push({
        source: origin,
        left,
        right,
      });
    }
  }

  // Merge adjacent sections
  return mergeSections(visibleSections);
}

/**
 * Check if a point is visible from an origin (not blocked by obstacles).
 */
function isPointVisibleFrom(
  origin: Vector2,
  point: Vector2,
  obstacles: readonly Surface[],
  ignoreSurface?: Surface
): boolean {
  const ray: Ray = { source: origin, target: point };
  const distToPoint = Math.sqrt(
    (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2
  );

  for (const obstacle of obstacles) {
    if (ignoreSurface && obstacle.id === ignoreSurface.id) continue;

    const intersection = raySegmentIntersection(
      ray,
      obstacle.segment.start,
      obstacle.segment.end
    );

    if (intersection) {
      const distToIntersection = Math.sqrt(
        (intersection.x - origin.x) ** 2 + (intersection.y - origin.y) ** 2
      );

      // Blocked if intersection is before the target point
      if (distToIntersection < distToPoint - 0.01) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Merge adjacent angular sections that share a boundary.
 */
function mergeSections(sections: AngularSection[]): AngularSection[] {
  if (sections.length <= 1) return sections;

  const merged: AngularSection[] = [];

  for (const section of sections) {
    if (merged.length === 0) {
      merged.push(section);
      continue;
    }

    const last = merged[merged.length - 1]!;
    
    // Check if sections share a boundary (right of last === left of current)
    const dx = Math.abs(last.right.x - section.left.x);
    const dy = Math.abs(last.right.y - section.left.y);
    
    if (dx < 0.01 && dy < 0.01) {
      // Merge by extending the last section
      last.right = section.right;
    } else {
      merged.push(section);
    }
  }

  return merged;
}

/**
 * Intersect two lists of angular sections.
 * Returns sections that are in BOTH lists (the overlap).
 */
export function intersectSections(
  sectionsA: AngularSection[],
  sectionsB: AngularSection[]
): AngularSection[] {
  // For now, implement a simple approach:
  // For each section in A, find overlapping sections in B
  
  const result: AngularSection[] = [];

  for (const a of sectionsA) {
    for (const b of sectionsB) {
      const intersection = intersectTwoSections(a, b);
      if (intersection) {
        result.push(intersection);
      }
    }
  }

  return mergeSections(result);
}

/**
 * Intersect two individual angular sections.
 * Returns the overlapping section or null if no overlap.
 */
function intersectTwoSections(
  a: AngularSection,
  b: AngularSection
): AngularSection | null {
  // Sections must have the same source for simple intersection
  // If sources differ, we need to transform one to the other's perspective
  
  // For now, assume same source (will be handled in propagation)
  // TODO: Handle different sources via projection
  
  // Convert to angles for intersection (temporary - could be done with cross products)
  const angleALeft = Math.atan2(a.left.y - a.source.y, a.left.x - a.source.x);
  const angleARight = Math.atan2(a.right.y - a.source.y, a.right.x - a.source.x);
  const angleBLeft = Math.atan2(b.left.y - b.source.y, b.left.x - b.source.x);
  const angleBRight = Math.atan2(b.right.y - b.source.y, b.right.x - b.source.x);

  // Find overlap
  const maxLeft = Math.max(angleALeft, angleBLeft);
  const minRight = Math.min(angleARight, angleBRight);

  if (maxLeft >= minRight) {
    return null; // No overlap
  }

  // Convert back to points (at unit distance for simplicity)
  const dist = 100; // Arbitrary distance for target points
  return {
    source: a.source,
    left: {
      x: a.source.x + dist * Math.cos(maxLeft),
      y: a.source.y + dist * Math.sin(maxLeft),
    },
    right: {
      x: a.source.x + dist * Math.cos(minRight),
      y: a.source.y + dist * Math.sin(minRight),
    },
  };
}

// =============================================================================
// Main Propagation Function
// =============================================================================

/**
 * Propagate visibility through a chain of planned surfaces.
 *
 * Simplified algorithm:
 * 1. Calculate visible sections on first surface from player
 * 2. Reflect player through surface to get image
 * 3. The visible sections define the "window" through which light passes
 * 4. For multi-surface: repeat for each surface in sequence
 *
 * @param player The player position
 * @param plannedSurfaces Ordered list of planned surfaces
 * @param allSurfaces All surfaces in the scene (for obstacle checking)
 * @returns The propagated visibility after passing through all surfaces
 */
export function propagateVisibility(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): PropagatedVisibility {
  if (plannedSurfaces.length === 0) {
    // No planned surfaces - return full visibility from player
    return {
      sections: [{
        source: player,
        left: { x: player.x - 1000, y: player.y - 1 },
        right: { x: player.x - 1000, y: player.y + 1 },
      }],
      origin: player,
    };
  }

  // For now, focus on single surface propagation
  // Multi-surface is more complex and will be added later
  const surface = plannedSurfaces[0]!;
  
  // Calculate which sections of the surface are visible from player
  const obstaclesForLOS = allSurfaces.filter(s => s.id !== surface.id);
  const visibleOnSurface = calculateVisibleSectionsOnSurface(
    player,
    surface,
    obstaclesForLOS
  );

  if (visibleOnSurface.length === 0) {
    // No visibility to the surface
    return { sections: [], origin: player };
  }

  // Reflect player through surface to get image
  const playerImage = reflectPointThroughLine(
    player,
    surface.segment.start,
    surface.segment.end
  );

  // The visible sections, when reflected, define the angular bounds for rays from the image
  const reflectedSections = visibleOnSurface.map(s => reflectSection(s, surface));

  return {
    sections: reflectedSections,
    origin: playerImage,
  };
}

/**
 * Build a visibility polygon from propagated sections.
 *
 * The polygon represents the region visible through the planned surface.
 * 
 * Algorithm:
 * 1. Start with the actual planned surface endpoints (the "window" bounds)
 * 2. Cast rays from the player image through the window
 * 3. Collect hit points on obstacles/screen edges
 * 4. Order vertices by angle from player image
 *
 * @param propagation Result of propagateVisibility  
 * @param allSurfaces All surfaces for ray casting
 * @param bounds Screen bounds
 * @param lastPlannedSurface The last planned surface (for polygon boundary)
 */
export function buildPolygonFromSections(
  propagation: PropagatedVisibility,
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds,
  lastPlannedSurface: Surface
): Vector2[] {
  if (propagation.sections.length === 0) {
    return [];
  }

  const { origin } = propagation;  // This is the player image
  const vertices: Array<{ point: Vector2; angle: number }> = [];

  // The planned surface endpoints define the "window" bounds
  const surfaceStart = lastPlannedSurface.segment.start;
  const surfaceEnd = lastPlannedSurface.segment.end;

  const angleToStart = Math.atan2(surfaceStart.y - origin.y, surfaceStart.x - origin.x);
  const angleToEnd = Math.atan2(surfaceEnd.y - origin.y, surfaceEnd.x - origin.x);

  // Determine angular range (the window)
  let minAngle = Math.min(angleToStart, angleToEnd);
  let maxAngle = Math.max(angleToStart, angleToEnd);

  // Handle wrap-around if range is more than 180 degrees
  if (maxAngle - minAngle > Math.PI) {
    const temp = minAngle;
    minAngle = maxAngle;
    maxAngle = temp + 2 * Math.PI;
  }

  // Add surface endpoints
  vertices.push({ point: surfaceStart, angle: angleToStart });
  vertices.push({ point: surfaceEnd, angle: angleToEnd });

  // Surfaces to check for hits (excluding the planned surface itself)
  const surfacesForHits = allSurfaces.filter(s => s.id !== lastPlannedSurface.id);

  // Collect critical angles within the window
  const criticalAngles: number[] = [];

  // Add surface endpoints within the window
  for (const surface of surfacesForHits) {
    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x);
      if (isAngleInRange(angle, minAngle, maxAngle)) {
        criticalAngles.push(angle);
        criticalAngles.push(angle - 0.0001, angle + 0.0001);
      }
    }
  }

  // Add screen corners within the window
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];

  for (const corner of corners) {
    const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
    if (isAngleInRange(angle, minAngle, maxAngle)) {
      criticalAngles.push(angle);
    }
  }

  // Add small offsets around window edges
  criticalAngles.push(minAngle + 0.0001, maxAngle - 0.0001);

  // Cast rays at each critical angle
  for (const angle of criticalAngles) {
    if (!isAngleInRange(angle, minAngle, maxAngle)) continue;

    const target = {
      x: origin.x + Math.cos(angle) * 10000,
      y: origin.y + Math.sin(angle) * 10000,
    };

    const hit = castRayToFirstHit({ source: origin, target }, surfacesForHits, bounds);
    if (hit) {
      vertices.push({ point: hit, angle });
    }
  }

  // Normalize angles for sorting
  const normalizedVertices = vertices.map(v => {
    let normAngle = v.angle;
    if (maxAngle > Math.PI && normAngle < 0) {
      normAngle += 2 * Math.PI;
    }
    return { point: v.point, angle: normAngle };
  });

  // Sort by normalized angle
  normalizedVertices.sort((a, b) => a.angle - b.angle);

  // Remove duplicates by position
  const uniqueVertices: Vector2[] = [];
  for (const v of normalizedVertices) {
    const isDup = uniqueVertices.some(existing =>
      Math.abs(existing.x - v.point.x) < 1 && Math.abs(existing.y - v.point.y) < 1
    );
    if (!isDup) {
      uniqueVertices.push(v.point);
    }
  }

  return uniqueVertices;
}

/**
 * Check if angle is within range (handles wrap-around).
 */
function isAngleInRange(angle: number, minAngle: number, maxAngle: number): boolean {
  let normalized = angle;
  if (maxAngle > Math.PI && angle < 0) {
    normalized += 2 * Math.PI;
  }
  return normalized >= minAngle - 0.001 && normalized <= maxAngle + 0.001;
}

/**
 * Check if an angle is between two boundary angles.
 */
function isAngleBetween(angle: number, left: number, right: number): boolean {
  // Handle wrap-around
  let normalizedAngle = angle;
  let normalizedLeft = left;
  let normalizedRight = right;

  // Normalize to [0, 2π]
  while (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
  while (normalizedLeft < 0) normalizedLeft += 2 * Math.PI;
  while (normalizedRight < 0) normalizedRight += 2 * Math.PI;

  if (normalizedLeft <= normalizedRight) {
    return normalizedAngle >= normalizedLeft && normalizedAngle <= normalizedRight;
  } else {
    // Wraps around
    return normalizedAngle >= normalizedLeft || normalizedAngle <= normalizedRight;
  }
}

/**
 * Cast a ray and find the first hit on surfaces or screen bounds.
 */
function castRayToFirstHit(
  ray: Ray,
  surfaces: readonly Surface[],
  bounds: ScreenBounds
): Vector2 | null {
  let closestHit: Vector2 | null = null;
  let closestDist = Infinity;

  // Check surfaces
  for (const surface of surfaces) {
    const hit = raySegmentIntersection(ray, surface.segment.start, surface.segment.end);
    if (hit) {
      const dist = (hit.x - ray.source.x) ** 2 + (hit.y - ray.source.y) ** 2;
      if (dist < closestDist && dist > 0.01) {
        closestDist = dist;
        closestHit = hit;
      }
    }
  }

  // Check screen bounds
  const boundEdges = [
    { start: { x: bounds.minX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.minY } },
    { start: { x: bounds.maxX, y: bounds.minY }, end: { x: bounds.maxX, y: bounds.maxY } },
    { start: { x: bounds.maxX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.maxY } },
    { start: { x: bounds.minX, y: bounds.maxY }, end: { x: bounds.minX, y: bounds.minY } },
  ];

  for (const edge of boundEdges) {
    const hit = raySegmentIntersection(ray, edge.start, edge.end);
    if (hit) {
      const dist = (hit.x - ray.source.x) ** 2 + (hit.y - ray.source.y) ** 2;
      if (dist < closestDist && dist > 0.01) {
        closestDist = dist;
        closestHit = hit;
      }
    }
  }

  return closestHit;
}

/**
 * Check if a point is a duplicate of any in the list.
 */
function isDuplicate(point: Vector2, list: Vector2[]): boolean {
  return list.some(p => 
    Math.abs(p.x - point.x) < 0.5 && Math.abs(p.y - point.y) < 0.5
  );
}

