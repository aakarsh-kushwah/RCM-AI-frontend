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

  const addMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, { role, type: 'text', content }]);
  }, []);

  useEffect(() => {
    const initChat = async () => {
      if (hasWelcomedRef.current) return;
      hasWelcomedRef.current = true;
      setStatus('loading');

      try {
        const data = await chatService.sendWelcomeTrigger();
        if (data.success) {
          const content = typeof data.reply === 'string' ? data.reply : data.reply.content;
          addMessage('assistant', content);
          setLastAudioUrl(data.audioUrl);
          audioService.playSmart(data.audioUrl, content);
        }
      } catch (error) {
        const fallback = "RCM AI mein swagat hai. Main aapki kya madad karu?";
        addMessage('assistant', fallback);
        audioService.playBrowserVoice(fallback);
      } finally {
        setStatus('idle');
      }
    };

    initChat();
  }, [addMessage]);

  const sendMessage = useCallback(async (inputText) => {
    if (!inputText.trim() || status === 'loading') return;

    const displayMsg = inputText.trim();
    addMessage('user', displayMsg);
    setStatus('loading');
    
    audioService.stopAll();

    try {
      const serverMsg = transliterateText(displayMsg);
      const data = await chatService.sendMessage(serverMsg);
      const aiText = data.reply?.content || "Server error.";

      addMessage('assistant', aiText);
      setLastAudioUrl(data.audioUrl);
      audioService.playSmart(data.audioUrl, aiText);

    } catch (error) {
      addMessage('assistant', "Network connection check karein.");
    } finally {
      setStatus('idle');
    }
  }, [status, addMessage]);

  const replayLastAudio = useCallback((content) => {
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