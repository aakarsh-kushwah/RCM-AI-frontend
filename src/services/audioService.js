/**
 * @file src/services/audioService.js
 * @description Singleton service to manage audio safely (Prevents Auto-play crashes).
 */

import { speakWithBrowser } from '../components/chatbot/browserVoice'; 

class AudioService {
  constructor() {
    this.currentAudio = null; 
    this.isBrowserSpeaking = false;
  }

  stopAll() {
    // 1. Stop Server Audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // 2. Stop Browser Speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isBrowserSpeaking = false;
  }

  playServerAudio(url) {
    this.stopAll(); 
    if (!url) return;

    // Cache busting to ensure fresh audio
    const secureUrl = `${url}?t=${Date.now()}`;
    this.currentAudio = new Audio(secureUrl);

    // ✅ SAFETY FIX: Handle Browser Autoplay Policy
    const playPromise = this.currentAudio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Audio started successfully
        })
        .catch(error => {
          if (error.name === 'NotAllowedError') {
            console.warn("⚠️ Autoplay Blocked: User interaction required.");
            // Optional: You can trigger a UI toast here telling user to click "Listen"
          } else {
            console.error("Audio Play Error:", error);
          }
        });
    }
  }

  playBrowserVoice(text) {
    this.stopAll(); 
    if (!text) return;
    
    this.isBrowserSpeaking = true;
    
    // Fallback if speakWithBrowser is missing
    if (typeof speakWithBrowser === 'function') {
        speakWithBrowser(text, 
            () => { },
            () => { this.isBrowserSpeaking = false; }
        );
    } else {
        // Native fallback
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => { this.isBrowserSpeaking = false; };
        window.speechSynthesis.speak(utterance);
    }
  }

  playSmart(audioUrl, text) {
    if (audioUrl) {
      this.playServerAudio(audioUrl);
    } else if (text) {
      this.playBrowserVoice(text);
    }
  }
}

export const audioService = new AudioService();