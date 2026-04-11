// xer-parser.js - Primavera P6 XER File Parser

class XERParser {
  constructor() {
    this.tables = {};
    this.errors = [];
    this.warnings = [];
  }

  parse(xerText) {
    // Reset state
    this.tables = {};
    this.errors = [];
    this.warnings = [];

    try {
      const lines = xerText.split('\n').map(l => l.replace(/\r$/, ''));
      let currentTable = null;
      let fields = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        if (line.startsWith('%T ')) {
          currentTable = line.substring(3).trim();
          this.tables[currentTable] = [];
          fields = [];
        } else if (line.startsWith('%F') && currentTable) {
          fields = line.substring(2).trim().split('\t');
        } else if (line.startsWith('%R') && currentTable) {
          const values = line.substring(2).trim().split('\t');
          const row = {};
          fields.forEach((f, idx) => {
            row[f] = values[idx] || '';
          });
          this.tables[currentTable].push(row);
        } else if (line.startsWith('%E')) {
          currentTable = null;
          fields = [];
        }
      }

      return this.normalize();
    } catch (err) {
      this.errors.push(`Parse error: ${err.message}`);
      return null;
    }
  }

  normalize() {
    const project = this.extractProject();
    if (!project) {
      this.errors.push('No valid project found in XER file.');
      return null;
    }

    const activities = this.extractActivities();
    const relationships = this.extractRelationships();
    const milestones = activities.filter(a => a.type === 'TT_Mile' || a.type === 'TT_FinMile' || a.type === 'TT_StartMile');
    const calendars = this.extractCalendars();
    const wbs = this.extractWBS();

    return {
      project,
      activities,
      relationships,
      milestones,
      calendars,
      wbs,
      parseErrors: this.errors,
      parseWarnings: this.warnings,
      rawTableCount: Object.keys(this.tables).length
    };
  }

  extractProject() {
    const projects = this.tables['PROJECT'] || [];
    if (projects.length === 0) {
      this.errors.push('No PROJECT table found.');
      return null;
    }
    if (projects.length > 1) {
      this.warnings.push('Multiple projects found in XER. Only first project will be analyzed.');
    }
    const p = projects[0];
    return {
      id: p.proj_id || '',
      name: p.proj_short_name || p.proj_id || 'Unknown Project',
      fullName: p.proj_name || '',
      dataDate: p.last_recalc_date || p.plan_start_date || '',
      plannedStart: p.plan_start_date || '',
      plannedFinish: p.plan_end_date || p.scd_end_date || '',
      statusDate: p.last_recalc_date || '',
      currency: p.currency_id || 'USD'
    };
  }

  extractActivities() {
    const tasks = this.tables['TASK'] || [];
    return tasks.map(t => ({
      id: t.task_id || '',
      code: t.task_code || '',
      name: t.task_name || '',
      wbsId: t.wbs_id || '',
      type: t.task_type || '',
      status: t.status_code || '',
      calendarId: t.clndr_id || '',
      duration: parseFloat(t.target_drtn_hr_cnt || 0) / 8,
      remainDuration: parseFloat(t.remain_drtn_hr_cnt || 0) / 8,
      actualDuration: parseFloat(t.act_drtn_hr_cnt || 0) / 8,
      percentComplete: parseFloat(t.phys_complete_pct || t.target_pct_complete || 0),
      earlyStart: t.early_start_date || '',
      earlyFinish: t.early_end_date || '',
      lateStart: t.late_start_date || '',
      lateFinish: t.late_end_date || '',
      actualStart: t.act_start_date || '',
      actualFinish: t.act_end_date || '',
      plannedStart: t.target_start_date || '',
      plannedFinish: t.target_end_date || '',
      totalFloat: parseFloat(t.total_float_hr_cnt || 0) / 8,
      freeFloat: parseFloat(t.free_float_hr_cnt || 0) / 8,
      isCritical: (parseFloat(t.total_float_hr_cnt || 0) / 8) <= 0,
      constraintType: t.cstr_type || '',
      constraintDate: t.cstr_date || '',
      constraint2Type: t.cstr_type2 || '',
      constraint2Date: t.cstr_date2 || ''
    }));
  }

  extractRelationships() {
    const rels = this.tables['TASKPRED'] || [];
    return rels.map(r => ({
      id: r.pred_task_id + '_' + r.task_id,
      predecessorId: r.pred_task_id || '',
      successorId: r.task_id || '',
      type: r.pred_type || 'PR_FS',
      lag: parseFloat(r.lag_hr_cnt || 0) / 8
    }));
  }

  extractCalendars() {
    const cals = this.tables['CALENDAR'] || [];
    return cals.map(c => ({
      id: c.clndr_id || '',
      name: c.clndr_name || '',
      type: c.clndr_type || '',
      daysPerWeek: c.day_hr_cnt ? 5 : 5
    }));
  }

  extractWBS() {
    const wbs = this.tables['PROJWBS'] || [];
    return wbs.map(w => ({
      id: w.wbs_id || '',
      parentId: w.parent_wbs_id || '',
      code: w.wbs_short_name || '',
      name: w.wbs_name || '',
      level: parseInt(w.seq_num || 0)
    }));
  }

  validate(parsedData) {
    const issues = [];
    if (!parsedData.project.dataDate) {
      issues.push({ severity: 'error', message: 'Schedule has no data date (Status Date). Cannot perform valid analysis.' });
    }
    if (parsedData.activities.length === 0) {
      issues.push({ severity: 'error', message: 'No activities found in schedule.' });
    }
    if (parsedData.activities.length < 10) {
      issues.push({ severity: 'warning', message: `Very few activities found (${parsedData.activities.length}). Schedule may be incomplete.` });
    }
    if (parsedData.relationships.length === 0) {
      issues.push({ severity: 'warning', message: 'No relationships found. Critical path analysis will be unreliable.' });
    }
    return issues;
  }
}

window.XERParser = XERParser;
