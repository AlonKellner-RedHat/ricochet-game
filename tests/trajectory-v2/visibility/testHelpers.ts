/**
 * Visibility Test Helpers
 *
 * Helper functions for testing the visibility/shadow system.
 */

import type { Surface } from "@/surfaces/Surface";
import { type SurfaceChain, createSingleSurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Outline vertex type (simplified from deleted OutlineBuilder).
 */
interface OutlineVertex {
  position: Vector2;
  type: string;
  sourceId?: string;
}

/**
 * Valid region outline (simplified from deleted OutlineBuilder).
 */
interface ValidRegionOutline {
  vertices: OutlineVertex[];
  origin: Vector2;
  isValid: boolean;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 * Returns true if point is inside the polygon.
 */
export function isPointInPolygon(point: Vector2, vertices: readonly Vector2[]): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;

    // Check if ray from point going right crosses this edge
    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is in the valid region (lit area).
 */
export function isPointInValidRegion(point: Vector2, outline: ValidRegionOutline): boolean {
  if (!outline.isValid || outline.vertices.length < 3) {
    return false;
  }

  const vertices = outline.vertices.map((v) => v.position);
  return isPointInPolygon(point, vertices);
}

/**
 * Generate test points around a center point in a circle.
 */
export function getPointsNearPlayer(
  player: Vector2,
  radius: number,
  count: number = 8
): Vector2[] {
  const points: Vector2[] = [];
  
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    points.push({
      x: player.x + Math.cos(angle) * radius,
      y: player.y + Math.sin(angle) * radius,
    });
  }
  
  return points;
}

/**
 * Generate test points in the shadow region behind a surface.
 * The shadow is the trapezoid formed by extending rays from origin through surface endpoints.
 *
 * @param origin Light source (player) position
 * @param surface The surface casting the shadow
 * @param distance How far behind the surface to generate points
 * @param count Number of points to generate
 */
export function getPointsBehindSurface(
  origin: Vector2,
  surface: { start: Vector2; end: Vector2 },
  distance: number,
  count: number = 5
): Vector2[] {
  const points: Vector2[] = [];
  
  // Get directions from origin to surface endpoints
  const dir1 = normalize(subtract(surface.start, origin));
  const dir2 = normalize(subtract(surface.end, origin));
  
  // Calculate midpoint of surface
  const midpoint = {
    x: (surface.start.x + surface.end.x) / 2,
    y: (surface.start.y + surface.end.y) / 2,
  };
  
  // Distance from origin to midpoint
  const distToSurface = Math.sqrt(
    (midpoint.x - origin.x) ** 2 + (midpoint.y - origin.y) ** 2
  );
  
  // Generate points along a line behind the surface
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count; // 0.1, 0.3, 0.5, 0.7, 0.9 for count=5
    
    // Interpolate between the two shadow directions
    const dir = normalize({
      x: dir1.x * (1 - t) + dir2.x * t,
      y: dir1.y * (1 - t) + dir2.y * t,
    });
    
    // Point is at distToSurface + distance along this direction
    points.push({
      x: origin.x + dir.x * (distToSurface + distance),
      y: origin.y + dir.y * (distToSurface + distance),
    });
  }
  
  return points;
}

/**
 * Generate test points in front of a surface (between origin and surface).
 */
export function getPointsInFrontOfSurface(
  origin: Vector2,
  surface: { start: Vector2; end: Vector2 },
  distanceFromSurface: number,
  count: number = 5
): Vector2[] {
  const points: Vector2[] = [];
  
  // Get midpoint of surface
  const midpoint = {
    x: (surface.start.x + surface.end.x) / 2,
    y: (surface.start.y + surface.end.y) / 2,
  };
  
  // Direction from surface to origin
  const dirToOrigin = normalize(subtract(origin, midpoint));
  
  // Generate points along the surface, offset toward origin
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    
    // Point on surface
    const surfacePoint = {
      x: surface.start.x * (1 - t) + surface.end.x * t,
      y: surface.start.y * (1 - t) + surface.end.y * t,
    };
    
    // Move toward origin
    points.push({
      x: surfacePoint.x + dirToOrigin.x * distanceFromSurface,
      y: surfacePoint.y + dirToOrigin.y * distanceFromSurface,
    });
  }
  
  return points;
}

/**
 * Generate points on the reflective (front) side of a surface.
 */
export function getPointsOnReflectiveSide(
  surface: Surface,
  distance: number,
  count: number = 5
): Vector2[] {
  const points: Vector2[] = [];
  const normal = surface.getNormal();
  
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    
    // Point on surface
    const surfacePoint = {
      x: surface.segment.start.x * (1 - t) + surface.segment.end.x * t,
      y: surface.segment.start.y * (1 - t) + surface.segment.end.y * t,
    };
    
    // Move in normal direction (reflective side)
    points.push({
      x: surfacePoint.x + normal.x * distance,
      y: surfacePoint.y + normal.y * distance,
    });
  }
  
  return points;
}

/**
 * Generate points on the non-reflective (back) side of a surface.
 */
export function getPointsOnBackSide(
  surface: Surface,
  distance: number,
  count: number = 5
): Vector2[] {
  const points: Vector2[] = [];
  const normal = surface.getNormal();
  
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    
    // Point on surface
    const surfacePoint = {
      x: surface.segment.start.x * (1 - t) + surface.segment.end.x * t,
      y: surface.segment.start.y * (1 - t) + surface.segment.end.y * t,
    };
    
    // Move in opposite of normal direction (back side)
    points.push({
      x: surfacePoint.x - normal.x * distance,
      y: surfacePoint.y - normal.y * distance,
    });
  }
  
  return points;
}

// Vector helpers
function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Create a mock surface for testing.
 */
export function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = false
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: "reflect", velocity: { x: 0, y: 0 } }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({
      color: canReflect ? 0x00ffff : 0x888888,
      lineWidth: 2,
      alpha: 1,
      glow: false,
    }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.0001) return { x: 0, y: -1 };
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  };
}

/**
 * Calculate the percentage of test points that are in the valid region.
 */
export function percentInValidRegion(
  points: Vector2[],
  outline: ValidRegionOutline
): number {
  if (points.length === 0) return 0;
  
  const inRegion = points.filter((p) => isPointInValidRegion(p, outline)).length;
  return (inRegion / points.length) * 100;
}

/**
 * Wrap an array of surfaces in single-surface chains for testing.
 */
export function toChains(surfaces: Surface[]): SurfaceChain[] {
  return surfaces.map((s) => createSingleSurfaceChain(s));
}

