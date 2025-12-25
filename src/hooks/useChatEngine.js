/**
 * @file src/hooks/useChatEngine.js
 * @description Logic Layer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { audioService } from '../services/audioService';
import { transliterateText } from '../utils/textUtils';

export const useChatEngine = () => {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); 
  const [lastAudioUrl, setLastAudioUrl] = useState(null);
  
  const hasWelcomedRef = useRef(false);

  // Helper to safely add messages to state
  const addMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, { role, type: 'text', content }]);
  }, []);

  // 1. Initial Welcome Message
  useEffect(() => {
    const initChat = async () => {
      if (hasWelcomedRef.current) return;
      hasWelcomedRef.current = true;
      setStatus('loading');

      try {
        const data = await chatService.sendWelcomeTrigger();
        if (data.success) {
          // Robust check: Handle if reply is String OR Object
          const content = typeof data.reply === 'string' ? data.reply : (data.reply?.content || data.message);
          
          addMessage('assistant', content);
          setLastAudioUrl(data.audioUrl);
          audioService.playSmart(data.audioUrl, content);
        }
      } catch (error) {
        console.error("Welcome Error:", error);
        const fallback = "RCM AI mein swagat hai. Main aapki kya madad karu?";
        addMessage('assistant', fallback);
        audioService.playBrowserVoice(fallback);
      } finally {
        setStatus('idle');
      }
    };

    initChat();
  }, [addMessage]);

  // 2. Send Message Logic (FIXED HERE)
  const sendMessage = useCallback(async (inputText) => {
    if (!inputText.trim() || status === 'loading') return;

    const displayMsg = inputText.trim();
    addMessage('user', displayMsg);
    setStatus('loading');
    
    // Stop any currently playing audio before sending new request
    audioService.stopAll();

    try {
      // Optional: Transliterate if your utility requires it
      const serverMsg = transliterateText(displayMsg);
      
      const data = await chatService.sendMessage(serverMsg);

      // ✅ FIX: Correctly extracting text from your API Response
      // Your API returns: { success: true, reply: "Jai RCM...", message: "Jai RCM...", ... }
      const aiText = typeof data.reply === 'string' 
        ? data.reply 
        : (data.reply?.content || data.message || "Maaf kijiye, koi jawab nahi mila.");

      addMessage('assistant', aiText);
      setLastAudioUrl(data.audioUrl);
      
      // Play the audio returned by backend
      audioService.playSmart(data.audioUrl, aiText);

    } catch (error) {
      console.error("Chat Error:", error);
      addMessage('assistant', "Network connection check karein.");
    } finally {
      setStatus('idle');
    }
  }, [status, addMessage]);

  // 3. Replay Logic
  const replayLastAudio = useCallback((content) => {
    // If specific content is passed, we can verify against lastAudioUrl or just play
    audioService.playSmart(lastAudioUrl, content);
  }, [lastAudioUrl]);

  return {
    messages,
    status,
    sendMessage,
    addMessage,
    replayLastAudio
  };
};