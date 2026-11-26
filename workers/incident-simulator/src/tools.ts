import type { CommandResult, Metrics, Region, IncidentState } from './types';
import { REGIONS, getLogMessages, HINTS, PATCH_VERSIONS } from './scenario';
import { isRegionCorrectlyPatched } from './simulation';

export class IncidentTools {
  private state: IncidentState;

  constructor(state: IncidentState) {
    this.state = state;
  }

  getStatus(): CommandResult {
    const workflows = this.state.regionWorkflows;
    const patchedCount = Object.values(workflows).filter(isRegionCorrectlyPatched).length;

    const inProgressCount = Object.values(workflows).filter(
      (w) => w.state === 'patching' || w.state === 'rolling_back',
    ).length;

    let output = `\nINCIDENT STATUS - ${this.state.cveId}\n`;
    output += `${'='.repeat(31 + this.state.cveId.length)}\n\n`;
    output += `Phase:            ${this.state.phase.toUpperCase()}\n`;
    output += `AI Persona:       ${this.state.aiPersona ? this.state.aiPersona.toUpperCase() : 'NONE'}\n`;
    output += `Severity:         ${this.state.severity}\n`;
    output += `Simulated Time:   ${new Date(this.state.simTime).toLocaleString()}\n`;
    output += `Error Rate:       ${this.state.errorRate.toFixed(2)}%\n`;
    output += `P99 Latency:      ${this.state.latencyP99}ms\n`;
    output += `Traffic:          ${(this.state.trafficVolume / 1000000).toFixed(1)}M req/s\n\n`;

    output += `REGION WORKFLOWS:\n`;
    output += `${'-'.repeat(50)}\n`;
    REGIONS.forEach((region) => {
      const workflow = workflows[region.name];
      const stateIcon = this.getWorkflowStateIcon(workflow.state);
      const progress = workflow.state === 'patching' || workflow.state === 'rolling_back'
        ? ` (${workflow.patchProgress}%)`
        : '';
      output += `${stateIcon} ${region.name.padEnd(12)} ${workflow.state.replace(/_/g, ' ').toUpperCase()}${progress}\n`;
    });

    output += `\n`;
    output += `Patched:          ${patchedCount}/${REGIONS.length} regions\n`;
    output += `In Progress:      ${inProgressCount} regions\n`;

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
    REGIONS.forEach((region) => {
      const workflow = this.state.regionWorkflows[region.name];
      const stateIcon = this.getWorkflowStateIcon(workflow.state);
      const healthIcon = this.getRegionHealthIcon(region.name);
      const progress = workflow.state === 'patching' || workflow.state === 'rolling_back'
        ? `(${workflow.patchProgress}%)`
        : '';
      output += `  ${stateIcon} ${region.name.padEnd(12)} ${workflow.errorRate.toFixed(1)}% ${progress.padEnd(6)} ${healthIcon}\n`;
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

    let output = `\n📋 LOGS: ${service.toUpperCase()} (last ${timeframe}m)\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (logs.length === 0) {
      output += `No logs found for ${service} in the specified timeframe.\n`;
    } else {
      logs.forEach((log) => {
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

    REGIONS.forEach((region) => {
      const workflow = this.state.regionWorkflows[region.name];
      const stateIcon = this.getWorkflowStateIcon(workflow.state);
      const statusText = workflow.state.toUpperCase().replace(/_/g, ' ');

      output += `${stateIcon} ${region.name.toUpperCase()}\n`;
      output += `  Servers:     ${region.servers}\n`;
      output += `  Status:      ${statusText}\n`;

      if (workflow.state === 'patching' || workflow.state === 'rolling_back') {
        output += `  Progress:    ${workflow.patchProgress}%\n`;
      }

      if (workflow.patchVersion) {
        output += `  Patch:       ${workflow.patchVersion}\n`;
      }

      output += `  Error Rate:  ${workflow.errorRate.toFixed(2)}%\n`;

      if (workflow.securityItems.length > 0) {
        const verifiedCount = workflow.securityItems.filter((i) => i.verified).length;
        output += `  Security:    ${verifiedCount}/${workflow.securityItems.length} verified\n`;
      }

      output += `\n`;
    });

    return {
      success: true,
      output,
      regions: this.getRegionList(),
    };
  }

  listPatches(): CommandResult {
    let output = `\n📦 AVAILABLE PATCH VERSIONS\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    PATCH_VERSIONS.forEach((patch) => {
      output += `Version: ${patch.version}\n`;
      output += `  Description: ${patch.description}\n`;
      output += `  Kernel Range: ${patch.kernelRange}\n\n`;
    });

    output += `Usage: patch <region> <version>\n`;
    output += `Example: patch us-east 6.5.0-9-hotfix\n`;

    return {
      success: true,
      output,
    };
  }

  getHint(): { result: CommandResult; nextHintsUsed: number } {
    const phase = this.state.phase;
    const hints = HINTS[phase as keyof typeof HINTS] || HINTS.general;
    const hintIndex = this.state.hintsUsed % hints.length;
    const nextHintsUsed = this.state.hintsUsed + 1;

    return {
      nextHintsUsed,
      result: {
        success: true,
        output: `💡 HINT #${nextHintsUsed}:\n\n${hints[hintIndex]}`,
      },
    };
  }

  private getCurrentMetrics(): Metrics {
    const patchedCount = Object.values(this.state.regionWorkflows).filter(isRegionCorrectlyPatched).length;

    return {
      errorRate: this.state.errorRate,
      latencyP99: this.state.latencyP99,
      trafficVolume: this.state.trafficVolume,
      affectedServers: this.state.affectedServers,
      patchedServers: patchedCount,
    };
  }

  private getRegionList(): Region[] {
    return REGIONS.map((r) => {
      const workflow = this.state.regionWorkflows[r.name];
      return {
        ...r,
        status: this.getRegionHealth(r.name),
        patchStatus: isRegionCorrectlyPatched(workflow) ? 'complete' :
                     workflow.state === 'patching' ? 'in_progress' :
                     workflow.state === 'patch_failed' || (workflow.state === 'patched' && workflow.patchVersion !== workflow.requiredPatch) ? 'failed' : 'pending',
      };
    });
  }

  private getRegionHealth(region: string): Region['status'] {
    const workflow = this.state.regionWorkflows[region];
    if (workflow.state === 'patch_failed') return 'critical';
    if (workflow.errorRate > 2) return 'degraded';
    return 'healthy';
  }

  private getRegionHealthIcon(region: string): string {
    const health = this.getRegionHealth(region);
    if (health === 'critical') return '🔴';
    if (health === 'degraded') return '🟡';
    return '🟢';
  }

  private getWorkflowStateIcon(state: string): string {
    switch (state) {
      case 'idle': return '⚪';
      case 'investigating': return '🔍';
      case 'ready_to_patch': return '✓';
      case 'patching': return '🔧';
      case 'patch_failed': return '❌';
      case 'rolling_back': return '↩️';
      case 'patched': return '✅';
      case 'security_review': return '🔒';
      case 'verified': return '🔐';
      default: return '⚪';
    }
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
    const patched = Object.values(this.state.regionWorkflows).filter(isRegionCorrectlyPatched).length;
    const baseScore = 70;
    const patchBonus = (patched / REGIONS.length) * 30;
    const errorPenalty = this.state.errorRate * 5;
    return Math.max(0, Math.min(100, Math.round(baseScore + patchBonus - errorPenalty)));
  }
}
