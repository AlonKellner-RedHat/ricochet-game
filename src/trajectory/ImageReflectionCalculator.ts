import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";

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
 */

/**
 * Calculate trajectory through planned surfaces using image reflection
 *
 * @param player - Starting position
 * @param cursor - Target position (where trajectory should end)
 * @param plannedSurfaces - Ordered list of surfaces to bounce off
 * @returns Array of points: [player, hit1, hit2, ..., cursor]
 */
export function calculatePlannedTrajectory(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[]
): Vector2[] {
  if (plannedSurfaces.length === 0) {
    return [player, cursor];
  }

  // Build player images (reflect forward through surfaces)
  const playerImages = buildPlayerImages(player, plannedSurfaces);

  // Build cursor images (reflect backward through surfaces)
  const cursorImages = buildCursorImages(cursor, plannedSurfaces);

  // Find intersection points between corresponding image pairs
  const hitPoints: Vector2[] = [];

  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i];
    if (!surface) continue;

    // Line from playerImages[i] to cursorImages[i] should intersect surface[i]
    const hit = lineSegmentIntersection(
      playerImages[i] ?? player,
      cursorImages[i] ?? cursor,
      surface.segment.start,
      surface.segment.end
    );

    if (hit) {
      hitPoints.push(hit);
    }
  }

  return [player, ...hitPoints, cursor];
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
 * Find intersection point between a line (defined by two points) and a segment
 *
 * First principles: Use parametric form of lines
 * Line 1: P = A + t * (B - A)
 * Line 2: P = C + s * (D - C)
 *
 * Solving for intersection gives us parameters t and s.
 * If 0 <= s <= 1, the intersection is on the segment.
 */
function lineSegmentIntersection(
  lineStart: Vector2,
  lineEnd: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): Vector2 | null {
  const d1 = Vec2.subtract(lineEnd, lineStart);
  const d2 = Vec2.subtract(segEnd, segStart);

  const cross = d1.x * d2.y - d1.y * d2.x;

  // Lines are parallel
  if (Math.abs(cross) < 0.0001) {
    return null;
  }

  const d3 = Vec2.subtract(segStart, lineStart);

  // Parameter for line
  // const t = (d3.x * d2.y - d3.y * d2.x) / cross;

  // Parameter for segment
  const s = (d3.x * d1.y - d3.y * d1.x) / cross;

  // Check if intersection is on the segment
  if (s < 0 || s > 1) {
    return null;
  }

  // Calculate intersection point using segment parameter
  return Vec2.add(segStart, Vec2.scale(d2, s));
}
