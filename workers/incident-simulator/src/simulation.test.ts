import { describe, expect, it } from 'vitest';
import { createInitialState } from './scenario';
import {
  advanceWorkflows,
  allRegionsCorrectlyPatched,
  computeAffectedServers,
  determinePhase,
  INITIAL_AFFECTED_SERVERS,
  isRegionCorrectlyPatched,
  simulateMetrics,
} from './simulation';

describe('simulation engine', () => {
  it('only counts regions with the required patch as correctly patched', () => {
    const state = createInitialState();
    const wf = state.regionWorkflows['us-east'];

    wf.state = 'patched';
    wf.patchVersion = 'wrong-version';
    expect(isRegionCorrectlyPatched(wf)).toBe(false);
    expect(computeAffectedServers(state.regionWorkflows)).toBe(INITIAL_AFFECTED_SERVERS);

    wf.patchVersion = wf.requiredPatch;
    expect(isRegionCorrectlyPatched(wf)).toBe(true);
    expect(computeAffectedServers(state.regionWorkflows)).toBeLessThan(INITIAL_AFFECTED_SERVERS);
  });

  it('does not treat all regions as patched when one has the wrong version', () => {
    const state = createInitialState();
    for (const [name, wf] of Object.entries(state.regionWorkflows)) {
      wf.state = 'patched';
      wf.patchVersion = name === 'apac' ? 'wrong-version' : wf.requiredPatch;
    }

    expect(allRegionsCorrectlyPatched(state.regionWorkflows)).toBe(false);

    state.regionWorkflows.apac.patchVersion = state.regionWorkflows.apac.requiredPatch;
    expect(allRegionsCorrectlyPatched(state.regionWorkflows)).toBe(true);
    expect(computeAffectedServers(state.regionWorkflows)).toBe(0);
  });

  it('advances patches immutably and emits completion events', () => {
    const state = createInitialState();
    const original = state.regionWorkflows['us-east'];
    original.state = 'patching';
    original.patchProgress = 95;
    original.patchVersion = original.requiredPatch;

    const { workflows, events } = advanceWorkflows(state.regionWorkflows, () => 0.9);

    expect(original.state).toBe('patching');
    expect(original.patchProgress).toBe(95);
    expect(workflows['us-east'].state).toBe('patched');
    expect(workflows['us-east'].patchProgress).toBe(100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'patch_succeeded', region: 'us-east' });
  });

  it('triggers patch failure mid-rollout and emits wrong_patch when mismatched', () => {
    const state = createInitialState();
    state.regionWorkflows['us-east'].state = 'patching';
    state.regionWorkflows['us-east'].patchProgress = 45;
    state.regionWorkflows['us-east'].patchVersion = state.regionWorkflows['us-east'].requiredPatch;

    const failed = advanceWorkflows(state.regionWorkflows, () => 0.05);
    expect(failed.workflows['us-east'].state).toBe('patch_failed');
    expect(failed.workflows['us-east'].failureCount).toBe(1);
    expect(failed.events[0]).toMatchObject({ type: 'patch_failed', region: 'us-east', failureCount: 1 });

    state.regionWorkflows['us-west'].state = 'patching';
    state.regionWorkflows['us-west'].patchProgress = 95;
    state.regionWorkflows['us-west'].patchVersion = 'wrong-version';
    state.regionWorkflows['us-east'].state = 'idle';

    const wrong = advanceWorkflows(state.regionWorkflows, () => 0.9);
    expect(wrong.workflows['us-west'].state).toBe('patched');
    expect(wrong.events[0]).toMatchObject({ type: 'wrong_patch', region: 'us-west' });
  });

  it('completes rollbacks and resets workflow to ready_to_patch', () => {
    const state = createInitialState();
    state.regionWorkflows['eu-west'].state = 'rolling_back';
    state.regionWorkflows['eu-west'].patchProgress = 10;
    state.regionWorkflows['eu-west'].patchVersion = 'wrong-version';

    const { workflows, events } = advanceWorkflows(state.regionWorkflows, () => 0.5);
    expect(workflows['eu-west'].state).toBe('ready_to_patch');
    expect(workflows['eu-west'].patchProgress).toBe(0);
    expect(workflows['eu-west'].patchVersion).toBeUndefined();
    expect(events[0]).toMatchObject({
      type: 'rollback_complete',
      region: 'eu-west',
      previousPatch: 'wrong-version',
    });
  });

  it('computes phase transitions and updated metrics', () => {
    const state = createInitialState();
    expect(determinePhase(state, state.regionWorkflows)).toBe('triage');

    state.regionWorkflows['us-east'].state = 'investigating';
    expect(determinePhase(state, state.regionWorkflows)).toBe('investigation');

    state.regionWorkflows['us-east'].state = 'patching';
    expect(determinePhase(state, state.regionWorkflows)).toBe('response');

    for (const wf of Object.values(state.regionWorkflows)) {
      wf.state = 'verified';
      wf.patchVersion = wf.requiredPatch;
    }
    expect(determinePhase(state, state.regionWorkflows)).toBe('investigation');

    state.sreConfirmed = true;
    expect(determinePhase(state, state.regionWorkflows)).toBe('resolved');

    const metrics = simulateMetrics(state, state.regionWorkflows, () => 0.5);
    expect(metrics.affectedServers).toBe(0);
    expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    expect(metrics.latencyP99).toBeGreaterThanOrEqual(0);
  });
});
