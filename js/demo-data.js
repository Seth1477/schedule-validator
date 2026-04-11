// demo-data.js - Realistic construction schedule demo data

const DEMO_PROJECTS = [
  {
    id: 'proj-001',
    name: 'Downtown Medical Center Tower',
    client: 'HealthCorp Development LLC',
    contractValue: '$485,000,000',
    contractType: 'GMP',
    location: 'Denver, CO',
    startDate: '2024-03-01',
    plannedFinish: '2026-08-31',
    status: 'active',
    tags: ['Healthcare', 'High-Rise', 'Critical'],
    description: '24-story medical tower with 450 beds, 12 ORs, and full diagnostic imaging center',
    uploads: 8,
    latestScore: 71,
    latestScoreRag: 'amber',
    createdAt: '2024-02-15',
    updatedAt: '2026-04-01'
  },
  {
    id: 'proj-002',
    name: 'Interstate 70 Bridge Rehabilitation',
    client: 'Colorado DOT',
    contractValue: '$92,000,000',
    contractType: 'DBB',
    location: 'Aurora, CO',
    startDate: '2025-01-15',
    plannedFinish: '2026-12-31',
    status: 'active',
    tags: ['Infrastructure', 'DOT', 'Federal'],
    description: 'Full replacement of 6-span bridge structure with traffic management and realignment',
    uploads: 4,
    latestScore: 87,
    latestScoreRag: 'green',
    createdAt: '2024-12-01',
    updatedAt: '2026-03-15'
  },
  {
    id: 'proj-003',
    name: 'Lakewood Mixed-Use Development',
    client: 'Westfield Properties Inc.',
    contractValue: '$134,000,000',
    contractType: 'CM at Risk',
    location: 'Lakewood, CO',
    startDate: '2024-09-01',
    plannedFinish: '2026-06-30',
    status: 'active',
    tags: ['Mixed-Use', 'Commercial', 'Residential'],
    description: '18-story tower with 280 residential units, ground-floor retail, and 4-level parking structure',
    uploads: 6,
    latestScore: 58,
    latestScoreRag: 'red',
    createdAt: '2024-08-01',
    updatedAt: '2026-04-05'
  }
];

// Detailed schedule data for proj-001 (Downtown Medical Center)
const DEMO_SCHEDULE_VERSIONS = [
  { id: 'v1', projectId: 'proj-001', version: 'Baseline', dataDate: '2024-03-01', uploadDate: '2024-03-05', filename: 'MedCenter_Baseline.xer', overallScore: 82, status: 'published' },
  { id: 'v2', projectId: 'proj-001', version: 'Update 1', dataDate: '2024-06-01', uploadDate: '2024-06-10', filename: 'MedCenter_Update1.xer', overallScore: 79, status: 'published' },
  { id: 'v3', projectId: 'proj-001', version: 'Update 2', dataDate: '2024-09-01', uploadDate: '2024-09-08', filename: 'MedCenter_Update2.xer', overallScore: 76, status: 'published' },
  { id: 'v4', projectId: 'proj-001', version: 'Update 3', dataDate: '2024-12-01', uploadDate: '2024-12-09', filename: 'MedCenter_Update3.xer', overallScore: 74, status: 'published' },
  { id: 'v5', projectId: 'proj-001', version: 'Update 4', dataDate: '2025-03-01', uploadDate: '2025-03-07', filename: 'MedCenter_Update4.xer', overallScore: 73, status: 'published' },
  { id: 'v6', projectId: 'proj-001', version: 'Update 5', dataDate: '2025-06-01', uploadDate: '2025-06-06', filename: 'MedCenter_Update5.xer', overallScore: 70, status: 'published' },
  { id: 'v7', projectId: 'proj-001', version: 'Update 6', dataDate: '2025-09-01', uploadDate: '2025-09-05', filename: 'MedCenter_Update6.xer', overallScore: 72, status: 'published' },
  { id: 'v8', projectId: 'proj-001', version: 'Update 7', dataDate: '2026-01-01', uploadDate: '2026-01-10', filename: 'MedCenter_Update7.xer', overallScore: 71, status: 'current' }
];

const DEMO_CATEGORY_SCORES = {
  'v8': {
    logicQuality: { score: 68, weight: 0.25, label: 'Logic Quality' },
    dateIntegrity: { score: 74, weight: 0.15, label: 'Date Integrity' },
    constraintsFloat: { score: 65, weight: 0.15, label: 'Constraints & Float' },
    activityHygiene: { score: 78, weight: 0.15, label: 'Activity Hygiene' },
    progressRealism: { score: 71, weight: 0.15, label: 'Progress Realism' },
    criticalPathReliability: { score: 69, weight: 0.15, label: 'Critical Path Reliability' }
  }
};

const DEMO_DIAGNOSTICS = [
  {
    id: 'd001',
    category: 'Logic Quality',
    severity: 'critical',
    ruleKey: 'OPEN_ENDS_PREDECESSOR',
    title: 'Activities Missing Predecessor Logic',
    description: 'Activities have no predecessor relationship, creating open-end logic gaps that prevent valid critical path calculation.',
    count: 47,
    totalActivities: 1284,
    percent: 3.7,
    penalty: 8.2,
    recommendation: 'Add finish-to-start relationships from preceding activities or milestones. Focus on Level 3 activities in the MEP and Structural WBS.',
    activities: [
      { id: 'A1042', name: 'Install Chiller Plant Equipment', wbs: '3.4.2.1', startDate: '2025-08-15', finishDate: '2025-10-30', float: 0, isCritical: true },
      { id: 'A1087', name: 'Rough-in Medical Gas Systems - Floor 8', wbs: '3.3.4.8', startDate: '2025-07-01', finishDate: '2025-08-15', float: 4, isCritical: false },
      { id: 'A1093', name: 'Install Curtain Wall - Levels 12-16', wbs: '2.5.3.2', startDate: '2025-06-20', finishDate: '2025-09-10', float: -2, isCritical: true },
      { id: 'A1102', name: 'Pour Elevated Slab - Level 18', wbs: '2.2.4.18', startDate: '2025-09-01', finishDate: '2025-09-22', float: -5, isCritical: true },
      { id: 'A1115', name: 'Install HVAC Ductwork - OR Suite', wbs: '3.2.1.4', startDate: '2025-11-01', finishDate: '2025-12-15', float: 0, isCritical: true }
    ]
  },
  {
    id: 'd002',
    category: 'Logic Quality',
    severity: 'critical',
    ruleKey: 'OPEN_ENDS_SUCCESSOR',
    title: 'Activities Missing Successor Logic',
    description: 'Activities have no successor relationship, meaning work can theoretically extend without impacting any downstream activities.',
    count: 38,
    totalActivities: 1284,
    percent: 3.0,
    penalty: 6.8,
    recommendation: 'Connect these activities to their downstream work packages. Validate with the P6 scheduler that all work feeds into summary milestones or subsequent WBS phases.',
    activities: [
      { id: 'A2011', name: 'Concrete Testing - Tower Level 20', wbs: '2.2.4.20', startDate: '2025-10-15', finishDate: '2025-10-17', float: 12, isCritical: false },
      { id: 'A2034', name: 'Survey & Layout - Mechanical Penthouse', wbs: '3.1.5', startDate: '2025-10-01', finishDate: '2025-10-05', float: 0, isCritical: true }
    ]
  },
  {
    id: 'd003',
    category: 'Constraints & Float',
    severity: 'high',
    ruleKey: 'NEGATIVE_FLOAT',
    title: 'Negative Float Activities',
    description: 'Activities with negative total float indicate the schedule cannot achieve its planned dates without acceleration or logic changes.',
    count: 23,
    totalActivities: 1284,
    percent: 1.8,
    penalty: 7.4,
    recommendation: 'Investigate whether constraints are driving negative float. Remove non-essential "Finish No Later Than" constraints and verify data date is set correctly.',
    activities: [
      { id: 'A1093', name: 'Install Curtain Wall - Levels 12-16', wbs: '2.5.3.2', startDate: '2025-06-20', finishDate: '2025-09-10', float: -2, isCritical: true },
      { id: 'A1102', name: 'Pour Elevated Slab - Level 18', wbs: '2.2.4.18', startDate: '2025-09-01', finishDate: '2025-09-22', float: -5, isCritical: true },
      { id: 'A1201', name: 'Install Elevator Equipment - Cab 3', wbs: '4.2.3', startDate: '2025-12-01', finishDate: '2025-12-30', float: -8, isCritical: true }
    ]
  },
  {
    id: 'd004',
    category: 'Constraints & Float',
    severity: 'high',
    ruleKey: 'EXCESSIVE_CONSTRAINTS',
    title: 'Excessive Hard Constraints',
    description: 'Activities with "Must Start On" or "Finish No Later Than" hard constraints override schedule logic and can mask critical path issues.',
    count: 89,
    totalActivities: 1284,
    percent: 6.9,
    penalty: 5.1,
    recommendation: 'Audit all FNLT and MSO constraints. Replace with soft constraints (SNET, FNLT) where possible. Hard constraints should only be used for regulatory or contractual milestone dates.',
    activities: []
  },
  {
    id: 'd005',
    category: 'Logic Quality',
    severity: 'high',
    ruleKey: 'EXCESSIVE_LAG',
    title: 'Excessive Lag on Relationships',
    description: 'Relationships with lag values exceeding 15 working days may indicate missing activities or hidden work not captured in the schedule.',
    count: 34,
    totalActivities: 1284,
    percent: 2.6,
    penalty: 4.3,
    recommendation: 'Review all relationships with lag > 15 days. Consider breaking into discrete activities if the lag represents real work. Document any approved procurement or regulatory lags.',
    activities: []
  },
  {
    id: 'd006',
    category: 'Activity Hygiene',
    severity: 'medium',
    ruleKey: 'LONG_DURATION',
    title: 'Long Duration Activities (>44 Working Days)',
    description: 'Activities exceeding 44 working days (approximately 2 months) may be too broad and reduce schedule visibility and control.',
    count: 28,
    totalActivities: 1284,
    percent: 2.2,
    penalty: 2.8,
    recommendation: 'Break down activities exceeding 44 working days into measurable work packages. This improves earned value accuracy and schedule control.',
    activities: []
  },
  {
    id: 'd007',
    category: 'Progress Realism',
    severity: 'medium',
    ruleKey: 'ACTUAL_DATES_AFTER_DATA_DATE',
    title: 'Actual Dates Beyond Data Date',
    description: 'Activities have actual start or finish dates that are later than the schedule data date, indicating future-dated actuals.',
    count: 12,
    totalActivities: 1284,
    percent: 0.9,
    penalty: 3.2,
    recommendation: 'Verify data date is set correctly (currently 2026-01-01). Review all activities with actual dates > data date and correct or remove erroneous entries.',
    activities: []
  },
  {
    id: 'd008',
    category: 'Critical Path Reliability',
    severity: 'medium',
    ruleKey: 'NEAR_CRITICAL_DENSITY',
    title: 'High Near-Critical Activity Count',
    description: 'Activities with total float between 0 and 15 working days represent near-critical risk. Elevated counts signal fragile schedule.',
    count: 156,
    totalActivities: 1284,
    percent: 12.1,
    penalty: 3.8,
    recommendation: 'Review near-critical activities for logic errors or unnecessary constraints driving float down. Prioritize resource loading for near-critical MEP and interior finish activities.',
    activities: []
  }
];

const DEMO_MILESTONES = [
  { id: 'm001', name: 'Foundation Complete', plannedDate: '2024-10-15', forecastDate: '2024-10-15', actualDate: '2024-10-18', variance: 3, status: 'complete', isCritical: true },
  { id: 'm002', name: 'Structure Topped Out', plannedDate: '2025-06-30', forecastDate: '2025-07-22', actualDate: null, variance: 22, status: 'slipping', isCritical: true },
  { id: 'm003', name: 'Building Enclosed', plannedDate: '2025-09-30', forecastDate: '2025-11-15', actualDate: null, variance: 46, status: 'slipping', isCritical: true },
  { id: 'm004', name: 'MEP Rough-In Complete', plannedDate: '2026-01-31', forecastDate: '2026-03-30', actualDate: null, variance: 58, status: 'at_risk', isCritical: true },
  { id: 'm005', name: 'Interior Finishes Complete', plannedDate: '2026-05-31', forecastDate: '2026-07-15', actualDate: null, variance: 45, status: 'at_risk', isCritical: false },
  { id: 'm006', name: 'Substantial Completion', plannedDate: '2026-08-31', forecastDate: '2026-11-14', actualDate: null, variance: 75, status: 'slipping', isCritical: true }
];

const DEMO_CRITICAL_PATH = [
  { id: 'cp001', name: 'Structure Topped Out', duration: 0, earlyStart: '2025-07-22', earlyFinish: '2025-07-22', float: 0, isMilestone: true },
  { id: 'cp002', name: 'Install Curtain Wall - Levels 12-24', duration: 60, earlyStart: '2025-07-23', earlyFinish: '2025-10-21', float: -2, isMilestone: false },
  { id: 'cp003', name: 'Building Enclosed Milestone', duration: 0, earlyStart: '2025-11-15', earlyFinish: '2025-11-15', float: 0, isMilestone: true },
  { id: 'cp004', name: 'Rough-in MEP - Floors 1-8', duration: 55, earlyStart: '2025-11-17', earlyFinish: '2026-02-02', float: 0, isMilestone: false },
  { id: 'cp005', name: 'Rough-in MEP - Floors 9-16', duration: 55, earlyStart: '2026-01-15', earlyFinish: '2026-04-01', float: 0, isMilestone: false },
  { id: 'cp006', name: 'Install Chiller Plant Equipment', duration: 55, earlyStart: '2025-08-15', earlyFinish: '2025-10-30', float: 0, isMilestone: false },
  { id: 'cp007', name: 'MEP Rough-In Complete', duration: 0, earlyStart: '2026-03-30', earlyFinish: '2026-03-30', float: 0, isMilestone: true },
  { id: 'cp008', name: 'Interior Finishes - OR Suite & ICU', duration: 80, earlyStart: '2026-04-01', earlyFinish: '2026-07-20', float: 0, isMilestone: false },
  { id: 'cp009', name: 'Commissioning & Testing', duration: 30, earlyStart: '2026-07-21', earlyFinish: '2026-09-03', float: 0, isMilestone: false },
  { id: 'cp010', name: 'Substantial Completion', duration: 0, earlyStart: '2026-11-14', earlyFinish: '2026-11-14', float: 0, isMilestone: true }
];

const DEMO_COMPARISON = {
  baseline: { id: 'v7', version: 'Update 6', dataDate: '2025-09-01', overallScore: 72 },
  current: { id: 'v8', version: 'Update 7', dataDate: '2026-01-01', overallScore: 71 },
  summary: {
    finishDateMovement: 24,
    criticalPathSlip: 18,
    scoreChange: -1,
    negativeFloatDelta: 5,
    milestoneHitRateDelta: -3.2,
    activitiesAdded: 12,
    activitiesDeleted: 4,
    activitiesChanged: 87,
    logicChanges: 23
  },
  milestoneChanges: [
    { id: 'm002', name: 'Structure Topped Out', priorForecast: '2025-07-15', currentForecast: '2025-07-22', variance: 7, direction: 'slipped' },
    { id: 'm003', name: 'Building Enclosed', priorForecast: '2025-10-30', currentForecast: '2025-11-15', variance: 16, direction: 'slipped' },
    { id: 'm004', name: 'MEP Rough-In Complete', priorForecast: '2026-02-28', currentForecast: '2026-03-30', variance: 30, direction: 'slipped' },
    { id: 'm006', name: 'Substantial Completion', priorForecast: '2026-10-21', currentForecast: '2026-11-14', variance: 24, direction: 'slipped' }
  ],
  activityChanges: [
    { id: 'A1042', name: 'Install Chiller Plant Equipment', changeType: 'date_change', priorStart: '2025-07-01', newStart: '2025-08-15', priorFinish: '2025-09-15', newFinish: '2025-10-30', startVariance: 45, finishVariance: 45, floatChange: -5 },
    { id: 'A1093', name: 'Install Curtain Wall - Levels 12-16', changeType: 'date_change', priorStart: '2025-05-15', newStart: '2025-06-20', priorFinish: '2025-08-01', newFinish: '2025-09-10', startVariance: 36, finishVariance: 40, floatChange: -8 },
    { id: 'A2099', name: 'Excavation - Parking Structure', changeType: 'completed', priorStart: '2024-03-15', newStart: '2024-03-15', priorFinish: '2024-06-01', newFinish: '2024-05-28', startVariance: 0, finishVariance: -4, floatChange: 0 }
  ]
};

// Score history for trend chart
const DEMO_SCORE_HISTORY = [
  { version: 'Baseline', dataDate: '2024-03-01', overallScore: 82, logicQuality: 80, dateIntegrity: 85, constraintsFloat: 79, activityHygiene: 88, progressRealism: 84, criticalPathReliability: 80 },
  { version: 'Update 1', dataDate: '2024-06-01', overallScore: 79, logicQuality: 77, dateIntegrity: 82, constraintsFloat: 76, activityHygiene: 85, progressRealism: 79, criticalPathReliability: 77 },
  { version: 'Update 2', dataDate: '2024-09-01', overallScore: 76, logicQuality: 74, dateIntegrity: 79, constraintsFloat: 73, activityHygiene: 82, progressRealism: 76, criticalPathReliability: 74 },
  { version: 'Update 3', dataDate: '2024-12-01', overallScore: 74, logicQuality: 72, dateIntegrity: 77, constraintsFloat: 70, activityHygiene: 80, progressRealism: 74, criticalPathReliability: 72 },
  { version: 'Update 4', dataDate: '2025-03-01', overallScore: 73, logicQuality: 71, dateIntegrity: 76, constraintsFloat: 68, activityHygiene: 79, progressRealism: 73, criticalPathReliability: 70 },
  { version: 'Update 5', dataDate: '2025-06-01', overallScore: 70, logicQuality: 68, dateIntegrity: 74, constraintsFloat: 66, activityHygiene: 78, progressRealism: 71, criticalPathReliability: 68 },
  { version: 'Update 6', dataDate: '2025-09-01', overallScore: 72, logicQuality: 70, dateIntegrity: 75, constraintsFloat: 67, activityHygiene: 79, progressRealism: 72, criticalPathReliability: 70 },
  { version: 'Update 7', dataDate: '2026-01-01', overallScore: 71, logicQuality: 68, dateIntegrity: 74, constraintsFloat: 65, activityHygiene: 78, progressRealism: 71, criticalPathReliability: 69 }
];
