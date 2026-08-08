/* =============================================================================
   window.storage SHIM — Firebase Realtime Database edition
   -----------------------------------------------------------------------------
   ThreadRoom's own code (index.html) calls:
     await window.storage.get('room:CODE', true)
     await window.storage.set('room:CODE', jsonString, true)
   exactly like it would inside Claude.ai's built-in artifact storage. Nothing
   in index.html needs to know it's now talking to Firebase instead — this
   file just makes window.storage exist and behave the same way once the app
   is hosted on GitHub Pages (or anywhere else that isn't Claude.ai).

   If firebase-config.js still has placeholder values, window.storage is left
   undefined on purpose: the app already checks `if(!window.storage)` before
   every multiplayer call and falls back to solo/local mode with a clear
   toast, instead of silently failing against a Firebase project that doesn't
   exist.
   ============================================================================= */
(function () {
  "use strict";

  var cfg = window.THREADROOM_FIREBASE_CONFIG;
  var looksUnconfigured =
    !cfg ||
    !cfg.apiKey ||
    !cfg.databaseURL ||
    /YOUR_/.test(cfg.apiKey) ||
    /YOUR_/.test(cfg.databaseURL);

  if (looksUnconfigured) {
    console.warn(
      "[ThreadRoom] firebase-config.js hasn't been filled in yet, so real-time " +
      "rooms are disabled. The app will still run in solo mode. See README.md " +
      "to turn on multiplayer (takes about 5 minutes, free)."
    );
    return; // window.storage stays undefined — app already handles this.
  }

  if (!window.firebase || !window.firebase.initializeApp) {
    console.error("[ThreadRoom] Firebase SDK failed to load — check your network/adblocker.");
    return;
  }

  window.firebase.initializeApp(cfg);
  var db = window.firebase.database();

  // Realtime Database keys can't contain '.', '#', '$', '[', ']', or '/'.
  // Encode any of those out of the key so arbitrary app keys are safe to use
  // as a path segment, and decode them back when listing.
  function encodeSegment(key) {
    return String(key).replace(/[.#$\[\]/]/g, function (c) {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    });
  }
  function decodeSegment(seg) {
    return String(seg).replace(/%([0-9A-F]{2})/g, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  // Private (non-shared) data is namespaced per browser via a small anonymous
  // id kept in localStorage — there's no login system in this app.
  function anonId() {
    try {
      var id = localStorage.getItem("tr-storage-anon-id");
      if (!id) {
        id = "u" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("tr-storage-anon-id", id);
      }
      return id;
    } catch (e) {
      return "u-nostorage";
    }
  }

  function refFor(key, shared) {
    var bucket = shared ? "shared" : "private/" + anonId();
    return db.ref("tr_storage/" + bucket + "/" + encodeSegment(key));
  }
  function listRefFor(shared) {
    var bucket = shared ? "shared" : "private/" + anonId();
    return db.ref("tr_storage/" + bucket);
  }

  window.storage = {
    // Resolves to {key, value, shared}. Throws if the key doesn't exist,
    // same as the real Claude.ai artifact storage API — every call site in
    // index.html already wraps this in try/catch and treats a throw as
    // "nothing there yet", which is exactly right for a brand-new room.
    get: function (key, shared) {
      return refFor(key, !!shared)
        .once("value")
        .then(function (snap) {
          if (!snap.exists()) {
            throw new Error("Key not found: " + key);
          }
          var data = snap.val();
          return { key: key, value: data.value, shared: !!shared };
        });
    },

    set: function (key, value, shared) {
      var payload = { key: key, value: value, updatedAt: Date.now() };
      return refFor(key, !!shared)
        .set(payload)
        .then(function () {
          return { key: key, value: value, shared: !!shared };
        })
        .catch(function (err) {
          console.error("[ThreadRoom] storage.set failed:", err);
          return null;
        });
    },

    delete: function (key, shared) {
      return refFor(key, !!shared)
        .remove()
        .then(function () {
          return { key: key, deleted: true, shared: !!shared };
        })
        .catch(function () {
          return null;
        });
    },

    list: function (prefix, shared) {
      return listRefFor(!!shared)
        .once("value")
        .then(function (snap) {
          var keys = [];
          snap.forEach(function (child) {
            var k = decodeSegment(child.key);
            if (!prefix || k.indexOf(prefix) === 0) keys.push(k);
          });
          return { keys: keys, prefix: prefix, shared: !!shared };
        })
        .catch(function () {
          return null;
        });
    },

    // EXTENSION — not part of Claude.ai's own window.storage API, only exists in
    // this Firebase-backed build. ThreadRoom's app code feature-detects this
    // (`typeof window.storage.subscribe === 'function'`) and uses it when present
    // for true real-time updates instead of polling, but still works with plain
    // get()/set() polling if this shim (or something else providing window.storage)
    // doesn't have it. Calls cb({key, value, shared}) every time the value changes,
    // and again immediately with whatever is already there. Returns an unsubscribe
    // function.
    subscribe: function (key, shared, cb) {
      var r = refFor(key, !!shared);
      var handler = function (snap) {
        if (!snap.exists()) return;
        var data = snap.val();
        cb({ key: key, value: data.value, shared: !!shared });
      };
      r.on("value", handler, function (err) {
        console.error("[ThreadRoom] storage.subscribe error:", err);
      });
      return function unsubscribe() {
        r.off("value", handler);
      };
    }
  };

  console.info("[ThreadRoom] Multiplayer storage connected (Firebase Realtime Database).");
})();
