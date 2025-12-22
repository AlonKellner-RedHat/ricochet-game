/**
 * Trajectory System v2
 *
 * A redesigned trajectory calculation system with:
 * - Three-layer architecture (Geometry → Engine → Systems)
 * - Floating-point resistant calculations
 * - Image-based reflection with provenance tracking
 * - Formal engine interface with caching
 * - Independent systems with coordinator
 */

// Geometry Layer
export * from "./geometry";

// Engine Layer
export * from "./engine";

// Systems Layer
export * from "./systems";

// Coordinator
export * from "./coordinator";

