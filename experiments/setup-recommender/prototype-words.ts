/**
 * Round 3: every user-facing word the prototype data carries, in en, pt-BR and es, so the screens can be
 * tried in Portuguese and Spanish (Ana's request 5) and the screen and the data say the same thing (her
 * "wording mismatch"). English questions are E10's PLAIN_QUESTIONS, the words the AI was also asked in.
 * Translations are the developer's, not a translator's: check them before showing them to users.
 * Templates use {name} placeholders; plural forms are separate keys.
 */
export const LANGS = ["en", "pt-BR", "es"] as const
export type Lang = (typeof LANGS)[number]
type T = Record<Lang, string>

export const QUESTIONS_I18N: Record<string, { ask: T; options: Record<string, T> }> = {
  genre: {
    ask: { en: "What is this book mostly?", "pt-BR": "O que este livro é, na maior parte?", es: "¿Qué es este libro, sobre todo?" },
    options: {
      story: {
        en: "A story. Readers follow characters or events from start to end: a picture book, a tale or a novel. A story with a few colouring or drawing pages is still a story.",
        "pt-BR": "Uma história. O leitor acompanha personagens ou acontecimentos do começo ao fim: livro ilustrado, conto ou romance. Uma história com algumas páginas de colorir ou desenhar continua sendo uma história.",
        es: "Una historia. El lector sigue personajes o hechos de principio a fin: un libro ilustrado, un cuento o una novela. Una historia con algunas páginas para colorear o dibujar sigue siendo una historia.",
      },
      textbook: {
        en: "A schoolbook. It teaches a subject in lessons and gives the learner tasks to do.",
        "pt-BR": "Um livro escolar. Ensina um assunto em lições e dá tarefas ao aluno.",
        es: "Un libro escolar. Enseña un tema en lecciones y da tareas al alumno.",
      },
      reference: {
        en: "Something people read to find information: a report, an article, a manual or a guide. It has no tasks for the reader.",
        "pt-BR": "Algo que se lê para buscar informação: relatório, artigo, manual ou guia. Não tem tarefas para o leitor.",
        es: "Algo que se lee para buscar información: un informe, un artículo, un manual o una guía. No tiene tareas para el lector.",
      },
    },
  },
  exercises: {
    ask: {
      en: "Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)",
      "pt-BR": "O livro pede que o leitor escreva ou marque respostas? (Colorir e desenhar não contam.)",
      es: "¿El libro pide al lector que escriba o marque respuestas? (Colorear y dibujar no cuentan.)",
    },
    options: {
      none: {
        en: "No. The reader only reads, or colours and draws. Questions inside the story that nobody writes an answer to do not count.",
        "pt-BR": "Não. O leitor só lê, ou colore e desenha. Perguntas dentro da história, que ninguém responde por escrito, não contam.",
        es: "No. El lector solo lee, o colorea y dibuja. Las preguntas dentro de la historia que nadie responde por escrito no cuentan.",
      },
      some: {
        en: "Yes, on a few pages: questions to answer, blanks to fill, things to match, circle or tick.",
        "pt-BR": "Sim, em algumas páginas: perguntas para responder, lacunas para completar, coisas para ligar, circular ou marcar.",
        es: "Sí, en algunas páginas: preguntas para responder, espacios para completar, cosas para unir, rodear o marcar.",
      },
      many: { en: "Yes, on most pages.", "pt-BR": "Sim, na maioria das páginas.", es: "Sí, en la mayoría de las páginas." },
    },
  },
  composition: {
    ask: { en: "Where are the words on a page?", "pt-BR": "Onde ficam as palavras na página?", es: "¿Dónde están las palabras en la página?" },
    options: {
      "text-in-art": {
        en: "Printed on the picture itself, for example over the sky or the grass.",
        "pt-BR": "Impressas sobre a própria ilustração, por exemplo no céu ou na grama.",
        es: "Impresas sobre la propia ilustración, por ejemplo sobre el cielo o la hierba.",
      },
      "text-beside-art": {
        en: "In their own space: above, below or next to the picture, or on the opposite page.",
        "pt-BR": "Num espaço só delas: acima, abaixo ou ao lado da ilustração, ou na página ao lado.",
        es: "En su propio espacio: encima, debajo o al lado de la ilustración, o en la página de enfrente.",
      },
      "text-mostly": {
        en: "It is mostly words. Pictures are few or small.",
        "pt-BR": "É quase só texto. As ilustrações são poucas ou pequenas.",
        es: "Es casi todo texto. Las ilustraciones son pocas o pequeñas.",
      },
    },
  },
  diagrams: {
    ask: {
      en: "Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?",
      "pt-BR": "Há imagens com legendas que explicam algo, como mapas, gráficos, diagramas ou desenhos com nomes?",
      es: "¿Hay imágenes con rótulos que explican algo, como mapas, gráficos, diagramas o dibujos con nombres?",
    },
    options: {
      none: {
        en: "No. Only illustrations or photos. A caption under a photo does not count.",
        "pt-BR": "Não. Só ilustrações ou fotos. Uma legenda embaixo de uma foto não conta.",
        es: "No. Solo ilustraciones o fotos. Un pie de foto no cuenta.",
      },
      some: { en: "Yes, a few.", "pt-BR": "Sim, algumas.", es: "Sí, algunas." },
      many: { en: "Yes, on many pages.", "pt-BR": "Sim, em muitas páginas.", es: "Sí, en muchas páginas." },
    },
  },
}

/** Setting names and values in the designer's round-2 words (check-then-ask). */
export const SETTINGS_I18N: Record<string, { label: T; values: Record<string, T> }> = {
  preset: {
    label: { en: "Starting template", "pt-BR": "Modelo inicial", es: "Plantilla inicial" },
    values: {
      storybook: { en: "Story", "pt-BR": "História", es: "Historia" },
      textbook: { en: "School book", "pt-BR": "Livro escolar", es: "Libro escolar" },
      reference: { en: "Information", "pt-BR": "Informação", es: "Información" },
    },
  },
  renderStrategy: {
    label: { en: "Page layout", "pt-BR": "Layout da página", es: "Diseño de la página" },
    values: {
      llm: { en: "Rebuilt to fit the screen", "pt-BR": "Refeito para caber na tela", es: "Rehecho para caber en la pantalla" },
      "llm-overlay": { en: "Printed page, words rebuilt on top", "pt-BR": "Página impressa, com o texto refeito por cima", es: "Página impresa, con el texto rehecho encima" },
      single_column: { en: "One column, like an article", "pt-BR": "Uma coluna, como um artigo", es: "Una columna, como un artículo" },
      two_column_story: { en: "Picture beside the words", "pt-BR": "Ilustração ao lado do texto", es: "Ilustración al lado del texto" },
      fixed_layout: { en: "Keep the printed page", "pt-BR": "Manter a página impressa", es: "Mantener la página impresa" },
    },
  },
  pageGrouping: {
    label: { en: "Facing pages", "pt-BR": "Páginas lado a lado", es: "Páginas enfrentadas" },
    values: {
      single: { en: "One PDF page per screen", "pt-BR": "Uma página do PDF por tela", es: "Una página del PDF por pantalla" },
      spread: { en: "Two facing pages joined on one screen", "pt-BR": "Duas páginas unidas numa tela", es: "Dos páginas unidas en una pantalla" },
    },
  },
  sectioningMode: {
    label: { en: "Reading parts", "pt-BR": "Partes de leitura", es: "Partes de lectura" },
    values: {
      page: { en: "Each page is one part", "pt-BR": "Cada página é uma parte", es: "Cada página es una parte" },
      dynamic: { en: "Pages split into reading and tasks", "pt-BR": "Páginas divididas em leitura e tarefas", es: "Páginas divididas en lectura y tareas" },
    },
  },
  activitiesGenerator: {
    label: { en: "Activities", "pt-BR": "Atividades", es: "Actividades" },
    values: {
      enabled: { en: "Made from the book's exercises", "pt-BR": "Criadas a partir dos exercícios do livro", es: "Creadas a partir de los ejercicios del libro" },
      disabled: { en: "Off", "pt-BR": "Desligadas", es: "Desactivadas" },
    },
  },
  figureExtraction: {
    label: { en: "Maps and labelled drawings", "pt-BR": "Mapas e desenhos com legendas", es: "Mapas y dibujos con rótulos" },
    values: {
      auto: { en: "Kept together with their labels", "pt-BR": "Mantidos junto com as legendas", es: "Se mantienen junto con sus rótulos" },
      all: { en: "Every picture kept with its words", "pt-BR": "Toda imagem mantida com suas palavras", es: "Cada imagen se mantiene con sus palabras" },
      off: { en: "None", "pt-BR": "Nenhum", es: "Ninguno" },
    },
  },
}

/** What we measured, said so it does not sound like a contradiction (Ana, Hyena). */
export const MEASURED_I18N = {
  pageStorage: {
    "single-pages": {
      en: "Each PDF page is one page of the book, so each becomes one screen.",
      "pt-BR": "Cada página do PDF é uma página do livro, então cada uma vira uma tela.",
      es: "Cada página del PDF es una página del libro, así que cada una será una pantalla.",
    },
    "spreads-as-separate-pages": {
      en: "Pictures run across two facing pages, so we join each pair into one screen.",
      "pt-BR": "As ilustrações passam de uma página para a outra, então juntamos cada par numa tela.",
      es: "Las ilustraciones pasan de una página a la de enfrente, así que unimos cada par en una pantalla.",
    },
    "spreads-as-wide-pages": {
      en: "Your PDF already has both pages side by side, so each PDF page becomes one screen.",
      "pt-BR": "Seu PDF já traz as duas páginas lado a lado, então cada página do PDF vira uma tela.",
      es: "Tu PDF ya tiene las dos páginas una al lado de la otra, así que cada página del PDF será una pantalla.",
    },
  } as Record<string, T>,
  textLayer: {
    digital: { en: "The PDF has real text, so we read the words directly.", "pt-BR": "O PDF tem texto de verdade, então lemos as palavras diretamente.", es: "El PDF tiene texto real, así que leemos las palabras directamente." },
    scanned: { en: "The pages are photos of paper (a scan), so the words are read from the pictures.", "pt-BR": "As páginas são fotos do papel (digitalizadas), então as palavras são lidas das imagens.", es: "Las páginas son fotos del papel (escaneadas), así que las palabras se leen de las imágenes." },
    "scanned-with-ocr": { en: "The pages are a scan with hidden text added.", "pt-BR": "As páginas são digitalizadas, com texto oculto adicionado.", es: "Las páginas están escaneadas, con texto oculto añadido." },
    mixed: { en: "Some pages have real text, some are scans.", "pt-BR": "Algumas páginas têm texto de verdade, outras são digitalizadas.", es: "Algunas páginas tienen texto real y otras están escaneadas." },
  } as Record<string, T>,
}

/** Sentences the screens need, with placeholders. */
export const PHRASES: Record<string, T> = {
  looksRight: { en: "Looks right. Here's what we found.", "pt-BR": "Parece certo. Veja o que encontramos.", es: "Parece correcto. Esto es lo que encontramos." },
  questionsOne: { en: "1 quick question", "pt-BR": "1 pergunta rápida", es: "1 pregunta rápida" },
  questionsMany: { en: "{n} quick questions", "pt-BR": "{n} perguntas rápidas", es: "{n} preguntas rápidas" },
  // After the user answers: compare with both guesses. Never "Looks right" when neither guess matched.
  userMatchesBoth: { en: "Same as our guess.", "pt-BR": "Igual ao nosso palpite.", es: "Igual a nuestra suposición." },
  userMatchesOne: { en: "One of our two guesses said this too.", "pt-BR": "Um dos nossos dois palpites também disse isso.", es: "Una de nuestras dos suposiciones también dijo esto." },
  userMatchesNone: { en: "Neither of our guesses said this. We'll use your answer.", "pt-BR": "Nenhum dos nossos palpites disse isso. Vamos usar a sua resposta.", es: "Ninguna de nuestras suposiciones dijo esto. Usaremos tu respuesta." },
  useGuess: { en: "I'm not sure. Use “{answer}”", "pt-BR": "Não tenho certeza. Usar “{answer}”", es: "No estoy seguro. Usar «{answer}»" },
  sameOutcome: { en: "Both answers give the same settings except: {diff}", "pt-BR": "As duas respostas dão as mesmas configurações, menos: {diff}", es: "Las dos respuestas dan la misma configuración, excepto: {diff}" },
  lockedGuess: { en: "This can't be changed after import, and we only guessed it.", "pt-BR": "Isto não pode ser mudado depois da importação, e nós só chutamos.", es: "Esto no se puede cambiar después de importar, y solo lo hemos supuesto." },
  lockedCount: { en: "{n} things can't change after this", "pt-BR": "{n} coisas não podem mudar depois disto", es: "{n} cosas no se pueden cambiar después de esto" },
  readAll: { en: "We read all {n} pages.", "pt-BR": "Lemos todas as {n} páginas.", es: "Leímos las {n} páginas." },
  readSample: {
    en: "We looked at {read} of {n} pages: the first {open}, {middle} from the middle and the last {end}.",
    "pt-BR": "Olhamos {read} de {n} páginas: as {open} primeiras, {middle} do meio e as {end} últimas.",
    es: "Miramos {read} de {n} páginas: las {open} primeras, {middle} del medio y las {end} últimas.",
  },
  readingLongBook: { en: "For long books we look at about 40 pages.", "pt-BR": "Em livros longos olhamos cerca de 40 páginas.", es: "En libros largos miramos unas 40 páginas." },
  onlyOpening: {
    en: "All {n} pages we read come before the book starts (cover, title pages, foreword), so the answers are guesses.",
    "pt-BR": "Todas as {n} páginas que lemos vêm antes do começo do livro (capa, folha de rosto, prefácio), então as respostas são palpites.",
    es: "Las {n} páginas que leímos van antes de que empiece el libro (portada, portadilla, prólogo), así que las respuestas son suposiciones.",
  },
  onlyOpeningQuestion: { en: "These pages come before the book starts. What comes after them?", "pt-BR": "Estas páginas vêm antes do começo do livro. O que vem depois delas?", es: "Estas páginas van antes de que empiece el libro. ¿Qué viene después?" },
  startsOn: { en: "The book seems to start on page {start}.", "pt-BR": "O livro parece começar na página {start}.", es: "El libro parece empezar en la página {start}." },
  startsOnOrBefore: { en: "The book seems to start on page {start} or a little before.", "pt-BR": "O livro parece começar na página {start} ou um pouco antes.", es: "El libro parece empezar en la página {start} o un poco antes." },
  startUnknown: { en: "We couldn't see where the book starts. Choose the first page yourself.", "pt-BR": "Não vimos onde o livro começa. Escolha você a primeira página.", es: "No vimos dónde empieza el libro. Elige tú la primera página." },
  keepCover: { en: "Keep the cover (page 1).", "pt-BR": "Manter a capa (página 1).", es: "Mantener la portada (página 1)." },
  skipOne: { en: "Page {from} is left out.", "pt-BR": "A página {from} fica de fora.", es: "La página {from} queda fuera." },
  skipMany: { en: "Pages {from}–{to} are left out.", "pt-BR": "As páginas {from}–{to} ficam de fora.", es: "Las páginas {from}–{to} quedan fuera." },
  skipEndAtLeast: { en: "Pages {from}–{to} are end pages (maybe a few more before them).", "pt-BR": "As páginas {from}–{to} são do final (talvez algumas antes também).", es: "Las páginas {from}–{to} son del final (quizá también algunas antes)." },
  pageOpening: { en: "Opening", "pt-BR": "Abertura", es: "Apertura" },
  pageEnd: { en: "End pages", "pt-BR": "Final", es: "Final" },
  pageBook: { en: "Book", "pt-BR": "Livro", es: "Libro" },
}

export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`))
export const all = (key: keyof typeof PHRASES, v: Record<string, string | number> = {}) =>
  Object.fromEntries(LANGS.map((l) => [l, fill(PHRASES[key][l], v)])) as T

/** Short answer names, for "Use “A story”" and for the guess tags. */
export const SHORT_I18N: Record<string, Record<string, T>> = {
  genre: {
    story: { en: "A story", "pt-BR": "Uma história", es: "Una historia" },
    textbook: { en: "A school book", "pt-BR": "Um livro escolar", es: "Un libro escolar" },
    reference: { en: "Information", "pt-BR": "Informação", es: "Información" },
  },
  exercises: {
    none: { en: "No", "pt-BR": "Não", es: "No" },
    some: { en: "Yes, a few pages", "pt-BR": "Sim, algumas páginas", es: "Sí, algunas páginas" },
    many: { en: "Yes, most pages", "pt-BR": "Sim, a maioria", es: "Sí, la mayoría" },
  },
  composition: {
    "text-in-art": { en: "On the picture", "pt-BR": "Sobre a ilustração", es: "Sobre la ilustración" },
    "text-beside-art": { en: "Beside the picture", "pt-BR": "Ao lado da ilustração", es: "Al lado de la ilustración" },
    "text-mostly": { en: "Mostly words", "pt-BR": "Quase só texto", es: "Casi todo texto" },
  },
  diagrams: {
    none: { en: "No", "pt-BR": "Não", es: "No" },
    some: { en: "Yes, a few", "pt-BR": "Sim, alguns", es: "Sí, algunos" },
    many: { en: "Yes, many", "pt-BR": "Sim, muitos", es: "Sí, muchos" },
  },
}
