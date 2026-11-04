# Composer pushed below the viewport / phantom scroll space — fix

**Symptom.** In the DSH web UI the composer (message input) sits below the
fold; scrolling up shows empty space before the conversation. Happens on
Android Chrome where collapsing/expanding the URL bar changes `innerHeight`.

**Root cause (verified in installed bundle, dsh-better-sidebar 0.26.0).**
The plugin's "layout push" writes a persisted `--dsh-sidebar-height` CSS
variable on `<html>` and applies `margin-bottom` to the conversation column.
If the persisted dock height was captured on a *taller* viewport (URL bar
collapsed), the stale value exceeds the current viewport → composer pushed
below the fold. Upstream history: PR #310 ("composer below viewport"),
issue #835 open on 0.2.0-rc.2. Ruled out: dsh-web-mobile 3.1.0,
`dsh.workspace.view.v5` (verified in source).

**Fix (one-shot, verified working 2026-10-15).**
Append `?dsh-sidebar-reset` to your token URL once, open it, then reload the
clean URL. The plugin clears its persisted layout state and recomputes from
the live viewport. Alternatively just collapse the bottom dock.

**If it recurs:** same reset. Persistent recurrence → file upstream with the
viewport-change repro; do NOT reinstall the plugin (state persists in
workspace storage).
