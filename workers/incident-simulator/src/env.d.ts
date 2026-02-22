export interface Env {
  IncidentAgent: DurableObjectNamespace<IncidentAgent>;
  AI: Ai;
  ASSETS: Fetcher;
}

export interface Ai {
  run(model: string, options: {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
  }): Promise<{ response?: string }>;
}
