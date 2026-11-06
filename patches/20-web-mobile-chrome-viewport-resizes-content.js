#!/usr/bin/env node
/*
 * 20-web-mobile-chrome-viewport-resizes-content — Termux / Android mobile
 * ========================================================================
 * SYMPTOM
 *   On Chrome for Android, a massive ~1000px black void appears below the
 *   conversation/composer, and scrolling scrolls the entire app window up
 *   into the void. On Firefox for Android (GeckoView), the issue does NOT
 *   occur.
 *
 * ROOT CAUSE:
 *   Chromium on Android defaults to `interactive-widget=resizes-visual` when
 *   not specified. Under `resizes-visual`, the virtual keyboard and URL bar
 *   collapse the visual viewport but NOT the layout viewport. When fixed/sticky
 *   elements move or the keyboard retracts, Chromium fails to reset layout
 *   bounds and allows `document.scrollingElement` (body/html) to scroll
 *   freely past the container. Firefox Android defaults to resizing content,
 *   which is why Firefox never experienced the dead space.
 *
 * FIX:
 *   1. In `dsh-web-frontend/dist/index.html` and `dsh-web-mobile/lib/client.js`:
 *      Set viewport meta content to:
 *      `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`
 *   2. In `dsh-web-mobile` BASE_CSS:
 *      Lock `html, body, #root` with `overflow: hidden !important`,
 *      `overscroll-behavior: none !important`, and `height: 100dvh !important`.
 *   3. In `dsh-web-mobile` client runtime:
 *      Add passive scroll listener that keeps `window.scrollTo(0, 0)` so the
 *      page window can never scroll into a black void.
 *
 * MARKER: [chrome-viewport-resizes-content]
 */

"use strict";
const fs = require("fs");
const path = require("path");

// 1. Patch dsh-web-frontend/dist/index.html
const htmlPath = "/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html";
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, "utf8");
  if (!html.includes("interactive-widget=resizes-content")) {
    html = html.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />'
    );
    fs.writeFileSync(htmlPath, html, "utf8");
    console.log("patch 20: index.html viewport meta updated with interactive-widget=resizes-content.");
  }
}

// 2. Patch dsh-web-mobile/lib/client.js
const mobilePath = path.join(
  process.env.HOME,
  ".dsh/profiles/web/node_modules/dsh-web-mobile/lib/client.js"
);

if (fs.existsSync(mobilePath)) {
  let src = fs.readFileSync(mobilePath, "utf8");
  if (src.includes("[chrome-viewport-resizes-content]")) {
    console.log("patch 20: dsh-web-mobile already patched, skipping.");
    process.exit(0);
  }

  // A. Update VIEWPORT_CONTENT
  const metaNeedle = "const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover';";
  const metaReplace = "const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';";
  if (src.includes(metaNeedle)) {
    src = src.replace(metaNeedle, metaReplace);
  }

  // B. Add html/body/root lock CSS to BASE_CSS
  const baseCssNeedle = "exports.BASE_CSS = `\n/* ---------- base control styles";
  const baseCssReplace = "exports.BASE_CSS = `\n/* [chrome-viewport-resizes-content] Lock document scrolling on mobile Chrome */\nhtml, body {\n  height: 100% !important;\n  height: 100dvh !important;\n  max-height: 100dvh !important;\n  overflow: hidden !important;\n  overscroll-behavior: none !important;\n}\n#root {\n  height: 100% !important;\n  height: 100dvh !important;\n  max-height: 100dvh !important;\n  overflow: hidden !important;\n}\n\n/* ---------- base control styles";
  if (src.includes(baseCssNeedle)) {
    src = src.replace(baseCssNeedle, baseCssReplace);
  }

  // C. Add window scroll clamp in phone-chrome runtime
  const scrollLockHook = "syncStableViewport();\n";
  const scrollLockReplace = "syncStableViewport();\n    // [chrome-viewport-resizes-content] Prevent window scrolling on Chrome Android\n    window.addEventListener('scroll', () => { if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0); }, { passive: true });\n";
  if (src.includes(scrollLockHook)) {
    src = src.replace(scrollLockHook, scrollLockReplace);
  }

  // Marker tag
  src = "// [chrome-viewport-resizes-content]\n" + src;
  fs.writeFileSync(mobilePath, src, "utf8");
  console.log("patch 20: dsh-web-mobile patched successfully.");
}
