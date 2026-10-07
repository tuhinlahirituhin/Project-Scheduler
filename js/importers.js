/* Importers: Excel / CSV (with column mapping), MS Project XML (MSPDI), and Planline JSON backups. */
window.PS = window.PS || {};

PS.importers = (function () {
  const U = PS.util;

  const FIELDS = [
    { key: 'name', label: 'Task name', required: true, syn: ['task name', 'name', 'activity name', 'activity', 'task', 'activity description', 'task description', 'description', 'work item', 'item', 'title', 'scope', 'particulars', 'description of work'] },
    { key: 'id', label: 'ID (used by predecessors)', syn: ['id', 'task id', 'activity id', 'unique id', 'uid', 's no', 'sl no', 'sr no', 'serial', 'serial no', 'no', 'item no', '#'] },
    { key: 'wbs', label: 'WBS code', syn: ['wbs', 'wbs code', 'outline number', 'code', 'wbs no', 'wbs id'] },
    { key: 'level', label: 'Outline level', syn: ['outline level', 'level', 'indent', 'hierarchy', 'hierarchy level', 'indent level'] },
    { key: 'duration', label: 'Duration', syn: ['duration', 'dur', 'original duration', 'planned duration', 'duration days', 'days', 'baseline duration', 'remaining duration', 'no of days'] },
    { key: 'start', label: 'Start date', syn: ['start', 'start date', 'planned start', 'begin', 'early start', 'scheduled start', 'from', 'planned start date', 'baseline start', 'target start'] },
    { key: 'finish', label: 'Finish date', syn: ['finish', 'finish date', 'end', 'end date', 'planned finish', 'early finish', 'scheduled finish', 'to', 'due', 'due date', 'completion date', 'planned finish date', 'planned end', 'baseline finish', 'target finish'] },
    { key: 'actualStart', label: 'Actual start', syn: ['actual start', 'actual start date', 'started on'] },
    { key: 'actualFinish', label: 'Actual finish', syn: ['actual finish', 'actual finish date', 'actual end', 'actual end date', 'completed on'] },
    { key: 'preds', label: 'Predecessors', syn: ['predecessors', 'predecessor', 'preds', 'depends on', 'dependencies', 'dependency', 'links', 'predecessor ids', 'after'] },
    { key: 'manhours', label: 'Man-hours', syn: ['work', 'man hours', 'manhours', 'man-hours', 'mh', 'effort', 'effort hrs', 'hours', 'labour hours', 'labor hours', 'work hours', 'budgeted labor units', 'budgeted labour units', 'labor units', 'labour units', 'budgeted units', 'planned hours', 'estimated hours', 'est hours', 'planned man hours', 'total man hours'] },
    { key: 'crew', label: 'Crew size', syn: ['crew', 'crew size', 'manpower', 'workers', 'no of workers', 'headcount', 'resource count'] },
    { key: 'resource', label: 'Resource / crew name', syn: ['resource names', 'resource name', 'resource', 'resources', 'assigned to', 'owner', 'responsible', 'trade', 'contractor'] },
    { key: 'pct', label: '% complete', syn: ['% complete', 'percent complete', 'progress', '% done', 'complete', 'pct', 'physical % complete', 'activity % complete', 'percentage complete', '% progress', 'progress %', 'completion %', '% completion'] },
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
      if (ext === 'xml' || ext === 'json' || ext === 'xer') {
        reader.onload = () => {
          const text = String(reader.result);
          try {
            if (ext === 'json') resolve({ kind: 'project', project: parseBackup(text) });
            else if (ext === 'xer') resolve({ kind: 'project', project: parseXER(text) });
            else resolve({ kind: 'project', project: parseMSPDI(text) });
          } catch (e) { resolve({ kind: 'error', message: e.message }); }
        };
        reader.readAsText(file);
        return;
      }
      if (typeof XLSX === 'undefined') { resolve({ kind: 'error', message: 'The spreadsheet reader did not load. Check your connection and reload the page.' }); return; }
      reader.onload = () => {
        try {
          // Dates stay as Excel serial numbers: converting them to JS dates shifts them by a day in some time zones.
          // raw: text files (CSV) keep values exactly as typed, so "01.09.2025" or "1,2" are not reinterpreted.
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', raw: true, bookFiles: true });
          const sheets = {}, fmt = {};
          let styles = null;
          try { styles = readStyles(wb); } catch (e) { styles = null; }
          wb.SheetNames.forEach((n, i) => {
            const ws = wb.Sheets[n];
            sheets[n] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
            if (styles) { try { fmt[n] = sheetFormats(wb, ws, i, styles); } catch (e) { /* formatting is optional */ } }
          });
          resolve({ kind: 'table', sheets, fmt, sheetNames: wb.SheetNames });
        } catch (e) { resolve({ kind: 'error', message: 'This spreadsheet could not be read: ' + e.message }); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ---------- cell indentation and bold, read from the xlsx parts (SheetJS does not expose them)
  const xmlOf = (wb, path) => {
    const f = wb.files && (wb.files[path] || wb.files['/' + path]);
    if (!f || !f.content) return null;
    return new DOMParser().parseFromString(new TextDecoder().decode(f.content), 'application/xml');
  };
  const kids = (el, tag) => (el ? [...el.children].filter((c) => c.localName === tag) : []);
  function readStyles(wb) {
    const doc = xmlOf(wb, 'xl/styles.xml');
    if (!doc) return null;
    const root = doc.documentElement;
    const fonts = kids(kids(root, 'fonts')[0], 'font').map((f) => kids(f, 'b').some((b) => b.getAttribute('val') !== '0' && b.getAttribute('val') !== 'false'));
    return kids(kids(root, 'cellXfs')[0], 'xf').map((xf) => {
      const al = kids(xf, 'alignment')[0];
      return { indent: al ? +(al.getAttribute('indent') || 0) : 0, bold: !!fonts[+(xf.getAttribute('fontId') || 0)] };
    });
  }
  function sheetFormats(wb, ws, index, styles) {
    const wbDoc = xmlOf(wb, 'xl/workbook.xml'), rels = xmlOf(wb, 'xl/_rels/workbook.xml.rels');
    if (!wbDoc || !rels) return null;
    const sheetEl = wbDoc.getElementsByTagNameNS('*', 'sheet')[index];
    const rid = sheetEl && (sheetEl.getAttribute('r:id') || sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = [...rels.getElementsByTagNameNS('*', 'Relationship')].find((r) => r.getAttribute('Id') === rid);
    if (!rel) return null;
    const target = rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
    const doc = xmlOf(wb, 'xl/' + target);
    if (!doc) return null;
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const out = [];
    for (const c of doc.getElementsByTagNameNS('*', 'c')) {
      const st = styles[+(c.getAttribute('s') || 0)];
      if (!st || (!st.indent && !st.bold)) continue;
      const a = XLSX.utils.decode_cell(c.getAttribute('r'));
      const r = a.r - range.s.r, col = a.c - range.s.c;
      if (r < 0 || col < 0) continue;
      (out[r] = out[r] || [])[col] = st;
    }
    return out;
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
    // exact heading matches first for every field, so "Task ID" is never taken as the task name
    FIELDS.forEach((f) => {
      const idx = h.findIndex((c, i) => !used.has(i) && f.syn.includes(c));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    });
    const idLike = /(^|\s)(id|no|code|ref|number|#)$/;
    FIELDS.forEach((f) => {
      if (map[f.key] != null) return;
      const idx = h.findIndex((c, i) => !used.has(i) && c && !(f.key === 'name' && idLike.test(c)) && !(f.key !== 'actualStart' && f.key !== 'actualFinish' && /^actual\s/.test(c)) && f.syn.some((s) => s.length > 3 && c.includes(s)));
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

  /* rows: array of arrays (data rows only). map: field -> column index.
     opts.fmt: optional cell formats ({ indent, bold }) per row, aligned with rows. */
  function buildTasks(rows, map, opts) {
    opts = opts || {};
    const hpd = opts.hoursPerDay || 8;
    const dpw = opts.daysPerWeek || 5;
    const has = (k) => map[k] != null && map[k] !== '';
    const get = (r, k) => (has(k) ? r[map[k]] : '');
    const str = (v) => (v == null ? '' : String(v)).trim();
    const fmtRows = opts.fmt || [];
    const data = [];
    rows.forEach((r, i) => { if (r && str(get(r, 'name')) !== '') data.push({ r, f: fmtRows[i] || [] }); });
    const warnings = [];
    if (!data.length) return { tasks: [], warnings: ['No rows with a task name were found.'] };

    // percent scale: if every numeric value is <= 1, treat as fractions
    const pctNums = data.map(({ r }) => get(r, 'pct')).filter((v) => typeof v === 'number');
    const pctFraction = pctNums.length > 0 && pctNums.every((v) => v <= 1) && !data.some(({ r }) => /%/.test(String(get(r, 'pct'))));

    // Outline codes. Numbers typed into Excel lose trailing zeros (1.10 becomes 1.1), so a repeat gets its zero back.
    const codesOf = (k) => {
      const seen = new Set();
      return data.map(({ r }) => {
        const v = get(r, k);
        let c = (typeof v === 'number' ? String(v) : str(v)).replace(/\.$/, '');
        if (typeof v === 'number') while (c.includes('.') && seen.has(c)) c += '0';
        if (c) seen.add(c);
        return c;
      });
    };
    const wbsCodes = has('wbs') ? codesOf('wbs') : data.map(() => '');
    const idCodes = has('id') ? codesOf('id') : data.map(() => '');
    const filled = (codes) => codes.filter(Boolean);
    const unique = (codes) => new Set(filled(codes)).size === filled(codes).length;
    const depth = (c) => c.split('.').length - 1;

    // hierarchy: outline level column, WBS codes, outline-style IDs (A, A.1), Excel indentation, leading spaces, then heading rows
    let levels = null, how = '', groupByWbs = false;
    if (has('level') && data.some(({ r }) => num(get(r, 'level')) != null)) { levels = data.map(({ r }) => num(get(r, 'level')) || 0); how = 'level'; }
    else if (filled(wbsCodes).length) {
      if (!unique(wbsCodes) && filled(wbsCodes).length > 2) { groupByWbs = true; levels = data.map(() => 0); how = 'wbs-group'; }
      else { let prev = 0; levels = wbsCodes.map((c) => (prev = c ? depth(c) : prev)); how = 'wbs'; }
    } else if (filled(idCodes).length > 1 && unique(idCodes) && filled(idCodes).some((c) => c.includes('.'))) {
      let prev = 0; levels = idCodes.map((c) => (prev = c ? depth(c) : prev)); how = 'id';
    }
    if (!levels) {
      const nc = map.name;
      levels = data.map(({ r, f }) => {
        const lead = String(get(r, 'name')).match(/^(\s*)/)[1].replace(/\t/g, '    ').length;
        return ((f[nc] && f[nc].indent) || 0) + Math.floor(lead / 2);
      });
      if (levels.some((l) => l !== levels[0])) how = 'indent';
    }
    if (!how) {
      // no outline information: rows without any dates, durations or hours that sit above detailed rows are headings
      const nc = map.name;
      const blank = ({ r }) => ['duration', 'start', 'finish', 'manhours', 'preds', 'crew'].every((k) => str(get(r, k)) === '');
      const boldRows = data.map(({ f }) => !!(f[nc] && f[nc].bold));
      const someBold = boldRows.some(Boolean) && !boldRows.every(Boolean);
      const heading = data.map((d, i) => (blank(d) || (someBold && boldRows[i])) && i < data.length - 1);
      if (heading.some(Boolean) && heading.some((h) => !h)) { levels = heading.map((h) => (h ? 0 : 1)); how = 'headings'; }
    }

    let tasks = data.map(({ r }, i) => {
      const rawName = String(get(r, 'name'));
      const t = { id: i + 1, name: rawName.trim(), level: levels[i], preds: [] };
      t._wbsIn = wbsCodes[i] || (how === 'id' ? idCodes[i] : '');
      t._idIn = idCodes[i];
      t.duration = U.parseDuration(get(r, 'duration'), hpd, dpw);
      const rs = get(r, 'start'), rf = get(r, 'finish');
      t._start = U.parseAnyDate(rs, opts.dateOrder);
      t._finish = U.parseAnyDate(rf, opts.dateOrder);
      // Primavera exports flag actual dates with a trailing "A"
      const as = U.parseAnyDate(get(r, 'actualStart'), opts.dateOrder) || (/\sA$/.test(str(rs)) ? t._start : null);
      const af = U.parseAnyDate(get(r, 'actualFinish'), opts.dateOrder) || (/\sA$/.test(str(rf)) ? t._finish : null);
      if (as) t.actualStart = as;
      if (af) { t.actualFinish = af; if (!t.actualStart) t.actualStart = t._start || af; }
      const mh = num(get(r, 'manhours'));
      if (mh != null) t.manhours = mh;
      const crew = num(get(r, 'crew'));
      if (crew != null) t.crew = crew;
      const res = str(get(r, 'resource'));
      if (res) t.resource = res;
      let pct = num(get(r, 'pct'));
      if (pct != null) { if (pctFraction) pct *= 100; t.pct = U.clamp(Math.round(pct), 0, 100); }
      if (af && t.pct == null) t.pct = 100;
      const notes = str(get(r, 'notes'));
      if (notes) t.notes = notes;
      t._predText = String(get(r, 'preds') == null ? '' : get(r, 'preds'));
      return t;
    });
    const rowTasks = tasks.slice();

    // normalise levels so the smallest is 0 and no row jumps more than one level below the row above
    const minLevel = Math.min(...tasks.map((t) => t.level));
    tasks.forEach((t, i) => { t.level -= minLevel; const prev = i ? tasks[i - 1].level : -1; if (t.level > prev + 1) t.level = prev + 1; });

    // Primavera-style layouts repeat the WBS code on every activity: build a summary row for each WBS branch
    if (groupByWbs) {
      const segs = wbsCodes.map((c) => (c ? c.split('.') : []));
      const nz = segs.filter((p) => p.length);
      let common = 0;
      while (nz.length && nz.every((p) => p.length > common + 1 && p[common] === nz[0][common])) common++;
      const out = [];
      let open = [];
      tasks.forEach((t, i) => {
        const path = segs[i].slice(common);
        let k = 0;
        while (k < open.length && k < path.length && open[k] === path[k]) k++;
        open = open.slice(0, k);
        for (; k < path.length; k++) { open.push(path[k]); out.push({ name: segs[i].slice(0, common + k + 1).join('.'), level: k, preds: [] }); }
        t.level = path.length;
        out.push(t);
      });
      tasks = out;
      tasks.forEach((t, i) => { t.id = i + 1; });
    }

    // predecessor resolution: by imported ID, then WBS code, then row number
    const byIdIn = new Map(), byWbs = new Map();
    rowTasks.forEach((t) => { if (t._idIn) byIdIn.set(t._idIn, t); if (t._wbsIn) byWbs.set(t._wbsIn, t); });
    const useIds = has('id') && byIdIn.size > 0;
    const plainRefs = (tok) => {
      const parts = tok.split(/\s+/);
      return parts.length > 1 && parts.every((p) => /^[\w.]+$/.test(p) && !/^(fs|ss|ff|sf)$/i.test(p) && !/^\d+(\.\d+)?[a-z]+$/i.test(p)) ? parts : [tok];
    };
    let badCount = 0;
    rowTasks.forEach((t) => {
      t._predText.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).flatMap(plainRefs).forEach((tok) => {
        const m = tok.match(/^([\w.]+?)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*([a-z]*))?$/i);
        if (!m) { badCount++; return; }
        const ref = m[1];
        let q = useIds ? byIdIn.get(ref) : null;
        if (!q && byWbs.has(ref) && !/^\d+$/.test(ref)) q = byWbs.get(ref); // a bare number is a row number, not WBS "2"
        if (!q && /^\d+$/.test(ref) && !useIds) q = rowTasks[+ref - 1];
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
    // Status date: the latest date the sheet's progress vouches for (actual dates, finished rows, started rows).
    // With no progress recorded, the plan is shown as written rather than moving unstarted work to today.
    const dated = [];
    tasks.forEach((t) => { if (t._start) dated.push(t._start); if (t._finish && t._finish !== t._start) dated.push(t._finish); });
    let progressDate = '';
    tasks.forEach((t) => {
      [t.actualStart, t.actualFinish, t.pct >= 100 ? t._finish : '', t.pct > 0 ? t._start : ''].forEach((d) => { if (d && d > progressDate) progressDate = d; });
    });
    const anyProgress = tasks.some((t) => t.pct > 0 || t.actualStart);
    const today = U.todayISO();
    const statusDate = anyProgress ? (progressDate && progressDate < today ? progressDate : null) : (startDate && startDate < today ? startDate : null);
    tasks.forEach((t) => {
      if (t.duration == null && t._start && t._finish && opts.calendar) {
        const c = U.Calendar(startDate || t._start, opts.calendar);
        t.duration = Math.max(0, c.workdays(t._start, t._finish));
      }
      if (t.duration == null) t.duration = t.manhours && t.crew ? null : 1;
      if (t.duration == null) t.effortDriven = true;
      if (t._start && !t.actualStart && (opts.lockDates || !anyPreds)) t.constraintDate = t._start;
      delete t._start; delete t._finish; delete t._predText; delete t._wbsIn; delete t._idIn;
    });
    // Working week: weekend dates in the sheet mean the team works those days.
    const dows = [0, 0, 0, 0, 0, 0, 0];
    dated.forEach((d) => { dows[U.parseISO(d).getUTCDay()]++; });
    const total = dated.length;
    const workDays = [1, 2, 3, 4, 5].concat(dows[6] >= Math.max(2, total * 0.04) ? [6] : [], dows[0] >= Math.max(2, total * 0.04) ? [0] : []).sort();
    return { tasks, startDate, statusDate, workDays: total >= 4 ? workDays : null, hierarchy: how, warnings };
  }

  /* Day/month order from text dates: a first number above 12 means DMY, a second above 12 means MDY. */
  function guessDateOrder(rows, map) {
    let dmy = 0, mdy = 0;
    ['start', 'finish', 'actualStart', 'actualFinish'].forEach((k) => {
      if (map[k] == null || map[k] === '') return;
      rows.forEach((r) => {
        const m = String((r && r[map[k]]) == null ? '' : r[map[k]]).match(/^\D*?(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
        if (!m) return;
        if (+m[1] > 12) dmy++;
        if (+m[2] > 12) mdy++;
      });
    });
    return dmy > mdy ? 'DMY' : mdy > dmy ? 'MDY' : null;
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
      t._summary = childTxt(el, 'Summary') === '1';
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
      if (!t.preds.length && !t.constraintDate && !t.actualStart && !t._summary && t._start) t.constraintDate = t._start;
      delete t._links; delete t._summary;
    });
    const starts = tasks.map((t) => t._start).filter(Boolean).sort();
    tasks.forEach((t) => delete t._start);
    const projStart = (childTxt(root, 'StartDate') || starts[0] || U.todayISO()).slice(0, 10);
    // drop constraints equal to project start, they add nothing
    tasks.forEach((t) => { if (t.constraintDate && t.constraintDate <= projStart) delete t.constraintDate; });
    const mpw = parseFloat(childTxt(root, 'MinutesPerWeek')) || mpd * 5;
    const dpw = Math.round(mpw / mpd);
    let wd = dpw >= 7 ? [0, 1, 2, 3, 4, 5, 6] : dpw === 6 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    // project calendar: working weekdays and non-working exception days (holidays)
    const holidays = [];
    const calUID = childTxt(root, 'CalendarUID') || '1';
    const calEl = [...root.getElementsByTagName('Calendar')].find((c) => childTxt(c, 'UID') === calUID);
    if (calEl) {
      const addRange = (tp, working) => {
        if (working) return;
        const from = U.parseISO(txt(tp, 'FromDate').slice(0, 10)), to = U.parseISO(txt(tp, 'ToDate').slice(0, 10));
        if (!from || !to) return;
        for (let d = from, n = 0; d <= to && n < 400; d = new Date(d.getTime() + 864e5), n++) holidays.push(U.toISO(d));
      };
      const weekDays = [...calEl.getElementsByTagName('WeekDay')].filter((w) => w.parentNode.parentNode === calEl);
      const set = new Set(wd);
      weekDays.forEach((w) => {
        const type = +childTxt(w, 'DayType'), working = childTxt(w, 'DayWorking') === '1';
        if (type >= 1 && type <= 7) { if (working) set.add(type - 1); else set.delete(type - 1); }
        else if (type === 0) [...w.getElementsByTagName('TimePeriod')].forEach((tp) => addRange(tp, working));
      });
      if (set.size) wd = [...set].sort();
      [...calEl.getElementsByTagName('Exception')].forEach((ex) => {
        const tp = ex.getElementsByTagName('TimePeriod')[0];
        if (tp) addRange(tp, childTxt(ex, 'DayWorking') === '1');
      });
    }
    const name = childTxt(root, 'Title') || childTxt(root, 'Name') || 'Imported MS Project schedule';
    const statusDate = childTxt(root, 'StatusDate').slice(0, 10);
    return {
      name: name.replace(/\.xml$/i, ''),
      startDate: projStart,
      statusDate: statusDate && statusDate > '1984' ? statusDate : undefined,
      calendar: { workDays: wd, hoursPerDay: hpd, holidays: [...new Set(holidays)].sort() },
      tasks,
    };
  }

  // ---------- Primavera P6 XER (tab-separated tables)
  function parseXER(text) {
    if (!/^ERMHDR/.test(text)) throw new Error('This is not a Primavera P6 .xer export.');
    const tables = {};
    let cur = null, fields = null;
    text.split(/\r?\n/).forEach((line) => {
      const parts = line.split('\t');
      if (parts[0] === '%T') { cur = parts[1]; tables[cur] = []; fields = null; }
      else if (parts[0] === '%F') fields = parts.slice(1);
      else if (parts[0] === '%R' && cur && fields) {
        const row = {};
        fields.forEach((f, i) => { row[f] = parts[i + 1] == null ? '' : parts[i + 1]; });
        tables[cur].push(row);
      }
    });
    const T = (n) => tables[n] || [];
    const tasksIn = T('TASK');
    if (!tasksIn.length) throw new Error('No activities were found in this XER file.');
    // pick the project with the most activities
    const counts = {};
    tasksIn.forEach((t) => { counts[t.proj_id] = (counts[t.proj_id] || 0) + 1; });
    const projId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const proj = T('PROJECT').find((p) => p.proj_id === projId) || {};
    const cal = T('CALENDAR').find((c) => c.default_flag === 'Y') || {};
    const hpd = parseFloat(cal.day_hr_cnt) || 8;
    const day = (s) => (s ? String(s).slice(0, 10) : '');

    const wbs = T('PROJWBS').filter((w) => w.proj_id === projId);
    const root = wbs.find((w) => w.proj_node_flag === 'Y');
    const kids = new Map();
    wbs.forEach((w) => { if (w !== root) { const k = w.parent_wbs_id; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(w); } });
    kids.forEach((l) => l.sort((a, b) => (+a.seq_num || 0) - (+b.seq_num || 0) || String(a.wbs_short_name).localeCompare(b.wbs_short_name)));
    const actsByWbs = new Map();
    tasksIn.filter((t) => t.proj_id === projId).forEach((t) => { if (!actsByWbs.has(t.wbs_id)) actsByWbs.set(t.wbs_id, []); actsByWbs.get(t.wbs_id).push(t); });
    actsByWbs.forEach((l) => l.sort((a, b) => (a.target_start_date || '').localeCompare(b.target_start_date || '') || String(a.task_code).localeCompare(b.task_code)));

    const rsrcName = new Map(T('RSRC').map((r) => [r.rsrc_id, r.rsrc_name || r.rsrc_short_name]));
    const assign = new Map();
    T('TASKRSRC').forEach((a) => {
      if (!assign.has(a.task_id)) assign.set(a.task_id, { names: [], qty: 0 });
      const x = assign.get(a.task_id);
      if (rsrcName.has(a.rsrc_id)) x.names.push(rsrcName.get(a.rsrc_id));
      x.qty += parseFloat(a.target_qty) || 0;
    });

    const out = [];
    const idOf = new Map();
    const addAct = (t, level) => {
      const o = { id: out.length + 1, name: t.task_name || t.task_code, level, preds: [] };
      if (t.task_code) o.notes = 'Activity ID ' + t.task_code;
      const ms = /Mile/.test(t.task_type || '');
      o.duration = ms ? 0 : Math.round(((parseFloat(t.target_drtn_hr_cnt) || 0) / hpd) * 2) / 2;
      const pct = parseFloat(t.phys_complete_pct);
      if (pct) o.pct = pct;
      if (t.act_start_date) o.actualStart = day(t.act_start_date);
      if (t.act_end_date) o.actualFinish = day(t.act_end_date);
      if (t.status_code === 'TK_Complete') o.pct = 100;
      const a = assign.get(t.task_id);
      const work = parseFloat(t.target_work_qty) || (a ? a.qty : 0);
      if (work) o.manhours = Math.round(work * 100) / 100;
      if (a && a.names.length) o.resource = [...new Set(a.names)].join(', ');
      if ((t.cstr_type === 'CS_MSOA' || t.cstr_type === 'CS_MSO') && t.cstr_date) o.constraintDate = day(t.cstr_date);
      o._start = day(t.target_start_date || t.early_start_date);
      idOf.set(t.task_id, o.id);
      out.push(o);
    };
    const walk = (parentId, level) => {
      (kids.get(parentId) || []).forEach((w) => {
        out.push({ id: out.length + 1, name: w.wbs_name || w.wbs_short_name, level, preds: [] });
        (actsByWbs.get(w.wbs_id) || []).forEach((t) => addAct(t, level + 1));
        walk(w.wbs_id, level + 1);
      });
    };
    if (root) (actsByWbs.get(root.wbs_id) || []).forEach((t) => addAct(t, 0));
    walk(root ? root.wbs_id : '', 0);
    // activities whose WBS was not found
    tasksIn.filter((t) => t.proj_id === projId && !idOf.has(t.task_id)).forEach((t) => addAct(t, 0));
    // drop empty WBS nodes (no activities underneath)
    const keep = out.filter((o, i) => o.duration !== undefined || (out[i + 1] && out[i + 1].level > o.level));

    const typeMap = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };
    T('TASKPRED').forEach((p) => {
      const s = idOf.get(p.task_id), q = idOf.get(p.pred_task_id);
      if (!s || !q) return;
      const succ = out[s - 1];
      succ.preds.push({ id: q, type: typeMap[p.pred_type] || 'FS', lag: Math.round(((parseFloat(p.lag_hr_cnt) || 0) / hpd) * 2) / 2 });
    });
    // renumber ids after dropping empty WBS nodes
    const remap = new Map(keep.map((o, i) => [o.id, i + 1]));
    keep.forEach((o) => { o.id = remap.get(o.id); o.preds = o.preds.filter((p) => remap.has(p.id)).map((p) => Object.assign(p, { id: remap.get(p.id) })); });
    const projStart = day(proj.plan_start_date || proj.last_recalc_date) || keep.map((o) => o._start).filter(Boolean).sort()[0] || U.todayISO();
    keep.forEach((o) => {
      if (o.duration !== undefined && !o.preds.length && !o.constraintDate && !o.actualStart && o._start && o._start > projStart) o.constraintDate = o._start;
      delete o._start;
    });
    // fix levels after removing nodes
    keep.forEach((o, i) => { const prev = i ? keep[i - 1].level : -1; if (o.level > prev + 1) o.level = prev + 1; });
    const sd = day(proj.last_recalc_date);
    return {
      name: proj.proj_short_name || 'Imported Primavera schedule',
      startDate: projStart,
      statusDate: sd || undefined,
      calendar: { workDays: [1, 2, 3, 4, 5], hoursPerDay: hpd, holidays: [] },
      tasks: keep,
    };
  }

  function parseBackup(text) {
    const p = JSON.parse(text);
    if (!p || !Array.isArray(p.tasks)) throw new Error('This file is not a Planline project backup.');
    return p;
  }

    /* Rows pasted from Excel, Google Sheets or a web table (tab separated). */
  function readPasted(text) {
    const rows = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
    if (rows.length < 2) return { kind: 'error', message: 'Paste at least a header row and one task row.' };
    return { kind: 'table', sheets: { Pasted: rows }, sheetNames: ['Pasted'] };
  }

  return { FIELDS, readFile, readPasted, detectHeader, autoMap, guessDateOrder, buildTasks, parseMSPDI, parseXER, parseBackup };
})();
