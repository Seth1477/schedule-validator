// scoring.js - Schedule Validation Scoring Engine (DCMA+ style, transparent)

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
      milestoneCount: milestones.length,
      dataDate: project.dataDate
    };
  }

  runAllRules(activities, relationships, project, actCount) {
    const results = [];
    const dataDate = project.dataDate ? new Date(project.dataDate) : null;

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

    // RULE 1: Missing Predecessors
    const missingPred = incompleteActs.filter(a => predMap[a.id] && predMap[a.id].length === 0 && a.type !== 'TT_StartMile');
    results.push({
      ruleKey: 'OPEN_ENDS_PREDECESSOR',
      category: 'logicQuality',
      severity: 'critical',
      title: 'Activities Missing Predecessor Logic',
      count: missingPred.length,
      totalActivities: actCount,
      percent: +(missingPred.length / actCount * 100).toFixed(1),
      penalty: Math.min(10, missingPred.length / actCount * 100 * 0.8),
      affectedIds: missingPred.slice(0, 20).map(a => a.id),
      threshold: '< 5% recommended (DCMA)',
      description: 'Activities with no predecessor relationship create open-end logic gaps.'
    });

    // RULE 2: Missing Successors
    const missingSucc = incompleteActs.filter(a => succMap[a.id] && succMap[a.id].length === 0 && a.type !== 'TT_FinMile' && a.type !== 'TT_Mile');
    results.push({
      ruleKey: 'OPEN_ENDS_SUCCESSOR',
      category: 'logicQuality',
      severity: missingSucc.length / actCount > 0.05 ? 'critical' : 'high',
      title: 'Activities Missing Successor Logic',
      count: missingSucc.length,
      totalActivities: actCount,
      percent: +(missingSucc.length / actCount * 100).toFixed(1),
      penalty: Math.min(10, missingSucc.length / actCount * 100 * 0.8),
      affectedIds: missingSucc.slice(0, 20).map(a => a.id),
      threshold: '< 5% recommended (DCMA)',
      description: 'Activities with no successor create dangling endpoints in the schedule logic.'
    });

    // RULE 3: Negative Float
    const negFloat = activities.filter(a => a.totalFloat < 0 && a.status !== 'TK_Complete');
    results.push({
      ruleKey: 'NEGATIVE_FLOAT',
      category: 'constraintsFloat',
      severity: negFloat.length > 0 ? 'critical' : 'low',
      title: 'Negative Float Activities',
      count: negFloat.length,
      totalActivities: actCount,
      percent: +(negFloat.length / actCount * 100).toFixed(1),
      penalty: Math.min(12, negFloat.length / actCount * 100 * 1.5),
      affectedIds: negFloat.slice(0, 20).map(a => a.id),
      threshold: '0 activities (any negative float is a concern)',
      description: 'Activities with negative total float indicate schedule cannot achieve planned dates.'
    });

    // RULE 4: Hard Constraints
    const hardConstraints = activities.filter(a =>
      ['CS_MSO', 'CS_FNLT', 'CS_MEOA', 'CS_MEOB'].includes(a.constraintType) &&
      a.status !== 'TK_Complete'
    );
    results.push({
      ruleKey: 'EXCESSIVE_CONSTRAINTS',
      category: 'constraintsFloat',
      severity: hardConstraints.length / actCount > 0.05 ? 'high' : 'medium',
      title: 'Excessive Hard Constraints',
      count: hardConstraints.length,
      totalActivities: actCount,
      percent: +(hardConstraints.length / actCount * 100).toFixed(1),
      penalty: Math.min(8, hardConstraints.length / actCount * 100 * 0.5),
      affectedIds: hardConstraints.slice(0, 20).map(a => a.id),
      threshold: '< 5% recommended (DCMA)',
      description: 'Hard constraints (MSO, FNLT) override logic and can mask critical path issues.'
    });

    // RULE 5: Excessive Lag
    const highLagRels = relationships.filter(r => r.lag > 15);
    results.push({
      ruleKey: 'EXCESSIVE_LAG',
      category: 'logicQuality',
      severity: highLagRels.length / (relationships.length || 1) > 0.05 ? 'high' : 'medium',
      title: 'Excessive Lag on Relationships (>15 days)',
      count: highLagRels.length,
      totalActivities: relationships.length,
      percent: +(highLagRels.length / (relationships.length || 1) * 100).toFixed(1),
      penalty: Math.min(6, highLagRels.length / (relationships.length || 1) * 100 * 0.5),
      affectedIds: [],
      threshold: '< 5% of relationships',
      description: 'Relationships with lag > 15 working days may represent missing activities.'
    });

    // RULE 6: Long Duration Activities
    const longDuration = incompleteActs.filter(a => a.duration > 44 && a.type !== 'TT_LOE' && a.type !== 'TT_WBS');
    results.push({
      ruleKey: 'LONG_DURATION',
      category: 'activityHygiene',
      severity: 'medium',
      title: 'Long Duration Activities (>44 Working Days)',
      count: longDuration.length,
      totalActivities: actCount,
      percent: +(longDuration.length / actCount * 100).toFixed(1),
      penalty: Math.min(5, longDuration.length / actCount * 100 * 0.4),
      affectedIds: longDuration.slice(0, 20).map(a => a.id),
      threshold: '< 5% recommended (DCMA)',
      description: 'Activities longer than 44 working days reduce schedule visibility and control accuracy.'
    });

    // RULE 7: Missing Calendars
    const missingCal = activities.filter(a => !a.calendarId || a.calendarId === '');
    results.push({
      ruleKey: 'MISSING_CALENDAR',
      category: 'activityHygiene',
      severity: missingCal.length > 0 ? 'high' : 'low',
      title: 'Activities Missing Calendar Assignment',
      count: missingCal.length,
      totalActivities: actCount,
      percent: +(missingCal.length / actCount * 100).toFixed(1),
      penalty: Math.min(6, missingCal.length / actCount * 100 * 0.6),
      affectedIds: missingCal.slice(0, 20).map(a => a.id),
      threshold: '0 activities',
      description: 'Activities without calendars use default schedule settings which may not reflect actual work patterns.'
    });

    // RULE 8: Actual Dates After Data Date
    if (dataDate) {
      const futureActuals = activities.filter(a => {
        if (!a.actualStart && !a.actualFinish) return false;
        const as = a.actualStart ? new Date(a.actualStart) : null;
        const af = a.actualFinish ? new Date(a.actualFinish) : null;
        return (as && as > dataDate) || (af && af > dataDate);
      });
      results.push({
        ruleKey: 'FUTURE_ACTUALS',
        category: 'dateIntegrity',
        severity: futureActuals.length > 0 ? 'high' : 'low',
        title: 'Actual Dates Beyond Data Date',
        count: futureActuals.length,
        totalActivities: actCount,
        percent: +(futureActuals.length / actCount * 100).toFixed(1),
        penalty: Math.min(8, futureActuals.length / actCount * 100 * 1.0),
        affectedIds: futureActuals.slice(0, 20).map(a => a.id),
        threshold: '0 activities',
        description: 'Activities with actual dates in the future indicate data entry errors or incorrect status date.'
      });
    }

    // RULE 9: High Float Activities
    const highFloat = incompleteActs.filter(a => a.totalFloat > 44 && a.totalFloat < 999 && !a.isCritical);
    results.push({
      ruleKey: 'HIGH_FLOAT',
      category: 'constraintsFloat',
      severity: highFloat.length / actCount > 0.10 ? 'high' : 'medium',
      title: 'High Float Activities (>44 Days)',
      count: highFloat.length,
      totalActivities: actCount,
      percent: +(highFloat.length / actCount * 100).toFixed(1),
      penalty: Math.min(4, highFloat.length / actCount * 100 * 0.2),
      affectedIds: highFloat.slice(0, 20).map(a => a.id),
      threshold: '< 10% recommended',
      description: 'Activities with unusually high float may indicate missing logic or disconnected schedule segments.'
    });

    // RULE 10: Near-Critical Density
    const nearCritical = incompleteActs.filter(a => a.totalFloat >= 0 && a.totalFloat <= 15);
    results.push({
      ruleKey: 'NEAR_CRITICAL_DENSITY',
      category: 'criticalPathReliability',
      severity: nearCritical.length / actCount > 0.15 ? 'medium' : 'low',
      title: 'High Near-Critical Activity Count (0-15 days float)',
      count: nearCritical.length,
      totalActivities: actCount,
      percent: +(nearCritical.length / actCount * 100).toFixed(1),
      penalty: Math.min(5, nearCritical.length / actCount * 100 * 0.15),
      affectedIds: nearCritical.slice(0, 20).map(a => a.id),
      threshold: '< 15% of total activities',
      description: 'A high concentration of near-critical activities indicates fragile schedule with limited contingency.'
    });

    // RULE 11: LOE Activities on Critical Path
    const loeCritical = activities.filter(a => a.type === 'TT_LOE' && a.isCritical);
    results.push({
      ruleKey: 'LOE_CRITICAL',
      category: 'criticalPathReliability',
      severity: loeCritical.length > 0 ? 'high' : 'low',
      title: 'Level of Effort Activities on Critical Path',
      count: loeCritical.length,
      totalActivities: actCount,
      percent: +(loeCritical.length / actCount * 100).toFixed(1),
      penalty: Math.min(6, loeCritical.length * 1.5),
      affectedIds: loeCritical.map(a => a.id),
      threshold: '0 activities',
      description: 'LOE activities on the critical path distort schedule logic and float calculations.'
    });

    // RULE 12: Missing Data Date
    if (!project.dataDate) {
      results.push({
        ruleKey: 'MISSING_DATA_DATE',
        category: 'dateIntegrity',
        severity: 'critical',
        title: 'Missing or Invalid Data Date',
        count: 1,
        totalActivities: actCount,
        percent: 100,
        penalty: 15,
        affectedIds: [],
        threshold: 'Data date is required',
        description: 'Schedule has no valid data date. All date-based analysis is invalid without a data date.'
      });
    }

    return results;
  }

  computeCategoryScores(rules) {
    const categories = {
      logicQuality: { label: 'Logic Quality', weight: this.weights.logicQuality, penalty: 0, maxPenalty: 30 },
      dateIntegrity: { label: 'Date Integrity', weight: this.weights.dateIntegrity, penalty: 0, maxPenalty: 20 },
      constraintsFloat: { label: 'Constraints & Float', weight: this.weights.constraintsFloat, penalty: 0, maxPenalty: 25 },
      activityHygiene: { label: 'Activity Hygiene', weight: this.weights.activityHygiene, penalty: 0, maxPenalty: 20 },
      progressRealism: { label: 'Progress Realism', weight: this.weights.progressRealism, penalty: 0, maxPenalty: 20 },
      criticalPathReliability: { label: 'Critical Path Reliability', weight: this.weights.criticalPathReliability, penalty: 0, maxPenalty: 20 }
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
