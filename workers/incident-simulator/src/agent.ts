import { Agent, routeAgentRequest, callable } from 'agents';
import type { Connection } from 'agents';
import type { IncidentState, CommandResult, Message } from './types';
import { createInitialState } from './scenario';
import { IncidentTools } from './tools';
import type { Env } from './env';

export class IncidentAgent extends Agent<Env, IncidentState> {
  initialState = (() => {
    const now = new Date();
    return {
      ...createInitialState(),
      simTime: now.toISOString(),
      realStartTime: Date.now(),
    };
  })() as IncidentState;
  
  // Time acceleration: 1 real minute = 10 simulation minutes
  private readonly TIME_ACCELERATION = 10;
  private readonly TICK_INTERVAL = 5000; // 5 seconds real time
  private tickInterval?: ReturnType<typeof setInterval>;
  
  async onRequest(request: Request): Promise<Response> {
    // Handle WebSocket upgrade requests
    if (request.headers.get('Upgrade') === 'websocket') {
      // The Agents SDK handles WebSocket upgrades automatically
      // This method is called for regular HTTP requests
      return new Response('WebSocket endpoint - use WebSocket protocol to connect', {
        status: 426,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    
    // Return current state for regular HTTP requests
    return new Response(JSON.stringify({
      status: 'ok',
      agent: 'IncidentAgent',
      connections: Array.from(this.getConnections()).length,
      state: this.state,
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  async onConnect(connection: Connection) {
    console.log(`Client connected: ${connection.id}`);
    
    // Start the simulation tick
    this.startSimulation();
    
    // Send welcome message
    const welcomeMessage = this.getWelcomeMessage();
    connection.send(JSON.stringify({
      type: 'system',
      content: welcomeMessage,
    }));
  }
  
  async onDisconnect(connection: Connection) {
    console.log(`Client disconnected: ${connection.id}`);
    
    // Stop simulation if no more connections
    const connections = Array.from(this.getConnections());
    if (connections.length === 0) {
      this.stopSimulation();
    }
  }
  
  async onMessage(connection: Connection, message: string | ArrayBuffer) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text);
      
      if (data.type === 'call' && data.method) {
        let result: any;
        
        switch (data.method) {
          case 'executeCommand':
            result = await this.executeCommand(data.args[0], data.args[1] || []);
            break;
          case 'sendMessage':
            await this.sendMessage(data.args[0]);
            result = { success: true };
            break;
          case 'getState':
            result = this.getState();
            break;
          case 'reset':
            this.reset();
            result = { success: true };
            break;
          default:
            result = { error: `Unknown method: ${data.method}` };
        }
        
        // Send response back to client
        connection.send(JSON.stringify({
          type: 'response',
          id: data.id,
          result,
        }));
      }
    } catch (error) {
      console.error('Error handling message:', error);
      connection.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message',
      }));
    }
  }
  
  private startSimulation() {
    if (this.tickInterval) return;
    
    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.TICK_INTERVAL);
  }
  
  private stopSimulation() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }
  
  private tick() {
    // Advance simulation time
    const currentSimTime = new Date(this.state.simTime);
    const simMinutesElapsed = (this.TICK_INTERVAL / 1000 / 60) * this.TIME_ACCELERATION;
    currentSimTime.setMinutes(currentSimTime.getMinutes() + simMinutesElapsed);
    
    // Update metrics based on simulation state
    const newMetrics = this.simulateMetrics();
    
    // Check for patch completion
    const updatedPatchStatus = this.checkPatchProgress();
    
    // Update phase based on progress
    const newPhase = this.determinePhase();
    
    this.setState({
      ...this.state,
      simTime: currentSimTime.toISOString(),
      ...newMetrics,
      patchStatus: updatedPatchStatus,
      phase: newPhase,
    });
    
    // Broadcast state update to all connections
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'state_update',
      state: this.state,
    })));
  }
  
  private simulateMetrics() {
    // Base metrics that fluctuate
    let errorRate = this.state.errorRate;
    let latencyP99 = this.state.latencyP99;
    
    // Error rate increases slightly if unpatched servers remain
    const unpatchedRegions = Object.entries(this.state.patchStatus).filter(
      ([_, status]) => status !== 'complete'
    ).length;
    
    if (unpatchedRegions > 0) {
      // Slow degradation over time
      errorRate = Math.min(5.0, errorRate + 0.05);
      latencyP99 = Math.min(200, latencyP99 + 2);
    } else {
      // Recovery once all patched
      errorRate = Math.max(0.3, errorRate - 0.1);
      latencyP99 = Math.max(45, latencyP99 - 5);
    }
    
    // Random fluctuation
    errorRate += (Math.random() - 0.5) * 0.1;
    latencyP99 += Math.floor((Math.random() - 0.5) * 5);
    
    return {
      errorRate: Math.max(0, errorRate),
      latencyP99: Math.max(0, latencyP99),
    };
  }
  
  private checkPatchProgress(): Record<string, 'pending' | 'in_progress' | 'complete' | 'failed'> {
    const patchStatus = { ...this.state.patchStatus };
    
    Object.entries(patchStatus).forEach(([region, status]) => {
      if (status === 'in_progress') {
        // 15% chance of completion per tick
        if (Math.random() < 0.15) {
          patchStatus[region] = 'complete';
          
          // Send notification
          this.broadcast(new TextEncoder().encode(JSON.stringify({
            type: 'notification',
            severity: 'info',
            message: `✓ Kernel patch completed in ${region}`,
          })));
        }
      }
    });
    
    return patchStatus;
  }
  
  private determinePhase(): IncidentState['phase'] {
    const allPatched = Object.values(this.state.patchStatus).every(
      s => s === 'complete'
    );
    
    if (allPatched && this.state.errorRate < 0.5) {
      if (!this.state.resolved) {
        this.setState({
          ...this.state,
          resolved: true,
          resolutionTime: Date.now() - this.state.realStartTime,
        });
        
        this.broadcast(new TextEncoder().encode(JSON.stringify({
          type: 'notification',
          severity: 'success',
          message: '🎉 Incident resolved! All systems stable.',
        })));
      }
      return 'resolved';
    }
    
    const inProgressCount = Object.values(this.state.patchStatus).filter(
      s => s === 'in_progress' || s === 'complete'
    ).length;
    
    if (inProgressCount > 0) return 'response';
    if (this.state.actions.length > 3) return 'investigation';
    return 'triage';
  }
  
  @callable()
  async executeCommand(command: string, args: string[]): Promise<CommandResult> {
    const tools = new IncidentTools(this.state);
    
    // Log the action
    const action = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      command: `${command} ${args.join(' ')}`.trim(),
      result: '',
      type: 'command' as const,
    };
    
    let result: CommandResult;
    
    switch (command.toLowerCase()) {
      case 'status':
        result = tools.getStatus();
        break;
      case 'metrics':
        result = tools.getMetrics(args[0] || 'overview');
        break;
      case 'logs':
        result = tools.getLogs(args[0] || 'all', args[1] || '30');
        break;
      case 'regions':
        result = tools.getRegionStatus();
        break;
      case 'patch':
        result = await tools.patchRegion(args[0]);
        break;
      case 'rollback':
        result = await tools.rollbackRegion(args[0]);
        break;
      case 'alert':
        result = tools.sendAlert(args[0], args.slice(1).join(' '));
        break;
      case 'hint':
        result = tools.getHint();
        break;
      case 'help':
        result = this.getHelp();
        break;
      default:
        result = {
          success: false,
          output: `Unknown command: ${command}. Type 'help' for available commands.`,
        };
    }
    
    // Update action log
    action.result = result.output.substring(0, 200);
    this.setState({
      ...this.state,
      actions: [...this.state.actions, action],
    });
    
    return result;
  }
  
  @callable()
  async sendMessage(content: string): Promise<void> {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    
    this.setState({
      ...this.state,
      messages: [...this.state.messages, message],
    });
    
    // Generate AI response using Llama 3.1
    const response = await this.generateAIResponse(content);
    
    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    };
    
    this.setState({
      ...this.state,
      messages: [...this.state.messages, aiMessage],
    });
    
    // Broadcast messages to client
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'messages',
      messages: [message, aiMessage],
    })));
  }
  
  @callable()
  getState(): IncidentState {
    return this.state;
  }
  
  @callable()
  reset(): void {
    this.stopSimulation();
    const newState = {
      ...createInitialState(),
      simTime: new Date().toISOString(),
      realStartTime: Date.now(),
    } as IncidentState;
    
    this.setState(newState);
    this.startSimulation();
    
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'system',
      content: this.getWelcomeMessage(),
    })));
  }
  
  private async generateAIResponse(userMessage: string): Promise<string> {
    const systemPrompt = `You are an experienced SRE at Cloudflare responding to a P0 incident. The current incident is ${this.state.cveId}: ${this.state.cveDescription}

Current Status:
- Phase: ${this.state.phase}
- Severity: ${this.state.severity}
- Affected Servers: ${this.state.affectedServers}
- Error Rate: ${this.state.errorRate.toFixed(2)}%
- Simulated Time: ${new Date(this.state.simTime).toLocaleString()}

Be concise, technical, and helpful. Ask clarifying questions when needed. Provide specific actionable advice based on the current phase of the incident. If you don't know something, say so directly.

Tone: Calm under pressure, experienced, collaborative.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.state.messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage },
        ],
        max_tokens: 300,
      });
      
      return response.response || 'I apologize, but I am unable to provide a response at this moment.';
    } catch (error: any) {
      console.error('AI generation error:', error);
      
      // Check if it's an authentication error
      if (error.message?.includes('Authentication') || error.message?.includes('10000')) {
        return `⚠️ **AI Assistant Unavailable**

The AI service requires authentication. To enable the AI assistant in local development:

1. Run: \`npx wrangler login\`
2. Restart the Worker

**Meanwhile**, I can still help you manually:

**Current Phase:** ${this.state.phase}
**Hint:** Use the \`hint\` command for guidance, or check the \`status\` to see what actions are needed.`;
      }
      
      return 'I am experiencing technical difficulties. Please try again or use the available commands.';
    }
  }
  
  private getWelcomeMessage(): string {
    return `
╔══════════════════════════════════════════════════════════════╗
║           🚨 CRITICAL INCIDENT RESPONSE SIMULATOR 🚨          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  INCIDENT: ${this.state.cveId}                               ║
║  SEVERITY: P0 - CRITICAL                                     ║
║  TIME: ${new Date(this.state.simTime).toLocaleString()}      ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  AFFECTED SYSTEMS:                                           ║
║    • 847 edge servers across 5 regions                       ║
║    • ~12% of global traffic at risk                          ║
║    • Kernel privilege escalation vulnerability               ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  YOUR ROLE: Incident Commander                               ║
║  OBJECTIVE: Coordinate response and patch all servers        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Type 'help' for available commands                          ║
║  Type 'hint' for guidance                                    ║
║  Use 'query <question>' to ask the on-call engineer          ║
╚══════════════════════════════════════════════════════════════╝

Good luck. The edge is depending on you.
`;
  }
  
  private getHelp(): CommandResult {
    const output = `
📖 AVAILABLE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATUS & MONITORING
  status                    Show current incident status
  metrics [service]         View metrics (overview, edge, kernel, security)
  logs <service> [time]     View logs (edge, kernel, security, all)
  regions                   Show status of all regions

RESPONSE ACTIONS
  patch <region>            Initiate kernel patch (us-east, us-west, eu-west, eu-central, apac)
  rollback <region>         Rollback patch in a region
  alert <team> <msg>        Send alert (sre, security, leadership, customers, all)

ASSISTANCE
  hint                      Get contextual hint
  query <question>          Ask the on-call engineer AI
  help                      Show this help message
  reset                     Restart the simulation

EXAMPLES
  metrics edge
  logs kernel 60
  patch us-east
  alert sre "Patch initiated in us-east"
  query "What's the CVSS score for this CVE?"
`;
    
    return {
      success: true,
      output,
    };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    
    // Handle WebSocket upgrade for agent connections (with or without /incident prefix)
    if ((url.pathname.startsWith('/agents/') || url.pathname.startsWith('/incident/agents/')) && request.headers.get('Upgrade') === 'websocket') {
      const response = await routeAgentRequest(request, env);
      if (response) {
        return response;
      }
    }
    
    // Route regular agent requests (with or without /incident prefix)
    if (url.pathname.startsWith('/agents/') || url.pathname.startsWith('/incident/agents/')) {
      const response = await routeAgentRequest(request, env);
      if (response) {
        // Create new response with CORS headers (original headers are immutable)
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
    }
    
    // Serve static UI files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    // Fallback for dev mode without ASSETS binding
    return new Response('Incident Response Simulator API Server\n\nUse WebSocket to connect to /agents/incident-agent/session', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
