import { routeAgentRequest } from 'agents';
import type { Env } from './env';
import { handleWorkerFetch } from './security';

export { IncidentAgent } from './agent';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleWorkerFetch(request, env, (req, workerEnv) => routeAgentRequest(req, workerEnv));
  },
};
