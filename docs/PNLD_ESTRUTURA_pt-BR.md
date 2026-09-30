# Export PNLD — o que o ADT produz e como reagrupamos

Documento explicativo (pt-BR) do formato **PNLD "Obra Digital" (`.zip`)**. A ideia
aqui é mostrar **o que o ADT Studio gera** e **como o export reorganiza esse
conteúdo** para caber nas regras da FNDE/VALIDE.

O export **não gera conteúdo novo**: ele parte do pacote `adt/` (a versão web que
o Studio já produz) e faz três coisas — **remove** o que é andaime de runtime,
**reagrupa** os arquivos nas pastas que o edital exige, e **gera** os documentos
estruturais (`content.opf`, `toc.ncx`, `index.html` de navegação).

---

## 1. O que o ADT Studio produz (pacote `adt/`)

```
adt/
├── index.html                     página 1 (capa/abertura)
├── pg002003_sec001.html           uma página HTML por seção renderizada
├── pg004005_sec001.html           …
│   └── (28 páginas neste livro)
│
├── content/
│   ├── tailwind_output.css        CSS compilado do livro
│   ├── pages.json                 ordem de leitura (lista plana de páginas)
│   ├── toc.json                   sumário (gerado por LLM / headings)
│   ├── navigation/                artefatos de navegação
│   └── i18n/<lang>/               ← TODOS os dados por idioma
│       ├── texts.json             textos traduzidos (id → texto)
│       ├── audios.json            mapa id → nome do arquivo de áudio
│       ├── videos.json            mapa id → nome do arquivo de vídeo
│       ├── images.json            mapa id → variação de imagem por idioma
│       ├── glossary.json          verbetes do glossário
│       ├── timecode/              sincronização de áudio (read-aloud)
│       ├── audio/*.mp3            ← a mídia de áudio de fato
│       └── video/*.mp4            ← a mídia de vídeo (libras) de fato
│
├── assets/
│   ├── config.json                flags de funcionalidades, idiomas
│   ├── interface_translations/<lang>/interface_translations.json   (textos da UI)
│   ├── fonts.css  +  fonts/       fontes empacotadas
│   ├── libs/fontawesome/          ícones (css + webfonts)
│   ├── auto-fit.js                script de ajuste de layout
│   ├── activities.bundle.local.js runtime das atividades (quizzes)
│   ├── base.bundle.local.js       runtime COMPLETO do leitor ADT
│   ├── scorm.js / offline-preloader.js / sounds / symbols / favicon_io   (andaime)
│
├── images/                        imagens das páginas
├── cover.png                      capa (PNG)
├── imsmanifest.xml                empacotamento SCORM
└── AGENTS.md                      (interno)
```

Repare no padrão importante: **quase tudo que é "dado" está em JSON**
(`config.json`, `pages.json`, `toc.json`, e a pasta `content/i18n/<lang>/*.json`),
e **a mídia** (`.mp3`/`.mp4`) fica aninhada dentro de `content/i18n/<lang>/`.

---

## 2. As regras da VALIDE que forçam o reagrupamento

O edital exige pastas específicas. Os pontos que mudam a organização:

| Regra | Efeito no nosso conteúdo |
|-------|--------------------------|
| **`.json` é permitido** (confirmado com o time do VALIDE) | Os dados podem ir como JSON de verdade, num sidecar que espelha o adt |
| **Cada tipo de mídia tem sua pasta**: `resources/audios/`, `resources/videos/`, `resources/images/` | A mídia **não** pode ficar aninhada em `content/i18n/…` |
| **Scripts em `resources/scripts/`, estilos em `resources/styles/`** | `.js`/`.css` vão para as pastas próprias |
| **`content/` só pode ter `.html`** | Nada de CSS/JSON/mídia junto das páginas |
| **Nomes minúsculos, sem ponto extra, sem começar com número** | `pt-BR` → `pt-br`, `all.min.css` → `all-min.css` |

---

## 3. Como reagrupamos no export (pacote PNLD)

```
<livro>.zip
├── content/                       ← SÓ os HTML de página (renomeados p/ o id da seção)
│   ├── pg002003_sec001.html
│   └── qz001.html                 (páginas de atividade)
│
├── index.html                     ← documento de navegação (nav/sumário) — GERADO
├── content.opf                    ← manifesto EPUB3 — GERADO
├── toc.ncx                        ← navegação NCX — GERADO
├── cover.jpeg                     ← capa convertida p/ JPEG e redimensionada
│
└── resources/
    ├── adt/                       ← DADOS (JSON), espelhando o adt (ver §4)
    │   ├── assets/config.json, interface_translations/<lang>/…
    │   └── content/pages.json, toc.json, i18n/<lang>/*.json
    ├── scripts/
    │   ├── auto-fit.js
    │   └── activities-bundle-local.js
    ├── styles/                    tailwind_output.css, fonts.css, fontawesome-all-min.css
    ├── fonts/                     webfonts + glifos do FontAwesome
    ├── images/                    imagens das páginas
    ├── audios/                    ← toda a mídia de áudio (ver §5)
    └── videos/                    ← toda a mídia de vídeo (ver §5)
```

### De-para (o que vai pra onde)

| ADT Studio produz | No export PNLD vai para | Por quê |
|-------------------|-------------------------|---------|
| `index.html` + `pgXXXX_sec.html` | `content/*.html` | `content/` só aceita HTML |
| `content/tailwind_output.css` | `resources/styles/` | CSS na pasta de estilo |
| `assets/fonts.css`, `libs/fontawesome/css` | `resources/styles/` | idem (renomeado sem ponto extra) |
| `assets/fonts/`, fontawesome webfonts | `resources/fonts/` | fontes empacotadas |
| `images/` | `resources/images/` | imagens |
| `assets/auto-fit.js`, `activities.bundle.local.js` | `resources/scripts/` | todo `.js` vai pra scripts |
| **`config.json` + `pages.json` + `toc.json` + `i18n/<lang>/*.json`** | **`resources/data/…`** (mesma estrutura, JSON) | espelha o adt; leitor usa o mesmo código (ver §4) |
| **`content/i18n/<lang>/audio/*.mp3`** | **`resources/audios/`** | mídia na pasta própria (ver §5) |
| **`content/i18n/<lang>/video/*.mp4`** | **`resources/videos/`** | idem |
| `cover.png` | `cover.jpeg` (raiz) | leitor exige JPEG, tamanho fixo |
| — | `index.html` / `content.opf` / `toc.ncx` | **gerados** pelo export |
| `base.bundle.*`, `scorm.js`, `offline-preloader.js`, `imsmanifest.xml`, `AGENTS.md` | **descartados** | runtime/SCORM não entram no PNLD |

---

## 4. O caso dos dados: JSON num sidecar que espelha o adt

Como o time do VALIDE liberou `.json`, os dados vão como **arquivos JSON de
verdade**, num sidecar `resources/data/` que **repete a mesma estrutura do adt**
(`assets/` + `content/`):

```
resources/data/
├── assets/
│   ├── config.json
│   └── interface_translations/<lang>/interface_translations.json
└── content/
    ├── pages.json  toc.json
    └── i18n/<lang>/{texts,glossary,audios,videos,images}.json  timecode/…
```

Por que espelhar o adt? Porque assim o **caminho relativo é idêntico** ao do
adt/webpub — o leitor usa o **mesmo código**, só trocando a base:

```
webpub:  ./                + content/pages.json + assets/config.json
PNLD:    ./resources/data/  + content/pages.json + assets/config.json
```

O runtime já resolve isso via `runtimeBase()` (a meta `adt-base` aponta o PNLD
para `../resources/data/`; no webpub a base é `./`). Ou seja: **um único caminho
de carregamento de dados** para adt/webpub/PNLD.

> Precisa de servidor: como os dados são buscados com `fetch`, o pacote roda
> dentro de um leitor servido por http (o LIP). Não funciona por duplo-clique
> (`file://`), diferente da versão anterior com `adt-data.js`.

---

## 5. O caso da mídia: áudio e vídeo em pastas próprias

A mídia continua sendo arquivo (`.mp3`/`.mp4` são formatos permitidos), mas o
VALIDE exige cada tipo na sua pasta — essa é a **única** parte que **não** dá pra
espelhar o adt:

```
content/i18n/pt-br/audio/pg001_p000.mp3   →  resources/audios/pt-br__pg001_p000.mp3
content/i18n/pt-br/video/sl_pg001.mp4     →  resources/videos/pt-br__sl_pg001.mp4
```

**Colisão de nomes entre idiomas.** O mesmo arquivo existe em cada idioma com o
**mesmo nome** (ex.: o vídeo de libras `sl_pg001_sec001.mp4` tem uma versão em
`pt-br` e outra em `en-us`, com conteúdos diferentes). Numa pasta plana os nomes
colidiriam, então prefixamos com o idioma: **`<lang>__<nome>`** (`pasta plana` é
a forma garantidamente aceita pelo VALIDE).

Os mapas de mídia (`audios.json`/`videos.json`, que **ficam** como JSON em
`resources/data/`) têm seus valores reescritos para o nome novo, de forma que o
leitor resolve direto `resources/audios/<valor>` / `resources/videos/<valor>`.

> A mídia sai de `resources/data/`, mas o `resources/data/` **permanece** — agora
> guardando só os dados JSON.

---

## 6. O que é descartado no export

Nada disso vai para o PNLD (é andaime de runtime/empacotamento que o leitor da
FNDE não usa):

- `base.bundle.local.js` / `base.bundle.min.js` — o runtime **completo** do leitor ADT (o PNLD só leva o bundle de atividades).
- `scorm.js`, `offline-preloader.js`, `imsmanifest.xml` — empacotamento SCORM/offline.
- `favicon_io`, `AGENTS.md` e afins — arquivos auxiliares.

---

## Resumo em uma frase

O ADT produz **HTML + um monte de JSON + mídia aninhada + runtime**. O export
PNLD **mantém o HTML** (em `content/`), **mantém os dados como JSON** num sidecar
`resources/data/` que espelha o adt (leitor usa o mesmo código, só troca a base),
**espalha a mídia nas pastas `resources/{audios,videos,images}/`** (única
divergência, exigida pelo edital), **gera** os documentos estruturais
(`content.opf`, `toc.ncx`, `index.html`) e **descarta** o runtime/SCORM.
