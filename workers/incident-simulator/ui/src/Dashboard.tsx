import React from 'react';
import './Dashboard.css';

interface SecurityChecklistItem {
  id: string;
  description: string;
  verified: boolean;
  finding: string;
}

interface RegionWorkflow {
  region: string;
  state: string;
  patchVersion?: string;
  patchProgress: number;
  requiredPatch: string;
  investigationComplete: boolean;
  securityItems: SecurityChecklistItem[];
  securityVerified: boolean;
  errorRate: number;
  failureCount: number;
}

interface DashboardProps {
  state: {
    phase: string;
    simTime: string;
    severity: string;
    affectedServers: number;
    totalServers: number;
    errorRate: number;
    latencyP99: number;
    trafficVolume: number;
    patchStatus: Record<string, string>;
    cveId: string;
    resolved: boolean;
    aiPersona: string | null;
    securityPhaseActive: boolean;
    sreConfirmed: boolean;
    regionWorkflows: Record<string, RegionWorkflow>;
  } | null;
}

const getWorkflowStateColor = (state: string): string => {
  switch (state) {
    case 'idle': return '#8b949e';
    case 'investigating': return '#58a6ff';
    case 'ready_to_patch': return '#3fb950';
    case 'patching': return '#a371f7';
    case 'patch_failed': return '#da3633';
    case 'rolling_back': return '#f0883e';
    case 'patched': return '#238636';
    case 'security_review': return '#8957e5';
    case 'verified': return '#2ea043';
    default: return '#8b949e';
  }
};

const getWorkflowStateIcon = (state: string): string => {
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
};

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  if (!state) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">Loading incident data...</div>
      </div>
    );
  }

  // Ensure all required properties exist with defaults
  const safeState = {
    phase: state.phase || 'triage',
    simTime: state.simTime || new Date().toISOString(),
    severity: state.severity || 'P0',
    affectedServers: state.affectedServers || 0,
    totalServers: state.totalServers || 1042,
    errorRate: state.errorRate ?? 0.3,
    latencyP99: state.latencyP99 ?? 45,
    trafficVolume: state.trafficVolume ?? 1250000,
    patchStatus: state.patchStatus || {},
    cveId: state.cveId || 'CVE-2024-8765',
    resolved: state.resolved || false,
    aiPersona: state.aiPersona || null,
    securityPhaseActive: state.securityPhaseActive || false,
    sreConfirmed: state.sreConfirmed || false,
    regionWorkflows: state.regionWorkflows || {},
  };

  const workflows = safeState.regionWorkflows;
  const healthScore = Math.max(0, Math.min(100, Math.round(
    70 +
    (Object.values(workflows).filter(w => w?.state === 'patched' || w?.state === 'security_review' || w?.state === 'verified').length / 5) * 30 -
    safeState.errorRate * 5
  )));

  const phaseColors: Record<string, string> = {
    triage: '#f0883e',
    investigation: '#58a6ff',
    response: '#a371f7',
    resolved: '#238636',
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h3>📊 Dashboard</h3>
      </div>

      <div className="dashboard-content">
        {/* Phase indicator */}
        <div className="metric-card">
          <div className="metric-label">Current Phase</div>
          <div
            className="metric-value phase-badge"
            style={{ backgroundColor: phaseColors[safeState.phase] || '#8b949e' }}
          >
            {safeState.phase.toUpperCase()}
          </div>
        </div>

        {/* AI Persona indicator */}
        {safeState.aiPersona && (
          <div className="metric-card">
            <div className="metric-label">AI Agent</div>
            <div
              className="metric-value phase-badge"
              style={{
                backgroundColor: safeState.aiPersona === 'sre' ? '#58a6ff' : '#8957e5',
                fontSize: '0.8rem'
              }}
            >
              {safeState.aiPersona === 'sre' ? '👨‍💻 SRE' : '🔒 SECURITY'}
            </div>
          </div>
        )}

        {/* Health score */}
        <div className="metric-card">
          <div className="metric-label">Health Score</div>
          <div className="health-bar-container">
            <div
              className="health-bar"
              style={{
                width: `${healthScore}%`,
                backgroundColor: healthScore > 80 ? '#238636' : healthScore > 50 ? '#f0883e' : '#da3633'
              }}
            />
          </div>
          <div className="metric-value">{healthScore}%</div>
        </div>

        {/* Simulated time */}
        <div className="metric-card">
          <div className="metric-label">Simulated Time</div>
          <div className="metric-value time">
            {new Date(safeState.simTime).toLocaleTimeString()}
          </div>
        </div>

        {/* Metrics */}
        <div className="metrics-grid">
          <div className="metric-item">
            <div className="metric-item-label">Error Rate</div>
            <div className={`metric-item-value ${safeState.errorRate > 1 ? 'warning' : ''}`}>
              {safeState.errorRate.toFixed(2)}%
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">P99 Latency</div>
            <div className={`metric-item-value ${safeState.latencyP99 > 100 ? 'warning' : ''}`}>
              {safeState.latencyP99}ms
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">Traffic</div>
            <div className="metric-item-value">
              {(safeState.trafficVolume / 1000000).toFixed(1)}M/s
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">Affected</div>
            <div className={`metric-item-value ${safeState.affectedServers > 100 ? 'warning' : ''}`}>
              {safeState.affectedServers}
            </div>
          </div>
        </div>

        {/* Region Workflows */}
        <div className="metric-card">
          <div className="metric-label">Region Workflows</div>
          <div className="patch-list">
            {Object.entries(workflows).map(([region, workflow]) => {
              // Ensure workflow exists and has required properties
              if (!workflow) return null;
              
              const workflowState = workflow.state || 'idle';
              const patchProgress = workflow.patchProgress ?? 0;
              const securityItems = workflow.securityItems || [];
              const failureCount = workflow.failureCount ?? 0;
              
              return (
                <div key={region} className="patch-item" style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="patch-region">{getWorkflowStateIcon(workflowState)} {region}</span>
                    <span
                      className="patch-status"
                      style={{
                        backgroundColor: getWorkflowStateColor(workflowState),
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: '#fff'
                      }}
                    >
                      {workflowState.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Progress bar for patching or rolling back */}
                  {(workflowState === 'patching' || workflowState === 'rolling_back') && (
                    <div className="progress-bar-container" style={{ marginTop: '4px' }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: '100%',
                          height: '6px',
                          backgroundColor: '#30363d',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{
                            width: `${patchProgress}%`,
                            height: '100%',
                            backgroundColor: workflowState === 'rolling_back' ? '#f0883e' : '#a371f7',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#8b949e', marginTop: '2px' }}>
                        {patchProgress}%
                      </div>
                    </div>
                  )}

                  {/* Security verification progress */}
                  {workflowState === 'security_review' && securityItems.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: '4px' }}>
                      Security: {securityItems.filter(i => i.verified).length}/{securityItems.length} verified
                    </div>
                  )}

                  {/* Failure count indicator */}
                  {(workflowState === 'patch_failed' || workflowState === 'ready_to_patch') && failureCount > 0 && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: failureCount >= 2 ? '#3fb950' : '#f0883e', 
                      marginTop: '4px',
                      fontWeight: 'bold'
                    }}>
                      {failureCount >= 2 
                        ? '✓ SRE has applied fixes (review chat message)' 
                        : `⚠️ Previous failure - see sre analysis`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CVE info */}
        <div className="metric-card cve-card">
          <div className="metric-label">{safeState.cveId}</div>
          <div className="cve-severity">Severity: {safeState.severity}</div>
          {safeState.resolved && (
            <div className="resolved-badge">✓ RESOLVED</div>
          )}
          {safeState.sreConfirmed && !safeState.resolved && (
            <div className="resolved-badge" style={{ backgroundColor: '#3fb950' }}>✓ SRE CONFIRMED</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
