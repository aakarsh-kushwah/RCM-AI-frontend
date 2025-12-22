/**
 * @file src/components/chatbot/VoiceCall.js
 * @description Enterprise Voice Interface with Stable References.
 * FIXED: Prevents component unmounting/audio-cutting on state changes.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2, Mic, Activity, AlertCircle } from 'lucide-react';
import './VoiceCall.css'; 
import config from '../../config/env'; 

// --- CONSTANTS ---
const CONFIG = {
  VISUALIZER: { SMOOTHING: 0.85, FFT_SIZE: 256 },
  INTERACTION: {
    INTERRUPT_THRESHOLD: 35,
    GRACE_PERIOD_MS: 1500, // Thoda badha diya taki khud ki awaz se na kate
  }
};

// --- UTILS ---
const normalizeInput = (text) => {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/आरसीएम/g, "rcm").replace(/प्लान/g, "plan")
    .replace(/बिजनेस/g, "business").replace(/nutri charge/g, "nutricharge");
};

const VoiceCall = ({ onClose, onMessageAdd }) => {
  // --- UI STATE (Visuals only) ---
  const [uiStatus, setUiStatus] = useState('initializing'); 
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); 
  
  // --- LOGIC REFS (Mutable, won't trigger re-renders) ---
  // Ye sabse jaruri hai taki useEffect bar bar na chale
  const statusRef = useRef('initializing'); 
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const speakStartTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Visualizer Refs
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Helper to update both Ref and State
  const updateStatus = (newStatus) => {
    statusRef.current = newStatus;
    setUiStatus(newStatus); // Triggers UI update
  };

  // ============================================================
  // 1. AUDIO CONTROLLER
  // ============================================================
  
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
    stopAudio(); // Safety stop

    if (!url) {
      console.warn("⚠️ No Audio URL provided");
      updateStatus('listening');
      return;
    }

    updateStatus('speaking');
    speakStartTimeRef.current = Date.now();

    const secureUrl = `${url}?t=${Date.now()}`;
    const audio = new Audio(secureUrl);
    audioRef.current = audio;

    audio.onended = () => { 
      if (isMountedRef.current) updateStatus('listening'); 
    };
    
    audio.onerror = (e) => {
      console.error("Audio Playback Error:", e);
      if (isMountedRef.current) updateStatus('listening');
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        if (error.name === 'AbortError' || error.message.includes('interrupted')) {
           // Normal Barge-in behavior, ignore
        } else {
           console.error("Play Failed:", error);
           if (isMountedRef.current) updateStatus('listening');
        }
      });
    }
  }, [stopAudio]);

  // ============================================================
  // 2. API SERVICE LAYER
  // ============================================================

  const handleUserQuery = useCallback(async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    
    // Stop audio & Cancel previous requests
    stopAudio();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    updateStatus('processing');
    setLiveTranscript(rawText);
    
    // Optimistic UI Update
    if (onMessageAdd) onMessageAdd('user', rawText);

    try {
      const token = localStorage.getItem('token') || '';
      const serverMsg = normalizeInput(rawText);
      
      console.log("🚀 Sending to Backend:", serverMsg);

      const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message: serverMsg }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();
      if (!isMountedRef.current) return;

      if (data.success) {
        const aiText = typeof data.reply === 'string' ? data.reply : data.reply.content;
        if (onMessageAdd) onMessageAdd('assistant', aiText);
        
        if (data.audioUrl) {
           console.log("🔊 Playing Audio:", data.audioUrl);
           playServerAudio(data.audioUrl);
        } else {
           console.warn("⚠️ No Audio URL in response");
           updateStatus('listening');
        }
      } else {
          updateStatus('listening');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("ℹ️ Request aborted for new input");
      } else {
        console.error("API Error:", error);
        updateStatus('listening');
      }
    }
  }, [onMessageAdd, playServerAudio, stopAudio]);

  // ============================================================
  // 3. SPEECH RECOGNITION (Stable Ref Version)
  // ============================================================

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return setErrorMsg("Use Chrome");

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      setErrorMsg(''); 
      if (statusRef.current === 'initializing') updateStatus('listening');
    };

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      // 🚨 BARGE-IN: Use REF to check status (won't trigger re-render loops)
      if ((final || interim) && statusRef.current === 'speaking') {
          console.log("🎤 Barge-In: User spoke");
          stopAudio();
          updateStatus('listening');
      }
      
      if (final) {
        handleUserQuery(final);
      } else {
        setLiveTranscript(interim);
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      // Auto-restart if not processing
      if (statusRef.current !== 'processing') {
         setTimeout(() => { 
           try { recognitionRef.current?.start(); } catch(e) {}
         }, 300); 
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch(e) {}
  }, [handleUserQuery, stopAudio]);

  // ============================================================
  // 4. VISUALIZER
  // ============================================================

  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const drawLoop = () => {
        if (!canvasRef.current || !analyserRef.current || !isMountedRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) sum += dataArrayRef.current[i];
        const avgVolume = sum / dataArrayRef.current.length;

        // Barge-in check with Ref
        if (statusRef.current === 'speaking') {
            const timeElapsed = Date.now() - speakStartTimeRef.current;
            if (timeElapsed > CONFIG.INTERACTION.GRACE_PERIOD_MS && avgVolume > CONFIG.INTERACTION.INTERRUPT_THRESHOLD) {
                console.log("🔊 Barge-In: Noise detected");
                stopAudio();
                updateStatus('listening');
            }
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = statusRef.current === 'speaking' ? '#06b6d4' : '#3b82f6';
        
        // Simple Bar Visualizer for performance
        const barWidth = (canvas.width / dataArrayRef.current.length) * 2.5;
        let x = 0;
        for(let i = 0; i < dataArrayRef.current.length; i++) {
          const barHeight = dataArrayRef.current[i] / 2;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
        
        animationFrameRef.current = requestAnimationFrame(drawLoop);
      };
      drawLoop();
    } catch (err) { console.error("Mic Error:", err); }
  }, [stopAudio]);

  // ============================================================
  // 5. LIFECYCLE (Dependencies removed to prevent loops)
  // ============================================================
  useEffect(() => {
    isMountedRef.current = true;
    startVisualizer(); 
    startSpeechRecognition();

    return () => {
      console.log("♻️ VoiceCall Unmounting");
      isMountedRef.current = false;
      stopAudio();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ Empty dependency array ensures it runs ONCE

  // ============================================================
  // 6. RENDER
  // ============================================================
  return (
    <div className="voice-call-overlay" data-status={uiStatus} onClick={() => { stopAudio(); updateStatus('listening'); }}>
      <div className="vc-header">
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="vc-btn">
          <Minimize2 size={24} />
        </button>
        <div className="vc-brand-badge">
           <div className={`vc-live-dot ${uiStatus === 'listening' ? 'pulse' : ''}`}></div> RCM Live
        </div>
      </div>

      <div className="vc-visualizer-container">
        <div className="vc-orb">
             {uiStatus === 'processing' && <Activity className="spin" size={40} />}
             {uiStatus === 'speaking' && <Volume2 className="pulse" size={40} />}
             {uiStatus === 'listening' && <Mic size={40} />}
             {uiStatus === 'error' && <AlertCircle size={40} />}
        </div>
        <canvas ref={canvasRef} className="vc-waveform" width="300" height="100"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status">
            {errorMsg ? "⚠️ " + errorMsg : 
             uiStatus === 'listening' ? "Listening..." : 
             uiStatus === 'speaking' ? "Speaking..." : "Thinking..."}
        </h2>
        <div className="vc-sub-text">
            {liveTranscript || "Speak now..."}
        </div>
      </div>

      <div className="vc-controls" onClick={(e) => e.stopPropagation()}>
        <button className="vc-btn" onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        <button className="vc-btn vc-btn-main" onClick={() => {
            if (uiStatus === 'listening') { stopAudio(); onClose(); }
            else { stopAudio(); updateStatus('listening'); }
        }}>
           <Mic size={32} />
        </button>
        <button className="vc-btn vc-btn-red" onClick={onClose}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;