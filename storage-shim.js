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

   Also used for:
     - room:CODE          full canvas snapshot + players + photo placement list
     - photoasset:CODE:id high-quality photo bytes for multi-user image stamps
     - drawev:CODE:ts:id  fallback draw/photo events when the live channel lags
   ============================================================================= */
(function () {
  "use strict";

  var cfg = window.THREADROOM_FIREBASE_CONFIG;
  var looksUnconfigured =
    !cfg ||
    !cfg.apiKey ||
    !cfg.databaseURL ||
    /YOUR_/.test(String(cfg.apiKey)) ||
    /YOUR_/.test(String(cfg.databaseURL));

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

  // Idempotent init (safe if the page is hot-reloaded or scripts run twice)
  try {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(cfg);
    }
  } catch (e) {
    console.error("[ThreadRoom] Firebase initializeApp failed:", e);
    return;
  }

  var db = window.firebase.database();

  // Keep under the Database Rules string length cap (see README). Room snapshots
  // and photo assets must fit; the app encodes JPEGs to stay under this.
  var MAX_VALUE_CHARS = 1900000;

  // Realtime Database keys can't contain '.', '#', '$', '[', ']', or '/'.
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

  function withRetry(fn, attempts) {
    attempts = attempts || 3;
    return fn().catch(function (err) {
      if (attempts <= 1) throw err;
      return new Promise(function (resolve) {
        setTimeout(resolve, 120 + Math.random() * 200);
      }).then(function () {
        return withRetry(fn, attempts - 1);
      });
    });
  }

  window.storage = {
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
      var str = typeof value === "string" ? value : JSON.stringify(value);
      if (str.length > MAX_VALUE_CHARS) {
        console.warn(
          "[ThreadRoom] storage.set truncated: key=" +
            key +
            " length=" +
            str.length +
            " (max " +
            MAX_VALUE_CHARS +
            ")"
        );
        // Prefer failing loudly for room snapshots so the app can fall back to
        // photo stamp events / lower quality rather than writing a corrupt partial.
        if (String(key).indexOf("room:") === 0) {
          return Promise.resolve(null);
        }
        str = str.slice(0, MAX_VALUE_CHARS);
      }
      var payload = { key: key, value: str, updatedAt: Date.now() };
      return withRetry(function () {
        return refFor(key, !!shared).set(payload);
      })
        .then(function () {
          return { key: key, value: str, shared: !!shared };
        })
        .catch(function (err) {
          console.error("[ThreadRoom] storage.set failed:", key, err && err.message ? err.message : err);
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

    // Real-time push subscription (Firebase onValue). Returns unsubscribe fn.
    subscribe: function (key, shared, cb) {
      var r = refFor(key, !!shared);
      var handler = function (snap) {
        if (!snap.exists()) return;
        var data = snap.val();
        try {
          cb({ key: key, value: data.value, shared: !!shared });
        } catch (e) {
          console.error("[ThreadRoom] storage.subscribe callback error:", e);
        }
      };
      r.on("value", handler, function (err) {
        console.error("[ThreadRoom] storage.subscribe error:", err);
      });
      return function unsubscribe() {
        r.off("value", handler);
      };
    }
  };

  // Expose a tiny status helper so the app / console can confirm connectivity
  window.THREADROOM_STORAGE_READY = true;
  window.THREADROOM_STORAGE_PROJECT = cfg.projectId || "(unknown)";

  console.info(
    "[ThreadRoom] Multiplayer storage connected (Firebase RTDB · project " +
      (cfg.projectId || "?") +
      ")."
  );
})();
