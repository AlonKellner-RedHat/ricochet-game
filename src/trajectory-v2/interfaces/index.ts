/**
 * Strategy Interfaces for Trajectory and Visibility
 *
 * These interfaces enable the Strategy pattern for swapping between
 * different calculation implementations (angle-based, ray-based, etc.)
 */

export type {
  IVisibilityCalculator,
  VisibilityResult,
  ScreenBounds,
} from "./IVisibilityCalculator";

export type {
  IPathCalculator,
  PathCalculationResult,
  PathHitInfo,
  AlignmentCheckResult,
} from "./IPathCalculator";

