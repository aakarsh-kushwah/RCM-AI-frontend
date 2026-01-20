/**
 * @file src/services/edgeTtsService.js
 * @description 🚀 RCM "SWARA" ENGINE (Corrected DB Import + Caching)
 */

// ✅ FIX 1: Correct Import relative to file location
const db = require('../models'); 

const crypto = require('crypto');
const googleTTS = require('google-tts-api');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { uploadAudioToCloudinary } = require('./cloudinaryService'); 
const path = require('path');

// ✅ FIX 2: Correct .env path
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); // Adjusted for structure

const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;

// 🎛️ SWARA TUNING
const TUNING = {
    VOICE_NAME:    "hi-IN-SwaraNeural", 
    SILENCE_BUFFER:"300ms",            
    SPEED_FAST:    "+15%", 
    SPEED_NORMAL:  "+10%", 
    PITCH_NATURAL: "+0Hz", 
};

// 🧹 SAFETY: XML Special Chars
function escapeXML(unsafe) {
    if (!unsafe) return "";
    return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

// 🧠 1. CONTEXT ENGINE
function analyzeSentiment(text) {
    if (!text) return { rate: TUNING.SPEED_NORMAL, pitch: "0Hz", style: "cheerful", degree: "1.0" };
    const lowerText = text.toLowerCase();

    if (lowerText.match(/(swagat|badhai|shandar|zabardast|target|jeet|profit|crore|jai rcm|mission|bada|toofan)/)) {
        return { rate: TUNING.SPEED_FAST, pitch: "+2Hz", style: "cheerful", degree: "1.5" };
    }
    
    if (lowerText.match(/(maafi|sorry|samasya|dikkat|dukh|loss|haar|chinta|dhyan|samajh|galti|sochiye)/)) {
        return { rate: "+5%", pitch: "-2Hz", style: "empathetic", degree: "1.2" };
    }

    return { rate: TUNING.SPEED_NORMAL, pitch: TUNING.PITCH_NATURAL, style: "cheerful", degree: "0.8" };
}

// 🗣️ 2. HINDI PHONETICS
function optimizeTextForHumanSpeech(text) {
    if (!text) return "";
    
    let script = escapeXML(text);

    // Softening fillers
    script = script.replace(/हम्म/g, `<prosody pitch="-2Hz" rate="-10%" volume="-20%">हम्म...</prosody>`);
    script = script.replace(/Hmm/gi, `<prosody pitch="-2Hz" rate="-10%" volume="-20%">हम्म...</prosody>`);
    
    // RCM Dictionary
    const dictionary = {
        "RCM": "आर सी एम",
        "Business": "बिज़नेस",
        "Product": "प्रॉडक्ट",
        "System": "सिस्टम",
        "Plan": "प्लान",
        "Direct Seller": "डायरेक्ट सेलर",
        "Royalty": "रॉयल्टी",
        "Nutricharge": "न्यूट्रीचार्ज",
        "Gamma": "गामा",
        "Oryzanol": "ओरिज़ानॉल"
    };

    Object.keys(dictionary).forEach(key => {
        const regex = new RegExp(key, "gi");
        script = script.replace(regex, dictionary[key]);
    });

    // Natural Breathing
    script = script.replace(/(\||\.)/g, () => {
        const pause = ["300ms", "400ms"][Math.floor(Math.random() * 2)];
        return `.<break time="${pause}"/>`;
    }); 

    return script;
}

// 🎨 3. SSML BUILDER
function createCinematicSSML(text) {
    let mood = analyzeSentiment(text);
    const actingScript = optimizeTextForHumanSpeech(text);

    if (!mood || !mood.style) mood = { rate: "+10%", pitch: "0Hz", style: "cheerful", degree: "1.0" };

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="hi-IN"><voice name="${TUNING.VOICE_NAME}"><break time="${TUNING.SILENCE_BUFFER}"/><mstts:express-as style="${mood.style}" styledegree="${mood.degree}"><prosody rate="${mood.rate}" pitch="${mood.pitch}">${actingScript}</prosody></mstts:express-as></voice></speak>`;
}

const synthesizeWithAzureToBuffer = (text) => {
    return new Promise((resolve, reject) => {
        if (!AZURE_KEY || !AZURE_REGION) return reject("Azure Credentials Missing");

        const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
        speechConfig.speechSynthesisVoiceName = TUNING.VOICE_NAME; 
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null); 
        
        try {
            const ssml = createCinematicSSML(text);
            synthesizer.speakSsmlAsync(
                ssml,
                result => {
                    synthesizer.close();
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                        resolve(Buffer.from(result.audioData));
                    } else {
                        console.error("Azure SSML Error:", result.errorDetails);
                        reject(result.errorDetails);
                    }
                },
                err => { synthesizer.close(); reject(err); }
            );
        } catch (error) { synthesizer.close(); reject(error); }
    });
};

const generateEdgeAudio = async (text) => {
    if (!text) return null;
    const cleanText = text.replace(/[*#]/g, '').trim(); 
    const textHash = generateTextHash(cleanText);

    try {
        // ✅ DB CHECK (Safe)
        if (db && db.VoiceResponse) {
            const cachedEntry = await db.VoiceResponse.findOne({ where: { textHash } });
            if (cachedEntry && cachedEntry.audioUrl) return cachedEntry.audioUrl;
        }
    } catch (e) {
        console.error("Cache Check Error:", e.message);
    }

    let audioBuffer = null;
    let voiceSource = 'AZURE_SWARA_FEMALE';

    try { audioBuffer = await synthesizeWithAzureToBuffer(cleanText); } catch (e) { 
        console.warn("Azure Failed, switching to Google:", e); 
    }

    // Fallback to Google if Azure fails
    if (!audioBuffer) {
        try {
            const url = googleTTS.getAudioUrl(cleanText.substring(0, 200), { lang: 'hi', slow: false });
            const axios = require('axios');
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            audioBuffer = Buffer.from(response.data);
            voiceSource = 'GOOGLE_FREE';
        } catch (err) {}
    }

    // Upload & Save
    if (audioBuffer) {
        const cloudUrl = await uploadAudioToCloudinary(audioBuffer, textHash);
        if (cloudUrl) {
            if (db && db.VoiceResponse) {
                await db.VoiceResponse.create({ 
                    textHash, 
                    originalText: cleanText, 
                    audioUrl: cloudUrl, 
                    voiceType: voiceSource 
                }).catch(err => console.error("DB Save Error:", err.message));
            }
            return cloudUrl;
        }
    }
    return null;
};

function generateTextHash(text) {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

module.exports = { generateEdgeAudio };