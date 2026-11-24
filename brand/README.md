# Tabaa brand assets

Tabaa (طابع) is the word for the stamp pressed on a Moroccan invoice. The mark is its first letter, ط, drawn as two round-capped strokes.

| File | Use |
| --- | --- |
| `source/tabaa-mark.svg` | Bare mark, ink on light backgrounds |
| `source/tabaa-icon.svg` | White mark on the ink tile: app icon, favicon |
| `source/tabaa-logo-animation.json` | Lottie loader: a 35% segment travels each stroke once in 2 s (120 frames at 60 fps) over a faint full mark |

Ink `#2B3FD6`, paper `#F5F6F8`, night `#0E1428`. The wordmark is Bricolage Grotesque 700; in Arabic, IBM Plex Sans Arabic 600.

The web app reproduces the loader in SVG and CSS (`apps/web/src/components/ui/brand.tsx`) with the same values, so no player is shipped. Reduced-motion settings show the static mark.

Use one solid colour. Keep clear space of one stroke width around the mark. Do not stretch, rotate or mirror it.
