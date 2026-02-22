import type { IncidentState, Region, LogEntry } from './types';

export const REGIONS: Region[] = [
  { name: 'us-east', servers: 234, status: 'healthy', patchStatus: 'pending' },
  { name: 'us-west', servers: 198, status: 'healthy', patchStatus: 'pending' },
  { name: 'eu-west', servers: 187, status: 'healthy', patchStatus: 'pending' },
  { name: 'eu-central', servers: 156, status: 'healthy', patchStatus: 'pending' },
  { name: 'apac', servers: 267, status: 'healthy', patchStatus: 'pending' },
];

export const TOTAL_SERVERS = REGIONS.reduce((sum, r) => sum + r.servers, 0);

export const CVE_DETAILS = {
  id: 'CVE-2024-8765',
  description: 'Linux kernel privilege escalation vulnerability in network packet processing. CVSS 9.8. Affects kernels 5.15.x through 6.6.x.',
  affectedKernels: ['5.15.0-105', '5.15.0-106', '6.1.0-15', '6.1.0-16', '6.5.0-8'],
  patchedKernel: '6.5.0-9',
};

export function createInitialState(): Omit<IncidentState, 'simTime' | 'realStartTime'> {
  const patchStatus: Record<string, 'pending' | 'in_progress' | 'complete' | 'failed'> = {};
  REGIONS.forEach(r => {
    patchStatus[r.name] = 'pending';
  });

  return {
    phase: 'triage',
    severity: 'P0',
    affectedRegions: REGIONS.map(r => r.name),
    affectedServers: 847,
    totalServers: TOTAL_SERVERS,
    patchStatus,
    actions: [],
    messages: [],
    errorRate: 0.3,
    latencyP99: 45,
    trafficVolume: 1250000,
    cveId: CVE_DETAILS.id,
    cveDescription: CVE_DETAILS.description,
    patchAvailable: true,
    exploitationDetected: false,
    hintsUsed: 0,
    resolved: false,
  };
}

export function getLogMessages(service: string, region: string, timeframe: string): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = new Date();
  const timeframeMinutes = parseInt(timeframe) || 30;
  
  // Generate realistic-looking logs based on service and region
  if (service === 'kernel' || service === 'system') {
    logs.push({
      timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
      level: 'ERROR',
      service: 'kernel',
      region,
      message: `Kernel panic in ${region}: general protection fault at ip:ffff9f8b4c2d8a22`,
    });
    logs.push({
      timestamp: new Date(now.getTime() - 18 * 60000).toISOString(),
      level: 'WARN',
      service: 'kernel',
      region,
      message: `Unexpected system call pattern detected on 3 nodes in ${region}`,
    });
  }
  
  if (service === 'edge' || service === 'all') {
    logs.push({
      timestamp: new Date(now.getTime() - 5 * 60000).toISOString(),
      level: 'WARN',
      service: 'edge-proxy',
      region,
      message: `Elevated 5xx error rate in ${region}: 2.4% (threshold: 1.0%)`,
    });
    logs.push({
      timestamp: new Date(now.getTime() - 8 * 60000).toISOString(),
      level: 'INFO',
      service: 'edge-proxy',
      region,
      message: `Connection pool saturation detected in ${region}`,
    });
  }
  
  if (service === 'security' || service === 'all') {
    logs.push({
      timestamp: new Date(now.getTime() - 25 * 60000).toISOString(),
      level: 'WARN',
      service: 'security-monitor',
      region,
      message: `Suspicious network activity pattern matched CVE-2024-8765 signature in ${region}`,
    });
  }
  
  return logs.slice(0, 10).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export const HINTS = {
  triage: [
    "Start by checking the current status of all regions to understand the scope.",
    "Look at the error rates and latency metrics to assess impact.",
    "Check if exploitation has been detected by querying the security logs.",
  ],
  investigation: [
    "Review kernel logs for panic traces and error patterns.",
    "Check the patch compatibility with current kernel versions.",
    "Look at edge proxy logs to understand customer impact.",
  ],
  response: [
    "Start patching regions one at a time, beginning with the least critical.",
    "Monitor error rates after each patch to catch any issues early.",
    "If a patch fails, consider rolling back and investigating before retrying.",
  ],
  general: [
    "Use the 'status' command to see your current progress.",
    "The 'hint' command will always provide contextual guidance.",
    "You can ask questions using the 'query' command.",
  ],
};
