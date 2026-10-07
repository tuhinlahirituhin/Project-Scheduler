/* Shared helpers: dates, working calendar, formatting. */
window.PS = window.PS || {};

PS.util = (function () {
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseISO(s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  function toISO(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDaysISO(iso, n) { return toISO(new Date(parseISO(iso).getTime() + n * DAY)); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); }
  function todayISO() {
    const n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }
  function fmtDate(iso) {
    const d = parseISO(iso);
    if (!d) return '';
    return pad(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2);
  }
  function fmtNum(n, dp = 0) {
    if (n == null || isNaN(n)) return '';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function round(n, dp = 1) { const f = Math.pow(10, dp); return Math.round(n * f) / f; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Working-day calendar. Index 0 is the first working day on/after the project start.
     Tasks occupy working-day indices [es, ef). */
  function Calendar(startISO, cal) {
    cal = cal || {};
    const workDays = (cal.workDays && cal.workDays.length ? cal.workDays : [1, 2, 3, 4, 5]).map(Number);
    const holidays = new Set((cal.holidays || []).filter(Boolean));
    const isWork = (d) => workDays.includes(d.getUTCDay()) && !holidays.has(toISO(d));
    const start = parseISO(startISO) || parseISO(todayISO());
    let first = new Date(start);
    for (let i = 0; i < 400 && !isWork(first); i++) first = new Date(first.getTime() + DAY);
    const fwd = [first.getTime()];
    const back = []; // back[k] = index -(k+1)
    const LIMIT = 40000;

    function extendFwd(n) {
      while (fwd.length <= n && fwd.length < LIMIT) {
        let t = fwd[fwd.length - 1] + DAY;
        for (let i = 0; i < 400 && !isWork(new Date(t)); i++) t += DAY;
        fwd.push(t);
      }
    }
    function extendBack(n) {
      while (back.length <= n && back.length < LIMIT) {
        let t = (back.length ? back[back.length - 1] : fwd[0]) - DAY;
        for (let i = 0; i < 400 && !isWork(new Date(t)); i++) t -= DAY;
        back.push(t);
      }
    }
    function dateOf(i) {
      i = Math.round(i);
      if (i >= 0) { extendFwd(i); return toISO(new Date(fwd[Math.min(i, fwd.length - 1)])); }
      const k = -i - 1; extendBack(k); return toISO(new Date(back[Math.min(k, back.length - 1)]));
    }
    /* mode 'start': non-working date rolls forward; 'finish': rolls back. */
    function indexOf(iso, mode) {
      const d = parseISO(iso);
      if (!d) return 0;
      const t = d.getTime();
      if (t >= fwd[0]) {
        while (fwd[fwd.length - 1] < t && fwd.length < LIMIT) extendFwd(fwd.length + 64);
        let lo = 0, hi = fwd.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (fwd[mid] < t) lo = mid + 1; else hi = mid; }
        if (fwd[lo] === t) return lo;
        return mode === 'finish' ? lo - 1 : lo;
      }
      // before the first working day
      while ((back.length ? back[back.length - 1] : fwd[0]) > t && back.length < LIMIT) extendBack(back.length + 64);
      for (let k = 0; k < back.length; k++) {
        if (back[k] === t) return -k - 1;
        if (back[k] < t) return mode === 'finish' ? -k - 1 : -k; // t sits between back[k] and the next later working day
      }
      return -back.length;
    }
    function workdays(aISO, bISO) { return indexOf(bISO, 'finish') - indexOf(aISO, 'start') + 1; }
    return { dateOf, indexOf, workdays, isWork, workDays, hoursPerDay: Number(cal.hoursPerDay) || 8, startISO: toISO(first) };
  }

  /* "5", "5d", "5 days", "2w", "16h", "1.5 mo" -> working days */
  function parseDuration(v, hoursPerDay = 8, daysPerWeek = 5) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Math.max(0, v);
    const s = String(v).trim().toLowerCase().replace(/[?~]/g, '').replace(/^e/, '');
    const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*([a-z]*)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    const u = m[2];
    let d = n;
    if (/^(h|hr|hrs|hour|hours)$/.test(u)) d = n / hoursPerDay;
    else if (/^(m|min|mins|minute|minutes)$/.test(u)) d = n / 60 / hoursPerDay;
    else if (/^(w|wk|wks|week|weeks)$/.test(u)) d = n * daysPerWeek;
    else if (/^(mo|mon|mons|month|months)$/.test(u)) d = n * 20;
    return Math.max(0, d);
  }

  /* Accepts Date objects, ISO strings, Excel serials, "07/10/2026", "Mon 10/7/26", "7 Oct 2026". */
  function parseAnyDate(v, order = 'DMY') {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel serial
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 1e-6) * DAY); // drop the time of day
      return toISO(d);
    }
    let s = String(v).trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*[\s,]+/i, '');
    s = s.replace(/[T\s]\d{1,2}:\d{2}.*$/, '').trim();
    s = s.replace(/\s*(\*|\s[AaEe])$/, '').trim(); // Primavera marks actual dates "A" and constrained dates "*"
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      let a = +m[1], b = +m[2];
      let day = order === 'MDY' ? b : a, mon = order === 'MDY' ? a : b;
      if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }
      return y + '-' + pad(mon) + '-' + pad(day);
    }
    m = s.match(/^(\d{1,2})[\s-]([a-z]{3,})[\s-,]*(\d{2,4})$/i);
    if (m) {
      const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
      if (mi >= 0) { let y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(mi + 1) + '-' + pad(m[1]); }
    }
    const t = Date.parse(s);
    if (!isNaN(t)) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    return null;
  }

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function safeName(s) { return String(s || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'project'; }

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  return { DAY, MONTHS, pad, parseISO, toISO, addDaysISO, daysBetween, todayISO, fmtDate, fmtNum, round, uid, esc, clamp, Calendar, parseDuration, parseAnyDate, download, safeName, store };
})();
