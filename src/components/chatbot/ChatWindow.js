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
  
  // 🔥 IMPORTANT: Ref to track listening state instantly (Fixes Mobile Closure Issue)
  const isListeningRef = useRef(false); 

  // 1. Auto Scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ 
        top: scrollRef.current.scrollHeight, 
        behavior: 'smooth' 
      });
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

  // 3. 🚀 SUPERCHARGED SPEECH RECOGNITION (Mobile Fix)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      
      // 🛠️ MOBILE FIX: Mobile browsers hate 'continuous: true'.
      // Desktop par continuous rakhenge, Mobile par false karke auto-restart karenge.
      const isMobileBrowser = window.innerWidth < 768;
      recognition.continuous = !isMobileBrowser; 
      
      recognition.interimResults = true;
      recognition.lang = 'hi-IN'; // Hindi Support

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
      };

      recognition.onend = () => {
        // 🔄 RESTART LOGIC: Agar user ne band nahi kiya, to wapas start karo
        if (isListeningRef.current) {
            try {
                recognition.start();
            } catch (e) {
                // Ignore "already started" errors
            }
        } else {
            setIsListening(false);
        }
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else if (!isMobileBrowser) {
             // Desktop par interim text dikha sakte hain, mobile par lag avoid karein
          }
        }

        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };
      
      recognition.onerror = (event) => {
          console.error("Speech Error:", event.error);
          
          if (event.error === 'not-allowed') {
              alert("Mic Permission Blocked! Check settings.");
              isListeningRef.current = false;
              setIsListening(false);
          } else if (event.error === 'no-speech') {
              // Silence detected, ignore
          } else {
              // Other errors, stop briefly then restart logic will handle if needed
          }
      };

      recognitionRef.current = recognition;
    }
    
    return () => {
        if (recognitionRef.current) {
            isListeningRef.current = false; // Stop the loop
            recognitionRef.current.stop();
        }
    };
  }, []);

  // Toggle Mic Function
  const toggleListening = useCallback(() => {
    // 🛑 HTTPS Check
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        alert("Mobile Mic requires HTTPS (Secure Connection). Please use Ngrok or deploy with SSL.");
        return;
    }

    if (!recognitionRef.current) {
        alert("Your browser does not support Voice Typing. Try Chrome.");
        return;
    }
    
    if (isListening) {
        // 🛑 STOP COMMAND
        isListeningRef.current = false; // Loop Tod Do
        recognitionRef.current.stop();
        setIsListening(false);
    } else {
        // ▶️ START COMMAND
        isListeningRef.current = true; // Loop Start Karo
        try {
            recognitionRef.current.start();
        } catch (e) {
            console.error("Mic Start Error:", e);
        }
        setIsListening(true);
    }
  }, [isListening]);

  // 4. Image Handling
  const handleImageProcessing = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
        setSelectedImage(compressedFile);
    } catch (e) { 
        setSelectedImage(file); 
    } 
  };

  // 5. Send Message Handler
  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    
    sendMessage(input, selectedImage);
    
    setInput('');
    setSelectedImage(null);
    
    // Stop mic automatically after sending
    if (isListening) {
        isListeningRef.current = false;
        if (recognitionRef.current) recognitionRef.current.stop();
        setIsListening(false);
    }
  };

  return (
    <div className="gemini-app-container">
      
      {isVoiceMode && (
         <VoiceCall onClose={() => setIsVoiceMode(false)} />
      )}

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
                    {!input.trim() && !selectedImage ? (
                        <button 
                          className="voice-live-btn" 
                          onClick={() => setIsVoiceMode(true)} 
                          title="Start Live Voice Chat"
                        >
                            <AudioLines size={20} /><span className="live-wave"></span>
                        </button>
                    ) : (
                        <button className="send-btn active" onClick={handleSend}>
                          <Send size={18}/>
                        </button>
                    )}

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