/**
 * @file src/components/chatbot/browserVoice.js
 * @description Optimized Browser TTS utility.
 */

let voices = [];

const loadVoices = () => {
    return new Promise((resolve) => {
        let vs = window.speechSynthesis.getVoices();
        if (vs.length !== 0) {
            voices = vs;
            resolve(voices);
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                voices = window.speechSynthesis.getVoices();
                resolve(voices);
            };
        }
    });
};

loadVoices();

export const speakWithBrowser = async (text, onStart, onEnd) => {
    if (!text) return;
    window.speechSynthesis.cancel();

    if (voices.length === 0) await loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);

    // Smart Voice Selection
    const preferredVoice = 
        voices.find(v => v.name.includes("Google") && v.lang.includes("hi")) || 
        voices.find(v => v.name.includes("Lekha")) || 
        voices.find(v => v.name.includes("Ravi")) || 
        voices.find(v => v.lang === 'hi-IN') || 
        voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 0.95;  
    utterance.pitch = 1.0; 
    utterance.volume = 1.0;

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = (e) => { 
        if (e.error !== 'interrupted') if (onEnd) onEnd(); 
    };

    try {
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error("TTS Failed:", e);
    }
};