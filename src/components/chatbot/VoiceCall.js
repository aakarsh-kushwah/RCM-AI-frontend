import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2, Mic, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // 🆕 Navigation
import './VoiceCall.css'; 
import config from '../../config/env'; 

const VoiceCall = () => {
  const navigate = useNavigate(); // 🆕 Hook
  
  // --- UI STATE ---
  const [uiStatus, setUiStatus] = useState('initializing'); 
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  
  // --- REFS ---
  const statusRef = useRef('initializing'); 
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // --- VISUALIZER REFS ---
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);
  const orbRef = useRef(null);

  // ✅ Handle Exit Navigation
  const handleExit = () => {
      navigate('/chat'); // Go back to text chat
  };

  const updateStatus = (newStatus) => {
    statusRef.current = newStatus;
    setUiStatus(newStatus); 
  };

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

  const playServerAudio = useCallback((url) => {
    stopAudio(); 
    if (!url) {
      updateStatus('listening');
      return;
    }

    updateStatus('speaking');

    const secureUrl = `${url}?t=${Date.now()}`;
    const audio = new Audio(secureUrl);
    audioRef.current = audio;

    audio.onended = () => { if (isMountedRef.current) updateStatus('listening'); };
    audio.onerror = () => { if (isMountedRef.current) updateStatus('listening'); };

    audio.play().catch((err) => { 
        console.error("Audio Play Error:", err);
        if (isMountedRef.current) updateStatus('listening'); 
    });
  }, [stopAudio]);

  // --- API HANDLER ---
  const handleUserQuery = useCallback(async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    
    stopAudio();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    updateStatus('processing');
    setLiveTranscript(rawText);
    
    // Note: onMessageAdd removed as we are on a separate page.
    // The history will be fetched from backend when user visits /chat again.

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
      if (error.name !== 'AbortError') updateStatus('listening');
    }
  }, [playServerAudio, stopAudio]);

  // --- SPEECH RECOGNITION ---
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'hi-IN'; 
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (isMountedRef.current && statusRef.current === 'initializing') updateStatus('listening');
    };

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      if ((final || interim) && statusRef.current === 'speaking') {
          stopAudio();
          updateStatus('listening');
      }
      
      if (final) handleUserQuery(final);
      else setLiveTranscript(interim);
    };

    recognition.onend = () => {
      if (isMountedRef.current && statusRef.current !== 'processing') {
          setTimeout(() => { 
             try { recognitionRef.current?.start(); } catch(e) {} 
          }, 300); 
      }
    };
    
    recognitionRef.current = recognition;
    setTimeout(() => { try { recognition.start(); } catch(e) {} }, 100);
    
  }, [handleUserQuery, stopAudio]);

  // --- GEMINI VISUALIZER ---
  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.smoothingTimeConstant = 0.8;
      analyserRef.current.fftSize = 256;
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const drawLoop = () => {
        if (!isMountedRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        // Orb Breathing Logic
        let sum = 0;
        for(let i = 0; i < dataArrayRef.current.length; i++) sum += dataArrayRef.current[i];
        const average = sum / dataArrayRef.current.length;
        
        if (orbRef.current) {
            const scale = 1 + (average / 256) * 0.4;
            orbRef.current.style.transform = `scale(${scale})`;
            orbRef.current.style.opacity = 0.8 + (average / 256) * 0.2;
        }

        // Canvas Drawing
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            ctx.clearRect(0, 0, width, height);
            
            const color = statusRef.current === 'speaking' ? '#06b6d4' : 
                          statusRef.current === 'processing' ? '#a855f7' : '#3b82f6';
            
            ctx.fillStyle = color;
            
            const barWidth = (width / dataArrayRef.current.length) * 2.5;
            let x = 0;
            
            for(let i = 0; i < dataArrayRef.current.length; i++) {
                const barHeight = (dataArrayRef.current[i] / 255) * height * 0.8;
                ctx.beginPath();
                ctx.roundRect(x, (height - barHeight) / 2, barWidth - 2, barHeight, 5);
                ctx.fill();
                x += barWidth;
            }
        }
        
        animationFrameRef.current = requestAnimationFrame(drawLoop);
      };
      
      drawLoop();
      
    } catch (err) { 
      console.error("Visualizer Error:", err); 
    }
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    isMountedRef.current = true;
    startSpeechRecognition();
    startVisualizer();

    return () => {
      isMountedRef.current = false;
      stopAudio();
      
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      const audioCtx = audioContextRef.current;
      if (audioCtx) audioCtx.close();
      
      const streamSource = sourceRef.current;
      if (streamSource) streamSource.disconnect();
    };
  }, [startSpeechRecognition, stopAudio, startVisualizer]);

  return (
    // Replaced 'voice-call-overlay' with a full-screen container class
    <div className="voice-call-page-container" data-status={uiStatus} style={{ width: '100vw', height: '100vh', position: 'fixed', top:0, left:0, background: '#0f172a', zIndex: 9999 }}>
      <div className="vc-header">
        {/* Minimize button acts as Exit/Back */}
        <button onClick={handleExit} className="vc-btn"><Minimize2 size={24} /></button>
        <div className="vc-brand-badge">
            <div className={`vc-live-dot ${uiStatus === 'listening' ? 'pulse' : ''}`}></div> RCM Live
        </div>
      </div>

      <div className="vc-visualizer-container">
        <div className="vc-orb" ref={orbRef}>
             {uiStatus === 'processing' && <Activity className="spin" size={40} />}
             {uiStatus === 'speaking' && <Volume2 className="pulse" size={40} />}
             {uiStatus === 'listening' && <Mic size={40} />}
        </div>
        
        <canvas ref={canvasRef} className="vc-waveform" width="300" height="60"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status">
            {uiStatus === 'listening' ? "Sun raha hoon..." : 
             uiStatus === 'speaking' ? "Bol raha hoon..." : "Soch raha hoon..."}
        </h2>
        <div className="vc-sub-text">{liveTranscript || "Kahiye, main sun raha hoon..."}</div>
      </div>

      <div className="vc-controls">
        <button className="vc-btn" onClick={() => setIsMuted(!isMuted)}>
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