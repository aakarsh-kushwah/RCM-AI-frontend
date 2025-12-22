const { EdgeTTS } = require('edge-tts');
const { uploadAudioToCloudinary } = require('./cloudinaryService');
const fs = require('fs');
const path = require('path');

// Microsoft Edge Male Voice (Realistic)
const VOICE = 'en-IN-PrabhatNeural'; // Indian English/Hindi Male
// Option 2: 'hi-IN-MadhurNeural' (Pure Hindi Male)

const generateEdgeAudio = async (text) => {
    try {
        const tts = new EdgeTTS({
            voice: VOICE,
            lang: 'en-IN',
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        });

        // 1. Generate MP3 Locally
        const tempFilePath = path.join(__dirname, `../temp_${Date.now()}.mp3`);
        await tts.ttsPromise(text, tempFilePath);

        // 2. Upload to Cloudinary (Taaki har device par chale)
        // Note: Production me buffer use karein, file system slow ho sakta he
        const buffer = fs.readFileSync(tempFilePath);
        const url = await uploadAudioToCloudinary(buffer, `edge_${Date.now()}`);

        // 3. Cleanup
        fs.unlinkSync(tempFilePath);

        return url;
    } catch (error) {
        console.error("Edge TTS Failed:", error);
        return null;
    }
};

module.exports = { generateEdgeAudio };