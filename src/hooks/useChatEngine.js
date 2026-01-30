/**
 * @file src/hooks/useChatEngine.js
 * @description Logic Layer - UPDATED: Silent Mode (Cleaned)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { audioService } from '../services/audioService'; // Kept for stopAll() cleanup
import { transliterateText } from '../utils/textUtils';

export const useChatEngine = () => {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); 
  
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
          // Audio URL is ignored in silent mode
        }
      } catch (error) {
        console.error("Welcome Error:", error);
        const fallback = "RCM AI mein swagat hai. Main aapki kya madad karu?";
        addMessage('assistant', fallback);
      } finally {
        setStatus('idle');
      }
    };

    initChat();
  }, [addMessage]);

  // 2. Send Message Logic
  const sendMessage = useCallback(async (inputText, imageFile = null) => {
    if ((!inputText && !imageFile) || status === 'loading') return;

    // Use image name or text for display
    const displayMsg = inputText ? inputText.trim() : "📷 Image Uploaded";
    addMessage('user', displayMsg);
    setStatus('loading');
    
    // Stop any currently playing audio (good practice even in silent mode to kill previous sessions)
    audioService.stopAll();

    try {
      // Optional: Transliterate only if text exists
      const serverMsg = inputText ? transliterateText(inputText) : "";
      
      const data = await chatService.sendMessage(serverMsg, imageFile);

      const aiText = typeof data.reply === 'string' 
        ? data.reply 
        : (data.reply?.content || data.message || "Maaf kijiye, koi jawab nahi mila.");

      addMessage('assistant', aiText);

    } catch (error) {
      console.error("Chat Error:", error);
      addMessage('assistant', "Network connection check karein.");
    } finally {
      setStatus('idle');
    }
  }, [status, addMessage]);

  return {
    messages,
    status,
    sendMessage,
    addMessage
  };
};