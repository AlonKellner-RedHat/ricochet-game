/**
 * First Principle Assertions Index
 *
 * Exports all assertions that will be tested against every setup.
 * To add a new assertion:
 * 1. Create the assertion in the appropriate file (visualization.ts, physics.ts, etc.)
 * 2. Add it to the appropriate exports array
 * 3. It will automatically be tested against ALL setups
 */

import { bypassAssertions } from "./bypass";
import { pathCalculationAssertions } from "./pathCalculation";
import { physicsAssertions } from "./physics";
import { visualizationAssertions } from "./visualization";
import { visibilityLightingAssertions } from "./visibility-lighting";

// Re-export individual assertions for direct access
export * from "./bypass";
export * from "./pathCalculation";
export * from "./physics";
export * from "./visualization";
export * from "./visibility-lighting";

/**
 * ALL first principle assertions.
 * Every test setup will be tested against each of these.
 *
 * Note: Visibility assertions (V.1-V.3) are run separately in
 * VisibilityFirstPrinciples.test.ts as they require specific
 * geometric setups and are still being refined.
 */
export const ALL_ASSERTIONS = [
  ...visualizationAssertions,
  ...physicsAssertions,
  ...pathCalculationAssertions,
  ...bypassAssertions,
  // visibilityLightingAssertions are run separately in dedicated tests
] as const;

/**
 * Get an assertion by ID.
 */
export function getAssertionById(id: string) {
  return ALL_ASSERTIONS.find((a) => a.id === id);
}

/**
 * Get assertions by principle number.
 */
export function getAssertionsByPrinciple(principle: string) {
  return ALL_ASSERTIONS.filter((a) => a.principle.startsWith(principle));
}

