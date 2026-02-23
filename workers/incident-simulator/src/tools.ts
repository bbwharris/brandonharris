import type { CommandResult, Metrics, Region, IncidentState } from './types';
import { REGIONS, TOTAL_SERVERS, getLogMessages, CVE_DETAILS, HINTS } from './scenario';

export class IncidentTools {
  private state: IncidentState;
  
  constructor(state: IncidentState) {
    this.state = state;
  }
  
  getStatus(): CommandResult {
    const patchedCount = Object.values(this.state.patchStatus).filter(
      s => s === 'complete'
    ).length;
    
    const inProgressCount = Object.values(this.state.patchStatus).filter(
      s => s === 'in_progress'
    ).length;
    
    let output = `\nINCIDENT STATUS - ${this.state.cveId}\n`;
    output += `${'='.repeat(31 + this.state.cveId.length)}\n\n`;
    output += `Phase:            ${this.state.phase.toUpperCase()}\n`;
    output += `Severity:         ${this.state.severity}\n`;
    output += `Simulated Time:   ${new Date(this.state.simTime).toLocaleString()}\n`;
    output += `Affected Servers: ${this.state.affectedServers}\n`;
    output += `Patched:          ${patchedCount}/${REGIONS.length} regions\n`;
    output += `In Progress:      ${inProgressCount} regions\n`;
    output += `Error Rate:       ${this.state.errorRate.toFixed(2)}%\n`;
    output += `P99 Latency:      ${this.state.latencyP99}ms\n`;
    output += `Traffic:          ${(this.state.trafficVolume / 1000000).toFixed(1)}M req/s\n`;
    
    if (this.state.exploitationDetected) {
      output += `\n⚠️  WARNING: Exploitation attempts detected in logs`;
    }
    
    return {
      success: true,
      output,
      metrics: this.getCurrentMetrics(),
    };
  }
  
  getMetrics(service: string): CommandResult {
    let output = `\n📊 METRICS: ${service.toUpperCase()}\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (service === 'overview' || service === 'all') {
      output += `Global Metrics:\n`;
      output += `  Error Rate:     ${this.state.errorRate.toFixed(2)}% ${this.getErrorTrend()}\n`;
      output += `  P99 Latency:    ${this.state.latencyP99}ms ${this.getLatencyTrend()}\n`;
      output += `  Traffic:        ${(this.state.trafficVolume / 1000000).toFixed(1)}M req/s\n`;
      output += `  Health Score:   ${this.getHealthScore()}%\n\n`;
    }
    
    output += `Regional Breakdown:\n`;
    REGIONS.forEach(region => {
      const status = this.state.patchStatus[region.name];
      const statusIcon = status === 'complete' ? '✓' : status === 'in_progress' ? '⟳' : '○';
      const healthIcon = this.getRegionHealthIcon(region.name);
      output += `  ${statusIcon} ${region.name.padEnd(12)} ${region.servers} servers ${healthIcon}\n`;
    });
    
    return {
      success: true,
      output,
      metrics: this.getCurrentMetrics(),
      regions: this.getRegionList(),
    };
  }
  
  getLogs(service: string, timeframe: string): CommandResult {
    const logs = getLogMessages(service, 'all', timeframe);
    
    let output = `\n📋 LOGS: ${service.toUpperCase()} (last ${timeframe})\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (logs.length === 0) {
      output += `No logs found for ${service} in the specified timeframe.\n`;
    } else {
      logs.forEach(log => {
        const icon = log.level === 'ERROR' || log.level === 'FATAL' ? '🔴' :
                     log.level === 'WARN' ? '🟡' : '🔵';
        output += `${icon} [${log.level}] ${log.timestamp}\n`;
        output += `   ${log.service} / ${log.region}\n`;
        output += `   ${log.message}\n\n`;
      });
    }
    
    return {
      success: true,
      output,
      logs,
    };
  }
  
  getRegionStatus(): CommandResult {
    let output = `\n🌍 REGIONAL STATUS\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    REGIONS.forEach(region => {
      const status = this.state.patchStatus[region.name];
      const statusText = status.toUpperCase().replace('_', ' ');
      output += `${region.name.toUpperCase()}\n`;
      output += `  Servers:  ${region.servers}\n`;
      output += `  Status:   ${statusText}\n`;
      output += `  Health:   ${this.getRegionHealth(region.name)}\n\n`;
    });
    
    return {
      success: true,
      output,
      regions: this.getRegionList(),
    };
  }
  
  async patchRegion(region: string): Promise<CommandResult> {
    if (!REGIONS.find(r => r.name === region)) {
      return {
        success: false,
        output: `❌ Region '${region}' not found. Available regions: ${REGIONS.map(r => r.name).join(', ')}`,
      };
    }
    
    const currentStatus = this.state.patchStatus[region];
    if (currentStatus === 'complete') {
      return {
        success: false,
        output: `ℹ️  Region '${region}' is already patched.`,
      };
    }
    
    if (currentStatus === 'in_progress') {
      return {
        success: false,
        output: `⏳ Patch already in progress for '${region}'. Use 'status' to check progress.`,
      };
    }
    
    // Simulate patching process
    this.state.patchStatus[region] = 'in_progress';
    
    return {
      success: true,
      output: `🚀 Initiated kernel patch rollout for ${region}\n\n` +
              `Target: ${CVE_DETAILS.patchedKernel}\n` +
              `Affected servers: ${REGIONS.find(r => r.name === region)?.servers}\n` +
              `ETA: ~8-12 minutes\n\n` +
              `Monitoring for issues...`,
    };
  }
  
  async rollbackRegion(region: string): Promise<CommandResult> {
    if (!REGIONS.find(r => r.name === region)) {
      return {
        success: false,
        output: `❌ Region '${region}' not found.`,
      };
    }
    
    const currentStatus = this.state.patchStatus[region];
    if (currentStatus === 'pending') {
      return {
        success: false,
        output: `ℹ️  Region '${region}' has not been patched yet.`,
      };
    }
    
    this.state.patchStatus[region] = 'pending';
    
    return {
      success: true,
      output: `↩️  Rolling back patch in ${region}\n\n` +
              `Reverting to previous kernel version...\n` +
              `Servers affected: ${REGIONS.find(r => r.name === region)?.servers}\n` +
              `ETA: ~5-8 minutes`,
    };
  }
  
  sendAlert(team: string, message: string): CommandResult {
    const validTeams = ['sre', 'security', 'leadership', 'customers', 'all'];
    
    if (!validTeams.includes(team.toLowerCase())) {
      return {
        success: false,
        output: `❌ Invalid team '${team}'. Valid teams: ${validTeams.join(', ')}`,
      };
    }
    
    return {
      success: true,
      output: `📢 Alert sent to ${team.toUpperCase()}\n\n` +
              `Message: "${message}"\n\n` +
              `Status: Delivered to ${team === 'all' ? '5' : '1'} channel(s)`,
    };
  }
  
  getHint(): CommandResult {
    const phase = this.state.phase;
    const hints = HINTS[phase as keyof typeof HINTS] || HINTS.general;
    const hintIndex = this.state.hintsUsed % hints.length;
    
    this.state.hintsUsed++;
    
    return {
      success: true,
      output: `💡 HINT #${this.state.hintsUsed}:\n\n${hints[hintIndex]}`,
    };
  }
  
  private getCurrentMetrics(): Metrics {
    const patchedCount = Object.values(this.state.patchStatus).filter(
      s => s === 'complete'
    ).length;
    
    return {
      errorRate: this.state.errorRate,
      latencyP99: this.state.latencyP99,
      trafficVolume: this.state.trafficVolume,
      affectedServers: this.state.affectedServers,
      patchedServers: patchedCount,
    };
  }
  
  private getRegionList(): Region[] {
    return REGIONS.map(r => ({
      ...r,
      status: this.getRegionHealth(r.name) as any,
      patchStatus: this.state.patchStatus[r.name],
    }));
  }
  
  private getRegionHealth(region: string): string {
    // Simulate health based on patch status and random factors
    const patchStatus = this.state.patchStatus[region];
    if (patchStatus === 'failed') return 'critical';
    if (this.state.errorRate > 2) return 'degraded';
    return 'healthy';
  }
  
  private getRegionHealthIcon(region: string): string {
    const health = this.getRegionHealth(region);
    if (health === 'critical') return '🔴';
    if (health === 'degraded') return '🟡';
    return '🟢';
  }
  
  private getErrorTrend(): string {
    if (this.state.errorRate > 1.0) return '↗️  ELEVATED';
    if (this.state.errorRate > 0.5) return '→  MODERATE';
    return '↘️  NORMAL';
  }
  
  private getLatencyTrend(): string {
    if (this.state.latencyP99 > 100) return '↗️  HIGH';
    if (this.state.latencyP99 > 60) return '→  MODERATE';
    return '↘️  NORMAL';
  }
  
  private getHealthScore(): number {
    const patched = Object.values(this.state.patchStatus).filter(s => s === 'complete').length;
    const baseScore = 70;
    const patchBonus = (patched / REGIONS.length) * 30;
    const errorPenalty = this.state.errorRate * 5;
    return Math.max(0, Math.min(100, Math.round(baseScore + patchBonus - errorPenalty)));
  }
}


