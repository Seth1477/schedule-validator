// app.js - Core Application Logic

const App = {
  currentProject: null,
  currentUpload: null,

  init() {
    this.loadFromStorage();
    this.setupNavigation();
    this.setupEventListeners();
    this.render();
  },

  // Per-user storage keys — each account has its own project list
  _storageKey(suffix) {
    const user = (window.CC && CC.Auth.currentUser()) ? CC.Auth.currentUser().email : 'guest';
    return `cc_${suffix}_${user}`;
  },

  // Admin email — this account gets pre-seeded with demo projects
  ADMIN_EMAIL: 'speterson1477@gmail.com',

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this._storageKey('projects'));
      if (stored) {
        this.projects = JSON.parse(stored);
        this.scheduleVersions = JSON.parse(localStorage.getItem(this._storageKey('versions')) || '[]');
      } else {
        // First load for this user
        const user = window.CC && CC.Auth.currentUser();
        const email = user ? user.email.toLowerCase() : '';
        if (email === this.ADMIN_EMAIL) {
          // Admin gets the superhero demo projects
          this.projects = DEMO_PROJECTS;
          this.scheduleVersions = DEMO_SCHEDULE_VERSIONS;
        } else {
          // Everyone else starts completely empty
          this.projects = [];
          this.scheduleVersions = [];
        }
        this.saveToStorage();
      }
    } catch(e) {
      this.projects = [];
      this.scheduleVersions = [];
    }
  },

  saveToStorage() {
    try {
      localStorage.setItem(this._storageKey('projects'), JSON.stringify(this.projects));
      localStorage.setItem(this._storageKey('versions'), JSON.stringify(this.scheduleVersions));
    } catch(e) { console.warn('Storage save failed', e); }
  },

  getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop().replace('.html', '') || 'index';
    return page;
  },

  getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

  setupNavigation() {
    // Mark active nav items
    const page = this.getCurrentPage();
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
      const href = link.getAttribute('href') || '';
      const linkPage = href.split('/').pop().replace('.html', '');
      if (linkPage === page || (page === 'index' && linkPage === '')) {
        link.classList.add('active');
      }
    });
  },

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        const container = btn.closest('.tabs');
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = container.querySelector(`#${tabId}`);
        if (pane) pane.classList.add('active');
      });
    });

    // Upload zone drag & drop
    const dropZone = document.querySelector('.upload-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) this.handleFileUpload(files[0]);
      });

      const fileInput = document.querySelector('#xerFileInput');
      if (fileInput) {
        fileInput.addEventListener('change', e => {
          if (e.target.files.length > 0) this.handleFileUpload(e.target.files[0]);
        });
      }
    }
  },

  handleFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.xer')) {
      this.showAlert('Invalid file type. Only Primavera P6 .xer files are accepted.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      this.processXER(file.name, content);
    };
    reader.readAsText(file);
  },

  processXER(filename, content) {
    const statusEl = document.querySelector('#uploadStatus');
    if (statusEl) statusEl.textContent = 'Parsing XER file...';

    try {
      const parser = new XERParser();
      const parsed = parser.parse(content);

      if (!parsed) {
        this.showAlert('Could not parse XER file. Ensure it is a valid Primavera P6 XER export.', 'error');
        return;
      }

      const validationIssues = parser.validate(parsed);
      const errors = validationIssues.filter(i => i.severity === 'error');

      if (errors.length > 0) {
        this.showAlert(`XER validation failed: ${errors[0].message}`, 'error');
        return;
      }

      if (statusEl) statusEl.textContent = 'Running schedule analysis...';

      const engine = new ScoringEngine();
      const scores = engine.analyze(parsed);

      const cpAnalyzer = new CriticalPathAnalyzer();
      const cpResult = cpAnalyzer.analyze(parsed.activities, parsed.relationships);

      const projectId = this.getQueryParam('projectId') || this.projects[0]?.id;
      const version = {
        id: 'v' + Date.now(),
        projectId,
        filename,
        dataDate: parsed.project.dataDate,
        uploadDate: new Date().toISOString().split('T')[0],
        version: `Update ${this.scheduleVersions.filter(v => v.projectId === projectId).length + 1}`,
        overallScore: scores?.overallScore || 0,
        categoryScores: scores?.categoryScores || {},
        activityCount: parsed.activities.length,
        status: 'current',
        parsedData: parsed,
        analysisResults: scores,
        criticalPath: cpResult
      };

      this.scheduleVersions.push(version);
      this.saveToStorage();

      if (statusEl) statusEl.textContent = 'Analysis complete!';
      this.showAlert(`Schedule analyzed successfully. Overall Score: ${scores?.overallScore}/100`, 'success');

      setTimeout(() => {
        window.location.href = `project.html?projectId=${projectId}&uploadId=${version.id}`;
      }, 1500);

    } catch(err) {
      this.showAlert(`Error processing XER: ${err.message}`, 'error');
    }
  },

  getRAGClass(score) {
    if (score >= 85) return 'green';
    if (score >= 70) return 'amber';
    return 'red';
  },

  getRAGLabel(score) {
    if (score >= 85) return 'Good';
    if (score >= 70) return 'Moderate';
    return 'Poor';
  },

  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(e) { return dateStr; }
  },

  showAlert(message, type = 'info') {
    const existing = document.querySelector('.alert-toast');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.className = `alert-toast alert-${type}`;
    alert.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:16px 24px;border-radius:10px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.15);max-width:400px;`;

    const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#0ea5e9' };
    alert.style.background = colors[type] || colors.info;
    alert.style.color = '#fff';
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
  },

  render() {
    const page = this.getCurrentPage();
    if (page === 'index' || page === '' || page === 'dashboard') this.renderProjectsList();
    if (page === 'project') this.renderProjectDashboard();
    if (page === 'diagnostics') this.renderDiagnostics();
    if (page === 'comparison') this.renderComparison();
  },

  renderProjectsList() {
    const container = document.querySelector('#projectsGrid');
    if (!container) return;

    // Update stat cards from real data
    const active = this.projects.filter(p => p.status === 'active');
    const green  = this.projects.filter(p => this.getRAGClass(p.latestScore) === 'green').length;
    const amber  = this.projects.filter(p => this.getRAGClass(p.latestScore) === 'amber').length;
    const red    = this.projects.filter(p => this.getRAGClass(p.latestScore) === 'red').length;
    const totalUploads = this.projects.reduce((s, p) => s + (p.uploads || 0), 0);
    const setS = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setS('stat-active', active.length);
    setS('stat-green',  green);
    setS('stat-amber',  amber);
    setS('stat-red',    red);
    setS('stat-uploads', totalUploads);

    container.innerHTML = '';

    if (this.projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:80px 24px;">
          <div style="font-size:64px;margin-bottom:20px;">📂</div>
          <h2 style="font-size:22px;font-weight:700;color:#1e1b4b;margin-bottom:10px;">No projects yet</h2>
          <p style="color:#64748b;font-size:15px;max-width:420px;margin:0 auto 32px;line-height:1.6;">
            Upload your first Primavera P6 XER file to get a DCMA+ quality score and start tracking your schedule health.
          </p>
          <a href="upload.html" class="btn btn-primary" id="emptyUploadBtn" style="font-size:15px;padding:12px 28px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Your First Schedule
          </a>
        </div>`;
      return;
    }

    this.projects.forEach(proj => {
      const ragClass = this.getRAGClass(proj.latestScore);
      const card = document.createElement('div');
      card.className = 'project-card card';
      card.dataset.rag = ragClass;
      card.dataset.status = proj.status;
      card.innerHTML = `
        <div class="project-card-header">
          <div>
            <h3 class="project-name">${proj.name}</h3>
            <p class="project-client">${proj.client}</p>
          </div>
          <span class="score-badge score-badge-${ragClass}">${proj.latestScore ?? '—'}</span>
        </div>
        <p class="project-desc">${proj.description || ''}</p>
        <div class="project-meta">
          <span>📍 ${proj.location || 'TBD'}</span>
          <span>💰 ${proj.contractValue || 'TBD'}</span>
          <span>📅 ${this.formatDate(proj.plannedFinish)}</span>
        </div>
        <div class="project-tags">
          ${(proj.tags||[]).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
        <div class="project-card-footer">
          <span class="uploads-count">${proj.uploads || 0} schedule uploads</span>
          <a href="project.html?projectId=${proj.id}" class="btn btn-primary btn-sm">View Dashboard →</a>
        </div>
      `;
      container.appendChild(card);
    });
  },

  renderProjectDashboard() {
    const projectId = this.getQueryParam('projectId') || this.projects[0]?.id;
    const project = this.projects.find(p => p.id === projectId) || this.projects[0];
    if (!project) return;

    // Use demo data for the showcase
    const scores = DEMO_CATEGORY_SCORES['v8'];
    const overallScore = project.latestScore;

    // Set project header info
    this.setEl('#projectName', project.name);
    this.setEl('#projectTitle', project.name);
    this.setEl('#projectClient', project.client);
    this.setEl('#projectContract', `${project.contractValue} ${project.contractType}`);
    this.setEl('#projectLocation', project.location);
    this.setEl('#projectDataDate', this.formatDate('2026-01-01'));
    this.setEl('#projectPlannedFinish', this.formatDate(project.plannedFinish));

    // Overall score
    this.setEl('#overallScore', overallScore);
    const scoreEl = document.querySelector('#overallScoreRing');
    if (scoreEl) {
      scoreEl.style.setProperty('--score', overallScore);
      scoreEl.className = `score-ring score-ring-${this.getRAGClass(overallScore)}`;
    }

    // Category scores
    Object.entries(scores).forEach(([key, cat]) => {
      const el = document.querySelector(`#cat_${key}`);
      if (el) {
        el.querySelector('.cat-score-value').textContent = cat.score;
        el.querySelector('.cat-progress-fill').style.width = cat.score + '%';
        el.querySelector('.cat-progress-fill').className = `cat-progress-fill fill-${this.getRAGClass(cat.score)}`;
      }
    });

    // Executive narrative
    this.renderNarrative(project, overallScore, scores);

    // Milestones
    this.renderMilestones();

    // Score trend chart
    this.renderScoreTrendChart();
  },

  renderNarrative(project, overallScore, scores) {
    const el = document.getElementById('narrativeText');
    if (!el) return;

    const ragLabel = overallScore >= 80 ? 'Green' : overallScore >= 65 ? 'Amber' : 'Red';
    const ragClass = overallScore >= 80 ? 'text-green' : overallScore >= 65 ? 'text-amber' : 'text-red';

    // Find worst scoring category
    let worstCat = null, worstScore = 101;
    if (scores) {
      Object.values(scores).forEach(cat => {
        if (cat.score < worstScore) { worstScore = cat.score; worstCat = cat; }
      });
    }

    const logicScore = scores?.logicQuality?.score ?? null;
    const constraintsScore = scores?.constraintsFloat?.score ?? null;
    const logicRag = logicScore !== null ? (logicScore >= 80 ? 'Green' : logicScore >= 65 ? 'Amber' : 'Red') : null;
    const logicClass = logicScore !== null ? (logicScore >= 80 ? 'text-green' : logicScore >= 65 ? 'text-amber' : 'text-red') : '';

    // Derive version info from schedule versions
    const versions = (window.DEMO_SCHEDULE_VERSIONS || []).filter(v => v.projectId === project.id);
    const latest = versions.find(v => v.status === 'current') || versions[versions.length - 1];
    const versionLabel = latest ? latest.version : 'Latest Update';
    const dataDate = latest ? this.formatDate(latest.dataDate) : 'N/A';

    // Negative float diagnostics
    const negFloatDiag = (window.DEMO_DIAGNOSTICS || []).find(d => d.ruleKey === 'NEGATIVE_FLOAT');
    const negFloatCount = negFloatDiag ? negFloatDiag.count : null;

    // Open-end predecessor diagnostic
    const openEndDiag = (window.DEMO_DIAGNOSTICS || []).find(d => d.ruleKey === 'OPEN_ENDS_PREDECESSOR');
    const openEndCount = openEndDiag ? openEndDiag.count : null;
    const openEndSucc = (window.DEMO_DIAGNOSTICS || []).find(d => d.ruleKey === 'OPEN_ENDS_SUCCESSOR');
    const openEndSuccCount = openEndSucc ? openEndSucc.count : null;

    // Constraints diagnostic
    const constraintsDiag = (window.DEMO_DIAGNOSTICS || []).find(d => d.ruleKey === 'EXCESSIVE_CONSTRAINTS');
    const constraintsCount = constraintsDiag ? constraintsDiag.count : null;

    // Forecast finish from milestones
    const substCompMilestone = (window.DEMO_MILESTONES || []).find(m => m.name === 'Substantial Completion');
    const forecastFinish = substCompMilestone ? this.formatDate(substCompMilestone.forecastDate) : this.formatDate(project.plannedFinish);
    const slipDays = substCompMilestone ? substCompMilestone.variance : null;

    let html = `<p>The <strong>${project.name}</strong> schedule (${versionLabel}, Data Date: ${dataDate}) received an overall Validation Score of <strong class="${ragClass}">${overallScore}/100 (${ragLabel})</strong>, indicating ${overallScore >= 80 ? 'strong schedule quality with minor areas for improvement' : overallScore >= 65 ? 'moderate schedule quality concerns requiring attention' : 'significant schedule quality issues requiring immediate remediation'}.</p>`;

    if (negFloatCount !== null) {
      html += `<p>The most critical finding is <strong>${negFloatCount} activities with negative total float</strong>. This indicates the project cannot achieve its planned substantial completion date of ${this.formatDate(project.plannedFinish)} without acceleration or scope changes. The current forecast finish is <strong class="text-red">${forecastFinish}</strong>${slipDays ? `, representing a <strong>${slipDays}-working-day slip</strong> from the contract milestone` : ''}.`;
      html += `</p>`;
    }

    if (logicScore !== null && openEndCount !== null) {
      html += `<p><strong>Logic quality</strong> scored <span class="${logicClass}">${logicScore}/100 (${logicRag})</span>`;
      if (openEndCount || openEndSuccCount) {
        html += `, driven by ${openEndCount ? `${openEndCount} activities missing predecessor logic` : ''}${openEndCount && openEndSuccCount ? ' and ' : ''}${openEndSuccCount ? `${openEndSuccCount} missing successors` : ''}. These open ends undermine the reliability of the critical path and float calculations.`;
      } else {
        html += `.`;
      }
      html += `</p>`;
    }

    const actions = [];
    if (constraintsCount !== null) actions.push(`Address negative float by reviewing all FNLT constraints — ${constraintsCount} hard constraints were identified, well above the DCMA threshold of 5%`);
    if (openEndCount) actions.push(`Close ${openEndCount} predecessor logic gaps to strengthen critical path reliability`);
    actions.push(`Confirm data date is set accurately before the next update submission`);
    html += `<p><strong>Recommended actions:</strong> ${actions.map((a, i) => `(${i + 1}) ${a}.`).join(' ')}</p>`;

    el.innerHTML = html;
  },

  renderMilestones() {
    const container = document.querySelector('#milestonesTable');
    if (!container) return;
    container.innerHTML = DEMO_MILESTONES.map(m => {
      const varClass = m.variance > 30 ? 'text-red' : m.variance > 10 ? 'text-amber' : 'text-green';
      const statusLabel = { complete: 'Complete', slipping: 'Slipping', at_risk: 'At Risk', on_track: 'On Track' }[m.status] || m.status;
      const statusBadge = { complete: 'badge-success', slipping: 'badge-critical', at_risk: 'badge-high', on_track: 'badge-low' }[m.status] || 'badge-info';
      return `<tr>
        <td>${m.name}${m.isCritical ? ' <span class="badge badge-critical">Critical</span>' : ''}</td>
        <td>${this.formatDate(m.plannedDate)}</td>
        <td>${m.actualDate ? this.formatDate(m.actualDate) : this.formatDate(m.forecastDate)}</td>
        <td class="${varClass}">${m.variance > 0 ? '+' : ''}${m.variance}d</td>
        <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      </tr>`;
    }).join('');
  },

  renderScoreTrendChart() {
    const canvas = document.querySelector('#scoreTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = DEMO_SCORE_HISTORY.map(h => h.version);
    const overallData = DEMO_SCORE_HISTORY.map(h => h.overallScore);

    try {
      new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Overall Score',
              data: overallData,
              borderColor: '#0ea5e9',
              backgroundColor: 'rgba(14,165,233,0.1)',
              borderWidth: 3,
              pointRadius: 5,
              pointBackgroundColor: overallData.map(s => s >= 85 ? '#22c55e' : s >= 70 ? '#f59e0b' : '#ef4444'),
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { min: 50, max: 100, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
            x: { grid: { display: false }, ticks: { color: '#64748b' } }
          }
        }
      });
    } catch(e) {
      console.warn('Chart rendering failed', e);
    }
  },

  renderDiagnostics() {
    const container = document.querySelector('#diagnosticsContainer');
    if (!container) return;

    container.innerHTML = DEMO_DIAGNOSTICS.map(d => this.buildDiagnosticCard(d)).join('');

    // Setup drill-down toggles
    container.querySelectorAll('.diag-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.diagnostic-card').querySelector('.diag-detail');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? 'Show Activities ▼' : 'Hide Activities ▲';
      });
    });
  },

  buildDiagnosticCard(d) {
    const sevClass = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }[d.severity] || 'badge-info';
    const actRows = d.activities.map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${a.name}</td>
        <td>${a.wbs}</td>
        <td>${this.formatDate(a.startDate)}</td>
        <td>${this.formatDate(a.finishDate)}</td>
        <td class="${a.float < 0 ? 'text-red' : a.float === 0 ? 'text-amber' : ''}">${a.float}d</td>
        <td>${a.isCritical ? '<span class="badge badge-critical">Critical</span>' : ''}</td>
      </tr>
    `).join('');

    return `
      <div class="diagnostic-card card mb-4">
        <div class="diag-header flex-between">
          <div class="flex gap-4 items-center">
            <span class="badge ${sevClass}">${d.severity.toUpperCase()}</span>
            <span class="badge badge-info">${d.category}</span>
            <h3 class="diag-title">${d.title}</h3>
          </div>
          <div class="diag-stats">
            <span class="diag-count">${d.count} activities</span>
            <span class="diag-percent">(${d.percent}%)</span>
          </div>
        </div>
        <p class="diag-description mt-4">${d.description}</p>
        <div class="diag-recommendation mt-4">
          <strong>Recommendation:</strong> ${d.recommendation}
        </div>
        ${d.activities.length > 0 ? `
        <div class="mt-4">
          <button class="btn btn-secondary btn-sm diag-toggle">Show Activities ▼</button>
          <div class="diag-detail" style="display:none; margin-top:12px;">
            <table class="data-table">
              <thead><tr><th>Activity ID</th><th>Activity Name</th><th>WBS</th><th>Start</th><th>Finish</th><th>Float</th><th>Critical</th></tr></thead>
              <tbody>${actRows}</tbody>
            </table>
          </div>
        </div>` : ''}
      </div>
    `;
  },

  renderComparison() {
    const comp = DEMO_COMPARISON;

    // Summary cards
    const movements = [
      { id: 'finishMovement', label: 'Finish Date Movement', value: `+${comp.summary.finishDateMovement}d`, rag: 'red' },
      { id: 'cpSlip', label: 'Critical Path Slip', value: `+${comp.summary.criticalPathSlip}d`, rag: 'red' },
      { id: 'scoreChange', label: 'Score Change', value: `${comp.summary.scoreChange}`, rag: 'amber' },
      { id: 'negFloatDelta', label: 'Neg. Float Activities', value: `+${comp.summary.negativeFloatDelta}`, rag: 'red' }
    ];

    movements.forEach(m => {
      const el = document.querySelector(`#${m.id}`);
      if (el) {
        el.querySelector('.stat-value').textContent = m.value;
        el.className = `stat-card card stat-card-${m.rag}`;
      }
    });

    // Milestone changes table
    const milestoneContainer = document.querySelector('#milestoneChanges');
    if (milestoneContainer) {
      milestoneContainer.innerHTML = comp.milestoneChanges.map(m => `
        <tr>
          <td>${m.name}</td>
          <td>${this.formatDate(m.priorForecast)}</td>
          <td>${this.formatDate(m.currentForecast)}</td>
          <td class="text-red">+${m.variance}d</td>
          <td><span class="badge badge-critical">Slipped</span></td>
        </tr>
      `).join('');
    }

    // Activity changes
    const actContainer = document.querySelector('#activityChanges');
    if (actContainer) {
      actContainer.innerHTML = comp.activityChanges.map(a => `
        <tr>
          <td>${a.id}</td>
          <td>${a.name}</td>
          <td>${this.formatDate(a.priorStart)} → ${this.formatDate(a.newStart)}</td>
          <td>${this.formatDate(a.priorFinish)} → ${this.formatDate(a.newFinish)}</td>
          <td class="${a.finishVariance > 0 ? 'text-red' : 'text-green'}">${a.finishVariance > 0 ? '+' : ''}${a.finishVariance}d</td>
          <td class="${a.floatChange < 0 ? 'text-red' : 'text-green'}">${a.floatChange > 0 ? '+' : ''}${a.floatChange}d</td>
        </tr>
      `).join('');
    }
  },

  setEl(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
