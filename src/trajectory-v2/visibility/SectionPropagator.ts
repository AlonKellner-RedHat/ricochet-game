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
 * Check if a point is on the reflective side of a surface.
 * 
 * The reflective side is determined by the surface normal direction.
 * For a segment from start to end, the normal points "left" (using right-hand rule).
 * A point is on the reflective side if it's on the same side as the normal.
 * 
 * Uses exact arithmetic (no normalization, just cross-product sign).
 */
export function isOnReflectiveSide(point: Vector2, surface: Surface): boolean {
  const { start, end } = surface.segment;
  
  // Get surface direction
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  // Vector from surface start to point
  const px = point.x - start.x;
  const py = point.y - start.y;
  
  // Cross product determines which side the point is on
  // If positive: point is to the LEFT of the line (start→end) = normal side = reflective side
  // If negative: point is to the RIGHT = back side
  const cross = dx * py - dy * px;
  
  // Point must be strictly on the reflective side (positive cross)
  // Zero means point is exactly on the line (edge case)
  return cross > 0;
}

/**
 * Propagate visibility through a chain of planned surfaces.
 *
 * Simplified algorithm:
 * 1. Check if player is on reflective side of first surface
 * 2. Calculate visible sections on first surface from player
 * 3. Reflect player through surface to get image
 * 4. The visible sections define the "window" through which light passes
 * 5. For multi-surface: repeat for each surface in sequence
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

  // Multi-surface propagation:
  // 1. For each surface in order, check if current origin can see it
  // 2. Calculate visible sections on that surface
  // 3. Reflect origin → next image, reflect sections
  // 4. Continue with next surface using new origin

  let currentOrigin = player;
  let currentSections: AngularSection[] = [];

  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;

    // Check if current origin is on the reflective side of this surface
    if (!isOnReflectiveSide(currentOrigin, surface)) {
      // Cannot see this surface from reflective side - visibility is empty
      return { sections: [], origin: currentOrigin };
    }

    // Calculate which sections of the surface are visible from current origin
    // Exclude the current surface and all previous planned surfaces from obstacles
    const processedSurfaceIds = new Set(
      plannedSurfaces.slice(0, i + 1).map(s => s.id)
    );
    const obstaclesForLOS = allSurfaces.filter(s => !processedSurfaceIds.has(s.id));

    const visibleOnSurface = calculateVisibleSectionsOnSurface(
      currentOrigin,
      surface,
      obstaclesForLOS
    );

    if (visibleOnSurface.length === 0) {
      // No visibility to this surface
      return { sections: [], origin: currentOrigin };
    }

    // Reflect current origin through surface to get next image
    const nextOrigin = reflectPointThroughLine(
      currentOrigin,
      surface.segment.start,
      surface.segment.end
    );

    // Reflect the visible sections through this surface
    const reflectedSections = visibleOnSurface.map(s => reflectSection(s, surface));

    // Update for next iteration
    currentSections = reflectedSections;
    currentOrigin = nextOrigin;
  }

  return {
    sections: currentSections,
    origin: currentOrigin,
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
 * 3. For each ray, verify the player can reach the window entry point (input-side check)
 * 4. Collect hit points on obstacles/screen edges
 * 5. Order vertices by angle from player image
 *
 * @param propagation Result of propagateVisibility  
 * @param allSurfaces All surfaces for ray casting
 * @param bounds Screen bounds
 * @param lastPlannedSurface The last planned surface (for polygon boundary)
 * @param playerPosition Original player position (for input-side obstruction check)
 */
export function buildPolygonFromSections(
  propagation: PropagatedVisibility,
  allSurfaces: readonly Surface[],
  bounds: ScreenBounds,
  lastPlannedSurface: Surface,
  playerPosition?: Vector2
): Vector2[] {
  if (propagation.sections.length === 0) {
    return [];
  }

  const { origin, sections } = propagation;  // origin is the final player image
  const vertices: Array<{ point: Vector2; angle: number }> = [];

  // For multi-surface, use the section boundaries (which are already constrained)
  // instead of the full surface endpoints
  // The sections define the visible "window" after all propagation
  
  // Collect all section boundary points (these are reflected points, so we use 
  // the intersection with the last surface)
  const surfaceStart = lastPlannedSurface.segment.start;
  const surfaceEnd = lastPlannedSurface.segment.end;
  
  // Calculate angles to both surface endpoints and section boundaries
  const angleToSurfaceStart = Math.atan2(surfaceStart.y - origin.y, surfaceStart.x - origin.x);
  const angleToSurfaceEnd = Math.atan2(surfaceEnd.y - origin.y, surfaceEnd.x - origin.x);
  
  // Use the section boundaries (left and right of first/last sections)
  // These are the actual visible bounds after propagation
  const firstSection = sections[0]!;
  
  // IMPORTANT: If sections are split (multiple non-contiguous sections), the visible
  // region is discontinuous. A simple polygon cannot represent this accurately.
  // For V.5 correctness, we use only the FIRST section to avoid over-approximation.
  // This may under-approximate the visible region, but won't incorrectly include
  // shadowed areas.
  const lastSection = sections.length > 1 ? firstSection : sections[sections.length - 1]!;
  
  // Section boundaries are target points from the reflected origin
  const angleToSectionLeft = Math.atan2(firstSection.left.y - origin.y, firstSection.left.x - origin.x);
  const angleToSectionRight = Math.atan2(lastSection.right.y - origin.y, lastSection.right.x - origin.x);
  
  // The visible window is the intersection of section bounds with surface bounds
  // For now, use the section boundaries as they're already constrained
  const angleToStart = angleToSectionLeft;
  const angleToEnd = angleToSectionRight;

  // Determine angular range (the window)
  let minAngle = Math.min(angleToStart, angleToEnd);
  let maxAngle = Math.max(angleToStart, angleToEnd);

  // Handle wrap-around if range is more than 180 degrees
  if (maxAngle - minAngle > Math.PI) {
    const temp = minAngle;
    minAngle = maxAngle;
    maxAngle = temp + 2 * Math.PI;
  }

  // Add section boundary points (where rays hit the last surface)
  // These are the intersections of section boundary rays with the last surface
  const leftIntersection = findRaySurfaceIntersection(origin, firstSection.left, lastPlannedSurface);
  const rightIntersection = findRaySurfaceIntersection(origin, lastSection.right, lastPlannedSurface);
  
  if (leftIntersection) {
    vertices.push({ point: leftIntersection, angle: angleToStart });
  } else {
    // Fallback to section boundary point
    vertices.push({ point: firstSection.left, angle: angleToStart });
  }
  
  if (rightIntersection) {
    vertices.push({ point: rightIntersection, angle: angleToEnd });
  } else {
    vertices.push({ point: lastSection.right, angle: angleToEnd });
  }

  // Surfaces to check for hits (excluding the planned surface itself)
  const surfacesForHits = allSurfaces.filter(s => s.id !== lastPlannedSurface.id);

  // Collect critical angles within the window
  const criticalAngles: number[] = [];

  // Add surface endpoints within the window (output-side obstacles)
  for (const surface of surfacesForHits) {
    for (const endpoint of [surface.segment.start, surface.segment.end]) {
      const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x);
      if (isAngleInRange(angle, minAngle, maxAngle)) {
        criticalAngles.push(angle);
        criticalAngles.push(angle - 0.0001, angle + 0.0001);
      }
    }
  }
  
  // INPUT-SIDE SHADOW EDGES: Calculate shadow regions cast by obstacles between player and surface
  // These shadows represent areas on the planned surface that the player cannot reach
  const shadowRegions: Array<{ start: number; end: number; startPoint: Vector2; endPoint: Vector2 }> = [];
  
  if (playerPosition) {
    for (const surface of surfacesForHits) {
      const shadowEdges: Array<{ point: Vector2; angle: number }> = [];
      
      for (const endpoint of [surface.segment.start, surface.segment.end]) {
        // Cast ray from player through obstacle endpoint to the planned surface
        const rayToEndpoint: Ray = { source: playerPosition, target: endpoint };
        const surfaceHit = raySegmentIntersection(
          rayToEndpoint,
          lastPlannedSurface.segment.start,
          lastPlannedSurface.segment.end
        );
        
        if (surfaceHit) {
          // Check if the obstacle endpoint is between player and the surface hit
          const distToEndpoint = Math.sqrt(
            (endpoint.x - playerPosition.x) ** 2 + (endpoint.y - playerPosition.y) ** 2
          );
          const distToSurface = Math.sqrt(
            (surfaceHit.x - playerPosition.x) ** 2 + (surfaceHit.y - playerPosition.y) ** 2
          );
          
          // Also check that the ray is going TOWARD the planned surface (not away)
          // by verifying the surface hit is in front of the player (t > 0 in ray direction)
          const rayDx = endpoint.x - playerPosition.x;
          const rayDy = endpoint.y - playerPosition.y;
          const hitDx = surfaceHit.x - playerPosition.x;
          const hitDy = surfaceHit.y - playerPosition.y;
          const dotProduct = rayDx * hitDx + rayDy * hitDy;
          
          if (distToEndpoint < distToSurface - 0.5 && dotProduct > 0) {
            // This obstacle endpoint creates a shadow edge on the planned surface
            const angle = Math.atan2(surfaceHit.y - origin.y, surfaceHit.x - origin.x);
            shadowEdges.push({ point: surfaceHit, angle });
            
            // Add as critical angle for polygon construction
            if (isAngleInRange(angle, minAngle, maxAngle)) {
              criticalAngles.push(angle);
              criticalAngles.push(angle - 0.0001, angle + 0.0001);
            }
          }
        }
      }
      
      // If we found two shadow edges for this obstacle, it creates a shadow region
      if (shadowEdges.length === 2) {
        const [edge1, edge2] = shadowEdges;
        let a1 = edge1!.angle;
        let a2 = edge2!.angle;
        // Normalize angles for range comparison
        if (maxAngle > Math.PI) {
          if (a1 < 0) a1 += 2 * Math.PI;
          if (a2 < 0) a2 += 2 * Math.PI;
        }
        
        // Store shadow region with points for polygon construction
        if (a1 < a2) {
          shadowRegions.push({
            start: a1,
            end: a2,
            startPoint: edge1!.point,
            endPoint: edge2!.point,
          });
        } else {
          shadowRegions.push({
            start: a2,
            end: a1,
            startPoint: edge2!.point,
            endPoint: edge1!.point,
          });
        }
        
        // Shadow edge points will be added separately to the final polygon
        // (not to vertices, as they'd be filtered out for being on the surface)
      }
    }
  }
  
  // Shadow edge points are ON the planned surface.
  // Adding them to the polygon would cause self-intersection since the polygon
  // already uses the surface endpoints as start/end points.
  // 
  // Instead, we rely on the ray filtering (isAngleInShadow) to exclude rays
  // within shadow angles. The polygon will slightly over-approximate the visible
  // region, but the input-side obstruction check (isInputPathBlocked) will catch
  // cases where a specific cursor position requires passing through a shadow.
  const shadowBoundaryPoints: Array<{ point: Vector2; angle: number }> = [];
  // Intentionally empty to avoid self-intersection

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

  // Helper to check if an angle falls within any shadow region
  const isAngleInShadow = (angle: number): boolean => {
    let normAngle = angle;
    if (maxAngle > Math.PI && normAngle < 0) {
      normAngle += 2 * Math.PI;
    }
    for (const shadow of shadowRegions) {
      // Check if angle is strictly within the shadow (not at edges)
      if (normAngle > shadow.start + 0.0002 && normAngle < shadow.end - 0.0002) {
        return true;
      }
    }
    return false;
  };

  // Cast rays at each critical angle
  // IMPORTANT: When the player image is outside the screen, we need to cast rays
  // starting FROM the planned surface (the "window"), not from the image.
  // This ensures we only find hits on the reflective side.
  for (const angle of criticalAngles) {
    if (!isAngleInRange(angle, minAngle, maxAngle)) continue;
    
    // Skip rays that fall within input-side shadow regions
    if (isAngleInShadow(angle)) {
      continue;
    }

    const farTarget = {
      x: origin.x + Math.cos(angle) * 10000,
      y: origin.y + Math.sin(angle) * 10000,
    };

    // Find where this ray crosses the planned surface (the "window")
    const surfaceIntersection = findRaySurfaceIntersection(origin, farTarget, lastPlannedSurface);
    
    if (surfaceIntersection) {
      // INPUT-SIDE CHECK: Verify the player can reach this window entry point
      // If there's a surface between the player and this point on the window,
      // then this ray should not contribute to visibility
      if (playerPosition) {
        const inputBlocked = isInputPathBlocked(
          playerPosition,
          surfaceIntersection,
          surfacesForHits,
          lastPlannedSurface
        );
        if (inputBlocked) {
          continue; // Skip this ray - player can't reach this part of the window
        }
      }
      
      // Cast ray from the surface intersection point outward (toward the side the player is on)
      // This represents positions reachable by a ball that reflects off the surface
      
      // Add small offset in the ray direction to avoid hitting the surface itself
      const offsetSource = {
        x: surfaceIntersection.x + Math.cos(angle) * 0.1,
        y: surfaceIntersection.y + Math.sin(angle) * 0.1,
      };
      
      const hit = castRayToFirstHit({ source: offsetSource, target: farTarget }, surfacesForHits, bounds);
      if (hit) {
        vertices.push({ point: hit, angle });
      }
    } else {
      // Ray doesn't cross surface (shouldn't happen within the window)
      // Fall back to original behavior
      const hit = castRayToFirstHit({ source: origin, target: farTarget }, surfacesForHits, bounds);
      if (hit && isOnReflectiveSide(hit, lastPlannedSurface)) {
        vertices.push({ point: hit, angle });
      }
    }
  }

  // Separate surface endpoint vertices from ray hit vertices
  // Surface endpoints are the "window" edges and should be at the start/end of the polygon
  const rayHitVertices: Array<{ point: Vector2; angle: number }> = [];
  
  // Get the actual surface endpoints for comparison
  const surfStart = lastPlannedSurface.segment.start;
  const surfEnd = lastPlannedSurface.segment.end;

  for (const v of vertices) {
    // Check if this vertex is close to either surface endpoint
    const isStartEndpoint = 
      Math.abs(v.point.x - surfStart.x) < 1 && Math.abs(v.point.y - surfStart.y) < 1;
    const isEndEndpoint = 
      Math.abs(v.point.x - surfEnd.x) < 1 && Math.abs(v.point.y - surfEnd.y) < 1;
    
    // Check if this vertex lies ON the planned surface line segment
    // (not just at endpoints, but anywhere along the segment)
    const isOnSurfaceLine = isPointOnLineSegment(v.point, surfStart, surfEnd, 2);
    
    // Skip any points on the surface - we'll add endpoints explicitly later
    if (!isStartEndpoint && !isEndEndpoint && !isOnSurfaceLine) {
      rayHitVertices.push(v);
    }
  }

  // Normalize angles for ray hits
  const normalizedHits = rayHitVertices.map(v => {
    let normAngle = v.angle;
    if (maxAngle > Math.PI && normAngle < 0) {
      normAngle += 2 * Math.PI;
    }
    return { point: v.point, angle: normAngle };
  });

  // Sort ray hits by normalized angle
  normalizedHits.sort((a, b) => a.angle - b.angle);

  // Remove duplicates and near-duplicates from ray hits
  // Use 2 pixel tolerance to catch very close vertices
  const uniqueHits: Vector2[] = [];
  for (const v of normalizedHits) {
    const isDup = uniqueHits.some(existing => {
      const dist = Math.sqrt((existing.x - v.point.x) ** 2 + (existing.y - v.point.y) ** 2);
      return dist < 2;
    });
    if (!isDup) {
      uniqueHits.push(v.point);
    }
  }

  // Build the final polygon:
  // 1. Start with one section boundary point (the visible "window" edge)
  // 2. Add all ray hits in angle order, with shadow boundaries interspersed
  // 3. End with the other section boundary point
  // 
  // IMPORTANT: Handle shadows - the polygon boundary must "notch in" at shadow regions
  // to exclude areas that the player cannot reach due to input-side obstructions.
  
  // Get the actual section boundary points on the surface
  const sectionLeftPoint = leftIntersection || firstSection.left;
  const sectionRightPoint = rightIntersection || lastSection.right;
  
  // Use normalized angles for ordering
  let normalizedLeftAngle = angleToStart;
  let normalizedRightAngle = angleToEnd;
  if (maxAngle > Math.PI) {
    if (normalizedLeftAngle < 0) normalizedLeftAngle += 2 * Math.PI;
    if (normalizedRightAngle < 0) normalizedRightAngle += 2 * Math.PI;
  }
  
  // Normalize shadow boundary angles
  const normalizedShadowPoints = shadowBoundaryPoints.map(sp => {
    let normAngle = sp.angle;
    if (maxAngle > Math.PI && normAngle < 0) {
      normAngle += 2 * Math.PI;
    }
    return { point: sp.point, angle: normAngle };
  });
  
  // Combine ray hits with shadow boundary points and sort by angle
  const allBoundaryPoints: Array<{ point: Vector2; angle: number; isShadowEdge: boolean }> = [
    ...uniqueHits.map(p => ({ point: p, angle: Math.atan2(p.y - origin.y, p.x - origin.x), isShadowEdge: false })),
    ...normalizedShadowPoints.map(sp => ({ point: sp.point, angle: sp.angle, isShadowEdge: true })),
  ];
  
  // Normalize all angles for consistent sorting
  for (const bp of allBoundaryPoints) {
    if (maxAngle > Math.PI && bp.angle < 0) {
      bp.angle += 2 * Math.PI;
    }
  }
  
  // Sort by angle
  allBoundaryPoints.sort((a, b) => a.angle - b.angle);
  
  // Remove duplicates
  const deduped: Array<{ point: Vector2; angle: number; isShadowEdge: boolean }> = [];
  for (const bp of allBoundaryPoints) {
    const isDup = deduped.some(existing => {
      const dist = Math.sqrt((existing.point.x - bp.point.x) ** 2 + (existing.point.y - bp.point.y) ** 2);
      return dist < 2;
    });
    if (!isDup) {
      deduped.push(bp);
    }
  }
  
  const finalVertices: Vector2[] = [];
  
  if (normalizedLeftAngle < normalizedRightAngle) {
    finalVertices.push(sectionLeftPoint);
    for (const bp of deduped) {
      finalVertices.push(bp.point);
    }
    finalVertices.push(sectionRightPoint);
  } else {
    finalVertices.push(sectionRightPoint);
    for (const bp of deduped) {
      finalVertices.push(bp.point);
    }
    finalVertices.push(sectionLeftPoint);
  }

  return finalVertices;
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
 * Check if a point lies on a line segment (within tolerance).
 * 
 * Uses distance from point to line + parameter check to verify
 * the point is within the segment bounds.
 */
function isPointOnLineSegment(
  point: Vector2,
  segStart: Vector2,
  segEnd: Vector2,
  tolerance: number
): boolean {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const segLenSq = dx * dx + dy * dy;
  
  if (segLenSq < 0.001) {
    // Degenerate segment - check distance to point
    return Math.abs(point.x - segStart.x) < tolerance && 
           Math.abs(point.y - segStart.y) < tolerance;
  }
  
  // Project point onto line and get parameter t
  const t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / segLenSq;
  
  // Check if t is within [0, 1] (point is between endpoints)
  if (t < 0 || t > 1) {
    return false;
  }
  
  // Find closest point on segment
  const closestX = segStart.x + t * dx;
  const closestY = segStart.y + t * dy;
  
  // Check distance from point to closest point on segment
  const dist = Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
  
  return dist < tolerance;
}

/**
 * Check if a point is a duplicate of any in the list.
 */
function isDuplicate(point: Vector2, list: Vector2[]): boolean {
  return list.some(p => 
    Math.abs(p.x - point.x) < 0.5 && Math.abs(p.y - point.y) < 0.5
  );
}

/**
 * Check if the input path from player to window entry point is blocked.
 * 
 * This is crucial for V.5 compliance: even if the player can see the planned surface,
 * certain shooting directions might be blocked by other surfaces between the player
 * and the planned surface.
 * 
 * @param player The player position
 * @param windowPoint The point on the planned surface (window entry)
 * @param obstacles All surfaces that might block the path
 * @param plannedSurface The planned surface (excluded from blocking check)
 * @returns true if the path is blocked, false if clear
 */
function isInputPathBlocked(
  player: Vector2,
  windowPoint: Vector2,
  obstacles: readonly Surface[],
  plannedSurface: Surface
): boolean {
  const dx = windowPoint.x - player.x;
  const dy = windowPoint.y - player.y;
  const distToWindow = Math.sqrt(dx * dx + dy * dy);
  
  if (distToWindow < 0.01) return false; // Player at window
  
  const ray: Ray = { source: player, target: windowPoint };
  
  for (const obstacle of obstacles) {
    // Skip the planned surface itself
    if (obstacle.id === plannedSurface.id) continue;
    
    const intersection = raySegmentIntersection(
      ray,
      obstacle.segment.start,
      obstacle.segment.end
    );
    
    if (intersection) {
      const distToHit = Math.sqrt(
        (intersection.x - player.x) ** 2 + (intersection.y - player.y) ** 2
      );
      
      // Blocked if we hit an obstacle before reaching the window
      // Use small epsilon to avoid false positives at the window itself
      if (distToHit < distToWindow - 0.5) {
        return true; // Input path is blocked
      }
    }
  }
  
  return false; // Path is clear
}

/**
 * Find where a ray from origin through target intersects a surface.
 * Returns null if no intersection.
 */
function findRaySurfaceIntersection(
  origin: Vector2,
  target: Vector2,
  surface: Surface
): Vector2 | null {
  const ray: Ray = { source: origin, target };
  return raySegmentIntersection(ray, surface.segment.start, surface.segment.end);
}

