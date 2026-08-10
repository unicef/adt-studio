# Welcome intro video — export spec

The first onboarding screen (`WelcomeScene`) plays the rendered 3D logo animation,
which then settles into the app icon at the top of the card. It must look right on
**both light and dark** themes.

The current `welcome-logo.mp4` has a **baked light background**, so on dark it briefly
shows a cyan-white plate during playback before settling on the icon. The real fix is a
**transparent (alpha) render**. The player already prefers a WebM and falls back to the
MP4:

```html
<source src="/onboarding/welcome-logo.webm" type="video/webm" />
<source src="/onboarding/welcome-logo.mp4"  type="video/mp4" />
```

Drop a file named exactly **`welcome-logo.webm`** in this folder and it is used
automatically — no code change needed.

## Export requirements

| Item | Requirement |
|------|-------------|
| **Container / codec** | WebM, **VP9** |
| **Pixel format** | **`yuva420p`** — the `a` (alpha plane) is what makes it transparent |
| **Background** | **Fully transparent.** No baked backdrop, page/ground shadow plate, or background glow fill. Any glow must be a real object in the scene so it composites over any color. |
| **Canvas** | **Square, 1024×1024** (source may be larger, e.g. 2048²; it renders small). Center the subject with padding so the rounded-tile mask never clips it. |
| **End frame** | The **last frame must settle exactly on the app-icon pose** — same framing, angle, and scale as [`../logo.png`](../logo.png). The UI freezes on it and it becomes the resting icon. Hold that pose ~0.3s. |
| **Length / motion** | ~3–5s. Ease-out into the icon; no hard cut at the end. |
| **Poster (optional)** | A transparent **`welcome-logo-poster.png`** of the final frame for the `poster` / reduced-motion still. |

## Reference ffmpeg (from a ProRes 4444 / PNG-sequence master with alpha)

```bash
# From a master that already has an alpha channel (e.g. ProRes 4444, or a PNG sequence):
ffmpeg -i master.mov \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 28 -an \
  welcome-logo.webm
```

> Do **not** try to key transparency out of the existing MP4 — the book's pages and
> cover edges are near-white like the background, so any chroma/luma key punches holes
> straight through them. Transparency has to come from the 3D render's alpha channel.
