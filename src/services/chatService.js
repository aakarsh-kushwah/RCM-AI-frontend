/**
 * @file src/services/chatService.js
 * @description Handles API communication (Text + Images).
 */

import config from '../config/env';

class ChatService {
  async sendMessage(message, imageFile = null) {
    const token = localStorage.getItem('token') || '';
    
    try {
      let body;
      let headers = { 'Authorization': `Bearer ${token}` };

      // Handle Image Uploads (Multipart vs JSON)
      if (imageFile) {
        const formData = new FormData();
        // Append message even if empty string to avoid backend errors
        formData.append('message', message || " "); 
        formData.append('image', imageFile); 
        
        // Browser sets Content-Type to multipart/form-data automatically
        body = formData;
      } else {
        // Standard Text Message
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ message });
      }

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