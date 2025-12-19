import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";

/**
 * Collision detection result
 */
export interface CollisionResult {
  grounded: boolean;
  groundY?: number;
  hitCeiling: boolean;
  ceilingY?: number;
  hitLeftWall: boolean;
  leftWallX?: number;
  hitRightWall: boolean;
  rightWallX?: number;
}

const GROUND_CHECK_DISTANCE = 2; // Only detect when almost touching
const WALL_CHECK_DISTANCE = 2; // Only detect when almost touching
const CEILING_CHECK_DISTANCE = 2;
const PASSTHROUGH_CHECK_DISTANCE = 20; // Larger range to catch high-velocity pass-through

/**
 * Check for ground by casting rays downward
 */
function checkGroundDown(
  position: Vector2,
  halfWidth: number,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const feetY = position.y + halfHeight;
  const rayOffsets = [-halfWidth * 0.8, 0, halfWidth * 0.8];

  for (const offsetX of rayOffsets) {
    const rayOrigin = { x: position.x + offsetX, y: feetY };
    const groundRay = RayUtils.create(rayOrigin, { x: 0, y: 1 });

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(groundRay, surface.segment);

      if (hit.hit && hit.t <= GROUND_CHECK_DISTANCE && hit.t >= 0) {
        const normal = hit.normal;
        if (normal && normal.y < -0.5) {
          result.grounded = true;
          const groundY = hit.point?.y;
          if (groundY !== undefined) {
            if (result.groundY === undefined || groundY < result.groundY) {
              result.groundY = groundY;
            }
          }
        }
      }
    }
  }
}

/**
 * Check for ground above (in case we fell through floor)
 * Uses larger check distance to catch high-velocity pass-through
 */
function checkGroundUp(
  position: Vector2,
  halfWidth: number,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const feetY = position.y + halfHeight;
  const rayOffsets = [-halfWidth * 0.8, 0, halfWidth * 0.8];

  for (const offsetX of rayOffsets) {
    const rayOrigin = { x: position.x + offsetX, y: feetY };
    const groundRay = RayUtils.create(rayOrigin, { x: 0, y: -1 });

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(groundRay, surface.segment);

      // Use larger distance for pass-through detection
      if (hit.hit && hit.t <= PASSTHROUGH_CHECK_DISTANCE && hit.t >= 0) {
        const normal = hit.normal;
        if (normal && normal.y > 0.5) {
          result.grounded = true;
          const groundY = hit.point?.y;
          if (groundY !== undefined) {
            if (result.groundY === undefined || groundY < result.groundY) {
              result.groundY = groundY;
            }
          }
        }
      }
    }
  }
}

/**
 * Check for ceiling above player
 */
function checkCeiling(
  position: Vector2,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const headY = position.y - halfHeight;
  const ceilingRay = RayUtils.create({ x: position.x, y: headY }, { x: 0, y: -1 });

  for (const surface of surfaces) {
    const hit = raySegmentIntersect(ceilingRay, surface.segment);

    if (hit.hit && hit.t <= CEILING_CHECK_DISTANCE && hit.t >= 0) {
      const normal = hit.normal;
      if (normal && normal.y > 0.5) {
        result.hitCeiling = true;
        if (hit.point) {
          result.ceilingY = hit.point.y;
        }
        break;
      }
    }
  }
}

/**
 * Check for left wall (outward - wall is to the left of player)
 */
function checkLeftWallOutward(
  position: Vector2,
  halfWidth: number,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const leftX = position.x - halfWidth;
  const rayOffsets = [-halfHeight * 0.5, 0, halfHeight * 0.5];

  for (const offsetY of rayOffsets) {
    const rayOrigin = { x: leftX, y: position.y + offsetY };
    const wallRay = RayUtils.create(rayOrigin, { x: -1, y: 0 });

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(wallRay, surface.segment);

      if (hit.hit && hit.t <= WALL_CHECK_DISTANCE && hit.t >= 0) {
        const normal = hit.normal;
        if (normal && normal.x > 0.5) {
          result.hitLeftWall = true;
          if (hit.point) {
            if (result.leftWallX === undefined || hit.point.x > result.leftWallX) {
              result.leftWallX = hit.point.x;
            }
          }
        }
      }
    }
  }
}

/**
 * Check for vertical walls that the player's body overlaps with
 * This handles cases where the player moved through a wall in a single frame
 */
function checkWallOverlap(
  position: Vector2,
  halfWidth: number,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const leftEdge = position.x - halfWidth;
  const rightEdge = position.x + halfWidth;
  const topEdge = position.y - halfHeight;
  const bottomEdge = position.y + halfHeight;

  for (const surface of surfaces) {
    const seg = surface.segment;

    // Check if this is a vertical wall (both endpoints have same x)
    const isVertical = Math.abs(seg.start.x - seg.end.x) < 0.01;
    if (!isVertical) continue;

    const wallX = seg.start.x;

    // Check if wall Y range overlaps with player Y range
    const wallMinY = Math.min(seg.start.y, seg.end.y);
    const wallMaxY = Math.max(seg.start.y, seg.end.y);
    const yOverlap = topEdge < wallMaxY && bottomEdge > wallMinY;
    if (!yOverlap) continue;

    // Check if wall X is inside the player's body
    if (wallX > leftEdge && wallX < rightEdge) {
      // Wall is inside player - determine which direction to push
      const distToLeft = wallX - leftEdge;
      const distToRight = rightEdge - wallX;

      if (distToLeft < distToRight) {
        // Push player to the right of the wall
        result.hitLeftWall = true;
        if (result.leftWallX === undefined || wallX > result.leftWallX) {
          result.leftWallX = wallX;
        }
      } else {
        // Push player to the left of the wall
        result.hitRightWall = true;
        if (result.rightWallX === undefined || wallX < result.rightWallX) {
          result.rightWallX = wallX;
        }
      }
    }
  }
}

/**
 * Check for right wall (outward - wall is to the right of player)
 */
function checkRightWallOutward(
  position: Vector2,
  halfWidth: number,
  halfHeight: number,
  surfaces: readonly Surface[],
  result: CollisionResult
): void {
  const rightX = position.x + halfWidth;
  const rayOffsets = [-halfHeight * 0.5, 0, halfHeight * 0.5];

  for (const offsetY of rayOffsets) {
    const rayOrigin = { x: rightX, y: position.y + offsetY };
    const wallRay = RayUtils.create(rayOrigin, { x: 1, y: 0 });

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(wallRay, surface.segment);

      if (hit.hit && hit.t <= WALL_CHECK_DISTANCE && hit.t >= 0) {
        const normal = hit.normal;
        if (normal && normal.x < -0.5) {
          result.hitRightWall = true;
          if (hit.point) {
            if (result.rightWallX === undefined || hit.point.x < result.rightWallX) {
              result.rightWallX = hit.point.x;
            }
          }
        }
      }
    }
  }
}

/**
 * Check all collisions for a player-sized box
 *
 * @param position - Center position of player
 * @param velocity - Current velocity (for directional checks)
 * @param width - Player width
 * @param height - Player height
 * @param surfaces - All surfaces to check against
 * @returns CollisionResult with all collision information
 */
export function checkCollisions(
  position: Vector2,
  velocity: Vector2,
  width: number,
  height: number,
  surfaces: readonly Surface[]
): CollisionResult {
  const result: CollisionResult = {
    grounded: false,
    hitCeiling: false,
    hitLeftWall: false,
    hitRightWall: false,
  };

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Only check against non-plannable surfaces (walls)
  const collisionSurfaces = surfaces.filter((s) => !s.isPlannable());

  // Ground check - cast rays both downward and upward
  checkGroundDown(position, halfWidth, halfHeight, collisionSurfaces, result);

  // Check upward for floors we may have passed through (only if falling)
  if (velocity.y >= 0) {
    checkGroundUp(position, halfWidth, halfHeight, collisionSurfaces, result);
  }

  // Ceiling check - only when moving up
  if (velocity.y < 0) {
    checkCeiling(position, halfHeight, collisionSurfaces, result);
  }

  // Wall checks - only check outward when moving towards that wall
  if (velocity.x < 0) {
    checkLeftWallOutward(position, halfWidth, halfHeight, collisionSurfaces, result);
  }
  if (velocity.x > 0) {
    checkRightWallOutward(position, halfWidth, halfHeight, collisionSurfaces, result);
  }

  // Check for walls the player may have passed through (overlap detection)
  // This catches high-velocity pass-through regardless of current velocity
  checkWallOverlap(position, halfWidth, halfHeight, collisionSurfaces, result);

  return result;
}

/**
 * Simple point-in-bounds check
 */
export function isPointInBounds(point: Vector2, boundsMin: Vector2, boundsMax: Vector2): boolean {
  return (
    point.x >= boundsMin.x &&
    point.x <= boundsMax.x &&
    point.y >= boundsMin.y &&
    point.y <= boundsMax.y
  );
}
