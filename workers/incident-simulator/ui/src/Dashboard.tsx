import React from 'react';
import './Dashboard.css';

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
  } | null;
}

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  if (!state) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">Loading incident data...</div>
      </div>
    );
  }

  const healthScore = Math.max(0, Math.min(100, Math.round(
    70 + 
    (Object.values(state.patchStatus).filter(s => s === 'complete').length / 5) * 30 -
    state.errorRate * 5
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
            style={{ backgroundColor: phaseColors[state.phase] || '#8b949e' }}
          >
            {state.phase.toUpperCase()}
          </div>
        </div>

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
            {new Date(state.simTime).toLocaleTimeString()}
          </div>
        </div>

        {/* Metrics */}
        <div className="metrics-grid">
          <div className="metric-item">
            <div className="metric-item-label">Error Rate</div>
            <div className={`metric-item-value ${state.errorRate > 1 ? 'warning' : ''}`}>
              {state.errorRate.toFixed(2)}%
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">P99 Latency</div>
            <div className={`metric-item-value ${state.latencyP99 > 100 ? 'warning' : ''}`}>
              {state.latencyP99}ms
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">Traffic</div>
            <div className="metric-item-value">
              {(state.trafficVolume / 1000000).toFixed(1)}M/s
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item-label">Affected</div>
            <div className={`metric-item-value ${state.affectedServers > 100 ? 'warning' : ''}`}>
              {state.affectedServers}
            </div>
          </div>
        </div>

        {/* Patch status */}
        <div className="metric-card">
          <div className="metric-label">Patch Progress</div>
          <div className="patch-list">
            {Object.entries(state.patchStatus).map(([region, status]) => (
              <div key={region} className="patch-item">
                <span className="patch-region">{region}</span>
                <span className={`patch-status status-${status}`}>
                  {status === 'complete' ? '✓' : status === 'in_progress' ? '⟳' : '○'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CVE info */}
        <div className="metric-card cve-card">
          <div className="metric-label">{state.cveId}</div>
          <div className="cve-severity">Severity: {state.severity}</div>
          {state.resolved && (
            <div className="resolved-badge">✓ RESOLVED</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
