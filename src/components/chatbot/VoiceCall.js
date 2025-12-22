/**
 * @file src/components/chatbot/VoiceCall.js
 * @description Clean & Fixed Dependencies.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2 } from 'lucide-react';
import './VoiceCall.css'; 
import { speakWithBrowser } from './browserVoice'; 
import config from '../../config/env'; 

const VISUALIZER_SMOOTHING = 0.7; 
const INTERRUPT_THRESHOLD = 35; 
const GRACE_PERIOD = 800; 

const normalizeInput = (text) => {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/आरसीएम/g, "rcm")
    .replace(/प्लान/g, "plan")
    .replace(/बिजनेस/g, "business")
    .replace(/nutri charge/g, "nutricharge");
};

const VoiceCall = ({ onClose, onMessageAdd }) => {
  const [status, setStatus] = useState('initializing');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); 
  
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const isMountedRef = useRef(true);
  const silenceTimerRef = useRef(null);
  const speakStartTimeRef = useRef(0);
  
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const sourceRef = useRef(null); 

  // 1. Audio Control Functions (Wrapped in useCallback)
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
  }, []);

  const playBrowserAudio = useCallback((text) => {
    stopAudio();
    setStatus('speaking');
    speakStartTimeRef.current = Date.now();
    speakWithBrowser(text, 
        () => {}, 
        () => { if (isMountedRef.current) setStatus('listening'); } 
    );
  }, [stopAudio]);

  const playServerAudio = useCallback((url) => {
    stopAudio();
    setStatus('speaking');
    speakStartTimeRef.current = Date.now();
    const secureUrl = `${url}?t=${Date.now()}`;
    const audio = new Audio(secureUrl);
    audioRef.current = audio;
    audio.onended = () => { if (isMountedRef.current) setStatus('listening'); };
    audio.play().catch(e => console.warn(e));
  }, [stopAudio]);

  const handleUserQuery = useCallback(async (rawText) => {
    setStatus('processing');
    setLiveTranscript(rawText);
    if (onMessageAdd) onMessageAdd('user', rawText);

    try {
      const token = localStorage.getItem('token') || '';
      const serverMsg = normalizeInput(rawText);
      
      const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
  }, [onMessageAdd, playBrowserAudio, playServerAudio]);

  const tryRestart = useCallback(() => {
      try { recognitionRef.current?.start(); } catch(e) {}
  }, []);

  // 2. Speech Recognition (Wrapped in useCallback)
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Browser Not Supported. Use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.lang = 'en-IN';    
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      setErrorMsg(''); 
      if (status !== 'speaking' && status !== 'processing') {
          setStatus('listening');
      }
    };

    recognition.onresult = (event) => {
      if (status === 'speaking') {
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

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      setTimeout(() => { tryRestart(); }, 500); 
    };

    recognitionRef.current = recognition;
    tryRestart();
  }, [handleUserQuery, status, stopAudio, tryRestart]);

  // 3. Visualizer (Wrapped in useCallback)
  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
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
      
      const drawLoop = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) sum += dataArrayRef.current[i];
        const avgVolume = sum / dataArrayRef.current.length;

        if (status === 'speaking') {
            const timeElapsed = Date.now() - speakStartTimeRef.current;
            if (timeElapsed > GRACE_PERIOD && avgVolume > INTERRUPT_THRESHOLD) {
                stopAudio();
                setStatus('listening');
            }
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        if (canvas.width !== rect.width * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }
        
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        let strokeColor = status === 'speaking' ? '#06b6d4' : '#3b82f6';
        if (status === 'processing') strokeColor = '#a855f7';

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
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
      drawLoop();

    } catch (err) { 
        console.error("Visualizer Failed:", err);
    }
  }, [status, stopAudio]);

  // Effect
  useEffect(() => {
    isMountedRef.current = true;
    startVisualizer(); 
    startSpeechRecognition();
    return () => {
      isMountedRef.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      if (audioRef.current) audioRef.current.pause();
      window.speechSynthesis.cancel();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [startVisualizer, startSpeechRecognition]);

  return (
    <div className="voice-call-overlay" data-status={status} onClick={() => { stopAudio(); setStatus('listening'); }}>
      <div className="vc-header">
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="vc-btn">
          <Minimize2 size={24} />
        </button>
        <div className="vc-brand-badge">RCM Live</div>
      </div>

      <div className="vc-visualizer-container">
        <div className="vc-orb"></div>
        <canvas ref={canvasRef} className="vc-waveform"></canvas>
      </div>

      <div className="vc-text-area">
        <h2 className="vc-main-status">
            {errorMsg ? "Error: " + errorMsg : 
             status === 'listening' ? "Main sun raha hu..." : 
             status === 'speaking' ? "Main bol raha hu..." : "Soch raha hu..."}
        </h2>
        <div className="vc-sub-text">{liveTranscript ? `"${liveTranscript}"` : "Boliye..."}</div>
      </div>

      <div className="vc-controls" onClick={(e) => e.stopPropagation()}>
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