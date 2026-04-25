/**
 * auth.js — Construct Check authentication
 *
 * Dual-mode: uses Firebase Auth when firebase-config.js has real keys,
 * falls back to localStorage when Firebase is not yet configured.
 * Everything works in localStorage mode — Firebase just adds cross-device sync.
 */
(function () {
  'use strict';

  // ── Firebase detection ──────────────────────────────────────────
  const FB_OK = (function () {
    try {
      return (
        typeof firebase !== 'undefined' &&
        typeof window.CC_FIREBASE_CONFIG !== 'undefined' &&
        window.CC_FIREBASE_CONFIG.apiKey &&
        !window.CC_FIREBASE_CONFIG.apiKey.startsWith('REPLACE')
      );
    } catch (e) { return false; }
  })();

  let _fbAuth = null;
  if (FB_OK) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.CC_FIREBASE_CONFIG);
      _fbAuth = firebase.auth();
    } catch (e) { console.error('[Auth] Firebase init failed:', e); }
  }

  // ── Session state ───────────────────────────────────────────────
  let _session = null;        // { name, email, createdAt }
  let _sessionReady = false;
  const _readyCbs = [];

  function _onReady(cb) {
    if (_sessionReady) { cb(_session); return; }
    _readyCbs.push(cb);
  }
  function _setReady(session) {
    _session = session;
    _sessionReady = true;
    _readyCbs.forEach(cb => cb(session));
    _readyCbs.length = 0;
  }

  // ── LocalStorage helpers ────────────────────────────────────────
  const LS = { USERS: 'cc_users', SESSION: 'cc_session', USAGE: 'cc_usage' };
  const lsGet  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet  = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const lsDel  = k => localStorage.removeItem(k);

  function hashPw(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0;
    return h.toString(36) + '_' + pw.length;
  }

  // ── Usage / plan helpers ────────────────────────────────────────
  const ADMIN_EMAILS = ['speterson1477@gmail.com'];
  const FREE_LIMIT   = 2;

  function _usageFor(email) {
    const all  = lsGet(LS.USAGE) || {};
    const base = all[email] || { uploads: 0, plan: 'free' };
    if (ADMIN_EMAILS.includes(email.toLowerCase())) base.plan = 'pro';
    return base;
  }
  function _saveUsage(email, data) {
    const all = lsGet(LS.USAGE) || {};
    all[email] = data;
    lsSet(LS.USAGE, all);
  }

  // ── Resolve initial session ─────────────────────────────────────
  if (FB_OK && _fbAuth) {
    _fbAuth.onAuthStateChanged(fbUser => {
      if (fbUser) {
        _setReady({
          name:      fbUser.displayName || fbUser.email.split('@')[0],
          email:     fbUser.email,
          createdAt: new Date(fbUser.metadata.creationTime).getTime(),
        });
      } else {
        _setReady(null);
      }
    });
  } else {
    // localStorage mode — session is synchronously available
    _setReady(lsGet(LS.SESSION));
  }

  // ── Public API ──────────────────────────────────────────────────
  const Auth = {

    /** Returns current session synchronously (may be null briefly on first Firebase load) */
    currentUser() { return _session; },

    /**
     * Returns a Promise that resolves with the session once auth state is known.
     * On protected pages, redirects to login if unauthenticated.
     */
    requireAuth() {
      return new Promise(resolve => {
        _onReady(session => {
          if (!session) {
            window.location.href =
              'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
          } else {
            resolve(session);
          }
        });
      });
    },

    /** Sign in — works with Firebase or localStorage */
    async login(email, password) {
      email = email.toLowerCase().trim();
      if (FB_OK && _fbAuth) {
        try {
          await _fbAuth.signInWithEmailAndPassword(email, password);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: _fbErrMsg(err) };
        }
      }
      // localStorage fallback
      const users = lsGet(LS.USERS) || {};
      const user  = users[email];
      if (!user) return { ok: false, error: 'No account found with that email.' };
      if (user.passwordHash !== hashPw(password)) return { ok: false, error: 'Incorrect password.' };
      const session = { name: user.name, email: user.email, createdAt: user.createdAt };
      lsSet(LS.SESSION, session);
      _session = session;
      return { ok: true };
    },

    /** Register a new account */
    async register(name, email, password) {
      email = email.toLowerCase().trim();
      if (FB_OK && _fbAuth) {
        try {
          const cred = await _fbAuth.createUserWithEmailAndPassword(email, password);
          await cred.user.updateProfile({ displayName: name });
          _session = { name, email, createdAt: Date.now() };
          return { ok: true };
        } catch (err) {
          return { ok: false, error: _fbErrMsg(err) };
        }
      }
      // localStorage fallback
      const users = lsGet(LS.USERS) || {};
      if (users[email]) return { ok: false, error: 'An account with that email already exists.' };
      if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
      users[email] = { name, email, passwordHash: hashPw(password), createdAt: Date.now() };
      lsSet(LS.USERS, users);
      const session = { name, email, createdAt: users[email].createdAt };
      lsSet(LS.SESSION, session);
      _session = session;
      return { ok: true };
    },

    /** Sign out */
    logout() {
      if (FB_OK && _fbAuth) {
        _fbAuth.signOut().finally(() => { window.location.href = 'index.html'; });
      } else {
        lsDel(LS.SESSION);
        _session = null;
        window.location.href = 'index.html';
      }
    },

    /**
     * Send a real password-reset email (Firebase mode) or reset inline (localStorage mode).
     * Used by the "Forgot password?" flow on login.html.
     */
    async sendPasswordResetEmail(email) {
      email = email.toLowerCase().trim();
      if (FB_OK && _fbAuth) {
        try {
          await _fbAuth.sendPasswordResetEmail(email);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: _fbErrMsg(err) };
        }
      }
      return { ok: false, error: 'firebase_not_configured' };
    },

    /**
     * Reset password directly — used in account panel (logged-in user) and
     * the inline reset form when Firebase is not configured.
     */
    async resetPassword(email, newPassword) {
      email = email.toLowerCase().trim();
      if (FB_OK && _fbAuth) {
        const fbUser = _fbAuth.currentUser;
        if (!fbUser) return { ok: false, error: 'You must be signed in to change your password.' };
        try {
          await fbUser.updatePassword(newPassword);
          return { ok: true };
        } catch (err) {
          if (err.code === 'auth/requires-recent-login')
            return { ok: false, error: 'For security, please sign out and sign back in before changing your password.' };
          return { ok: false, error: _fbErrMsg(err) };
        }
      }
      // localStorage fallback
      const users = lsGet(LS.USERS) || {};
      if (!users[email]) return { ok: false, error: 'No account found with that email address.' };
      if (newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
      users[email].passwordHash = hashPw(newPassword);
      lsSet(LS.USERS, users);
      return { ok: true };
    },

    // ── Usage / Paywall ─────────────────────────────────────────
    recordUpload() {
      const user = this.currentUser();
      if (!user) return { allowed: false };
      const usage = _usageFor(user.email);
      if (usage.plan === 'pro') return { allowed: true, uploadsUsed: usage.uploads + 1, limit: Infinity, isPro: true };
      const n = usage.uploads + 1;
      if (n > FREE_LIMIT) return { allowed: false, uploadsUsed: usage.uploads, limit: FREE_LIMIT, isPro: false };
      usage.uploads = n;
      _saveUsage(user.email, usage);
      return { allowed: true, uploadsUsed: n, limit: FREE_LIMIT, isPro: false };
    },

    getUsage() {
      const user = this.currentUser();
      if (!user) return { uploads: 0, plan: 'free', limit: FREE_LIMIT };
      return { ..._usageFor(user.email), limit: FREE_LIMIT };
    },

    upgradeToPro() {
      const user = this.currentUser();
      if (!user) return;
      const usage = _usageFor(user.email);
      usage.plan = 'pro';
      _saveUsage(user.email, usage);
      window.location.reload();
    },

    // ── UI helpers ──────────────────────────────────────────────
    renderUserState() {
      const user  = this.currentUser();
      const usage = this.getUsage();

      const avatarEl = document.getElementById('userAvatarInitial');
      if (avatarEl && user) {
        const parts = user.name.trim().split(' ');
        avatarEl.textContent = parts.length > 1
          ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
          : user.name.slice(0, 2).toUpperCase();
      }

      document.querySelectorAll('[data-auth-name]').forEach(el => { el.textContent = user ? user.name : ''; });
      document.querySelectorAll('[data-auth-email]').forEach(el => { el.textContent = user ? user.email : ''; });
      document.querySelectorAll('[data-auth-plan]').forEach(el => {
        const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());
        const label   = isAdmin ? 'Admin ★' : (usage.plan === 'pro' ? 'Pro' : 'Free Trial');
        el.textContent = label;
        el.className   = (el.className || '').replace(/plan-\w+/g, '') +
          (isAdmin || usage.plan === 'pro' ? ' plan-pro' : ' plan-free');
      });
      document.querySelectorAll('[data-auth-uploads]').forEach(el => {
        el.textContent = `${usage.uploads} / ${usage.plan === 'pro' ? '∞' : usage.limit}`;
      });

      // Sidebar user block → clickable
      const sidebarUser = document.querySelector('.sidebar-bottom .sidebar-user, .sidebar-user');
      if (sidebarUser && !sidebarUser.dataset.accountBound) {
        sidebarUser.dataset.accountBound = '1';
        sidebarUser.style.cursor = 'pointer';
        sidebarUser.title = 'View account';
        sidebarUser.addEventListener('click', e => {
          if (e.target.closest('.sidebar-logout-btn')) return;
          showAccountPanel();
        });
      }
    },
  };

  // ── Firebase error messages ─────────────────────────────────────
  function _fbErrMsg(err) {
    const map = {
      'auth/user-not-found':      'No account found with that email.',
      'auth/wrong-password':      'Incorrect password.',
      'auth/email-already-in-use':'An account with that email already exists.',
      'auth/weak-password':       'Password must be at least 6 characters.',
      'auth/invalid-email':       'Invalid email address.',
      'auth/too-many-requests':   'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.',
    };
    return map[err.code] || err.message;
  }

  // ── Inject hover style for sidebar user block ───────────────────
  (function () {
    const s = document.createElement('style');
    s.textContent = `
      .sidebar-bottom .sidebar-user:hover,
      .sidebar-user:not([data-no-hover]):hover {
        background: rgba(124,111,224,0.15) !important;
        border-radius: 10px;
        transition: background 0.2s;
      }
    `;
    document.head.appendChild(s);
  })();

  // ── Account Panel ───────────────────────────────────────────────
  function showAccountPanel() {
    const existing = document.getElementById('cc-account-panel');
    if (existing) { existing.style.display = 'flex'; return; }

    const user  = Auth.currentUser();
    const usage = Auth.getUsage();
    if (!user) return;

    const isAdmin   = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const isPro     = isAdmin || usage.plan === 'pro';
    const planLabel = isAdmin ? 'Admin ★' : isPro ? 'Pro' : 'Free Trial';
    const planColor = isPro ? '#7c6fe0' : '#94a3b8';
    const uploadsUsed  = usage.uploads || 0;
    const uploadsLimit = isPro ? null : usage.limit;
    const uploadPct    = uploadsLimit ? Math.min(100, Math.round(uploadsUsed / uploadsLimit * 100)) : 100;
    const joined = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const parts   = user.name.trim().split(' ');
    const initials = parts.length > 1
      ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
      : user.name.slice(0, 2).toUpperCase();
    const fbBadge = FB_OK
      ? '<span style="background:#e8f5e9;color:#2e7d32;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:700;margin-left:6px;">⚡ Cloud Sync ON</span>'
      : '<span style="background:#fff8e1;color:#f57f17;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:700;margin-left:6px;">⚠ Local Storage Only</span>';

    const overlay = document.createElement('div');
    overlay.id = 'cc-account-panel';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,11,30,0.6);display:flex;align-items:center;justify-content:center;z-index:9500;backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;width:min(480px,94vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.25);font-family:inherit;">
        <div style="background:linear-gradient(135deg,#1a1535,#0d0b1e);border-radius:20px 20px 0 0;padding:32px 28px 24px;position:relative;">
          <button id="ccAccountClose" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.12);border:none;color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#7c6fe0,#a593f5);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials}</div>
            <div>
              <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:4px;">${user.name}</div>
              <div style="font-size:13px;color:#94a3b8;">${user.email}</div>
              <div style="margin-top:6px;">
                <span style="background:${planColor}22;color:${planColor};border:1px solid ${planColor}55;border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;text-transform:uppercase;">${planLabel}</span>
                ${fbBadge}
              </div>
            </div>
          </div>
        </div>
        <div style="padding:24px 28px;display:flex;flex-direction:column;gap:20px;">
          <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;color:#64748b;font-weight:500;">Email</span>
              <span style="font-size:13px;font-weight:600;color:#1e293b;">${user.email}</span>
            </div>
            <div style="height:1px;background:#e2e8f0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;color:#64748b;font-weight:500;">Plan</span>
              <span style="font-size:13px;font-weight:700;color:${planColor};">${planLabel}</span>
            </div>
            <div style="height:1px;background:#e2e8f0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;color:#64748b;font-weight:500;">Member since</span>
              <span style="font-size:13px;font-weight:600;color:#1e293b;">${joined}</span>
            </div>
            <div style="height:1px;background:#e2e8f0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;color:#64748b;font-weight:500;">Auth mode</span>
              <span style="font-size:13px;font-weight:600;color:${FB_OK ? '#2e7d32' : '#f57f17'};">${FB_OK ? 'Firebase (cross-device)' : 'Local storage only'}</span>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:600;color:#374151;">Schedule Uploads</span>
              <span style="font-size:13px;color:#64748b;">${uploadsUsed} / ${uploadsLimit != null ? uploadsLimit : '∞'}</span>
            </div>
            ${uploadsLimit != null ? `
            <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${uploadPct}%;background:${uploadPct >= 100 ? '#ef4444' : '#7c6fe0'};border-radius:3px;"></div>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:5px;">${uploadsLimit - uploadsUsed > 0 ? `${uploadsLimit - uploadsUsed} upload${uploadsLimit - uploadsUsed !== 1 ? 's' : ''} remaining` : 'Limit reached — upgrade for unlimited'}</div>
            ` : `<div style="font-size:11px;color:#7c6fe0;margin-top:2px;">Unlimited uploads</div>`}
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <button id="ccPwToggle"
              style="width:100%;padding:14px 18px;background:#f8fafc;border:none;text-align:left;font-size:14px;font-weight:600;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c6fe0" stroke-width="2.2" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              ▼ Change Password
            </button>
            <div id="ccPwForm" style="display:none;padding:16px 18px;border-top:1px solid #e2e8f0;">
              <div id="ccPwError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px;"></div>
              <div id="ccPwSuccess" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px;"></div>
              <div style="margin-bottom:10px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">New password</label>
                <input id="ccNewPw" type="password" placeholder="At least 6 characters" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit;outline:none;" />
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;">Confirm password</label>
                <input id="ccConfirmPw" type="password" placeholder="Repeat new password" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit;outline:none;" />
              </div>
              <button id="ccSavePw" style="padding:9px 20px;background:#7c6fe0;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Save New Password</button>
            </div>
          </div>
          <button onclick="CC.Auth.logout()" style="width:100%;padding:12px;border:1.5px solid #fecaca;border-radius:10px;background:#fff;color:#dc2626;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='#fff'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    document.getElementById('ccAccountClose').addEventListener('click', () => { overlay.style.display = 'none'; });

    document.getElementById('ccPwToggle').addEventListener('click', function () {
      const form = document.getElementById('ccPwForm');
      const open = form.style.display === 'none';
      form.style.display = open ? 'block' : 'none';
      this.querySelector('svg').nextSibling.textContent = (open ? '▲' : '▼') + ' Change Password';
    });

    document.getElementById('ccSavePw').addEventListener('click', async () => {
      const pw   = document.getElementById('ccNewPw').value;
      const pw2  = document.getElementById('ccConfirmPw').value;
      const errEl = document.getElementById('ccPwError');
      const okEl  = document.getElementById('ccPwSuccess');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
      const result = await Auth.resetPassword(user.email, pw);
      if (result.ok) {
        okEl.textContent = 'Password updated successfully.';
        okEl.style.display = 'block';
        document.getElementById('ccNewPw').value = '';
        document.getElementById('ccConfirmPw').value = '';
      } else {
        errEl.textContent = result.error;
        errEl.style.display = 'block';
      }
    });
  }

  // ── One-time migration ──────────────────────────────────────────
  (function () {
    if (localStorage.getItem('sv_projects')) {
      localStorage.removeItem('sv_projects');
      localStorage.removeItem('sv_versions');
    }
    const migKey = 'cc_migration_v3';
    if (!localStorage.getItem(migKey)) {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('cc_projects_') || k.startsWith('cc_versions_')) localStorage.removeItem(k);
      });
      localStorage.setItem(migKey, '1');
    }
  })();

  // ── Expose globally ─────────────────────────────────────────────
  window.CC       = window.CC || {};
  window.CC.Auth  = Auth;
  window.CC.FB_OK = FB_OK;

  window.CC.showPaywallModal = function () {
    const existing = document.getElementById('cc-paywall-modal');
    if (existing) { existing.style.display = 'flex'; return; }
    const overlay = document.createElement('div');
    overlay.id = 'cc-paywall-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,11,30,0.85);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px);';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.3);">
        <div style="font-size:48px;margin-bottom:16px;">🚀</div>
        <h2 style="font-size:24px;font-weight:800;color:#1e1b4b;margin:0 0 10px">You've used your free upload</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px">Your free trial includes <strong>2 file uploads</strong>. Upgrade to <strong>Pro</strong> for unlimited uploads at <strong>$20/month</strong>.</p>
        <div style="background:#f8f7ff;border:2px solid #7c6fe0;border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="font-size:32px;font-weight:800;color:#5b4ec4">$20<span style="font-size:16px;font-weight:500;color:#64748b">/month</span></div>
          <ul style="text-align:left;margin:12px 0 0;padding-left:20px;color:#1e293b;font-size:14px;line-height:2;">
            <li>Unlimited P6 file uploads</li><li>Unlimited schedule comparisons</li>
            <li>Full DCMA+ diagnostic reports</li><li>Critical path & logic analysis</li>
            <li>Priority support</li>
          </ul>
        </div>
        <button onclick="window.location.href='index.html#pricing'" style="width:100%;padding:14px;background:#7c6fe0;color:#fff;font-size:16px;font-weight:700;border:none;border-radius:10px;cursor:pointer;margin-bottom:12px;">Upgrade to Pro — $20/mo</button>
        <button onclick="document.getElementById('cc-paywall-modal').style.display='none'" style="width:100%;padding:12px;background:transparent;color:#94a3b8;font-size:14px;border:none;cursor:pointer;">Maybe later</button>
      </div>`;
    document.body.appendChild(overlay);
  };

})();
