/**
 * Engine Layer Exports
 *
 * UNIFIED ARCHITECTURE: All path calculations use image-based reflection
 * via ReflectionCache and RayPropagator for consistency with visibility system.
 */
export * from "./types";
export * from "./ITrajectoryEngine";
export * from "./ImageCache";
export * from "./ValidityChecker";
export * from "./TrajectoryEngine";
export * from "./SurfaceState";
export * from "./BypassEvaluator";

// Unified Two-Path Architecture
export * from "./ActualPathCalculator";
export * from "./PlannedPathCalculator";
export * from "./DivergenceDetector";
export * from "./DualPathRenderer";
export * from "./SimpleTrajectoryCalculator";

// Unified ray propagation
export * from "./TracePath";
export * from "./RayPropagator";
