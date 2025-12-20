import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, X, Phone, Volume2, Sparkles, MessageCircle } from 'lucide-react';
import './ChatWindow.css'; 
import { speakWithBrowser } from '../chatbot/browserVoice'; // Verify Path
import VoiceCall from './VoiceCall'; 

const WHATSAPP_NUMBER = "919343743114"; 
const START_MSG = "Namaste RCM Assistant, mujhe business plan janna he.";
const API_BASE_URL = 'https://rcm-ai-backend.onrender.com'; 

// Transliteration Helpers (Keep same logic)
const hindiToEnglishMap = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', '्': '' };
const wordFixes = { "आरसीएम": "rcm", "आर सी एम": "rcm", "बिजनेस": "business", "प्लान": "plan", "क्या": "kya", "है": "hai", "मैं": "main", "हूँ": "hoon" };

const transliterateText = (text) => {
  if (!text) return "";
  let processedText = text;
  Object.keys(wordFixes).forEach(hindiWord => {
    const regex = new RegExp(hindiWord, "g");
    processedText = processedText.replace(regex, wordFixes[hindiWord]);
  });
  return processedText.split('').map(char => hindiToEnglishMap[char] || char).join('');
};

const ChatWindow = ({ onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); 
  const [isCallActive, setIsCallActive] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState(null); 

  const chatBodyRef = useRef(null);
  const audioRef = useRef(null);
  const hasWelcomedRef = useRef(false);

  useEffect(() => {
    if (chatBodyRef.current) {
      const { scrollHeight, clientHeight } = chatBodyRef.current;
      chatBodyRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  // Welcome Message Logic
  useEffect(() => {
    const fetchWelcome = async () => {
        if (hasWelcomedRef.current) return;
        hasWelcomedRef.current = true;
        setStatus('loading');
        try {
            const token = localStorage.getItem('token') || '';
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: '__WELCOME__' })
            });
            const data = await response.json();
            if (data.success) {
                const aiText = typeof data.reply === 'string' ? data.reply : data.reply.content;
                setMessages([{ role: 'assistant', type: 'text', content: aiText }]);
                setLastAudioUrl(data.audioUrl || null);
                setStatus('idle');
            }
        } catch (error) {
            setMessages([{ role: 'assistant', type: 'text', content: "Namaste! RCM AI mein swagat hai." }]);
            setStatus('idle');
        }
    };
    fetchWelcome();
  }, []);

  // ✅ NEW FUNCTION: Allows VoiceCall to add messages here
  const addNewMessage = (role, content) => {
    setMessages(prev => [...prev, { role, type: 'text', content }]);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || status === 'loading') return;
    const displayMsg = input.trim();
    const serverMsg = transliterateText(displayMsg);

    setMessages(prev => [...prev, { role: 'user', type: 'text', content: displayMsg }]);
    setInput('');
    setStatus('loading');

    try {
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: serverMsg })
      });

      const data = await response.json();
      const aiText = data.reply?.content || "Server Error";
      
      setMessages(prev => [ ...prev, { role: 'assistant', type: 'text', content: aiText }]);
      setLastAudioUrl(data.audioUrl || null); 
      setStatus('idle');
    } catch (error) {
      setMessages(prev => [ ...prev, { role: 'assistant', type: 'text', content: "Network Error" }]);
      setStatus('idle');
    }
  }, [input, status]);

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(START_MSG)}`, '_blank');
  };

  return (
    <div className="chat-root">
      
      {/* ✅ Pass 'onMessageAdd' prop to VoiceCall */}
      {isCallActive && (
        <VoiceCall 
            onClose={() => setIsCallActive(false)} 
            onMessageAdd={addNewMessage} 
        />
      )}

      <header className="chat-navbar">
        <div className="nav-brand">
          <div className="ai-avatar"> <Sparkles size={20} /> </div>
          <div className="nav-info">
            <h3>RCM AI</h3>
            <span className="online-status"><span className="dot"></span> Online</span>
          </div>
        </div>
        <div className="nav-actions">
           <button onClick={() => setIsCallActive(true)} className="nav-btn voice-trigger" title="Call AI">
            <Phone size={20} />
          </button>
          <button onClick={openWhatsApp} className="nav-btn whatsapp"><MessageCircle size={20} /></button>
          <button onClick={onClose} className="nav-btn"><X size={22} /></button>
        </div>
      </header>

      <div className="chat-messages" ref={chatBodyRef}>
        {messages.map((msg, i) => {
          const isAssistant = msg.role === 'assistant';
          const isLastAssistant = isAssistant && i === messages.length - 1;

          return (
            <div key={i} className={`msg-group ${msg.role}`}>
              {isAssistant && <div className="bot-thumb"><Sparkles size={14} /></div>}
              <div className="msg-bubble">
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                {isAssistant && (
                  <button className="mini-speaker-btn" onClick={() => {
                      if (isLastAssistant && lastAudioUrl) {
                          audioRef.current?.pause();
                          const audio = new Audio(lastAudioUrl);
                          audioRef.current = audio;
                          audio.play();
                      } else {
                          speakWithBrowser(msg.content);
                      }
                    }}
                  >
                    <Volume2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {status === 'loading' && (
          <div className="msg-group assistant">
             <div className="bot-thumb"><Sparkles size={14} /></div>
             <div className="msg-bubble typing"><span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span></div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="input-capsule">
          <input 
            type="text" 
            placeholder="Type a message..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="capsule-btn send" onClick={handleSend}><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;