/* Importers: Excel / CSV (with column mapping), MS Project XML (MSPDI), and Planline JSON backups. */
window.PS = window.PS || {};

PS.importers = (function () {
  const U = PS.util;

  const FIELDS = [
    { key: 'name', label: 'Task name', required: true, syn: ['task name', 'name', 'activity name', 'activity', 'task', 'activity description', 'description', 'work item', 'item', 'title'] },
    { key: 'id', label: 'ID (used by predecessors)', syn: ['id', 'task id', 'activity id', 'unique id', 'uid', 's no', 'sl no', 'sr no', 'serial', '#'] },
    { key: 'wbs', label: 'WBS code', syn: ['wbs', 'wbs code', 'outline number', 'code', 'wbs no'] },
    { key: 'level', label: 'Outline level', syn: ['outline level', 'level', 'indent', 'hierarchy', 'hierarchy level'] },
    { key: 'duration', label: 'Duration', syn: ['duration', 'dur', 'original duration', 'planned duration', 'duration days', 'days'] },
    { key: 'start', label: 'Start date', syn: ['start', 'start date', 'planned start', 'begin', 'early start', 'scheduled start'] },
    { key: 'finish', label: 'Finish date', syn: ['finish', 'finish date', 'end', 'end date', 'planned finish', 'early finish', 'scheduled finish'] },
    { key: 'preds', label: 'Predecessors', syn: ['predecessors', 'predecessor', 'preds', 'depends on', 'dependencies', 'dependency', 'links'] },
    { key: 'manhours', label: 'Man-hours', syn: ['work', 'man hours', 'manhours', 'man-hours', 'mh', 'effort', 'effort hrs', 'hours', 'labour hours', 'labor hours', 'work hours'] },
    { key: 'crew', label: 'Crew size', syn: ['crew', 'crew size', 'manpower', 'workers', 'no of workers', 'headcount', 'resource count'] },
    { key: 'resource', label: 'Resource / crew name', syn: ['resource names', 'resource name', 'resource', 'resources', 'assigned to', 'owner', 'responsible', 'trade', 'contractor'] },
    { key: 'pct', label: '% complete', syn: ['% complete', 'percent complete', 'progress', '% done', 'complete', 'pct', 'physical % complete'] },
    { key: 'notes', label: 'Notes', syn: ['notes', 'remarks', 'comments', 'comment'] },
  ];

  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9%#]+/g, ' ').trim();

  function readFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return new Promise((resolve) => {
      if (ext === 'mpp' || ext === 'mpt') {
        resolve({ kind: 'error', message: 'Native .mpp files use a closed binary format that browsers cannot read. In MS Project choose File › Save As › "XML Format (*.xml)", or File › Export to Excel, then import that file here.' });
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => resolve({ kind: 'error', message: 'The file could not be read.' });
      if (ext === 'xml' || ext === 'json') {
        reader.onload = () => {
          const text = String(reader.result);
          try {
            if (ext === 'json') resolve({ kind: 'project', project: parseBackup(text) });
            else resolve({ kind: 'project', project: parseMSPDI(text) });
          } catch (e) { resolve({ kind: 'error', message: e.message }); }
        };
        reader.readAsText(file);
        return;
      }
      if (typeof XLSX === 'undefined') { resolve({ kind: 'error', message: 'The spreadsheet reader did not load. Check your connection and reload the page.' }); return; }
      reader.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          const sheets = {};
          wb.SheetNames.forEach((n) => {
            sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
          });
          resolve({ kind: 'table', sheets, sheetNames: wb.SheetNames });
        } catch (e) { resolve({ kind: 'error', message: 'This spreadsheet could not be read: ' + e.message }); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function detectHeader(rows) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cells = rows[i].map(norm);
      let score = 0;
      cells.forEach((c) => { if (c && FIELDS.some((f) => f.syn.includes(c))) score += 2; else if (c && isNaN(c)) score += 0.1; });
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  function autoMap(headers) {
    const h = headers.map(norm);
    const used = new Set();
    const map = {};
    FIELDS.forEach((f) => {
      let idx = h.findIndex((c, i) => !used.has(i) && f.syn.includes(c));
      if (idx < 0) idx = h.findIndex((c, i) => !used.has(i) && c && f.syn.some((s) => s.length > 3 && c.includes(s)));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    });
    return map;
  }

  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  /* rows: array of arrays (data rows only). map: field -> column index. */
  function buildTasks(rows, map, opts) {
    opts = opts || {};
    const hpd = opts.hoursPerDay || 8;
    const dpw = opts.daysPerWeek || 5;
    const get = (r, k) => (map[k] == null || map[k] === '' ? '' : r[map[k]]);
    const data = rows.filter((r) => String(get(r, 'name')).trim() !== '');
    const warnings = [];

    // percent scale: if every numeric value is <= 1, treat as fractions
    const pctNums = data.map((r) => get(r, 'pct')).filter((v) => typeof v === 'number');
    const pctFraction = pctNums.length > 0 && pctNums.every((v) => v <= 1) && !data.some((r) => /%/.test(String(get(r, 'pct'))));

    const tasks = data.map((r, i) => {
      const rawName = String(get(r, 'name'));
      const t = { id: i + 1, name: rawName.trim(), preds: [] };
      // hierarchy
      if (map.level != null && map.level !== '' && num(get(r, 'level')) != null) t.level = num(get(r, 'level'));
      else if (map.wbs != null && map.wbs !== '' && String(get(r, 'wbs')).trim()) t.level = String(get(r, 'wbs')).trim().replace(/\.$/, '').split('.').length - 1;
      else { const lead = rawName.match(/^(\s*)/)[1].replace(/\t/g, '    ').length; t.level = Math.floor(lead / 2); }
      t._wbsIn = String(get(r, 'wbs')).trim();
      t._idIn = String(get(r, 'id')).trim();
      const dur = U.parseDuration(get(r, 'duration'), hpd, dpw);
      const st = U.parseAnyDate(get(r, 'start'), opts.dateOrder);
      const fi = U.parseAnyDate(get(r, 'finish'), opts.dateOrder);
      t._start = st; t._finish = fi;
      t.duration = dur;
      const mh = num(get(r, 'manhours'));
      if (mh != null) t.manhours = mh;
      const crew = num(get(r, 'crew'));
      if (crew != null) t.crew = crew;
      const res = String(get(r, 'resource') || '').trim();
      if (res) t.resource = res;
      let pct = num(get(r, 'pct'));
      if (pct != null) { if (pctFraction) pct *= 100; t.pct = U.clamp(Math.round(pct), 0, 100); }
      const notes = String(get(r, 'notes') || '').trim();
      if (notes) t.notes = notes;
      t._predText = String(get(r, 'preds') == null ? '' : get(r, 'preds'));
      return t;
    });
    if (!tasks.length) return { tasks: [], warnings: ['No rows with a task name were found.'] };

    // normalise levels so the smallest is 0
    const minLevel = Math.min(...tasks.map((t) => t.level));
    tasks.forEach((t) => { t.level -= minLevel; });

    // predecessor resolution: by imported ID, then WBS code, then row number
    const byIdIn = new Map(), byWbs = new Map();
    tasks.forEach((t) => { if (t._idIn) byIdIn.set(t._idIn, t); if (t._wbsIn) byWbs.set(t._wbsIn, t); });
    const useIds = map.id != null && map.id !== '' && byIdIn.size > 0;
    let badCount = 0;
    tasks.forEach((t) => {
      t._predText.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
        const m = tok.match(/^([\w.]+?)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*([a-z]*))?$/i);
        if (!m) { badCount++; return; }
        const ref = m[1];
        let q = useIds ? byIdIn.get(ref) : null;
        if (!q && byWbs.has(ref) && ref.includes('.')) q = byWbs.get(ref);
        if (!q && /^\d+$/.test(ref)) q = useIds ? byIdIn.get(ref) : tasks[+ref - 1];
        if (!q || q === t) { badCount++; return; }
        let lag = m[4] ? U.parseDuration(m[4] + (m[5] || 'd'), hpd, dpw) : 0;
        if (m[3] === '-') lag = -lag;
        t.preds.push({ id: q.id, type: (m[2] || 'FS').toUpperCase(), lag: Math.round(lag * 2) / 2 });
      });
    });
    if (badCount) warnings.push(badCount + ' predecessor reference(s) could not be matched and were skipped.');

    const starts = tasks.map((t) => t._start).filter(Boolean).sort();
    const startDate = starts[0] || null;
    const anyPreds = tasks.some((t) => t.preds.length);
    tasks.forEach((t) => {
      if (t.duration == null && t._start && t._finish && opts.calendar) {
        const c = U.Calendar(startDate || t._start, opts.calendar);
        t.duration = Math.max(0, c.workdays(t._start, t._finish));
      }
      if (t.duration == null) t.duration = t.manhours && t.crew ? null : 1;
      if (t.duration == null) t.effortDriven = true;
      if (t._start && (opts.lockDates || !anyPreds)) t.constraintDate = t._start;
      delete t._start; delete t._finish; delete t._predText; delete t._wbsIn; delete t._idIn;
    });
    return { tasks, startDate, warnings };
  }

  // ---------- MS Project XML (MSPDI)
  function txt(el, tag) { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; }
  function childTxt(el, tag) {
    for (const c of el.children) if (c.localName === tag) return c.textContent.trim();
    return '';
  }
  function isoDur(s) { // PT40H0M0S -> hours
    const m = String(s || '').match(/PT(\d+(?:\.\d+)?)H(\d+(?:\.\d+)?)M(\d+(?:\.\d+)?)S/);
    return m ? +m[1] + +m[2] / 60 + +m[3] / 3600 : 0;
  }
  function parseMSPDI(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This XML file is not valid.');
    const root = doc.documentElement;
    if (root.localName !== 'Project') throw new Error('This XML file is not an MS Project XML export.');
    const mpd = parseFloat(childTxt(root, 'MinutesPerDay')) || 480;
    const hpd = mpd / 60;
    const tasksEl = [...root.getElementsByTagName('Task')].filter((t) => t.parentNode.localName === 'Tasks');
    const resNames = new Map();
    [...root.getElementsByTagName('Resource')].forEach((r) => {
      const uid = childTxt(r, 'UID'), n = childTxt(r, 'Name');
      if (uid && n) resNames.set(uid, n);
    });
    const assign = new Map();
    [...root.getElementsByTagName('Assignment')].forEach((a) => {
      const tu = childTxt(a, 'TaskUID'), ru = childTxt(a, 'ResourceUID');
      if (resNames.has(ru)) { if (!assign.has(tu)) assign.set(tu, []); assign.get(tu).push(resNames.get(ru)); }
    });
    const uidMap = new Map();
    const tasks = [];
    tasksEl.forEach((el) => {
      const uid = childTxt(el, 'UID');
      const level = parseInt(childTxt(el, 'OutlineLevel') || '1', 10);
      if (uid === '0' || level === 0) return;
      if (childTxt(el, 'IsNull') === '1') return;
      const name = childTxt(el, 'Name');
      if (!name) return;
      const t = { id: tasks.length + 1, name, level: Math.max(0, level - 1), preds: [] };
      uidMap.set(uid, t);
      const hours = isoDur(childTxt(el, 'Duration'));
      t.duration = childTxt(el, 'Milestone') === '1' && hours === 0 ? 0 : Math.round((hours / hpd) * 2) / 2;
      const work = isoDur(childTxt(el, 'Work'));
      if (work) t.manhours = Math.round(work * 100) / 100;
      const pct = parseFloat(childTxt(el, 'PercentComplete'));
      if (pct) t.pct = pct;
      const as = childTxt(el, 'ActualStart'), af = childTxt(el, 'ActualFinish');
      if (as) t.actualStart = as.slice(0, 10);
      if (af) t.actualFinish = af.slice(0, 10);
      t._start = childTxt(el, 'Start').slice(0, 10);
      const ct = childTxt(el, 'ConstraintType'), cd = childTxt(el, 'ConstraintDate');
      if ((ct === '4' || ct === '2') && cd) t.constraintDate = cd.slice(0, 10);
      const notes = childTxt(el, 'Notes');
      if (notes) t.notes = notes;
      if (assign.has(uid)) t.resource = assign.get(uid).join(', ');
      t._links = [...el.children].filter((c) => c.localName === 'PredecessorLink').map((l) => ({
        uid: childTxt(l, 'PredecessorUID'),
        type: ({ 0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS' })[childTxt(l, 'Type')] || 'FS',
        lag: (parseFloat(childTxt(l, 'LinkLag')) || 0) / 10 / 60 / hpd,
      }));
      tasks.push(t);
    });
    if (!tasks.length) throw new Error('No tasks were found in this MS Project file.');
    tasks.forEach((t) => {
      t.preds = t._links.filter((l) => uidMap.has(l.uid)).map((l) => ({ id: uidMap.get(l.uid).id, type: l.type, lag: Math.round(l.lag * 2) / 2 }));
      if (!t.preds.length && !t.constraintDate && !t.actualStart && t._start) t.constraintDate = t._start;
      delete t._links;
    });
    const starts = tasks.map((t) => t._start).filter(Boolean).sort();
    tasks.forEach((t) => delete t._start);
    const projStart = (childTxt(root, 'StartDate') || starts[0] || U.todayISO()).slice(0, 10);
    // drop constraints equal to project start, they add nothing
    tasks.forEach((t) => { if (t.constraintDate && t.constraintDate <= projStart) delete t.constraintDate; });
    const mpw = parseFloat(childTxt(root, 'MinutesPerWeek')) || mpd * 5;
    const dpw = Math.round(mpw / mpd);
    const wd = dpw >= 7 ? [0, 1, 2, 3, 4, 5, 6] : dpw === 6 ? [1, 2, 3, 4, 5, 6] : [];
    const name = childTxt(root, 'Title') || childTxt(root, 'Name') || 'Imported MS Project schedule';
    return {
      name: name.replace(/\.xml$/i, ''),
      startDate: projStart,
      calendar: { workDays: wd.length ? wd : [1, 2, 3, 4, 5], hoursPerDay: hpd, holidays: [] },
      tasks,
    };
  }

  function parseBackup(text) {
    const p = JSON.parse(text);
    if (!p || !Array.isArray(p.tasks)) throw new Error('This file is not a Planline project backup.');
    return p;
  }

  return { FIELDS, readFile, detectHeader, autoMap, buildTasks, parseMSPDI, parseBackup };
})();
