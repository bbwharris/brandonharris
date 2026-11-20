import React, { useState, useRef, useEffect } from 'react';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  persona?: 'sre' | 'security';
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  connected: boolean;
  typingState?: { isTyping: boolean; persona: string | null };
}

const detectPersona = (content: string): 'sre' | 'security' | null => {
  if (content.includes('🔒') || content.includes('SECURITY') || content.includes('Security Auditor')) {
    return 'security';
  }
  if (content.includes('👨‍💻') || content.includes('SRE') || content.includes('SRE INVESTIGATION')) {
    return 'sre';
  }
  return null;
};

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, connected, typingState }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;

    onSendMessage(input.trim());
    setInput('');
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessageRoleDisplay = (message: Message) => {
    if (message.role === 'user') return { icon: '👤', label: 'You', color: 'var(--accent)' };
    if (message.role === 'system') return { icon: '🤖', label: 'System', color: 'var(--secondary)' };

    // Use explicit persona field if available, otherwise fall back to content detection
    const persona = message.persona || detectPersona(message.content);
    if (persona === 'security') {
      return { icon: '🔒', label: 'Security', color: 'var(--security)' };
    }
    return { icon: '👨‍💻', label: 'SRE', color: 'var(--sre)' };
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-title">Team Chat</span>
        <span className="chat-status">
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <p className="chat-hint">
              Team members will message you during the incident. You can also ask questions.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const roleDisplay = getMessageRoleDisplay(message);
          return (
            <div
              key={message.id}
              className={`chat-message ${message.role}`}
              style={message.role === 'assistant' ? {
                borderLeft: `3px solid ${roleDisplay.color}`
              } : {}}
            >
              <div className="message-header">
                <span
                  className="message-role"
                  style={{ color: roleDisplay.color }}
                >
                  {roleDisplay.icon} {roleDisplay.label}
                </span>
                <span className="message-time">{formatTime(message.timestamp)}</span>
              </div>
              <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </div>
            </div>
          );
        })}
        
        {/* Typing Indicator */}
        {typingState?.isTyping && (
          <div 
            className="chat-message assistant typing-indicator" 
            style={{ borderLeft: `3px solid ${typingState.persona === 'security' ? 'var(--security)' : 'var(--sre)'}` }}
          >
            <div className="message-header">
              <span
                className="message-role"
                style={{ color: typingState.persona === 'security' ? 'var(--security)' : 'var(--sre)' }}
              >
                {typingState.persona === 'security' ? '🔒 Security' : '👨‍💻 SRE'} is typing
              </span>
            </div>
            <div 
              className="message-content"
              style={{ color: typingState.persona === 'security' ? 'var(--security)' : 'var(--sre)' }}
            >
              <div className="typing-animation">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Ask a question..." : "Connecting..."}
          disabled={!connected}
          autoComplete="off"
        />
        <button 
          type="submit" 
          className="chat-send-btn"
          disabled={!connected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
