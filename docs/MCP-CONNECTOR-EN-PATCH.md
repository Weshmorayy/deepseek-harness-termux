# dsh-mcp-connector — English UI Patch

## Problem
`dsh-mcp-connector` (third-party, duhu2000) ships all user-facing strings in
Chinese, hardcoded in `lib/client.js` and `lib/catalog.js`. There is no locale
or language config anywhere in the plugin (audited 2026-10-15, v0.2.73).

## What this patch does
Translates the **visible UI strings** to English via exact string replacement
(longest-first, `${...}` interpolations preserved):

| File | Strings translated | Content |
|---|---|---|
| `lib/client.js` | 84 | sidebar entry, settings panel, update/rollback flow, toasts |
| `lib/catalog.js` | 21 | server-side validation/error messages |
| `lib/status-events.js`, `lib/web.js` | 0 | Chinese there is code comments only (invisible) |

JSDoc comments are left in Chinese on purpose — users never see them.

## Files
- Patch script (re-runnable, idempotent):
  `~/deepseek-harness-termux/patches/mcp-connector-en-patch.js`
- Pristine backups: `.../node_modules/dsh-mcp-connector/lib/client.js.en.bak`
  and `lib/catalog.js.en.bak`

## Re-apply after a plugin update (the update wipes the translation)
```bash
rm ~/.dsh/profiles/web/node_modules/dsh-mcp-connector/lib/*.en.bak   # stale backup of old version
node ~/deepseek-harness-termux/patches/mcp-connector-en-patch.js
node --check ~/.dsh/profiles/web/node_modules/dsh-mcp-connector/lib/client.js
```
If new Chinese strings appear in a future version, they will be reported as
"unmatched" — add them to the map in the patch script.

## Revert
```bash
cd ~/.dsh/profiles/web/node_modules/dsh-mcp-connector/lib
cp client.js.en.bak client.js && cp catalog.js.en.bak catalog.js
```

## Long-term
The right fix is upstream i18n — file an issue on
`github.com/duhu2000/dsh-mcp-connector` asking for an English locale or
`DSH_LANG` support; then this patch can be retired.
