/**
 * MGC & F.I.X Enterprise OS Shell & Responsive Web Design Engine
 * Built on the Researched Web Design Principles from "Responsible Responsive Principles" (Lessons 1–6):
 *
 * 1. RESPONSIVE LAYOUT (Lessons 2 & 4):
 *    - Mobile-First Progression: Single-column stack (<768px) -> 2-column Tablet Grid (768px–1023px) -> Multi-column Desktop Grid (>=1024px)
 *    - Flexbox (1D Layout): Topbar, toolbars, pill bars, and action groups with flex-wrap
 *    - CSS Grid (2D Layout): Dashboard cards, KPI ribbons, and multi-pane workspaces
 *
 * 2. RESPONSIVE STYLING (Lesson 3):
 *    - Relative CSS Units (%, rem, em, vw, min()) instead of rigid fixed pixel widths
 *    - Fluid Typography via clamp(min, preferred, max) + text-wrap: balance for smooth scaling
 *    - Flexible Media & Responsive Tables: max-width: 100%; height: auto; and auto-wrapped scrollable data tables
 *
 * 3. RESPONSIVE BEHAVIOR & NAVIGATION PATTERNS (Lesson 5 & WCAG 2.1 AA):
 *    - Pattern 1 (Desktop >=1024px): Categorized Dropdown Navigation (Command & Auth ▾, Apps & Labs ▾, Canvas Academy ▾, Commerce & Gov ▾) + 9-Dot Waffle
 *    - Pattern 2 & 3 (Tablet & Mobile <1024px): Labeled Hamburger Button (☰ Menu) + Off-Canvas Slide-Out Navigation Drawer with Backdrop Scrim
 *    - Accessibility: 44px minimum touch targets, :focus-visible keyboard rings, @media (prefers-reduced-motion: reduce), @media (forced-colors: active)
 *    - Note: Step-gated SCORM workflows belong exclusively to elearning-upskilling-hub.html (learning/skilling portal).
 */
(function () {
  const SESSION_KEY = 'mgc_onboarded_session';
  const GATE_LOCK_KEY = 'mgc_edge_gate_locked';
  const CLEAN_UI_KEY = 'mgc_clean_ui_mode';

  // Standalone external websites (e.g. Sterling Auto Repair & Chronos External WebApp) do not get internal MGC OS chrome
  const pathLower = window.location.pathname.toLowerCase();
  if (pathLower.includes('sterling-auto-repair') || pathLower.includes('chronos-external-insight-webapp')) {
    return;
  }

  const ALLOWED_SSO_PROVIDERS = ['google', 'microsoft', 'apple', 'password'];
  const SOLE_ADMIN_EMAIL = 'malik.khabir@miltongroupsecurity.org';
  const DEFAULT_CUSTOMER_PORTALS = ['saas-apps-and-lms-showcase.html', 'member-portal.html'];

  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'external' || params.get('locked') === '1') {
    localStorage.setItem(GATE_LOCK_KEY, '1');
    localStorage.removeItem(SESSION_KEY);
  }

  // Synchronize authoritative server session & Administrator-granted features from /api/auth/session
  let serverAuthUser = null;
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/auth/session', false);
      xhr.send(null);
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        if (res && res.authenticated && res.user) {
          serverAuthUser = res.user;
          const isSoleAdmin = res.user.role === 'owner' && res.user.id === 'owner' && String(res.user.email || '').toLowerCase() === SOLE_ADMIN_EMAIL;
          const isInternalEmp = !isSoleAdmin && res.user.ou === 'internal';
          const syncedSess = {
            uid: res.user.id,
            email: res.user.email,
            name: res.user.name,
            org: res.user.org || 'Milton Group Concepts LLC & F.I.X Solutions LLC',
            role: isSoleAdmin ? 'OWNER_ADMIN' : (isInternalEmp ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED'),
            ou: res.user.ou || 'external',
            ssoVerified: true,
            ssoProvider: res.user.ssoProvider || 'google',
            access: isSoleAdmin ? 'INTERNAL_SUITE_FULL' : (isInternalEmp ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED'),
            accessTier: isSoleAdmin ? 'OWNER_FULL' : (isInternalEmp ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED'),
            allowedPages: Array.isArray(res.user.allowedPages) ? res.user.allowedPages : ['saasapps'],
            allowedApps: Array.isArray(res.user.allowedApps) ? res.user.allowedApps : ['sterling-auto-repair', 'client-turnkey-forge'],
            allowedPortals: Array.isArray(res.user.allowedPortals) ? res.user.allowedPortals : DEFAULT_CUSTOMER_PORTALS,
            paymentVerified: Boolean(res.user.paymentProfile && res.user.paymentProfile.verified),
            verifiedAt: new Date().toISOString()
          };
          localStorage.setItem(SESSION_KEY, JSON.stringify(syncedSess));
          localStorage.removeItem(GATE_LOCK_KEY);
          sessionStorage.setItem('mgcw.uid', res.user.id);
          sessionStorage.setItem('mgcw.sso_provider', syncedSess.ssoProvider);
        } else if (res && res.authenticated === false) {
          // Prevent any stale or spoofed localStorage admin session when server session is unauthenticated
          try {
            const localRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
            if (localRaw && (String(localRaw.email || '').toLowerCase() === SOLE_ADMIN_EMAIL || String(localRaw.role || '').toUpperCase().includes('OWNER'))) {
              localStorage.removeItem(SESSION_KEY);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function hasValidSession() {
    if (localStorage.getItem(GATE_LOCK_KEY) === '1') return false;
    if (serverAuthUser && serverAuthUser.email) return true;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          parsed.email &&
          parsed.email !== 'unverified@external-edge.gate' &&
          parsed.ssoVerified === true &&
          ALLOWED_SSO_PROVIDERS.includes(String(parsed.ssoProvider || '').toLowerCase())
        ) {
          // Never trust a localStorage Administrator claim without serverAuthUser verification
          if (String(parsed.email).toLowerCase() === SOLE_ADMIN_EMAIL && (!serverAuthUser || serverAuthUser.role !== 'owner')) {
            return false;
          }
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function isGateLocked() {
    return !hasValidSession();
  }

  function getVerifiedSession() {
    if (!hasValidSession()) {
      return {
        email: '',
        name: 'Unauthenticated Visitor (Sign-In Required)',
        org: 'External Edge Gate • Zero-Trust Enforced',
        role: 'LOCKED_PENDING_AUTH',
        access: 'LOCKED',
        allowedPortals: DEFAULT_CUSTOMER_PORTALS,
        allowedPages: ['saasapps']
      };
    }
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email) return parsed;
      }
    } catch (e) {}
    return {
      email: 'authenticated@miltongroupsecurity.org',
      name: 'Authenticated Workspace Member',
      org: 'Milton Group Concepts LLC & F.I.X Solutions LLC',
      role: 'CUSTOMER_RESTRICTED',
      access: 'CUSTOMER_RESTRICTED',
      allowedPortals: DEFAULT_CUSTOMER_PORTALS,
      allowedPages: ['saasapps'],
      verifiedAt: new Date().toISOString(),
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
  }
  const getSession = getVerifiedSession;

  const CLEAN_SLUG_TO_FILE = {
    'auth': 'login.html',
    'login': 'login.html',
    'request-access': 'request-access.html',
    'portal': 'onboarding-portal.html',
    'onboarding': 'onboarding-portal.html',
    'onboarding-portal': 'onboarding-portal.html',
    'workspace': 'member-portal.html',
    'member-portal': 'member-portal.html',
    'agile': 'agile-board.html',
    'agile-board': 'agile-board.html',
    'access-admin': 'access-admin.html',
    'command': 'admin-command-portal.html',
    'admin-command': 'admin-command-portal.html',
    'apps': 'saas-apps-and-lms-showcase.html',
    'finance': 'finance-command.html',
    'academy': 'elearning-upskilling-hub.html',
    'commerce': 'whitefeather-ecommerce-hub.html',
    'chronos-lab': 'historical-archaeology-ai-hub.html',
    'chronos': 'chronos-external-insight-webapp.html',
    'data-hub': 'index.html',
    'agent-studio': 'agent-workflow-studio.html',
    'earth-3d': 'earth-3d.html',
    'vr-deck': 'vr-command.html',
    'integrations': 'integrations-connections-hub.html',
    'sam-radar': 'sdvosb-contract-radar.html',
    'trust-center': 'compliance-trust-center.html'
  };

  const FILE_TO_CLEAN_PATH = {
    'login.html': '/auth',
    'request-access.html': '/request-access',
    'onboarding-portal.html': '/portal',
    'member-portal.html': '/workspace',
    'agile-board.html': '/agile',
    'access-admin.html': '/access-admin',
    'admin-command-portal.html': '/command',
    'saas-apps-and-lms-showcase.html': '/apps',
    'finance-command.html': '/finance',
    'elearning-upskilling-hub.html': '/academy',
    'whitefeather-ecommerce-hub.html': '/commerce',
    'historical-archaeology-ai-hub.html': '/chronos-lab',
    'chronos-external-insight-webapp.html': '/chronos',
    'index.html': '/data-hub',
    'agent-workflow-studio.html': '/agent-studio',
    'earth-3d.html': '/earth-3d',
    'vr-command.html': '/vr-deck',
    'integrations-connections-hub.html': '/integrations',
    'sdvosb-contract-radar.html': '/sam-radar',
    'compliance-trust-center.html': '/trust-center'
  };

  const session = getVerifiedSession();
  const rawLastSeg = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const currentFile = CLEAN_SLUG_TO_FILE[rawLastSeg] || (rawLastSeg.endsWith('.html') ? rawLastSeg : (rawLastSeg + '.html'));

  if ((window.location.protocol === 'http:' || window.location.protocol === 'https:') && FILE_TO_CLEAN_PATH[currentFile]) {
    try {
      const cleanPath = FILE_TO_CLEAN_PATH[currentFile];
      if (window.location.pathname !== cleanPath || window.location.search.includes('next=')) {
        window.history.replaceState(null, '', cleanPath + (window.location.hash || ''));
      }
    } catch (_) {}
  }

  // 16-Portal Ecosystem Registry — Evenly Split: 8 MGC Thematic Portals & 8 F.I.X Solutions Thematic Portals
  // Note: Sterling Auto Repair is managed as a client project inside agile-board.html (not a standalone module).
  const pages = [
    { file: 'admin-command-portal.html', icon: '🛡️', label: 'Admin Hub', full: 'Master Admin Command Hub', cat: 'Command & Auth', tag: 'All 16 Portals', color: '#e4e4e7', rail: true, brand: 'MGC' },
    { file: 'onboarding-portal.html', icon: '🫆', label: 'Client 2FA', full: 'Client 2FA & Biometric Gate', cat: 'Command & Auth', tag: 'Passkey + TOTP', color: '#a1a1aa', rail: true, brand: 'MGC' },
    { file: 'index.html', icon: '📊', label: 'Ops Hub', full: 'Executive Data & Ops Hub', cat: 'Command & Auth', tag: 'Cloud & Telemetry', color: '#e4e4e7', rail: true, brand: 'MGC' },
    { file: 'integrations-connections-hub.html', icon: '🔌', label: 'Integrations', full: 'Cloud & API Integrations', cat: 'Command & Auth', tag: 'GCP • Azure • OAuth', color: '#C5B358', rail: false, brand: 'FIX' },

    { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'SaaS Apps', full: 'Monetized Apps & Simulators', cat: 'Apps & Labs', tag: 'Design Standard', color: '#C5B358', rail: true, brand: 'FIX' },
    { file: 'agent-workflow-studio.html', icon: '🤖', label: 'Agent Studio', full: 'LangGraph AI Agent Studio', cat: 'Apps & Labs', tag: 'Multi-Agent Flows', color: '#C5B358', rail: false, brand: 'FIX' },
    { file: 'earth-3d.html', icon: '🌍', label: '3D Earth', full: '3D Geospatial Command', cat: 'Apps & Labs', tag: 'WebGL 3D Globe', color: '#C5B358', rail: false, brand: 'FIX' },
    { file: 'vr-command.html', icon: '🥽', label: '360° VR', full: '360° WebXR Spatial Deck', cat: 'Apps & Labs', tag: 'Spatial Command', color: '#C5B358', rail: false, brand: 'FIX' },

    { file: 'elearning-upskilling-hub.html', icon: '🎓', label: 'Canvas LMS', full: 'Canvas Academy & NC Career Hub', cat: 'Canvas Academy', tag: 'EVE-NG & Career/VA', color: '#ffffff', rail: true, brand: 'MGC' },
    { file: 'historical-archaeology-ai-hub.html', icon: '🏛️', label: 'History Lab', full: 'Historical & Archaeology AI', cat: 'Canvas Academy', tag: 'LiDAR & Epigraphy', color: '#a1a1aa', rail: false, brand: 'MGC' },
    { file: 'chronos-external-insight-webapp.html', icon: '🌐', label: 'Chronos App', full: 'Chronos Discovery WebApp', cat: 'Canvas Academy', tag: '3-Pane Explorer', color: '#e4e4e7', rail: false, brand: 'MGC' },

    { file: 'agile-board.html', icon: '🗂️', label: 'Agile Board', full: 'Agile Projects & Client Deliverables', cat: 'Commerce & Gov', tag: 'Sprints & Projects', color: '#C5B358', rail: true, brand: 'FIX' },
    { file: 'finance-command.html', icon: '💳', label: 'Finance', full: 'Finance, WAWF & VA Treasury', cat: 'Commerce & Gov', tag: 'Stripe • ACH • WAWF', color: '#C5B358', rail: true, brand: 'FIX' },
    { file: 'whitefeather-ecommerce-hub.html', icon: '🛍️', label: 'eCommerce', full: 'White Feather AI & Social Ads Hub', cat: 'Commerce & Gov', tag: 'AI Products & Ads', color: '#ffffff', rail: false, brand: 'MGC' },
    { file: 'sdvosb-contract-radar.html', icon: '🎯', label: 'SAM Radar', full: 'SDVOSB Contract Radar', cat: 'Commerce & Gov', tag: 'VA & DoD Pipeline', color: '#C5B358', rail: false, brand: 'FIX' },
    { file: 'compliance-trust-center.html', icon: '🔒', label: 'Zero-Trust', full: 'Compliance & Trust Center', cat: 'Commerce & Gov', tag: 'CMMC 2.0 • SC-100', color: '#a1a1aa', rail: false, brand: 'MGC' }
  ];

  const currentPageEntry = pages.find(p => p.file.toLowerCase() === currentFile) || pages[0];
  const defaultPageBrand = currentPageEntry ? currentPageEntry.brand : 'MGC';

  // Authentic Inline SVG Logos for MGC (Monochrome Gray, Black & White Shield matching mgc-logo.png) and F.I.X (Vanguard Gold/Mission Navy Cyber Shield)
  const MGC_SHIELD_SVG = `<svg viewBox="0 0 100 100" class="os-brand-logo-svg" xmlns="http://www.w3.org/2000/svg" aria-label="Milton Group Concepts LLC Shield"><defs><linearGradient id="mgcDark" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#27272A"/><stop offset="100%" stop-color="#09090B"/></linearGradient><linearGradient id="mgcSteel" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#71717A"/><stop offset="100%" stop-color="#18181B"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="18" fill="#09090B" stroke="#A1A1AA" stroke-width="3"/><path d="M50 10 L84 22 L84 50 C84 72 50 90 50 90 C50 90 16 72 16 50 L16 22 Z" fill="url(#mgcDark)" stroke="#FFFFFF" stroke-width="3"/><path d="M50 14 L80 25 L80 50 C80 69 50 86 50 86 Z" fill="url(#mgcSteel)" opacity="0.65"/><text x="50" y="58" text-anchor="middle" fill="#FFFFFF" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="24" letter-spacing="1">MGC</text></svg>`;

  const FIX_SHIELD_SVG = `<svg viewBox="0 0 400 400" class="os-brand-logo-svg" xmlns="http://www.w3.org/2000/svg" aria-label="F.I.X Solutions LLC Cyber Shield"><defs><linearGradient id="fixGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#C5B358"/></linearGradient><linearGradient id="fixNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1E293B"/><stop offset="100%" stop-color="#0B1426"/></linearGradient></defs><circle cx="200" cy="200" r="182" fill="none" stroke="url(#fixGoldGrad)" stroke-width="8" stroke-dasharray="16 12" opacity="0.75"/><path d="M 200 28 L 342 70 L 342 200 C 342 302 200 364 200 364 C 200 364 58 302 58 200 L 58 70 Z" fill="url(#fixNavyGrad)" stroke="url(#fixGoldGrad)" stroke-width="12"/><g fill="url(#fixGoldGrad)"><path d="M 90 225 L 90 125 L 152 125 L 162 142 L 118 142 L 118 165 L 146 165 L 156 182 L 118 182 L 118 225 Z"/><polygon points="166,210 178,210 183,225 171,225"/><polygon points="190,125 218,125 218,225 190,225"/><polygon points="225,210 237,210 242,225 230,225"/><path d="M 250 125 L 272 125 L 284 158 L 296 125 L 318 125 L 296 175 L 318 225 L 296 225 L 284 192 L 272 225 L 250 225 L 272 175 Z"/></g></svg>`;

  function isCleanUiEnabled() {
    const val = localStorage.getItem(CLEAN_UI_KEY);
    return val === null ? true : val === '1';
  }

  function injectEnterpriseShell() {
    if (document.getElementById('mgc-os-shell')) return;

    const cleanOn = isCleanUiEnabled();
    if (cleanOn) document.body.classList.add('mgc-clean-ui');

    const style = document.createElement('style');
    style.id = 'mgc-os-shell-styles';
    style.textContent = `
      /* ======================================================================
         MGC ENTERPRISE SHELL & RESPONSIVE WEB DESIGN ARCHITECTURE
         1. Fluid Layouts (%, rem, min(), CSS Grid 2D + Flexbox 1D)
         2. Fluid Typography (clamp() + text-wrap: balance)
         3. Content-Driven Media Queries (Mobile <768px | Tablet 768-1023px | Desktop >=1024px)
         4. Responsive Navigation (Desktop Dropdowns + Mobile/Tablet Labeled Hamburger Off-Canvas Drawer)
         5. Flexible Media & Accessible 44px Touch Targets
         ====================================================================== */
      :root {
        --os-top-h: 3.75rem; /* 60px */
        --os-rail-w: 4.25rem; /* 68px */
        --os-bg: rgba(2, 6, 23, 0.95);
        --os-border: rgba(203, 213, 225, 0.16);
        --mgc-gold: #fcd34d;
        --mgc-crimson: #dc2626;
        --mgc-cobalt: #2563eb;
        --mgc-emerald: #16a34a;
        --focus-ring: #ffbf47;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      html, body {
        max-width: 100vw;
        overflow-x: hidden;
      }

      /* Lesson 2 & 5: Flexible Media Globally Across All Internal Portals */
      img, svg, video, canvas, iframe {
        max-width: 100%;
        height: auto;
      }

      /* Lesson 3: Fluid Typography with clamp(min, preferred, max) & Balanced Headings */
      h1, .hub-title, .hero h1, .hero-banner h1 {
        font-size: clamp(1.35rem, 2.2vw + 0.55rem, 2.35rem) !important;
        line-height: 1.18 !important;
        text-wrap: balance;
      }
      h2, .panel-title, .card h2 {
        font-size: clamp(1.12rem, 1.5vw + 0.45rem, 1.5rem) !important;
        line-height: 1.25 !important;
        text-wrap: balance;
      }
      h3 {
        font-size: clamp(0.98rem, 1.1vw + 0.35rem, 1.2rem);
        line-height: 1.3;
      }

      /* Lesson 3: Fluid Container Widths Using Relative Units (min() & rem) */
      .shell, .container, main {
        width: min(1400px, 100%);
        margin-inline: auto;
        padding-inline: clamp(0.875rem, 2.5vw, 2rem);
      }

      /* Responsive Table Wrapper for Data Ledgers & Matrices */
      .mgc-table-scroll {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* Accessibility: Keyboard Focus Rings (WCAG 2.1 AA) */
      #mgc-os-shell button:focus-visible,
      #mgc-os-shell a:focus-visible,
      #mgc-os-shell select:focus-visible,
      #mgc-os-shell input:focus-visible,
      #mgc-subpage-bar button:focus-visible {
        outline: 3px solid var(--focus-ring);
        outline-offset: 2px;
      }

      body {
        padding-top: var(--os-top-h) !important;
        padding-left: var(--os-rail-w) !important;
      }

      /* Hide duplicate internal headers/navs so there is only 1 unified topbar */
      body > nav:not(#mgc-os-topbar),
      body > .top-bar,
      body > header:not(#mgc-os-topbar):not(.max-w-7xl) {
        display: none !important;
      }

      /* 1. TOP BAR (Flexbox 1D Navigation Layout) */
      #mgc-os-topbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--os-top-h);
        background: linear-gradient(90deg, rgba(2, 6, 23, 0.97) 0%, rgba(15, 23, 42, 0.95) 60%, rgba(23, 37, 84, 0.93) 100%);
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        border-bottom: 1px solid rgba(252, 211, 77, 0.26);
        z-index: 99990;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 clamp(0.65rem, 1.8vw, 1.15rem);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        user-select: none;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        gap: 0.5rem;
      }

      .os-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }

      /* Lesson 5: Labeled Hamburger Button (Hidden on Desktop >=1024px, Shown on Tablet/Mobile <1024px) */
      .os-hamburger-btn {
        display: none;
        min-height: 2.75rem; /* 44px WCAG touch target */
        padding: 0.45rem 0.75rem;
        border-radius: 0.625rem;
        border: 1px solid rgba(252, 211, 77, 0.4);
        background: rgba(30, 58, 138, 0.38);
        color: #ffffff;
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.03em;
        cursor: pointer;
        align-items: center;
        gap: 0.45rem;
        flex-shrink: 0;
        transition: background 0.18s ease, border-color 0.18s ease;
      }
      .os-hamburger-btn:hover,
      .os-hamburger-btn[aria-expanded="true"] {
        background: rgba(37, 99, 235, 0.45);
        border-color: var(--mgc-gold);
      }

      /* Google 9-Dot Waffle Button (44x44px Accessible Target) */
      .os-waffle-btn {
        width: 2.75rem;
        height: 2.75rem;
        min-width: 2.75rem;
        min-height: 2.75rem;
        border-radius: 50%;
        border: 1px solid transparent;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.18s;
      }
      .os-waffle-btn:hover, .os-waffle-btn.active {
        background: rgba(37, 99, 235, 0.22);
        border-color: rgba(252, 211, 77, 0.4);
        color: #ffffff;
      }
      .os-waffle-svg {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
      }

      /* Authentic MGC Logo Lockup */
      .os-brand {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        text-decoration: none;
        color: #ffffff;
        font-weight: 900;
        font-size: 0.875rem;
        letter-spacing: 0.04em;
        padding-right: 0.75rem;
        border-right: 1px solid var(--os-border);
        white-space: nowrap;
        min-height: 2.75rem;
      }
      .os-brand-logo-img {
        height: 1.875rem;
        width: auto;
        border-radius: 0.375rem;
        border: 1px solid rgba(252, 211, 77, 0.45);
        background: #0f172a;
      }

      /* Lesson 5 Pattern 1: Desktop Categorized Dropdown Navigation */
      .os-menus {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .os-menu-wrap {
        position: relative;
      }
      .os-menu-trigger {
        background: transparent;
        border: 1px solid transparent;
        color: #cbd5e1;
        font-family: inherit;
        font-size: 0.74rem;
        font-weight: 700;
        padding: 0.4rem 0.52rem;
        min-height: 2.35rem;
        border-radius: 0.5rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.28rem;
        transition: all 0.16s ease;
        white-space: nowrap;
      }
      .os-menu-trigger:hover, .os-menu-wrap.open .os-menu-trigger {
        background: rgba(161, 161, 170, 0.18);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.35);
      }
      .os-caret {
        font-size: 0.65rem;
        color: var(--mgc-gold);
        transition: transform 0.2s ease;
      }
      .os-menu-wrap.open .os-caret {
        transform: rotate(180deg);
      }

      /* Fluent Dropdown Flyout Panel */
      .os-dropdown-panel {
        position: absolute;
        top: calc(100% + 0.5rem);
        left: 0;
        min-width: 17.5rem;
        background: rgba(9, 14, 28, 0.98);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(252, 211, 77, 0.32);
        border-radius: 0.875rem;
        padding: 0.5rem;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
        display: none;
        flex-direction: column;
        gap: 0.2rem;
        animation: osDropFade 0.16s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .os-menu-wrap.open .os-dropdown-panel {
        display: flex;
      }
      @keyframes osDropFade {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .os-drop-item {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        padding: 0.55rem 0.7rem;
        min-height: 2.75rem;
        border-radius: 0.625rem;
        text-decoration: none;
        color: #f8fafc;
        transition: background 0.15s;
      }
      .os-drop-item:hover, .os-drop-item.active {
        background: linear-gradient(90deg, rgba(30, 58, 138, 0.55), rgba(127, 29, 29, 0.35));
      }
      .os-drop-icon {
        width: 2rem;
        height: 2rem;
        border-radius: 0.55rem;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        flex-shrink: 0;
      }
      .os-drop-title {
        font-size: 0.78rem;
        font-weight: 700;
        color: #ffffff;
        display: block;
      }
      .os-drop-sub {
        font-size: 0.66rem;
        color: #cbd5e1;
        display: block;
      }

      /* Google-Style Omnibox Search Bar */
      .os-omnibox {
        position: relative;
        width: clamp(8.2rem, 10.5vw, 11rem);
        flex-shrink: 0;
      }
      .os-search-btn {
        width: 100%;
        min-height: 2.25rem;
        background: rgba(9, 9, 11, 0.85);
        border: 1px solid var(--os-border);
        border-radius: 999px;
        padding: 0.35rem 0.65rem;
        color: #cbd5e1;
        font-family: inherit;
        font-size: 0.72rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        cursor: pointer;
        transition: all 0.18s;
        white-space: nowrap;
      }
      .os-search-btn:hover {
        border-color: var(--mgc-gold);
        color: #ffffff;
      }
      .os-kbd {
        background: rgba(2, 6, 23, 0.7);
        border: 1px solid rgba(252, 211, 77, 0.3);
        color: var(--mgc-gold);
        padding: 0.1rem 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.625rem;
        font-family: monospace;
      }

      /* Right Controls: Section Jump Select + LinkedIn Profile Menu */
      .os-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .os-page-select {
        background: rgba(30, 58, 138, 0.35);
        border: 1px solid rgba(252, 211, 77, 0.4);
        color: var(--mgc-gold);
        padding: 0.4rem 0.65rem;
        min-height: 2.35rem;
        border-radius: 0.5rem;
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 700;
        outline: none;
        cursor: pointer;
        max-width: 13.5rem;
        text-overflow: ellipsis;
      }
      .os-page-select option {
        background: #090e1c;
        color: #f8fafc;
      }

      /* LinkedIn-Style "Me ▾" Avatar Dropdown */
      .os-profile-btn {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(252, 211, 77, 0.35);
        border-radius: 999px;
        padding: 0.25rem 0.65rem 0.25rem 0.3rem;
        min-height: 2.45rem;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        color: #ffffff;
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
      }
      .os-avatar {
        width: 1.65rem;
        height: 1.65rem;
        border-radius: 50%;
        background: linear-gradient(135deg, #dc2626, #1e3a8a);
        border: 1px solid var(--mgc-gold);
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 0.66rem;
      }

      /* 2. LESSON 5 PATTERN 2 & 3: OFF-CANVAS NAVIGATION DRAWER + SCRIM (Mobile & Tablet) */
      #os-offcanvas-scrim {
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.72);
        backdrop-filter: blur(6px);
        z-index: 99996;
        display: none;
      }
      #os-offcanvas-scrim.open {
        display: block;
      }
      #os-offcanvas-drawer {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: min(21rem, 86vw);
        background: linear-gradient(180deg, #060b19 0%, #0f172a 100%);
        border-right: 1px solid rgba(252, 211, 77, 0.35);
        box-shadow: 24px 0 60px rgba(0, 0, 0, 0.85);
        z-index: 99997;
        transform: translateX(-102%);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        font-family: 'Inter', sans-serif;
      }
      #os-offcanvas-drawer.open {
        transform: translateX(0);
      }
      .os-drawer-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.9rem 1rem;
        border-bottom: 1px solid rgba(252, 211, 77, 0.22);
      }
      .os-drawer-close {
        min-width: 2.75rem;
        min-height: 2.75rem;
        border-radius: 0.625rem;
        border: 1px solid rgba(203, 213, 225, 0.25);
        background: rgba(15, 23, 42, 0.85);
        color: #f8fafc;
        font-weight: 800;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .os-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 0.85rem 1rem 1.5rem;
      }
      .os-drawer-cat {
        margin-bottom: 1rem;
      }
      .os-drawer-cat-title {
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: var(--mgc-gold);
        padding: 0.25rem 0.4rem;
        margin-bottom: 0.35rem;
      }

      /* 3. GOOGLE 9-DOT WAFFLE POPOVER GRID */
      #os-waffle-popover {
        position: fixed;
        top: 4.1rem;
        left: 0.875rem;
        width: min(21.5rem, calc(100vw - 1.75rem));
        max-height: calc(100vh - 5.25rem);
        overflow-y: auto;
        background: rgba(9, 14, 28, 0.98);
        backdrop-filter: blur(26px);
        border: 1px solid rgba(252, 211, 77, 0.35);
        border-radius: 1.35rem;
        padding: 1.1rem;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9);
        z-index: 99995;
        display: none;
        animation: osDropFade 0.18s ease;
      }
      #os-waffle-popover.open { display: block; }
      .waffle-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.625rem;
      }
      .waffle-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0.75rem 0.375rem;
        min-height: 4.75rem;
        border-radius: 0.875rem;
        text-decoration: none;
        color: #e2e8f0;
        transition: all 0.16s;
        text-align: center;
      }
      .waffle-tile:hover, .waffle-tile.active {
        background: rgba(30, 58, 138, 0.45);
        border: 1px solid rgba(252, 211, 77, 0.35);
        transform: translateY(-2px);
      }
      .waffle-icon {
        width: 2.6rem;
        height: 2.6rem;
        border-radius: 0.75rem;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.14);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        margin-bottom: 0.35rem;
      }
      .waffle-label {
        font-size: 0.69rem;
        font-weight: 700;
        line-height: 1.2;
      }

      /* 4. INSTRUCTURE CANVAS LEFT ICON RAIL (68px Desktop / Bottom Mobile Dock) */
      #mgc-os-rail {
        position: fixed;
        top: var(--os-top-h);
        left: 0;
        bottom: 0;
        width: var(--os-rail-w);
        background: linear-gradient(180deg, rgba(2, 6, 23, 0.96) 0%, rgba(15, 23, 42, 0.95) 100%);
        border-right: 1px solid rgba(252, 211, 77, 0.2);
        z-index: 99985;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 0;
        font-family: 'Inter', sans-serif;
      }
      .rail-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        width: 100%;
      }
      .rail-item {
        width: 3.375rem;
        min-height: 2.85rem;
        padding: 0.45rem 0.25rem;
        border-radius: 0.75rem;
        text-decoration: none;
        color: #94a3b8;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.2rem;
        transition: all 0.18s ease;
        position: relative;
      }
      .rail-item:hover {
        background: rgba(30, 58, 138, 0.35);
        color: #ffffff;
      }
      .rail-item.active {
        background: rgba(30, 58, 138, 0.55);
        color: var(--mgc-gold);
      }
      .rail-item.active::before {
        content: '';
        position: absolute;
        left: -0.4rem;
        top: 0.6rem;
        bottom: 0.6rem;
        width: 0.22rem;
        border-radius: 0.25rem;
        background: var(--mgc-gold);
      }
      .rail-ico { font-size: 1.125rem; line-height: 1; }
      .rail-txt { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.01em; text-align: center; }

      /* 5. CLEAN NON-LEARNING SECTION FILTER BAR (Flexbox 1D Toolbar, Full View Default) */
      #mgc-subpage-bar {
        width: min(1380px, 100%);
        margin: 0.85rem auto 1rem;
        padding: 0.6rem 0.85rem;
        background: linear-gradient(90deg, rgba(9, 14, 28, 0.94), rgba(15, 23, 42, 0.9));
        backdrop-filter: blur(18px);
        border: 1px solid rgba(203, 213, 225, 0.2);
        border-radius: 0.875rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        flex-wrap: wrap;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
      }
      .sp-tabs {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
      }
      .sp-tab {
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid rgba(203, 213, 225, 0.16);
        color: #cbd5e1;
        padding: 0.45rem 0.8rem;
        border-radius: 0.6rem;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        transition: all 0.16s ease;
        min-height: 2.35rem;
      }
      .sp-tab:hover {
        color: #ffffff;
        border-color: rgba(252, 211, 77, 0.4);
        background: rgba(30, 58, 138, 0.35);
      }
      .sp-tab.active {
        background: linear-gradient(135deg, #1e3a8a, #2563eb);
        border-color: rgba(252, 211, 77, 0.6);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      }

      /* 6. ANTI-CLUTTER CLEAN UI ENGINE */
      body.mgc-clean-ui .portal-card p,
      body.mgc-clean-ui .app-card p,
      body.mgc-clean-ui .course-card p {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.5rem !important;
        font-size: 0.78rem !important;
      }
      body.mgc-clean-ui .admin-bar,
      body.mgc-clean-ui .hero-box {
        display: none !important;
      }

      /* Command Palette Modal (Ctrl+K) */
      #os-cmd-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.82);
        backdrop-filter: blur(12px);
        z-index: 99999;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 4.5rem 0.875rem 1.25rem;
        font-family: 'Inter', sans-serif;
      }
      #os-cmd-backdrop.open { display: flex; }
      .os-cmd-modal {
        width: 100%;
        max-width: 40rem;
        background: #090e1c;
        border: 1px solid rgba(252, 211, 77, 0.35);
        border-radius: 1.25rem;
        overflow: hidden;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.9);
      }

      /* ======================================================================
         LESSON 5: CONTENT-DRIVEN MEDIA QUERIES & BREAKPOINTS
         - Tablet Breakpoint (< 1024px): Labeled Hamburger Menu + 2-Column Grids
         - Smartphone Breakpoint (< 768px): 1-Column Stack + Bottom Dock + 44px Touch Targets
         ====================================================================== */
      @media (max-width: 1024px) {
        /* Switch from Desktop Dropdown Bar to Labeled Hamburger Off-Canvas Pattern */
        .os-menus {
          display: none !important;
        }
        .os-hamburger-btn {
          display: inline-flex !important;
        }

        /* Reflow 4-column grids into balanced 2-column Tablet CSS Grids */
        .app-grid,
        .metric-row,
        .kpi-grid,
        .tools-row {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        /* Reflow multi-pane desktop workspaces cleanly on Tablet */
        .workspace,
        .workspace-grid,
        .main-grid,
        .hero {
          grid-template-columns: 1fr !important;
          height: auto !important;
        }
        .sidebar-left,
        .sidebar-right {
          border-right: none !important;
          border-left: none !important;
          border-bottom: 1px solid rgba(203, 213, 225, 0.16) !important;
        }
        body {
          height: auto !important;
          overflow-y: auto !important;
          display: block !important;
        }
      }

      @media (max-width: 860px) {
        .os-omnibox {
          display: none !important;
        }
        .stepper,
        .portal-grid,
        .grid-3 {
          grid-template-columns: 1fr !important;
        }
        .node.supervisor,
        .node.challenger {
          width: 100% !important;
          max-width: 100% !important;
        }
      }

      @media (max-width: 767px) {
        body {
          padding-left: 0 !important;
          padding-bottom: 4.75rem !important;
          display: block !important;
          height: auto !important;
          overflow-y: auto !important;
        }

        .shell, .container, main {
          padding-left: 0.875rem !important;
          padding-right: 0.875rem !important;
        }

        .os-brand span {
          display: none;
        }
        .os-brand {
          padding-right: 0.25rem;
          border-right: none;
        }

        /* Lesson 4 & 5: Mobile Single-Column Vertical Stack */
        .app-grid,
        .metric-row,
        .kpi-grid,
        .tools-row,
        .rail-grid,
        .form-row,
        #os-cmd-results {
          grid-template-columns: 1fr !important;
        }

        .hub-toolbar,
        .hero-banner,
        .panel-header {
          padding: 0.875rem 1rem !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 0.75rem !important;
        }

        .toolbar-controls,
        .entity-tabs,
        .header-actions {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .fluent-select,
        .entity-btn {
          flex: 1 1 auto;
          min-height: 2.75rem; /* 44px touch target on mobile */
        }

        .os-page-select {
          max-width: 9.25rem;
          font-size: 0.7rem;
          min-height: 2.5rem;
          padding: 0.3rem 0.5rem;
        }

        #mgc-subpage-bar {
          margin: 0.65rem auto;
          padding: 0.6rem 0.75rem;
        }
        .sp-tabs {
          flex-wrap: nowrap;
          overflow-x: auto;
          width: 100%;
          padding-bottom: 0.2rem;
          -webkit-overflow-scrolling: touch;
        }
        .sp-tab {
          white-space: nowrap;
          flex-shrink: 0;
          min-height: 2.6rem;
        }

        /* Canvas Left Rail converts into Fixed Bottom Touch Dock on Mobile */
        #mgc-os-rail {
          top: auto;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 3.875rem;
          flex-direction: row;
          padding: 0 0.35rem;
          border-right: none;
          border-top: 1px solid rgba(252, 211, 77, 0.3);
          background: rgba(2, 6, 23, 0.98);
        }
        .rail-group {
          flex-direction: row;
          justify-content: space-around;
        }
        .rail-group.rail-bottom { display: none; }
        .rail-item {
          width: auto;
          min-width: 3rem;
          min-height: 2.75rem;
          padding: 0.35rem 0.25rem;
        }
        .rail-item.active::before { display: none; }
      }

      /* Accessibility: Reduced Motion & High-Contrast Forced Colors (Lessons 3–6) */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }

      @media (forced-colors: active) {
        #mgc-os-topbar,
        #mgc-os-rail,
        .os-dropdown-panel,
        #os-offcanvas-drawer {
          border: 1px solid CanvasText;
        }
      }

      /* ======================================================================
         EVEN SPLIT THEMATIC BRANDING:
         - body.theme-mgc (8 Portals): MGC Shield Logo + Crimson Red (#DC2626), Sovereign Blue (#2563EB), Crisp White (#F8FAFC), Deep Navy (#070B14)
         - body.theme-fix (8 Portals): F.I.X Cyber-Shield SVG Logo + Mission Navy (#0B1426), Tactical Slate (#2D3748), Vanguard Gold (#C5B358 / #FDE047)
         ====================================================================== */
      .os-brand-logo-svg {
        height: 1.95rem;
        width: 1.95rem;
        border-radius: 0.375rem;
        flex-shrink: 0;
      }
      .os-brand-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        font-size: 0.66rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.18s ease;
        white-space: nowrap;
      }
      .os-brand-badge.mgc {
        background: linear-gradient(135deg, #27272A, #09090B);
        border-color: #A1A1AA;
        color: #FFFFFF;
      }
      .os-brand-badge.fix {
        background: linear-gradient(135deg, rgba(197, 179, 88, 0.28), rgba(11, 20, 38, 0.92));
        border-color: #C5B358;
        color: #FDE047;
      }
      .os-item-brand-pill {
        font-size: 0.58rem;
        font-weight: 900;
        padding: 0.12rem 0.4rem;
        border-radius: 0.3rem;
        letter-spacing: 0.05em;
        margin-left: auto;
        flex-shrink: 0;
      }
      .os-item-brand-pill.mgc {
        background: rgba(161, 161, 170, 0.18);
        border: 1px solid rgba(228, 228, 231, 0.45);
        color: #FFFFFF;
      }
      .os-item-brand-pill.fix {
        background: rgba(197, 179, 88, 0.2);
        border: 1px solid rgba(197, 179, 88, 0.6);
        color: #FDE047;
      }

      /* ============================================================================
         SAAS APPS (saas-apps-and-lms-showcase.html) STANDARD THEME & ANTI-CLUTTER ENGINE
         - Standardizes cards, borders, typography, and spacing across all 16 portals
         - Preserves MGC (Obsidian/Silver/Slate) & F.I.X (Deep Navy/Vanguard Gold) brand watermarks
         ============================================================================ */
      :root {
        --bg-deep: #040814;
        --bg-panel: #0b1325;
        --bg-card: rgba(15, 23, 42, 0.92);
        --border-subtle: rgba(148, 163, 184, 0.18);
        --border-gold: rgba(197, 179, 88, 0.45);
        --gold: #c5b358;
        --gold-bright: #fde047;
        --blue: #3b82f6;
        --emerald: #10b981;
        --text-main: #f8fafc;
        --text-muted: #cbd5e1;
      }

      /* Universal SaaS Apps Card, Grid & Anti-Clutter Standard */
      .card, .app-card, .portal-card, .kpi-card, .metric-pill, .panel {
        background: rgba(15, 23, 42, 0.92) !important;
        border: 1px solid rgba(148, 163, 184, 0.18) !important;
        border-radius: 18px !important;
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42) !important;
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      .card:hover, .app-card:hover, .portal-card:hover {
        transform: translateY(-2px);
        border-color: rgba(197, 179, 88, 0.5) !important;
        box-shadow: 0 18px 36px rgba(0, 0, 0, 0.5) !important;
      }
      /* Clamp verbose card descriptions to 2 lines to eliminate text clutter */
      .card p, .portal-card p, .app-card p, .kpi-sub, .portal-desc {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        color: #cbd5e1;
        line-height: 1.5;
      }
      #mgc-scorm-floating-dock,
      #mgc-portal-action-suite {
        display: none !important;
      }

      /* Standardized SaaS Apps Workspace Tab Bar for Section Filtering */
      #mgc-subpage-bar {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin: 0 auto 20px !important;
        padding: 8px !important;
        background: rgba(15, 23, 42, 0.88) !important;
        border: 1px solid rgba(148, 163, 184, 0.18) !important;
        border-radius: 14px !important;
        backdrop-filter: blur(12px) !important;
      }
      #mgc-subpage-bar .sp-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        width: 100%;
      }
      #mgc-subpage-bar .sp-tab {
        flex: 1 1 auto;
        min-width: 135px;
        padding: 10px 14px !important;
        border-radius: 10px !important;
        border: 1px solid transparent !important;
        background: transparent !important;
        color: #cbd5e1 !important;
        font-family: 'Plus Jakarta Sans', 'Inter', sans-serif !important;
        font-weight: 700 !important;
        font-size: 0.82rem !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        text-align: center !important;
      }
      #mgc-subpage-bar .sp-tab:hover {
        color: #ffffff !important;
        background: rgba(59, 130, 246, 0.12) !important;
      }
      #mgc-subpage-bar .sp-tab.active {
        background: linear-gradient(135deg, rgba(30, 58, 138, 0.85), rgba(15, 23, 42, 0.95)) !important;
        color: #fde047 !important;
        border-color: rgba(197, 179, 88, 0.45) !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.35) !important;
      }

      /* MGC Logo Thematic Palette (8 Portals — SaaS Apps Midnight Slate + Monochrome Silver/White) */
      body.theme-mgc {
        --os-border: rgba(148, 163, 184, 0.24);
        --mgc-gold: #ffffff;
        --gold: #e4e4e7;
        --gold-light: #ffffff;
        --gold-bright: #fde047;
        --cobalt: #3b82f6;
        --crimson: #52525b;
        --border: rgba(148, 163, 184, 0.2);
        --border-gold: rgba(197, 179, 88, 0.42);
        background:
          radial-gradient(circle at 15% 15%, rgba(30, 58, 138, 0.22), transparent 40%),
          radial-gradient(circle at 85% 20%, rgba(148, 163, 184, 0.10), transparent 40%),
          #040814 !important;
        color: #f8fafc !important;
      }
      /* MGC external-site cityscape backdrop carried onto internal MGC portals: aerial skyline + subtle grid + shield watermark */
      body.theme-mgc::before {
        background:
          linear-gradient(180deg, rgba(4, 8, 20, 0.62) 0%, rgba(11, 19, 37, 0.78) 55%, rgba(4, 8, 20, 0.92) 100%),
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23E4E4E7' stroke-width='3'/><path d='M26 76V42l24 22 24-22v34' fill='none' stroke='%23A1A1AA' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat 96% 94% / min(24vw, 290px),
          linear-gradient(rgba(148, 163, 184, 0.035) 1px, transparent 1px) 0 0 / 44px 44px,
          linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px) 0 0 / 44px 44px,
          url("https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=2500") center 38% / cover no-repeat;
        opacity: 0.85;
      }
      /* Keep the top bar from colliding at laptop widths: search collapses to an icon + shortcut */
      @media (max-width: 1500px) {
        .os-omnibox { width: auto; }
        .os-search-btn > span:first-child { font-size: 0; }
        .os-search-btn > span:first-child::before { content: '🔍'; font-size: 0.85rem; }
        .os-page-select { max-width: 9rem; }
      }
      body.theme-mgc #mgc-os-topbar {
        background: linear-gradient(90deg, #040814 0%, #0b1325 55%, #111c33 100%);
        border-bottom: 1.5px solid rgba(148, 163, 184, 0.35);
      }
      body.theme-mgc #mgc-os-rail {
        background: linear-gradient(180deg, #040814 0%, #0b1325 100%);
        border-right: 1px solid rgba(148, 163, 184, 0.24);
      }
      body.theme-mgc .hub-toolbar,
      body.theme-mgc .exec-strip,
      body.theme-mgc .hero,
      body.theme-mgc .hero-banner {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(11, 19, 37, 0.95)) !important;
        border: 1px solid rgba(197, 179, 88, 0.38) !important;
        border-radius: 20px !important;
      }

      /* F.I.X Solutions Logo Thematic Palette (8 Portals — Exact SaaS Apps Standard) */
      body.theme-fix {
        --os-border: rgba(197, 179, 88, 0.34);
        --mgc-gold: #C5B358;
        --gold: #C5B358;
        --gold-light: #FDE047;
        --gold-bright: #FDE047;
        --cobalt: #3b82f6;
        --border-gold: rgba(197, 179, 88, 0.45);
        background:
          radial-gradient(circle at 15% 15%, rgba(30, 58, 138, 0.28), transparent 40%),
          radial-gradient(circle at 85% 20%, rgba(197, 179, 88, 0.12), transparent 40%),
          #040814 !important;
        color: #f8fafc !important;
      }
      body.theme-mgc::before,
      body.theme-fix::before {
        content: '';
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
      }
      body.theme-fix::before {
        background:
          linear-gradient(180deg, rgba(4, 8, 20, 0.60) 0%, rgba(11, 20, 38, 0.78) 55%, rgba(4, 8, 20, 0.92) 100%),
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23C5B358' stroke-width='3'/><path d='M30 38h40M30 58h28M30 78h34' stroke='%23FDE047' stroke-width='5' stroke-linecap='round'/></svg>") no-repeat 96% 94% / min(24vw, 290px),
          linear-gradient(rgba(197, 179, 88, 0.04) 1px, transparent 1px) 0 0 / 44px 44px,
          linear-gradient(90deg, rgba(197, 179, 88, 0.04) 1px, transparent 1px) 0 0 / 44px 44px,
          url("https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=2500") center 38% / cover no-repeat;
        opacity: 0.85;
      }
      body.theme-fix #mgc-os-topbar {
        background: linear-gradient(90deg, #040814 0%, #0b1325 55%, #162238 100%);
        border-bottom: 1.5px solid rgba(197, 179, 88, 0.55);
      }
      body.theme-fix #mgc-os-rail {
        background: linear-gradient(180deg, #040814 0%, #0b1325 100%);
        border-right: 1px solid rgba(197, 179, 88, 0.28);
      }
      body.theme-fix .hub-toolbar,
      body.theme-fix .exec-strip,
      body.theme-fix .hero,
      body.theme-fix .hero-banner {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(30, 58, 138, 0.28)) !important;
        border: 1px solid rgba(197, 179, 88, 0.45) !important;
        border-radius: 20px !important;
      }
      body.theme-fix .ws-tab.active,
      body.theme-mgc .ws-tab.active {
        background: linear-gradient(135deg, rgba(30, 58, 138, 0.85), rgba(15, 23, 42, 0.95)) !important;
        color: #fde047 !important;
        border-color: rgba(197, 179, 88, 0.45) !important;
      }

      /* Built-Out Module Action Items & Links Dock (Collapsed by default for Zero-Clutter UX) */
      #mgc-portal-action-suite {
        width: min(1380px, 100%);
        margin: 1.25rem auto 2rem;
        padding: 0.9rem 1.15rem;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
        font-family: 'Inter', sans-serif;
      }
      .pas-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
        margin-top: 0.9rem;
      }
      @media (max-width: 1024px) {
        .pas-grid { grid-template-columns: 1fr; }
      }
      .pas-card {
        background: rgba(4, 8, 20, 0.78);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 14px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .pas-check-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.65rem;
        font-size: 0.76rem;
        color: #f4f4f5;
        padding: 0.42rem 0.55rem;
        border-radius: 0.5rem;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(148, 163, 184, 0.14);
        margin-bottom: 0.4rem;
        transition: background 0.15s, border-color 0.15s;
      }
      .pas-check-item:hover {
        background: rgba(30, 41, 59, 0.9);
        border-color: rgba(197, 179, 88, 0.35);
      }
      .pas-check-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        flex: 1;
        min-width: 0;
      }
      .pas-check-item input[type="checkbox"] {
        accent-color: #c5b358;
        width: 0.95rem;
        height: 0.95rem;
        cursor: pointer;
        flex-shrink: 0;
      }
      .pas-inline-link {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.24rem 0.55rem;
        border-radius: 999px;
        font-size: 0.66rem;
        font-weight: 800;
        text-decoration: none;
        white-space: nowrap;
        flex-shrink: 0;
        background: rgba(197, 179, 88, 0.16);
        border: 1px solid rgba(197, 179, 88, 0.48);
        color: #fde047;
        transition: all 0.15s;
      }
      .pas-inline-link:hover {
        transform: translateY(-1px);
        background: rgba(197, 179, 88, 0.32);
        color: #ffffff;
      }
      .pas-select {
        background: #040814;
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 0.55rem;
        padding: 0.38rem 0.65rem;
        font-size: 0.72rem;
        font-weight: 800;
        cursor: pointer;
      }
      .pas-details {
        margin-top: 0.35rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 0.45rem;
      }
      .pas-details summary {
        font-size: 0.7rem;
        font-weight: 800;
        color: #94a3b8;
        cursor: pointer;
        user-select: none;
        list-style: none;
      }
      .pas-details summary::-webkit-details-marker { display: none; }
      .pas-links-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        padding-top: 0.5rem;
      }
      .pas-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.36rem 0.66rem;
        border-radius: 0.5rem;
        font-size: 0.7rem;
        font-weight: 800;
        text-decoration: none;
        background: rgba(197, 179, 88, 0.16);
        border: 1px solid rgba(197, 179, 88, 0.48);
        color: #fde047;
        transition: all 0.15s;
      }
      .pas-link-btn:hover {
        transform: translateY(-1px);
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);

    let activeBrand = defaultPageBrand;
    function applyBrandTheme(brand) {
      activeBrand = brand;
      document.body.classList.remove('theme-mgc', 'theme-fix');
      document.body.classList.add(brand === 'FIX' ? 'theme-fix' : 'theme-mgc');
      const logoSlot = document.getElementById('os-brand-logo-slot');
      const titleSlot = document.getElementById('os-brand-title-slot');
      const drawerLogoSlot = document.getElementById('os-drawer-logo-slot');
      const drawerTitleSlot = document.getElementById('os-drawer-title-slot');
      const badgeBtn = document.getElementById('os-brand-theme-toggle');
      if (logoSlot) logoSlot.innerHTML = brand === 'FIX' ? FIX_SHIELD_SVG : MGC_SHIELD_SVG;
      if (titleSlot) titleSlot.textContent = brand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE';
      if (drawerLogoSlot) drawerLogoSlot.innerHTML = brand === 'FIX' ? FIX_SHIELD_SVG : MGC_SHIELD_SVG;
      if (drawerTitleSlot) drawerTitleSlot.textContent = brand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE';
      if (badgeBtn) {
        badgeBtn.className = 'os-brand-badge ' + (brand === 'FIX' ? 'fix' : 'mgc');
        badgeBtn.innerHTML = brand === 'FIX'
          ? '⚡ F.I.X Theme (8/16) • Switch'
          : '🛡️ MGC Theme (8/16) • Switch';
      }
    }

    const isSoleOwner = Boolean(
      (serverAuthUser && serverAuthUser.role === 'owner' && serverAuthUser.id === 'owner' && String(serverAuthUser.email || '').toLowerCase() === SOLE_ADMIN_EMAIL) ||
      (!isHttpProtocol() && String(session.email || '').toLowerCase() === SOLE_ADMIN_EMAIL && String(session.role || '').toUpperCase().includes('OWNER'))
    );
    const isEmployeeSession = Boolean(
      !isSoleOwner &&
      ((serverAuthUser && serverAuthUser.ou === 'internal') || String(session.accessTier || '').toUpperCase() === 'INTERNAL_EMPLOYEE')
    );
    function isHttpProtocol() {
      return window.location.protocol === 'http:' || window.location.protocol === 'https:';
    }
    const userAllowedPortals = isSoleOwner
      ? ['*']
      : (Array.isArray(session.allowedPortals) && session.allowedPortals.length ? session.allowedPortals : DEFAULT_CUSTOMER_PORTALS);

    const adminGrantedPortalEntries = isSoleOwner
      ? pages
      : pages.filter(p => p.file !== 'saas-apps-and-lms-showcase.html' && p.file !== 'member-portal.html' && (!isEmployeeSession || p.file !== 'finance-command.html') && userAllowedPortals.includes(p.file));

    // Group pages by category for Administrator; for Employee and Client users, strictly omit any unauthorized links
    const categories = ['Command & Auth', 'Apps & Labs', 'Canvas Academy', 'Commerce & Gov'];
    const menusHtml = isSoleOwner
      ? categories.map(cat => {
          const items = pages.filter(p => p.cat === cat);
          const isCatActive = items.some(p => p.file.toLowerCase() === currentFile);
          return `
            <div class="os-menu-wrap" data-os-menu>
              <button type="button" class="os-menu-trigger" aria-expanded="false" style="${isCatActive ? 'color:#fcd34d;' : ''}">
                <span>${cat}</span>
                <span class="os-caret">▾</span>
              </button>
              <div class="os-dropdown-panel" role="menu">
                ${items.map(item => `
                  <a href="${item.file}" role="menuitem" class="os-drop-item ${item.file.toLowerCase() === currentFile ? 'active' : ''}">
                    <span class="os-drop-icon" style="border-color:${item.color}66;">${item.icon}</span>
                    <span style="flex:1;min-width:0;">
                      <span class="os-drop-title">${item.full}</span>
                      <span class="os-drop-sub">${item.tag}</span>
                    </span>
                    <span class="os-item-brand-pill ${item.brand === 'FIX' ? 'fix' : 'mgc'}">${item.brand === 'FIX' ? 'F.I.X' : 'MGC'}</span>
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        }).join('') + `
          <a href="access-admin.html" class="os-menu-trigger" style="text-decoration:none;color:#fde047;border:1px solid rgba(197,179,88,0.45);background:rgba(197,179,88,0.14);font-weight:800;">
            <span>MGC Directory</span>
          </a>
        `
      : isEmployeeSession
        ? `
          <a href="member-portal.html" class="os-menu-trigger" style="text-decoration:none;${currentFile === 'member-portal.html' ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
            <span>Workspace</span>
          </a>
          <a href="access-admin.html?tab=users&amp;ou=external" class="os-menu-trigger" style="text-decoration:none;${currentFile === 'access-admin.html' ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
            <span>Client Directory</span>
          </a>
          <a href="saas-apps-and-lms-showcase.html" class="os-menu-trigger" style="text-decoration:none;${currentFile === 'saas-apps-and-lms-showcase.html' ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
            <span>SaaS &amp; LMS</span>
          </a>
          ${adminGrantedPortalEntries.map(item => `
            <a href="${item.file}" class="os-menu-trigger" style="text-decoration:none;${item.file.toLowerCase() === currentFile ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
              <span>${item.label}</span>
            </a>
          `).join('')}
        `
        : currentFile === 'newsletter.html'
          ? `
          <a href="#consultation" data-open-nl-consultation="1" class="os-menu-trigger" style="text-decoration:none;color:#fde047;border-color:rgba(197,179,88,0.45);">
            <span>Submit Request &amp; Consultation</span>
          </a>
          `
          : `
          <a href="member-portal.html" class="os-menu-trigger" style="text-decoration:none;${currentFile === 'member-portal.html' ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
            <span>Workspace</span>
          </a>
          <a href="saas-apps-and-lms-showcase.html" class="os-menu-trigger" style="text-decoration:none;${currentFile === 'saas-apps-and-lms-showcase.html' ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
            <span>SaaS &amp; LMS</span>
          </a>
          <a href="member-portal.html?view=consultation" class="os-menu-trigger" style="text-decoration:none;">
            <span>Submit Request &amp; Consultation</span>
          </a>
          <a href="member-portal.html?view=payment" class="os-menu-trigger" style="text-decoration:none;">
            <span>Membership &amp; Billing</span>
          </a>
          ${adminGrantedPortalEntries.map(item => `
            <a href="${item.file}" class="os-menu-trigger" style="text-decoration:none;${item.file.toLowerCase() === currentFile ? 'color:#fde047;border-color:rgba(197,179,88,0.45);background:rgba(37,99,235,0.22);' : ''}">
              <span>${item.label}</span>
            </a>
          `).join('')}
        `;

    const drawerCategoriesHtml = isSoleOwner
      ? categories.map(cat => {
          const items = pages.filter(p => p.cat === cat);
          return `
            <div class="os-drawer-cat">
              <div class="os-drawer-cat-title">${cat}</div>
              ${items.map(item => `
                <a href="${item.file}" class="os-drop-item ${item.file.toLowerCase() === currentFile ? 'active' : ''}">
                  <span class="os-drop-icon" style="border-color:${item.color}66;">${item.icon}</span>
                  <span style="flex:1;min-width:0;">
                    <span class="os-drop-title">${item.full}</span>
                    <span class="os-drop-sub">${item.tag}</span>
                  </span>
                  <span class="os-item-brand-pill ${item.brand === 'FIX' ? 'fix' : 'mgc'}">${item.brand === 'FIX' ? 'F.I.X' : 'MGC'}</span>
                </a>
              `).join('')}
            </div>
          `;
        }).join('')
      : `
        <div class="os-drawer-cat">
          <div class="os-drawer-cat-title">Authorized Navigation</div>
          <a href="saas-apps-and-lms-showcase.html" class="os-drop-item ${currentFile === 'saas-apps-and-lms-showcase.html' ? 'active' : ''}">
            <span class="os-drop-icon" style="border-color:#C5B35866;">⚡</span>
            <span style="flex:1;min-width:0;">
              <span class="os-drop-title">SaaS Apps &amp; LMS</span>
              <span class="os-drop-sub">Authorized Applications</span>
            </span>
          </a>
          ${isEmployeeSession ? `
            <a href="access-admin.html?tab=users&amp;ou=external" class="os-drop-item ${currentFile === 'access-admin.html' ? 'active' : ''}">
              <span class="os-drop-icon" style="border-color:#3B82F666;">📁</span>
              <span style="flex:1;min-width:0;">
                <span class="os-drop-title">Client Directory</span>
                <span class="os-drop-sub">OU=External Client Scope</span>
              </span>
            </a>
          ` : `
            <a href="member-portal.html?view=consultation" class="os-drop-item">
              <span class="os-drop-icon" style="border-color:#3B82F666;">📋</span>
              <span style="flex:1;min-width:0;">
                <span class="os-drop-title">Submit Request &amp; Consultation</span>
                <span class="os-drop-sub">Guided Architecture Scope</span>
              </span>
            </a>
            <a href="member-portal.html?view=payment" class="os-drop-item ${currentFile === 'member-portal.html' ? 'active' : ''}">
              <span class="os-drop-icon" style="border-color:#10B98166;">💳</span>
              <span style="flex:1;min-width:0;">
                <span class="os-drop-title">Billing &amp; Payment</span>
                <span class="os-drop-sub">PCI-DSS v4.0 Verified</span>
              </span>
            </a>
          `}
          ${adminGrantedPortalEntries.map(item => `
            <a href="${item.file}" class="os-drop-item ${item.file.toLowerCase() === currentFile ? 'active' : ''}">
              <span class="os-drop-icon" style="border-color:${item.color}66;">${item.icon}</span>
              <span style="flex:1;min-width:0;">
                <span class="os-drop-title">${item.full}</span>
                <span class="os-drop-sub">Authorized Portal</span>
              </span>
            </a>
          `).join('')}
        </div>
      `;

    const railItems = isSoleOwner
      ? [
          { file: 'access-admin.html', icon: '👑', label: 'Admin', full: 'Access Admin · Grant User Features' }
        ].concat(pages.filter(p => p.rail))
      : isEmployeeSession
        ? [
            { file: 'member-portal.html', icon: '🏢', label: 'Workspace', full: 'Employee Workspace' },
            { file: 'access-admin.html?tab=users&ou=external', icon: '📁', label: 'Clients', full: 'MGC Client Directory' },
            { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'SaaS & LMS', full: 'SaaS Apps & SCORM LMS Showcase' }
          ].concat(adminGrantedPortalEntries.map(p => ({ file: p.file, icon: p.icon, label: p.label, full: p.full })))
        : [
            { file: 'member-portal.html', icon: '🏠', label: 'Workspace', full: 'Client Workspace' },
            { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'SaaS & LMS', full: 'SaaS Apps & SCORM LMS Showcase' },
            { file: 'member-portal.html?view=consultation', icon: '📋', label: 'Consult', full: 'Submit Request & Guided Consultation' },
            { file: 'member-portal.html?view=payment', icon: '💳', label: 'Payment', full: 'Billing & Payment Center' }
          ].concat(adminGrantedPortalEntries.map(p => ({ file: p.file, icon: p.icon, label: p.label, full: p.full })));

    const shellWrapper = document.createElement('div');
    shellWrapper.id = 'mgc-os-shell';
    shellWrapper.innerHTML = `
      <!-- 1. TOP BAR -->
      <header id="mgc-os-topbar" role="banner">
        <div class="os-left">
          <button type="button" class="os-hamburger-btn" id="os-hamburger-trigger" aria-expanded="false" aria-controls="os-offcanvas-drawer" title="Open Navigation Drawer">
            <span aria-hidden="true">☰</span>
            <span>Menu</span>
          </button>

          <button type="button" class="os-waffle-btn" id="os-waffle-trigger" aria-label="All 16 Workspace Apps" title="Google-Style 9-Dot App Launcher" style="${isSoleOwner ? '' : 'display:none;'}">
            <svg class="os-waffle-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM16,6c0,1.1 0.9,2 2,2s2,-0.9 2,-2 -0.9,-2 -2,-2 -2,0.9 -2,2zM12,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2z"/>
            </svg>
          </button>

          <a href="${isSoleOwner ? 'admin-command-portal.html' : 'saas-apps-and-lms-showcase.html'}" class="os-brand">
            <span id="os-brand-logo-slot">${defaultPageBrand === 'FIX' ? FIX_SHIELD_SVG : MGC_SHIELD_SVG}</span>
            <span id="os-brand-title-slot">${defaultPageBrand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE'}</span>
          </a>

          <nav class="os-menus" aria-label="Primary Workspace Navigation">
            ${menusHtml}
          </nav>
        </div>

        <!-- Google Omnibox Search Trigger (Administrator Only) -->
        <div class="os-omnibox" style="${isSoleOwner ? '' : 'display:none;'}">
          <button type="button" class="os-search-btn" id="os-omnibox-trigger" aria-label="Search portals, courses, tools">
            <span>🔍 Search Portals</span>
            <span class="os-kbd">⌘K</span>
          </button>
        </div>

        <!-- Right: Brand Theme + Section Jump + Profile Menu (Zero Clutter) -->
        <div class="os-right">
          <button type="button" id="os-brand-theme-toggle" class="os-brand-badge ${defaultPageBrand === 'FIX' ? 'fix' : 'mgc'}" style="${isSoleOwner ? '' : 'display:none;'}" title="Portal Brand Theme">
            ${defaultPageBrand === 'FIX' ? '⚡ F.I.X Theme (8/16) • Switch' : '🛡️ MGC Theme (8/16) • Switch'}
          </button>

          <select id="os-subpage-select" class="os-page-select" aria-label="Jump to Page Section" title="Filter or Jump to Page Section" style="display:none;"></select>

          <div class="os-menu-wrap" data-os-menu>
            <button type="button" class="os-profile-btn" aria-expanded="false">
              <span class="os-avatar" id="os-avatar-initials">${hasValidSession() ? (isSoleOwner ? 'MK' : 'US') : '🔒'}</span>
              <span id="os-profile-short">${hasValidSession() ? (isSoleOwner ? 'Admin' : 'Account') : 'Sign In'}</span>
              <span class="os-caret">▾</span>
            </button>
            <div class="os-dropdown-panel" style="right:0;left:auto;min-width:255px;">
              <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;">
                <div id="os-profile-name" style="font-size:13px;font-weight:800;color:#fff;">${session.name}</div>
                <div id="os-profile-status" style="font-size:11px;color:${hasValidSession() ? '#86efac' : '#fca5a5'};font-weight:700;">${hasValidSession() ? (isSoleOwner ? '👑 Sole Administrator Verified' : '🛡️ SaaS Apps & LMS + Secure Billing') : '🔒 Authentication Required'}</div>
              </div>
              <button type="button" class="os-drop-item" id="os-toggle-clean" style="display:none;width:100%;background:none;border:none;cursor:pointer;text-align:left;">
                <span class="os-drop-icon">✨</span>
                <span>
                  <span class="os-drop-title" id="os-clean-label">Minimalist UI: ${cleanOn ? 'ON' : 'OFF'}</span>
                </span>
              </button>
              <a href="saas-apps-and-lms-showcase.html" class="os-drop-item">
                <span class="os-drop-icon">⚡</span>
                <span>
                  <span class="os-drop-title">SaaS Apps &amp; LMS</span>
                  <span class="os-drop-sub">Launch authorized apps &amp; simulators</span>
                </span>
              </a>
              ${isEmployeeSession ? `
                <a href="access-admin.html?tab=users&amp;ou=external" class="os-drop-item">
                  <span class="os-drop-icon">📁</span>
                  <span>
                    <span class="os-drop-title">Client Directory</span>
                    <span class="os-drop-sub">Manage OU=External Client Accounts</span>
                  </span>
                </a>
              ` : `
                <a href="member-portal.html?view=consultation" class="os-drop-item">
                  <span class="os-drop-icon">📋</span>
                  <span>
                    <span class="os-drop-title">Submit Request &amp; Consultation</span>
                    <span class="os-drop-sub">Guided Architecture Scope</span>
                  </span>
                </a>
                <a href="member-portal.html?view=payment" class="os-drop-item">
                  <span class="os-drop-icon">💳</span>
                  <span>
                    <span class="os-drop-title">Billing &amp; Payment</span>
                    <span class="os-drop-sub">PCI-DSS v4.0 Verified</span>
                  </span>
                </a>
              `}
              ${isSoleOwner ? `
                <a href="access-admin.html" class="os-drop-item">
                  <span class="os-drop-icon">👑</span>
                  <span>
                    <span class="os-drop-title">MGC Directory (Grant Features)</span>
                    <span class="os-drop-sub">Manage all OUs &amp; security policies</span>
                  </span>
                </a>
                <a href="admin-command-portal.html" class="os-drop-item">
                  <span class="os-drop-icon">🛡️</span>
                  <span>
                    <span class="os-drop-title">16-Portal Command Hub</span>
                    <span class="os-drop-sub">Master Administrator Overview</span>
                  </span>
                </a>
              ` : ''}
              <button type="button" class="os-drop-item" id="os-lock-session" style="width:100%;background:none;border:none;cursor:pointer;text-align:left;">
                <span class="os-drop-icon" style="border-color:rgba(220,38,38,0.45);background:rgba(220,38,38,0.12);">🔒</span>
                <span>
                  <span class="os-drop-title" style="color:#fca5a5;">Sign Out</span>
                  <span class="os-drop-sub">End active session</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- 2. OFF-CANVAS SLIDE-OUT NAVIGATION DRAWER (<1024px) -->
      <div id="os-offcanvas-scrim" aria-hidden="true"></div>
      <aside id="os-offcanvas-drawer" aria-label="Mobile & Tablet Workspace Navigation">
        <div class="os-drawer-hdr">
          <div style="display:flex;align-items:center;gap:0.55rem;">
            <span id="os-drawer-logo-slot">${defaultPageBrand === 'FIX' ? FIX_SHIELD_SVG : MGC_SHIELD_SVG}</span>
            <div>
              <div id="os-drawer-title-slot" style="font-size:0.82rem;font-weight:900;color:#fff;letter-spacing:0.04em;">${defaultPageBrand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE'}</div>
              <div style="font-size:0.65rem;color:#fcd34d;font-weight:700;">${isSoleOwner ? 'Sole Administrator' : (isEmployeeSession ? 'Internal Staff' : 'SaaS Apps & LMS')}</div>
            </div>
          </div>
          <button type="button" class="os-drawer-close" id="os-drawer-close-btn" aria-label="Close Navigation Drawer">✕</button>
        </div>
        <div class="os-drawer-body">
          ${isSoleOwner ? `
            <button type="button" id="os-drawer-search-btn" style="width:100%;min-height:2.75rem;margin-bottom:0.9rem;background:rgba(30,58,138,0.35);border:1px solid rgba(252,211,77,0.35);border-radius:0.65rem;color:#f8fafc;font-weight:700;font-size:0.78rem;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:0 0.85rem;">
              <span>🔍 Quick Search All Portals</span>
              <span class="os-kbd">⌘K</span>
            </button>
          ` : ''}
          ${drawerCategoriesHtml}
        </div>
      </aside>

      <!-- 3. GOOGLE 9-DOT WAFFLE APP LAUNCHER POPOVER (Administrator Only — Omitted from DOM for non-admins) -->
      ${isSoleOwner ? `
      <div id="os-waffle-popover">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px;">
          <span style="font-size:11px;font-weight:800;color:#fcd34d;text-transform:uppercase;letter-spacing:0.08em;">8 MGC + 8 F.I.X Portals</span>
          <a href="access-admin.html" style="font-size:11px;color:#93c5fd;text-decoration:none;font-weight:700;">MGC Directory →</a>
        </div>
        <div class="waffle-grid">
          ${pages.map(p => `
            <a href="${p.file}" class="waffle-tile ${p.file.toLowerCase() === currentFile ? 'active' : ''}">
              <div class="waffle-icon" style="border-color:${p.color}66;">${p.icon}</div>
              <span class="waffle-label">${p.label}</span>
              <span style="font-size:9px;font-weight:900;color:${p.brand === 'FIX' ? '#FDE047' : '#93c5fd'};margin-top:2px;">[${p.brand === 'FIX' ? 'F.I.X' : 'MGC'}]</span>
            </a>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- 4. INSTRUCTURE CANVAS LEFT ICON RAIL -->
      <aside id="mgc-os-rail" aria-label="Quick Launch Dock">
        <div class="rail-group">
          ${railItems.map(p => {
            const baseFile = p.file.split('?')[0].toLowerCase();
            return `
              <a href="${p.file}" class="rail-item ${baseFile === currentFile ? 'active' : ''}" title="${p.full}">
                <span class="rail-ico">${p.icon}</span>
                <span class="rail-txt">${p.label}</span>
              </a>
            `;
          }).join('')}
        </div>
        <div class="rail-group rail-bottom" style="${isSoleOwner ? '' : 'display:none;'}">
          <button type="button" class="rail-item" id="rail-cmd-btn" style="background:none;border:none;cursor:pointer;" title="Search All Portals (Ctrl+K)">
            <span class="rail-ico">🔍</span>
            <span class="rail-txt">Search</span>
          </button>
        </div>
      </aside>

      <!-- 5. OMNIBOX SEARCH MODAL (Ctrl+K) -->
      <div id="os-cmd-backdrop" role="dialog" aria-modal="true" aria-label="Search Workspace Portals">
        <div class="os-cmd-modal">
          <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;gap:10px;align-items:center;">
            <span>🔍</span>
            <input id="os-cmd-input" type="text" placeholder="Type a portal, course, or tool name..." style="flex:1;background:transparent;border:none;color:#fff;font-size:14px;outline:none;" />
            <button type="button" id="os-cmd-close" style="background:rgba(255,255,255,0.08);border:none;color:#cbd5e1;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;min-height:36px;">ESC</button>
          </div>
          <div id="os-cmd-results" style="max-height:360px;overflow-y:auto;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
        </div>
      </div>

      <!-- 6. FEDERATED SSO ENFORCEMENT GATE OVERLAY -->
      <div id="os-2fa-gate-backdrop" role="dialog" aria-modal="true" aria-label="Federated SSO Enforcement Gate" style="position:fixed;inset:0;background:rgba(4,8,20,0.96);backdrop-filter:blur(16px);z-index:100001;display:none;align-items:center;justify-content:center;padding:1.25rem;font-family:'Inter',sans-serif;">
        <div style="width:100%;max-width:34rem;background:rgba(15,23,42,0.96);border:1px solid rgba(197,179,88,0.48);border-radius:18px;padding:1.65rem;box-shadow:0 30px 90px rgba(0,0,0,0.95);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.25rem 0.65rem;border-radius:999px;background:rgba(220,38,38,0.18);border:1px solid rgba(220,38,38,0.45);color:#fca5a5;font-size:0.68rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">🔒 Federated SSO Enforced</span>
            <span style="font-size:0.7rem;color:#fde047;font-weight:700;">OIDC 2.0 • Zero Passwords</span>
          </div>
          <h3 style="font-size:1.15rem;font-weight:900;color:#fff;margin:0 0 0.35rem;">Single Sign-On Required</h3>
          <p style="font-size:0.78rem;color:#cbd5e1;line-height:1.5;margin:0 0 1rem;">
            Authenticate with <strong>Google</strong>, <strong>Microsoft</strong>, or <strong>Apple</strong> SSO. Standard accounts receive access to <strong>SaaS Apps &amp; LMS</strong> and <strong>Payment &amp; Billing</strong>.
          </p>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.55rem;margin-bottom:0.9rem;" role="group" aria-label="Choose SSO Identity Provider">
            <button type="button" data-os-sso-prov="google" class="os-sso-prov-btn" style="padding:0.65rem 0.5rem;border-radius:0.65rem;background:rgba(37,99,235,0.28);border:1px solid #c5b358;color:#fff;font-size:0.76rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
              <span>G</span><span>Google SSO</span>
            </button>
            <button type="button" data-os-sso-prov="microsoft" class="os-sso-prov-btn" style="padding:0.65rem 0.5rem;border-radius:0.65rem;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.3);color:#e2e8f0;font-size:0.76rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
              <span>⊞</span><span>Microsoft SSO</span>
            </button>
            <button type="button" data-os-sso-prov="apple" class="os-sso-prov-btn" style="padding:0.65rem 0.5rem;border-radius:0.65rem;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.3);color:#e2e8f0;font-size:0.76rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
              <span></span><span>Apple SSO</span>
            </button>
          </div>

          <div style="margin-bottom:0.85rem;">
            <label id="os-sso-email-label" style="display:block;font-size:0.68rem;font-weight:800;color:#fde047;text-transform:uppercase;margin-bottom:0.3rem;">Google SSO Account Email</label>
            <input id="os-2fa-email" type="email" value="" placeholder="Enter your authorized SSO email" autocomplete="off" spellcheck="false" style="width:100%;padding:0.65rem 0.8rem;border-radius:0.55rem;background:#040814;border:1px solid rgba(197,179,88,0.45);color:#fff;font-size:0.82rem;" />
          </div>

          <div id="os-2fa-admin-mfa-wrap" style="display:none;margin-bottom:0.85rem;">
            <label style="display:block;font-size:0.68rem;font-weight:800;color:#fde047;text-transform:uppercase;margin-bottom:0.3rem;">👑 Sole Administrator 2FA / Passkey Code</label>
            <input id="os-2fa-mfa-code" type="password" value="" placeholder="Enter Owner 2FA Code" autocomplete="off" style="width:100%;padding:0.65rem 0.8rem;border-radius:0.55rem;background:#040814;border:1px solid rgba(197,179,88,0.45);color:#fff;font-size:0.82rem;" />
          </div>

          <div id="os-2fa-msg" style="display:none;padding:0.55rem 0.75rem;border-radius:0.5rem;font-size:0.74rem;font-weight:700;margin-bottom:0.75rem;"></div>
          <div style="display:flex;flex-wrap:wrap;gap:0.55rem;">
            <button type="button" id="os-2fa-submit" style="flex:1;min-width:190px;padding:0.7rem 1rem;border-radius:0.65rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);border:1px solid rgba(96,165,250,0.55);color:#fff;font-size:0.82rem;font-weight:900;cursor:pointer;">🔓 Continue with Google SSO →</button>
            <a href="login.html" style="padding:0.7rem 0.85rem;border-radius:0.65rem;background:rgba(15,23,42,0.85);border:1px solid rgba(197,179,88,0.38);color:#fde047;font-size:0.75rem;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;">🔑 Full SSO Login</a>
          </div>
        </div>
      </div>
    `;

    document.body.prepend(shellWrapper);

    // Wire Dropdown Menus, Waffle Popover & Off-Canvas Hamburger Drawer
    const waffleBtn = document.getElementById('os-waffle-trigger');
    const wafflePop = document.getElementById('os-waffle-popover');
    const menuWraps = document.querySelectorAll('[data-os-menu]');
    const hamburgerBtn = document.getElementById('os-hamburger-trigger');
    const offcanvasDrawer = document.getElementById('os-offcanvas-drawer');
    const offcanvasScrim = document.getElementById('os-offcanvas-scrim');
    const drawerCloseBtn = document.getElementById('os-drawer-close-btn');

    function closeOffcanvasDrawer() {
      offcanvasDrawer.classList.remove('open');
      offcanvasScrim.classList.remove('open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }

    function openOffcanvasDrawer() {
      closeAllPopovers();
      offcanvasDrawer.classList.add('open');
      offcanvasScrim.classList.add('open');
      hamburgerBtn.setAttribute('aria-expanded', 'true');
    }

    function closeAllPopovers() {
      wafflePop.classList.remove('open');
      waffleBtn.classList.remove('active');
      menuWraps.forEach(w => {
        w.classList.remove('open');
        const btn = w.querySelector('button');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }

    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (offcanvasDrawer.classList.contains('open')) {
        closeOffcanvasDrawer();
      } else {
        openOffcanvasDrawer();
      }
    });
    drawerCloseBtn.addEventListener('click', closeOffcanvasDrawer);
    offcanvasScrim.addEventListener('click', closeOffcanvasDrawer);

    waffleBtn.addEventListener('click', (e) => {
      if (!isSoleOwner) return;
      e.stopPropagation();
      closeOffcanvasDrawer();
      const wasOpen = wafflePop.classList.contains('open');
      closeAllPopovers();
      if (!wasOpen) {
        wafflePop.classList.add('open');
        waffleBtn.classList.add('active');
      }
    });

    menuWraps.forEach(wrap => {
      const btn = wrap.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOffcanvasDrawer();
        const wasOpen = wrap.classList.contains('open');
        closeAllPopovers();
        if (!wasOpen) {
          wrap.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    document.addEventListener('click', () => closeAllPopovers());
    wafflePop.addEventListener('click', e => e.stopPropagation());
    offcanvasDrawer.addEventListener('click', e => e.stopPropagation());

    // Silent background initialization of local IndexedDB mirror (zero UI clutter)
    (function ensureEnterpriseIndexedDB() {
      try {
        if (!window.indexedDB) return;
        const req = window.indexedDB.open('MGC_Enterprise_DB', 1);
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result;
          ['users', 'projects', 'agile_items', 'shares', 'audit', 'cost_ledger'].forEach(st => {
            if (!db.objectStoreNames.contains(st)) db.createObjectStore(st, { keyPath: 'id' });
          });
        };
      } catch (_) {}
    })();

    // Wire Minimalist UI Toggle
    document.getElementById('os-toggle-clean').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !document.body.classList.contains('mgc-clean-ui');
      document.body.classList.toggle('mgc-clean-ui', next);
      localStorage.setItem(CLEAN_UI_KEY, next ? '1' : '0');
      document.getElementById('os-clean-label').textContent = `Minimalist UI: ${next ? 'ON' : 'OFF'}`;
    });

    // Wire Federated SSO Enforcement Gate Overlay (Google, Microsoft, Apple Only) & Lock Session Button
    const gateBackdrop = document.getElementById('os-2fa-gate-backdrop');
    const lockSessionBtn = document.getElementById('os-lock-session');
    const gateEmail = document.getElementById('os-2fa-email');
    const gateAdminMfaWrap = document.getElementById('os-2fa-admin-mfa-wrap');
    const gateAdminMfaInput = document.getElementById('os-2fa-mfa-code');
    const gateEmailLabel = document.getElementById('os-sso-email-label');
    const gateSubmitBtn = document.getElementById('os-2fa-submit');
    const gateMsg = document.getElementById('os-2fa-msg');
    let selectedSsoProvider = 'google';

    gateEmail.addEventListener('input', () => {
      const em = gateEmail.value.trim().toLowerCase();
      if (gateAdminMfaWrap) {
        gateAdminMfaWrap.style.display = em === SOLE_ADMIN_EMAIL ? 'block' : 'none';
      }
    });

    const SSO_NAMES = {
      google: 'Google SSO',
      microsoft: 'Microsoft SSO',
      apple: 'Apple SSO'
    };

    document.querySelectorAll('[data-os-sso-prov]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-os-sso-prov');
        if (!SSO_NAMES[p]) return;
        selectedSsoProvider = p;
        document.querySelectorAll('[data-os-sso-prov]').forEach(b => {
          const active = b.getAttribute('data-os-sso-prov') === p;
          b.style.borderColor = active ? '#c5b358' : 'rgba(148,163,184,0.3)';
          b.style.background = active ? 'rgba(37,99,235,0.28)' : 'rgba(15,23,42,0.9)';
          b.style.color = active ? '#ffffff' : '#e2e8f0';
        });
        if (gateEmailLabel) gateEmailLabel.textContent = `${SSO_NAMES[p]} Account Email`;
        if (gateSubmitBtn) gateSubmitBtn.textContent = `🔓 Continue with ${SSO_NAMES[p]} →`;
        if (gateEmail.value.trim()) {
          verifyGateSsoSubmission(p);
        } else {
          gateEmail.focus();
        }
      });
    });

    const PUBLIC_AND_BASE_PORTALS = [
      'onboarding-portal.html',
      'login.html',
      'request-access.html',
      'member-portal.html',
      'saas-apps-and-lms-showcase.html'
    ];

    function isCurrentPathAllowedForCustomer(sess) {
      const pathLower = (window.location.pathname || '').toLowerCase();
      const projMatch = pathLower.match(/\/projects\/([^\/]+)\//);
      const allowedApps = (sess && Array.isArray(sess.allowedApps)) ? sess.allowedApps : ['sterling-auto-repair', 'client-turnkey-forge'];
      if (projMatch) {
        const slug = projMatch[1];
        return allowedApps.includes('*') || allowedApps.includes(slug);
      }
      if (PUBLIC_AND_BASE_PORTALS.includes(currentFile)) return true;
      const portals = (sess && Array.isArray(sess.allowedPortals)) ? sess.allowedPortals : DEFAULT_CUSTOMER_PORTALS;
      return portals.includes('*') || portals.includes(currentFile);
    }

    function isSessionOwner(sess) {
      if (!sess || !sess.email) return false;
      const em = String(sess.email).toLowerCase();
      if (em !== SOLE_ADMIN_EMAIL) return false;
      if (isHttpProtocol()) {
        return Boolean(serverAuthUser && serverAuthUser.role === 'owner' && serverAuthUser.id === 'owner');
      }
      return String(sess.role || '').toUpperCase().includes('OWNER');
    }

    function checkAndEnforce2FAGate() {
      const publicAuthPages = ['onboarding-portal.html', 'login.html', 'request-access.html', 'newsletter.html', 'marketing-home.html'];
      if (publicAuthPages.includes(currentFile)) {
        gateBackdrop.style.display = 'none';
        return;
      }
      if (isGateLocked()) {
        gateBackdrop.style.display = 'flex';
        return;
      }
      const sess = getSession();
      if (!isSessionOwner(sess) && !isCurrentPathAllowedForCustomer(sess)) {
        gateBackdrop.style.display = 'flex';
        if (gateMsg) {
          gateMsg.style.display = 'block';
          gateMsg.style.background = 'rgba(245,158,11,0.16)';
          gateMsg.style.border = '1px solid rgba(245,158,11,0.5)';
          gateMsg.style.color = '#fde68a';
          gateMsg.innerHTML = `🛡️ <b>Membership Tier Gate:</b> Signed in as <code>${sess ? sess.email : 'Member'}</code>. Standard accounts include <b>Starter SaaS &amp; LMS</b>. Unlock additional applications and workspaces via your Membership Tier or Administrator grant.<br/><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><a href="saas-apps-and-lms-showcase.html" style="padding:5px 10px;border-radius:6px;background:rgba(197,179,88,0.25);border:1px solid #c5b358;color:#fde047;font-weight:800;text-decoration:none;">⚡ Open SaaS Apps &amp; LMS →</a><a href="member-portal.html?view=payment" style="padding:5px 10px;border-radius:6px;background:#10b981;color:#04130d;font-weight:800;text-decoration:none;">⬆️ Upgrade Membership Tier →</a></div>`;
        }
        return;
      }
      gateBackdrop.style.display = 'none';
    }

    lockSessionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopovers();
      localStorage.setItem(GATE_LOCK_KEY, '1');
      localStorage.removeItem(SESSION_KEY);
      try {
        sessionStorage.removeItem('mgcw.uid');
        sessionStorage.removeItem('mgcw.sso_provider');
      } catch (_) {}
      if (isHttpProtocol()) {
        window.location.href = '/api/auth/logout';
      } else {
        window.location.href = 'login.html';
      }
    });

    async function verifyGateSsoSubmission(provOverride) {
      const provider = provOverride || selectedSsoProvider || 'google';
      const em = gateEmail.value.trim().toLowerCase();
      const mfaVal = gateAdminMfaInput ? gateAdminMfaInput.value.trim() : '';
      if (!ALLOWED_SSO_PROVIDERS.includes(provider)) {
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(220,38,38,0.18)';
        gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
        gateMsg.style.color = '#fca5a5';
        gateMsg.textContent = '❌ SSO Policy Violation: Only Google, Microsoft, or Apple SSO is allowed.';
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(em)) {
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(220,38,38,0.18)';
        gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
        gateMsg.style.color = '#fca5a5';
        gateMsg.textContent = `❌ Enter a valid ${SSO_NAMES[provider]} email address.`;
        return;
      }
      if (em === 'ana@example.com') {
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(220,38,38,0.18)';
        gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
        gateMsg.style.color = '#fca5a5';
        gateMsg.textContent = '❌ Account pending Owner approval in Access Admin.';
        return;
      }

      const isAdmin = em === SOLE_ADMIN_EMAIL;
      if (isAdmin && !mfaVal) {
        if (gateAdminMfaWrap) gateAdminMfaWrap.style.display = 'block';
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(245,158,11,0.18)';
        gateMsg.style.border = '1px solid rgba(245,158,11,0.45)';
        gateMsg.style.color = '#fde68a';
        gateMsg.textContent = '👑 Administrator Account Protected: Enter your Owner 2FA / Passkey code to authenticate.';
        if (gateAdminMfaInput) gateAdminMfaInput.focus();
        return;
      }

      let allowedApps = ['sterling-auto-repair', 'client-turnkey-forge'];
      let allowedPortals = DEFAULT_CUSTOMER_PORTALS;
      let serverUid = 'cara';

      if (isHttpProtocol()) {
        try {
          const resp = await fetch('/api/auth/sso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, email: em, mfaCode: mfaVal || undefined })
          });
          const data = await resp.json();
          if (!data || !data.ok) {
            if (data && data.requireAdminMfa && gateAdminMfaWrap) {
              gateAdminMfaWrap.style.display = 'block';
            }
            gateMsg.style.display = 'block';
            gateMsg.style.background = 'rgba(220,38,38,0.18)';
            gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
            gateMsg.style.color = '#fca5a5';
            gateMsg.textContent = data && data.error ? data.error : '❌ SSO Verification failed.';
            return;
          }
          serverUid = data.uid || serverUid;
          if (Array.isArray(data.allowedApps)) allowedApps = data.allowedApps;
          if (Array.isArray(data.allowedPortals)) allowedPortals = data.allowedPortals;
          serverAuthUser = {
            id: serverUid,
            email: em,
            role: data.role,
            allowedApps,
            allowedPortals
          };
        } catch (_) {
          gateMsg.style.display = 'block';
          gateMsg.style.color = '#fca5a5';
          gateMsg.textContent = '❌ Unable to reach authentication server.';
          return;
        }
      }

      if (!isAdmin && typeof MGCW !== 'undefined' && MGCW.provisionCustomerSso) {
        const u = MGCW.provisionCustomerSso(em, undefined, provider);
        if (u && u.id) {
          serverUid = u.id;
          MGCW.signInAs(u.id, provider);
          if (Array.isArray(u.allowedApps)) allowedApps = u.allowedApps;
        }
      }

      const verifiedObj = {
        email: em,
        name: isAdmin ? 'Malik A. Khabir' : em.split('@')[0],
        org: 'Milton Group Concepts LLC & F.I.X Solutions LLC',
        role: isAdmin ? `OWNER_ADMIN (${SSO_NAMES[provider].toUpperCase()})` : `CLIENT_PARTNER (${SSO_NAMES[provider].toUpperCase()})`,
        ssoVerified: true,
        ssoProvider: provider,
        access: isAdmin ? 'INTERNAL_SUITE_FULL' : 'CUSTOMER_RESTRICTED',
        accessTier: isAdmin ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
        allowedApps,
        allowedPortals,
        verifiedAt: new Date().toISOString()
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(verifiedObj));
      localStorage.removeItem(GATE_LOCK_KEY);
      try {
        sessionStorage.setItem('mgcw.uid', serverUid);
        sessionStorage.setItem('mgcw.sso_provider', provider);
      } catch (_) {}

      window.location.reload();
    }

    gateSubmitBtn.addEventListener('click', () => verifyGateSsoSubmission(selectedSsoProvider));
    gateEmail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyGateSsoSubmission(selectedSsoProvider);
      }
    });
    checkAndEnforce2FAGate();

    // Wire Omnibox Modal (Ctrl+K) — Administrator Only
    const cmdBackdrop = document.getElementById('os-cmd-backdrop');
    const cmdInput = document.getElementById('os-cmd-input');
    const cmdResults = document.getElementById('os-cmd-results');

    function renderCmdList(q = '') {
      const norm = q.trim().toLowerCase();
      const sourcePages = isSoleOwner ? pages : adminGrantedPortalEntries;
      const matches = sourcePages.filter(p => !norm || p.full.toLowerCase().includes(norm) || p.cat.toLowerCase().includes(norm) || p.tag.toLowerCase().includes(norm));
      cmdResults.innerHTML = matches.map(p => `
        <a href="${p.file}" class="os-drop-item" style="border:1px solid rgba(255,255,255,0.08);">
          <span class="os-drop-icon" style="border-color:${p.color}66;">${p.icon}</span>
          <span>
            <span class="os-drop-title">${p.full}</span>
            <span class="os-drop-sub">${p.cat} • ${p.tag}</span>
          </span>
        </a>
      `).join('');
    }

    function openCmd() {
      if (!isSoleOwner) return;
      closeAllPopovers();
      closeOffcanvasDrawer();
      cmdBackdrop.classList.add('open');
      cmdInput.value = '';
      renderCmdList('');
      setTimeout(() => cmdInput.focus(), 40);
    }

    document.getElementById('os-omnibox-trigger').addEventListener('click', openCmd);
    document.getElementById('rail-cmd-btn').addEventListener('click', openCmd);
    document.getElementById('os-drawer-search-btn').addEventListener('click', openCmd);
    document.getElementById('os-cmd-close').addEventListener('click', () => cmdBackdrop.classList.remove('open'));
    cmdBackdrop.addEventListener('click', (e) => { if (e.target === cmdBackdrop) cmdBackdrop.classList.remove('open'); });
    cmdInput.addEventListener('input', e => renderCmdList(e.target.value));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (!isSoleOwner) return;
        e.preventDefault();
        openCmd();
      } else if (e.key === 'Escape') {
        closeAllPopovers();
        closeOffcanvasDrawer();
        cmdBackdrop.classList.remove('open');
      }
    });

    applyBrandTheme(defaultPageBrand);
    const brandToggleBtn = document.getElementById('os-brand-theme-toggle');
    if (brandToggleBtn) {
      brandToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyBrandTheme(activeBrand === 'FIX' ? 'MGC' : 'FIX');
      });
    }

    enhanceResponsiveTablesAndMedia();
    setupSectionNavigation();
    injectPortalModuleActionSuite();
  }

  function enhanceResponsiveTablesAndMedia() {
    const tables = document.querySelectorAll('table');
    tables.forEach(tbl => {
      const parent = tbl.parentElement;
      if (!parent) return;
      const cs = window.getComputedStyle(parent);
      if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !parent.classList.contains('mgc-table-scroll')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mgc-table-scroll';
        parent.insertBefore(wrapper, tbl);
        wrapper.appendChild(tbl);
      }
    });
  }

  /**
   * SaaS Apps Single-Tab Section Navigation Standard
   * - Defaults multi-section portals to Section 1 (idx 0) instead of stacking all sections vertically ('all'),
   *   matching the clean, zero-clutter single-tab experience of saas-apps-and-lms-showcase.html.
   */
  function setupSectionNavigation() {
    const selectEl = document.getElementById('os-subpage-select');

    // Case A: Page already uses .workspace-tabs / .ws-tab (e.g. elearning-upskilling-hub.html & saas-apps-and-lms-showcase.html)
    const wsTabs = Array.from(document.querySelectorAll('.workspace-tabs .ws-tab'));
    if (wsTabs.length > 1) {
      selectEl.style.display = 'inline-block';
      selectEl.innerHTML = wsTabs.map((btn, i) => {
        const txt = btn.textContent.trim().replace(/\s+/g, ' ');
        return `<option value="${i}">📄 ${txt}</option>`;
      }).join('');
      selectEl.addEventListener('change', (e) => {
        const idx = Number(e.target.value);
        if (wsTabs[idx]) wsTabs[idx].click();
      });
      return;
    }

    // Case B: Only convert sections that explicitly declare [data-subpage-title] or [data-subpage]
    const sections = Array.from(document.querySelectorAll('[data-subpage-title], [data-subpage]'));
    if (sections.length <= 1) return;

    selectEl.style.display = 'inline-block';

    const bar = document.createElement('div');
    bar.id = 'mgc-subpage-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Workspace Section Tabs');

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'sp-tabs';

    const labels = sections.map((sec, idx) => {
      const explicit = sec.getAttribute('data-subpage-title');
      if (explicit) return explicit;
      const h = sec.querySelector('h1, h2, h3, .section-hdr, .panel-title, .kpi-label, .eyebrow');
      if (h) {
        const txt = h.textContent.trim().replace(/\s+/g, ' ').replace(/^[0-9]+\.\s*/, '');
        return txt.length > 26 ? txt.slice(0, 24) + '…' : txt;
      }
      return `Section ${idx + 1}`;
    });

    selectEl.innerHTML = labels.map((lbl, i) => `<option value="${i}">§ ${i + 1}. ${lbl}</option>`).join('') +
      `<option value="all">📑 All Sections (${sections.length})</option>`;

    let activeView = 0;

    function renderSectionFilterPills() {
      tabsWrap.innerHTML = '';

      labels.forEach((lbl, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-tab' + (String(idx) === String(activeView) ? ' active' : '');
        btn.textContent = `${idx + 1}. ${lbl}`;
        btn.addEventListener('click', () => setSectionView(idx));
        tabsWrap.appendChild(btn);
      });

      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'sp-tab' + (activeView === 'all' ? ' active' : '');
      allBtn.textContent = `📑 All (${sections.length})`;
      allBtn.addEventListener('click', () => setSectionView('all'));
      tabsWrap.appendChild(allBtn);
    }

    function setSectionView(targetIdx) {
      activeView = targetIdx;
      sections.forEach((sec, idx) => {
        if (targetIdx === 'all' || idx === Number(targetIdx)) {
          sec.style.display = '';
        } else {
          sec.style.display = 'none';
        }
      });
      renderSectionFilterPills();
      selectEl.value = String(targetIdx);
      window.dispatchEvent(new CustomEvent('mgc-subpage-changed', { detail: { index: targetIdx } }));
    }

    bar.appendChild(tabsWrap);

    const firstSection = sections[0];
    if (firstSection && firstSection.parentNode) {
      firstSection.parentNode.insertBefore(bar, firstSection);
    }

    selectEl.addEventListener('change', (e) => setSectionView(e.target.value));
    // Default to Tab 1 (index 0) just like saas-apps-and-lms-showcase.html to eliminate vertical text clutter
    setSectionView(0);
  }

  /**
   * Built-Out Module Links & Action Items Suite across all Internal Portals
   * Collapsed by default so the canvas remains clean and uncluttered.
   */
  function injectPortalModuleActionSuite() {
    return;

    const PORTAL_MODULES = {
      'sdvosb-contract-radar.html': {
        heading: 'F.I.X Solutions LLC • Federal Integration & Exchange SDVOSB Action Modules',
        mod1Title: '🎯 Module 1: Fort Bragg (USASOC) & VA OIT Sole-Source Pipeline',
        mod1Checks: [
          { text: 'Submit SBA VetCert SDVOSB packet (EIN 92-1370285)', linkLabel: 'SBA VetCert ↗', linkUrl: 'https://veterans.certify.sba.gov/' },
          { text: 'Respond to Fort Bragg USASOC / 112th Signal C4ISR Sources Sought', linkLabel: 'SAM.gov Radar ↗', linkUrl: 'https://sam.gov/content/opportunities' },
          { text: 'Register VA Vets First (38 U.S.C. 8127) Zero-Trust capability brief', linkLabel: 'VA Vets First ↗', linkUrl: 'https://www.va.gov/osdbu/verification/' }
        ],
        mod1Links: [
          { label: 'SAM.gov SDVOSB Search ↗', url: 'https://sam.gov/content/opportunities' },
          { label: 'SBA VetCert Portal ↗', url: 'https://veterans.certify.sba.gov/' },
          { label: 'ClearanceJobs Fort Bragg ↗', url: 'https://www.clearancejobs.com/jobs?keywords=25N+Network+Fort+Liberty' }
        ]
      },
      'finance-command.html': {
        heading: 'F.I.X Solutions LLC • Treasury, VA Benefits & Immediate Cashflow Modules',
        mod1Title: '💳 Module 1: WAWF/PIEE Invoicing, Stripe Checkout & VA Cashflow',
        mod1Checks: [
          { text: 'Activate Stripe links ($79 EVE-NG Pack & $1,500 B2B AI Setup)', linkLabel: 'Open Store →', linkUrl: 'whitefeather-ecommerce-hub.html' },
          { text: 'Lock VA Intent to File (21-0966) before Oct 22 12:00 PM VA Appt', linkLabel: 'File 21-0966 ↗', linkUrl: 'https://www.va.gov/disability/how-to-file-claim/' },
          { text: 'Apply for Ch. 31 VR&E ($2,172/mo Raleigh ECPI BAH + Workstation)', linkLabel: 'Apply VR&E ↗', linkUrl: 'https://www.va.gov/careers-employment/vocational-rehabilitation/' }
        ],
        mod1Links: [
          { label: 'VA.gov Claims & VR&E ↗', url: 'https://www.va.gov/careers-employment/vocational-rehabilitation/' },
          { label: 'Mercury Business Treasury ↗', url: 'https://app.mercury.com/' },
          { label: 'White Feather Storefront →', url: 'whitefeather-ecommerce-hub.html' }
        ]
      },
      'whitefeather-ecommerce-hub.html': {
        heading: 'Milton Group Concepts LLC • AI, Social Media, Ads & Product Monetization',
        mod1Title: '🛍️ Module 1: Launch 3 Digital Products & Paid/Organic Ad Funnels',
        mod1Checks: [
          { text: 'Publish $79 15-Topology EVE-NG CCNP/JNCIP + Ansible Pack', linkLabel: 'Lab Academy →', linkUrl: 'elearning-upskilling-hub.html' },
          { text: 'Coordinate B2B Client Deliverables in Agile Project Board', linkLabel: 'Agile Board →', linkUrl: 'agile-board.html' },
          { text: 'Post daily USASOC 25N → AI Architect reel on LinkedIn & Skool', linkLabel: 'Open Skool ↗', linkUrl: 'https://www.skool.com/white-feather-ai/plans' }
        ],
        mod1Links: [
          { label: 'White Feather AI Skool ↗', url: 'https://www.skool.com/white-feather-ai/plans' },
          { label: 'Agile Client Projects →', url: 'agile-board.html' },
          { label: 'LinkedIn Creator Feed ↗', url: 'https://www.linkedin.com/feed/' }
        ]
      }
    };

    const cfg = PORTAL_MODULES[currentFile] || {
      heading: (defaultPageBrand === 'FIX' ? 'F.I.X Solutions LLC' : 'Milton Group Concepts LLC') + ' • Curated Action Modules & Workflows',
      mod1Title: '🛡️ Module 1: Portal Operations, Zero-Trust & Live Deliverables',
      mod1Checks: [
        { text: 'Verify 8 MGC & 8 F.I.X Thematic Portals across PC & Mobile', linkLabel: '16-Portal Hub →', linkUrl: 'admin-command-portal.html' },
        { text: 'Coordinate Client Projects (Sterling Auto) in Agile Board', linkLabel: 'Agile Board →', linkUrl: 'agile-board.html' },
        { text: 'Sync portfolio deliverables to GitHub (sideprojo) & LinkedIn', linkLabel: 'GitHub ↗', linkUrl: 'https://github.com/sideprojo' }
      ],
      mod1Links: [
        { label: 'Canvas LMS & NC Career Hub →', url: 'elearning-upskilling-hub.html' },
        { label: 'SAM.gov Contract Radar →', url: 'sdvosb-contract-radar.html' },
        { label: 'Agile Project Board →', url: 'agile-board.html' }
      ]
    };

    const mod2Checks = [
      { text: 'Apply to Fort Bragg 25N/USASOC Primes (GDIT, CACI, Booz Allen)', linkLabel: 'Bragg Jobs ↗', linkUrl: 'https://www.clearancejobs.com/jobs?keywords=Network+Engineer+Fort+Liberty+NC' },
      { text: 'Apply to Raleigh/RTP Primes (Cisco RTP, SAS Cary HQ, Red Hat)', linkLabel: 'RTP Jobs ↗', linkUrl: 'https://www.linkedin.com/jobs/search/?keywords=Network%20Cloud%20AI%20Engineer&location=Raleigh-Durham-Chapel%20Hill%20Area' },
      { text: 'Target Sanford/Lillington midpoint + ECPI Raleigh ($2,172/mo BAH)', linkLabel: 'NC Move Hub →', linkUrl: 'elearning-upskilling-hub.html' }
    ];

    const mod3Checks = [
      { text: 'Track Client Deliverables (Sterling Auto) in Agile Board', linkLabel: 'Agile Board →', linkUrl: 'agile-board.html' },
      { text: 'Launch $79 EVE-NG 15-Lab Bundle & $97/mo White Feather Cohort', linkLabel: 'Storefront →', linkUrl: 'whitefeather-ecommerce-hub.html' },
      { text: 'Run daily 60s Reel + LinkedIn/Meta B2B Ad targeting NC/VA', linkLabel: 'Copy Scripts →', linkUrl: 'elearning-upskilling-hub.html' }
    ];

    function renderCheckRow(item, key) {
      const checked = localStorage.getItem(key) === '1' ? 'checked' : '';
      const isExt = item.linkUrl && item.linkUrl.startsWith('http');
      return `
        <div class="pas-check-item">
          <label class="pas-check-label">
            <input type="checkbox" data-act-key="${key}" ${checked} />
            <span>${item.text}</span>
          </label>
          <a href="${item.linkUrl}" ${isExt ? 'target="_blank" rel="noopener"' : ''} class="pas-inline-link">${item.linkLabel}</a>
        </div>
      `;
    }

    const suite = document.createElement('section');
    suite.id = 'mgc-portal-action-suite';
    suite.setAttribute('aria-label', 'Built-Out Portal Modules, Links & Action Items');
    suite.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.75rem;">
        <div>
          <span style="font-size:0.65rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#fde047;">
            ● CURATED WORKFLOWS & ACTION ITEMS (COLLAPSED BY DEFAULT FOR ZERO-CLUTTER UX)
          </span>
          <div style="font-size:0.95rem;font-weight:800;color:#ffffff;margin-top:0.12rem;">${cfg.heading}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.45rem;">
          <select id="pas-quick-jump" class="pas-select" aria-label="Quick Jump to Action Resource">
            <option value="">⚡ Quick Resource Jump ▾</option>
            <option value="saas-apps-and-lms-showcase.html">⚡ SaaS Apps & Simulators Showcase</option>
            <option value="elearning-upskilling-hub.html">🎓 Canvas LMS & EVE-NG SCORM 2004 Hub</option>
            <option value="agile-board.html">🗂️ Agile Project Board (Client Deliverables)</option>
            <option value="whitefeather-ecommerce-hub.html">💰 Digital Products & Ad Funnel Hub</option>
            <option value="sdvosb-contract-radar.html">🎯 Fort Bragg & VA SDVOSB Contract Radar</option>
          </select>
          <button type="button" id="pas-collapse-btn" class="pas-link-btn" style="cursor:pointer;">▸ Expand 3 Action Modules</button>
        </div>
      </div>

      <div class="pas-grid" id="pas-cards-grid" style="display:none;">
        <div class="pas-card" data-pas-mod="mod1">
          <div>
            <div style="font-size:0.84rem;font-weight:800;color:#ffffff;margin-bottom:0.55rem;">${cfg.mod1Title}</div>
            ${cfg.mod1Checks.map((item, idx) => renderCheckRow(item, `mgc_act_${currentFile}_m1_${idx}`)).join('')}
          </div>
          <details class="pas-details">
            <summary>▾ Module 1 Direct Links (${cfg.mod1Links.length})</summary>
            <div class="pas-links-row">
              ${cfg.mod1Links.map(l => `<a href="${l.url}" ${l.url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} class="pas-link-btn">${l.label}</a>`).join('')}
            </div>
          </details>
        </div>

        <div class="pas-card" data-pas-mod="mod2">
          <div>
            <div style="font-size:0.84rem;font-weight:800;color:#ffffff;margin-bottom:0.55rem;">📍 Module 2: NC Work (Bragg/RTP), Relocation & VA</div>
            ${mod2Checks.map((item, idx) => renderCheckRow(item, `mgc_act_global_nc_va_${idx}`)).join('')}
          </div>
        </div>

        <div class="pas-card" data-pas-mod="mod3">
          <div>
            <div style="font-size:0.84rem;font-weight:800;color:#ffffff;margin-bottom:0.55rem;">💸 Module 3: Agile Deliverables, Social & Products</div>
            ${mod3Checks.map((item, idx) => renderCheckRow(item, `mgc_act_global_monetize_${idx}`)).join('')}
          </div>
        </div>
      </div>
    `;

    const host = document.querySelector('.shell, .container, main') || document.body;
    host.appendChild(suite);

    suite.querySelectorAll('input[type="checkbox"][data-act-key]').forEach(cb => {
      cb.addEventListener('change', () => {
        localStorage.setItem(cb.getAttribute('data-act-key'), cb.checked ? '1' : '0');
      });
    });

    const cardsGrid = suite.querySelector('#pas-cards-grid');
    const quickJump = suite.querySelector('#pas-quick-jump');
    if (quickJump) {
      quickJump.addEventListener('change', () => {
        const url = quickJump.value;
        if (!url) return;
        if (url.startsWith('http')) window.open(url, '_blank', 'noopener');
        else window.location.href = url;
        quickJump.value = '';
      });
    }

    const collapseBtn = suite.querySelector('#pas-collapse-btn');
    if (collapseBtn && cardsGrid) {
      collapseBtn.addEventListener('click', () => {
        const hidden = cardsGrid.style.display === 'none';
        cardsGrid.style.display = hidden ? 'grid' : 'none';
        collapseBtn.textContent = hidden ? '▾ Minimize Modules' : '▸ Expand 3 Action Modules';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEnterpriseShell);
  } else {
    injectEnterpriseShell();
  }
})();

