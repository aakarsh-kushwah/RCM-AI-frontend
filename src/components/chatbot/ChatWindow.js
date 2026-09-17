import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  Send, Menu, Plus, Sparkles, Mic, MicOff, X, Loader2,
  AudioLines, Copy, Check, Sun, Moon, ArrowDown, PanelLeftClose
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import imageCompression from 'browser-image-compression';
import { useChatEngine } from '../../hooks/useChatEngine';
import './ChatWindow.css';
import CalculatorWidget from './CalculatorWidget';

const BRAND_NAME = 'RCM AI';

const escapeHtml = (str) =>
  String(str || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');

const formatText = (text) => {
  if (!text) return '';
  let safe = escapeHtml(String(text));

  safe = safe.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
  });

  safe = safe.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  const lines = safe.split('\n');
  let inList = false;
  let out = [];
  lines.forEach((line) => {
    const match = /^\s*-\s+(.*)/.exec(line);
    if (match) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${match[1]}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(line);
    }
  });
  if (inList) out.push('</ul>');
  safe = out.join('\n');

  safe = safe.replace(/\n(?!<\/?(ul|li|pre|code)>)/g, '<br/>');

  return safe;
};

const ChatRow = memo(({ msg }) => {
  const isAssistant = msg.role === 'assistant';
  const [copied, setCopied] = useState(false);

  let parsedContent = null;
  if (msg.content && typeof msg.content === 'string') {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        parsedContent = parsed;
      }
    } catch (_) {}
  }
  if (!parsedContent && msg.type === 'calculator_widget') {
    parsedContent = { type: 'calculator_widget', data: msg.data };
  }

  const isWidget = isAssistant && parsedContent?.type === 'calculator_widget';
  const html = useMemo(() => formatText(msg.content), [msg.content]);

  const handleCopy = useCallback(() => {
    if (!msg.content) return;
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [msg.content]);

  return (
    <div className={`chat-row ${msg.role}`}>
      <div className="msg-avatar" aria-hidden="true">
        {isAssistant ? (
          <div className="ai-avatar"><Sparkles size={16} /></div>
        ) : (
          <div className="user-avatar">You</div>
        )}
      </div>

      <div className="msg-body">
        <div className="msg-sender-name">{isAssistant ? BRAND_NAME : 'You'}</div>

        {msg.image && (
          <div className="msg-attachment">
            <img src={msg.image} alt="Attachment" />
          </div>
        )}

        {isWidget ? (
          <CalculatorWidget initialData={parsedContent.data} />
        ) : (
          <div
            className="msg-bubble-text"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {/* Product Card Preview when imageUrl is present */}
        {isAssistant && msg.imageUrl && (
          <div className="msg-product-card" style={{ marginTop: '10px', maxWidth: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--card-bg, #fff)', padding: '6px' }}>
            <img src={msg.imageUrl} alt="Product" style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', borderRadius: '6px' }} />
          </div>
        )}

        {isAssistant && !isWidget && msg.content && (
          <div className="msg-actions">
            <button
              className="msg-action-btn"
              onClick={handleCopy}
              aria-label="Copy response"
              title="Copy"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
ChatRow.displayName = 'ChatRow';

const TypingIndicator = () => (
  <div className="chat-row assistant">
    <div className="msg-avatar" aria-hidden="true">
      <div className="ai-avatar"><Sparkles size={16} /></div>
    </div>
    <div className="msg-body">
      <div className="msg-sender-name">{BRAND_NAME}</div>
      <div className="typing-dots" aria-label="Assistant is typing">
        <span /><span /><span />
      </div>
    </div>
  </div>
);

const ChatWindow = () => {
  const { messages, status, sendMessage } = useChatEngine();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [theme, setTheme] = useState('light');
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  const isLoading = status === 'loading';

  useEffect(() => {
    if (!scrollRef.current) return;
    if (!showScrollButton) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 240);
  }, []);

  const jumpToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setShowScrollButton(false);
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen((prev) => (mobile ? false : prev));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalTranscript += `${event.results[i][0].transcript} `;
        }
      }
      if (finalTranscript) {
        setInput((prev) => `${prev}${finalTranscript}`);
      }
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      alert('Your browser does not support voice input.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  }, [isListening]);

  const handleSwitchToVoiceMode = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    navigate('/voice-call');
  };

  const handleImageProcessing = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
      setSelectedImage(compressedFile);
    } catch (e) {
      setSelectedImage(file);
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const handleSend = () => {
    if (isLoading) return;

    if (user && (user.status === 'free' || user.status === 'pending' || (user.status !== 'active' && user.status !== 'premium'))) {
      navigate('/payment-setup');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed && !selectedImage) return;

    sendMessage(trimmed, selectedImage);
    setInput('');
    setSelectedImage(null);
    if (isListening && recognitionRef.current) recognitionRef.current.stop();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (input.trim().length > 0 || selectedImage) && !isLoading;

  return (
    <div className="rcm-app" data-theme={theme}>
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}
          </button>
          {isSidebarOpen && (
            <span className="sidebar-brand">
              <span className="brand-mark"><Sparkles size={15} /></span>
              {BRAND_NAME}
            </span>
          )}
        </div>

        {isSidebarOpen && (
          <div className="sidebar-content">
            <button className="new-chat-pill" onClick={() => window.location.reload()}>
              <Plus size={16} />
              New chat
            </button>
          </div>
        )}
      </aside>

      <main className="app-main">
        <header className="main-header">
          <div className="header-left">
            {!isSidebarOpen && (
              <button
                className="icon-btn mobile-only"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu size={19} />
              </button>
            )}
            <span className="model-select">
              {BRAND_NAME}
              <span className="beta-badge">BETA</span>
            </span>
          </div>
          <div className="header-right">
            <button
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </header>

        <div className="chat-scroll-wrapper" ref={scrollRef} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className="welcome-hero">
              <div className="hero-logo-box"><Sparkles size={30} /></div>
              <h1 className="hero-title">Hello, Leader.</h1>
              <h2 className="hero-subtitle">How can I help you grow today?</h2>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((msg, i) => (
                <ChatRow key={msg.id ?? i} msg={msg} />
              ))}
              {isLoading && <TypingIndicator />}
            </div>
          )}
        </div>

        {showScrollButton && (
          <button className="scroll-to-bottom-btn" onClick={jumpToBottom} aria-label="Jump to latest">
            <ArrowDown size={16} />
          </button>
        )}

        <div className="input-container">
          <div className="input-max-width">
            {selectedImage && (
              <div className="preview-badge">
                <img src={URL.createObjectURL(selectedImage)} alt="Selected upload preview" />
                <button onClick={() => setSelectedImage(null)} aria-label="Remove image">
                  <X size={13} />
                </button>
              </div>
            )}

            <div className={`input-box ${isListening ? 'recording-mode' : ''}`}>
              <button
                className="icon-btn add-file-btn"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach an image"
              >
                <Plus size={19} />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={isListening ? 'Listening…' : `Message ${BRAND_NAME}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <div className="input-actions">
                {!input.trim() && !selectedImage ? (
                  <button
                    className="voice-live-btn"
                    onClick={handleSwitchToVoiceMode}
                    title="Start live voice chat"
                    aria-label="Start live voice chat"
                  >
                    <AudioLines size={18} />
                    <span className="live-wave" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    className={`send-btn ${canSend ? 'active' : ''}`}
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    {isLoading ? <Loader2 size={17} className="spin" /> : <Send size={16} />}
                  </button>
                )}

                {!input.trim() && !selectedImage && (
                  <button
                    className={`icon-btn mic-btn ${isListening ? 'active-red' : ''}`}
                    onClick={toggleListening}
                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
              </div>
            </div>

            <p className="disclaimer-text">
              {BRAND_NAME} can make mistakes. Please verify important billing information.
            </p>
          </div>
        </div>
      </main>

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(e) => handleImageProcessing(e.target.files[0])}
      />

      {isMobile && isSidebarOpen && (
        <div className="backdrop" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
};

export default ChatWindow;
