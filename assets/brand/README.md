# Brand assets

Four SVGs, one mark. Everything a browser or an app store shows for
match.build is drawn here and nowhere else — edit these files, then run:

```bash
pnpm build:icons
```

which copies the SVG favicons and renders the PNG sizes into each app's static
directory. Nothing under `apps/*/public/` is hand-edited.

| File | What it is |
| --- | --- |
| `mark.svg` | The mark alone, in `currentColor`, transparent. Inline it (a React component, an `<svg>` in markup) so it takes the colour around it — loaded through `<img>` it has no colour to inherit and renders black. |
| `icon.svg` | The app tile: cream mark on brand wine, rounded. The favicon and the source of every PNG icon. |
| `icon-maskable.svg` | Full-bleed tile with the mark pulled into the central 80%, for Android's `purpose: "maskable"` crop. |
| `icon-admin.svg` | The same mark on graphite, for the platform admin app, so its tab never reads as the candidate app. |

## The mark

Two circles of equal radius, overlapping, with the ground they share filled in:
a match is what two people have in common. It is drawn in a 64×64 box with a
stroke of 5, which is the lightest weight that still holds together at 16px.

Colours are the design tokens, as hex because a standalone SVG cannot read CSS
variables: wine `#8f2239` (`--primary`) and cream `#fcf9f5` (`--background`),
graphite `#3a2b2e` (`--foreground`) for admin. If a token moves, move it here
too — these four files are the only place in the repo that hardcodes them.

## PNGs, and why any exist

SVG is the favicon everywhere it is allowed. PNG is generated only where a
platform refuses an SVG: the two PWA manifests (Android wants raster, and a
separate maskable icon) and `apple-touch-icon`, which iOS has never read as
SVG. `scripts/build-icons.mjs` lists exactly which size lands where.
