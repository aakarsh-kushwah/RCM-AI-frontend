/**
 * Detects if the text contains Hindi characters
 * Taaki hum sahi accent wali voice choose kar sakein
 */
const isHindiText = (text) => {
    const hindiRegex = /[\u0900-\u097F]/;
    return hindiRegex.test(text);
};

/**
 * Enterprise-Grade Browser Voice Handler
 * ✅ Priority: MALE VOICES ONLY
 * ✅ Quality: "Natural" (Neural) voices preferred
 * ✅ Clarity: Tuned speed for crystal clear audio
 */
export const speakWithBrowser = (text, onStart, onEnd) => {
    if (!window.speechSynthesis) {
        console.error("Browser TTS not supported");
        if (onEnd) onEnd();
        return;
    }

    // Stop any previous speech immediately
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Voices load hone mein kabhi-kabhi time lagta hai browser mein
    let voices = window.speechSynthesis.getVoices();

    // Retry mechanism agar voices empty hain (Chrome issue fix)
    if (voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            // Retry speaking logic here internally if needed, 
            // but usually standard calls work on click.
        };
    }

    const isHindi = isHindiText(text);
    let selectedVoice = null;

    if (isHindi) {
        // --- 🇮🇳 HINDI MALE VOICE STRATEGY ---
        // Hum specifically "Male" aur "Natural" voices dhoond rahe hain
        selectedVoice = 
            voices.find(v => v.name.includes('Microsoft Madhur')) || // Best Neural Male
            voices.find(v => v.name.includes('Microsoft Ravi')) ||    // Standard Male
            voices.find(v => v.name.includes('Hindi') && v.name.includes('Male')) ||
            voices.find(v => v.name.includes('Google हिन्दी'));      // Chrome Fallback
    } else {
        // --- 🇺🇸 ENGLISH MALE VOICE STRATEGY ---
        selectedVoice = 
            voices.find(v => v.name.includes('Microsoft Christopher')) || // Best Neural Male
            voices.find(v => v.name.includes('Microsoft Guy')) ||         // Very Clear Male
            voices.find(v => v.name.includes('Microsoft Brian')) ||       // British Male
            voices.find(v => v.name.includes('English') && v.name.includes('Male')) ||
            voices.find(v => v.name.includes('Google US English'));       // Chrome Fallback
    }

    // Fallback: Agar upar wala koi na mile, to koi bhi Male voice uthao
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.name.includes('Male')) || voices[0];
    }

    // Apply the chosen voice
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log(`🗣️ Speaking (${isHindi ? 'Hindi' : 'English'} MALE):`, selectedVoice.name);
    }

    // --- 🎚️ AUDIO TUNING FOR CLARITY ---
    // Robot jaisa na lage, isliye speed thodi kam aur pitch heavy rakhenge
    
    if (isHindi) {
        utterance.rate = 0.9;  // Hindi ko thoda aaram se bolna chahiye (Clear)
        utterance.pitch = 1.0; // Deep/Normal Male Pitch
    } else {
        utterance.rate = 1.0;  // English normal speed par theek lagti hai
        utterance.pitch = 1.0;
    }
    
    utterance.volume = 1.0; // Full Volume

    // Events
    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = (e) => {
        console.error("Browser TTS Error:", e);
        if (onEnd) onEnd();
    };

    // Speak
    window.speechSynthesis.speak(utterance);
};