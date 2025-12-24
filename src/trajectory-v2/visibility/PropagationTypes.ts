/**
 * PropagationTypes - Types for Section-Based Visibility Propagation
 *
 * These types support the analytical visibility algorithm that constructs
 * intermediate polygons at each propagation step through planned surfaces.
 *
 * Key Design Principles:
 * 1. Unified code path: Same buildVisibilityPolygon function used everywhere
 * 2. Intermediate polygons: N+1 polygons for N planned surfaces
 * 3. Exact calculations: Using rays, not angles (no floating-point precision loss)
 * 4. Cropping by window: Polygon intersection with triangle, not sampling
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Ray } from "@/trajectory-v2/geometry/RayCore";
import type { Surface } from "@/surfaces/Surface";

/**
 * Represents the "window" through which visibility passes at a planned surface.
 * The window is a triangle formed by:
 * 1. The current origin (player or reflected image)
 * 2. The surface segment start
 * 3. The surface segment end
 */
export interface VisibilityWindow {
  /** Ray from origin through surface start */
  readonly leftRay: Ray;
  /** Ray from origin through surface end */
  readonly rightRay: Ray;
  /** The planned surface forming the window */
  readonly surface: Surface;
  /** Origin point (for the window triangle) */
  readonly origin: Vector2;
}

/**
 * Result of a single propagation step.
 *
 * For an N-surface plan:
 * - Step 0: Full visibility from player (before any surface)
 * - Step 1: Visibility cropped by first window
 * - Step K: Visibility from Image[K-1], cropped by window K
 * - Step N: Final visibility polygon
 */
export interface PropagationStep {
  /** Step index (0 = initial, N = final for N surfaces) */
  readonly index: number;

  /** Origin for this step (player or reflected image) */
  readonly origin: Vector2;

  /** Visibility polygon at this step */
  readonly polygon: readonly Vector2[];

  /** Whether this polygon is valid (>= 3 vertices) */
  readonly isValid: boolean;

  /**
   * Window used to crop visibility (undefined for step 0).
   * The polygon at step K is the polygon at step K-1, cropped by this window.
   */
  readonly window?: VisibilityWindow;
}

/**
 * Complete result of visibility propagation through all planned surfaces.
 */
export interface PropagationResult {
  /**
   * All intermediate steps.
   * Length = plannedSurfaces.length + 1
   */
  readonly steps: readonly PropagationStep[];

  /**
   * The final visibility polygon (same as steps[N].polygon for N surfaces).
   */
  readonly finalPolygon: readonly Vector2[];

  /**
   * Whether the propagation is valid overall.
   * True if:
   * 1. No bypass detected (player on reflective side of all surfaces)
   * 2. Final polygon has at least 3 vertices
   */
  readonly isValid: boolean;

  /**
   * If a bypass was detected, which surface index triggered it.
   */
  readonly bypassAtSurface?: number;

  /**
   * The player position that was input.
   */
  readonly playerPosition: Vector2;

  /**
   * Final origin after all reflections (for rendering).
   */
  readonly finalOrigin: Vector2;
}

/**
 * Screen bounds for visibility calculation.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Configuration for propagation visualization.
 */
export interface PropagationRenderConfig {
  /** Alpha for the final polygon (most visible) */
  readonly finalPolygonAlpha: number;

  /** Base alpha for intermediate polygons (less visible) */
  readonly intermediateAlphaBase: number;

  /** Decay factor for each step back from final (0-1) */
  readonly intermediateAlphaDecay: number;

  /** Whether to render intermediate polygons at all */
  readonly showIntermediatePolygons: boolean;
}

/**
 * Default render configuration.
 */
export const DEFAULT_PROPAGATION_RENDER_CONFIG: PropagationRenderConfig = {
  finalPolygonAlpha: 0.5,
  intermediateAlphaBase: 0.15,
  intermediateAlphaDecay: 0.8,
  showIntermediatePolygons: true,
};

