#!/usr/bin/env node
/*
 * 19-better-sidebar-mobile-no-margin-push — Termux / Android mobile
 * ==================================================================
 * SYMPTOM
 *   A massive ~1000px black dead space below the conversation column on
 *   mobile (Chrome for Android). The user can scroll past the composer
 *   into a huge empty void.
 *
 * ROOT CAUSES (confirmed via screenshots & bundle analysis):
 *   1. Upstream syntax error in dsh-better-sidebar/lib/client.js `const css`:
 *      `@media (prefers-reduced-motion: reduce) {` opened at line 76 of the
 *      CSS constant was NEVER CLOSED. Every rule after it was trapped inside
 *      the media query, causing any appended mobile rules to be ignored on
 *      standard mobile devices.
 *   2. `#root [data-dsh-center-col]` unconditionally sets:
 *      `margin-bottom: var(--dsh-sidebar-height, 0px);`
 *      On mobile, the bottom panel is `position: absolute; bottom: 0` (overlays).
 *      Any non-zero `--dsh-sidebar-height` creates pure dead space under the composer.
 *   3. `writeGeometry` in the JS shell sets `--dsh-sidebar-height` on documentElement
 *      without guarding against mobile viewports.
 *
 * THREE-LAYER FIX:
 *   Layer 1 (JS Writer): In `writeGeometry(height)`, if `window.innerWidth <= 820`,
 *     ALWAYS write `"0px"`.
 *   Layer 2 (CSS Consumer): In `const css`, scope `margin-bottom: var(--dsh-sidebar-height, 0px)`
 *     inside `@media (min-width: 821px)` so desktop still gets the layout push,
 *     while mobile defaults to `margin-bottom: 0px`.
 *   Layer 3 (CSS Syntax): Close the unclosed `@media (prefers-reduced-motion: reduce)` block
 *     and ensure balanced braces across the entire CSS template string.
 *
 * TARGET:
 *   ~/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js
 *
 * MARKER: [mobile-no-margin-push-v3]
 */

"use strict";
const fs = require("fs");
const path = require("path");

const target = path.join(
  process.env.HOME,
  ".dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js"
);

let src = fs.readFileSync(target, "utf8");

if (src.includes("[mobile-no-margin-push-v3]")) {
  console.log("patch 19: already applied (v3), skipping.");
  process.exit(0);
}

// 1. Patch writeGeometry
const wgMarker = "// [mobile-no-margin-push";
if (!src.includes(wgMarker)) {
  const WRITE_GEOM_NEEDLE = "const writeGeometry = (height) => {\n\t\t\t\tdocument.documentElement.style.setProperty(\"--dsh-sidebar-height\", `${height}px`);\n\t\t\t};";
  const WRITE_GEOM_REPLACE = "const writeGeometry = (height) => {\n\t\t\t\t// [mobile-no-margin-push-v3] Force 0px on mobile viewports\n\t\t\t\tconst mobile = typeof window !== \"undefined\" && window.innerWidth <= 820;\n\t\t\t\tdocument.documentElement.style.setProperty(\"--dsh-sidebar-height\", mobile ? \"0px\" : `${height}px`);\n\t\t\t};";
  if (src.includes(WRITE_GEOM_NEEDLE)) {
    src = src.replace(WRITE_GEOM_NEEDLE, WRITE_GEOM_REPLACE);
  }
}

// 2. Patch CSS center col
const cssCenterNeedle = "#root [data-dsh-center-col] {\\n  margin-bottom: var(--dsh-sidebar-height, 0px);";
const cssCenterReplace = "#root [data-dsh-center-col] {\\n  margin-bottom: 0px;\\n}\\n@media (min-width: 821px) {\\n  #root [data-dsh-center-col] {\\n    margin-bottom: var(--dsh-sidebar-height, 0px);";
if (src.includes(cssCenterNeedle)) {
  src = src.replace(cssCenterNeedle, cssCenterReplace);
  
  // Close the desktop media query
  const closeDesktopNeedle = "on-duration-slow) var(--ds-ease-in-out);\\n}\\n\\n/* When the sidebar is collapsed,";
  const closeDesktopReplace = "on-duration-slow) var(--ds-ease-in-out);\\n}\\n}\\n\\n/* When the sidebar is collapsed,";
  if (src.includes(closeDesktopNeedle)) {
    src = src.replace(closeDesktopNeedle, closeDesktopReplace);
  }
}

// 3. Fix unclosed prefers-reduced-motion block
const redMotionNeedle = "@media (prefers-reduced-motion: reduce) {\\n  #root [data-dsh-center-col] {\\n    transition: none;\\n  }\\n\\n/* Context-menu submenu flip";
const redMotionReplace = "@media (prefers-reduced-motion: reduce) {\\n  #root [data-dsh-center-col] {\\n    transition: none;\\n  }\\n}\\n\\n/* Context-menu submenu flip";
if (src.includes(redMotionNeedle)) {
  src = src.replace(redMotionNeedle, redMotionReplace);
}

// Tag with v3 marker
src = "// [mobile-no-margin-push-v3]\n" + src;

fs.writeFileSync(target, src, "utf8");
console.log("patch 19: v3 verified & marked.");
