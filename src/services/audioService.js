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

  playServerAudio(url, fallbackText) {
    this.stopAll(); 
    if (!url) {
        if (fallbackText) this.playBrowserVoice(fallbackText);
        return;
    }

    // Cache busting to ensure fresh audio
    const secureUrl = `${url}?t=${Date.now()}`;
    this.currentAudio = new Audio(secureUrl);

    // ✅ SAFETY FIX: Handle Browser Autoplay Policy + Fallback
    const playPromise = this.currentAudio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Audio started successfully
        })
        .catch(error => {
          console.error("Audio Play Error, falling back:", error);
          if (fallbackText) {
              this.playBrowserVoice(fallbackText);
          }
        });
    }
  }

  playBrowserVoice(text) {
    this.stopAll(); 
    if (!text) return;
    
    this.isBrowserSpeaking = true;
    console.log("Using Browser TTS Fallback...");
    
    // Fallback if speakWithBrowser is missing
    if (typeof speakWithBrowser === 'function') {
        speakWithBrowser(text, 
            () => { },
            () => { this.isBrowserSpeaking = false; }
        );
    } else {
        // Native fallback
        const utterance = new SpeechSynthesisUtterance(text);
        // Basic Hindi support for native TTS
        utterance.lang = 'hi-IN';
        utterance.onend = () => { this.isBrowserSpeaking = false; };
        window.speechSynthesis.speak(utterance);
    }
  }

  playSmart(audioUrl, text) {
    if (audioUrl) {
      this.playServerAudio(audioUrl, text); // Pass text as fallback
    } else if (text) {
      this.playBrowserVoice(text);
    }
  }
}

export const audioService = new AudioService();