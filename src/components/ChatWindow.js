import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css'; // Chat Window ke liye CSS file

function ChatWindow({ token, onClose }) {
    const [messages, setMessages] = useState([
        { sender: 'BOT', message: 'Hi! I am the RCM AI Assistant. How can I help you today? Ask me anything about RCM products or business.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatBodyRef = useRef(null);

    // New message aane par apne aap neeche scroll karen
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { sender: 'USER', message: input };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // ✅ TOKEN FIX: Standardized token ka upyog
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ message: currentInput }),
            });
            const data = await response.json();
            
            const botMessage = { 
                sender: 'BOT', 
                message: data.success ? data.reply : (data.message || 'Sorry, I received an unknown error.')
            };
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage = { sender: 'BOT', message: "Sorry, I couldn't connect to the server. Please check your network." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="chat-window">
            <div className="chat-header">
                <h3>RCM AI Assistant</h3>
                <button onClick={onClose} className="close-btn">&times;</button>
            </div>
            <div className="chat-body" ref={chatBodyRef}>
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.sender.toLowerCase()}`}>
                        {msg.message}
                    </div>
                ))}
                {isLoading && (
                    <div className="chat-message bot typing-indicator">
                        <span></span><span></span><span></span>
                    </div>
                )}
            </div>
            <div className="chat-footer">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask something..."
                    disabled={isLoading}
                />
                <button onClick={handleSend} disabled={isLoading || !input.trim()}>Send</button>
            </div>
        </div>
    );
}

export default ChatWindow;