/**
 * @file src/components/chatbot/ChatWindow.js
 * @description Clean UI Component.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Phone, Volume2, Sparkles, MessageCircle } from 'lucide-react';
import './ChatWindow.css'; 
import VoiceCall from './VoiceCall'; 
import { useChatEngine } from '../../hooks/useChatEngine'; 
import config from '../../config/env';
import { generateWhatsAppLink } from '../../utils/textUtils';

const ChatWindow = ({ onClose }) => {
  const { messages, status, sendMessage, addMessage, replayLastAudio } = useChatEngine();
  
  const [input, setInput] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const chatBodyRef = useRef(null);

  useEffect(() => {
    if (chatBodyRef.current) {
      const { scrollHeight, clientHeight } = chatBodyRef.current;
      chatBodyRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  const onSendClick = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const openWhatsApp = () => {
    const link = generateWhatsAppLink(config.CONTACT.WHATSAPP_NUMBER, config.CONTACT.START_MSG);
    window.open(link, '_blank');
  };

  return (
    <div className="chat-root">
      {isCallActive && (
        <VoiceCall 
            onClose={() => setIsCallActive(false)} 
            onMessageAdd={addMessage} 
        />
      )}

      <header className="chat-navbar">
        <div className="nav-brand">
          <div className="ai-avatar"> <Sparkles size={20} /> </div>
          <div className="nav-info">
            <h3>RCM Intelligence</h3>
            <span className="online-status"><span className="dot"></span> Online</span>
          </div>
        </div>
        <div className="nav-actions">
           <button onClick={() => setIsCallActive(true)} className="nav-btn voice-trigger" title="Voice Call">
            <Phone size={18} />
          </button>
          <button onClick={openWhatsApp} className="nav-btn whatsapp"><MessageCircle size={18} /></button>
          <button onClick={onClose} className="nav-btn"><X size={20} /></button>
        </div>
      </header>

      <div className="chat-messages" ref={chatBodyRef}>
        {messages.map((msg, i) => {
          const isAssistant = msg.role === 'assistant';
          
          return (
            <div key={i} className={`msg-group ${msg.role}`}>
              {isAssistant && <div className="bot-thumb"><Sparkles size={14} /></div>}
              <div className="msg-bubble">
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                
                {isAssistant && (
                  <button className="mini-speaker-btn" onClick={() => replayLastAudio(msg.content)}>
                    <Volume2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {status === 'loading' && (
          <div className="msg-group assistant">
             <div className="bot-thumb"><Sparkles size={14} /></div>
             <div className="msg-bubble typing">
                <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
             </div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="input-capsule">
          <input 
            type="text" 
            placeholder="Puchiye, main kaise madad karu?..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSendClick()}
          />
          <button className="capsule-btn send" onClick={onSendClick} disabled={status === 'loading'}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;