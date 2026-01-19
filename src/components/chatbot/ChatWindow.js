import React, { useState, useRef, useEffect, memo } from 'react';
import { 
  Send, Menu, Plus, 
  Sparkles, Mic, MicOff, X, Volume2, Loader, AudioLines 
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { useChatEngine } from '../../hooks/useChatEngine';
import VoiceCall from './VoiceCall';
import './ChatWindow.css';

// --- TEXT FORMATTER ---
const safeSanitize = (html) => {
  if (!html) return "";
  return html.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

// --- MESSAGE ROW ---
const ChatRow = memo(({ msg, onReplay }) => {
  const isAssistant = msg.role === 'assistant';
  return (
    <div className={`gemini-msg-row ${msg.role}`}>
      <div className="msg-avatar">
        {isAssistant ? <div className="ai-star-icon"><Sparkles size={18} className="star-anim" /></div> : <div className="user-char-icon">U</div>}
      </div>
      <div className="msg-content">
        <div className="msg-sender-name">{isAssistant ? 'RCM Intelligence' : 'You'}</div>
        {msg.image && <div className="msg-attachment"><img src={msg.image} alt="Uploaded" /></div>}
        <div className="msg-bubble-text" dangerouslySetInnerHTML={{ __html: safeSanitize(msg.content) }} />
        {isAssistant && <button className="replay-tiny" onClick={() => onReplay(msg.content)}><Volume2 size={14} /> Listen</button>}
      </div>
    </div>
  );
});

// --- MAIN LAYOUT ---
const ChatWindow = () => {
  const { messages, status, sendMessage, replayLastAudio } = useChatEngine();
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null); 
  
  // 🎤 States
  const [isListening, setIsListening] = useState(false); // Simple Mic
  const [isVoiceMode, setIsVoiceMode] = useState(false); // ✅ Gemini Live Mode
  
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Responsive Check
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

  // Auto Scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  // --- SIMPLE SPEECH TO TEXT (Small Mic) ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'hi-IN';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setInput(prev => prev + (prev.length > 0 ? ' ' : '') + finalTranscript);
        }
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return alert("Browser not supported");
    if (isListening) recognitionRef.current.stop();
    else recognitionRef.current.start();
  };

  // --- IMAGE HANDLING ---
  const handleImageProcessing = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    // Removed unused isCompressing state logic
    try {
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
        setSelectedImage(compressedFile);
    } catch (e) { setSelectedImage(file); } 
  };

  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    sendMessage(input, selectedImage);
    setInput('');
    setSelectedImage(null);
    if (isListening) recognitionRef.current.stop();
  };

  return (
    <div className="gemini-app-container">
      
      {/* ✅ GEMINI LIVE OVERLAY */}
      {isVoiceMode && (
         <VoiceCall 
            onClose={() => setIsVoiceMode(false)}
            onMessageAdd={(role, content) => console.log(role, content)} 
         />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
         <div className="sidebar-header">
           <button className="menu-burger" onClick={() => setSidebarOpen(!isSidebarOpen)}><Menu size={20}/></button>
         </div>
         {isSidebarOpen && <div className="sidebar-content"><button className="new-chat-pill" onClick={()=>window.location.reload()}><Plus size={16}/>New Chat</button></div>}
      </aside>

      {/* MAIN CHAT */}
      <main className="app-main">
        <header className="main-header">
          <div className="header-left">
            {!isSidebarOpen && <button className="menu-burger-mobile" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button>}
            <span className="model-select">RCM Intelligence <span className="beta-badge">PRO</span></span>
          </div>
        </header>

        <div className="chat-scroll-wrapper" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="welcome-hero">
               <div className="hero-logo-box"><Sparkles size={40} className="hero-icon" /></div>
               <h1 className="hero-title"><span className="gradient-text">Hello, Leader.</span></h1>
               <h2 className="hero-subtitle">How can I help you grow today?</h2>
            </div>
          )}

          <div className="message-list">
             {messages.map((msg, i) => <ChatRow key={i} msg={msg} onReplay={replayLastAudio} />)}
             {status === 'loading' && <div className="gemini-msg-row assistant"><Loader size={20} className="spin"/> Thinking...</div>}
          </div>
        </div>

        {/* INPUT AREA */}
        <div className="input-container">
           <div className="input-max-width">
              {selectedImage && <div className="preview-badge"><img src={URL.createObjectURL(selectedImage)} alt="p" /><button onClick={()=>setSelectedImage(null)}><X size={14}/></button></div>}
              
              <div className={`input-box ${isListening ? 'recording-mode' : ''}`}>
                 <button className="add-file-btn" onClick={() => fileInputRef.current.click()}><Plus size={20}/></button>
                 <input 
                   type="text" 
                   placeholder={isListening ? "Listening..." : "Type a message..."}
                   value={input}
                   onChange={e => setInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleSend()}
                 />
                 
                 <div className="input-actions">
                    {/* ✅ LIVE BUTTON */}
                    {!input.trim() && !selectedImage ? (
                        <button className="voice-live-btn" onClick={() => setIsVoiceMode(true)} title="Start Live Voice Chat">
                            <AudioLines size={20} /><span className="live-wave"></span>
                        </button>
                    ) : (
                        <button className="send-btn active" onClick={handleSend}><Send size={18}/></button>
                    )}

                    {/* Simple Mic Toggle */}
                    {(!input.trim() && !selectedImage) && (
                        <button className={`mic-btn ${isListening ? 'active-red' : ''}`} onClick={toggleListening}>
                            {isListening ? <MicOff size={20} /> : <Mic size={20}/>}
                        </button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      </main>

      <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={(e) => handleImageProcessing(e.target.files[0])} />
      {isMobile && isSidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)}></div>}
    </div>
  );
};

export default ChatWindow;