import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, PhoneOff, Volume2, VolumeX, Minimize2, Activity, RefreshCw 
} from 'lucide-react';
import './VoiceCall.css'; 
import { speakWithBrowser } from './browserVoice'; 

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const API_BASE_URL = 'https://rcm-ai-backend.onrender.com'; 
const VISUALIZER_SMOOTHING = 0.7; 
const SILENCE_TIMEOUT = 8000; 

// ⚡ BARGE-IN SETTINGS
const INTERRUPT_THRESHOLD = 35; 
const GRACE_PERIOD = 800; 

const normalizeInput = (text) => {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/आरसीएम/g, "rcm")
    .replace(/प्लान/g, "plan")
    .replace(/बिजनेस/g, "business")
    .replace(/nutri charge/g, "nutricharge")
    .replace(/dj 200/g, "dha 200")
    .replace(/gamma original/g, "gamma oryzanol");
};

const VoiceCall = ({ onClose, onMessageAdd }) => {
  // --- STATES ---
  const [status, setStatus] = useState('initializing');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); 
  
  // --- REFS ---
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const isMountedRef = useRef(true);
  const silenceTimerRef = useRef(null);
  const speakStartTimeRef = useRef(0);
  
  // Audio Analysis Refs
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const sourceRef = useRef(null); // ✅ FIXED: Added missing sourceRef

  // ============================================================
  // 1. LIFECYCLE
  // ============================================================
  useEffect(() => {
    isMountedRef.current = true;
    
    // Start Systems Independently (Robustness Fix)
    startVisualizer(); 
    startSpeechRecognition();
    
    return () => {
      isMountedRef.current = false;
      shutdownSystem();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shutdownSystem = () => {
    try { recognitionRef.current?.stop(); } catch(e) {}
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis.cancel();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    // Stop Mic Stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    clearTimeout(silenceTimerRef.current);
  };

  // ============================================================
  // 2. SPEECH RECOGNITION (LISTENER)
  // ============================================================
  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Browser Not Supported. Use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Always listen
    recognition.lang = 'en-IN';    // Hindi/English Mix
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      console.log("🎤 Microphone Started");
      setErrorMsg(''); // Clear errors
      
      if (status !== 'speaking' && status !== 'processing') {
          setStatus('listening');
      }
      clearTimeout(silenceTimerRef.current);
    };

    recognition.onresult = (event) => {
      clearTimeout(silenceTimerRef.current);
      
      // 🛑 INTERRUPT LOGIC
      if (status === 'speaking') {
          console.log("🗣️ Speech Detected -> Stopping AI");
          stopAudio();
          setStatus('listening');
      }

      let final = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      
      if (final) {
        handleUserQuery(final);
      } else {
        setLiveTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech Error:", event.error);
      if (event.error === 'no-speech') {
         // Ignore silence
      } else if (event.error === 'not-allowed') {
         setErrorMsg("Microphone Permission Denied");
         setStatus('error');
      } else if (event.error === 'network') {
         setErrorMsg("Network Issue");
         setTimeout(() => tryRestart(), 1000);
      }
    };

    recognition.onend = () => {
      // Auto-restart loop if not unmounted
      if (isMountedRef.current) {
          console.log("🔄 Listener Loop Restarting...");
          setTimeout(() => tryRestart(), 200);
      }
    };

    recognitionRef.current = recognition;
    tryRestart();
  };

  const tryRestart = () => {
      try { recognitionRef.current?.start(); } catch(e) {
          // Often throws if already started, safe to ignore
      }
  };

  // ============================================================
  // 3. VISUALIZER (SEPARATE THREAD)
  // ============================================================
  const startVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
              echoCancellation: true, 
              noiseSuppression: true, 
              autoGainControl: true 
          } 
      });
      
      mediaStreamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.minDecibels = -90; 
      analyserRef.current.maxDecibels = -10;
      analyserRef.current.smoothingTimeConstant = VISUALIZER_SMOOTHING;
      analyserRef.current.fftSize = 256;

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      drawLoop();
    } catch (err) { 
        console.error("Visualizer Failed:", err);
        // We do NOT stop recognition if visualizer fails
    }
  };

  const drawLoop = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    
    // Volume Calculation for Barge-In
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
    }
    const avgVolume = sum / dataArrayRef.current.length;

    // 🛑 LOUD NOISE INTERRUPT
    if (status === 'speaking') {
        const timeElapsed = Date.now() - speakStartTimeRef.current;
        if (timeElapsed > GRACE_PERIOD && avgVolume > INTERRUPT_THRESHOLD) {
            console.log("🛑 Loud Voice -> Interrupt");
            stopAudio();
            setStatus('listening');
        }
    }

    // Draw Canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    let strokeColor = '#3b82f6'; 
    if (status === 'speaking') strokeColor = '#06b6d4';
    if (status === 'processing') strokeColor = '#a855f7';
    if (avgVolume > INTERRUPT_THRESHOLD && status === 'speaking') strokeColor = '#ffffff';

    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    
    const sliceWidth = rect.width * 1.0 / dataArrayRef.current.length;
    let x = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const v = dataArrayRef.current[i] / 128.0;
      const y = v * rect.height / 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    
    animationFrameRef.current = requestAnimationFrame(drawLoop);
  };

  // ============================================================
  // 4. API & LOGIC
  // ============================================================
  const handleUserQuery = async (rawText) => {
    setStatus('processing');
    setLiveTranscript(rawText);
    
    if (onMessageAdd) onMessageAdd('user', rawText);

    try {
      const token = localStorage.getItem('token') || '';
      const serverMsg = normalizeInput(rawText);

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: serverMsg })
      });

      const data = await response.json();

      if (data.success) {
        const aiText = typeof data.reply === 'string' ? data.reply : data.reply.content;
        
        if (onMessageAdd) onMessageAdd('assistant', aiText);

        if (data.audioUrl) {
           playServerAudio(data.audioUrl);
        } else {
           playBrowserAudio(aiText);
        }
      } else {
          playBrowserAudio("Maaf kijiye, server busy hai.");
      }
    } catch (error) {
      console.error(error);
      playBrowserAudio("Internet connection check karein.");
    }
  };

  // ============================================================
  // 5. AUDIO OUTPUT
  // ============================================================
  const stopAudio = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
  };

  const playServerAudio = (url) => {
    stopAudio();
    setStatus('speaking');
    speakStartTimeRef.current = Date.now();
    
    const audio = new Audio(url);
    audioRef.current = audio;
    
    if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
    
    audio.onended = () => { if (isMountedRef.current) setStatus('listening'); };
    audio.play().catch(e => console.warn(e));
  };

  const playBrowserAudio = (text) => {
    stopAudio();
    setStatus('speaking');
    speakStartTimeRef.current = Date.now();
    speakWithBrowser(text, 
        () => {}, 
        () => { if (isMountedRef.current) setStatus('listening'); } 
    );
  };

  const handleManualInterrupt = () => {
    stopAudio();
    setStatus('listening');
    tryRestart();
  };

  // ============================================================
  // 6. UI RENDER
  // ============================================================
  
  const getHindiStatus = () => {
      if (errorMsg) return "त्रुटि (Error)";
      switch(status) {
          case 'listening': return "मैं सुन रहा हूँ...";
          case 'processing': return "सोच रहा हूँ...";
          case 'speaking': return "मैं बोल रहा हूँ...";
          default: return "तैयार हो रहा हूँ...";
      }
  };

  const getSubText = () => {
      if (errorMsg) return errorMsg;
      if (status === 'listening') return <span className="vc-hint">अब बोलें (Speak Now)</span>;
      if (liveTranscript) return `"${liveTranscript}"`;
      if (status === 'speaking') return "रोकने के लिए बोलें (Speak to Stop)";
      return "";
  };

  return (
    <div className="voice-call-overlay" data-status={status} onClick={handleManualInterrupt}>
      
      <div className="vc-header">
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="vc-btn">
          <Minimize2 size={24} />
        </button>
        <div className="vc-brand-badge">
           <div className="vc-live-dot"></div> RCM Live
        </div>
      </div>

      <div className="vc-visualizer-container">
        <div className="vc-orb"></div>
        <canvas ref={canvasRef} className="vc-waveform"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status" style={{color: errorMsg ? '#ef4444' : 'white'}}>
            {getHindiStatus()}
        </h2>
        <div className="vc-sub-text">{getSubText()}</div>
        {errorMsg && (
            <button className="vc-hint" style={{marginTop: 10, background:'none', border:'none', cursor:'pointer'}} onClick={() => window.location.reload()}>
                <RefreshCw size={16} style={{display:'inline', marginRight: 5}}/> Reload Page
            </button>
        )}
      </div>

      <div className="vc-controls" onClick={(e) => e.stopPropagation()}>
        <button className="vc-btn" onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        
        <button 
          className="vc-btn vc-btn-main" 
          onClick={() => { 
              if (status === 'listening') { stopAudio(); setStatus('initializing'); onClose(); } 
              else { handleManualInterrupt(); }
          }}
        >
          {status === 'listening' ? <Activity size={32} /> : <Mic size={32} />}
        </button>

        <button className="vc-btn vc-btn-red" onClick={onClose}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;