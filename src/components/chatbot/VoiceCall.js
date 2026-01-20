/**
 * @file src/components/chatbot/VoiceCall.js
 * @description Enterprise Voice Interface with Mobile Fixes.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2, Mic, Activity } from 'lucide-react';
import './VoiceCall.css'; 
import config from '../../config/env'; 

const VoiceCall = ({ onClose, onMessageAdd }) => {
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
  
  // 🔥 AUTO-RESTART REF (For Mobile)
  const shouldListenRef = useRef(true);

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
    // Stop Browser Speech
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    
    // Stop Server Audio
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

    // ✅ FIX: Mobile Audio Handling
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => { if (isMountedRef.current) updateStatus('listening'); };
    
    audio.onerror = (e) => { 
        console.error("Audio Playback Error:", e);
        if (isMountedRef.current) updateStatus('listening'); 
    };

    // ✅ FIX: Handle Autoplay Blocking
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Autoplay Blocked:", error);
            // Fallback: If blocked, go back to listening so user isn't stuck
            if (isMountedRef.current) updateStatus('listening');
        });
    }
  }, [stopAudio]);

  // --- API HANDLER ---
  const handleUserQuery = useCallback(async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    
    stopAudio();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    updateStatus('processing');
    setLiveTranscript(rawText);
    
    if (onMessageAdd) onMessageAdd('user', rawText);

    try {
      const token = localStorage.getItem('token') || '';
      // ✅ FIX: Ensure Correct API URL
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

  // --- SPEECH RECOGNITION (Mobile Optimized) ---
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return; // Silent fail if not supported

    const recognition = new SpeechRecognition();
    
    // ✅ FIX: Mobile "Continuous" Logic
    const isMobile = window.innerWidth < 768;
    recognition.continuous = !isMobile; 
    
    recognition.lang = 'hi-IN'; // Default to Hindi/English Mix
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

      // ✅ FIX: Less Aggressive Barge-in
      // Only stop audio if 'final' result is found OR interim is long enough
      if ((final || interim.length > 5) && statusRef.current === 'speaking') {
          stopAudio();
          updateStatus('listening');
      }
      
      if (final) handleUserQuery(final);
      else setLiveTranscript(interim);
    };

    recognition.onend = () => {
      // ✅ FIX: Robust Auto-Restart for Mobile
      if (isMountedRef.current && shouldListenRef.current && statusRef.current !== 'processing' && statusRef.current !== 'speaking') {
         try { recognition.start(); } catch(e) {} 
      }
    };

    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            shouldListenRef.current = false;
            alert("Mic Permission Blocked");
        }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
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
    } catch (err) { console.error("Visualizer Error:", err); }
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    isMountedRef.current = true;
    shouldListenRef.current = true;
    startVisualizer(); 
    startSpeechRecognition();

    return () => {
      isMountedRef.current = false;
      shouldListenRef.current = false;
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