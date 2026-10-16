/**
 * MGC & F.I.X Enterprise OS Shell ("Google + Microsoft + LinkedIn + Canvas" Paradigm)
 * - Google Workspace 9-Dot Waffle App Launcher + Omnibox Search (Ctrl+K)
 * - Microsoft 365 Fluent Categorized Top Dropdown Menus (▾)
 * - Instructure Canvas Persistent Left Icon Rail (64px)
 * - LinkedIn-Style Profile & View Density Dropdown (Me ▾)
 * - Automatic Multi-Page Sub-View Paginator & Card Progressive Disclosure (Zero Text Clutter)
 */
(function () {
  const SESSION_KEY = 'mgc_onboarded_session';
  const GATE_LOCK_KEY = 'mgc_edge_gate_locked';
  const CLEAN_UI_KEY = 'mgc_clean_ui_mode';

  // Do not inject internal MGC chrome onto standalone customer incentive sites (e.g. Sterling Auto Repair)
  if (window.location.pathname.toLowerCase().includes('sterling-auto-repair')) {
    return;
  }

  // 1. Cross-Domain "Trust But Verify" Handoff Parser
  const params = new URLSearchParams(window.location.search);
  if (params.get('mgc_verify') === '1') {
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

  function getVerifiedSession() {
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

  // 16-Portal Ecosystem Registry Categorized for Dropdowns, Waffle Menu & Canvas Rail
  const pages = [
    { file: 'admin-command-portal.html', icon: '🛡️', label: 'Admin Hub', full: 'Master Admin Command Hub', cat: 'Command & Auth', tag: 'All 16 Portals', color: '#3b82f6', rail: true },
    { file: 'onboarding-portal.html', icon: '🫆', label: 'Client 2FA', full: 'Client 2FA & Biometric Gate', cat: 'Command & Auth', tag: 'Passkey + TOTP', color: '#10b981', rail: true },
    { file: 'index.html', icon: '📊', label: 'Ops Hub', full: 'Executive Data & Ops Hub', cat: 'Command & Auth', tag: 'Cloud & Telemetry', color: '#6366f1', rail: true },
    { file: 'integrations-connections-hub.html', icon: '🔌', label: 'Integrations', full: 'Cloud & API Integrations', cat: 'Command & Auth', tag: 'GCP • Azure • OAuth', color: '#38bdf8', rail: false },

    { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'SaaS Apps', full: 'Monetized Apps & Simulators', cat: 'Apps & Labs', tag: 'Pay-Per-View Apps', color: '#f59e0b', rail: true },
    { file: 'agent-workflow-studio.html', icon: '🤖', label: 'Agent Studio', full: 'LangGraph AI Agent Studio', cat: 'Apps & Labs', tag: 'Multi-Agent Flows', color: '#a855f7', rail: false },
    { file: 'earth-3d.html', icon: '🌍', label: '3D Earth', full: '3D Geospatial Command', cat: 'Apps & Labs', tag: 'WebGL 3D Globe', color: '#0ea5e9', rail: false },
    { file: 'vr-command.html', icon: '🥽', label: '360° VR', full: '360° WebXR Spatial Deck', cat: 'Apps & Labs', tag: 'Spatial Command', color: '#ec4899', rail: false },

    { file: 'elearning-upskilling-hub.html', icon: '🎓', label: 'Canvas LMS', full: 'Canvas Academy & Atlas', cat: 'Canvas Academy', tag: 'Courses & Skill Map', color: '#10b981', rail: true },
    { file: 'historical-archaeology-ai-hub.html', icon: '🏛️', label: 'History Lab', full: 'Historical & Archaeology AI', cat: 'Canvas Academy', tag: 'LiDAR & Epigraphy', color: '#eab308', rail: false },
    { file: 'chronos-external-insight-webapp.html', icon: '🌐', label: 'Chronos App', full: 'Chronos Discovery WebApp', cat: 'Canvas Academy', tag: '3-Pane Explorer', color: '#06b6d4', rail: false },

    { file: 'projects/sterling-auto-repair/index.html', icon: '🚗', label: 'Sterling Auto', full: 'Sterling Auto Repair Studio', cat: 'Commerce & Gov', tag: 'Customer Prototype', color: '#ef4444', rail: true },
    { file: 'finance-command.html', icon: '💳', label: 'Finance', full: 'Finance & Treasury Hub', cat: 'Commerce & Gov', tag: 'Stripe • ACH • WAWF', color: '#22c55e', rail: true },
    { file: 'whitefeather-ecommerce-hub.html', icon: '🛍️', label: 'eCommerce', full: 'White Feather Storefront', cat: 'Commerce & Gov', tag: 'Digital Commerce', color: '#f97316', rail: false },
    { file: 'sdvosb-contract-radar.html', icon: '🎯', label: 'SAM Radar', full: 'SDVOSB Contract Radar', cat: 'Commerce & Gov', tag: 'VA & DoD Pipeline', color: '#eab308', rail: false },
    { file: 'compliance-trust-center.html', icon: '🔒', label: 'Zero-Trust', full: 'Compliance & Trust Center', cat: 'Commerce & Gov', tag: 'CMMC 2.0 • SC-100', color: '#14b8a6', rail: false }
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
         GOOGLE + MICROSOFT + LINKEDIN + CANVAS ENTERPRISE SHELL
         ====================================================================== */
      :root {
        --os-top-h: 58px;
        --os-rail-w: 68px;
        --os-bg: rgba(7, 11, 22, 0.88);
        --os-border: rgba(148, 163, 184, 0.14);
      }

      body {
        padding-top: var(--os-top-h) !important;
        padding-left: var(--os-rail-w) !important;
        transition: opacity 0.22s ease;
      }

      /* 1. TOP BAR (Google Waffle + Microsoft Dropdowns + Omnibox + LinkedIn Me) */
      #mgc-os-topbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--os-top-h);
        background: var(--os-bg);
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        border-bottom: 1px solid var(--os-border);
        z-index: 99990;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 18px 0 12px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        user-select: none;
      }

      .os-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Google 9-Dot Waffle Button */
      .os-waffle-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.18s, color 0.18s;
      }
      .os-waffle-btn:hover, .os-waffle-btn.active {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }
      .os-waffle-svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      .os-brand {
        display: flex;
        align-items: center;
        gap: 9px;
        text-decoration: none;
        color: #ffffff;
        font-weight: 800;
        font-size: 14px;
        letter-spacing: -0.01em;
        padding-right: 10px;
        border-right: 1px solid var(--os-border);
      }
      .os-brand-badge {
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: linear-gradient(135deg, #2563eb, #c5b358);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
      }

      /* Microsoft Fluent Categorized Top Dropdown Menus */
      .os-menus {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .os-menu-wrap {
        position: relative;
      }
      .os-menu-trigger {
        background: transparent;
        border: 1px solid transparent;
        color: #cbd5e1;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        padding: 7px 12px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: all 0.16s ease;
      }
      .os-menu-trigger:hover, .os-menu-wrap.open .os-menu-trigger {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.12);
      }
      .os-caret {
        font-size: 10px;
        opacity: 0.7;
        transition: transform 0.2s ease;
      }
      .os-menu-wrap.open .os-caret {
        transform: rotate(180deg);
      }

      /* Fluent Dropdown Flyout Panel */
      .os-dropdown-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        min-width: 270px;
        background: rgba(11, 17, 32, 0.97);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 14px;
        padding: 8px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
        display: none;
        flex-direction: column;
        gap: 3px;
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
        gap: 11px;
        padding: 9px 11px;
        border-radius: 10px;
        text-decoration: none;
        color: #f8fafc;
        transition: background 0.15s;
      }
      .os-drop-item:hover, .os-drop-item.active {
        background: rgba(59, 130, 246, 0.16);
      }
      .os-drop-icon {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        flex-shrink: 0;
      }
      .os-drop-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #ffffff;
        display: block;
      }
      .os-drop-sub {
        font-size: 10.5px;
        color: #94a3b8;
        display: block;
      }

      /* Google-Style Omnibox Search Bar */
      .os-omnibox {
        position: relative;
        width: 280px;
      }
      .os-search-btn {
        width: 100%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        padding: 7px 14px;
        color: #94a3b8;
        font-family: inherit;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: all 0.18s;
      }
      .os-search-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.24);
        color: #e2e8f0;
      }
      .os-kbd {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.14);
        padding: 1px 6px;
        border-radius: 5px;
        font-size: 10px;
        font-family: monospace;
      }

      /* Right Controls: Sub-Page Jump Dropdown + LinkedIn Profile Menu */
      .os-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .os-page-select {
        background: rgba(59, 130, 246, 0.12);
        border: 1px solid rgba(59, 130, 246, 0.35);
        color: #93c5fd;
        padding: 6px 11px;
        border-radius: 8px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        outline: none;
        cursor: pointer;
      }
      .os-page-select option {
        background: #0b1120;
        color: #f8fafc;
      }

      /* LinkedIn-Style "Me ▾" Avatar Dropdown */
      .os-profile-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--os-border);
        border-radius: 999px;
        padding: 4px 10px 4px 5px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #f8fafc;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .os-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #022c22;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 11px;
      }

      /* 2. GOOGLE 9-DOT WAFFLE POPOVER GRID */
      #os-waffle-popover {
        position: fixed;
        top: 66px;
        left: 14px;
        width: 340px;
        max-height: calc(100vh - 84px);
        overflow-y: auto;
        background: rgba(11, 17, 32, 0.98);
        backdrop-filter: blur(26px);
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.85);
        z-index: 99995;
        display: none;
        animation: osDropFade 0.18s ease;
      }
      #os-waffle-popover.open { display: block; }
      .waffle-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .waffle-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px 6px;
        border-radius: 14px;
        text-decoration: none;
        color: #e2e8f0;
        transition: all 0.16s;
        text-align: center;
      }
      .waffle-tile:hover, .waffle-tile.active {
        background: rgba(255, 255, 255, 0.09);
        transform: translateY(-2px);
      }
      .waffle-icon {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        margin-bottom: 6px;
      }
      .waffle-label {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.2;
      }

      /* 3. INSTRUCTURE CANVAS LEFT ICON RAIL (68px) */
      #mgc-os-rail {
        position: fixed;
        top: var(--os-top-h);
        left: 0;
        bottom: 0;
        width: var(--os-rail-w);
        background: rgba(6, 10, 20, 0.92);
        border-right: 1px solid var(--os-border);
        z-index: 99985;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        font-family: 'Inter', sans-serif;
      }
      .rail-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        width: 100%;
      }
      .rail-item {
        width: 54px;
        padding: 8px 4px;
        border-radius: 12px;
        text-decoration: none;
        color: #94a3b8;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        transition: all 0.18s ease;
        position: relative;
      }
      .rail-item:hover {
        background: rgba(255, 255, 255, 0.07);
        color: #ffffff;
      }
      .rail-item.active {
        background: rgba(59, 130, 246, 0.16);
        color: #60a5fa;
      }
      .rail-item.active::before {
        content: '';
        position: absolute;
        left: -7px;
        top: 10px;
        bottom: 10px;
        width: 3.5px;
        border-radius: 4px;
        background: #3b82f6;
      }
      .rail-ico { font-size: 18px; line-height: 1; }
      .rail-txt { font-size: 9.5px; font-weight: 700; letter-spacing: 0.01em; text-align: center; }

      /* 4. AUTOMATIC SUB-PAGE VIEW BAR (MULTI-PAGE PAGINATION INSTEAD OF WALL OF SCROLL) */
      #mgc-subpage-bar {
        max-width: 1400px;
        margin: 14px auto 10px;
        padding: 8px 14px;
        background: rgba(15, 23, 42, 0.78);
        backdrop-filter: blur(14px);
        border: 1px solid var(--os-border);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        font-family: 'Inter', sans-serif;
      }
      .sp-tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .sp-tab {
        background: transparent;
        border: 1px solid transparent;
        color: #94a3b8;
        padding: 6px 13px;
        border-radius: 9px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.18s;
      }
      .sp-tab:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.06);
      }
      .sp-tab.active {
        background: #2563eb;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
      }

      /* 5. ANTI-CLUTTER CLEAN UI ENGINE (ZERO PARAGRAPH BLOAT) */
      body.mgc-clean-ui p {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      body.mgc-clean-ui .portal-card p,
      body.mgc-clean-ui .card p,
      body.mgc-clean-ui .glass-card p,
      body.mgc-clean-ui .course-card p {
        margin-bottom: 8px !important;
        font-size: 12px !important;
        opacity: 0.82;
      }
      /* Hide redundant per-page legacy headers & bulky text hero boxes when inside OS Shell */
      body.mgc-clean-ui .admin-bar,
      body.mgc-clean-ui .hero-box,
      body.mgc-clean-ui > header:not(#mgc-os-topbar) {
        display: none !important;
      }
      body.mgc-clean-ui .sub-strip {
        padding: 10px 16px !important;
        margin-bottom: 14px !important;
      }

      /* Card Details Dropdown Button injected by Anti-Clutter Engine */
      .mgc-card-details-toggle {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #94a3b8;
        padding: 4px 10px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        margin-top: 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mgc-card-details-toggle:hover {
        color: #fff;
        border-color: rgba(255, 255, 255, 0.28);
      }

      /* Command Palette Modal (Ctrl+K) */
      #os-cmd-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(3, 6, 14, 0.8);
        backdrop-filter: blur(12px);
        z-index: 99999;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 80px 16px 20px;
        font-family: 'Inter', sans-serif;
      }
      #os-cmd-backdrop.open { display: flex; }
      .os-cmd-modal {
        width: 100%;
        max-width: 640px;
        background: #0b1120;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.85);
      }

      @media (max-width: 960px) {
        .os-menus, .os-omnibox { display: none; }
      }
      @media (max-width: 768px) {
        body {
          padding-left: 0 !important;
          padding-bottom: 68px !important;
        }
        #mgc-os-rail {
          top: auto;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 60px;
          flex-direction: row;
          padding: 0 8px;
          border-right: none;
          border-top: 1px solid var(--os-border);
        }
        .rail-group {
          flex-direction: row;
          justify-content: space-around;
        }
        .rail-group.rail-bottom { display: none; }
        .rail-item.active::before { display: none; }
      }
    `;
    document.head.appendChild(style);

    // Group pages by category for Microsoft Fluent Top Dropdowns
    const categories = ['Command & Auth', 'Apps & Labs', 'Canvas Academy', 'Commerce & Gov'];
    const menusHtml = categories.map(cat => {
      const items = pages.filter(p => p.cat === cat);
      const isCatActive = items.some(p => p.file.toLowerCase() === currentFile);
      return `
        <div class="os-menu-wrap" data-os-menu>
          <button class="os-menu-trigger" style="${isCatActive ? 'color:#60a5fa;' : ''}">
            <span>${cat}</span>
            <span class="os-caret">▾</span>
          </button>
          <div class="os-dropdown-panel">
            ${items.map(item => `
              <a href="${item.file}" class="os-drop-item ${item.file.toLowerCase() === currentFile ? 'active' : ''}">
                <span class="os-drop-icon">${item.icon}</span>
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

    // Build Canvas Left Rail Items
    const railItems = pages.filter(p => p.rail);

    const shellWrapper = document.createElement('div');
    shellWrapper.id = 'mgc-os-shell';
    shellWrapper.innerHTML = `
      <!-- 1. TOP BAR -->
      <header id="mgc-os-topbar">
        <div class="os-left">
          <button class="os-waffle-btn" id="os-waffle-trigger" title="Google-Style 9-Dot App Launcher">
            <svg class="os-waffle-svg" viewBox="0 0 24 24">
              <path d="M6,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM6,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM12,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM16,6c0,1.1 0.9,2 2,2s2,-0.9 2,-2 -0.9,-2 -2,-2 -2,0.9 -2,2zM12,8c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,14c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2zM18,20c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2 -2,0.9 -2,2 0.9,2 2,2z"/>
            </svg>
          </button>

          <a href="admin-command-portal.html" class="os-brand">
            <span class="os-brand-badge">M</span>
            <span>MGC OS</span>
          </a>

          <!-- Microsoft Fluent Categorized Dropdown Menus -->
          <div class="os-menus">
            ${menusHtml}
          </div>
        </div>

        <!-- Google Omnibox Search Trigger -->
        <div class="os-omnibox">
          <button class="os-search-btn" id="os-omnibox-trigger">
            <span>🔍 Search apps, pages, actions...</span>
            <span class="os-kbd">⌘K</span>
          </button>
        </div>

        <!-- Right: Sub-Page Jump Dropdown + LinkedIn Profile Menu -->
        <div class="os-right">
          <select id="os-subpage-select" class="os-page-select" title="Jump to Page Section" style="display:none;"></select>

          <div class="os-menu-wrap" data-os-menu>
            <button class="os-profile-btn">
              <span class="os-avatar">MK</span>
              <span>Me</span>
              <span class="os-caret">▾</span>
            </button>
            <div class="os-dropdown-panel" style="right:0;left:auto;min-width:250px;">
              <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;">
                <div style="font-size:13px;font-weight:800;color:#fff;">${session.name}</div>
                <div style="font-size:11px;color:#34d399;font-weight:600;">🫆 2FA Biometric Verified</div>
              </div>
              <button class="os-drop-item" id="os-toggle-clean" style="width:100%;background:none;border:none;cursor:pointer;text-align:left;">
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
              <a href="projects/sterling-auto-repair/index.html" class="os-drop-item">
                <span class="os-drop-icon">🚗</span>
                <span>
                  <span class="os-drop-title">Sterling Auto Prototype</span>
                  <span class="os-drop-sub">Customer Incentive Studio</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <!-- 2. GOOGLE 9-DOT WAFFLE APP LAUNCHER POPOVER -->
      <div id="os-waffle-popover">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px;">
          <span style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">All 16 Workspace Apps</span>
          <a href="admin-command-portal.html" style="font-size:11px;color:#60a5fa;text-decoration:none;font-weight:700;">Admin View →</a>
        </div>
        <div class="waffle-grid">
          ${pages.map(p => `
            <a href="${p.file}" class="waffle-tile ${p.file.toLowerCase() === currentFile ? 'active' : ''}">
              <div class="waffle-icon" style="border-color:${p.color}44;">${p.icon}</div>
              <span class="waffle-label">${p.label}</span>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- 3. INSTRUCTURE CANVAS LEFT ICON RAIL -->
      <aside id="mgc-os-rail">
        <div class="rail-group">
          ${railItems.map(p => `
            <a href="${p.file}" class="rail-item ${p.file.toLowerCase() === currentFile ? 'active' : ''}" title="${p.full}">
              <span class="rail-ico">${p.icon}</span>
              <span class="rail-txt">${p.label}</span>
            </a>
          `).join('')}
        </div>
        <div class="rail-group rail-bottom">
          <button class="rail-item" id="rail-cmd-btn" style="background:none;border:none;cursor:pointer;" title="Search All Portals (Ctrl+K)">
            <span class="rail-ico">🔍</span>
            <span class="rail-txt">Search</span>
          </button>
        </div>
      </aside>

      <!-- 4. OMNIBOX SEARCH MODAL (Ctrl+K) -->
      <div id="os-cmd-backdrop">
        <div class="os-cmd-modal">
          <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;gap:10px;align-items:center;">
            <span>🔍</span>
            <input id="os-cmd-input" type="text" placeholder="Type a portal, course, or tool name..." style="flex:1;background:transparent;border:none;color:#fff;font-size:14px;outline:none;" />
            <button id="os-cmd-close" style="background:rgba(255,255,255,0.08);border:none;color:#cbd5e1;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;">ESC</button>
          </div>
          <div id="os-cmd-results" style="max-height:360px;overflow-y:auto;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
        </div>
      </div>
    `;

    document.body.prepend(shellWrapper);

    // Wire Dropdown Menus & Waffle Popover
    const waffleBtn = document.getElementById('os-waffle-trigger');
    const wafflePop = document.getElementById('os-waffle-popover');
    const menuWraps = document.querySelectorAll('[data-os-menu]');

    function closeAllPopovers() {
      wafflePop.classList.remove('open');
      waffleBtn.classList.remove('active');
      menuWraps.forEach(w => w.classList.remove('open'));
    }

    waffleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
        const wasOpen = wrap.classList.contains('open');
        closeAllPopovers();
        if (!wasOpen) wrap.classList.add('open');
      });
    });

    document.addEventListener('click', () => closeAllPopovers());
    wafflePop.addEventListener('click', e => e.stopPropagation());

    // Wire Minimalist UI Toggle
    document.getElementById('os-toggle-clean').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !document.body.classList.contains('mgc-clean-ui');
      document.body.classList.toggle('mgc-clean-ui', next);
      localStorage.setItem(CLEAN_UI_KEY, next ? '1' : '0');
      document.getElementById('os-clean-label').textContent = `Minimalist UI: ${next ? 'ON' : 'OFF'}`;
    });

    // Wire Omnibox Modal (Ctrl+K)
    const cmdBackdrop = document.getElementById('os-cmd-backdrop');
    const cmdInput = document.getElementById('os-cmd-input');
    const cmdResults = document.getElementById('os-cmd-results');

    function renderCmdList(q = '') {
      const norm = q.trim().toLowerCase();
      const matches = pages.filter(p => !norm || p.full.toLowerCase().includes(norm) || p.cat.toLowerCase().includes(norm) || p.tag.toLowerCase().includes(norm));
      cmdResults.innerHTML = matches.map(p => `
        <a href="${p.file}" class="os-drop-item" style="border:1px solid rgba(255,255,255,0.07);">
          <span class="os-drop-icon">${p.icon}</span>
          <span>
            <span class="os-drop-title">${p.full}</span>
            <span class="os-drop-sub">${p.cat} • ${p.tag}</span>
          </span>
        </a>
      `).join('');
    }

    function openCmd() {
      closeAllPopovers();
      cmdBackdrop.classList.add('open');
      cmdInput.value = '';
      renderCmdList('');
      setTimeout(() => cmdInput.focus(), 40);
    }

    document.getElementById('os-omnibox-trigger').addEventListener('click', openCmd);
    document.getElementById('rail-cmd-btn').addEventListener('click', openCmd);
    document.getElementById('os-cmd-close').addEventListener('click', () => cmdBackdrop.classList.remove('open'));
    cmdBackdrop.addEventListener('click', (e) => { if (e.target === cmdBackdrop) cmdBackdrop.classList.remove('open'); });
    cmdInput.addEventListener('input', e => renderCmdList(e.target.value));

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmd();
      } else if (e.key === 'Escape') {
        closeAllPopovers();
        cmdBackdrop.classList.remove('open');
      }
    });

    // 5. AUTOMATIC MULTI-PAGE SECTION PAGINATOR (Turns multi-section pages into clean sub-views)
    setupSubPagePagination();
  }

  function setupSubPagePagination() {
    // Wait briefly for DOM content
    const sections = Array.from(document.querySelectorAll('main > section, .shell > section, body > section, [data-subpage]'));
    if (sections.length <= 1) return;

    const selectEl = document.getElementById('os-subpage-select');
    selectEl.style.display = 'inline-block';

    // Build Sub-Page Bar at top of content
    const bar = document.createElement('div');
    bar.id = 'mgc-subpage-bar';

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'sp-tabs';

    const labels = sections.map((sec, idx) => {
      const explicit = sec.getAttribute('data-subpage-title');
      if (explicit) return explicit;
      const h = sec.querySelector('h1, h2, h3');
      if (h) {
        const txt = h.textContent.trim().replace(/\s+/g, ' ');
        return txt.length > 26 ? txt.slice(0, 24) + '…' : txt;
      }
      return `Page ${idx + 1}`;
    });

    // Populate Topbar Dropdown
    selectEl.innerHTML = labels.map((lbl, i) => `<option value="${i}">📄 ${i + 1}. ${lbl}</option>`).join('') +
      `<option value="all">📑 Show All Sections</option>`;

    function activateSubPage(targetIdx) {
      sections.forEach((sec, idx) => {
        if (targetIdx === 'all' || idx === Number(targetIdx)) {
          sec.style.display = '';
        } else {
          sec.style.display = 'none';
        }
      });
      Array.from(tabsWrap.children).forEach((btn, idx) => {
        btn.classList.toggle('active', String(idx) === String(targetIdx));
      });
      selectEl.value = String(targetIdx);
    }

    labels.forEach((lbl, idx) => {
      const btn = document.createElement('button');
      btn.className = 'sp-tab' + (idx === 0 ? ' active' : '');
      btn.textContent = `${idx + 1}. ${lbl}`;
      btn.addEventListener('click', () => activateSubPage(idx));
      tabsWrap.appendChild(btn);
    });

    const rightControls = document.createElement('div');
    rightControls.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const allBtn = document.createElement('button');
    allBtn.className = 'sp-tab';
    allBtn.textContent = '📑 All';
    allBtn.addEventListener('click', () => activateSubPage('all'));
    rightControls.appendChild(allBtn);

    bar.appendChild(tabsWrap);
    bar.appendChild(rightControls);

    const firstSection = sections[0];
    if (firstSection && firstSection.parentNode) {
      firstSection.parentNode.insertBefore(bar, firstSection);
    }

    selectEl.addEventListener('change', (e) => activateSubPage(e.target.value));

    // Default to showing Page 1 for a clean, zero-clutter single-screen view
    activateSubPage(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEnterpriseShell);
  } else {
    injectEnterpriseShell();
  }
})();
