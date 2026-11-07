import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import {
  Menu, Plus, Mic, MicOff, X, Calculator, AudioLines, Copy, Check, Sun, Moon,
  ArrowDown, ArrowUp, PanelLeftClose, RotateCcw, WifiOff, ImagePlus,
  LayoutDashboard, Users, Sparkles, MessageSquareText, TrendingUp, Crown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import imageCompression from 'browser-image-compression';
import { useChatEngine } from '../../hooks/useChatEngine';
import SubscriptionRequired from '../SubscriptionRequired/SubscriptionRequired';
import './ChatWindow.css';
import CalculatorWidget from './CalculatorWidget';

/**
 * TeamDekho chat window.
 *
 * Layout language (Claude / Gemini):
 *  - You: a soft bubble on the right.  Assistant: open text on the page, no box, with the brand mark.
 *  - Composer: one floating card (text on top, tools underneath) with a brand-gradient focus ring.
 *
 * Waiting never feels dead:
 *  - the moment you send, a "thinking" row appears (animated mark, rotating status line, skeleton lines);
 *  - the answer is revealed progressively (adaptive speed, ~1-2s for any length) instead of popping in;
 *  - if the engine streams for real, the same row simply follows the growing text.
 *
 * Also handled: empty state with suggestions, offline, request error + retry, paste / drag-and-drop
 * images, tables / quotes / code (with copy), long text, calculator sheet, voice dictation,
 * saved theme, software keyboards, reduced motion.
 */

const BRAND_NAME = 'TeamDekho';
const BRAND_TAGLINE = 'Dekho. Samjho. Badho.';
const LOGO_SRC = '/teamdekho-icon.svg';
const THEME_KEY = 'td_chat_theme';
const MOBILE_BREAKPOINT = 768;
const MAX_IMAGE_MB = 15;

/* The backend/hook sends an automatic greeting as the first message.
   Set to true to hide it so the chat opens clean. Best fix: start useChatEngine with []. */
const HIDE_INITIAL_GREETING = false;

/* Older hook versions store image-only messages as this placeholder text. */
const IMAGE_PLACEHOLDER = /^\s*(?:📷\s*)?Image Uploaded\s*$/i;

const QUICK_ACTIONS = [
  { id: 'calculator', label: 'Bonus Calculator', Icon: Calculator },
];

const SUGGESTIONS = [
  { id: 'team', Icon: Users, title: 'Team summary', prompt: 'Meri team ka quick performance summary batao.' },
  { id: 'bonus', Icon: Sparkles, title: 'Explain the bonus plan', prompt: 'Bonus plan ko simple bhasha mein samjhao.' },
  { id: 'welcome', Icon: MessageSquareText, title: 'Welcome message', prompt: 'Naye member ke liye ek achha WhatsApp welcome message likho.' },
  { id: 'grow', Icon: TrendingUp, title: 'Grow my business', prompt: 'Is mahine PV badhane ke 5 practical tips do.' },
];

/* What the "thinking" row says as the wait gets longer (seconds -> text). */
const THINKING_STEPS = [
  { at: 0, text: 'Thinking' },
  { at: 4, text: 'Looking into your question' },
  { at: 9, text: 'Putting the answer together' },
  { at: 18, text: 'Still working on it' },
  { at: 35, text: 'Taking longer than usual, hang on' },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** Bold, italic and links on text that has ALREADY been escaped. */
const formatInline = (text) =>
  text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const renderTable = (rows) => {
  const head = splitCells(rows[0]);
  const aligns = splitCells(rows[1]).map((c) => {
    if (/^:-+:$/.test(c)) return 'center';
    if (/-+:$/.test(c)) return 'right';
    return 'left';
  });
  const cell = (tag, value, i) => `<${tag} style="text-align:${aligns[i] || 'left'}">${formatInline(value)}</${tag}>`;
  const body = rows.slice(2).map((r) => `<tr>${splitCells(r).map((c, i) => cell('td', c, i)).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head.map((c, i) => cell('th', c, i)).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
};

/**
 * Minimal, XSS-safe markdown renderer.
 * Everything is escaped first; code is lifted into placeholders so no inline formatting ever touches it.
 * Handles: fenced / inline code, headings, lists, tables, quotes, rules, bold, italic, links.
 * Tolerates half-finished text (a message that is still being revealed or streamed).
 */
const formatText = (text) => {
  if (!text) return '';

  const blocks = [];
  const stash = (html) => `\u0000BLOCK${blocks.push(html) - 1}\u0000`;
  const codeBlock = (lang, code) =>
    stash(
      `<div class="code-block"><div class="code-head"><span>${lang || 'code'}</span>` +
      `<button type="button" class="code-copy" data-copy-code>Copy</button></div>` +
      `<pre><code>${code.replace(/\n$/, '')}</code></pre></div>`
    );

  let safe = escapeHtml(text);
  safe = safe.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => codeBlock(lang, code));
  safe = safe.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*)$/, (_, lang, code) => codeBlock(lang, code)); // still streaming
  safe = safe.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code class="inline-code">${code}</code>`));

  const out = [];
  let paragraph = [];
  let quote = [];
  let listType = null;

  const flushParagraph = () => {
    if (paragraph.length) { out.push(`<p>${paragraph.join('<br/>')}</p>`); paragraph = []; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote>${quote.join('<br/>')}</blockquote>`); quote = []; }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const flushAll = () => { flushParagraph(); flushQuote(); closeList(); };

  const lines = safe.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const ul = /^\s*[-•*]\s+(.*)/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)/.exec(line);
    const heading = /^\s{0,3}(#{1,4})\s+(.*)/.exec(line);
    const quoted = /^\s{0,3}&gt;\s?(.*)/.exec(line);

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushAll();
      const rows = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j])) { rows.push(lines[j]); j += 1; }
      out.push(renderTable(rows));
      i = j - 1;
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushAll();
      out.push('<hr/>');
    } else if (ul || ol) {
      flushParagraph();
      flushQuote();
      const type = ul ? 'ul' : 'ol';
      if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
      out.push(`<li>${formatInline((ul || ol)[1])}</li>`);
    } else if (heading) {
      flushAll();
      const tag = heading[1].length <= 2 ? 'h3' : 'h4';
      out.push(`<${tag}>${formatInline(heading[2])}</${tag}>`);
    } else if (quoted) {
      flushParagraph();
      closeList();
      quote.push(formatInline(quoted[1]));
    } else if (!trimmed) {
      flushAll();
    } else if (/^\u0000BLOCK\d+\u0000$/.test(trimmed) && blocks[parseInt(trimmed.slice(6), 10)]?.startsWith('<div class="code-block"')) {
      flushAll();
      out.push(trimmed);
    } else {
      flushQuote();
      closeList();
      paragraph.push(formatInline(line));
    }
  }
  flushAll();

  return out.join('').replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
};

const getSpeechRecognition = () =>
  typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Clipboard with a fallback for insecure contexts / older WebViews. */
const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
};

const greetingFor = (date = new Date()) => {
  const h = date.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/* Reveal speed: ease-out catch-up (fast for long text, never slower than 2 chars/frame),
   and never stops in the middle of a word. */
const advanceReveal = (text, prev) => {
  const len = text.length;
  const remaining = len - prev;
  const step = Math.min(90, Math.max(2, Math.ceil(remaining * 0.045)));
  let next = Math.min(len, prev + step);
  let guard = 0;
  while (next < len && guard < 12 && !/\s/.test(text[next - 1])) { next += 1; guard += 1; }
  return next;
};

const trimPartial = (text) => {
  let t = text;
  const last = t.charCodeAt(t.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) t = t.slice(0, -1); // half an emoji
  return t.replace(/\*{1,2}$/, ''); // a not-yet-closed ** / *
};

const insertCaret = (html) => {
  const caret = '<span class="stream-caret" aria-hidden="true"></span>';
  const idx = html.lastIndexOf('</');
  if (idx === -1) return html + caret;
  const tag = /^<\/(p|li|h3|h4)>/.exec(html.slice(idx));
  return tag ? html.slice(0, idx) + caret + html.slice(idx) : html + caret;
};

/* -------------------------------------------------------------------------- */
/*  Small components                                                          */
/* -------------------------------------------------------------------------- */

const BrandMark = ({ size = 28, thinking = false }) => (
  <span className={`brand-mark${thinking ? ' is-thinking' : ''}`} style={{ width: size, height: size }}>
    <img className="brand-logo" src={LOGO_SRC} alt="" width={size} height={size} draggable={false} />
  </span>
);

const CopyButton = memo(function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = useCallback(() => {
    if (!text) return;
    copyToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);

  return (
    <button
      type="button"
      className={`msg-action-btn ${copied ? 'copied' : ''} ${className}`}
      onClick={onClick}
      aria-label="Copy"
      title="Copy"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
});

/** Assistant text: progressive reveal for a freshly arrived answer, instant for history. */
const AssistantText = memo(function AssistantText({ content, animate, streaming }) {
  const animating = animate && !prefersReducedMotion();
  const [shown, setShown] = useState(() => (animating ? 0 : content.length));
  const shownRef = useRef(shown);
  const textRef = useRef(content);
  textRef.current = content;

  useEffect(() => {
    if (!animating) return undefined;
    let raf = 0;
    const tick = () => {
      const text = textRef.current;
      if (shownRef.current >= text.length) { raf = 0; return; } // done; restarts if the text grows
      shownRef.current = advanceReveal(text, shownRef.current);
      setShown(shownRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating, content.length]);

  const visibleLen = animating ? Math.min(shown, content.length) : content.length;
  const revealing = animating && visibleLen < content.length;
  const html = useMemo(() => {
    const raw = revealing ? trimPartial(content.slice(0, visibleLen)) : content.slice(0, visibleLen);
    const rendered = formatText(raw);
    return revealing || streaming ? insertCaret(rendered) : rendered;
  }, [content, visibleLen, revealing, streaming]);

  return <div className="msg-text" dangerouslySetInnerHTML={{ __html: html }} />;
});

const getWidgetPayload = (msg) => {
  if (!msg || msg.role !== 'assistant') return null;
  if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed && typeof parsed === 'object' && parsed.type === 'calculator_widget') return parsed;
    } catch (_) { /* plain text that merely starts with "{" */ }
  }
  if (msg.type === 'calculator_widget') return { type: 'calculator_widget', data: msg.data };
  return null;
};

const ChatRow = memo(function ChatRow({ msg, animate, streaming, onOpenCalculator }) {
  const isAssistant = msg.role === 'assistant';
  const widget = useMemo(() => getWidgetPayload(msg), [msg]);
  const content = typeof msg.content === 'string' ? msg.content : '';

  // one delegated handler for every "Copy" button inside rendered code blocks
  const onBodyClick = useCallback((e) => {
    const btn = e.target.closest?.('[data-copy-code]');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code')?.textContent || '';
    copyToClipboard(code).then((ok) => {
      if (!ok) return;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  }, []);

  if (!isAssistant) {
    const html = content ? formatText(content) : '';
    return (
      <div className="chat-row user">
        <div className="msg-body">
          {msg.image && (
            <div className="msg-attachment"><img src={msg.image} alt="Attachment" loading="lazy" /></div>
          )}
          {html && <div className="user-bubble msg-text" dangerouslySetInnerHTML={{ __html: html }} onClick={onBodyClick} />}
          {content && (
            <div className="msg-actions"><CopyButton text={content} /></div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-row assistant">
      <div className="assistant-mark"><BrandMark size={28} thinking={streaming} /></div>
      <div className="msg-body" onClick={onBodyClick}>
        {widget ? (
          <button type="button" className="widget-chip" onClick={() => onOpenCalculator(widget.data)}>
            <span className="widget-chip-icon"><Calculator size={18} /></span>
            <span className="widget-chip-text">
              <strong>Bonus Calculator</strong>
              <small>Tap to open</small>
            </span>
          </button>
        ) : (
          content && <AssistantText content={content} animate={animate} streaming={streaming} />
        )}

        {msg.imageUrl && (
          <div className="msg-product-card"><img src={msg.imageUrl} alt="Product" loading="lazy" /></div>
        )}

        {!widget && content && !streaming && (
          <div className="msg-actions"><CopyButton text={content} /></div>
        )}
      </div>
    </div>
  );
});

/** Shown from the instant you send until the first words arrive. */
const ThinkingRow = () => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const step = [...THINKING_STEPS].reverse().find((s) => seconds >= s.at) || THINKING_STEPS[0];

  return (
    <div className="chat-row assistant thinking-row" role="status" aria-label="Assistant is thinking">
      <div className="assistant-mark"><BrandMark size={28} thinking /></div>
      <div className="msg-body">
        <p className="thinking-label"><span>{step.text}</span></p>
        <div className="skeleton" aria-hidden="true">
          <i style={{ width: '92%' }} />
          <i style={{ width: '78%' }} />
          <i style={{ width: '54%' }} />
        </div>
      </div>
    </div>
  );
};

const ErrorRow = ({ onRetry }) => (
  <div className="chat-row assistant error-row" role="alert">
    <div className="assistant-mark"><BrandMark size={28} /></div>
    <div className="msg-body">
      <div className="error-card">
        <p>Couldn&apos;t get a response. Check your connection and try again.</p>
        <button type="button" className="retry-btn" onClick={onRetry}>
          <RotateCcw size={15} /> Try again
        </button>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Chat window                                                               */
/* -------------------------------------------------------------------------- */

const ChatWindow = () => {
  const engine = useChatEngine();
  const { messages, status, sendMessage } = engine;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isRemovingImage, setIsRemovingImage] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  const [isSidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) { /* storage unavailable */ }
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMounted, setCalcMounted] = useState(false);
  const [calcData, setCalcData] = useState({});
  const [sentImages, setSentImages] = useState({}); // user-message ordinal -> image URL
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const removeTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const calcCloseRef = useRef(null);
  const sheetLayerRef = useRef(null);
  const sentImagesRef = useRef({});
  const prevLenRef = useRef(messages.length);
  const knownCountRef = useRef(messages.length);
  const animateKeysRef = useRef(new Set());
  const messagesRef = useRef(messages);
  const lastRequestRef = useRef(null);
  const dragDepthRef = useRef(0);

  messagesRef.current = messages;

  const isLoading = status === 'loading';
  const hasEngineError = status === 'error' || status === 'failed' || Boolean(engine.error);
  const speechSupported = useMemo(() => Boolean(getSpeechRecognition()), []);
  const firstName = useMemo(() => String(user?.fullName || '').trim().split(/\s+/)[0] || 'Leader', [user?.fullName]);
  const greeting = useMemo(() => greetingFor(), []);

  const notify = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2800);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const visibleMessages = useMemo(() => {
    if (!HIDE_INITIAL_GREETING) return messages;
    const first = messages[0];
    if (first && first.role === 'assistant' && !getWidgetPayload(first)) return messages.slice(1);
    return messages;
  }, [messages]);
  const hasMessages = visibleMessages.length > 0;

  // A reply that just arrived (not history) is revealed progressively.
  if (messages.length > knownCountRef.current) {
    const grewBy = messages.length - knownCountRef.current;
    const last = messages[messages.length - 1];
    if (grewBy <= 2 && last && last.role === 'assistant') {
      animateKeysRef.current.add(String(last.id ?? messages.length - 1));
    }
    knownCountRef.current = messages.length;
  }

  // Attach the picture the user sent to their message
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

  const lastMessage = messages[messages.length - 1];
  const assistantStarted = Boolean(lastMessage && lastMessage.role === 'assistant' && lastMessage.content);
  const showThinking = isLoading && !assistantStarted;
  const streamingLast = isLoading && assistantStarted;
  const showError = !isLoading && hasEngineError && lastMessage?.role === 'user';

  /* ---- Theme ---- */

  useEffect(() => {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (_) { /* storage unavailable */ }
  }, [theme]);

  /* ---- Online / offline ---- */

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

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
    const onKey = (e) => { if (e.key === 'Escape') setCalcOpen(false); };
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

  /* ---- Scrolling: follow the answer as it grows, unless the reader scrolled up ---- */

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('auto');
  }, [messages, status, scrollToBottom]);

  useEffect(() => {
    const target = listRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollToBottom('auto');
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [hasMessages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 120;
    setShowScrollButton(distance > 240);
  }, []);

  const jumpToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    scrollToBottom('smooth');
    setShowScrollButton(false);
  }, [scrollToBottom]);

  /* ---- Responsive sidebar ---- */

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile((prev) => {
        if (mobile && !prev) setSidebarOpen(false); // collapse the drawer only when crossing into mobile
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
      if (stickToBottomRef.current) scrollToBottom('auto');
    };
    syncHeight();
    viewport.addEventListener('resize', syncHeight);
    return () => viewport.removeEventListener('resize', syncHeight);
  }, [scrollToBottom]);

  /* ---- Edge-to-edge: page background + browser chrome colour ---- */

  useEffect(() => {
    const color = theme === 'dark' ? '#0a0c14' : '#f6f7fc';
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.backgroundColor, body: body.style.backgroundColor, margin: body.style.margin };
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
        if (result?.isFinal && result[0]) finalTranscript += `${result[0].transcript} `;
      }
      if (finalTranscript) setInput((prev) => `${prev}${finalTranscript}`);
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        if (recognition.abort) recognition.abort();
        else recognition.stop();
      } catch (_) { /* already stopped */ }
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) { /* not running */ }
  }, []);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      notify('Your browser does not support voice input.');
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
  }, [isListening, notify]);

  const handleSwitchToVoiceMode = useCallback(() => {
    stopListening();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
    }
    navigate('/voice-call');
  }, [stopListening, navigate]);

  /* ---- Image attachment (picker, paste, drag & drop) ---- */

  const previewUrl = useMemo(() => (selectedImage ? URL.createObjectURL(selectedImage) : null), [selectedImage]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => clearTimeout(removeTimerRef.current), []);
  useEffect(() => () => {
    Object.values(sentImagesRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const handleImageProcessing = useCallback(async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      notify('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      notify(`That image is too large (max ${MAX_IMAGE_MB} MB).`);
      return;
    }
    try {
      const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
      setSelectedImage(compressedFile);
    } catch (e) {
      setSelectedImage(file);
    }
  }, [notify]);

  const removeImage = useCallback(() => {
    setIsRemovingImage(true);
    clearTimeout(removeTimerRef.current);
    removeTimerRef.current = setTimeout(() => {
      setSelectedImage(null);
      setIsRemovingImage(false);
    }, 180);
  }, []);

  const handlePaste = useCallback((e) => {
    const file = Array.from(e.clipboardData?.files || []).find((f) => f.type && f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      handleImageProcessing(file);
    }
  }, [handleImageProcessing]);

  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    handleImageProcessing(Array.from(e.dataTransfer.files).find((f) => f.type && f.type.startsWith('image/')) || e.dataTransfer.files[0]);
  };

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

  const submitMessage = useCallback((rawText, image) => {
    if (isLoading) return false;
    if (!user || user.status !== 'premium') return false; // SubscriptionRequired is rendered instead
    if (!online) {
      notify("You're offline. Check your connection and try again.");
      return false;
    }
    const trimmed = String(rawText || '').trim();
    if (!trimmed && !image) return false;

    stickToBottomRef.current = true;
    if (image) {
      const url = URL.createObjectURL(image);
      const ordinal = messagesRef.current.filter((m) => m.role === 'user').length;
      sentImagesRef.current = { ...sentImagesRef.current, [ordinal]: url };
      setSentImages(sentImagesRef.current);
    }
    lastRequestRef.current = { text: trimmed, image: image || null };
    sendMessage(trimmed, image || null);
    return true;
  }, [isLoading, user, online, notify, sendMessage]);

  const handleSend = () => {
    if (submitMessage(input, selectedImage)) {
      setInput('');
      setSelectedImage(null);
      setIsRemovingImage(false);
      if (isListening) stopListening();
    }
  };

  const handleRetry = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last || isLoading) return;
    stickToBottomRef.current = true;
    sendMessage(last.text, last.image);
  }, [isLoading, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasDraft = input.trim().length > 0 || Boolean(selectedImage);
  const canSend = hasDraft && !isLoading && online;

  if (user && user.status !== 'premium') {
    return <SubscriptionRequired />;
  }

  const sidebarItems = [
    { id: 'new', label: 'New chat', Icon: Plus, onClick: () => window.location.reload(), primary: true },
    { id: 'calc', label: 'Bonus Calculator', Icon: Calculator, onClick: () => { openCalculator(); if (isMobile) setSidebarOpen(false); } },
    { id: 'voice', label: 'Live voice chat', Icon: AudioLines, onClick: handleSwitchToVoiceMode },
    { id: 'home', label: 'Dashboard', Icon: LayoutDashboard, onClick: () => navigate('/dashboard') },
  ];

  return (
    <div
      className="rcm-app"
      data-theme={theme}
      ref={rootRef}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`} aria-label="Sidebar">
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

        <nav className="sidebar-nav" aria-label="Chat tools">
          {sidebarItems.map(({ id, label, Icon, onClick, primary }) => (
            <button
              key={id}
              type="button"
              className={`side-item${primary ? ' primary' : ''}`}
              onClick={onClick}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip" title={user?.fullName || ''}>
            <span className="user-avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span>
            <span className="user-meta">
              <strong>{firstName}</strong>
              <small><Crown size={11} /> Premium</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="main-header">
          <div className="header-left">
            {!isSidebarOpen && (
              <button type="button" className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <Menu size={19} />
              </button>
            )}
            <div className="header-brand">
              <BrandMark size={32} />
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

        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} /> You&apos;re offline. Reconnect to keep chatting.
          </div>
        )}

        <div className="chat-scroll-wrapper" ref={scrollRef} onScroll={handleScroll}>
          {!hasMessages && !isLoading ? (
            <div className="welcome-hero">
              <div className="hero-mark"><BrandMark size={72} thinking /></div>
              <h1 className="hero-title">
                <span className="hero-greet">{greeting},</span>{' '}
                <span className="hero-name">{firstName}</span>
              </h1>
              <h2 className="hero-subtitle">Team dekho, products dekho, AI se jaankari lo.</h2>

              <div className="suggestions" role="group" aria-label="Suggestions">
                {SUGGESTIONS.map(({ id, Icon, title, prompt }) => (
                  <button key={id} type="button" className="suggestion-card" onClick={() => submitMessage(prompt, null)}>
                    <span className="suggestion-icon"><Icon size={18} /></span>
                    <span className="suggestion-text">
                      <strong>{title}</strong>
                      <small>{prompt}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="quick-actions" role="group" aria-label="Quick actions">
                {QUICK_ACTIONS.map(({ id, label, Icon }) => (
                  <button key={id} type="button" className="quick-chip" onClick={() => handleQuickAction(id)}>
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list" ref={listRef}>
              {displayMessages.map((msg, i) => {
                const key = String(msg.id ?? i);
                const isLast = i === displayMessages.length - 1;
                return (
                  <ChatRow
                    key={key}
                    msg={msg}
                    animate={animateKeysRef.current.has(String(msg.id ?? messages.length - displayMessages.length + i))}
                    streaming={isLast && streamingLast}
                    onOpenCalculator={openCalculator}
                  />
                );
              })}
              {showThinking && <ThinkingRow />}
              {showError && <ErrorRow onRetry={handleRetry} />}
            </div>
          )}
        </div>

        <div className="sr-only" aria-live="polite" role="status">
          {showThinking ? 'Assistant is thinking' : ''}
        </div>

        <div className="input-container">
          {showScrollButton && (
            <button type="button" className="scroll-to-bottom-btn" onClick={jumpToBottom} aria-label="Jump to latest">
              <ArrowDown size={16} />
            </button>
          )}

          {notice && <div className="toast" role="status">{notice}</div>}

          <div className="input-max-width">
            <div className={`composer ${isListening ? 'recording-mode' : ''} ${isLoading ? 'is-busy' : ''}`}>
              {previewUrl && (
                <div className={`preview-badge ${isRemovingImage ? 'removing' : ''}`}>
                  <img src={previewUrl} alt="Selected upload preview" />
                  <button type="button" onClick={removeImage} aria-label="Remove image">
                    <X size={13} />
                  </button>
                </div>
              )}

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={isListening ? 'Listening…' : `Message ${BRAND_NAME}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                aria-label={`Message ${BRAND_NAME}`}
              />

              <div className="composer-bar">
                <button
                  type="button"
                  className="icon-btn add-file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach an image"
                  title="Attach an image"
                >
                  <Plus size={20} />
                </button>

                <div className="input-actions">
                  {speechSupported && (
                    <button
                      type="button"
                      className={`icon-btn mic-btn ${isListening ? 'active-red' : ''}`}
                      onClick={toggleListening}
                      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                      aria-pressed={isListening}
                      title="Dictate"
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
                      className={`send-btn ${canSend ? 'active' : ''} ${isLoading ? 'busy' : ''}`}
                      onClick={handleSend}
                      disabled={!canSend}
                      aria-label="Send message"
                    >
                      {isLoading ? <span className="send-spinner" aria-hidden="true" /> : <ArrowUp size={19} strokeWidth={2.4} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="disclaimer-text">
              {BRAND_NAME} can make mistakes. Please verify important billing information.
            </p>
          </div>
        </div>
      </main>

      {calcMounted && (
        <div ref={sheetLayerRef} className={`sheet-layer ${calcOpen ? 'open' : ''}`}>
          <div className="sheet-scrim" onClick={closeCalculator} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Bonus Calculator">
            <div className="sheet-grabber" aria-hidden="true" />
            <header className="sheet-header">
              <h2>Bonus Calculator</h2>
              <button type="button" ref={calcCloseRef} className="icon-btn" onClick={closeCalculator} aria-label="Close calculator">
                <X size={19} />
              </button>
            </header>
            <div className="sheet-body">
              <CalculatorWidget initialData={calcData} />
            </div>
          </section>
        </div>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <ImagePlus size={30} />
            <strong>Drop an image to attach</strong>
            <span>PNG, JPG or WebP</span>
          </div>
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

      {isMobile && isSidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
};

export default ChatWindow;