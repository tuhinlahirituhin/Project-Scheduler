/* Exporters: Excel report workbook, CSV, MS Project XML, JSON backup, import template. */
window.PS = window.PS || {};

PS.exporters = (function () {
  const U = PS.util;

  function scheduleRows(project, res) {
    return project.tasks.map((t) => ({
      'Row': t._row,
      'WBS': t._wbs,
      'Level': t.level + 1,
      'Task name': '  '.repeat(t.level) + t.name,
      'Type': t._summary ? 'Summary' : t.milestone ? 'Milestone' : 'Task',
      'Duration (days)': t._dur,
      'Start': t.start,
      'Finish': t.finish,
      'Predecessors': PS.schedule.formatPreds(t, res.byId),
      'Man-hours': U.round(t._mh || 0, 2),
      'Weight %': U.round(t._wt || 0, 3),
      'Unit': t._summary ? '' : (t.unit || ''),
      'Scope quantity': t._summary ? '' : (t.qty || ''),
      'Quantity done': t._summary || !(t.qty > 0) ? '' : U.round(t._qtyDone || 0, 3),
      'Crew': t._summary ? '' : (t.crew || ''),
      'Resource': t._summary ? '' : (t.resource || ''),
      'Norm': t.normId ? normName(t.normId) : t.rate != null ? 'Own norm ' + t.rate + ' MH/' + (t.unit || 'unit') : '',
      '% Complete': U.round(t.pct || 0, 1),
      'Earned man-hours': U.round(t._ev || 0, 2),
      'Planned % at status date': U.round((t._planFrac || 0) * 100, 1),
      'Status': t.status,
      'Total float (days)': t.tf,
      'Critical': t.critical ? 'Yes' : 'No',
      'Baseline start': t.baselineStart || '',
      'Baseline finish': t.baselineFinish || '',
      'Finish variance (days)': t.baselineFinish ? U.daysBetween(t.baselineFinish, t.finish) : '',
      'Actual start': t.actualStart || '',
      'Actual finish': t.actualFinish || '',
      'Notes': t.notes || '',
    }));
  }
  function normName(id) {
    const n = (PS.app && PS.app.norms ? PS.app.norms() : PS.DEFAULT_NORMS).find((x) => x.id === id);
    return n ? n.name + ' (' + n.unit + ')' : id;
  }
  function sheetFrom(rows, widths) {
    const ws = XLSX.utils.json_to_sheet(rows);
    if (rows.length) {
      const keys = Object.keys(rows[0]);
      ws['!cols'] = keys.map((k, i) => ({ wch: (widths && widths[i]) || Math.min(48, Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] == null ? '' : r[k]).length + 1))) }));
      ws['!autofilter'] = { ref: ws['!ref'] };
    }
    return ws;
  }

  function excel(project, res) {
    if (typeof XLSX === 'undefined') throw new Error('The spreadsheet library did not load.');
    const A = PS.analytics.summary(project, res);
    const wb = XLSX.utils.book_new();
    const summary = [
      { Item: 'Project', Value: project.name },
      { Item: 'Report date', Value: U.todayISO() },
      { Item: 'Status date', Value: res.statusISO },
      { Item: 'Project start', Value: res.startISO },
      { Item: 'Forecast finish', Value: res.finishISO },
      { Item: 'Baseline finish', Value: res.baselineFinishISO || 'No baseline set' },
      { Item: 'Finish variance (calendar days)', Value: res.baselineFinishISO ? U.daysBetween(res.baselineFinishISO, res.finishISO) : '' },
      { Item: 'Activities', Value: A.count },
      { Item: 'Total man-hours', Value: U.round(A.totalMH, 1) },
      { Item: 'Earned man-hours', Value: U.round(A.earnedMH, 1) },
      { Item: 'Overall progress %', Value: U.round(A.actualPct, 1) },
      { Item: 'Planned progress % at status date', Value: U.round(A.plannedPct, 1) },
      { Item: 'Schedule performance index (SPI)', Value: A.spi == null ? '' : U.round(A.spi, 2) },
      { Item: 'Critical activities (open)', Value: A.criticalOpen },
      { Item: 'Activities behind plan', Value: A.statusCounts['Behind'] || 0 },
      { Item: 'Completed activities', Value: A.statusCounts['Completed'] || 0 },
    ];
    XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [36, 40]), 'Summary');
    XLSX.utils.book_append_sheet(wb, sheetFrom(scheduleRows(project, res)), 'Schedule');
    const crit = scheduleRows(project, res).filter((r, i) => !project.tasks[i]._summary && project.tasks[i].critical);
    XLSX.utils.book_append_sheet(wb, sheetFrom(crit.length ? crit : [{ Note: 'No open critical activities' }]), 'Critical path');
    const weeks = PS.analytics.weekly(project, res);
    XLSX.utils.book_append_sheet(wb, sheetFrom(weeks.map((w) => ({
      'Week starting': w.week,
      'Planned man-hours': U.round(w.planned, 1),
      'Cumulative planned man-hours': U.round(w.cumPlanned, 1),
      'Cumulative planned %': U.round(w.cumPlannedPct, 2),
      'Baseline cumulative %': w.cumBaselinePct == null ? '' : U.round(w.cumBaselinePct, 2),
      'Actual cumulative % (recorded)': w.actualPct == null ? '' : U.round(w.actualPct, 2),
    }))), 'Weekly man-hours');
    XLSX.utils.book_append_sheet(wb, sheetFrom(PS.analytics.phases(project, res).map((p) => ({
      Phase: p.name, 'Man-hours': U.round(p.mh, 1), 'Earned man-hours': U.round(p.ev, 1), 'Planned %': U.round(p.planned, 1), 'Actual %': U.round(p.actual, 1), Start: p.start, Finish: p.finish,
    }))), 'Progress by phase');
    const g = PS.analytics.group(project, res, 'resource', 'manhours');
    if (g.labels.length) {
      const e = PS.analytics.group(project, res, 'resource', 'earned');
      XLSX.utils.book_append_sheet(wb, sheetFrom(g.labels.map((l, i) => ({ Resource: l, 'Man-hours': U.round(g.values[i], 1), 'Earned man-hours': U.round(e.values[e.labels.indexOf(l)] || 0, 1) }))), 'By resource');
    }
    XLSX.writeFile(wb, U.safeName(project.name) + '_report_' + U.todayISO() + '.xlsx');
  }

  function csv(project, res) {
    const rows = scheduleRows(project, res);
    const keys = Object.keys(rows[0] || { Row: '' });
    const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = [keys.join(','), ...rows.map((r) => keys.map((k) => q(r[k])).join(','))].join('\n');
    U.download(U.safeName(project.name) + '_schedule.csv', '﻿' + text, 'text/csv;charset=utf-8');
  }

  function backup(project) {
    const clean = JSON.parse(JSON.stringify(project, (k, v) => (k.startsWith('_') ? undefined : v)));
    U.download(U.safeName(project.name) + '.planline.json', JSON.stringify(clean, null, 1), 'application/json');
  }

  function bundle(projects) {
    const clean = projects.map((p) => JSON.parse(JSON.stringify(p, (k, v) => (k.startsWith('_') ? undefined : v))));
    U.download('planline_all_projects_' + U.todayISO() + '.planline.json', JSON.stringify({ planline: 'bundle', version: 1, saved: new Date().toISOString(), projects: clean }), 'application/json');
  }

  function template() {
    if (typeof XLSX === 'undefined') throw new Error('The spreadsheet library did not load.');
    const rows = [
      { 'ID': 1, 'WBS': '1', 'Task name': 'Design phase', 'Duration': '', 'Start': '', 'Predecessors': '', 'Unit': '', 'Scope quantity': '', 'Quantity done': '', 'Man-hours': '', 'Crew': '', 'Resource': '', '% Complete': '' },
      { 'ID': 2, 'WBS': '1.1', 'Task name': 'Concept drawings', 'Duration': '5d', 'Start': '2026-11-02', 'Predecessors': '', 'Unit': 'sheet', 'Scope quantity': 6, 'Quantity done': 2, 'Man-hours': 120, 'Crew': 3, 'Resource': 'Design office', '% Complete': 0 },
      { 'ID': 3, 'WBS': '1.2', 'Task name': 'Client approval', 'Duration': 0, 'Start': '', 'Predecessors': '2', 'Unit': '', 'Scope quantity': '', 'Quantity done': '', 'Man-hours': '', 'Crew': '', 'Resource': 'Client', '% Complete': 0 },
      { 'ID': 4, 'WBS': '2', 'Task name': 'Construction', 'Duration': '', 'Start': '', 'Predecessors': '', 'Unit': '', 'Scope quantity': '', 'Quantity done': '', 'Man-hours': '', 'Crew': '', 'Resource': '', '% Complete': '' },
      { 'ID': 5, 'WBS': '2.1', 'Task name': 'Excavation', 'Duration': '8d', 'Start': '', 'Predecessors': '3', 'Unit': 'm³', 'Scope quantity': 450, 'Quantity done': '', 'Man-hours': 320, 'Crew': 5, 'Resource': 'Civil crew', '% Complete': 0 },
      { 'ID': 6, 'WBS': '2.2', 'Task name': 'Foundations', 'Duration': '2w', 'Start': '', 'Predecessors': '5SS+3d', 'Unit': 'm³', 'Scope quantity': 120, 'Quantity done': '', 'Man-hours': 640, 'Crew': 8, 'Resource': 'Civil crew', '% Complete': 0 },
      { 'ID': 7, 'WBS': '2.3', 'Task name': 'Handover', 'Duration': 0, 'Start': '', 'Predecessors': '6', 'Unit': '', 'Scope quantity': '', 'Quantity done': '', 'Man-hours': '', 'Crew': '', 'Resource': '', '% Complete': 0 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(rows), 'Tasks');
    XLSX.utils.book_append_sheet(wb, sheetFrom([
      { Column: 'ID', Meaning: 'Optional. Unique number that the Predecessors column refers to. Without it, predecessors refer to row numbers.' },
      { Column: 'WBS', Meaning: 'Optional. Outline code such as 1, 1.1, 1.1.2. Sets the hierarchy. You can use an "Outline level" column instead (1 = top).' },
      { Column: 'Task name', Meaning: 'Required.' },
      { Column: 'Duration', Meaning: 'Working days. Accepts 5, 5d, 2w, 16h. 0 makes a milestone. Leave empty to calculate it from man-hours ÷ (crew × hours per day).' },
      { Column: 'Start', Meaning: 'Optional. Used as "start no earlier than" when a task has no predecessors.' },
      { Column: 'Predecessors', Meaning: 'Comma separated. 3 = finish-to-start, 3SS+2d = start-to-start with 2 days lag. Types: FS, SS, FF, SF.' },
      { Column: 'Unit / Scope quantity / Quantity done', Meaning: 'Optional. Unit of measure (m, m³, MT, each...), total quantity, and quantity installed so far. Progress is then measured as done ÷ scope.' },
      { Column: 'Man-hours / Crew / Resource / % Complete', Meaning: 'Optional.' },
    ], [40, 110]), 'How to fill');
    XLSX.writeFile(wb, 'planline_import_template.xlsx');
  }

  // ---------- MS Project XML
  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])); }
  function mspdi(project, res) {
    const hpd = res.cal.hoursPerDay;
    const dur = (d) => 'PT' + Math.round(d * hpd * 100) / 100 + 'H0M0S';
    const typeCode = { FF: 0, FS: 1, SF: 2, SS: 3 };
    const resources = [...new Set(project.tasks.filter((t) => !t._summary && t.resource).flatMap((t) => t.resource.split(',').map((s) => s.trim()).filter(Boolean)))];
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    out.push('<Project xmlns="http://schemas.microsoft.com/project">');
    out.push('<Name>' + xmlEsc(U.safeName(project.name)) + '.xml</Name><Title>' + xmlEsc(project.name) + '</Title>');
    out.push('<ScheduleFromStart>1</ScheduleFromStart><StartDate>' + res.startISO + 'T08:00:00</StartDate>');
    out.push('<MinutesPerDay>' + Math.round(hpd * 60) + '</MinutesPerDay><MinutesPerWeek>' + Math.round(hpd * 60 * res.cal.workDays.length) + '</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>');
    out.push('<StatusDate>' + res.statusISO + 'T08:00:00</StatusDate><DurationFormat>7</DurationFormat><WorkFormat>2</WorkFormat>');
    out.push('<Tasks>');
    project.tasks.forEach((t) => {
      out.push('<Task>');
      out.push('<UID>' + t.id + '</UID><ID>' + t._row + '</ID><Name>' + xmlEsc(t.name) + '</Name><Type>1</Type><IsNull>0</IsNull>');
      out.push('<WBS>' + t._wbs + '</WBS><OutlineNumber>' + t._wbs + '</OutlineNumber><OutlineLevel>' + (t.level + 1) + '</OutlineLevel>');
      out.push('<Start>' + t.start + 'T08:00:00</Start><Finish>' + t.finish + 'T17:00:00</Finish>');
      out.push('<Duration>' + dur(t._planDur != null ? t._planDur : t._dur) + '</Duration><DurationFormat>7</DurationFormat>');
      if (t._mh) out.push('<Work>' + 'PT' + U.round(t._mh, 2) + 'H0M0S</Work>');
      out.push('<Milestone>' + (t.milestone ? 1 : 0) + '</Milestone><Summary>' + (t._summary ? 1 : 0) + '</Summary><Critical>' + (t.critical ? 1 : 0) + '</Critical>');
      out.push('<PercentComplete>' + Math.round(t.pct || 0) + '</PercentComplete><Manual>0</Manual>');
      if (t.actualStart) out.push('<ActualStart>' + t.actualStart + 'T08:00:00</ActualStart>');
      if (t.actualFinish) out.push('<ActualFinish>' + t.actualFinish + 'T17:00:00</ActualFinish>');
      if (t.constraintDate && !t._summary) out.push('<ConstraintType>4</ConstraintType><ConstraintDate>' + t.constraintDate + 'T08:00:00</ConstraintDate>');
      else out.push('<ConstraintType>0</ConstraintType>');
      if (t.notes) out.push('<Notes>' + xmlEsc(t.notes) + '</Notes>');
      (t.preds || []).forEach((p) => {
        out.push('<PredecessorLink><PredecessorUID>' + p.id + '</PredecessorUID><Type>' + typeCode[p.type] + '</Type><CrossProject>0</CrossProject><LinkLag>' + Math.round(p.lag * hpd * 60 * 10) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
      });
      out.push('</Task>');
    });
    out.push('</Tasks><Resources>');
    resources.forEach((r, i) => out.push('<Resource><UID>' + (i + 1) + '</UID><ID>' + (i + 1) + '</ID><Name>' + xmlEsc(r) + '</Name><Type>1</Type></Resource>'));
    out.push('</Resources><Assignments>');
    let aid = 1;
    project.tasks.forEach((t) => {
      if (t._summary || !t.resource) return;
      const names = t.resource.split(',').map((s) => s.trim()).filter(Boolean);
      names.forEach((n) => {
        const work = t._mh ? 'PT' + U.round(t._mh / names.length, 2) + 'H0M0S' : 'PT0H0M0S';
        out.push('<Assignment><UID>' + (aid++) + '</UID><TaskUID>' + t.id + '</TaskUID><ResourceUID>' + (resources.indexOf(n) + 1) + '</ResourceUID><Work>' + work + '</Work></Assignment>');
      });
    });
    out.push('</Assignments></Project>');
    U.download(U.safeName(project.name) + '_msproject.xml', out.join('\n'), 'application/xml');
  }

  function normsExcel(norms) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(norms.map((n) => ({ Sector: n.sector || '', Category: n.cat, Activity: n.name, Unit: n.unit, 'Man-hours per unit': n.mh, Note: n.note || '' }))), 'Norms');
    XLSX.writeFile(wb, 'planline_manhour_norms.xlsx');
  }

  return { excel, csv, backup, bundle, template, mspdi, normsExcel };
})();
