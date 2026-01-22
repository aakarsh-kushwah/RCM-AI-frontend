import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { 
  Send, Menu, Plus, 
  Sparkles, Mic, MicOff, X, Volume2, Loader, AudioLines 
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { useChatEngine } from '../../hooks/useChatEngine';
import VoiceCall from './VoiceCall';
import './ChatWindow.css';

// --- MESSAGE ROW COMPONENT ---
const ChatRow = memo(({ msg, onReplay }) => {
  const isAssistant = msg.role === 'assistant';
  
  const formatText = (text) => {
    if (!text) return "";
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
               .replace(/\n/g, '<br/>');
  };

  return (
    <div className={`gemini-msg-row ${msg.role}`}>
      <div className="msg-avatar">
        {isAssistant ? (
          <div className="ai-star-icon"><Sparkles size={18} className="star-anim" /></div>
        ) : (
          <div className="user-char-icon">U</div>
        )}
      </div>
      <div className="msg-content">
        <div className="msg-sender-name">{isAssistant ? 'RCM Intelligence' : 'You'}</div>
        
        {msg.image && (
          <div className="msg-attachment">
            <img src={msg.image} alt="Uploaded" />
          </div>
        )}
        
        <div 
          className="msg-bubble-text" 
          dangerouslySetInnerHTML={{ __html: formatText(msg.content) }} 
        />
        
        {/* Mobile Fix: Speaker button only works if NOT in voice mode */}
        {isAssistant && (
          <button className="replay-tiny" onClick={() => onReplay(msg.content)}>
            <Volume2 size={14} /> Listen
          </button>
        )}
      </div>
    </div>
  );
});

// --- MAIN CHAT WINDOW ---
const ChatWindow = () => {
  const { messages, status, sendMessage, replayLastAudio } = useChatEngine();
  
  // State Management
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null); 
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Refs
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // 1. Auto Scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  // 2. Responsive Handler
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 3. OPTIMIZED SPEECH RECOGNITION (Chat Mode Only)
  useEffect(() => {
    // 🛑 CRITICAL FIX: Agar Voice Call active hai, to Chat Mic logic initialize hi mat karo
    if (isVoiceMode) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'hi-IN';

      recognition.onstart = () => setIsListening(true);
      
      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        // Double Check: Agar Voice Call beech me start ho gaya, to ignore karo
        if (isVoiceMode) return;

        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };
      
      recognition.onerror = (event) => {
          console.error("Chat Mic Error:", event.error);
          setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
    
    return () => {
        if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isVoiceMode]); // Dependency added: Re-run if VoiceMode changes

  // 🛑 Force Stop Chat Mic Logic
  const stopChatMic = () => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
    }
  };

  // Toggle Chat Mic
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return alert("Browser does not support Speech Recognition.");
    if (isListening) {
      stopChatMic();
    } else {
      recognitionRef.current.start();
    }
  }, [isListening]);

  // ✅ SPECIAL HANDLER: Start Voice Call (Kills Chat Mic First)
  const handleStartVoiceCall = () => {
      // 1. Stop Chat Mic immediately
      stopChatMic();
      
      // 2. Stop any playing audio
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      
      // 3. Enable Voice Mode (This unmounts Chat Mic logic via useEffect)
      setIsVoiceMode(true);
  };

  // Handle Image
  const handleImageProcessing = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
        setSelectedImage(compressedFile);
    } catch (e) { setSelectedImage(file); } 
  };

  // Handle Send
  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    sendMessage(input, selectedImage);
    setInput('');
    setSelectedImage(null);
    stopChatMic();
  };

  return (
    <div className="gemini-app-container">
      
      {/* Voice Call Overlay */}
      {isVoiceMode && (
         <VoiceCall 
            onClose={() => setIsVoiceMode(false)} 
            // Optional: Pass user name context if needed
         />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
         <div className="sidebar-header">
           <button className="menu-burger" onClick={() => setSidebarOpen(!isSidebarOpen)}>
             <Menu size={20}/>
           </button>
         </div>
         {isSidebarOpen && (
           <div className="sidebar-content">
             <button className="new-chat-pill" onClick={()=>window.location.reload()}>
               <Plus size={16}/>New Chat
             </button>
           </div>
         )}
      </aside>

      {/* Main Area */}
      <main className="app-main">
        <header className="main-header">
          <div className="header-left">
            {!isSidebarOpen && (
              <button className="menu-burger-mobile" onClick={() => setSidebarOpen(true)}>
                <Menu size={20}/>
              </button>
            )}
            <span className="model-select">RCM Intelligence <span className="beta-badge">PRO</span></span>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-scroll-wrapper" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="welcome-hero">
               <div className="hero-logo-box"><Sparkles size={40} className="hero-icon" /></div>
               <h1 className="hero-title"><span className="gradient-text">Hello, Leader.</span></h1>
               <h2 className="hero-subtitle">How can I help you grow today?</h2>
            </div>
          )}

          <div className="message-list">
             {messages.map((msg, i) => (
               <ChatRow key={i} msg={msg} onReplay={replayLastAudio} />
             ))}
             {status === 'loading' && (
               <div className="gemini-msg-row assistant">
                 <Loader size={20} className="spin"/> Thinking...
               </div>
             )}
          </div>
        </div>

        {/* Input Area - HIDDEN OR DISABLED DURING VOICE CALL IF OVERLAY DOESN'T COVER */}
        <div className="input-container">
           <div className="input-max-width">
              {selectedImage && (
                <div className="preview-badge">
                  <img src={URL.createObjectURL(selectedImage)} alt="p" />
                  <button onClick={()=>setSelectedImage(null)}><X size={14}/></button>
                </div>
              )}
              
              <div className={`input-box ${isListening ? 'recording-mode' : ''}`}>
                 <button className="add-file-btn" onClick={() => fileInputRef.current.click()}>
                   <Plus size={20}/>
                 </button>
                 
                 <input 
                   type="text" 
                   placeholder={isListening ? "Listening..." : "Type a message..."}
                   value={input}
                   onChange={e => setInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleSend()}
                 />
                 
                 <div className="input-actions">
                    {/* Live Voice Button - Trigger Clean Switch */}
                    {!input.trim() && !selectedImage ? (
                        <button 
                          className="voice-live-btn" 
                          onClick={handleStartVoiceCall} 
                          title="Start Live Voice Chat"
                        >
                            <AudioLines size={20} /><span className="live-wave"></span>
                        </button>
                    ) : (
                        <button className="send-btn active" onClick={handleSend}>
                          <Send size={18}/>
                        </button>
                    )}

                    {/* Mic Button - Disabled Visually to avoid confusion if needed, logic is already safe */}
                    {(!input.trim() && !selectedImage) && (
                        <button 
                          className={`mic-btn ${isListening ? 'active-red' : ''}`} 
                          onClick={toggleListening}
                        >
                            {isListening ? <MicOff size={20} /> : <Mic size={20}/>}
                        </button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      </main>

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{display:'none'}} 
        onChange={(e) => handleImageProcessing(e.target.files[0])} 
      />
      
      {isMobile && isSidebarOpen && (
        <div className="backdrop" onClick={() => setSidebarOpen(false)}></div>
      )}
    </div>
  );
};

export default ChatWindow;