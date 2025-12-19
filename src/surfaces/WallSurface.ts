import type { HitResult, LineSegment, SurfaceVisualProperties, Vector2 } from "@/types";
import type { Surface } from "./Surface";

/**
 * WallSurface - A surface that stops arrows (they stick to it)
 */
export class WallSurface implements Surface {
  readonly id: string;
  readonly segment: LineSegment;
  readonly surfaceType = "wall";

  constructor(id: string, segment: LineSegment) {
    this.id = id;
    this.segment = segment;
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
