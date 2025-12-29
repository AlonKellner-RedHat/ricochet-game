/**
 * Visibility Module - Ray-casting visibility for valid cursor region highlighting
 *
 * PRIMARY EXPORTS (use these):
 * - AnalyticalPropagation: Unified visibility polygon construction (buildVisibilityPolygon, propagateWithIntermediates)
 * - PropagationTypes: Type definitions for propagation results
 * - ValidRegionRenderer: Dark overlay rendering with visibility cutout
 * - VisibilityFromChain: ImageChain-derived visibility utilities
 *
 * DEPRECATED EXPORTS (for backward compatibility only):
 * - SimpleVisibilityCalculator: Deprecated, use AnalyticalPropagation
 * - RayBasedVisibility: Deprecated, use AnalyticalPropagation
 * - SectionPropagator: Deprecated, use AnalyticalPropagation
 * - ConeSection: Deprecated legacy module
 * - ConePropagator: Deprecated legacy module
 * - OutlineBuilder: Deprecated legacy module
 */

// =============================================================================
// PRIMARY EXPORTS - New Analytical Algorithm (use these)
// =============================================================================

export * from "./AnalyticalPropagation";
export * from "./PropagationTypes";
export * from "./ValidRegionRenderer";
export * from "./VisibilityFromChain";
export * from "./RaySector";
export * from "./WindowConfig";

// =============================================================================
// DEPRECATED EXPORTS - Legacy Modules (for backward compatibility only)
// =============================================================================

/** @deprecated Use AnalyticalPropagation instead */
export * from "./SimpleVisibilityCalculator";

/** @deprecated Use AnalyticalPropagation instead */
export * from "./RayBasedVisibility";

/** @deprecated Use AnalyticalPropagation instead */
export * from "./SectionPropagator";

/** @deprecated Legacy module, no longer maintained */
export * from "./ConeSection";

/** @deprecated Legacy module, no longer maintained */
export * from "./ConePropagator";

/** @deprecated Legacy module, no longer maintained */
export * from "./OutlineBuilder";

