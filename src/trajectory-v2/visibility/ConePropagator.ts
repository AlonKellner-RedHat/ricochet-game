/**
 * ConePropagator - Main cone propagation algorithm for visibility calculation
 *
 * Propagates a cone of "light" from the player through planned surfaces (windows).
 * Obstacles block sections of the cone. Each window trims and reflects the cone.
 * After the last window, blocking surfaces contribute to the final outline.
 *
 * Algorithm:
 * 1. Start with full cone from player (or reflected player image)
 * 2. For each planned surface (window):
 *    - Block cone sections hit by obstacles
 *    - Trim cone to only pass through the window
 *    - Reflect origin and cone through the window
 * 3. After last window:
 *    - Trim cone to reflective half-plane of last surface
 *    - Propagate and track blocking surfaces for outline
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import {
  reflectPointThroughLine,
  raySegmentIntersect,
  distanceSquared,
} from "@/trajectory-v2/geometry/GeometryOps";
import {
  type Cone,
  type ConeSection,
  fullCone,
  blockCone,
  trimCone,
  reflectCone,
  angleToPoint,
  isAngleInSection,
  isConeEmpty,
  emptyCone,
  normalizeAngle,
  intersectSections,
  sectionSpan,
} from "./ConeSection";

/**
 * Result of cone propagation - enough info to build the outline.
 */
export interface PropagationResult {
  /** Final origin point (reflected player image) */
  readonly finalOrigin: Vector2;
  /** Remaining cone sections after all windows */
  readonly finalCone: Cone;
  /** Surfaces that block sections of the final cone (for outline) */
  readonly blockingSurfaces: readonly BlockingInfo[];
  /** Whether the propagation succeeded (cone not fully blocked) */
  readonly success: boolean;
  /** Planned surfaces that the light has passed through (should not block outline) */
  readonly passedSurfaces?: readonly Surface[];
}

/**
 * Information about a surface that blocks part of the cone.
 */
export interface BlockingInfo {
  /** The blocking surface */
  readonly surface: Surface;
  /** Angular range blocked by this surface */
  readonly section: ConeSection;
  /** Distance from origin to the blocking intersection */
  readonly distance: number;
}

/**
 * Configuration for screen bounds.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const TWO_PI = 2 * Math.PI;

/**
 * Trim cone to only include angles that point toward the reflective side of a surface.
 *
 * After light passes through a window (planned surface) and reflects:
 * - The reflected origin is on the non-reflective side of the surface
 * - Light should only reach points on the reflective side
 * - This means we keep only angles where the ray would cross the surface line
 *
 * Geometrically: keep angles θ where normal · (cos θ, sin θ) > 0
 * This is the half-plane "in front of" the surface.
 */
function trimConeToReflectiveSide(
  cone: Cone,
  origin: Vector2,
  surface: Surface
): Cone {
  const normal = surface.getNormal();

  // The normal points toward the reflective side.
  // We want angles θ where the ray direction dotted with normal > 0.
  // This is the angular range: [normalAngle - π/2, normalAngle + π/2]

  const normalAngle = Math.atan2(normal.y, normal.x);
  const halfPlaneStart = normalizeAngle(normalAngle - Math.PI / 2);
  const halfPlaneEnd = normalizeAngle(normalAngle + Math.PI / 2);

  // Create a section for the reflective half-plane
  // Handle wrap-around: if halfPlaneStart > halfPlaneEnd, the valid range wraps around 0
  let halfPlaneSection: ConeSection;

  if (halfPlaneStart < halfPlaneEnd) {
    halfPlaneSection = { startAngle: halfPlaneStart, endAngle: halfPlaneEnd };
  } else {
    // Wraps around 0: valid range is [halfPlaneStart, 2π) ∪ [0, halfPlaneEnd]
    // We need to handle this by intersecting with both parts separately

    // For simplicity, create two sections and intersect with both
    const section1: ConeSection = {
      startAngle: halfPlaneStart,
      endAngle: TWO_PI - 0.0001,
    };
    const section2: ConeSection = { startAngle: 0, endAngle: halfPlaneEnd };

    const result: Cone = [];
    for (const coneSection of cone) {
      const inter1 = intersectSections(coneSection, section1);
      if (inter1 && sectionSpan(inter1) > 0.0001) {
        result.push(inter1);
      }
      const inter2 = intersectSections(coneSection, section2);
      if (inter2 && sectionSpan(inter2) > 0.0001) {
        result.push(inter2);
      }
    }
    return result;
  }

  // Non-wrapping case: simple intersection
  const result: Cone = [];
  for (const coneSection of cone) {
    const intersection = intersectSections(coneSection, halfPlaneSection);
    if (intersection && sectionSpan(intersection) > 0.0001) {
      result.push(intersection);
    }
  }
  return result;
}

/**
 * Propagate a cone from player through planned surfaces.
 *
 * @param player Starting position
 * @param plannedSurfaces Surfaces to pass through (windows), in order
 * @param allSurfaces All surfaces that can block the cone
 * @returns Propagation result with final cone and blocking info
 */
export function propagateCone(
  player: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): PropagationResult {
  // No planned surfaces: simple visibility from player
  if (plannedSurfaces.length === 0) {
    return propagateFromPoint(player, allSurfaces);
  }

  let origin = player;
  let cone = fullCone();

  // Propagate through each window
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const window = plannedSurfaces[i]!;
    const windowSegment = window.segment;

    // Get obstacles (all surfaces except the current window)
    const obstacles = allSurfaces.filter((s) => s.id !== window.id);

    // Block cone by obstacles between origin and window
    cone = blockConeByObstaclesBeforeWindow(cone, origin, obstacles, window);

    if (isConeEmpty(cone)) {
      return {
        finalOrigin: origin,
        finalCone: emptyCone(),
        blockingSurfaces: [],
        success: false,
        passedSurfaces: plannedSurfaces.slice(0, i),
      };
    }

    // Trim cone to pass through window
    cone = trimCone(cone, origin, windowSegment.start, windowSegment.end);

    if (isConeEmpty(cone)) {
      return {
        finalOrigin: origin,
        finalCone: emptyCone(),
        blockingSurfaces: [],
        success: false,
        passedSurfaces: plannedSurfaces.slice(0, i),
      };
    }

    // Reflect origin and cone through window
    origin = reflectPointThroughLine(origin, windowSegment.start, windowSegment.end);
    cone = reflectCone(cone, windowSegment.start, windowSegment.end);
  }

  // Final phase: let the outline builder filter vertices by surface side
  // The angular trimming has wrap-around edge cases, so we rely on
  // the vertex-level filtering in buildOutline instead.
  const lastWindow = plannedSurfaces[plannedSurfaces.length - 1]!;

  // Now propagate from final origin, track blocking surfaces
  const finalObstacles = allSurfaces.filter((s) => s.id !== lastWindow.id);

  const blockingSurfaces = findBlockingSurfaces(cone, origin, finalObstacles);

  return {
    finalOrigin: origin,
    finalCone: cone,
    blockingSurfaces,
    success: !isConeEmpty(cone),
    passedSurfaces: plannedSurfaces,
  };
}

/**
 * Propagate from a single point (no windows case).
 *
 * For the "no planned surfaces" case, we want a full visibility polygon.
 * All directions are valid - walls don't reduce the cone, they just
 * form part of the outline (rays stop at walls instead of screen edges).
 *
 * The cone remains full (360°) and the outline builder will handle
 * wall intersections when casting rays.
 */
function propagateFromPoint(
  origin: Vector2,
  allSurfaces: readonly Surface[]
): PropagationResult {
  // Full 360° cone - walls don't reduce the cone, they just form boundaries
  const cone = fullCone();

  // No blocking surfaces needed - outline builder will find wall hits directly
  const blockingSurfaces: BlockingInfo[] = [];

  return {
    finalOrigin: origin,
    finalCone: cone,
    blockingSurfaces,
    success: true,
    passedSurfaces: [],
  };
}

/**
 * Block cone sections by obstacles that are between origin and window.
 * Only blocks if the obstacle is closer than the window.
 */
function blockConeByObstaclesBeforeWindow(
  cone: Cone,
  origin: Vector2,
  obstacles: readonly Surface[],
  window: Surface
): Cone {
  const windowMidpoint: Vector2 = {
    x: (window.segment.start.x + window.segment.end.x) / 2,
    y: (window.segment.start.y + window.segment.end.y) / 2,
  };
  const windowDistSq = distanceSquared(origin, windowMidpoint);

  let result = cone;

  for (const obstacle of obstacles) {
    // Check if obstacle is between origin and window
    const obstacleMidpoint: Vector2 = {
      x: (obstacle.segment.start.x + obstacle.segment.end.x) / 2,
      y: (obstacle.segment.start.y + obstacle.segment.end.y) / 2,
    };
    const obstacleDistSq = distanceSquared(origin, obstacleMidpoint);

    // Only block if obstacle is closer than window
    if (obstacleDistSq < windowDistSq) {
      result = blockCone(
        result,
        origin,
        obstacle.segment.start,
        obstacle.segment.end
      );
    }
  }

  return result;
}

/**
 * Find which surfaces block each section of the final cone.
 * Returns the closest blocking surface for each angular range.
 */
function findBlockingSurfaces(
  cone: Cone,
  origin: Vector2,
  surfaces: readonly Surface[]
): BlockingInfo[] {
  const blockingInfos: BlockingInfo[] = [];

  for (const section of cone) {
    // For each section, find surfaces that intersect it
    for (const surface of surfaces) {
      const segStart = surface.segment.start;
      const segEnd = surface.segment.end;

      const startAngle = angleToPoint(origin, segStart);
      const endAngle = angleToPoint(origin, segEnd);

      // Check if surface angles overlap with section
      const surfaceSection: ConeSection = {
        startAngle: Math.min(startAngle, endAngle),
        endAngle: Math.max(startAngle, endAngle),
      };

      // Simple overlap check
      if (sectionsOverlap(section, surfaceSection)) {
        // Calculate distance to surface
        const midAngle = (section.startAngle + section.endAngle) / 2;
        const rayEnd: Vector2 = {
          x: origin.x + Math.cos(midAngle) * 10000,
          y: origin.y + Math.sin(midAngle) * 10000,
        };

        const hit = raySegmentIntersect(
          { from: origin, to: rayEnd },
          segStart,
          segEnd
        );

        if (hit.hit) {
          blockingInfos.push({
            surface,
            section: {
              startAngle: Math.max(
                normalizeAngle(section.startAngle),
                Math.min(startAngle, endAngle)
              ),
              endAngle: Math.min(
                normalizeAngle(section.endAngle),
                Math.max(startAngle, endAngle)
              ),
            },
            distance: Math.sqrt(distanceSquared(origin, hit.point)),
          });
        }
      }
    }
  }

  return blockingInfos;
}

/**
 * Check if two sections overlap.
 */
function sectionsOverlap(a: ConeSection, b: ConeSection): boolean {
  const aStart = normalizeAngle(a.startAngle);
  const aEnd = normalizeAngle(a.endAngle);
  const bStart = normalizeAngle(b.startAngle);
  const bEnd = normalizeAngle(b.endAngle);

  // Simple non-wrapping case
  if (aStart <= aEnd && bStart <= bEnd) {
    return !(aEnd < bStart || bEnd < aStart);
  }

  // For wrapping cases, check if any angle from one is in the other
  return (
    isAngleInSection(aStart, b) ||
    isAngleInSection(aEnd, b) ||
    isAngleInSection(bStart, a) ||
    isAngleInSection(bEnd, a)
  );
}

