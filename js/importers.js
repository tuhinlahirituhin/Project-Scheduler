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

  return { FIELDS, readFile, readPasted, detectHeader, autoMap, buildTasks, parseMSPDI, parseXER, parseBackup };
})();
