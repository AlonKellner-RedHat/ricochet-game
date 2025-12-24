/**
 * PropagationTypes - Types for Section-Based Visibility Propagation
 *
 * These types support the analytical visibility algorithm that constructs
 * visibility polygons at each propagation step through planned surfaces.
 *
 * Key Design Principles:
 * 1. Unified code path: Same buildVisibilityPolygon function used everywhere
 * 2. Valid polygons (N+1): Full visibility from each origin, NOT cropped
 * 3. Planned polygons (N): Cropped paths to reach each surface
 * 4. Exact calculations: Using rays, not angles (no floating-point precision loss)
 * 5. Cropping by window: Polygon intersection with triangle, not sampling
 *
 * Definitions:
 * - valid[K] = visibility from ImageK (player reflected through surfaces 0..K-1)
 * - planned[K] = valid[K] cropped by window to surface K
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
 * A valid polygon step - full visibility from an origin.
 *
 * Valid polygons are NOT cropped. They represent full visibility from:
 * - valid[0]: Player position (empty plan visibility)
 * - valid[K]: ImageK position (player reflected through surfaces 0..K-1)
 *
 * For N surfaces, there are N+1 valid polygons.
 */
export interface ValidPolygonStep {
  /** Step index (0 = player, K = after K reflections) */
  readonly index: number;

  /** Origin for this step (player or reflected image) */
  readonly origin: Vector2;

  /** Full visibility polygon from this origin (NOT cropped) */
  readonly polygon: readonly Vector2[];

  /** Whether this polygon is valid (>= 3 vertices) */
  readonly isValid: boolean;
}

/**
 * A planned polygon step - cropped paths to reach a surface.
 *
 * Planned polygons ARE cropped. They represent:
 * - planned[K] = valid[K] cropped by window triangle to surface K
 *
 * For N surfaces, there are N planned polygons.
 */
export interface PlannedPolygonStep {
  /** Step index (0 to N-1, targeting surface K) */
  readonly index: number;

  /** Origin for this step (same as valid[K].origin) */
  readonly origin: Vector2;

  /** Cropped polygon (valid[K] cropped by window to surface K) */
  readonly polygon: readonly Vector2[];

  /** Whether this polygon is valid (>= 3 vertices) */
  readonly isValid: boolean;

  /** The window used for cropping */
  readonly window: VisibilityWindow;

  /** The target surface this planned polygon reaches */
  readonly targetSurface: Surface;
}

/**
 * Result of a single propagation step (legacy, kept for compatibility).
 * @deprecated Use ValidPolygonStep and PlannedPolygonStep instead.
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
   * Valid polygons - full visibility from each origin (NOT cropped).
   * Length = N + 1 for N planned surfaces.
   *
   * - valid[0]: Full visibility from player
   * - valid[K]: Full visibility from ImageK (after K reflections)
   * - valid[N]: The final polygon to visualize
   */
  readonly validPolygons: readonly ValidPolygonStep[];

  /**
   * Planned polygons - cropped paths to reach each surface.
   * Length = N for N planned surfaces.
   *
   * - planned[K]: valid[K] cropped by window to surface K
   */
  readonly plannedPolygons: readonly PlannedPolygonStep[];

  /**
   * Legacy: All intermediate steps (for compatibility).
   * @deprecated Use validPolygons and plannedPolygons instead.
   */
  readonly steps: readonly PropagationStep[];

  /**
   * The final visibility polygon (same as validPolygons[N].polygon for N surfaces).
   * This is the polygon that should be visualized.
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

