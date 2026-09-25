/**
 * ZeroSpot Cookie & Persistent Authentication Manager
 * Handles long-lived auth cookies (30-day persistence), localStorage caching,
 * seamless auto-login across browser restarts, and cookie preferences management.
 */

(function () {
  'use strict';

  // --------------------------------------------------
  // 1. Low-level Cookie Utilities
  // --------------------------------------------------
  const ZS_Cookies = {
    set(name, value, days = 30) {
      try {
        const maxAge = days * 24 * 60 * 60;
        const encodedValue = encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
        document.cookie = `${encodeURIComponent(name)}=${encodedValue}; path=/; max-age=${maxAge}; SameSite=Lax`;
      } catch (err) {
        console.warn('[ZeroSpot Cookie] Error setting cookie:', err);
      }
    },

    get(name) {
      try {
        if (!document.cookie) return null;
        const cookies = document.cookie.split(';');
        const targetKey = encodeURIComponent(name);
        for (let c of cookies) {
          c = c.trim();
          const eqIdx = c.indexOf('=');
          if (eqIdx !== -1) {
            const key = c.substring(0, eqIdx);
            if (key === targetKey) {
              const val = c.substring(eqIdx + 1);
              return decodeURIComponent(val);
            }
          }
        }
      } catch (err) {
        console.warn('[ZeroSpot Cookie] Error reading cookie:', err);
      }
      return null;
    },

    delete(name) {
      try {
        document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
      } catch (err) {
        console.warn('[ZeroSpot Cookie] Error deleting cookie:', err);
      }
    }
  };

  // --------------------------------------------------
  // 2. High-level Persistent Auth & Cache Manager
  // --------------------------------------------------
  const ZS_Auth = {
    COOKIE_USER: 'zs_user',
    COOKIE_TOKEN: 'zs_id_token',
    COOKIE_ACTIVE: 'zs_auth_active',

    /**
     * Save user session to Cookies (30 days), LocalStorage, and SessionStorage.
     * Keeps user logged in across browser restarts so they don't need to login everytime.
     */
    saveSession(userData, token = null) {
      if (!userData) return;
      const userPayload = typeof userData === 'string' ? userData : JSON.stringify(userData);

      // 1. Cookies (Persistent across browser closures, 30 days)
      ZS_Cookies.set(this.COOKIE_USER, userPayload, 30);
      if (token) ZS_Cookies.set(this.COOKIE_TOKEN, token, 30);
      ZS_Cookies.set(this.COOKIE_ACTIVE, 'true', 30);

      // 2. LocalStorage (Browser cache persistence)
      try {
        localStorage.setItem(this.COOKIE_USER, userPayload);
        if (token) localStorage.setItem(this.COOKIE_TOKEN, token);
        localStorage.setItem(this.COOKIE_ACTIVE, 'true');
        localStorage.setItem('zs_mode', 'customer');
      } catch (e) {}

      // 3. SessionStorage (Active window fast access)
      try {
        sessionStorage.setItem(this.COOKIE_USER, userPayload);
        if (token) sessionStorage.setItem(this.COOKIE_TOKEN, token);
        sessionStorage.setItem('zs_mode', 'customer');
      } catch (e) {}
    },

    /**
     * Retrieve active user session from memory, browser cache, or persistent cookies.
     * Automatically synchronizes between storage types if missing in one.
     */
    getUser() {
      let raw = null;

      // Check SessionStorage -> LocalStorage -> Cookies
      try { raw = sessionStorage.getItem(this.COOKIE_USER); } catch (e) {}
      if (!raw) {
        try { raw = localStorage.getItem(this.COOKIE_USER); } catch (e) {}
      }
      if (!raw) {
        raw = ZS_Cookies.get(this.COOKIE_USER);
      }

      if (!raw) return null;

      try {
        const user = typeof raw === 'object' ? raw : JSON.parse(raw);
        if (user && (user.uid || user.email || user.name)) {
          // Re-hydrate missing storages for zero friction
          const payloadStr = JSON.stringify(user);
          try {
            if (!sessionStorage.getItem(this.COOKIE_USER)) sessionStorage.setItem(this.COOKIE_USER, payloadStr);
            if (!localStorage.getItem(this.COOKIE_USER)) localStorage.setItem(this.COOKIE_USER, payloadStr);
            if (!ZS_Cookies.get(this.COOKIE_USER)) ZS_Cookies.set(this.COOKIE_USER, payloadStr, 30);
          } catch (e) {}
          return user;
        }
      } catch (e) {
        console.warn('[ZeroSpot Auth] Malformed session data, clearing:', e);
        this.clearSession();
      }
      return null;
    },

    getToken() {
      let token = null;
      try { token = sessionStorage.getItem(this.COOKIE_TOKEN); } catch (e) {}
      if (!token) {
        try { token = localStorage.getItem(this.COOKIE_TOKEN); } catch (e) {}
      }
      if (!token) {
        token = ZS_Cookies.get(this.COOKIE_TOKEN);
      }
      return token;
    },

    isLoggedIn() {
      return this.getUser() !== null;
    },

    clearSession() {
      // Clear cookies
      ZS_Cookies.delete(this.COOKIE_USER);
      ZS_Cookies.delete(this.COOKIE_TOKEN);
      ZS_Cookies.delete(this.COOKIE_ACTIVE);

      // Clear storages
      try {
        sessionStorage.removeItem(this.COOKIE_USER);
        sessionStorage.removeItem(this.COOKIE_TOKEN);
        sessionStorage.removeItem('zs_mode');
        localStorage.removeItem(this.COOKIE_USER);
        localStorage.removeItem(this.COOKIE_TOKEN);
        localStorage.removeItem(this.COOKIE_ACTIVE);
        localStorage.removeItem('zs_mode');
      } catch (e) {}
    }
  };

  // --------------------------------------------------
  // 3. User-Facing Cookie Consent & Management UI
  // --------------------------------------------------
  const ZS_CookieBanner = {
    CONSENT_KEY: 'zs_cookie_consent',

    init() {
      // Don't show if already agreed or preferred
      const hasConsented = ZS_Cookies.get(this.CONSENT_KEY) || localStorage.getItem(this.CONSENT_KEY);
      if (hasConsented) return;

      // Inject banner when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.renderBanner());
      } else {
        this.renderBanner();
      }
    },

    renderBanner() {
      if (document.getElementById('zs-cookie-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'zs-cookie-banner';
      banner.className = 'fixed bottom-4 left-4 right-4 sm:left-6 sm:max-w-md z-50 p-4 sm:p-5 rounded-3xl bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/80 shadow-2xl transition-all duration-300';
      banner.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg shrink-0 border border-emerald-500/30">
            🍪
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold uppercase tracking-wider text-emerald-400">Cookie &amp; Session Cache</h4>
            <p class="mt-1 text-xs text-slate-300 leading-relaxed">
              ZeroSpot uses secure browser cookies to keep you signed in automatically and remember your service bookings so you never have to login every time.
            </p>
            <div class="mt-3 flex items-center gap-2">
              <button id="zs-accept-cookies-btn" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition cursor-pointer">
                Accept &amp; Stay Signed In
              </button>
              <button id="zs-manage-cookies-btn" class="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-semibold text-xs transition cursor-pointer">
                Manage
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(banner);

      document.getElementById('zs-accept-cookies-btn').addEventListener('click', () => {
        this.acceptAll();
      });

      document.getElementById('zs-manage-cookies-btn').addEventListener('click', () => {
        this.openPreferencesModal();
      });
    },

    acceptAll() {
      ZS_Cookies.set(this.CONSENT_KEY, 'accepted', 365);
      try { localStorage.setItem(this.CONSENT_KEY, 'accepted'); } catch (e) {}
      const banner = document.getElementById('zs-cookie-banner');
      if (banner) {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(20px)';
        setTimeout(() => banner.remove(), 300);
      }
    },

    openPreferencesModal() {
      let modal = document.getElementById('zs-cookie-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'zs-cookie-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs';
        modal.innerHTML = `
          <div class="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 text-slate-900">
            <div class="flex items-center justify-between pb-4 border-b border-slate-100">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">🍪</span>
                <h3 class="text-base font-extrabold text-slate-900">Manage Cookie Preferences</h3>
              </div>
              <button id="zs-close-cookie-modal" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">✕</button>
            </div>

            <div class="py-4 space-y-4 text-xs">
              <!-- Essential Auth Cookie -->
              <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-extrabold text-slate-900">Persistent Authentication (Stay Logged In)</span>
                    <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Essential</span>
                  </div>
                  <p class="mt-1 text-slate-500 leading-relaxed">
                    Saves your verified sign-in token for 30 days in browser cookies and local cache. Eliminates the need to re-enter your password on return visits.
                  </p>
                </div>
                <input type="checkbox" checked disabled class="mt-1 accent-emerald-600 rounded">
              </div>

              <!-- Booking Cache -->
              <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-extrabold text-slate-900">Booking &amp; Address Memory</span>
                    <span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">Recommended</span>
                  </div>
                  <p class="mt-1 text-slate-500 leading-relaxed">
                    Remembers your preferred service location (Pudukkottai / Coimbatore) and doorstep address for 1-click scheduling.
                  </p>
                </div>
                <input id="zs-pref-booking-cache" type="checkbox" checked class="mt-1 accent-emerald-600 rounded cursor-pointer">
              </div>
            </div>

            <div class="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <button id="zs-clear-all-cookies-btn" class="text-rose-600 hover:text-rose-700 font-bold text-xs hover:underline cursor-pointer">
                Clear All Saved Logins &amp; Cookies
              </button>
              <div class="flex items-center gap-2">
                <button id="zs-save-cookie-prefs-btn" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer">
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('zs-close-cookie-modal').addEventListener('click', () => {
          modal.classList.add('hidden');
        });

        document.getElementById('zs-save-cookie-prefs-btn').addEventListener('click', () => {
          this.acceptAll();
          modal.classList.add('hidden');
        });

        document.getElementById('zs-clear-all-cookies-btn').addEventListener('click', () => {
          if (confirm('Are you sure you want to clear your saved login and all cookies? You will need to log in again.')) {
            ZS_Auth.clearSession();
            ZS_Cookies.delete(this.CONSENT_KEY);
            alert('Cookies and login cache cleared successfully.');
            window.location.reload();
          }
        });

        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.add('hidden');
        });
      }

      modal.classList.remove('hidden');
    }
  };

  // Expose globally
  window.ZS_Cookies = ZS_Cookies;
  window.ZS_Auth = ZS_Auth;
  window.ZS_CookieBanner = ZS_CookieBanner;

  // Clean URLs: Automatically strip .html from address bar without reloading
  try {
    if (window.location && window.location.pathname && window.location.pathname.endsWith('.html')) {
      let clean = window.location.pathname.replace(/\.html$/, '');
      if (clean === '/index') clean = '/';
      window.history.replaceState(null, '', clean + window.location.search + window.location.hash);
    }
  } catch (e) {}

  // Auto-initialize banner
  ZS_CookieBanner.init();
})();

