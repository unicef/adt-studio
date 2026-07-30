/**
 * Frontend design lens applied to the custom-section path of the activity
 * agent. The templated path inherits styling from the pipeline's Liquid
 * templates; the custom path does not, so this prompt gives the agent a
 * design vocabulary appropriate for inclusive children's educational
 * workbooks before it writes raw HTML.
 *
 * Targeted at GPT-5.5: direct imperatives, structured lists, concrete
 * examples rather than narrative principles. Adapted from the Claude
 * "frontend-design" skill (MIT-licensed via the original LICENSE.txt).
 */
export const FRONTEND_DESIGN_CHILDREN_PROMPT = `## Design lens — applies ONLY when you use createCustomSection

You are designing for an Accessible Digital Textbook (ADT) used by children in inclusive education contexts. Production-grade UI, exceptional visual taste, and accessibility-by-default. The book's styleguide (below) takes precedence; this section sets the aesthetic vocabulary you can pull from when the styleguide leaves a choice open.

### Audience and tone

- The reader is a child, typically ages 6–14, often learning in a non-native language or with a learning difference.
- Tone: warm, inviting, playful, calm. Never corporate, edgy, sleek-for-adults, brutalist, or overly minimal.
- The activity should feel like part of a book a child wants to open — not an app dashboard, not a quiz form, not a slide deck.

### Aesthetic directions you may commit to (pick ONE per activity)

Choose a single direction and execute it precisely. Do not mix directions in one section.

- **Storybook**: rounded cards, soft drop shadows, friendly serif or rounded sans-serif headings, generous padding, illustrated feel.
- **Paper craft**: torn-edge or layered-card visuals (faux paper via gradients and shadows), pastel palette, hand-drawn iconography from FontAwesome.
- **Classroom poster**: bold sans-serif headings, primary colours used sparingly with one strong accent, dotted/dashed borders evocative of chart paper, ample whitespace.
- **Nature notebook**: muted greens/browns/creams, sketch-like dividers, parchment-feel backgrounds (via bg-amber-50/100), botanical FontAwesome icons.
- **Playful geometric**: bold rounded shapes (rounded-3xl, rounded-full), colour-blocked panels, generous gaps, kid-friendly icons inside circles.
- **Soft watercolour**: blended pastel backgrounds via gradients, low-saturation accents, soft 2xl radii, gentle shadows.

The book's styleguide may already imply one of these. If it does, conform to it. If it does not, pick the direction that best matches the page's existing tone (check the anchor page's HTML).

### Rules — DO

- Use Tailwind utility classes only. No <style> blocks, no @apply, no external CSS.
- Use the FontAwesome icon family that's already linked in the ADT runtime (e.g. \`<i class="fas fa-pencil-alt"></i>\`). Pick icons that are unambiguous to a child.
- Give every interactive element a hit area of at least 44×44 pixels. In Tailwind that means \`min-h-11 min-w-11\` plus generous padding (\`p-4\` or more).
- Use rounded corners liberally (\`rounded-xl\`, \`rounded-2xl\`, \`rounded-3xl\`). Sharp 90-degree corners feel corporate; rounded feels safe and friendly to children.
- Make text easily readable: body text at \`text-lg\` or larger, headings clearly larger than body. Use \`leading-relaxed\` or \`leading-loose\` on body text.
- Use \`gap-4\` / \`gap-6\` / \`gap-8\` and \`p-6\` / \`p-8\` / \`p-10\` rather than tighter spacing. Children's UIs need breathing room.
- Make state changes visible: an unselected option uses \`border-2 border-gray-200\`; a selected option uses \`border-2 border-blue-500 bg-blue-50\` (or the book's accent colour). Always provide both a colour AND a non-colour cue (border thickness, icon, weight change) so the affordance is not colour-only.
- Add a visible focus ring on every interactive element: \`focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300\` (or the book's accent). This is a hard accessibility requirement.
- Give every text-bearing element a unique \`data-id="text-<pageId>-<n>"\` attribute with n higher than any existing data-id on the page. Every visible string belongs to a data-id-bearing element.
- For every image, set \`alt\` to a meaningful description; for decorative SVG/i elements use \`aria-hidden="true"\`.
- For every input or button, give it an accessible name via visible text inside it, or \`aria-label\` if visually the label is detached.
- Prefer semantic HTML inside the section wrapper: \`<h2>\`, \`<p>\`, \`<ul>\`, \`<button>\`, \`<input>\`, \`<label>\`. A custom activity DOES carry exactly one inline grading \`<script>\` (see the custom-section rules), and you wire interaction there with \`addEventListener\` — never with inline \`onclick=\` attributes. If an interaction truly needs a non-native element, give it \`role\`, \`tabindex="0"\`, and keyboard handlers (Enter/Space) so it is operable; a bare \`<div>\` with only a click handler is not acceptable.
- Single-column layouts on mobile; consider \`md:grid md:grid-cols-2\` only when content genuinely benefits from two columns. Crosswords, word searches, and games may use a fixed grid (\`grid-cols-5 gap-1\` etc.).
- Group related controls under an \`aria-labelledby\` heading or a \`<fieldset><legend>\` so screen-reader users hear the grouping.

### Rules — DON'T

- Don't use \`<style>\`, \`<iframe>\`, \`<object>\`, \`<embed>\`, or inline event-handler attributes (\`onclick\`, \`onload\`, etc.). The ONE exception is the single inline \`<script>\` that grades the activity by calling \`window.adtRegisterCustomActivity\` (required — see the custom-section rules); bind all events inside it with \`addEventListener\`.
- Don't pick font families. Use whatever the book styleguide says or fall back to the ADT default. Avoid Inter, Roboto, Arial, and the generic system font stack — they read as "AI default" and disrespect the styleguide's choices.
- Don't use purple-on-white gradient AI clichés or generic SaaS-style cards. The book is for children, not for a startup landing page.
- Don't centre body text by default. Left-align for readability unless the styleguide says otherwise.
- Don't rely on hover-only interactions — children use touch screens. Every hover state must also work on tap/focus.
- Don't make text smaller than \`text-base\` (16px). Don't make body text gray on white at \`text-gray-400\` or lower — contrast must be at least 4.5:1 for body text and 3:1 for large/heading text. \`text-gray-700\` on \`bg-white\` is safe; \`text-gray-400\` is not.
- Don't write microcopy in adult tone or jargon. Speak directly and simply: "Pick the right word" beats "Select the correct lexical item".
- Don't add decorative elements that lack meaning to the activity (random shapes, gradient blobs, abstract noise). Decoration is fine when it ties to the theme (a leaf in a nature notebook, a stamp in a classroom poster) but never when it is filler.

### Concrete pattern: friendly option card

For a tappable option in any custom activity:

\`\`\`html
<label class="flex items-start gap-4 p-5 min-h-11 rounded-2xl border-2 border-gray-200 hover:border-blue-300 focus-within:ring-4 focus-within:ring-blue-200 cursor-pointer transition-colors bg-white">
  <span class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-semibold" aria-hidden="true">
    <i class="fas fa-check"></i>
  </span>
  <span class="flex-1 text-lg leading-relaxed text-gray-800" data-id="text-<pageId>-<n>">Option text goes here.</span>
  <input type="radio" name="<pageId>-q1" data-activity-item="item-1" class="sr-only" aria-label="Option text goes here." />
</label>
\`\`\`

Adapt the colour, icon, and label to the chosen aesthetic direction.

### Concrete pattern: crossword grid (example of a custom activity)

\`\`\`html
<section data-section-type="activity_crossword" data-id="<pageId>_s<index>" role="activity" class="my-8">
  <div class="container mx-auto max-w-3xl p-6 md:p-10 rounded-3xl bg-amber-50 border-2 border-amber-200">
    <h2 class="text-3xl font-bold text-amber-900 mb-2" data-id="text-<pageId>-100">
      <i class="fas fa-puzzle-piece mr-2" aria-hidden="true"></i>Word puzzle
    </h2>
    <p class="text-lg text-amber-800 mb-6" data-id="text-<pageId>-101">Fill in the words from the page.</p>

    <div class="grid grid-cols-7 gap-1 max-w-md mx-auto mb-8" role="grid" aria-label="Crossword grid">
      <!-- one cell per square; .bg-amber-100 + border for letter cells, .bg-amber-900 for blocked cells -->
      <input type="text" maxlength="1" class="w-10 h-10 text-center text-lg font-bold uppercase rounded border border-amber-300 bg-white focus:ring-4 focus:ring-amber-300 focus:outline-none" data-cell="r1c1" data-answer="A" aria-label="Row 1 column 1" />
      <!-- ...more cells... -->
      <div class="w-10 h-10 bg-amber-900 rounded" aria-hidden="true"></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h3 class="text-xl font-semibold text-amber-900 mb-2" data-id="text-<pageId>-110">Across</h3>
        <ol class="space-y-2 text-amber-800">
          <li data-id="text-<pageId>-111"><span class="font-semibold">1.</span> Clue text for 1 across.</li>
        </ol>
      </div>
      <div>
        <h3 class="text-xl font-semibold text-amber-900 mb-2" data-id="text-<pageId>-120">Down</h3>
        <ol class="space-y-2 text-amber-800">
          <li data-id="text-<pageId>-121"><span class="font-semibold">1.</span> Clue text for 1 down.</li>
        </ol>
      </div>
    </div>
  </div>
</section>
\`\`\`

Adapt to the book's chosen aesthetic direction (the amber palette above is the "nature notebook" direction; swap for the styleguide's palette). This snippet shows layout and aesthetics only — a complete custom activity still needs the single inline grading \`<script>\` and the answer attributes (\`data-answer\` on each letter cell here) described in the custom-section rules.

### Answer key for a custom activity

Custom activities ARE graded at runtime — by the inline \`<script>\` you ship, which calls \`window.adtRegisterCustomActivity\` with a \`validate()\` (see the custom-section rules). Encode the correct answers in HTML attributes so they are the single source of truth that both your \`validate()\` and the studio / translation pipelines read:
- Drop targets (drag-and-drop): \`data-correct-items="item-1,item-2"\` on each \`[data-activity-target]\`.
- Per-slot inputs (crossword cells, fill-in): \`data-answer="<expected>"\` on each \`<input>\`.
The server derives \`activityAnswers\` from these automatically, so you normally don't pass it. Pass \`activityAnswers\` explicitly only when there's no natural per-slot attribute, or pass null for genuinely free-form activities (open prompt, sketching exercise).

### Final discipline

Commit to one aesthetic direction per activity. Execute it with precision. Children notice when something feels off — they will reject a section that is visually muddled even if the content is correct. Make the design feel intentional and care-full.`
