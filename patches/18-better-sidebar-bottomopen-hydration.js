#!/usr/bin/env node
/*
 * 18-better-sidebar-bottomopen-hydration — Termux / android mobile
 * =================================================================
 * SYMPTOM
 *   A persistent ~220px dead space appears below the conversation column on
 *   every fresh page load, even when the bottom workbench has no open tabs.
 *   Patch 17 fixed the keyboard-inset sticking problem (intermittent gap after
 *   typing) but NOT this fresh-load gap.
 *
 * ROOT CAUSE (read from lib/client.js, dsh-better-sidebar v0.26.0)
 *   sanitizeState() (the localStorage hydration function) reads bottomOpen
 *   directly from the persisted record:
 *
 *       const bottomOpen = record.bottomOpen === true;
 *
 *   It then calls pruneEmptyPanes(bottomSplits) which removes leaves with
 *   zero tabs — but bottomOpen is NOT updated to reflect the pruning.
 *   Result: if the user previously had the bottom pane open with tabs, the
 *   tabs were cleared/pruned on reload, bottomOpen remains true and 220px of
 *   --dsh-sidebar-height is set immediately on mount every fresh load.
 *
 * FIX
 *   After bottomSplits is pruned, check whether any leaf still has tabs.
 *   If none do, force bottomOpen=false before returning the hydrated state.
 *
 * TARGET
 *   ~/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js
 *   Function sanitizeState, ~line 582 (v0.26.0)
 *
 * MARKER: [bottomopen-hydration]
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
if (src.includes("[bottomopen-hydration]")) {
  console.log("patch 18: already applied, skipping.");
  process.exit(0);
}

// exact anchor: the closing of sanitizeState's return object
const NEEDLE =
  "\t\t\t\tbottomOpen,\n" +
  "\t\t\t\tbottomHeight,\n" +
  "\t\t\t\tbottomSplits\n" +
  "\t\t\t};\n" +
  "\t\t}\n" +
  "\t\t/** Collapse persisted split panes left empty after ephemeral diff tabs are dropped. */";

if (!src.includes(NEEDLE)) {
  console.error("patch 18: anchor not found — bundle may have changed.");
  process.exit(1);
}

const REPLACEMENT =
  "\t\t\t\t// [bottomopen-hydration] Force bottomOpen false when all tabs were\n" +
  "\t\t\t\t// pruned on reload — otherwise the 220px margin-bottom dead space\n" +
  "\t\t\t\t// appears on every fresh page load even with no visible workbench.\n" +
  "\t\t\t\tbottomOpen: bottomOpen && allLeaves(bottomSplits).some((l) => l.tabs.length > 0),\n" +
  "\t\t\t\tbottomHeight,\n" +
  "\t\t\t\tbottomSplits\n" +
  "\t\t\t};\n" +
  "\t\t}\n" +
  "\t\t/** Collapse persisted split panes left empty after ephemeral diff tabs are dropped. */";

src = src.replace(NEEDLE, REPLACEMENT);

if (!src.includes("[bottomopen-hydration]")) {
  console.error("patch 18: replacement failed.");
  process.exit(1);
}

fs.writeFileSync(target, src, "utf8");
console.log("patch 18: applied — bottomOpen forced false when no tabs survive pruning.");
