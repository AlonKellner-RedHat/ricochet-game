import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { ImageReflectionResult, Vector2 } from "@/types";

/**
 * ImageReflectionCalculator - Calculates trajectory using image reflection geometry
 *
 * First Principles:
 * The image reflection method is based on the principle that light (or an arrow)
 * reflecting off a mirror follows a path that appears to come from the "image"
 * of the source behind the mirror.
 *
 * For multiple reflections:
 * 1. Build a sequence of player images by reflecting forward through each surface
 * 2. Build a sequence of cursor images by reflecting backward through each surface
 * 3. Draw lines between corresponding images to find intersection points
 *
 * This guarantees the trajectory ends exactly at the cursor.
 *
 * NOTE: This calculator computes geometric trajectories. For bypass/validity logic,
 * see BypassChecker and PathBuilder which handle the runtime path building.
 */

// Re-export for backward compatibility
export type { ImageReflectionResult };

/**
 * Calculate trajectory through planned surfaces using image reflection
 *
 * @param player - Starting position
 * @param cursor - Target position (where trajectory should end)
 * @param plannedSurfaces - Ordered list of surfaces to bounce off
 * @returns Path points (does not include validity info - use PathBuilder for that)
 */
export function calculatePlannedTrajectory(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[]
): Vector2[] {
  const result = calculatePlannedTrajectoryWithValidation(player, cursor, plannedSurfaces);
  return result.path;
}

/**
 * Calculate trajectory with validation information
 *
 * NOTE: The hitOnSegment, isFullyAligned, and firstMissIndex fields are computed
 * geometrically but are DEPRECATED for runtime decisions. Use BypassChecker and
 * PathBuilder for proper runtime bypass/validity logic.
 */
export function calculatePlannedTrajectoryWithValidation(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[]
): ImageReflectionResult {
  if (plannedSurfaces.length === 0) {
    return {
      path: [player, cursor],
      hitOnSegment: [],
      isFullyAligned: true,
      firstMissIndex: -1,
    };
  }

  // Build player images (reflect forward through surfaces)
  const playerImages = buildPlayerImages(player, plannedSurfaces);

  // Build cursor images (reflect backward through surfaces)
  const cursorImages = buildCursorImages(cursor, plannedSurfaces);

  // Find intersection points between corresponding image pairs
  const hitPoints: Vector2[] = [];
  const hitOnSegment: boolean[] = [];
  let firstMissIndex = -1;

  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i];
    if (!surface) continue;

    const pImage = playerImages[i] ?? player;
    const cImage = cursorImages[i] ?? cursor;

    // Find intersection with the surface line
    const result = lineLineIntersectionWithParams(
      pImage,
      cImage,
      surface.segment.start,
      surface.segment.end
    );

    if (!result) {
      // Lines are parallel - use surface midpoint as fallback
      const midpoint = Vec2.scale(Vec2.add(surface.segment.start, surface.segment.end), 0.5);
      hitPoints.push(midpoint);
      hitOnSegment.push(false);
      if (firstMissIndex === -1) firstMissIndex = i;
      continue;
    }

    const { point, t, s } = result;

    // Check if hit is on the segment (s in [0,1]) and in forward direction (t in [0,1])
    const isOnSegment = s >= 0 && s <= 1;
    const isForward = t >= 0 && t <= 1;
    const isValid = isOnSegment && isForward;

    if (!isValid && firstMissIndex === -1) {
      firstMissIndex = i;
    }

    hitPoints.push(point);
    hitOnSegment.push(isValid);
  }

  return {
    path: [player, ...hitPoints, cursor],
    hitOnSegment,
    isFullyAligned: firstMissIndex === -1,
    firstMissIndex,
  };
}

/**
 * Build sequence of player images by reflecting forward through surfaces
 *
 * P[0] = player
 * P[1] = reflect(P[0], S1)
 * P[2] = reflect(P[1], S2)
 * ...
 */
export function buildPlayerImages(player: Vector2, surfaces: readonly Surface[]): Vector2[] {
  const images: Vector2[] = [player];

  let current = player;
  for (const surface of surfaces) {
    const reflected = Vec2.reflectPointThroughLine(
      current,
      surface.segment.start,
      surface.segment.end
    );
    images.push(reflected);
    current = reflected;
  }

  return images;
}

/**
 * Build sequence of cursor images by reflecting backward through surfaces
 *
 * C[n] = cursor
 * C[n-1] = reflect(C[n], Sn)
 * C[n-2] = reflect(C[n-1], S(n-1))
 * ...
 * C[0] = reflect(C[1], S1)
 */
export function buildCursorImages(cursor: Vector2, surfaces: readonly Surface[]): Vector2[] {
  const n = surfaces.length;
  const images: Vector2[] = new Array(n + 1);

  // Start with cursor at position n
  images[n] = cursor;

  // Reflect backwards through surfaces
  let current = cursor;
  for (let i = n - 1; i >= 0; i--) {
    const surface = surfaces[i];
    if (!surface) continue;

    const reflected = Vec2.reflectPointThroughLine(
      current,
      surface.segment.start,
      surface.segment.end
    );
    images[i] = reflected;
    current = reflected;
  }

  return images;
}

/**
 * Result of line-line intersection with parameters
 */
interface LineIntersectionResult {
  point: Vector2;
  t: number; // Parameter on first line (0-1 means between start and end)
  s: number; // Parameter on second line (0-1 means on segment)
}

/**
 * Find intersection point between two lines with full parameter information
 *
 * Line 1: P = A + t * (B - A)
 * Line 2: P = C + s * (D - C)
 *
 * @returns Intersection point and parameters, or null if parallel
 */
function lineLineIntersectionWithParams(
  line1Start: Vector2,
  line1End: Vector2,
  line2Start: Vector2,
  line2End: Vector2
): LineIntersectionResult | null {
  const d1 = Vec2.subtract(line1End, line1Start);
  const d2 = Vec2.subtract(line2End, line2Start);

  const cross = d1.x * d2.y - d1.y * d2.x;

  // Lines are parallel
  if (Math.abs(cross) < 0.0001) {
    return null;
  }

  const d3 = Vec2.subtract(line2Start, line1Start);

  // Parameter for first line (trajectory)
  const t = (d3.x * d2.y - d3.y * d2.x) / cross;

  // Parameter for second line (surface)
  const s = (d3.x * d1.y - d3.y * d1.x) / cross;

  // Calculate intersection point
  const point = Vec2.add(line1Start, Vec2.scale(d1, t));

  return { point, t, s };
}

/**
 * Find intersection point between two lines (ignoring segment bounds)
 *
 * @returns Intersection point or null if lines are parallel
 */
export function lineIntersection(
  line1Start: Vector2,
  line1End: Vector2,
  line2Start: Vector2,
  line2End: Vector2
): Vector2 | null {
  const result = lineLineIntersectionWithParams(line1Start, line1End, line2Start, line2End);
  return result?.point ?? null;
}
