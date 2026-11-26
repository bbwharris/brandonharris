import type { IncidentAgent } from './agent';

export interface Env {
  IncidentAgent: DurableObjectNamespace<IncidentAgent>;
  AI: Ai;
  ASSETS?: Fetcher;
  INCIDENT_RATE_LIMIT?: RateLimit;
}

export interface Ai {
  run(model: string, options: {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
  }): Promise<{ response?: string }>;
}
