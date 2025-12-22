import { Segment } from "@/math/Segment";
import type { HitResult, LineSegment, SurfaceVisualProperties, Vector2 } from "@/types";
import type { Surface } from "./Surface";

/**
 * WallSurface - A surface that stops arrows (they stick to it)
 *
 * Walls never reflect arrows regardless of approach direction.
 */
export class WallSurface implements Surface {
  readonly id: string;
  readonly segment: LineSegment;
  readonly surfaceType = "wall";

  constructor(id: string, segment: LineSegment) {
    this.id = id;
    this.segment = segment;
  }

  /**
   * Get the normal vector for this surface.
   * For walls, this is purely informational as they never reflect.
   */
  getNormal(): Vector2 {
    return Segment.normal(this.segment);
  }

  /**
   * Walls cannot reflect from any direction.
   * @param _incomingDirection - Ignored, walls always block
   * @returns Always false - walls never reflect
   */
  canReflectFrom(_incomingDirection: Vector2): boolean {
    return false;
  }

  onArrowHit(_hitPoint: Vector2, _velocity: Vector2): HitResult {
    return {
      type: "stick",
    };
  }

  isPlannable(): boolean {
    return false;
  }

  getVisualProperties(): SurfaceVisualProperties {
    return {
      color: 0x666666, // Gray
      lineWidth: 4,
      alpha: 1.0,
      glow: false,
    };
  }
}
