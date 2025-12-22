/**
 * Test Setups Index
 *
 * Exports all test setups that will be tested against every assertion.
 * To add a new setup:
 * 1. Create the setup in the appropriate file
 * 2. Add it to the appropriate exports array
 * 3. It will automatically be tested against ALL assertions
 */

import { bypassSetups } from "./bypassScenarios";
import { edgeCaseSetups } from "./edgeCases";
import { emptySceneSetups } from "./emptyScene";
import { generatedSetups } from "./generated";
import { multipleSurfaceSetups } from "./multipleSurfaces";
import { obstacleSetups } from "./obstacles";
import { singleSurfaceSetups } from "./singleSurface";

// Re-export individual setups for direct access
export * from "./bypassScenarios";
export * from "./edgeCases";
export * from "./emptyScene";
export * from "./generated";
export * from "./multipleSurfaces";
export * from "./obstacles";
export * from "./singleSurface";

/**
 * All manually created setups.
 */
export const MANUAL_SETUPS = [
  ...emptySceneSetups,
  ...singleSurfaceSetups,
  ...obstacleSetups,
  ...multipleSurfaceSetups,
  ...edgeCaseSetups,
  ...bypassSetups,
] as const;

/**
 * All generated (parameterized) setups.
 */
export const GENERATED_SETUPS = [...generatedSetups] as const;

/**
 * ALL test setups.
 * Every assertion will be tested against each of these.
 */
export const ALL_SETUPS = [...MANUAL_SETUPS, ...GENERATED_SETUPS] as const;

/**
 * Get a setup by name.
 */
export function getSetupByName(name: string) {
  return ALL_SETUPS.find((s) => s.name === name);
}

/**
 * Get setups by tag.
 */
export function getSetupsByTag(tag: string) {
  return ALL_SETUPS.filter((s) => s.tags?.includes(tag));
}

/**
 * Get counts for reporting.
 */
export function getSetupCounts() {
  return {
    manual: MANUAL_SETUPS.length,
    generated: GENERATED_SETUPS.length,
    total: ALL_SETUPS.length,
  };
}

