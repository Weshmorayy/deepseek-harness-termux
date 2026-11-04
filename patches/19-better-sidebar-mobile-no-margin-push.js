#!/usr/bin/env node
/*
 * 19-better-sidebar-mobile-no-margin-push — Termux / Android mobile
 * ==================================================================
 * SYMPTOM
 *   Persistent dead space below the conversation on mobile. Patches 17+18
 *   fix specific triggers (stale keyboardInset, bad hydration) but cannot
 *   fix the gap when bottomOpen is legitimately true with an open tab.
 *
 * ROOT CAUSE
 *   The CSS constant injected by better-sidebar includes:
 *
 *       #root [data-dsh-center-col] {
 *         margin-bottom: var(--dsh-sidebar-height, 0px);
 *       }
 *
 *   On desktop this reserves space for the in-flow workbench. On mobile the
 *   bottomPanel is position:absolute (overlays), so this margin is wasted
 *   dead space no matter what --dsh-sidebar-height says.
 *
 * FIX
 *   Append a @media (max-width:820px) block to the CSS constant that resets
 *   margin-bottom:0 on the center column unconditionally on narrow viewports.
 *   The bottom panel (position:absolute;bottom:0) will still overlay correctly.
 *
 * TARGET
 *   ~/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js
 *
 * MARKER: [mobile-no-margin-push]
 */

"use strict";
const fs   = require("fs");
const path = require("path");

const target = path.join(
  process.env.HOME,
  ".dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js"
);

let src = fs.readFileSync(target, "utf8");

// idempotency guard
if (src.includes("[mobile-no-margin-push]")) {
  console.log("patch 19: already applied, skipping.");
  process.exit(0);
}

// Strategy: find the `const css = "..."` block and append our CSS before the closing `";`
// The css const ends with \n"; followed by \n\t\tconst
// We locate the boundary by finding 'const css = "' then the matching close
const cssStart = src.indexOf('const css = "');
if (cssStart < 0) {
  console.error("patch 19: `const css = \"` not found.");
  process.exit(1);
}

// Find the end: look for `";\n` after the start (the escaped quote + semicolon + newline)
// In the raw JS file this appears as: "\"; followed by newline then whitespace + const
const cssEnd = src.indexOf('";\n', cssStart + 20);
if (cssEnd < 0) {
  console.error("patch 19: could not find end of css constant.");
  process.exit(1);
}

// Verify we're in the right place (should end with the submenu rule)
const tail = src.slice(cssEnd - 60, cssEnd + 5);
if (!tail.includes("right: -4px")) {
  console.error("patch 19: unexpected css constant end, aborting. tail:", JSON.stringify(tail));
  process.exit(1);
}

// The CSS to append (escaped for embedding in a JS string literal)
const APPEND =
  "\\n/* [mobile-no-margin-push] On narrow viewports the bottom workbench is\\n" +
  " * position:absolute and overlays the conversation. Force margin-bottom:0\\n" +
  " * so --dsh-sidebar-height has no effect on mobile and no dead space appears. */\\n" +
  "@media (max-width: 820px) {\\n" +
  "  #root [data-dsh-center-col] {\\n" +
  "    margin-bottom: 0 !important;\\n" +
  "  }\\n" +
  "}\\n";

// Insert APPEND just before the closing `";`
src = src.slice(0, cssEnd) + APPEND + src.slice(cssEnd);

if (!src.includes("[mobile-no-margin-push]")) {
  console.error("patch 19: insertion failed — marker not found after edit.");
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("patch 19: applied — @media ≤820px margin-bottom:0 override added to CSS constant.");
