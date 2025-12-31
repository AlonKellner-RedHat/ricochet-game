/**
 * PlannedPathCalculator - Calculates the ideal planned trajectory
 *
 * FIRST PRINCIPLES (from principles-audit.md):
 * - B2: Uses bidirectional images for direction calculation
 * - B5: Ignores obstructions (only receives planned surfaces)
 * - B8: Reflects even when intersection is off-segment
 *
 * DESIGN PRINCIPLE: This is an INDEPENDENT calculation.
 * The planned path shows what would happen if all reflections worked.
 * It has NO knowledge of obstructions or actual physics.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import {
  buildBackwardImages,
  buildForwardImages,
  getCursorImageForSurface,
  getPlayerImageForSurface,
} from "./ImageCache";

/**
 * Information about a planned surface interaction.
 */
export interface PlannedHit {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was intersected */
  readonly surface: Surface;
  /** Whether the hit is on the actual segment (vs extended line) */
  readonly onSegment: boolean;
}

/**
 * The complete planned trajectory path.
 *
 * DESIGN PRINCIPLE: Calculated independently of actual path.
 * Shows the "ideal" trajectory if all reflections worked.
 */
export interface PlannedPath {
  /** Waypoints from player to cursor */
  readonly waypoints: readonly Vector2[];
  /** Information about each surface interaction */
  readonly hits: readonly PlannedHit[];
  /** Index of segment containing cursor (0-based) */
  readonly cursorIndex: number;
  /** Parametric position of cursor within segment (0-1) */
  readonly cursorT: number;
}

/**
 * Check if a parametric value is on the segment [0, 1].
 * EXACT check.
 */
function isOnSegment(t: number): boolean {
  return t >= 0 && t <= 1;
}

/**
 * Get parametric position of a point along a segment.
 */
function getParametricT(point: Vector2, start: Vector2, end: Vector2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    return 0;
  }

  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2;
  return t;
}

/**
 * Calculate the planned trajectory path using bidirectional images.
 *
 * FIRST PRINCIPLES:
 * - B2: Uses cursor images reflected through surfaces (backward)
 * - B5: Only receives planned surfaces (obstructions ignored by design)
 * - B8: Uses extended line intersection (not segment-only)
 *
 * For each surface i:
 *   - Ray from P_i (player image at depth i) to C_{n-i} (cursor image)
 *   - Intersect with EXTENDED line of surface
 *   - Mark whether intersection is on-segment
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param activeSurfaces Active planned surfaces (already bypass-filtered)
 * @returns PlannedPath with waypoints and hit info
 */
export function calculatePlannedPath(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: readonly Surface[]
): PlannedPath {
  // Degenerate case: player at cursor
  const dx = cursor.x - player.x;
  const dy = cursor.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.1) {
    return {
      waypoints: [player],
      hits: [],
      cursorIndex: 0,
      cursorT: 0,
    };
  }

  // No surfaces: direct path
  if (activeSurfaces.length === 0) {
    return {
      waypoints: [player, cursor],
      hits: [],
      cursorIndex: 0,
      cursorT: 1,
    };
  }

  // Build image sequences
  const playerImages = buildForwardImages(player, activeSurfaces);
  const cursorImages = buildBackwardImages(cursor, activeSurfaces);

  const waypoints: Vector2[] = [player];
  const hits: PlannedHit[] = [];

  // For each surface, find intersection using bidirectional images
  for (let i = 0; i < activeSurfaces.length; i++) {
    const surface = activeSurfaces[i]!;
    const segment = surface.segment;

    // Get images for this surface
    // P_i = player image at depth i (0 = original player)
    // C_{n-i} = cursor image at depth n-i
    const playerImage = getPlayerImageForSurface(playerImages, i);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, i);

    // Find intersection with EXTENDED line
    const intersection = lineLineIntersection(
      playerImage,
      cursorImage,
      segment.start,
      segment.end
    );

    if (!intersection.valid) {
      // Lines are parallel - use segment midpoint as fallback
      const midpoint = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2,
      };
      waypoints.push(midpoint);
      hits.push({
        point: midpoint,
        surface,
        onSegment: true,
      });
      continue;
    }

    const hitPoint = intersection.point;

    // Check if hit is on the actual segment
    const segmentT = getParametricT(hitPoint, segment.start, segment.end);
    const onSegment = isOnSegment(segmentT);

    waypoints.push(hitPoint);
    hits.push({
      point: hitPoint,
      surface,
      onSegment,
    });
  }

  // Add cursor as final waypoint
  waypoints.push(cursor);

  // Calculate cursor position info
  // Cursor is at the end of the last segment
  const cursorIndex = waypoints.length - 2; // Index of segment containing cursor
  const cursorT = 1; // At end of segment

  return {
    waypoints,
    hits,
    cursorIndex,
    cursorT,
  };
}

