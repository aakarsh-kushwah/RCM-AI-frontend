/**
 * @file src/services/audioService.js
 * @description Singleton service to manage audio. 
 */

import { speakWithBrowser } from '../components/chatbot/browserVoice'; 

class AudioService {
  constructor() {
    this.currentAudio = null; 
    this.isBrowserSpeaking = false;
  }

  stopAll() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isBrowserSpeaking = false;
  }

  playServerAudio(url) {
    this.stopAll(); 
    if (!url) return;
    const secureUrl = `${url}?t=${Date.now()}`;
    this.currentAudio = new Audio(secureUrl);
    this.currentAudio.play().catch(e => console.warn("Audio Play Blocked:", e));
  }

  playBrowserVoice(text) {
    this.stopAll(); 
    if (!text) return;
    this.isBrowserSpeaking = true;
    speakWithBrowser(text, 
      () => { },
      () => { this.isBrowserSpeaking = false; }
    );
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