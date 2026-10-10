/* Optional accounts: sign in with an emailed link (or Google) through Firebase, and keep each signed-in
   visitor's projects in Cloud Firestore under users/{uid}/projects/{projectId}.
   Off until js/config.js has cloud.enabled: true and the Firebase settings (see firebase/README.md).
   The browser copy (localStorage) stays the working copy. This file watches project writes to it,
   uploads changed projects a few seconds later, and pulls changes made on other devices when the app
   opens, after sign-in and when the tab comes back into view. */
window.PS = window.PS || {};

(function () {
  const U = PS.util;
  const CFG = (window.PS_CONFIG || {}).cloud || {};
  const FB = CFG.firebase || {};
  const ON = !!(CFG.enabled && FB.apiKey && FB.projectId);
  const SDK = document.currentScript ? new URL('../vendor/firebase/', document.currentScript.src).href : '../vendor/firebase/';
  const LIMIT = 1000000;          // Firestore keeps up to 1 MiB per document
  const PUSH_DELAY = 3000;        // batch quick edits into one upload
  const PULL_AFTER = 60000;       // look for changes from other devices when the tab returns after this long

  const S = {
    user: null, view: 'signin', email: '', busy: false, pulling: false, ready: false, pushing: false, again: false,
    lastPull: 0, lastPush: 0, error: '', dirty: new Set(), dels: new Set(), tooBig: new Set(),
  };
  let F = null, A = null, auth = null, db = null, timer = null, quiet = false;
  const $ = (s) => document.querySelector(s);
  const app = () => PS.app || {};
  const toast = (m, ms) => (app().toast ? app().toast(m, ms) : null);

  PS.cloud = {
    on: ON,
    signedIn: () => !!S.user,
    // Text for the "saved" indicator in the toolbar after a local save.
    savedLabel: () => statusText() || 'Saved in this browser',
    where: () => (S.user ? 'Saved in this browser and your account' : 'Saved in this browser'),
    open: openDialog,
  };
  if (!ON) return;

  // ---------------------------------------------------------------- watch project writes
  const raw = { set: U.store.set, del: U.store.del };
  const projId = (k) => (typeof k === 'string' && k.startsWith('ps.p.') ? k.slice(5) : null);
  U.store.set = function (k, v) {
    const ok = raw.set(k, v);
    const id = projId(k);
    if (ok && id && !quiet) { S.dirty.add(id); schedule(); }
    return ok;
  };
  U.store.del = function (k) {
    raw.del(k);
    const id = projId(k);
    if (!id || quiet) return;
    S.dirty.delete(id);
    const m = meta();
    const it = m.items[id];
    if (!it || it.skip) { delete m.items[id]; saveMeta(m); return; }
    if (S.user && S.ready) { S.dels.add(id); schedule(); } else { it.del = true; saveMeta(m); }
  };

  // Sync bookkeeping kept per browser: for each project, the cloud copy's "updated" stamp and a hash of
  // its content when this browser last matched it. A difference on either side tells who changed it.
  function meta() {
    const m = U.store.get('ps.cloud.meta', null);
    return m && m.items ? m : { uid: null, items: {} };
  }
  function saveMeta(m) { raw.set('ps.cloud.meta', m); }
  function hash(str) {
    let s = str;
    try { const o = JSON.parse(str); delete o.updated; s = JSON.stringify(o); } catch (e) { /* hash as is */ }
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '.' + s.length;
  }
  const localStr = (id) => { try { return localStorage.getItem('ps.p.' + id); } catch (e) { return null; } };
  function localIds() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const id = projId(localStorage.key(i)); if (id) out.push(id); } } catch (e) { /* blocked */ }
    return out;
  }
  function parse(str) { try { return JSON.parse(str); } catch (e) { return null; } }
  const isSample = (str) => { const p = parse(str); return !!(p && p.isSample); };
  const bytes = (str) => new Blob([str]).size;

  function index() { return U.store.get('ps.index', []); }
  function writeLocal(id, str) {
    const p = parse(str);
    if (!p) return false;
    quiet = true;
    try {
      raw.set('ps.p.' + id, p);
      const l = index().filter((x) => x.id !== id);
      l.unshift({ id, name: p.name || 'Untitled project', updated: p.updated || Date.now() });
      l.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      raw.set('ps.index', l);
    } finally { quiet = false; }
    return true;
  }
  function removeLocal(id) {
    quiet = true;
    try { raw.del('ps.p.' + id); raw.set('ps.index', index().filter((x) => x.id !== id)); } finally { quiet = false; }
  }
  /* Both sides changed: keep the other device's version as a separate project so nothing is lost. */
  function keepCopy(doc) {
    const p = parse(doc.data);
    if (!p) return null;
    p.id = U.uid();
    p.name = (p.name || 'Untitled project') + ' (from another device)';
    writeLocal(p.id, JSON.stringify(p));
    S.dirty.add(p.id);
    return p.id;
  }

  // ---------------------------------------------------------------- Firebase
  async function load() {
    if (F) return;
    const [appMod, authMod, fsMod] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore-lite.js'),
    ]);
    A = authMod; F = fsMod;
    const fbApp = appMod.initializeApp(FB);
    auth = A.getAuth(fbApp);
    db = F.getFirestore(fbApp);
    if (CFG.emulator) {   // local testing only, e.g. { auth: 'http://127.0.0.1:9099', firestore: '127.0.0.1:8080' }
      A.connectAuthEmulator(auth, CFG.emulator.auth, { disableWarnings: true });
      const [h, port] = CFG.emulator.firestore.split(':');
      F.connectFirestoreEmulator(db, h, Number(port));
    }
  }
  const ref = (id) => F.doc(db, 'users', S.user.uid, 'projects', id);
  function errText(e) {
    const c = (e && e.code) || '';
    if (c.includes('network') || c === 'unavailable') return 'No connection. Your work is safe in this browser and will be saved to your account when you are back online.';
    if (c.includes('invalid-email')) return 'That email address does not look right.';
    if (c.includes('invalid-action-code') || c.includes('expired-action-code')) return 'This sign-in link has expired or was already used. Ask for a new one.';
    if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in window was closed.';
    if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site, or use the email link.';
    if (c.includes('unauthorized-domain') || c.includes('unauthorized-continue-uri')) return 'Sign-in is not set up for this web address yet.';
    if (c.includes('operation-not-allowed')) return 'This sign-in method is not switched on yet.';
    if (c.includes('quota') || c === 'resource-exhausted') return 'The daily limit for saving to accounts was reached. Your work is safe in this browser and will be saved later.';
    if (c.includes('requires-recent-login')) return 'For safety, sign out, sign in again, then retry.';
    if (c === 'permission-denied') return 'Your account was refused access. Sign out and sign in again.';
    return (e && e.message) || 'Something went wrong';
  }

  // ---------------------------------------------------------------- sync
  function schedule(ms) {
    if (!S.user) return;
    clearTimeout(timer);
    timer = setTimeout(pushRound, ms == null ? PUSH_DELAY : ms);
    label();
  }

  async function pushOne(id, str, m) {
    const it = m.items[id];
    const h = hash(str);
    const p = parse(str) || {};
    const now = Date.now();
    let other = null;
    await F.runTransaction(db, async (tx) => {
      other = null;
      const snap = await tx.get(ref(id));
      if (snap.exists()) {
        const d = snap.data();
        if ((!it || d.updated !== it.u) && hash(d.data) !== h && hash(d.data) !== (it && it.h)) other = d;
      }
      tx.set(ref(id), { name: String(p.name || 'Untitled project').slice(0, 300), updated: now, data: str, v: 1 });
    });
    m.items[id] = { u: now, h };
    if (other) { keepCopy(other); toast(`“${p.name}” was also changed on another device. That version was kept as a separate project.`, 6000); return true; }
    return false;
  }

  async function pushRound() {
    clearTimeout(timer);
    if (!S.user || !S.ready) return;
    if (S.pushing) { S.again = true; return; }
    S.pushing = true;
    label();
    let id = null, copies = false;
    try {
      const m = meta();
      for (id of [...S.dels]) {
        await F.deleteDoc(ref(id));
        delete m.items[id]; S.dels.delete(id); saveMeta(m);
      }
      for (id of [...S.dirty]) {
        S.dirty.delete(id);
        const it = m.items[id];
        const str = localStr(id);
        if (!str || (it && it.skip) || isSample(str)) continue;
        if (it && !it.del && hash(str) === it.h) continue;
        if (bytes(str) > LIMIT) { S.tooBig.add(id); continue; }
        S.tooBig.delete(id);
        if (await pushOne(id, str, m)) copies = true;
        saveMeta(m);
      }
      id = null;
      S.error = ''; S.lastPush = Date.now();
    } catch (e) {
      if (id && !S.dels.has(id)) S.dirty.add(id);
      S.error = errText(e);
    } finally {
      S.pushing = false;
      if (copies && app().storeChanged) app().storeChanged([]);
      label(); renderDialog();
      if (S.again || S.dirty.size) { S.again = false; if (!S.error) schedule(copies ? 300 : undefined); }
    }
  }

  async function pull() {
    if (!S.user || S.pulling) return;
    S.pulling = true; label(); renderDialog();
    try {
      let m = meta();
      if (m.uid !== S.user.uid) { m = { uid: S.user.uid, items: {} }; saveMeta(m); }
      const snap = await F.getDocs(F.collection(db, 'users', S.user.uid, 'projects'));
      const cloud = new Map();
      snap.forEach((d) => cloud.set(d.id, d.data()));
      const changed = [], unknown = [];
      // deletions made in this browser while signed out
      for (const [id, it] of Object.entries(m.items)) {
        if (!it.del) continue;
        if (cloud.has(id)) await F.deleteDoc(ref(id));
        cloud.delete(id); delete m.items[id];
      }
      const local = new Set(localIds());
      for (const [id, d] of cloud) {
        const it = m.items[id];
        const ch = hash(d.data);
        if (!local.has(id)) {
          if (writeLocal(id, d.data)) { m.items[id] = { u: d.updated, h: ch }; changed.push(id); }
          continue;
        }
        const lh = hash(localStr(id));
        if (lh === ch) { m.items[id] = { u: d.updated, h: ch }; continue; }
        const known = it && !it.skip;
        const localChanged = !known || lh !== it.h;
        const cloudChanged = !known || d.updated !== it.u;
        if (cloudChanged && !localChanged) { writeLocal(id, d.data); m.items[id] = { u: d.updated, h: ch }; changed.push(id); }
        else if (!cloudChanged) S.dirty.add(id);
        else {   // changed on both sides: this browser's version keeps its place, the other becomes a copy
          const cid = keepCopy(d);
          if (cid) changed.push(cid);
          m.items[id] = { u: d.updated, h: ch };
          S.dirty.add(id);
        }
      }
      for (const id of local) {
        if (cloud.has(id)) continue;
        const it = m.items[id];
        const str = localStr(id);
        if ((it && it.skip) || isSample(str)) continue;
        if (it) {
          delete m.items[id];
          if (hash(str) === it.h) { removeLocal(id); changed.push(id); }   // deleted on another device
          else S.dirty.add(id);                                             // edited here since: upload again
        } else if (S.ready) S.dirty.add(id);   // made in this browser while signed in
        else { unknown.push(id); S.dirty.delete(id); }
      }
      saveMeta(m);
      S.lastPull = Date.now(); S.error = '';
      if (changed.length && app().storeChanged) app().storeChanged(changed);
      if (unknown.length) await askUpload(unknown);
      S.ready = true;
    } catch (e) {
      S.error = errText(e);
    } finally {
      S.pulling = false;
      label(); renderDialog();
    }
    if (S.ready) pushRound();
  }

  async function askUpload(ids) {
    const n = ids.length;
    const names = ids.map((id) => (parse(localStr(id)) || {}).name).filter(Boolean).slice(0, 4).join(', ');
    let yes = false;
    try {
      yes = await app().confirmDlg(`Save ${n} project${n > 1 ? 's' : ''} from this browser to your account?`,
        `${names}${n > 4 ? ' and more' : ''}. Saved projects open on any device where you sign in. If you choose “Not now”, they stay only in this browser; you can add them later from the account window.`,
        'Save to my account', false, 'Not now');
    } catch (e) { yes = false; }
    const m = meta();
    ids.forEach((id) => { if (yes) { delete m.items[id]; S.dirty.add(id); } else { m.items[id] = { skip: true }; S.dirty.delete(id); } });
    saveMeta(m);
  }
  function addSkipped() {
    const m = meta();
    Object.entries(m.items).forEach(([id, it]) => { if (it.skip) { delete m.items[id]; if (localStr(id)) S.dirty.add(id); } });
    saveMeta(m);
    pushRound();
  }
  const skippedCount = () => Object.entries(meta().items).filter(([id, it]) => it.skip && localStr(id)).length;

  // ---------------------------------------------------------------- toolbar status
  function label() {
    const btn = $('#btn-account');
    if (btn) {
      btn.hidden = false;
      const t = btn.querySelector('span');
      if (t) t.textContent = S.user ? (S.user.email || 'Account').split('@')[0] : 'Sign in';
      btn.title = S.user ? 'Signed in as ' + (S.user.email || '') : 'Sign in to save your projects to your account';
      btn.classList.toggle('signed-in', !!S.user);
    }
    const foot = $('#foot-store');
    if (foot) foot.textContent = S.user ? 'Your projects are saved in this browser and to your account.' : 'Your projects are stored only in this browser. Export a backup or sign in to keep a copy.';
    const el = $('#saved');
    const t = statusText();
    if (el && t) el.textContent = t;
  }
  function statusText() {
    if (!S.user) return '';
    const cur = app().currentId ? app().currentId() : null;
    const str = cur ? localStr(cur) : null;
    const it = (cur && meta().items[cur]) || {};
    if (!str) return '';
    if (isSample(str)) return 'Example project · saved in this browser only';
    if (it.skip) return 'Saved in this browser only';
    if (S.error) return 'Saved in this browser · not saved to your account yet';
    if (cur && S.tooBig.has(cur)) return 'Saved in this browser · too large for your account';
    if (S.pushing || S.pulling || S.dels.size || hash(str) !== it.h) return 'Saved in this browser · saving to your account…';
    return 'Saved to your account';
  }

  // ---------------------------------------------------------------- account window
  function openDialog() {
    const dlg = $('#dlg-account');
    if (!dlg) return;
    if (!S.user && S.view === 'account') S.view = 'signin';
    renderDialog();
    if (!dlg.open) dlg.showModal();
    const inp = $('#acct-email');
    if (inp) inp.focus();
  }
  function renderDialog() {
    const body = $('#account-body');
    if (!body) return;
    const esc = U.esc;
    const google = CFG.googleSignIn !== false
      ? `<div class="acct-or"><span>or</span></div><button class="btn wide" type="button" data-aact="google">${GOOGLE_ICON}Continue with Google</button>` : '';
    let html;
    if (S.user) {
      const sk = skippedCount();
      const when = S.lastPush || S.lastPull;
      html = `<span class="eyebrow">Your account</span><h2>Signed in</h2>
        <p>You are signed in as <b>${esc(S.user.email || 'your Google account')}</b>. Your projects are saved in this browser and to your account, so you can open them on any device where you sign in.</p>
        <p class="small muted">${S.error ? '<span class="acct-err">' + esc(S.error) + '</span>' : S.pulling || S.pushing ? 'Checking and saving…' : when ? 'Up to date as of ' + new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' : ''}
          Example projects and norms you edit stay in this browser.</p>
        ${S.tooBig.size ? `<p class="small acct-err">${S.tooBig.size} project${S.tooBig.size > 1 ? ' is' : 's are'} too large to save to your account (over 1 MB). Download a backup to keep a copy.</p>` : ''}
        <div class="acct-actions">
          <button class="btn" type="button" data-aact="sync"${S.pulling ? ' disabled' : ''}>Check for changes now</button>
          ${sk ? `<button class="btn" type="button" data-aact="addskip">Save ${sk} more project${sk > 1 ? 's' : ''} from this browser</button>` : ''}
        </div>
        <details class="acct-more"><summary>Sign out or delete account</summary>
          <div class="acct-actions">
            <button class="btn" type="button" data-aact="signout">Sign out</button>
            <button class="btn" type="button" data-aact="signout-clear" title="Use this on a shared computer">Sign out and remove my projects from this browser</button>
            <button class="btn danger" type="button" data-aact="delete">Delete my account and saved projects</button>
          </div></details>`;
    } else if (S.view === 'sent') {
      html = `<span class="eyebrow">Check your inbox</span><h2>Sign-in link sent</h2>
        <p>We sent a link to <b>${esc(S.email)}</b>. Open it in this browser on this device to finish signing in. It can take a minute to arrive; check your spam folder too.</p>
        <div class="acct-actions"><button class="btn" type="button" data-aact="back">Use a different email</button></div>`;
    } else if (S.view === 'finish') {
      html = `<span class="eyebrow">Almost done</span><h2>Confirm your email</h2>
        <p>You opened the sign-in link in a different browser. Type the email address you used so we can finish signing you in.</p>
        <label class="acct-field">Email<input type="email" id="acct-email" autocomplete="email" required value="${esc(S.email)}"></label>
        <button class="btn primary wide" type="submit" data-aact="finish"${S.busy ? ' disabled' : ''}>Finish signing in</button>`;
    } else {
      html = `<span class="eyebrow">Free account</span><h2>Save your projects to your account</h2>
        <p>Sign in with your email to keep your projects safe and open them on any device. No password: we email you a sign-in link.</p>
        <label class="acct-field">Email<input type="email" id="acct-email" autocomplete="email" placeholder="you@example.com" required value="${esc(S.email)}"></label>
        <button class="btn primary wide" type="submit" data-aact="send"${S.busy ? ' disabled' : ''}>Email me a sign-in link</button>
        ${google}
        <p class="small muted">Planline also works without an account; your projects are then saved only in this browser. See the <a href="../privacy.html">privacy policy</a>.</p>`;
    }
    body.innerHTML = `${html}${!S.user && S.error ? `<p class="small acct-err">${esc(S.error)}</p>` : ''}
      <div class="dlg-foot"><button class="btn" value="close" formnovalidate>Close</button></div>`;
  }
  const GOOGLE_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true" style="width:16px;height:16px"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.8a5.4 5.4 0 0 1 0-3.5V5H.9a9 9 0 0 0 0 8.1z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.4L15 2.4A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>';

  async function act(a) {
    const inp = $('#acct-email');
    if (inp) S.email = inp.value.trim();
    S.error = '';
    try {
      switch (a) {
        case 'send': {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email)) { S.error = 'Enter a valid email address.'; break; }
          S.busy = true; renderDialog();
          await A.sendSignInLinkToEmail(auth, S.email, { url: location.origin + location.pathname, handleCodeInApp: true });
          raw.set('ps.cloud.email', S.email);
          S.view = 'sent';
          break;
        }
        case 'finish': {
          if (!S.email) { S.error = 'Enter your email address.'; break; }
          S.busy = true; renderDialog();
          await finishLink(S.email);
          break;
        }
        case 'google': await A.signInWithPopup(auth, new A.GoogleAuthProvider()); break;
        case 'back': S.view = 'signin'; break;
        case 'sync': await pushRound(); await pull(); break;
        case 'addskip': addSkipped(); break;
        case 'signout': await signOut(false); break;
        case 'signout-clear': await signOut(true); break;
        case 'delete': await deleteAccount(); break;
        default: break;
      }
    } catch (e) {
      S.error = errText(e);
    }
    S.busy = false;
    renderDialog();
  }

  async function finishLink(email) {
    await A.signInWithEmailLink(auth, email, location.href);
    raw.del('ps.cloud.email');
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* sandboxed */ }
    S.view = 'account';
    const dlg = $('#dlg-account');
    if (dlg && dlg.open) dlg.close();
    toast('Signed in as ' + email);
  }

  async function signOut(clear) {
    await pushRound();
    if (clear) {
      const unsaved = S.error || S.dirty.size || S.tooBig.size;
      const msg = unsaved
        ? 'Some changes could not be saved to your account yet. Removing them from this browser would lose them. Download a backup first if unsure.'
        : 'Projects saved to your account will be removed from this browser. They stay in your account. Projects only in this browser are kept.';
      if (!(await app().confirmDlg('Sign out and remove your projects from this browser?', msg, 'Sign out and remove', true))) return;
      const m = meta();
      quiet = true;
      try {
        Object.entries(m.items).forEach(([id, it]) => { if (!it.skip) raw.del('ps.p.' + id); });
        const left = new Set(localIds());
        raw.set('ps.index', index().filter((x) => left.has(x.id)));
        raw.del('ps.current');
      } finally { quiet = false; }
      raw.del('ps.cloud.meta');
    }
    await A.signOut(auth);
    if (clear) { location.reload(); return; }
    S.view = 'signin';
    $('#dlg-account').close();
    toast('Signed out. Your projects stay in this browser.');
  }

  async function deleteAccount() {
    if (!(await app().confirmDlg('Delete your account?', 'Your account and every project saved to it will be permanently deleted. Copies in this browser are kept. This cannot be undone.', 'Delete account', true))) return;
    S.busy = true; renderDialog();
    const snap = await F.getDocs(F.collection(db, 'users', S.user.uid, 'projects'));
    for (const d of snap.docs) await F.deleteDoc(d.ref);
    await A.deleteUser(S.user);
    raw.del('ps.cloud.meta');
    toast('Your account and saved projects were deleted.');
  }

  // ---------------------------------------------------------------- start
  async function start() {
    const dlg = $('#dlg-account');
    $('#btn-account').hidden = false;
    $('#btn-account').addEventListener('click', openDialog);
    const body = $('#account-body');
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aact]');
      if (!b || b.type === 'submit') return;
      act(b.dataset.aact);
    });
    body.addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.value === 'close') return;
      e.preventDefault();
      act(S.view === 'finish' ? 'finish' : 'send');
    });
    dlg.addEventListener('close', () => { if (S.view === 'sent' || S.view === 'finish') S.view = S.user ? 'account' : 'signin'; });
    try { await load(); } catch (e) {
      S.error = 'Accounts could not load. Your work is still saved in this browser.';
      return;
    }
    A.onAuthStateChanged(auth, (user) => {
      const was = S.user && S.user.uid;
      S.user = user;
      S.view = user ? 'account' : (S.view === 'account' ? 'signin' : S.view);
      if (!user) { S.ready = false; S.dirty.clear(); S.dels.clear(); clearTimeout(timer); }
      label(); renderDialog();
      if (user && user.uid !== was) pull();
      if (!user && app().refreshSaved) app().refreshSaved();
    });
    if (A.isSignInWithEmailLink(auth, location.href)) {
      const email = U.store.get('ps.cloud.email', '') || '';
      if (email) {
        try { await finishLink(email); } catch (e) { S.error = errText(e); S.view = 'signin'; openDialog(); }
      } else { S.view = 'finish'; openDialog(); }
    }
    document.addEventListener('visibilitychange', () => {
      if (!S.user) return;
      if (document.visibilityState === 'hidden') pushRound();
      else if (Date.now() - S.lastPull > PULL_AFTER) pull();
    });
    window.addEventListener('online', () => { if (S.user) { S.error = ''; S.ready ? pushRound() : pull(); } });
  }
  document.addEventListener('DOMContentLoaded', start);
})();
