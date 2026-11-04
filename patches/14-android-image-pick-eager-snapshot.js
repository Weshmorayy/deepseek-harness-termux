#!/usr/bin/env node
/*
 * 14-android-image-pick-eager-snapshot — Termux / android-arm64
 * ============================================================================
 * SYMPTOM
 *   Attaching an image in the DSH Web GUI and pressing send fails with:
 *     "The requested file could not be read, typically due to permission
 *      problems that have occurred after a reference to a file was acquired."
 *   (DOMException name: NotReadableError). Desktop browsers are unaffected.
 *
 * ROOT CAUSE
 *   On Android, <input type="file"> does NOT hand Chrome a real file. The
 *   gallery/Photos app returns a content:// URI carrying only a TEMPORARY
 *   read grant (FLAG_GRANT_READ_URI_PERMISSION) for the app process that
 *   received it, and for some gallery apps the object Chrome receives is a
 *   placeholder that the picker has not finished resolving yet.
 *
 *   DSH keeps that raw File object on the draft descriptor and only reads it
 *   much later, at submit time, inside the background Web Worker:
 *
 *     createDrafts()  ->  browserDraftAttachment(file)   // stores `file`
 *     ...user waits / picks more / edits the prompt...
 *     submit          ->  fileUpload.upload(..., attachment.file, ...)
 *                      ->  worker.postMessage(file) -> xhr.send(file)
 *
 *   By then the grant may have lapsed or the placeholder may still be
 *   unresolved, so the read throws NotReadableError. This is documented
 *   Chromium/gallery behaviour; the accepted workaround is to snapshot the
 *   bytes into an in-memory File immediately after selection, while the grant
 *   is fresh and the Blob is fully readable.
 *     - https://stackoverflow.com/questions/62714319  (crbug.com/1063576)
 *     - https://stackoverflow.com/questions/79667548
 *
 * FIX
 *   Two edits, both in the browser bundle
 *   @deepseek-ai/dsh-client-ui-conversation/lib/client.js:
 *
 *   1. browserDraftAttachment() eagerly reads the picked File with
 *      file.arrayBuffer() into a fresh in-memory File and swaps it onto the
 *      descriptor, retrying with a short backoff so a not-yet-resolved
 *      gallery placeholder still succeeds. The resolved File is exposed as
 *      `attachment.fileReady`.
 *   2. the submit path awaits `attachment.fileReady` (falling back to the
 *      original File if the snapshot never succeeded) before handing the
 *      body to the upload transport.
 *
 *   The descriptor is already registry-owned and already receives late writes
 *   (probeDimensions assigns width/height), so this adds no new invariant.
 *   The background Web Worker transport stays enabled and unchanged.
 *
 * RE-APPLY AFTER EVERY DSH UPGRADE:
 *   node ~/deepseek-harness-termux/patches/14-android-image-pick-eager-snapshot.js
 *   (also invoked from install.sh step 4)
 *
 * REVERT:
 *   cp <file>.pre14.bak <file>   # backup written once, next to the file
 * ============================================================================
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const MARK = 'Termux/android-arm64 image picker eager snapshot'

// ── Edit 1: snapshot the picked bytes immediately ──────────────────────────
const OLD_A = `\t\tfunction browserDraftAttachment(file) {
\t\t\treturn {
\t\t\t\tkind: "image",
\t\t\t\tid: randomUUID(),
\t\t\t\tpreviewUrl: URL.createObjectURL(file),
\t\t\t\tfile
\t\t\t};
\t\t}`

const NEW_A = `\t\tfunction browserDraftAttachment(file) {
\t\t\t/* ${MARK} — see patches/14-android-image-pick-eager-snapshot.js.
\t\t\t * Android galleries hand Chrome a content://-backed placeholder File whose
\t\t\t * temporary read grant can lapse before submit; reading it later throws
\t\t\t * NotReadableError. Snapshot the bytes NOW, retrying briefly in case the
\t\t\t * picker has not finished resolving the placeholder. */
\t\t\tconst attachment = {
\t\t\t\tkind: "image",
\t\t\t\tid: randomUUID(),
\t\t\t\tpreviewUrl: URL.createObjectURL(file),
\t\t\t\tfile
\t\t\t};
\t\t\tif (typeof file?.arrayBuffer === "function") {
\t\t\t\tattachment.fileReady = (async () => {
\t\t\t\t\tconst name = typeof file.name === "string" && file.name !== "" ? file.name : "image";
\t\t\t\t\tconst type = typeof file.type === "string" && file.type !== "" ? file.type : "application/octet-stream";
\t\t\t\t\tlet lastError;
\t\t\t\t\tfor (let attempt = 0; attempt < 6; attempt += 1) {
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\tconst buffer = await file.arrayBuffer();
\t\t\t\t\t\t\tconst snapshot = new File([buffer], name, {
\t\t\t\t\t\t\t\ttype
\t\t\t\t\t\t\t});
\t\t\t\t\t\t\tattachment.file = snapshot;
\t\t\t\t\t\t\treturn snapshot;
\t\t\t\t\t\t} catch (error) {
\t\t\t\t\t\t\tlastError = error;
\t\t\t\t\t\t\tawait new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t\tthrow lastError;
\t\t\t\t})();
\t\t\t\t/* A discarded draft must not raise an unhandled rejection. */
\t\t\t\tattachment.fileReady.catch(() => {});
\t\t\t}
\t\t\treturn attachment;
\t\t}`

// ── Edit 2: submit awaits the snapshot ─────────────────────────────────────
const OLD_B = `\t\t\t\t\t\tconst result = await this.ctx.fileUpload.upload(sessionId, attachment.file, attachment.file.name === "" ? void 0 : attachment.file.name, controller.signal, (progress) => {`

const NEW_B = `\t\t\t\t\t\t/* ${MARK}: upload the in-memory snapshot, not the raw picker File. */
\t\t\t\t\t\tconst uploadFile = attachment.fileReady === void 0 ? attachment.file : await attachment.fileReady.catch(() => attachment.file);
\t\t\t\t\t\tconst result = await this.ctx.fileUpload.upload(sessionId, uploadFile, uploadFile.name === "" ? void 0 : uploadFile.name, controller.signal, (progress) => {`

/** Every copy of the conversation client bundle we might need to patch. */
function findTargets () {
  const home = os.homedir()
  const rel = 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'
  const candidates = [
    '/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/' + rel,
    path.join(home, 'deepseek-harness-termux', rel)
  ]

  // Any profile-scoped install: ~/.dsh/profiles/*/node_modules/.../dsh/...
  const profilesDir = path.join(home, '.dsh/profiles')
  try {
    for (const p of fs.readdirSync(profilesDir)) {
      candidates.push(path.join(profilesDir, p, 'node_modules/@deepseek-ai/dsh', rel))
    }
  } catch { /* no profiles dir */ }

  return [...new Set(candidates)].filter(f => {
    try { return fs.statSync(f).isFile() } catch { return false }
  })
}

let changed = 0
let skipped = 0
let unmatched = 0

for (const file of findTargets()) {
  const src = fs.readFileSync(file, 'utf8')

  if (src.includes(MARK)) {
    console.log(`  = already patched  ${file}`)
    skipped++
    continue
  }

  if (!src.includes(OLD_A) || !src.includes(OLD_B)) {
    console.log(`  ! anchor not found (DSH layout changed?) — leaving untouched  ${file}`)
    unmatched++
    continue
  }

  const bak = `${file}.pre14.bak`
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, src)
  fs.writeFileSync(file, src.replace(OLD_A, NEW_A).replace(OLD_B, NEW_B))
  console.log(`  + patched          ${file}`)
  console.log(`    backup           ${bak}`)
  changed++
}

console.log(`[14-android-image-pick-eager-snapshot] patched=${changed} already=${skipped} unmatched=${unmatched}`)

// Non-fatal: install.sh treats every patch as best-effort.
process.exit(0)
