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

  // 2. Send Message Logic
  const sendMessage = useCallback(async (inputText, imageFile = null) => {
    if ((!inputText && !imageFile) || status === 'loading') return;

    const imageUrl = imageFile ? URL.createObjectURL(imageFile) : null;
    addMessage('user', inputText ? inputText.trim() : '', imageUrl);
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
