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

// Re-export individual assertions for direct access
export * from "./bypass";
export * from "./pathCalculation";
export * from "./physics";
export * from "./visualization";

/**
 * ALL first principle assertions.
 * Every test setup will be tested against each of these.
 */
export const ALL_ASSERTIONS = [
  ...visualizationAssertions,
  ...physicsAssertions,
  ...pathCalculationAssertions,
  ...bypassAssertions,
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

