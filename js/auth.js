/**
 * auth.js — Construct Check authentication & usage tracking
 * Uses localStorage for persistence. Drop-in Firebase replacement ready.
 */
(function () {
  'use strict';

  const STORAGE_KEYS = {
    USERS: 'cc_users',
    SESSION: 'cc_session',
    USAGE: 'cc_usage',
  };

  // Admin accounts — always Pro, never hit paywall
  const ADMIN_EMAILS = ['speterson1477@gmail.com'];

  const FREE_UPLOAD_LIMIT = 2; // files before paywall

  /* ─── Helpers ─────────────────────────────────────────────── */
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || {}; } catch { return {}; }
  }
  function saveUsers(u) { localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(u)); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION)); } catch { return null; }
  }
  function saveSession(s) { localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(STORAGE_KEYS.SESSION); }

  function getUsage(email) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.USAGE)) || {};
      const base = all[email] || { uploads: 0, plan: 'free' };
      // Admin emails are always Pro
      if (ADMIN_EMAILS.includes(email.toLowerCase())) base.plan = 'pro';
      return base;
    } catch { return { uploads: 0, plan: 'free' }; }
  }
  function saveUsage(email, data) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.USAGE)) || {};
    all[email] = data;
    localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify(all));
  }

  // Simple hash (not for production security — use Firebase/Supabase for real auth)
  function hashPassword(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) {
      h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0;
    }
    return h.toString(36) + '_' + pw.length;
  }

  /* ─── Public API ───────────────────────────────────────────── */
  const Auth = {

    /** Returns current logged-in user or null */
    currentUser() {
      return getSession();
    },

    /** Redirect to login if not authenticated */
    requireAuth() {
      if (!this.currentUser()) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return false;
      }
      return true;
    },

    /** Register a new account */
    register(name, email, password) {
      email = email.toLowerCase().trim();
      const users = getUsers();
      if (users[email]) return { ok: false, error: 'An account with that email already exists.' };
      if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

      users[email] = { name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      saveUsers(users);
      const session = { name, email, createdAt: users[email].createdAt };
      saveSession(session);
      return { ok: true, user: session };
    },

    /** Log in with email + password */
    login(email, password) {
      email = email.toLowerCase().trim();
      const users = getUsers();
      const user = users[email];
      if (!user) return { ok: false, error: 'No account found with that email.' };
      if (user.passwordHash !== hashPassword(password)) return { ok: false, error: 'Incorrect password.' };

      const session = { name: user.name, email: user.email, createdAt: user.createdAt };
      saveSession(session);
      return { ok: true, user: session };
    },

    /** Log out */
    logout() {
      clearSession();
      window.location.href = 'index.html';
    },

    /* ─── Usage / Paywall ───────────────────────────────────── */

    /** Record a file upload. Returns { allowed, uploadsUsed, limit, isPro } */
    recordUpload() {
      const user = this.currentUser();
      if (!user) return { allowed: false };
      const usage = getUsage(user.email);
      if (usage.plan === 'pro') return { allowed: true, uploadsUsed: usage.uploads + 1, limit: Infinity, isPro: true };

      const newCount = usage.uploads + 1;
      if (newCount > FREE_UPLOAD_LIMIT) {
        return { allowed: false, uploadsUsed: usage.uploads, limit: FREE_UPLOAD_LIMIT, isPro: false };
      }
      usage.uploads = newCount;
      saveUsage(user.email, usage);
      return { allowed: true, uploadsUsed: newCount, limit: FREE_UPLOAD_LIMIT, isPro: false };
    },

    /** Get current usage for the logged-in user */
    getUsage() {
      const user = this.currentUser();
      if (!user) return { uploads: 0, plan: 'free', limit: FREE_UPLOAD_LIMIT };
      const usage = getUsage(user.email);
      return { ...usage, limit: FREE_UPLOAD_LIMIT };
    },

    /** Reset password — verifies email exists, then updates the stored hash */
    resetPassword(email, newPassword) {
      email = email.toLowerCase().trim();
      const users = getUsers();
      if (!users[email]) return { ok: false, error: 'No account found with that email address.' };
      if (newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
      users[email].passwordHash = hashPassword(newPassword);
      saveUsers(users);
      return { ok: true };
    },

    /** Upgrade to pro (placeholder — wire to Stripe) */
    upgradeToPro() {
      const user = this.currentUser();
      if (!user) return;
      const usage = getUsage(user.email);
      usage.plan = 'pro';
      saveUsage(user.email, usage);
      window.location.reload();
    },

    /** Render user info into elements with data-auth-* attributes */
    renderUserState() {
      const user = this.currentUser();
      const usage = this.getUsage();

      // Avatar initials
      const avatarEl = document.getElementById('userAvatarInitial');
      if (avatarEl && user) {
        const parts = user.name.trim().split(' ');
        avatarEl.textContent = parts.length > 1
          ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
          : user.name.slice(0, 2).toUpperCase();
      }

      document.querySelectorAll('[data-auth-name]').forEach(el => {
        el.textContent = user ? user.name : '';
      });
      document.querySelectorAll('[data-auth-email]').forEach(el => {
        el.textContent = user ? user.email : '';
      });
      document.querySelectorAll('[data-auth-plan]').forEach(el => {
        const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());
        const label = isAdmin ? 'Admin ★' : (usage.plan === 'pro' ? 'Pro' : 'Free Trial');
        el.textContent = label;
        el.className = (el.className || '').replace(/plan-\w+/g, '') + (isAdmin || usage.plan === 'pro' ? ' plan-pro' : ' plan-free');
      });
      document.querySelectorAll('[data-auth-uploads]').forEach(el => {
        el.textContent = `${usage.uploads} / ${usage.plan === 'pro' ? '∞' : usage.limit}`;
      });

      // Make the sidebar user block clickable — opens account panel
      const sidebarUser = document.querySelector('.sidebar-bottom .sidebar-user, .sidebar-user');
      if (sidebarUser && !sidebarUser.dataset.accountBound) {
        sidebarUser.dataset.accountBound = '1';
        sidebarUser.style.cursor = 'pointer';
        sidebarUser.title = 'View account';
        sidebarUser.addEventListener('click', (e) => {
          // Don't open if they clicked the logout button itself
          if (e.target.closest('.sidebar-logout-btn')) return;
          showAccountPanel();
        });
      }
    },
  };

  /* ─── Inject clickable sidebar-user hover style ─────────────── */
  (function() {
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

  /* ─── Account Panel ──────────────────────────────────────────── */
  function showAccountPanel() {
    const existing = document.getElementById('cc-account-panel');
    if (existing) { existing.style.display = 'flex'; return; }

    const user   = Auth.currentUser();
    const usage  = Auth.getUsage();
    if (!user) return;

    const isAdmin   = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const isPro     = isAdmin || usage.plan === 'pro';
    const planLabel = isAdmin ? 'Admin ★' : isPro ? 'Pro' : 'Free Trial';
    const planColor = isPro ? '#7c6fe0' : '#94a3b8';
    const uploadsUsed = usage.uploads || 0;
    const uploadsLimit = isPro ? null : usage.limit;
    const uploadPct = uploadsLimit ? Math.min(100, Math.round(uploadsUsed / uploadsLimit * 100)) : 100;

    const joined = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';

    // Avatar initials
    const parts = user.name.trim().split(' ');
    const initials = parts.length > 1
      ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
      : user.name.slice(0, 2).toUpperCase();

    const overlay = document.createElement('div');
    overlay.id = 'cc-account-panel';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,11,30,0.6);display:flex;align-items:center;justify-content:center;z-index:9500;backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div id="cc-account-inner" style="background:#fff;border-radius:20px;width:min(480px,94vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.25);font-family:inherit;">

        <!-- Header band -->
        <div style="background:linear-gradient(135deg,#1a1535,#0d0b1e);border-radius:20px 20px 0 0;padding:32px 28px 24px;position:relative;">
          <button id="ccAccountClose" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.12);border:none;color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#7c6fe0,#a593f5);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials}</div>
            <div>
              <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:4px;">${user.name}</div>
              <div style="font-size:13px;color:#94a3b8;">${user.email}</div>
              <span style="display:inline-block;margin-top:6px;background:${planColor}22;color:${planColor};border:1px solid ${planColor}55;border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${planLabel}</span>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div style="padding:24px 28px;display:flex;flex-direction:column;gap:20px;">

          <!-- Info rows -->
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
          </div>

          <!-- Upload usage -->
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:600;color:#374151;">Schedule Uploads</span>
              <span style="font-size:13px;color:#64748b;">${uploadsUsed} / ${uploadsLimit != null ? uploadsLimit : '∞'}</span>
            </div>
            ${uploadsLimit != null ? `
            <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${uploadPct}%;background:${uploadPct >= 100 ? '#ef4444' : '#7c6fe0'};border-radius:3px;transition:width 0.4s;"></div>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:5px;">${uploadsLimit - uploadsUsed > 0 ? `${uploadsLimit - uploadsUsed} upload${uploadsLimit - uploadsUsed !== 1 ? 's' : ''} remaining on Free Trial` : 'Free upload limit reached — upgrade for unlimited'}</div>
            ` : `<div style="font-size:11px;color:#7c6fe0;margin-top:2px;">Unlimited uploads on ${planLabel}</div>`}
          </div>

          <!-- Change password -->
          <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <button id="ccPwToggle" onclick="document.getElementById('ccPwForm').style.display=document.getElementById('ccPwForm').style.display==='none'?'block':'none'; this.textContent=document.getElementById('ccPwForm').style.display==='block'?'▲ Change Password':'▼ Change Password';"
              style="width:100%;padding:14px 18px;background:#f8fafc;border:none;text-align:left;font-size:14px;font-weight:600;color:#374151;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c6fe0" stroke-width="2.2" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
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

          <!-- Actions -->
          <button onclick="CC.Auth.logout()" style="width:100%;padding:12px;border:1.5px solid #fecaca;border-radius:10px;background:#fff;color:#dc2626;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='#fff'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>

        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    document.getElementById('ccAccountClose').addEventListener('click', () => { overlay.style.display = 'none'; });

    // Change password handler
    document.getElementById('ccSavePw').addEventListener('click', () => {
      const pw  = document.getElementById('ccNewPw').value;
      const pw2 = document.getElementById('ccConfirmPw').value;
      const errEl = document.getElementById('ccPwError');
      const okEl  = document.getElementById('ccPwSuccess');
      errEl.style.display = 'none'; okEl.style.display = 'none';

      if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

      const result = Auth.resetPassword(user.email, pw);
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

  /* ─── Paywall Modal ─────────────────────────────────────────── */
  function showPaywallModal() {
    const existing = document.getElementById('cc-paywall-modal');
    if (existing) { existing.style.display = 'flex'; return; }

    const overlay = document.createElement('div');
    overlay.id = 'cc-paywall-modal';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(13,11,30,0.85);
      display:flex;align-items:center;justify-content:center;z-index:9000;
      backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.3);">
        <div style="font-size:48px;margin-bottom:16px;">🚀</div>
        <h2 style="font-size:24px;font-weight:800;color:#1e1b4b;margin:0 0 10px">You've used your free upload</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 28px">
          Your free trial includes <strong>2 file uploads</strong> — enough to run one full comparison.
          Upgrade to <strong>Pro</strong> for unlimited uploads at just <strong>$20/month</strong>.
        </p>
        <div style="background:#f8f7ff;border:2px solid #7c6fe0;border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="font-size:32px;font-weight:800;color:#5b4ec4">$20<span style="font-size:16px;font-weight:500;color:#64748b">/month</span></div>
          <ul style="text-align:left;margin:12px 0 0;padding-left:20px;color:#1e293b;font-size:14px;line-height:2;">
            <li>Unlimited P6 file uploads</li>
            <li>Unlimited schedule comparisons</li>
            <li>Full DCMA+ diagnostic reports</li>
            <li>Critical path & logic analysis</li>
            <li>Priority support</li>
          </ul>
        </div>
        <button onclick="window.location.href='index.html#pricing'"
          style="width:100%;padding:14px;background:#7c6fe0;color:#fff;font-size:16px;font-weight:700;border:none;border-radius:10px;cursor:pointer;margin-bottom:12px;">
          Upgrade to Pro — $20/mo
        </button>
        <button onclick="document.getElementById('cc-paywall-modal').style.display='none'"
          style="width:100%;padding:12px;background:transparent;color:#94a3b8;font-size:14px;border:none;cursor:pointer;">
          Maybe later
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  /* ─── One-time migration: clear old shared storage key ─────── */
  // Previous builds stored projects under 'sv_projects' (global).
  // Remove it so per-user keys take over cleanly.
  (function() {
    if (localStorage.getItem('sv_projects')) {
      localStorage.removeItem('sv_projects');
      localStorage.removeItem('sv_versions');
    }
    // Also remove old per-user key if it was seeded with real project names
    // (force re-seed by bumping the migration flag)
    const migKey = 'cc_migration_v3';
    if (!localStorage.getItem(migKey)) {
      // Wipe any per-user project storage so admin gets superhero re-seed
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('cc_projects_') || k.startsWith('cc_versions_')) {
          localStorage.removeItem(k);
        }
      });
      localStorage.setItem(migKey, '1');
    }
  })();

  /* ─── Expose globally ───────────────────────────────────────── */
  window.CC = window.CC || {};
  window.CC.Auth = Auth;
  window.CC.showPaywallModal = showPaywallModal;

})();
