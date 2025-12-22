/**
 * Matrix-Based First Principles Tests
 *
 * This test file runs EVERY test setup against EVERY first principle assertion.
 * This ensures comprehensive coverage and makes it easy to:
 * - Add new setups (automatically tested against all assertions)
 * - Add new assertions (automatically tested against all setups)
 *
 * To add a new setup: See setups/index.ts
 * To add a new assertion: See assertions/index.ts
 */

import { describe, it, beforeAll } from "vitest";
import { ALL_ASSERTIONS } from "./assertions";
import { executeSetup } from "./MatrixTestRunner";
import { ALL_SETUPS, getSetupCounts } from "./setups";
import type { TestResults, TestSetup } from "./types";

/**
 * Cache for test results to avoid re-computing for each assertion.
 */
const resultsCache = new Map<string, TestResults>();

/**
 * Get or compute results for a setup.
 */
function getResults(setup: TestSetup): TestResults {
  if (!resultsCache.has(setup.name)) {
    resultsCache.set(setup.name, executeSetup(setup));
  }
  return resultsCache.get(setup.name)!;
}

/**
 * Main matrix test suite.
 */
describe("First Principles Matrix Tests", () => {
  // Report test counts
  beforeAll(() => {
    const counts = getSetupCounts();
    const assertionCount = ALL_ASSERTIONS.length;
    const totalTests = counts.total * assertionCount;

    console.log("=== Matrix Test Configuration ===");
    console.log(`Setups: ${counts.manual} manual + ${counts.generated} generated = ${counts.total} total`);
    console.log(`Assertions: ${assertionCount}`);
    console.log(`Total test combinations: ${totalTests}`);
    console.log("=================================");
  });

  // Run each setup against all assertions
  ALL_SETUPS.forEach((setup) => {
    describe(`Setup: ${setup.name}`, () => {
      let results: TestResults;

      beforeAll(() => {
        results = getResults(setup);
      });

      ALL_ASSERTIONS.forEach((assertion) => {
        it(`[${assertion.principle}] ${assertion.description}`, () => {
          assertion.assert(setup, results);
        });
      });
    });
  });
});

/**
 * Focused tests for specific categories.
 * These can be run separately for faster feedback.
 */
describe("First Principles Matrix Tests - By Category", () => {
  describe("Empty Scene Tests", () => {
    const emptySetups = ALL_SETUPS.filter((s) => s.tags?.includes("empty"));

    emptySetups.forEach((setup) => {
      describe(`${setup.name}`, () => {
        let results: TestResults;

        beforeAll(() => {
          results = getResults(setup);
        });

        ALL_ASSERTIONS.forEach((assertion) => {
          it(`[${assertion.principle}] ${assertion.description}`, () => {
            assertion.assert(setup, results);
          });
        });
      });
    });
  });

  describe("Wall/Obstacle Tests", () => {
    const wallSetups = ALL_SETUPS.filter((s) => s.tags?.includes("wall"));

    wallSetups.forEach((setup) => {
      describe(`${setup.name}`, () => {
        let results: TestResults;

        beforeAll(() => {
          results = getResults(setup);
        });

        ALL_ASSERTIONS.forEach((assertion) => {
          it(`[${assertion.principle}] ${assertion.description}`, () => {
            assertion.assert(setup, results);
          });
        });
      });
    });
  });

  describe("Edge Case Tests", () => {
    const edgeCases = ALL_SETUPS.filter((s) => s.tags?.includes("edge-case"));

    edgeCases.forEach((setup) => {
      describe(`${setup.name}`, () => {
        let results: TestResults;

        beforeAll(() => {
          results = getResults(setup);
        });

        ALL_ASSERTIONS.forEach((assertion) => {
          it(`[${assertion.principle}] ${assertion.description}`, () => {
            assertion.assert(setup, results);
          });
        });
      });
    });
  });
});

/**
 * Focused tests for specific principles.
 * Useful for debugging a specific principle.
 */
describe("First Principles Matrix Tests - By Principle", () => {
  ALL_ASSERTIONS.forEach((assertion) => {
    describe(`Principle ${assertion.principle}: ${assertion.description}`, () => {
      ALL_SETUPS.forEach((setup) => {
        it(`${setup.name}`, () => {
          const results = getResults(setup);
          assertion.assert(setup, results);
        });
      });
    });
  });
});

