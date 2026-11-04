#!/usr/bin/env node
/*
 * 13-fetch-blob-mtime-tolerance — Termux / android-arm64
 * ============================================================================
 * SYMPTOM
 *   Sending an image/file attachment in the DSH Web GUI fails with:
 *     "The requested file could not be read, typically due to permission
 *      problems that have occurred after a reference to a file was acquired."
 *   (DOMException name: NotReadableError)
 *
 * ROOT CAUSE
 *   fetch-blob's BlobDataItem.stream() re-stats the backing file and throws
 *   whenever the file's mtime is even 1 ms NEWER than the `lastModified`
 *   captured when the Blob object was created:
 *
 *     const { mtimeMs } = await stat(this.#path)
 *     if (mtimeMs > this.lastModified) throw new DOMException(..., 'NotReadableError')
 *
 *   This is a TOCTOU guard, but it is far too strict for Android:
 *     - Android filesystems / the FUSE layer can report timestamps with
 *       coarser granularity than the value JS recorded on the Node side.
 *     - The attachment staging step (copy/rename into the staging dir) can
 *       touch mtime after the Blob reference was acquired.
 *   Result: a perfectly readable file is rejected and the attachment fails.
 *
 * FIX
 *   Keep the guard but allow a bounded drift window (default 5000 ms) before
 *   treating the file as replaced. A genuinely stale reference (file swapped
 *   long after the Blob was created) still throws, so the integrity guarantee
 *   is preserved; timestamp jitter no longer is.
 *   Override the window with FETCH_BLOB_MTIME_TOLERANCE_MS.
 *
 * RE-APPLY AFTER EVERY DSH UPGRADE:
 *   node ~/deepseek-harness-termux/patches/13-fetch-blob-mtime-tolerance.js
 *   (also invoked from install.sh step 4)
 *
 * REVERT:
 *   cp <file>.pre13.bak <file>   # backups are written once, next to the file
 * ============================================================================
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const MARK = '[Termux/android-arm64] fetch-blob mtime tolerance'
const TOLERANCE_MS = process.env.FETCH_BLOB_MTIME_TOLERANCE_MS || '5000'

const OLD = `    const { mtimeMs } = await stat(this.#path)
    if (mtimeMs > this.lastModified) {
      throw new DOMException('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError')
    }`

const NEW = `    // ${MARK} — see patches/13-fetch-blob-mtime-tolerance.js
    // Android timestamp granularity / staging-copy mtime bumps made this
    // TOCTOU guard fire on perfectly readable files. Allow bounded drift;
    // a file genuinely swapped long after the reference still throws.
    const { mtimeMs } = await stat(this.#path)
    const mtimeToleranceMs = Number(process.env.FETCH_BLOB_MTIME_TOLERANCE_MS ?? ${TOLERANCE_MS})
    if (mtimeMs > this.lastModified + mtimeToleranceMs) {
      throw new DOMException('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError')
    }`

/** Collect every fetch-blob/from.js we care about, without a deep walk. */
function findTargets () {
  const home = os.homedir()
  const candidates = [
    // Global DSH install (the only tree that actually ships fetch-blob here).
    '/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/fetch-blob/from.js',
    path.join(home, 'deepseek-harness-termux/node_modules/fetch-blob/from.js')
  ]

  // Any profile-scoped install: ~/.dsh/profiles/*/node_modules/fetch-blob/from.js
  const profilesDir = path.join(home, '.dsh/profiles')
  try {
    for (const p of fs.readdirSync(profilesDir)) {
      candidates.push(path.join(profilesDir, p, 'node_modules/fetch-blob/from.js'))
    }
  } catch { /* no profiles dir */ }

  // Also scan each profile's own nested @deepseek-ai/dsh if present.
  try {
    for (const p of fs.readdirSync(profilesDir)) {
      candidates.push(path.join(
        profilesDir, p, 'node_modules/@deepseek-ai/dsh/node_modules/fetch-blob/from.js'
      ))
    }
  } catch { /* ignore */ }

  return [...new Set(candidates)].filter(f => {
    try { return fs.statSync(f).isFile() } catch { return false }
  })
}

let changed = 0
let skipped = 0
let missing = 0

for (const file of findTargets()) {
  const src = fs.readFileSync(file, 'utf8')

  if (src.includes(MARK)) {
    console.log(`  = already patched  ${file}`)
    skipped++
    continue
  }

  if (!src.includes(OLD)) {
    console.log(`  ! pattern not found, leaving untouched  ${file}`)
    missing++
    continue
  }

  const bak = `${file}.pre13.bak`
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, src)
  fs.writeFileSync(file, src.replace(OLD, NEW))
  console.log(`  + patched          ${file}`)
  console.log(`    backup           ${bak}`)
  changed++
}

console.log(
  `[13-fetch-blob-mtime-tolerance] patched=${changed} already=${skipped} ` +
  `unmatched=${missing} tolerance=${TOLERANCE_MS}ms`
)

// Non-fatal: install.sh treats every patch as best-effort.
process.exit(0)
