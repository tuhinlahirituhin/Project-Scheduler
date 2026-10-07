/* Progress entry sheet: record installed quantities per activity by day, week or month.
   Each activity's % complete = quantity done ÷ scope quantity; the project's progress is the
   weightage-weighted sum (weightage = the activity's share of total man-hours). */
window.PS = window.PS || {};

PS.progress = (function () {
  const U = PS.util;
  const st = { period: 'week', anchor: null, filter: '', show: 'all', focus: null, projectId: null };
  const COUNT = { day: 14, week: 8, month: 6 };
  const MON = U.MONTHS;

  function periodStart(iso, period) {
    if (period === 'day') return iso;
    const d = U.parseISO(iso);
    if (period === 'week') return U.addDaysISO(iso, -((d.getUTCDay() + 6) % 7));
    return iso.slice(0, 8) + '01';
  }
  function periodEnd(start, period) {
    if (period === 'day') return start;
    if (period === 'week') return U.addDaysISO(start, 6);
    const d = U.parseISO(start);
    return U.toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  }
  function shift(start, period, n) {
    if (period === 'day') return U.addDaysISO(start, n);
    if (period === 'week') return U.addDaysISO(start, 7 * n);
    const d = U.parseISO(start);
    return U.toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
  }
  function label(start, period) {
    const d = U.parseISO(start);
    if (period === 'month') return `<b>${MON[d.getUTCMonth()]}</b> ${d.getUTCFullYear()}`;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    if (period === 'day') return `<span>${wd}</span> <b>${d.getUTCDate()} ${MON[d.getUTCMonth()]}</b>`;
    return `<span>Week of</span> <b>${d.getUTCDate()} ${MON[d.getUTCMonth()]}</b>`;
  }
  const sumIn = (log, a, b) => (log || []).reduce((s, e) => s + (e.date >= a && e.date <= b ? Number(e.qty) || 0 : 0), 0);
  const fmt = (v, dp) => (v == null || v === '' ? '' : U.fmtNum(v, dp == null ? 2 : dp));

  function render(root, ctx) {
    const p = ctx.project, r = ctx.res;
    if (st.projectId !== p.id) { st.projectId = p.id; st.anchor = null; }
    if (!st.anchor) st.anchor = p.statusDate;
    const n = COUNT[st.period];
    const last = periodStart(st.anchor, st.period);
    const periods = [];
    for (let i = n - 1; i >= 0; i--) { const s = shift(last, st.period, -i); periods.push({ s, e: periodEnd(s, st.period) }); }
    const today = U.todayISO();
    const lk = ctx.isLocked();

    const f = st.filter.trim().toLowerCase();
    const leafOk = (t) => {
      if (st.show === 'qty' && !(t.qty > 0)) return false;
      if (st.show === 'open' && t.pct >= 100) return false;
      if (st.show === 'now' && !(t.pct < 100 && t.start <= periods[n - 1].e && t.finish >= periods[0].s)) return false;
      return !f || (t.name + ' ' + (t.resource || '') + ' ' + t._wbs + ' ' + (t.unit || '')).toLowerCase().includes(f);
    };
    const keep = new Set();
    p.tasks.forEach((t) => { if (!t._summary && leafOk(t)) { keep.add(t.id); t._ancestors.forEach((a) => keep.add(a)); } });
    const rows = p.tasks.filter((t) => keep.has(t.id));

    // weighted progress per period (earned share of the project) and cumulative, actual vs planned
    const leaves = r.leaves;
    const cal = r.cal;
    const earnedIn = (t, a, b) => {
      if (t.qty > 0 && (t.progressLog || []).length) return t._wt * Math.min(1, sumIn(t.progressLog, a, b) / t.qty);
      return 0;
    };
    const cumTo = (t, b) => {
      if (t.qty > 0 && (t.progressLog || []).length) return t._wt * Math.min(1, sumIn(t.progressLog, '0000', b) / t.qty);
      return t.actualStart && t.actualStart <= b ? t._wt * (t.pct || 0) / 100 : 0;
    };
    const planTo = (t, b) => {
      const ix = cal.indexOf(U.addDaysISO(b, 1), 'start');
      const fr = t._dur > 0 ? U.clamp((ix - t.es) / t._dur, 0, 1) : (ix > t.es ? 1 : 0);
      return t._wt * fr;
    };
    const perPeriod = periods.map((q) => leaves.reduce((a, t) => a + earnedIn(t, q.s, q.e), 0));
    const cumAct = periods.map((q) => leaves.reduce((a, t) => a + cumTo(t, q.e), 0));
    const cumPlan = periods.map((q) => leaves.reduce((a, t) => a + planTo(t, q.e), 0));
    const overall = leaves.reduce((a, t) => a + t._wt * (t.pct || 0) / 100, 0);
    const qtyCount = leaves.filter((t) => t.qty > 0).length;

    const head = `<tr><th class="sticky c-wbs">WBS</th><th class="sticky c-act">Activity</th><th>Unit</th><th class="num">Scope</th><th class="num">Weight %</th><th class="num">Done to date</th><th class="num">%</th>
      ${periods.map((q) => `<th class="num per${q.s <= p.statusDate && p.statusDate <= q.e ? ' now' : ''}">${label(q.s, st.period)}</th>`).join('')}<th class="num">Remaining</th></tr>`;
    const body = rows.map((t) => {
      if (t._summary) {
        return `<tr class="sum" style="--lvl:${t.level}"><td class="sticky c-wbs">${t._wbs}</td><td class="sticky c-act"><span style="padding-left:${t.level * 14}px">${U.esc(t.name)}</span></td><td></td><td></td>
          <td class="num">${fmt(t._wt, 2)}</td><td></td><td class="num"><span class="pbar" style="--p:${U.clamp(t.pct, 0, 100)}%">${fmt(t.pct, 1)}</span></td>
          ${periods.map((q) => { const v = t._leaves.reduce((a, id) => a + earnedIn(r.byId.get(id), q.s, q.e), 0); return `<td class="num muted">${v ? fmt(v, 2) + '%' : ''}</td>`; }).join('')}<td></td></tr>`;
      }
      const has = t.qty > 0;
      const ro = lk ? ' readonly' : '';
      const cells = periods.map((q) => {
        const v = sumIn(t.progressLog, q.s, q.e);
        const future = q.s > today;
        return `<td class="num per"><input class="pcell" type="number" step="any" data-k="per" data-s="${q.s}" data-e="${q.e}" value="${v ? U.round(v, 4) : ''}"${has ? '' : ' disabled title="Enter the scope quantity first"'}${future ? ' data-future="1"' : ''} aria-label="Quantity done ${q.s} to ${q.e}"></td>`;
      }).join('');
      return `<tr data-id="${t.id}" class="${t.pct >= 100 ? 'done' : ''}"><td class="sticky c-wbs">${t._wbs}</td>
        <td class="sticky c-act"><button type="button" class="linkish" data-goto="${t.id}" style="padding-left:${t.level * 14}px" title="Open in the schedule">${U.esc(t.name)}</button></td>
        <td><input class="pcell unit" data-k="unit" list="unit-list" value="${U.esc(t.unit || '')}"${ro} aria-label="Unit"></td>
        <td class="num"><input class="pcell" type="number" min="0" step="any" data-k="qty" value="${has ? U.round(t.qty, 4) : ''}"${ro} aria-label="Scope quantity"></td>
        <td class="num">${fmt(t._wt, 2)}</td>
        <td class="num">${has && (t.progressLog || []).length ? fmt(t._qtyDone, 2) : has ? '<span class="muted" title="No quantities recorded yet; % complete was entered directly">–</span>' : ''}</td>
        <td class="num"><span class="pbar" style="--p:${U.clamp(t.pct || 0, 0, 100)}%">${fmt(t.pct || 0, 1)}</span></td>
        ${cells}
        <td class="num">${has ? fmt(Math.max(0, t.qty - (t._qtyDone || 0)), 2) : ''}</td></tr>`;
    }).join('');
    const foot = `
      <tr class="tot"><td class="sticky c-wbs"></td><td class="sticky c-act">Progress in period (weighted)</td><td colspan="5"></td>${perPeriod.map((v) => `<td class="num">${v ? fmt(v, 2) + '%' : '–'}</td>`).join('')}<td></td></tr>
      <tr class="tot act"><td class="sticky c-wbs"></td><td class="sticky c-act">Cumulative actual</td><td colspan="5"></td>${cumAct.map((v) => `<td class="num">${fmt(v, 1)}%</td>`).join('')}<td></td></tr>
      <tr class="tot plan"><td class="sticky c-wbs"></td><td class="sticky c-act">Cumulative planned</td><td colspan="5"></td>${cumPlan.map((v, i) => `<td class="num">${fmt(v, 1)}%${cumAct[i] + 0.05 < v && periods[i].s <= p.statusDate ? ' <span class="behind" title="Behind plan">▼</span>' : ''}</td>`).join('')}<td></td></tr>`;

    const oldWrap = root.querySelector('.pgrid-wrap');
    const viewKey = `${p.id}|${st.period}|${st.anchor}`;
    const prevScroll = oldWrap && st.viewKey === viewKey ? { left: oldWrap.scrollLeft, top: oldWrap.scrollTop } : null;
    st.viewKey = viewKey;
    root.innerHTML = `
      <div class="dash-head"><div><span class="eyebrow">Progress entry</span><h2>Quantities installed</h2></div>
        <div class="kpis-mini">
          <div class="kpi-chip c1"><span>Overall progress</span><b>${fmt(overall, 1)}%</b></div>
          <div class="kpi-chip c2"><span>Measured by quantity</span><b>${qtyCount} of ${leaves.length}</b></div>
          <div class="kpi-chip c3"><span>Status date</span><b>${U.fmtDate(p.statusDate)}</b></div>
        </div></div>
      <div class="ptools">
        <div class="btn-group" role="group" aria-label="Period">
          ${['day', 'week', 'month'].map((k) => `<button class="btn" type="button" data-period="${k}" aria-pressed="${st.period === k}">${k === 'day' ? 'Daily' : k === 'week' ? 'Weekly' : 'Monthly'}</button>`).join('')}
        </div>
        <div class="btn-group" role="group" aria-label="Move through time">
          <button class="btn icon" type="button" data-nav="-1" aria-label="Earlier"><svg><use href="#i-left"/></svg></button>
          <button class="btn" type="button" data-nav="0">Status date</button>
          <button class="btn icon" type="button" data-nav="1" aria-label="Later"><svg><use href="#i-right"/></svg></button>
        </div>
        <select id="pg-show" aria-label="Show">
          <option value="all"${st.show === 'all' ? ' selected' : ''}>All activities</option>
          <option value="now"${st.show === 'now' ? ' selected' : ''}>Active in these periods</option>
          <option value="open"${st.show === 'open' ? ' selected' : ''}>Not complete</option>
          <option value="qty"${st.show === 'qty' ? ' selected' : ''}>Measured by quantity</option>
        </select>
        <input type="search" id="pg-filter" placeholder="Filter activities" value="${U.esc(st.filter)}" aria-label="Filter activities">
      </div>
      <div class="note">Type the quantity done in each ${st.period === 'day' ? 'day' : st.period}. Progress = quantity done ÷ scope quantity, and each activity counts by its <b>weight</b> (its share of total man-hours). Entering a ${st.period} replaces any entries already inside it. ${lk ? '<b>The schedule is locked:</b> units and scope cannot change, but progress can be recorded.' : ''}</div>
      <div class="card pgrid-wrap"><table class="pgrid"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${8 + n}" class="muted" style="padding:16px">No activities match.</td></tr>`}</tbody><tfoot>${foot}</tfoot></table></div>
      <datalist id="unit-list">${ctx.unitList().map((u) => `<option value="${U.esc(u)}">`).join('')}</datalist>`;

    // keep the scroll position across re-renders; on a fresh view, show the latest periods
    const wrap = root.querySelector('.pgrid-wrap');
    if (prevScroll) { wrap.scrollLeft = prevScroll.left; wrap.scrollTop = prevScroll.top; } else wrap.scrollLeft = wrap.scrollWidth;

    if (st.focus) {
      const el = root.querySelector(st.focus);
      if (el) { el.focus(); if (el.select) el.select(); }
      st.focus = null;
    }
    if (!root._bound) bind(root, ctx);
  }

  function bind(root, ctx) {
    root._bound = true;
    const rerender = () => render(root, ctx);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-period],[data-nav],[data-goto]');
      if (!b) return;
      if (b.dataset.period) { st.period = b.dataset.period; st.anchor = ctx.project.statusDate; rerender(); }
      if (b.dataset.nav != null) {
        const d = +b.dataset.nav;
        st.anchor = d === 0 ? ctx.project.statusDate : shift(periodStart(st.anchor, st.period), st.period, d * Math.ceil(COUNT[st.period] / 2));
        rerender();
      }
      if (b.dataset.goto) ctx.select(+b.dataset.goto);
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'pg-filter') {
        st.filter = e.target.value; st.focus = '#pg-filter'; rerender();
        const f = root.querySelector('#pg-filter'); if (f) f.setSelectionRange(f.value.length, f.value.length);
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'pg-show') { st.show = e.target.value; rerender(); return; }
      const inp = e.target.closest('input.pcell');
      if (!inp) return;
      const tr = inp.closest('tr[data-id]');
      const t = ctx.res.byId.get(+tr.dataset.id);
      const k = inp.dataset.k;
      const v = inp.value.trim();
      if ((k === 'unit' || k === 'qty') && ctx.guard()) return rerender();
      const n = v === '' ? 0 : Number(v);
      if (k !== 'unit' && (isNaN(n) || n < 0)) { ctx.toast('Enter a positive number'); return rerender(); }
      // keep the cursor where the user was going
      const active = document.activeElement;
      if (active && active !== inp && active.classList && active.classList.contains('pcell')) {
        const atr = active.closest('tr[data-id]');
        st.focus = atr ? `tr[data-id="${atr.dataset.id}"] input[data-k="${active.dataset.k}"]${active.dataset.s ? `[data-s="${active.dataset.s}"]` : ''}` : null;
      }
      ctx.mutate(() => {
        if (k === 'unit') t.unit = v;
        else if (k === 'qty') { if (n > 0) t.qty = n; else delete t.qty; ctx.applyNorm(t); if (t.progressLog) ctx.syncLog(t); }
        else {
          const s = inp.dataset.s, en = inp.dataset.e, today = U.todayISO();
          const date = st.period === 'day' ? s : (today >= s && today <= en ? today : en);
          ctx.setPeriodQty(t, s, en, date, n);
        }
      });
    });
    root.addEventListener('keydown', (e) => {
      const inp = e.target.closest('input.pcell');
      if (!inp || e.key !== 'Enter') return;
      e.preventDefault();
      const tr = inp.closest('tr');
      let nx = tr.nextElementSibling;
      while (nx && !nx.querySelector(`input[data-k="${inp.dataset.k}"]${inp.dataset.s ? `[data-s="${inp.dataset.s}"]` : ''}:not([disabled])`)) nx = nx.nextElementSibling;
      const target = nx && nx.querySelector(`input[data-k="${inp.dataset.k}"]${inp.dataset.s ? `[data-s="${inp.dataset.s}"]` : ''}`);
      if (target) {
        st.focus = `tr[data-id="${nx.dataset.id}"] input[data-k="${inp.dataset.k}"]${inp.dataset.s ? `[data-s="${inp.dataset.s}"]` : ''}`;
        if (inp.value === inp.defaultValue) { st.focus = null; target.focus(); target.select(); } else inp.blur();
      } else inp.blur();
    });
  }

  return { render, periodStart, periodEnd };
})();
