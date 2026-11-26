import type { IncidentState, RegionWorkflow } from './types';
import { REGIONS, TOTAL_SERVERS } from './scenario';

export const INITIAL_AFFECTED_SERVERS = 847;

export type WorkflowTickEvent =
  | { type: 'patch_failed'; region: string; progress: number; failureCount: number; errorRate: number }
  | { type: 'patch_succeeded'; region: string; errorRate: number }
  | { type: 'wrong_patch'; region: string; errorRate: number; patchVersion?: string }
  | { type: 'rollback_complete'; region: string; previousPatch?: string };

export function isRegionCorrectlyPatched(workflow: RegionWorkflow): boolean {
  if (workflow.state === 'security_review' || workflow.state === 'verified') {
    return true;
  }

  return workflow.state === 'patched' && workflow.patchVersion === workflow.requiredPatch;
}

export function allRegionsCorrectlyPatched(workflows: Record<string, RegionWorkflow>): boolean {
  return Object.values(workflows).every(isRegionCorrectlyPatched);
}

export function computeAffectedServers(workflows: Record<string, RegionWorkflow>): number {
  const unpatchedServers = REGIONS.reduce((sum, region) => {
    const workflow = workflows[region.name];
    return workflow && isRegionCorrectlyPatched(workflow) ? sum : sum + region.servers;
  }, 0);

  return Math.round((INITIAL_AFFECTED_SERVERS * unpatchedServers) / TOTAL_SERVERS);
}

export function cloneWorkflows(workflows: Record<string, RegionWorkflow>): Record<string, RegionWorkflow> {
  const cloned: Record<string, RegionWorkflow> = {};

  for (const [region, workflow] of Object.entries(workflows)) {
    cloned[region] = {
      ...workflow,
      securityItems: workflow.securityItems.map((item) => ({ ...item })),
    };
  }

  return cloned;
}

export function advanceWorkflows(
  currentWorkflows: Record<string, RegionWorkflow>,
  rng: () => number = Math.random,
): { workflows: Record<string, RegionWorkflow>; events: WorkflowTickEvent[] } {
  const workflows = cloneWorkflows(currentWorkflows);
  const events: WorkflowTickEvent[] = [];

  for (const [region, workflow] of Object.entries(workflows)) {
    if (workflow.state === 'patching') {
      const progressIncrement = 10 + Math.floor(rng() * 5);
      const newProgress = Math.min(100, workflow.patchProgress + progressIncrement);

      // Check for failure between 40-75% progress (20% -> 10% -> 0% after 2 failures)
      if (workflow.patchProgress < 75 && newProgress >= 40) {
        const failureChance = Math.max(0, 0.2 - workflow.failureCount * 0.1);
        if (rng() < failureChance) {
          workflow.state = 'patch_failed';
          workflow.failureCount += 1;
          workflow.errorRate = Math.min(5.0, workflow.errorRate + 2.0);
          events.push({
            type: 'patch_failed',
            region,
            progress: newProgress,
            failureCount: workflow.failureCount,
            errorRate: workflow.errorRate,
          });
          continue;
        }
      }

      workflow.patchProgress = newProgress;

      if (newProgress >= 100) {
        const isCorrectPatch = workflow.patchVersion === workflow.requiredPatch;
        workflow.state = 'patched';
        workflow.failureCount = 0;

        if (isCorrectPatch) {
          workflow.errorRate = Math.max(0.3, workflow.errorRate - 1.0);
          events.push({
            type: 'patch_succeeded',
            region,
            errorRate: workflow.errorRate,
          });
        } else {
          workflow.errorRate = Math.min(5.0, workflow.errorRate + 1.5);
          events.push({
            type: 'wrong_patch',
            region,
            errorRate: workflow.errorRate,
            patchVersion: workflow.patchVersion,
          });
        }
      }
    } else if (workflow.state === 'rolling_back') {
      const rollbackIncrement = 15 + Math.floor(rng() * 5);
      workflow.patchProgress = Math.max(0, workflow.patchProgress - rollbackIncrement);

      if (workflow.patchProgress <= 0) {
        const previousPatch = workflow.patchVersion;
        workflow.state = 'ready_to_patch';
        workflow.patchVersion = undefined;
        workflow.patchProgress = 0;
        events.push({
          type: 'rollback_complete',
          region,
          previousPatch,
        });
      }
    }
  }

  return { workflows, events };
}

export function simulateMetrics(
  state: Pick<IncidentState, 'errorRate' | 'latencyP99'>,
  workflows: Record<string, RegionWorkflow>,
  rng: () => number = Math.random,
): { errorRate: number; latencyP99: number; affectedServers: number } {
  let errorRate = state.errorRate;
  let latencyP99 = state.latencyP99;

  const regionValues = Object.values(workflows);
  const avgRegionErrorRate = regionValues.length > 0
    ? regionValues.reduce((sum, w) => sum + w.errorRate, 0) / regionValues.length
    : errorRate;

  errorRate = errorRate * 0.8 + avgRegionErrorRate * 0.2;

  const failingRegions = regionValues.filter(
    (w) => w.state === 'patch_failed' || (w.state === 'patched' && w.patchVersion !== w.requiredPatch),
  ).length;

  if (failingRegions > 0) {
    errorRate = Math.min(5.0, errorRate + 0.1 * failingRegions);
    latencyP99 = Math.min(200, latencyP99 + 3 * failingRegions);
  } else if (avgRegionErrorRate < 1.0) {
    errorRate = Math.max(0.3, errorRate - 0.05);
    latencyP99 = Math.max(45, latencyP99 - 2);
  }

  errorRate += (rng() - 0.5) * 0.1;
  latencyP99 += Math.floor((rng() - 0.5) * 5);

  return {
    errorRate: Math.max(0, errorRate),
    latencyP99: Math.max(0, latencyP99),
    affectedServers: computeAffectedServers(workflows),
  };
}

export function determinePhase(
  state: Pick<IncidentState, 'sreConfirmed' | 'actions'>,
  workflows: Record<string, RegionWorkflow>,
): IncidentState['phase'] {
  const workflowValues = Object.values(workflows);
  const allVerified = workflowValues.every((w) => w.state === 'verified');

  if (allVerified && state.sreConfirmed) {
    return 'resolved';
  }

  const inSecurityReview = workflowValues.some(
    (w) => w.state === 'security_review' || w.state === 'verified',
  );
  if (inSecurityReview) return 'investigation';

  const patchingRegions = workflowValues.filter(
    (w) => w.state === 'patching' || w.state === 'patch_failed' || w.state === 'rolling_back',
  ).length;
  if (patchingRegions > 0) return 'response';

  const investigatingRegions = workflowValues.filter(
    (w) => w.state === 'investigating' || w.state === 'ready_to_patch',
  ).length;
  if (investigatingRegions > 0 || state.actions.length > 3) return 'investigation';

  return 'triage';
}
