/* Critical Path Method engine: hierarchy, effort-driven durations, forward/backward pass,
   float, roll-ups and earned-progress figures. Works on working-day indices. */
window.PS = window.PS || {};

PS.schedule = (function () {
  const U = PS.util;
  const TYPES = ['FS', 'SS', 'FF', 'SF'];

  function buildHierarchy(tasks) {
    const stack = [];
    tasks.forEach((t, i) => {
      t.level = Math.max(0, Math.round(Number(t.level) || 0));
      const prevLevel = i ? tasks[i - 1].level : -1;
      if (t.level > prevLevel + 1) t.level = prevLevel + 1;
      while (stack.length && stack[stack.length - 1].level >= t.level) stack.pop();
      t._parent = stack.length ? stack[stack.length - 1].id : null;
      t._row = i + 1;
      t._children = [];
      stack.push(t);
    });
    const byId = new Map(tasks.map((t) => [t.id, t]));
    tasks.forEach((t) => { if (t._parent != null) byId.get(t._parent)._children.push(t.id); });
    tasks.forEach((t) => { t._summary = t._children.length > 0; });
    // leaves under each node and ancestor chains
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      t._leaves = t._summary ? t._children.flatMap((c) => byId.get(c)._leaves) : [t.id];
    }
    tasks.forEach((t) => {
      const anc = [];
      let p = t._parent;
      while (p != null) { anc.push(p); p = byId.get(p)._parent; }
      t._ancestors = anc;
    });
    // outline numbers (WBS codes)
    const counters = [];
    tasks.forEach((t) => {
      counters.length = t.level + 1;
      counters[t.level] = (counters[t.level] || 0) + 1;
      t._wbs = counters.map((c) => c || 1).join('.');
    });
    return byId;
  }

  function leafDuration(t, cal) {
    const isMilestone = Number(t.duration) === 0 && !(t.effortDriven && Number(t.manhours) > 0 && Number(t.crew) > 0);
    if (isMilestone) return 0;
    if (t.actualStart && t.actualFinish) {
      return Math.max(0, cal.indexOf(t.actualFinish, 'finish') - cal.indexOf(t.actualStart, 'start') + 1);
    }
    if (t.effortDriven && Number(t.manhours) > 0 && Number(t.crew) > 0) {
      return Math.max(1, Math.ceil(Number(t.manhours) / (Number(t.crew) * cal.hoursPerDay) - 1e-9));
    }
    const d = Number(t.duration);
    return isNaN(d) ? 1 : Math.max(0, Math.round(d * 2) / 2);
  }

  function compute(project) {
    const tasks = project.tasks;
    const cal = U.Calendar(project.startDate, project.calendar);
    const byId = buildHierarchy(tasks);
    const errors = [];
    const leaves = tasks.filter((t) => !t._summary);

    leaves.forEach((t) => {
      t._dur = leafDuration(t, cal);
      t._planDur = t._dur;
      if (t.effortDriven && Number(t.manhours) > 0 && Number(t.crew) > 0 && !(t.actualStart && t.actualFinish)) t.duration = t._dur;
    });

    // Sanitise links: drop references to missing tasks, self, ancestors or descendants
    tasks.forEach((t) => {
      t.preds = (t.preds || []).filter((p) => {
        const q = byId.get(p.id);
        if (!q || q === t) return false;
        if (t._ancestors.includes(q.id) || q._ancestors.includes(t.id)) return false;
        if (!TYPES.includes(p.type)) p.type = 'FS';
        p.lag = Number(p.lag) || 0;
        return true;
      });
    });

    // links that constrain each leaf = its own + its ancestors'
    const inLinks = new Map();
    leaves.forEach((t) => {
      const list = [];
      [t.id, ...t._ancestors].forEach((nid) => (byId.get(nid).preds || []).forEach((p) => list.push(p)));
      inLinks.set(t.id, list);
    });

    const sumVal = new Map(); // id -> {es, ef, ls, lf}
    const nodeES = (n) => (n._summary ? sumVal.get(n.id).es : n.es);
    const nodeEF = (n) => (n._summary ? sumVal.get(n.id).ef : n.ef);
    const nodeLS = (n) => (n._summary ? sumVal.get(n.id).ls : n.ls);
    const nodeLF = (n) => (n._summary ? sumVal.get(n.id).lf : n.lf);
    function rollFwd() {
      for (let i = tasks.length - 1; i >= 0; i--) {
        const t = tasks[i];
        if (!t._summary) continue;
        let es = Infinity, ef = -Infinity;
        t._leaves.forEach((id) => { const l = byId.get(id); es = Math.min(es, l.es); ef = Math.max(ef, l.ef); });
        const v = sumVal.get(t.id) || {};
        v.es = es; v.ef = ef; sumVal.set(t.id, v);
      }
    }
    function rollBack() {
      tasks.forEach((t) => {
        if (!t._summary) return;
        let ls = Infinity, lf = -Infinity;
        t._leaves.forEach((id) => { const l = byId.get(id); ls = Math.min(ls, l.ls); lf = Math.max(lf, l.lf); });
        const v = sumVal.get(t.id); v.ls = ls; v.lf = lf;
      });
    }

    // Status date acts as the data date: unfinished work cannot be scheduled before it.
    const statusISO = project.statusDate || U.todayISO();
    const statusIdx = cal.indexOf(statusISO, 'start');
    const dataDate = project.rescheduleFromStatus === false ? -Infinity : statusIdx;

    // ---- forward pass
    leaves.forEach((t) => {
      // quantity-measured progress: installed quantity ÷ scope quantity
      const log = Array.isArray(t.progressLog) ? t.progressLog : [];
      t._qtyDone = log.reduce((a, e) => a + (Number(e.qty) || 0), 0);
      if (Number(t.qty) > 0 && log.length) t.pct = U.round(U.clamp(100 * t._qtyDone / Number(t.qty), 0, 100), 2);
      const pct = U.clamp(Number(t.pct) || 0, 0, 100);
      t._fixed = !!t.actualStart;
      t._base = t.actualStart ? cal.indexOf(t.actualStart, 'start') : 0;
      if (!t.actualStart && t.constraintDate) t._base = Math.max(0, cal.indexOf(t.constraintDate, 'start'));
      if (!t.actualStart && pct < 100 && dataDate > t._base) t._base = dataDate;
      t.es = t._base; t.ef = t.es + t._dur;
      if (t._fixed && !t.actualFinish && pct < 100 && dataDate > -Infinity) {
        const remaining = Math.ceil(t._dur * (1 - pct / 100) - 1e-9);
        t.ef = Math.max(t.ef, dataDate + remaining);
        t._dur = t.ef - t.es;
      }
    });
    rollFwd();
    let changed = true, iter = 0;
    const maxIter = leaves.length + 3;
    while (changed && iter < maxIter) {
      changed = false; iter++;
      for (const t of leaves) {
        if (t._fixed) continue;
        let es = t._base;
        for (const p of inLinks.get(t.id)) {
          const q = byId.get(p.id);
          let c;
          if (p.type === 'FS') c = nodeEF(q) + p.lag;
          else if (p.type === 'SS') c = nodeES(q) + p.lag;
          else if (p.type === 'FF') c = nodeEF(q) + p.lag - t._dur;
          else c = nodeES(q) + p.lag - t._dur;
          if (c > es) es = c;
        }
        es = Math.ceil(es);
        if (es !== t.es) { t.es = es; t.ef = es + t._dur; changed = true; }
      }
      rollFwd();
    }
    if (changed) errors.push('Circular link found: some tasks depend on each other in a loop. Check the predecessors of highlighted tasks.');
    const cyclic = changed;

    // milestones after FS/FF links show on the predecessor's finish date
    leaves.forEach((t) => {
      t._msPrevDay = t._dur === 0 && !t._fixed && t.es > 0 && inLinks.get(t.id).some((p) => (p.type === 'FS' || p.type === 'FF'));
    });

    const finishIdx = leaves.length ? Math.max(...leaves.map((t) => t.ef)) : 0;
    const startIdx = leaves.length ? Math.min(0, ...leaves.map((t) => t.es)) : 0;

    // ---- backward pass
    const outLinks = new Map(); // node id -> [{succ, type, lag}]
    tasks.forEach((s) => (s.preds || []).forEach((p) => {
      if (!outLinks.has(p.id)) outLinks.set(p.id, []);
      outLinks.get(p.id).push({ succ: s, type: p.type, lag: p.lag });
    }));
    const leafOut = new Map();
    leaves.forEach((t) => {
      const list = [];
      [t.id, ...t._ancestors].forEach((nid) => (outLinks.get(nid) || []).forEach((l) => list.push(l)));
      leafOut.set(t.id, list);
    });
    leaves.forEach((t) => { t.lf = finishIdx; t.ls = t.lf - t._dur; });
    rollBack();
    changed = true; iter = 0;
    while (!cyclic && changed && iter < maxIter) {
      changed = false; iter++;
      for (let i = leaves.length - 1; i >= 0; i--) {
        const t = leaves[i];
        let lf = finishIdx;
        for (const l of leafOut.get(t.id)) {
          const s = l.succ;
          let c;
          if (l.type === 'FS') c = nodeLS(s) - l.lag;
          else if (l.type === 'SS') c = nodeLS(s) - l.lag + t._dur;
          else if (l.type === 'FF') c = nodeLF(s) - l.lag;
          else c = nodeLF(s) - l.lag + t._dur;
          if (c < lf) lf = c;
        }
        lf = Math.floor(lf);
        if (lf !== t.lf) { t.lf = lf; t.ls = lf - t._dur; changed = true; }
      }
      rollBack();
    }

    // ---- dates, float, progress
    const hasBaseline = tasks.some((t) => t.baselineStart);
    leaves.forEach((t) => {
      t.tf = cyclic ? 0 : t.ls - t.es;
      t.pct = U.clamp(Number(t.pct) || 0, 0, 100);
      t.critical = !cyclic && t.tf <= 0 && t.pct < 100;
      t.start = cal.dateOf(t.es);
      t.finish = t._dur > 0 ? cal.dateOf(t.ef - 1) : (t._msPrevDay ? cal.dateOf(t.es - 1) : t.start);
      if (t._dur === 0) t.start = t.finish;
      t.milestone = t._dur === 0;
      const mh = Number(t.manhours) || 0;
      t._mh = mh;
      t._ev = mh * t.pct / 100;
      // planned fraction at status date, from baseline if one exists
      let ps = t.es, pd = t._dur;
      if (hasBaseline && t.baselineStart) {
        ps = cal.indexOf(t.baselineStart, 'start');
        pd = t.baselineDuration != null ? Number(t.baselineDuration) : t._dur;
      }
      t._planFrac = pd > 0 ? U.clamp((statusIdx - ps) / pd, 0, 1) : (statusIdx > ps ? 1 : 0);
      t._pv = mh * t._planFrac;
      t.status = statusOf(t, statusISO);
    });

    // weightage: share of total man-hours (or of task-days when no man-hours are entered)
    const totalMH = leaves.reduce((a, t) => a + t._mh, 0);
    const totalDays = leaves.reduce((a, t) => a + Math.max(t._dur, 0), 0);
    leaves.forEach((t) => { t._wt = totalMH > 0 ? 100 * t._mh / totalMH : totalDays > 0 ? 100 * Math.max(t._dur, 0) / totalDays : 0; });

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      if (!t._summary) continue;
      const v = sumVal.get(t.id);
      const kids = t._leaves.map((id) => byId.get(id));
      t.es = v.es; t.ef = v.ef; t.ls = v.ls; t.lf = v.lf;
      t._dur = t.ef - t.es;
      t._planDur = t._dur;
      t.duration = t._dur;
      t.start = U.toISO(new Date(Math.min(...kids.map((k) => U.parseISO(k.start).getTime()))));
      t.finish = U.toISO(new Date(Math.max(...kids.map((k) => U.parseISO(k.finish).getTime()))));
      t.tf = Math.min(...kids.map((k) => k.tf));
      t.critical = kids.some((k) => k.critical);
      t._mh = kids.reduce((a, k) => a + k._mh, 0);
      t.manhours = U.round(t._mh, 2);
      t._ev = kids.reduce((a, k) => a + k._ev, 0);
      t._pv = kids.reduce((a, k) => a + k._pv, 0);
      t._wt = kids.reduce((a, k) => a + k._wt, 0);
      if (t._mh > 0) t.pct = U.round(100 * t._ev / t._mh, 1);
      else {
        const dw = kids.reduce((a, k) => a + Math.max(k._dur, 0.0001), 0);
        t.pct = U.round(kids.reduce((a, k) => a + k.pct * Math.max(k._dur, 0.0001), 0) / dw, 1);
      }
      const pw = kids.reduce((a, k) => a + Math.max(k._dur, 0.0001), 0);
      t._planFrac = t._mh > 0 ? t._pv / t._mh : kids.reduce((a, k) => a + k._planFrac * Math.max(k._dur, 0.0001), 0) / pw;
      t.milestone = false;
      t.status = statusOf(t, statusISO);
    }
    if (cyclic) tasks.forEach((t) => { t._cycle = !t._summary && !t._fixed && (t.preds || []).length > 0; });
    else tasks.forEach((t) => { t._cycle = false; });

    const result = {
      cal, byId, errors, leaves,
      startISO: leaves.length ? cal.dateOf(startIdx) : cal.startISO,
      finishISO: leaves.length ? cal.dateOf(Math.max(finishIdx - 1, 0)) : cal.startISO,
      finishIdx, statusISO, statusIdx, hasBaseline, totalMH,
    };
    if (hasBaseline) {
      const bf = leaves.map((t) => t.baselineFinish).filter(Boolean).sort();
      result.baselineFinishISO = bf[bf.length - 1];
    }
    return result;
  }

  function statusOf(t, statusISO) {
    if (t.pct >= 100) return 'Completed';
    if (t.finish && t.finish < statusISO) return 'Overdue';
    if (t.pct + 5 < t._planFrac * 100) return 'Behind';
    if (t.pct > 0) return 'In progress';
    return 'Not started';
  }

  // ---- predecessor text <-> links
  function formatPreds(t, byId) {
    return (t.preds || []).map((p) => {
      const q = byId.get(p.id);
      if (!q) return '';
      let s = String(q._row);
      if (p.type !== 'FS' || p.lag) s += p.type;
      if (p.lag) s += (p.lag > 0 ? '+' : '') + p.lag + 'd';
      return s;
    }).filter(Boolean).join(', ');
  }
  /* "3, 5SS+2, 7FF-1d, 4FS+1w" -> links, using row numbers */
  function parsePreds(text, tasks, daysPerWeek = 5) {
    const out = [], bad = [];
    String(text || '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const m = tok.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|h|hr|hrs)?)?$/i);
      if (!m) { bad.push(tok); return; }
      const row = +m[1];
      const task = tasks[row - 1];
      if (!task) { bad.push(tok); return; }
      let lag = m[4] ? parseFloat(m[4]) : 0;
      const u = (m[5] || 'd').toLowerCase();
      if (u.startsWith('w')) lag *= daysPerWeek;
      if (u.startsWith('h')) lag /= 8;
      if (m[3] === '-') lag = -lag;
      out.push({ id: task.id, type: (m[2] || 'FS').toUpperCase(), lag: Math.round(lag * 2) / 2 });
    });
    return { links: out, bad };
  }

  return { compute, formatPreds, parsePreds, buildHierarchy, TYPES };
})();
