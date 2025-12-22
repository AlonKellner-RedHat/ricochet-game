/**
 * Coordinator Types
 */

import type { ITrajectorySystem } from "@/trajectory-v2/systems/ITrajectorySystem";

/**
 * Connection between systems for event routing.
 */
export interface SystemConnection {
  readonly producerId: string;
  readonly consumerId: string;
  readonly eventType: string;
}

/**
 * System registration info.
 */
export interface RegisteredSystem {
  readonly system: ITrajectorySystem;
  readonly priority: number;
}

