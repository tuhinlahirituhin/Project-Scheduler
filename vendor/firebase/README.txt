Firebase JS SDK 12.19.0 (Apache License 2.0, https://github.com/firebase/firebase-js-sdk).
Browser ES module builds copied from the npm package "firebase" (firebase-app.js, firebase-auth.js,
firebase-firestore-lite.js). The import of https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js
was changed to ./firebase-app.js so the site has no CDN dependency. Loaded only when accounts are
switched on in js/config.js.
