// scoring.js - Schedule Validation Scoring Engine
// v3 — DCMA-14 aligned, with explicit pass/fail tracking against the
// industry gold standard. References: DCMA 14-Point Assessment, GAO
// Schedule Assessment Guide (GAO-16-89G), AACE RP 89R-16.
//
// Each rule is tagged with its DCMA point (1-14) where applicable, and
// the analysis output includes a dcmaCompliance summary that reports
// pass/fail against every DCMA test — the same scoreboard a forensic
// scheduler or claims consultant would expect to see.

class ScoringEngine {
  constructor() {
    this.weights = {
      logicQuality: 0.25,
      dateIntegrity: 0.15,
      constraintsFloat: 0.15,
      activityHygiene: 0.10,
      progressRealism: 0.15,
      criticalPathReliability: 0.20
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
    const dcmaCompliance = this.computeDCMACompliance(rules, activities, relationships, project);

    return {
      overallScore: Math.round(overallScore),
      rag,
      categoryScores,
      rules,
      dcmaCompliance,
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

    // RULE 1: Missing Predecessors (DCMA #1: Logic — < 5%)
    const missingPred = incompleteActs.filter(a =>
      predMap[a.id] && predMap[a.id].length === 0 &&
      a.type !== 'TT_StartMile' && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const missingPredPct = missingPred.length / incompleteCount * 100;
    results.push({
      ruleKey: 'OPEN_ENDS_PREDECESSOR',
      dcmaPoint: 1, source: 'DCMA',
      category: 'logicQuality',
      severity: missingPredPct > 5 ? 'critical' : missingPredPct > 2 ? 'high' : 'medium',
      title: 'Activities Missing Predecessor Logic',
      count: missingPred.length,
      totalActivities: incompleteCount,
      percent: +missingPredPct.toFixed(1),
      penalty: this._pctPenalty(missingPredPct, 5, 15),
      affectedIds: missingPred.map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA #1)',
      pass: missingPredPct < 5,
      description: 'Activities with no predecessor create open-end logic gaps that distort float and the critical path.',
      recommendation: 'Add logical predecessor relationships to all flagged activities to close open ends.'
    });

    // RULE 2: Missing Successors (DCMA #1: Logic — < 5%)
    const missingSucc = incompleteActs.filter(a =>
      succMap[a.id] && succMap[a.id].length === 0 &&
      a.type !== 'TT_FinMile' && a.type !== 'TT_Mile' && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const missingSuccPct = missingSucc.length / incompleteCount * 100;
    results.push({
      ruleKey: 'OPEN_ENDS_SUCCESSOR',
      dcmaPoint: 1, source: 'DCMA',
      category: 'logicQuality',
      severity: missingSuccPct > 5 ? 'critical' : missingSuccPct > 2 ? 'high' : 'medium',
      title: 'Activities Missing Successor Logic',
      count: missingSucc.length,
      totalActivities: incompleteCount,
      percent: +missingSuccPct.toFixed(1),
      penalty: this._pctPenalty(missingSuccPct, 5, 15),
      affectedIds: missingSucc.map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA #1)',
      pass: missingSuccPct < 5,
      description: 'Activities with no successor create dangling endpoints; float calculations become unreliable.',
      recommendation: 'Add logical successor relationships or link to a project finish milestone.'
    });

    // RULE 3: Leads / Negative Lag (DCMA #2: Leads — must be 0)
    const leads = relationships.filter(r => r.lag < 0);
    const leadsPct = leads.length / relCount * 100;
    results.push({
      ruleKey: 'NEGATIVE_LAG_LEADS',
      dcmaPoint: 2, source: 'DCMA',
      category: 'logicQuality',
      severity: leads.length > 0 ? 'critical' : 'low',
      title: 'Leads (Negative Lag Relationships)',
      count: leads.length,
      totalActivities: relCount,
      percent: +leadsPct.toFixed(2),
      penalty: leads.length > 0 ? Math.min(20, 6 + leadsPct * 2) : 0,
      affectedIds: [],
      threshold: '0 relationships (DCMA #2 — leads not allowed)',
      pass: leads.length === 0,
      description: 'Negative lag (leads) compresses logic and is rejected by DCMA. They distort float calculations and can hide late finishes.',
      recommendation: 'Convert leads to FS+0 relationships with explicit predecessor splits. Document any unavoidable concurrent work as SS relationships.'
    });

    // RULE 4: Lags (DCMA #3: Lags — < 5%)
    const positiveLagRels = relationships.filter(r => r.lag > 0);
    const lagPct = positiveLagRels.length / relCount * 100;
    results.push({
      ruleKey: 'EXCESSIVE_LAG',
      dcmaPoint: 3, source: 'DCMA',
      category: 'logicQuality',
      severity: lagPct > 10 ? 'high' : lagPct > 5 ? 'medium' : 'low',
      title: 'Relationships with Positive Lag',
      count: positiveLagRels.length,
      totalActivities: relCount,
      percent: +lagPct.toFixed(1),
      penalty: this._pctPenalty(lagPct, 5, 10),
      affectedIds: [],
      threshold: '< 5% of relationships (DCMA #3)',
      pass: lagPct < 5,
      description: 'Lags often substitute for missing activities (cure time, procurement, inspection). Each lag should be justified or replaced.',
      recommendation: 'Replace lags with explicit activities representing the elapsed work or wait. Document lags that remain.'
    });

    // RULE 5: Non-FS Relationship Types (DCMA #4: Relationship Types — ≥ 90% FS)
    const nonFS = relationships.filter(r => r.type !== 'PR_FS');
    const nonFSPct = nonFS.length / relCount * 100;
    results.push({
      ruleKey: 'NON_FS_RELATIONSHIPS',
      dcmaPoint: 4, source: 'DCMA',
      category: 'logicQuality',
      severity: nonFSPct > 15 ? 'high' : nonFSPct > 10 ? 'medium' : 'low',
      title: 'Non Finish-to-Start Relationships',
      count: nonFS.length,
      totalActivities: relCount,
      percent: +nonFSPct.toFixed(1),
      penalty: this._pctPenalty(nonFSPct, 10, 8),
      affectedIds: [],
      threshold: '< 10% non-FS / ≥ 90% FS (DCMA #4)',
      pass: nonFSPct < 10,
      description: 'SS, FF, and SF relationships are harder to validate and can mask critical path issues. DCMA expects FS to dominate.',
      recommendation: 'Convert SS/FF relationships to FS where possible; review SF relationships (rare and usually incorrect).'
    });

    // RULE 6: Relationship Density (Industry — 1.4 to 2.5 rels/activity)
    const relDensity = relationships.length / actCount;
    const densityPenalty = relDensity < 1.0 ? 20 :
                           relDensity < 1.2 ? 12 :
                           relDensity < 1.4 ? 5 :
                           relDensity > 3.0 ? 5 : 0;
    results.push({
      ruleKey: 'RELATIONSHIP_DENSITY',
      dcmaPoint: null, source: 'AACE',
      category: 'logicQuality',
      severity: relDensity < 1.2 ? 'critical' : relDensity < 1.4 ? 'high' : 'low',
      title: `Relationship Density Ratio: ${relDensity.toFixed(2)}:1`,
      count: relationships.length,
      totalActivities: actCount,
      percent: +(relDensity * 100).toFixed(0),
      penalty: densityPenalty,
      affectedIds: [],
      threshold: '1.4 to 2.5 relationships per activity (AACE RP 89R-16)',
      pass: relDensity >= 1.4 && relDensity <= 3.0,
      description: `The schedule has ${relDensity.toFixed(2)} relationships per activity. Low density indicates missing logic; high density may indicate over-constraining.`,
      recommendation: relDensity < 1.4 ? 'Add missing logic ties to achieve a minimum 1.4:1 ratio.' : 'Review relationship density for over-constraining.'
    });

    // ──────────────────────────────────────────────────────────
    // DATE INTEGRITY (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 7: Missing Data Date
    if (!project.dataDate) {
      results.push({
        ruleKey: 'MISSING_DATA_DATE',
        dcmaPoint: 9, source: 'DCMA',
        category: 'dateIntegrity',
        severity: 'critical',
        title: 'Missing or Invalid Data Date',
        count: 1,
        totalActivities: actCount,
        percent: 100,
        penalty: 30,
        affectedIds: [],
        threshold: 'Data date is required',
        pass: false,
        description: 'Schedule has no valid data date. All status and progress analysis is invalid.',
        recommendation: 'Set the data date before exporting the XER file.'
      });
    }

    // RULE 8: Actual Dates After Data Date (DCMA #9: Invalid Dates)
    let invalidActuals = 0;
    if (dataDate) {
      const futureActuals = activities.filter(a => {
        if (!a.actualStart && !a.actualFinish) return false;
        const as = a.actualStart ? new Date(a.actualStart) : null;
        const af = a.actualFinish ? new Date(a.actualFinish) : null;
        return (as && as > dataDate) || (af && af > dataDate);
      });
      invalidActuals = futureActuals.length;
      const futurePct = futureActuals.length / actCount * 100;
      results.push({
        ruleKey: 'FUTURE_ACTUALS',
        dcmaPoint: 9, source: 'DCMA',
        category: 'dateIntegrity',
        severity: futureActuals.length > 0 ? 'critical' : 'low',
        title: 'Actual Dates Beyond Data Date',
        count: futureActuals.length,
        totalActivities: actCount,
        percent: +futurePct.toFixed(1),
        penalty: Math.min(20, futureActuals.length * 3),
        affectedIds: futureActuals.map(a => a.id),
        threshold: '0 activities (DCMA #9 — invalid dates)',
        pass: futureActuals.length === 0,
        description: 'Actual dates that fall after the data date are physically impossible and indicate recording errors.',
        recommendation: 'Correct actual dates or move the data date forward.'
      });
    }

    // RULE 8b: Forecast (early) dates earlier than data date (DCMA #9: Invalid Dates)
    let invalidForecasts = 0;
    if (dataDate) {
      const pastForecasts = incompleteActs.filter(a => {
        if (!a.earlyStart) return false;
        const es = new Date(a.earlyStart);
        // Forecast for un-started activity should not be in the past
        if (a.actualStart) return false;
        return es < dataDate;
      });
      invalidForecasts = pastForecasts.length;
      const pfPct = pastForecasts.length / incompleteCount * 100;
      results.push({
        ruleKey: 'INVALID_FORECAST_DATES',
        dcmaPoint: 9, source: 'DCMA',
        category: 'dateIntegrity',
        severity: pastForecasts.length > 0 ? 'high' : 'low',
        title: 'Forecast Dates Before Data Date',
        count: pastForecasts.length,
        totalActivities: incompleteCount,
        percent: +pfPct.toFixed(1),
        penalty: Math.min(15, pastForecasts.length * 1.5),
        affectedIds: pastForecasts.map(a => a.id),
        threshold: '0 activities (DCMA #9)',
        pass: pastForecasts.length === 0,
        description: 'Un-started activities with forecast (early) dates earlier than the data date are invalid — work cannot be scheduled in the past.',
        recommendation: 'Re-run the schedule (F9 in P6) so forecast dates roll forward to the data date.'
      });
    }

    // RULE 9: In-progress activities without actual start
    const inProgressNoStart = activities.filter(a =>
      a.status === 'TK_Active' && !a.actualStart && a.percentComplete > 0
    );
    results.push({
      ruleKey: 'INPROGRESS_NO_ACTUAL_START',
      dcmaPoint: null, source: 'GAO',
      category: 'dateIntegrity',
      severity: inProgressNoStart.length > 0 ? 'high' : 'low',
      title: 'In-Progress Activities Without Actual Start Date',
      count: inProgressNoStart.length,
      totalActivities: actCount,
      percent: +(inProgressNoStart.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, inProgressNoStart.length * 2),
      affectedIds: inProgressNoStart.map(a => a.id),
      threshold: '0 activities',
      pass: inProgressNoStart.length === 0,
      description: 'Activities showing progress but lacking an actual start date indicate status reporting errors.',
      recommendation: 'Add actual start dates to all in-progress activities.'
    });

    // RULE 10: Completed activities without actual finish
    const completeNoFinish = activities.filter(a =>
      (a.status === 'TK_Complete' || a.percentComplete >= 100) && !a.actualFinish
    );
    results.push({
      ruleKey: 'COMPLETE_NO_ACTUAL_FINISH',
      dcmaPoint: null, source: 'GAO',
      category: 'dateIntegrity',
      severity: completeNoFinish.length > 0 ? 'high' : 'low',
      title: 'Completed Activities Without Actual Finish Date',
      count: completeNoFinish.length,
      totalActivities: actCount,
      percent: +(completeNoFinish.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, completeNoFinish.length * 2),
      affectedIds: completeNoFinish.map(a => a.id),
      threshold: '0 activities',
      pass: completeNoFinish.length === 0,
      description: 'Activities marked complete but missing actual finish dates corrupt variance analysis.',
      recommendation: 'Record actual finish dates for all completed activities.'
    });

    // ──────────────────────────────────────────────────────────
    // CONSTRAINTS & FLOAT (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 11: Negative Float (DCMA #7 — must be 0)
    const negFloat = activities.filter(a => a.totalFloat < 0 && a.status !== 'TK_Complete');
    const negFloatPct = negFloat.length / incompleteCount * 100;
    results.push({
      ruleKey: 'NEGATIVE_FLOAT',
      dcmaPoint: 7, source: 'DCMA',
      category: 'constraintsFloat',
      severity: negFloat.length > 0 ? 'critical' : 'low',
      title: 'Negative Float Activities',
      count: negFloat.length,
      totalActivities: incompleteCount,
      percent: +negFloatPct.toFixed(1),
      penalty: this._pctPenalty(negFloatPct, 0, 20),
      affectedIds: negFloat.map(a => a.id),
      threshold: '0 activities (DCMA #7 — any negative float fails)',
      pass: negFloat.length === 0,
      description: 'Activities with negative total float indicate the schedule cannot achieve its planned dates without acceleration.',
      recommendation: 'Resolve negative float by adjusting logic, durations, or constraints. Investigate any FNLT constraints driving the negative float.'
    });

    // RULE 12: Hard Constraints (DCMA #5 — < 5%)
    const hardConstraintTypes = ['CS_MSO', 'CS_FNLT', 'CS_MEOA', 'CS_MEOB', 'CS_MEO', 'CS_MSOOB', 'CS_MANDFIN', 'CS_MANDSTART'];
    const hardConstraints = activities.filter(a =>
      hardConstraintTypes.includes(a.constraintType) && a.status !== 'TK_Complete'
    );
    const hardConPct = hardConstraints.length / incompleteCount * 100;
    results.push({
      ruleKey: 'EXCESSIVE_CONSTRAINTS',
      dcmaPoint: 5, source: 'DCMA',
      category: 'constraintsFloat',
      severity: hardConPct > 5 ? 'critical' : hardConPct > 2 ? 'high' : 'medium',
      title: 'Excessive Hard Constraints',
      count: hardConstraints.length,
      totalActivities: incompleteCount,
      percent: +hardConPct.toFixed(1),
      penalty: this._pctPenalty(hardConPct, 5, 12),
      affectedIds: hardConstraints.map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA #5)',
      pass: hardConPct < 5,
      description: 'Hard constraints (Must Start On, Finish No Later Than, Must Finish On) override schedule logic and can mask critical path issues.',
      recommendation: 'Replace hard constraints with logical predecessors or soft constraints (SNET, FNET) where possible. Reserve hard constraints for contractual milestones.'
    });

    // RULE 13: High Float (DCMA #6 — < 5% with TF > 44d)
    const highFloat = incompleteActs.filter(a => a.totalFloat > 44 && a.totalFloat < 9999);
    const highFloatPct = highFloat.length / incompleteCount * 100;
    results.push({
      ruleKey: 'HIGH_FLOAT',
      dcmaPoint: 6, source: 'DCMA',
      category: 'constraintsFloat',
      severity: highFloatPct > 15 ? 'high' : highFloatPct > 5 ? 'medium' : 'low',
      title: 'High Float Activities (>44 Working Days)',
      count: highFloat.length,
      totalActivities: incompleteCount,
      percent: +highFloatPct.toFixed(1),
      penalty: this._pctPenalty(highFloatPct, 5, 10),
      affectedIds: highFloat.map(a => a.id),
      threshold: '< 5% of incomplete activities (DCMA #6)',
      pass: highFloatPct < 5,
      description: 'Activities with high float (>44d) may indicate missing logic or disconnected schedule segments.',
      recommendation: 'Review logic ties for high-float activities; add successors or constraints if appropriate.'
    });

    // ──────────────────────────────────────────────────────────
    // ACTIVITY HYGIENE (weight: 10%)
    // ──────────────────────────────────────────────────────────

    // RULE 14: Long Duration (DCMA #8 — < 5% with duration > 44d)
    const longDuration = incompleteActs.filter(a =>
      a.duration > 44 && a.type !== 'TT_LOE' && a.type !== 'TT_WBS'
    );
    const longDurPct = longDuration.length / incompleteCount * 100;
    results.push({
      ruleKey: 'LONG_DURATION',
      dcmaPoint: 8, source: 'DCMA',
      category: 'activityHygiene',
      severity: longDurPct > 10 ? 'high' : longDurPct > 5 ? 'medium' : 'low',
      title: 'Long Duration Activities (>44 Working Days)',
      count: longDuration.length,
      totalActivities: incompleteCount,
      percent: +longDurPct.toFixed(1),
      penalty: this._pctPenalty(longDurPct, 5, 12),
      affectedIds: longDuration.map(a => a.id),
      threshold: '< 5% of activities (DCMA #8)',
      pass: longDurPct < 5,
      description: 'Activities longer than 44 working days reduce visibility and progress measurement accuracy.',
      recommendation: 'Break long-duration activities into shorter tasks with intermediate logic ties.'
    });

    // RULE 15: Missing Calendars
    const missingCal = activities.filter(a => !a.calendarId || a.calendarId === '');
    const missingCalPct = missingCal.length / actCount * 100;
    results.push({
      ruleKey: 'MISSING_CALENDAR',
      dcmaPoint: null, source: 'GAO',
      category: 'activityHygiene',
      severity: missingCalPct > 5 ? 'high' : missingCalPct > 0 ? 'medium' : 'low',
      title: 'Activities Missing Calendar Assignment',
      count: missingCal.length,
      totalActivities: actCount,
      percent: +missingCalPct.toFixed(1),
      penalty: this._pctPenalty(missingCalPct, 2, 10),
      affectedIds: missingCal.map(a => a.id),
      threshold: '0 activities (all should have calendars)',
      pass: missingCalPct === 0,
      description: 'Activities without calendars use default settings which may not reflect actual work patterns.',
      recommendation: 'Assign appropriate work calendars to all activities.'
    });

    // RULE 16: LOE Activity %
    const loeActivities = activities.filter(a => a.type === 'TT_LOE');
    const loePct = loeActivities.length / actCount * 100;
    results.push({
      ruleKey: 'LOE_PERCENTAGE',
      dcmaPoint: null, source: 'AACE',
      category: 'activityHygiene',
      severity: loePct > 15 ? 'high' : loePct > 10 ? 'medium' : 'low',
      title: 'Level of Effort (LOE) Activity Percentage',
      count: loeActivities.length,
      totalActivities: actCount,
      percent: +loePct.toFixed(1),
      penalty: this._pctPenalty(loePct, 10, 8),
      affectedIds: loeActivities.map(a => a.id),
      threshold: '< 10% of total activities',
      pass: loePct < 10,
      description: 'Excessive LOE activities reduce schedule granularity and obscure the critical path.',
      recommendation: 'Convert LOE summaries into discrete task-dependent activities where possible.'
    });

    // RULE 17: Zero-duration non-milestone activities
    const zeroDurNonMile = incompleteActs.filter(a =>
      a.duration === 0 && a.type !== 'TT_Mile' && a.type !== 'TT_FinMile' &&
      a.type !== 'TT_StartMile' && a.type !== 'TT_WBS' && a.type !== 'TT_LOE'
    );
    results.push({
      ruleKey: 'ZERO_DURATION_NON_MILESTONE',
      dcmaPoint: null, source: 'GAO',
      category: 'activityHygiene',
      severity: zeroDurNonMile.length > 0 ? 'medium' : 'low',
      title: 'Zero-Duration Task Activities',
      count: zeroDurNonMile.length,
      totalActivities: actCount,
      percent: +(zeroDurNonMile.length / actCount * 100).toFixed(1),
      penalty: Math.min(8, zeroDurNonMile.length * 0.5),
      affectedIds: zeroDurNonMile.map(a => a.id),
      threshold: '0 (non-milestone tasks should have duration)',
      pass: zeroDurNonMile.length === 0,
      description: 'Task activities with zero duration should be milestones or have estimated durations.',
      recommendation: 'Change activity type to milestone or assign a realistic duration.'
    });

    // ──────────────────────────────────────────────────────────
    // PROGRESS REALISM (weight: 15%)
    // ──────────────────────────────────────────────────────────

    // RULE 18: Out-of-sequence progress
    if (dataDate) {
      const oosActivities = incompleteActs.filter(a => {
        if (!a.actualStart) return false;
        const preds = predMap[a.id] || [];
        return preds.some(rel => {
          if (rel.type !== 'PR_FS') return false;
          const predAct = activities.find(act => act.id === rel.predecessorId);
          if (!predAct) return false;
          return !predAct.actualFinish;
        });
      });
      const oosPct = oosActivities.length / incompleteCount * 100;
      results.push({
        ruleKey: 'OUT_OF_SEQUENCE',
        dcmaPoint: null, source: 'GAO',
        category: 'progressRealism',
        severity: oosPct > 10 ? 'critical' : oosPct > 5 ? 'high' : 'medium',
        title: 'Out-of-Sequence Progress',
        count: oosActivities.length,
        totalActivities: incompleteCount,
        percent: +oosPct.toFixed(1),
        penalty: this._pctPenalty(oosPct, 5, 15),
        affectedIds: oosActivities.map(a => a.id),
        threshold: '< 5% of activities (GAO best practice)',
        pass: oosPct < 5,
        description: 'Activities that started before their FS predecessors finished indicate out-of-sequence execution and unreliable logic.',
        recommendation: 'Update predecessor relationships or modify activity status to reflect actual workflow.'
      });
    }

    // RULE 19: Behind Schedule (proxy for DCMA #11 Missed Tasks when no baseline)
    if (dataDate) {
      const behindSchedule = incompleteActs.filter(a => {
        if (!a.plannedFinish || a.percentComplete >= 100) return false;
        const pf = new Date(a.plannedFinish);
        const ps = a.plannedStart ? new Date(a.plannedStart) : null;
        if (!ps || pf <= ps) return false;
        const totalDur = pf - ps;
        const elapsed = dataDate - ps;
        if (elapsed <= 0) return false;
        const expectedPct = Math.min(100, (elapsed / totalDur) * 100);
        return a.percentComplete < (expectedPct - 20) && expectedPct > 30;
      });
      const behindPct = behindSchedule.length / incompleteCount * 100;
      results.push({
        ruleKey: 'BEHIND_SCHEDULE',
        dcmaPoint: 11, source: 'DCMA',
        category: 'progressRealism',
        severity: behindPct > 15 ? 'critical' : behindPct > 5 ? 'high' : 'medium',
        title: 'Activities Behind Plan (Missed Tasks Proxy)',
        count: behindSchedule.length,
        totalActivities: incompleteCount,
        percent: +behindPct.toFixed(1),
        penalty: this._pctPenalty(behindPct, 5, 12),
        affectedIds: behindSchedule.map(a => a.id),
        threshold: '< 5% of incomplete activities (DCMA #11 proxy)',
        pass: behindPct < 5,
        description: 'Activities whose actual progress significantly trails their planned timeline. Proxy for DCMA Missed Tasks (full check requires baseline).',
        recommendation: 'Update remaining durations or re-sequence activities to reflect realistic progress. For full DCMA #11 compliance, attach a baseline schedule.'
      });
    }

    // RULE 20: Started but no progress
    const startedNoProgress = activities.filter(a =>
      a.actualStart && !a.actualFinish && a.percentComplete === 0 && a.status !== 'TK_Complete'
    );
    results.push({
      ruleKey: 'STARTED_NO_PROGRESS',
      dcmaPoint: null, source: 'GAO',
      category: 'progressRealism',
      severity: startedNoProgress.length > 5 ? 'high' : startedNoProgress.length > 0 ? 'medium' : 'low',
      title: 'Started Activities with 0% Progress',
      count: startedNoProgress.length,
      totalActivities: actCount,
      percent: +(startedNoProgress.length / actCount * 100).toFixed(1),
      penalty: Math.min(10, startedNoProgress.length * 1.5),
      affectedIds: startedNoProgress.map(a => a.id),
      threshold: '0 activities',
      pass: startedNoProgress.length === 0,
      description: 'Activities that have started but show zero percent complete suggest status is not being updated.',
      recommendation: 'Update percent complete for all in-progress activities.'
    });

    // ──────────────────────────────────────────────────────────
    // CRITICAL PATH RELIABILITY (weight: 20%)
    // ──────────────────────────────────────────────────────────

    // RULE 21: Near-Critical Density
    const nearCritical = incompleteActs.filter(a => a.totalFloat >= 0 && a.totalFloat <= 15);
    const nearCritPct = nearCritical.length / incompleteCount * 100;
    results.push({
      ruleKey: 'NEAR_CRITICAL_DENSITY',
      dcmaPoint: null, source: 'AACE',
      category: 'criticalPathReliability',
      severity: nearCritPct > 25 ? 'high' : nearCritPct > 15 ? 'medium' : 'low',
      title: 'High Near-Critical Activity Count (0-15 days float)',
      count: nearCritical.length,
      totalActivities: incompleteCount,
      percent: +nearCritPct.toFixed(1),
      penalty: this._pctPenalty(nearCritPct, 15, 10),
      affectedIds: nearCritical.map(a => a.id),
      threshold: '< 15% of incomplete activities',
      pass: nearCritPct < 15,
      description: 'A high density of near-critical activities means the schedule has limited contingency.',
      recommendation: 'Review near-critical activities for opportunities to add buffer or re-sequence work.'
    });

    // RULE 22: LOE Activities on Critical Path
    const loeCritical = activities.filter(a => a.type === 'TT_LOE' && a.isCritical);
    results.push({
      ruleKey: 'LOE_CRITICAL',
      dcmaPoint: null, source: 'AACE',
      category: 'criticalPathReliability',
      severity: loeCritical.length > 0 ? 'critical' : 'low',
      title: 'Level of Effort Activities on Critical Path',
      count: loeCritical.length,
      totalActivities: actCount,
      percent: +(loeCritical.length / actCount * 100).toFixed(1),
      penalty: Math.min(15, loeCritical.length * 3),
      affectedIds: loeCritical.map(a => a.id),
      threshold: '0 activities (LOE must not drive CP)',
      pass: loeCritical.length === 0,
      description: 'LOE activities on the critical path distort schedule logic and float calculations.',
      recommendation: 'Remove LOE activities from the critical path by restructuring relationships.'
    });

    // RULE 23: Critical Path Length Index (DCMA #13 — CPLI ≥ 0.95)
    let cpli = null;
    if (project.plannedFinish && dataDate) {
      const baselineFinish = new Date(project.plannedFinish);
      // Forecast finish = max early finish across remaining activities
      const remainingFinishes = incompleteActs
        .map(a => a.earlyFinish ? new Date(a.earlyFinish) : null)
        .filter(d => d && !isNaN(d.getTime()));
      if (remainingFinishes.length > 0 && !isNaN(baselineFinish.getTime())) {
        const forecastFinish = new Date(Math.max(...remainingFinishes));
        const dur = (baselineFinish - dataDate) / 86400000;
        const fcDur = (forecastFinish - dataDate) / 86400000;
        if (fcDur > 0) {
          cpli = +(dur / fcDur).toFixed(3);
        }
      }
    }
    if (cpli !== null) {
      const cpliPenalty = cpli >= 0.95 ? 0 : cpli >= 0.85 ? 8 : cpli >= 0.70 ? 15 : 22;
      results.push({
        ruleKey: 'CPLI',
        dcmaPoint: 13, source: 'DCMA',
        category: 'criticalPathReliability',
        severity: cpli < 0.85 ? 'critical' : cpli < 0.95 ? 'high' : 'low',
        title: `Critical Path Length Index: ${cpli.toFixed(2)}`,
        count: 1,
        totalActivities: 1,
        percent: +(cpli * 100).toFixed(1),
        penalty: cpliPenalty,
        affectedIds: [],
        threshold: 'CPLI ≥ 0.95 (DCMA #13)',
        pass: cpli >= 0.95,
        description: `CPLI = ${cpli.toFixed(3)}. Measures schedule efficiency: ratio of remaining critical path duration to remaining baseline duration. Below 0.95 means the schedule has lost efficiency.`,
        recommendation: cpli < 0.95 ? 'The schedule is forecasting late. Investigate critical path activities for compression opportunities or escalate as a recovery item.' : 'Schedule efficiency is healthy.'
      });
    }

    // RULE 24: Critical Activity Ratio
    const criticalActs = incompleteActs.filter(a => a.isCritical);
    const critPct = criticalActs.length / incompleteCount * 100;
    const critPenalty = critPct > 30 ? 10 : critPct > 20 ? 5 : critPct < 2 ? 8 : 0;
    results.push({
      ruleKey: 'CRITICAL_RATIO',
      dcmaPoint: null, source: 'AACE',
      category: 'criticalPathReliability',
      severity: critPct > 30 || critPct < 2 ? 'high' : 'low',
      title: `Critical Activity Ratio: ${critPct.toFixed(1)}%`,
      count: criticalActs.length,
      totalActivities: incompleteCount,
      percent: +critPct.toFixed(1),
      penalty: critPenalty,
      affectedIds: criticalActs.map(a => a.id),
      threshold: '5-20% of activities typically on critical path',
      pass: critPct >= 2 && critPct <= 30,
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

  // DCMA-14 compliance scoreboard — what claims consultants and auditors expect
  computeDCMACompliance(rules, activities, relationships, project) {
    const ruleByPoint = {};
    rules.forEach(r => {
      if (r.dcmaPoint) {
        // Take worst result for each point (lowest pass)
        if (!ruleByPoint[r.dcmaPoint] || (ruleByPoint[r.dcmaPoint].pass && !r.pass)) {
          ruleByPoint[r.dcmaPoint] = r;
        }
      }
    });

    const dcma14 = [
      { point: 1,  name: 'Logic',                tested: true,  rule: ruleByPoint[1] },
      { point: 2,  name: 'Leads (Negative Lag)', tested: true,  rule: ruleByPoint[2] },
      { point: 3,  name: 'Lags',                 tested: true,  rule: ruleByPoint[3] },
      { point: 4,  name: 'Relationship Types',   tested: true,  rule: ruleByPoint[4] },
      { point: 5,  name: 'Hard Constraints',     tested: true,  rule: ruleByPoint[5] },
      { point: 6,  name: 'High Float',           tested: true,  rule: ruleByPoint[6] },
      { point: 7,  name: 'Negative Float',       tested: true,  rule: ruleByPoint[7] },
      { point: 8,  name: 'High Duration',        tested: true,  rule: ruleByPoint[8] },
      { point: 9,  name: 'Invalid Dates',        tested: true,  rule: ruleByPoint[9] },
      { point: 10, name: 'Resources',            tested: false, note: 'Resource loading not parsed in this version' },
      { point: 11, name: 'Missed Tasks',         tested: true,  rule: ruleByPoint[11], note: 'Computed as proxy without baseline' },
      { point: 12, name: 'Critical Path Test',   tested: false, note: 'Requires what-if simulation; manual check' },
      { point: 13, name: 'Critical Path Length Index', tested: !!ruleByPoint[13], rule: ruleByPoint[13], note: ruleByPoint[13] ? null : 'Requires baseline finish date' },
      { point: 14, name: 'Baseline Execution Index',   tested: false, note: 'Requires baseline schedule for true BEI' }
    ];

    const tested  = dcma14.filter(p => p.tested);
    const passed  = tested.filter(p => p.rule && p.rule.pass).length;
    const failed  = tested.length - passed;
    const pct     = tested.length > 0 ? Math.round(passed / tested.length * 100) : 0;

    return {
      passed,
      failed,
      tested: tested.length,
      total: 14,
      percentage: pct,
      grade: pct >= 95 ? 'A' : pct >= 85 ? 'B' : pct >= 70 ? 'C' : pct >= 50 ? 'D' : 'F',
      points: dcma14.map(p => ({
        point: p.point,
        name: p.name,
        tested: p.tested,
        pass: p.tested && p.rule ? p.rule.pass : null,
        ruleKey: p.rule ? p.rule.ruleKey : null,
        note: p.note || null,
        percent: p.rule ? p.rule.percent : null,
        threshold: p.rule ? p.rule.threshold : null
      }))
    };
  }

  // Penalty calculator: scales linearly past threshold up to maxPenalty
  _pctPenalty(actualPct, thresholdPct, maxPenalty) {
    if (actualPct <= 0) return 0;
    if (thresholdPct <= 0) {
      return Math.min(maxPenalty, actualPct * (maxPenalty / 10));
    }
    if (actualPct <= thresholdPct) {
      return 0;
    }
    const excess = (actualPct - thresholdPct) / thresholdPct;
    return Math.min(maxPenalty, maxPenalty * 0.3 + excess * maxPenalty * 0.7);
  }

  computeCategoryScores(rules) {
    const categories = {
      logicQuality:           { label: 'Logic Quality',            weight: this.weights.logicQuality,           penalty: 0, maxPenalty: 60 },
      dateIntegrity:          { label: 'Date Integrity',           weight: this.weights.dateIntegrity,          penalty: 0, maxPenalty: 50 },
      constraintsFloat:       { label: 'Constraints & Float',      weight: this.weights.constraintsFloat,       penalty: 0, maxPenalty: 50 },
      activityHygiene:        { label: 'Activity Hygiene',         weight: this.weights.activityHygiene,        penalty: 0, maxPenalty: 40 },
      progressRealism:        { label: 'Progress Realism',         weight: this.weights.progressRealism,        penalty: 0, maxPenalty: 50 },
      criticalPathReliability:{ label: 'Critical Path Reliability',weight: this.weights.criticalPathReliability,penalty: 0, maxPenalty: 50 }
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
