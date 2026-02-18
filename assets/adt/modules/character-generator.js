// Character name generator for interactive educational content
// This module generates random character names for the application

const characterLastNames = {
  masculine: [
    "Rápido", "Feroz", "Dulce", "Elegante", "Intrépido", "Valiente",
    "Sabio", "Astuto", "Brillante", "Divertido", "Amigable",
    "Aventurero", "Creativo", "Misterioso", "Encantador",
    "Feliz", "Simpático"
  ],
  feminine: [
    "Rápida", "Feroz", "Dulce", "Elegante", "Intrépida", "Valiente",
    "Sabia", "Astuta", "Brillante", "Divertida", "Amigable",
    "Aventurera", "Creativa", "Misteriosa", "Encantadora",
    "Feliz", "Simpática"
  ]
};

const feminineName = {
  // Feminine nouns
  "Serpiente": true, "Jirafa": true, "Águila": true, "Ballena": true,
  "Estrella": true, "Abeja": true, "Mariquita": true, "Mariposa": true,
  "Tortuga": true, "Medusa": true, "Cebra": true, "Sirena": true,
  // Masculine nouns
  "Cocodrilo": false, "Panda": false, "Koala": false, "Tigre": false,
  "León": false, "Elefante": false, "Zorro": false, "Lobo": false,
  "Oso": false, "Conejo": false, "Ratón": false, "Mono": false,
  "Mapache": false, "Pingüino": false, "Loro": false, "Búho": false,
  "Delfín": false, "Tiburón": false, "Pulpo": false, "Cangrejo": false,
  "Pez": false, "Cactus": false, "Robot": false,
  "Dinosaurio": false, "Extraterrestre": false, "Fantasma": false,
  "Genio": false, "Muñeco de Nieve": false, "Caramelo": false, "Unicornio": false
};

const characterFirstNames = [
  // Original reptiles
  "Cocodrilo", "Serpiente",

  // Mammals
  "Panda", "Koala", "Tigre", "León", "Elefante", "Jirafa", "Zorro",
  "Lobo", "Oso", "Conejo", "Ratón", "Mono", "Mapache", "Cebra",

  // Birds
  "Águila", "Flamenco", "Pingüino", "Loro", "Búho",

  // Marine life
  "Delfín", "Ballena", "Tiburón", "Pulpo", "Estrella", "Cangrejo",
  "Pez", "Tortuga", "Medusa", "Foca",

  // Small creatures
  "Abeja", "Mariquita", "Mariposa",

  // Plants and nature
  "Cactus",

  // Others
  "Robot", "Dinosaurio", "Extraterrestre", "Fantasma", "Genio",
  "Sirena", "Muñeco de Nieve", "Caramelo", "Unicornio"
];

const characterSounds = [

];

// Map to associate animals with their corresponding emojis
const animalEmojis = {
  //Original Reptiles
  "Cocodrilo": "🐊",
  "Serpiente": "🐍",
  "Rana": "🐸",

  // Mammals
  "Panda": "🐼",
  "Koala": "🐨",
  "Tigre": "🐯",
  "León": "🦁",
  "Elefante": "🐘",
  "Jirafa": "🦒",
  "Zorro": "🦊",
  "Lobo": "🐺",
  "Oso": "🐻",
  "Conejo": "🐰",
  "Ratón": "🐭",
  "Mono": "🐒",
  "Mapache": "🦝",
  "Cebra": "🦓",

  // Birds
  "Águila": "🦅",
  "Flamenco": "🦩",
  "Pingüino": "🐧",
  "Loro": "🦜",
  "Búho": "🦉",

  // Marine life
  "Delfín": "🐬",
  "Ballena": "🐋",
  "Tiburón": "🦈",
  "Pulpo": "🐙",
  "Estrella": "⭐",
  "Cangrejo": "🦀",
  "Pez": "🐠",
  "Tortuga": "🐢",
  "Medusa": "🐙",
  "Foca": "🦭",

  // Small creatures
  "Abeja": "🐝",
  "Mariquita": "🐞",
  "Mariposa": "🦋",

  // Plants and nature
  "Cactus": "🌵",

  // Others
  "Robot": "🤖",
  "Dinosaurio": "🦖",
  "Extraterrestre": "👽",
  "Fantasma": "👻",
  "Genio": "🧞‍♂️",
  "Sirena": "🧜‍♀️",
  "Muñeco de Nieve": "⛄️",
  "Caramelo": "🍭",
  "Unicornio": "🦄",
};

/**
 * Generates a unique student ID
 * This ID stays consistent for a student even if they change their character
 * @returns {string} A unique identifier for the student
 */
export function generateStudentID() {
  // Generate a random alphanumeric ID with a timestamp prefix to ensure uniqueness
  const timestamp = Date.now().toString(36); // Convert timestamp to base36
  const randomPart = Math.random().toString(36).substring(2, 10); // 8 characters of randomness

  //return `student-${timestamp}-${randomPart}`;
  return `${randomPart}`;
}

/**
 * Generates a random character name
 * @returns {Object} Object containing first name, last name, full name, and emoji
 */
export function generateRandomCharacterName() {
  const randomFirstName = characterFirstNames[Math.floor(Math.random() * characterFirstNames.length)];

  // Select from feminine or masculine last names based on the gender of the first name
  const isFeminine = feminineName[randomFirstName] === true;
  const lastNamesList = isFeminine ? characterLastNames.feminine : characterLastNames.masculine;
  const randomLastName = lastNamesList[Math.floor(Math.random() * lastNamesList.length)];

  const emoji = animalEmojis[randomFirstName] || "🦖";

  return {
    firstName: randomFirstName,
    lastName: randomLastName,
    fullName: `${randomFirstName} ${randomLastName}`,
    emoji: emoji
  };
}

// Function to get a character greeting with the name
export function getCharacterGreeting(characterName) {
  const greetings = [
    `¡Hola! Soy ${characterName}, tu compañero de aprendizaje.`,
    `¡Bienvenido! Me llamo ${characterName} y te acompañaré en esta aventura.`,
    `¡Saludos! ${characterName} a tu servicio para aprender juntos.`
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}