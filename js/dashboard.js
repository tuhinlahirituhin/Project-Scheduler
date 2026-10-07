/* Progress dashboard: KPI tiles, S-curve, weekly man-hours, phase progress, status mix,
   a custom chart builder and an attention list. Uses Chart.js. */
window.PS = window.PS || {};

PS.dashboard = (function () {
  const U = PS.util;
  const charts = {};
  const builder = U.store.get('ps.builder', { dim: 'phase', measure: 'manhours', type: 'bar' });

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SERIES = () => ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(css);
  const STATUS_COLOR = () => ({ 'Completed': css('--good'), 'In progress': css('--s1'), 'Behind': css('--serious'), 'Overdue': css('--critical'), 'Not started': css('--muted-dot') });

  const bgPlugin = { id: 'bgfill', beforeDraw(c) { const ctx = c.ctx; ctx.save(); ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); } };
  const statusLine = {
    id: 'statusLine',
    afterDatasetsDraw(c, args, o) {
      if (o == null || o.index == null || o.index < 0) return;
      const x = c.scales.x.getPixelForValue(o.index);
      const { top, bottom } = c.chartArea;
      const ctx = c.ctx;
      ctx.save(); ctx.strokeStyle = css('--accent'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = css('--accent'); ctx.font = '600 11px ' + css('--font-body');
      ctx.fillText('Status date', x + 5, top + 12); ctx.restore();
    },
  };

  function setDefaults() {
    if (typeof Chart === 'undefined') return false;
    Chart.defaults.font.family = css('--font-body');
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css('--ink-2');
    Chart.defaults.borderColor = css('--line-soft');
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = css('--surface');
    Chart.defaults.plugins.tooltip.titleColor = css('--ink');
    Chart.defaults.plugins.tooltip.bodyColor = css('--ink-2');
    Chart.defaults.plugins.tooltip.borderColor = css('--line');
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;
    return true;
  }

  function make(id, cfg) {
    if (charts[id]) charts[id].destroy();
    const cv = document.getElementById(id);
    if (!cv) return null;
    cfg.plugins = (cfg.plugins || []).concat([bgPlugin]);
    charts[id] = new Chart(cv, cfg);
    return charts[id];
  }

  function kpi(label, value, detail, extra) {
    return `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${value}</span>${extra || ''}<span class="d">${detail}</span></div>`;
  }

  function render(root, project, res) {
    Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
    const A = PS.analytics.summary(project, res);
    if (!A.count) {
      root.innerHTML = `<div class="dash-head"><h2>${U.esc(project.name)}</h2></div><p class="empty-note">Add tasks on the Schedule tab or import a spreadsheet to see progress charts here.</p>`;
      return;
    }
    const spiPill = A.spi == null ? '<span class="pill neutral">Not started yet</span>'
      : A.spi >= 0.95 ? `<span class="pill good">✓ On track</span>` : A.spi >= 0.85 ? `<span class="pill warn">▲ Slightly behind</span>` : `<span class="pill bad">▲ Behind plan</span>`;
    let finVar = '';
    if (res.baselineFinishISO) {
      const v = U.daysBetween(res.baselineFinishISO, res.finishISO);
      finVar = v > 0 ? `<span class="pill bad">${v} d late vs baseline</span>` : v < 0 ? `<span class="pill good">${-v} d early vs baseline</span>` : '<span class="pill good">On baseline</span>';
    } else finVar = '<span class="pill neutral">No baseline</span>';
    const unitShort = A.unit === 'man-hours' ? 'MH' : 'task-days';

    root.innerHTML = `
      <div class="dash-head">
        <div><span class="eyebrow">Progress dashboard</span><h2>${U.esc(project.name)}</h2></div>
        <div class="meta">Status date <b>${U.fmtDate(res.statusISO)}</b> · ${A.count} activities · weighted by ${A.unit}</div>
      </div>
      <div class="kpis">
        ${kpi('Overall progress', U.round(A.actualPct, 1) + '<small>%</small>', `Planned ${U.round(A.plannedPct, 1)}% by status date`,
          `<div class="bar" title="Actual vs planned"><i style="width:${U.clamp(A.actualPct, 0, 100)}%"></i><u style="left:${U.clamp(A.plannedPct, 0, 100)}%"></u></div>`)}
        ${kpi('Schedule performance', A.spi == null ? '–' : U.round(A.spi, 2), spiPill)}
        ${kpi('Forecast finish', U.fmtDate(res.finishISO), finVar)}
        ${kpi('Earned ' + unitShort, A.unit === 'man-hours' ? U.fmtNum(A.earnedMH, 0) : '–', A.unit === 'man-hours' ? `of ${U.fmtNum(A.totalMH, 0)} MH total` : 'Add man-hours to tasks to track effort')}
        ${kpi('Critical activities', A.criticalOpen, 'Open tasks with zero float')}
        ${kpi('Behind plan', (A.statusCounts.Behind || 0) + (A.statusCounts.Overdue || 0), `${A.statusCounts.Completed || 0} completed · ${A.statusCounts['Not started'] || 0} not started`)}
      </div>
      <div class="cards">
        <div class="card w8">
          <div class="card-head"><div><h3>S-curve</h3><span class="sub">Cumulative progress, % of total ${A.unit}</span></div>
            <div class="legend" id="lg-s"></div></div>
          <div class="chart-box tall"><canvas id="c-scurve" aria-label="S-curve of planned and actual progress"></canvas></div>
        </div>
        <div class="card w4">
          <div class="card-head"><div><h3>Activity status</h3><span class="sub">Count of activities</span></div></div>
          <div class="chart-box"><canvas id="c-status" aria-label="Activities by status"></canvas></div>
          <div class="legend" id="lg-status"></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Progress by phase</h3><span class="sub">Planned vs actual % complete</span></div>
            <div class="legend"><span><i class="sq" style="background:var(--baseline)"></i>Planned</span><span><i class="sq" style="background:var(--s1)"></i>Actual</span></div></div>
          <div class="chart-box"><canvas id="c-phase" aria-label="Progress by phase"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>${A.unit === 'man-hours' ? 'Man-hour histogram' : 'Workload histogram'}</h3><span class="sub">Planned ${A.unit} per week</span></div></div>
          <div class="chart-box"><canvas id="c-hist" aria-label="Planned workload per week"></canvas></div>
        </div>
        <div class="card wide">
          <div class="card-head"><div><h3>Chart builder</h3><span class="sub">Pick what to compare, then save the chart as an image</span></div>
            <button class="btn" type="button" id="cb-png"><svg><use href="#i-image"/></svg>Save as PNG</button></div>
          <div class="builder">
            <label class="field"><span>Group by</span><select id="cb-dim">${Object.entries(PS.analytics.DIMENSIONS).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('')}</select></label>
            <label class="field"><span>Measure</span><select id="cb-measure">${Object.entries(PS.analytics.MEASURES).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('')}</select></label>
            <label class="field"><span>Chart type</span><select id="cb-type">
              <option value="bar">Column</option><option value="hbar">Bar (horizontal)</option><option value="line">Line</option>
              <option value="doughnut">Doughnut</option><option value="pie">Pie</option><option value="polarArea">Polar area</option><option value="radar">Radar</option></select></label>
          </div>
          <div class="chart-box tall"><canvas id="c-builder" aria-label="Custom chart"></canvas></div>
          <div class="legend" id="lg-builder"></div>
        </div>
        <div class="card wide">
          <div class="card-head"><div><h3>Needs attention</h3><span class="sub">Behind plan, overdue, or critical and starting within 14 days</span></div></div>
          <div class="table-scroll" id="attention"></div>
        </div>
      </div>`;

    if (!setDefaults()) {
      root.querySelectorAll('.chart-box').forEach((b) => { b.innerHTML = '<p class="empty-note">Charts need an internet connection the first time the page loads.</p>'; });
      return;
    }
    const S = SERIES();

    // S-curve
    const weeks = PS.analytics.weekly(project, res);
    const statusIndex = weeks.findIndex((w) => w.week === PS.analytics.mondayOf(res.statusISO));
    const ds = [
      { label: 'Planned (current schedule)', data: weeks.map((w) => U.round(w.cumPlannedPct, 1)), borderColor: S[0], backgroundColor: S[0] + '1f', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.25 },
    ];
    if (res.hasBaseline) ds.push({ label: 'Baseline', data: weeks.map((w) => U.round(w.cumBaselinePct, 1)), borderColor: css('--ink-3'), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0.25 });
    ds.push({ label: 'Actual', data: weeks.map((w) => (w.actualPct == null ? null : U.round(w.actualPct, 1))), borderColor: S[1], backgroundColor: S[1], borderWidth: 2, pointRadius: weeks.map((w, i) => (i === statusIndex ? 5 : 2.5)), pointHoverRadius: 6, spanGaps: true, tension: 0.2 });
    document.getElementById('lg-s').innerHTML = ds.map((d) => `<span><i style="background:${d.borderColor}${d.borderDash ? ';opacity:.8' : ''}"></i>${d.label}</span>`).join('');
    make('c-scurve', {
      type: 'line',
      data: { labels: weeks.map((w) => U.fmtDate(w.week).slice(0, 6)), datasets: ds },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: css('--line-soft') } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } } },
        plugins: { statusLine: { index: statusIndex }, tooltip: { callbacks: { title: (it) => 'Week of ' + U.fmtDate(weeks[it[0].dataIndex].week), label: (c) => ' ' + c.dataset.label + ': ' + (c.parsed.y == null ? '–' : c.parsed.y + '%') } } },
      },
      plugins: [statusLine],
    });

    // Status doughnut
    const SC = STATUS_COLOR();
    const st = PS.analytics.STATUS_ORDER.filter((s) => A.statusCounts[s]);
    make('c-status', {
      type: 'doughnut',
      data: { labels: st, datasets: [{ data: st.map((s) => A.statusCounts[s]), backgroundColor: st.map((s) => SC[s]), borderColor: css('--surface'), borderWidth: 2 }] },
      options: { cutout: '62%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} (${Math.round(100 * c.parsed / A.count)}%)` } } } },
    });
    document.getElementById('lg-status').innerHTML = st.map((s) => `<span><i class="sq" style="background:${SC[s]}"></i>${s} <b class="num">${A.statusCounts[s]}</b></span>`).join('');

    // Phase progress
    const ph = PS.analytics.phases(project, res);
    make('c-phase', {
      type: 'bar',
      data: {
        labels: ph.map((p) => p.name.length > 28 ? p.name.slice(0, 27) + '…' : p.name),
        datasets: [
          { label: 'Planned', data: ph.map((p) => U.round(p.planned, 1)), backgroundColor: css('--baseline'), borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.7 },
          { label: 'Actual', data: ph.map((p) => U.round(p.actual, 1)), backgroundColor: S[0], borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.7 },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: css('--line-soft') } }, y: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { title: (it) => ph[it[0].dataIndex].name, label: (c) => ` ${c.dataset.label}: ${c.parsed.x}%` } } },
      },
    });

    // Histogram
    make('c-hist', {
      type: 'bar',
      data: { labels: weeks.map((w) => U.fmtDate(w.week).slice(0, 6)), datasets: [{ label: 'Planned', data: weeks.map((w) => U.round(w.planned, 1)), backgroundColor: weeks.map((w, i) => (i === statusIndex ? S[1] : S[0])), borderRadius: { topLeft: 3, topRight: 3 }, barPercentage: 0.9, categoryPercentage: 0.92 }] },
      options: {
        scales: { y: { beginAtZero: true, grid: { color: css('--line-soft') } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } } },
        plugins: { tooltip: { callbacks: { title: (it) => 'Week of ' + U.fmtDate(weeks[it[0].dataIndex].week), label: (c) => ` ${U.fmtNum(c.parsed.y, 0)} ${A.unit}` } } },
      },
    });

    // Builder
    const dimSel = document.getElementById('cb-dim'), mSel = document.getElementById('cb-measure'), tSel = document.getElementById('cb-type');
    dimSel.value = builder.dim; mSel.value = builder.measure; tSel.value = builder.type;
    const drawBuilder = () => {
      builder.dim = dimSel.value; builder.measure = mSel.value; builder.type = tSel.value;
      U.store.set('ps.builder', builder);
      const g = PS.analytics.group(project, res, builder.dim, builder.measure);
      const round = ['doughnut', 'pie', 'polarArea'].includes(builder.type);
      let colors;
      if (builder.dim === 'status') colors = g.labels.map((l) => SC[l] || css('--muted-dot'));
      else colors = g.labels.map((l, i) => (l === 'Other' ? css('--muted-dot') : S[i % 8]));
      const type = builder.type === 'hbar' ? 'bar' : builder.type;
      const single = !round && builder.type !== 'radar';
      const dataset = {
        label: g.measureLabel, data: g.values,
        backgroundColor: round ? colors : single ? (builder.dim === 'status' ? colors : S[0]) : S[0] + '33',
        borderColor: round ? css('--surface') : S[0], borderWidth: round ? 2 : type === 'line' || type === 'radar' ? 2 : 0,
        borderRadius: type === 'bar' ? 4 : 0, pointBackgroundColor: S[0], tension: 0.25, fill: type === 'radar',
      };
      const opts = {
        indexAxis: builder.type === 'hbar' ? 'y' : 'x',
        plugins: { tooltip: { callbacks: { label: (c) => ` ${g.measureLabel}: ${U.fmtNum(c.raw, builder.measure === 'count' ? 0 : 1)}` } } },
      };
      if (!round && type !== 'radar') {
        const valAxis = builder.type === 'hbar' ? 'x' : 'y';
        const catAxis = valAxis === 'x' ? 'y' : 'x';
        opts.scales = { [valAxis]: { beginAtZero: true, title: { display: true, text: g.measureLabel }, grid: { color: css('--line-soft') } }, [catAxis]: { grid: { display: false } } };
      }
      if (type === 'radar') opts.scales = { r: { beginAtZero: true, grid: { color: css('--line-soft') }, angleLines: { color: css('--line-soft') }, pointLabels: { color: css('--ink-2') }, ticks: { backdropColor: 'transparent' } } };
      if (type === 'polarArea') opts.scales = { r: { grid: { color: css('--line-soft') }, ticks: { backdropColor: 'transparent' } } };
      make('c-builder', { type, data: { labels: g.labels, datasets: [dataset] }, options: opts });
      document.getElementById('lg-builder').innerHTML = round || builder.dim === 'status'
        ? g.labels.map((l, i) => `<span><i class="sq" style="background:${colors[i]}"></i>${U.esc(l)} <b class="num">${U.fmtNum(g.values[i], builder.measure === 'count' ? 0 : 0)}</b></span>`).join('')
        : `<span><i class="sq" style="background:${S[0]}"></i>${g.measureLabel} by ${g.dimLabel.toLowerCase()}</span>`;
    };
    [dimSel, mSel, tSel].forEach((s) => s.addEventListener('change', drawBuilder));
    drawBuilder();
    document.getElementById('cb-png').addEventListener('click', () => {
      const c = charts['c-builder'];
      if (!c) return;
      fetch(c.toBase64Image('image/png', 1)).then((r) => r.blob()).then((b) => U.download(U.safeName(project.name) + '_chart.png', b));
    });

    // Attention list
    const att = A.attention.slice(0, 15);
    document.getElementById('attention').innerHTML = att.length ? `<table class="plain"><thead><tr><th>Row</th><th>Activity</th><th>Start</th><th>Finish</th><th class="num">Done</th><th class="num">Planned</th><th class="num">Float</th><th>Status</th></tr></thead><tbody>
      ${att.map((t) => `<tr><td class="num muted">${t._row}</td><td>${U.esc(t.name)}${t.resource ? `<div class="small muted">${U.esc(t.resource)}</div>` : ''}</td><td>${U.fmtDate(t.start)}</td><td>${U.fmtDate(t.finish)}</td>
        <td class="num">${Math.round(t.pct)}%</td><td class="num">${Math.round(t._planFrac * 100)}%</td><td class="num">${t.critical ? '<span class="pill bad">Critical</span>' : t.tf + ' d'}</td>
        <td><span class="status" style="padding:0"><span class="dot ${t.status.replace(' ', '')}" style="background:${SC[t.status]}"></span>${t.status}</span></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty-note">Nothing needs attention right now.</p>';
  }

  return { render };
})();
