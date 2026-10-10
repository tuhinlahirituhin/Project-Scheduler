#!/usr/bin/env python3
"""Generates Planline's guide pages, sitemap.xml, robots.txt and the SEO tags in index.html.

The site stays static: the generated HTML is committed and served as is. Re-run this script only
after changing SITE_URL (for example when moving to a custom domain) or editing page text here:

    python3 tools/build_pages.py
"""
import html
import json
import os
import re
import subprocess

# The one place the public address lives. Change it here when a custom domain is set up.
SITE_URL = 'https://planline.app/'
SITE_NAME = 'Planline'
UPDATED = '2026-10-07'
# Paste the content="..." value from Google Search Console's "HTML tag" verification here.
GOOGLE_VERIFICATION = 'T3kQUE5jiSGpkacM10gJxqJWgETn7mXJjAqL6e1_-mw'
BING_VERIFICATION = ''
ISSUES_URL = 'https://github.com/tuhinlahirituhin/Project-Scheduler/issues'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = html.escape

LOGO = ('<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0b7470"/>'
        '<rect x="6" y="8" width="12" height="4" rx="2" fill="#fff"/><rect x="12" y="14" width="14" height="4" rx="2" fill="#fff"/>'
        '<rect x="9" y="20" width="9" height="4" rx="2" fill="#fff" opacity=".7"/></svg>')
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' "
           "fill='%230b7470'/%3E%3Crect x='6' y='8' width='12' height='4' rx='2' fill='white'/%3E%3Crect x='12' y='14' width='14' "
           "height='4' rx='2' fill='white'/%3E%3Crect x='9' y='20' width='9' height='4' rx='2' fill='white' opacity='.7'/%3E%3C/svg%3E")


def url(path):
    return SITE_URL + path


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>'


def verification_tags():
    out = ''
    if GOOGLE_VERIFICATION:
        out += f'<meta name="google-site-verification" content="{esc(GOOGLE_VERIFICATION)}">\n'
    if BING_VERIFICATION:
        out += f'<meta name="msvalidate.01" content="{esc(BING_VERIFICATION)}">\n'
    return out


def social_tags(title, desc, page_url):
    return (f'<link rel="canonical" href="{page_url}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:site_name" content="{SITE_NAME}">\n'
            f'<meta property="og:title" content="{esc(title)}">\n'
            f'<meta property="og:description" content="{esc(desc)}">\n'
            f'<meta property="og:url" content="{page_url}">\n'
            f'<meta property="og:image" content="{url("img/og-image.png")}">\n'
            f'<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:title" content="{esc(title)}">\n'
            f'<meta name="twitter:description" content="{esc(desc)}">\n'
            f'<meta name="twitter:image" content="{url("img/og-image.png")}">\n')


# ---------------------------------------------------------------------------- page shell
def page(p, depth):
    up = '../' * depth
    app = up + 'index.html'
    crumbs = ''
    trail = [{'@type': 'ListItem', 'position': 1, 'name': 'Planline', 'item': SITE_URL}]
    if p['path']:
        if p.get('parent'):
            crumbs = f'<p class="crumbs"><a href="{up}index.html">Planline</a> › <a href="{up}guides/">Guides</a> › {esc(p["crumb"])}</p>'
            trail.append({'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': url('guides/')})
        else:
            crumbs = f'<p class="crumbs"><a href="{up}index.html">Planline</a> › {esc(p["crumb"])}</p>'
        trail.append({'@type': 'ListItem', 'position': len(trail) + 1, 'name': p['crumb'], 'item': url(p['path'])})
    schema = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': trail}]
    if p.get('article'):
        schema.append({'@context': 'https://schema.org', '@type': 'Article', 'headline': p['h1'], 'description': p['desc'],
                       'dateModified': UPDATED, 'mainEntityOfPage': url(p['path']),
                       'publisher': {'@type': 'Organization', 'name': SITE_NAME, 'url': SITE_URL}})
    if p.get('faq'):
        schema.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub('<[^>]+>', '', a)}} for q, a in p['faq']]})
    faq = ''
    if p.get('faq'):
        faq = '<h2 id="faq">Frequently asked questions</h2>\n<div class="faq">\n' + '\n'.join(
            f'<details><summary>{esc(q)}</summary><p>{a}</p></details>' for q, a in p['faq']) + '\n</div>\n'
    cta = '' if p.get('no_cta') else f'''<div class="cta-box">
<h2>Try it on your own schedule</h2>
<p>Planline is free, needs no sign-up and keeps your data in your browser. Start from the sample project or import your own file.</p>
<p><a class="btn" href="{app}">Open the free scheduler</a></p>
</div>'''
    body = p['body'].replace('{APP}', app).replace('{UP}', up)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(p["title"])}</title>
<meta name="description" content="{esc(p["desc"])}">
<meta name="theme-color" content="#0b7470">
{social_tags(p["title"], p["desc"], url(p["path"]))}{verification_tags()}<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans+Condensed:wght@600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="{up}css/site.css">
<script>try{{var t=JSON.parse(localStorage.getItem('ps.theme'));if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}}catch(e){{}}</script>
{chr(10).join(ld(s) for s in schema)}
</head>
<body>
<header class="site-head"><div class="wrap">
<a class="logo" href="{app}">{LOGO}Planline</a>
<nav class="site-nav" aria-label="Site">
<a class="hide-sm" href="{up}free-epcm-scheduling-software/">EPCM scheduling</a>
<a class="hide-sm" href="{up}man-hour-norms/">Man-hour norms</a>
<a href="{up}guides/">Guides</a>
<a class="btn" href="{app}">Open scheduler</a>
</nav>
</div></header>
<section class="hero"><div class="wrap">
{crumbs}
<h1>{esc(p["h1"])}</h1>
<p class="lede">{p["lede"]}</p>
{'' if p.get('no_hero_cta') else f'<div class="cta-row"><a class="btn" href="{app}">Open the free scheduler</a><span class="cta-note">No sign-up, nothing to install. Your data stays on your device.</span></div>'}
</div></section>
<main class="wrap"><div class="article">
{body}
<div class="ad-slot" hidden></div>
{faq}{cta}
</div></main>
<footer class="site-foot"><div class="wrap">
<a href="{app}">Scheduler</a>
<a href="{up}guides/">Guides</a>
<a href="{up}man-hour-norms/">Man-hour norms</a>
<a href="{up}about/">About</a>
<a href="{up}privacy.html">Privacy</a>
<span class="copy">Planline is a free, browser-based project scheduler. Norms and guidance are indicative; check them against your own project records.</span>
</div></footer>
<script src="{up}js/config.js"></script>
<script src="{up}js/site.js"></script>
</body>
</html>
'''


# ---------------------------------------------------------------------------- norms table
def load_norms():
    js = ("global.window={};require(process.argv[1]);"
          "process.stdout.write(JSON.stringify(window.PS.DEFAULT_NORMS))")
    out = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'js', 'norms.js')], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def slug(s):
    return re.sub('[^a-z0-9]+', '-', s.lower()).strip('-')


def norms_body(norms):
    sectors = {}
    for n in norms:
        sectors.setdefault(n['sector'], {}).setdefault(n['cat'], []).append(n)
    toc, parts = [], []
    for sec, cats in sectors.items():
        parts.append(f'<h2 id="{slug(sec)}">{esc(sec)}</h2>')
        for cat, rows in cats.items():
            cid = slug(sec + ' ' + cat)
            toc.append(f'<li><a href="#{cid}">{esc(cat)}</a> <span class="cta-note">({esc(sec)}, {len(rows)})</span></li>')
            trs = ''.join(f'<tr><td>{esc(r["name"])}</td><td class="unit">{esc(r["unit"])}</td><td class="num">{r["mh"]:g}</td></tr>' for r in rows)
            parts.append(f'<h3 id="{cid}">{esc(cat)}</h3>\n<div class="table-wrap"><table><thead><tr><th>Activity</th><th>Unit</th>'
                         f'<th class="num">MH / unit</th></tr></thead><tbody>{trs}</tbody></table></div>')
        parts.append('<div class="ad-slot" hidden></div>')
    return len(norms), sum(len(c) for c in sectors.values()), '\n'.join(toc), '\n'.join(parts)


# ---------------------------------------------------------------------------- pages
def pages(norms):
    n_norms, n_cats, toc, tables = norms_body(norms)
    og = sum(1 for n in norms if n['sector'].startswith('Oil'))
    P = []

    P.append(dict(
        path='free-epcm-scheduling-software/', crumb='EPCM scheduling software', article=True,
        title='Free EPCM Scheduling Software Online (No Sign-up) | Planline',
        desc='A free online scheduler for EPC and EPCM projects: WBS, critical path, Gantt chart, man-hour norms, quantity-based progress, weightage, S-curves, and P6 / MS Project import.',
        h1='Free EPCM scheduling software that runs in your browser',
        lede='Plan engineering, procurement and construction work with a WBS, critical path, man-hour norms and weighted progress. Planline is free, needs no account and never uploads your schedule.',
        body=f'''
<p>Most EPCM scheduling tools are either expensive licences (Primavera P6, MS Project) or generic task boards that do not understand quantities, man-hours or weighted progress. Planline sits in between. It is a free planning tool built around how project controls teams actually measure EPC work: by quantities installed, man-hours earned and weighted percent complete.</p>
<figure class="shot"><img src="{{UP}}img/screenshot-gantt.png" width="1360" height="760" loading="lazy" alt="Planline schedule view: WBS table with durations, dates and links next to a Gantt chart with dependency arrows, critical path and progress"></figure>

<h2>What you can do with it</h2>
<div class="cards">
<div class="card"><h3>Build the WBS</h3><p>Engineering, procurement, construction and commissioning phases with unlimited sub-levels, roll-ups and WBS codes.</p></div>
<div class="card"><h3>Schedule with logic</h3><p>FS, SS, FF and SF links with lead or lag, working calendars and holidays, critical path and total float.</p></div>
<div class="card"><h3>Estimate man-hours</h3><p>Quantity × norm × productivity factor, using {n_norms} built-in indicative norms ({og} for oil &amp; gas EPCM) or your own.</p></div>
<div class="card"><h3>Measure progress</h3><p>Record quantities day by day, week by week or month by month. Weightage comes from man-hours, so overall progress is a true weighted figure.</p></div>
<div class="card"><h3>Report</h3><p>Dashboard with KPI tiles and S-curves, plus a formatted Excel report with Gantt chart, critical path and man-hour histogram.</p></div>
<div class="card"><h3>Import and export</h3><p>Primavera P6 .xer, MS Project XML, Excel and CSV in; Excel, CSV and MS Project XML out.</p></div>
</div>

<h2>A typical EPCM workflow in Planline</h2>
<ol class="steps">
<li><b>Import or build the schedule.</b> Bring in a P6 .xer, an MS Project XML file or any Excel activity list, or start from the sample EPC project.</li>
<li><b>Load quantities.</b> Give each construction activity a unit of measure and scope quantity, such as inch-dia of welding, tonnes of steel or metres of cable.</li>
<li><b>Apply norms.</b> Pick a norm from the library (for example field butt welds or cable pulling) and a productivity factor for your site. Man-hours and, if you like, durations follow automatically.</li>
<li><b>Baseline and lock.</b> Save a baseline and lock the schedule so the approved plan cannot be changed by accident.</li>
<li><b>Record progress.</b> Enter quantities done in the Progress entry sheet. Planline works out earned man-hours, weighted progress and the actual S-curve against plan.</li>
<li><b>Report.</b> Export the Excel report for the weekly progress meeting or the monthly client report.</li>
</ol>

<h2>How it compares with Primavera P6 and MS Project</h2>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Planline</th><th>Primavera P6</th><th>MS Project</th></tr></thead>
<tbody>
<tr><td>Cost</td><td>Free</td><td>Paid licence</td><td>Paid licence or subscription</td></tr>
<tr><td>Install / account</td><td>None, runs in a browser</td><td>Install or cloud account</td><td>Install or Microsoft 365</td></tr>
<tr><td>Critical path, all link types, lag</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Quantity-based progress and weightage</td><td>Built in</td><td>Via steps, resources and UDFs</td><td>Manual set-up</td></tr>
<tr><td>Man-hour norms library</td><td>{n_norms} indicative norms, editable</td><td>No</td><td>No</td></tr>
<tr><td>Resource levelling, multi-user database</td><td>No</td><td>Yes</td><td>Partly</td></tr>
</tbody></table></div>
<p>Planline is not trying to replace P6 on a mega-project with a central database. It is the quick tool for a planner, package engineer or site team who needs a sound schedule and progress measurement today, or wants to look at a P6 file without a licence.</p>

<h2>Who uses it</h2>
<ul>
<li>Planning and project controls engineers on EPC, EPCM and construction projects</li>
<li>Package and area engineers who need their own look-ahead and progress sheet</li>
<li>Subcontractors preparing a schedule and man-hour estimate for a bid</li>
<li>Students learning CPM scheduling and progress measurement</li>
</ul>

<h2>Learn more</h2>
<ul>
<li><a href="{{UP}}progress-measurement/">Weighted progress measurement and S-curves for EPC projects</a></li>
<li><a href="{{UP}}man-hour-norms/">Man-hour norms for piping, structural, E&amp;I and civil work</a></li>
<li><a href="{{UP}}critical-path-method/">Critical path method explained</a></li>
<li><a href="{{UP}}xer-file-viewer/">Open a Primavera P6 .xer file without P6</a></li>
</ul>
''',
        faq=[
            ('Is Planline really free?', 'Yes. There is no trial, licence or account. The site may show ads to cover its costs.'),
            ('Where is my project data stored?', 'Only in your own browser on your own device. Nothing is uploaded. Export a backup file to keep a copy or move it to another computer.'),
            ('Can I open Primavera P6 schedules?', 'Yes. Export an .xer file from P6 and import it. Planline reads the WBS, activities, durations, relationships with lag, actual dates, percent complete and budgeted units.'),
            ('Does it work for oil and gas projects?', f'Yes. It was built with oil and gas EPCM in mind, and the norms library has {og} oil and gas items covering piping, welding and NDT, equipment, tanks, E&amp;I, insulation, painting, fireproofing, scaffolding, civil, steel, pipelines and commissioning.'),
            ('Can several people work on the same schedule?', 'Not at the same time. Each person works in their own browser. Share a schedule by exporting a backup, Excel or MS Project XML file.'),
        ]))

    P.append(dict(
        path='gantt-chart-maker/', crumb='Gantt chart maker', article=True,
        title='Free Online Gantt Chart Maker with Critical Path (No Sign-up) | Planline',
        desc='Make a Gantt chart online for free: tasks, sub-tasks, dependencies, critical path, baseline and progress bars, then export to Excel or MS Project. No account needed.',
        h1='Free online Gantt chart maker',
        lede='Type your tasks or paste them from Excel, link them, and get a Gantt chart with the critical path, progress and baseline. No sign-up, no watermark, and your data stays on your device.',
        body='''
<h2>Make a Gantt chart in four steps</h2>
<ol class="steps">
<li><b>Open the scheduler</b> and pick <i>New project</i>, or keep the sample project to see how it works.</li>
<li><b>Add tasks.</b> Type names and durations, or paste rows straight from a spreadsheet. Use indent and outdent to group tasks under summary rows.</li>
<li><b>Link tasks.</b> Type predecessors like <code>3</code>, <code>5SS+2d</code> or <code>7FF</code>. Dates move automatically and the critical path turns red.</li>
<li><b>Export.</b> Download an Excel workbook with a cell-based Gantt chart, or a PNG of any dashboard chart, or an MS Project XML file.</li>
</ol>

<figure class="shot"><img src="{UP}img/screenshot-gantt.png" width="1360" height="760" loading="lazy" alt="Planline schedule view: WBS table with durations, dates and links next to a Gantt chart with dependency arrows, critical path and progress"></figure>
<h2>What the Gantt chart shows</h2>
<ul>
<li>Task, summary and milestone bars with dependency arrows</li>
<li>Critical path highlighted, with total float for every task</li>
<li>Percent-complete fill and actual dates once work starts</li>
<li>Baseline bars underneath, so slippage is visible at a glance</li>
<li>Status date line and non-working days</li>
<li>Day, week and month zoom</li>
</ul>

<h2>Why not just draw it in Excel?</h2>
<p>A hand-drawn Excel Gantt chart has no logic: when one task slips, you recolour every cell after it. In Planline the bars are driven by links and durations, so a change ripples through the whole schedule instantly, and you can still export the result to Excel for people who live in spreadsheets.</p>

<h2>Bring in an existing plan</h2>
<p>Already have a task list? Import it from Excel or CSV in almost any layout. Planline matches the columns by name and works out the hierarchy from WBS codes, outline numbers, indentation or heading rows. MS Project XML and Primavera P6 .xer files work too.</p>
''',
        faq=[
            ('Do I need an account to make a Gantt chart?', 'No. Open the page and start. Your work is saved automatically in your browser.'),
            ('Can I export the Gantt chart to Excel?', 'Yes. The Excel report includes a formatted Gantt chart drawn in cells, plus the schedule, critical path and a dashboard.'),
            ('Does it support dependencies and lag?', 'Yes: finish-to-start, start-to-start, finish-to-finish and start-to-finish, each with a positive lag or a negative lead in days.'),
            ('Will it work on a phone?', 'It works in any modern browser, but a laptop or tablet is far more comfortable for editing a schedule.'),
        ]))

    P.append(dict(
        path='xer-file-viewer/', crumb='XER file viewer', article=True,
        title='Open a Primavera P6 XER File Online Free (XER Viewer) | Planline',
        desc='Open and view a Primavera P6 .xer file without a P6 licence. See the WBS, activities, relationships, critical path and Gantt chart, then export to Excel or MS Project XML.',
        h1='Open a Primavera P6 .xer file without P6',
        lede='Someone sent you an .xer file and you have no Primavera licence? Import it into Planline to see the WBS, activities, logic and Gantt chart in your browser, free.',
        body='''
<h2>How to open an XER file</h2>
<ol class="steps">
<li>Open the scheduler and click <b>Import</b>.</li>
<li>Choose the <code>.xer</code> file. It is read inside your browser and never uploaded.</li>
<li>Planline builds the schedule and recalculates the critical path. Look at it in the Gantt chart, the dashboard or the Excel report.</li>
</ol>

<h2>What is imported from the XER</h2>
<div class="table-wrap"><table>
<thead><tr><th>P6 data</th><th>In Planline</th></tr></thead>
<tbody>
<tr><td>WBS (PROJWBS)</td><td>Summary rows with the same hierarchy and order</td></tr>
<tr><td>Activities (TASK)</td><td>Tasks and milestones with name, activity ID, original duration and start</td></tr>
<tr><td>Relationships (TASKPRED)</td><td>FS, SS, FF and SF links with lag converted to days</td></tr>
<tr><td>Progress</td><td>Actual start and finish dates, physical % complete, completed status</td></tr>
<tr><td>Resources (RSRC, TASKRSRC)</td><td>Resource names and budgeted units as man-hours</td></tr>
<tr><td>Constraints</td><td>Start-on or after constraints as "start no earlier than" dates</td></tr>
<tr><td>Default calendar</td><td>Hours per day, used to convert hour-based durations and lags</td></tr>
</tbody></table></div>
<p>If the file holds several projects, Planline opens the one with the most activities.</p>

<h2>What an XER file is</h2>
<p>XER is Primavera P6's own export format: a plain-text file of tab-separated tables (projects, WBS, activities, relationships, resources, calendars and more). Contractors and clients often exchange schedules as XER, which is a problem for anyone without a P6 licence.</p>

<h2>Things to know</h2>
<ul>
<li>Planline recalculates dates from the logic using its own CPM engine, so some dates can differ from P6 where P6-specific settings (activity calendars, retained logic vs progress override, resource levelling) drive the schedule.</li>
<li>Activity codes, UDFs, steps and cost accounts are not imported.</li>
<li>You can export the result as an Excel report or as MS Project XML to share with people who use MS Project or ProjectLibre.</li>
</ul>
''',
        faq=[
            ('Can I open an XER file without Primavera P6?', 'Yes. Import it into Planline in your browser. There is nothing to install and the file is not uploaded anywhere.'),
            ('Can I convert XER to Excel?', 'Yes. Import the XER, then choose Export › Excel report or Export › Schedule as CSV.'),
            ('Can I convert XER to MS Project?', 'Yes. Import the XER and choose Export › MS Project XML, which MS Project and ProjectLibre can open.'),
            ('Can Planline save back to XER?', 'Not yet. Export options are Excel, CSV, MS Project XML and a Planline backup file.'),
        ]))

    P.append(dict(
        path='ms-project-viewer/', crumb='MS Project file viewer', article=True,
        title='View MS Project Files Online Free (MS Project XML Viewer) | Planline',
        desc='Open MS Project schedules without MS Project: import an MS Project XML file to see tasks, links, critical path and Gantt chart in your browser, and export to Excel.',
        h1='View MS Project schedules without MS Project',
        lede='Import an MS Project XML file to see and edit the schedule, Gantt chart and critical path in your browser. Free, no install, and the file never leaves your computer.',
        body='''
<h2>Step 1: get the file as XML</h2>
<p>Planline reads the MS Project XML format, which MS Project, ProjectLibre and many other tools can write. The binary <code>.mpp</code> format cannot be read in a browser, so ask the sender for XML, or save it yourself:</p>
<ul>
<li><b>MS Project:</b> File › Save As › choose <i>XML Format (*.xml)</i>.</li>
<li><b>ProjectLibre</b> (free): open the .mpp, then File › Save As › <i>MS Project XML</i>.</li>
</ul>
<div class="note">Tip: if you have neither, the free desktop app ProjectLibre can open most .mpp files and save them as XML for Planline.</div>

<h2>Step 2: import it</h2>
<ol class="steps">
<li>Open the scheduler and click <b>Import</b>.</li>
<li>Choose the <code>.xml</code> file.</li>
<li>Planline brings in the task outline, durations, links with lag, percent complete, actual dates, the status date, working days and holidays from the project calendar.</li>
</ol>

<h2>Step 3: use it</h2>
<ul>
<li>See the Gantt chart with critical path and float</li>
<li>Update progress and the status date</li>
<li>Build a dashboard with an S-curve</li>
<li>Export an Excel report, or save back to MS Project XML</li>
</ul>
''',
        faq=[
            ('Can Planline open .mpp files?', 'Not directly. The .mpp format is a closed binary format. Save the file as MS Project XML (from MS Project or the free ProjectLibre) and import that.'),
            ('Can I edit the schedule and send it back?', 'Yes. Make your changes, then use Export › MS Project XML. MS Project can open the result.'),
            ('Is the file uploaded to a server?', 'No. The file is read by your browser and saved only on your device.'),
        ]))

    P.append(dict(
        path='man-hour-norms/', crumb='Man-hour norms', article=True,
        title=f'Man-Hour Norms for Piping, Structural, E&I and Civil Work ({n_norms} Rates) | Planline',
        desc=f'{n_norms} indicative man-hour norms (MH per unit) for oil and gas EPCM, engineering, power, buildings and general construction: welding, piping, steel, equipment, cable, instruments, insulation, painting and more.',
        h1='Man-hour norms for construction and EPCM estimating',
        lede=f'{n_norms} indicative man-hour norms across {n_cats} trades, from butt welds and pipe erection to cable pulling, instrument loop checks and engineering deliverables. Use them in the free scheduler to turn quantities into man-hours and durations.',
        body=f'''
<div class="note"><b>Indicative values only.</b> These are typical planning figures for direct craft labour (engineering and procurement items are office man-hours), compiled from commonly published estimating ranges and rounded. Real productivity depends on country, site conditions, crew, method, access and specification. Calibrate them against your own records and apply a productivity factor.</div>

<h2>How to use a man-hour norm</h2>
<p>A norm is the number of man-hours needed to install one unit of work under reference conditions. The estimate for an activity is:</p>
<p><code>Man-hours = Quantity × Norm (MH/unit) × Productivity factor</code></p>
<p>For example, 1,200 inch-dia of field butt welds in carbon steel, standard wall, at 1.2 MH per inch-dia with a site factor of 1.25 gives 1,200 × 1.2 × 1.25 = <b>1,800 man-hours</b>. With a crew of 6 working 10 hours a day, that is 30 working days.</p>
<p>In Planline you pick the norm for an activity, enter the quantity and factor, and the man-hours (and optionally the duration from crew size and hours per day) are calculated for you. You can edit any value or give an activity its own custom norm.</p>

<h2>Contents</h2>
<ul class="toc">
{toc}
</ul>

{tables}
''',
        faq=[
            ('What is a man-hour norm?', 'The man-hours needed to complete one unit of work, such as one inch-diameter of butt weld or one tonne of structural steel, under reference conditions.'),
            ('What is an inch-dia?', 'Inch-diameter is the standard unit for piping weld work: the nominal pipe size in inches multiplied by the number of joints. Ten 6-inch welds are 60 inch-dia.'),
            ('Are these norms accurate for my project?', 'They are indicative planning values. Site productivity can vary by a factor of two or more between regions and projects. Use them for early estimates and calibrate with your own historical data.'),
            ('Can I use my own norms?', 'Yes. The norms library in the scheduler is fully editable, and any activity can carry its own custom norm.'),
        ]))

    P.append(dict(
        path='progress-measurement/', crumb='Progress measurement and S-curves', article=True,
        title='Weighted Progress Measurement and S-Curves for EPC Projects | Planline',
        desc='How to measure physical progress on EPC and EPCM projects: weightage from man-hours, earned man-hours, quantity-based percent complete, weighted overall progress and planned vs actual S-curves, with a worked example.',
        h1='Weighted progress measurement and S-curves for EPC projects',
        lede='How project controls teams turn quantities installed into an overall percent complete, and how to read the planned versus actual S-curve. With a worked example you can reproduce in the free scheduler.',
        body='''
<h2>Why weighted progress?</h2>
<p>A simple average of activity percentages treats a one-day inspection the same as a three-month piping campaign. Weighted progress gives each activity a weight in proportion to its size, normally its budgeted man-hours, so the overall figure reflects how much of the work is really done.</p>

<h2>The three formulas</h2>
<ol>
<li><b>Activity percent complete</b> = quantity done ÷ scope quantity. For example, 450 of 1,200 inch-dia welded is 37.5%.</li>
<li><b>Activity weight</b> = activity budget man-hours ÷ total budget man-hours.</li>
<li><b>Overall progress</b> = Σ (weight × activity percent complete), which is the same as earned man-hours ÷ total budget man-hours.</li>
</ol>

<h2>Worked example</h2>
<div class="table-wrap"><table>
<thead><tr><th>Activity</th><th class="num">Budget MH</th><th class="num">Weight</th><th class="num">Scope</th><th class="num">Done</th><th class="num">% complete</th><th class="num">Earned MH</th></tr></thead>
<tbody>
<tr><td>Steel erection</td><td class="num">2,000</td><td class="num">20%</td><td class="num">100 t</td><td class="num">100 t</td><td class="num">100%</td><td class="num">2,000</td></tr>
<tr><td>Piping welding</td><td class="num">5,000</td><td class="num">50%</td><td class="num">4,000 in-dia</td><td class="num">1,600 in-dia</td><td class="num">40%</td><td class="num">2,000</td></tr>
<tr><td>Cable pulling</td><td class="num">2,500</td><td class="num">25%</td><td class="num">10,000 m</td><td class="num">1,000 m</td><td class="num">10%</td><td class="num">250</td></tr>
<tr><td>Loop checks</td><td class="num">500</td><td class="num">5%</td><td class="num">200 loops</td><td class="num">0</td><td class="num">0%</td><td class="num">0</td></tr>
<tr><th>Total</th><th class="num">10,000</th><th class="num">100%</th><th></th><th></th><th></th><th class="num">4,250</th></tr>
</tbody></table></div>
<p>Overall progress is 4,250 ÷ 10,000 = <b>42.5%</b>. A simple average of the four percentages would have said 37.5%, understating the work done because the finished steel is a big share of the job.</p>

<h2>Planned progress and the S-curve</h2>
<p>Planned progress uses the same weights, but with each activity's planned percent complete at a date, found by spreading its man-hours over its planned duration. Adding these up week by week gives the planned cumulative curve, which is usually S-shaped: slow during mobilisation, steep during peak construction, flattening during commissioning.</p>
<p>Plot actual cumulative progress on the same chart. If the actual line sits below the plan, the project is behind; the vertical gap is the progress variance and the horizontal gap is roughly the time behind schedule. Planline draws planned, baseline and actual curves automatically on the dashboard and in the Excel report.</p>

<h2>Recording progress by period</h2>
<p>The Progress entry sheet in Planline lets you enter quantities done per day, week or month. It keeps the cumulative quantity for each activity and shows period progress, cumulative actual and cumulative planned for the whole project, which is what most monthly progress reports need.</p>

<h2>Common pitfalls</h2>
<ul>
<li><b>Changing weights mid-project</b> without re-baselining makes the curve jump. Freeze the weights with the baseline.</li>
<li><b>Using duration as weight</b> overweights long, light activities such as procurement lead times.</li>
<li><b>Mixing units</b>: keep a consistent unit per activity (inch-dia, tonnes, metres) and agree it with the client's progress measurement procedure.</li>
<li><b>Rules of credit</b>: many contracts give partial credit by step (for example 30% on fit-up, 70% on welding). Split those activities or record the credited quantity.</li>
</ul>
''',
        faq=[
            ('How is activity weightage calculated?', 'Usually as the activity budget man-hours divided by the total budget man-hours of the project or package. Cost can be used instead, but man-hours is the norm for construction progress.'),
            ('What is the difference between physical progress and earned value?', 'Physical progress is earned man-hours divided by total budget man-hours. Earned value applies the same idea to cost and compares it with planned value and actual cost.'),
            ('Why is my S-curve not S-shaped?', 'Short projects, front-loaded weights, or activities with very uneven man-hours can flatten or skew the curve. That is fine; the comparison with actual progress is what matters.'),
        ]))

    P.append(dict(
        path='critical-path-method/', crumb='Critical path method', article=True,
        title='Critical Path Method (CPM) Explained with a Free Online Calculator | Planline',
        desc='Learn the critical path method: forward and backward pass, early and late dates, total float, and FS, SS, FF, SF links with lag. Then calculate the critical path of your own schedule free online.',
        h1='Critical path method explained',
        lede='The critical path is the longest chain of linked activities through a project; any delay on it delays the finish date. Here is how it is calculated, with a small example, and a free calculator for your own schedule.',
        body='''
<h2>The four steps of CPM</h2>
<ol class="steps">
<li><b>List the activities</b> and their durations.</li>
<li><b>Link them</b> with their logic: which activity must finish (or start) before another can start (or finish).</li>
<li><b>Forward pass:</b> from the project start, work out each activity's earliest start (ES) and earliest finish (EF = ES + duration).</li>
<li><b>Backward pass:</b> from the project finish, work out the latest finish (LF) and latest start (LS = LF − duration). Total float = LS − ES. Activities with zero float are critical.</li>
</ol>

<h2>Worked example</h2>
<div class="table-wrap"><table>
<thead><tr><th>Activity</th><th class="num">Duration (days)</th><th>Predecessor</th><th class="num">ES</th><th class="num">EF</th><th class="num">LS</th><th class="num">LF</th><th class="num">Float</th></tr></thead>
<tbody>
<tr><td>A Foundations</td><td class="num">10</td><td>none</td><td class="num">0</td><td class="num">10</td><td class="num">0</td><td class="num">10</td><td class="num"><b>0</b></td></tr>
<tr><td>B Steel erection</td><td class="num">15</td><td>A</td><td class="num">10</td><td class="num">25</td><td class="num">10</td><td class="num">25</td><td class="num"><b>0</b></td></tr>
<tr><td>C Equipment delivery</td><td class="num">20</td><td>none</td><td class="num">0</td><td class="num">20</td><td class="num">5</td><td class="num">25</td><td class="num">5</td></tr>
<tr><td>D Equipment setting</td><td class="num">5</td><td>B, C</td><td class="num">25</td><td class="num">30</td><td class="num">25</td><td class="num">30</td><td class="num"><b>0</b></td></tr>
<tr><td>E Piping</td><td class="num">20</td><td>D</td><td class="num">30</td><td class="num">50</td><td class="num">30</td><td class="num">50</td><td class="num"><b>0</b></td></tr>
</tbody></table></div>
<p>The critical path is <b>A → B → D → E</b>, 50 days. Equipment delivery has 5 days of float: it can slip by up to 5 days without moving the finish date.</p>

<h2>Link types and lag</h2>
<div class="table-wrap"><table>
<thead><tr><th>Link</th><th>Meaning</th><th>Example</th></tr></thead>
<tbody>
<tr><td>FS (finish-to-start)</td><td>B starts after A finishes</td><td>Pour concrete after rebar is fixed</td></tr>
<tr><td>SS (start-to-start)</td><td>B starts after A starts</td><td>Insulation starts 5 days after hydrotest starts (SS+5)</td></tr>
<tr><td>FF (finish-to-finish)</td><td>B finishes after A finishes</td><td>Painting finishes 3 days after steel erection finishes (FF+3)</td></tr>
<tr><td>SF (start-to-finish)</td><td>B finishes after A starts</td><td>Temporary power runs until permanent power starts</td></tr>
</tbody></table></div>
<p>Lag delays the successor by a number of days; a negative lag (lead) lets it overlap. In Planline you type links as <code>4</code>, <code>4SS+5</code> or <code>4FF-2</code>.</p>

<h2>Calculate your own critical path</h2>
<p>Enter your activities and links in the free scheduler. It runs the forward and backward pass on a working-day calendar with holidays, shows total float for every activity, highlights the critical path in the Gantt chart and lists it in the Excel report.</p>
''',
        faq=[
            ('What is total float?', 'The number of days an activity can be delayed without delaying the project finish date. Activities with zero total float are on the critical path.'),
            ('Can there be more than one critical path?', 'Yes. Two or more chains can have the same longest duration, and all of them are critical.'),
            ('What is the difference between CPM and PERT?', 'CPM uses one duration per activity. PERT uses optimistic, most likely and pessimistic durations to estimate the probability of finishing on time.'),
        ]))

    guides = [p for p in P]
    cards = '\n'.join(f'<a class="card" href="{{UP}}{p["path"]}"><h3>{esc(p["h1"])}</h3><p>{esc(p["desc"])}</p></a>' for p in guides)
    for p in guides:
        p['parent'] = 'guides'
    P.append(dict(
        path='guides/', crumb='Guides', no_cta=False,
        title='Project Scheduling and Project Controls Guides | Planline',
        desc='Free guides for planners and project controls engineers: EPCM scheduling, critical path, weighted progress and S-curves, man-hour norms, and opening P6 and MS Project files.',
        h1='Guides for planners and project controls',
        lede='Practical guides on scheduling, progress measurement and estimating for EPC, EPCM and construction projects, each with a free tool to try it on.',
        body=f'<div class="cards">\n{cards}\n</div>'))

    P.append(dict(
        path='about/', crumb='About', no_cta=False,
        title='About Planline, the Free Browser-Based Project Scheduler',
        desc='Planline is a free, browser-based project scheduler for EPC, EPCM and construction planning. No account, no server: your schedules stay on your device.',
        h1='About Planline',
        lede='Planline is a free project scheduler made for planners and project controls engineers, especially in oil &amp; gas, energy and construction.',
        body=f'''
<p>Planning software is usually expensive, heavy, or built for office task lists rather than engineering and construction. Planline aims to give every planner, site engineer and student a sound scheduling and progress tool that opens in seconds.</p>
<h2>How it works</h2>
<ul>
<li>Everything runs in your web browser. There is no account and no server-side database.</li>
<li>Your projects are saved in your browser's local storage on your own device. Export a backup file to keep a copy or move it to another computer.</li>
<li>The site is free to use and may be supported by advertising.</li>
</ul>
<h2>What it does</h2>
<p>WBS and critical path scheduling, a Gantt chart, man-hour estimating from {n_norms} indicative norms, quantity-based and weighted progress measurement, S-curve dashboards, and import from Primavera P6, MS Project, Excel and CSV. See the <a href="{{UP}}free-epcm-scheduling-software/">feature overview</a>.</p>
<h2>Contact and feedback</h2>
<p>Found a bug or want a feature? Please <a href="{ISSUES_URL}" rel="noopener">open an issue on GitHub</a>.</p>
'''))

    P.append(dict(
        path='privacy.html', crumb='Privacy', no_cta=True, no_hero_cta=True,
        title='Privacy Policy | Planline',
        desc='Planline privacy policy: your project data stays in your browser. Information about advertising cookies and hosting logs.',
        h1='Privacy policy',
        lede=f'Last updated {UPDATED}.',
        body=f'''
<p><b>Your project data stays on your device.</b> Planline runs entirely in your web browser. Projects, tasks and norms are saved in your browser's local storage and are never uploaded to any server we run. We have no account system and cannot see your schedules. Files you import are read by your browser and are not uploaded.</p>
<h2>Advertising</h2>
<p>This site may show ads served by Google AdSense. Google and its partners use cookies to serve ads based on your visits to this and other websites. You can opt out of personalised advertising at <a href="https://adssettings.google.com">adssettings.google.com</a>. See <a href="https://policies.google.com/technologies/ads">how Google uses information from sites that use its services</a>.</p>
<h2>Fonts</h2>
<p>Pages load fonts from Google Fonts, which means your browser requests them from Google's servers.</p>
<h2>Hosting</h2>
<p>The site is hosted on a static web host, which may keep standard server logs (such as IP address and browser type) for security and operations.</p>
<h2>Contact</h2>
<p>Questions about this policy: <a href="{ISSUES_URL}" rel="noopener">open an issue on GitHub</a>.</p>
'''))
    return P


# ---------------------------------------------------------------------------- index.html head
def patch_index(norms_count):
    title = 'Planline: Free Online Project Scheduler for EPC & EPCM (Gantt, CPM, Man-hours)'
    desc = ('Free online project scheduler for EPC, EPCM and construction: WBS, Gantt chart, critical path, '
            f'{norms_count} man-hour norms, weighted progress and S-curves, P6 .xer and MS Project import, Excel reports. '
            'No sign-up; your data stays in your browser.')
    app_ld = {
        '@context': 'https://schema.org', '@type': 'WebApplication', 'name': SITE_NAME, 'url': SITE_URL,
        'applicationCategory': 'BusinessApplication', 'applicationSubCategory': 'Project scheduling',
        'operatingSystem': 'Any (web browser)', 'browserRequirements': 'Requires JavaScript',
        'description': desc, 'image': url('img/og-image.png'),
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
        'featureList': ['WBS with unlimited levels', 'Critical path method with FS, SS, FF, SF links and lag',
                        'Gantt chart with baseline and progress', f'{norms_count} indicative man-hour norms',
                        'Quantity-based and weighted progress measurement', 'S-curve dashboard',
                        'Import Primavera P6 XER, MS Project XML, Excel and CSV', 'Export Excel report, CSV and MS Project XML'],
    }
    site_ld = {'@context': 'https://schema.org', '@type': 'WebSite', 'name': SITE_NAME, 'url': SITE_URL}
    block = ('<!-- seo:start (generated by tools/build_pages.py) -->\n'
             f'<title>{esc(title)}</title>\n<meta name="description" content="{esc(desc)}">\n'
             + social_tags(title, desc, SITE_URL) + verification_tags()
             + ld(app_ld) + '\n' + ld(site_ld) + '\n<!-- seo:end -->')
    path = os.path.join(ROOT, 'index.html')
    src = open(path, encoding='utf-8').read()
    if '<!-- seo:start' in src:
        src = re.sub(r'<!-- seo:start.*?<!-- seo:end -->', lambda m: block, src, flags=re.S)
    else:
        src = re.sub(r'<title>.*?</title>\n<meta name="description"[^>]*>', lambda m: block, src, count=1, flags=re.S)
    open(path, 'w', encoding='utf-8').write(src)


def main():
    norms = load_norms()
    P = pages(norms)
    for p in P:
        depth = p['path'].count('/')
        out = os.path.join(ROOT, p['path'] + ('index.html' if p['path'].endswith('/') else ''))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8').write(page(p, depth))
    patch_index(len(norms))

    locs = [('', '1.0')] + [(p['path'], '0.8' if p.get('article') else '0.5') for p in P]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f'  <url><loc>{url(path)}</loc><lastmod>{UPDATED}</lastmod><priority>{pr}</priority></url>' for path, pr in locs]
    sm.append('</urlset>')
    open(os.path.join(ROOT, 'sitemap.xml'), 'w').write('\n'.join(sm) + '\n')
    open(os.path.join(ROOT, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\n\nSitemap: {url("sitemap.xml")}\n')
    print(f'Wrote {len(P)} pages, sitemap.xml ({len(locs)} URLs), robots.txt and index.html SEO tags for {SITE_URL}')


if __name__ == '__main__':
    main()
