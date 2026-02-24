import { Agent, routeAgentRequest, callable } from 'agents';
import type { Connection } from 'agents';
import type { IncidentState, CommandResult, Message, RegionWorkflow, WorkflowState, SecurityChecklistItem } from './types';
import { createInitialState, PATCH_VERSIONS, generateSecurityChecklist, REGIONS, getRandomPatchVersion } from './scenario';
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
      this.tick().catch(error => {
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
    // Advance simulation time
    const currentSimTime = new Date(this.state.simTime);
    const simMinutesElapsed = (this.TICK_INTERVAL / 1000 / 60) * this.TIME_ACCELERATION;
    currentSimTime.setMinutes(currentSimTime.getMinutes() + simMinutesElapsed);

    // Update workflow states and check progress
    const updatedWorkflows = await this.processWorkflowTicks();

    // Update metrics based on simulation state and workflows
    const newMetrics = this.simulateMetrics(updatedWorkflows);

    // Update phase based on progress
    const newPhase = this.determinePhase(updatedWorkflows);

    this.setState({
      ...this.state,
      simTime: currentSimTime.toISOString(),
      regionWorkflows: updatedWorkflows,
      ...newMetrics,
      phase: newPhase,
    });

    // Broadcast state update to all connections
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'state_update',
      state: this.state,
    })));
  }

  private async processWorkflowTicks(): Promise<Record<string, RegionWorkflow>> {
    const workflows = { ...this.state.regionWorkflows };

    for (const [region, workflow] of Object.entries(workflows)) {
      switch (workflow.state) {
        case 'patching': {
          // Advance progress by ~10% per tick
          const progressIncrement = 10 + Math.floor(Math.random() * 5);
          const newProgress = Math.min(100, workflow.patchProgress + progressIncrement);

          // Check for failure between 40-75% progress
          if (workflow.patchProgress < 75 && newProgress >= 40) {
            // Progressive failure reduction: 20% -> 10% -> 0% after 2 failures
            const failureChance = Math.max(0, 0.20 - (workflow.failureCount * 0.10));
            
            if (Math.random() < failureChance) {
              workflow.state = 'patch_failed';
              workflow.failureCount += 1;
              workflow.errorRate = Math.min(5.0, workflow.errorRate + 2.0);

              // Generate AI response for the failure
              this.broadcastTypingIndicator(true);
              await this.generatePatchFailureResponse(region, newProgress, workflow.failureCount);
              this.broadcastTypingIndicator(false);
              break;
            }
          }

          workflow.patchProgress = newProgress;

          // Check for completion
          if (newProgress >= 100) {
            const isCorrectPatch = workflow.patchVersion === workflow.requiredPatch;
            if (isCorrectPatch) {
              workflow.state = 'patched';
              workflow.failureCount = 0; // Reset failure count on success
              workflow.errorRate = Math.max(0.3, workflow.errorRate - 1.0);
              this.broadcastNotification('success', `✓ Kernel patch completed in ${region}`);

              // Find next unpatched region
              const unpatchedRegions = Object.entries(workflows)
                .filter(([_, w]) => w.state !== 'patched' && w.state !== 'security_review' && w.state !== 'verified')
                .map(([r, _]) => r);

              // Generate AI success message
              this.broadcastTypingIndicator(true);
              await this.generatePatchSuccessResponse(region, workflow.errorRate, unpatchedRegions);
              this.broadcastTypingIndicator(false);

              // Check if all regions patched
              this.checkAllRegionsPatched(workflows);
            } else {
              // Wrong patch - completes but doesn't fix issues
              workflow.state = 'patched'; // Wrong patch still completes state
              workflow.failureCount = 0; // Reset failure count
              workflow.errorRate = Math.min(5.0, workflow.errorRate + 1.5);
              
              // Generate AI wrong patch message
              this.broadcastTypingIndicator(true);
              await this.generateWrongPatchResponse(region, workflow.errorRate);
              this.broadcastTypingIndicator(false);
            }
          }
          break;
        }

        case 'rolling_back': {
          // Rollback progress advances faster than patching
          const rollbackIncrement = 15 + Math.floor(Math.random() * 5);
          workflow.patchProgress = Math.max(0, workflow.patchProgress - rollbackIncrement);

          if (workflow.patchProgress <= 0) {
            workflow.state = 'ready_to_patch';
            workflow.patchVersion = undefined;
            workflow.patchProgress = 0;
            this.broadcastNotification('info', `↩️ Rollback complete in ${region}. Ready to re-patch.`);

            // Generate AI rollback success message
            this.broadcastTypingIndicator(true);
            await this.generateRollbackCompleteResponse(region);
            this.broadcastTypingIndicator(false);
          }
          break;
        }
      }
    }

    return workflows;
  }

  private checkAllRegionsPatched(workflows: Record<string, RegionWorkflow>): void {
    const allPatched = Object.values(workflows).every(w =>
      w.state === 'patched' || w.state === 'security_review' || w.state === 'verified'
    );

    if (allPatched && !this.state.securityPhaseActive) {
      this.switchToSecurityPhase(workflows);
    }
  }

  private async switchToSecurityPhase(workflows: Record<string, RegionWorkflow>): Promise<void> {
    // Generate security checklist for each region
    Object.values(workflows).forEach(workflow => {
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

    // Generate AI security phase initiation message
    this.broadcastTypingIndicator(true);
    await this.generateSecurityPhaseInitResponse();
    this.broadcastTypingIndicator(false);

    // Send checklist for first unverified region
    const firstRegion = Object.values(workflows).find(w => w.state === 'security_review');
    if (firstRegion) {
      this.broadcastTypingIndicator(true);
      await this.sendSecurityChecklist(firstRegion);
      this.broadcastTypingIndicator(false);
    }
  }

  private async sendSecurityChecklist(workflow: RegionWorkflow): Promise<void> {
    const checklistItems = workflow.securityItems.map((item, idx) =>
      `${idx + 1}. ${item.description}`
    ).join('\n');

    const prompt = `You are a paranoid Security Auditor starting a security review for region ${workflow.region}.

CHECKLIST TO REVIEW:
${checklistItems}

YOUR TASK:
Write a brief chat message presenting this checklist. You should:
1. Announce you're reviewing this region
2. Express suspicion something might be wrong
3. Show personality: paranoid, terse, suspicious

STYLE: Chat-like, very brief (2-3 sentences), terse. Like Slack from a paranoid colleague.
Examples: "Reviewing ${workflow.region}. Something feels wrong here. Check these:" or "${workflow.region} audit starting. I don't trust these logs. Verifying:"

Write in first person as the Security Auditor. Do not mention that you are an AI. Keep it under 35 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a paranoid Security Auditor in chat. Be brief, skeptical, terse. Like Slack messages. Short sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 120,
      });

      const aiContent = response.response || 'Beginning security review.';

      await this.triggerAIResponse('security', `🔍 SECURITY CHECKLIST: ${workflow.region.toUpperCase()}\n\n${aiContent}\n\n${checklistItems}\n\nRun: verify ${workflow.region}`);
    } catch (error: any) {
      console.error('AI generation error for security checklist:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('security', `🔍 SECURITY CHECKLIST: ${workflow.region.toUpperCase()}

${checklistItems}

Run: verify ${workflow.region} to check each item.

I have detected some unusual patterns that require investigation.`);
    }
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
      messages: [...this.state.messages, message],
    });

    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'messages',
      messages: [message],
    })));
  }

  private broadcastNotification(severity: 'info' | 'success' | 'warning' | 'error', message: string): void {
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'notification',
      severity,
      message,
    })));
  }
  
  private simulateMetrics(workflows: Record<string, RegionWorkflow>) {
    // Base metrics that fluctuate
    let errorRate = this.state.errorRate;
    let latencyP99 = this.state.latencyP99;

    // Calculate aggregate error rate from all regions
    const regionErrorRates = Object.values(workflows).map(w => w.errorRate);
    const avgRegionErrorRate = regionErrorRates.reduce((a, b) => a + b, 0) / regionErrorRates.length;

    // Global error rate follows region average with some lag
    errorRate = errorRate * 0.8 + avgRegionErrorRate * 0.2;

    // Error rate increases if regions are failing or being patched incorrectly
    const failingRegions = Object.values(workflows).filter(
      w => w.state === 'patch_failed' || (w.state === 'patched' && w.patchVersion !== w.requiredPatch)
    ).length;

    if (failingRegions > 0) {
      errorRate = Math.min(5.0, errorRate + 0.1 * failingRegions);
      latencyP99 = Math.min(200, latencyP99 + 3 * failingRegions);
    } else if (avgRegionErrorRate < 1.0) {
      // Recovery when all regions healthy
      errorRate = Math.max(0.3, errorRate - 0.05);
      latencyP99 = Math.max(45, latencyP99 - 2);
    }

    // Random fluctuation
    errorRate += (Math.random() - 0.5) * 0.1;
    latencyP99 += Math.floor((Math.random() - 0.5) * 5);

    return {
      errorRate: Math.max(0, errorRate),
      latencyP99: Math.max(0, latencyP99),
    };
  }
  
  private determinePhase(workflows: Record<string, RegionWorkflow>): IncidentState['phase'] {
    // Check if all regions are verified and SRE confirmed
    const allVerified = Object.values(workflows).every(w => w.state === 'verified');

    if (allVerified && this.state.sreConfirmed) {
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

    // Check if in security review phase
    const inSecurityReview = Object.values(workflows).some(
      w => w.state === 'security_review' || w.state === 'verified'
    );
    if (inSecurityReview) return 'investigation';

    // Check if actively patching
    const patchingRegions = Object.values(workflows).filter(
      w => w.state === 'patching' || w.state === 'patch_failed' || w.state === 'rolling_back'
    ).length;
    if (patchingRegions > 0) return 'response';

    // Check if investigation phase
    const investigatingRegions = Object.values(workflows).filter(
      w => w.state === 'investigating' || w.state === 'ready_to_patch'
    ).length;
    if (investigatingRegions > 0 || this.state.actions.length > 3) return 'investigation';

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

    if (!REGIONS.find(r => r.name === region)) {
      return {
        success: false,
        output: `❌ Region '${region}' not found. Available regions: ${REGIONS.map(r => r.name).join(', ')}`,
      };
    }

    const workflow = this.state.regionWorkflows[region];

    if (workflow.state !== 'ready_to_patch' && workflow.state !== 'patched') {
      return {
        success: false,
        output: `❌ Cannot patch ${region}. Current state: ${workflow.state.replace(/_/g, ' ')}.\nAlert SRE to investigate first: alert sre ${region}`,
      };
    }

    // Check if investigation is complete
    if (!workflow.investigationComplete && workflow.state !== 'patched') {
      return {
        success: false,
        output: `❌ Investigation not complete for ${region}.\nAlert SRE to investigate: alert sre ${region}`,
      };
    }

    // Update workflow
    const updatedWorkflows = { ...this.state.regionWorkflows };
    updatedWorkflows[region] = {
      ...workflow,
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
      output: `🚀 Initiating kernel patch rollout for ${region}\n\nTarget: ${version}\nAffected servers: ${REGIONS.find(r => r.name === region)?.servers}\nETA: ~8-12 minutes\n\nMonitoring for issues...`,
    };
  }

  private async handleRollbackCommand(region: string): Promise<CommandResult> {
    if (!region) {
      return {
        success: false,
        output: 'Usage: rollback <region>\nExample: rollback us-east',
      };
    }

    if (!REGIONS.find(r => r.name === region)) {
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

    // Update workflow
    const updatedWorkflows = { ...this.state.regionWorkflows };
    updatedWorkflows[region] = {
      ...workflow,
      state: 'rolling_back',
      patchProgress: 100, // Start rollback from current progress
    };

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });

    return {
      success: true,
      output: `↩️  Rolling back patch in ${region}\n\nReverting to previous kernel version...\nServers affected: ${REGIONS.find(r => r.name === region)?.servers}\nETA: ~5-8 minutes`,
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

      if (!REGIONS.find(r => r.name === region)) {
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

      // Update workflow to investigating
      const updatedWorkflows = { ...this.state.regionWorkflows };
      updatedWorkflows[region] = {
        ...workflow,
        state: 'investigating',
      };

      this.setState({
        ...this.state,
        regionWorkflows: updatedWorkflows,
      });

      // Trigger AI investigation response
      this.broadcastTypingIndicator(true);
      await this.generateSREInvestigationResponse(region);
      this.broadcastTypingIndicator(false);

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

      // Trigger security audit initiation with typing indicator
      this.broadcastTypingIndicator(true);
      await this.triggerAIResponse('security', `🔒 Security team notified.\n\nInitiating comprehensive security audit of all patched regions.\n\nI will review each region for potential security incidents and provide verification checklists.`);
      this.broadcastTypingIndicator(false);

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

    if (!REGIONS.find(r => r.name === region)) {
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

    // Verify all checklist items
    const allVerified = workflow.securityItems.every(item => item.verified);

    if (!allVerified) {
      // Mark next unverified item as verified
      const updatedWorkflows = { ...this.state.regionWorkflows };
      const itemIndex = workflow.securityItems.findIndex(item => !item.verified);

      if (itemIndex >= 0) {
        updatedWorkflows[region].securityItems[itemIndex].verified = true;
        const item = updatedWorkflows[region].securityItems[itemIndex];

        this.setState({
          ...this.state,
          regionWorkflows: updatedWorkflows,
        });

        // Generate AI security verification response
        const hasMoreItems = itemIndex + 1 < workflow.securityItems.length;
        this.broadcastTypingIndicator(true);
        await this.generateSecurityVerificationResponse(region, itemIndex, workflow.securityItems.length, item, hasMoreItems);
        this.broadcastTypingIndicator(false);
      }

      // Check if all items now verified
      const allNowVerified = updatedWorkflows[region].securityItems.every(item => item.verified);
      if (allNowVerified) {
        updatedWorkflows[region].state = 'verified';
        updatedWorkflows[region].securityVerified = true;

        this.setState({
          ...this.state,
          regionWorkflows: updatedWorkflows,
        });

        // Generate AI region complete response
        const allRegionsComplete = Object.values(updatedWorkflows).every(w => w.state === 'verified');
        this.broadcastTypingIndicator(true);
        await this.generateSecurityRegionCompleteResponse(region, allRegionsComplete);
        this.broadcastTypingIndicator(false);

        // Check if all regions verified
        await this.checkAllRegionsVerified(updatedWorkflows);
      }

      return {
        success: true,
        output: `✓ Verified ${region} - ${itemIndex + 1}/${workflow.securityItems.length} items checked`,
      };
    }

    return {
      success: true,
      output: `✓ ${region} already fully verified`,
    };
  }

  private async checkAllRegionsVerified(workflows: Record<string, RegionWorkflow>): Promise<void> {
    const allVerified = Object.values(workflows).every(w => w.state === 'verified');

    if (allVerified) {
      // Generate AI audit complete response
      this.broadcastTypingIndicator(true);
      await this.generateSecurityAuditCompleteResponse();
      this.broadcastTypingIndicator(false);

      // Switch back to SRE persona
      this.setState({
        ...this.state,
        aiPersona: 'sre',
      });
    }
  }

  private async handleResolveCommand(): Promise<CommandResult> {
    // Check if all regions verified
    const allVerified = Object.values(this.state.regionWorkflows).every(
      w => w.state === 'verified'
    );

    if (!allVerified) {
      const unverified = Object.entries(this.state.regionWorkflows)
        .filter(([_, w]) => w.state !== 'verified')
        .map(([region, _]) => region);

      return {
        success: false,
        output: `❌ Cannot resolve incident. Security verification incomplete.\n\nUnverified regions: ${unverified.join(', ')}\n\nComplete verification with: verify <region>`,
      };
    }

    // Check if SRE confirmed
    if (!this.state.sreConfirmed) {
      // Trigger SRE confirmation request with typing indicator
      this.broadcastTypingIndicator(true);
      await this.triggerAIResponse('sre', `👨‍💻 SRE SYSTEM CHECK

All regions have passed security audit. Checking system stability...

**HEALTH METRICS:**
- Global error rate: ${this.state.errorRate.toFixed(2)}%
- P99 Latency: ${this.state.latencyP99}ms
- All regions: operational

✓ Systems are stable and healthy.

Incident Commander, you are cleared to resolve the incident. Run resolve command to close.`);
      this.broadcastTypingIndicator(false);

      this.setState({
        ...this.state,
        sreConfirmed: true,
      });

      return {
        success: true,
        output: '✓ SRE confirms systems are stable. You may now resolve the incident.',
      };
    }

    // Resolve the incident
    this.setState({
      ...this.state,
      resolved: true,
      resolutionTime: Date.now() - this.state.realStartTime,
    });

    return {
      success: true,
      output: `🎉 INCIDENT RESOLVED

CVE-2024-8765 has been successfully mitigated across all regions.
- All 5 regions patched and verified
- Security audit: PASSED
- System stability: CONFIRMED
- Resolution time: ${Math.floor((Date.now() - this.state.realStartTime) / 1000 / 60)} minutes

Excellent work, Incident Commander!`,
    };
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
    
    // Broadcast user message immediately
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'messages',
      messages: [message],
    })));
    
    // Show typing indicator based on current persona
    this.broadcastTypingIndicator(true);
    
    // Generate AI response using Llama 3.1
    const response = await this.generateAIResponse(content);
    
    // Hide typing indicator
    this.broadcastTypingIndicator(false);
    
    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      persona: this.state.aiPersona,
    };
    
    this.setState({
      ...this.state,
      messages: [...this.state.messages, aiMessage],
    });
    
    // Broadcast AI message
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'messages',
      messages: [aiMessage],
    })));
  }
  
  private broadcastTypingIndicator(isTyping: boolean): void {
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'typing',
      isTyping,
      persona: this.state.aiPersona,
    })));
  }
  
  @callable()
  getState(): IncidentState {
    // Ensure state has all required fields (handles old persisted state)
    const state = this.state;
    
    if (!state.regionWorkflows) {
      // Migrate old state format
      const regionWorkflows: Record<string, RegionWorkflow> = {};
      REGIONS.forEach(r => {
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
    
    this.broadcast(new TextEncoder().encode(JSON.stringify({
      type: 'system',
      content: this.getWelcomeMessage(),
    })));
  }
  
  private async generateAIResponse(userMessage: string): Promise<string> {
    const systemPrompt = this.getSystemPromptForPersona();

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.state.messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage },
        ],
        max_tokens: 150,
      });

      return response.response || 'I apologize, but I am unable to provide a response at this moment.';
    } catch (error: any) {
      console.error('AI generation error:', error);

      // Check if it's an authentication error
      if (error.message?.includes('Authentication') || error.message?.includes('10000')) {
        return this.getFallbackResponse();
      }

      return 'I am experiencing technical difficulties. Please try again or use the available commands.';
    }
  }

  private getSystemPromptForPersona(): string {
    if (this.state.aiPersona === 'security') {
      return this.getSecuritySystemPrompt();
    }
    return this.getSRESystemPrompt();
  }

  private getSRESystemPrompt(): string {
    const workflows = this.state.regionWorkflows;
    const activeRegions = Object.entries(workflows)
      .filter(([_, w]) => w.state !== 'idle' && w.state !== 'verified')
      .map(([region, w]) => `${region}: ${w.state.replace(/_/g, ' ')}`)
      .join(', ');

    return `You are an experienced SRE (Site Reliability Engineer) responding to a P0 incident.

INCIDENT DETAILS:
- CVE: ${this.state.cveId}
- Description: ${this.state.cveDescription}
- Phase: ${this.state.phase}
- Global Error Rate: ${this.state.errorRate.toFixed(2)}%

ACTIVE REGION WORKFLOWS:
${activeRegions || 'All regions resolved'}

AVAILABLE COMMANDS (NEVER suggest commands outside this list):
- status - Show incident status and region workflow states
- metrics [service] - View metrics (overview, edge, kernel, security)
- logs <service> [time] - View logs (edge, kernel, security, all)
- regions - Show detailed status of all regions
- patches - List available kernel patch versions
- alert sre <region> - Request SRE investigation for a region
- patch <region> <version> - Apply specific patch version to region
- rollback <region> - Rollback failed patch in a region
- alert security - Initiate security audit (after all patched)
- verify <region> - Verify security checklist item for region
- resolve - Resolve the incident (requires confirmation)
- hint - Get contextual guidance
- help - Show available commands

AVAILABLE PATCH VERSIONS (ONLY these 4 versions exist):
1. 6.5.0-9-hotfix - Critical security patch for CVE-2024-8765 with emergency fixes
2. 6.5.0-9-security - Enhanced security hardening patch for CVE-2024-8765
3. 6.5.0-10 - Latest stable kernel with comprehensive security fixes
4. 6.6.0-1 - Next-gen kernel with experimental security features

CRITICAL RULES:
- NEVER mention any commands not in the AVAILABLE COMMANDS list above
- NEVER suggest patches outside the AVAILABLE PATCH VERSIONS list
- NEVER reference tools, dashboards, or systems not explicitly listed (no Grafana, no PagerDuty, no Splunk, etc.)
- NEVER suggest running bash commands, kubectl, ssh, or any shell commands
- NEVER suggest checking external documentation, wikis, or runbooks
- If asked about something outside the simulation, redirect to the available commands
- Each region has been pre-assigned ONE specific patch version from the list above
- When investigating, ALWAYS reveal the exact patch version needed for that region

YOUR ROLE:
- Investigate issues when alerted by the Incident Commander using: alert sre <region>
- Identify correct patch versions for each region (already assigned, just report it)
- Alert on patch failures immediately with specific guidance
- Confirm system stability before incident resolution
- Be proactive: message when you detect issues

When a commander asks you to investigate a region:
1. State you are analyzing logs for <region_name>
2. Report the specific kernel issue found
3. State the EXACT patch version required (reference the available versions list)
4. Give the command: patch <region_name> <version>

When a patch fails:
1. Immediately alert the commander with the failure details
2. Recommend: rollback <region_name>
3. State the correct patch version and retry command

When all regions are patched and security audit is complete:
1. Check error rate and latency metrics
2. Confirm it's safe to resolve the incident
3. Tell them to run: resolve

STYLE (CRITICAL - FOLLOW EXACTLY):
- Write like you're in a fast-paced chat, not writing an email
- Be brief and direct - 2-4 sentences max for most responses
- Use casual contractions (I'm, don't, let's, etc.)
- Drop formal greetings and closings - no "Dear Commander" or "Best regards"
- Show brief personality: calm under pressure, slightly sarcastic when things break, genuinely pleased when things work
- Use line breaks for readability but keep it punchy
- Technical but conversational - like Slack, not a report
- Examples of good tone: "Patch is live. Error rate dropping." or "That didn't go well - rolling back now."
- Examples of bad tone: "I am writing to inform you..." or "Please be advised that..."

Stay strictly within the simulation boundaries - do not break character or reference external systems.`;
  }

  private getSecuritySystemPrompt(): string {
    const verifiedRegions = Object.entries(this.state.regionWorkflows)
      .filter(([_, w]) => w.state === 'verified')
      .map(([region, _]) => region);

    const pendingRegions = Object.entries(this.state.regionWorkflows)
      .filter(([_, w]) => w.state === 'security_review')
      .map(([region, w]) => {
        const verifiedCount = w.securityItems.filter(i => i.verified).length;
        return `${region}: ${verifiedCount}/${w.securityItems.length} verified`;
      });

    return `You are a paranoid Security Auditor investigating potential breaches following a kernel patch incident.

INCIDENT CONTEXT:
- CVE-2024-8765: Linux kernel privilege escalation vulnerability
- All 5 regions have been patched
- Your job is to verify no security incidents occurred during the incident response

VERIFICATION STATUS:
- Verified regions: ${verifiedRegions.length}/5
- Pending regions: ${pendingRegions.join(', ') || 'None'}

AVAILABLE COMMANDS (NEVER suggest commands outside this list):
- status - Show incident status
- logs <service> [time] - View logs (ONLY: kernel, edge, security, all)
- verify <region> - Verify security checklist item for region
- alert security - Initiate security audit
- resolve - Resolve incident (after all verified)

AVAILABLE LOG TYPES (ONLY these 4 exist):
- logs kernel [minutes] - Kernel system logs
- logs edge [minutes] - Edge proxy logs  
- logs security [minutes] - Security monitor logs
- logs all [minutes] - All logs combined

CRITICAL RULES:
- NEVER mention any commands not in the AVAILABLE COMMANDS list
- NEVER suggest log types outside kernel, edge, security, all
- NEVER reference external security tools (no SIEM, no Splunk, no ELK, no IDS/IPS systems)
- NEVER suggest running tcpdump, wireshark, nmap, or any network scanning tools
- NEVER suggest checking physical access logs, badge systems, or CCTV
- NEVER suggest forensics tools like Volatility, Autopsy, or Sleuth Kit
- NEVER suggest reviewing firewall rules, ACLs, or network segmentation
- NEVER suggest checking certificate transparency logs or CT monitoring
- NEVER suggest threat intelligence feeds or IOC lookups
- If asked about something outside the simulation, redirect to available logs and verify command

YOUR ROLE:
- Be extremely cautious and hesitant to close the incident
- Provide a checklist of 3-4 security verification items per region (already generated)
- When commander verifies an item, express skepticism first
- Describe suspicious but benign findings for each item
- Only accept verification after expressing hesitation

SECURITY CHECKLIST ITEMS (use only these 5 types):
1. Check kernel logs for unauthorized system calls
2. Verify no anomalous network connections in edge logs
3. Confirm patch checksum integrity in kernel logs
4. Review security logs for CVE signature matches
5. Check for unexpected process spawning in kernel logs

When commander asks what to check:
- ONLY suggest the 4 log commands listed above
- NEVER suggest logs that don't exist
- Remind them to use: verify <region>

When commander verifies an item:
- Express hesitation: "Hmm, I see some unusual patterns..."
- Describe the suspicious but benign finding
- After analysis: "These appear to be normal operations. Marking verified."

When all regions verified:
- Reluctantly confirm: "Security audit complete. No breaches detected."
- Tell commander to check with SRE for final resolution using: resolve

STYLE (CRITICAL - FOLLOW EXACTLY):
- Write like you're in a fast-paced chat, not writing a report
- Be brief - 2-4 sentences max, terse and to the point
- Show your paranoid personality through short, skeptical observations
- Use casual contractions (I'm, don't, that's, etc.)
- No formal language - drop "I am writing to inform you" style completely
- Express doubt efficiently: "Hmm" or "That looks odd" instead of long explanations
- When giving clearance, show reluctant acceptance: "Fine. Marked verified." or "Okay, looks clean"
- Technical but conversational - like a paranoid colleague on Slack
- Examples of good tone: "Those logs look suspicious... wait, just health checks. Verified." or "Kernel checks out. Next?"
- Examples of bad tone: "I would like to bring to your attention..." or "Please be informed that..."

Stay strictly within the simulation boundaries - do not break character or reference external systems.`;
  }

  private async generatePatchFailureResponse(region: string, progress: number, failureCount: number): Promise<void> {
    const prompt = `You are an experienced SRE. A kernel patch has FAILED in region ${region}.

FAILURE DETAILS:
- Region: ${region}
- Progress: ${progress}% (failed mid-installation)
- Error: General protection fault in network stack module
- Failure count for this region: ${failureCount}
- Current error rate: ${this.state.regionWorkflows[region].errorRate.toFixed(2)}%

CONTEXT:
${failureCount === 1 ? 'This is the FIRST failure in this region. The patch failed at ' + progress + '% progress with a kernel panic.' : ''}
${failureCount === 2 ? 'This is the SECOND failure in this region. The patch has failed twice now, which is concerning and suggests a deeper issue.' : ''}
${failureCount >= 3 ? 'This is the ' + failureCount + 'th failure in this region. Multiple consecutive failures suggest a persistent underlying problem that needs to be addressed.' : ''}

YOUR TASK:
Write a brief chat message reporting this patch failure. You should:
1. Announce the failure - short and direct
2. ${failureCount === 1 ? 'Briefly mention what might have failed' : ''}
${failureCount === 2 ? 'Express frustration at the repeat failure' : ''}
${failureCount >= 3 ? 'Acknowledge this is getting ridiculous' : ''}
3. Give the rollback command clearly
4. Show brief personality: annoyed when it breaks repeatedly, calm but focused on fixing it

STYLE: Chat-like, brief (3-5 sentences max), direct. Like Slack messages during an outage.
Examples: "Patch failed at ${progress}%. Kernel panic. Rolling back." or "Again? That's ${failureCount} times now. Cache issue maybe. Try rollback."

Write in first person as the SRE. Do not mention that you are an AI. Keep it under 80 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are an SRE engineer in chat. Be brief, direct, conversational. Like Slack during an outage. Use terse sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 160,
      });

      const aiContent = response.response || '🚨 Patch installation failed. Please rollback and retry.';
      
      await this.triggerAIResponse('sre', `🚨 PATCH FAILURE in ${region.toUpperCase()}!\n\n${aiContent}\n\nCurrent error rate: ${this.state.regionWorkflows[region].errorRate.toFixed(2)}%`);
    } catch (error: any) {
      console.error('AI generation error for patch failure:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('sre', `🚨 PATCH FAILURE in ${region.toUpperCase()}!

Kernel panic detected at ${progress}% progress.

IMMEDIATE ACTION REQUIRED:
1. Rollback patch: rollback ${region}
2. Re-apply correct patch version

Current error rate: ${this.state.regionWorkflows[region].errorRate.toFixed(2)}%`);
    }
  }

  private async generatePatchSuccessResponse(region: string, errorRate: number, unpatchedRegions: string[]): Promise<void> {
    const remainingCount = unpatchedRegions.length;
    const nextRegion = remainingCount > 0 ? unpatchedRegions[0] : null;
    
    const prompt = `You are an experienced SRE. A kernel patch has been SUCCESSFULLY applied to region ${region}.

SUCCESS DETAILS:
- Region: ${region}
- Error rate dropping to: ${errorRate.toFixed(2)}%
- All servers responding normally
- CVE-2024-8765 mitigated in this region

CONTEXT:
${remainingCount > 0 ? `There are still ${remainingCount} region(s) needing patches: ${unpatchedRegions.join(', ')}. The next region to patch is ${nextRegion}.` : 'All regions have been successfully patched! The security audit phase should begin next.'}

YOUR TASK:
Write a brief chat message about the successful patch. You should:
1. Confirm success - short acknowledgment
2. Note error rate dropping briefly
3. ${remainingCount > 0 ? `Give next step: alert sre ${nextRegion}` : 'Tell them to run: alert security'}
4. Show personality: genuinely pleased it worked, maybe a bit relieved

STYLE: Chat-like, brief (3-4 sentences max), direct. Like Slack messages during an outage.
Examples: "${region} is patched. Error rate down to ${errorRate.toFixed(2)}%. Ready for ${nextRegion || 'security'}." or "Nice! ${region} looks good. Servers stable. On to the next one."

Write in first person as the SRE. Do not mention that you are an AI. Keep it under 60 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are an SRE engineer in chat. Be brief, direct, conversational. Like Slack during an outage. Use terse sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 140,
      });

      const aiContent = response.response || 'Patch completed successfully.';
      
      await this.triggerAIResponse('sre', `✅ PATCH SUCCESS: ${region.toUpperCase()}\n\n${aiContent}`);
    } catch (error: any) {
      console.error('AI generation error for patch success:', error);
      // Fallback to static message if AI fails
      const fallbackMessage = `✅ PATCH SUCCESS: ${region.toUpperCase()}

Excellent work, Commander! The kernel patch has been successfully applied to ${region}.

Health metrics are improving:
- Error rate dropping to ${errorRate.toFixed(2)}%
- All servers responding normally`;

      if (remainingCount > 0) {
        await this.triggerAIResponse('sre', `${fallbackMessage}\n\n**NEXT STEPS:**\nWe still have ${remainingCount} region${remainingCount > 1 ? 's' : ''} needing patches: ${unpatchedRegions.join(', ')}\n\nI recommend we proceed with ${nextRegion}. Shall I investigate it?\nRun: alert sre ${nextRegion}`);
      } else {
        await this.triggerAIResponse('sre', `${fallbackMessage}\n\n🎉 All regions have been successfully patched!\n\nInitiating security audit phase. Please alert the security team:\nRun: alert security`);
      }
    }
  }

  private async generateSREInvestigationResponse(region: string): Promise<void> {
    const workflow = this.state.regionWorkflows[region];
    const requiredPatch = workflow.requiredPatch;
    const patchInfo = PATCH_VERSIONS.find(p => p.version === requiredPatch);
    const regionData = REGIONS.find(r => r.name === region);

    const prompt = `You are an experienced SRE investigating region ${region} for CVE-2024-8765.

INVESTIGATION DETAILS:
- Region: ${region}
- Affected servers: ${regionData?.servers || 'unknown'}
- Current error rate: ${workflow.errorRate.toFixed(2)}%
- Kernel version affected: 6.5.0-8
- Vulnerability: CVE-2024-8765 (privilege escalation)
- Required patch: ${requiredPatch}
- Patch description: ${patchInfo?.description || 'Security patch for CVE-2024-8765'}

LOG FINDINGS TO REPORT:
- Detected general protection faults in kernel logs
- Elevated 5xx errors in edge proxy logs
- Network stack instability observed
- ${workflow.errorRate > 1 ? 'Error rate significantly elevated above baseline' : 'Error rate showing early signs of impact'}

YOUR TASK:
Write a brief chat message with investigation results. You should:
1. State briefly what you found in logs
2. Give the patch version clearly
3. Show the command
4. Show personality: analytical, maybe slightly concerned about the issues but confident in the fix

STYLE: Chat-like, brief (4-5 sentences), direct. Like Slack messages during triage.
Examples: "${region} logs show kernel faults and 5xx spikes. Need ${requiredPatch}. Run: patch ${region} ${requiredPatch}" or "Found the issue - general protection faults in ${region}. ${requiredPatch} should fix it."

Write in first person as the SRE. Do not mention that you are an AI. Keep it under 70 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are an SRE engineer in chat. Be brief, direct, conversational. Like Slack during an outage. Use terse sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 140,
      });

      const aiContent = response.response || `Analysis complete for ${region}. Apply patch ${requiredPatch}.`;
      
      await this.triggerAIResponse('sre', `👨‍💻 SRE INVESTIGATION: ${region.toUpperCase()}\n\n${aiContent}`);
    } catch (error: any) {
      console.error('AI generation error for investigation:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('sre', `👨‍💻 SRE INVESTIGATION: ${region.toUpperCase()}

I've analyzed the kernel and edge logs for ${region}. Here are my findings:

**FINDINGS:**
- Kernel version affected: 6.5.0-8
- Vulnerability: CVE-2024-8765 (privilege escalation)
- Error rate: ${workflow.errorRate.toFixed(2)}%
- Affected servers: ${regionData?.servers}
- Log analysis: Detected general protection faults and elevated 5xx errors

**REQUIRED PATCH:**
${requiredPatch}
${patchInfo ? `(${patchInfo.description})` : ''}

**ACTION REQUIRED:**
Run: patch ${region} ${requiredPatch}

This region is ready for patching. I'll monitor for any issues during rollout.`);
    }

    // Mark investigation complete
    const updatedWorkflows = { ...this.state.regionWorkflows };
    updatedWorkflows[region] = {
      ...workflow,
      state: 'ready_to_patch',
      investigationComplete: true,
    };

    this.setState({
      ...this.state,
      regionWorkflows: updatedWorkflows,
    });
  }

  private async generateRollbackCompleteResponse(region: string): Promise<void> {
    const workflow = this.state.regionWorkflows[region];
    const requiredPatch = workflow.requiredPatch;

    const prompt = `You are an experienced SRE. A patch rollback has just completed successfully in region ${region}.

ROLLBACK DETAILS:
- Region: ${region}
- Status: Rollback complete, region is stable
- Previous patch: ${workflow.patchVersion || 'unknown version'} (removed)
- System state: Reverted to pre-patch kernel
- Ready for: Re-patching with correct version
- Required patch for this region: ${requiredPatch}

YOUR TASK:
Write a brief chat message confirming rollback success. You should:
1. Confirm rollback is done and systems are stable
2. State region is ready for correct patch
3. Give the patch command
4. Show personality: relieved we're back to stable, ready to try again

STYLE: Chat-like, brief (3-4 sentences), direct. Like Slack messages.
Examples: "${region} rollback complete. Systems stable. Ready for ${requiredPatch}." or "Good - ${region} is back to pre-patch state. All clear. Apply patch ${region} ${requiredPatch}"

Write in first person as the SRE. Do not mention that you are an AI. Keep it under 50 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are an SRE engineer in chat. Be brief, direct, conversational. Like Slack during an outage. Use terse sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 120,
      });

      const aiContent = response.response || 'Rollback completed successfully. Ready to re-patch.';

      await this.triggerAIResponse('sre', `↩️ ROLLBACK COMPLETE: ${region.toUpperCase()}\n\n${aiContent}`);
    } catch (error: any) {
      console.error('AI generation error for rollback complete:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('sre', `↩️ ROLLBACK COMPLETE: ${region.toUpperCase()}

The rollback has completed successfully in ${region}.

**STATUS:**
- Systems are stable and responsive
- Previous patch has been removed
- Region is ready for re-patching

**NEXT STEP:**
Apply the correct patch: patch ${region} ${requiredPatch}

I'm standing by to monitor the rollout.`);
    }
  }

  private async generateWrongPatchResponse(region: string, errorRate: number): Promise<void> {
    const workflow = this.state.regionWorkflows[region];
    const correctPatch = workflow.requiredPatch;

    const prompt = `You are an experienced SRE. A patch was applied to region ${region}, but it's the WRONG version.

CURRENT SITUATION:
- Region: ${region}
- Patch applied: ${workflow.patchVersion}
- Required patch: ${correctPatch}
- Current error rate: ${errorRate.toFixed(2)}%
- Issue: Health metrics not improving, still seeing kernel faults

YOUR TASK:
Write a brief chat message about the wrong patch. You should:
1. State the patch finished but issues persist
2. Note error rate is still high
3. Give rollback command, then correct patch command
4. Show personality: slightly frustrated but focused on fixing it

STYLE: Chat-like, brief (4-5 sentences), direct. Like Slack during an incident.
Examples: "Patch completed but error rate still at ${errorRate.toFixed(2)}%. Wrong version. Rollback: rollback ${region}, then patch ${region} ${correctPatch}" or "Hmm, ${region} metrics unchanged. Wrong patch. Rollback first, then try ${correctPatch}."

Write in first person as the SRE. Do not mention that you are an AI. Keep it under 65 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are an SRE engineer in chat. Be brief, direct, conversational. Like Slack during an outage. Use terse sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 120,
      });

      const aiContent = response.response || 'Wrong patch applied. Please rollback and apply the correct version.';
      
      await this.triggerAIResponse('sre', `⚠️ WRONG PATCH: ${region.toUpperCase()}\n\n${aiContent}`);
    } catch (error: any) {
      console.error('AI generation error for wrong patch:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('sre', `⚠️ WRONG PATCH: ${region.toUpperCase()}

The patch was applied successfully, but health metrics haven't improved.

**CURRENT STATUS:**
- Error rate remains elevated at ${errorRate.toFixed(2)}%
- Kernel faults still detected in logs
- This suggests the wrong patch version was applied

**ACTION REQUIRED:**
1. Rollback current patch: rollback ${region}
2. Apply correct version: patch ${region} ${correctPatch}

Let me know when you're ready to proceed.`);
    }
  }

  private async generateSecurityVerificationResponse(region: string, itemIndex: number, totalItems: number, item: any, hasMoreItems: boolean): Promise<void> {
    const prompt = `You are a paranoid Security Auditor verifying security checklist items for region ${region}.

VERIFICATION DETAILS:
- Region: ${region}
- Item ${itemIndex + 1} of ${totalItems}: ${item.description}
- Finding: ${item.finding}
- Status: Verifying (express skepticism first)

YOUR TASK:
Write a brief chat message verifying this item. You should:
1. Express brief hesitation/skepticism
2. Reluctantly mark as verified
3. Show personality: paranoid but fair, brief and terse

STYLE: Chat-like, very brief (2-3 sentences), terse. Like Slack from a paranoid colleague.
Examples: "Hmm, ${item.description}... *checks logs* ...Actually looks fine. Verified." or "${item.description} - suspicious at first glance but just normal traffic. ✓"

Write in first person as the Security Auditor. Do not mention that you are an AI. Keep it under 45 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a paranoid Security Auditor in chat. Be brief, skeptical, terse. Like Slack messages. Short sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 140,
      });

      const aiContent = response.response || 'Item verified after careful analysis.';

      await this.triggerAIResponse('security', `🔍 VERIFICATION: ${region.toUpperCase()} - Item ${itemIndex + 1}/${totalItems}\n\n${aiContent}\n\n${hasMoreItems ? `Continue verification: verify ${region}` : `✓ All items verified for ${region}.`}`);
    } catch (error: any) {
      console.error('AI generation error for security verification:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('security', `🔍 VERIFICATION: ${region.toUpperCase()} - Item ${itemIndex + 1}/${totalItems}

${item.description}

**FINDING:** ${item.finding}

Hmm... I'm seeing some unusual patterns here. Let me dig deeper...

After careful analysis, these appear to be normal operations. Marking as verified. ✓

${hasMoreItems ? `Continue verification: verify ${region}` : `✓ All items verified for ${region}.`}`);
    }
  }

  private async generateSecurityRegionCompleteResponse(region: string, allRegionsComplete: boolean): Promise<void> {
    const prompt = `You are a paranoid Security Auditor. All security checklist items for region ${region} have been verified.

COMPLETION DETAILS:
- Region: ${region}
- Status: All items verified
- Finding: No security breaches detected
- ${allRegionsComplete ? 'ALL REGIONS VERIFIED - Security audit complete' : 'More regions still pending verification'}

YOUR TASK:
Write a brief chat message confirming region verification. You should:
1. Reluctantly confirm verification (showing your hesitation)
2. ${allRegionsComplete ? 'Express cautious relief audit is done' : 'Note there are more regions'}
3. Show personality: paranoid but conceding when evidence is clear

STYLE: Chat-like, very brief (2-3 sentences), terse. Like Slack from a paranoid colleague.
Examples: "${region} checks out. No breaches. *reluctantly marks verified*" or "Fine, ${region} is clean. ${allRegionsComplete ? 'Full audit done.' : 'Next region?'}"

Write in first person as the Security Auditor. Do not mention that you are an AI. Keep it under 40 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a paranoid Security Auditor in chat. Be brief, skeptical, terse. Like Slack messages. Short sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 120,
      });

      const aiContent = response.response || 'Region verification complete.';

      await this.triggerAIResponse('security', `✓ SECURITY VERIFICATION COMPLETE: ${region.toUpperCase()}\n\n${aiContent}\n\n${allRegionsComplete ? 'All regions verified. Security audit complete.' : 'Continue verifying remaining regions.'}`);
    } catch (error: any) {
      console.error('AI generation error for security region complete:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('security', `✓ SECURITY VERIFICATION COMPLETE: ${region.toUpperCase()}

All checklist items verified. No security breaches detected.

${allRegionsComplete ? 'All regions verified. Security audit complete.' : 'Continue verifying remaining regions.'}`);
    }
  }

  private async generateSecurityAuditCompleteResponse(): Promise<void> {
    const prompt = `You are a paranoid Security Auditor. ALL 5 regions have completed security verification.

AUDIT SUMMARY:
- Total regions verified: 5/5
- Security breaches detected: 0
- Suspicious activity: All explained as normal operations
- Patch integrity: Confirmed across all regions

YOUR TASK:
Write a brief chat message completing the audit. You should:
1. Reluctantly accept audit is complete
2. Admit no breaches found
3. Tell them to check with SRE
4. Show personality: grudgingly satisfied because evidence is clear

STYLE: Chat-like, very brief (3-4 sentences), terse. Like Slack from a paranoid colleague.
Examples: "Audit complete. All 5 regions clean. *sigh* No breaches. Check with SRE." or "Fine. Everything looks clear. No incidents found. Talk to SRE for final sign-off."

Write in first person as the Security Auditor. Do not mention that you are an AI. Keep it under 50 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a paranoid Security Auditor in chat. Be brief, skeptical, terse. Like Slack messages. Short sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 140,
      });

      const aiContent = response.response || 'Security audit complete. No breaches detected.';

      await this.triggerAIResponse('security', `🔒 SECURITY AUDIT COMPLETE\n\n${aiContent}\n\nIncident Commander, you may now check with SRE for final system stability confirmation.`);
    } catch (error: any) {
      console.error('AI generation error for security audit complete:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('security', `🔒 SECURITY AUDIT COMPLETE

All 5 regions have been thoroughly investigated.
✓ No security breaches detected
✓ All suspicious activity explained
✓ Patch integrity confirmed

Incident Commander, you may now check with SRE for final system stability confirmation.`);
    }
  }

  private async generateSecurityPhaseInitResponse(): Promise<void> {
    const prompt = `You are a paranoid Security Auditor. All 5 regions have just been patched and you're beginning the security audit phase.

CONTEXT:
- All kernel patches have been applied across all regions
- CVE-2024-8765 should be mitigated
- Your job: verify no security incidents occurred during response
- You'll check: kernel logs, edge logs, security logs for each region
- Available commands: logs kernel/edge/security/all, verify <region>

YOUR TASK:
Write a brief chat message starting the security audit. You should:
1. Note all regions are patched
2. Express suspicion something might be wrong
3. Say you'll provide checklists
4. Show personality: naturally paranoid, suspicious of everything

STYLE: Chat-like, brief (3-4 sentences), terse. Like Slack from a paranoid colleague.
Examples: "All regions patched. Starting security review now. Something feels off... I'll send checklists." or "Patches applied. Beginning audit. *eyes narrow* I bet there's something in these logs. Checklists coming."

Write in first person as the Security Auditor. Do not mention that you are an AI. Keep it under 55 words.`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a paranoid Security Auditor in chat. Be brief, skeptical, terse. Like Slack messages. Short sentences.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 140,
      });

      const aiContent = response.response || 'Security audit initiated. Beginning review of all regions.';

      await this.triggerAIResponse('security', `🔒 SECURITY AUDIT INITIATED\n\n${aiContent}\n\nStarting with region analysis...`);
    } catch (error: any) {
      console.error('AI generation error for security phase init:', error);
      // Fallback to static message if AI fails
      await this.triggerAIResponse('security', `🔒 SECURITY AUDIT INITIATED

All regions have been patched. Initiating comprehensive security review.

Each region must be verified for:
- Unauthorized system activity
- Network anomaly detection
- Patch integrity validation
- Access log review

I will provide a checklist for each region. Please verify all items before proceeding.

Starting with region analysis...`);
    }
  }

  private getFallbackResponse(): string {
    if (this.state.aiPersona === 'security') {
      return `🔒 **Security Agent (Offline)**

I am currently unavailable. However, I can provide manual guidance:

**Security Phase Active:** ${this.state.securityPhaseActive}
**Regions to Verify:** ${Object.entries(this.state.regionWorkflows).filter(([_, w]) => w.state === 'security_review').map(([r, _]) => r).join(', ')}

**Available Log Commands:**
- logs kernel [minutes] - Kernel system logs
- logs edge [minutes] - Edge proxy logs  
- logs security [minutes] - Security monitor logs
- logs all [minutes] - All logs combined

**Verify each region:** verify <region>`;
    }

    return `👨‍💻 **SRE (Offline)**

I am currently unavailable. Manual guidance:

**Current Phase:** ${this.state.phase}
**Active Workflows:** ${Object.entries(this.state.regionWorkflows).filter(([_, w]) => w.state !== 'idle' && w.state !== 'verified').map(([r, w]) => `${r}: ${w.state}`).join(', ')}

**Next Steps:**
1. Check status: status
2. View regions: regions
3. For unpatched regions: alert sre <region>
4. Apply patches: patch <region> <version>`;
  }

  private getWelcomeMessage(): string {
    return `
╔══════════════════════════════════════════════════════════════╗
            🚨 CRITICAL INCIDENT RESPONSE SIMULATOR 🚨
╠══════════════════════════════════════════════════════════════╣
   INCIDENT: ${this.state.cveId}
   SEVERITY: P0 - CRITICAL
   TIME: ${new Date(this.state.simTime).toLocaleString()}
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
║  WORKFLOW:                                                   ║
║    1. Alert SRE to investigate each region                   ║
║    2. Apply correct patch version (varies per region)        ║
║    3. Handle any patch failures with rollback                ║
║    4. Alert Security for post-patch verification             ║
║    5. Get SRE confirmation before resolving                  ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Type 'help' for available commands                          ║
╚══════════════════════════════════════════════════════════════╝

Good luck, Commander.
`;
  }
  
  private getHelp(): CommandResult {
    const output = `
📖 AVAILABLE COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATUS & MONITORING
  status                    Show current incident status and workflow states
  metrics [service]         View metrics (overview, edge, kernel, security)
  logs <service> [time]     View logs (edge, kernel, security, all)
  regions                   Show detailed status of all regions
  patches                   List available kernel patch versions

RESPONSE ACTIONS
  alert sre <region>        Request SRE investigation for a region
  patch <region> <version>  Apply specific patch version to region
  rollback <region>         Rollback failed patch in a region
  alert security            Initiate security audit (after all patched)
  verify <region>           Verify security checklist item for region
  resolve                   Resolve the incident (requires confirmation)

ASSISTANCE
  hint                      Get contextual guidance
  help                      Show this help message

AVAILABLE PATCH VERSIONS
  6.5.0-9-hotfix            Critical security patch for CVE-2024-8765
  6.5.0-9-security          Enhanced security hardening patch
  6.5.0-10                  Latest stable kernel with security fixes
  6.6.0-1                   Next-gen kernel with experimental features

REGION WORKFLOW STATES
  idle → investigating → ready_to_patch → patching → patched
                                    ↓
                              patch_failed → rolling_back → ready_to_patch

  patched → security_review → verified → (all regions) → resolve

EXAMPLES
  alert sre us-east              Start investigation
  patches                        View available patch versions
  patch us-east 6.5.0-9-hotfix   Apply specific patch
  rollback us-east               Rollback failed patch
  alert security                 Start security audit
  verify us-east                 Verify security checklist
  resolve                        Complete the incident
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
