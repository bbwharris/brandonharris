import React, { useState, useEffect, useRef, useCallback } from 'react';
import Terminal from './Terminal';
import Dashboard from './Dashboard';
import Chat from './Chat';
import './App.css';

interface IncidentState {
  phase: string;
  simTime: string;
  severity: string;
  affectedServers: number;
  totalServers: number;
  errorRate: number;
  latencyP99: number;
  trafficVolume: number;
  patchStatus: Record<string, string>;
  actions: any[];
  messages: any[];
  resolved: boolean;
  cveId: string;
}

const WS_URL = import.meta.env.DEV 
  ? 'ws://localhost:8787/agents/incident-agent/session'
  : 'wss://agents.brandon-harris.com/agents/incident-agent/session';

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<IncidentState | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addToTerminal = useCallback((text: string) => {
    setTerminalOutput(prev => [...prev, text]);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addToTerminal('🔌 Connected to incident response system');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'system':
            addToTerminal(data.content);
            break;
          case 'state_update':
            setState(data.state);
            break;
          case 'notification':
            addToTerminal(`\n[${data.severity.toUpperCase()}] ${data.message}\n`);
            break;
          case 'messages':
            setMessages(prev => [...prev, ...data.messages]);
            break;
          case 'response':
            if (data.result && data.result.output) {
              addToTerminal(data.result.output);
            }
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      addToTerminal('🔌 Disconnected from incident response system');
      
      // Attempt to reconnect after 3 seconds
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWebSocket();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      addToTerminal('❌ Connection error');
    };
  }, [addToTerminal]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const executeCommand = useCallback((command: string, args: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addToTerminal('❌ Not connected to server');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'call',
      method: 'executeCommand',
      args: [command, args],
    }));
  }, [addToTerminal]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addToTerminal('❌ Not connected to server');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'call',
      method: 'sendMessage',
      args: [content],
    }));
  }, [addToTerminal]);

  const resetSimulation = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addToTerminal('❌ Not connected to server');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'call',
      method: 'reset',
      args: [],
    }));
    
    setTerminalOutput([]);
    setMessages([]);
  }, [addToTerminal]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚨 Incident Response Simulator</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <Dashboard state={state} />
        </aside>

        <main className="main-content">
          <Terminal 
            output={terminalOutput}
            onCommand={executeCommand}
            connected={connected}
          />
        </main>

        <aside className="sidebar right">
          <Chat 
            messages={messages}
            onSendMessage={sendMessage}
            connected={connected}
          />
        </aside>
      </div>

      <footer className="app-footer">
        <button onClick={resetSimulation} className="reset-btn">
          🔄 Reset Simulation
        </button>
        <span>Press Tab to switch between terminal and chat</span>
      </footer>
    </div>
  );
};

export default App;
