# Changelog

Standalone repository since 2026-09-26 — split out of
[Jovan1666/commandcode-usage](https://github.com/Jovan1666/commandcode-usage), and from here on
`src/cc-usage.mjs` is maintained in this repository. The entries below are the ones that apply
to it, newest first.

> The script also carries its own version line (`--help` prints it). That one came along with
> the implementation and is not the same track as the dated release entries below.

## 1.0.1 — 2026-09-24

- **The monthly amount on the status line is labelled.** `月 ██▏ 18% 剩$57.60` — the bar is what
  has been used and the figure is what is left, so the figure needed a word in front of it.
  The sidebar renders that same line, segment by segment, so it shows the label too.
- **Quota snapshots refresh every three minutes instead of every minute** (`cacheTtl` 60s → 180s).
  The old default equalled the refresh interval most hosts use, and this adapter's sidebar ticks
  every 60 seconds: every tick started a background process and made four API calls — for a number
  that cannot visibly move in three minutes. Pass `--cache-ttl 60` to restore the old cadence.

## 1.0.0 — 2026-09-21

First release.

- Reads Command Code plan usage: rolling 5-hour and weekly windows, monthly credits,
  reset times. Caps come from the API; a local plan table is only a fallback.
- Credential discovery in five steps, from explicit env vars through the provider routes
  the user already configured in the host.
- Disk snapshot with background refresh: the first call is a live read, later calls answer in
  ~90 ms from the snapshot and refresh behind it.
- Can decide **per turn** whether the session is actually routed to Command Code — from the
  local router's own env mapping, or the model the host hands over. Not in Command Code's public
  model catalog → the status line hides itself. The sidebar does not use this path: an opencode
  TUI plugin gets no per-turn model, so the adapter runs the script with `--always` and the
  section simply stays put.
- Fails quietly: no credential, no API access, offline, or a rejected key all render nothing
  rather than an error. A failed fetch backs off for five minutes.
- Runs as a CLI or imports as a library (`fetchView()`, `resolveCredentials()`, `normalize()`).

**opencode adapter**

| Surface | Notes |
|---|---|
| TUI sidebar section | plain JS, no build step — it builds elements through the host's own runtime |

- The plugin ignores `process.execPath` and looks for a real `node` on `PATH` first. opencode is
  a single Bun-compiled binary, so `execPath` points at opencode itself: using it would start
  opencode recursively and fail, silently, forever.
- `scripts/setup.mjs` registers the plugin by absolute `file://` URL in
  `~/.config/opencode/tui.json`, idempotently, with `--print` and `--remove`.

**Deliberate omissions**

- **No pacing warning on the always-on surfaces.** The projection is in `--json`, and the panels
  you ask for (`--compact`, `--md`, `--html`, the terminal view) still print it — it is only kept
  out of the sidebar and the status line. Extrapolating from a short sample reports "you will run
  out" almost every time, and a warning that is always on is not a warning.
- **No web panel as the default surface.** The sidebar is the primary path; `--html` still exists
  for the occasional big-picture look, but nothing points you at a browser tab — checking one is
  no better than the vendor's own dashboard.
