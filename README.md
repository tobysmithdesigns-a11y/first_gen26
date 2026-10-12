# Form & Field — Scroll sequence

A responsive canvas experience built from the supplied 240 JPEG frames. Scrolling through the pinned section selects frames in both directions; chapter buttons and a native keyboard-accessible slider offer direct navigation.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

Vite outputs the static site to `dist/`. No credentials, external font requests, or backend services are required. Fonts are bundled locally through Fontsource.

## Standalone preview

```sh
npm run build
npm run export:preview
```

Open `dist/standalone.html` directly in a browser. This file embeds all 240 frames, fonts, styles, and scripts and works offline without a server. An optional output path can be passed after `--`.

## Hosted preview

The manual `Publish scroll preview` GitHub Actions workflow builds the site for the `/first_gen26/` project path and deploys to GitHub Pages. It does not publish automatically on push. Publishing requires the project files in the GitHub repository, Pages configured to use GitHub Actions, and running that workflow. A Pages deployment makes the website publicly viewable. The cloud onboarding interface itself does not expose a live website preview or downloadable workspace files.

## Sequence implementation

- Original image order is preserved in `public/frames/frame-001.jpg` through `frame-240.jpg`.
- Scroll position maps to frames 1–240 over a 460vh section.
- A sticky canvas draws fitted images without cropping, with a pixel ratio capped at 2.
- Four image requests run concurrently; a sliding cache retains at most 32 decoded frames.
- Resize, reverse scrolling, direct navigation, frame load failures, and reduced-motion preferences are handled.
- Motion is controlled by the user; nothing autoplays. Reduced motion disables animated scrolling from chapter and replay buttons.

## Verification

```sh
npm run test:smoke
```

The smoke test requires Chromium, plus the dev server running on port 5173 (override with `TEST_URL`). It uses the cloud machine's `/usr/bin/chromium` when available, or Playwright's browser installed with `npx playwright install chromium`. Set `CHROMIUM_PATH` to use another installation. It checks actual canvas rendering, forward/backward frame selection, slider keyboard input, chapter navigation, the about dialog, replay, mobile overflow, and image failure recovery.
