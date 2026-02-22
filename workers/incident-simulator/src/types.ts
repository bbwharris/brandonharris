export interface IncidentState {
  phase: 'triage' | 'investigation' | 'response' | 'resolved';
  simTime: string;
  realStartTime: number;
  
  severity: 'P0' | 'P1' | 'P2';
  affectedRegions: string[];
  affectedServers: number;
  totalServers: number;
  patchStatus: Record<string, 'pending' | 'in_progress' | 'complete' | 'failed'>;
  
  actions: Action[];
  messages: Message[];
  
  errorRate: number;
  latencyP99: number;
  trafficVolume: number;
  
  cveId: string;
  cveDescription: string;
  patchAvailable: boolean;
  exploitationDetected: boolean;
  
  hintsUsed: number;
  resolved: boolean;
  resolutionTime?: number;
}

export interface Action {
  id: string;
  timestamp: string;
  command: string;
  result: string;
  type: 'command' | 'chat' | 'hint';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Metrics {
  errorRate: number;
  latencyP99: number;
  trafficVolume: number;
  affectedServers: number;
  patchedServers: number;
}

export interface Region {
  name: string;
  servers: number;
  status: 'healthy' | 'degraded' | 'critical';
  patchStatus: 'pending' | 'in_progress' | 'complete' | 'failed';
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  service: string;
  region: string;
  message: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  metrics?: Metrics;
  regions?: Region[];
  logs?: LogEntry[];
}

export type Command = 
  | { type: 'status' }
  | { type: 'metrics'; service: string }
  | { type: 'logs'; service: string; timeframe: string }
  | { type: 'query'; question: string }
  | { type: 'patch'; region: string }
  | { type: 'rollback'; region: string }
  | { type: 'alert'; team: string; message: string }
  | { type: 'hint' }
  | { type: 'regions' };
