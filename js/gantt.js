/* SVG Gantt chart with dependency arrows, critical path, progress, baseline and status-date line. */
window.PS = window.PS || {};

PS.gantt = (function () {
  const U = PS.util;
  const NS = 'http://www.w3.org/2000/svg';
  const ZOOM = { day: { px: 28, pad: 4 }, week: { px: 9, pad: 10 }, month: { px: 3, pad: 25 } };
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let state = null;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function render(headEl, bodyEl, project, res, rows, opts) {
    const z = ZOOM[opts.zoom] || ZOOM.week;
    const px = z.px;
    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')) || 34;
    const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 48;

    const dates = [res.startISO, res.finishISO, res.statusISO];
    project.tasks.forEach((t) => { if (t.start) dates.push(t.start, t.finish); if (t.baselineStart) dates.push(t.baselineStart, t.baselineFinish); });
    dates.sort();
    let minISO = U.addDaysISO(dates[0], -z.pad);
    if (opts.zoom === 'week') minISO = PS.analytics.mondayOf(minISO);
    if (opts.zoom === 'month') minISO = minISO.slice(0, 8) + '01';
    const maxISO = U.addDaysISO(dates[dates.length - 1], z.pad * 2 + 20);
    const nDays = U.daysBetween(minISO, maxISO) + 1;
    const W = nDays * px;
    const H = Math.max(rows.length * rowH, 10);
    const xOf = (iso) => U.daysBetween(minISO, iso) * px;
    state = { xOf, minISO, px, bodyEl, headEl };

    // ---------- header
    headEl.innerHTML = '';
    const hs = el('svg', { width: W, height: headH - 1, 'aria-hidden': 'true' }, headEl);
    el('rect', { x: 0, y: 0, width: W, height: headH, fill: 'var(--surface-2)' }, hs);
    const half = (headH - 1) / 2;
    el('line', { x1: 0, x2: W, y1: half, y2: half, stroke: 'var(--line)' }, hs);
    const textAt = (x, y, s, cls) => { const t = el('text', { x, y, fill: cls === 'top' ? 'var(--ink)' : 'var(--ink-2)', 'font-size': cls === 'top' ? 11.5 : 11, 'font-weight': cls === 'top' ? 600 : 400 }, hs); t.textContent = s; return t; };
    // top tier: months (or years for month zoom)
    for (let i = 0; i < nDays; i++) {
      const iso = U.addDaysISO(minISO, i);
      const d = U.parseISO(iso);
      const x = i * px;
      if (opts.zoom === 'month') {
        if (i === 0 || (d.getUTCMonth() === 0 && d.getUTCDate() === 1)) textAt(x + 6, half - 8, String(d.getUTCFullYear()), 'top');
        if (d.getUTCMonth() === 0 && d.getUTCDate() === 1) el('line', { x1: x, x2: x, y1: 0, y2: half, stroke: 'var(--line)' }, hs);
        if (d.getUTCDate() === 1) {
          el('line', { x1: x, x2: x, y1: half, y2: headH, stroke: 'var(--line)' }, hs);
          textAt(x + 4, headH - 9, U.MONTHS[d.getUTCMonth()], 'low');
        }
      } else {
        if (i === 0 || d.getUTCDate() === 1) {
          if (d.getUTCDate() === 1) el('line', { x1: x, x2: x, y1: 0, y2: half, stroke: 'var(--line)' }, hs);
          const label = opts.zoom === 'day' ? MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : U.MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
          if (i === 0 && d.getUTCDate() > 24 && opts.zoom !== 'day') continue;
          textAt(x + 6, half - 8, label, 'top');
        }
        if (opts.zoom === 'day') {
          el('line', { x1: x, x2: x, y1: half, y2: headH, stroke: 'var(--line-soft)' }, hs);
          const t = textAt(x + px / 2, headH - 9, String(d.getUTCDate()), 'low');
          t.setAttribute('text-anchor', 'middle');
          if (!res.cal.isWork(d)) t.setAttribute('fill', 'var(--ink-3)');
        } else if (d.getUTCDay() === 1) {
          el('line', { x1: x, x2: x, y1: half, y2: headH, stroke: 'var(--line-soft)' }, hs);
          textAt(x + 4, headH - 9, String(d.getUTCDate()), 'low');
        }
      }
    }

    // ---------- body
    bodyEl.innerHTML = '';
    const svg = el('svg', { width: W, height: H + rowH * 2, role: 'img', 'aria-label': 'Gantt chart' }, bodyEl);
    const defs = el('defs', {}, svg);
    const mk = (id, color) => {
      const m = el('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0 0 L8 4 L0 8 z', fill: color }, m);
    };
    mk('arr', 'var(--ink-3)'); mk('arr-c', 'var(--crit)');
    if (opts.animate) svg.classList.add('anim');
    // one colour per top-level phase, with a soft vertical gradient
    const tops = project.tasks.filter((x) => x.level === 0).map((x) => x.id);
    const PAL = ['--s1', '--s3', '--s2', '--s7', '--s4', '--s5', '--s6', '--s8'];
    PAL.forEach((v, k) => {
      const lg2 = el('linearGradient', { id: 'gb' + k, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': `color-mix(in srgb, var(${v}) 70%, white)` }, lg2);
      el('stop', { offset: '100%', 'stop-color': `var(${v})` }, lg2);
    });
    const gc = el('linearGradient', { id: 'gcrit', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el('stop', { offset: '0%', 'stop-color': 'var(--crit)' }, gc);
    el('stop', { offset: '100%', 'stop-color': 'var(--s2)' }, gc);
    const phaseOf = (t) => {
      const top = t.level === 0 ? t.id : (t._ancestors && t._ancestors.length ? t._ancestors[t._ancestors.length - 1] : t.id);
      return Math.max(0, tops.indexOf(top)) % PAL.length;
    };

    const bg = el('g', {}, svg);
    // non-working days and grid
    if (opts.zoom !== 'month') {
      for (let i = 0; i < nDays; i++) {
        const iso = U.addDaysISO(minISO, i);
        const d = U.parseISO(iso);
        if (!res.cal.isWork(d)) el('rect', { x: i * px, y: 0, width: px, height: H + rowH * 2, fill: 'var(--weekend)' }, bg);
        if ((opts.zoom === 'week' && d.getUTCDay() === 1) || opts.zoom === 'day') el('line', { x1: i * px, x2: i * px, y1: 0, y2: H + rowH * 2, stroke: 'var(--line-soft)' }, bg);
      }
    } else {
      for (let i = 0; i < nDays; i++) {
        const d = U.parseISO(U.addDaysISO(minISO, i));
        if (d.getUTCDate() === 1) el('line', { x1: i * px, x2: i * px, y1: 0, y2: H + rowH * 2, stroke: 'var(--line-soft)' }, bg);
      }
    }
    rows.forEach((t, i) => {
      if (opts.selected && opts.selected.has(t.id)) el('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'var(--select)' }, bg);
      el('line', { x1: 0, x2: W, y1: (i + 1) * rowH - 0.5, y2: (i + 1) * rowH - 0.5, stroke: 'var(--line-soft)' }, bg);
    });

    const rowIndex = new Map(rows.map((t, i) => [t.id, i]));
    const geo = new Map();
    const hasBL = res.hasBaseline && opts.showBaseline !== false;

    rows.forEach((t, i) => {
      const yc = i * rowH + rowH / 2;
      const x1 = xOf(t.start);
      const x2 = xOf(t.finish) + px;
      if (t.milestone) geo.set(t.id, { x1: x1 + px / 2, x2: x1 + px / 2, yc, ms: true });
      else geo.set(t.id, { x1, x2, yc });
    });

    // links
    const lg = el('g', { fill: 'none' }, svg);
    rows.forEach((t) => {
      (t.preds || []).forEach((p) => {
        const a = geo.get(p.id), b = geo.get(t.id);
        if (!a || !b) return;
        const q = res.byId.get(p.id);
        const crit = q && q.critical && t.critical;
        const fromEnd = p.type === 'FS' || p.type === 'FF';
        const toEnd = p.type === 'FF' || p.type === 'SF';
        const sx = fromEnd ? a.x2 + (a.ms ? 6 : 0) : a.x1 - (a.ms ? 6 : 0);
        const ex = toEnd ? b.x2 + (b.ms ? 6 : 0) : b.x1 - (b.ms ? 6 : 0);
        const sy = a.yc, ey = b.yc;
        const dir = ey > sy ? 1 : -1;
        let d;
        if (!toEnd && fromEnd && ex - sx >= 12) {
          d = `M${sx} ${sy} H${Math.max(sx + 6, ex - 8)} V${ey} H${ex}`;
        } else if (!toEnd) {
          const out = fromEnd ? sx + 8 : sx - 8;
          const mid = ey - dir * rowH / 2;
          d = `M${sx} ${sy} H${out} V${mid} H${ex - 10} V${ey} H${ex}`;
        } else {
          const out = Math.max(sx, ex) + 10;
          d = `M${sx} ${sy} H${fromEnd ? out : sx - 8} ${fromEnd ? '' : `V${(sy + ey) / 2} H${out}`} V${ey} H${ex}`;
        }
        el('path', { d, stroke: crit ? 'var(--crit)' : 'var(--ink-3)', 'stroke-width': crit ? 1.4 : 1.1, 'marker-end': `url(#${crit ? 'arr-c' : 'arr'})`, opacity: crit ? 0.9 : 0.75 }, lg);
      });
    });

    // bars
    const g = el('g', {}, svg);
    rows.forEach((t, i) => {
      const { x1, x2, yc } = geo.get(t.id);
      const grp = el('g', { 'data-id': t.id, class: 'gbar', style: 'cursor:pointer' }, g);
      el('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' }, grp);
      let labelX = x2 + 6;
      if (hasBL && t.baselineStart && !t._summary) {
        const bx1 = xOf(t.baselineStart), bx2 = xOf(t.baselineFinish || t.baselineStart) + px;
        if (t.milestone) el('path', { d: `M${bx1 + px / 2} ${yc + 4} l4 4 l-4 4 l-4 -4 z`, fill: 'var(--baseline)' }, grp);
        else el('rect', { x: bx1, y: yc + 6, width: Math.max(bx2 - bx1, 2), height: 4, rx: 2, fill: 'var(--baseline)' }, grp);
      }
      const yOff = hasBL && !t._summary ? -3 : 0;
      if (t._summary) {
        const w = Math.max(x2 - x1, 2);
        el('rect', { x: x1, y: yc - 4, width: w, height: 7, rx: 1.5, fill: 'var(--summary)', class: 'bar' }, grp);
        if (t.pct > 0) el('rect', { x: x1, y: yc - 4, width: w * t.pct / 100, height: 3, fill: t.critical ? 'var(--crit)' : `var(${PAL[phaseOf(t)]})`, class: 'bar' }, grp);
        el('path', { d: `M${x1} ${yc + 3} v5 l5 -5 z M${x1 + w} ${yc + 3} v5 l-5 -5 z`, fill: 'var(--summary)' }, grp);
      } else if (t.milestone) {
        const cx = x1, cy = yc + yOff;
        el('path', { d: `M${cx} ${cy - 8} L${cx + 8} ${cy} L${cx} ${cy + 8} L${cx - 8} ${cy} z`, fill: t.pct >= 100 ? 'var(--good)' : t.critical ? 'var(--crit)' : 'var(--s4)', stroke: 'var(--surface)', 'stroke-width': 1.5, class: 'ms' }, grp);
        labelX = cx + 12;
        const tx = el('text', { x: labelX, y: cy + 4, 'font-size': 11, fill: 'var(--ink-2)' }, grp);
        tx.textContent = U.fmtDate(t.finish);
        labelX = null;
      } else {
        const w = Math.max(x2 - x1, 3);
        const col = t.critical ? 'url(#gcrit)' : `url(#gb${phaseOf(t)})`;
        el('rect', { x: x1, y: yc - 7 + yOff, width: w, height: 14, rx: 7, fill: col, opacity: t.pct >= 100 ? 0.6 : 1, class: 'bar' }, grp);
        if (t.pct > 0) el('rect', { x: x1, y: yc - 7 + yOff, width: w * t.pct / 100, height: 14, rx: 7, fill: 'rgba(10,20,40,.32)', class: 'bar prog' }, grp);
        if (t._cycle) el('rect', { x: x1 - 2, y: yc - 9 + yOff, width: w + 4, height: 18, rx: 5, fill: 'none', stroke: 'var(--critical)', 'stroke-dasharray': '3 2' }, grp);
      }
      if (labelX != null) {
        const lbl = t._summary ? '' : [t.resource, t.pct > 0 ? Math.round(t.pct) + '%' : ''].filter(Boolean).join(' · ');
        if (lbl) { const tx = el('text', { x: labelX, y: yc + 4 + yOff, 'font-size': 11, fill: 'var(--ink-3)' }, grp); tx.textContent = lbl; }
      }
    });

    // status-date line
    const sx = xOf(res.statusISO);
    el('line', { x1: sx, x2: sx, y1: 0, y2: H + rowH * 2, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
    const sl = el('line', { x1: sx, x2: sx, y1: 0, y2: headH, stroke: 'var(--accent)', 'stroke-width': 1.5 }, hs);
    const st = el('text', { x: sx + 4, y: headH - 9, 'font-size': 10.5, 'font-weight': 600, fill: 'var(--accent)' }, hs);
    st.textContent = 'Status';
    void sl;

    // interactions
    const tip = document.getElementById('gtip');
    svg.addEventListener('mousemove', (e) => {
      const grp = e.target.closest('.gbar');
      if (!grp) { tip.hidden = true; return; }
      const t = res.byId.get(+grp.dataset.id);
      if (!t) return;
      tip.innerHTML = `<b>${U.esc(t._wbs + '  ' + t.name)}</b>
        <span>${U.fmtDate(t.start)} → ${U.fmtDate(t.finish)} · ${t._dur} d</span>
        ${t._mh ? `<span>${U.fmtNum(t._mh, 0)} man-hours${t.crew && !t._summary ? ' · crew ' + t.crew : ''}</span>` : ''}
        <span>${Math.round(t.pct)}% complete · ${t.status}</span>
        <span>${t.critical ? 'On the critical path' : 'Float ' + t.tf + ' d'}</span>
        ${t.baselineFinish && !t._summary ? `<span>Baseline finish ${U.fmtDate(t.baselineFinish)}</span>` : ''}`;
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.addEventListener('click', (e) => {
      const grp = e.target.closest('.gbar');
      if (grp && opts.onSelect) opts.onSelect(+grp.dataset.id, e);
    });
    return { xOf, width: W };
  }

  function scrollTo(pane, iso) {
    if (!state) return;
    pane.scrollLeft = Math.max(0, state.xOf(iso) - pane.clientWidth / 3);
  }

  return { render, scrollTo };
})();
