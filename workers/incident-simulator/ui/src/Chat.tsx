import React, { useState, useRef, useEffect } from 'react';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  connected: boolean;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, connected }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-title">💬 On-Call Engineer</span>
        <span className="chat-status">
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <p className="chat-hint">
              Ask questions about the incident, CVE details, or guidance on next steps.
            </p>
          </div>
        )}
        
        {messages.map((message) => (
          <div 
            key={message.id} 
            className={`chat-message ${message.role}`}
          >
            <div className="message-header">
              <span className="message-role">
                {message.role === 'assistant' ? '👨‍💻 SRE' : message.role === 'user' ? '👤 You' : '🤖 System'}
              </span>
              <span className="message-time">{formatTime(message.timestamp)}</span>
            </div>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
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
