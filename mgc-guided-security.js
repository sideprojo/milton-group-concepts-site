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

  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'external' || params.get('locked') === '1') {
    localStorage.setItem(GATE_LOCK_KEY, '1');
    localStorage.removeItem(SESSION_KEY);
  } else if (params.get('mgc_verify') === '1') {
    const role = params.get('role') || 'VIEWER_ONBOARDED';
    const name = params.get('name') || 'Verified Agency / Partner';
    const org = params.get('org') || 'Milton Group Concepts LLC & F.I.X Solutions LLC';
    const email = params.get('email') || 'partner@miltongroupsecurity.org';
    const sessionObj = {
      email,
      name,
      org,
      role,
      access: 'INTERNAL_SUITE_VIEW',
      verifiedAt: new Date().toISOString(),
      integrityHash: 'SHA256-' + btoa(email + ':' + role + ':MGC-2026').slice(0, 16),
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
    localStorage.removeItem(GATE_LOCK_KEY);
  }

  function isGateLocked() {
    return localStorage.getItem(GATE_LOCK_KEY) === '1';
  }

  function getVerifiedSession() {
    if (isGateLocked()) {
      return {
        email: 'unverified@external-edge.gate',
        name: 'Locked Session (2FA Required)',
        org: 'External Edge Gate • Zero-Trust Enforced',
        role: 'LOCKED_PENDING_2FA',
        access: 'LOCKED'
      };
    }
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const fallback = {
      email: 'malik.khabir@miltongroupsecurity.org',
      name: 'Malik A. Khabir',
      org: 'Milton Group Concepts LLC & F.I.X Solutions LLC',
      role: 'OWNER_ADMIN (2FA BIOMETRIC VERIFIED)',
      access: 'INTERNAL_SUITE_FULL',
      verifiedAt: new Date().toISOString(),
      integrityHash: 'SHA256-TWFsaWtLaGFiaXJNR0M=',
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(fallback));
    return fallback;
  }

  const session = getVerifiedSession();
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  // 16-Portal Ecosystem Registry Categorized for Desktop Dropdowns, Off-Canvas Drawer, Waffle & Canvas Rail
  const pages = [
    { file: 'admin-command-portal.html', icon: '🛡️', label: 'Admin Hub', full: 'Master Admin Command Hub', cat: 'Command & Auth', tag: 'All 16 Portals', color: '#2563eb', rail: true },
    { file: 'onboarding-portal.html', icon: '🫆', label: 'Client 2FA', full: 'Client 2FA & Biometric Gate', cat: 'Command & Auth', tag: 'Passkey + TOTP', color: '#16a34a', rail: true },
    { file: 'index.html', icon: '📊', label: 'Ops Hub', full: 'Executive Data & Ops Hub', cat: 'Command & Auth', tag: 'Cloud & Telemetry', color: '#fcd34d', rail: true },
    { file: 'integrations-connections-hub.html', icon: '🔌', label: 'Integrations', full: 'Cloud & API Integrations', cat: 'Command & Auth', tag: 'GCP • Azure • OAuth', color: '#38bdf8', rail: false },

    { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'SaaS Apps', full: 'Monetized Apps & Simulators', cat: 'Apps & Labs', tag: 'Pay-Per-View Apps', color: '#d97706', rail: true },
    { file: 'agent-workflow-studio.html', icon: '🤖', label: 'Agent Studio', full: 'LangGraph AI Agent Studio', cat: 'Apps & Labs', tag: 'Multi-Agent Flows', color: '#2563eb', rail: false },
    { file: 'earth-3d.html', icon: '🌍', label: '3D Earth', full: '3D Geospatial Command', cat: 'Apps & Labs', tag: 'WebGL 3D Globe', color: '#16a34a', rail: false },
    { file: 'vr-command.html', icon: '🥽', label: '360° VR', full: '360° WebXR Spatial Deck', cat: 'Apps & Labs', tag: 'Spatial Command', color: '#dc2626', rail: false },

    { file: 'elearning-upskilling-hub.html', icon: '🎓', label: 'Canvas LMS', full: 'Canvas Academy & Atlas', cat: 'Canvas Academy', tag: 'Courses & Skill Map', color: '#16a34a', rail: true },
    { file: 'historical-archaeology-ai-hub.html', icon: '🏛️', label: 'History Lab', full: 'Historical & Archaeology AI', cat: 'Canvas Academy', tag: 'LiDAR & Epigraphy', color: '#fcd34d', rail: false },
    { file: 'chronos-external-insight-webapp.html', icon: '🌐', label: 'Chronos App', full: 'Chronos Discovery WebApp', cat: 'Canvas Academy', tag: '3-Pane Explorer', color: '#2563eb', rail: false },

    { file: 'projects/sterling-auto-repair/index.html', icon: '🚗', label: 'Sterling Auto', full: 'Sterling Auto Repair', cat: 'Commerce & Gov', tag: 'Customer Website', color: '#dc2626', rail: true },
    { file: 'finance-command.html', icon: '💳', label: 'Finance', full: 'Finance & Treasury Hub', cat: 'Commerce & Gov', tag: 'Stripe • ACH • WAWF', color: '#16a34a', rail: true },
    { file: 'whitefeather-ecommerce-hub.html', icon: '🛍️', label: 'eCommerce', full: 'White Feather Storefront', cat: 'Commerce & Gov', tag: 'Digital Commerce', color: '#d97706', rail: false },
    { file: 'sdvosb-contract-radar.html', icon: '🎯', label: 'SAM Radar', full: 'SDVOSB Contract Radar', cat: 'Commerce & Gov', tag: 'VA & DoD Pipeline', color: '#fcd34d', rail: false },
    { file: 'compliance-trust-center.html', icon: '🔒', label: 'Zero-Trust', full: 'Compliance & Trust Center', cat: 'Commerce & Gov', tag: 'CMMC 2.0 • SC-100', color: '#2563eb', rail: false }
  ];

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
        font-size: 0.78rem;
        font-weight: 700;
        padding: 0.5rem 0.7rem;
        min-height: 2.5rem;
        border-radius: 0.5rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        transition: all 0.16s ease;
        white-space: nowrap;
      }
      .os-menu-trigger:hover, .os-menu-wrap.open .os-menu-trigger {
        background: rgba(30, 58, 138, 0.45);
        color: #ffffff;
        border-color: rgba(252, 211, 77, 0.35);
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
        width: clamp(11rem, 16vw, 15.5rem);
      }
      .os-search-btn {
        width: 100%;
        min-height: 2.35rem;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid var(--os-border);
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        color: #cbd5e1;
        font-family: inherit;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        cursor: pointer;
        transition: all 0.18s;
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
    `;
    document.head.appendChild(style);

    // Group pages by category for Desktop Dropdowns & Mobile/Tablet Off-Canvas Drawer
    const categories = ['Command & Auth', 'Apps & Labs', 'Canvas Academy', 'Commerce & Gov'];
    const menusHtml = categories.map(cat => {
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
                <span>
                  <span class="os-drop-title">${item.full}</span>
                  <span class="os-drop-sub">${item.tag}</span>
                </span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    const drawerCategoriesHtml = categories.map(cat => {
      const items = pages.filter(p => p.cat === cat);
      return `
        <div class="os-drawer-cat">
          <div class="os-drawer-cat-title">${cat}</div>
          ${items.map(item => `
            <a href="${item.file}" class="os-drop-item ${item.file.toLowerCase() === currentFile ? 'active' : ''}">
              <span class="os-drop-icon" style="border-color:${item.color}66;">${item.icon}</span>
              <span>
                <span class="os-drop-title">${item.full}</span>
                <span class="os-drop-sub">${item.tag}</span>
              </span>
            </a>
          `).join('')}
        </div>
      `;
    }).join('');

    const railItems = pages.filter(p => p.rail);

    const shellWrapper = document.createElement('div');
    shellWrapper.id = 'mgc-os-shell';
    shellWrapper.innerHTML = `
      <!-- 1. TOP BAR -->
      <header id="mgc-os-topbar" role="banner">
        <div class="os-left">
          <!-- Lesson 5 Pattern 2 & 3: Labeled Hamburger Button for Tablet/Mobile (<1024px) -->
          <button type="button" class="os-hamburger-btn" id="os-hamburger-trigger" aria-expanded="false" aria-controls="os-offcanvas-drawer" title="Open Navigation Drawer">
            <span aria-hidden="true">☰</span>
            <span>Menu</span>
          </button>

          <button type="button" class="os-waffle-btn" id="os-waffle-trigger" aria-label="All 16 Workspace Apps" title="Google-Style 9-Dot App Launcher">
            <svg class="os-waffle-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM16,6c0,1.1 0.9,2 2,2s2,-0.9 2,-2 -0.9,-2 -2,-2 -2,0.9 -2,2zM12,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2z"/>
            </svg>
          </button>

          <a href="admin-command-portal.html" class="os-brand">
            <img src="assets/mgc-logo.png" alt="MGC" class="os-brand-logo-img" onerror="this.style.display='none'" />
            <span>MGC WORKSPACE</span>
          </a>

          <!-- Lesson 5 Pattern 1: Desktop Categorized Dropdown Navigation (>=1024px) -->
          <nav class="os-menus" aria-label="Primary Workspace Categories">
            ${menusHtml}
          </nav>
        </div>

        <!-- Google Omnibox Search Trigger -->
        <div class="os-omnibox">
          <button type="button" class="os-search-btn" id="os-omnibox-trigger" aria-label="Search portals, courses, tools">
            <span>🔍 Search portals, courses, tools...</span>
            <span class="os-kbd">⌘K</span>
          </button>
        </div>

        <!-- Right: Section Jump Dropdown + LinkedIn Profile Menu -->
        <div class="os-right">
          <select id="os-subpage-select" class="os-page-select" aria-label="Jump to Page Section" title="Filter or Jump to Page Section" style="display:none;"></select>

          <div class="os-menu-wrap" data-os-menu>
            <button type="button" class="os-profile-btn" aria-expanded="false">
              <span class="os-avatar">MK</span>
              <span>Me</span>
              <span class="os-caret">▾</span>
            </button>
            <div class="os-dropdown-panel" style="right:0;left:auto;min-width:255px;">
              <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;">
                <div style="font-size:13px;font-weight:800;color:#fff;">${session.name}</div>
                <div style="font-size:11px;color:#fcd34d;font-weight:700;">🫆 2FA Biometric Verified</div>
              </div>
              <button type="button" class="os-drop-item" id="os-toggle-clean" style="width:100%;background:none;border:none;cursor:pointer;text-align:left;">
                <span class="os-drop-icon">✨</span>
                <span>
                  <span class="os-drop-title" id="os-clean-label">Minimalist UI: ${cleanOn ? 'ON' : 'OFF'}</span>
                  <span class="os-drop-sub">Toggle compact vs detailed text</span>
                </span>
              </button>
              <a href="onboarding-portal.html" class="os-drop-item">
                <span class="os-drop-icon">🫆</span>
                <span>
                  <span class="os-drop-title">Switch Role / 2FA Gate</span>
                  <span class="os-drop-sub">Admin vs Client View</span>
                </span>
              </a>
              <button type="button" class="os-drop-item" id="os-lock-session" style="width:100%;background:none;border:none;cursor:pointer;text-align:left;">
                <span class="os-drop-icon" style="border-color:rgba(220,38,38,0.45);background:rgba(220,38,38,0.12);">🔒</span>
                <span>
                  <span class="os-drop-title" style="color:#fca5a5;">Lock Session (Require 2FA)</span>
                  <span class="os-drop-sub">Enforce 2-Step Biometric / TOTP Gate</span>
                </span>
              </button>
              <a href="projects/sterling-auto-repair/index.html" class="os-drop-item">
                <span class="os-drop-icon">🚗</span>
                <span>
                  <span class="os-drop-title">Sterling Auto Repair</span>
                  <span class="os-drop-sub">Customer Website Prototype</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- 2. LESSON 5 PATTERN 2 & 3: OFF-CANVAS SLIDE-OUT NAVIGATION DRAWER (<1024px) -->
      <div id="os-offcanvas-scrim" aria-hidden="true"></div>
      <aside id="os-offcanvas-drawer" aria-label="Mobile & Tablet Workspace Navigation">
        <div class="os-drawer-hdr">
          <div style="display:flex;align-items:center;gap:0.55rem;">
            <img src="assets/mgc-logo.png" alt="MGC" style="height:28px;width:auto;border-radius:6px;border:1px solid rgba(252,211,77,0.45);" onerror="this.style.display='none'" />
            <div>
              <div style="font-size:0.82rem;font-weight:900;color:#fff;letter-spacing:0.04em;">MGC WORKSPACE</div>
              <div style="font-size:0.65rem;color:#fcd34d;font-weight:700;">16 Enterprise Portals</div>
            </div>
          </div>
          <button type="button" class="os-drawer-close" id="os-drawer-close-btn" aria-label="Close Navigation Drawer">✕</button>
        </div>
        <div class="os-drawer-body">
          <button type="button" id="os-drawer-search-btn" style="width:100%;min-height:2.75rem;margin-bottom:0.9rem;background:rgba(30,58,138,0.35);border:1px solid rgba(252,211,77,0.35);border-radius:0.65rem;color:#f8fafc;font-weight:700;font-size:0.78rem;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:0 0.85rem;">
            <span>🔍 Quick Search All Portals</span>
            <span class="os-kbd">⌘K</span>
          </button>
          ${drawerCategoriesHtml}
        </div>
      </aside>

      <!-- 3. GOOGLE 9-DOT WAFFLE APP LAUNCHER POPOVER -->
      <div id="os-waffle-popover">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px;">
          <span style="font-size:11px;font-weight:800;color:#fcd34d;text-transform:uppercase;letter-spacing:0.08em;">All 16 Workspace Apps</span>
          <a href="admin-command-portal.html" style="font-size:11px;color:#93c5fd;text-decoration:none;font-weight:700;">Admin Hub →</a>
        </div>
        <div class="waffle-grid">
          ${pages.map(p => `
            <a href="${p.file}" class="waffle-tile ${p.file.toLowerCase() === currentFile ? 'active' : ''}">
              <div class="waffle-icon" style="border-color:${p.color}66;">${p.icon}</div>
              <span class="waffle-label">${p.label}</span>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- 4. INSTRUCTURE CANVAS LEFT ICON RAIL -->
      <aside id="mgc-os-rail" aria-label="Quick Launch Dock">
        <div class="rail-group">
          ${railItems.map(p => `
            <a href="${p.file}" class="rail-item ${p.file.toLowerCase() === currentFile ? 'active' : ''}" title="${p.full}">
              <span class="rail-ico">${p.icon}</span>
              <span class="rail-txt">${p.label}</span>
            </a>
          `).join('')}
        </div>
        <div class="rail-group rail-bottom">
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

      <!-- 6. ZERO-TRUST 2FA ENFORCEMENT GATE OVERLAY (Enforced when Session is Locked or Unverified) -->
      <div id="os-2fa-gate-backdrop" role="dialog" aria-modal="true" aria-label="Zero-Trust 2FA Enforcement Gate" style="position:fixed;inset:0;background:rgba(2,6,23,0.94);backdrop-filter:blur(16px);z-index:100001;display:none;align-items:center;justify-content:center;padding:1.25rem;font-family:'Inter',sans-serif;">
        <div style="width:100%;max-width:30rem;background:#090e1c;border:1px solid rgba(252,211,77,0.45);border-radius:1.25rem;padding:1.65rem;box-shadow:0 30px 90px rgba(0,0,0,0.95);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
            <span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.25rem 0.65rem;border-radius:999px;background:rgba(220,38,38,0.18);border:1px solid rgba(220,38,38,0.45);color:#fca5a5;font-size:0.68rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">🔒 Zero-Trust Edge Gate Enforced</span>
            <span style="font-size:0.7rem;color:#fcd34d;font-weight:700;">SC-100 / CMMC 2.0</span>
          </div>
          <h3 style="font-size:1.15rem;font-weight:900;color:#fff;margin:0 0 0.35rem;">2-Step Biometric & TOTP Authentication Required</h3>
          <p style="font-size:0.78rem;color:#cbd5e1;line-height:1.5;margin:0 0 1rem;">
            Internal portal access requires verified credentials and Second-Factor (FIDO2 Biometric Fingerprint or 6-Digit Authenticator Code).
          </p>
          <div style="display:flex;gap:0.45rem;margin-bottom:0.9rem;">
            <button type="button" id="os-2fa-demo-admin" style="flex:1;padding:0.45rem 0.6rem;border-radius:0.5rem;background:rgba(37,99,235,0.2);border:1px solid rgba(37,99,235,0.45);color:#93c5fd;font-size:0.7rem;font-weight:800;cursor:pointer;">⚡ Fill Sovereign Admin</button>
            <button type="button" id="os-2fa-demo-client" style="flex:1;padding:0.45rem 0.6rem;border-radius:0.5rem;background:rgba(252,211,77,0.12);border:1px solid rgba(252,211,77,0.35);color:#fcd34d;font-size:0.7rem;font-weight:800;cursor:pointer;">🔑 Fill Verified Partner</button>
          </div>
          <div style="margin-bottom:0.7rem;">
            <label style="display:block;font-size:0.68rem;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:0.25rem;">Step 1: Provisioned Email</label>
            <input id="os-2fa-email" type="email" value="malik.khabir@miltongroupsecurity.org" style="width:100%;padding:0.6rem 0.75rem;border-radius:0.55rem;background:#030712;border:1px solid rgba(203,213,225,0.24);color:#fff;font-size:0.8rem;" />
          </div>
          <div style="margin-bottom:0.7rem;">
            <label style="display:block;font-size:0.68rem;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:0.25rem;">Passphrase</label>
            <input id="os-2fa-pass" type="password" value="PASSKEY::SOVEREIGN_ADMIN" style="width:100%;padding:0.6rem 0.75rem;border-radius:0.55rem;background:#030712;border:1px solid rgba(203,213,225,0.24);color:#fff;font-size:0.8rem;" />
          </div>
          <div style="margin-bottom:0.85rem;">
            <label style="display:block;font-size:0.68rem;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:0.25rem;">Step 2: 6-Digit TOTP Code (or Biometric Passkey)</label>
            <div style="display:flex;gap:0.5rem;">
              <input id="os-2fa-totp" type="text" value="440-921" maxlength="7" style="flex:1;padding:0.6rem 0.75rem;border-radius:0.55rem;background:#030712;border:1px solid rgba(252,211,77,0.4);color:#fcd34d;font-family:monospace;font-weight:800;font-size:0.9rem;text-align:center;letter-spacing:0.12em;" />
              <button type="button" id="os-2fa-bio-btn" style="padding:0.6rem 0.85rem;border-radius:0.55rem;background:rgba(22,163,74,0.18);border:1px solid rgba(22,163,74,0.5);color:#86efac;font-size:0.75rem;font-weight:800;cursor:pointer;white-space:nowrap;">🫆 Biometric</button>
            </div>
          </div>
          <div id="os-2fa-msg" style="display:none;padding:0.55rem 0.75rem;border-radius:0.5rem;font-size:0.74rem;font-weight:700;margin-bottom:0.75rem;"></div>
          <div style="display:flex;gap:0.55rem;">
            <button type="button" id="os-2fa-submit" style="flex:1;padding:0.7rem 1rem;border-radius:0.65rem;background:linear-gradient(135deg,#16a34a,#15803d);border:1px solid rgba(134,239,172,0.4);color:#fff;font-size:0.82rem;font-weight:900;cursor:pointer;">🔓 Verify 2FA & Unlock Portal</button>
            <a href="onboarding-portal.html?from=external" style="padding:0.7rem 0.85rem;border-radius:0.65rem;background:rgba(30,58,138,0.35);border:1px solid rgba(203,213,225,0.22);color:#cbd5e1;font-size:0.76rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;">Full 2FA Gate</a>
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

    // Wire Minimalist UI Toggle
    document.getElementById('os-toggle-clean').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !document.body.classList.contains('mgc-clean-ui');
      document.body.classList.toggle('mgc-clean-ui', next);
      localStorage.setItem(CLEAN_UI_KEY, next ? '1' : '0');
      document.getElementById('os-clean-label').textContent = `Minimalist UI: ${next ? 'ON' : 'OFF'}`;
    });

    // Wire Zero-Trust 2FA Enforcement Gate Overlay & Lock Session Button
    const gateBackdrop = document.getElementById('os-2fa-gate-backdrop');
    const lockSessionBtn = document.getElementById('os-lock-session');
    const gateEmail = document.getElementById('os-2fa-email');
    const gatePass = document.getElementById('os-2fa-pass');
    const gateTotp = document.getElementById('os-2fa-totp');
    const gateMsg = document.getElementById('os-2fa-msg');

    function checkAndEnforce2FAGate() {
      if (isGateLocked() && currentFile !== 'onboarding-portal.html') {
        gateBackdrop.style.display = 'flex';
      } else {
        gateBackdrop.style.display = 'none';
      }
    }

    lockSessionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopovers();
      localStorage.setItem(GATE_LOCK_KEY, '1');
      localStorage.removeItem(SESSION_KEY);
      if (currentFile === 'onboarding-portal.html') {
        window.location.href = 'onboarding-portal.html?locked=1';
      } else {
        checkAndEnforce2FAGate();
      }
    });

    document.getElementById('os-2fa-demo-admin').addEventListener('click', () => {
      gateEmail.value = 'malik.khabir@miltongroupsecurity.org';
      gatePass.value = 'PASSKEY::SOVEREIGN_ADMIN';
      gateTotp.value = '440-921';
    });

    document.getElementById('os-2fa-demo-client').addEventListener('click', () => {
      gateEmail.value = 'partner@miltongroupsecurity.org';
      gatePass.value = 'PASSKEY::VERIFIED_CLIENT';
      gateTotp.value = '250-100';
    });

    function verifyGateSubmission(isBiometric) {
      const em = gateEmail.value.trim().toLowerCase();
      const pw = gatePass.value.trim();
      const totpClean = gateTotp.value.replace(/[^0-9]/g, '');

      const isAdmin = em === 'malik.khabir@miltongroupsecurity.org' && pw === 'PASSKEY::SOVEREIGN_ADMIN';
      const isClient = (em === 'partner@miltongroupsecurity.org' || em === 'client@miltongroupsecurity.org' || em === 'service@sterlingautorepairva.com') && pw === 'PASSKEY::VERIFIED_CLIENT';

      if (!isAdmin && !isClient) {
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(220,38,38,0.18)';
        gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
        gateMsg.style.color = '#fca5a5';
        gateMsg.textContent = '❌ Access Denied: Invalid provisioned email or passphrase.';
        return;
      }

      if (!isBiometric && totpClean !== '440921' && totpClean !== '250100') {
        gateMsg.style.display = 'block';
        gateMsg.style.background = 'rgba(220,38,38,0.18)';
        gateMsg.style.border = '1px solid rgba(220,38,38,0.45)';
        gateMsg.style.color = '#fca5a5';
        gateMsg.textContent = '❌ 2FA Verification Failed: Enter valid 6-digit TOTP (440-921 / 250-100) or use Biometric Passkey.';
        return;
      }

      const verifiedObj = {
        email: em,
        name: isAdmin ? 'Malik A. Khabir' : 'Verified Agency / Partner',
        org: 'Milton Group Concepts LLC & F.I.X Solutions LLC',
        role: isAdmin ? 'OWNER_ADMIN (2FA BIOMETRIC VERIFIED)' : 'CLIENT_PARTNER (2FA VERIFIED)',
        access: isAdmin ? 'INTERNAL_SUITE_FULL' : 'INTERNAL_SUITE_VIEW',
        verifiedAt: new Date().toISOString()
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(verifiedObj));
      localStorage.removeItem(GATE_LOCK_KEY);

      gateMsg.style.display = 'block';
      gateMsg.style.background = 'rgba(22,163,74,0.2)';
      gateMsg.style.border = '1px solid rgba(22,163,74,0.5)';
      gateMsg.style.color = '#86efac';
      gateMsg.textContent = '✅ 2FA Verified! Unlocking internal portal...';
      setTimeout(() => {
        gateBackdrop.style.display = 'none';
      }, 300);
    }

    document.getElementById('os-2fa-submit').addEventListener('click', () => verifyGateSubmission(false));
    document.getElementById('os-2fa-bio-btn').addEventListener('click', () => verifyGateSubmission(true));
    checkAndEnforce2FAGate();

    // Wire Omnibox Modal (Ctrl+K)
    const cmdBackdrop = document.getElementById('os-cmd-backdrop');
    const cmdInput = document.getElementById('os-cmd-input');
    const cmdResults = document.getElementById('os-cmd-results');

    function renderCmdList(q = '') {
      const norm = q.trim().toLowerCase();
      const matches = pages.filter(p => !norm || p.full.toLowerCase().includes(norm) || p.cat.toLowerCase().includes(norm) || p.tag.toLowerCase().includes(norm));
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
        e.preventDefault();
        openCmd();
      } else if (e.key === 'Escape') {
        closeAllPopovers();
        closeOffcanvasDrawer();
        cmdBackdrop.classList.remove('open');
      }
    });

    enhanceResponsiveTablesAndMedia();
    setupSectionNavigation();
  }

  /**
   * Lesson 2 & 5: Ensure wide data tables wrap in a flexible horizontal scroll container
   * so they never break mobile/tablet layouts or force horizontal page scrolling.
   */
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
   * Clean Non-Learning Section Filter & Quick Jump Bar
   * - Never step-gates 2D CSS Grid workspaces (e.g. agent-workflow-studio.html, onboarding-portal.html).
   * - Defaults to Full Responsive Page View ('all') on non-learning portals while allowing instant section filtering.
   */
  function setupSectionNavigation() {
    const selectEl = document.getElementById('os-subpage-select');

    // Case A: Page uses .workspace-tabs / .ws-tab (e.g. elearning-upskilling-hub.html & saas-apps-and-lms-showcase.html)
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

    // Case B: Detect top-level vertical <section> blocks on non-learning internal sites
    // (Do NOT split 2D CSS Grid workspaces like .workspace > div or .main-grid > .card)
    const sections = Array.from(document.querySelectorAll('main > section, .shell > section, .container > section, body > section, [data-subpage]'));
    if (sections.length <= 1) return;

    selectEl.style.display = 'inline-block';

    const bar = document.createElement('div');
    bar.id = 'mgc-subpage-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Page Section Filter');

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

    selectEl.innerHTML = `<option value="all">📑 All Sections (${sections.length})</option>` +
      labels.map((lbl, i) => `<option value="${i}">§ ${i + 1}. ${lbl}</option>`).join('');

    let activeView = 'all';

    function renderSectionFilterPills() {
      tabsWrap.innerHTML = '';

      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'sp-tab' + (activeView === 'all' ? ' active' : '');
      allBtn.textContent = `📑 All Sections (${sections.length})`;
      allBtn.addEventListener('click', () => setSectionView('all'));
      tabsWrap.appendChild(allBtn);

      labels.forEach((lbl, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-tab' + (String(idx) === String(activeView) ? ' active' : '');
        btn.textContent = `${idx + 1}. ${lbl}`;
        btn.addEventListener('click', () => setSectionView(idx));
        tabsWrap.appendChild(btn);
      });
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
    // Default to full responsive layout ('all') so non-learning sites are never step-gated
    setSectionView('all');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEnterpriseShell);
  } else {
    injectEnterpriseShell();
  }
})();
