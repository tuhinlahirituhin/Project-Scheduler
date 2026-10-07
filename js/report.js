/* Formatted Excel report: dashboard with KPI tiles and chart images, a cell-based Gantt chart,
   and styled data sheets. Uses ExcelJS (loaded on first export) and Chart.js for the images. */
window.PS = window.PS || {};

PS.report = (function () {
  const U = PS.util;
  // Fixed light palette: spreadsheets are printed and viewed on white.
  const C = {
    ink: '#14202a', ink2: '#4a5761', ink3: '#7b8790', grid: '#e7ecee', line: '#d6dde1', accent: '#0b7470', accentSoft: '#d9efed',
    s1: '#2a78d6', s1dark: '#184f95', s2: '#eb6834', baseline: '#b9c2c8', summary: '#29343c',
    good: '#0ca30c', goodInk: '#006300', serious: '#ec835a', seriousInk: '#a8481f', critical: '#d03b3b', critInk: '#8e2121', muted: '#9aa5ad',
    weekend: '#f0f3f5', band: '#f6f8f9',
  };
  const STATUS_FILL = { 'Completed': 'e3f4e3', 'In progress': 'e3eefb', 'Behind': 'fde9df', 'Overdue': 'f9e0e0', 'Not started': 'f0f2f4' };
  const STATUS_COLOR = { 'Completed': C.good, 'In progress': C.s1, 'Behind': C.serious, 'Overdue': C.critical, 'Not started': C.muted };
  const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
  const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
  const thin = (hex) => ({ style: 'thin', color: { argb: argb(hex || C.line) } });
  const box = (hex) => ({ top: thin(hex), left: thin(hex), bottom: thin(hex), right: thin(hex) });
  const FONT = 'Calibri';
  const dateOf = (iso) => (iso ? new Date(iso + 'T00:00:00Z') : null);

  let loading = null;
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/exceljs.min.js';
      s.onload = () => res();
      s.onerror = () => { loading = null; rej(new Error('The Excel report library could not load. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // ---------------------------------------------------------------- chart images
  function renderChart(cfg, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const bg = { id: 'bg', beforeDraw(c) { const x = c.ctx; x.save(); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.restore(); } };
    cfg.options = Object.assign({ responsive: false, animation: false, devicePixelRatio: 2, maintainAspectRatio: false }, cfg.options || {});
    cfg.options.plugins = Object.assign({ legend: { display: true, position: 'bottom', labels: { color: C.ink2, boxWidth: 12, font: { size: 12 } } } }, cfg.options.plugins || {});
    cfg.options.plugins.title = Object.assign({ display: true, color: C.ink, align: 'start', font: { size: 15, weight: '600' }, padding: { bottom: 12 } }, cfg.options.plugins.title || {});
    cfg.plugins = (cfg.plugins || []).concat([bg]);
    const chart = new Chart(cv, cfg);
    const url = chart.toBase64Image('image/png', 1);
    chart.destroy();
    return url;
  }
  const axis = (extra) => Object.assign({ grid: { color: C.grid }, ticks: { color: C.ink2, font: { size: 11 } }, border: { color: C.line } }, extra || {});

  function chartImages(project, res, A, weeks) {
    if (typeof Chart === 'undefined') return {};
    const prev = { family: Chart.defaults.font.family, color: Chart.defaults.color };
    Chart.defaults.font.family = 'Calibri, "IBM Plex Sans", Arial, sans-serif';
    Chart.defaults.color = C.ink2;
    const statusIndex = weeks.findIndex((w) => w.week === PS.analytics.mondayOf(res.statusISO));
    const labels = weeks.map((w) => U.fmtDate(w.week).slice(0, 6));
    const statusLine = {
      id: 'sl', afterDatasetsDraw(c) {
        if (statusIndex < 0) return;
        const x = c.scales.x.getPixelForValue(statusIndex), { top, bottom } = c.chartArea, g = c.ctx;
        g.save(); g.strokeStyle = C.accent; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke();
        g.setLineDash([]); g.fillStyle = C.accent; g.font = '600 11px Calibri, Arial'; g.fillText('Status date', x + 5, top + 12); g.restore();
      },
    };
    const out = {};
    const ds = [{ label: 'Planned (current schedule)', data: weeks.map((w) => U.round(w.cumPlannedPct, 1)), borderColor: C.s1, backgroundColor: C.s1 + '22', fill: true, borderWidth: 2.5, pointRadius: 0, tension: 0.25 }];
    if (res.hasBaseline) ds.push({ label: 'Baseline', data: weeks.map((w) => U.round(w.cumBaselinePct, 1)), borderColor: C.ink3, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.25, fill: false });
    ds.push({ label: 'Actual', data: weeks.map((w) => (w.actualPct == null ? null : U.round(w.actualPct, 1))), borderColor: C.s2, backgroundColor: C.s2, borderWidth: 2.5, pointRadius: 3, spanGaps: true, tension: 0.2, fill: false });
    out.scurve = renderChart({
      type: 'line', data: { labels, datasets: ds }, plugins: [statusLine],
      options: { plugins: { title: { text: 'S-curve: cumulative progress (% of ' + A.unit + ')' } }, scales: { y: axis({ min: 0, max: 100, ticks: { color: C.ink2, callback: (v) => v + '%' } }), x: axis({ grid: { display: false }, ticks: { color: C.ink2, maxRotation: 0, autoSkipPadding: 12 } }) } },
    }, 840, 380);

    const st = PS.analytics.STATUS_ORDER.filter((s) => A.statusCounts[s]);
    out.status = renderChart({
      type: 'doughnut',
      data: { labels: st.map((s) => `${s} (${A.statusCounts[s]})`), datasets: [{ data: st.map((s) => A.statusCounts[s]), backgroundColor: st.map((s) => STATUS_COLOR[s]), borderColor: '#ffffff', borderWidth: 2 }] },
      options: { cutout: '58%', plugins: { title: { text: 'Activity status' }, legend: { position: 'right', labels: { color: C.ink2, boxWidth: 12 } } } },
    }, 440, 380);

    const ph = PS.analytics.phases(project, res);
    out.phase = renderChart({
      type: 'bar',
      data: {
        labels: ph.map((p) => (p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name)),
        datasets: [
          { label: 'Planned %', data: ph.map((p) => U.round(p.planned, 1)), backgroundColor: C.baseline, borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.7 },
          { label: 'Actual %', data: ph.map((p) => U.round(p.actual, 1)), backgroundColor: C.s1, borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.7 },
        ],
      },
      options: { indexAxis: 'y', plugins: { title: { text: 'Progress by phase' } }, scales: { x: axis({ min: 0, max: 100, ticks: { color: C.ink2, callback: (v) => v + '%' } }), y: axis({ grid: { display: false } }) } },
    }, 640, 360);

    out.hist = renderChart({
      type: 'bar',
      data: { labels, datasets: [{ label: 'Planned ' + A.unit + ' per week', data: weeks.map((w) => U.round(w.planned, 1)), backgroundColor: weeks.map((w, i) => (i === statusIndex ? C.s2 : C.s1)), borderRadius: 2, barPercentage: 0.9, categoryPercentage: 0.92 }] },
      options: { plugins: { title: { text: (A.unit === 'man-hours' ? 'Man-hour' : 'Workload') + ' histogram (planned per week)' }, legend: { display: false } }, scales: { y: axis({ beginAtZero: true }), x: axis({ grid: { display: false }, ticks: { color: C.ink2, maxRotation: 0, autoSkipPadding: 12 } }) } },
    }, 640, 360);
    Chart.defaults.font.family = prev.family; Chart.defaults.color = prev.color;
    return out;
  }

  // ---------------------------------------------------------------- sheet helpers
  function titleBlock(ws, lastCol, title, sub) {
    ws.mergeCells(1, 1, 1, lastCol);
    const t = ws.getCell(1, 1);
    t.value = title; t.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } }; t.fill = fill(C.accent);
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 34;
    ws.mergeCells(2, 1, 2, lastCol);
    const s = ws.getCell(2, 1);
    s.value = sub; s.font = { name: FONT, size: 10, italic: true, color: { argb: argb(C.ink2) } }; s.alignment = { indent: 1 };
    ws.getRow(2).height = 18;
  }
  function table(ws, startRow, cols, rows, opts) {
    opts = opts || {};
    const hr = ws.getRow(startRow);
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill(C.summary);
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', wrapText: true };
      cell.border = box(C.summary);
      if (c.width) ws.getColumn(i + 1).width = c.width;
    });
    hr.height = 30;
    rows.forEach((r, k) => {
      const row = ws.getRow(startRow + 1 + k);
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
        cell.value = v === '' || v == null ? null : v;
        cell.font = { name: FONT, size: 10, color: { argb: argb(C.ink) } };
        cell.border = { bottom: thin(C.grid) };
        cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
        if (c.fmt) cell.numFmt = c.fmt;
        if (opts.band && k % 2) cell.fill = fill(C.band);
        if (c.style) c.style(cell, r);
      });
      if (opts.rowStyle) opts.rowStyle(row, r);
    });
    if (rows.length) ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow + rows.length, column: cols.length } };
    return startRow + rows.length + 1;
  }
  const statusStyle = (cell, t) => {
    cell.fill = fill('#' + (STATUS_FILL[t.status] || 'ffffff'));
    cell.font = { name: FONT, size: 10, bold: t.status === 'Behind' || t.status === 'Overdue', color: { argb: argb(t.status === 'Overdue' ? C.critInk : t.status === 'Behind' ? C.seriousInk : C.ink) } };
  };

  // ---------------------------------------------------------------- dashboard sheet
  function dashboardSheet(wb, project, res, A, weeks, imgs) {
    const ws = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(C.accent) } } });
    for (let c = 1; c <= 16; c++) ws.getColumn(c).width = 11;
    titleBlock(ws, 16, project.name + ' · Progress dashboard',
      `Status date ${U.fmtDate(res.statusISO)} · Report created ${U.fmtDate(U.todayISO())} · ${A.count} activities · progress weighted by ${A.unit}`);
    let varTxt = 'No baseline saved', varCol = C.ink2;
    if (res.baselineFinishISO) {
      const v = U.daysBetween(res.baselineFinishISO, res.finishISO);
      varTxt = v > 0 ? `${v} days late vs baseline` : v < 0 ? `${-v} days early vs baseline` : 'On baseline';
      varCol = v > 0 ? C.critical : C.goodInk;
    }
    const spiCol = A.spi == null ? C.ink2 : A.spi >= 0.95 ? C.goodInk : A.spi >= 0.85 ? C.seriousInk : C.critical;
    const spiTxt = A.spi == null ? 'Not started yet' : A.spi >= 0.95 ? 'On track' : A.spi >= 0.85 ? 'Slightly behind' : 'Behind plan';
    const tiles = [
      ['OVERALL PROGRESS', U.round(A.actualPct, 1) / 100, '0.0%', `Planned ${U.round(A.plannedPct, 1)}% by status date`, C.ink],
      ['SCHEDULE PERFORMANCE (SPI)', A.spi == null ? '–' : U.round(A.spi, 2), '0.00', spiTxt, spiCol],
      ['FORECAST FINISH', dateOf(res.finishISO), 'dd mmm yyyy', varTxt, varCol],
      ['EARNED ' + (A.unit === 'man-hours' ? 'MAN-HOURS' : 'PROGRESS'), A.unit === 'man-hours' ? Math.round(A.earnedMH) : '–', '#,##0', A.unit === 'man-hours' ? `of ${U.fmtNum(A.totalMH, 0)} total` : 'Add man-hours to track effort', C.ink],
      ['CRITICAL ACTIVITIES', A.criticalOpen, '0', 'Open, zero float', A.criticalOpen ? C.critical : C.ink],
      ['BEHIND PLAN', (A.statusCounts.Behind || 0) + (A.statusCounts.Overdue || 0), '0', `${A.statusCounts.Completed || 0} done · ${A.statusCounts['Not started'] || 0} not started`, C.ink],
      ['PROJECT START', dateOf(res.startISO), 'dd mmm yyyy', 'First activity start', C.ink],
      ['ACTIVITIES', A.count, '0', `${A.statusCounts['In progress'] || 0} in progress`, C.ink],
    ];
    tiles.forEach((t, i) => {
      const c0 = 1 + i * 2;
      [4, 5, 6].forEach((r) => ws.mergeCells(r, c0, r, c0 + 1));
      const lab = ws.getCell(4, c0), val = ws.getCell(5, c0), det = ws.getCell(6, c0);
      lab.value = t[0]; lab.font = { name: FONT, size: 8, bold: true, color: { argb: argb(C.ink3) } };
      val.value = t[1]; val.numFmt = t[2]; val.font = { name: FONT, size: 20, bold: true, color: { argb: argb(t[4]) } };
      det.value = t[3]; det.font = { name: FONT, size: 9, color: { argb: argb(t[4] === C.ink ? C.ink2 : t[4]) } };
      [lab, val, det].forEach((c) => { c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true }; c.fill = fill('#f3f7f7'); });
      for (let r = 4; r <= 6; r++) for (let c = c0; c <= c0 + 1; c++) {
        const cell = ws.getCell(r, c);
        cell.border = { top: r === 4 ? thin(C.line) : undefined, bottom: r === 6 ? thin(C.line) : undefined, left: c === c0 ? { style: 'medium', color: { argb: argb(C.accent) } } : undefined, right: c === c0 + 1 ? thin(C.line) : undefined };
      }
    });
    ws.getRow(4).height = 18; ws.getRow(5).height = 32; ws.getRow(6).height = 28;

    const place = (key, col, row, w, h) => {
      if (!imgs[key]) return;
      const id = wb.addImage({ base64: imgs[key], extension: 'png' });
      ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } });
    };
    place('scurve', 0, 7, 840, 380);
    place('status', 10, 7, 440, 380);
    place('phase', 0, 27, 640, 360);
    place('hist', 8, 27, 640, 360);

    let r = 47;
    ws.getCell(r, 1).value = 'Needs attention';
    ws.getCell(r, 1).font = { name: FONT, size: 13, bold: true, color: { argb: argb(C.ink) } };
    ws.getCell(r + 1, 1).value = 'Activities behind plan, overdue, or critical and starting within 14 days of the status date';
    ws.getCell(r + 1, 1).font = { name: FONT, size: 9, italic: true, color: { argb: argb(C.ink2) } };
    const att = A.attention.slice(0, 25);
    if (!att.length) { ws.getCell(r + 3, 1).value = 'Nothing needs attention right now.'; return; }
    const hdr = ['Row', 'Activity', '', '', '', 'Start', '', 'Finish', '', 'Done', 'Planned', 'Float', 'Status', ''];
    const hrow = ws.getRow(r + 3);
    hdr.forEach((h, i) => { const c = hrow.getCell(i + 1); c.value = h || null; c.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(C.summary); c.alignment = { horizontal: i === 1 || i >= 12 ? 'left' : 'center' }; });
    att.forEach((t, k) => {
      const rr = r + 4 + k;
      ws.mergeCells(rr, 2, rr, 5); ws.mergeCells(rr, 6, rr, 7); ws.mergeCells(rr, 8, rr, 9); ws.mergeCells(rr, 13, rr, 14);
      const set = (col, v, fmt, extra) => { const c = ws.getCell(rr, col); c.value = v; if (fmt) c.numFmt = fmt; c.font = Object.assign({ name: FONT, size: 10 }, extra || {}); c.border = { bottom: thin(C.grid) }; c.alignment = { horizontal: col === 2 || col >= 13 ? 'left' : 'center' }; return c; };
      set(1, t._row); set(2, t.name + (t.resource ? '  ·  ' + t.resource : ''));
      set(6, dateOf(t.start), 'dd mmm yy'); set(8, dateOf(t.finish), 'dd mmm yy');
      set(10, t.pct / 100, '0%'); set(11, t._planFrac, '0%');
      set(12, t.critical ? 'Critical' : t.tf + ' d', null, t.critical ? { bold: true, color: { argb: argb(C.critical) } } : {});
      statusStyle(set(13, t.status), t);
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  // ---------------------------------------------------------------- Gantt sheet
  function ganttSheet(wb, project, res) {
    const ws = wb.addWorksheet('Gantt chart', { views: [{ state: 'frozen', xSplit: 7, ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: argb(C.s1) } } });
    const dates = [res.startISO, res.finishISO, res.statusISO];
    project.tasks.forEach((t) => { if (t.baselineFinish) dates.push(t.baselineFinish); });
    dates.sort();
    const span = U.daysBetween(dates[0], dates[dates.length - 1]) + 1;
    const unit = span <= 120 ? 'day' : span <= 7 * 160 ? 'week' : 'month';
    // periods
    const periods = [];
    let cur = unit === 'week' ? PS.analytics.mondayOf(dates[0]) : unit === 'month' ? dates[0].slice(0, 8) + '01' : dates[0];
    const endISO = U.addDaysISO(dates[dates.length - 1], unit === 'day' ? 2 : 7);
    while (cur <= endISO && periods.length < 400) {
      let next;
      if (unit === 'day') next = U.addDaysISO(cur, 1);
      else if (unit === 'week') next = U.addDaysISO(cur, 7);
      else { const d = U.parseISO(cur); next = U.toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))); }
      periods.push({ start: cur, end: U.addDaysISO(next, -1) });
      cur = next;
    }
    const FIXED = ['WBS', 'Activity', 'Start', 'Finish', 'Days', '% done', 'Float'];
    const widths = [8, 42, 11, 11, 6, 7, 6];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const P0 = FIXED.length + 1;
    periods.forEach((p, i) => { ws.getColumn(P0 + i).width = unit === 'day' ? 3.2 : unit === 'week' ? 3.6 : 5; });
    const lastCol = P0 + periods.length - 1;
    titleBlock(ws, Math.min(lastCol, 40), project.name + ' · Gantt chart',
      `Timeline in ${unit}s · Status date ${U.fmtDate(res.statusISO)} · Blue = activity, red = critical path, dark = summary, ◆ = milestone, darker shading = work done`);
    // header rows 4 (group) and 5 (unit)
    const groupKey = (p) => (unit === 'month' ? p.start.slice(0, 4) : p.start.slice(0, 7));
    let gs = 0;
    for (let i = 0; i <= periods.length; i++) {
      if (i === periods.length || groupKey(periods[i]) !== groupKey(periods[gs])) {
        if (i - 1 > gs) ws.mergeCells(4, P0 + gs, 4, P0 + i - 1);
        const c = ws.getCell(4, P0 + gs);
        const d = U.parseISO(periods[gs].start);
        c.value = unit === 'month' ? String(d.getUTCFullYear()) : U.MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
        c.font = { name: FONT, size: 9, bold: true, color: { argb: argb(C.ink) } };
        c.alignment = { horizontal: 'left', indent: 0 };
        c.fill = fill('#e3e8eb');
        c.border = { left: thin(C.line) };
        gs = i;
      }
    }
    const statusP = periods.findIndex((p) => res.statusISO >= p.start && res.statusISO <= p.end);
    periods.forEach((p, i) => {
      const c = ws.getCell(5, P0 + i);
      const d = U.parseISO(p.start);
      c.value = unit === 'month' ? U.MONTHS[d.getUTCMonth()] : d.getUTCDate();
      c.font = { name: FONT, size: 8, color: { argb: argb(i === statusP ? C.accent : C.ink2) }, bold: i === statusP };
      c.alignment = { horizontal: 'center', textRotation: unit === 'month' ? 90 : 0 };
      c.fill = fill(unit === 'day' && !res.cal.isWork(d) ? '#e3e8eb' : '#eef1f3');
      c.border = { bottom: thin(C.line) };
    });
    FIXED.forEach((h, i) => {
      [4, 5].forEach((r) => { const c = ws.getCell(r, i + 1); c.fill = fill(C.summary); c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; });
      ws.mergeCells(4, i + 1, 5, i + 1);
      const c = ws.getCell(4, i + 1); c.value = h; c.alignment = { vertical: 'middle', horizontal: i > 1 ? 'center' : 'left', wrapText: true };
    });
    ws.getRow(5).height = unit === 'month' ? 30 : 16;

    project.tasks.forEach((t, k) => {
      const r = 6 + k;
      const row = ws.getRow(r);
      row.height = 17;
      const vals = [t._wbs, t.name, dateOf(t.start), dateOf(t.finish), t._dur, (t.pct || 0) / 100, t._summary ? null : (t.critical ? 'Crit' : t.tf)];
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { name: FONT, size: 10, bold: t._summary, color: { argb: argb(i === 6 && t.critical ? C.critical : i === 0 ? C.ink3 : C.ink) } };
        c.border = { bottom: thin(C.grid), right: i === 6 ? thin(C.line) : undefined };
        if (i === 1) c.alignment = { indent: Math.min(t.level * 2, 15) };
        if (i === 2 || i === 3) c.numFmt = 'dd-mmm-yy';
        if (i === 5) c.numFmt = '0%';
        if (i >= 4) c.alignment = { horizontal: 'center' };
        if (t._summary) c.fill = fill('#eef1f3');
      });
      // bar
      const doneUntil = t.milestone ? null : (() => {
        if (!t.pct) return null;
        const days = U.daysBetween(t.start, t.finish) + 1;
        return U.addDaysISO(t.start, Math.max(0, Math.round(days * t.pct / 100) - 1));
      })();
      const color = t._summary ? C.summary : t.critical ? C.critical : C.s1;
      const dark = t._summary ? C.summary : t.critical ? C.critInk : C.s1dark;
      periods.forEach((p, i) => {
        const c = row.getCell(P0 + i);
        const isStatus = i === statusP;
        const inBar = t.start <= p.end && t.finish >= p.start;
        c.border = { bottom: thin(C.grid), left: isStatus ? { style: 'medium', color: { argb: argb(C.accent) } } : undefined };
        if (t.milestone) {
          if (inBar) { c.value = '◆'; c.font = { name: FONT, size: 11, color: { argb: argb(t.pct >= 100 ? C.s1dark : t.critical ? C.critical : C.ink) } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; }
        } else if (inBar) {
          const done = doneUntil && p.start <= doneUntil;
          c.fill = fill(done ? dark : color);
        } else if (unit === 'day' && !res.cal.isWork(U.parseISO(p.start))) c.fill = fill(C.weekend);
        if (t._summary && !inBar) c.fill = fill(unit === 'day' && !res.cal.isWork(U.parseISO(p.start)) ? C.weekend : '#f7f9fa');
      });
      if (t.level > 0 && t.level <= 7) row.outlineLevel = t.level;
    });
    ws.properties.outlineLevelRow = Math.min(7, Math.max(0, ...project.tasks.map((t) => t.level)));
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8, printTitlesRow: '4:5' };
  }

  // ---------------------------------------------------------------- data sheets
  function scheduleSheet(wb, name, project, res, list) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3, xSplit: 3 }] });
    titleBlock(ws, 14, project.name + ' · ' + name, `Status date ${U.fmtDate(res.statusISO)} · Dates are working-day based · Critical activities have zero float`);
    const normName = (id) => { const n = (PS.app && PS.app.norms ? PS.app.norms() : PS.DEFAULT_NORMS).find((x) => x.id === id); return n ? n.name + ' (' + n.unit + ')' : ''; };
    const cols = [
      { header: 'Row', key: '_row', width: 6, align: 'center' },
      { header: 'WBS', key: '_wbs', width: 8 },
      { header: 'Activity', width: 44, value: (t) => t.name, style: (c, t) => { c.alignment = { indent: Math.min(t.level * 2, 15), vertical: 'middle' }; } },
      { header: 'Type', width: 10, value: (t) => (t._summary ? 'Summary' : t.milestone ? 'Milestone' : 'Task') },
      { header: 'Days', key: '_dur', width: 7, align: 'center' },
      { header: 'Start', width: 11, value: (t) => dateOf(t.start), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Finish', width: 11, value: (t) => dateOf(t.finish), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Predecessors', width: 16, value: (t) => PS.schedule.formatPreds(t, res.byId) },
      { header: 'Man-hours', width: 11, value: (t) => U.round(t._mh || 0, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Weight %', width: 9, value: (t) => (t._wt || 0) / 100, fmt: '0.00%', align: 'center' },
      { header: 'Unit', width: 8, value: (t) => (t._summary ? null : t.unit || null), align: 'center' },
      { header: 'Scope quantity', width: 11, value: (t) => (t._summary || !(t.qty > 0) ? null : Number(t.qty)), fmt: '#,##0.##', align: 'right' },
      { header: 'Quantity done', width: 11, value: (t) => (t._summary || !(t.qty > 0) ? null : U.round(t._qtyDone || 0, 3)), fmt: '#,##0.##', align: 'right' },
      { header: 'Crew', width: 6, value: (t) => (t._summary ? null : t.crew || null), align: 'center' },
      { header: 'Resource', width: 16, value: (t) => (t._summary ? null : t.resource || null) },
      { header: 'Norm', width: 30, value: (t) => (t.normId ? normName(t.normId) : t.rate != null ? 'Own norm: ' + t.rate + ' MH/' + (t.unit || 'unit') : null) },
      { header: '% done', width: 9, value: (t) => (t.pct || 0) / 100, fmt: '0%', align: 'center' },
      { header: 'Planned % at status', width: 10, value: (t) => t._planFrac || 0, fmt: '0%', align: 'center' },
      { header: 'Earned MH', width: 10, value: (t) => U.round(t._ev || 0, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Float (days)', width: 8, value: (t) => t.tf, align: 'center', style: (c, t) => { if (t.critical) c.font = { name: FONT, size: 10, bold: true, color: { argb: argb(C.critical) } }; } },
      { header: 'Critical', width: 8, value: (t) => (t.critical ? 'Yes' : 'No'), align: 'center', style: (c, t) => { if (t.critical) c.font = { name: FONT, size: 10, bold: true, color: { argb: argb(C.critical) } }; } },
      { header: 'Status', width: 12, value: (t) => t.status, style: statusStyle },
      { header: 'Baseline start', width: 11, value: (t) => dateOf(t.baselineStart), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Baseline finish', width: 11, value: (t) => dateOf(t.baselineFinish), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Finish variance (days)', width: 10, value: (t) => (t.baselineFinish ? U.daysBetween(t.baselineFinish, t.finish) : null), align: 'center', style: (c) => { if (c.value > 0) c.font = { name: FONT, size: 10, color: { argb: argb(C.critical) } }; } },
      { header: 'Actual start', width: 11, value: (t) => dateOf(t.actualStart), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Actual finish', width: 11, value: (t) => dateOf(t.actualFinish), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Notes', width: 30, value: (t) => t.notes || null },
    ];
    const statusCol = cols.findIndex((c) => c.header === 'Status') + 1;
    // data rows start at row 4 (header at row 3)
    table(ws, 3, cols, list, {
      rowStyle: (row, t) => {
        if (t._summary) row.eachCell({ includeEmpty: true }, (c, n) => { if (n <= cols.length && n !== statusCol) { c.fill = fill('#eef1f3'); c.font = Object.assign({}, c.font, { bold: true }); } });
        if (t.level > 0 && t.level <= 7 && name === 'Schedule') row.outlineLevel = t.level;
      },
    });
    if (name === 'Schedule') ws.properties.outlineLevelRow = Math.min(7, Math.max(0, ...list.map((t) => t.level)));
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: '3:3' };
  }

  function simpleSheet(wb, name, project, sub, cols, rows) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
    titleBlock(ws, Math.max(cols.length, 6), project.name + ' · ' + name, sub);
    table(ws, 3, cols, rows, { band: true });
    return ws;
  }

  // ---------------------------------------------------------------- build
  async function excel(project, res) {
    await loadExcelJS();
    const A = PS.analytics.summary(project, res);
    const weeks = PS.analytics.weekly(project, res);
    const wb = new ExcelJS.Workbook();
    wb.creator = (window.PS_CONFIG && PS_CONFIG.appName) || 'Planline';
    wb.created = new Date();
    let imgs = {};
    try { imgs = chartImages(project, res, A, weeks); } catch (e) { imgs = {}; }
    dashboardSheet(wb, project, res, A, weeks, imgs);
    ganttSheet(wb, project, res);
    scheduleSheet(wb, 'Schedule', project, res, project.tasks);
    scheduleSheet(wb, 'Critical path', project, res, project.tasks.filter((t) => !t._summary && t.critical));
    simpleSheet(wb, 'Weekly man-hours', project, 'Planned workload per week and cumulative progress. The S-curve on the Dashboard sheet is drawn from this table.', [
      { header: 'Week starting', width: 14, value: (w) => dateOf(w.week), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Planned ' + A.unit, width: 14, value: (w) => U.round(w.planned, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Cumulative planned', width: 14, value: (w) => U.round(w.cumPlanned, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Cumulative planned %', width: 14, value: (w) => w.cumPlannedPct / 100, fmt: '0.0%', align: 'center' },
      { header: 'Baseline cumulative %', width: 14, value: (w) => (w.cumBaselinePct == null ? null : w.cumBaselinePct / 100), fmt: '0.0%', align: 'center' },
      { header: 'Actual cumulative %', width: 14, value: (w) => (w.actualPct == null ? null : w.actualPct / 100), fmt: '0.0%', align: 'center' },
    ], weeks);
    simpleSheet(wb, 'Progress by phase', project, 'Top-level WBS phases: planned vs actual progress at the status date.', [
      { header: 'Phase', width: 36, key: 'name' },
      { header: 'Start', width: 12, value: (p) => dateOf(p.start), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Finish', width: 12, value: (p) => dateOf(p.finish), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'Man-hours', width: 12, value: (p) => U.round(p.mh, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Earned man-hours', width: 14, value: (p) => U.round(p.ev, 1), fmt: '#,##0.0', align: 'right' },
      { header: 'Planned %', width: 11, value: (p) => p.planned / 100, fmt: '0.0%', align: 'center' },
      { header: 'Actual %', width: 11, value: (p) => p.actual / 100, fmt: '0.0%', align: 'center', style: (c, p) => { if (p.actual + 5 < p.planned) c.font = { name: FONT, size: 10, bold: true, color: { argb: argb(C.seriousInk) } }; } },
    ], PS.analytics.phases(project, res));
    const g = PS.analytics.group(project, res, 'resource', 'manhours');
    const e = PS.analytics.group(project, res, 'resource', 'earned');
    const n = PS.analytics.group(project, res, 'resource', 'count');
    const logRows = [];
    project.tasks.forEach((t) => (t.progressLog || []).forEach((e) => logRows.push({ t, e })));
    logRows.sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.t._row - b.t._row));
    if (logRows.length) simpleSheet(wb, 'Progress log', project, 'Quantities recorded on the Progress entry sheet. % complete = quantity done ÷ scope quantity.', [
      { header: 'Date', width: 12, value: (x) => dateOf(x.e.date), fmt: 'dd-mmm-yy', align: 'center' },
      { header: 'WBS', width: 8, value: (x) => x.t._wbs },
      { header: 'Activity', width: 40, value: (x) => x.t.name },
      { header: 'Unit', width: 8, value: (x) => x.t.unit || null, align: 'center' },
      { header: 'Quantity', width: 11, value: (x) => Number(x.e.qty), fmt: '#,##0.##', align: 'right' },
      { header: 'Scope quantity', width: 12, value: (x) => Number(x.t.qty) || null, fmt: '#,##0.##', align: 'right' },
      { header: 'Weight %', width: 10, value: (x) => (x.t._wt || 0) / 100, fmt: '0.00%', align: 'center' },
      { header: 'Weighted progress', width: 12, value: (x) => (x.t.qty > 0 ? (x.t._wt || 0) / 100 * Number(x.e.qty) / x.t.qty : null), fmt: '0.00%', align: 'center' },
    ], logRows);
    simpleSheet(wb, 'By resource', project, 'Man-hours by resource or crew.', [
      { header: 'Resource / crew', width: 28, key: 'r' },
      { header: 'Activities', width: 11, key: 'n', align: 'center' },
      { header: 'Man-hours', width: 12, key: 'mh', fmt: '#,##0.0', align: 'right' },
      { header: 'Earned man-hours', width: 14, key: 'ev', fmt: '#,##0.0', align: 'right' },
      { header: '% earned', width: 10, value: (x) => (x.mh ? x.ev / x.mh : 0), fmt: '0%', align: 'center' },
    ], g.labels.map((l, i) => ({ r: l, mh: g.values[i], ev: e.values[e.labels.indexOf(l)] || 0, n: n.values[n.labels.indexOf(l)] || 0 })));
    const buf = await wb.xlsx.writeBuffer();
    U.download(U.safeName(project.name) + '_report_' + U.todayISO() + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  return { excel, chartImages };
})();
