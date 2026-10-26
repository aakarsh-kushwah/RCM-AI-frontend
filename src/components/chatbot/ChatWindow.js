import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  Send, Menu, Plus, Mic, MicOff, X, Loader2, Calculator,
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

/* Chips on the empty-chat screen (like Gemini's "Create image", "Music"…).
   Add more entries here later and handle them in handleQuickAction. */
const QUICK_ACTIONS = [
  { id: 'calculator', label: 'Bonus Calculator', Icon: Calculator },
];

/* The backend/hook sends an automatic greeting as the first message.
   Hidden here so the chat opens clean. Best fix: start useChatEngine with []. */
const HIDE_INITIAL_GREETING = true;

/* Older hook versions store image-only messages as this placeholder text.
   When a real image is available we show the picture instead of the text. */
const IMAGE_PLACEHOLDER = /^\s*(?:📷\s*)?Image Uploaded\s*$/i;
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

const getWidgetPayload = (msg) => {
  if (!msg || msg.role !== 'assistant') return null;
  if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed && typeof parsed === 'object' && parsed.type === 'calculator_widget') {
        return parsed;
      }
    } catch (_) {
      /* plain text that merely starts with "{" */
    }
  }
  if (msg.type === 'calculator_widget') {
    return { type: 'calculator_widget', data: msg.data };
  }
  return null;
};

const ChatRow = memo(({ msg, onOpenCalculator }) => {
  const isAssistant = msg.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  const widget = useMemo(() => getWidgetPayload(msg), [msg]);
  const html = useMemo(() => (widget ? '' : formatText(msg.content)), [msg.content, widget]);

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
      <div className="msg-body">
        {msg.image && (
          <div className="msg-attachment">
            <img src={msg.image} alt="Attachment" loading="lazy" />
          </div>
        )}

        {widget ? (
          <button
            type="button"
            className="widget-chip"
            onClick={() => onOpenCalculator(widget.data)}
          >
            <span className="widget-chip-icon"><Calculator size={18} /></span>
            <span className="widget-chip-text">
              <strong>Bonus Calculator</strong>
              <small>Tap to open</small>
            </span>
          </button>
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

        {isAssistant && !widget && msg.content && (
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

/* The logo appears only while the assistant is working. */
const TypingIndicator = () => (
  <div className="chat-row assistant" role="status" aria-label="Assistant is thinking">
    <div className="thinking">
      <BrandLogo size={28} />
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
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMounted, setCalcMounted] = useState(false);
  const [calcData, setCalcData] = useState({});
  const [sentImages, setSentImages] = useState({}); // user-message ordinal -> image URL

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const removeTimerRef = useRef(null);
  const calcCloseRef = useRef(null);
  const sheetLayerRef = useRef(null);
  const sentImagesRef = useRef({});
  const prevLenRef = useRef(messages.length);

  const isLoading = status === 'loading';
  const speechSupported = useMemo(() => Boolean(getSpeechRecognition()), []);

  const visibleMessages = useMemo(() => {
    if (!HIDE_INITIAL_GREETING) return messages;
    const first = messages[0];
    if (first && first.role === 'assistant' && !getWidgetPayload(first)) {
      return messages.slice(1);
    }
    return messages;
  }, [messages]);
  const hasMessages = visibleMessages.length > 0;

  // Attach the picture the user sent to their message (Gemini/Claude style)
  const displayMessages = useMemo(() => {
    let userIndex = -1;
    return visibleMessages.map((m) => {
      if (m.role !== 'user') return m;
      userIndex += 1;
      const image = m.image || sentImages[userIndex];
      const isPlaceholder = IMAGE_PLACEHOLDER.test(m.content || '');
      if (!image && !isPlaceholder) return m;
      return { ...m, image, content: image && isPlaceholder ? '' : m.content };
    });
  }, [visibleMessages, sentImages]);

  /* ---- Calculator sheet (one persistent instance, opened on demand) ---- */

  const openCalculator = useCallback((data) => {
    if (data) setCalcData(data);
    setCalcMounted(true);
    setCalcOpen(true);
  }, []);

  const closeCalculator = useCallback(() => setCalcOpen(false), []);

  // Open automatically when a NEW calculator reply arrives (not for old history)
  useEffect(() => {
    const previous = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (messages.length <= previous) return;
    const widget = getWidgetPayload(messages[messages.length - 1]);
    if (widget) openCalculator(widget.data);
  }, [messages, openCalculator]);

  useEffect(() => {
    if (!calcOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setCalcOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const focusTimer = setTimeout(() => calcCloseRef.current?.focus(), 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
    };
  }, [calcOpen]);

  // `inert` removes the closed sheet from focus and the accessibility tree
  useEffect(() => {
    const layer = sheetLayerRef.current;
    if (!layer) return;
    if (calcOpen) layer.removeAttribute('inert');
    else layer.setAttribute('inert', '');
  }, [calcOpen, calcMounted]);

  const handleQuickAction = useCallback((id) => {
    if (id === 'calculator') openCalculator();
  }, [openCalculator]);

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
  useEffect(() => () => {
    Object.values(sentImagesRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

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
    if (!input) {
      el.style.height = ''; // back to a single row
      return;
    }
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
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      const ordinal = messages.filter((m) => m.role === 'user').length;
      sentImagesRef.current = { ...sentImagesRef.current, [ordinal]: url };
      setSentImages(sentImagesRef.current);
    }
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
          {!hasMessages ? (
            <div className="welcome-hero">
              <div className="hero-logo-box"><BrandLogo size={84} /></div>
              <h1 className="hero-title">Hello, Leader.</h1>
              <h2 className="hero-subtitle">Team dekho, products dekho, AI se jaankari lo.</h2>
              <div className="quick-actions" role="group" aria-label="Quick actions">
                {QUICK_ACTIONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className="quick-chip"
                    onClick={() => handleQuickAction(id)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {displayMessages.map((msg, i) => (
                <ChatRow key={msg.id ?? i} msg={msg} onOpenCalculator={openCalculator} />
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

      {calcMounted && (
        <div ref={sheetLayerRef} className={`sheet-layer ${calcOpen ? 'open' : ''}`} inert="">
          <div className="sheet-scrim" onClick={closeCalculator} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Bonus Calculator">
            <div className="sheet-grabber" aria-hidden="true" />
            <header className="sheet-header">
              <h2>Bonus Calculator</h2>
              <button
                type="button"
                ref={calcCloseRef}
                className="icon-btn"
                onClick={closeCalculator}
                aria-label="Close calculator"
              >
                <X size={19} />
              </button>
            </header>
            <div className="sheet-body">
              <CalculatorWidget initialData={calcData} />
            </div>
          </section>
        </div>
      )}

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