import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Volume2, VolumeX } from 'lucide-react'; 
import './LiveCallUI.css';

// --- Speech Recognition ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isSpeechApiAvailable = false;
try {
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'hi-IN';
        recognition.interimResults = true;
        isSpeechApiAvailable = true;
    }
} catch (error) {
    console.error("Speech Recognition API is not supported.", error);
}

function LiveCallUI() {
    const navigate = useNavigate();
    const [token] = useState(localStorage.getItem('token'));

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [statusText, setStatusText] = useState('Online'); 
    const [voices, setVoices] = useState([]);

    const recognitionRef = useRef(recognition);
    const inputRef = useRef(input); 
    const isLoadingRef = useRef(isLoading);
    
    useEffect(() => { inputRef.current = input; }, [input]);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    // --- Aawaz (TTS) ---
    useEffect(() => {
        const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
        loadVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const speak = (text) => {
        const synth = window.speechSynthesis;
        if (isMuted || !text || !synth) return;
        synth.cancel(); 
        const cleanText = text.replace(/\*\*/g, '').replace(/---/g, '').replace(/\n/g, ' ').replace(/(https?:\/\/[^\s]+)/g, ' link ');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.onstart = () => setStatusText("AI is speaking...");
        utterance.onend = () => {
            setStatusText("Online");
            if (recognitionRef.current && !isListening) {
                try { recognitionRef.current.start(); } catch(e) {}
            }
        };
        utterance.onerror = () => setStatusText("Error speaking");
        let bestVoice = voices.find(v => v.name === 'Google हिन्दी' && v.lang === 'hi-IN') || 
                        voices.find(v => v.name.includes('Microsoft') && v.lang === 'hi-IN') ||
                        voices.find(v => v.lang === 'hi-IN');
        utterance.voice = bestVoice || null;
        if (!bestVoice) utterance.lang = 'hi-IN';
        synth.speak(utterance);
    };

    // --- API Call ---
    const sendTranscriptToAI = async (transcript) => {
        const messageToSend = transcript.trim();
        if (!messageToSend || isLoadingRef.current) return;
        window.speechSynthesis.cancel();
        setIsLoading(true);
        setStatusText("AI is thinking...");
        setInput(''); 

        const API_URL = process.env.REACT_APP_API_URL;
        if (!API_URL) {
            console.error("CRITICAL: REACT_APP_API_URL is not set.");
            speak("Configuration error: API URL is missing.");
            setIsLoading(false);
            setStatusText('Online');
            return;
        }
        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: messageToSend }),
            });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json(); 
            let replyText = "Sorry, I couldn't understand.";
            if (data.success) {
                try {
                    const replyJson = (typeof data.reply === 'string') ? JSON.parse(data.reply) : data.reply;
                    replyText = replyJson.content || (replyJson.message || "Here's the result");
                } catch (e) {
                    replyText = data.reply.toString();
                }
            } else {
                replyText = data.message || replyText;
            }
            speak(replyText);
        } catch (error) {
            console.error('Chat error:', error);
            speak("Sorry, I couldn't connect to the server.");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Speech Recognition Setup ---
    useEffect(() => {
        if (!isSpeechApiAvailable || !recognitionRef.current) return;
        const rec = recognitionRef.current;
        rec.onstart = () => {
            setIsListening(true);
            setStatusText("Listening...");
        };
        rec.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                interimTranscript += event.results[i][0].transcript;
            }
            setInput(interimTranscript);
        };
        rec.onend = () => {
            setIsListening(false);
            setStatusText("Online");
            const finalTranscript = inputRef.current.trim();
            if (finalTranscript && !isLoadingRef.current) {
                sendTranscriptToAI(finalTranscript);
            }
        };
        rec.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            setStatusText("Mic error");
        };
        return () => { if (rec) rec.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleMicClick = () => {
        if (!isSpeechApiAvailable) return;
        if (isListening) {
            recognitionRef.current.stop();
        } else { 
            window.speechSynthesis.cancel();
            try { recognitionRef.current.start(); } catch(e) {}
        }
    };

    const toggleMute = () => {
        const nextMuteState = !isMuted;
        setIsMuted(nextMuteState);
        if (nextMuteState) {
            window.speechSynthesis.cancel(); 
        }
    };
    
    useEffect(() => {
        const synth = window.speechSynthesis;
        const rec = recognitionRef.current;
        if (isSpeechApiAvailable && rec && !isListening) {
            try { rec.start(); } catch(e) { console.error(e); }
        }
        return () => {
            if (synth) synth.cancel();
            if (rec) rec.stop();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="live-call-ui">
            <div className="call-header">
                <button 
                    onClick={toggleMute} 
                    className="call-icon-btn"
                	title={isMuted ? "Turn sound on" : "Turn sound off"}
                >
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <button 
                    onClick={() => navigate(-1)} 
                    className="call-icon-btn end-call-btn"
                	title="End call"
                >
                    <X size={28} />
                </button>
            </div>

            <div className="call-body">
                <div className={`avatar-container ${isListening ? 'listening' : ''} ${isLoading ? 'thinking' : ''}`}>
                    <img 
                        src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                        alt="RCM AI Logo" 
                        className="bot-logo-img" 
                    />
                </div>
                <h3 className="call-title">RCM AI Assistant</h3>
                <p className="call-status">{statusText}</p>
                
                <p className="transcript-preview">
                    {isListening ? (input || "...") : ""}
                </p>
            </div>

            <div className="call-footer">
                <button 
                    onClick={handleMicClick} 
                    className={`mic-button ${isListening ? 'active' : ''}`} 
                    disabled={!isSpeechApiAvailable}
                	title={isSpeechApiAvailable ? "Tap to speak" : "Speech not supported"}
                >
                    <Mic size={40} />
                </button>
            </div>
        </div>
    );
}

export default LiveCallUI;