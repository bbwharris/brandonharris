import { Agent, callable } from 'agents';
import type { Connection } from 'agents';
import type { IncidentState, CommandResult, Message, RegionWorkflow, SecurityChecklistItem } from './types';
import { createInitialState, PATCH_VERSIONS, generateSecurityChecklist, REGIONS, getRandomPatchVersion } from './scenario';
import { IncidentTools } from './tools';
import type { Env } from './env';
import {
  advanceWorkflows,
  allRegionsCorrectlyPatched,
  cloneWorkflows,
  determinePhase,
  isRegionCorrectlyPatched,
  simulateMetrics,
} from './simulation';
import {
  buildPatchFailurePrompt,
  buildPatchSuccessPrompt,
  buildRollbackCompletePrompt,
  buildSecurityAuditCompletePrompt,
  buildSecurityChecklistPrompt,
  buildSecurityPhaseInitPrompt,
  buildSecurityRegionCompletePrompt,
  buildSecurityVerificationPrompt,
  buildSREInvestigationPrompt,
  buildWrongPatchPrompt,
  getFallbackChatResponse,
  getSecuritySystemPrompt,
  getSRESystemPrompt,
  getWelcomeMessage,
  HELP_TEXT,
  SECURITY_CHAT_SYSTEM,
  SRE_CHAT_SYSTEM,
} from './prompts';
import { corsHeaders } from './security';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_CHAT_LENGTH = 2_000;
const MAX_MESSAGES_PER_MINUTE = 30;
const MAX_HISTORY_ITEMS = 200;

export class IncidentAgent extends Agent<Env, IncidentState> {
  initialState = (() => ({
    ...createInitialState(),
    simTime: new Date().toISOString(),
    realStartTime: Date.now(),
  }))() as IncidentState;

  // Time acceleration: 1 real minute = 10 simulation minutes
  private readonly TIME_ACCELERATION = 10;
  private readonly TICK_INTERVAL = 5000; // 5 seconds real time
  private tickInterval?: ReturnType<typeof setInterval>;
  private isTicking = false;
  private readonly messageWindows = new Map<string, number[]>();

  async onRequest(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return new Response('WebSocket endpoint - use WebSocket protocol to connect', {
        status: 426,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Do not expose internal simulation state (such as requiredPatch) over HTTP.
    return new Response(JSON.stringify({
      status: 'ok',
      agent: 'IncidentAgent',
      connections: Array.from(this.getConnections()).length,
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(request),
      },
    });
  }

  async onConnect(connection: Connection) {
    console.log(`Client connected: ${connection.id}`);

    this.startSimulation();

    connection.send(JSON.stringify({
      type: 'system',
      content: getWelcomeMessage(this.state),
    }));
  }

  async onDisconnect(connection: Connection) {
    console.log(`Client disconnected: ${connection.id}`);

    this.messageWindows.delete(connection.id);

    if (Array.from(this.getConnections()).length === 0) {
      this.stopSimulation();
    }
  }

  async onMessage(connection: Connection, message: string | ArrayBuffer) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

      if (text.length > MAX_MESSAGE_LENGTH) {
        connection.send(JSON.stringify({
          type: 'error',
          error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
        }));
        return;
      }

      if (this.isRateLimited(connection.id)) {
        connection.send(JSON.stringify({
          type: 'error',
          error: 'Rate limit exceeded. Try again in a minute.',
        }));
        return;
      }

      const data = JSON.parse(text);

      if (data.type === 'call' && typeof data.method === 'string') {
        const args = Array.isArray(data.args) ? data.args : [];
        let result: unknown;

        switch (data.method) {
          case 'executeCommand': {
            const command = args[0];
            if (typeof command !== 'string' || command.length === 0 || command.length > 100) {
              result = { success: false, output: 'Invalid command.' };
              break;
            }

            const commandArgs = Array.isArray(args[1]) ? args[1].slice(0, 10).map(String) : [];
            result = await this.executeCommand(command, commandArgs);
            break;
          }
          case 'sendMessage': {
            const content = args[0];
            if (typeof content !== 'string' || content.trim().length === 0 || content.length > MAX_CHAT_LENGTH) {
              result = { success: false, error: `Message must be between 1 and ${MAX_CHAT_LENGTH} characters.` };
              break;
            }

            await this.sendMessage(content.trim());
            result = { success: true };
            break;
          }
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

  private isRateLimited(connectionId: string): boolean {
    const now = Date.now();
    const cutoff = now - 60_000;
    const recent = (this.messageWindows.get(connectionId) ?? []).filter((timestamp) => timestamp > cutoff);

    recent.push(now);
    this.messageWindows.set(connectionId, recent);

    return recent.length > MAX_MESSAGES_PER_MINUTE;
  }

  private startSimulation() {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      this.tick().catch((error) => {
        console.error('Error in tick:', error);
      });
    }, this.TICK_INTERVAL);
  }

  private stopSimulation() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  private async tick() {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const currentSimTime = new Date(this.state.simTime);
      const simMinutesElapsed = (this.TICK_INTERVAL / 1000 / 60) * this.TIME_ACCELERATION;
      currentSimTime.setMinutes(currentSimTime.getMinutes() + simMinutesElapsed);

      const { workflows: updatedWorkflows, events } = advanceWorkflows(this.state.regionWorkflows);
      const newMetrics = simulateMetrics(this.state, updatedWorkflows);
      const newPhase = determinePhase(this.state, updatedWorkflows);
      const newlyResolved = newPhase === 'resolved' && !this.state.resolved;

      this.setState({
        ...this.state,
        simTime: currentSimTime.toISOString(),
        regionWorkflows: updatedWorkflows,
        ...newMetrics,
        phase: newPhase,
        resolved: newlyResolved ? true : this.state.resolved,
        resolutionTime: newlyResolved ? Date.now() - this.state.realStartTime : this.state.resolutionTime,
      });

      if (newlyResolved) {
        this.broadcastNotification('success', '🎉 Incident resolved! All systems stable.');
      }

      for (const event of events) {
        switch (event.type) {
          case 'patch_failed':
            await this.withTypingIndicator(() =>
              this.generatePatchFailureResponse(event.region, event.progress, event.failureCount, event.errorRate),
            );
            break;
          case 'patch_succeeded': {
            this.broadcastNotification('success', `✓ Kernel patch completed in ${event.region}`);
            const unpatchedRegions = Object.entries(this.state.regionWorkflows)
              .filter(([_, w]) => !isRegionCorrectlyPatched(w))
              .map(([r]) => r);
            await this.withTypingIndicator(() =>
              this.generatePatchSuccessResponse(event.region, event.errorRate, unpatchedRegions),
            );
            break;
          }
          case 'wrong_patch':
            await this.withTypingIndicator(() =>
              this.generateWrongPatchResponse(event.region, event.errorRate, event.patchVersion),
            );
            break;
          case 'rollback_complete':
            this.broadcastNotification('info', `↩️ Rollback complete in ${event.region}. Ready to re-patch.`);
            await this.withTypingIndicator(() =>
              this.generateRollbackCompleteResponse(event.region, event.previousPatch),
            );
            break;
        }
      }

      if (!this.state.securityPhaseActive && allRegionsCorrectlyPatched(this.state.regionWorkflows)) {
        await this.switchToSecurityPhase();
      }

      this.broadcastJson({
        type: 'state_update',
        state: this.state,
      });
    } finally {
      this.isTicking = false;
    }
  }

  private async switchToSecurityPhase(): Promise<void> {
    const workflows = cloneWorkflows(this.state.regionWorkflows);

    Object.values(workflows).forEach((workflow) => {
      if (workflow.state === 'patched') {
        workflow.state = 'security_review';
        workflow.securityItems = generateSecurityChecklist();
      }
    });

    this.setState({
      ...this.state,
      regionWorkflows: workflows,
      aiPersona: 'security',
      securityPhaseActive: true,
    });

    await this.withTypingIndicator(() => this.generateSecurityPhaseInitResponse());

    const firstRegion = Object.values(workflows).find((w) => w.state === 'security_review');
    if (firstRegion) {
      await this.withTypingIndicator(() => this.sendSecurityChecklist(firstRegion));
    }
  }

  private async withTypingIndicator<T>(fn: () => Promise<T>): Promise<T> {
    this.broadcastTypingIndicator(true);
    try {
      return await fn();
    } finally {
      this.broadcastTypingIndicator(false);
    }
  }

  private broadcastJson(payload: unknown): void {
    this.broadcast(new TextEncoder().encode(JSON.stringify(payload)));
  }

  private broadcastTypingIndicator(isTyping: boolean): void {
    this.broadcastJson({
      type: 'typing',
      isTyping,
      persona: this.state.aiPersona,
    });
  }

  private broadcastNotification(severity: 'info' | 'success' | 'warning' | 'error', message: string): void {
    this.broadcastJson({
      type: 'notification',
      severity,
      message,
    });
  }

  private async triggerAIResponse(persona: 'sre' | 'security', content: string): Promise<void> {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      persona,
    };

    this.setState({
      ...this.state,
      messages: [...this.state.messages, message].slice(-MAX_HISTORY_ITEMS),
    });

    this.broadcastJson({
      type: 'messages',
      messages: [message],
    });
  }

  @callable()
  async executeCommand(command: string, args: string[]): Promise<CommandResult> {
    const normalized = command.toLowerCase();

    if (normalized === 'reset') {
      this.reset();
      return {
        success: true,
        output: 'Simulation reset. Welcome back, Commander.',
      };
    }

    const tools = new IncidentTools(this.state);
    const action = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      command: `${command} ${args.join(' ')}`.trim(),
      result: '',
      type: 'command' as const,
    };

    let result: CommandResult;
    let nextHintsUsed = this.state.hintsUsed;

    switch (normalized) {
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
      case 'patches':
        result = tools.listPatches();
        break;
      case 'patch':
        result = await this.handlePatchCommand(args[0], args[1]);
        break;
      case 'rollback':
        result = await this.handleRollbackCommand(args[0]);
        break;
      case 'alert':
        result = await this.handleAlertCommand(args[0], args[1]);
        break;
      case 'verify':
        result = await this.handleVerifyCommand(args[0]);
        break;
      case 'resolve':
        result = await this.handleResolveCommand();
        break;
      case 'hint': {
        const hint = tools.getHint();
        result = hint.result;
        nextHintsUsed = hint.nextHintsUsed;
        break;
      }
      case 'help':
        result = { success: true, output: HELP_TEXT };
        break;
      default:
        result = {
          success: false,
          output: `Unknown command: ${command}. Type 'help' for available commands.`,
        };
    }

    action.result = result.output.substring(0, 200);
    this.setState({
      ...this.state,
      hintsUsed: nextHintsUsed,
      actions: [...this.state.actions, action].slice(-MAX_HISTORY_ITEMS),
    });

    return result;
  }

  private async handlePatchCommand(region: string, version: string): Promise<CommandResult> {
    if (!region) {
      return {
        success: false,
        output: 'Usage: patch <region> <version>\nExample: patch us-east 6.5.0-9-hotfix',
      };
    }

    if (!version) {
      return {
        success: false,
        output: 'Error: Patch version required.\nUsage: patch <region> <version>\nUse "patches" command to see available versions.',
      };
    }

    const regionInfo = REGIONS.find((r) => r.name === region);
    if (!regionInfo) {
      return {
        success: false,
        output: `❌ Region '${region}' not found. Available regions: ${REGIONS.map((r) => r.name).join(', ')}`,
      };
    }

    const workflow = this.state.regionWorkflows[region];

    if (workflow.state !== 'ready_to_patch' && workflow.state !== 'patched') {
      return {
        success: false,
        output: `❌ Cannot patch ${region}. Current state: ${workflow.state.replace(/_/g, ' ')}.\nAlert SRE to investigate first: alert sre ${region}`,
      };
    }

    if (!workflow.investigationComplete && workflow.state !== 'patched') {
      return {
        success: false,
        output: `❌ Investigation not complete for ${region}.\nAlert SRE to investigate: alert sre ${region}`,
      };
    }

    const updatedWorkflows = cloneWorkflows(this.state.regionWorkflows);
    updatedWorkflows[region] = {
      ...updatedWorkflows[region],
      state: 'patching',
      patchVersion: version,
      patchProgress: 0,
      patchStartTime: Date.now(),
    };

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });

    return {
      success: true,
      output: `🚀 Initiating kernel patch rollout for ${region}\n\nTarget: ${version}\nAffected servers: ${regionInfo.servers}\nETA: ~8-12 minutes\n\nMonitoring for issues...`,
    };
  }

  private async handleRollbackCommand(region: string): Promise<CommandResult> {
    if (!region) {
      return {
        success: false,
        output: 'Usage: rollback <region>\nExample: rollback us-east',
      };
    }

    const regionInfo = REGIONS.find((r) => r.name === region);
    if (!regionInfo) {
      return {
        success: false,
        output: `❌ Region '${region}' not found.`,
      };
    }

    const workflow = this.state.regionWorkflows[region];

    if (workflow.state !== 'patch_failed' && workflow.state !== 'patched') {
      return {
        success: false,
        output: `❌ Cannot rollback ${region}. No patch in progress or failed. Current state: ${workflow.state.replace(/_/g, ' ')}`,
      };
    }

    const updatedWorkflows = cloneWorkflows(this.state.regionWorkflows);
    updatedWorkflows[region] = {
      ...updatedWorkflows[region],
      state: 'rolling_back',
      patchProgress: 100,
    };

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });

    return {
      success: true,
      output: `↩️  Rolling back patch in ${region}\n\nReverting to previous kernel version...\nServers affected: ${regionInfo.servers}\nETA: ~5-8 minutes`,
    };
  }

  private async handleAlertCommand(team: string, region?: string): Promise<CommandResult> {
    if (!team) {
      return {
        success: false,
        output: 'Usage: alert <team> [region]\nTeams: sre, security\nExample: alert sre us-east',
      };
    }

    const teamLower = team.toLowerCase();

    if (teamLower === 'sre') {
      if (!region) {
        return {
          success: false,
          output: 'Usage: alert sre <region>\nExample: alert sre us-east',
        };
      }

      if (!REGIONS.find((r) => r.name === region)) {
        return {
          success: false,
          output: `❌ Region '${region}' not found.`,
        };
      }

      const workflow = this.state.regionWorkflows[region];

      if (workflow.state !== 'idle' && workflow.state !== 'ready_to_patch') {
        return {
          success: false,
          output: `❌ SRE already investigating or patch in progress for ${region}.`,
        };
      }

      const updatedWorkflows = cloneWorkflows(this.state.regionWorkflows);
      updatedWorkflows[region] = {
        ...updatedWorkflows[region],
        state: 'investigating',
      };

      this.setState({
        ...this.state,
        regionWorkflows: updatedWorkflows,
      });

      await this.withTypingIndicator(() => this.generateSREInvestigationResponse(region));

      return {
        success: true,
        output: `📢 Alert sent to SRE team for ${region}\n\nInvestigation in progress...`,
      };
    }

    if (teamLower === 'security') {
      if (!this.state.securityPhaseActive) {
        return {
          success: false,
          output: '❌ Cannot alert security yet. All regions must be patched first.',
        };
      }

      await this.withTypingIndicator(() =>
        this.triggerAIResponse(
          'security',
          '🔒 Security team notified.\n\nInitiating comprehensive security audit of all patched regions.\n\nI will review each region for potential security incidents and provide verification checklists.',
        ),
      );

      return {
        success: true,
        output: '📢 Alert sent to Security team\n\nSecurity audit initiated...',
      };
    }

    return {
      success: false,
      output: `❌ Unknown team '${team}'. Available teams: sre, security`,
    };
  }

  private async handleVerifyCommand(region: string): Promise<CommandResult> {
    if (!region) {
      return {
        success: false,
        output: 'Usage: verify <region>\nExample: verify us-east',
      };
    }

    if (!REGIONS.find((r) => r.name === region)) {
      return {
        success: false,
        output: `❌ Region '${region}' not found.`,
      };
    }

    const workflow = this.state.regionWorkflows[region];

    if (workflow.state !== 'security_review') {
      return {
        success: false,
        output: `❌ ${region} is not in security review phase. Current state: ${workflow.state.replace(/_/g, ' ')}`,
      };
    }

    const itemIndex = workflow.securityItems.findIndex((item) => !item.verified);

    if (itemIndex < 0) {
      return {
        success: true,
        output: `✓ ${region} already fully verified`,
      };
    }

    const updatedWorkflows = cloneWorkflows(this.state.regionWorkflows);
    const updatedWorkflow = updatedWorkflows[region];
    updatedWorkflow.securityItems[itemIndex].verified = true;
    const item = updatedWorkflow.securityItems[itemIndex];

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });

    const hasMoreItems = itemIndex + 1 < updatedWorkflow.securityItems.length;
    await this.withTypingIndicator(() =>
      this.generateSecurityVerificationResponse(region, itemIndex, updatedWorkflow.securityItems.length, item, hasMoreItems),
    );

    const allNowVerified = updatedWorkflow.securityItems.every((entry) => entry.verified);
    if (allNowVerified) {
      const completedWorkflows = cloneWorkflows(this.state.regionWorkflows);
      completedWorkflows[region].state = 'verified';
      completedWorkflows[region].securityVerified = true;

      this.setState({
        ...this.state,
        regionWorkflows: completedWorkflows,
      });

      const allRegionsComplete = Object.values(completedWorkflows).every((w) => w.state === 'verified');
      await this.withTypingIndicator(() =>
        this.generateSecurityRegionCompleteResponse(region, allRegionsComplete),
      );

      if (allRegionsComplete) {
        await this.withTypingIndicator(() => this.generateSecurityAuditCompleteResponse());
        this.setState({
          ...this.state,
          aiPersona: 'sre',
        });
      }
    }

    return {
      success: true,
      output: `✓ Verified ${region} - ${itemIndex + 1}/${updatedWorkflow.securityItems.length} items checked`,
    };
  }

  private async handleResolveCommand(): Promise<CommandResult> {
    const allVerified = Object.values(this.state.regionWorkflows).every((w) => w.state === 'verified');

    if (!allVerified) {
      const unverified = Object.entries(this.state.regionWorkflows)
        .filter(([_, w]) => w.state !== 'verified')
        .map(([region]) => region);

      return {
        success: false,
        output: `❌ Cannot resolve incident. Security verification incomplete.\n\nUnverified regions: ${unverified.join(', ')}\n\nComplete verification with: verify <region>`,
      };
    }

    if (!this.state.sreConfirmed) {
      await this.withTypingIndicator(() =>
        this.triggerAIResponse(
          'sre',
          `👨‍💻 SRE SYSTEM CHECK

All regions have passed security audit. Checking system stability...

**HEALTH METRICS:**
- Global error rate: ${this.state.errorRate.toFixed(2)}%
- P99 Latency: ${this.state.latencyP99}ms
- All regions: operational

✓ Systems are stable and healthy.

Incident Commander, you are cleared to resolve the incident. Run resolve command to close.`,
        ),
      );

      this.setState({
        ...this.state,
        sreConfirmed: true,
      });

      return {
        success: true,
        output: '✓ SRE confirms systems are stable. You may now resolve the incident.',
      };
    }

    const resolutionTime = Date.now() - this.state.realStartTime;
    this.setState({
      ...this.state,
      phase: 'resolved',
      resolved: true,
      resolutionTime,
    });

    return {
      success: true,
      output: `🎉 INCIDENT RESOLVED

CVE-2024-8765 has been successfully mitigated across all regions.
- All 5 regions patched and verified
- Security audit: PASSED
- System stability: CONFIRMED
- Resolution time: ${Math.floor(resolutionTime / 1000 / 60)} minutes

Excellent work, Incident Commander!`,
    };
  }

  @callable()
  async sendMessage(content: string): Promise<void> {
    const trimmed = typeof content === 'string' ? content.trim() : '';

    if (trimmed.length === 0 || trimmed.length > MAX_CHAT_LENGTH) {
      throw new Error(`Message must be between 1 and ${MAX_CHAT_LENGTH} characters.`);
    }

    const message: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    this.setState({
      ...this.state,
      messages: [...this.state.messages, message].slice(-MAX_HISTORY_ITEMS),
    });

    this.broadcastJson({
      type: 'messages',
      messages: [message],
    });

    const response = await this.withTypingIndicator(() => this.generateAIResponse(trimmed));

    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      persona: this.state.aiPersona ?? undefined,
    };

    this.setState({
      ...this.state,
      messages: [...this.state.messages, aiMessage].slice(-MAX_HISTORY_ITEMS),
    });

    this.broadcastJson({
      type: 'messages',
      messages: [aiMessage],
    });
  }

  @callable()
  getState(): IncidentState {
    const state = this.state;

    if (!state.regionWorkflows) {
      const regionWorkflows: Record<string, RegionWorkflow> = {};
      REGIONS.forEach((r) => {
        regionWorkflows[r.name] = {
          region: r.name,
          state: state.patchStatus?.[r.name] === 'complete' ? 'patched' :
                 state.patchStatus?.[r.name] === 'in_progress' ? 'patching' : 'idle',
          patchProgress: 0,
          requiredPatch: getRandomPatchVersion(),
          investigationComplete: state.patchStatus?.[r.name] === 'complete',
          securityItems: [],
          securityVerified: false,
          errorRate: state.errorRate ?? 0.3,
          failureCount: 0,
        };
      });
      state.regionWorkflows = regionWorkflows;
    }

    if (!state.aiPersona) {
      state.aiPersona = 'sre';
    }

    if (typeof state.securityPhaseActive !== 'boolean') {
      state.securityPhaseActive = false;
    }

    if (typeof state.sreConfirmed !== 'boolean') {
      state.sreConfirmed = false;
    }

    return state;
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

    this.broadcastJson({
      type: 'system',
      content: getWelcomeMessage(newState),
    });
  }

  private async callAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    maxTokens: number,
  ): Promise<string> {
    const response = await this.env.AI.run(MODEL, {
      messages,
      max_tokens: maxTokens,
    });

    return response.response?.trim() ?? '';
  }

  private async generateAIResponse(userMessage: string): Promise<string> {
    const systemPrompt = this.state.aiPersona === 'security'
      ? getSecuritySystemPrompt(this.state)
      : getSRESystemPrompt(this.state);

    try {
      return (await this.callAI([
        { role: 'system', content: systemPrompt },
        ...this.state.messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ], 150)) || 'I apologize, but I am unable to provide a response at this moment.';
    } catch (error: unknown) {
      console.error('AI generation error:', error);
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('Authentication') || message.includes('10000')) {
        return getFallbackChatResponse(this.state);
      }

      return 'I am experiencing technical difficulties. Please try again or use the available commands.';
    }
  }

  private async generateWithFallback(
    persona: 'sre' | 'security',
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    formatSuccess: (aiContent: string) => string,
    fallbackContent: string,
  ): Promise<void> {
    try {
      const aiContent = await this.callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], maxTokens);

      await this.triggerAIResponse(persona, aiContent ? formatSuccess(aiContent) : fallbackContent);
    } catch (error) {
      console.error('AI generation error:', error);
      await this.triggerAIResponse(persona, fallbackContent);
    }
  }

  private async sendSecurityChecklist(workflow: RegionWorkflow): Promise<void> {
    const checklistItems = workflow.securityItems
      .map((item, idx) => `${idx + 1}. ${item.description}`)
      .join('\n');

    await this.generateWithFallback(
      'security',
      SECURITY_CHAT_SYSTEM,
      buildSecurityChecklistPrompt(workflow.region, checklistItems),
      120,
      (ai) => `🔍 SECURITY CHECKLIST: ${workflow.region.toUpperCase()}\n\n${ai}\n\n${checklistItems}\n\nRun: verify ${workflow.region}`,
      `🔍 SECURITY CHECKLIST: ${workflow.region.toUpperCase()}\n\n${checklistItems}\n\nRun: verify ${workflow.region} to check each item.\n\nI have detected some unusual patterns that require investigation.`,
    );
  }

  private async generatePatchFailureResponse(region: string, progress: number, failureCount: number, errorRate: number): Promise<void> {
    await this.generateWithFallback(
      'sre',
      SRE_CHAT_SYSTEM,
      buildPatchFailurePrompt(region, progress, failureCount, errorRate),
      160,
      (ai) => `🚨 PATCH FAILURE in ${region.toUpperCase()}!\n\n${ai}\n\nCurrent error rate: ${errorRate.toFixed(2)}%`,
      `🚨 PATCH FAILURE in ${region.toUpperCase()}!\n\nKernel panic detected at ${progress}% progress.\n\nIMMEDIATE ACTION REQUIRED:\n1. Rollback patch: rollback ${region}\n2. Re-apply correct patch version\n\nCurrent error rate: ${errorRate.toFixed(2)}%`,
    );
  }

  private async generatePatchSuccessResponse(region: string, errorRate: number, unpatchedRegions: string[]): Promise<void> {
    const remainingCount = unpatchedRegions.length;
    const nextRegion = remainingCount > 0 ? unpatchedRegions[0] : null;
    const fallbackBase = `✅ PATCH SUCCESS: ${region.toUpperCase()}\n\nExcellent work, Commander! The kernel patch has been successfully applied to ${region}.\n\nHealth metrics are improving:\n- Error rate dropping to ${errorRate.toFixed(2)}%\n- All servers responding normally`;
    const fallback = remainingCount > 0
      ? `${fallbackBase}\n\n**NEXT STEPS:**\nWe still have ${remainingCount} region${remainingCount > 1 ? 's' : ''} needing patches: ${unpatchedRegions.join(', ')}\n\nI recommend we proceed with ${nextRegion}.\nRun: alert sre ${nextRegion}`
      : `${fallbackBase}\n\n🎉 All regions have been successfully patched!\n\nInitiating security audit phase. Please alert the security team:\nRun: alert security`;

    await this.generateWithFallback(
      'sre',
      SRE_CHAT_SYSTEM,
      buildPatchSuccessPrompt(region, errorRate, unpatchedRegions),
      140,
      (ai) => `✅ PATCH SUCCESS: ${region.toUpperCase()}\n\n${ai}`,
      fallback,
    );
  }

  private async generateSREInvestigationResponse(region: string): Promise<void> {
    const workflow = this.state.regionWorkflows[region];
    const patchInfo = PATCH_VERSIONS.find((p) => p.version === workflow.requiredPatch);
    const regionData = REGIONS.find((r) => r.name === region);

    await this.generateWithFallback(
      'sre',
      SRE_CHAT_SYSTEM,
      buildSREInvestigationPrompt(region, workflow),
      140,
      (ai) => `👨‍💻 SRE INVESTIGATION: ${region.toUpperCase()}\n\n${ai}`,
      `👨‍💻 SRE INVESTIGATION: ${region.toUpperCase()}\n\nI've analyzed the kernel and edge logs for ${region}. Here are my findings:\n\n**FINDINGS:**\n- Kernel version affected: 6.5.0-8\n- Vulnerability: CVE-2024-8765 (privilege escalation)\n- Error rate: ${workflow.errorRate.toFixed(2)}%\n- Affected servers: ${regionData?.servers}\n- Log analysis: Detected general protection faults and elevated 5xx errors\n\n**REQUIRED PATCH:**\n${workflow.requiredPatch}${patchInfo ? `\n(${patchInfo.description})` : ''}\n\n**ACTION REQUIRED:**\nRun: patch ${region} ${workflow.requiredPatch}\n\nThis region is ready for patching. I'll monitor for any issues during rollout.`,
    );

    const updatedWorkflows = cloneWorkflows(this.state.regionWorkflows);
    updatedWorkflows[region] = {
      ...updatedWorkflows[region],
      state: 'ready_to_patch',
      investigationComplete: true,
    };

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });
  }

  private async generateRollbackCompleteResponse(region: string, previousPatch?: string): Promise<void> {
    const requiredPatch = this.state.regionWorkflows[region].requiredPatch;

    await this.generateWithFallback(
      'sre',
      SRE_CHAT_SYSTEM,
      buildRollbackCompletePrompt(region, requiredPatch, previousPatch),
      120,
      (ai) => `↩️ ROLLBACK COMPLETE: ${region.toUpperCase()}\n\n${ai}`,
      `↩️ ROLLBACK COMPLETE: ${region.toUpperCase()}\n\nThe rollback has completed successfully in ${region}.\n\n**STATUS:**\n- Systems are stable and responsive\n- Previous patch has been removed\n- Region is ready for re-patching\n\n**NEXT STEP:**\nApply the correct patch: patch ${region} ${requiredPatch}`,
    );
  }

  private async generateWrongPatchResponse(region: string, errorRate: number, patchVersion?: string): Promise<void> {
    const correctPatch = this.state.regionWorkflows[region].requiredPatch;

    await this.generateWithFallback(
      'sre',
      SRE_CHAT_SYSTEM,
      buildWrongPatchPrompt(region, patchVersion, correctPatch, errorRate),
      120,
      (ai) => `⚠️ WRONG PATCH: ${region.toUpperCase()}\n\n${ai}`,
      `⚠️ WRONG PATCH: ${region.toUpperCase()}\n\nThe patch was applied successfully, but health metrics haven't improved.\n\n**CURRENT STATUS:**\n- Error rate remains elevated at ${errorRate.toFixed(2)}%\n- Kernel faults still detected in logs\n- This suggests the wrong patch version was applied\n\n**ACTION REQUIRED:**\n1. Rollback current patch: rollback ${region}\n2. Apply correct version: patch ${region} ${correctPatch}`,
    );
  }

  private async generateSecurityVerificationResponse(
    region: string,
    itemIndex: number,
    totalItems: number,
    item: SecurityChecklistItem,
    hasMoreItems: boolean,
  ): Promise<void> {
    const suffix = hasMoreItems
      ? `Continue verification: verify ${region}`
      : `✓ All items verified for ${region}.`;

    await this.generateWithFallback(
      'security',
      SECURITY_CHAT_SYSTEM,
      buildSecurityVerificationPrompt(region, itemIndex, totalItems, item),
      140,
      (ai) => `🔍 VERIFICATION: ${region.toUpperCase()} - Item ${itemIndex + 1}/${totalItems}\n\n${ai}\n\n${suffix}`,
      `🔍 VERIFICATION: ${region.toUpperCase()} - Item ${itemIndex + 1}/${totalItems}\n\n${item.description}\n\n**FINDING:** ${item.finding}\n\nAfter careful analysis, these appear to be normal operations. Marking as verified. ✓\n\n${suffix}`,
    );
  }

  private async generateSecurityRegionCompleteResponse(region: string, allRegionsComplete: boolean): Promise<void> {
    const suffix = allRegionsComplete
      ? 'All regions verified. Security audit complete.'
      : 'Continue verifying remaining regions.';

    await this.generateWithFallback(
      'security',
      SECURITY_CHAT_SYSTEM,
      buildSecurityRegionCompletePrompt(region, allRegionsComplete),
      120,
      (ai) => `✓ SECURITY VERIFICATION COMPLETE: ${region.toUpperCase()}\n\n${ai}\n\n${suffix}`,
      `✓ SECURITY VERIFICATION COMPLETE: ${region.toUpperCase()}\n\nAll checklist items verified. No security breaches detected.\n\n${suffix}`,
    );
  }

  private async generateSecurityAuditCompleteResponse(): Promise<void> {
    await this.generateWithFallback(
      'security',
      SECURITY_CHAT_SYSTEM,
      buildSecurityAuditCompletePrompt(),
      140,
      (ai) => `🔒 SECURITY AUDIT COMPLETE\n\n${ai}\n\nIncident Commander, you may now check with SRE for final system stability confirmation.`,
      '🔒 SECURITY AUDIT COMPLETE\n\nAll 5 regions have been thoroughly investigated.\n✓ No security breaches detected\n✓ All suspicious activity explained\n✓ Patch integrity confirmed\n\nIncident Commander, you may now check with SRE for final system stability confirmation.',
    );
  }

  private async generateSecurityPhaseInitResponse(): Promise<void> {
    await this.generateWithFallback(
      'security',
      SECURITY_CHAT_SYSTEM,
      buildSecurityPhaseInitPrompt(),
      140,
      (ai) => `🔒 SECURITY AUDIT INITIATED\n\n${ai}\n\nStarting with region analysis...`,
      '🔒 SECURITY AUDIT INITIATED\n\nAll regions have been patched. Initiating comprehensive security review.\n\nI will provide a checklist for each region. Please verify all items before proceeding.\n\nStarting with region analysis...',
    );
  }
}
