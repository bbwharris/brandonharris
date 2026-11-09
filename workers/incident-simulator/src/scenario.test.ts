import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  generateSecurityChecklist,
  getLogMessages,
  PATCH_VERSIONS,
  REGIONS,
  TOTAL_SERVERS,
} from './scenario';

describe('scenario', () => {
  it('creates an initial workflow for every region', () => {
    const state = createInitialState();
    const versions = PATCH_VERSIONS.map((patch) => patch.version);

    expect(state.phase).toBe('triage');
    expect(state.totalServers).toBe(TOTAL_SERVERS);
    expect(state.affectedServers).toBe(847);
    expect(Object.keys(state.regionWorkflows)).toHaveLength(REGIONS.length);

    for (const region of REGIONS) {
      const workflow = state.regionWorkflows[region.name];

      expect(workflow).toMatchObject({
        region: region.name,
        state: 'idle',
        patchProgress: 0,
        failureCount: 0,
        investigationComplete: false,
        securityVerified: false,
      });
      expect(versions).toContain(workflow.requiredPatch);
    }
  });

  it('generates three or four unique, unverified checklist items', () => {
    const items = generateSecurityChecklist();

    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(4);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.verified === false)).toBe(true);
  });

  it('returns service-scoped logs in reverse chronological order', () => {
    const logs = getLogMessages('kernel', 'us-east', '30');
    const timestamps = logs.map((log) => Date.parse(log.timestamp));

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.region === 'us-east')).toBe(true);
    expect(logs.every((log) => log.service === 'kernel')).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('returns no logs for an unknown service', () => {
    expect(getLogMessages('unknown', 'us-east', '30')).toEqual([]);
  });
});
