import { Segment } from "@/math/Segment";
import { Vec2 } from "@/math/Vec2";
import type { HitResult, LineSegment, SurfaceVisualProperties, Vector2 } from "@/types";
import type { Surface } from "./Surface";

/**
 * RicochetSurface - A surface that reflects arrows from one side only
 *
 * Directional behavior:
 * - The normal vector defines the "front" (reflective) side
 * - Arrows approaching from the front (dot product < 0) can reflect
 * - Arrows approaching from the back (dot product > 0) are blocked
 */
export class RicochetSurface implements Surface {
  readonly id: string;
  readonly segment: LineSegment;
  readonly surfaceType = "ricochet";

  constructor(id: string, segment: LineSegment) {
    this.id = id;
    this.segment = segment;
  }

  /**
   * Get the normal vector for this surface.
   * The normal points "left" when looking from segment.start to segment.end.
   * This is the "front" (reflective) side of the surface.
   */
  getNormal(): Vector2 {
    return Segment.normal(this.segment);
  }

  /**
   * Check if an arrow can reflect off this surface from the given direction.
   * Reflection only occurs when approaching from the front side.
   *
   * @param incomingDirection - The direction the arrow is traveling
   * @returns true if approaching from front (can reflect), false if from back (blocked)
   */
  canReflectFrom(incomingDirection: Vector2): boolean {
    const normal = this.getNormal();
    // Approaching from front means incoming direction is opposite to normal
    // dot(incoming, normal) < 0 means they point in opposite directions
    return Vec2.dot(incomingDirection, normal) < 0;
  }

  onArrowHit(_hitPoint: Vector2, velocity: Vector2): HitResult {
    // Check if approaching from the reflective side
    if (!this.canReflectFrom(velocity)) {
      // Arrow hit from the back - block it (stick)
      return {
        type: "stick",
      };
    }

    // Arrow hit from the front - reflect it
    const normal = this.getNormal();
    const reflectedDirection = Vec2.reflect(velocity, normal);

    return {
      type: "reflect",
      reflectedDirection,
    };
  }

  isPlannable(): boolean {
    return true;
  }

  getVisualProperties(): SurfaceVisualProperties {
    return {
      color: 0x00ffff, // Cyan
      lineWidth: 3,
      alpha: 1.0,
      glow: true,
    };
  }
}
