/**
 * Basic profanity filter for educational applications
 * Self-contained implementation without external dependencies
 */

// Basic list of inappropriate words in English and Spanish
const inappropriateWords = [
  // English words
  'fuck', 'shit', 'ass', 'damn', 'bitch', 'bastard', 'cunt', 'dick', 'penis', 'vagina',
  // Spanish words  
  'mierda', 'puta', 'pene', 'pija', 'boludez', 'puto', 'boludo', 'boluda', 'joder', 'carajo', 'coño', 'pendejo', 'culero', 'verga', 'polla',
  'chinga', 'follar', 'marica', 'maricon', 'pinche', 'cabron', 'cabrón', 'culo', 'gilipollas', 'qué cabrón', 'la concha de tu madre', 'coño', 'carajo', 'puta madre', 'pelotudo'
];

/**
 * Checks if text contains inappropriate language
 * @param {string} text - Text to check
 * @returns {boolean} - True if inappropriate language is detected
 */
export const containsProfanity = (text) => {
  if (!text || typeof text !== 'string') return false;

  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();

  // Check if any of the inappropriate words appear in the text
  return inappropriateWords.some(word => {
    // Check for whole words by looking for word boundaries
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lowerText);
  });
};

/**
 * Gets a clean version of the text with profanity replaced by asterisks
 * @param {string} text - Text to clean
 * @returns {string} - Cleaned text
 */
export const cleanText = (text) => {
  if (!text || typeof text !== 'string') return text;

  let cleanedText = text;

  inappropriateWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleanedText = cleanedText.replace(regex, '*'.repeat(word.length));
  });

  return cleanedText;
};