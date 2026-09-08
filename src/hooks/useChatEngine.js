/**
 * @file src/hooks/useChatEngine.js
 * @description Logic Layer - UPDATED with imageUrl support
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { audioService } from '../services/audioService';
import { transliterateText } from '../utils/textUtils';

export const useChatEngine = () => {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); 
  
  const hasWelcomedRef = useRef(false);

  // Helper to safely add messages to state with optional imageUrl
  const addMessage = useCallback((role, content, imageUrl = null) => {
    setMessages(prev => [...prev, { role, type: 'text', content, imageUrl }]);
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
          const content = typeof data.reply === 'string' ? data.reply : (data.reply?.content || data.message);
          addMessage('assistant', content, data.imageUrl || null);
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

    const displayMsg = inputText ? inputText.trim() : "📷 Image Uploaded";
    addMessage('user', displayMsg);
    setStatus('loading');
    
    audioService.stopAll();

    try {
      const serverMsg = inputText ? transliterateText(inputText) : "";
      const data = await chatService.sendMessage(serverMsg, imageFile);

      const aiText = typeof data.reply === 'string' 
        ? data.reply 
        : (data.reply?.content || data.message || "Maaf kijiye, koi jawab nahi mila.");

      addMessage('assistant', aiText, data.imageUrl || null);

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
