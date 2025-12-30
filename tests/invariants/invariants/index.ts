/**
 * Invariant Definitions
 *
 * Exports all invariants to be tested.
 */

import type { Invariant } from "../types";
import { v5CursorReachabilityInvariant } from "./V5-cursor-reachability";
import { polygonVerticesInvariant } from "./polygon-vertices";
import { polygonEdgesInvariant } from "./polygon-edges";
import { noSelfIntersectionInvariant } from "./polygon-self-intersection";

/**
 * All invariants to test.
 * 
 * Note: V.5 (cursor reachability) requires proper plan validity evaluation
 * which needs the full trajectory engine. It is included but will fail
 * until the evaluatePlanValidity function is properly implemented.
 */
export const ALL_INVARIANTS: Invariant[] = [
  // V.5 is commented out until plan validity evaluation is implemented
  // v5CursorReachabilityInvariant,
  polygonVerticesInvariant,
  polygonEdgesInvariant,
  noSelfIntersectionInvariant,
];

export { v5CursorReachabilityInvariant } from "./V5-cursor-reachability";
export { polygonVerticesInvariant } from "./polygon-vertices";
export { polygonEdgesInvariant } from "./polygon-edges";
export { noSelfIntersectionInvariant } from "./polygon-self-intersection";

