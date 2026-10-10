"""Text of the planning know-how guides. tools/build_pages.py turns each entry into a page.

Each guide is plain HTML. {UP} becomes the path up to the site root and {APP} the link to the scheduler.
Keep figures consistent with the built-in norms in js/norms.js and with what the scheduler really does.
"""


def know_how_guides():
    G = []

    G.append(dict(
        path='how-to-build-a-project-schedule/', crumb='How to build a project schedule', article=True, group='plan',
        title='How to Build a Project Schedule Step by Step (with a Quality Checklist) | Planline',
        desc='A practical, step-by-step method for building a construction or EPC project schedule: scope and WBS, activities, durations from quantities, logic, calendars, critical path review, baseline, and a 14-point quality checklist.',
        h1='How to build a project schedule, step by step',
        lede='A good schedule is a model of how the work will really be done. This guide walks through the method planners use on construction and EPC projects, from the scope to a baseline you can defend, with the quality checks reviewers apply.',
        body='''
<p>Schedules fail for predictable reasons: activities that are too long to measure, missing logic, dates typed in by hand instead of calculated, and durations that nobody can explain. Each step below is aimed at one of those problems. The same method works for a two-week shutdown or a three-year plant build; only the level of detail changes.</p>

<h2>1. Pin down the scope and the key dates</h2>
<p>Before opening any software, collect what the schedule has to respect: the contract scope, the start date, contractual milestones (mechanical completion, ready for start-up, handover), known access dates, long-lead equipment deliveries, and the working pattern on site (days per week, hours per day, holidays, weather windows). Write these down. They are the frame every later decision is checked against.</p>

<h2>2. Break the work down (WBS)</h2>
<p>The work breakdown structure divides the scope into manageable pieces so nothing is forgotten and nothing is counted twice. On EPC projects the usual top levels are engineering, procurement, construction and commissioning, with construction split by area or unit and then by discipline. The <a href="{UP}wbs-for-epc-projects/">WBS guide</a> has a full example. A WBS level is a container; the work itself lives in the activities underneath it.</p>

<h2>3. List the activities</h2>
<p>An activity is a piece of work with a clear start, a clear finish and one responsible party. Good activities share a few traits:</p>
<ul>
<li><b>Verb plus object:</b> "Erect pipe rack steel, Area 200", not "Steel".</li>
<li><b>Measurable:</b> progress can be judged from a quantity or a clear step, such as tonnes erected or drawings issued.</li>
<li><b>Short enough to control:</b> a common rule is that no activity should be longer than about two reporting periods. With monthly reporting that means activities of six to eight weeks at most; for a weekly look-ahead, much shorter.</li>
<li><b>One trade, one area:</b> mixing disciplines in one activity hides who is late.</li>
</ul>
<p>Add milestones (zero-duration activities) for contract dates, deliveries and hand-overs between parties.</p>

<h2>4. Estimate durations from quantities, not guesses</h2>
<p>For construction work the defensible way to get a duration is from the quantity, a man-hour norm and the crew:</p>
<p><code>Duration (days) = Quantity × Norm (MH/unit) × Productivity factor ÷ (Crew size × Hours per day)</code></p>
<p>For example, 40 tonnes of structural steel at 22 MH per tonne with a site factor of 1.2 is 1,056 man-hours. A crew of 8 working 10-hour days delivers 80 man-hours a day, so the activity needs about 13 working days. The <a href="{UP}man-hour-norms/">man-hour norms page</a> lists indicative norms for most trades, and the <a href="{UP}piping-man-hours/">piping estimate guide</a> works through a full example. For engineering and procurement, durations come from deliverable lists, vendor quotations and lead times.</p>

<h2>5. Link the activities with logic</h2>
<p>Logic is what makes a schedule a model instead of a drawing. Every activity needs at least one predecessor and one successor, except the project start and finish. Use finish-to-start links wherever possible; use start-to-start and finish-to-finish with a lag where work genuinely overlaps, such as insulation following hydrotesting by a few days. The <a href="{UP}critical-path-method/">critical path guide</a> explains each link type.</p>
<p>Avoid the two habits that break logic: typing fixed dates instead of links, and using constraints to force an activity where you want it. If an activity "must" start on a date, ask what drives that date and model the driver, for example a delivery milestone.</p>

<h2>6. Set the calendar</h2>
<p>Working days, hours per day and holidays turn durations into dates. Get them right early: a six-day week compresses the whole schedule by roughly 15% compared with a five-day week, and a missed national holiday period can move a milestone by two weeks.</p>

<h2>7. Review the critical path and float</h2>
<p>Once the schedule calculates, read it like a reviewer would:</p>
<ul>
<li>Does the critical path run through the work you expect to drive the finish, such as long-lead equipment, then installation, then commissioning? A critical path through a minor activity usually means missing logic.</li>
<li>Are there activities with very large float? They often have no successor.</li>
<li>Is any float negative? That means a milestone cannot be met with the current logic and durations.</li>
</ul>

<h2>8. Load resources and check the peaks</h2>
<p>Spread the man-hours over each activity's duration and look at the histogram. A peak of 400 pipefitters on a site that can accommodate 150 is not a plan. Smooth peaks by moving non-critical work within its float, or by adding logic that reflects crew flow from area to area.</p>

<h2>9. Review with the people who will do the work</h2>
<p>Walk the construction manager, discipline leads and key subcontractors through the sequence. They will catch access problems, crane conflicts and unrealistic overlaps that no software will.</p>

<h2>10. Baseline and control</h2>
<p>When the schedule is agreed, save a baseline and stop editing the plan casually. From now on you update progress against it, report variances and only re-baseline through change control.</p>

<h2>Schedule quality checklist</h2>
<p>Many owners check schedules against the US Defense Contract Management Agency's 14-point assessment. The thresholds are a useful sanity check for any project:</p>
<div class="table-wrap"><table>
<thead><tr><th>Check</th><th>What it looks for</th><th>Typical threshold</th></tr></thead>
<tbody>
<tr><td>Missing logic</td><td>Activities without a predecessor or successor</td><td>Under 5% of activities</td></tr>
<tr><td>Leads</td><td>Negative lags</td><td>None</td></tr>
<tr><td>Lags</td><td>Links with a positive lag</td><td>Under 5% of links</td></tr>
<tr><td>Relationship types</td><td>Share of finish-to-start links</td><td>At least 90%</td></tr>
<tr><td>Hard constraints</td><td>Must-start, must-finish and similar</td><td>Under 5% of activities</td></tr>
<tr><td>High float</td><td>Total float over 44 working days</td><td>Under 5% of activities</td></tr>
<tr><td>Negative float</td><td>Activities that cannot meet a constraint</td><td>None</td></tr>
<tr><td>High duration</td><td>Activities over 44 working days</td><td>Under 5% of activities</td></tr>
<tr><td>Invalid dates</td><td>Actuals in the future, forecasts in the past</td><td>None</td></tr>
<tr><td>Resources</td><td>Activities with no resources or man-hours</td><td>Every activity with work has them</td></tr>
<tr><td>Missed tasks</td><td>Activities finishing later than baseline</td><td>Under 5%</td></tr>
<tr><td>Critical path test</td><td>Delaying a critical activity delays the finish</td><td>Must pass</td></tr>
<tr><td>Critical path length index</td><td>(Critical path length + float) ÷ critical path length</td><td>0.95 or more</td></tr>
<tr><td>Baseline execution index</td><td>Tasks completed ÷ tasks planned to be complete</td><td>0.95 or more</td></tr>
</tbody></table></div>
<p>Treat these as prompts for questions, not as pass or fail rules. A shutdown schedule full of short start-to-start links can be perfectly sound.</p>

<h2>Doing it in Planline</h2>
<p>In the free scheduler you build the WBS with indent and outdent, type links like <code>12</code> or <code>12SS+3</code>, pick a norm and quantity for each construction activity so man-hours and durations follow, set the working days and holidays in Settings, and save a baseline when the plan is agreed. The Gantt chart shows the critical path and total float as you work.</p>
''',
        faq=[
            ('How detailed should a project schedule be?', 'Detailed enough that each activity can be measured and has one responsible party, and short enough to control: no longer than about two reporting periods. A level 3 schedule for the whole project with level 4 detail for the next few months is a common approach.'),
            ('What is the difference between a schedule and a plan?', 'The plan describes what will be done, how and by whom. The schedule puts that plan on a time line with durations and logic, so dates can be calculated and progress measured.'),
            ('Should I use constraints to fix dates?', 'Sparingly. A constraint overrides logic, so the schedule stops telling you the truth when things change. Model the reason for the date instead, such as a delivery milestone or an access date.'),
        ]))

    G.append(dict(
        path='wbs-for-epc-projects/', crumb='WBS for EPC projects', article=True, group='plan',
        title='Work Breakdown Structure (WBS) for EPC Projects, with an Example | Planline',
        desc='How to build a work breakdown structure for an EPC or EPCM project: the 100% rule, phase-first versus area-first layouts, coding, how deep to go, and a full example for a gas plant expansion.',
        h1='Work breakdown structure for EPC projects',
        lede='The WBS is the backbone of the schedule, the estimate and the progress report. Here is how to structure one for an engineering, procurement and construction project, with a complete example you can copy.',
        body='''
<h2>What a WBS is for</h2>
<p>A work breakdown structure divides the whole scope into smaller, manageable parts arranged in a hierarchy. On an EPC project the same structure is used to schedule the work, roll up man-hours and cost, measure progress and report to the client. If the WBS is wrong, every report built on it is awkward for the rest of the project, so it is worth an afternoon of thought.</p>

<h2>Four rules that keep a WBS sound</h2>
<ol>
<li><b>The 100% rule.</b> The children of any element add up to exactly the whole of that element: no gaps, no extras.</li>
<li><b>Mutually exclusive.</b> Each piece of work sits in one place only, so man-hours are never counted twice.</li>
<li><b>Outcome-oriented.</b> Elements describe deliverables or physical results (Area 200 piping) rather than actions (welding).</li>
<li><b>Fit for reporting.</b> The levels match how the client and management want to see progress, usually by phase, area and discipline.</li>
</ol>

<h2>Phase first or area first?</h2>
<p>Most EPC schedules use a hybrid. Engineering and procurement are organised by discipline and package, because that is how design teams and buyers work. Construction is organised by area or unit, then discipline, because crews move from area to area. Commissioning is organised by system, because systems cross area boundaries: a cooling water system runs through several plots.</p>
<div class="table-wrap"><table>
<thead><tr><th>Layout</th><th>Works well for</th><th>Watch out for</th></tr></thead>
<tbody>
<tr><td>Phase › discipline › area</td><td>Engineering-heavy projects, small sites</td><td>Construction progress by area is hard to read</td></tr>
<tr><td>Area › phase › discipline</td><td>Large sites with separate contractors per area</td><td>Engineering deliverables often serve several areas</td></tr>
<tr><td>Hybrid (shown below)</td><td>Most EPC and EPCM projects</td><td>Needs clear coding so reports can still filter by discipline</td></tr>
</tbody></table></div>

<h2>Example: gas processing plant expansion</h2>
<ul class="wbs-tree">
<li><b>1</b> Gas plant expansion
<ul>
<li><b>1.1</b> Project management and project controls</li>
<li><b>1.2</b> Engineering
<ul><li>1.2.1 Process</li><li>1.2.2 Piping and layout</li><li>1.2.3 Civil and structural</li><li>1.2.4 Mechanical</li><li>1.2.5 Electrical</li><li>1.2.6 Instrumentation and control</li></ul></li>
<li><b>1.3</b> Procurement
<ul><li>1.3.1 Long-lead equipment (compressors, large vessels)</li><li>1.3.2 Other equipment packages</li><li>1.3.3 Bulk materials (pipe, fittings, steel, cable)</li><li>1.3.4 Logistics and customs</li></ul></li>
<li><b>1.4</b> Construction
<ul><li>1.4.1 Site preparation and temporary facilities</li>
<li>1.4.2 Area 100 Inlet facilities
<ul><li>1.4.2.1 Civil and foundations</li><li>1.4.2.2 Structural steel</li><li>1.4.2.3 Equipment erection</li><li>1.4.2.4 Piping</li><li>1.4.2.5 Electrical</li><li>1.4.2.6 Instrumentation</li><li>1.4.2.7 Insulation and painting</li></ul></li>
<li>1.4.3 Area 200 Compression (same disciplines)</li>
<li>1.4.4 Area 300 Main pipe rack (same disciplines)</li></ul></li>
<li><b>1.5</b> Pre-commissioning and commissioning
<ul><li>1.5.1 System 10 Inlet gas</li><li>1.5.2 System 20 Compression</li><li>1.5.3 System 40 Cooling water</li><li>1.5.4 System 70 Power distribution</li></ul></li>
</ul></li>
</ul>
<p>Activities sit under the lowest level. For example, under 1.4.2.4 Piping you would find "Erect large-bore spools", "Field welding", "Install supports", "Hydrotest test packs" and "Reinstatement", each with a quantity and a norm.</p>

<h2>How deep should it go?</h2>
<p>Stop breaking down when an element is small enough to estimate with confidence, assign to one party, and report on. On most EPC projects that means four or five levels above the activities. Going deeper makes the WBS a list of activities in disguise, which is harder to maintain and adds nothing to reports.</p>

<h2>Coding</h2>
<p>Give every element a code that shows its position, such as 1.4.2.4. Keep the codes stable once reporting starts: clients often map their cost and progress systems to them. If you also need to report by discipline across all areas, keep the discipline at the same level in every branch (in the example above it is always the fourth level under construction), or add a separate discipline code to each activity.</p>

<h2>WBS, OBS and CBS</h2>
<ul>
<li><b>WBS</b> answers "what work?"</li>
<li><b>OBS</b> (organisation breakdown structure) answers "who is responsible?"</li>
<li><b>CBS</b> (cost breakdown structure) answers "which budget pays for it?"</li>
</ul>
<p>The point where a WBS element meets one responsible party is called a control account. It is where budget, schedule and progress are managed together, and where <a href="{UP}earned-value-management/">earned value</a> is usually measured.</p>

<h2>Common mistakes</h2>
<ul>
<li>Organising construction by discipline only, so no one can see which area is behind.</li>
<li>Putting commissioning under construction areas, which splits each system into pieces.</li>
<li>Creating levels for one activity each, which bloats reports.</li>
<li>Changing the structure mid-project, which breaks every trend chart built on it.</li>
</ul>

<h2>Building the WBS in Planline</h2>
<p>Type the elements as rows, then use indent and outdent to make the hierarchy; summary rows roll up dates, man-hours and progress automatically, and WBS codes are generated from the outline. You can also paste an existing WBS from Excel: Planline works out the levels from outline numbers, indentation or WBS codes.</p>
''',
        faq=[
            ('How many levels should a WBS have?', 'For most EPC projects four or five levels above the activities: project, phase, area or package, discipline, and sometimes a sub-area. Stop when an element can be estimated, assigned and reported on its own.'),
            ('Is the WBS the same as the activity list?', 'No. The WBS is the hierarchy of deliverables and areas. Activities are the work steps that sit under its lowest level.'),
            ('Should commissioning follow areas or systems?', 'Systems. Commissioning hands over complete systems, which usually cross area boundaries, so a system-based structure matches how the work is accepted.'),
        ]))

    G.append(dict(
        path='look-ahead-schedule/', crumb='Three-week look-ahead schedule', article=True, group='plan',
        title='How to Make a 3-Week Look-Ahead Schedule for Construction | Planline',
        desc='What a three-week look-ahead schedule is, how to build one from the master schedule, how to check constraints before work starts, and how to measure the plan with percent plan complete (PPC).',
        h1='How to make a three-week look-ahead schedule',
        lede='The master schedule says what should happen this quarter. The look-ahead says what the crews will actually do in the next three weeks, and checks that nothing will stop them. Here is how to run one on a construction site.',
        body='''
<h2>What a look-ahead is</h2>
<p>A look-ahead schedule is a short window, usually two to six weeks with three the most common, taken from the master schedule and broken into more detail. It is a working tool for site supervisors: it lists the work planned for each crew, day by day or week by week, and confirms that everything needed for that work will be ready.</p>
<p>It is not a separate plan. Dates come from the master schedule; the look-ahead adds detail and exposes problems early enough to fix them.</p>

<h2>Build it in five steps</h2>
<ol class="steps">
<li><b>Filter the master schedule.</b> Take every activity that is in progress or due to start in the window, plus anything critical or near-critical starting just after it.</li>
<li><b>Break activities down.</b> A master activity such as "Area 200 piping erection, 4 weeks" becomes daily or weekly tasks by line, test pack or crew.</li>
<li><b>Check constraints.</b> For each task, confirm the items in the checklist below. Anything not ready gets an owner and a date.</li>
<li><b>Assign crews.</b> Match each task to a named supervisor and crew size, and check the total against manpower on site.</li>
<li><b>Review weekly.</b> Each week, drop the past week, add a new third week, record what was done and why anything was missed.</li>
</ol>

<h2>Constraint checklist</h2>
<p>Work only goes into the "will do" list when every constraint is cleared:</p>
<ul>
<li><b>Drawings:</b> latest revision issued for construction and on site</li>
<li><b>Materials:</b> delivered, inspected and available at the workface (not just "ordered")</li>
<li><b>Predecessor work:</b> finished and handed over, such as foundations cured before steel erection</li>
<li><b>Permits:</b> work permits, hot work, excavation and lifting plans approved</li>
<li><b>Equipment:</b> cranes, scaffolding and test equipment booked</li>
<li><b>Manpower:</b> the right trades and certifications available</li>
<li><b>Access and space:</b> no clash with other crews in the same area</li>
<li><b>Quality and safety:</b> inspection and test plan, method statement and risk assessment approved</li>
</ul>

<h2>Example look-ahead</h2>
<div class="table-wrap"><table>
<thead><tr><th>Task</th><th>Crew</th><th>Week 1</th><th>Week 2</th><th>Week 3</th><th>Constraint</th><th>Owner</th></tr></thead>
<tbody>
<tr><td>Erect rack steel, bays 1 to 6</td><td>Steel A (8)</td><td>■■■■■</td><td>■■</td><td></td><td>Clear</td><td></td></tr>
<tr><td>Set pumps P-201 A/B</td><td>Mech (6)</td><td></td><td>■■■</td><td></td><td>Grout cure sign-off</td><td>Civil supervisor</td></tr>
<tr><td>Erect spools, lines 201 to 214</td><td>Piping B (10)</td><td></td><td>■■■■</td><td>■■■■■</td><td>Spools 207, 211 not delivered</td><td>Materials controller</td></tr>
<tr><td>Hydrotest test pack TP-14</td><td>Test crew (4)</td><td></td><td></td><td>■■</td><td>NDT results pending</td><td>QC inspector</td></tr>
<tr><td>Pull cables, rack tray level 2</td><td>Elec (8)</td><td>■■■■■</td><td>■■■■■</td><td>■■■</td><td>Clear</td><td></td></tr>
</tbody></table></div>

<h2>Measure the plan: percent plan complete</h2>
<p>At the end of each week, count the tasks committed for that week and the tasks actually completed. Percent plan complete (PPC) is completed ÷ committed. A site that consistently reaches 80% or more has a reliable short-term plan; lower figures point to constraints not being cleared. Record the reason for every miss (materials, drawings, weather, manpower, previous work late) and look at the totals each month: the most common reason is where the fix is.</p>

<h2>Common mistakes</h2>
<ul>
<li>Copying master schedule activities without breaking them down, which gives supervisors nothing they can act on.</li>
<li>Treating "materials ordered" as "materials available".</li>
<li>Letting the look-ahead drift from the master schedule; actual progress must flow back into the master every week.</li>
<li>Filling the week with work that cannot be done, which makes PPC meaningless.</li>
</ul>

<h2>Using Planline for look-aheads</h2>
<p>Keep the master schedule in Planline and record progress at each status date, so the remaining dates are always current. Export the schedule to Excel and filter on start and finish dates to pull the window for the coming weeks, then add your crew and constraint columns. The Gantt chart's week zoom gives a quick visual check of what is starting.</p>
''',
        faq=[
            ('Why three weeks?', 'Three weeks is long enough to deliver missing materials, drawings or permits once a constraint is spotted, and short enough for the detail to be accurate. Shutdowns often use daily or shift-level look-aheads instead.'),
            ('Who prepares the look-ahead?', 'Usually the area or discipline supervisors with the site planner. The planner extracts the window from the master schedule; supervisors break it down and confirm constraints.'),
            ('What is a good PPC?', 'Around 80% or higher is generally considered a reliable short-term plan. More important than the figure is tracking why tasks are missed and fixing the common causes.'),
        ]))

    G.append(dict(
        path='earned-value-management/', crumb='Earned value management', article=True, group='control',
        title='Earned Value Management Explained: PV, EV, AC, SPI and CPI with a Worked Example | Planline',
        desc='Earned value management in plain language: planned value, earned value, actual cost, schedule and cost variance, SPI, CPI, EAC, ETC and TCPI, with a worked example in man-hours for a construction project.',
        h1='Earned value management explained',
        lede='Earned value answers two questions with three numbers: are we ahead or behind, and are we spending more or less than planned for the work done? This guide explains every formula with one worked example in man-hours.',
        body='''
<h2>The three base numbers</h2>
<div class="table-wrap"><table>
<thead><tr><th>Term</th><th>Also called</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><b>PV</b> planned value</td><td>BCWS</td><td>The budget for the work that should be done by the status date</td></tr>
<tr><td><b>EV</b> earned value</td><td>BCWP</td><td>The budget for the work actually done by the status date</td></tr>
<tr><td><b>AC</b> actual cost</td><td>ACWP</td><td>What the work done actually cost (or the man-hours actually spent)</td></tr>
<tr><td><b>BAC</b> budget at completion</td><td></td><td>The total budget for all the work</td></tr>
</tbody></table></div>
<p>The trick is in EV: it values the work done at its <i>budget</i>, not at what it cost. That makes it comparable with both the plan (PV) and the spend (AC).</p>

<h2>Man-hours or money?</h2>
<p>On construction projects earned value is very often measured in man-hours rather than currency. Budgeted man-hours come from quantities and norms, earned man-hours come from quantities installed, and actual man-hours come from timesheets. This keeps craft productivity separate from price changes in materials and exchange rates. The formulas are identical either way.</p>

<h2>Worked example</h2>
<p>A piping and steel package has a budget of <b>10,000 man-hours</b>. At the status date:</p>
<ul>
<li>The plan says 50% should be done, so <b>PV = 5,000 MH</b>.</li>
<li>Measured progress is 42.5% (see the <a href="{UP}progress-measurement/">progress measurement guide</a> for how this is calculated), so <b>EV = 4,250 MH</b>.</li>
<li>Timesheets show <b>AC = 5,100 MH</b> booked to the package.</li>
</ul>
<div class="table-wrap"><table>
<thead><tr><th>Measure</th><th>Formula</th><th class="num">Result</th><th>Reading</th></tr></thead>
<tbody>
<tr><td>Schedule variance (SV)</td><td>EV − PV</td><td class="num">−750 MH</td><td>Behind plan</td></tr>
<tr><td>Schedule performance index (SPI)</td><td>EV ÷ PV</td><td class="num">0.85</td><td>85% of planned work done</td></tr>
<tr><td>Cost variance (CV)</td><td>EV − AC</td><td class="num">−850 MH</td><td>Overspent</td></tr>
<tr><td>Cost performance index (CPI)</td><td>EV ÷ AC</td><td class="num">0.83</td><td>Each hour spent earns 0.83 hours of budget</td></tr>
<tr><td>Estimate at completion (EAC)</td><td>BAC ÷ CPI</td><td class="num">12,000 MH</td><td>Forecast if productivity stays the same</td></tr>
<tr><td>Estimate to complete (ETC)</td><td>EAC − AC</td><td class="num">6,900 MH</td><td>Hours still needed</td></tr>
<tr><td>Variance at completion (VAC)</td><td>BAC − EAC</td><td class="num">−2,000 MH</td><td>Forecast overrun</td></tr>
<tr><td>To-complete performance index (TCPI)</td><td>(BAC − EV) ÷ (BAC − AC)</td><td class="num">1.17</td><td>Productivity needed on the rest to finish on budget</td></tr>
</tbody></table></div>
<p>Reading it together: the package is about 15% behind and 17% less productive than estimated. To finish within 10,000 hours the crews would need to work 17% <i>better</i> than budget on the remaining work, which is rarely realistic, so the honest forecast is around 12,000 hours.</p>

<h2>Which EAC formula to use</h2>
<ul>
<li><b>BAC ÷ CPI</b> assumes the productivity so far continues. A sound default once a package is 20 to 30% complete.</li>
<li><b>AC + (BAC − EV)</b> assumes the remaining work goes exactly to budget. Only defensible if the cause of the overrun is gone.</li>
<li><b>AC + (BAC − EV) ÷ (CPI × SPI)</b> assumes being behind schedule will also push costs up, for example through acceleration. A cautious forecast.</li>
</ul>

<h2>Reading SPI with care</h2>
<p>SPI is measured in budget, not in time, and it always returns to 1.0 at the end of a project because all the planned work is eventually earned. Late in a project it stops being a good schedule indicator; look at the critical path and float instead. A high SPI can also hide trouble if crews are doing easy, non-critical work ahead of plan while critical work slips.</p>

<h2>What makes earned value reliable</h2>
<ul>
<li>Objective progress: measured quantities and agreed <a href="{UP}rules-of-credit/">rules of credit</a>, not percent-complete guesses.</li>
<li>A frozen baseline, so PV does not move every month.</li>
<li>Timesheets booked to the same WBS elements as the budget.</li>
<li>Same cut-off date for progress and actual hours.</li>
</ul>

<h2>Earned value in Planline</h2>
<p>Planline calculates budget man-hours from quantities and norms, earned man-hours from the quantities you record, and the planned percent complete at the status date. The dashboard shows actual against planned progress, earned man-hours, the schedule performance index (SPI) and the planned versus actual S-curve. Actual hours from timesheets are not tracked in the scheduler, so calculate CPI and the forecast alongside it in the Excel report.</p>
''',
        faq=[
            ('What is a good SPI or CPI?', 'Exactly 1.0 means on plan. Above 1.0 is ahead of schedule (SPI) or under budget (CPI); below 1.0 is behind or over. Most owners start asking questions below about 0.95.'),
            ('What is the difference between earned value and physical progress?', 'Physical progress is earned value expressed as a percentage: EV divided by BAC. Earned value management adds the comparison with planned value and actual cost.'),
            ('Can I use earned value without cost data?', 'Yes. Using man-hours for PV, EV and AC is common in construction and gives the same indices without needing cost information.'),
        ]))

    G.append(dict(
        path='rules-of-credit/', crumb='Rules of credit', article=True, group='control',
        title='Rules of Credit for Construction Progress Measurement (Examples by Discipline) | Planline',
        desc='What rules of credit are and how to use them to measure construction and engineering progress, with example credit steps for civil, structural steel, piping, equipment, electrical, instrumentation and engineering deliverables.',
        h1='Rules of credit for progress measurement',
        lede='Rules of credit decide how much progress a team earns for each step of an activity, so that "40% complete" means the same thing to the contractor, the client and the planner. Here are the measurement methods and example credit steps by discipline.',
        body='''
<h2>Why rules of credit matter</h2>
<p>Without agreed rules, percent complete becomes an opinion. A supervisor may report a pipe spool as 80% complete because it is hanging in place, while the client sees an unwelded, untested line. Rules of credit fix this by splitting each type of work into measurable steps, each with a fixed share of the activity's weight. They are normally written into the project's progress measurement procedure and agreed with the client before work starts.</p>

<h2>Measurement methods</h2>
<div class="table-wrap"><table>
<thead><tr><th>Method</th><th>How progress is earned</th><th>Good for</th></tr></thead>
<tbody>
<tr><td>Units completed</td><td>Quantity done ÷ scope quantity</td><td>Repetitive work: welds, cable metres, cubic metres of concrete</td></tr>
<tr><td>Weighted steps (milestones)</td><td>Fixed percentage when each step is finished</td><td>Work with distinct stages: equipment, piping systems, drawings</td></tr>
<tr><td>0/100</td><td>Nothing until complete</td><td>Very short activities, under one reporting period</td></tr>
<tr><td>50/50</td><td>Half at start, half at finish</td><td>Short activities spanning two periods</td></tr>
<tr><td>Level of effort</td><td>Progress follows elapsed time</td><td>Support work: supervision, project management</td></tr>
<tr><td>Supervisor's estimate</td><td>Judgement</td><td>Last resort, small items only</td></tr>
</tbody></table></div>

<h2>Example credit steps by discipline</h2>
<div class="note"><b>Examples only.</b> These splits are typical of what appears in progress measurement procedures, but every project agrees its own. Use your contract's procedure where one exists.</div>

<h3>Civil: concrete foundations</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Excavation and blinding</td><td class="num">10%</td></tr><tr><td>Formwork</td><td class="num">20%</td></tr><tr><td>Reinforcement and embedded items</td><td class="num">25%</td></tr><tr><td>Concrete poured</td><td class="num">35%</td></tr><tr><td>Strip, cure and backfill</td><td class="num">10%</td></tr>
</tbody></table></div>

<h3>Structural steel (per tonne)</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Shake-out and pre-assembly</td><td class="num">10%</td></tr><tr><td>Erected</td><td class="num">50%</td></tr><tr><td>Aligned and plumbed</td><td class="num">15%</td></tr><tr><td>Bolted up and torqued</td><td class="num">20%</td></tr><tr><td>Touch-up painting and punch list</td><td class="num">5%</td></tr>
</tbody></table></div>

<h3>Piping (per test pack or line, weighted by inch-dia)</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Spools erected in position</td><td class="num">30%</td></tr><tr><td>Field joints welded (by inch-dia)</td><td class="num">40%</td></tr><tr><td>Supports installed</td><td class="num">10%</td></tr><tr><td>NDT complete and accepted</td><td class="num">5%</td></tr><tr><td>Hydrotest passed</td><td class="num">10%</td></tr><tr><td>Reinstatement</td><td class="num">5%</td></tr>
</tbody></table></div>

<h3>Mechanical equipment</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Set on foundation</td><td class="num">50%</td></tr><tr><td>Levelled and aligned</td><td class="num">20%</td></tr><tr><td>Grouted</td><td class="num">10%</td></tr><tr><td>Internals and dressing</td><td class="num">10%</td></tr><tr><td>Final alignment and box-up</td><td class="num">10%</td></tr>
</tbody></table></div>

<h3>Electrical: cables</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Cable pulled and dressed</td><td class="num">60%</td></tr><tr><td>Glanded and terminated (both ends)</td><td class="num">30%</td></tr><tr><td>Tested (insulation resistance, continuity)</td><td class="num">10%</td></tr>
</tbody></table></div>

<h3>Instrumentation</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Calibrated</td><td class="num">10%</td></tr><tr><td>Installed and supported</td><td class="num">35%</td></tr><tr><td>Hook-up (process and air)</td><td class="num">30%</td></tr><tr><td>Loop checked</td><td class="num">25%</td></tr>
</tbody></table></div>

<h3>Engineering deliverables (drawings, documents)</h3>
<div class="table-wrap"><table><thead><tr><th>Step</th><th class="num">Credit</th></tr></thead><tbody>
<tr><td>Started</td><td class="num">10%</td></tr><tr><td>Internal check complete</td><td class="num">40%</td></tr><tr><td>Issued for review (IFR)</td><td class="num">60%</td></tr><tr><td>Client comments incorporated, issued for approval (IFA)</td><td class="num">80%</td></tr><tr><td>Issued for construction (IFC)</td><td class="num">100%</td></tr>
</tbody></table></div>

<h2>Worked example</h2>
<p>A piping test pack has 600 inch-dia of field welds and a budget of 1,500 man-hours. Spools are all erected, 300 of 600 inch-dia are welded, and half the supports are in.</p>
<p>Progress = 30% (spools) + 40% × 300/600 (welds) + 10% × 0.5 (supports) = 30 + 20 + 5 = <b>55%</b>, so the test pack has earned 0.55 × 1,500 = <b>825 man-hours</b>.</p>

<h2>Tips</h2>
<ul>
<li>Weight the steps by the effort they take, not by how visible they are. Erecting a spool looks like progress but is often less than half the work.</li>
<li>Keep the final step meaningful (test, punch list, IFC) so items cannot sit at 95% for months.</li>
<li>Do not change rules mid-project without re-baselining; the S-curve will jump.</li>
</ul>

<h2>Applying rules of credit in Planline</h2>
<p>Either split the work into one activity per step with the step's share of man-hours, which gives the clearest Gantt chart, or keep one activity and record the credited quantity in the Progress entry sheet (in the example above, 55% of the scope quantity). Planline then calculates earned man-hours and the <a href="{UP}progress-measurement/">weighted overall progress</a>.</p>
''',
        faq=[
            ('Who sets the rules of credit?', 'Normally the contractor proposes them in the progress measurement procedure and the client approves them before construction starts. Owners often have standard rules they require.'),
            ('Should engineering progress use rules of credit?', 'Yes. Weighted steps tied to document issues (IFR, IFA, IFC) are the standard way to measure engineering progress objectively.'),
            ('What is the difference between rules of credit and weightage?', 'Weightage sets how much each activity counts in the overall progress. Rules of credit set how much progress an activity earns for each step within it.'),
        ]))

    G.append(dict(
        path='piping-man-hours/', crumb='Piping man-hour estimate', article=True, group='estimate',
        title='How to Estimate Piping Man-Hours (Inch-Dia Method, Worked Example) | Planline',
        desc='Estimate piping installation man-hours step by step: take-off from isometrics, inch-dia and metres, weld, erection, valve, support and test norms, productivity factors, and a worked example with crew and duration.',
        h1='How to estimate piping man-hours',
        lede='Piping is usually the largest share of direct man-hours on an oil and gas project. This guide shows the standard inch-dia method, from the isometric take-off to man-hours, crew size and duration, with a worked example.',
        body='''
<h2>The units</h2>
<ul>
<li><b>Inch-dia (diameter-inch)</b> measures welding: nominal pipe size in inches × number of joints. Ten 6-inch butt welds are 60 inch-dia.</li>
<li><b>Metres (or feet)</b> measure pipe handling and erection, and testing.</li>
<li><b>Each</b> counts valves, flanged joints and standard supports; heavy supports are often measured in kilograms.</li>
<li><b>Inch-metre</b> (size × length) is used by some contractors for erection instead of metres by size.</li>
</ul>

<h2>Step 1: take off quantities from the isometrics</h2>
<p>From each isometric drawing or a 3D model report, list by line size, material and wall thickness: field welds, pipe length, valves, flanged joints and supports. Separate shop welds (done in the fabrication shop) from field welds, because field welds take much longer. Group lines into test packs, since testing, reinstatement and progress are managed per test pack.</p>

<h2>Step 2: apply norms</h2>
<p>Multiply each quantity by its man-hour norm. Norms rise with wall thickness and with harder materials: a stainless or alloy weld takes noticeably longer than carbon steel. The values below are from Planline's <a href="{UP}man-hour-norms/">indicative norms library</a>.</p>

<h2>Worked example: a pipe rack line package</h2>
<div class="table-wrap"><table>
<thead><tr><th>Item</th><th class="num">Quantity</th><th>Unit</th><th class="num">Norm</th><th class="num">Man-hours</th></tr></thead>
<tbody>
<tr><td>Field butt welds, CS, STD, 6" (120 joints)</td><td class="num">720</td><td>inch-dia</td><td class="num">1.2</td><td class="num">864</td></tr>
<tr><td>Field butt welds, CS, Sch 80, 4" (40 joints)</td><td class="num">160</td><td>inch-dia</td><td class="num">1.6</td><td class="num">256</td></tr>
<tr><td>Pipe handling and erection, 6"</td><td class="num">600</td><td>m</td><td class="num">1.6</td><td class="num">960</td></tr>
<tr><td>Pipe handling and erection, 4"</td><td class="num">200</td><td>m</td><td class="num">1.2</td><td class="num">240</td></tr>
<tr><td>Manual valves, flanged, 6"</td><td class="num">12</td><td>each</td><td class="num">4.5</td><td class="num">54</td></tr>
<tr><td>Flanged joint bolt-up, 6"</td><td class="num">48</td><td>joint</td><td class="num">2</td><td class="num">96</td></tr>
<tr><td>Standard supports (shoe, guide, clamp)</td><td class="num">150</td><td>each</td><td class="num">2.5</td><td class="num">375</td></tr>
<tr><td>Hydrotest and flushing</td><td class="num">800</td><td>m</td><td class="num">0.12</td><td class="num">96</td></tr>
<tr><th>Base man-hours</th><th></th><th></th><th></th><th class="num">2,941</th></tr>
</tbody></table></div>

<h2>Step 3: apply a productivity factor</h2>
<p>Norms assume reasonable conditions. A productivity factor adjusts them for the real site. Typical influences:</p>
<div class="table-wrap"><table>
<thead><tr><th>Condition</th><th>Typical effect</th></tr></thead>
<tbody>
<tr><td>Work at height on a pipe rack or in congested modules</td><td>+10 to +30%</td></tr>
<tr><td>Brownfield work in an operating plant (permits, gas testing, restricted hours)</td><td>+30 to +100%</td></tr>
<tr><td>Hot or cold climate, rain seasons</td><td>+10 to +25%</td></tr>
<tr><td>Long working hours or extended overtime</td><td>+5 to +20%</td></tr>
<tr><td>Experienced crews, good access, prefabrication-heavy design</td><td>−5 to −15%</td></tr>
</tbody></table></div>
<p>Factors multiply rather than add if several apply, so be careful not to double-count. In the example the line runs on a pipe rack in a hot climate, so we use <b>1.3</b>: 2,941 × 1.3 = <b>3,823 man-hours</b>.</p>

<h2>Step 4: turn man-hours into crew and duration</h2>
<p>With a crew of 8 (welders, fitters, helpers and a rigger) working 10-hour days, the crew delivers 80 man-hours a day. 3,823 ÷ 80 ≈ <b>48 working days</b>. On a six-day week that is eight weeks. If the schedule allows only six weeks, you need roughly 10 to 11 people, provided there is enough work front for two crews to work without getting in each other's way.</p>

<h2>Checks before you trust the number</h2>
<ul>
<li><b>Compare with history.</b> Man-hours per inch-dia of field weld, all-in, on similar past jobs is the quickest sanity check.</li>
<li><b>Include what norms leave out.</b> Scaffolding, NDT, post-weld heat treatment, painting of field welds, and material handling at the laydown yard often have their own norms.</li>
<li><b>Watch small-bore piping.</b> Lines of 1-1/2" and below carry many joints and supports per metre; they often take more hours than their size suggests.</li>
<li><b>Separate direct and indirect hours.</b> Supervision, QA/QC and site overheads are usually budgeted separately.</li>
</ul>

<h2>Doing it in Planline</h2>
<p>Create one activity per test pack or line group, enter the unit and scope quantity, pick the norm from the library and set the productivity factor. Planline calculates man-hours, and if you enter the crew size and hours per day it can set the duration too. When work starts, record welded inch-dia in the Progress entry sheet and the earned man-hours and S-curve follow.</p>
''',
        faq=[
            ('How many man-hours per inch-dia for welding?', 'For carbon steel standard wall field welds, roughly 1 to 1.5 man-hours per inch-dia is common, with 1.2 a typical planning value. Thicker walls, stainless steel and alloys take more; shop welds take less.'),
            ('What is the difference between inch-dia and inch-metre?', 'Inch-dia measures welds: size × number of joints. Inch-metre measures pipe: size × length, and is sometimes used for erection instead of metres by size.'),
            ('Do piping norms include testing?', 'Usually not. Hydrotest, flushing, reinstatement, NDT and heat treatment are estimated separately, as in the example.'),
        ]))
    return G


def site_pages(issues_url, contact_email):
    email = (f'<p>Email: <a href="mailto:{contact_email}">{contact_email}</a></p>' if contact_email else '')
    P = []
    P.append(dict(
        path='contact/', crumb='Contact', no_cta=True, no_hero_cta=True,
        title='Contact Planline',
        desc='How to contact Planline: report a bug, ask for a feature, suggest a guide, or ask a question about the free online project scheduler.',
        h1='Contact',
        lede='Questions, bug reports, feature ideas and suggestions for new guides are all welcome.',
        body=f'''
{email}
<h2>Report a bug or request a feature</h2>
<p>The quickest route is to <a href="{issues_url}" rel="noopener">open an issue on GitHub</a>. Please say what you were doing, what you expected and what happened, and which browser you use. If the problem is with an imported file, describe its layout; please do not attach a real project schedule that contains confidential information.</p>
<h2>Suggest a guide or a norm</h2>
<p>If you would like a guide on a planning or project controls topic, or you have better field data for a man-hour norm, let us know through the same link. Suggestions from working planners and engineers shape what gets written next.</p>
<h2>Your data</h2>
<p>Projects you keep without signing in live only in your own browser, so we cannot see or recover them. Export a backup from the scheduler to keep a copy. If you signed in, you can delete your account and saved projects yourself from the account window. See the <a href="{{UP}}privacy.html">privacy policy</a> for details.</p>
'''))
    P.append(dict(
        path='terms/', crumb='Terms of use', no_cta=True, no_hero_cta=True,
        title='Terms of Use | Planline',
        desc='Terms of use for Planline, the free browser-based project scheduler and its planning guides.',
        h1='Terms of use',
        lede='Plain-language terms for using Planline.',
        body=f'''
<h2>Using Planline</h2>
<p>Planline is a free, browser-based project scheduling tool with planning guides. You may use it for personal, educational and commercial work. By using the site you agree to these terms.</p>
<h2>Your data</h2>
<p>Your schedules belong to you. Without an account they are stored only in your browser. If you sign in, copies are stored in your account so you can open them on other devices. Keep your own backups: browser storage can be cleared by your browser, device settings or cleaning tools, and we cannot restore it. See the <a href="{{UP}}privacy.html">privacy policy</a>.</p>
<h2>No warranty</h2>
<p>Planline and its content are provided "as is", without warranty of any kind. Calculations, man-hour norms, examples and guidance are indicative and for planning support only. They are not a substitute for professional judgement, your company's procedures or your contract. Check results before relying on them for bids, contractual submissions or safety-related decisions.</p>
<h2>Limitation of liability</h2>
<p>To the extent allowed by law, Planline is not liable for any loss arising from use of the site, including loss of data, profit or business, or from decisions made using its calculations or content.</p>
<h2>Acceptable use</h2>
<p>Do not attempt to disrupt the site, access other people's accounts or data, or use the site for anything unlawful.</p>
<h2>Advertising and third-party services</h2>
<p>The site may show advertising and uses third-party services for sign-in, storage, fonts and visitor statistics, described in the privacy policy. Links to other websites are provided for convenience; we are not responsible for their content.</p>
<h2>Changes</h2>
<p>These terms may be updated from time to time. The date at the top of the privacy policy shows the latest revision of our policies.</p>
<h2>Contact</h2>
<p>See the <a href="{{UP}}contact/">contact page</a>.</p>
'''))
    return P
