/**
 * Geometry Module Exports
 *
 * Source-of-Truth geometry types and utilities.
 */

// Core types
export * from "./types";

// Source-of-Truth point types
export {
  SourcePoint,
  OriginPoint,
  Endpoint,
  HitPoint,
  isEndpoint,
  isHitPoint,
  isOriginPoint,
  isScreenBoundary,
  startOf,
  endOf,
  endpointsOf,
} from "./SourcePoint";

// Screen boundaries as surfaces
export {
  createScreenBoundaries,
  isScreenBoundarySurface,
  getScreenCorners,
  type ScreenBoundsConfig,
  type ScreenBoundaries,
} from "./ScreenBoundaries";

// Geometry operations
export { lineLineIntersection, getRayToSegmentHit } from "./GeometryOps";
