/* Progress analytics used by the dashboard and the Excel report. */
window.PS = window.PS || {};

PS.analytics = (function () {
  const U = PS.util;
  const STATUS_ORDER = ['Completed', 'In progress', 'Behind', 'Overdue', 'Not started'];

  function weightOf(res) {
    const total = res.leaves.reduce((a, t) => a + t._mh, 0);
    if (total > 0) return { w: (t) => t._mh, unit: 'man-hours', total };
    return { w: (t) => Math.max(t._dur, 0), unit: 'task-days', total: res.leaves.reduce((a, t) => a + Math.max(t._dur, 0), 0) };
  }

  function summary(project, res) {
    const L = res.leaves;
    const W = weightOf(res);
    const sw = W.total || 1;
    const actualPct = L.reduce((a, t) => a + W.w(t) * t.pct, 0) / sw;
    const plannedPct = 100 * L.reduce((a, t) => a + W.w(t) * t._planFrac, 0) / sw;
    const statusCounts = {};
    STATUS_ORDER.forEach((s) => { statusCounts[s] = 0; });
    L.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });
    const soon = U.addDaysISO(res.statusISO, 14);
    return {
      count: L.length,
      unit: W.unit,
      totalMH: L.reduce((a, t) => a + t._mh, 0),
      earnedMH: L.reduce((a, t) => a + t._ev, 0),
      plannedMH: L.reduce((a, t) => a + t._pv, 0),
      actualPct, plannedPct,
      spi: plannedPct > 0.05 ? actualPct / plannedPct : null,
      criticalOpen: L.filter((t) => t.critical).length,
      statusCounts,
      attention: L.filter((t) => t.pct < 100 && (t.status === 'Behind' || t.status === 'Overdue' || (t.critical && t.start <= soon)))
        .sort((a, b) => (a.start < b.start ? -1 : 1)),
    };
  }

  function mondayOf(iso) {
    const d = U.parseISO(iso);
    return U.addDaysISO(iso, -((d.getUTCDay() + 6) % 7));
  }

  function weekly(project, res) {
    const L = res.leaves;
    if (!L.length) return [];
    const W = weightOf(res);
    const cal = res.cal;
    const planned = new Map(), baseline = new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    let first = mondayOf(res.startISO), last = mondayOf(res.finishISO);
    L.forEach((t) => {
      const w = W.w(t);
      if (t._dur > 0 && w > 0) {
        const per = w / t._dur;
        for (let i = t.es; i < t.ef; i++) add(planned, mondayOf(cal.dateOf(i)), per);
      } else if (w > 0) add(planned, mondayOf(t.start), w);
      if (res.hasBaseline && t.baselineStart) {
        const bd = t.baselineDuration != null ? Number(t.baselineDuration) : t._dur;
        const bw = W.unit === 'man-hours' ? (t.baselineManhours != null ? Number(t.baselineManhours) : w) : bd;
        const bs = cal.indexOf(t.baselineStart, 'start');
        if (bd > 0 && bw > 0) for (let i = bs; i < bs + bd; i++) add(baseline, mondayOf(cal.dateOf(i)), bw / bd);
        else if (bw > 0) add(baseline, mondayOf(t.baselineStart), bw);
        const bl = mondayOf(t.baselineFinish || t.baselineStart);
        if (bl > last) last = bl;
        if (mondayOf(t.baselineStart) < first) first = mondayOf(t.baselineStart);
      }
    });
    const hist = (project.history || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const baseTotal = [...baseline.values()].reduce((a, b) => a + b, 0) || 1;
    const rows = [];
    let cum = 0, cumB = 0;
    const statusWeek = mondayOf(res.statusISO);
    const nowPct = summary(project, res).actualPct;
    for (let wk = first, guard = 0; wk <= last && guard < 1000; wk = U.addDaysISO(wk, 7), guard++) {
      const p = planned.get(wk) || 0;
      cum += p; cumB += baseline.get(wk) || 0;
      const end = U.addDaysISO(wk, 7);
      let actualPct = null;
      if (wk <= statusWeek) {
        const h = hist.filter((x) => x.date < end);
        if (wk === statusWeek) actualPct = nowPct;
        else if (h.length) actualPct = h[h.length - 1].pct;
        else if (wk < mondayOf(res.startISO)) actualPct = 0;
      }
      rows.push({
        week: wk, planned: p, cumPlanned: cum,
        cumPlannedPct: 100 * cum / (W.total || 1),
        cumBaselinePct: res.hasBaseline ? 100 * cumB / baseTotal : null,
        actualPct,
      });
    }
    return rows;
  }

  function phases(project, res) {
    return project.tasks.filter((t) => t.level === 0).map((t) => {
      const mh = t._mh || 0;
      return {
        name: t.name, mh, ev: t._ev || 0, start: t.start, finish: t.finish, critical: t.critical,
        planned: 100 * (t._planFrac || 0), actual: t.pct || 0,
      };
    });
  }

  function phaseOf(t, res) {
    const top = t._ancestors.length ? res.byId.get(t._ancestors[t._ancestors.length - 1]) : t;
    return top.name;
  }

  const DIMENSIONS = {
    phase: { label: 'Phase (top-level WBS)', key: phaseOf },
    resource: { label: 'Resource / crew', key: (t) => (t.resource || 'Unassigned').split(',')[0].trim() },
    status: { label: 'Status', key: (t) => t.status },
    month: { label: 'Start month', key: (t) => t.start.slice(0, 7) },
    critical: { label: 'Critical or not', key: (t) => (t.critical ? 'Critical' : t.pct >= 100 ? 'Completed' : 'Has float') },
  };
  const MEASURES = {
    manhours: { label: 'Man-hours', v: (t) => t._mh },
    earned: { label: 'Earned man-hours', v: (t) => t._ev },
    remaining: { label: 'Remaining man-hours', v: (t) => t._mh - t._ev },
    count: { label: 'Number of activities', v: () => 1 },
    duration: { label: 'Duration (working days)', v: (t) => t._dur },
  };

  function group(project, res, dim, measure) {
    const D = DIMENSIONS[dim] || DIMENSIONS.phase, M = MEASURES[measure] || MEASURES.manhours;
    const m = new Map();
    res.leaves.forEach((t) => { const k = D.key(t, res); m.set(k, (m.get(k) || 0) + M.v(t)); });
    let entries = [...m.entries()];
    if (dim === 'month') entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    else if (dim === 'status') entries.sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]));
    else if (dim !== 'phase') entries.sort((a, b) => b[1] - a[1]);
    if (dim !== 'month' && entries.length > 8) {
      const other = entries.slice(7).reduce((a, e) => a + e[1], 0);
      entries = entries.slice(0, 7).concat([['Other', other]]);
    }
    const labels = entries.map((e) => (dim === 'month' ? U.MONTHS[+e[0].slice(5, 7) - 1] + ' ' + e[0].slice(2, 4) : e[0]));
    return { labels, values: entries.map((e) => U.round(e[1], 1)), dimLabel: D.label, measureLabel: M.label };
  }

  return { summary, weekly, phases, group, DIMENSIONS, MEASURES, STATUS_ORDER, mondayOf };
})();
