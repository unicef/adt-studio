// Install required packages:
// npm install nspell dictionary-en dictionary-es franc

/**
 * Multilingual text validator
 * Uses nspell and dictionaries to validate text
 * Supports English and Spanish
 */

// Import required libraries
//import nspell from '../../libs/nspell/index.js';
//import dictionaryEn from '../../libs/dictionary-en/index.js';
//import dictionaryEs from '../../libs/dictionary-es-UY/index.js'; 
//import franc from '../../libs/franc/index.js';

/**
 * Browser-compatible text validator using Spanish dictionary
 * Uses a simplified approach to validate text against a dictionary
 */

// Class for text validation
class TextValidator {
  constructor() {
    // Initialize with document language
    this.documentLanguage = document.documentElement.lang || 'es';
    this.spanishWords = null;
    this.initialized = false;
    this.initializePromise = this.initialize();
  }

  /**
   * Initialize dictionary by loading word list
   */
  async initialize() {
    try {
      // First, initialize with the fallback dictionary to ensure we have common words
      this.initializeFallbackDictionary();

      // Then try to load the full dictionary to supplement
      try {
        // Load the Spanish dictionary directly from the .dic file as text
        const response = await fetch('./assets/modules/activities/index.dic');
        const dicText = await response.text();

        // Parse the dictionary file (skipping headers)
        // Dictionary format has a count on the first line, then one word per line
        const lines = dicText.split('\n');
        const wordCount = parseInt(lines[0], 10);

        // Add words to our existing Set (which already has the fallback words)
        // Start from line 1 (after the count)
        for (let i = 1; i < lines.length; i++) {
          // Dictionary format often has a word followed by flags separated by /
          // We only want the word part
          const line = lines[i].trim();
          if (line) {
            const word = line.split('/')[0].toLowerCase();
            if (word) {
              this.spanishWords.add(word);
            }
          }
        }
      } catch (dictError) {
        console.warn('Could not load full dictionary, continuing with fallback only:', dictError);
        // We already have the fallback dictionary loaded, so we can continue
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error in dictionary initialization:', error);
      // One last attempt to load just the fallback dictionary
      this.initializeFallbackDictionary();
    }
  }

  /**
   * Initialize a smaller fallback dictionary of common words
   */
  initializeFallbackDictionary() {
    // Include a subset of very common Spanish words as fallback
    const commonWords = [
      'a', 'al', 'algo', 'algunos', 'ante', 'antes', 'como', 'con', 'contra', 'cual', 'cuando',
      'de', 'del', 'desde', 'donde', 'durante', 'e', 'el', 'en', 'entre', 'era', 'eres', 'es',
      'esa', 'ese', 'esta', 'está', 'este', 'ha', 'hasta', 'hay', 'he', 'las', 'lo', 'los',
      'me', 'mi', 'mí', 'mientras', 'muy', 'ni', 'no', 'nos', 'nosotros', 'nuestra', 'nuestro',
      'o', 'otra', 'otro', 'para', 'pero', 'por', 'porque', 'que', 'qué', 'quien', 'quién',
      'se', 'sea', 'según', 'si', 'sí', 'siempre', 'sin', 'sobre', 'soy', 'su', 'sus', 'tal',
      'también', 'tanto', 'te', 'tu', 'tú', 'un', 'una', 'uno', 'unos', 'vosotros', 'y', 'ya', 'yo',

      // Common words with accents that might be missed
      'información', 'reformulación', 'día', 'año', 'país', 'después', 'así', 'través',
      'número', 'línea', 'página', 'párrafo', 'título', 'capítulo', 'sección',
      'más', 'aquí', 'allí', 'ahí', 'quizás', 'oración', 'análisis', 'acción',

      // Common words describing feelings (not validating from the dictionary)
      'sonríe', 'ríe',

      // Common textbook/educational terms
      'ejemplo', 'ejercicio', 'actividad', 'lectura', 'texto', 'respuesta', 'pregunta',
      'problema', 'solución', 'explicación', 'definición', 'concepto', 'tema', 'materia',
      'vocabulario', 'gramática', 'verbos', 'sustantivos', 'adjetivos', 'adverbios',
      'teoría', 'práctica', 'resultado', 'método', 'sistema', 'función', 'proceso',
      'autor', 'libro', 'obra', 'personaje', 'historia', 'ciencia', 'matemática',
      'biología', 'física', 'química', 'geografía', 'economía', 'tecnología',

      // Words missing from diccionary-es-UY
      'subtítulo', 'sumate', 'súmate', 'sumarse', 'cómpralo', 'cómprame', 'cómprate', 'yacaré', 'yacare',

      // Biology terms
      'xerófila', 'mesófila', 'hidrófila', 'fotosíntesis', 'clorofila', 'citoplasma',
      'ADN', 'ARN', 'genética', 'evolución', 'célula', 'bacteria', 'virus', 'proteína',
      'aminoácido', 'enzima', 'mitocondria', 'cloroplasto', 'núcleo', 'cromosoma',
      'taxonomía', 'especie', 'género', 'familia', 'orden', 'clase', 'filo', 'reino',
      'eucariota', 'procariota', 'autótrofo', 'heterótrofo', 'mutación', 'alelo',
      'fenotipo', 'genotipo', 'meiosis', 'mitosis', 'gameto', 'zigoto', 'embrión',
      'organismo', 'ecosistema', 'bioma', 'hábitat', 'nicho', 'biósfera', 'biodiversidad',
      'endémico', 'simbiosis', 'parásito', 'huésped', 'cadena alimenticia', 'trófico',

      // Physics terms
      'física', 'mecánica', 'cinemática', 'dinámica', 'estática', 'termodinámica',
      'electromagnético', 'relatividad', 'cuántica', 'partícula', 'átomo', 'electrón',
      'protón', 'neutrón', 'fotón', 'quark', 'bosón', 'fermión', 'hadrones', 'leptones',
      'fuerza', 'masa', 'energía', 'trabajo', 'potencia', 'aceleración', 'velocidad',
      'gravedad', 'densidad', 'presión', 'temperatura', 'calor', 'radiación',
      'conductividad', 'resistencia', 'voltaje', 'amperaje', 'frecuencia', 'longitud de onda',

      // Chemistry terms
      'química', 'elemento', 'compuesto', 'molécula', 'átomo', 'ión', 'anión', 'catión',
      'isótopo', 'valencia', 'enlace', 'covalente', 'iónico', 'metálico', 'solución',
      'soluto', 'solvente', 'concentración', 'mol', 'molaridad', 'normalidad',
      'pH', 'ácido', 'base', 'sal', 'óxido', 'hidróxido', 'orgánico', 'inorgánico',
      'hidrocarburo', 'alcano', 'alqueno', 'alquino', 'alcohol', 'aldehído', 'cetona',
      'ácido carboxílico', 'éster', 'éter', 'amina', 'amida', 'fenol', 'carbohidrato',
      'lípido', 'proteína', 'polímero', 'monómero', 'catalizador', 'inhibidor',

      // Mathematics terms
      'matemática', 'álgebra', 'geometría', 'cálculo', 'estadística', 'probabilidad',
      'aritmética', 'trigonometría', 'ecuación', 'función', 'variable', 'constante',
      'fracción', 'decimal', 'exponente', 'logaritmo', 'derivada', 'integral',
      'matriz', 'vector', 'tensor', 'conjunto', 'permutación', 'combinación',
      'teorema', 'axioma', 'postulado', 'corolario', 'lema', 'hipótesis',
      'demostración', 'inducción', 'deducción', 'inferencia', 'algoritmo',

      // Earth science terms
      'geología', 'meteorología', 'hidrología', 'oceanografía', 'mineralogía',
      'paleontología', 'sismología', 'vulcanología', 'litosfera', 'atmósfera',
      'hidrosfera', 'biosfera', 'erosión', 'sedimentación', 'tectónica', 'placa',
      'magma', 'lava', 'mineral', 'roca', 'fósil', 'estrato', 'clima', 'tiempo',
      'huracán', 'tornado', 'ciclón', 'precipitación', 'humedad', 'presión atmosférica',

      // Astronomy terms
      'astronomía', 'astrofísica', 'cosmología', 'galaxia', 'estrella', 'planeta',
      'satélite', 'cometa', 'asteroide', 'meteorito', 'nebulosa', 'constelación',
      'agujero negro', 'supernova', 'pulsar', 'quásar', 'cúmulo', 'universo',
      'big bang', 'expansión', 'materia oscura', 'energía oscura', 'fusión nuclear',

      // Technology terms
      'tecnología', 'computadora', 'algoritmo', 'programa', 'software', 'hardware',
      'microprocesador', 'memoria', 'disco', 'pantalla', 'teclado', 'mouse',
      'internet', 'wifi', 'bluetooth', 'router', 'servidor', 'firewall', 'ciberseguridad',
      'programación', 'base de datos', 'código', 'binario', 'digital', 'análogo',
      'inteligencia artificial', 'aprendizaje automático', 'robótica', 'nanotecnología',
      'biotecnología', 'ingeniería genética', 'realidad virtual', 'realidad aumentada',

      // Medical terms
      'medicina', 'anatomía', 'fisiología', 'patología', 'histología', 'inmunología',
      'neurología', 'cardiología', 'dermatología', 'pediatría', 'ortopedia',
      'diagnóstico', 'síntoma', 'síndrome', 'tratamiento', 'terapia', 'medicamento',
      'vacuna', 'anticuerpo', 'antígeno', 'sistema inmune', 'sistema nervioso',
      'sistema circulatorio', 'sistema digestivo', 'sistema respiratorio'
    ];

    this.spanishWords = new Set(commonWords);
    this.initialized = true;
  }

  /**
   * Ensure dictionary is loaded before validation
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializePromise;
    }
  }

  /**
   * Check if text is valid Spanish
   * @param {string} text - Text to validate
   * @returns {Promise<boolean>} - True if text appears valid
   */
  async isValidText(text) {
    try {
      await this.ensureInitialized();

      // Clean the input
      const cleanText = text.trim();

      // Skip empty text
      if (!cleanText) {
        return false;
      }

      // First check for keyboard mashing and other obvious gibberish patterns
      if (this.hasKeyboardMashing(cleanText)) {
        console.warn('Text has keyboard mashing or gibberish patterns');
        return false;
      }

      if (!this.hasReasonableVowelRatio(cleanText)) {
        console.warn('Text has unreasonable vowel ratio');
        return false;
      }

      if (!this.hasReasonableWordLengths(cleanText)) {
        console.warn('Text has unreasonable word lengths');
        return false;
      }

      // If we have a dictionary, use it
      if (this.spanishWords && this.spanishWords.size > 0) {
        // Tokenize the text into words
        const words = cleanText.toLowerCase()
          .split(/[^a-záéíóúüñ]+/)
          .filter(word => word.length > 1); // Skip very short "words"

        if (words.length === 0) {
          return true; // No words to check
        }

        // Count how many words are in our dictionary
        let validWordCount = 0;

        for (const word of words) {
          // Skip very short words
          if (word.length <= 1) {
            validWordCount++;
            continue;
          }

          // 1. Check if the exact word is in our dictionary
          if (this.spanishWords.has(word)) {
            validWordCount++;
            continue;
          }

          // 2. Try with non-accented version
          const nonAccentedWord = this.removeAccents(word);
          if (nonAccentedWord !== word && this.spanishWords.has(nonAccentedWord)) {
            validWordCount++;
            continue;
          }

          // 3. Try checking word stems (remove common endings)
          const possibleStems = this.getPossibleStems(word);
          const nonAccentedStems = possibleStems.map(stem => this.removeAccents(stem));

          if (possibleStems.some(stem => this.spanishWords.has(stem)) ||
            nonAccentedStems.some(stem => this.spanishWords.has(stem))) {
            validWordCount++;
            continue;
          }

        }

        // Calculate the percentage of valid words
        const validWordPercentage = (validWordCount / words.length) * 100;

        // Text is considered valid if at least 30% of words are recognized
        // This threshold is lower than with nspell because our dictionary might be incomplete
        return validWordPercentage >= 25;
      }

      // If dictionary validation fails or isn't available, fall back to simpler checks
      return true;
    } catch (error) {
      console.error('Error in TextValidator.isValidText:', error);
      return true; // On error, be permissive
    }
  }

  /**
   * Get possible stem forms of a word by removing common endings
   * @param {string} word - Word to get stems for
   * @returns {string[]} - Array of possible stems
   */

  removeAccents(text) {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }
  getPossibleStems(word) {
    const stems = [word]; // Start with the original word

    // First, check for verb conjugations - these are higher priority
    // than gender variations because they're more common
    if (word.length > 3) {
      // Check for common verb endings for all Spanish conjugation patterns
      const verbEndings = [
        // Present indicative
        { ending: 'o', replacement: 'ar' },     // traslado -> trasladar (1st person singular)
        { ending: 'as', replacement: 'ar' },    // trasladas -> trasladar (2nd person singular)
        { ending: 'a', replacement: 'ar' },     // traslada -> trasladar (3rd person singular)
        { ending: 'amos', replacement: 'ar' },  // trasladamos -> trasladar (1st person plural)
        { ending: 'áis', replacement: 'ar' },   // trasladáis -> trasladar (2nd person plural)
        { ending: 'an', replacement: 'ar' },    // trasladan -> trasladar (3rd person plural)

        // Preterite
        { ending: 'é', replacement: 'ar' },     // trasladé -> trasladar
        { ending: 'aste', replacement: 'ar' },  // trasladaste -> trasladar
        { ending: 'ó', replacement: 'ar' },     // trasladó -> trasladar
        { ending: 'amos', replacement: 'ar' },  // trasladamos -> trasladar
        { ending: 'asteis', replacement: 'ar' }, // trasladasteis -> trasladar
        { ending: 'aron', replacement: 'ar' },  // trasladaron -> trasladar

        // Imperfect
        { ending: 'aba', replacement: 'ar' },   // trasladaba -> trasladar
        { ending: 'abas', replacement: 'ar' },  // trasladabas -> trasladar
        { ending: 'ábamos', replacement: 'ar' }, // trasladábamos -> trasladar
        { ending: 'abais', replacement: 'ar' }, // trasladabais -> trasladar
        { ending: 'aban', replacement: 'ar' },  // trasladaban -> trasladar

        // Future
        { ending: 'aré', replacement: 'ar' },   // trasladaré -> trasladar
        { ending: 'arás', replacement: 'ar' },  // trasladarás -> trasladar
        { ending: 'ará', replacement: 'ar' },   // trasladará -> trasladar
        { ending: 'aremos', replacement: 'ar' }, // trasladaremos -> trasladar
        { ending: 'aréis', replacement: 'ar' }, // trasladaréis -> trasladar
        { ending: 'arán', replacement: 'ar' },  // trasladarán -> trasladar

        // Conditional
        { ending: 'aría', replacement: 'ar' },   // trasladaría -> trasladar
        { ending: 'arías', replacement: 'ar' },  // trasladarías -> trasladar
        { ending: 'aríamos', replacement: 'ar' }, // trasladaríamos -> trasladar
        { ending: 'aríais', replacement: 'ar' }, // trasladaríais -> trasladar
        { ending: 'arían', replacement: 'ar' },  // trasladarían -> trasladar

        // Present subjunctive
        { ending: 'e', replacement: 'ar' },     // traslade -> trasladar
        { ending: 'es', replacement: 'ar' },    // traslades -> trasladar
        { ending: 'emos', replacement: 'ar' },  // traslademos -> trasladar
        { ending: 'éis', replacement: 'ar' },   // trasladéis -> trasladar
        { ending: 'en', replacement: 'ar' },    // trasladen -> trasladar

        // Imperfect subjunctive
        { ending: 'ara', replacement: 'ar' },   // trasladara -> trasladar
        { ending: 'aras', replacement: 'ar' },  // trasladaras -> trasladar
        { ending: 'áramos', replacement: 'ar' }, // trasladáramos -> trasladar
        { ending: 'arais', replacement: 'ar' }, // trasladarais -> trasladar
        { ending: 'aran', replacement: 'ar' },  // trasladaran -> trasladar

        { ending: 'ase', replacement: 'ar' },   // trasladase -> trasladar
        { ending: 'ases', replacement: 'ar' },  // trasladases -> trasladar
        { ending: 'ásemos', replacement: 'ar' }, // trasladásemos -> trasladar
        { ending: 'aseis', replacement: 'ar' }, // trasladaseis -> trasladar
        { ending: 'asen', replacement: 'ar' },  // trasladasen -> trasladar

        // Future subjunctive (rare but included)
        { ending: 'are', replacement: 'ar' },   // trasladare -> trasladar
        { ending: 'ares', replacement: 'ar' },  // trasladares -> trasladar
        { ending: 'áremos', replacement: 'ar' }, // trasladáremos -> trasladar
        { ending: 'areis', replacement: 'ar' }, // trasladareis -> trasladar
        { ending: 'aren', replacement: 'ar' },  // trasladaren -> trasladar

        // Imperative
        { ending: 'a', replacement: 'ar' },     // traslada -> trasladar
        { ending: 'ad', replacement: 'ar' },    // trasladad -> trasladar

        // Gerund and participle
        { ending: 'ando', replacement: 'ar' },  // trasladando -> trasladar
        { ending: 'ado', replacement: 'ar' },   // trasladado -> trasladar
        { ending: 'ada', replacement: 'ar' },   // trasladada -> trasladar
        { ending: 'ados', replacement: 'ar' },  // trasladados -> trasladar
        { ending: 'adas', replacement: 'ar' },  // trasladadas -> trasladar

        // Now repeat for -er and -ir verbs
        // -er verb endings (present indicative)
        { ending: 'o', replacement: 'er' },     // como -> comer
        { ending: 'es', replacement: 'er' },    // comes -> comer
        { ending: 'e', replacement: 'er' },     // come -> comer
        { ending: 'emos', replacement: 'er' },  // comemos -> comer
        { ending: 'éis', replacement: 'er' },   // coméis -> comer
        { ending: 'en', replacement: 'er' },    // comen -> comer

        // -ir verb endings (present indicative)
        { ending: 'o', replacement: 'ir' },     // vivo -> vivir
        { ending: 'es', replacement: 'ir' },    // vives -> vivir
        { ending: 'e', replacement: 'ir' },     // vive -> vivir
        { ending: 'imos', replacement: 'ir' },  // vivimos -> vivir
        { ending: 'ís', replacement: 'ir' },    // vivís -> vivir
        { ending: 'en', replacement: 'ir' },    // viven -> vivir

        // Basic past tense and other common endings for -er/-ir
        { ending: 'í', replacement: 'ir' },     // viví -> vivir
        { ending: 'iste', replacement: 'ir' },  // viviste -> vivir
        { ending: 'ió', replacement: 'ir' },    // vivió -> vivir
        { ending: 'ieron', replacement: 'ir' }, // vivieron -> vivir

        { ending: 'í', replacement: 'er' },     // comí -> comer
        { ending: 'iste', replacement: 'er' },  // comiste -> comer
        { ending: 'ió', replacement: 'er' },    // comió -> comer
        { ending: 'ieron', replacement: 'er' }, // comieron -> comer

        // Imperfect for -er/-ir
        { ending: 'ía', replacement: 'er' },    // comía -> comer
        { ending: 'ías', replacement: 'er' },   // comías -> comer
        { ending: 'íamos', replacement: 'er' }, // comíamos -> comer
        { ending: 'íais', replacement: 'er' },  // comíais -> comer
        { ending: 'ían', replacement: 'er' },   // comían -> comer

        { ending: 'ía', replacement: 'ir' },    // vivía -> vivir
        { ending: 'ías', replacement: 'ir' },   // vivías -> vivir
        { ending: 'íamos', replacement: 'ir' }, // vivíamos -> vivir
        { ending: 'íais', replacement: 'ir' },  // vivíais -> vivir
        { ending: 'ían', replacement: 'ir' },   // vivían -> vivir
      ];

      for (const verbForm of verbEndings) {
        if (word.length > verbForm.ending.length + 2 && word.endsWith(verbForm.ending)) {
          const base = word.slice(0, -verbForm.ending.length);
          const infinitive = base + verbForm.replacement;
          stems.push(infinitive);
        }
      }
    }

    // Check gender variants first - before adding other stems
    // This special handling for gender variations needs to come first
    const genderVariations = [
      { ending: 'ora', replacement: 'or' },     // computadora → computador
      { ending: 'riz', replacement: 'r' },      // institutriz → institutor
      { ending: 'esa', replacement: '' },       // princesa → prince
      { ending: 'ina', replacement: 'o' },      // gallina → gallo
      { ending: 'ica', replacement: 'o' },      // física → físico
      { ending: 'ada', replacement: 'ado' },    // cansada → cansado
      { ending: 'a', replacement: 'o' },        // general feminine → masculine
    ];

    // Apply gender variation checks
    for (const variation of genderVariations) {
      if (word.length > variation.ending.length + 2 && word.endsWith(variation.ending)) {
        const base = word.slice(0, -variation.ending.length);
        const newStem = base + variation.replacement;
        stems.push(newStem);
      }
    }

    // Common word endings to remove
    const endings = [
      's', 'es', // Plurals
      'mente', // Adverbs
    ];

    // Try removing each ending if the word is long enough
    for (const ending of endings) {
      if (word.length > ending.length + 2 && word.endsWith(ending)) {
        stems.push(word.slice(0, -ending.length));
      }
    }

    // // Handle common verb conjugations - try to derive possible infinitive forms
    // if (word.length > 3) {
    //   // Handle present tense conjugations
    //   if (word.endsWith('e')) {
    //     // 3rd person present of -er/-ir verbs (escribe -> escribir)
    //     stems.push(word.slice(0, -1) + 'ir');
    //     stems.push(word.slice(0, -1) + 'er');
    //   }
    //   if (word.endsWith('a')) {
    //     // 3rd person present of -ar verbs (habla -> hablar)
    //     stems.push(word.slice(0, -1) + 'ar');
    //   }
    //   if (word.endsWith('o')) {
    //     // 1st person present forms (hablo -> hablar)
    //     stems.push(word.slice(0, -1) + 'ar');
    //     stems.push(word.slice(0, -1) + 'er');
    //     stems.push(word.slice(0, -1) + 'ir');
    //   }
    // }

    // Remove duplicates
    const uniqueStems = [...new Set(stems)];

    return uniqueStems;
  }

  /**
   * Check if text has keyboard mashing patterns
   * @param {string} text - Text to check
   * @returns {boolean} - True if text has suspicious patterns
   */
  hasKeyboardMashing(text) {
    // Check for repeated characters (more than 3 of the same character in a row)
    if (/([a-zA-Z])\1{3,}/.test(text)) {
      return true;
    }

    // Check for sequences on keyboard like "asdf" or "qwerty"
    const keyboardRows = [
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm'
    ];

    for (const row of keyboardRows) {
      // Check for sequences of 4 or more adjacent keys
      for (let i = 0; i <= row.length - 4; i++) {
        const sequence = row.substr(i, 4);
        if (text.toLowerCase().includes(sequence)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if text has a reasonable ratio of vowels to consonants
   * @param {string} text - Text to check
   * @returns {boolean} - True if vowel ratio is reasonable
   */
  hasReasonableVowelRatio(text) {
    const letters = text.toLowerCase().replace(/[^a-zñáéíóúü]/g, '');
    if (letters.length < 4) return true; // Too short to analyze

    const vowels = letters.match(/[aeiouáéíóúü]/g) || [];
    const vowelRatio = vowels.length / letters.length;

    // Spanish has a higher vowel ratio than many languages
    return vowelRatio >= 0.25 && vowelRatio <= 0.65;
  }

  /**
   * Check if text has reasonable word lengths
   * @param {string} text - Text to check
   * @returns {boolean} - True if word lengths are reasonable
   */
  hasReasonableWordLengths(text) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 2) return true; // Too few words to analyze

    // Check for extremely long words (likely gibberish)
    const maxReasonableLength = 20;
    const hasUnreasonablyLongWords = words.some(word =>
      word.length > maxReasonableLength && !/[-_]/.test(word) // Allow exceptions for hyphenated words
    );

    return !hasUnreasonablyLongWords;
  }

  // Static version for convenience
  static async isValidText(text) {
    const instance = new TextValidator();
    return instance.isValidText(text);
  }
}

export default TextValidator;