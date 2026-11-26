import { describe, expect, it } from 'vitest';
import { createInitialState } from './scenario';
import { IncidentTools } from './tools';
import type { IncidentState } from './types';

function makeState(): IncidentState {
  return {
    ...createInitialState(),
    simTime: '2026-11-25T12:00:00.000Z',
    realStartTime: 1_700_000_000_000,
  };
}

describe('IncidentTools', () => {
  it('returns next hint count without mutating state', () => {
    const state = makeState();
    const tools = new IncidentTools(state);

    const { result, nextHintsUsed } = tools.getHint();

    expect(result.success).toBe(true);
    expect(result.output).toContain('HINT #1');
    expect(nextHintsUsed).toBe(1);
    expect(state.hintsUsed).toBe(0);
  });

  it('excludes wrong-patch regions from patched counts', () => {
    const state = makeState();
    state.regionWorkflows['us-east'].state = 'patched';
    state.regionWorkflows['us-east'].patchVersion = 'wrong-version';
    state.regionWorkflows['us-west'].state = 'patched';
    state.regionWorkflows['us-west'].patchVersion = state.regionWorkflows['us-west'].requiredPatch;

    const tools = new IncidentTools(state);
    const status = tools.getStatus();

    expect(status.success).toBe(true);
    expect(status.output).toContain('Patched:          1/5 regions');
    expect(status.metrics?.patchedServers).toBe(1);
  });

  it('lists patches and formats logs with timeframe', () => {
    const state = makeState();
    const tools = new IncidentTools(state);

    const patches = tools.listPatches();
    const logs = tools.getLogs('kernel', '30');

    expect(patches.output).toContain('6.5.0-9-hotfix');
    expect(logs.output).toContain('LOGS: KERNEL (last 30m)');
    expect(logs.logs?.length).toBeGreaterThan(0);
  });
});
