// scoring.js - Schedule Validation Scoring Engine (DCMA+ style, transparent)
// v2 — realistic penalty multipliers, complete rule coverage for all 6 categories

class ScoringEngine {
  constructor() {
    this.weights = {
      logicQuality: 0.25,
      dateIntegrity: 0.15,
      constraintsFloat: 0.15,
      activityHygiene: 0.15,
      progressRealism: 0.15,
      criticalPathReliability: 0.15
    };
  }

  analyze(parsedSchedule) {
    const { activities, relationships, project, milestones } = parsedSchedule;
    const actCount = activities.length;
    if (actCount === 0) return null;

    const rules = this.runAllRules(activities, relationships, project, actCount);
    const categoryScores = this.computeCategoryScores(rules);
    const overallScore = this.computeOverallScore(categoryScores);
    const rag = this.getRAG(overallScore);

    return {
      overallScore: Math.round(overallScore),
      rag,
      categoryScores,
      rules,
      activityCount: actCount,
      relationshipCount: relationships.length,
      criticalCount: activities.filter(a => a.isCritical).length,
      negativeFloatCount: activities.filter(a => a.totalFloat < 0).length,
      milestoneCount: (milestones || []).length,
      dataDate: project.dataDate
    };
  }

  runAllRules(activities, relationships, project, actCount) {
    const results = [];
    const dataDate = project.dataDate ? new Date(project.dataDate) : null;
    const relCount = relationships.length || 1;

    // Build lookup maps
    const predMap = {};
    const succMap = {};
    activities.forEach(a => { predMap[a.id] = []; succMap[a.id] = []; });
    relationships.forEach(r => {
      if (predMap[r.successorId]) predMap[r.successorId].push(r);
      if (succMap[r.predecessorId]) succMap[r.predecessorId].push(r);
    });

    // Exclude complete activities from most logic checks
    const incompleteActs = activities.filter(a => a.status !== 'TK_Complete' && !a.actualFinish);
    const incompleteCount = incompleteActs.length || 1;

    // ──────────────────────────────────────────────────────────
    // LOGIC QUALITY (weight: 25%)
    // ──────────────────────────────────────────────────────────

    // RULE 1: Missing Predecessors (DCMA: < 5%)
    const missingPred = incompleteActs.filter(a =>
      predMap[a.id] && predMap[a.id].length === 0 &&
      a.type !== 'TT_StartMile' && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const missingPredPct = missingPred.length / incompleteCount * 100;
    results.push({
      ruleKey: 'OPEN_ENDS_PREDECESSOR',
      category: 'logicQuality',
      severity: missingPredPct > 5 ? 'critical' : missingPredPct > 2 ? 'high' : 'medium',
      title: 'Activities Missing Predecessor Logic',
      count: missingPred.length,
      totalActivities: incompleteCount,
      percent: +missingPredPct.toFixed(1),
      penalty: this._pctPenalty(missingPredPct, 5, 15),
      affectedIds: missingPred.slice(0, 50).map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA)',
      description: 'Activities with no predecessor create open-end logic gaps that distort float and the critical path.',
      recommendation: 'Add logical predecessor relationships to all flagged activities to close open ends.'
    });

    // RULE 2: Missing Successors (DCMA: < 5%)
    const missingSucc = incompleteActs.filter(a =>
      succMap[a.id] && succMap[a.id].length === 0 &&
      a.type !== 'TT_FinMile' && a.type !== 'TT_Mile' && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const missingSuccPct = missingSucc.length / incompleteCount * 100;
    results.push({
      ruleKey: 'OPEN_ENDS_SUCCESSOR',
      category: 'logicQuality',
      severity: missingSuccPct > 5 ? 'critical' : missingSuccPct > 2 ? 'high' : 'medium',
      title: 'Activities Missing Successor Logic',
      count: missingSucc.length,
      totalActivities: incompleteCount,
      percent: +missingSuccPct.toFixed(1),
      penalty: this._pctPenalty(missingSuccPct, 5, 15),
      affectedIds: missingSucc.slice(0, 50).map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA)',
      description: 'Activities with no successor create dangling endpoints; float calculations become unreliable.',
      recommendation: 'Add logical successor relationships or link to a project finish milestone.'
    });

    // RULE 3: Excessive Lag (DCMA: < 5% of relationships)
    const highLagRels = relationships.filter(r => r.lag > 5);
    const highLagPct = highLagRels.length / relCount * 100;
    results.push({
      ruleKey: 'EXCESSIVE_LAG',
      category: 'logicQuality',
      severity: highLagPct > 10 ? 'high' : highLagPct > 5 ? 'medium' : 'low',
      title: 'Relationships with Excessive Lag (>5 days)',
      count: highLagRels.length,
      totalActivities: relCount,
      percent: +highLagPct.toFixed(1),
      penalty: this._pctPenalty(highLagPct, 5, 10),
      affectedIds: [],
      threshold: '< 5% of relationships (DCMA)',
      description: 'Relationships with lag may represent missing activities. Each lag should be justified.',
      recommendation: 'Replace lags with explicit activities (e.g., curing time, waiting period) where possible.'
    });

    // RULE 4: Non-FS Relationship Types (DCMA: < 10% non-FS)
    const nonFS = relationships.filter(r => r.type !== 'PR_FS');
    const nonFSPct = nonFS.length / relCount * 100;
    results.push({
      ruleKey: 'NON_FS_RELATIONSHIPS',
      category: 'logicQuality',
      severity: nonFSPct > 15 ? 'high' : nonFSPct > 10 ? 'medium' : 'low',
      title: 'Non-Finish-to-Start Relationships',
      count: nonFS.length,
      totalActivities: relCount,
      percent: +nonFSPct.toFixed(1),
      penalty: this._pctPenalty(nonFSPct, 10, 8),
      affectedIds: [],
      threshold: '< 10% of relationships (DCMA)',
      description: 'SS, FF, and SF relationships are harder to validate and can mask critical path issues.',
      recommendation: 'Prefer Finish-to-Start relationships. Review SS/FF/SF logic for correctness.'
    });

    // RULE 5: Relationship Density (ratio of relationships to activities — DCMA: 1.4 to 2.5)
    const relDensity = relationships.length / actCount;
    const densityPenalty = relDensity < 1.0 ? 20 :
                           relDensity < 1.2 ? 12 :
                           relDensity < 1.4 ? 5 :
                           relDensity > 3.0 ? 5 : 0;
    results.push({
      ruleKey: 'RELATIONSHIP_DENSITY',
      category: 'logicQuality',
      severity: relDensity < 1.2 ? 'critical' : relDensity < 1.4 ? 'high' : 'low',
      title: `Relationship Density Ratio: ${relDensity.toFixed(2)}:1`,
      count: relationships.length,
      totalActivities: actCount,
      percent: +(relDensity * 100).toFixed(0),
      penalty: densityPenalty,
      affectedIds: [],
      threshold: '1.4 to 2.5 relationships per activity (DCMA)',
      description: `The schedule has ${relDensity.toFixed(2)} relationships per activity. Low density indicates missing logic; high density may indicate over-constraining.`,
      recommendation: relDensity < 1.4 ? 'Add missing logic ties to achieve a minimum 1.4:1 ratio.' : 'Review relationship density for over-constraining.'
    });

    // ──────────────────────────────────────────────────────────
    // DATE INTEGRITY (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 6: Missing Data Date
    if (!project.dataDate) {
      results.push({
        ruleKey: 'MISSING_DATA_DATE',
        category: 'dateIntegrity',
        severity: 'critical',
        title: 'Missing or Invalid Data Date',
        count: 1,
        totalActivities: actCount,
        percent: 100,
        penalty: 30,
        affectedIds: [],
        threshold: 'Data date is required',
        description: 'Schedule has no valid data date. All status and progress analysis is invalid.',
        recommendation: 'Set the data date before exporting the XER file.'
      });
    }

    // RULE 7: Actual Dates After Data Date (should be 0)
    if (dataDate) {
      const futureActuals = activities.filter(a => {
        if (!a.actualStart && !a.actualFinish) return false;
        const as = a.actualStart ? new Date(a.actualStart) : null;
        const af = a.actualFinish ? new Date(a.actualFinish) : null;
        return (as && as > dataDate) || (af && af > dataDate);
      });
      const futurePct = futureActuals.length / actCount * 100;
      results.push({
        ruleKey: 'FUTURE_ACTUALS',
        category: 'dateIntegrity',
        severity: futureActuals.length > 0 ? 'critical' : 'low',
        title: 'Actual Dates Beyond Data Date',
        count: futureActuals.length,
        totalActivities: actCount,
        percent: +futurePct.toFixed(1),
        penalty: Math.min(20, futureActuals.length * 3),
        affectedIds: futureActuals.slice(0, 50).map(a => a.id),
        threshold: '0 activities (any future actual is an error)',
        description: 'Actual dates that fall after the data date indicate recording errors.',
        recommendation: 'Correct actual dates or move the data date forward.'
      });
    }

    // RULE 8: In-progress activities without actual start
    const inProgressNoStart = activities.filter(a =>
      a.status === 'TK_Active' && !a.actualStart && a.percentComplete > 0
    );
    results.push({
      ruleKey: 'INPROGRESS_NO_ACTUAL_START',
      category: 'dateIntegrity',
      severity: inProgressNoStart.length > 0 ? 'high' : 'low',
      title: 'In-Progress Activities Without Actual Start Date',
      count: inProgressNoStart.length,
      totalActivities: actCount,
      percent: +(inProgressNoStart.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, inProgressNoStart.length * 2),
      affectedIds: inProgressNoStart.slice(0, 50).map(a => a.id),
      threshold: '0 activities',
      description: 'Activities showing progress but lacking an actual start date indicate status reporting errors.',
      recommendation: 'Add actual start dates to all in-progress activities.'
    });

    // RULE 9: Completed activities without actual finish
    const completeNoFinish = activities.filter(a =>
      (a.status === 'TK_Complete' || a.percentComplete >= 100) && !a.actualFinish
    );
    results.push({
      ruleKey: 'COMPLETE_NO_ACTUAL_FINISH',
      category: 'dateIntegrity',
      severity: completeNoFinish.length > 0 ? 'high' : 'low',
      title: 'Completed Activities Without Actual Finish Date',
      count: completeNoFinish.length,
      totalActivities: actCount,
      percent: +(completeNoFinish.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, completeNoFinish.length * 2),
      affectedIds: completeNoFinish.slice(0, 50).map(a => a.id),
      threshold: '0 activities',
      description: 'Activities marked complete but missing actual finish dates corrupt variance analysis.',
      recommendation: 'Record actual finish dates for all completed activities.'
    });

    // ──────────────────────────────────────────────────────────
    // CONSTRAINTS & FLOAT (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 10: Negative Float (should be 0)
    const negFloat = activities.filter(a => a.totalFloat < 0 && a.status !== 'TK_Complete');
    const negFloatPct = negFloat.length / incompleteCount * 100;
    results.push({
      ruleKey: 'NEGATIVE_FLOAT',
      category: 'constraintsFloat',
      severity: negFloat.length > 0 ? 'critical' : 'low',
      title: 'Negative Float Activities',
      count: negFloat.length,
      totalActivities: incompleteCount,
      percent: +negFloatPct.toFixed(1),
      penalty: this._pctPenalty(negFloatPct, 0, 20),
      affectedIds: negFloat.slice(0, 50).map(a => a.id),
      threshold: '0 activities (any negative float is a concern)',
      description: 'Activities with negative total float indicate the schedule cannot achieve its planned dates.',
      recommendation: 'Resolve negative float by adjusting logic, durations, or constraints.'
    });

    // RULE 11: Hard Constraints (DCMA: < 5%)
    const hardConstraints = activities.filter(a =>
      ['CS_MSO', 'CS_FNLT', 'CS_MEOA', 'CS_MEOB', 'CS_MEO', 'CS_MSOOB'].includes(a.constraintType) &&
      a.status !== 'TK_Complete'
    );
    const hardConPct = hardConstraints.length / incompleteCount * 100;
    results.push({
      ruleKey: 'EXCESSIVE_CONSTRAINTS',
      category: 'constraintsFloat',
      severity: hardConPct > 5 ? 'critical' : hardConPct > 2 ? 'high' : 'medium',
      title: 'Excessive Hard Constraints',
      count: hardConstraints.length,
      totalActivities: incompleteCount,
      percent: +hardConPct.toFixed(1),
      penalty: this._pctPenalty(hardConPct, 5, 12),
      affectedIds: hardConstraints.slice(0, 50).map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA)',
      description: 'Hard constraints (MSO, FNLT, MEO) override logic-driven dates and can mask critical path issues.',
      recommendation: 'Replace hard constraints with logical predecessors or soft constraints where possible.'
    });

    // RULE 12: High Float Activities (DCMA: < 10% with TF > 44d)
    const highFloat = incompleteActs.filter(a => a.totalFloat > 44 && a.totalFloat < 9999);
    const highFloatPct = highFloat.length / incompleteCount * 100;
    results.push({
      ruleKey: 'HIGH_FLOAT',
      category: 'constraintsFloat',
      severity: highFloatPct > 15 ? 'high' : highFloatPct > 10 ? 'medium' : 'low',
      title: 'High Float Activities (>44 Working Days)',
      count: highFloat.length,
      totalActivities: incompleteCount,
      percent: +highFloatPct.toFixed(1),
      penalty: this._pctPenalty(highFloatPct, 10, 10),
      affectedIds: highFloat.slice(0, 50).map(a => a.id),
      threshold: '< 10% of incomplete activities',
      description: 'Activities with high float may indicate missing logic or disconnected schedule segments.',
      recommendation: 'Review logic ties for high-float activities; add successors or constraints if appropriate.'
    });

    // ──────────────────────────────────────────────────────────
    // ACTIVITY HYGIENE (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 13: Long Duration Activities (DCMA: < 5% with duration > 44d)
    const longDuration = incompleteActs.filter(a =>
      a.duration > 44 && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const longDurPct = longDuration.length / incompleteCount * 100;
    results.push({
      ruleKey: 'LONG_DURATION',
      category: 'activityHygiene',
      severity: longDurPct > 10 ? 'high' : longDurPct > 5 ? 'medium' : 'low',
      title: 'Long Duration Activities (>44 Working Days)',
      count: longDuration.length,
      totalActivities: incompleteCount,
      percent: +longDurPct.toFixed(1),
      penalty: this._pctPenalty(longDurPct, 5, 12),
      affectedIds: longDuration.slice(0, 50).map(a => a.id),
      threshold: '< 5% of activities (DCMA)',
      description: 'Activities longer than 44 working days reduce visibility and control accuracy.',
      recommendation: 'Break long-duration activities into shorter tasks with intermediate logic ties.'
    });

    // RULE 14: Missing Calendars
    const missingCal = activities.filter(a => !a.calendarId || a.calendarId === '');
    const missingCalPct = missingCal.length / actCount * 100;
    results.push({
      ruleKey: 'MISSING_CALENDAR',
      category: 'activityHygiene',
      severity: missingCalPct > 5 ? 'high' : missingCalPct > 0 ? 'medium' : 'low',
      title: 'Activities Missing Calendar Assignment',
      count: missingCal.length,
      totalActivities: actCount,
      percent: +missingCalPct.toFixed(1),
      penalty: this._pctPenalty(missingCalPct, 2, 10),
      affectedIds: missingCal.slice(0, 50).map(a => a.id),
      threshold: '0 activities (all should have calendars)',
      description: 'Activities without calendars use default settings which may not reflect actual work patterns.',
      recommendation: 'Assign appropriate work calendars to all activities.'
    });

    // RULE 15: LOE Activities as % of total (should be < 10%)
    const loeActivities = activities.filter(a => a.type === 'TT_LOE');
    const loePct = loeActivities.length / actCount * 100;
    results.push({
      ruleKey: 'LOE_PERCENTAGE',
      category: 'activityHygiene',
      severity: loePct > 15 ? 'high' : loePct > 10 ? 'medium' : 'low',
      title: 'Level of Effort (LOE) Activity Percentage',
      count: loeActivities.length,
      totalActivities: actCount,
      percent: +loePct.toFixed(1),
      penalty: this._pctPenalty(loePct, 10, 8),
      affectedIds: loeActivities.slice(0, 50).map(a => a.id),
      threshold: '< 10% of total activities',
      description: 'Excessive LOE activities reduce schedule granularity and obscure the critical path.',
      recommendation: 'Convert LOE summaries into discrete task-dependent activities where possible.'
    });

    // RULE 16: Zero-duration non-milestone activities
    const zeroDurNonMile = incompleteActs.filter(a =>
      a.duration === 0 && a.type !== 'TT_Mile' && a.type !== 'TT_FinMile' &&
      a.type !== 'TT_StartMile' && a.type !== 'TT_WBS' && a.type !== 'TT_LOE'
    );
    results.push({
      ruleKey: 'ZERO_DURATION_NON_MILESTONE',
      category: 'activityHygiene',
      severity: zeroDurNonMile.length > 0 ? 'medium' : 'low',
      title: 'Zero-Duration Task Activities',
      count: zeroDurNonMile.length,
      totalActivities: actCount,
      percent: +(zeroDurNonMile.length / actCount * 100).toFixed(1),
      penalty: Math.min(8, zeroDurNonMile.length * 0.5),
      affectedIds: zeroDurNonMile.slice(0, 50).map(a => a.id),
      threshold: '0 (non-milestone tasks should have duration)',
      description: 'Task activities with zero duration should be milestones or have estimated durations.',
      recommendation: 'Change activity type to milestone or assign a realistic duration.'
    });

    // ──────────────────────────────────────────────────────────
    // PROGRESS REALISM (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 17: Out-of-sequence progress (activities started before all predecessors finished)
    if (dataDate) {
      const oosActivities = incompleteActs.filter(a => {
        if (!a.actualStart) return false;
        const actStart = new Date(a.actualStart);
        // Check if any predecessor hasn't finished yet but this activity started
        const preds = predMap[a.id] || [];
        return preds.some(rel => {
          if (rel.type !== 'PR_FS') return false; // Only check FS relationships
          const predAct = activities.find(act => act.id === rel.predecessorId);
          if (!predAct) return false;
          return !predAct.actualFinish; // Predecessor not finished but this activity started
        });
      });
      const oosPct = oosActivities.length / incompleteCount * 100;
      results.push({
        ruleKey: 'OUT_OF_SEQUENCE',
        category: 'progressRealism',
        severity: oosPct > 10 ? 'critical' : oosPct > 5 ? 'high' : 'medium',
        title: 'Out-of-Sequence Progress',
        count: oosActivities.length,
        totalActivities: incompleteCount,
        percent: +oosPct.toFixed(1),
        penalty: this._pctPenalty(oosPct, 5, 15),
        affectedIds: oosActivities.slice(0, 50).map(a => a.id),
        threshold: '< 5% of activities',
        description: 'Activities that started before their FS predecessors finished indicate out-of-sequence execution.',
        recommendation: 'Update predecessor relationships or modify activity status to reflect actual workflow.'
      });
    }

    // RULE 18: Incomplete activities behind schedule (should have more progress by data date)
    if (dataDate) {
      const behindSchedule = incompleteActs.filter(a => {
        if (!a.plannedFinish || a.percentComplete >= 100) return false;
        const pf = new Date(a.plannedFinish);
        const ps = a.plannedStart ? new Date(a.plannedStart) : null;
        if (!ps || pf <= ps) return false;
        // Calculate expected progress based on data date position
        const totalDur = pf - ps;
        const elapsed = dataDate - ps;
        if (elapsed <= 0) return false; // Not started yet per plan
        const expectedPct = Math.min(100, (elapsed / totalDur) * 100);
        // Flag if actual progress is more than 20% behind expected
        return a.percentComplete < (expectedPct - 20) && expectedPct > 30;
      });
      const behindPct = behindSchedule.length / incompleteCount * 100;
      results.push({
        ruleKey: 'BEHIND_SCHEDULE',
        category: 'progressRealism',
        severity: behindPct > 15 ? 'critical' : behindPct > 5 ? 'high' : 'medium',
        title: 'Activities Behind Schedule',
        count: behindSchedule.length,
        totalActivities: incompleteCount,
        percent: +behindPct.toFixed(1),
        penalty: this._pctPenalty(behindPct, 10, 12),
        affectedIds: behindSchedule.slice(0, 50).map(a => a.id),
        threshold: '< 10% of incomplete activities',
        description: 'Activities whose actual progress significantly trails their planned timeline.',
        recommendation: 'Update remaining durations or re-sequence activities to reflect realistic progress.'
      });
    }

    // RULE 19: Activities with Actual Start but 0% Progress
    const startedNoProgress = activities.filter(a =>
      a.actualStart && !a.actualFinish && a.percentComplete === 0 && a.status !== 'TK_Complete'
    );
    results.push({
      ruleKey: 'STARTED_NO_PROGRESS',
      category: 'progressRealism',
      severity: startedNoProgress.length > 5 ? 'high' : startedNoProgress.length > 0 ? 'medium' : 'low',
      title: 'Started Activities with 0% Progress',
      count: startedNoProgress.length,
      totalActivities: actCount,
      percent: +(startedNoProgress.length / actCount * 100).toFixed(1),
      penalty: Math.min(10, startedNoProgress.length * 1.5),
      affectedIds: startedNoProgress.slice(0, 50).map(a => a.id),
      threshold: '0 activities',
      description: 'Activities that have started but show zero percent complete suggest status is not being updated.',
      recommendation: 'Update percent complete for all in-progress activities.'
    });

    // ──────────────────────────────────────────────────────────
    // CRITICAL PATH RELIABILITY (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 20: Near-Critical Density (DCMA: < 15%)
    const nearCritical = incompleteActs.filter(a => a.totalFloat >= 0 && a.totalFloat <= 15);
    const nearCritPct = nearCritical.length / incompleteCount * 100;
    results.push({
      ruleKey: 'NEAR_CRITICAL_DENSITY',
      category: 'criticalPathReliability',
      severity: nearCritPct > 25 ? 'high' : nearCritPct > 15 ? 'medium' : 'low',
      title: 'High Near-Critical Activity Count (0-15 days float)',
      count: nearCritical.length,
      totalActivities: incompleteCount,
      percent: +nearCritPct.toFixed(1),
      penalty: this._pctPenalty(nearCritPct, 15, 10),
      affectedIds: nearCritical.slice(0, 50).map(a => a.id),
      threshold: '< 15% of incomplete activities',
      description: 'A high density of near-critical activities means the schedule has limited contingency.',
      recommendation: 'Review near-critical activities for opportunities to add buffer or re-sequence work.'
    });

    // RULE 21: LOE Activities on Critical Path
    const loeCritical = activities.filter(a => a.type === 'TT_LOE' && a.isCritical);
    results.push({
      ruleKey: 'LOE_CRITICAL',
      category: 'criticalPathReliability',
      severity: loeCritical.length > 0 ? 'critical' : 'low',
      title: 'Level of Effort Activities on Critical Path',
      count: loeCritical.length,
      totalActivities: actCount,
      percent: +(loeCritical.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, loeCritical.length * 3),
      affectedIds: loeCritical.map(a => a.id),
      threshold: '0 activities (LOE must not drive CP)',
      description: 'LOE activities on the critical path distort schedule logic and float calculations.',
      recommendation: 'Remove LOE activities from the critical path by restructuring relationships.'
    });

    // RULE 22: Critical path length index — ratio of critical activities
    const criticalActs = incompleteActs.filter(a => a.isCritical);
    const critPct = criticalActs.length / incompleteCount * 100;
    const critPenalty = critPct > 30 ? 10 : critPct > 20 ? 5 : critPct < 2 ? 8 : 0;
    results.push({
      ruleKey: 'CRITICAL_RATIO',
      category: 'criticalPathReliability',
      severity: critPct > 30 || critPct < 2 ? 'high' : 'low',
      title: `Critical Activity Ratio: ${critPct.toFixed(1)}%`,
      count: criticalActs.length,
      totalActivities: incompleteCount,
      percent: +critPct.toFixed(1),
      penalty: critPenalty,
      affectedIds: criticalActs.slice(0, 50).map(a => a.id),
      threshold: '5-20% of activities typically on critical path',
      description: critPct > 30
        ? 'An unusually high percentage of critical activities suggests over-constrained logic.'
        : critPct < 2
          ? 'Very few critical activities may indicate logic gaps or disconnected schedule segments.'
          : 'Critical activity ratio is within expected range.',
      recommendation: critPct > 30
        ? 'Review logic for over-constraining; reduce hard constraints.'
        : critPct < 2
          ? 'Review schedule logic for completeness; ensure all paths connect to project milestones.'
          : 'No action required.'
    });

    return results;
  }

  // Penalty calculator: scales linearly past threshold up to maxPenalty
  // At threshold: 0 penalty. At 2x threshold: ~maxPenalty. Below threshold: reduced penalty.
  _pctPenalty(actualPct, thresholdPct, maxPenalty) {
    if (actualPct <= 0) return 0;
    if (thresholdPct <= 0) {
      // Zero-threshold rule (any occurrence is bad)
      return Math.min(maxPenalty, actualPct * (maxPenalty / 10));
    }
    if (actualPct <= thresholdPct) {
      // Below threshold — passes DCMA check, no penalty
      return 0;
    }
    // Above threshold — significant penalty scaling toward max
    const excess = (actualPct - thresholdPct) / thresholdPct;
    return Math.min(maxPenalty, maxPenalty * 0.3 + excess * maxPenalty * 0.7);
  }

  computeCategoryScores(rules) {
    const categories = {
      logicQuality: { label: 'Logic Quality', weight: this.weights.logicQuality, penalty: 0, maxPenalty: 60 },
      dateIntegrity: { label: 'Date Integrity', weight: this.weights.dateIntegrity, penalty: 0, maxPenalty: 50 },
      constraintsFloat: { label: 'Constraints & Float', weight: this.weights.constraintsFloat, penalty: 0, maxPenalty: 50 },
      activityHygiene: { label: 'Activity Hygiene', weight: this.weights.activityHygiene, penalty: 0, maxPenalty: 40 },
      progressRealism: { label: 'Progress Realism', weight: this.weights.progressRealism, penalty: 0, maxPenalty: 50 },
      criticalPathReliability: { label: 'Critical Path Reliability', weight: this.weights.criticalPathReliability, penalty: 0, maxPenalty: 45 }
    };

    rules.forEach(rule => {
      if (categories[rule.category]) {
        categories[rule.category].penalty += rule.penalty;
      }
    });

    Object.keys(categories).forEach(cat => {
      const c = categories[cat];
      c.penalty = Math.min(c.penalty, c.maxPenalty);
      c.score = Math.max(0, Math.round(100 - c.penalty));
      c.rag = this.getRAG(c.score);
    });

    return categories;
  }

  computeOverallScore(categoryScores) {
    return Object.values(categoryScores).reduce((sum, c) => sum + c.score * c.weight, 0);
  }

  getRAG(score) {
    if (score >= 85) return 'green';
    if (score >= 70) return 'amber';
    return 'red';
  }
}

window.ScoringEngine = ScoringEngine;
