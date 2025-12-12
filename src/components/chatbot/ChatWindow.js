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
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'; 

// --- TRANSLITERATION SETUP ---
const hindiToEnglishMap = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy',
  '़': '', 'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'ah', '्': ''
};

const wordFixes = {
  "आरसीएम": "rcm", "आर सी एम": "rcm", "बिजनेस": "business", 
  "प्लान": "plan", "क्या": "kya", "है": "hai", "मैं": "main", "हूँ": "hoon"
};

const transliterateText = (text) => {
  if (!text) return "";
  let processedText = text;
  Object.keys(wordFixes).forEach(hindiWord => {
    const regex = new RegExp(hindiWord, "g");
    processedText = processedText.replace(regex, wordFixes[hindiWord]);
  });
  return processedText.split('').map(char => hindiToEnglishMap[char] || char).join('');
};

// --- SPEECH RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-IN'; 
  recognition.interimResults = true;
}

const ChatWindow = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', type: 'text', content: 'Jai RCM! I am your AI Business Guide. Ask me anything about products or plans.' }
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); 
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastAudioUrl, setLastAudioUrl] = useState(null); 

  const chatBodyRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null); 
  const isVoiceModeRef = useRef(isVoiceMode);
  
  useEffect(() => { 
    isVoiceModeRef.current = isVoiceMode; 
    if (!isVoiceMode) {
      stopEverything();
    }
  }, [isVoiceMode]);

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

  useEffect(() => {
    if (chatBodyRef.current) {
      const { scrollHeight, clientHeight } = chatBodyRef.current;
      chatBodyRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: 'smooth' });
    }
  }, [messages, liveTranscript, status]);

  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const stopEverything = () => {
    setStatus('idle');
    setLiveTranscript('');
    if (recognition) {
      try { recognition.stop(); } catch(e) { }
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis.cancel();
  };

  const handleHangUp = () => {
    triggerHaptic();
    setIsVoiceMode(false); 
    stopEverything();      
  };

  const playAudioStream = useCallback(async (text) => {
    if (isMuted || !text) return;
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
      const data = await response.json();

      if (!data.success || !data.audioUrl) throw new Error("Invalid audio response");

      const audio = new Audio(data.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setStatus('idle');
      audio.onerror = () => setStatus('idle');
      await audio.play();

    } catch (error) {
      console.warn("TTS Fallback:", error);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      utterance.onend = () => setStatus('idle');
      window.speechSynthesis.speak(utterance);
    }
  }, [isMuted]);

  const handleSend = useCallback(async (textOverride = null) => {
    let msgText = textOverride || input.trim();
    if (!msgText || status === 'loading') return;

    triggerHaptic();

    const displayMsg = msgText; 
    const serverMsg = transliterateText(msgText); 
    
    console.log(`Original: ${displayMsg} | Transliterated: ${serverMsg}`);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const userMsg = { role: 'user', type: 'text', content: displayMsg };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLiveTranscript('');
    setStatus('loading');

    try {
      const token = localStorage.getItem('token') || '';
      const cleanHistory = messages.slice(-10).map(({ role, content }) => ({ role, content }));

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: serverMsg, chatHistory: cleanHistory }),
        signal: abortControllerRef.current.signal
      });

      const data = await response.json();
      
      let aiText = "Connectivity issue.";
      let audioUrlFromServer = null;

      if (data.success) {
        aiText = typeof data.reply === 'string' ? data.reply : data.reply?.content || aiText;
        if (data.audioUrl) audioUrlFromServer = data.audioUrl;
      }

      setMessages(prev => [ ...prev, { role: 'assistant', type: 'text', content: aiText } ]);
      setLastAudioUrl(audioUrlFromServer);
      setStatus('idle');

      if (isVoiceModeRef.current) {
        if (audioUrlFromServer) {
          const audio = new Audio(audioUrlFromServer);
          audioRef.current?.pause();
          audioRef.current = audio;
          setStatus('speaking');
          audio.onended = () => setStatus('idle');
          audio.onerror = () => setStatus('idle');
          await audio.play();
        } else {
          playAudioStream(aiText);
        }
      }

    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error("Chat API Error:", error);
      setMessages(prev => [ ...prev, { role: 'assistant', type: 'text', content: "Server unreachable." } ]);
      setStatus('idle');
    }
  }, [input, status, messages, playAudioStream]); 

  // --- SPEECH RECOGNITION ---
  useEffect(() => {
    if (!recognition) return;

    recognition.onstart = () => {
      setStatus('listening');
      setLiveTranscript('');
      if (audioRef.current) {
        audioRef.current.pause();
        setStatus('idle');
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
      if (status === 'listening') setStatus('idle');
    };

    recognition.onerror = (event) => {
      console.error("Speech Error:", event.error);
      setStatus('idle');
    };
  }, [status, handleSend]); 

  const toggleListening = () => {
    triggerHaptic();
    if (!recognition) return alert("Browser not supported. Use Chrome.");
    
    recognition.lang = 'en-IN'; 
    
    if (status === 'listening') {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.warn("Recognition already started, ignoring...", err);
      }
    }
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(START_MSG)}`, '_blank');
  };

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

        <button className="btn-circle glass-red" onClick={handleHangUp}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="chat-root">
      {isVoiceMode && <VoiceOverlay />}

      <header className="chat-navbar">
        <div className="nav-brand">
          <div className="ai-avatar"> <Sparkles size={20} /> </div>
          <div className="nav-info">
            <h3>RCM AI</h3>
            <span className="online-status"><span className="dot"></span> Online</span>
          </div>
        </div>
        <div className="nav-actions">
          <button onClick={openWhatsApp} className="nav-btn whatsapp"><MessageCircle size={20} /></button>
          <button onClick={() => setIsVoiceMode(true)} className="nav-btn voice-trigger"><Headphones size={20} /></button>
          <button onClick={onClose} className="nav-btn"><X size={22} /></button>
        </div>
      </header>

      <div className="chat-messages" ref={chatBodyRef}>
        {messages.map((msg, i) => {
          const isAssistant = msg.role === 'assistant';
          const lastAssistantIndex = messages.reduce((last, m, idx) => (m.role === 'assistant' ? idx : last), -1);
          const isLastAssistant = isAssistant && i === lastAssistantIndex;

          return (
            <div key={i} className={`msg-group ${msg.role}`}>
              {isAssistant && <div className="bot-thumb"><Sparkles size={14} /></div>}
              <div className="msg-bubble">
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                {isAssistant && (
                  <button className="mini-speaker-btn" disabled={!isLastAssistant || !lastAudioUrl} onClick={() => {
                      if (!lastAudioUrl) return;
                      audioRef.current?.pause();
                      const audio = new Audio(lastAudioUrl);
                      audioRef.current = audio;
                      setStatus('speaking');
                      audio.onended = () => setStatus('idle');
                      audio.play();
                    }}
                  >
                    <Volume2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {status === 'loading' && !isVoiceMode && (
          <div className="msg-group assistant">
             <div className="bot-thumb"><Sparkles size={14} /></div>
             <div className="msg-bubble typing"><span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span></div>
          </div>
        )}
        <div style={{ height: 12 }} />
      </div>

      <div className="chat-input-area">
        <div className="input-capsule">
          <button className="capsule-btn mic" onClick={toggleListening}><Mic size={20} /></button>
          <input 
            type="text" 
            placeholder="Message..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={status === 'loading'}
          />
          {input.trim() ? (
            <button className="capsule-btn send" onClick={() => handleSend()}><Send size={20} /></button>
          ) : ( <div style={{width: 12}}></div> )}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;