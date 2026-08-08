# ThreadRoom · Print Studio

## Recent fix: room code and chat code now always match

Previously the paint-room code and the chat dock's own room code could drift
apart — the chat dock had its own separate "Studio room" code box and its
own cached copy of the last room code, so it could connect to a different
room than the one actually on screen (worst right after joining, or when
typing a code into the chat dock's own room sheet instead of the home
screen box).

That's fixed: there is now exactly one place that decides what room you're
in (the studio's own `roomCode`), and the chat dock always reads it from
there instead of keeping its own guess. Typing a code in either the home
screen's **Join Room** box or the chat dock's own room sheet joins the same
room both ways — design and chat always match.

Also new: the first time you join a room with a profile that's never been
named, the chat dock opens automatically and asks for your display name
right away, instead of leaving you with an auto-generated placeholder like
"Indigo Stitch" until you dig into the profile tab. That name (plus a color
and, optionally, an avatar photo) is what other people in the room see next
to your messages. You can have several saved profiles (NEW PROFILE /
DUPLICATE / SAVE PROFILE in the chat dock's Profile tab) and switch between
them per tab.

A 3D garment customizer — pick a garment, paint/decorate it in real time, and
export it as an image or a `.glb` 3D model. This folder is a plain static
site: three files, no build step, ready to push straight to GitHub Pages.

```
threadroom-print-studio/
├── index.html            the whole app (UI, 3D engine, painting, export, chat)
├── firebase-config.js     ← you fill this in (see below) to turn on real-time rooms
├── storage-shim.js         makes window.storage work outside Claude.ai
└── README.md
```

## 1. Put it on GitHub Pages

1. Create a new GitHub repo and add these files to it (repo root, or a
   `docs/` folder — either works).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → pick
   `main` (and `/` or `/docs`, matching where you put the files) → Save.
3. GitHub gives you a URL like `https://yourname.github.io/your-repo/`.
   That's it — the app is live.

No build tools, no `npm install`, nothing to compile. `index.html` pulls
Three.js and Firebase from public CDNs at load time.

## 2. Turn on real-time multiplayer rooms

**Does it support real-time co-op painting with a shareable join link?**
Yes — that's already built into `index.html` (room codes, live canvas sync,
a players list, and "Copy invite link" buttons that open straight into the
room, no retyping a code). The one thing it needs from you is a place to
store each room's live state, since GitHub Pages itself can't run a server.

That's what `storage-shim.js` + `firebase-config.js` are for: together they
provide a `window.storage.get()/set()` API — the same one this app already
calls — backed by a **free** Firebase Realtime Database project you create
yourself. (The in-app chat dock is separate and needs **no setup at all** —
it already runs over the free public `ntfy.sh` relay.)

### Set up Firebase (about 5 minutes, no credit card)

1. Go to <https://console.firebase.google.com>, sign in, click **Add
   project**. Name it anything (e.g. `threadroom`). You can skip Google
   Analytics.
2. In the new project: **Build → Realtime Database → Create Database**.
   - Pick any region.
   - Start in **test mode** for now (open rules, 30-day expiry) — or paste
     in the tighter rules below right away.
3. **Project settings** (gear icon, top left) → **General** tab → scroll to
   **Your apps** → click the **`</>`** (Web) icon → register an app (nickname
   doesn't matter, skip Firebase Hosting) → it shows you a `firebaseConfig`
   object.
4. Open `firebase-config.js` in this folder and paste those values in:

   ```js
   window.THREADROOM_FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

5. Commit and push. Reload the deployed site — open DevTools console and you
   should see `[ThreadRoom] Multiplayer storage connected`.

These config values are **not secrets** — they just say which Firebase
project to talk to. Access is controlled by the Database Rules below, not by
hiding this file, so it's fine to commit it.

### Recommended Database Rules

Test mode (fully open, but expires in 30 days) is fine for trying things
out. For anything longer-lived, in **Realtime Database → Rules**, use this —
it scopes reads/writes to the `tr_storage` path this app actually uses, and
caps how big a room's saved state can be:

```json
{
  "rules": {
    "tr_storage": {
      "shared": {
        "$key": {
          ".read": true,
          ".write": true,
          ".validate": "newData.val().hasChildren(['key','value','updatedAt']) && newData.child('value').isString() && newData.child('value').val().length < 2000000"
        }
      },
      "private": {
        "$uid": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

This is intentionally simple (no auth) to match how the app works today —
anyone with a room code can read/write that room, which is the point of a
room code. If you want real access control later, add Firebase
Anonymous Auth and gate `.write` on `auth != null`.

### Tuning the real-time latency further

- `LIVE_PUSH_MS` near the top of the multiplayer section in `index.html`
  (search for it) controls how often *your* strokes go out while dragging —
  lower it (e.g. `200`) for snappier sync at the cost of more Firebase writes
  and bandwidth, or raise it if it feels like updates are stepping on each
  other on a slow connection.
- Receiving is already push-based (no interval to tune) once Firebase is
  configured — `window.storage.subscribe(...)` in `storage-shim.js` uses
  Firebase's real-time listener, so there's no polling delay on that side at
  all.
- The biggest remaining source of lag on a slow connection is the size of
  what's sent, not how often: each push is a JPEG snapshot of the whole
  canvas (quality `0.72`, set in `pushRoomState()`), not just the new
  brushstroke. Lowering that JPEG quality, or the canvas resolution (`TEX`),
  trades a bit of visual fidelity for a smaller/faster payload — worth doing
  if you're testing across real-world/mobile connections rather than same-wifi.

### If you skip Firebase

The app still works — garment picking, painting, undo/redo, photo/`.glb`
export, and the chat dock all run with zero setup. You'll just get a toast
saying multiplayer storage isn't available, and rooms won't sync between
people until `firebase-config.js` is filled in.

## 3. How the pieces fit together

- **Join links work already.** "Copy invite link" builds a URL with
  `?room=CODE` on it using the page's own current address, so it's correct
  whether you're on `yourname.github.io/repo/` or a custom domain. Opening
  that link auto-fills the room code and joins automatically — no manual
  step for the other player.
- **Canvas/garment sync** (what everyone is drawing, which garment is
  selected, who's in the room) goes through `window.storage`, i.e. Firebase
  once configured. Once you've filled in `firebase-config.js`, updates use a
  **real-time push subscription** (Firebase's `onValue`), not polling — other
  players' strokes land within roughly a couple hundred milliseconds of
  being sent, not on a fixed poll interval. Your own strokes are broadcast
  out continuously while you drag (every `LIVE_PUSH_MS`, 350ms by default —
  see the comment right above it in `index.html` if you want it snappier or
  lighter) and immediately on stroke-release/undo/redo/clear. If
  `firebase-config.js` isn't filled in, or `window.storage` doesn't offer a
  `subscribe` method for some reason, it automatically falls back to polling
  every 700ms instead — still works, just not push-instant.
- **Chat** (`window.PECHAT` in `index.html`) is fully independent of the
  above — it opens a WebSocket to `ntfy.sh`, a free public pub/sub relay, and
  works the moment the page loads, no config file involved.

## 4. Testing it yourself

Open the deployed URL in two different browsers (or one normal + one
incognito window, so they don't share `localStorage`), pick a garment in
each, hit **Create & Start** in one to get a room code, then paste that code
— or just open the invite link — in the other. Draw in either window; the
other should pick it up within a second or two.
