import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  Send, Menu, Plus, Mic, MicOff, X, Loader2,
  AudioLines, Copy, Check, Sun, Moon, ArrowDown, PanelLeftClose
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import imageCompression from 'browser-image-compression';
import { useChatEngine } from '../../hooks/useChatEngine';
import './ChatWindow.css';
import CalculatorWidget from './CalculatorWidget';

const BRAND_NAME = 'TeamDekho';
const BRAND_TAGLINE = 'Dekho. Samjho. Badho.';
const LOGO_SRC = '/teamdekho-icon.svg';
const MOBILE_BREAKPOINT = 768;
const ALLOWED_STATUSES = ['active', 'premium'];

/* -------------------------------------------------------------------------- */
/*  Text helpers                                                              */
/* -------------------------------------------------------------------------- */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** Bold, italic and links on text that has ALREADY been escaped. */
const formatInline = (text) =>
  text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

/**
 * Minimal, XSS-safe markdown renderer.
 * Everything is escaped first; code is lifted into placeholders so that
 * no inline formatting or <br/> insertion ever touches it.
 */
const formatText = (text) => {
  if (!text) return '';

  const blocks = [];
  const stash = (html) => `\u0000BLOCK${blocks.push(html) - 1}\u0000`;
  const codeBlock = (lang, code) =>
    stash(
      `<pre class="code-block"${lang ? ` data-lang="${lang}"` : ''}><code>${code.replace(/\n$/, '')}</code></pre>`
    );

  let safe = escapeHtml(text);

  // Complete fenced blocks
  safe = safe.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    codeBlock(lang, code)
  );
  // Unterminated fence (message is still streaming)
  safe = safe.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*)$/, (_, lang, code) =>
    codeBlock(lang, code)
  );
  // Inline code
  safe = safe.replace(/`([^`\n]+)`/g, (_, code) =>
    stash(`<code class="inline-code">${code}</code>`)
  );

  const out = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.join('<br/>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  safe.split('\n').forEach((line) => {
    const trimmed = line.trim();
    const ul = /^\s*[-•*]\s+(.*)/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)/.exec(line);
    const heading = /^\s{0,3}#{1,4}\s+(.*)/.exec(line);

    if (ul || ol) {
      flushParagraph();
      const type = ul ? 'ul' : 'ol';
      if (listType !== type) {
        closeList();
        out.push(`<${type}>`);
        listType = type;
      }
      out.push(`<li>${formatInline((ul || ol)[1])}</li>`);
    } else if (heading) {
      flushParagraph();
      closeList();
      out.push(`<h4>${formatInline(heading[1])}</h4>`);
    } else if (!trimmed) {
      flushParagraph();
      closeList();
    } else if (/^\u0000BLOCK\d+\u0000$/.test(trimmed) && blocks[parseInt(trimmed.slice(6), 10)]?.startsWith('<pre')) {
      flushParagraph();
      closeList();
      out.push(trimmed);
    } else {
      closeList();
      paragraph.push(formatInline(line));
    }
  });
  flushParagraph();
  closeList();

  return out.join('').replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
};

const getSpeechRecognition = () =>
  typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition || null;

const BrandLogo = ({ size = 28 }) => (
  <img
    className="brand-logo"
    src={LOGO_SRC}
    alt=""
    width={size}
    height={size}
    draggable={false}
  />
);

/* -------------------------------------------------------------------------- */
/*  Message row                                                               */
/* -------------------------------------------------------------------------- */

const ChatRow = memo(({ msg }) => {
  const isAssistant = msg.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  const parsedContent = useMemo(() => {
    if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed && typeof parsed === 'object' && parsed.type) return parsed;
      } catch (_) {
        /* plain text that merely starts with "{" */
      }
    }
    if (msg.type === 'calculator_widget') {
      return { type: 'calculator_widget', data: msg.data };
    }
    return null;
  }, [msg.content, msg.type, msg.data]);

  const isWidget = isAssistant && parsedContent?.type === 'calculator_widget';
  const html = useMemo(() => (isWidget ? '' : formatText(msg.content)), [msg.content, isWidget]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopy = useCallback(() => {
    if (!msg.content || !navigator.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(msg.content)
      .then(() => {
        setCopied(true);
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }, [msg.content]);

  return (
    <div className={`chat-row ${msg.role}`}>
      <div className="msg-avatar" aria-hidden="true">
        {isAssistant ? (
          <div className="ai-avatar"><BrandLogo size={28} /></div>
        ) : (
          <div className="user-avatar">You</div>
        )}
      </div>

      <div className="msg-body">
        <div className="msg-sender-name">{isAssistant ? BRAND_NAME : 'You'}</div>

        {msg.image && (
          <div className="msg-attachment">
            <img src={msg.image} alt="Attachment" loading="lazy" />
          </div>
        )}

        {isWidget ? (
          <div className="msg-widget">
            <CalculatorWidget initialData={parsedContent.data} />
          </div>
        ) : (
          html && (
            <div
              className="msg-bubble-text"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        )}

        {isAssistant && msg.imageUrl && (
          <div className="msg-product-card">
            <img src={msg.imageUrl} alt="Product" loading="lazy" />
          </div>
        )}

        {isAssistant && !isWidget && msg.content && (
          <div className="msg-actions">
            <button
              type="button"
              className={`msg-action-btn ${copied ? 'copied' : ''}`}
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
      <div className="ai-avatar"><BrandLogo size={28} /></div>
    </div>
    <div className="msg-body">
      <div className="msg-sender-name">{BRAND_NAME}</div>
      <div className="typing-dots" role="status" aria-label="Assistant is typing">
        <span /><span /><span />
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Chat window                                                               */
/* -------------------------------------------------------------------------- */

const ChatWindow = () => {
  const { messages, status, sendMessage } = useChatEngine();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isRemovingImage, setIsRemovingImage] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  const [isSidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT
  );
  const [theme, setTheme] = useState('light');
  const [showScrollButton, setShowScrollButton] = useState(false);

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const removeTimerRef = useRef(null);

  const isLoading = status === 'loading';
  const speechSupported = useMemo(() => Boolean(getSpeechRecognition()), []);

  /* ---- Scrolling ---- */

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
    setShowScrollButton(distanceFromBottom > 240);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowScrollButton(false);
  }, []);

  /* ---- Responsive sidebar ---- */

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile((prev) => {
        // Collapse the drawer only when crossing into mobile
        if (mobile && !prev) setSidebarOpen(false);
        return mobile;
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* ---- Viewport height (software keyboards) ---- */

  useEffect(() => {
    const root = rootRef.current;
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!root || !viewport) return undefined;

    const syncHeight = () => {
      root.style.setProperty('--app-height', `${viewport.height}px`);
    };
    syncHeight();
    viewport.addEventListener('resize', syncHeight);
    return () => viewport.removeEventListener('resize', syncHeight);
  }, []);

  /* ---- Edge-to-edge: page background + browser chrome colour ---- */

  useEffect(() => {
    const color = theme === 'dark' ? '#0b0d13' : '#f6f7fa';
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      html: html.style.backgroundColor,
      body: body.style.backgroundColor,
      margin: body.style.margin,
    };
    html.style.backgroundColor = color;
    body.style.backgroundColor = color;
    body.style.margin = '0';

    let meta = document.querySelector('meta[name="theme-color"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    const prevContent = meta.getAttribute('content');
    meta.setAttribute('content', color);

    return () => {
      html.style.backgroundColor = prev.html;
      body.style.backgroundColor = prev.body;
      body.style.margin = prev.margin;
      if (created) meta.remove();
      else if (prevContent !== null) meta.setAttribute('content', prevContent);
    };
  }, [theme]);

  /* ---- Speech recognition (fully guarded) ---- */

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return undefined;

    let recognition;
    try {
      recognition = new SpeechRecognition();
    } catch (error) {
      console.warn('Speech recognition unavailable:', error);
      return undefined;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      if (event?.error && event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal && result[0]) {
          finalTranscript += `${result[0].transcript} `;
        }
      }
      if (finalTranscript) {
        setInput((prev) => `${prev}${finalTranscript}`);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.abort ? recognition.abort() : recognition.stop();
      } catch (_) {
        /* already stopped */
      }
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (_) {
      /* not running */
    }
  }, []);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert('Your browser does not support voice input.');
      return;
    }
    try {
      if (isListening) recognition.stop();
      else recognition.start();
    } catch (error) {
      // start() throws InvalidStateError if a session is already active
      console.warn('Could not toggle voice input:', error);
      setIsListening(false);
    }
  }, [isListening]);

  const handleSwitchToVoiceMode = () => {
    stopListening();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {
        /* ignore */
      }
    }
    navigate('/voice-call');
  };

  /* ---- Image attachment ---- */

  const previewUrl = useMemo(
    () => (selectedImage ? URL.createObjectURL(selectedImage) : null),
    [selectedImage]
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  useEffect(() => () => clearTimeout(removeTimerRef.current), []);

  const handleImageProcessing = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
      setSelectedImage(compressedFile);
    } catch (e) {
      setSelectedImage(file);
    }
  };

  const removeImage = useCallback(() => {
    setIsRemovingImage(true);
    clearTimeout(removeTimerRef.current);
    removeTimerRef.current = setTimeout(() => {
      setSelectedImage(null);
      setIsRemovingImage(false);
    }, 180);
  }, []);

  /* ---- Textarea auto-grow ---- */

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  /* ---- Sending ---- */

  const handleSend = () => {
    if (isLoading) return;

    if (user && !ALLOWED_STATUSES.includes(user.status)) {
      navigate('/payment-setup');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed && !selectedImage) return;

    stickToBottomRef.current = true;
    sendMessage(trimmed, selectedImage);
    setInput('');
    setSelectedImage(null);
    setIsRemovingImage(false);
    if (isListening) stopListening();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasDraft = input.trim().length > 0 || Boolean(selectedImage);
  const canSend = hasDraft && !isLoading;

  return (
    <div className="rcm-app" data-theme={theme} ref={rootRef}>
      <aside
        className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
        aria-label="Sidebar"
      >
        <div className="sidebar-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}
          </button>
        </div>

        {isSidebarOpen && (
          <div className="sidebar-content">
            <button
              type="button"
              className="new-chat-pill"
              onClick={() => window.location.reload()}
            >
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
                type="button"
                className="icon-btn mobile-only"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu size={19} />
              </button>
            )}
            <div className="header-brand">
              <BrandLogo size={32} />
              <div className="brand-text">
                <span className="brand-name">
                  {BRAND_NAME}
                  <span className="beta-badge">BETA</span>
                </span>
                <span className="brand-tagline">{BRAND_TAGLINE}</span>
              </div>
            </div>
          </div>
          <div className="header-right">
            <button
              type="button"
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
              <div className="hero-logo-box"><BrandLogo size={84} /></div>
              <h1 className="hero-title">Hello, Leader.</h1>
              <h2 className="hero-subtitle">Team dekho, products dekho, AI se jaankari lo.</h2>
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

        <div className="input-container">
          {showScrollButton && (
            <button
              type="button"
              className="scroll-to-bottom-btn"
              onClick={jumpToBottom}
              aria-label="Jump to latest"
            >
              <ArrowDown size={16} />
            </button>
          )}

          <div className="input-max-width">
            {previewUrl && (
              <div className={`preview-badge ${isRemovingImage ? 'removing' : ''}`}>
                <img src={previewUrl} alt="Selected upload preview" />
                <button type="button" onClick={removeImage} aria-label="Remove image">
                  <X size={13} />
                </button>
              </div>
            )}

            <div className={`input-box ${isListening ? 'recording-mode' : ''}`}>
              <button
                type="button"
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
                aria-label={`Message ${BRAND_NAME}`}
              />

              <div className="input-actions">
                {speechSupported && !hasDraft && (
                  <button
                    type="button"
                    className={`icon-btn mic-btn ${isListening ? 'active-red' : ''}`}
                    onClick={toggleListening}
                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-pressed={isListening}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}

                {!hasDraft ? (
                  <button
                    type="button"
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
                    type="button"
                    className={`send-btn ${canSend ? 'active' : ''}`}
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    {isLoading ? <Loader2 size={17} className="spin" /> : <Send size={16} />}
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
        onChange={(e) => {
          handleImageProcessing(e.target.files?.[0]);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />

      {isMobile && isSidebarOpen && (
        <div className="backdrop" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
};

export default ChatWindow;