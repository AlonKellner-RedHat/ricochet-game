import type { HitResult, LineSegment, SurfaceVisualProperties, Vector2 } from "@/types";

/**
 * Surface interface - base contract for all surface types
 * Follows OCP: new surface types extend this interface without modifying core code
 */
export interface Surface {
  /** Unique identifier for this surface */
  readonly id: string;

  /** The line segment defining this surface's geometry */
  readonly segment: LineSegment;

  /** Type identifier for serialization */
  readonly surfaceType: string;

  /**
   * Called when an arrow hits this surface
   * @param hitPoint - The point of impact
   * @param velocity - The arrow's velocity at impact
   * @returns HitResult describing what happens to the arrow
   */
  onArrowHit(hitPoint: Vector2, velocity: Vector2): HitResult;

  /**
   * Whether this surface can be part of a shot plan
   * (i.e., can the player click on it to add to their ricochet sequence)
   */
  isPlannable(): boolean;

  /**
   * Get visual properties for rendering this surface
   */
  getVisualProperties(): SurfaceVisualProperties;
}
