import React, { useState, useEffect, useRef, useCallback } from 'react';
import Terminal from './Terminal';
import Dashboard from './Dashboard';
import Chat from './Chat';
import SiteHeader from './SiteHeader';
import './App.css';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  persona?: 'sre' | 'security';
}

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
  actions: unknown[];
  messages: ChatMessage[];
  resolved: boolean;
  cveId: string;
  aiPersona: string | null;
  securityPhaseActive: boolean;
  sreConfirmed: boolean;
  regionWorkflows: Record<string, RegionWorkflow>;
}

const SESSION_KEY = 'incident-simulator-session';

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return 'ws://localhost:8787/agents/incident-agent/session';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/agents/incident-agent/${getSessionId()}/session`;
}

const WS_URL = getWebSocketUrl();

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing;

  const seen = new Set(existing.map((m) => m.id));
  const additions = incoming.filter((m) => !seen.has(m.id));
  return additions.length > 0 ? [...existing, ...additions] : existing;
}

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<IncidentState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingState, setTypingState] = useState<{ isTyping: boolean; persona: string | null }>({ isTyping: false, persona: null });
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const addToTerminal = useCallback((text: string) => {
    setTerminalOutput((prev) => [...prev, text]);
  }, []);

  const focusChat = useCallback(() => {
    chatInputRef.current?.focus();
  }, []);

  const focusTerminal = useCallback(() => {
    terminalInputRef.current?.focus();
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addToTerminal('🔌 Connected to incident response system');
    };

    ws.onmessage = async (event) => {
      try {
        let text: string;
        if (typeof event.data === 'string') {
          text = event.data;
        } else if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        } else {
          console.error('Unknown message format:', typeof event.data, event.data);
          return;
        }

        const data = JSON.parse(text);

        switch (data.type) {
          case 'system':
            addToTerminal(data.content);
            break;
          case 'state_update':
          case 'cf_agent_state':
            setState(data.state);
            if (Array.isArray(data.state?.messages)) {
              setMessages(data.state.messages);
            }
            break;
          case 'notification':
            addToTerminal(`\n[${data.severity.toUpperCase()}] ${data.message}\n`);
            break;
          case 'messages':
            if (Array.isArray(data.messages)) {
              setMessages((prev) => mergeMessages(prev, data.messages));
            }
            break;
          case 'typing':
            setTypingState({ isTyping: data.isTyping, persona: data.persona });
            break;
          case 'error':
            if (data.error) {
              addToTerminal(`❌ ${data.error}`);
            }
            break;
          case 'response':
            if (data.result && data.result.output) {
              addToTerminal(data.result.output);
            } else if (data.result && data.result.error) {
              addToTerminal(`❌ ${data.result.error}`);
            }
            break;
          case 'cf_agent_identity':
          case 'cf_agent_mcp_servers':
          case 'connect':
          case 'state:update':
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
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      connectWebSocket();
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
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
      <SiteHeader />

      <header className="app-header">
        <div className="app-title">
          <div className="breadcrumbs">
            <a href="https://brandon-harris.com/">Home</a>&nbsp;»&nbsp;<a href="https://brandon-harris.com/projects/">Projects</a>
          </div>
          <h1>Incident Response Simulator</h1>
        </div>
        <div className="app-header-actions">
          <a href="https://brandon-harris.com/incident-simulator/" className="button">About this project</a>
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
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
            inputRef={terminalInputRef}
            onSwitchFocus={focusChat}
          />
        </main>

        <aside className="sidebar right">
          <Chat
            messages={messages}
            onSendMessage={sendMessage}
            connected={connected}
            typingState={typingState}
            inputRef={chatInputRef}
            onSwitchFocus={focusTerminal}
          />
        </aside>
      </div>

      <footer className="app-footer">
        <button type="button" onClick={resetSimulation} className="button">
          Reset Simulation
        </button>
        <span>Press Tab to switch between terminal and chat</span>
        <span>&copy; 2026 <a href="https://brandon-harris.com/">Brandon Harris</a></span>
      </footer>
    </div>
  );
};

export default App;
