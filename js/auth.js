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
      return all[email] || { uploads: 0, plan: 'free' };
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
        el.textContent = usage.plan === 'pro' ? 'Pro' : 'Free';
        el.className = (el.className || '').replace(/plan-\w+/g, '') + (usage.plan === 'pro' ? ' plan-pro' : ' plan-free');
      });
      document.querySelectorAll('[data-auth-uploads]').forEach(el => {
        el.textContent = `${usage.uploads} / ${usage.plan === 'pro' ? '∞' : usage.limit}`;
      });
    },
  };

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

  /* ─── Expose globally ───────────────────────────────────────── */
  window.CC = window.CC || {};
  window.CC.Auth = Auth;
  window.CC.showPaywallModal = showPaywallModal;

})();
