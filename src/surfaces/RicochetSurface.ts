import { Segment } from "@/math/Segment";
import { Vec2 } from "@/math/Vec2";
import type { HitResult, LineSegment, SurfaceVisualProperties, Vector2 } from "@/types";
import type { Surface } from "./Surface";

/**
 * RicochetSurface - A surface that reflects arrows
 */
export class RicochetSurface implements Surface {
  readonly id: string;
  readonly segment: LineSegment;
  readonly surfaceType = "ricochet";

  constructor(id: string, segment: LineSegment) {
    this.id = id;
    this.segment = segment;
  }

  onArrowHit(_hitPoint: Vector2, velocity: Vector2): HitResult {
    // Get surface normal (pointing toward the incoming arrow)
    let normal = Segment.normal(this.segment);

    // Ensure normal points toward incoming direction
    if (Vec2.dot(normal, velocity) > 0) {
      normal = Vec2.scale(normal, -1);
    }

    // Calculate reflected direction
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
