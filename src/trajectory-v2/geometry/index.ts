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
export { lineLineIntersection } from "./GeometryOps";

// Unified ray casting
export {
  findClosestHit,
  findClosestHitInChains,
  castRay,
  castRayInChains,
  castRayToEndpoint,
  castRayToEndpointInChains,
  castContinuationRay,
  castContinuationRayForJunction,
  raycastForwardWithProvenance,
  raycastForwardInChains,
  castRayThroughWindow,
  extractSurfacesFromChains,
  toOriginPoint,
  toVector2Array,
  pointsEqual,
  type Segment,
  type ClosestHitResult,
  type RayHitResult,
  type RayCastOptions,
} from "./RayCasting";
