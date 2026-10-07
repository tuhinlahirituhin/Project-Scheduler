/* Application shell: storage, editing, task grid, details panel, views and dialogs. */
window.PS = window.PS || {};

(function () {
  const U = PS.util;
  const S = PS.schedule;
  const CFG = window.PS_CONFIG || {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const COMPUTED = new Set(['es', 'ef', 'ls', 'lf', 'tf', 'critical', 'start', 'finish', 'status', 'milestone']);
  const ui = Object.assign({ zoom: 'week', gridW: 58, details: true, view: 'schedule' }, U.store.get('ps.ui', {}));
  const app = {
    project: null, res: null, selected: new Set(), anchor: null, undo: [], redo: [], filter: '', focus: null, detailFocus: null,
  };
  PS.app = { norms: () => getNorms() };

  // ---------------------------------------------------------------- storage
  const clean = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k.startsWith('_') || COMPUTED.has(k) ? undefined : v)));
  function index() { return U.store.get('ps.index', []); }
  function saveIndex(list) { U.store.set('ps.index', list); }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    $('#saved').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      const p = app.project;
      p.updated = Date.now();
      recordHistory();
      const ok = U.store.set('ps.p.' + p.id, clean(p));
      const list = index().filter((x) => x.id !== p.id);
      list.unshift({ id: p.id, name: p.name, updated: p.updated });
      saveIndex(list);
      U.store.set('ps.current', p.id);
      $('#saved').textContent = ok ? 'Saved in this browser' : 'Not saved: browser storage is blocked or full. Export a backup.';
    }, 250);
  }
  function recordHistory() {
    const p = app.project, r = app.res;
    if (!r || !r.leaves.length) return;
    const A = PS.analytics.summary(p, r);
    if (A.actualPct <= 0 && !(p.history || []).length) return;
    p.history = (p.history || []).filter((h) => h.date !== r.statusISO);
    p.history.push({ date: r.statusISO, earned: U.round(A.earnedMH, 1), pct: U.round(A.actualPct, 2) });
    p.history.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function loadProject(id) { return U.store.get('ps.p.' + id, null); }
  function newProject(name, extra) {
    return Object.assign({
      id: U.uid(), name: name || 'Untitled project', startDate: U.todayISO(), statusDate: U.todayISO(),
      calendar: { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] }, productivityFactor: 1,
      tasks: [], history: [], created: Date.now(), updated: Date.now(),
    }, extra || {});
  }
  function normalise(p) {
    p.calendar = Object.assign({ workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] }, p.calendar || {});
    p.tasks = (p.tasks || []).map((t, i) => Object.assign({ id: i + 1, name: '', level: 0, preds: [] }, t));
    const ids = new Set();
    p.tasks.forEach((t) => { if (ids.has(t.id)) t.id = Math.max(...ids) + 1; ids.add(t.id); });
    p.productivityFactor = Number(p.productivityFactor) || 1;
    p.history = p.history || [];
    if (!p.statusDate) p.statusDate = U.todayISO();
    if (!p.startDate) p.startDate = U.todayISO();
    return p;
  }
  function openProject(p) {
    app.project = normalise(p);
    app.undo = []; app.redo = []; app.selected = new Set(); app.anchor = null;
    recompute();
    save();
    renderAll();
    requestAnimationFrame(() => PS.gantt.scrollTo($('#gantt-pane'), app.res.statusISO));
  }

  function getNorms() { return U.store.get('ps.norms', null) || PS.DEFAULT_NORMS.map((n) => Object.assign({}, n)); }
  function setNorms(list) { U.store.set('ps.norms', list); }

  // ---------------------------------------------------------------- editing core
  function recompute() { app.res = S.compute(app.project); }
  function snapshot() { return JSON.stringify(clean(app.project)); }
  function mutate(fn, opts) {
    app.undo.push(snapshot());
    if (app.undo.length > 80) app.undo.shift();
    app.redo = [];
    fn();
    recompute();
    save();
    if (!(opts && opts.quiet)) renderAll();
  }
  function undo() {
    if (!app.undo.length) return toast('Nothing to undo');
    app.redo.push(snapshot());
    app.project = normalise(JSON.parse(app.undo.pop()));
    recompute(); save(); renderAll(); toast('Undone');
  }
  function redo() {
    if (!app.redo.length) return toast('Nothing to redo');
    app.undo.push(snapshot());
    app.project = normalise(JSON.parse(app.redo.pop()));
    recompute(); save(); renderAll(); toast('Redone');
  }
  const tasks = () => app.project.tasks;
  const byId = (id) => app.res.byId.get(id);
  const nextId = () => tasks().reduce((m, t) => Math.max(m, t.id), 0) + 1;
  const dpw = () => (app.project.calendar.workDays || [1, 2, 3, 4, 5]).length;
  const hpd = () => Number(app.project.calendar.hoursPerDay) || 8;
  function blockEnd(i) { // index after the last descendant of tasks()[i]
    const T = tasks(), lvl = T[i].level;
    let j = i + 1;
    while (j < T.length && T[j].level > lvl) j++;
    return j;
  }
  function selectedInOrder() { return tasks().filter((t) => app.selected.has(t.id)); }

  function setPct(t, v) {
    v = U.clamp(Math.round(Number(v) || 0), 0, 100);
    t.pct = v;
    const status = app.project.statusDate || U.todayISO();
    if (v > 0 && !t.actualStart) t.actualStart = t.start && t.start < status ? t.start : status;
    if (v === 0) { delete t.actualStart; delete t.actualFinish; }
    if (v >= 100 && !t.actualFinish) {
      t.actualFinish = t.finish && t.finish < status ? t.finish : status;
      if (t.actualFinish < t.actualStart) t.actualFinish = t.actualStart;
    }
    if (v < 100) delete t.actualFinish;
  }

  function applyNorm(t) {
    const n = getNorms().find((x) => x.id === t.normId);
    if (!n) return;
    t.manhours = U.round((Number(t.qty) || 0) * n.mh * (Number(app.project.productivityFactor) || 1), 2);
    if (t.crew > 0) t.effortDriven = true;
  }

  function commitCell(id, f, raw) {
    const t = byId(id);
    if (!t) return;
    const err = (m) => { toast(m); renderGrid(); };
    switch (f) {
      case 'name': mutate(() => { t.name = raw.trim(); }); break;
      case 'duration': {
        const v = U.parseDuration(raw, hpd(), dpw());
        if (v == null) return err('Type a duration such as 5, 5d, 2w or 16h');
        mutate(() => { t.duration = v; t.effortDriven = false; });
        break;
      }
      case 'start':
        mutate(() => {
          if (!raw) { delete t.constraintDate; return; }
          if (t.actualStart) t.actualStart = raw; else t.constraintDate = raw;
        });
        break;
      case 'finish': {
        if (!raw) return renderGrid();
        const d = app.res.cal.workdays(t.start, raw);
        if (d < 0) return err('Finish cannot be before the start date');
        mutate(() => {
          if (t.actualFinish) t.actualFinish = raw;
          else { t.duration = t.milestone ? 0 : Math.max(1, d); t.effortDriven = false; }
        });
        break;
      }
      case 'preds': {
        const r = S.parsePreds(raw, tasks(), dpw());
        if (r.bad.length) toast('Could not read: ' + r.bad.join(', ') + '. Use row numbers like 3, 5SS+2d');
        mutate(() => { t.preds = r.links.filter((l) => l.id !== t.id); });
        break;
      }
      case 'manhours': {
        const v = raw === '' ? 0 : Number(String(raw).replace(/,/g, ''));
        if (isNaN(v) || v < 0) return err('Man-hours must be a number');
        mutate(() => { t.manhours = v; delete t.normId; delete t.qty; });
        break;
      }
      case 'crew': {
        const v = raw === '' ? 0 : Number(raw);
        if (isNaN(v) || v < 0) return err('Crew must be a number');
        mutate(() => { t.crew = v; });
        break;
      }
      case 'resource': mutate(() => { t.resource = raw.trim(); }); break;
      case 'pct': {
        const v = Number(String(raw).replace('%', ''));
        if (isNaN(v)) return err('% complete must be a number from 0 to 100');
        mutate(() => setPct(t, v));
        break;
      }
      default: break;
    }
  }

  function addTask(milestone) {
    const T = tasks();
    const sel = selectedInOrder();
    let at = T.length, level = 0;
    if (sel.length) {
      const last = sel[sel.length - 1];
      const i = T.indexOf(last);
      at = blockEnd(i);
      level = last.level;
    } else if (T.length) level = T[T.length - 1].level;
    const t = { id: nextId(), name: milestone ? 'New milestone' : 'New task', level, duration: milestone ? 0 : 1, preds: [], pct: 0 };
    mutate(() => { T.splice(at, 0, t); app.selected = new Set([t.id]); app.anchor = t.id; app.focus = { id: t.id, f: 'name', select: true }; });
  }

  function shiftLevel(delta) {
    const T = tasks();
    const sel = selectedInOrder();
    if (!sel.length) return toast('Select a task first');
    const roots = sel.filter((t) => !t._ancestors.some((a) => app.selected.has(a)));
    let moved = false;
    app.undo.push(snapshot()); app.redo = [];
    roots.forEach((t) => {
      const i = T.indexOf(t);
      const end = blockEnd(i);
      if (delta > 0 && (i === 0 || t.level > T[i - 1].level)) return;
      if (delta < 0 && t.level === 0) return;
      for (let k = i; k < end; k++) T[k].level += delta;
      moved = true;
    });
    if (!moved) { app.undo.pop(); return toast(delta > 0 ? 'This task cannot be indented further' : 'This task is already at the top level'); }
    recompute(); save(); renderAll();
  }

  function move(dir) {
    const T = tasks();
    const sel = selectedInOrder();
    if (!sel.length) return toast('Select a task first');
    const t = sel[0];
    const i = T.indexOf(t);
    const end = blockEnd(i);
    const block = T.slice(i, end);
    if (dir < 0) {
      let k = i - 1;
      while (k >= 0 && T[k].level > t.level) k--;
      if (k < 0 || T[k].level < t.level) return;
      mutate(() => { T.splice(i, block.length); T.splice(k, 0, ...block); });
    } else {
      if (end >= T.length || T[end].level !== t.level) return;
      const nEnd = blockEnd(end);
      mutate(() => { T.splice(i, block.length); T.splice(nEnd - block.length, 0, ...block); });
    }
  }

  function linkSelected() {
    const sel = selectedInOrder().filter((t) => !t._summary || true);
    if (sel.length < 2) return toast('Select two or more tasks (Ctrl/Shift + click row numbers), then Link');
    mutate(() => {
      for (let i = 1; i < sel.length; i++) {
        const a = sel[i - 1], b = sel[i];
        if (b._ancestors.includes(a.id) || a._ancestors.includes(b.id)) continue;
        if (!b.preds.some((p) => p.id === a.id)) b.preds.push({ id: a.id, type: 'FS', lag: 0 });
      }
    });
    toast('Linked finish-to-start in row order');
  }
  function unlinkSelected() {
    const sel = selectedInOrder();
    if (!sel.length) return toast('Select a task first');
    mutate(() => {
      if (sel.length === 1) sel[0].preds = [];
      else sel.forEach((t) => { t.preds = t.preds.filter((p) => !app.selected.has(p.id)); });
    });
  }
  function deleteSelected() {
    const T = tasks();
    const sel = selectedInOrder();
    if (!sel.length) return toast('Select a task first');
    const gone = new Set();
    sel.forEach((t) => { const i = T.indexOf(t); for (let k = i; k < blockEnd(i); k++) gone.add(T[k].id); });
    mutate(() => {
      app.project.tasks = T.filter((t) => !gone.has(t.id));
      app.project.tasks.forEach((t) => { t.preds = (t.preds || []).filter((p) => !gone.has(p.id)); });
      app.selected = new Set();
    });
    toast(`Deleted ${gone.size} task${gone.size > 1 ? 's' : ''}. Press Ctrl+Z to undo.`);
  }

  // ---------------------------------------------------------------- rendering
  function renderAll() {
    renderPicker();
    renderErrors();
    if (ui.view === 'schedule') { renderGrid(); renderGantt(); renderDetails(); }
    if (ui.view === 'dashboard') PS.dashboard.render($('#dash'), app.project, app.res);
    if (ui.view === 'norms') renderNorms();
    if (ui.view === 'settings') renderSettings();
    $('#tb-undo').disabled = !app.undo.length;
    $('#tb-redo').disabled = !app.redo.length;
  }

  function renderPicker() {
    const sel = $('#proj-select');
    const list = index();
    if (!list.some((x) => x.id === app.project.id)) list.unshift({ id: app.project.id, name: app.project.name });
    list.forEach((x) => { if (x.id === app.project.id) x.name = app.project.name; });
    sel.innerHTML = list.map((p) => `<option value="${p.id}">${U.esc(p.name)}</option>`).join('') + '<option value="__new">+ New project…</option>';
    sel.value = app.project.id;
  }
  function renderErrors() {
    const e = app.res.errors;
    $('#errbar').hidden = !e.length;
    $('#errbar').textContent = e.join(' ');
  }

  function visibleTasks() {
    const T = tasks();
    const f = app.filter.trim().toLowerCase();
    if (f) {
      const keep = new Set();
      T.forEach((t) => {
        if ((t.name + ' ' + (t.resource || '') + ' ' + t._wbs).toLowerCase().includes(f)) { keep.add(t.id); t._ancestors.forEach((a) => keep.add(a)); }
      });
      return T.filter((t) => keep.has(t.id));
    }
    return T.filter((t) => !t._ancestors.some((a) => byId(a).collapsed));
  }

  const COLS = [
    { k: 'row', label: '#', w: 44 },
    { k: 'wbs', label: 'WBS', w: 56 },
    { k: 'name', label: 'Task name', w: 300 },
    { k: 'duration', label: 'Days', w: 62 },
    { k: 'start', label: 'Start', w: 132 },
    { k: 'finish', label: 'Finish', w: 132 },
    { k: 'preds', label: 'Predecessors', w: 120 },
    { k: 'manhours', label: 'Man-hours', w: 112 },
    { k: 'crew', label: 'Crew', w: 56 },
    { k: 'resource', label: 'Resource', w: 130 },
    { k: 'pct', label: '% done', w: 66 },
    { k: 'tf', label: 'Float', w: 58 },
    { k: 'status', label: 'Status', w: 118 },
  ];

  function renderGrid() {
    const grid = $('#grid');
    const rows = visibleTasks();
    const fmtN = (v) => (v == null || v === '' || isNaN(v) ? '' : U.round(Number(v), 2));
    const resources = [...new Set(tasks().map((t) => t.resource).filter(Boolean))];
    const head = `<thead><tr>${COLS.map((c) => `<th style="width:${c.w}px;min-width:${c.w}px"${c.k === 'row' ? ' class="c-row"' : ''}>${c.label}</th>`).join('')}</tr></thead>`;
    const body = rows.map((t) => {
      const sum = t._summary;
      const ro = sum ? ' readonly tabindex="-1"' : '';
      const cls = [sum ? 'summary' : '', app.selected.has(t.id) ? 'sel' : '', t._cycle ? 'cycle' : ''].join(' ');
      const caret = sum ? `<button type="button" class="caret${t.collapsed ? ' collapsed' : ''}" data-act="toggle" aria-label="${t.collapsed ? 'Expand' : 'Collapse'}"><svg><use href="#i-chev"/></svg></button>` : '<span class="caret-spacer"></span>';
      const norm = t.normId ? `<span class="tag" title="From norms library">norm</span>` : '';
      return `<tr data-id="${t.id}" class="${cls}">
        <td class="c-row">${t._row}</td>
        <td class="c-wbs">${t._wbs}</td>
        <td><div class="namecell" style="padding-left:${t.level * 18}px">${caret}${t.milestone ? '<span class="ms-mark"></span>' : ''}<input class="cell" data-f="name" value="${U.esc(t.name)}" aria-label="Task name"></div></td>
        <td><input class="cell num" data-f="duration" value="${t._dur}"${ro || (t.effortDriven && !sum ? ' title="Calculated from man-hours ÷ (crew × hours per day). Type a value to override."' : '')} aria-label="Duration in working days"></td>
        <td><input class="cell" type="date" data-f="start" value="${t.start || ''}"${ro} aria-label="Start date" title="${t.actualStart ? 'Actual start' : t.constraintDate ? 'Start no earlier than ' + U.fmtDate(t.constraintDate) : 'Scheduled by links'}"></td>
        <td><input class="cell" type="date" data-f="finish" value="${t.finish || ''}"${ro} aria-label="Finish date"></td>
        <td><input class="cell" data-f="preds" value="${U.esc(S.formatPreds(t, app.res.byId))}" aria-label="Predecessors" placeholder=""></td>
        <td><div class="mhcell"><input class="cell num" data-f="manhours" value="${fmtN(sum ? t._mh : t.manhours)}"${ro} aria-label="Man-hours">${norm}</div></td>
        <td><input class="cell num" data-f="crew" value="${sum ? '' : fmtN(t.crew)}"${ro} aria-label="Crew size"></td>
        <td><input class="cell" data-f="resource" list="res-list" value="${U.esc(sum ? '' : t.resource || '')}"${ro} aria-label="Resource"></td>
        <td><input class="cell num" data-f="pct" value="${U.round(t.pct || 0, 1)}"${ro} aria-label="Percent complete"></td>
        <td class="float${t.critical ? ' crit' : ''}">${t.critical ? 'Crit' : t.tf}</td>
        <td><span class="status"><span class="dot ${t.status.replace(' ', '')}"></span>${t.status}</span></td>
      </tr>`;
    }).join('');
    grid.innerHTML = head + `<tbody>${body}<tr class="addrow"><td class="c-row"></td><td colspan="${COLS.length - 1}"><button type="button" data-act="add">+ Add task</button>${!tasks().length ? '<span class="muted small"> or use Import to bring in a spreadsheet or MS Project file</span>' : ''}</td></tr></tbody>`
      + `<datalist id="res-list">${resources.map((r) => `<option value="${U.esc(r)}">`).join('')}</datalist>`;
    if (app.focus) {
      const inp = grid.querySelector(`tr[data-id="${app.focus.id}"] input[data-f="${app.focus.f}"]`);
      if (inp) { inp.focus(); if (app.focus.select && inp.select) inp.select(); }
      app.focus = null;
    }
  }

  function renderGantt() {
    PS.gantt.render($('#gantt-head'), $('#gantt-body'), app.project, app.res, visibleTasks(), {
      zoom: ui.zoom, selected: app.selected,
      onSelect: (id, e) => selectRow(id, e),
    });
  }

  function selectRow(id, e) {
    const vis = visibleTasks();
    if (e && e.shiftKey && app.anchor != null) {
      const a = vis.findIndex((t) => t.id === app.anchor), b = vis.findIndex((t) => t.id === id);
      if (a >= 0 && b >= 0) { app.selected = new Set(vis.slice(Math.min(a, b), Math.max(a, b) + 1).map((t) => t.id)); }
    } else if (e && (e.ctrlKey || e.metaKey)) {
      if (app.selected.has(id)) app.selected.delete(id); else app.selected.add(id);
      app.anchor = id;
    } else {
      app.selected = new Set([id]); app.anchor = id;
    }
    $$('#grid tbody tr[data-id]').forEach((tr) => tr.classList.toggle('sel', app.selected.has(+tr.dataset.id)));
    renderGantt();
    renderDetails();
  }

  // ---------------------------------------------------------------- details panel
  function renderDetails() {
    const box = $('#details');
    const narrow = matchMedia('(max-width: 860px)').matches;
    box.hidden = !ui.details || (narrow && !app.selected.size);
    $('#tb-panel').setAttribute('aria-pressed', ui.details ? 'true' : 'false');
    if (!ui.details) return;
    const sel = selectedInOrder();
    if (!sel.length) {
      box.innerHTML = `<div class="head"><h3>Task details</h3></div>
        <p class="empty-note">Click a row number or a bar to see and edit its details here: man-hour norms, crew, links, progress and notes.</p>
        <div class="calc">Tip: select several rows with Shift or Ctrl and press <b>Link</b> to chain them finish-to-start.</div>`;
      return;
    }
    if (sel.length > 1) {
      const mh = sel.reduce((a, t) => a + (t._summary ? 0 : t._mh), 0);
      box.innerHTML = `<div class="head"><h3>${sel.length} tasks selected</h3></div>
        <div class="calc">Man-hours in selection: <b>${U.fmtNum(mh, 0)}</b></div>
        <label class="field"><span>Set % complete for all selected</span><input type="number" id="d-bulkpct" min="0" max="100" step="5"></label>
        <label class="field"><span>Set resource for all selected</span><input type="text" id="d-bulkres" list="res-list"></label>
        <div class="dlg-foot" style="justify-content:flex-start"><button class="btn" type="button" data-dact="link"><svg><use href="#i-link"/></svg>Link in order</button><button class="btn danger" type="button" data-dact="delete"><svg><use href="#i-trash"/></svg>Delete</button></div>`;
      return;
    }
    const t = sel[0];
    const norms = getNorms();
    const cats = [...new Set(norms.map((n) => n.cat))];
    const n = norms.find((x) => x.id === t.normId);
    const pf = Number(app.project.productivityFactor) || 1;
    const others = tasks().filter((q) => q.id !== t.id && !t._ancestors.includes(q.id) && !q._ancestors.includes(t.id));
    const succs = tasks().filter((q) => (q.preds || []).some((p) => p.id === t.id));
    const linkRows = (t.preds || []).map((p, i) => `<div class="linkrow" data-li="${i}">
        <select data-lf="id" aria-label="Predecessor task">${others.map((q) => `<option value="${q.id}"${q.id === p.id ? ' selected' : ''}>${q._row}. ${U.esc(q.name.slice(0, 40))}</option>`).join('')}</select>
        <select data-lf="type" aria-label="Link type">${S.TYPES.map((x) => `<option${x === p.type ? ' selected' : ''}>${x}</option>`).join('')}</select>
        <input type="number" data-lf="lag" value="${p.lag}" step="1" aria-label="Lag in days" title="Lag (working days, negative = lead)">
        <button class="btn icon ghost" type="button" data-dact="unlink" data-li="${i}" aria-label="Remove link"><svg><use href="#i-trash"/></svg></button>
      </div>`).join('');

    const effort = t._summary ? `<div class="calc">Rolled up from ${t._leaves.length} activities: <b>${U.fmtNum(t._mh, 0)}</b> man-hours, <b>${t._dur}</b> working days, <b>${U.round(t.pct, 1)}%</b> complete.</div>` : `
      <fieldset><legend>Man-hours</legend>
        <label class="field"><span>Industry norm (indicative)</span>
          <select id="d-norm"><option value="">None, I'll enter man-hours</option>
            ${cats.map((c) => `<optgroup label="${U.esc(c)}">${norms.filter((x) => x.cat === c).map((x) => `<option value="${x.id}"${x.id === t.normId ? ' selected' : ''}>${U.esc(x.name)} · ${x.mh} MH/${U.esc(x.unit)}</option>`).join('')}</optgroup>`).join('')}
          </select></label>
        ${n ? `<label class="field"><span>Quantity (${U.esc(n.unit)})</span><input type="number" id="d-qty" min="0" step="any" value="${t.qty || ''}"></label>
          <div class="calc">${U.fmtNum(t.qty || 0, 2)} ${U.esc(n.unit)} × ${n.mh} MH/${U.esc(n.unit)}${pf !== 1 ? ' × ' + pf + ' productivity factor' : ''} = <b>${U.fmtNum(t.manhours || 0, 1)} MH</b></div>` : ''}
        <div class="grid2">
          <label class="field"><span>Man-hours</span><input type="number" id="d-mh" min="0" step="any" value="${t.manhours || ''}"></label>
          <label class="field"><span>Crew size</span><input type="number" id="d-crew" min="0" step="1" value="${t.crew || ''}"></label>
        </div>
        <label class="check"><input type="checkbox" id="d-effort"${t.effortDriven ? ' checked' : ''}> Calculate duration from man-hours</label>
        ${t.effortDriven ? `<div class="calc">${U.fmtNum(t.manhours || 0, 1)} MH ÷ (${t.crew || 0} crew × ${hpd()} h/day) = <b>${t._dur} working days</b></div>` : ''}
      </fieldset>`;

    box.innerHTML = `
      <div class="head"><div><span class="eyebrow">Row ${t._row} · WBS ${t._wbs}${t._summary ? ' · Summary' : t.milestone ? ' · Milestone' : ''}</span></div>
        <button class="btn icon ghost" type="button" data-dact="close" aria-label="Hide details"><svg><use href="#i-panel"/></svg></button></div>
      <label class="field"><span>Name</span><input type="text" id="d-name" value="${U.esc(t.name)}"></label>
      ${effort}
      <fieldset><legend>Dates</legend>
        <div class="grid2">
          <label class="field"><span>Duration (days)</span><input type="number" id="d-dur" min="0" step="0.5" value="${t._dur}"${t._summary || t.effortDriven ? ' disabled' : ''}></label>
          <label class="field"><span>Start no earlier than</span><input type="date" id="d-snet" value="${t.constraintDate || ''}"${t._summary ? ' disabled' : ''}></label>
        </div>
        <div class="calc">Scheduled <b>${U.fmtDate(t.start)}</b> → <b>${U.fmtDate(t.finish)}</b> · ${t.critical ? '<span class="pill bad">Critical path</span>' : `Total float <b>${t.tf} d</b>`}
          ${t.baselineStart ? `<br>Baseline ${U.fmtDate(t.baselineStart)} → ${U.fmtDate(t.baselineFinish)}${t.baselineFinish && t.finish !== t.baselineFinish ? ` (${U.daysBetween(t.baselineFinish, t.finish) > 0 ? '+' : ''}${U.daysBetween(t.baselineFinish, t.finish)} d)` : ''}` : ''}</div>
      </fieldset>
      <fieldset><legend>Predecessors</legend>
        <div class="links">${linkRows || '<span class="empty-note">No predecessors. This task starts at the project start or its own date.</span>'}</div>
        <button class="btn" type="button" data-dact="addlink"${others.length ? '' : ' disabled'}><svg><use href="#i-plus"/></svg>Add predecessor</button>
        <div class="small muted">FS finish→start · SS start→start · FF finish→finish · SF start→finish. Lag in working days.${succs.length ? '<br>Successors: ' + succs.map((q) => q._row).join(', ') : ''}</div>
      </fieldset>
      ${t._summary ? '' : `<fieldset><legend>Progress</legend>
        <div class="grid2" style="align-items:end"><label class="field"><span>% complete</span><input type="range" id="d-pct-r" min="0" max="100" step="5" value="${t.pct || 0}"></label>
          <label class="field"><span>&nbsp;</span><input type="number" id="d-pct" min="0" max="100" value="${U.round(t.pct || 0, 1)}"></label></div>
        <div class="grid2">
          <label class="field"><span>Actual start</span><input type="date" id="d-as" value="${t.actualStart || ''}"></label>
          <label class="field"><span>Actual finish</span><input type="date" id="d-af" value="${t.actualFinish || ''}"></label>
        </div>
        <div class="calc">Planned by status date: <b>${Math.round(t._planFrac * 100)}%</b> · Status: <b>${t.status}</b>${t._mh ? ` · Earned <b>${U.fmtNum(t._ev, 0)}</b> MH` : ''}</div>
      </fieldset>
      <label class="field"><span>Resource / crew name</span><input type="text" id="d-res" list="res-list" value="${U.esc(t.resource || '')}"></label>`}
      <label class="field"><span>Notes</span><textarea id="d-notes" rows="3">${U.esc(t.notes || '')}</textarea></label>`;
    if (app.detailFocus) { const f = document.getElementById(app.detailFocus); if (f) f.focus(); app.detailFocus = null; }
  }

  function onDetailChange(e) {
    const sel = selectedInOrder();
    if (!sel.length) return;
    const id = e.target.id;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (sel.length > 1) {
      if (id === 'd-bulkpct' && v !== '') mutate(() => sel.forEach((t) => { if (!t._summary) setPct(t, v); }));
      if (id === 'd-bulkres') mutate(() => sel.forEach((t) => { if (!t._summary) t.resource = v.trim(); }));
      return;
    }
    const t = sel[0];
    const lr = e.target.closest('.linkrow');
    if (lr) {
      const i = +lr.dataset.li, f = e.target.dataset.lf;
      mutate(() => {
        const p = t.preds[i];
        if (f === 'id') p.id = +v; else if (f === 'type') p.type = v; else p.lag = Number(v) || 0;
      });
      return;
    }
    const num = (x) => (x === '' ? 0 : Number(x));
    const map = {
      'd-name': () => { t.name = v.trim(); },
      'd-norm': () => { if (v) { t.normId = v; if (t.qty == null) t.qty = 0; applyNorm(t); } else { delete t.normId; delete t.qty; } },
      'd-qty': () => { t.qty = num(v); applyNorm(t); },
      'd-mh': () => { t.manhours = num(v); delete t.normId; delete t.qty; },
      'd-crew': () => { t.crew = num(v); },
      'd-effort': () => { t.effortDriven = !!v; if (v && !(t.crew > 0)) { t.crew = 1; toast('Crew set to 1. Change it to match your gang size.'); } },
      'd-dur': () => { t.duration = Math.max(0, num(v)); t.effortDriven = false; },
      'd-snet': () => { if (v) t.constraintDate = v; else delete t.constraintDate; },
      'd-pct': () => setPct(t, v),
      'd-pct-r': () => setPct(t, v),
      'd-as': () => { if (v) t.actualStart = v; else { delete t.actualStart; delete t.actualFinish; t.pct = 0; } },
      'd-af': () => { if (v) { t.actualFinish = v; if (!t.actualStart) t.actualStart = t.start; t.pct = 100; } else { delete t.actualFinish; if (t.pct >= 100) t.pct = 90; } },
      'd-res': () => { t.resource = v.trim(); },
      'd-notes': () => { t.notes = v; },
    };
    if (map[id]) {
      if (id === 'd-qty' || id === 'd-norm') app.detailFocus = id === 'd-norm' && v ? 'd-qty' : null;
      mutate(map[id]);
    }
  }

  function onDetailClick(e) {
    const b = e.target.closest('[data-dact]');
    if (!b) return;
    const sel = selectedInOrder();
    const t = sel[0];
    switch (b.dataset.dact) {
      case 'close': ui.details = false; U.store.set('ps.ui', ui); renderDetails(); break;
      case 'link': linkSelected(); break;
      case 'delete': deleteSelected(); break;
      case 'unlink': mutate(() => { t.preds.splice(+b.dataset.li, 1); }); break;
      case 'addlink': {
        const prev = tasks()[tasks().indexOf(t) - 1];
        const cand = tasks().filter((q) => q.id !== t.id && !t._ancestors.includes(q.id) && !q._ancestors.includes(t.id) && !t.preds.some((p) => p.id === q.id));
        if (!cand.length) return toast('No other task is available to link');
        const pick = prev && cand.includes(prev) ? prev : cand[cand.length - 1];
        mutate(() => { t.preds.push({ id: pick.id, type: 'FS', lag: 0 }); });
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- norms view
  let normFilter = '';
  function renderNorms() {
    const norms = getNorms();
    const f = normFilter.toLowerCase();
    const list = norms.map((n, i) => ({ n, i })).filter(({ n }) => !f || (n.cat + ' ' + n.name + ' ' + n.unit).toLowerCase().includes(f));
    const used = new Map();
    tasks().forEach((t) => { if (t.normId) used.set(t.normId, (used.get(t.normId) || 0) + 1); });
    $('#norms').innerHTML = `
      <div class="dash-head"><div><span class="eyebrow">Library</span><h2>Man-hour norms</h2></div>
        <div class="norm-tools">
          <input type="search" id="n-filter" placeholder="Search norms" value="${U.esc(normFilter)}" aria-label="Search norms">
          <button class="btn" type="button" data-nact="add"><svg><use href="#i-plus"/></svg>Add norm</button>
          <button class="btn" type="button" data-nact="export"><svg><use href="#i-download"/></svg>Export</button>
          <label class="btn" for="n-import"><svg><use href="#i-upload"/></svg>Import</label><input type="file" id="n-import" accept=".xlsx,.xls,.csv" hidden>
          <button class="btn ghost" type="button" data-nact="reset">Restore defaults</button>
        </div></div>
      <div class="note">These figures are <b>indicative planning values</b>, compiled from commonly quoted ranges. Real productivity depends on country, site conditions, crew skill, equipment and method. Replace them with your own historical rates, or use the productivity factor in Project settings (currently <b>${app.project.productivityFactor || 1}</b>) to scale all of them. Pick a norm in a task's details panel and enter a quantity to get its man-hours.</div>
      <div class="card wide table-scroll" style="padding:4px 8px">
        <table class="plain"><thead><tr><th style="min-width:170px">Category</th><th style="min-width:280px">Activity</th><th style="min-width:90px">Unit</th><th class="num" style="min-width:110px">MH per unit</th><th class="num">Used</th><th></th></tr></thead>
        <tbody>${list.map(({ n, i }) => `<tr data-ni="${i}">
          <td><input class="cell" data-nf="cat" value="${U.esc(n.cat)}" list="cat-list" aria-label="Category"></td>
          <td><input class="cell" data-nf="name" value="${U.esc(n.name)}" aria-label="Activity"></td>
          <td><input class="cell" data-nf="unit" value="${U.esc(n.unit)}" aria-label="Unit"></td>
          <td><input class="cell num" data-nf="mh" value="${n.mh}" aria-label="Man-hours per unit"></td>
          <td class="num muted">${used.get(n.id) || ''}</td>
          <td><button class="btn icon ghost" type="button" data-nact="del" aria-label="Delete norm"><svg><use href="#i-trash"/></svg></button></td>
        </tr>`).join('')}</tbody></table>
        <datalist id="cat-list">${[...new Set(norms.map((n) => n.cat))].map((c) => `<option value="${U.esc(c)}">`).join('')}</datalist>
      </div>`;
  }
  function bindNorms() {
    const root = $('#norms');
    root.addEventListener('input', (e) => { if (e.target.id === 'n-filter') { normFilter = e.target.value; const pos = e.target.selectionStart; renderNorms(); const f = $('#n-filter'); f.focus(); f.setSelectionRange(pos, pos); } });
    root.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-ni]');
      if (tr && e.target.dataset.nf) {
        const norms = getNorms();
        const n = norms[+tr.dataset.ni];
        const f = e.target.dataset.nf;
        if (f === 'mh') { const v = Number(e.target.value); if (isNaN(v) || v < 0) { toast('Enter a number'); return renderNorms(); } n.mh = v; } else n[f] = e.target.value.trim();
        setNorms(norms);
        toast('Norm saved. Tasks already using it keep their man-hours until you change their quantity.');
      }
      if (e.target.id === 'n-import' && e.target.files[0]) importNorms(e.target.files[0]);
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-nact]');
      if (!b) return;
      const norms = getNorms();
      if (b.dataset.nact === 'add') {
        norms.unshift({ id: 'u-' + U.uid(), cat: 'My norms', name: 'New activity', unit: 'unit', mh: 1 });
        setNorms(norms); normFilter = ''; renderNorms();
        const inp = $('#norms tr[data-ni="0"] input[data-nf="name"]'); if (inp) { inp.focus(); inp.select(); }
      }
      if (b.dataset.nact === 'del') { norms.splice(+b.closest('tr').dataset.ni, 1); setNorms(norms); renderNorms(); }
      if (b.dataset.nact === 'export') safe(() => PS.exporters.normsExcel(norms));
      if (b.dataset.nact === 'reset') {
        if (await confirmDlg('Restore the built-in norms?', 'Your own edits and added norms will be replaced by the original library.', 'Restore')) { U.store.del('ps.norms'); renderNorms(); toast('Built-in norms restored'); }
      }
    });
  }
  async function importNorms(file) {
    const r = await PS.importers.readFile(file);
    if (r.kind !== 'table') return toast(r.message || 'Use an Excel or CSV file with Category, Activity, Unit and Man-hours per unit columns');
    const rows = r.sheets[r.sheetNames[0]];
    const h = rows[0].map((x) => String(x).toLowerCase());
    const ci = (re) => h.findIndex((x) => re.test(x));
    const c = { cat: ci(/categ|discipline|trade/), name: ci(/activ|item|desc|name/), unit: ci(/^unit|uom/), mh: ci(/mh|man|hour|norm|rate/) };
    if (c.name < 0 || c.mh < 0) return toast('Could not find Activity and Man-hours columns in the first row');
    const add = rows.slice(1).filter((r2) => r2[c.name] !== '' && !isNaN(parseFloat(r2[c.mh]))).map((r2) => ({
      id: 'u-' + U.uid(), cat: c.cat >= 0 ? String(r2[c.cat] || 'Imported') : 'Imported', name: String(r2[c.name]), unit: c.unit >= 0 ? String(r2[c.unit] || 'unit') : 'unit', mh: parseFloat(r2[c.mh]),
    }));
    setNorms(getNorms().concat(add));
    renderNorms();
    toast(`Added ${add.length} norms`);
  }

  // ---------------------------------------------------------------- settings view
  function renderSettings() {
    const p = app.project, r = app.res;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wd = p.calendar.workDays;
    $('#settings').innerHTML = `
      <div class="dash-head"><div><span class="eyebrow">Settings</span><h2>${U.esc(p.name)}</h2></div>
        <div class="meta">${r.leaves.length} activities · ${U.fmtDate(r.startISO)} → ${U.fmtDate(r.finishISO)}</div></div>
      <div class="settings-grid">
        <div class="card"><h3>Project</h3>
          <label class="field"><span>Project name</span><input type="text" id="s-name" value="${U.esc(p.name)}"></label>
          <label class="field"><span>Project start date</span><input type="date" id="s-start" value="${p.startDate}"></label>
          <label class="field"><span>Status date (progress is measured up to this date)</span>
            <span style="display:flex;gap:6px"><input type="date" id="s-status" value="${p.statusDate}" style="flex:1"><button class="btn" type="button" data-sact="today">Today</button></span></label>
          <label class="check"><input type="checkbox" id="s-resched"${p.rescheduleFromStatus === false ? '' : ' checked'}> Move unfinished work to after the status date</label>
          <p class="small muted" style="margin:0">With this on, work that is not done yet cannot sit in the past, so the forecast finish stays realistic.</p>
        </div>
        <div class="card"><h3>Working calendar</h3>
          <div class="field"><span>Working days</span><div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" data-wd="${d}"${wd.includes(d) ? ' checked' : ''}><span>${DAYS[d]}</span></label>`).join('')}</div></div>
          <label class="field"><span>Working hours per day</span><input type="number" id="s-hpd" min="1" max="24" step="0.5" value="${p.calendar.hoursPerDay}"></label>
          <label class="field"><span>Holidays (one date per line)</span><textarea id="s-hol" rows="4" placeholder="2026-12-25">${(p.calendar.holidays || []).join('\n')}</textarea></label>
        </div>
        <div class="card"><h3>Man-hour norms</h3>
          <label class="field"><span>Productivity factor</span><input type="number" id="s-pf" min="0.1" max="5" step="0.05" value="${p.productivityFactor || 1}"></label>
          <p class="small muted" style="margin:0">Multiplies every norm. Use 1.2 for a difficult site (20% more man-hours), 0.9 for a very productive crew.</p>
          <button class="btn" type="button" data-sact="reapply">Re-apply norms to all tasks that use them</button>
        </div>
        <div class="card"><h3>Baseline</h3>
          <p class="small" style="margin:0">${r.hasBaseline ? `A baseline is saved. Baseline finish: <b>${U.fmtDate(r.baselineFinishISO)}</b>, current forecast <b>${U.fmtDate(r.finishISO)}</b>.` : 'No baseline yet. Save one when the plan is approved, so the dashboard can show planned vs actual and finish variance.'}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" data-sact="baseline">${r.hasBaseline ? 'Replace baseline with current plan' : 'Save baseline'}</button>
          ${r.hasBaseline ? '<button class="btn" type="button" data-sact="clearbl">Clear baseline</button>' : ''}</div>
        </div>
        <div class="card"><h3>Your data</h3>
          <p class="small muted" style="margin:0">Everything is stored in this browser on this device. Nothing is uploaded. Clearing browser data deletes it, so keep a backup.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-sact="backup"><svg><use href="#i-download"/></svg>Download backup</button>
          <button class="btn danger" type="button" data-sact="delete"><svg><use href="#i-trash"/></svg>Delete this project</button></div>
        </div>
      </div>`;
  }
  function bindSettings() {
    const root = $('#settings');
    root.addEventListener('change', (e) => {
      const p = app.project, v = e.target.value, id = e.target.id;
      if (e.target.dataset.wd != null) {
        const days = $$('[data-wd]', root).filter((x) => x.checked).map((x) => +x.dataset.wd);
        if (!days.length) { toast('Keep at least one working day'); return renderSettings(); }
        return mutate(() => { p.calendar.workDays = days; });
      }
      const m = {
        's-name': () => { p.name = v.trim() || 'Untitled project'; },
        's-start': () => { if (v) p.startDate = v; },
        's-status': () => { if (v) p.statusDate = v; },
        's-resched': () => { p.rescheduleFromStatus = e.target.checked; },
        's-hpd': () => { p.calendar.hoursPerDay = U.clamp(Number(v) || 8, 1, 24); },
        's-hol': () => { p.calendar.holidays = v.split(/[\n,;]+/).map((s) => U.parseAnyDate(s.trim())).filter(Boolean); },
        's-pf': () => { p.productivityFactor = U.clamp(Number(v) || 1, 0.1, 5); },
      };
      if (m[id]) mutate(m[id]);
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sact]');
      if (!b) return;
      const p = app.project;
      switch (b.dataset.sact) {
        case 'today': mutate(() => { p.statusDate = U.todayISO(); }); break;
        case 'reapply': { let n = 0; mutate(() => tasks().forEach((t) => { if (t.normId && !t._summary) { applyNorm(t); n++; } })); toast(`Updated ${n} tasks`); break; }
        case 'baseline':
          mutate(() => tasks().forEach((t) => {
            if (t._summary) { delete t.baselineStart; delete t.baselineFinish; return; }
            t.baselineStart = t.start; t.baselineFinish = t.finish; t.baselineDuration = t._dur; t.baselineManhours = t._mh;
          }));
          toast('Baseline saved');
          break;
        case 'clearbl':
          if (await confirmDlg('Clear the baseline?', 'Planned-vs-actual comparisons will use the current schedule instead.', 'Clear baseline')) {
            mutate(() => tasks().forEach((t) => { delete t.baselineStart; delete t.baselineFinish; delete t.baselineDuration; delete t.baselineManhours; }));
          }
          break;
        case 'backup': PS.exporters.backup(app.project); break;
        case 'delete': deleteProject(app.project.id); break;
        default: break;
      }
    });
  }

  async function deleteProject(id) {
    const meta = index().find((x) => x.id === id);
    if (!(await confirmDlg(`Delete “${meta ? meta.name : 'this project'}”?`, 'It will be removed from this browser. Download a backup first if you may need it.', 'Delete project', true))) return;
    U.store.del('ps.p.' + id);
    const list = index().filter((x) => x.id !== id);
    saveIndex(list);
    if (app.project.id === id) {
      const next = list.length ? loadProject(list[0].id) : null;
      openProject(next || newProject('Untitled project'));
    } else renderProjects();
    toast('Project deleted');
  }

  // ---------------------------------------------------------------- dialogs
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 2800);
  }
  function safe(fn) { try { fn(); } catch (e) { toast(e.message || 'Something went wrong'); } }

  function confirmDlg(title, body, okLabel, danger) {
    const dlg = $('#dlg-confirm');
    $('#confirm-body').innerHTML = `<h2>${U.esc(title)}</h2><p style="margin:0">${U.esc(body)}</p>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${U.esc(okLabel || 'OK')}</button></div>`;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'), { once: true }));
  }

  function renderProjects() {
    const list = index();
    $('#projects-body').innerHTML = `<h2>Projects</h2>
      <div class="table-scroll"><table class="plain"><thead><tr><th>Name</th><th>Last changed</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr data-pid="${p.id}"><td><input class="cell" data-pact="rename" value="${U.esc(p.name)}" aria-label="Project name" style="border:1px solid var(--line-soft);border-radius:4px"></td>
        <td class="muted small">${new Date(p.updated).toLocaleString()}</td>
        <td style="white-space:nowrap"><button class="btn" type="button" data-pact="open"${p.id === app.project.id ? ' disabled' : ''}>${p.id === app.project.id ? 'Open now' : 'Open'}</button>
        <button class="btn ghost" type="button" data-pact="dup">Duplicate</button>
        <button class="btn icon ghost danger" type="button" data-pact="del" aria-label="Delete"><svg><use href="#i-trash"/></svg></button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="dlg-foot" style="justify-content:space-between">
        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" data-pact="new"><svg><use href="#i-plus"/></svg>New blank project</button>
        <button class="btn" type="button" data-pact="sample">Add example project</button>
        <label class="btn" for="p-open"><svg><use href="#i-upload"/></svg>Open backup</label><input type="file" id="p-open" accept=".json" hidden></span>
        <button class="btn" value="close">Close</button></div>`;
  }
  function bindProjects() {
    const body = $('#projects-body');
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pact]');
      if (!b || b.tagName === 'INPUT') return;
      const tr = b.closest('tr');
      const id = tr && tr.dataset.pid;
      switch (b.dataset.pact) {
        case 'open': $('#dlg-projects').close(); openProject(loadProject(id)); break;
        case 'dup': { const p = loadProject(id); p.id = U.uid(); p.name += ' (copy)'; U.store.set('ps.p.' + p.id, p); const l = index(); l.unshift({ id: p.id, name: p.name, updated: Date.now() }); saveIndex(l); renderProjects(); renderPicker(); break; }
        case 'del': $('#dlg-projects').close(); deleteProject(id); break;
        case 'new': $('#dlg-projects').close(); openProject(newProject('Untitled project')); toast('New project created. Add tasks or import a file.'); break;
        case 'sample': $('#dlg-projects').close(); openProject(PS.makeSampleProject()); break;
        default: break;
      }
    });
    body.addEventListener('change', async (e) => {
      if (e.target.dataset.pact === 'rename') {
        const id = e.target.closest('tr').dataset.pid;
        const name = e.target.value.trim() || 'Untitled project';
        if (id === app.project.id) { app.project.name = name; save(); setTimeout(renderPicker, 300); }
        else { const p = loadProject(id); p.name = name; U.store.set('ps.p.' + id, p); const l = index(); l.find((x) => x.id === id).name = name; saveIndex(l); renderPicker(); }
      }
      if (e.target.id === 'p-open' && e.target.files[0]) {
        const r = await PS.importers.readFile(e.target.files[0]);
        if (r.kind !== 'project') return toast(r.message || 'Choose a .planline.json backup file');
        $('#dlg-projects').close();
        const p = r.project; p.id = U.uid();
        openProject(p);
        toast('Backup opened as a new project');
      }
    });
  }

  // ---------------------------------------------------------------- import dialog
  const imp = { file: null, result: null, sheet: null, header: 0, map: {}, mode: 'new', dateOrder: 'DMY', lock: false };
  function openImport() {
    imp.file = null; imp.result = null;
    renderImportStep1();
    $('#dlg-import').showModal();
  }
  function renderImportStep1(msg) {
    $('#import-body').innerHTML = `<h2>Import tasks</h2>
      <label class="drop" id="drop" for="imp-file">
        <svg width="28" height="28"><use href="#i-upload"/></svg>
        <b>Drop a file here or click to choose</b>
        <span class="small muted">Excel (.xlsx, .xls, .ods), CSV, MS Project / ProjectLibre XML, Primavera P6 (.xer) or a Planline backup (.json)</span>
      </label>
      <input type="file" id="imp-file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.xml,.xer,.json,.mpp" hidden>
      <label class="field"><span>Or paste rows copied from Excel, Google Sheets or a web table (include the header row)</span>
        <textarea id="imp-paste" rows="4" placeholder="Task name&#9;Duration&#9;Predecessors"></textarea></label>
      <div><button class="btn" type="button" data-iact="paste">Use pasted rows</button></div>
      ${msg ? `<div class="note" style="background:color-mix(in srgb, var(--critical) 12%, var(--surface))">${U.esc(msg)}</div>` : ''}
      <div class="small muted">Using MS Project? Save your plan with <b>File › Save As › XML Format</b>, or export it to Excel. The native .mpp format cannot be read in a browser.
        Need a starting point? <button class="btn ghost small" type="button" data-iact="template" style="height:auto;padding:0 4px;color:var(--accent)">Download the import template</button></div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button></div>`;
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) readImport(e.dataTransfer.files[0]); });
  }
  async function readImport(file) {
    imp.file = file;
    const r = await PS.importers.readFile(file);
    imp.result = r;
    if (r.kind === 'error') return renderImportStep1(r.message);
    if (r.kind === 'table') {
      imp.sheet = r.sheetNames.find((n) => r.sheets[n].length > 1) || r.sheetNames[0];
      setupSheet();
    }
    renderImportStep2();
  }
  function setupSheet() {
    const rows = imp.result.sheets[imp.sheet];
    imp.header = PS.importers.detectHeader(rows);
    imp.map = PS.importers.autoMap(rows[imp.header] || []);
    imp.dateOrder = PS.importers.guessDateOrder(rows.slice(imp.header + 1), imp.map) || imp.dateOrder;
  }
  function importPreview() {
    const r = imp.result;
    if (r.kind === 'project') return { tasks: r.project.tasks, startDate: r.project.startDate, warnings: [] };
    const rows = r.sheets[imp.sheet];
    if (imp.map.name == null) return { tasks: [], warnings: ['Choose which column holds the task names.'] };
    return PS.importers.buildTasks(rows.slice(imp.header + 1), imp.map, { hoursPerDay: hpd(), daysPerWeek: dpw(), dateOrder: imp.dateOrder, lockDates: imp.lock, calendar: app.project.calendar, fmt: ((r.fmt && r.fmt[imp.sheet]) || []).slice(imp.header + 1) });
  }
  function renderImportStep2() {
    const r = imp.result;
    const pv = importPreview();
    const mode = `<fieldset style="border:1px solid var(--line-soft);border-radius:8px;padding:10px 12px;display:flex;gap:16px;flex-wrap:wrap">
        <legend class="eyebrow" style="padding:0 4px">Import into</legend>
        <label class="check"><input type="radio" name="imode" value="new"${imp.mode === 'new' ? ' checked' : ''}> A new project</label>
        <label class="check"><input type="radio" name="imode" value="append"${imp.mode === 'append' ? ' checked' : ''}> Add to “${U.esc(app.project.name)}”</label>
        <label class="check"><input type="radio" name="imode" value="replace"${imp.mode === 'replace' ? ' checked' : ''}> Replace tasks in “${U.esc(app.project.name)}”</label></fieldset>`;
    let mapping = '';
    if (r.kind === 'table') {
      const rows = r.sheets[imp.sheet];
      const headers = rows[imp.header] || [];
      const opts = (sel) => `<option value="">Not in file</option>` + headers.map((h, i) => `<option value="${i}"${String(sel) === String(i) ? ' selected' : ''}>${U.esc(h === '' ? 'Column ' + (i + 1) : h)}</option>`).join('');
      mapping = `<div class="map-grid">
        ${r.sheetNames.length > 1 ? `<label class="field"><span>Sheet</span><select id="imp-sheet">${r.sheetNames.map((n) => `<option${n === imp.sheet ? ' selected' : ''}>${U.esc(n)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Header row</span><input type="number" id="imp-header" min="1" value="${imp.header + 1}"></label>
        <label class="field"><span>Dates are written as</span><select id="imp-dates"><option value="DMY"${imp.dateOrder === 'DMY' ? ' selected' : ''}>Day / month / year</option><option value="MDY"${imp.dateOrder === 'MDY' ? ' selected' : ''}>Month / day / year</option></select></label>
      </div>
      <div><span class="eyebrow">Match your columns</span></div>
      <div class="map-grid">${PS.importers.FIELDS.map((f) => `<label class="field"><span>${f.label}${f.required ? ' *' : ''}</span><select data-map="${f.key}">${opts(imp.map[f.key])}</select></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="imp-lock"${imp.lock ? ' checked' : ''}> Keep imported start dates as “start no earlier than” even for linked tasks</label>`;
    }
    const prev = pv.tasks.slice(0, 8);
    $('#import-body').innerHTML = `<h2>Import “${U.esc(imp.file.name)}”</h2>
      ${r.kind === 'project' ? `<div class="note">Found <b>${r.project.tasks.length}</b> tasks${r.project.startDate ? ', starting ' + U.fmtDate(r.project.startDate) : ''}. Links, durations, man-hours and progress come across as they are in the file.</div>` : ''}
      ${mode}${mapping}
      ${pv.warnings.length ? `<div class="small" style="color:var(--serious-ink)">${pv.warnings.map(U.esc).join('<br>')}</div>` : ''}
      <div><span class="eyebrow">Preview · ${pv.tasks.length} tasks</span></div>
      <div class="preview"><table class="plain"><thead><tr><th>#</th><th>Task</th><th class="num">Days</th><th>Start</th><th>Predecessors</th><th class="num">Man-hours</th></tr></thead><tbody>
        ${prev.map((t, i) => `<tr><td class="muted">${i + 1}</td><td style="padding-left:${8 + t.level * 16}px">${U.esc(t.name)}</td><td class="num">${t.duration == null ? 'auto' : U.round(t.duration, 1)}</td><td>${t.constraintDate ? U.fmtDate(t.constraintDate) : ''}</td>
          <td>${(t.preds || []).map((p) => (pv.tasks.findIndex((q) => q.id === p.id) + 1) + (p.type !== 'FS' ? p.type : '') + (p.lag ? (p.lag > 0 ? '+' : '') + p.lag + 'd' : '')).join(', ')}</td><td class="num">${t.manhours ? U.fmtNum(t.manhours, 1) : ''}</td></tr>`).join('')}
        ${pv.tasks.length > 8 ? `<tr><td></td><td class="muted" colspan="5">and ${pv.tasks.length - 8} more</td></tr>` : ''}
      </tbody></table></div>
      <div class="dlg-foot"><button class="btn" type="button" data-iact="back">Choose another file</button><button class="btn" value="cancel">Cancel</button>
        <button class="btn primary" type="button" data-iact="go"${pv.tasks.length ? '' : ' disabled'}>Import ${pv.tasks.length} tasks</button></div>`;
  }
  function doImport() {
    const r = imp.result;
    const pv = importPreview();
    let incoming = pv.tasks.map((t) => Object.assign({}, t));
    if (r.kind === 'project' && r.project.isSample == null && r.project.id && imp.mode === 'new') {
      const p = r.project; p.id = U.uid();
      $('#dlg-import').close(); openProject(p); toast('Project opened'); return;
    }
    if (imp.mode === 'new') {
      const base = imp.file.name.replace(/\.[^.]+$/, '');
      const extra = r.kind === 'project' ? { name: r.project.name || base, calendar: r.project.calendar || undefined, statusDate: r.project.statusDate || undefined }
        : { name: base, calendar: pv.workDays ? { workDays: pv.workDays, hoursPerDay: hpd(), holidays: [] } : undefined };
      if (!extra.statusDate) delete extra.statusDate;
      if (!extra.calendar) delete extra.calendar;
      const p = newProject(extra.name, extra);
      p.startDate = pv.startDate || U.todayISO();
      if (r.kind === 'table' && pv.statusDate) p.statusDate = pv.statusDate;
      p.tasks = incoming;
      $('#dlg-import').close();
      openProject(p);
      toast(`Imported ${incoming.length} tasks into a new project`);
      return;
    }
    const offset = imp.mode === 'append' ? nextId() - 1 : 0;
    incoming.forEach((t) => { t.id += offset; t.preds = (t.preds || []).map((p) => Object.assign({}, p, { id: p.id + offset })); });
    mutate(() => {
      if (imp.mode === 'replace') { app.project.tasks = incoming; if (pv.startDate) app.project.startDate = pv.startDate; }
      else app.project.tasks.push(...incoming);
      app.selected = new Set();
    });
    $('#dlg-import').close();
    toast(`Imported ${incoming.length} tasks. Press Ctrl+Z to undo.`);
  }
  function bindImport() {
    const body = $('#import-body');
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'imp-file' && t.files[0]) return readImport(t.files[0]);
      if (t.id === 'imp-paste') return;
      if (t.name === 'imode') imp.mode = t.value;
      if (t.id === 'imp-sheet') { imp.sheet = t.value; setupSheet(); }
      if (t.id === 'imp-header') { imp.header = Math.max(0, (+t.value || 1) - 1); imp.map = PS.importers.autoMap(imp.result.sheets[imp.sheet][imp.header] || []); imp.dateOrder = PS.importers.guessDateOrder(imp.result.sheets[imp.sheet].slice(imp.header + 1), imp.map) || imp.dateOrder; }
      if (t.id === 'imp-dates') imp.dateOrder = t.value;
      if (t.id === 'imp-lock') imp.lock = t.checked;
      if (t.dataset.map) { if (t.value === '') delete imp.map[t.dataset.map]; else imp.map[t.dataset.map] = +t.value; }
      if (imp.result) renderImportStep2();
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-iact]');
      if (!b) return;
      if (b.dataset.iact === 'template') safe(() => PS.exporters.template());
      if (b.dataset.iact === 'back') renderImportStep1();
      if (b.dataset.iact === 'paste') {
        const r = PS.importers.readPasted($('#imp-paste').value);
        if (r.kind === 'error') return renderImportStep1(r.message);
        imp.file = { name: 'Pasted tasks' }; imp.result = r; imp.sheet = 'Pasted'; setupSheet(); renderImportStep2();
      }
      if (b.dataset.iact === 'go') doImport();
    });
  }

  function renderHelp() {
    $('#help-body').innerHTML = `<h2>How Planline works</h2>
      <div class="help-body">
        <ol>
          <li><b>Build the WBS.</b> Add tasks, or import them from Excel, CSV or MS Project XML. Use <b>Indent</b> to make sub-activities; parents become summary rows that roll up dates, man-hours and progress.</li>
          <li><b>Estimate man-hours.</b> Type them in, or open a task's details, pick an industry norm and enter the quantity. Tick “Calculate duration from man-hours” to get days = man-hours ÷ (crew × hours per day).</li>
          <li><b>Link the logic.</b> Type predecessors by row number, or select rows and press <b>Link</b>. The critical path turns red on the Gantt chart.</li>
          <li><b>Save a baseline</b> in Project settings once the plan is agreed.</li>
          <li><b>Track progress.</b> Update % complete against the status date. The dashboard shows the S-curve, SPI, phase progress and what needs attention.</li>
          <li><b>Export</b> an Excel report, CSV, MS Project XML or a backup.</li>
        </ol>
        <div><b>Predecessor format</b><ul>
          <li><code>3</code> task 3 must finish before this one starts (finish-to-start)</li>
          <li><code>3SS+2d</code> start 2 working days after task 3 starts</li>
          <li><code>3FF</code> finish together with task 3 · <code>3FS-1d</code> overlap by one day · <code>3FS+1w</code> one week gap</li>
          <li>Several links: <code>3, 5SS+2d</code></li></ul></div>
        <div><b>Keyboard</b><ul>
          <li><code>Enter</code> save cell and move down · <code>Insert</code> new task · <code>Delete</code> remove selected rows</li>
          <li><code>Alt</code> + <code>→</code> / <code>←</code> indent / outdent · <code>Alt</code> + <code>↑</code> / <code>↓</code> move · <code>Ctrl</code> + <code>Z</code> / <code>Y</code> undo / redo</li></ul></div>
        <div class="note">Your projects live only in this browser. Use Export › Project backup to keep a copy or move to another computer.</div>
      </div>
      <div class="dlg-foot"><button class="btn primary" value="close">Got it</button></div>`;
  }

  // ---------------------------------------------------------------- ads + theme
  function initAds() {
    const a = CFG.ads || {};
    if (!a.enabled || !a.adsenseClient) return;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(a.adsenseClient);
    document.head.appendChild(s);
    [['top', '#ad-top'], ['bottom', '#ad-bottom']].forEach(([k, sel]) => {
      const slot = a.slots && a.slots[k];
      if (!slot) return;
      const box = $(sel);
      box.innerHTML = `<ins class="adsbygoogle" data-ad-client="${U.esc(a.adsenseClient)}" data-ad-slot="${U.esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      box.hidden = false;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  }
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); U.store.set('ps.theme', next);
    renderAll();
  }

  function setView(v) {
    ui.view = v; U.store.set('ps.ui', ui);
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false'));
    ['schedule', 'dashboard', 'norms', 'settings'].forEach((k) => { $('#view-' + k).hidden = k !== v; });
    try { if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v); } catch (e) { /* sandboxed */ }
    renderAll();
  }

  // ---------------------------------------------------------------- wiring
  function bind() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#btn-theme').addEventListener('click', toggleTheme);
    $('#btn-help').addEventListener('click', () => { renderHelp(); $('#dlg-help').showModal(); });
    $('#btn-import').addEventListener('click', openImport);
    $('#btn-projects').addEventListener('click', () => { renderProjects(); $('#dlg-projects').showModal(); });
    $('#proj-select').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === '__new') { openProject(newProject('Untitled project')); toast('New project created. Add tasks or import a file.'); return; }
      const p = loadProject(v);
      if (p) openProject(p);
    });
    $$('#export-menu [data-export]').forEach((b) => b.addEventListener('click', () => {
      $('#export-menu').open = false;
      const k = b.dataset.export;
      if (k === 'excel') {
        toast('Building the Excel report…', 6000);
        PS.report.excel(app.project, app.res).then(() => toast('Download started')).catch((e) => toast(e.message || 'The report could not be created'));
        return;
      }
      safe(() => {
        if (k === 'excel') PS.exporters.excel(app.project, app.res);
        if (k === 'csv') PS.exporters.csv(app.project, app.res);
        if (k === 'mspdi') PS.exporters.mspdi(app.project, app.res);
        if (k === 'backup') PS.exporters.backup(app.project);
        if (k === 'template') PS.exporters.template();
        toast('Download started');
      });
    }));
    document.addEventListener('click', (e) => { const m = $('#export-menu'); if (m.open && !m.contains(e.target)) m.open = false; });

    // toolbar
    $('#tb-add').addEventListener('click', () => addTask(false));
    $('#tb-ms').addEventListener('click', () => addTask(true));
    $('#tb-indent').addEventListener('click', () => shiftLevel(1));
    $('#tb-outdent').addEventListener('click', () => shiftLevel(-1));
    $('#tb-up').addEventListener('click', () => move(-1));
    $('#tb-down').addEventListener('click', () => move(1));
    $('#tb-link').addEventListener('click', linkSelected);
    $('#tb-unlink').addEventListener('click', unlinkSelected);
    $('#tb-del').addEventListener('click', deleteSelected);
    $('#tb-undo').addEventListener('click', undo);
    $('#tb-redo').addEventListener('click', redo);
    $('#tb-panel').addEventListener('click', () => { ui.details = !ui.details; U.store.set('ps.ui', ui); renderDetails(); });
    $('#tb-today').addEventListener('click', () => PS.gantt.scrollTo($('#gantt-pane'), app.res.statusISO));
    $('#tb-filter').addEventListener('input', (e) => { app.filter = e.target.value; renderGrid(); renderGantt(); });
    $$('[data-zoom]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.zoom === ui.zoom ? 'true' : 'false');
      b.addEventListener('click', () => {
        ui.zoom = b.dataset.zoom; U.store.set('ps.ui', ui);
        $$('[data-zoom]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        renderGantt(); PS.gantt.scrollTo($('#gantt-pane'), app.res.statusISO);
      });
    });

    // grid
    const grid = $('#grid');
    grid.addEventListener('change', (e) => {
      const inp = e.target.closest('input.cell');
      if (!inp || inp.readOnly) return;
      const id = +inp.closest('tr').dataset.id;
      if (!app.focus) {
        const active = document.activeElement;
        if (active && active.closest && active.closest('#grid') && active !== inp && active.dataset.f) app.focus = { id: +active.closest('tr').dataset.id, f: active.dataset.f };
      }
      commitCell(id, inp.dataset.f, inp.value);
    });
    grid.addEventListener('keydown', (e) => {
      const inp = e.target.closest('input.cell');
      if (!inp) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        const tr = inp.closest('tr');
        if (e.key === 'Escape') { inp.blur(); return; }
        const vis = visibleTasks();
        const i = vis.findIndex((t) => t.id === +tr.dataset.id);
        const nxt = vis[i + (e.shiftKey ? -1 : 1)];
        app.focus = nxt ? { id: nxt.id, f: inp.dataset.f, select: true } : null;
        const before = inp.defaultValue;
        if (inp.value === before) {
          app.focus = null;
          if (nxt) { const n = grid.querySelector(`tr[data-id="${nxt.id}"] input[data-f="${inp.dataset.f}"]`); if (n) { n.focus(); if (n.select) n.select(); } }
        } else inp.blur();
      }
    });
    grid.addEventListener('focusin', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = +tr.dataset.id;
      if (!(app.selected.size === 1 && app.selected.has(id))) {
        app.selected = new Set([id]); app.anchor = id;
        $$('#grid tbody tr[data-id]').forEach((r) => r.classList.toggle('sel', +r.dataset.id === id));
        renderGantt(); renderDetails();
      }
    });
    grid.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'add') return addTask(false);
      if (act && act.dataset.act === 'toggle') {
        const t = byId(+act.closest('tr').dataset.id);
        t.collapsed = !t.collapsed; save(); renderGrid(); renderGantt(); return;
      }
      const rc = e.target.closest('td.c-row');
      if (rc && rc.closest('tr[data-id]')) selectRow(+rc.closest('tr').dataset.id, e);
    });

    // details
    $('#details').addEventListener('change', onDetailChange);
    $('#details').addEventListener('click', onDetailClick);
    $('#details').addEventListener('input', (e) => { if (e.target.id === 'd-pct-r') $('#d-pct').value = e.target.value; });

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (ui.view !== 'schedule' || document.querySelector('dialog[open]')) return;
      const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !inField && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && !inField && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (e.altKey && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (inField) e.target.blur();
        setTimeout(() => ({ ArrowRight: () => shiftLevel(1), ArrowLeft: () => shiftLevel(-1), ArrowUp: () => move(-1), ArrowDown: () => move(1) })[e.key](), 0);
        return;
      }
      if (inField) return;
      if (e.key === 'Insert') { e.preventDefault(); addTask(false); }
      if (e.key === 'Delete' && app.selected.size) { e.preventDefault(); deleteSelected(); }
    });

    // scroll sync + resizer
    const gp = $('#grid-pane'), tp = $('#gantt-pane');
    let lock = false;
    const sync = (from, to) => () => { if (lock) return; lock = true; to.scrollTop = from.scrollTop; requestAnimationFrame(() => { lock = false; }); };
    gp.addEventListener('scroll', sync(gp, tp));
    tp.addEventListener('scroll', sync(tp, gp));
    const split = $('#split');
    split.style.setProperty('--grid-w', ui.gridW + '%');
    $('#resizer').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rect = split.getBoundingClientRect();
      const moveFn = (ev) => { ui.gridW = U.clamp(((ev.clientX - rect.left) / rect.width) * 100, 15, 85); split.style.setProperty('--grid-w', ui.gridW + '%'); };
      const up = () => { document.removeEventListener('pointermove', moveFn); document.removeEventListener('pointerup', up); U.store.set('ps.ui', ui); };
      document.addEventListener('pointermove', moveFn); document.addEventListener('pointerup', up);
    });

    bindNorms(); bindSettings(); bindProjects(); bindImport();
    let rt = null;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { clearTimeout(rt); rt = setTimeout(renderAll, 50); });
  }

  function init() {
    applyTheme(U.store.get('ps.theme', null));
    if (CFG.appName) { $('#app-name').textContent = CFG.appName; }
    $('#foot-links').innerHTML = (CFG.links || []).map((l) => `<a href="${U.esc(l.href)}" style="color:inherit">${U.esc(l.label)}</a>`).join(' · ');
    bind();
    initAds();
    let list = index();
    let p = null;
    const cur = U.store.get('ps.current', null);
    if (cur) p = loadProject(cur);
    if (!p && list.length) p = loadProject(list[0].id);
    if (!p) p = PS.makeSampleProject();
    const hv = location.hash.slice(1);
    if (['schedule', 'dashboard', 'norms', 'settings'].includes(hv)) ui.view = hv;
    app.project = normalise(p);
    recompute(); save();
    setView(ui.view);
    requestAnimationFrame(() => PS.gantt.scrollTo($('#gantt-pane'), app.res.statusISO));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
