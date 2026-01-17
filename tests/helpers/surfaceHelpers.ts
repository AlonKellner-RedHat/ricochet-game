/**
 * Test helpers for creating mock Surface instances.
 *
 * These helpers allow tests to create minimal Surface implementations
 * without needing the full production Surface classes.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2, HitResult, SurfaceVisualProperties } from "@/types";

export interface MockSurfaceOptions {
  /** Whether the surface can reflect arrows (default: true) */
  canReflect?: boolean;
  /** Whether the surface is plannable (default: true) */
  plannable?: boolean;
  /** Surface type identifier (default: "ricochet") */
  surfaceType?: string;
}

/**
 * Create a mock Surface for testing.
 *
 * @param id Unique identifier for the surface
 * @param start Start point of the segment
 * @param end End point of the segment
 * @param options Optional configuration
 * @returns A mock Surface instance
 */
export function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  options: MockSurfaceOptions = {}
): Surface {
  const { canReflect = true, plannable = true, surfaceType = "ricochet" } = options;

  // Calculate normal (perpendicular to segment, pointing "left" when facing from start to end)
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normal: Vector2 = len > 0 ? { x: -dy / len, y: dx / len } : { x: 0, y: 1 };

  return {
    id,
    segment: { start, end },
    surfaceType,

    onArrowHit(_hitPoint: Vector2, velocity: Vector2): HitResult {
      if (!canReflect) {
        return { type: "stick" };
      }

      // Reflect velocity
      const dot = velocity.x * normal.x + velocity.y * normal.y;
      return {
        type: "reflect",
        reflectedDirection: {
          x: velocity.x - 2 * dot * normal.x,
          y: velocity.y - 2 * dot * normal.y,
        },
      };
    },

    isPlannable(): boolean {
      return plannable;
    },

    getVisualProperties(): SurfaceVisualProperties {
      return {
        color: 0xffffff,
        lineWidth: 2,
        alpha: 1,
      };
    },

    getNormal(): Vector2 {
      return normal;
    },

    canReflectFrom(incomingDirection: Vector2): boolean {
      if (!canReflect) {
        return false;
      }
      // Check if incoming direction is toward the front side (opposite to normal)
      const dot = incomingDirection.x * normal.x + incomingDirection.y * normal.y;
      // Incoming direction should be opposite to normal for reflection
      return dot < 0;
    },
  };
}

/**
 * Create a mock wall surface (non-reflective, non-plannable).
 */
export function createMockWall(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return createMockSurface(id, start, end, {
    canReflect: false,
    plannable: false,
    surfaceType: "wall",
  });
}

/**
 * Create a mock bidirectional surface (reflects from both sides).
 */
export function createMockBidirectionalSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  const surface = createMockSurface(id, start, end);

  // Override canReflectFrom to always return true
  return {
    ...surface,
    canReflectFrom(_incomingDirection: Vector2): boolean {
      return true;
    },
  };
}
