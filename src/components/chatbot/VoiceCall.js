/**
 * @file src/components/chatbot/VoiceCall.js
 * @description Enterprise Voice Interface with Stable References (Gemini Live Style).
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
    GRACE_PERIOD_MS: 1500, 
  }
};

const VoiceCall = ({ onClose, onMessageAdd }) => {
  // --- UI STATE ---
  const [uiStatus, setUiStatus] = useState('initializing'); 
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); 
  
  // --- REFS (Stable Logic) ---
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
    speakStartTimeRef.current = Date.now();

    const secureUrl = `${url}?t=${Date.now()}`;
    const audio = new Audio(secureUrl);
    audioRef.current = audio;

    audio.onended = () => { if (isMountedRef.current) updateStatus('listening'); };
    audio.onerror = () => { if (isMountedRef.current) updateStatus('listening'); };

    audio.play().catch(() => { if (isMountedRef.current) updateStatus('listening'); });
  }, [stopAudio]);

  // --- API HANDLER ---
  const handleUserQuery = useCallback(async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    
    stopAudio();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    updateStatus('processing');
    setLiveTranscript(rawText);
    
    // Chat history me add karo
    if (onMessageAdd) onMessageAdd('user', rawText);

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
        const aiText = typeof data.reply === 'string' ? data.reply : data.reply.content;
        if (onMessageAdd) onMessageAdd('assistant', aiText);
        
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
  }, [onMessageAdd, playServerAudio, stopAudio]);

  // --- SPEECH RECOGNITION ---
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return setErrorMsg("Use Chrome Browser");

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'en-IN'; // Change to 'hi-IN' for Hindi
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

      // Barge-in Logic
      if ((final || interim) && statusRef.current === 'speaking') {
          stopAudio();
          updateStatus('listening');
      }
      
      if (final) handleUserQuery(final);
      else setLiveTranscript(interim);
    };

    recognition.onend = () => {
      if (isMountedRef.current && statusRef.current !== 'processing') {
         setTimeout(() => { try { recognitionRef.current?.start(); } catch(e) {} }, 300); 
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch(e) {}
  }, [handleUserQuery, stopAudio]);

  // --- VISUALIZER ---
  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = statusRef.current === 'speaking' ? '#06b6d4' : '#3b82f6';
        
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
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    isMountedRef.current = true;
    startVisualizer(); 
    startSpeechRecognition();

    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [startVisualizer, startSpeechRecognition, stopAudio]);

  return (
    <div className="voice-call-overlay" data-status={uiStatus}>
      <div className="vc-header">
        <button onClick={onClose} className="vc-btn"><Minimize2 size={24} /></button>
        <div className="vc-brand-badge">
           <div className={`vc-live-dot ${uiStatus === 'listening' ? 'pulse' : ''}`}></div> RCM Live
        </div>
      </div>

      <div className="vc-visualizer-container">
        <div className="vc-orb">
             {uiStatus === 'processing' && <Activity className="spin" size={40} />}
             {uiStatus === 'speaking' && <Volume2 className="pulse" size={40} />}
             {uiStatus === 'listening' && <Mic size={40} />}
        </div>
        <canvas ref={canvasRef} className="vc-waveform" width="300" height="100"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status">
            {uiStatus === 'listening' ? "Listening..." : 
             uiStatus === 'speaking' ? "Speaking..." : "Thinking..."}
        </h2>
        <div className="vc-sub-text">{liveTranscript || "Go ahead, I'm listening..."}</div>
      </div>

      <div className="vc-controls">
        <button className="vc-btn" onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        <button className="vc-btn vc-btn-red" onClick={onClose}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;