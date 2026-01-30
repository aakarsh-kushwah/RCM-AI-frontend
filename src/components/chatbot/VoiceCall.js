import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2, Mic, Activity, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; 
import './VoiceCall.css'; 
import config from '../../config/env'; 

const VoiceCall = () => {
  const navigate = useNavigate(); 
  
  // --- UI STATE ---
  const [uiStatus, setUiStatus] = useState('idle'); // idle | listening | processing | speaking | error
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // --- REFS ---
  const statusRef = useRef('idle'); 
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // --- VISUALIZER REFS ---
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // ✅ Handle Exit
  const handleExit = () => {
      stopAudio();
      if (recognitionRef.current) recognitionRef.current.stop();
      navigate('/chat'); 
  };

  const updateStatus = (newStatus) => {
    statusRef.current = newStatus;
    setUiStatus(newStatus); 
  };

  // --- WAKE LOCK (PRO FEATURE: Keeps screen on) ---
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.log("Wake Lock error:", err);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // --- AUDIO CONTROLLER ---
  const stopAudio = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
      audioRef.current = null;
    }
  }, []);

  const toggleMute = () => {
    setIsMuted(prev => {
        const newState = !prev;
        if (audioRef.current) audioRef.current.muted = newState;
        return newState;
    });
  };

  const playServerAudio = useCallback((url) => {
    stopAudio(); 
    if (!url) {
      // No audio? Go straight back to listening
      updateStatus('listening');
      return;
    }

    updateStatus('speaking');

    const secureUrl = `${url}?t=${Date.now()}`;
    const audio = new Audio(secureUrl);
    audio.muted = isMuted; 
    audioRef.current = audio;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("Auto-play blocked:", error);
            // If play fails, we must return to listening or user gets stuck
            if (isMountedRef.current) updateStatus('listening');
        });
    }

    audio.onended = () => { 
        if (isMountedRef.current) {
            // ✅ CRITICAL FIX: Audio finished, explicitly set to listening
            // The useEffect hook below will catch this state change and restart the mic
            updateStatus('listening'); 
        }
    };
    
    audio.onerror = () => { 
        if (isMountedRef.current) updateStatus('listening'); 
    };

  }, [stopAudio, isMuted]);

  // --- API HANDLER ---
  const handleUserQuery = useCallback(async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    
    stopAudio();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    updateStatus('processing');
    setLiveTranscript(rawText);
    
    try {
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: rawText }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();
      if (!isMountedRef.current) return;

      if (data.success) {
        if (data.audioUrl) {
           playServerAudio(data.audioUrl);
        } else {
           updateStatus('listening');
        }
      } else {
         updateStatus('listening');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
          console.error("API Error", error);
          updateStatus('listening'); // Ensure we go back to listening on error
      }
    }
  }, [playServerAudio, stopAudio]);

  // --- SPEECH RECOGNITION CORE ---
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        setErrorMsg("Browser not supported. Use Chrome.");
        setUiStatus('error');
        return;
    }

    // Don't restart if already running to avoid flickering
    // But forcing restart is needed for mobile single-shot mode
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch(e){}

    const recognition = new SpeechRecognition();
    
    // 💡 SMART DETECTION: 
    // Mobile = continuous: false (Stable, restarts via logic)
    // PC = continuous: true (Fluid)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    recognition.continuous = !isMobile; 
    
    recognition.lang = 'hi-IN'; 
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎤 Mic Active");
      if (isMountedRef.current && statusRef.current === 'listening') {
          setErrorMsg('');
      }
    };

    recognition.onresult = (event) => {
      // If we are speaking/processing, ignore input (prevents self-listening echo)
      if (statusRef.current === 'speaking' || statusRef.current === 'processing') {
          recognition.abort();
          return;
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
        if (event.error === 'not-allowed') {
            setErrorMsg("Microphone access denied.");
            setUiStatus('error');
        } else if (event.error === 'no-speech') {
            // Ignorable error, we will restart in onend
        } else {
            console.warn("Speech Error:", event.error);
        }
    };

    recognition.onend = () => {
      // ✅ "RESURRECTOR" LOGIC:
      // If the mic turns off, but we are supposed to be listening (status is 'listening'),
      // we MUST restart it. This is what fixes the "Stuck" issue on mobile.
      if (isMountedRef.current && statusRef.current === 'listening') {
          setTimeout(() => { 
             try { recognition.start(); } catch(e) {} 
          }, 300); 
      }
    };
    
    recognitionRef.current = recognition;
    
    try { 
        recognition.start(); 
    } catch(e) {
        // If it fails to start immediately (e.g. overlap), the onend logic will retry
        console.error("Mic start mismatch:", e);
    }
    
  }, [handleUserQuery]);

  // --- ✅ CRITICAL FIX: REACTIVE RESTART ---
  // This useEffect ensures that whenever the status becomes 'listening' 
  // (e.g., after the AI finishes speaking), the mic is guaranteed to start.
  useEffect(() => {
    if (uiStatus === 'listening') {
        startSpeechRecognition();
    }
  }, [uiStatus, startSpeechRecognition]);


  // --- MANUAL START HANDLER ---
  const handleManualStart = () => {
      updateStatus('listening');
      // The useEffect above will catch 'listening' and start the mic
  };

  // --- SIMULATED VISUALIZER ---
  const startVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const barCount = 30;
    const barWidth = canvas.width / barCount;
    
    const animate = () => {
      if (!isMountedRef.current) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let color = '#3b82f6'; 
      if (statusRef.current === 'speaking') color = '#06b6d4'; 
      if (statusRef.current === 'processing') color = '#a855f7'; 
      if (statusRef.current === 'error') color = '#ef4444';
      
      ctx.fillStyle = color;
      
      for(let i = 0; i < barCount; i++) {
         let height = 4; // Base height

         if (statusRef.current === 'speaking') {
             height = Math.random() * (canvas.height * 0.8) + 5;
         } else if (statusRef.current === 'listening') {
             const time = Date.now() / 300;
             height = (Math.sin(time + i * 0.5) + 1.5) * 8;
         } else if (statusRef.current === 'processing') {
             height = Math.random() * 20 + 10;
         }

         const x = i * barWidth;
         const y = (canvas.height - height) / 2;
         
         ctx.beginPath();
         ctx.roundRect(x, y, barWidth - 2, height, 4);
         ctx.fill();
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    isMountedRef.current = true;
    startVisualizer();
    
    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [stopAudio, startVisualizer]); 

  return (
    <div className="voice-call-page-container" data-status={uiStatus}>
      
      <div className="vc-header">
        <button onClick={handleExit} className="vc-btn"><Minimize2 size={24} /></button>
        <div className="vc-brand-badge">
            <div className={`vc-live-dot ${uiStatus === 'listening' ? 'pulse' : ''}`}></div> RCM Live
        </div>
      </div>

      <div className="vc-visualizer-container">
        
        {/* START OVERLAY: Forces user interaction */}
        {uiStatus === 'idle' && (
            <div className="vc-start-overlay" onClick={handleManualStart}>
                <div className="vc-orb idle-pulse">
                    <Play size={40} fill="white" />
                </div>
                <p className="vc-tap-text">Tap to Start</p>
            </div>
        )}

        {/* ERROR OVERLAY */}
        {uiStatus === 'error' && (
            <div className="vc-start-overlay" onClick={handleManualStart}>
                <div className="vc-orb error">
                    <VolumeX size={40} />
                </div>
                <p className="vc-tap-text">{errorMsg || "Connection Failed. Tap to Retry"}</p>
            </div>
        )}

        {/* ACTIVE STATE ORB */}
        {(uiStatus !== 'idle' && uiStatus !== 'error') && (
            <div className="vc-orb">
                {uiStatus === 'processing' && <Activity className="spin" size={40} />}
                {uiStatus === 'speaking' && <Volume2 className="pulse" size={40} />}
                {uiStatus === 'listening' && <Mic size={40} />}
            </div>
        )}
        
        <canvas ref={canvasRef} className="vc-waveform" width="300" height="60"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status">
            {uiStatus === 'idle' ? "Ready" :
             uiStatus === 'listening' ? "Sun raha hoon..." : 
             uiStatus === 'speaking' ? "Bol raha hoon..." : 
             uiStatus === 'processing' ? "Soch raha hoon..." : "Error"}
        </h2>
        <div className="vc-sub-text">
            {uiStatus === 'idle' ? "Tap the play button to begin" : 
             (liveTranscript || "Kahiye, main sun raha hoon...")}
        </div>
      </div>

      <div className="vc-controls">
        <button className="vc-btn" onClick={toggleMute} style={{opacity: isMuted ? 0.5 : 1}}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        <button className="vc-btn vc-btn-red" onClick={handleExit}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;