/**
 * @file src/services/chatService.js
 * @description Handles API communication (Text + Images).
 */

import config from '../config/env';

class ChatService {
  async sendMessage(message, imageFile = null) {
    const token = localStorage.getItem('accessToken') || '';
    
    try {
      let imageBase64 = null;
      if (imageFile) {
        imageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
      }

      const finalMessage = message && message.trim() ? message : (imageFile ? "Is image ke baare me batao" : "");

      let headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const body = JSON.stringify({
        message: finalMessage,
        image: imageBase64
      });

      const response = await fetch(`${config.API.BASE_URL}/api/chat`, {
        method: 'POST',
        headers: headers,
        body: body
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