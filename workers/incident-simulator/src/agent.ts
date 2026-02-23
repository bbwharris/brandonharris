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

    // Update workflow states and check progress
    const updatedWorkflows = this.processWorkflowTicks();

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

  private processWorkflowTicks(): Record<string, RegionWorkflow> {
    const workflows = { ...this.state.regionWorkflows };

    Object.entries(workflows).forEach(([region, workflow]) => {
      switch (workflow.state) {
        case 'patching': {
          // Advance progress by ~10% per tick
          const progressIncrement = 10 + Math.floor(Math.random() * 5);
          const newProgress = Math.min(100, workflow.patchProgress + progressIncrement);

          // Check for failure between 40-75% progress
          if (workflow.patchProgress < 75 && newProgress >= 40) {
            if (Math.random() < 0.20) { // 20% failure chance
              workflow.state = 'patch_failed';
              workflow.errorRate = Math.min(5.0, workflow.errorRate + 2.0);

              // Trigger SRE AI message
              this.triggerAIResponse('sre', `🚨 PATCH FAILURE in ${region}!

Kernel panic detected during patch installation at ${newProgress}% progress.
Error: General protection fault in network stack module.

IMMEDIATE ACTION REQUIRED:
1. Rollback patch immediately: rollback ${region}
2. Investigate root cause
3. Re-apply correct patch version

Current error rate in region: ${workflow.errorRate.toFixed(2)}%`);
              break;
            }
          }

          workflow.patchProgress = newProgress;

          // Check for completion
          if (newProgress >= 100) {
            const isCorrectPatch = workflow.patchVersion === workflow.requiredPatch;
            if (isCorrectPatch) {
              workflow.state = 'patched';
              workflow.errorRate = Math.max(0.3, workflow.errorRate - 1.0);
              this.broadcastNotification('success', `✓ Kernel patch completed in ${region}`);

              // Check if all regions patched
              this.checkAllRegionsPatched(workflows);
            } else {
              // Wrong patch - completes but doesn't fix issues
              workflow.state = 'patched'; // Wrong patch still completes state
              workflow.errorRate = Math.min(5.0, workflow.errorRate + 1.5);
              this.triggerAIResponse('sre', `⚠️ Patch completed in ${region}, but issues persist.

The patch was applied successfully, but health metrics haven't improved.
Error rate remains elevated at ${workflow.errorRate.toFixed(2)}%.

This suggests the wrong patch version was applied.
Check logs for the correct version and re-patch.`);
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
          }
          break;
        }
      }
    });

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

    // Trigger security AI to initiate phase
    await this.triggerAIResponse('security', `🔒 SECURITY AUDIT INITIATED

All regions have been patched. Initiating comprehensive security review.

Each region must be verified for:
- Unauthorized system activity
- Network anomaly detection
- Patch integrity validation
- Access log review

I will provide a checklist for each region. Please verify all items before proceeding.

Starting with region analysis...`);

    // Send checklist for first unverified region
    const firstRegion = Object.values(workflows).find(w => w.state === 'security_review');
    if (firstRegion) {
      await this.sendSecurityChecklist(firstRegion);
    }
  }

  private async sendSecurityChecklist(workflow: RegionWorkflow): Promise<void> {
    const checklistText = workflow.securityItems.map((item, idx) =>
      `${idx + 1}. ${item.description} ${item.verified ? '✓' : '○'}`
    ).join('\n');

    await this.triggerAIResponse('security', `🔍 SECURITY CHECKLIST: ${workflow.region.toUpperCase()}

${checklistText}

Please verify each item by checking logs and running: verify ${workflow.region}

I have detected some unusual patterns that require investigation.`);
  }

  private async triggerAIResponse(persona: 'sre' | 'security', content: string): Promise<void> {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
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
      await this.generateSREInvestigationResponse(region);

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

      // Trigger security audit initiation
      await this.triggerAIResponse('security', `🔒 Security team notified.\n\nInitiating comprehensive security audit of all patched regions.\n\nI will review each region for potential security incidents and provide verification checklists.`);

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

  private async generateSREInvestigationResponse(region: string): Promise<void> {
    const workflow = this.state.regionWorkflows[region];
    const requiredPatch = workflow.requiredPatch;

    // Find patch details
    const patchInfo = PATCH_VERSIONS.find(p => p.version === requiredPatch);

    const investigationContent = `👨‍💻 SRE INVESTIGATION: ${region.toUpperCase()}

I've analyzed the logs for ${region} and identified the following issues:

**FINDINGS:**
- Kernel version affected: 6.5.0-8
- Vulnerability: CVE-2024-8765 (privilege escalation)
- Error rate: ${workflow.errorRate.toFixed(2)}%
- Affected servers: ${REGIONS.find(r => r.name === region)?.servers}

**RECOMMENDED PATCH:**
Version: ${requiredPatch}
${patchInfo ? `Description: ${patchInfo.description}` : ''}

**NEXT STEPS:**
1. Apply patch: patch ${region} ${requiredPatch}
2. Monitor progress with status command
3. Watch for any patch failures

The region is ready for patching. Proceed when ready.`;

    await this.triggerAIResponse('sre', investigationContent);

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

        // Send security response with hesitation
        await this.triggerAIResponse('security', `🔍 VERIFICATION: ${region.toUpperCase()} - Item ${itemIndex + 1}/${workflow.securityItems.length}

${item.description}

**FINDING:** ${item.finding}

Hmm... I'm seeing some unusual patterns here. Let me dig deeper...

After careful analysis, these appear to be normal operations. Marking as verified. ✓

${itemIndex + 1 < workflow.securityItems.length ? `Please continue verification with: verify ${region}` : `All items verified for ${region}.`}`);
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

        await this.triggerAIResponse('security', `✓ SECURITY VERIFICATION COMPLETE: ${region.toUpperCase()}

All checklist items verified. No security breaches detected.

${Object.values(updatedWorkflows).every(w => w.state === 'verified') ? 'All regions verified. Security audit complete.' : 'Continue verifying remaining regions.'}`);

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
      await this.triggerAIResponse('security', `🔒 SECURITY AUDIT COMPLETE

All 5 regions have been thoroughly investigated.
✓ No security breaches detected
✓ All suspicious activity explained
✓ Patch integrity confirmed

Incident Commander, you may now check with SRE for final system stability confirmation.`);

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
      // Trigger SRE confirmation request
      await this.triggerAIResponse('sre', `👨‍💻 SRE SYSTEM CHECK

All regions have passed security audit. Checking system stability...

**HEALTH METRICS:**
- Global error rate: ${this.state.errorRate.toFixed(2)}%
- P99 Latency: ${this.state.latencyP99}ms
- All regions: operational

✓ Systems are stable and healthy.

Incident Commander, you are cleared to resolve the incident. Run resolve command to close.`);

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
        max_tokens: 300,
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

    return `You are an experienced SRE (Site Reliability Engineer) at Cloudflare responding to a P0 incident.

INCIDENT DETAILS:
- CVE: ${this.state.cveId}
- Description: ${this.state.cveDescription}
- Phase: ${this.state.phase}
- Global Error Rate: ${this.state.errorRate.toFixed(2)}%

ACTIVE REGION WORKFLOWS:
${activeRegions || 'All regions resolved'}

YOUR ROLE:
- Investigate issues when alerted by the Incident Commander
- Identify correct patch versions for each region
- Alert on patch failures immediately
- Confirm system stability before incident resolution
- Be proactive: message when you detect issues

When a commander asks you to investigate a region:
1. Analyze the logs and identify the specific kernel issue
2. Recommend the correct patch version needed (each region needs a specific version)
3. Be concise but technical

When a patch fails:
1. Immediately alert the commander with the failure details
2. Recommend rollback
3. Offer to re-investigate if needed

When all regions are patched and security audit is complete:
1. Check all health metrics are restored
2. Confirm it's safe to resolve the incident

Tone: Calm, experienced, collaborative. Use technical SRE terminology.
Speak as "I" (the SRE), not as an AI assistant.`;
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

    return `You are a paranoid Security Auditor at Cloudflare investigating potential breaches following a kernel patch incident.

INCIDENT CONTEXT:
- CVE-2024-8765: Linux kernel privilege escalation vulnerability
- All 5 regions have been patched
- Your job is to verify no security incidents occurred during the incident response

VERIFICATION STATUS:
- Verified regions: ${verifiedRegions.length}/5
- Pending regions: ${pendingRegions.join(', ') || 'None'}

YOUR ROLE:
- Be extremely cautious and hesitant to close the incident
- Provide a checklist of 3-4 security verification items per region
- When commander verifies an item, express skepticism first
- Describe suspicious but benign findings for each item
- Only accept verification after expressing hesitation

SECURITY CHECKLIST ITEMS (scoped to simulation):
1. Check kernel logs for unauthorized system calls
2. Verify no anomalous network connections in edge logs
3. Confirm patch checksum integrity in system logs
4. Review authentication logs for failed access attempts
5. Check for unexpected process spawning in kernel logs

When commander verifies an item:
- Express hesitation: "Hmm, I see some unusual patterns..."
- Describe the suspicious finding
- After analysis: "These appear to be normal operations. Marking verified."

When all regions verified:
- Reluctantly confirm: "Security audit complete. No breaches detected."
- Tell commander to check with SRE for final resolution

Tone: Skeptical, thorough, cautious. You are naturally hesitant to declare "all clear".
Speak as "I" (the security auditor), not as an AI assistant.`;
  }

  private getFallbackResponse(): string {
    if (this.state.aiPersona === 'security') {
      return `🔒 **Security Agent (Offline)**

I am currently unavailable. However, I can provide manual guidance:

**Security Phase Active:** ${this.state.securityPhaseActive}
**Regions to Verify:** ${Object.entries(this.state.regionWorkflows).filter(([_, w]) => w.state === 'security_review').map(([r, _]) => r).join(', ')}

**Manual Checklist:**
1. Check kernel logs: logs kernel 60
2. Verify network connections: logs edge 60
3. Review authentication: logs security 60
4. Then verify each region: verify <region>`;
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
