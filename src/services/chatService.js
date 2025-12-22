/**
 * @file src/services/chatService.js
 * @description API Communication Layer.
 */

import config from '../config/env';

class ChatService {
  async sendMessage(message) {
    const token = localStorage.getItem('token') || '';
    
    try {
      const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Server Error");
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  }

  async sendWelcomeTrigger() {
    return this.sendMessage('__WELCOME__');
  }
}

export const chatService = new ChatService();