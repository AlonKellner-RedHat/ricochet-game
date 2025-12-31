/**
 * Hypothesis Registry
 *
 * Tracks hypotheses for why invariant tests fail.
 * Each hypothesis is linked to a failure pattern and has test cases
 * that would confirm or reject it.
 */

import type { Hypothesis, HypothesisTestCase } from "../tools/types";

// =============================================================================
// HYPOTHESIS REGISTRY
// =============================================================================

/**
 * All registered hypotheses.
 *
 * Add new hypotheses here as you investigate failure patterns.
 * Each hypothesis should:
 * - Be linked to a specific failure pattern
 * - Have test cases that would prove/disprove it
 * - Track its status (proposed -> testing -> confirmed/rejected)
 */
export const HYPOTHESES: Hypothesis[] = [
  // Example hypothesis - remove or modify as needed
  // {
  //   id: "H001",
  //   title: "Screen corner vertices missing",
  //   description:
  //     "When the visibility polygon extends to a screen corner, " +
  //     "the corner vertex may not be included, causing edges to " +
  //     "skip directly from one surface to another via the corner.",
  //   relatedPatternId: "polygon-edges:stage0:screen-to-surface",
  //   testCases: [
  //     {
  //       description: "Player sees top-right corner through gap",
  //       scene: "basic",
  //       player: { x: 100, y: 400 },
  //       cursor: { x: 1200, y: 100 },
  //       expectedResult: "fail",
  //       rationale: "Should fail if corner vertex is missing",
  //     },
  //   ],
  //   status: "proposed",
  // },
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get hypothesis by ID.
 */
export function getHypothesis(id: string): Hypothesis | undefined {
  return HYPOTHESES.find((h) => h.id === id);
}

/**
 * Get all hypotheses for a pattern.
 */
export function getHypothesesForPattern(patternId: string): Hypothesis[] {
  return HYPOTHESES.filter((h) => h.relatedPatternId === patternId);
}

/**
 * Get all test cases from all hypotheses.
 */
export function getAllTestCases(): Array<{
  hypothesis: Hypothesis;
  testCase: HypothesisTestCase;
}> {
  const result: Array<{ hypothesis: Hypothesis; testCase: HypothesisTestCase }> = [];

  for (const hypothesis of HYPOTHESES) {
    for (const testCase of hypothesis.testCases) {
      result.push({ hypothesis, testCase });
    }
  }

  return result;
}

/**
 * Add a new hypothesis programmatically.
 */
export function addHypothesis(hypothesis: Hypothesis): void {
  HYPOTHESES.push(hypothesis);
}

/**
 * Update hypothesis status.
 */
export function updateHypothesisStatus(
  id: string,
  status: Hypothesis["status"],
  conclusion?: string
): boolean {
  const hypothesis = getHypothesis(id);
  if (!hypothesis) return false;

  hypothesis.status = status;
  if (conclusion) {
    hypothesis.conclusion = conclusion;
  }

  return true;
}

// =============================================================================
// HYPOTHESIS CREATION HELPERS
// =============================================================================

/**
 * Create a new hypothesis ID.
 */
export function nextHypothesisId(): string {
  const maxId = HYPOTHESES.reduce((max, h) => {
    const num = parseInt(h.id.slice(1), 10);
    return num > max ? num : max;
  }, 0);

  return `H${String(maxId + 1).padStart(3, "0")}`;
}

/**
 * Template for creating a new hypothesis.
 */
export function createHypothesisTemplate(
  patternId: string
): Omit<Hypothesis, "id"> {
  return {
    title: "Description of the root cause",
    description: "Detailed explanation of why this might be happening",
    relatedPatternId: patternId,
    testCases: [
      {
        description: "Test case that would confirm this hypothesis",
        scene: "basic",
        player: { x: 0, y: 0 },
        cursor: { x: 0, y: 0 },
        expectedResult: "fail",
        rationale: "Why this case is relevant",
      },
    ],
    status: "proposed",
  };
}

