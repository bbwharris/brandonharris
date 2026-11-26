import React, { useState, useRef, useEffect } from 'react';
import './Terminal.css';

interface TerminalProps {
  output: string[];
  onCommand: (command: string, args: string[]) => void;
  connected: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSwitchFocus?: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ output, onCommand, connected, inputRef: externalInputRef, onSwitchFocus }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;

    const parts = input.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    onCommand(command, args);
    
    // Add to history
    setHistory(prev => [...prev, input]);
    setHistoryIndex(-1);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && onSwitchFocus) {
      e.preventDefault();
      onSwitchFocus();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div className="terminal">
      <div className="terminal-header">
        <span className="terminal-title">Terminal</span>
        <span className="terminal-status">
          {connected ? 'Ready' : 'Offline'}
        </span>
      </div>
      
      <div className="terminal-output" ref={outputRef}>
        {output.map((line, index) => (
          <div key={index} className="terminal-line">
            <pre>{line}</pre>
          </div>
        ))}
      </div>
      
      <form className="terminal-input-container" onSubmit={handleSubmit}>
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? "Enter command..." : "Connecting..."}
          disabled={!connected}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
};

export default Terminal;
