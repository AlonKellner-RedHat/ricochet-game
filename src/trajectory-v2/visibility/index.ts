/**
 * Visibility Module - Ray-casting visibility for valid cursor region highlighting
 *
 * Exports:
 * - SimpleVisibilityCalculator: Main visibility algorithm (new)
 * - ValidRegionRenderer: Dark overlay rendering
 * - VisibilityFromChain: ImageChain-derived visibility
 *
 * Legacy exports (deprecated, used by tests):
 * - ConeSection: Angular sector operations
 * - ConePropagator: Old propagation algorithm
 * - OutlineBuilder: Old polygon construction
 */

// New visibility system
export * from "./SimpleVisibilityCalculator";
export * from "./ValidRegionRenderer";
export * from "./VisibilityFromChain";

// Legacy (kept for test compatibility, to be removed)
export * from "./ConeSection";
export * from "./ConePropagator";
export * from "./OutlineBuilder";

