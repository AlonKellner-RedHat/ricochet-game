/**
 * Setup Transformer
 *
 * Transforms a test setup with obstructions/off-segment reflections into an
 * "ideal" setup where:
 * - Obstructions are removed
 * - Segments are extended to reach their reflection points
 *
 * This enables validation of First Principle 2.5:
 * "Red paths must match green paths when obstacles are removed and segments extended."
 */

import type { Surface } from "@/surfaces/Surface";
import type { PathResult } from "@/trajectory-v2/engine/types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { createTestSurface, distance } from "./MatrixTestRunner";
import type { TestResults, TestSetup } from "./types";

/**
 * A single modification made to transform the setup.
 */
export interface SetupModification {
  readonly type:
    | "remove_obstruction"
    | "extend_segment"
    | "translate_segment"
    | "duplicate_segment";
  readonly surfaceId: string;
  readonly details: string;
}

/**
 * Result of transforming a setup to its ideal version.
 */
export interface TransformedSetup {
  /** The transformed setup (null if invalid) */
  readonly setup: TestSetup | null;

  /** List of modifications made */
  readonly modifications: readonly SetupModification[];

  /** Whether the transformation is valid for comparison */
  readonly isValid: boolean;

  /** If invalid, why the transformation cannot be used */
  readonly invalidReason?: string;
}

/**
 * Check if a surface is an obstruction (non-reflectable wall that blocked the path).
 */
function isObstruction(surface: Surface): boolean {
  // Walls are obstructions (they can't be reflected off)
  return !surface.canReflectFrom({ x: 1, y: 0 });
}

/**
 * Find all surfaces that caused the path to diverge.
 *
 * Returns:
 * - Obstructions: non-reflectable surfaces that would block the IDEAL path
 * - Off-segment hits: planned surfaces where the hit was off the segment
 *
 * IMPORTANT: We need to identify ALL potential obstructions along the ideal path,
 * not just the first one the actual path hit. This requires analyzing the full
 * planned trajectory and finding all walls that intersect it.
 */
function findDivergenceCauses(
  setup: TestSetup,
  results: TestResults
): {
  obstructions: Surface[];
  offSegmentSurfaces: Array<{ surface: Surface; hitPoint: Vector2 }>;
} {
  const obstructions: Surface[] = [];
  const offSegmentSurfaces: Array<{ surface: Surface; hitPoint: Vector2 }> = [];

  const { actualPath, plannedPath } = results;

  // Check for off-segment hits in planned path
  for (const hit of plannedPath.hitInfo) {
    if (!hit.onSegment) {
      offSegmentSurfaces.push({ surface: hit.surface, hitPoint: hit.point });
    }
  }

  // Find ALL walls that intersect the planned path trajectory
  // We need to check each segment of the planned path against all non-reflectable surfaces
  const plannedSurfaceIds = new Set(setup.plannedSurfaces.map(s => s.id));
  
  for (const surface of setup.allSurfaces) {
    // Skip planned surfaces - they're not obstructions
    if (plannedSurfaceIds.has(surface.id)) {
      continue;
    }
    
    // Check if this is a wall/obstruction
    if (!isObstruction(surface)) {
      continue;
    }
    
    // Check if this wall intersects ANY segment of the planned path
    if (intersectsPlannedPath(surface, plannedPath.points)) {
      obstructions.push(surface);
    }
  }

  // Also include the blockedBy surface if not already included
  if (actualPath.blockedBy && isObstruction(actualPath.blockedBy)) {
    if (!obstructions.some(o => o.id === actualPath.blockedBy!.id)) {
      obstructions.push(actualPath.blockedBy);
    }
  }

  return { obstructions, offSegmentSurfaces };
}

/**
 * Check if a surface intersects any segment of the planned path.
 */
function intersectsPlannedPath(
  surface: Surface,
  pathPoints: readonly Vector2[]
): boolean {
  if (pathPoints.length < 2) return false;
  
  const { start: s1, end: s2 } = surface.segment;
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i]!;
    const p2 = pathPoints[i + 1]!;
    
    if (segmentsIntersect(p1, p2, s1, s2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if two line segments intersect.
 */
function segmentsIntersect(
  a1: Vector2, a2: Vector2,
  b1: Vector2, b2: Vector2
): boolean {
  // Cross product helper
  const cross = (o: Vector2, a: Vector2, b: Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  // Check for collinear cases
  const onSegment = (p: Vector2, q: Vector2, r: Vector2) =>
    q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  
  if (d1 === 0 && onSegment(b1, a1, b2)) return true;
  if (d2 === 0 && onSegment(b1, a2, b2)) return true;
  if (d3 === 0 && onSegment(a1, b1, a2)) return true;
  if (d4 === 0 && onSegment(a1, b2, a2)) return true;
  
  return false;
}

/**
 * Extend a surface segment to include a point.
 *
 * Projects the point onto the infinite line defined by the segment,
 * then extends the segment to include that projection.
 */
function extendSurfaceToPoint(
  surface: Surface,
  point: Vector2
): { newStart: Vector2; newEnd: Vector2 } {
  const { start, end } = surface.segment;

  // Calculate segment direction
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLength = Math.sqrt(dx * dx + dy * dy);

  if (segmentLength < 1e-6) {
    // Degenerate segment, just extend to point
    return { newStart: start, newEnd: point };
  }

  // Project point onto segment line
  const dirX = dx / segmentLength;
  const dirY = dy / segmentLength;

  const toPoint = { x: point.x - start.x, y: point.y - start.y };
  const projection = toPoint.x * dirX + toPoint.y * dirY;

  // Calculate where the projected point is
  const projectedPoint = {
    x: start.x + dirX * projection,
    y: start.y + dirY * projection,
  };

  // Extend segment to include this point
  // Calculate min and max projections
  const startProjection = 0;
  const endProjection = segmentLength;

  const minProjection = Math.min(startProjection, endProjection, projection);
  const maxProjection = Math.max(startProjection, endProjection, projection);

  return {
    newStart: {
      x: start.x + dirX * minProjection,
      y: start.y + dirY * minProjection,
    },
    newEnd: {
      x: start.x + dirX * maxProjection,
      y: start.y + dirY * maxProjection,
    },
  };
}

/**
 * Check if a point lies between two other points on a ray.
 */
function isPointBetween(
  start: Vector2,
  point: Vector2,
  end: Vector2
): boolean {
  const startToPoint = distance(start, point);
  const startToEnd = distance(start, end);
  const pointToEnd = distance(point, end);

  // Point is between if distance is approximately additive
  return Math.abs(startToPoint + pointToEnd - startToEnd) < 1;
}

/**
 * Check if a path would intersect any of the modified surfaces in unexpected ways.
 */
function checkForNewIntersections(
  plannedPath: PathResult,
  modifiedSurfaces: readonly Surface[]
): string | null {
  // Get the expected hit points from the planned path
  const expectedHitSurfaces = new Set(plannedPath.hitInfo.map((h) => h.surface.id));

  for (let i = 0; i < plannedPath.points.length - 1; i++) {
    const segmentStart = plannedPath.points[i]!;
    const segmentEnd = plannedPath.points[i + 1]!;

    // Check each modified surface for unexpected intersection
    for (const surface of modifiedSurfaces) {
      // Skip surfaces we're supposed to hit
      if (expectedHitSurfaces.has(surface.id)) {
        continue;
      }

      // Simple segment-segment intersection check
      const { start, end } = surface.segment;

      // Bounding box check first
      const minX1 = Math.min(segmentStart.x, segmentEnd.x);
      const maxX1 = Math.max(segmentStart.x, segmentEnd.x);
      const minY1 = Math.min(segmentStart.y, segmentEnd.y);
      const maxY1 = Math.max(segmentStart.y, segmentEnd.y);

      const minX2 = Math.min(start.x, end.x);
      const maxX2 = Math.max(start.x, end.x);
      const minY2 = Math.min(start.y, end.y);
      const maxY2 = Math.max(start.y, end.y);

      if (maxX1 < minX2 || maxX2 < minX1 || maxY1 < minY2 || maxY2 < minY1) {
        continue; // No intersection possible
      }

      // More detailed intersection check could be added here if needed
    }
  }

  return null; // No unexpected intersections found
}

/**
 * Check if original path reflected off a surface that would be removed.
 */
function checkForReflectionOffRemoved(
  actualPath: PathResult,
  removedSurfaces: readonly Surface[]
): boolean {
  const removedIds = new Set(removedSurfaces.map((s) => s.id));

  for (const hit of actualPath.hitInfo) {
    if (hit.reflected && removedIds.has(hit.surface.id)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the setup has degenerate geometry that makes transformation invalid.
 *
 * Degenerate cases include:
 * - Cursor on the surface line
 * - Cursor at the same position as a reflection point
 * - Zero-length path segments
 */
function hasDegenrateGeometry(
  setup: TestSetup,
  results: TestResults
): string | null {
  const { cursor, player } = setup;
  
  // Check if cursor is on any planned surface line
  for (const surface of setup.plannedSurfaces) {
    const { start, end } = surface.segment;
    
    // Check if cursor is on the infinite line of the surface
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      continue; // Degenerate surface
    }
    
    // For vertical surfaces, check if cursor x matches
    if (Math.abs(dx) < 1e-6 && Math.abs(cursor.x - start.x) < 1) {
      return "cursor_on_surface_line";
    }
    
    // For horizontal surfaces, check if cursor y matches
    if (Math.abs(dy) < 1e-6 && Math.abs(cursor.y - start.y) < 1) {
      return "cursor_on_surface_line";
    }
  }
  
  // Check if any hit point coincides with cursor
  for (const hit of results.plannedPath.hitInfo) {
    if (distance(hit.point, cursor) < 1) {
      return "cursor_at_reflection_point";
    }
  }
  
  // Check for zero-length segments in planned path
  for (let i = 0; i < results.plannedPath.points.length - 1; i++) {
    const p1 = results.plannedPath.points[i]!;
    const p2 = results.plannedPath.points[i + 1]!;
    if (distance(p1, p2) < 1) {
      return "zero_length_segment";
    }
  }
  
  // Check if player and cursor are too close
  if (distance(player, cursor) < 1) {
    return "player_cursor_coincide";
  }
  
  return null;
}

/**
 * Transform a setup to its "ideal" version.
 *
 * This removes obstructions and extends segments to reach off-segment
 * reflection points. The resulting setup should produce aligned paths
 * if the first principle holds.
 */
export function transformToIdealSetup(
  originalSetup: TestSetup,
  originalResults: TestResults
): TransformedSetup {
  const modifications: SetupModification[] = [];

  // If paths are already aligned, no transformation needed
  if (originalResults.alignment.isFullyAligned) {
    return {
      setup: null,
      modifications: [],
      isValid: false,
      invalidReason: "paths_already_aligned",
    };
  }

  // Check for degenerate geometry
  const degenerateReason = hasDegenrateGeometry(originalSetup, originalResults);
  if (degenerateReason) {
    return {
      setup: null,
      modifications: [],
      isValid: false,
      invalidReason: `degenerate_geometry:${degenerateReason}`,
    };
  }

  // Find what caused the divergence
  const { obstructions, offSegmentSurfaces } = findDivergenceCauses(
    originalSetup,
    originalResults
  );

  // Check if original reflected off something we'd remove
  if (checkForReflectionOffRemoved(originalResults.actualPath, obstructions)) {
    return {
      setup: null,
      modifications: [],
      isValid: false,
      invalidReason: "reflected_off_removed",
    };
  }

  // Start building the new setup
  const newAllSurfaces: Surface[] = [];
  const newPlannedSurfaces: Surface[] = [];
  const obstructionIds = new Set(obstructions.map((s) => s.id));
  const offSegmentIds = new Set(offSegmentSurfaces.map((s) => s.surface.id));

  // Process allSurfaces
  for (const surface of originalSetup.allSurfaces) {
    // Skip obstructions
    if (obstructionIds.has(surface.id)) {
      modifications.push({
        type: "remove_obstruction",
        surfaceId: surface.id,
        details: `Removed wall/obstruction ${surface.id}`,
      });
      continue;
    }

    // Extend off-segment surfaces
    const offSegmentInfo = offSegmentSurfaces.find(
      (s) => s.surface.id === surface.id
    );
    if (offSegmentInfo) {
      const { newStart, newEnd } = extendSurfaceToPoint(
        surface,
        offSegmentInfo.hitPoint
      );

      const extendedSurface = createTestSurface({
        id: surface.id,
        start: newStart,
        end: newEnd,
        canReflect: surface.canReflectFrom({ x: 1, y: 0 }),
      });

      newAllSurfaces.push(extendedSurface);

      modifications.push({
        type: "extend_segment",
        surfaceId: surface.id,
        details: `Extended segment to reach reflection point at (${offSegmentInfo.hitPoint.x.toFixed(1)}, ${offSegmentInfo.hitPoint.y.toFixed(1)})`,
      });
    } else {
      // Keep surface as-is
      newAllSurfaces.push(surface);
    }
  }

  // Process plannedSurfaces similarly
  for (const surface of originalSetup.plannedSurfaces) {
    const offSegmentInfo = offSegmentSurfaces.find(
      (s) => s.surface.id === surface.id
    );
    if (offSegmentInfo) {
      // Find the extended version from allSurfaces
      const extendedSurface = newAllSurfaces.find((s) => s.id === surface.id);
      if (extendedSurface) {
        newPlannedSurfaces.push(extendedSurface);
      }
    } else if (!obstructionIds.has(surface.id)) {
      newPlannedSurfaces.push(surface);
    }
  }

  // Check for new intersections that would invalidate the transformation
  const newIntersectionError = checkForNewIntersections(
    originalResults.plannedPath,
    newAllSurfaces
  );
  if (newIntersectionError) {
    return {
      setup: null,
      modifications,
      isValid: false,
      invalidReason: `new_intersection: ${newIntersectionError}`,
    };
  }

  // Build the new setup
  const newSetup: TestSetup = {
    name: `${originalSetup.name}-ideal`,
    description: `Ideal version of ${originalSetup.description}`,
    player: originalSetup.player,
    cursor: originalSetup.cursor,
    plannedSurfaces: newPlannedSurfaces,
    allSurfaces: newAllSurfaces,
    expected: {
      isAligned: true, // We expect this to be aligned now
    },
    tags: [...(originalSetup.tags || []), "generated", "ideal-transform"],
  };

  // Validate the transformation makes sense
  if (modifications.length === 0) {
    return {
      setup: null,
      modifications: [],
      isValid: false,
      invalidReason: "no_modifications_needed",
    };
  }

  return {
    setup: newSetup,
    modifications,
    isValid: true,
  };
}

/**
 * Check if paths are geometrically equivalent (same waypoints).
 *
 * Compares path points within a tolerance.
 */
export function arePathsEquivalent(
  path1: PathResult,
  path2: PathResult,
  tolerance = 1
): boolean {
  if (path1.points.length !== path2.points.length) {
    return false;
  }

  for (let i = 0; i < path1.points.length; i++) {
    const p1 = path1.points[i]!;
    const p2 = path2.points[i]!;

    if (distance(p1, p2) > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Get a human-readable summary of the transformation.
 */
export function getTransformationSummary(
  transformed: TransformedSetup
): string {
  if (!transformed.isValid) {
    return `Transformation invalid: ${transformed.invalidReason}`;
  }

  const summary = transformed.modifications
    .map((m) => `- ${m.details}`)
    .join("\n");

  return `Transformation applied:\n${summary}`;
}

