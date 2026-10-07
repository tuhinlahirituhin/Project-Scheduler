/* Example project shown on first visit. Dates are placed relative to today so it always looks mid-way. */
window.PS = window.PS || {};

PS.makeSampleProject = function () {
  const U = PS.util;
  const today = U.todayISO();
  const d = U.parseISO(today);
  const back = 49 + ((d.getUTCDay() + 6) % 7); // a Monday about seven weeks ago
  const start = U.addDaysISO(today, -back);
  const norm = (id) => PS.DEFAULT_NORMS.find((n) => n.id === id);

  // [level, name, duration, preds, normId, qty, manualMH, crew, resource, pct]
  const rows = [
    [0, 'Engineering and approvals'],
    [1, 'Site survey and soil investigation', 5, '', null, 0, 120, 3, 'Survey team', 100],
    [1, 'General arrangement drawings', 0, '2', 'eng-drawing', 6, 0, 4, 'Design office', 100],
    [1, 'Statutory approvals', 10, '3', null, 0, 40, 1, 'Client', 100],
    [1, 'Design approved', 0, '4', null, 0, 0, 0, '', 100],
    [0, 'Site works'],
    [1, 'Site clearing and setting out', 0, '5', null, 0, 96, 3, 'Civil crew A', 100],
    [1, 'Excavation for footings', 0, '7', 'exc-mech', 850, 0, 2, 'Civil crew A', 100],
    [1, 'Anti-termite treatment and PCC', 0, '8', 'pcc', 45, 0, 6, 'Civil crew A', 25],
    [0, 'Foundations'],
    [1, 'Reinforcement for footings', 0, '9SS+2', 'rebar', 18, 0, 8, 'Civil crew B', 10],
    [1, 'Formwork for footings', 0, '9SS+2', 'formwork', 320, 0, 8, 'Civil crew B', 5],
    [1, 'Concrete for footings', 0, '11, 12', 'rcc', 140, 0, 10, 'Civil crew B', 0],
    [1, 'Backfilling and compaction', 0, '13FS+3', 'backfill', 400, 0, 5, 'Civil crew A', 0],
    [0, 'Structural steel'],
    [1, 'Steel fabrication in shop', 0, '3', 'steel-fab', 60, 0, 12, 'Fabricator', 70],
    [1, 'Steel erection', 0, '14, 16', 'steel-erect', 60, 0, 10, 'Erection crew', 0],
    [1, 'Roof sheeting', 0, '17SS+5', 'roof-sheet', 1800, 0, 8, 'Erection crew', 0],
    [0, 'MEP services'],
    [1, 'Electrical cabling', 0, '17', 'cable', 2400, 0, 4, 'Electrical crew', 0],
    [1, 'Lighting fixtures', 0, '18', 'light', 120, 0, 3, 'Electrical crew', 0],
    [1, 'Fire-fighting piping', 0, '17', 'pipe-erect', 600, 0, 6, 'Piping crew', 0],
    [1, 'Testing and commissioning', 6, '20, 21, 22', null, 0, 192, 4, 'Commissioning', 0],
    [0, 'Finishing and handover'],
    [1, 'Industrial floor finishing', 0, '17', 'floor-vdf', 2400, 0, 10, 'Civil crew B', 0],
    [1, 'Painting', 0, '25SS+5', 'paint', 3000, 0, 6, 'Painting crew', 0],
    [1, 'Snagging and cleaning', 5, '23, 26', null, 0, 160, 4, 'Civil crew A', 0],
    [1, 'Handover to client', 0, '27', null, 0, 0, 0, '', 0],
  ];

  const tasks = rows.map((r, i) => {
    const t = { id: i + 1, level: r[0], name: r[1], preds: [] };
    if (r.length > 2) {
      const n = r[4] ? norm(r[4]) : null;
      t.duration = r[2];
      t.crew = r[7];
      t.resource = r[8];
      t.pct = r[9];
      if (n) { t.normId = n.id; t.qty = r[5]; t.manhours = U.round(n.mh * r[5], 2); }
      else t.manhours = r[6];
      t.effortDriven = t.manhours > 0 && t.crew > 0 && !r[2];
    }
    return t;
  });
  rows.forEach((r, i) => {
    if (r[3]) tasks[i].preds = PS.schedule.parsePreds(r[3], tasks).links;
  });

  const project = {
    id: U.uid(),
    name: 'Warehouse extension (example)',
    isSample: true,
    startDate: start,
    statusDate: today,
    calendar: { workDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, holidays: [] },
    productivityFactor: 1,
    currency: '',
    tasks,
    history: [],
    created: Date.now(),
    updated: Date.now(),
  };

  // Lock actual starts for started work, then baseline a slightly earlier plan so variance shows.
  project.rescheduleFromStatus = false;
  let r = PS.schedule.compute(project);
  project.rescheduleFromStatus = true;
  tasks.forEach((t) => {
    if (!t._summary && t.pct > 0) t.actualStart = t.start;
    if (!t._summary && t.pct >= 100) t.actualFinish = t.finish;
  });
  r = PS.schedule.compute(project);
  tasks.forEach((t) => {
    if (t._summary) return;
    const shift = t._row > 10 ? -2 : 0;
    t.baselineStart = r.cal.dateOf(t.es + shift);
    t.baselineFinish = t._dur > 0 ? r.cal.dateOf(t.ef - 1 + shift) : r.cal.dateOf(t.es + shift);
    t.baselineDuration = t._dur;
    t.baselineManhours = t._mh;
  });
  r = PS.schedule.compute(project);

  // Weekly progress history, consistent with today's progress
  const totalMH = r.leaves.reduce((a, t) => a + t._mh, 0);
  for (let day = 7; day <= back; day += 7) {
    const iso = U.addDaysISO(start, day);
    if (iso >= today) break;
    const idx = r.cal.indexOf(iso, 'start');
    let ev = 0;
    r.leaves.forEach((t) => {
      const frac = t._dur > 0 ? U.clamp((idx - t.es) / t._dur, 0, 1) : (idx > t.es ? 1 : 0);
      ev += t._mh * Math.min(frac, t.pct / 100);
    });
    project.history.push({ date: iso, earned: U.round(ev, 1), pct: U.round(100 * ev / totalMH, 2) });
  }
  return project;
};
