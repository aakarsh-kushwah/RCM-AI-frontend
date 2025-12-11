import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Mic, X, Headphones, PhoneOff, 
  Volume2, VolumeX, Minimize2, Sparkles, 
  MessageCircle, Wifi, WifiOff
} from 'lucide-react';
import './ChatWindow.css'; 

// --- CONFIGURATION ---
const WHATSAPP_NUMBER = "917999440809"; 
const START_MSG = "Namaste RCM Assistant, mujhe business plan janna he.";
// Ensure this matches your backend URL (no trailing slash)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'; 

// --- SPEECH RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'hi-IN'; // Hybrid Hindi/English
  recognition.interimResults = true;
}

const ChatWindow = ({ onClose }) => {
  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState([
    { role: 'assistant', type: 'text', content: 'Jai RCM! I am your AI Business Guide. Ask me anything about products or plans.' }
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | speaking | listening
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // --- REFS & ABORT CONTROLLERS ---
  const chatBodyRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null); 
  const isVoiceModeRef = useRef(isVoiceMode);
  
  useEffect(() => { isVoiceModeRef.current = isVoiceMode; }, [isVoiceMode]);

  // --- NETWORK MONITORING ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- AUTO SCROLL (Smart) ---
  useEffect(() => {
    if (chatBodyRef.current) {
      const { scrollHeight, clientHeight } = chatBodyRef.current;
      chatBodyRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: 'smooth' });
    }
  }, [messages, liveTranscript, status]);

  // --- HAPTIC FEEDBACK HELPER ---
  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // --- 🔊 HIGH-PERFORMANCE AUDIO ENGINE (UPDATED FOR CLOUDINARY) ---
  const playAudioStream = useCallback(async (text) => {
    if (isMuted || !text) return;
    
    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setStatus('speaking');
      const token = localStorage.getItem('token') || '';

      const response = await fetch(`${API_BASE_URL}/api/chat/speak`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error("Audio fetch failed");

      // ✅ FIX: Parse JSON instead of Blob
      const data = await response.json();

      if (!data.success || !data.audioUrl) {
        throw new Error("Invalid audio response from server");
      }

      console.log("🔊 Playing audio from:", data.source); // Debug: cache vs api

      // Create Audio from Cloudinary URL
      const audio = new Audio(data.audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setStatus('idle');
      };
      
      audio.onerror = (e) => {
        console.error("Audio Playback Error:", e);
        setStatus('idle');
      };

      await audio.play();

    } catch (error) {
      console.warn("Server TTS Failed, falling back to browser:", error);
      // Fallback to Browser TTS for reliability
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      utterance.onend = () => setStatus('idle');
      window.speechSynthesis.speak(utterance);
    }
  }, [isMuted]);

  // --- 💬 CORE CHAT LOGIC (Optimistic UI) ---
  const handleSend = async (textOverride = null) => {
    const msgText = textOverride || input.trim();
    if (!msgText || status === 'loading') return;

    triggerHaptic();
    
    // Cancel previous pending request if any
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    // 1. Optimistic UI Update (Immediate feedback)
    const userMsg = { role: 'user', type: 'text', content: msgText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLiveTranscript('');
    setStatus('loading');

    try {
      const token = localStorage.getItem('token') || '';
      
      // Prepare History (Sanitized)
      const cleanHistory = messages.slice(-10).map(({ role, content }) => ({ role, content }));

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: msgText, chatHistory: cleanHistory }),
        signal: abortControllerRef.current.signal
      });

      const data = await response.json();
      
      let aiText = "Connectivity issue. Please check network.";
      if (data.success) {
        aiText = typeof data.reply === 'string' ? data.reply : data.reply?.content || aiText;
      }

      // 2. Add Bot Response
      setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: aiText }]);
      setStatus('idle');

      // 3. Auto-Speak only if in Voice Mode
      if (isVoiceModeRef.current) {
        playAudioStream(aiText);
      }

    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore cancelled requests
      console.error("Chat API Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: "Server unreachable." }]);
      setStatus('idle');
    }
  };

  // --- 🎤 SPEECH RECOGNITION ENGINE ---
  useEffect(() => {
    if (!recognition) return;

    recognition.onstart = () => {
      setStatus('listening');
      setLiveTranscript('');
      // Mute AI when user speaks
      if (audioRef.current) {
        audioRef.current.pause();
        setStatus('idle'); // Reset status immediately so new inputs can process
      }
      window.speechSynthesis.cancel();
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      if (final) {
        setInput(final);
        handleSend(final);
      } else {
        setLiveTranscript(interim);
      }
    };

    recognition.onend = () => {
      // Only reset to idle if we were listening, prevents overwriting 'loading' state
      if (status === 'listening') setStatus('idle');
    };

    recognition.onerror = (event) => {
      console.error("Speech Error:", event.error);
      setStatus('idle');
    };
  }, [status]); // Re-bind if status changes

  const toggleListening = () => {
    triggerHaptic();
    if (!recognition) return alert("Browser not supported. Use Chrome.");
    if (status === 'listening') recognition.stop();
    else recognition.start();
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(START_MSG)}`, '_blank');
  };

  // --- RENDER: VOICE OVERLAY (Gemini Live Style) ---
  const VoiceOverlay = () => (
    <div className="voice-overlay fade-in">
      <div className="voice-header">
        <button onClick={() => setIsVoiceMode(false)} className="btn-glass icon-only">
          <Minimize2 size={24} />
        </button>
        <div className="live-pill">
          <span className={`status-dot ${status === 'listening' || status === 'speaking' ? 'pulse' : ''}`}></span>
          Gemini Live
        </div>
        <div className="network-indicator">
          {isOnline ? <Wifi size={20} className="text-green" /> : <WifiOff size={20} className="text-red" />}
        </div>
      </div>

      <div className="voice-visualizer">
        {/* Dynamic Orb Animation */}
        <div className={`orb-container ${status}`}>
          <div className="orb-core"></div>
          <div className="orb-ring r1"></div>
          <div className="orb-ring r2"></div>
          <div className="orb-particles"></div>
        </div>

        <div className="voice-status-text">
          <h2>RCM Intelligence</h2>
          <p className="status-label">
            {status === 'listening' ? 'Listening...' : 
             status === 'speaking' ? 'Speaking...' : 
             status === 'loading' ? 'Thinking...' : 'Tap mic to speak'}
          </p>
          {liveTranscript && <div className="live-captions">"{liveTranscript}"</div>}
        </div>
      </div>

      <div className="voice-controls">
        <button className={`btn-circle glass ${isMuted ? 'active-red' : ''}`} onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        
        <button 
          className={`btn-circle glass-xl ${status === 'listening' ? 'active-blue' : ''}`} 
          onClick={toggleListening}
        >
          {status === 'listening' ? <div className="waveform-icon">|||</div> : <Mic size={32} />}
        </button>

        <button className="btn-circle glass-red" onClick={() => setIsVoiceMode(false)}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );

  // --- RENDER: STANDARD CHAT ---
  return (
    <div className="chat-root">
      {isVoiceMode && <VoiceOverlay />}

      <header className="chat-navbar">
        <div className="nav-brand">
          <div className="ai-avatar">
            <Sparkles size={20} />
          </div>
          <div className="nav-info">
            <h3>RCM AI</h3>
            <span className="online-status">
              <span className="dot"></span> Online
            </span>
          </div>
        </div>
        <div className="nav-actions">
          <button onClick={openWhatsApp} className="nav-btn whatsapp" title="WhatsApp">
            <MessageCircle size={20} />
          </button>
          <button onClick={() => setIsVoiceMode(true)} className="nav-btn voice-trigger">
            <Headphones size={20} />
          </button>
          <button onClick={onClose} className="nav-btn">
            <X size={22} />
          </button>
        </div>
      </header>

      <div className="chat-messages" ref={chatBodyRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`msg-group ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="bot-thumb"><Sparkles size={14} /></div>
            )}
            <div className="msg-bubble">
              <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
            </div>
          </div>
        ))}
        {status === 'loading' && !isVoiceMode && (
          <div className="msg-group assistant">
             <div className="bot-thumb"><Sparkles size={14} /></div>
             <div className="msg-bubble typing">
               <span className="typing-dot"></span>
               <span className="typing-dot"></span>
               <span className="typing-dot"></span>
             </div>
          </div>
        )}
        <div style={{ height: 12 }} />
      </div>

      <div className="chat-input-area">
        <div className="input-capsule">
          <button className="capsule-btn mic" onClick={toggleListening}>
            <Mic size={20} />
          </button>
          <input 
            type="text" 
            placeholder="Message..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={status === 'loading'}
          />
          {input.trim() ? (
            <button className="capsule-btn send" onClick={() => handleSend()}>
              <Send size={20} />
            </button>
          ) : (
            <div style={{width: 12}}></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;