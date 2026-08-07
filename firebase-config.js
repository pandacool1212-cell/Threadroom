/* =============================================================================
   FIREBASE CONFIG — fill this in with YOUR OWN free Firebase project.
   -----------------------------------------------------------------------------
   This is what makes real-time multiplayer (rooms, live drawing sync, invite
   links) work once this app is hosted on GitHub Pages instead of inside
   Claude.ai. See README.md for the full 5-minute setup walkthrough.

   Quick version:
     1. https://console.firebase.google.com  →  Add project (free "Spark" plan
        is enough, no credit card needed).
     2. In the new project: Build → Realtime Database → Create Database
        → start in TEST MODE (or use the rules in README.md).
     3. Project settings (gear icon) → General → "Your apps" → Add app → Web
        (</>)  →  copy the firebaseConfig object it gives you → paste the
        values below.
     4. Commit this file. These values are safe to make public — they just
        identify which Firebase project to talk to; the Realtime Database
        Rules (set in step 2) are what actually control who can read/write.
   ============================================================================= */

window.THREADROOM_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
