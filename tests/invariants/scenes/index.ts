/**
 * Scene Definitions for Invariant Tests
 *
 * Exports all scenes to be tested.
 */

export * from "./basic";
export * from "./chains";
export * from "./edges";

import { BASIC_SCENES } from "./basic";
import { CHAIN_SCENES } from "./chains";
import { EDGE_SCENES } from "./edges";
import type { Scene } from "../types";

/**
 * All scenes to test.
 */
export const ALL_SCENES: Scene[] = [
  ...BASIC_SCENES,
  ...CHAIN_SCENES,
  ...EDGE_SCENES,
];

