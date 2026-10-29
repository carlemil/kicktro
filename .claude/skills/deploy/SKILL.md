---
name: deploy
description: Deploy Kicktro — bump the version, write the CHANGELOG.md release notes, build dev-index.html from src/, copy it to index.html (the live production page), commit, tag and push. Invoke as /deploy. Use whenever the user wants to publish/deploy the current build to the live site.
---

# Deploy Kicktro

Promote the current `src/` build to the live production page **as a numbered release**.
`index.html` is the page GitHub Pages serves at `https://kicktro.com/`;
`dev-index.html` is the build's output file (also served at `…/dev-index.html` as a
preview). Deploying copies the fresh build over `index.html`. **There are no git hooks** —
this skill is the only thing that publishes.

Every deploy is a release, so it also **bumps the version and writes its release notes**.
The version lives in exactly one place, `CONFIG.version` in `src/config.js`, and the menu's
footer link reads it — so a released build always names the version whose notes describe it.

Run these steps from the repo root:

## 1. Work out what is being released

Read the commits since the last release so the notes describe the actual changes, not a
guess:

```
git describe --tags --abbrev=0          # last release tag, e.g. v1.1.0 (may not exist yet)
git log <lastTag>..HEAD --oneline --no-merges
```

If there is no tag yet, fall back to the previous deploy commit:
`git log --oneline --grep='^Deploy:' -1` and use commits after it.

**Nothing to release?** If that range is empty **and** `dev-index.html` already matches
`index.html`, tell the user "already up to date, nothing to deploy" and stop — do not bump
the version or write an empty section.

## 2. Choose the version

First check whether the current version has **already been released**:

```
git tag --list "v$(node -p "require('fs').readFileSync('src/config.js','utf8').match(/version:\s*\"([^\"]+)\"/)[1]")"
```

- **No tag** ⇒ `CONFIG.version` is an *unreleased, already-prepared* version: someone bumped
  it and wrote its `CHANGELOG.md` section during development. **Use it as-is** — do not bump
  again, or that version would be skipped and never published. Top up its existing section
  with anything missing and move on to step 4.
- **Tag exists** ⇒ that version is live, so this deploy needs a new number. Bump per semver:

- **patch** — fixes, copy/comment changes, internal refactors. Nothing new in the menu.
- **minor** — a new effect, filter, control, or panel feature. **This is the usual one.**
- **major** — a change that stops an existing saved scene, share link or backup loading
  exactly as it did. Do not pick this without saying so explicitly to the user first; the
  project's standing rule is that every link ever generated keeps working.

If the user named a version (`/deploy 1.4.0`), use theirs. State which version you are
releasing (and, if you bumped, why that level) in your reply.

## 3. Bump the version and write the notes

Skip the bump if step 2 found the current version untagged — it is already the version being
released; just make sure its notes cover everything in the range.

1. Edit `src/config.js`: set `version:` to the new number. **`src/config.js` is the only
   place a version string lives** — never add a second one.
2. Prepend a new section to `CHANGELOG.md`, directly above the previous release's heading,
   matching the existing style:

   ```markdown
   ## [1.2.0] — 2026-08-05

   ### Added
   - ...

   ### Changed
   - ...

   ### Fixed
   - ...

   ### Internal
   - ...
   ```

   - Use today's real date in `YYYY-MM-DD`. Get it from the environment/context, do not
     invent it.
   - Only include the headings that actually have entries.
   - Write for **someone using the app**, not someone reading the diff: name the control or
     box they will see and what it now does. Keep `### Internal` for probes, refactors and
     build changes — real, but not user-facing.
   - Derive the entries from the commit range in step 1, and consolidate: several commits
     fixing one thing are one bullet.

## 4. Build and promote

```
node tools/build.js          # regenerate dev-index.html from src/ (now carrying the version)
cp dev-index.html index.html
```

Run the probes before committing — a release is the wrong moment to ship a red one:

**Every** probe in `tools/`, not a hand-kept subset — this list had drifted five behind the
directory, so `palprobe`, `shareprobe`, `cloudprobe` and `singleprobe` could all have gone red
without a deploy noticing:

```
node tools/build.js --check
node tools/filterprobe.js dev-index.html
node tools/heatprobe.js dev-index.html
node tools/juliaprobe.js dev-index.html
node tools/presetprobe.js dev-index.html
node tools/beatprobe.js dev-index.html
node tools/solidsprobe.js dev-index.html
node tools/palprobe.js dev-index.html
node tools/singleprobe.js dev-index.html
node tools/uiprobe.js dev-index.html
node tools/shareprobe.js dev-index.html
node tools/cloudprobe.js dev-index.html
```

Or in one go, so a new probe is picked up automatically:

```
for f in tools/*probe.js; do node "$f" dev-index.html >/dev/null || echo "RED: $f"; done
```

Then the **startup-time gate**, which no probe can stand in for:

```
bash tools/startup-check.sh dev-index.html
```

It loads the built page headless on the real GPU and fails if the first frame takes more
than 20 seconds of **wall-clock** time. v1.37.0 shipped a shader the driver took 64 seconds
to link at boot — the page looked hung, every probe was green, and the browser checks
passed too, because `--virtual-time-budget` waits through a synchronous stall. Only the
clock on the wall sees a hang.

Then the **browser checks**, which are the only instrument for a whole class of defect: a draw
the driver REJECTS produces no exception, no visible crash and a plausible-looking screenshot —
only a console error. They are deliberately not named `*probe.js` (the glob above runs node
probes; these need a real browser and a real GPU), which is exactly why they have to be listed
here. `tools/world-check.js` was named nowhere for several releases and caught nothing in that
time, despite CLAUDE.md calling it "the gate".

Each prints the `msedge` line to run; every line is PASS/FAIL on stderr.

```
node tools/world-check.js <scratchdir> dev-index.html      # joining/leaving a shared world: 0 console errors
node tools/worldbelow-check.js <scratchdir> dev-index.html # world glass really receives the filtered picture
                                                           # (run BOTH printed lines, NO virtual-time budget;
                                                           #  the negative control must go red)
node tools/worldlink-check.js <scratchdir> dev-index.html  # per-combination world LINK time (slow: minutes)
node tools/flipcheck.js   <scratchdir> dev-index.html      # a Bloom layer lands the same way up as one without
node tools/breakout-check.js <scratchdir> dev-index.html   # break-out box grid, drag, snap, ownership
node tools/brkdrop-check.js  <scratchdir> dev-index.html   # a dropped box never lands off screen
node tools/brkcolumn-check.js <scratchdir> dev-index.html
node tools/corner-check.js   <scratchdir> dev-index.html
node tools/foldcycle-check.js <scratchdir> dev-index.html  # auto-cycle is gated on the editor being hidden
node tools/rndkeep-check.js  <scratchdir> dev-index.html
node tools/tempoui-check.js  <scratchdir> dev-index.html
node tools/tunedim-check.js  <scratchdir> dev-index.html
node tools/author-check.js   <scratchdir> dev-index.html
node tools/gallery-check.js  <scratchdir> dev-index.html  # gallery grid, hover clip, favourites, built-in load
node tools/signin-check.js   <scratchdir> dev-index.html  # Sign in with Apple (nonce) + the first-sign-in name step
node tools/crash-check.js    <scratchdir> dev-index.html  # crash reports + the stopped-page banner (runs itself, ~1 min)
```

If you are short of time, `world-check` and `flipcheck` are the two that guard silent-rendering
defects; the rest guard UI behaviour and fail loudly when run.

`worldlink-check` is the slow one — it links all sixteen world programs and the total is minutes,
not seconds (133.8 s of it is the five-way combination alone). Run it when you have touched
`FS_WORLD`, `glassDE` or anything else `worldMap` can reach; skip it otherwise. It is the only
thing that can see a link-time regression: `worldcompile-check` compiles and deliberately never
links, and `startup-check.sh` cannot help because the world program is built lazily, not at boot.

And the **world-shader compile check** — all sixteen `#if` combinations on the real GPU:

```
node tools/worldcompile-check.js <scratchdir> dev-index.html    # then run the printed msedge line
```

The world shader is really sixteen shaders, one per combination of joined effects, and a
brace that is only unbalanced when a group is *absent* compiles fine in every manual test
that has it present. v1.37.1–1.37.3 shipped with `W_GB=0` unclosed, so every shared world
without a Glass ball failed silently. `worldprobe` has a static brace count that catches
that class; the GPU compile is the complete claim.

If any probe, the gate or the compile check fails, **stop and report it** rather than
deploying.

### Gallery thumbnails

Render whatever has no thumbnail yet — both are no-ops when nothing is missing:

```
node tools/thumbs.js --builtin     # AI-Generated scenes -> thumbs/<slug>.webp|.mp4, re-emits + rebuilds
node tools/thumbs.js --server      # published scenes with none -> uploaded to api.kicktro.com (ssh for the token)
```

`--builtin` changes `thumbs/`, `src/gallery-builtin.js` and `dev-index.html`; if it rendered
anything, run `cp dev-index.html index.html` again and stage `thumbs/ src/gallery-builtin.js`
with the release (pages.yml ships `thumbs/`). `--server` needs no commit — the files live on the
API. Each render is ~9 s on the real GPU; a failure there is not a reason to stop the release,
but say so.

## 5. Commit, tag and push

Stage everything the release touches — the version bump, the notes, and both generated
files:

```
git add src/config.js CHANGELOG.md dev-index.html index.html
```

Commit with the project's standard trailer (from CLAUDE.md — the `Co-Authored-By:` line plus
the `Claude-Session:` line), subject:

```
Release v1.2.0: promote dev-index.html → index.html
```

Then tag and push both the branch and the tag:

```
git tag -a v1.2.0 -m "Kicktro v1.2.0"
git push origin HEAD:main
git push origin v1.2.0
```

The tag is what makes "commits since the last release" computable next time, so do not skip
it. (Rebase on `origin/main` first if the push is rejected as non-fast-forward.)

## 6. Verify

Poll `https://kicktro.com/` until it returns HTTP 200 (~1 min for Pages to
redeploy; hard-refresh bypasses cache). Confirm the deployed page carries the new version —
grep the response for `v<new version>` or for a string you just changed — then tell the user
it is live, with the version number and a one-line summary of the notes.

## Notes

- Never hand-edit `index.html` or `dev-index.html` — both are generated. Edit `src/*.js` /
  `src/styles.css`, then deploy.
- The normal (non-deploy) workflow commits `src/` + `dev-index.html` so the
  `/dev-index.html` preview tracks development; `/deploy` is what moves it to the production
  `index.html` **and** cuts the release.
- `CHANGELOG.md` is linked from the panel footer (`#verlink` → `CONFIG.changelogUrl`), so it
  is user-facing documentation on the live site, not just a repo file. Write it accordingly.
