// learn-data.js — Centralized knowledge base for Schedule Validator

const LEARN_TOPICS = {

  /* ─── OVERVIEW ─────────────────────────────────────────── */

  'overall-score': {
    title: 'Overall Schedule Quality Score',
    category: 'Overview',
    icon: '🎯',
    definition: 'A single 0–100 composite score that summarises the health of your Primavera P6 schedule across six weighted quality categories. It is derived from the DCMA+ methodology — an industry-standard extension of the U.S. Defense Contract Management Agency\'s 14-point assessment adapted for commercial construction.',
    whyMatters: 'Owners, lenders, and dispute consultants rely on this score to quickly assess whether a schedule can be trusted as a reliable planning tool. A declining score update-to-update is an early warning of systemic schedule problems before they show up as delays.',
    threshold: 'Green ≥ 85 · Amber 70–84 · Red < 70',
    tip: 'Aim to resolve Red and Critical diagnostics first — they carry the heaviest scoring penalties.',
    learnMore: 'dcma-plus'
  },

  'rag-status': {
    title: 'RAG Status (Red / Amber / Green)',
    category: 'Overview',
    icon: '🚦',
    definition: 'A traffic-light system applied to the overall score and to individual metric categories. Green means the schedule meets best-practice thresholds. Amber signals emerging issues that need attention. Red indicates serious deficiencies that undermine schedule reliability.',
    whyMatters: 'RAG gives stakeholders an instant visual read at any level — portfolio, project, or individual metric — without needing to interpret raw numbers. It drives escalation decisions and weekly schedule review priorities.',
    threshold: 'Green ≥ 85 · Amber 70–84 · Red < 70',
    tip: 'Track RAG trend over updates — a slide from Green to Amber is more telling than any single snapshot.'
  },

  'dcma-plus': {
    title: 'DCMA+ Scoring Methodology',
    category: 'Overview',
    icon: '📐',
    definition: 'The Defense Contract Management Agency (DCMA) developed a 14-point schedule-quality checklist in 2005 to assess government contractor schedules. DCMA+ extends those checks into six weighted scoring categories that produce a 0–100 quality index, adding nuance around critical-path reliability, progress realism, and activity hygiene that the original 14 points did not address.',
    whyMatters: 'Government and many private owners require DCMA compliance by contract. Even where it is not mandated, the criteria represent internationally accepted best practice for creating schedules that are logically complete, realistically progressed, and reliably predictive.',
    threshold: 'The original DCMA target is full compliance (100%). DCMA+ scores ≥ 85 are considered high quality.',
    tip: 'All six score categories map back to one or more of the original 14 DCMA checks.'
  },

  /* ─── SCORE CATEGORIES ──────────────────────────────────── */

  'logic-quality': {
    title: 'Logic Quality',
    category: 'Score Category',
    icon: '🔗',
    weight: '25%',
    definition: 'Measures how well activities are connected to one another through logical predecessor/successor relationships. It penalises open ends (activities with no predecessor or no successor), excessive use of lags, leads (negative lags), and non-standard relationship types other than Finish-to-Start.',
    whyMatters: 'Logic is the backbone of CPM scheduling. A schedule with broken or missing logic cannot produce a reliable critical path or predict the true project end date. Every open end is a place where a delay can hide without warning the schedule.',
    threshold: 'Open ends < 5% · Lags < 5% · Leads = 0% · Non-FS relationships < 10%',
    tip: 'Start with open ends — they are the most common cause of low logic scores and easiest to resolve.',
    rules: ['OPEN_ENDS_PREDECESSOR', 'OPEN_ENDS_SUCCESSOR', 'EXCESSIVE_LAG']
  },

  'date-integrity': {
    title: 'Date Integrity',
    category: 'Score Category',
    icon: '📅',
    weight: '15%',
    definition: 'Checks whether the dates in the schedule are internally consistent and reflect real-world status. Penalises activities with actual dates recorded beyond the Data Date (future actuals), forecast dates before the Data Date, and a missing or stale Data Date.',
    whyMatters: 'Dates are the output of scheduling. If the dates are corrupt — activities showing as complete in the future, or planned to start in the past — every downstream analysis (float, critical path, finish forecast) becomes meaningless.',
    threshold: 'Future actuals = 0% · Missing Data Date = 0 issues',
    tip: 'After every schedule update, run a status check before distribution to catch future-actual errors.',
    rules: ['FUTURE_ACTUALS', 'MISSING_DATA_DATE']
  },

  'constraints-float': {
    title: 'Constraints & Float',
    category: 'Score Category',
    icon: '🔒',
    weight: '20%',
    definition: 'Evaluates how constraints and float values interact with schedule logic. Hard constraints override CPM calculations and can prevent delays from propagating correctly. Negative float means the schedule is already behind — it cannot be met as planned. High float may indicate orphaned activities or insufficient logic.',
    whyMatters: 'Constraints and float are the two most direct indicators of schedule realism. A schedule loaded with hard constraints is essentially a spreadsheet masquerading as a CPM schedule — it will not warn you of overruns until it\'s too late.',
    threshold: 'Hard constraints < 5% · Negative float = 0% · High float (>44 days) < 5%',
    tip: 'Replace hard constraints with logic ties wherever possible. Every constraint removed improves schedule reliability.',
    rules: ['NEGATIVE_FLOAT', 'EXCESSIVE_CONSTRAINTS', 'HIGH_FLOAT']
  },

  'activity-hygiene': {
    title: 'Activity Hygiene',
    category: 'Score Category',
    icon: '🧹',
    weight: '15%',
    definition: 'Assesses the structural quality of individual activities: whether durations are appropriately sized, calendars are assigned, LOE (Level of Effort) activities appear on the critical path, and the schedule contains no placeholder or filler tasks.',
    whyMatters: 'Bloated durations hide detail. Missing calendars distort float calculations. LOE activities on the critical path artificially inflate risk. Collectively, poor activity hygiene makes the schedule harder to manage and impossible to analyse reliably.',
    threshold: 'Long durations (>44 days) < 5% · Missing calendars = 0%',
    tip: 'Break any activity longer than 44 working days into smaller, measurable work packages.',
    rules: ['LONG_DURATION', 'MISSING_CALENDAR', 'LOE_CRITICAL']
  },

  'progress-realism': {
    title: 'Progress Realism',
    category: 'Score Category',
    icon: '📊',
    weight: '10%',
    definition: 'Evaluates whether reported progress matches what the logic and duration of the schedule would predict. Flags activities with implausibly high or low percent-complete values, and checks that no activity is progressing without a recorded actual start.',
    whyMatters: 'Optimistic progress reporting is one of the most common ways that schedules conceal delays. A schedule showing 80% complete on paper while the site is only 60% done will produce a false finish forecast and blind the team to impending overruns.',
    threshold: 'No activities with progress but no Actual Start · % complete values consistent with remaining duration',
    tip: 'Use physical % complete rather than duration % — it is harder to manipulate and more reflective of real work done.'
  },

  'critical-path-reliability': {
    title: 'Critical Path Reliability',
    category: 'Score Category',
    icon: '🛤️',
    weight: '15%',
    definition: 'Tests whether the schedule\'s critical path actually drives the project finish date. Penalises high near-critical density (too many activities almost on the critical path), LOE activities erroneously identified as critical, and low CPLI (Critical Path Length Index) values suggesting the remaining path is not achievable.',
    whyMatters: 'If the critical path is unreliable — broken by constraints or dominated by LOE tasks — then schedule compression, crashing, and float analysis all produce wrong answers. You can\'t recover a schedule you can\'t trust.',
    threshold: 'Near-critical density < 30% of non-critical activities · CPLI ≥ 1.0',
    tip: 'Run the Critical Path Test (delay the last activity by 600 days) to confirm the path propagates correctly.',
    rules: ['NEAR_CRITICAL_DENSITY', 'LOE_CRITICAL']
  },

  /* ─── CRITICAL PATH ─────────────────────────────────────── */

  'critical-path': {
    title: 'Critical Path',
    category: 'Critical Path',
    icon: '🛤️',
    definition: 'The longest sequence of logically connected activities that determines the earliest possible project completion date. Any delay to an activity on the critical path directly delays the project finish by the same amount. Critical path activities have zero total float.',
    whyMatters: 'The critical path is the heartbeat of CPM scheduling. It tells you exactly which activities to focus resources on to protect the completion date, and which delays will cost you calendar time versus which ones will not.',
    threshold: 'Critical activities have Total Float ≤ 0 days',
    tip: 'The critical path typically represents 10–15% of all schedule activities. If yours is much higher, you may have too many constraints.'
  },

  'near-critical-path': {
    title: 'Near-Critical Activities',
    category: 'Critical Path',
    icon: '⚠️',
    definition: 'Activities with total float between 1 and 14 days (two working weeks). They are not on the critical path today, but are close enough that a modest delay would make them critical. A high concentration of near-critical activities is a major risk indicator.',
    whyMatters: 'Near-critical activities represent your "backup critical paths" — the routes most likely to take over as the driving path if something goes wrong. When there are many of them, even a small disruption can cause the finish date to slip by weeks.',
    threshold: 'Near-critical density < 30% of remaining non-critical activities',
    tip: 'Monitor near-critical activities as closely as critical ones during execution. Float can evaporate quickly.'
  },

  'total-float': {
    title: 'Total Float (Total Slack)',
    category: 'Critical Path',
    icon: '⏱️',
    definition: 'The amount of time an activity can be delayed without delaying the project\'s overall completion date. Calculated as Late Finish minus Early Finish (or Late Start minus Early Start). Negative total float means the schedule cannot meet its current end date.',
    whyMatters: 'Float is a shared resource across a logic chain — consuming it on one activity reduces it for all downstream activities. Understanding float distribution helps project managers make informed decisions about where to apply resources.',
    threshold: 'High float > 44 working days should be < 5% of activities · Negative float should be 0%',
    tip: 'Float belongs to the project, not the activity. Communicate this clearly to subcontractors who treat their float as schedule padding.'
  },

  'free-float': {
    title: 'Free Float',
    category: 'Critical Path',
    icon: '🆓',
    definition: 'The amount of time an activity can be delayed without delaying the early start of any immediate successor. Unlike total float, consuming free float does not affect other activities in the chain — it is "owned" by that specific activity.',
    whyMatters: 'Free float is useful for identifying activities where a project manager can grant a subcontractor schedule flexibility without impacting other trades. It is a more precise negotiating tool than total float.',
    threshold: 'No specific threshold — used for analysis and negotiation',
    tip: 'Use free float to sequence subcontractor work packages without triggering float consumption claims downstream.'
  },

  'negative-float': {
    title: 'Negative Float',
    category: 'Critical Path',
    icon: '🔴',
    definition: 'Occurs when an activity\'s late finish date is earlier than its early finish date — meaning the activity is already expected to miss its deadline based on current logic and constraints. The schedule cannot be executed as planned without change.',
    whyMatters: 'Negative float is a schedule\'s distress signal. It means commitments have been made that cannot be kept under current conditions. Any schedule showing negative float should not be baselined or accepted until the issues causing it are resolved.',
    threshold: 'Target: 0% of activities (DCMA requires zero negative float)',
    tip: 'Negative float is almost always caused by a combination of hard constraints and insufficient logic. Fix the constraints first, then re-evaluate.'
  },

  'cpli': {
    title: 'Critical Path Length Index (CPLI)',
    category: 'Critical Path',
    icon: '📏',
    definition: 'A ratio measuring how efficiently the remaining critical path must be executed to meet the project end date: (Critical Path Length + Total Float) ÷ Critical Path Length. A CPLI of 1.0 means the team must execute at exactly the planned pace. Values below 1.0 indicate the team must work faster than planned.',
    whyMatters: 'CPLI is a forward-looking efficiency metric. It tells you not just whether you\'re behind, but by how much you need to accelerate to recover. A CPLI below 0.95 is the DCMA threshold for a failing schedule.',
    threshold: 'CPLI ≥ 1.0 is ideal · CPLI ≥ 0.95 is the minimum acceptable threshold',
    formula: '(CPL + Total Float) ÷ CPL',
    tip: 'Track CPLI update-to-update. A declining CPLI trend is more actionable than a single snapshot.'
  },

  /* ─── LOGIC & RELATIONSHIPS ─────────────────────────────── */

  'open-ends': {
    title: 'Open Ends (Missing Logic)',
    category: 'Logic',
    icon: '🔓',
    definition: 'An activity is an "open end" if it has no predecessor (it can start at any time, unconstrained by prior work) or no successor (no downstream activity depends on its completion). Both create gaps in the logic network that allow the CPM engine to schedule activities without considering their true dependencies.',
    whyMatters: 'Open ends are the most common schedule defect. Activities without predecessors can start before their true driving work is complete. Activities without successors can slip without affecting the project finish calculation — giving a false sense of flexibility.',
    threshold: 'DCMA limit: < 5% of all activities (excluding project start/finish milestones)',
    tip: 'Every activity should have at least one predecessor and one successor. The only exceptions are the project\'s opening and closing milestones.'
  },

  'lags': {
    title: 'Lags',
    category: 'Logic',
    icon: '⏩',
    definition: 'A positive time delay inserted into a logical relationship. For example, "concrete cure time — Activity B cannot start until 7 days after Activity A finishes." Lags can represent real physical constraints (curing, drying, procurement lead times) but are frequently misused to model work that should be its own activity.',
    whyMatters: 'Excessive lags mask missing activities, pad schedules artificially, and can prevent the CPM engine from finding the true critical path. They reduce transparency and make schedule compression analysis less reliable.',
    threshold: 'DCMA limit: < 5% of relationships should contain lags',
    tip: 'Replace lags > 5 working days with a discrete placeholder activity — it improves traceability and allows better resource assignment.'
  },

  'leads': {
    title: 'Leads (Negative Lags)',
    category: 'Logic',
    icon: '⏪',
    definition: 'A negative lag value — it allows a successor activity to start before its predecessor has finished. For example, a lead of -5 days on a Finish-to-Start relationship means the successor can start 5 days before the predecessor completes. This almost always represents unrealistic overlap.',
    whyMatters: 'Leads make schedules appear more compressed than they really are. They hide concurrency risk and typically represent work that hasn\'t been properly planned. They are universally rejected by DCMA and most sophisticated schedule reviewers.',
    threshold: 'DCMA requires 0% leads (zero tolerance)',
    tip: 'Replace leads with Start-to-Start relationships with appropriate logic. Never model overlap by using negative lag.'
  },

  'relationship-types': {
    title: 'Relationship Types (FS, SS, FF, SF)',
    category: 'Logic',
    icon: '↔️',
    definition: 'The four logical relationship types in CPM scheduling: Finish-to-Start (FS) — successor starts after predecessor finishes. Start-to-Start (SS) — successor starts after predecessor starts. Finish-to-Finish (FF) — successor finishes after predecessor finishes. Start-to-Finish (SF) — the rarest and most complex; successor finishes after predecessor starts.',
    whyMatters: 'FS relationships are the most reliable and transparent. The more a schedule departs from FS logic, the harder it is to trace the critical path and understand delay propagation. Non-FS relationships can produce unexpected results when activities slip.',
    threshold: 'DCMA: ≥ 90% of relationships should be Finish-to-Start',
    tip: 'SF (Start-to-Finish) relationships are rarely necessary and almost always indicate a logic error. Eliminate them first.'
  },

  /* ─── CONSTRAINTS ───────────────────────────────────────── */

  'hard-constraints': {
    title: 'Hard Constraints',
    category: 'Constraints',
    icon: '🔒',
    definition: 'A constraint that forces an activity to occur on or before/after a specific date, overriding what the CPM logic would calculate. Hard constraint types include: Must Start On (MSO), Must Finish On (MFO), Start No Later Than (SNLT), and Finish No Later Than (FNLT). They prevent the schedule from shifting naturally when delays occur upstream.',
    whyMatters: 'Hard constraints break the logic chain. When an upstream delay happens, the hard constraint prevents the scheduler from propagating the delay to downstream activities — hiding the real impact and often creating negative float silently.',
    threshold: 'DCMA limit: < 5% of incomplete activities should have hard constraints',
    tip: 'Use Start No Earlier Than (SNET) soft constraints instead — they allow the schedule to shift right but not left, preserving logic without being overly rigid.'
  },

  'soft-constraints': {
    title: 'Soft Constraints',
    category: 'Constraints',
    icon: '🔓',
    definition: 'A constraint that sets a boundary in one direction only, allowing the schedule to move later if logic demands it. Soft constraint types include: Start No Earlier Than (SNET) and Finish No Earlier Than (FNET). They represent realistic planning boundaries (e.g., "we can\'t start until the permit arrives") without freezing the schedule.',
    whyMatters: 'Soft constraints represent best practice because they preserve CPM logic integrity. The schedule remains dynamic — delays propagate correctly — while still respecting real-world date boundaries.',
    threshold: 'Preferred over hard constraints in all cases where possible',
    tip: 'Most legitimate date requirements (permit dates, owner milestones) can be modelled as SNET constraints without breaking schedule logic.'
  },

  /* ─── DURATION & ACTIVITIES ─────────────────────────────── */

  'long-duration': {
    title: 'Long Duration Activities',
    category: 'Activity Hygiene',
    icon: '📏',
    definition: 'Activities with a planned duration exceeding 44 working days (approximately two calendar months). Long activities are too coarse for meaningful progress monitoring, hide risks within vague work scopes, and make it impossible to detect slippage until it\'s significant.',
    whyMatters: 'You cannot manage what you cannot measure. A 60-day "Foundation Work" activity gives no insight into whether formwork, rebar, or pours are on track. Breaking it into sub-activities of 1–3 weeks creates meaningful progress measurement points.',
    threshold: 'DCMA limit: < 5% of activities should exceed 44 working days',
    tip: 'A good rule of thumb for construction is that no activity should span more than two reporting periods (e.g., two weeks if you update bi-weekly).'
  },

  'milestones': {
    title: 'Milestones',
    category: 'Activity Hygiene',
    icon: '🏁',
    definition: 'Zero-duration activities that mark the completion of a key project event or deliverable — Substantial Completion, Design Release, Owner Turnover, Permit Received, etc. In P6 they are typed as "Start Milestone" or "Finish Milestone." They should be logically connected to the work that precedes and follows them.',
    whyMatters: 'Milestones are the contractual checkpoints that define project success. Tracking milestone status and float gives owners and GCs an immediate read on whether key commitments are at risk without needing to understand the full detail of the schedule.',
    threshold: 'All contractual milestones should appear in the schedule and have both predecessors and successors',
    tip: 'Add float thresholds to milestone monitoring — flag any contractual milestone whose float drops below 10 days.'
  },

  'loe': {
    title: 'Level of Effort (LOE)',
    category: 'Activity Hygiene',
    icon: '📋',
    definition: 'A P6 activity type used for ongoing, support-type work that runs in parallel with other activities and has no discrete deliverable — project management, safety supervision, document control. LOE activities\' durations are automatically governed by their predecessor/successor hammock logic rather than independent CPM calculation.',
    whyMatters: 'LOE activities should never appear on the critical path because they do not drive project completion — they support it. When LOE tasks are incorrectly typed or improperly linked, they can hijack the critical path calculation and produce misleading results.',
    threshold: '0 LOE activities should appear on the critical path',
    tip: 'Review all critical-path activities in P6 and change any incorrectly-typed LOE tasks to Task Dependent before each submission.'
  },

  /* ─── PERFORMANCE METRICS ───────────────────────────────── */

  'bei': {
    title: 'Baseline Execution Index (BEI)',
    category: 'Performance',
    icon: '📈',
    definition: 'Measures how many activities the team has completed relative to how many the baseline scheduled for completion by this date: BEI = Activities Completed ÷ Activities Planned to be Complete (per Baseline). A BEI of 1.0 means exactly on schedule. Below 1.0 means behind the baseline plan.',
    whyMatters: 'BEI is a whole-project productivity measure that cuts through selective reporting. Even if individual activities look good, a BEI below 0.95 signals that the team is systematically unable to execute at the planned rate — and the finish date will slip unless something changes.',
    threshold: 'DCMA minimum: BEI ≥ 0.95 · Target: BEI = 1.0',
    formula: 'Activities Completed ÷ Activities Planned Complete per Baseline',
    tip: 'A declining BEI trend across three or more updates is a strong predictor of schedule delay and should trigger a schedule recovery plan.'
  },

  'data-date': {
    title: 'Data Date (Status Date)',
    category: 'Performance',
    icon: '📆',
    definition: 'The date through which the schedule has been updated with actual progress. All work before the Data Date should have actual start and finish dates recorded. All work after it should show forecast/remaining dates. The Data Date is the dividing line between history and forecast.',
    whyMatters: 'The Data Date is fundamental to schedule integrity. A schedule without a Data Date cannot be evaluated for current status. A stale Data Date (weeks or months behind the current date) means progress has not been recorded and the schedule is not a reliable forecast.',
    threshold: 'Data Date should match or be within 1–2 days of the schedule submission date',
    tip: 'Always confirm the Data Date before distributing a schedule update. It should match your weekly or bi-weekly cutoff date.'
  },

  'future-actuals': {
    title: 'Future Actuals',
    category: 'Performance',
    icon: '🚫',
    definition: 'Activities that have actual start or actual finish dates recorded beyond the current Data Date. This is a data entry error — it means someone has recorded work as complete that has not yet happened from the schedule\'s perspective.',
    whyMatters: 'Future actuals corrupt float calculations, distort the critical path, and undermine confidence in the entire dataset. They are often the result of bulk date changes or incorrect import procedures and must be corrected before any analysis is valid.',
    threshold: 'DCMA requires 0% future actuals (zero tolerance)',
    tip: 'Use P6\'s "Future Actuals" filter report before every submission to catch these errors automatically.'
  },

  /* ─── KEY CONCEPTS ──────────────────────────────────────── */

  'wbs': {
    title: 'Work Breakdown Structure (WBS)',
    category: 'Key Concepts',
    icon: '🌳',
    definition: 'A hierarchical decomposition of the total project scope into discrete work packages, organised logically by phase, area, discipline, or trade. In P6, each activity is assigned to a WBS node. The WBS structure determines how activities are grouped in reporting and how cost is tracked.',
    whyMatters: 'A well-structured WBS makes the schedule readable, filterable, and auditable. A poor WBS — too flat, too deep, or inconsistently organised — makes schedule reviews time-consuming and reduces the value of summary-level reporting.',
    threshold: 'No formal DCMA threshold, but a WBS should have at least 3 levels for any project > $10M',
    tip: 'Align your P6 WBS to your cost coding structure so schedule and budget analysis use the same breakdown.'
  },

  'critical-path-test': {
    title: 'Critical Path Test (600-Day Test)',
    category: 'Key Concepts',
    icon: '🔬',
    definition: 'A diagnostic test used to verify that the critical path is logic-driven and not broken by constraints. A 600-workday delay is artificially introduced at the start of the schedule; the project finish date should move exactly 600 days later. If it doesn\'t, the path is broken by hard constraints, open ends, or other logic defects.',
    whyMatters: 'A critical path that doesn\'t propagate correctly is not a real critical path — it\'s a list of activities whose float happens to be near zero. The 600-Day Test exposes this failure quickly. Schedules that fail this test cannot be trusted for float or delay analysis.',
    threshold: 'The finish date must shift exactly 600 days when the test delay is applied',
    tip: 'In P6, use the Global Change function to add 600 days to the project start and observe the finish date movement.'
  },

  'schedule-compression': {
    title: 'Schedule Compression',
    category: 'Key Concepts',
    icon: '⚡',
    definition: 'Techniques used to shorten the project duration after a delay has occurred or to recover float. Common methods include Crashing (adding resources to critical-path activities to shorten their duration) and Fast-Tracking (overlapping activities that were originally planned sequentially).',
    whyMatters: 'Understanding which activities are on the critical path and have sufficient float buffers is essential before attempting compression. Compressing non-critical activities wastes money and does nothing to recover the finish date.',
    threshold: 'No formal threshold — applied as needed for recovery',
    tip: 'Always analyse cost-slope (cost per day saved) before crashing. Target the cheapest critical-path activity first.'
  }
};

// Category groupings for the Learn page
const LEARN_CATEGORIES = [
  { key: 'Overview',        label: 'Overview',             icon: '🎯', color: '#0ea5e9' },
  { key: 'Score Category',  label: 'Score Categories',     icon: '📊', color: '#8b5cf6' },
  { key: 'Critical Path',   label: 'Critical Path',        icon: '🛤️', color: '#ef4444' },
  { key: 'Logic',           label: 'Logic & Relationships', icon: '🔗', color: '#f59e0b' },
  { key: 'Constraints',     label: 'Constraints',          icon: '🔒', color: '#f97316' },
  { key: 'Activity Hygiene',label: 'Activity Hygiene',     icon: '🧹', color: '#22c55e' },
  { key: 'Performance',     label: 'Performance Metrics',  icon: '📈', color: '#06b6d4' },
  { key: 'Key Concepts',    label: 'Key Concepts',         icon: '💡', color: '#a855f7' }
];

// Map widget IDs / section keys to topic keys
const WIDGET_TOPIC_MAP = {
  // Project dashboard cards
  'overall-score-ring':          'overall-score',
  'rag-badge':                   'rag-status',
  'score-logic':                 'logic-quality',
  'score-date':                  'date-integrity',
  'score-constraints':           'constraints-float',
  'score-hygiene':               'activity-hygiene',
  'score-progress':              'progress-realism',
  'score-critical-path':         'critical-path-reliability',
  'metric-critical':             'critical-path',
  'metric-near-critical':        'near-critical-path',
  'metric-negative-float':       'negative-float',
  'metric-open-ends':            'open-ends',
  'critical-path-section':       'critical-path',
  'milestones-section':          'milestones',
  'score-trend-chart':           'overall-score',
  // Diagnostics
  'diag-open-ends':              'open-ends',
  'diag-negative-float':         'negative-float',
  'diag-constraints':            'hard-constraints',
  'diag-lags':                   'lags',
  'diag-long-duration':          'long-duration',
  'diag-future-actuals':         'future-actuals',
  'diag-loe-critical':           'loe',
  'diag-near-critical':          'near-critical-path',
  // Comparison
  'delta-finish':                'data-date',
  'delta-cp-slip':               'critical-path',
  'delta-score':                 'overall-score',
  'delta-neg-float':             'negative-float',
  // Index
  'stat-projects':               'overall-score',
  'stat-scores':                 'rag-status',
};

window.LEARN_TOPICS = LEARN_TOPICS;
window.LEARN_CATEGORIES = LEARN_CATEGORIES;
window.WIDGET_TOPIC_MAP = WIDGET_TOPIC_MAP;
