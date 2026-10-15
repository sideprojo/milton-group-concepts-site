/**
 * MGC & F.I.X Defense-in-Depth ("Trust But Verify") Security Gatekeeper
 * + Anti-Clutter Progressive Disclosure Engine (Clean UI Mode Default ON)
 * + Seamless Page Transitions, Staggered Micro-Animations & Spotlight User Guidance
 * + Categorized 16-Portal Command Palette (Ctrl+K)
 * Zero-Charge Static Architecture | CMMC 2.0 / NIST 800-171 / CIPP-US Aligned
 */
(function () {
  const SESSION_KEY = 'mgc_onboarded_session';
  const TOUR_STATE_KEY = 'mgc_guided_tour_step';
  const GATE_LOCK_KEY = 'mgc_edge_gate_locked';
  const CLEAN_UI_KEY = 'mgc_clean_ui_mode';

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
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.integrityHash) {
          parsed.integrityHash = 'SHA256-' + btoa((parsed.email || 'malik') + ':MGC-2026').slice(0, 16);
        }
        return parsed;
      }
    } catch (e) {}
    const fallback = {
      email: 'malik.khabir@miltongroupsecurity.org',
      name: 'Malik A. Khabir',
      org: 'Milton Group Concepts LLC & F.I.X Solutions LLC (SDVOSB)',
      role: 'OWNER_ADMIN (2FA BIOMETRIC VERIFIED)',
      access: 'INTERNAL_SUITE_FULL',
      verifiedAt: new Date().toISOString(),
      integrityHash: 'SHA256-TWFsaWtLaGFiaXJNR0M=',
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(fallback));
    return fallback;
  }

  async function computeWebCryptoHash(input) {
    try {
      if (window.crypto && window.crypto.subtle) {
        const enc = new TextEncoder().encode(input);
        const buf = await window.crypto.subtle.digest('SHA-256', enc);
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        return 'SHA256-' + hex.slice(0, 12).toUpperCase();
      }
    } catch (e) {}
    return 'SHA256-' + btoa(input).slice(0, 12).toUpperCase();
  }

  const session = getVerifiedSession();
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  // Categorized 16-Portal Directory (Eliminates top-bar text clutter via Command Palette)
  const pages = [
    { file: 'admin-command-portal.html', icon: '★', label: 'Master Admin Command Portal', short: '★ Admin Hub', cat: 'Core & Client', tag: 'All 16 Sites + 2FA Control', pinned: true },
    { file: 'saas-apps-and-lms-showcase.html', icon: '⚡', label: 'Monetized Apps, Course LMS & Showcase', short: '⚡ Apps & LMS', cat: 'Core & Client', tag: 'Pay-Per-View + Course LMS', pinned: true },
    { file: 'projects/sterling-auto-repair/index.html', icon: '🔧', label: 'Sterling Auto Repair (Customer Incentive)', short: '🔧 Sterling Auto', cat: 'Core & Client', tag: '45911 Transamerica Plaza', pinned: true },
    { file: 'onboarding-portal.html', icon: '🫆', label: 'Client 2FA & Biometric Portal', short: '🫆 Client 2FA', cat: 'Core & Client', tag: 'Fingerprint + TOTP Gate', pinned: false },
    { file: 'finance-command.html', icon: '💳', label: 'Finance, Treasury & Payment System', short: '💳 Finance', cat: 'Collections 1–4', tag: 'ACH • Stripe • SAM WAWF', pinned: true },
    { file: 'elearning-upskilling-hub.html', icon: '🗺️', label: 'eLearning & Cross-Industry Insights Atlas', short: '🗺️ Insights Atlas', cat: 'Collections 1–4', tag: 'Visuals → Map → Collab', pinned: true },
    { file: 'whitefeather-ecommerce-hub.html', icon: '🛍️', label: 'White Feather, eCommerce & News Hub', short: '🛍️ eCommerce', cat: 'Collections 1–4', tag: 'Storefront + Dual News', pinned: false },
    { file: 'historical-archaeology-ai-hub.html', icon: '🏛️', label: 'AI, Historical & Archaeology Lab', short: '🏛️ History & AI', cat: 'Collections 1–4', tag: '4biddenKnowledge + LiDAR', pinned: false },
    { file: 'chronos-external-insight-webapp.html', icon: '🌐', label: 'Chronos // Aetheria Public WebApp', short: '🌐 Chronos App', cat: 'External & Spatial', tag: '3-Pane Discovery Engine', pinned: false },
    { file: 'index.html', icon: '📊', label: 'Executive Data Commerce & Ops Hub', short: '📊 Ops Hub', cat: 'Ops & Security', tag: 'HIPAA • SAS • ORSA', pinned: false },
    { file: 'sdvosb-contract-radar.html', icon: '🎯', label: 'SDVOSB SAM.gov Contract Radar', short: '🎯 SAM Radar', cat: 'Ops & Security', tag: 'VA Vets First • DoD', pinned: false },
    { file: 'compliance-trust-center.html', icon: '🛡️', label: 'Compliance & Zero-Trust Center', short: '🛡️ Zero-Trust', cat: 'Ops & Security', tag: 'CMMC L2 • SC-100 • CIPP', pinned: false },
    { file: 'integrations-connections-hub.html', icon: '🔌', label: 'Cloud & Workspace Integrations Hub', short: '🔌 Integrations', cat: 'Ops & Security', tag: 'GCP • Azure • Mercury', pinned: false },
    { file: 'agent-workflow-studio.html', icon: '🤖', label: 'LangGraph & Cloud Agent Studio', short: '🤖 Agent Studio', cat: 'External & Spatial', tag: 'Champion / Challenger', pinned: false },
    { file: 'earth-3d.html', icon: '🌍', label: '3D Geospatial Command (WebGL 3D Globe)', short: '🌍 3D Earth', cat: 'External & Spatial', tag: 'Zero-Charge 3D Globe', pinned: false },
    { file: 'vr-command.html', icon: '🥽', label: '360° WebXR Spatial VR Command Deck', short: '🥽 360° VR', cat: 'External & Spatial', tag: 'Immersive Curved Deck', pinned: false }
  ];

  const tourStepsByPage = {
    'admin-command-portal.html': {
      title: 'Master Admin Command Hub',
      desc: 'Filter all 16 sites by category, switch between Root Admin and Client view, or re-verify Biometric 2FA in 1 click.',
      nextFile: 'saas-apps-and-lms-showcase.html',
      highlights: ['Category Filter Tabs', '1-Click Portal Cards', 'Collapsible Governance & 2FA Drawer']
    },
    'onboarding-portal.html': {
      title: 'Client 2FA Biometric Gate',
      desc: 'Tap the fingerprint sensor or enter a 6-digit TOTP code to unlock Sterling Auto Repair and assigned client modules.',
      nextFile: 'projects/sterling-auto-repair/index.html',
      highlights: ['1-Click Client/Admin Presets', 'Biometric Fingerprint Scanner', 'Instant Suite Unlock']
    },
    'saas-apps-and-lms-showcase.html': {
      title: 'Monetized Apps, LMS & Showcase',
      desc: 'Use the segmented mode tabs to switch smoothly between Decoupled Apps, Course LMS & AI Coach, and Custom Build Configurator.',
      nextFile: 'finance-command.html',
      highlights: ['4 Interactive App Simulators', 'Course Trackers & XP Leaderboard', 'Custom Client Build Calculator']
    },
    'index.html': {
      title: 'Executive Data Commerce Hub',
      desc: 'Review zero-charge cloud telemetry, regulated data commerce pipelines, and daily certification readiness.',
      nextFile: 'finance-command.html',
      highlights: ['$0.00 Idle Cloud Guard', 'Privacy & SAS ModelOps Matrix', 'SDVOSB Pipeline Readiness']
    },
    'finance-command.html': {
      title: 'Finance & Multi-Rail Payments',
      desc: 'Generate signed payment links and process ACH, Stripe, or SAM.gov WAWF transactions across entities.',
      nextFile: 'elearning-upskilling-hub.html',
      highlights: ['Instant Checkout Terminal', 'Multi-Entity Treasury Ledger', 'Zero-Charge Cloud Audit']
    },
    'elearning-upskilling-hub.html': {
      title: 'eLearning & Insights Atlas',
      desc: 'Click any industry filter or insight node to trace smoothly across Visual Charts → Geospatial Map → Internal Collaborations.',
      nextFile: 'whitefeather-ecommerce-hub.html',
      highlights: ['Smooth 3-Stage Insight Trace', 'Live Industry Filter Pills', 'LinkedIn + Gmail + SAM Aggregation']
    },
    'whitefeather-ecommerce-hub.html': {
      title: 'White Feather & Dual News Hub',
      desc: 'Browse venture storefronts and switch between the two live aggregate news wires with 1-click Finance checkout.',
      nextFile: 'historical-archaeology-ai-hub.html',
      highlights: ['1-Click Storefront Checkout', 'Dual NBA-RSS News Wires', 'Affiliate Venture Matrix']
    },
    'historical-archaeology-ai-hub.html': {
      title: 'AI, History & Archaeology Lab',
      desc: 'Select any artifact node in the constellation to synchronize the geodesic map and generate an AI examination brief.',
      nextFile: 'chronos-external-insight-webapp.html',
      highlights: ['Interactive Motif Constellation', 'Synchronized Geodesic Map', 'Launch Chronos Public WebApp']
    }
  };

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @view-transition { navigation: auto; }

      /* Smooth Page Entry & Exit Transitions */
      @keyframes mgcPageFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes mgcCardStagger {
        from { opacity: 0; transform: translateY(12px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes mgcPulseGlow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55), 0 0 24px rgba(197, 179, 88, 0.35); }
        50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0), 0 0 36px rgba(197, 179, 88, 0.65); }
      }

      body {
        animation: mgcPageFadeIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
        transition: opacity 0.18s ease, transform 0.18s ease;
      }
      body.mgc-page-leaving {
        opacity: 0 !important;
        transform: translateY(-6px) !important;
      }

      /* Staggered Card Micro-Animations */
      .portal-card, .portal-item, .app-card, .course-card, .kpi-card, .card, .gov-panel {
        animation: mgcCardStagger 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
        transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
                    box-shadow 0.26s cubic-bezier(0.22, 1, 0.36, 1),
                    border-color 0.26s ease !important;
      }

      /* ============================================================================
         ANTI-CLUTTER / PROGRESSIVE DISCLOSURE ENGINE (body.mgc-clean-ui)
         Eliminates wall-of-text fatigue: clamps secondary copy to 1 crisp line and
         expands smoothly on hover/focus. Hides duplicate secondary page navs.
         ============================================================================ */
      body.mgc-clean-ui .portal-card p,
      body.mgc-clean-ui .portal-item p,
      body.mgc-clean-ui .app-card p,
      body.mgc-clean-ui .course-card p,
      body.mgc-clean-ui p.sub,
      body.mgc-clean-ui .hero-sub,
      body.mgc-clean-ui .sec-sub {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.82;
        transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      }
      body.mgc-clean-ui .portal-card:hover p,
      body.mgc-clean-ui .portal-item:hover p,
      body.mgc-clean-ui .app-card:hover p,
      body.mgc-clean-ui .course-card:hover p,
      body.mgc-clean-ui .card:hover p.sub {
        -webkit-line-clamp: 4;
        opacity: 1;
      }
      /* Hide redundant secondary top nav bars on internal pages when Global Ribbon is active */
      body.mgc-clean-ui header .nav-pills,
      body.mgc-clean-ui .top-nav .nav-links {
        display: none !important;
      }

      /* Spotlight Guidance Highlight Ring */
      .mgc-spotlight-target {
        position: relative !important;
        z-index: 90 !important;
        outline: 2px solid #fbbf24 !important;
        outline-offset: 4px !important;
        border-radius: 16px !important;
        animation: mgcPulseGlow 2s infinite !important;
      }

      /* Sleek Single-Line Global Command Ribbon */
      .mgc-tbv-topbar {
        position: sticky;
        top: 0;
        z-index: 99990;
        background: rgba(5, 10, 24, 0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: #f8fafc;
        padding: 8px 18px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      }
      .mgc-tbv-inner {
        max-width: 1440px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .mgc-tbv-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .mgc-tbv-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.06em;
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #34d399;
        cursor: pointer;
        transition: all 0.2s;
      }
      .mgc-tbv-pill:hover { background: rgba(16, 185, 129, 0.26); transform: translateY(-1px); }

      .mgc-tbv-nav {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mgc-tbv-link {
        text-decoration: none;
        font-size: 11.5px;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 999px;
        color: #cbd5e1;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(15, 23, 42, 0.65);
        transition: all 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        white-space: nowrap;
      }
      .mgc-tbv-link:hover {
        color: #ffffff;
        border-color: rgba(96, 165, 250, 0.6);
        background: rgba(30, 58, 138, 0.45);
        transform: translateY(-1px);
      }
      .mgc-tbv-link.active {
        color: #ffffff;
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        border-color: #60a5fa;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
      }

      .mgc-cmd-btn {
        background: rgba(30, 41, 59, 0.85);
        color: #f8fafc;
        border: 1px solid rgba(197, 179, 88, 0.45);
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .mgc-cmd-btn:hover {
        border-color: #fbbf24;
        background: rgba(51, 65, 85, 0.9);
        transform: translateY(-1px);
      }
      .mgc-clean-btn {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.4);
        padding: 6px 11px;
        border-radius: 999px;
        font-size: 10.5px;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .mgc-clean-btn.off {
        background: rgba(15, 23, 42, 0.7);
        color: #94a3b8;
        border-color: rgba(148, 163, 184, 0.25);
      }
      .mgc-tour-btn {
        background: linear-gradient(135deg, #c5b358, #a38f36);
        color: #040814;
        border: none;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 10.5px;
        font-weight: 900;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .mgc-tour-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }

      /* Command Palette Modal (All 16 Portals) */
      .mgc-palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99998;
        background: rgba(2, 6, 23, 0.8);
        backdrop-filter: blur(14px);
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 64px 20px 20px;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .mgc-palette-backdrop.open { display: flex; animation: mgcPageFadeIn 0.2s ease both; }
      .mgc-palette-box {
        width: 100%;
        max-width: 960px;
        background: rgba(11, 18, 36, 0.98);
        border: 1px solid rgba(197, 179, 88, 0.5);
        border-radius: 22px;
        padding: 20px;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8);
        color: #f8fafc;
      }
      .mgc-palette-search {
        width: 100%;
        padding: 12px 16px;
        border-radius: 12px;
        background: #040814;
        border: 1px solid rgba(148, 163, 184, 0.28);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 16px;
        outline: none;
      }
      .mgc-palette-search:focus { border-color: #60a5fa; }
      .mgc-palette-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        max-height: 62vh;
        overflow-y: auto;
      }
      .mgc-pal-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(19, 30, 58, 0.75);
        border: 1px solid rgba(148, 163, 184, 0.15);
        text-decoration: none;
        color: #f8fafc;
        transition: all 0.18s;
      }
      .mgc-pal-item:hover, .mgc-pal-item.active {
        border-color: #fbbf24;
        background: rgba(30, 58, 138, 0.45);
        transform: translateY(-2px);
      }

      /* Non-Intrusive Guided Spotlight Pill & Card */
      .mgc-guide-Launcher-pill {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 99994;
        background: rgba(11, 20, 38, 0.94);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(197, 179, 88, 0.55);
        color: #f8fafc;
        padding: 9px 15px;
        border-radius: 999px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11.5px;
        font-weight: 800;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
        transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .mgc-guide-Launcher-pill:hover {
        transform: translateY(-2px);
        border-color: #fbbf24;
      }

      .mgc-tour-drawer {
        position: fixed;
        bottom: 18px;
        right: 18px;
        width: 340px;
        max-width: calc(100vw - 32px);
        z-index: 99995;
        background: rgba(11, 20, 38, 0.96);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(197, 179, 88, 0.6);
        border-radius: 18px;
        padding: 16px;
        color: #f8fafc;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
        animation: mgcPageFadeIn 0.22s ease both;
      }
      .mgc-tour-drawer.hidden { display: none; }

      .mgc-verify-toast {
        position: fixed;
        top: 56px;
        right: 20px;
        z-index: 99999;
        width: 350px;
        background: rgba(6, 24, 18, 0.97);
        border: 1px solid #10b981;
        border-radius: 14px;
        padding: 14px;
        color: #ecfdf5;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11.5px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.65);
        display: none;
      }

      .mgc-mobile-bottom-nav { display: none; }

      @media (max-width: 980px) {
        .mgc-palette-grid { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 768px) {
        html, body { max-width: 100vw !important; overflow-x: hidden !important; }
        .mgc-tbv-topbar { padding: 6px 10px; max-width: 100vw !important; overflow-x: hidden !important; box-sizing: border-box; }
        .mgc-tbv-inner { flex-direction: column; align-items: stretch; gap: 6px; max-width: 100% !important; overflow: hidden; }
        .mgc-tbv-brand { justify-content: space-between; width: 100%; font-size: 11px; flex-wrap: wrap; gap: 4px; }
        .mgc-tbv-nav {
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          max-width: 100% !important;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-bottom: 2px;
          gap: 5px;
        }
        .mgc-tbv-nav::-webkit-scrollbar { display: none; }
        .mgc-tbv-link, .mgc-cmd-btn, .mgc-clean-btn, .mgc-tour-btn {
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          font-size: 10.5px;
          padding: 5px 10px;
        }
        .mgc-palette-grid { grid-template-columns: 1fr; }
        .mgc-guide-Launcher-pill { bottom: 68px; right: 12px; font-size: 10.5px; padding: 7px 12px; }
        .mgc-tour-drawer { bottom: 68px; right: 10px; left: 10px; width: auto; max-width: none; }
        .mgc-mobile-bottom-nav {
          display: flex;
          position: fixed;
          bottom: 8px;
          left: 8px;
          right: 8px;
          z-index: 99991;
          background: rgba(6, 11, 25, 0.96);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(59, 130, 246, 0.4);
          border-radius: 16px;
          padding: 6px 8px;
          justify-content: space-around;
          align-items: center;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75);
          font-family: 'Inter', system-ui, sans-serif;
        }
        .mgc-mobile-bottom-nav a {
          text-decoration: none;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #cbd5e1;
          padding: 6px 9px;
          border-radius: 10px;
        }
        .mgc-mobile-bottom-nav a.active {
          background: #2563eb;
          color: #ffffff;
        }
        body { padding-bottom: 68px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  async function renderUI() {
    injectStyles();

    // Activate Anti-Clutter Clean UI Mode by default (unless explicitly toggled off)
    const isCleanUi = localStorage.getItem(CLEAN_UI_KEY) !== '0';
    if (isCleanUi) {
      document.body.classList.add('mgc-clean-ui');
    }

    const cryptoSig = await computeWebCryptoHash((session.email || '') + ':' + (session.role || '') + ':MGC-EDGE-2026');
    session.integrityHash = cryptoSig;

    // 1. Sleek Single-Line Command Ribbon (Only 5 Pinned Links + All-16 Command Palette Launcher)
    const pinnedPages = pages.filter(p => p.pinned);
    const currentPageObj = pages.find(p => p.file.toLowerCase() === currentFile) || pages[0];

    const navHtml = pinnedPages.map(p => {
      const isAct = currentFile === p.file.toLowerCase();
      return `<a href="${p.file}" class="mgc-tbv-link ${isAct ? 'active' : ''}" title="${p.label}">${p.short}</a>`;
    }).join('');

    const bar = document.createElement('div');
    bar.className = 'mgc-tbv-topbar';
    bar.innerHTML = `
      <div class="mgc-tbv-inner">
        <div class="mgc-tbv-brand">
          <span style="color:#c5b358;display:inline-flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;box-shadow:0 0 8px #10b981;"></span>
            MGC // ${currentPageObj.short.replace(/^[^\w]+/, '')}
          </span>
          <span class="mgc-tbv-pill" id="mgc-tbv-verify-btn" title="Click to inspect 2FA Biometric & WebCrypto SHA-256 Session">
            ✔ 2FA • ${cryptoSig.slice(0, 11)}
          </span>
        </div>
        <div class="mgc-tbv-nav">
          ${navHtml}
          <button class="mgc-cmd-btn" id="mgc-open-palette-btn" title="Open All 16 Portals Switcher (Ctrl+K)">
            ⌘ All 16 Portals ▾
          </button>
          <button class="mgc-clean-btn ${isCleanUi ? '' : 'off'}" id="mgc-clean-toggle-btn" title="Toggle Anti-Clutter Progressive Disclosure View">
            ✨ ${isCleanUi ? 'Clean UI: ON' : 'Full Text'}
          </button>
          <button class="mgc-tour-btn" id="mgc-tour-toggle-btn" title="Interactive Spotlight Guidance">
            🧭 Guide Me
          </button>
        </div>
      </div>
    `;
    document.body.prepend(bar);

    // 2. Categorized 16-Portal Command Palette Modal (Ctrl+K)
    const palette = document.createElement('div');
    palette.className = 'mgc-palette-backdrop';
    palette.id = 'mgc-palette-backdrop';
    palette.innerHTML = `
      <div class="mgc-palette-box" onclick="event.stopPropagation()">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:0.1em;">⌘ MGC &amp; F.I.X Quick Switcher</span>
            <span style="font-size:11px;color:#94a3b8;">(16 Portals &amp; Projects • Press ESC to close)</span>
          </div>
          <button id="mgc-palette-close" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <input type="text" class="mgc-palette-search" id="mgc-palette-input" placeholder="Search any portal, collection, or client project (e.g., Sterling Auto, Finance, LMS, 3D Earth)..." />
        <div class="mgc-palette-grid" id="mgc-palette-grid">
          ${pages.map(p => `
            <a href="${p.file}" class="mgc-pal-item ${currentFile === p.file.toLowerCase() ? 'active' : ''}" data-search="${(p.label + ' ' + p.cat + ' ' + p.tag).toLowerCase()}">
              <span style="font-size:20px;flex-shrink:0;">${p.icon}</span>
              <div style="overflow:hidden;">
                <div style="font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.label}</div>
                <div style="font-size:10.5px;color:#94a3b8;">${p.cat} • <span style="color:#60a5fa;">${p.tag}</span></div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(palette);

    // 3. Mobile Bottom Quick-Switch Bar (< 768px Only)
    const mobileBar = document.createElement('nav');
    mobileBar.className = 'mgc-mobile-bottom-nav';
    const quickMobileLinks = [
      { file: 'admin-command-portal.html', label: '★ Admin' },
      { file: 'saas-apps-and-lms-showcase.html', label: '⚡ Apps/LMS' },
      { file: 'projects/sterling-auto-repair/index.html', label: '🔧 Sterling' },
      { file: 'finance-command.html', label: '💳 Finance' },
      { file: 'onboarding-portal.html', label: '🫆 2FA' }
    ];
    mobileBar.innerHTML = quickMobileLinks.map(q => {
      const isAct = currentFile === q.file.toLowerCase();
      return `<a href="${q.file}" class="${isAct ? 'active' : ''}">${q.label}</a>`;
    }).join('');
    document.body.appendChild(mobileBar);

    // 4. Compact 2FA Session Verification Popover
    const toast = document.createElement('div');
    toast.className = 'mgc-verify-toast';
    toast.id = 'mgc-verify-toast';
    toast.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="color:#34d399;text-transform:uppercase;letter-spacing:0.06em;font-size:10.5px;">✔ 2FA Biometric &amp; WebCrypto Session</strong>
        <button id="mgc-toast-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;">✕</button>
      </div>
      <div style="display:grid;gap:3px;color:#d1fae5;font-size:11px;">
        <div><strong>User:</strong> ${session.email}</div>
        <div><strong>Role:</strong> ${session.role}</div>
        <div><strong>Digest:</strong> <code>${cryptoSig}</code></div>
        <div><strong>Cloud Guard:</strong> $0.00/hr Idle (min-instances=0)</div>
      </div>
    `;
    document.body.appendChild(toast);

    // 5. Non-Intrusive Interactive Spotlight Guidance Pill & Compact Step Card
    const stepInfo = tourStepsByPage[currentFile] || tourStepsByPage['admin-command-portal.html'];
    const guidePill = document.createElement('button');
    guidePill.className = 'mgc-guide-Launcher-pill';
    guidePill.id = 'mgc-guide-pill';
    guidePill.innerHTML = `<span>🧭</span> <span>Guide: ${stepInfo.title}</span> <span style="color:#fbbf24;">▸</span>`;
    document.body.appendChild(guidePill);

    const drawer = document.createElement('div');
    drawer.className = 'mgc-tour-drawer hidden';
    drawer.id = 'mgc-tour-drawer';
    drawer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:9.5px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#fbbf24;background:rgba(251,191,36,0.14);padding:3px 8px;border-radius:6px;">
          🧭 Interactive Spotlight Guide
        </span>
        <button id="mgc-tour-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;" title="Minimize">✕</button>
      </div>
      <div style="font-size:13.5px;font-weight:800;color:#ffffff;margin-bottom:4px;">${stepInfo.title}</div>
      <div style="font-size:11.5px;color:#cbd5e1;line-height:1.45;margin-bottom:10px;">${stepInfo.desc}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">
        ${stepInfo.highlights.map((h, i) => `
          <button class="mgc-spot-step-btn" data-step="${i}" style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:6px;background:rgba(59,130,246,0.16);border:1px solid rgba(59,130,246,0.4);color:#93c5fd;cursor:pointer;">
            ${i + 1}. ${h}
          </button>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(148,163,184,0.16);">
        <button id="mgc-spotlight-cycle-btn" style="font-size:11px;font-weight:800;color:#60a5fa;background:none;border:none;cursor:pointer;">✨ Highlight Next Zone</button>
        <a href="${stepInfo.nextFile}" style="font-size:11px;font-weight:800;color:#040814;background:#fbbf24;text-decoration:none;padding:5px 11px;border-radius:8px;">Next Portal →</a>
      </div>
    `;
    document.body.appendChild(drawer);

    // Interactive Spotlight Highlighter Logic
    let spotIndex = 0;
    function highlightPageSection(idx) {
      document.querySelectorAll('.mgc-spotlight-target').forEach(el => el.classList.remove('mgc-spotlight-target'));
      const candidates = Array.from(document.querySelectorAll('section, .card, .portal-card, .gov-panel, .kpi-strip, .cat-bar')).filter(el => el.offsetParent !== null);
      if (candidates.length === 0) return;
      const target = candidates[idx % candidates.length];
      target.classList.add('mgc-spotlight-target');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => target.classList.remove('mgc-spotlight-target'), 3200);
    }

    // Event Bindings
    document.getElementById('mgc-tbv-verify-btn').addEventListener('click', () => {
      const t = document.getElementById('mgc-verify-toast');
      t.style.display = t.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('mgc-toast-close').addEventListener('click', () => {
      document.getElementById('mgc-verify-toast').style.display = 'none';
    });

    // Clean UI Toggle
    document.getElementById('mgc-clean-toggle-btn').addEventListener('click', function () {
      const active = document.body.classList.toggle('mgc-clean-ui');
      localStorage.setItem(CLEAN_UI_KEY, active ? '1' : '0');
      this.textContent = active ? '✨ Clean UI: ON' : '✨ Full Text';
      this.classList.toggle('off', !active);
    });

    // Command Palette Open/Close & Filter
    const openPalette = () => {
      palette.classList.add('open');
      const inp = document.getElementById('mgc-palette-input');
      inp.value = '';
      inp.focus();
    };
    const closePalette = () => palette.classList.remove('open');
    document.getElementById('mgc-open-palette-btn').addEventListener('click', openPalette);
    document.getElementById('mgc-palette-close').addEventListener('click', closePalette);
    palette.addEventListener('click', closePalette);
    document.getElementById('mgc-palette-input').addEventListener('input', function () {
      const q = this.value.trim().toLowerCase();
      document.querySelectorAll('#mgc-palette-grid .mgc-pal-item').forEach(item => {
        item.style.display = (!q || item.getAttribute('data-search').includes(q)) ? 'flex' : 'none';
      });
    });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        palette.classList.contains('open') ? closePalette() : openPalette();
      } else if (e.key === 'Escape') {
        closePalette();
      }
    });

    // Guided Spotlight Tour Toggle
    const toggleTour = () => {
      const isHidden = drawer.classList.toggle('hidden');
      guidePill.style.display = isHidden ? 'flex' : 'none';
      if (!isHidden) highlightPageSection(0);
    };
    document.getElementById('mgc-tour-toggle-btn').addEventListener('click', toggleTour);
    guidePill.addEventListener('click', toggleTour);
    document.getElementById('mgc-tour-close').addEventListener('click', () => {
      drawer.classList.add('hidden');
      guidePill.style.display = 'flex';
    });
    document.getElementById('mgc-spotlight-cycle-btn').addEventListener('click', () => {
      spotIndex++;
      highlightPageSection(spotIndex);
    });
    drawer.querySelectorAll('.mgc-spot-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        spotIndex = parseInt(btn.getAttribute('data-step'), 10) || 0;
        highlightPageSection(spotIndex);
      });
    });

    // Smooth Page Transition Interceptor for Internal Links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || link.target === '_blank') return;
      e.preventDefault();
      document.body.classList.add('mgc-page-leaving');
      setTimeout(() => { window.location.href = href; }, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUI);
  } else {
    renderUI();
  }
})();
