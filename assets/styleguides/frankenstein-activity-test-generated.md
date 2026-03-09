# Styleguide — Manual escolar con acento verde (primaria)

Estilo de libro escolar para niñas y niños: páginas claras, títulos grandes en gris, acentos verdes y actividades tipo “ficha” con recuadros, líneas punteadas y resaltados.

---

## 1) Color Palette

| Role | Hex Code | Usage |
|---|---:|---|
| Page background | `#F6F7F7` | Fondo general (muy claro) |
| Surface / card | `#FFFFFF` | Tarjetas, áreas de lectura |
| Light panel | `#E9ECEF` | Recuadros de actividad, filas de tabla |
| Border / rule | `#8E8E8E` | Líneas divisorias finas, contornos |
| Dotted rule | `#7C7C7C` | Separadores punteados y líneas de respuesta |
| Title gray | `#6F6F6F` | Títulos grandes de capítulo/sección |
| Body text | `#1F1F1F` | Texto principal |
| Muted text | `#4B4B4B` | Indicaciones secundarias |
| Primary green | `#0AA14B` | Banda superior, bullets, flechas, bordes destacados |
| Dark green | `#087A3A` | Sombras/contornos verdes, énfasis |
| Highlight yellow | `#FFE24A` | Resaltado de términos en actividades |

---

## 2) Required Container Structure

> Usar **exactamente** esta estructura externa (puedes ajustar clases de alineación/anchos).

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#F6F7F7" id="content">
  <section class="w-full max-w-5xl" data-section-id="SECTION_ID" data-section-type="SECTION_TYPE" data-text-color="#1F1F1F"
      id="simple-main" role="article">
    <!-- Content goes here -->
  </section>
</div>
```

---

## 3) Inner Container

Estructura interna recomendada para simular página de libro (cabecera con banda verde + cuerpo con ritmo vertical):

```html
<div class="mx-auto w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
  <!-- Top angled brand band -->
  <header class="relative">
    <div class="h-20 bg-[#0AA14B]"></div>
    <div class="absolute inset-x-0 top-10 h-16 bg-white [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
    <div class="absolute inset-x-0 top-14 h-10 bg-[#D8DADC] opacity-70 [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>

    <!-- Mascot badge placeholder -->
    <div class="absolute right-6 top-4 flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-[#0AA14B]">
      <div class="h-12 w-12 rounded-full bg-gradient-to-br from-green-100 to-green-300"></div>
    </div>
  </header>

  <div class="px-8 pb-10 pt-8">
    <!-- page content -->
  </div>
</div>
```

---

## 4) Text Styles

> Tipografía: sans (por defecto Tailwind). Títulos pesados y grises; cuerpo negro con indicaciones en gris oscuro.

| text_type | Element | Tailwind classes |
|---|---|---|
| book_title | `h1` | `text-4xl md:text-5xl font-extrabold tracking-tight text-[#6F6F6F]` |
| book_subtitle | `p` | `mt-2 text-lg md:text-xl font-semibold text-[#4B4B4B]` |
| chapter_title | `h2` | `text-3xl md:text-4xl font-extrabold text-[#6F6F6F]` |
| section_heading | `h3` | `flex items-center gap-3 text-xl md:text-2xl font-extrabold text-[#1F1F1F]` |
| activity_title | `h4` | `text-lg font-bold text-[#1F1F1F]` |
| section_text | `p` | `text-base leading-7 text-[#1F1F1F]` |
| instruction_text | `p` | `text-base leading-7 text-[#4B4B4B]` |
| standalone_text | `p` | `text-base leading-7 text-[#1F1F1F]` |
| image_associated_text | `figcaption` | `mt-2 text-sm leading-6 text-[#4B4B4B]` |

### Bullet / instruction marker
Pequeño cuadrado verde antes de indicaciones.

```html
<span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
```

---

## 5) Image Styles

| Use case | Wrapper / Element | Tailwind classes |
|---|---|---|
| Single image | `figure` | `my-6` |
| Single image media | `div` (placeholder) | `aspect-[4/3] w-full rounded-md bg-gradient-to-br from-emerald-100 to-cyan-100 ring-1 ring-black/10` |
| Multiple images row | `div` | `my-6 grid grid-cols-2 gap-4 md:grid-cols-3` |
| Image grid (activity icons) | `div` | `my-6 grid grid-cols-2 gap-6 md:grid-cols-4` |
| Side-by-side text+image | container | `grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start` |

---

## 6) Components

### A) Chapter Badge (header tag)
Etiqueta verde (capítulo/lección) con borde redondeado, tipo “pill”.

```html
<div class="inline-flex items-center gap-2 rounded-full bg-[#0AA14B] px-4 py-2 text-sm font-extrabold text-white shadow-sm"
     data-id="ID">
  <span class="inline-block h-2 w-2 rounded-full bg-white/90"></span>
  <span data-id="ID">CAPÍTULO 1</span>
</div>
```

### B) Content Card (recuadro de actividad)
Caja gris clara con borde fino, como definiciones/consignas.

```html
<div class="rounded-sm bg-[#E9ECEF] p-5 ring-1 ring-[#8E8E8E]"
     data-id="ID">
  <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">
    Escribe tu respuesta en las líneas punteadas.
  </p>
  <div class="mt-4 space-y-3" data-id="ID">
    <div class="border-b border-dotted border-[#7C7C7C] pb-2"></div>
    <div class="border-b border-dotted border-[#7C7C7C] pb-2"></div>
  </div>
</div>
```

### C) Text Group (párrafos sin card)
Grupo con bullets verdes y separadores punteados.

```html
<div class="space-y-3" data-id="ID">
  <div class="flex gap-3" data-id="ID">
    <span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
    <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Lee el texto y responde.</p>
  </div>
  <hr class="my-4 border-t-2 border-dashed border-[#7C7C7C]" />
  <p class="text-base leading-7 text-[#4B4B4B]" data-id="ID">Trabaja con un compañero.</p>
</div>
```

---

## 7) Page Templates

### A) Chapter Start Page

```html
<div class="mx-auto w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5" data-id="ID">
  <header class="relative" data-id="ID">
    <div class="h-20 bg-[#0AA14B]"></div>
    <div class="absolute inset-x-0 top-10 h-16 bg-white [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
    <div class="absolute inset-x-0 top-14 h-10 bg-[#D8DADC] opacity-70 [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
    <div class="absolute right-6 top-4 flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-[#0AA14B]" data-id="ID">
      <div class="h-12 w-12 rounded-full bg-gradient-to-br from-green-100 to-green-300" data-id="ID"></div>
    </div>
  </header>

  <div class="px-8 pb-10 pt-8" data-id="ID">
    <div class="mb-4" data-id="ID">
      <div class="inline-flex items-center gap-2 rounded-full bg-[#0AA14B] px-4 py-2 text-sm font-extrabold text-white" data-id="ID">
        <span class="inline-block h-2 w-2 rounded-full bg-white/90"></span>
        <span data-id="ID">UNIDAD 2</span>
      </div>
    </div>
    <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-[#6F6F6F]" data-id="ID">Pensar la lengua escrita</h1>
    <p class="mt-2 text-lg md:text-xl font-semibold text-[#4B4B4B]" data-id="ID">Actividades con verbos e instrucciones.</p>

    <hr class="my-6 border-t border-[#8E8E8E]" />

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2" data-id="ID">
      <div class="space-y-3" data-id="ID">
        <div class="flex gap-3" data-id="ID">
          <span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
          <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Indica qué expresan los verbos destacados.</p>
        </div>
        <div class="rounded-sm bg-[#E9ECEF] p-5 ring-1 ring-[#8E8E8E]" data-id="ID">
          <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">En conclusión: usa verbos en <span class="bg-[#FFE24A] px-1 font-semibold">modo imperativo</span>.</p>
        </div>
      </div>
      <div class="aspect-[4/3] w-full rounded-md bg-gradient-to-br from-emerald-100 to-cyan-100 ring-1 ring-black/10" data-id="ID"></div>
    </div>
  </div>
</div>
```

### B) Regular Content Page (text and images)

```html
<div class="mx-auto w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5" data-id="ID">
  <header class="relative" data-id="ID">
    <div class="h-16 bg-[#0AA14B]"></div>
    <div class="absolute inset-x-0 top-8 h-14 bg-white [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
    <div class="absolute inset-x-0 top-11 h-10 bg-[#D8DADC] opacity-70 [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
  </header>

  <div class="px-8 pb-10 pt-8" data-id="ID">
    <h2 class="text-3xl md:text-4xl font-extrabold text-[#6F6F6F]" data-id="ID">Para definir mejor</h2>
    <hr class="my-5 border-t border-[#8E8E8E]" />

    <div class="space-y-3" data-id="ID">
      <div class="flex gap-3" data-id="ID">
        <span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
        <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Completa estas definiciones con palabras de la lista.</p>
      </div>
      <div class="flex gap-3" data-id="ID">
        <span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
        <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Escribe en el recuadro de dónde se extrajo cada definición.</p>
      </div>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]" data-id="ID">
      <div class="space-y-4" data-id="ID">
        <div class="rounded-sm bg-[#E9ECEF] p-5 ring-1 ring-[#8E8E8E]" data-id="ID">
          <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">El clima, el relieve, el ______ de una ______ … forman un conjunto llamado bioma.</p>
          <div class="mt-4 border-b border-dotted border-[#7C7C7C] pb-2"></div>
        </div>
        <div class="rounded-sm bg-[#E9ECEF] p-5 ring-1 ring-[#8E8E8E]" data-id="ID">
          <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Bioma: comunidad de ______ definida por factores ______ y ______.</p>
          <div class="mt-4 border-b border-dotted border-[#7C7C7C] pb-2"></div>
        </div>
      </div>

      <aside class="rounded-sm bg-[#F6F0D8] p-4 ring-1 ring-[#8E8E8E]" data-id="ID">
        <p class="text-sm font-bold text-[#1F1F1F]" data-id="ID">Banco de palabras</p>
        <ul class="mt-3 space-y-1 text-sm text-[#1F1F1F]" data-id="ID">
          <li data-id="ID">vegetación</li>
          <li data-id="ID">seres vivos</li>
          <li data-id="ID">suelo</li>
          <li data-id="ID">fauna</li>
        </ul>
      </aside>
    </div>

    <hr class="my-8 border-t-2 border-dashed border-[#7C7C7C]" />

    <div class="flex gap-3" data-id="ID">
      <span class="mt-2 inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
      <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Explica sobre las líneas punteadas el significado de los términos destacados.</p>
    </div>

    <div class="mt-5 rounded-md bg-[#EEF0F2] p-6" data-id="ID">
      <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">Los bosques tienen árboles de <span class="bg-[#FFE24A] px-1 font-semibold">follaje caduco</span>, es decir…</p>
      <div class="mt-4 space-y-4" data-id="ID">
        <div class="border-b border-dotted border-[#7C7C7C] pb-2"></div>
        <div class="border-b border-dotted border-[#7C7C7C] pb-2"></div>
      </div>
    </div>
  </div>
</div>
```

### C) Text and Image Side by Side

```html
<div class="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start" data-id="ID">
  <div class="space-y-3" data-id="ID">
    <h3 class="flex items-center gap-3 text-xl md:text-2xl font-extrabold text-[#1F1F1F]" data-id="ID">
      <span class="inline-block h-2.5 w-6 rounded-sm bg-[#0AA14B]"></span>
      Fuente: el manual de estudio
    </h3>
    <p class="text-base leading-7 text-[#1F1F1F]" data-id="ID">En la escuela circulan diversos recursos para estudiar.</p>
  </div>
  <div class="aspect-[4/3] w-full rounded-md bg-gradient-to-br from-emerald-100 to-cyan-100 ring-1 ring-black/10" data-id="ID"></div>
</div>
```

### D) Table of Contents

```html
<div class="mx-auto w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5" data-id="ID">
  <header class="relative" data-id="ID">
    <div class="h-16 bg-[#0AA14B]"></div>
    <div class="absolute inset-x-0 top-8 h-14 bg-white [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
    <div class="absolute inset-x-0 top-11 h-10 bg-[#D8DADC] opacity-70 [clip-path:polygon(0_0,70%_0,100%_60%,100%_100%,0_100%)]"></div>
  </header>

  <div class="px-8 pb-10 pt-8" data-id="ID">
    <h2 class="text-3xl md:text-4xl font-extrabold text-[#6F6F6F]" data-id="ID">Índice</h2>
    <hr class="my-5 border-t border-[#8E8E8E]" />

    <div class="overflow-hidden rounded-md ring-1 ring-[#8E8E8E]" data-id="ID">
      <div class="grid grid-cols-[1fr_80px] bg-[#E9ECEF] px-4 py-3 text-sm font-bold text-[#1F1F1F]" data-id="ID">
        <div data-id="ID">Sección</div>
        <div class="text-right" data-id="ID">Página</div>
      </div>
      <div class="divide-y divide-[#8E8E8E]" data-id="ID">
        <div class="grid grid-cols-[1fr_80px] px-4 py-3 text-base text-[#1F1F1F]" data-id="ID">
          <div data-id="ID">Pensar la lengua escrita</div>
          <div class="text-right" data-id="ID">28</div>
        </div>
        <div class="grid grid-cols-[1fr_80px] bg-[#E9ECEF] px-4 py-3 text-base text-[#1F1F1F]" data-id="ID">
          <div data-id="ID">Para definir mejor</div>
          <div class="text-right" data-id="ID">21</div>
        </div>
        <div class="grid grid-cols-[1fr_80px] px-4 py-3 text-base text-[#1F1F1F]" data-id="ID">
          <div data-id="ID">Fuente: el manual de estudio</div>
          <div class="text-right" data-id="ID">16</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 8) General Rules

1. **Jerarquía fuerte**: títulos grandes en gris (`#6F6F6F`) y peso extra bold.
2. **Acento verde consistente** (`#0AA14B`): banda superior, bullets cuadrados, bordes destacados y “badges”.
3. **Consignas con marcador**: cada instrucción inicia con un rectángulo verde corto (no un círculo).
4. **Separación por reglas**: usar líneas finas grises para cortes suaves y líneas **punteadas/dashed** para separar bloques de actividades.
5. **Actividades tipo ficha**: recuadros en gris claro (`#E9ECEF`) con borde gris medio (`#8E8E8E`).
6. **Resaltado textual**: términos a definir van con fondo amarillo (`#FFE24A`) y semibold.
7. **Respuestas**: líneas de respuesta con `border-dotted` y color `#7C7C7C`.
8. **Tablas**: encabezado o filas alternas en `#E9ECEF`, bordes simples.
9. **Espaciado generoso**: padding de página 2rem aprox. y gaps de 1–1.5rem entre módulos.
10. **Ilustraciones**: se presentan “flotando” sobre fondo blanco con bordes suaves; evitar marcos pesados.
