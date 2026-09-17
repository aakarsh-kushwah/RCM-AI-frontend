import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Volume2, VolumeX, Minimize2, Mic, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './VoiceCall.css';
import config from '../../config/env';

const BRAND_NAME = 'RCM AI';

const STATUS_COPY = {
  connecting: { title: 'Connecting…', sub: 'Setting up your microphone' },
  listening: { title: 'Listening…', sub: 'Kahiye, main sun raha hoon…' },
  processing: { title: 'Thinking…', sub: 'Soch raha hoon…' },
  speaking: { title: 'Speaking…', sub: 'Bol raha hoon…' },
  error: { title: 'Something went wrong', sub: 'Tap to retry' },
};

const VoiceCall = () => {
  const navigate = useNavigate();

  // --- UI STATE ---
  // Call connects automatically on mount — no manual "tap to start" gate.
  const [uiStatus, setUiStatus] = useState('connecting'); // connecting | listening | processing | speaking | error
  const [liveTranscript, setLiveTranscript] = useState('');
  const [captionHistory, setCaptionHistory] = useState([]); // last couple of finalized user lines, for a Gemini-Live style caption trail
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- CORE REFS ---
  const statusRef = useRef('connecting');
  const connectTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new Audio();
  }
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const transcriptThrottleRef = useRef(null);
  const silenceTimerRef = useRef(null);

  // --- VISUALIZER / AUDIO-GRAPH REFS ---
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  const outputAnalyserRef = useRef(null);
  const outputDataRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micDataRef = useRef(null);
  const micStreamRef = useRef(null);
  const micRequestedRef = useRef(false);

  // --- HELPER: Haptic feedback ---
  const vibrate = (pattern) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  // --- STATE MANAGER ---
  const updateStatus = useCallback((newStatus) => {
    statusRef.current = newStatus;
    setUiStatus(newStatus);
  }, []);

  // --- AUDIO CONTEXT (lazy, resumed on first user gesture) ---
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // --- OUTPUT (TTS) ANALYSER — hooked once into the shared <audio> element ---
  const ensureOutputAnalyser = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx || outputAnalyserRef.current) return;
    try {
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      outputAnalyserRef.current = analyser;
      outputDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      // Some browsers only allow one MediaElementSource per element / tab restrictions.
      console.warn('Output analyser unavailable, falling back to synthetic waveform.');
    }
  }, [ensureAudioContext]);

  // --- MIC ANALYSER — real waveform while listening ---
  const ensureMicAnalyser = useCallback(async () => {
    if (micRequestedRef.current) return;
    micRequestedRef.current = true;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      // Mic-level visualization is a nice-to-have; speech recognition itself
      // uses its own internal capture and is unaffected by this failing.
      console.warn('Mic analyser unavailable, falling back to synthetic waveform.');
    }
  }, [ensureAudioContext]);

  const releaseMic = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    micRequestedRef.current = false;
  };

  // --- AUDIO CONTROLLER ---
  const stopAudio = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {
        /* no-op */
      }
    }
  }, []);

  const handleExit = useCallback(() => {
    stopAudio();
    if (recognitionRef.current) recognitionRef.current.stop();
    releaseMic();
    vibrate(50);
    navigate('/chat');
  }, [navigate, stopAudio]);

  // --- WAKE LOCK ---
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Wake Lock not supported/allowed');
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const newState = !prev;
      if (audioRef.current) audioRef.current.muted = newState;
      return newState;
    });
  };

  const playServerAudio = useCallback(
    (url) => {
      stopAudio();
      if (!url) {
        updateStatus('listening');
        return;
      }

      ensureOutputAnalyser();
      updateStatus('speaking');

      const audio = audioRef.current;
      audio.src = `${url}?t=${Date.now()}`;
      audio.muted = isMuted;
      audio.crossOrigin = 'anonymous';

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Auto-play blocked:', error);
          if (isMountedRef.current) updateStatus('listening');
        });
      }

      audio.onended = () => {
        if (isMountedRef.current) updateStatus('listening');
      };
      audio.onerror = () => {
        if (isMountedRef.current) updateStatus('listening');
      };
    },
    [stopAudio, isMuted, updateStatus, ensureOutputAnalyser]
  );

  // --- API HANDLER ---
  const handleUserQuery = useCallback(
    async (rawText) => {
      if (!rawText || !rawText.trim()) return;

      stopAudio();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      updateStatus('processing');
      setLiveTranscript(rawText);
      setCaptionHistory((prev) => [...prev.slice(-1), rawText.trim()]);
      vibrate(50);

      try {
        const token = localStorage.getItem('accessToken') || '';
        const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
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
        if (error.name !== 'AbortError' && isMountedRef.current) {
          updateStatus('listening');
        }
      }
    },
    [playServerAudio, stopAudio, updateStatus]
  );

  // --- SPEECH RECOGNITION CORE ---
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg('Voice input needs Chrome or Safari on this device.');
      updateStatus('error');
      return;
    }

    try {
      if (recognitionRef.current) recognitionRef.current.stop();
    } catch (e) {
      /* no-op */
    }

    ensureMicAnalyser();

    const recognition = new SpeechRecognition();
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    recognition.continuous = !isMobile;
    recognition.lang = 'hi-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (isMountedRef.current && statusRef.current === 'listening') {
        setErrorMsg('');
      }
    };

    recognition.onresult = (event) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      if (statusRef.current === 'speaking' || statusRef.current === 'processing') {
        recognition.abort();
        return;
      }

      let final = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      if (final) {
        handleUserQuery(final);
      } else {
        if (!transcriptThrottleRef.current) {
          setLiveTranscript(interim);
          transcriptThrottleRef.current = setTimeout(() => {
            transcriptThrottleRef.current = null;
          }, 100);
        }

        silenceTimerRef.current = setTimeout(() => {
          if (interim.trim().length > 0) {
            recognition.stop();
            handleUserQuery(interim);
          }
        }, 2500);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setErrorMsg('Microphone access denied.');
        updateStatus('error');
      }
    };

    recognition.onend = () => {
      if (isMountedRef.current && statusRef.current === 'listening') {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            /* no-op */
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      /* no-op */
    }
  }, [handleUserQuery, updateStatus, ensureMicAnalyser]);

  // --- REACTIVE RESTART ---
  useEffect(() => {
    if (uiStatus === 'listening') {
      startSpeechRecognition();
    }
  }, [uiStatus, startSpeechRecognition]);

  // --- RETRY (only reachable from the error state) ---
  const handleRetry = () => {
    ensureAudioContext();
    setErrorMsg('');
    updateStatus('listening');
    vibrate(50);
  };

  // --- VISUALIZER (real audio-reactive bars, with a synthetic fallback) ---
  const startVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 300;
    const cssHeight = canvas.clientHeight || 60;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const barCount = 24;
    const barWidth = cssWidth / barCount;

    const colorFor = (status) => {
      switch (status) {
        case 'speaking':
          return '#4FAE9F';
        case 'processing':
          return '#D6A94D';
        case 'error':
          return '#E27367';
        case 'connecting':
          return '#6B6E76';
        default:
          return '#7FC4B8';
      }
    };

    const animate = () => {
      if (!isMountedRef.current) return;

      if (document.visibilityState === 'visible') {
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = colorFor(statusRef.current);
        const time = Date.now() / 300;

        const useOutput = statusRef.current === 'speaking' && outputAnalyserRef.current;
        const useMic = statusRef.current === 'listening' && micAnalyserRef.current;

        if (useOutput) outputAnalyserRef.current.getByteFrequencyData(outputDataRef.current);
        if (useMic) micAnalyserRef.current.getByteFrequencyData(micDataRef.current);

        for (let i = 0; i < barCount; i += 1) {
          let height = 4;

          if (useOutput) {
            const bin = outputDataRef.current[Math.floor((i / barCount) * outputDataRef.current.length)];
            height = 4 + (bin / 255) * (cssHeight * 0.85);
          } else if (useMic) {
            const bin = micDataRef.current[Math.floor((i / barCount) * micDataRef.current.length)];
            height = 4 + (bin / 255) * (cssHeight * 0.85);
          } else if (statusRef.current === 'speaking') {
            height = Math.random() * (cssHeight * 0.7) + 5;
          } else if (statusRef.current === 'listening') {
            height = (Math.sin(time + i * 0.5) + 1.5) * 6;
          } else if (statusRef.current === 'processing') {
            height = Math.random() * 15 + 8;
          }

          const x = i * barWidth;
          const y = (cssHeight - height) / 2;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth - 3, height, 4);
          } else {
            ctx.rect(x, y, barWidth - 3, height);
          }
          ctx.fill();
        }
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    isMountedRef.current = true;
    startVisualizer();

    // Auto-connect immediately — the click that opened this screen already
    // counts as the user gesture, so we don't gate behind a second tap.
    ensureAudioContext();
    vibrate(30);
    connectTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) updateStatus('listening');
    }, 450);

    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (transcriptThrottleRef.current) clearTimeout(transcriptThrottleRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
      releaseMic();
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, [stopAudio, startVisualizer, ensureAudioContext, updateStatus]);

  const copy = STATUS_COPY[uiStatus] || STATUS_COPY.connecting;

  return (
    <div className="voice-call-page-container" data-status={uiStatus}>
      <div className="vc-ambient-glow" aria-hidden="true" />

      <div className="vc-header">
        <button onClick={handleExit} className="vc-btn" aria-label="Minimize call">
          <Minimize2 size={22} />
        </button>
        <div className="vc-brand-badge">
          <span className={`vc-live-dot ${uiStatus === 'listening' ? 'pulse' : ''}`} />
          {BRAND_NAME} Live
        </div>
        <span className="vc-header-spacer" aria-hidden="true" />
      </div>

      <div className="vc-visualizer-container">
        {uiStatus === 'error' ? (
          <button className="vc-start-overlay" onClick={handleRetry} aria-label="Retry voice chat">
            <div className="vc-orb error">
              <VolumeX size={36} />
            </div>
            <p className="vc-tap-text">{errorMsg || 'Connection failed. Tap to retry'}</p>
          </button>
        ) : (
          <div className="vc-orb">
            {uiStatus === 'connecting' && <span className="vc-orb-dot-loader" aria-hidden="true" />}
            {uiStatus === 'processing' && <Activity className="spin" size={36} />}
            {uiStatus === 'speaking' && <Volume2 className="pulse" size={36} />}
            {uiStatus === 'listening' && <Mic size={36} />}
          </div>
        )}

        <canvas ref={canvasRef} className="vc-waveform" aria-hidden="true" />
      </div>

      <div className="vc-text-area" aria-live="polite">
        {captionHistory.length > 1 && (
          <p className="vc-caption-trail" aria-hidden="true">
            {captionHistory[captionHistory.length - 2]}
          </p>
        )}
        <h2 className="vc-main-status">{copy.title}</h2>
        <div className="vc-sub-text">{uiStatus === 'error' ? copy.sub : liveTranscript || copy.sub}</div>
      </div>

      <div className="vc-controls">
        <button
          className="vc-btn"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          style={{ opacity: isMuted ? 0.5 : 1 }}
        >
          {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button className="vc-btn vc-btn-red" onClick={handleExit} aria-label="End call">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;