/**
 * @file src/utils/textUtils.js
 * @description Helper functions for text processing.
 */

const HINDI_TO_ENGLISH_MAP = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', '्': '' };

const WORD_FIXES = { "आरसीएम": "rcm", "आर सी एम": "rcm", "बिजनेस": "business", "प्लान": "plan", "क्या": "kya", "है": "hai", "मैं": "main", "हूँ": "hoon" };

export const transliterateText = (text) => {
  if (!text) return "";
  let processedText = text;
  
  // Replace words
  Object.keys(WORD_FIXES).forEach(hindiWord => {
    const regex = new RegExp(hindiWord, "g");
    processedText = processedText.replace(regex, WORD_FIXES[hindiWord]);
  });

  // Replace characters
  return processedText.split('').map(char => HINDI_TO_ENGLISH_MAP[char] || char).join('');
};

export const generateWhatsAppLink = (number, message) => {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};