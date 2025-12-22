import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";

/**
 * Reasons why a surface should be bypassed
 */
export enum BypassReason {
  None = "none",
  PlayerOnWrongSide = "player_on_wrong_side",
  ReflectionOnWrongSide = "reflection_on_wrong_side",
  Obstructed = "obstructed",
  CursorOnWrongSide = "cursor_on_wrong_side",
  Exhausted = "exhausted",
}

/**
 * Result of a bypass check
 */
export interface BypassResult {
  readonly shouldBypass: boolean;
  readonly reason: BypassReason;
  readonly obstructingSurface?: Surface;
}

/**
 * Parameters for the combined bypass check
 */
export interface BypassCheckParams {
  readonly surface: Surface;
  readonly player: Vector2;
  readonly cursor: Vector2;
  readonly currentPoint: Vector2;
  readonly currentDistance: number;
  readonly exhaustionLimit: number;
  readonly allSurfaces: readonly Surface[];
  readonly isLastSurface: boolean;
  readonly nextSurface: Surface | null;
  readonly reflectionPoint?: Vector2;
}

const NO_BYPASS: BypassResult = { shouldBypass: false, reason: BypassReason.None };

/**
 * BypassChecker - Determines when a planned surface should be bypassed
 *
 * First Principles:
 * A surface should be bypassed (temporarily skipped) when the arrow cannot
 * physically use it for reflection. This happens when:
 * 1. Player is on the blocking side of the surface
 * 2. The reflection point would be on the wrong side of the next surface
 * 3. There's an obstruction between current position and the surface
 * 4. The cursor is on the wrong side of the last surface
 * 5. The arrow has traveled too far (exhausted)
 */
export class BypassChecker {
  /**
   * Check if player is on the reflective side of the surface
   * Rule 1: Player on wrong side → bypass
   */
  checkPlayerSide(player: Vector2, surface: Surface): BypassResult {
    const normal = surface.getNormal();
    const toPlayer = Vec2.subtract(player, surface.segment.start);
    const dotProduct = Vec2.dot(toPlayer, normal);

    // Player should be on the normal side (positive dot product)
    // to approach from the reflective side
    if (dotProduct < 0) {
      return { shouldBypass: true, reason: BypassReason.PlayerOnWrongSide };
    }

    return NO_BYPASS;
  }

  /**
   * Check if the reflection point can reach the next surface from its reflective side
   * Rule 2: Reflection point on wrong side of next surface → bypass next
   */
  checkReflectionReachesNext(
    reflectionPoint: Vector2,
    _currentSurface: Surface,
    nextSurface: Surface
  ): BypassResult {
    const normal = nextSurface.getNormal();
    const toReflection = Vec2.subtract(reflectionPoint, nextSurface.segment.start);
    const dotProduct = Vec2.dot(toReflection, normal);

    // Reflection point should be on the normal side to approach next surface correctly
    if (dotProduct < 0) {
      return { shouldBypass: true, reason: BypassReason.ReflectionOnWrongSide };
    }

    return NO_BYPASS;
  }

  /**
   * Check if there's an obstruction between current point and target
   * Rule 3: Obstruction → bypass
   */
  checkObstruction(
    currentPoint: Vector2,
    targetPoint: Vector2,
    targetSurface: Surface,
    allSurfaces: readonly Surface[]
  ): BypassResult {
    const direction = Vec2.direction(currentPoint, targetPoint);
    const distance = Vec2.distance(currentPoint, targetPoint);

    if (distance < 0.001) return NO_BYPASS;

    const ray = RayUtils.create(currentPoint, direction);

    for (const surface of allSurfaces) {
      // Don't check against the target surface itself
      if (surface.id === targetSurface.id) continue;

      const hit = raySegmentIntersect(ray, surface.segment);

      // Check if hit is between current point and target
      if (hit.hit && hit.t > 0.001 && hit.t < distance - 0.001) {
        // Check if this surface blocks the path
        // Walls always block
        if (!surface.isPlannable()) {
          return {
            shouldBypass: true,
            reason: BypassReason.Obstructed,
            obstructingSurface: surface,
          };
        }

        // Ricochet surfaces block if approached from wrong side
        if (!surface.canReflectFrom(direction)) {
          return {
            shouldBypass: true,
            reason: BypassReason.Obstructed,
            obstructingSurface: surface,
          };
        }
      }
    }

    return NO_BYPASS;
  }

  /**
   * Check if cursor is on correct side for reflection off the last surface
   * Rule 4: Cursor on wrong side → bypass
   *
   * For a reflection to work, the cursor needs to be reachable after the bounce.
   * The cursor should be on the same side as the player (normal side) for the
   * arrow to bounce back toward it.
   */
  checkCursorSide(cursor: Vector2, surface: Surface): BypassResult {
    const normal = surface.getNormal();
    const toCursor = Vec2.subtract(cursor, surface.segment.start);
    const dotProduct = Vec2.dot(toCursor, normal);

    // Cursor should be on the normal side (where reflections go)
    if (dotProduct < 0) {
      return { shouldBypass: true, reason: BypassReason.CursorOnWrongSide };
    }

    return NO_BYPASS;
  }

  /**
   * Check if path length has exceeded the exhaustion limit
   * Rule 5: Exhausted → bypass (treat all remaining as obstructions)
   */
  checkExhaustion(currentDistance: number, exhaustionLimit: number): BypassResult {
    if (currentDistance >= exhaustionLimit) {
      return { shouldBypass: true, reason: BypassReason.Exhausted };
    }

    return NO_BYPASS;
  }

  /**
   * Combined check - applies all rules in order and returns first bypass reason
   */
  shouldBypassSurface(params: BypassCheckParams): BypassResult {
    const {
      surface,
      player,
      cursor,
      currentPoint,
      currentDistance,
      exhaustionLimit,
      allSurfaces,
      isLastSurface,
      nextSurface,
      reflectionPoint,
    } = params;

    // Rule 5: Check exhaustion first (stops all reflections)
    const exhaustionResult = this.checkExhaustion(currentDistance, exhaustionLimit);
    if (exhaustionResult.shouldBypass) return exhaustionResult;

    // Rule 1: Check if starting point (player or previous reflection) is on wrong side
    const sideResult = this.checkPlayerSide(currentPoint, surface);
    if (sideResult.shouldBypass) return sideResult;

    // Rule 4: For last surface, check cursor side
    if (isLastSurface) {
      const cursorResult = this.checkCursorSide(cursor, surface);
      if (cursorResult.shouldBypass) return cursorResult;
    }

    // Rule 2: Check if reflection point can reach next surface (if applicable)
    if (reflectionPoint && nextSurface) {
      const nextResult = this.checkReflectionReachesNext(reflectionPoint, surface, nextSurface);
      if (nextResult.shouldBypass) return nextResult;
    }

    // Rule 3: Check for obstructions (need to calculate reflection point first)
    // This is a simplified check - full obstruction detection happens during path building
    // For now, we assume the target point is the surface midpoint
    const surfaceMidpoint = Vec2.scale(
      Vec2.add(surface.segment.start, surface.segment.end),
      0.5
    );
    const obstructionResult = this.checkObstruction(
      currentPoint,
      surfaceMidpoint,
      surface,
      allSurfaces
    );
    if (obstructionResult.shouldBypass) return obstructionResult;

    return NO_BYPASS;
  }
}

