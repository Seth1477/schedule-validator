// app.js - Core Application Logic (v2 — IndexedDB-backed)

const App = {
  currentProject: null,
  currentUpload: null,
  projects: [],
  scheduleVersions: [],
  _ready: false,

  // ─── Initialization ──────────────────────────────────────────
  // Async init: loads projects from localStorage (sync, fast) then
  // loads versions from IndexedDB (async, large data).
  async init() {
    this._loadProjectsSync();       // projects from localStorage — instant
    await this._loadVersionsAsync(); // versions from IndexedDB — reliable
    this._ready = true;
    this.setupNavigation();
    this.setupEventListeners();
    this.render();
    console.log('[App] Initialized —', this.projects.length, 'projects,', this.scheduleVersions.length, 'versions');
  },

  // Per-user storage keys
  _storageKey(suffix) {
    const user = (window.CC && CC.Auth.currentUser()) ? CC.Auth.currentUser().email : 'guest';
    return `cc_${suffix}_${user}`;
  },

  _currentEmail() {
    return (window.CC && CC.Auth.currentUser()) ? CC.Auth.currentUser().email : 'guest';
  },

  // Admin email — this account gets pre-seeded with demo projects
  ADMIN_EMAIL: 'speterson1477@gmail.com',

  // ─── Current Project Persistence ─────────────────────────────
  // Saves the last-viewed project ID to sessionStorage so it survives
  // navigation between pages even when ?projectId= is absent from the URL.
  _saveCurrentProjectId(id) {
    try { sessionStorage.setItem('cc_cur_proj_' + this._currentEmail(), id); } catch(e) {}
  },
  _loadCurrentProjectId() {
    try { return sessionStorage.getItem('cc_cur_proj_' + this._currentEmail()) || null; } catch(e) { return null; }
  },

  // ─── Storage: Load ───────────────────────────────────────────
  _loadProjectsSync() {
    try {
      const stored = localStorage.getItem(this._storageKey('projects'));
      if (stored) {
        this.projects = JSON.parse(stored);
      } else {
        // First load for this user
        const email = this._currentEmail().toLowerCase();
        if (email === this.ADMIN_EMAIL) {
          this.projects = DEMO_PROJECTS;
        } else {
          this.projects = [];
        }
        this._saveProjectsSync();
      }
    } catch(e) {
      console.error('[App] _loadProjectsSync error:', e);
      this.projects = [];
    }
  },

  async _loadVersionsAsync() {
    try {
      const email = this._currentEmail();
      const idbVersions = await DataStore.loadVersions(email);
      if (idbVersions && idbVersions.length > 0) {
        this.scheduleVersions = idbVersions;
        console.log('[App] Loaded', idbVersions.length, 'versions from IndexedDB');
        return;
      }
      // Fallback: try old localStorage key
      const lsKey = this._storageKey('versions');
      const lsData = localStorage.getItem(lsKey);
      if (lsData) {
        this.scheduleVersions = JSON.parse(lsData);
        console.log('[App] Migrated', this.scheduleVersions.length, 'versions from localStorage → IndexedDB');
        // Migrate to IndexedDB immediately
        await DataStore.saveVersions(email, this.scheduleVersions);
      } else {
        // First load — seed demo versions for admin
        const email2 = this._currentEmail().toLowerCase();
        if (email2 === this.ADMIN_EMAIL && typeof DEMO_SCHEDULE_VERSIONS !== 'undefined') {
          this.scheduleVersions = DEMO_SCHEDULE_VERSIONS;
          await DataStore.saveVersions(email, this.scheduleVersions);
        } else {
          this.scheduleVersions = [];
        }
      }
    } catch(e) {
      console.error('[App] _loadVersionsAsync error:', e);
      // Last-resort fallback
      try {
        const lsData = localStorage.getItem(this._storageKey('versions'));
        this.scheduleVersions = lsData ? JSON.parse(lsData) : [];
      } catch(e2) {
        this.scheduleVersions = [];
      }
    }
  },

  // ─── Storage: Save ───────────────────────────────────────────
  _saveProjectsSync() {
    try {
      localStorage.setItem(this._storageKey('projects'), JSON.stringify(this.projects));
    } catch(e) {
      console.error('[App] _saveProjectsSync failed:', e);
    }
    // Also back up to IndexedDB (fire-and-forget)
    DataStore.saveProjects(this._currentEmail(), this.projects).catch(() => {});
  },

  async _saveVersionsAsync() {
    const email = this._currentEmail();
    try {
      await DataStore.saveVersions(email, this.scheduleVersions);
      console.log('[App] Saved', this.scheduleVersions.length, 'versions to IndexedDB');
    } catch(e) {
      console.error('[App] _saveVersionsAsync failed:', e);
    }
  },

  // Combined save — call this after any mutation
  saveToStorage() {
    this._saveProjectsSync();
    this._saveVersionsAsync(); // async, no await needed from callers
  },

  // Legacy alias used by old code paths
  loadFromStorage() {
    this._loadProjectsSync();
    // Note: versions need async load — call init() instead for full load
  },

  // ─── Project CRUD ────────────────────────────────────────────
  createProjectFromXER(parsed, filename) {
    const projName = parsed.project.fullName || parsed.project.name || filename.replace(/\.xer$/i, '');
    const proj = {
      id: 'proj-' + Date.now(),
      name: projName,
      client: parsed.project.companyName || 'Imported from XER',
      contractValue: 'TBD',
      contractType: 'TBD',
      location: 'TBD',
      startDate: parsed.project.plannedStart || '',
      plannedFinish: parsed.project.plannedFinish || '',
      description: `Imported from ${filename}`,
      status: 'active',
      tags: ['XER Import'],
      uploads: 0,
      latestScore: null,
      latestScoreRag: null,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    this.projects.push(proj);
    this._saveProjectsSync();
    return proj;
  },

  deleteProject(projectId) {
    const idx = this.projects.findIndex(p => p.id === projectId);
    if (idx === -1) return false;
    const name = this.projects[idx].name;
    this.projects.splice(idx, 1);
    // Remove all versions for this project
    this.scheduleVersions = this.scheduleVersions.filter(v => v.projectId !== projectId);
    this.saveToStorage();
    console.log(`[App] Deleted project "${name}" and its versions`);
    return true;
  },

  // ─── Navigation & Events ─────────────────────────────────────
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        const container = btn.closest('.tabs');
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = container.querySelector(`#${tabId}`);
        if (pane) pane.classList.add('active');
        // Re-init sticky scrollbars for newly visible tab content
        requestAnimationFrame(() => this.initStickyScrollbars());
      });
    });
  },

  // ─── Sticky Horizontal Scrollbars ────────────────────────────
  // Injects a position:sticky bottom-of-viewport scroll rail next to every
  // .table-scroll-wrapper so the user can drag left/right without scrolling
  // to the bottom of the table first.
  initStickyScrollbars() {
    document.querySelectorAll('.table-scroll-wrapper').forEach(wrapper => {
      if (wrapper.dataset.stickyInit) return;
      wrapper.dataset.stickyInit = '1';

      // Build the sticky rail + inner sizer
      const rail = document.createElement('div');
      rail.className = 'sticky-scroll-rail';
      const inner = document.createElement('div');
      inner.className = 'sticky-scroll-rail-inner';
      rail.appendChild(inner);

      // Insert the rail immediately after the wrapper in the DOM
      wrapper.parentNode.insertBefore(rail, wrapper.nextSibling);

      // Sync the inner div width to match the table's full scroll width
      const syncWidth = () => {
        inner.style.width = wrapper.scrollWidth + 'px';
      };
      syncWidth();

      // Two-way scroll sync without infinite loops
      let syncing = false;
      rail.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        wrapper.scrollLeft = rail.scrollLeft;
        requestAnimationFrame(() => { syncing = false; });
      });
      wrapper.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        rail.scrollLeft = wrapper.scrollLeft;
        requestAnimationFrame(() => { syncing = false; });
      });

      // Keep width in sync if the table resizes (e.g. new rows added)
      if (window.ResizeObserver) {
        new ResizeObserver(syncWidth).observe(wrapper);
      }
    });
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

      // Auto-create project from XER data
      const project = this.createProjectFromXER(parsed, filename);

      const version = {
        id: 'v' + Date.now(),
        projectId: project.id,
        filename,
        dataDate: parsed.project.dataDate,
        uploadDate: new Date().toISOString().split('T')[0],
        version: 'Update 1',
        overallScore: scores?.overallScore || 0,
        categoryScores: scores?.categoryScores || {},
        activityCount: parsed.activities.length,
        status: 'current',
        parsedData: parsed,
        analysisResults: scores,
        criticalPath: cpResult,
        isReal: true
      };

      this.scheduleVersions.push(version);
      project.latestScore = version.overallScore;
      project.uploads = 1;
      this.saveToStorage();

      if (statusEl) statusEl.textContent = 'Analysis complete!';
      this.showAlert(`Schedule analyzed successfully. Overall Score: ${scores?.overallScore}/100`, 'success');

      setTimeout(() => {
        window.location.href = `project.html?projectId=${project.id}&uploadId=${version.id}`;
      }, 1500);

    } catch(err) {
      this.showAlert(`Error processing XER: ${err.message}`, 'error');
    }
  },

  // ─── Utilities ───────────────────────────────────────────────
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

  // ─── Rendering ───────────────────────────────────────────────
  render() {
    const page = this.getCurrentPage();
    if (page === 'index' || page === '' || page === 'dashboard') this.renderProjectsList();
    if (page === 'project') this.renderProjectDashboard();
    if (page === 'diagnostics') this.renderDiagnostics();
    if (page === 'comparison') this.renderComparison();
    // Inject ?projectId= into all sidebar nav links on every page
    const project = this._resolveCurrentProject();
    if (project) this._injectProjectIdIntoLinks(project);
  },

  renderProjectsList() {
    const container = document.querySelector('#projectsGrid');
    if (!container) return;

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
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;" onclick="event.stopPropagation();App.confirmDeleteProject('${proj.id}','${proj.name.replace(/'/g, "\\'")}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Delete
            </button>
            <a href="project.html?projectId=${proj.id}" class="btn btn-primary btn-sm">View Dashboard →</a>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  confirmDeleteProject(projectId, projectName) {
    if (confirm(`Delete "${projectName}" and all its uploaded schedules? This cannot be undone.`)) {
      this.deleteProject(projectId);
      this.renderProjectsList();
      this.showAlert(`Project "${projectName}" deleted.`, 'success');
    }
  },

  // ─── Project Resolution ──────────────────────────────────────
  _resolveCurrentProject() {
    const projectId = this.getQueryParam('projectId')
      || this._loadCurrentProjectId()
      || this.projects[0]?.id;
    const project = this.projects.find(p => p.id === projectId)
      || this.projects.find(p => p.id !== 'proj-001' && p.id !== 'proj-002' && p.id !== 'proj-003')
      || this.projects[0]
      || null;
    // Persist so other pages pick it up without a URL param
    if (project) this._saveCurrentProjectId(project.id);
    return project;
  },

  _injectProjectIdIntoLinks(project) {
    if (!project) return;
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const isInternalPage = /^(project|diagnostics|comparison|upload|learn)\.html/.test(href.split('/').pop());
      if (isInternalPage && !href.includes('projectId=')) {
        const sep = href.includes('?') ? '&' : '?';
        a.setAttribute('href', `${href}${sep}projectId=${project.id}`);
      }
    });
  },

  _resolveCurrentVersion(project) {
    if (!project) return null;
    const uploadId = this.getQueryParam('uploadId');
    const projectVersions = (this.scheduleVersions || []).filter(v => v.projectId === project.id);

    if (uploadId) {
      const v = projectVersions.find(v => v.id === uploadId);
      if (v) return v;
    }

    const realCurrent = projectVersions.filter(v => v.isReal).sort((a, b) => (b.id > a.id ? 1 : -1));
    if (realCurrent.length > 0) return realCurrent[0];

    const current = projectVersions.find(v => v.status === 'current');
    if (current) return current;
    if (projectVersions.length > 0) return projectVersions[projectVersions.length - 1];

    return null;
  },

  // ─── Project Dashboard ───────────────────────────────────────
  renderProjectDashboard() {
    const project = this._resolveCurrentProject();
    if (!project) return;

    const version = this._resolveCurrentVersion(project);
    const hasRealData = version && version.isReal && version.analysisResults;
    const scores = hasRealData ? version.analysisResults.categoryScores : (DEMO_CATEGORY_SCORES['v8'] || {});
    const overallScore = hasRealData ? version.overallScore : project.latestScore;

    this._injectProjectIdIntoLinks(project);

    this.setEl('#projectName', project.name);
    this.setEl('#projectTitle', project.name);
    this.setEl('#projectClient', project.client);
    this.setEl('#projectContract', `${project.contractValue} ${project.contractType}`);
    this.setEl('#projectLocation', project.location);
    this.setEl('#projectDataDate', this.formatDate(hasRealData ? version.dataDate : '2026-01-01'));
    this.setEl('#projectPlannedFinish', this.formatDate(hasRealData ? (version.plannedFinish || project.plannedFinish) : project.plannedFinish));

    if (hasRealData && version.xerProjectName) {
      this.setEl('#projectClient', version.xerProjectName);
    }

    this.setEl('#overallScore', overallScore);
    const scoreEl = document.querySelector('#overallScoreRing');
    if (scoreEl) {
      scoreEl.style.setProperty('--score', overallScore);
      scoreEl.className = `score-ring score-ring-${this.getRAGClass(overallScore)}`;
    }

    Object.entries(scores).forEach(([key, cat]) => {
      const el = document.querySelector(`#cat_${key}`);
      if (el) {
        el.querySelector('.cat-score-value').textContent = cat.score;
        el.querySelector('.cat-progress-fill').style.width = cat.score + '%';
        el.querySelector('.cat-progress-fill').className = `cat-progress-fill fill-${this.getRAGClass(cat.score)}`;
      }
    });

    if (hasRealData && version.analysisResults) {
      const ar = version.analysisResults;
      this.setEl('.metric-value.text-red:first-of-type', ar.negativeFloatCount || 0);
      const negFloatCard = document.querySelectorAll('.metric-card')[0];
      if (negFloatCard) negFloatCard.querySelector('.metric-value').textContent = ar.negativeFloatCount || 0;
      const nearCritCard = document.querySelectorAll('.metric-card')[1];
      if (nearCritCard) {
        const nearCritCount = (ar.rules || []).find(r => r.ruleKey === 'NEAR_CRITICAL_DENSITY')?.count || 0;
        nearCritCard.querySelector('.metric-value').textContent = nearCritCount;
      }
      const openEndCard = document.querySelectorAll('.metric-card')[2];
      if (openEndCard) {
        const openEndPred = (ar.rules || []).find(r => r.ruleKey === 'OPEN_ENDS_PREDECESSOR')?.count || 0;
        const openEndSucc = (ar.rules || []).find(r => r.ruleKey === 'OPEN_ENDS_SUCCESSOR')?.count || 0;
        openEndCard.querySelector('.metric-value').textContent = openEndPred + openEndSucc;
      }
    }

    this.renderNarrative(project, overallScore, scores, hasRealData ? version : null);
    this.renderMilestones(hasRealData ? version : null);
    this.renderScoreTrendChart(project, hasRealData ? version : null);
  },

  renderNarrative(project, overallScore, scores, version) {
    const el = document.getElementById('narrativeText');
    if (!el) return;

    const ragLabel = overallScore >= 85 ? 'Green' : overallScore >= 70 ? 'Amber' : 'Red';
    const ragClass = overallScore >= 85 ? 'text-green' : overallScore >= 70 ? 'text-amber' : 'text-red';

    let worstCat = null, worstScore = 101;
    if (scores) {
      Object.values(scores).forEach(cat => {
        if (cat.score !== undefined && cat.score < worstScore) { worstScore = cat.score; worstCat = cat; }
      });
    }

    const logicScore = scores?.logicQuality?.score ?? null;
    const logicRag = logicScore !== null ? (logicScore >= 85 ? 'Green' : logicScore >= 70 ? 'Amber' : 'Red') : null;
    const logicClass = logicScore !== null ? (logicScore >= 85 ? 'text-green' : logicScore >= 70 ? 'text-amber' : 'text-red') : '';

    const isReal = version && version.isReal;
    const rules = isReal ? (version.analysisResults?.rules || []) : [];

    const versionLabel = isReal ? version.version : (() => {
      const demoVersions = (window.DEMO_SCHEDULE_VERSIONS || []).filter(v => v.projectId === project.id);
      const latest = demoVersions.find(v => v.status === 'current') || demoVersions[demoVersions.length - 1];
      return latest ? latest.version : 'Latest Update';
    })();
    const dataDate = isReal ? this.formatDate(version.dataDate) : (() => {
      const demoVersions = (window.DEMO_SCHEDULE_VERSIONS || []).filter(v => v.projectId === project.id);
      const latest = demoVersions.find(v => v.status === 'current') || demoVersions[demoVersions.length - 1];
      return latest ? this.formatDate(latest.dataDate) : 'N/A';
    })();

    const getCount = (ruleKey) => {
      if (isReal) {
        const rule = rules.find(r => r.ruleKey === ruleKey);
        return rule ? rule.count : null;
      }
      const demoDiag = (window.DEMO_DIAGNOSTICS || []).find(d => d.ruleKey === ruleKey);
      return demoDiag ? demoDiag.count : null;
    };

    const negFloatCount = getCount('NEGATIVE_FLOAT');
    const openEndCount = getCount('OPEN_ENDS_PREDECESSOR');
    const openEndSuccCount = getCount('OPEN_ENDS_SUCCESSOR');
    const constraintsCount = getCount('EXCESSIVE_CONSTRAINTS');

    let html = `<p>The <strong>${project.name}</strong> schedule (${versionLabel}, Data Date: ${dataDate}) received an overall Validation Score of <strong class="${ragClass}">${overallScore}/100 (${ragLabel})</strong>, indicating ${overallScore >= 85 ? 'strong schedule quality with minor areas for improvement' : overallScore >= 70 ? 'moderate schedule quality concerns requiring attention' : 'significant schedule quality issues requiring immediate remediation'}.</p>`;

    html += `<p>The analysis evaluated <strong>${isReal ? version.activityCount : 'N/A'} activities</strong> and <strong>${isReal ? version.relationshipCount : 'N/A'} relationships</strong>.`;
    if (isReal && version.milestoneCount) html += ` <strong>${version.milestoneCount} milestones</strong> were identified.`;
    html += `</p>`;

    if (negFloatCount !== null && negFloatCount > 0) {
      html += `<p>The most critical finding is <strong>${negFloatCount} activities with negative total float</strong>. This indicates the schedule may not achieve its planned dates without acceleration or scope changes.</p>`;
    }

    if (logicScore !== null) {
      html += `<p><strong>Logic quality</strong> scored <span class="${logicClass}">${logicScore}/100 (${logicRag})</span>`;
      if (openEndCount || openEndSuccCount) {
        html += `, driven by ${openEndCount ? `${openEndCount} activities missing predecessor logic` : ''}${openEndCount && openEndSuccCount ? ' and ' : ''}${openEndSuccCount ? `${openEndSuccCount} missing successors` : ''}. These open ends undermine the reliability of the critical path and float calculations.`;
      } else {
        html += `. Schedule logic is well-connected.`;
      }
      html += `</p>`;
    }

    if (worstCat && worstScore < 85) {
      html += `<p>The weakest area is <strong>${worstCat.label || 'a category'}</strong> at ${worstScore}/100, which should be the primary focus for improvement.</p>`;
    }

    const actions = [];
    if (negFloatCount && negFloatCount > 0) actions.push(`Investigate and resolve ${negFloatCount} negative float activities`);
    if (constraintsCount && constraintsCount > 0) actions.push(`Review ${constraintsCount} hard constraints — DCMA threshold is < 5%`);
    if (openEndCount && openEndCount > 0) actions.push(`Close ${openEndCount} predecessor logic gaps`);
    actions.push(`Confirm data date is set accurately before the next update`);
    html += `<p><strong>Recommended actions:</strong> ${actions.map((a, i) => `(${i + 1}) ${a}.`).join(' ')}</p>`;

    el.innerHTML = html;
  },

  renderMilestones(version) {
    const container = document.querySelector('#milestonesTable');
    if (!container) return;

    if (version && version.isReal && version.milestones && version.milestones.length > 0) {
      container.innerHTML = version.milestones.map(m => {
        const isCritical = m.totalFloat !== undefined && m.totalFloat <= 0;
        const hasActual = !!m.actualFinish;
        const statusLabel = hasActual ? 'Complete' : (isCritical ? 'Critical' : 'Scheduled');
        const statusBadge = hasActual ? 'badge-success' : (isCritical ? 'badge-critical' : 'badge-info');
        const floatClass = m.totalFloat < 0 ? 'text-red' : m.totalFloat === 0 ? 'text-amber' : 'text-green';
        return `<tr>
          <td>${m.name}${isCritical ? ' <span class="badge badge-critical">Critical</span>' : ''}</td>
          <td>${this.formatDate(m.plannedFinish || m.plannedStart)}</td>
          <td>${hasActual ? this.formatDate(m.actualFinish) : this.formatDate(m.earlyFinish)}</td>
          <td class="${floatClass}">${m.totalFloat !== undefined ? (m.totalFloat > 0 ? '+' : '') + Math.round(m.totalFloat) + 'd' : 'N/A'}</td>
          <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
        </tr>`;
      }).join('');
      return;
    }

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

  renderScoreTrendChart(project, version) {
    // No-op — chart is rendered by project.html's renderTrendChart().
  },

  // ─── Diagnostics ─────────────────────────────────────────────
  renderDiagnostics() {
    const project = this._resolveCurrentProject();
    const container = document.querySelector('#diagnosticsContainer');
    if (!container) return;

    const version = project ? this._resolveCurrentVersion(project) : null;
    const hasRealData = version && version.isReal && version.analysisResults;

    if (project) {
      this._injectProjectIdIntoLinks(project);
      const projectUrl = `project.html?projectId=${project.id}`;
      const breadcrumb = document.getElementById('diagBreadcrumbLink');
      if (breadcrumb) { breadcrumb.textContent = project.name; breadcrumb.href = projectUrl; }

      if (hasRealData) {
        const totalActivities = version.activityCount || 0;
        this.setEl('#diagSubtitle', `Schedule quality issues identified in ${version.version} (Data Date: ${this.formatDate(version.dataDate)}) — ${totalActivities.toLocaleString()} activities analyzed`);
      } else {
        const versions = (window.DEMO_SCHEDULE_VERSIONS || []).filter(v => v.projectId === project.id);
        const latest = versions.find(v => v.status === 'current') || versions[versions.length - 1];
        const versionLabel = latest ? latest.version : 'Latest Update';
        const dataDate = latest ? this.formatDate(latest.dataDate) : 'N/A';
        const totalActivities = (window.DEMO_DIAGNOSTICS || []).reduce((max, d) => Math.max(max, d.totalActivities || 0), 0);
        this.setEl('#diagSubtitle', `Schedule quality issues identified in ${versionLabel} (Data Date: ${dataDate})${totalActivities ? ` — ${totalActivities.toLocaleString()} activities analyzed` : ''}`);
      }
    }

    if (hasRealData && version.analysisResults.rules) {
      const rules = version.analysisResults.rules.filter(r => r.count > 0);
      rules.sort((a, b) => b.penalty - a.penalty);
      container.innerHTML = rules.map(r => this.buildRuleDiagnosticCard(r)).join('');
    } else {
      container.innerHTML = DEMO_DIAGNOSTICS.map(d => this.buildDiagnosticCard(d)).join('');
    }

    container.querySelectorAll('.diag-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.diagnostic-card').querySelector('.diag-detail');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? 'Show Activities ▼' : 'Hide Activities ▲';
      });
    });
  },

  buildRuleDiagnosticCard(rule) {
    const sevClass = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }[rule.severity] || 'badge-info';
    const catLabel = {
      logicQuality: 'Logic Quality', dateIntegrity: 'Date Integrity',
      constraintsFloat: 'Constraints & Float', activityHygiene: 'Activity Hygiene',
      progressRealism: 'Progress Realism', criticalPathReliability: 'Critical Path Reliability'
    }[rule.category] || rule.category;

    return `
      <div class="diagnostic-card card mb-4">
        <div class="diag-header flex-between">
          <div class="flex gap-4 items-center">
            <span class="badge ${sevClass}">${rule.severity.toUpperCase()}</span>
            <span class="badge badge-info">${catLabel}</span>
            <h3 class="diag-title">${rule.title}</h3>
          </div>
          <div class="diag-stats">
            <span class="diag-count">${rule.count} of ${rule.totalActivities}</span>
            <span class="diag-percent">(${rule.percent}%)</span>
          </div>
        </div>
        <p class="diag-description mt-4">${rule.description}</p>
        <div class="diag-recommendation mt-4">
          <strong>Threshold:</strong> ${rule.threshold} &nbsp;|&nbsp; <strong>Score Penalty:</strong> -${rule.penalty.toFixed(1)} pts
        </div>
      </div>
    `;
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

  // ─── Comparison ──────────────────────────────────────────────
  renderComparison() {
    const comp = DEMO_COMPARISON;
    const project = this._resolveCurrentProject();

    if (project) {
      this._injectProjectIdIntoLinks(project);
      const projectUrl = `project.html?projectId=${project.id}`;
      const breadcrumb = document.getElementById('compBreadcrumbLink');
      if (breadcrumb) { breadcrumb.textContent = project.name; breadcrumb.href = projectUrl; }

      const narrativeEl = document.getElementById('compNarrativeBody');
      if (narrativeEl) {
        const base = comp.baseline;
        const curr = comp.current;
        const s = comp.summary;
        const scoreDir = s.scoreChange < 0 ? 'declined' : s.scoreChange > 0 ? 'improved' : 'remained unchanged';
        const scoreDirAbs = Math.abs(s.scoreChange);
        const baseScore = base.overallScore;
        const currScore = curr.overallScore;
        const currRag = currScore >= 80 ? 'Green' : currScore >= 65 ? 'Amber' : 'Red';

        const substComp = comp.milestoneChanges.find(m => m.name === 'Substantial Completion');
        const priorForecastStr = substComp ? this.formatDate(substComp.priorForecast) : 'N/A';
        const currForecastStr  = substComp ? this.formatDate(substComp.currentForecast) : 'N/A';

        const biggestSlip = [...(comp.activityChanges || [])].sort((a, b) => b.finishVariance - a.finishVariance)[0];

        narrativeEl.innerHTML = `
          <p>This comparison covers <strong>${base.version} (${this.formatDate(base.dataDate)})</strong> to <strong>${curr.version} (${this.formatDate(curr.dataDate)})</strong> for the <strong>${project.name}</strong> project.</p>

          <h4 style="margin:16px 0 8px;">Schedule Performance</h4>
          <p>The critical path has slipped by <strong class="text-red">${s.criticalPathSlip} working days</strong> between updates${biggestSlip ? `, driven primarily by delays in ${biggestSlip.name} (+${biggestSlip.finishVariance}d)` : ''}. The project's forecast substantial completion date has moved from <strong>${priorForecastStr}</strong> to <strong>${currForecastStr}</strong>, a <strong class="text-red">${s.finishDateMovement}-working-day slip</strong> against the prior update.</p>

          <h4 style="margin:16px 0 8px;">Validation Score</h4>
          <p>The overall validation score ${scoreDir}${scoreDirAbs > 0 ? ` by ${scoreDirAbs} point${scoreDirAbs !== 1 ? 's' : ''}` : ''} from <strong>${baseScore}</strong> to <strong>${currScore}</strong>, remaining in the ${currRag} range. The primary drivers of score deterioration are (1) an increase in negative float activities by ${s.negativeFloatDelta}, indicating growing schedule pressure, and (2) continued open-end logic issues.</p>

          <h4 style="margin:16px 0 8px;">Key Changes</h4>
          <p>${s.activitiesChanged} activities experienced date changes during this period. ${s.activitiesAdded} new activities were added and ${s.activitiesDeleted} were deleted, reflecting scope clarifications. ${s.logicChanges} logic changes were also recorded between updates.</p>
        `;
      }
    }

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
  },

  // ─── Data Export / Import ─────────────────────────────────────────────────
  // Export everything for the current user as a JSON backup file.
  // Code pushes never touch IndexedDB — data only changes when you upload or
  // delete inside the app. This export is a manual safety net.
  async exportAccountData() {
    await this.whenReady();
    const email    = this._currentEmail();
    const payload  = {
      _version:  2,
      _exported: new Date().toISOString(),
      _email:    email,
      projects:  this.projects,
      versions:  this.scheduleVersions
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `ConstructCheck_Backup_${email.split('@')[0]}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    this.showAlert('Backup downloaded. Keep this file safe — it contains all your project data.', 'success');
  },

  async importAccountData(file) {
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); } catch(e) {
      this.showAlert('Invalid backup file — could not parse JSON.', 'error');
      return;
    }
    if (!payload.projects || !payload.versions) {
      this.showAlert('Invalid backup file — missing projects or versions.', 'error');
      return;
    }
    if (!confirm(`This will REPLACE all current data for this account with the backup from ${payload._exported?.slice(0,10) || 'unknown date'}.\n\nAre you sure?`)) return;

    this.projects         = payload.projects  || [];
    this.scheduleVersions = payload.versions  || [];
    this.saveToStorage();
    this.showAlert(`Restored ${this.projects.length} projects and ${this.scheduleVersions.length} schedule versions.`, 'success');
    setTimeout(() => window.location.reload(), 1800);
  },

  openImportPicker() {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json';
    input.onchange = e => { if (e.target.files[0]) this.importAccountData(e.target.files[0]); };
    input.click();
  }
};

// Async init — wait for DataStore to be ready
// Exposes App.ready promise so page-specific scripts can await data loading
App._readyPromise = null;
App._readyResolve = null;
App._readyPromise = new Promise(resolve => { App._readyResolve = resolve; });
const _origInit = App.init.bind(App);
App.init = async function() {
  await _origInit();
  if (App._readyResolve) App._readyResolve();
};
// Convenience: App.whenReady() returns a promise that resolves when init is done
App.whenReady = function() { return App._readyPromise; };

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
