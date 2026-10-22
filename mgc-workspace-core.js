/*!
 * MGC Workspace Core  —  data layer + access policy + workflow engine + themed shell
 * ---------------------------------------------------------------------------------
 * PROTOTYPE BACKEND: state lives in localStorage so the UI can be reviewed today.
 * localStorage is NOT a security boundary. In production every `MGCW.db.*` call is
 * replaced by Firebase Auth + Firestore (see firestore.rules) and `MGCW.can()` is
 * enforced server-side by those rules. The policy below mirrors the rules 1:1.
 */
(function (global) {
  'use strict';
  const KEY = 'mgcw.v1';
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
  const now = () => new Date().toISOString();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Catalog: every page/app a user can be given (pages & apps on request) ---------- */
  // Strict Policy: New & standard users ONLY have view & access to SaaS Apps & LMS (saasapps) + Payment & Billing.
  // All other pages/features are locked unless explicitly granted by the sole Administrator (Malik A. Khabir).
  const CATALOG = [
    { id: 'saasapps',  icon: '⚡', title: 'SaaS Apps & LMS',       brand: 'FIX', kind: 'app',  base: true,  price: 0,  href: 'saas-apps-and-lms-showcase.html', desc: 'Your default unlocked SaaS Apps, Turnkey Configurator, Sterling Auto Showcase & SCORM 2004 LMS.' },
    { id: 'agile',     icon: '🗂️', title: 'Agile Board',           brand: 'ANY', kind: 'app',  base: false, price: 9,  href: 'agile-board.html',                desc: 'Backlog, sprint board and feature requests for shared projects (Admin Grant Required).' },
    { id: 'radar',     icon: '🎯', title: 'Contract Radar',        brand: 'FIX', kind: 'app',  base: false, price: 9,  href: 'sdvosb-contract-radar.html',      desc: 'Federal opportunity feed filtered to your NAICS codes (Admin Grant Required).' },
    { id: 'compliance',icon: '🔒', title: 'Compliance Tracker',    brand: 'MGC', kind: 'page', base: false, price: 7,  href: 'compliance-trust-center.html',    desc: 'CMMC / Zero-Trust checklist with evidence upload (Admin Grant Required).' },
    { id: 'ailab',     icon: '🤖', title: 'AI Workflow Lab',       brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'agent-workflow-studio.html',      desc: 'Prompt, agent and automation templates for your business (Admin Grant Required).' },
    { id: 'finance',   icon: '💳', title: 'Cashflow & Invoicing',  brand: 'FIX', kind: 'page', base: false, price: 8,  href: 'finance-command.html',            desc: 'Invoice tracker, WAWF/PIEE checklist, runway view (Admin Grant Required).' },
    { id: 'training',  icon: '🎓', title: 'SCORM EVE-NG Academy',  brand: 'MGC', kind: 'page', base: false, price: 10, href: 'elearning-upskilling-hub.html',   desc: 'SCORM 2004 15-topology EVE-NG workbench, fault injector & auto-grader (Admin Grant Required).' },
    { id: 'aistudio',  icon: '🧠', title: 'AI Studio & NotebookLM',brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'historical-archaeology-ai-hub.html', desc: 'Chronos Historical AI, Epigraphy & NotebookLM Research Lab (Admin Grant Required).' },
    { id: 'home',      icon: '🏠', title: 'Full Overview Hub',     brand: 'ANY', kind: 'page', base: false, price: 5,  href: 'member-portal.html?view=overview', desc: 'Expanded project overview, tailored checklist & notifications (Admin Grant Required).' },
    { id: 'resources', icon: '📚', title: 'Curated Resources',     brand: 'ANY', kind: 'page', base: false, price: 5,  href: 'member-portal.html?view=resources', desc: 'Links, templates and real-life workflows matched to your quote (Admin Grant Required).' }
  ];

  const APPS_CATALOG = [
    { id: 'client-turnkey-forge',       icon: '🛠️', title: 'Client Turnkey Forge SCORM OS',        brand: 'FIX', defaultCustomer: true,  price: 0,  href: 'projects/client-turnkey-forge/index.html',       zipHref: 'projects/client-turnkey-forge/exports/turnkey_forge_scorm_2004_4th_edition.zip', desc: 'Included by default on customer login: interactive custom build scope & pricing configurator.' },
    { id: 'sterling-auto-repair',       icon: '🔧', title: 'Sterling Auto Repair Showcase',        brand: 'FIX', defaultCustomer: true,  price: 0,  href: 'projects/sterling-auto-repair/index.html',       zipHref: '',                                                                               desc: 'Included by default on customer login: live commercial web & AI receptionist showcase.' },
    { id: 'eveng-netprism-studio',      icon: '🖧', title: 'EVE-NG & NetPrism Topology Studio',    brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/eveng-netprism-studio/index.html',      zipHref: 'projects/eveng-netprism-studio/exports/eveng_scorm_2004_4th_edition.zip',        desc: 'Restricted by default on customer login: 8-page OSPF/BGP/ZTNA/EVPN network simulator & .cast studio.' },
    { id: 'samgov-contract-matchmaker', icon: '🏛️', title: 'SAM.gov Contract & Job Matchmaker',    brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/samgov-contract-matchmaker/index.html', zipHref: 'projects/samgov-contract-matchmaker/exports/samgov_scorm_2004_4th_edition.zip',  desc: 'Restricted by default on customer login: 6-page SDVOSB NAICS 541512/541519 & Principal AI role matchmaker.' },
    { id: 'traffic-roi-simulator',      icon: '📈', title: 'Site Traffic & Conversion ROI OS',     brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/traffic-roi-simulator/index.html',      zipHref: 'projects/traffic-roi-simulator/exports/traffic_scorm_2004_4th_edition.zip',      desc: 'Restricted by default on customer login: 6-page Cloud Run Zero-Charge funnel & multi-rail revenue simulator.' },
    { id: 'ghost-cli-trainer',          icon: '⌨️', title: 'Ghost-CLI & Netmiko Auto-Grader',      brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/ghost-cli-trainer/index.html',          zipHref: 'projects/ghost-cli-trainer/exports/ghost_cli_scorm_2004_4th_edition.zip',        desc: 'Restricted by default on customer login: 8-page IOS-XE, Linux, 3NF SQL, KQL & Ansible kinetic terminal.' },
    { id: 'chronos-aetheria-scorm',     icon: '🏺', title: 'Chronos // Aetheria Geo-Historical OS',brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/chronos-aetheria-scorm/index.html',     zipHref: 'projects/chronos-aetheria-scorm/exports/chronos_scorm_2004_4th_edition.zip',     desc: 'Restricted by default on customer login: 6-page DeepMind Ithaca/Aeneas epigraphy & geodesic discovery engine.' },
    { id: 'spanish-acquisition-os',     icon: '🇪🇸', title: 'Spanish Acquisition OS (10,000 Words)',brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/spanish-acquisition-os/index.html',     zipHref: 'projects/spanish-acquisition-os/exports/saos_scorm_2004_4th_edition.zip',        desc: 'Restricted by default on customer login: 10-SCO language OS with 344 neural MP3s & 100 Latin/Spanish roots.' }
  ];

  const DEFAULT_CUSTOMER_APPS = ['sterling-auto-repair', 'client-turnkey-forge'];
  const DEFAULT_CUSTOMER_PAGES = { saasapps: 'ready' };

  const STEPS = ['requested', 'approved_building', 'active'];
  const STATUS_LABEL = { requested: 'Pending approval', approved_building: 'Pages being built', active: 'Active', denied: 'Not approved', suspended: 'Suspended' };

  /* ---------- Tailoring: quote interest -> curated content (resources, actions, workflows) ---------- */
  const TAILOR = {
    'ai-web': { label: 'AI website & agent', pages: ['saasapps', 'ailab', 'finance', 'aistudio'],
      actions: ['Pick your 3 core services to feature', 'Upload logo + brand colors', 'Approve the draft homepage', 'Connect your Google Business profile'],
      resources: [['Google Business Profile setup', 'https://support.google.com/business'], ['Local SEO checklist', 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide'], ['Stripe payment links', 'https://stripe.com/payments/payment-links']],
      workflows: ['Lead arrives → agent replies in 60s → books calendar slot → owner notified', 'Review request sent 24h after each completed job'] },
    'federal': { label: 'Federal contracting', pages: ['radar', 'compliance', 'finance'],
      actions: ['Confirm UEI + CAGE in SAM.gov', 'List your 3 NAICS codes', 'Draft a one-page capability statement', 'Subscribe to Sources Sought alerts'],
      resources: [['SAM.gov registration', 'https://sam.gov'], ['SBA VetCert', 'https://veterans.certify.sba.gov/'], ['APEX Accelerators (free help)', 'https://www.apexaccelerators.us/']],
      workflows: ['Sources Sought → capability brief → teaming email → follow-up in 5 days', 'Award → invoice in PIEE/WAWF → payment tracking'] },
    'cyber': { label: 'Cyber & compliance', pages: ['compliance', 'ailab'],
      actions: ['Inventory systems that touch CUI', 'Assign an owner per control family', 'Collect first 10 evidence artifacts', 'Schedule a gap review'],
      resources: [['NIST SP 800-171', 'https://csrc.nist.gov/pubs/sp/800/171/r3/final'], ['CMMC resources (DoD CIO)', 'https://dodcio.defense.gov/CMMC/'], ['CISA free services', 'https://www.cisa.gov/cybersecurity-services']],
      workflows: ['Control gap → POA&M item → owner → due date → evidence → closed', 'Quarterly access review → remove stale accounts'] },
    'training': { label: 'Skills & certification', pages: ['training', 'aistudio', 'saasapps'],
      actions: ['Pick one target certification', 'Block 5 study sessions this week', 'Complete diagnostic quiz', 'Book exam date'],
      resources: [['Cisco Learning Network', 'https://learningnetwork.cisco.com/'], ['Microsoft Learn', 'https://learn.microsoft.com/training/'], ['Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/'], ['Google NotebookLM', 'https://notebooklm.google.com/'], ['Google AI Studio Apps', 'https://aistudio.google.com/apps?source=user&tag=created-by-you']],
      workflows: ['Diagnostic → weak domains → targeted SCORM EVE-NG labs → AI Studio simulators → practice exam'] }
  };

  /* ---------- Seed (Sole Administrator = Malik A. Khabir; all users default to SaaS Apps & LMS only) ---------- */
  function seed() {
    const t = now();
    const mk = (id, name, email, role, status, brand, interest, paid, pages, allowedApps) => ({
      id, name, email, role, status, brand,
      accessTier: role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
      quote: { interest, note: '' },
      plan: { base: paid, addons: [] },
      pages: pages || { saasapps: 'ready' },
      adminGrantedPages: [],
      allowedApps: allowedApps || (role === 'owner' ? ['*'] : DEFAULT_CUSTOMER_APPS.slice()),
      paymentProfile: null,
      payments: [],
      created: t
    });
    return {
      v: 1,
      users: {
        owner: mk('owner', 'Malik A. Khabir (Administrator)', 'malik.khabir@miltongroupsecurity.org', 'owner', 'active', 'MGC', 'federal', true, { saasapps: 'ready', agile: 'ready', radar: 'ready', compliance: 'ready', ailab: 'ready', finance: 'ready', training: 'ready', aistudio: 'ready', home: 'ready', resources: 'ready' }, ['*']),
        client: mk('client', 'Customer Account (SaaS & LMS)', 'client@miltongroupsecurity.org', 'member', 'active', 'FIX', 'ai-web', true, { saasapps: 'ready' }, DEFAULT_CUSTOMER_APPS.slice()),
        ana: mk('ana', 'Ana (Requested)', 'ana@example.com', 'member', 'requested', 'MGC', 'cyber', false, { saasapps: 'ready' }, DEFAULT_CUSTOMER_APPS.slice()),
        ben: mk('ben', 'Ben (SaaS & LMS User)', 'ben@example.com', 'member', 'active', 'FIX', 'federal', false, { saasapps: 'ready' }, DEFAULT_CUSTOMER_APPS.slice()),
        cara: mk('cara', 'Cara (SaaS & LMS User)', 'cara@example.com', 'member', 'active', 'FIX', 'ai-web', true, { saasapps: 'ready' }, DEFAULT_CUSTOMER_APPS.slice())
      },
      shares: [
        { id: 'project_p_sterling_client', type: 'project', resource: 'p_sterling', grantee: 'client', perms: ['view'], created: t },
        { id: 'project_p_sterling_cara', type: 'project', resource: 'p_sterling', grantee: 'cara', perms: ['view'], created: t }
      ],
      tasks: [], notifications: [], audit: [], payments: [],
      projects: {
        p_sterling: { id: 'p_sterling', name: 'Client Project: Sterling Auto Repair (Web + AI Receptionist)', owner: 'owner', brand: 'FIX', demoUrl: 'projects/sterling-auto-repair/index.html', budget: '$1,500 setup + $497/mo' },
        p1: { id: 'p1', name: 'Shared: Website launch', owner: 'owner', brand: 'FIX' },
        p2: { id: 'p2', name: 'Internal: Q4 platform', owner: 'owner', brand: 'MGC' }
      },
      items: [
        { id: 'i_st1', project: 'p_sterling', type: 'story', title: 'Interactive repair estimator & bay RO status tracker', points: 5, col: 'done', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i_st2', project: 'p_sterling', type: 'story', title: '24/7 AI lead receptionist + Google Calendar booking', points: 8, col: 'progress', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i_st3', project: 'p_sterling', type: 'task', title: 'Local SEO schema & Google Business Profile verification', points: 3, col: 'ready', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i1', project: 'p1', type: 'story', title: 'Homepage draft', points: 5, col: 'progress', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i2', project: 'p1', type: 'task', title: 'Collect brand assets', points: 2, col: 'ready', sprint: 1, assignee: 'cara', createdBy: 'owner' },
        { id: 'i3', project: 'p1', type: 'story', title: 'Booking form + calendar', points: 8, col: 'backlog', sprint: 0, assignee: '', createdBy: 'owner' },
        { id: 'i4', project: 'p1', type: 'bug', title: 'Logo too small on mobile', points: 1, col: 'review', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i5', project: 'p2', type: 'story', title: 'Per-page subscription checkout', points: 8, col: 'backlog', sprint: 0, assignee: '', createdBy: 'owner' },
        { id: 'i6', project: 'p2', type: 'task', title: 'Enable Firebase Auth + rules', points: 5, col: 'ready', sprint: 1, assignee: 'owner', createdBy: 'owner' }
      ],
      features: [{ id: 'f1', by: 'cara', title: 'Add Google Calendar sync to the board', body: 'Show sprint dates on my calendar.', votes: ['cara'], status: 'new', created: t }],
      requests: [{ id: 'r1', uid: 'ana', status: 'requested', created: t }, { id: 'r2', uid: 'ben', status: 'approved', created: t }]
    };
  }

  /* ---------- Connected Multi-Engine Database & Free-Tier Cost Guard ---------- */
  const COST_KEY = 'mgc_db_cost_guard_v1';
  const costGuard = (function () {
    const today = new Date().toISOString().slice(0, 10);
    let data = null;
    try { data = JSON.parse(localStorage.getItem(COST_KEY)); } catch (_) {}
    if (!data || data.day !== today) {
      data = { day: today, readsToday: 1, writesToday: 0, dailyReadCap: 40000, dailyWriteCap: 16000, firestoreFreeReads: 50000, firestoreFreeWrites: 20000, estimatedCostUsd: 0.00, circuitBreakerTripped: false, lastSyncAt: now() };
      try { localStorage.setItem(COST_KEY, JSON.stringify(data)); } catch (_) {}
    }
    return {
      get stats() { return data; },
      trackRead() { data.readsToday++; try { localStorage.setItem(COST_KEY, JSON.stringify(data)); } catch (_) {} },
      trackWrite() {
        if (data.writesToday >= data.dailyWriteCap) { data.circuitBreakerTripped = true; return false; }
        data.writesToday++; data.lastSyncAt = now();
        try { localStorage.setItem(COST_KEY, JSON.stringify(data)); } catch (_) {}
        return true;
      }
    };
  })();

  let idbConn = null;
  function initIndexedDB() {
    if (!global.indexedDB) return;
    try {
      const req = global.indexedDB.open('MGC_Enterprise_DB', 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        ['users', 'projects', 'agile_items', 'shares', 'audit', 'cost_ledger'].forEach(store => {
          if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' });
        });
      };
      req.onsuccess = (e) => {
        idbConn = e.target.result;
        syncStateToIndexedDB(S);
      };
    } catch (_) {}
  }

  function syncStateToIndexedDB(state) {
    if (!idbConn || !state) return;
    try {
      const tx = idbConn.transaction(['users', 'projects', 'agile_items', 'shares', 'audit', 'cost_ledger'], 'readwrite');
      Object.values(state.users || {}).forEach(u => tx.objectStore('users').put(u));
      Object.values(state.projects || {}).forEach(p => tx.objectStore('projects').put(p));
      (state.items || []).forEach(it => tx.objectStore('agile_items').put(it));
      (state.shares || []).forEach(sh => tx.objectStore('shares').put(sh));
      (state.audit || []).slice(0, 50).forEach(au => tx.objectStore('audit').put(au));
      tx.objectStore('cost_ledger').put({ id: costGuard.stats.day, ...costGuard.stats });
    } catch (_) {}
  }

  let bcChannel = null;
  try {
    if (global.BroadcastChannel) {
      bcChannel = new BroadcastChannel('mgc_db_sync');
      bcChannel.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'STATE_UPDATED') {
          try {
            const fresh = JSON.parse(localStorage.getItem(KEY));
            if (fresh && fresh.v === 1) S = fresh;
          } catch (_) {}
        }
      };
    }
  } catch (_) {}

  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  let serverSyncOk = false;

  function fetchServerStateSync() {
    if (!isHttp) return null;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/state', false);
      xhr.send(null);
      if (xhr.status === 200) {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed && parsed.v === 1) {
          serverSyncOk = true;
          costGuard.trackRead();
          if (parsed.currentUser) sessionStorage.setItem('mgcw.uid', parsed.currentUser);
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  }

  function postServerAction(payload) {
    if (!serverSyncOk) return null;
    if (!costGuard.trackWrite()) return null;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/action', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        if (res && res.state) {
          S = res.state;
          if (res.uid) sessionStorage.setItem('mgcw.uid', res.uid);
          return res;
        }
      }
    } catch (_) {}
    return null;
  }

  function ensureSterlingProject(state) {
    if (!state) return state;
    const def = seed();
    state.users = Object.assign({}, def.users, state.users || {});
    Object.values(state.users).forEach(u => {
      if (u.role === 'owner') {
        u.accessTier = 'OWNER_FULL';
        u.allowedApps = ['*'];
      } else {
        u.accessTier = u.accessTier || 'CUSTOMER_RESTRICTED';
        if (!Array.isArray(u.allowedApps)) {
          u.allowedApps = u.status === 'active' ? DEFAULT_CUSTOMER_APPS.slice() : [];
        }
      }
    });
    state.projects = Object.assign({}, def.projects, state.projects || {});
    if (!(state.items || []).some(i => i.project === 'p_sterling')) {
      state.items = def.items.filter(i => i.project === 'p_sterling').concat(state.items || []);
    }
    if (state.users && state.users.owner && state.users.owner.pages) {
      state.users.owner.pages.saasapps = 'ready';
      state.users.owner.pages.aistudio = 'ready';
    }
    return state;
  }

  /* ---------- db adapter (IndexedDB + Cloud Run /api/state + localStorage WAL) ---------- */
  const db = {
    load() {
      costGuard.trackRead();
      const srv = fetchServerStateSync();
      if (srv) return ensureSterlingProject(srv);
      try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (s && s.v === 1) return ensureSterlingProject(s);
      } catch (e) {}
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    },
    save(s) {
      if (!costGuard.trackWrite()) return;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
      syncStateToIndexedDB(s);
      if (bcChannel) { try { bcChannel.postMessage({ type: 'STATE_UPDATED', ts: now() }); } catch (_) {} }
    },
    reset() {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem('mgcw.uid');
      localStorage.removeItem('mgc_onboarded_session');
    }
  };
  let S = db.load();
  initIndexedDB();
  const commit = () => db.save(S);

  const ALLOWED_SSO = ['google', 'microsoft', 'apple', 'password'];
  const SOLE_ADMIN_EMAIL = 'malik.khabir@miltongroupsecurity.org';
  const OWNER_EMAIL_SET = new Set([SOLE_ADMIN_EMAIL]);
  const OWNER_EMAILS = OWNER_EMAIL_SET;

  function mgcDigest(s) {
    const str = String(s || '');
    let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  const ADMIN_PASSWORD_DIGESTS = new Set([
    '767c6f5c35afb599',
    '42c9c755a45ace6b',
    '18d7d511b6590da6',
    'aa31dd0913f77481',
    '4aba603f101f0d22',
    '71afc1af3d0ce934',
    '410eb8431aed35a8',
    '7a236eaf847a4da3',
    '5f92394ec6485615'
  ]);

  function isValidAdminSecret(secretStr) {
    const clean = String(secretStr || '').trim();
    if (!clean) return false;
    const dig = mgcDigest(clean);
    if (ADMIN_PASSWORD_DIGESTS.has(dig)) return true;
    if (S && S.users && S.users.owner && S.users.owner.customPasswordDigest && dig === S.users.owner.customPasswordDigest) return true;
    return false;
  }

  function resolveCaseInsensitiveIdentifier(rawIdentifier) {
    const clean = String(rawIdentifier || '').trim().toLowerCase();
    if (!clean) return '';
    if (clean === SOLE_ADMIN_EMAIL || clean === 'malik.khabir') return SOLE_ADMIN_EMAIL;
    if (!clean.includes('@') && S && S.users) {
      const matched = Object.values(S.users).find(u =>
        u.id !== 'owner' &&
        (String(u.username || '').toLowerCase() === clean || String(u.email || '').toLowerCase().split('@')[0] === clean)
      );
      if (matched && matched.email) return String(matched.email).toLowerCase();
    }
    return clean;
  }

  function provisionCustomerSso(email, name, provider = 'google') {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanProv = ALLOWED_SSO.includes(String(provider || '').toLowerCase()) ? String(provider).toLowerCase() : 'google';
    if (!cleanEmail) return null;
    // STRICT 1-ADMIN GUARD: Never allow client-side provisioning to create or elevate into the Administrator account
    if (OWNER_EMAIL_SET.has(cleanEmail)) {
      if (S.currentUser === 'owner' && S.users.owner) {
        return S.users.owner;
      }
      return null;
    }
    let found = Object.values(S.users || {}).find(u => String(u.email || '').toLowerCase() === cleanEmail);
    if (!found) {
      const id = 'u_' + cleanEmail.replace(/[^a-z0-9]/g, '').slice(0, 12);
      found = {
        id,
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: 'member',
        status: 'active',
        accessTier: 'CUSTOMER_RESTRICTED',
        brand: 'FIX',
        quote: { interest: 'ai-web', note: 'Provisioned with SaaS Apps & LMS + Payment Access' },
        plan: { base: true, addons: [] },
        pages: { ...DEFAULT_CUSTOMER_PAGES },
        adminGrantedPages: [],
        allowedApps: DEFAULT_CUSTOMER_APPS.slice(),
        paymentProfile: null,
        payments: [],
        created: now()
      };
      S.users[id] = found;
      if (!(S.shares || []).some(s => s.type === 'project' && s.resource === 'p_sterling' && s.grantee === id)) {
        S.shares.push({ id: 'project_p_sterling_' + id, type: 'project', resource: 'p_sterling', grantee: id, perms: ['view'], created: now() });
      }
      commit();
    } else if (found.status !== 'denied' && found.status !== 'suspended' && cleanEmail !== 'ana@example.com') {
      found.status = 'active';
      found.accessTier = 'CUSTOMER_RESTRICTED';
      found.plan = Object.assign({ base: true, addons: [] }, found.plan || {}, { base: true });
      found.pages = Object.assign({}, DEFAULT_CUSTOMER_PAGES, found.pages || {});
      if (!Array.isArray(found.allowedApps) || !found.allowedApps.length) {
        found.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
      }
      if (!(S.shares || []).some(s => s.type === 'project' && s.resource === 'p_sterling' && s.grantee === found.id)) {
        S.shares.push({ id: 'project_p_sterling_' + found.id, type: 'project', resource: 'p_sterling', grantee: found.id, perms: ['view'], created: now() });
      }
      commit();
    }
    signInAs(found.id, cleanProv);
    return found;
  }

  const me = () => {
    if (localStorage.getItem('mgc_edge_gate_locked') === '1') return null;
    if (S.currentUser && S.users[S.currentUser]) return S.users[S.currentUser];
    // Bridge with OS Federated SSO Session (must be Google, Microsoft, or Apple SSO)
    try {
      const osSess = JSON.parse(localStorage.getItem('mgc_onboarded_session') || 'null');
      if (osSess && osSess.email && osSess.ssoVerified === true && ALLOWED_SSO.includes(String(osSess.ssoProvider || '').toLowerCase())) {
        const cleanEmail = String(osSess.email || '').toLowerCase();
        // Prevent client-side localStorage from spoofing the sole Administrator when server session is not owner
        if (OWNER_EMAIL_SET.has(cleanEmail) && S.currentUser !== 'owner') {
          return null;
        }
        const uidVal = sessionStorage.getItem('mgcw.uid') || '';
        if (uidVal && S.users[uidVal] && S.users[uidVal].role !== 'owner') return S.users[uidVal];
        const found = Object.values(S.users).find(u => u.email.toLowerCase() === cleanEmail && u.role !== 'owner');
        if (found) {
          sessionStorage.setItem('mgcw.uid', found.id);
          return found;
        }
        return provisionCustomerSso(osSess.email, osSess.name, osSess.ssoProvider);
      }
    } catch (_) {}
    return null;
  };

  function getAllowedPortalsForUser(u) {
    if (!u) return [];
    if (u.role === 'owner' && u.id === 'owner') return ['*'];
    const portals = new Set(['saas-apps-and-lms-showcase.html', 'member-portal.html']);
    CATALOG.forEach(c => {
      if (c.href && can(u, 'page', c.id, 'view')) {
        portals.add(c.href.split('?')[0].split('#')[0]);
      }
    });
    return Array.from(portals);
  }

  const signInAs = (id, provider = 'google', mfaCode = '') => {
    const cleanProv = ALLOWED_SSO.includes(String(provider || '').toLowerCase()) ? String(provider).toLowerCase() : 'google';
    const u = S.users[id];
    if (!u) return;
    // Strict guard: signing in as owner requires server verification with mfaCode
    if (u.role === 'owner' && serverSyncOk && S.currentUser !== 'owner' && !mfaCode) {
      return;
    }
    if (serverSyncOk && u.email) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/auth/sso', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ provider: cleanProv, email: u.email, mfaCode: mfaCode || undefined }));
        if (xhr.status !== 200) return;
      } catch (_) {
        return;
      }
    }
    sessionStorage.setItem('mgcw.uid', id);
    sessionStorage.setItem('mgcw.sso_provider', cleanProv);
    const isOwner = u.role === 'owner' && u.id === 'owner';
    const sessionObj = {
      email: u.email,
      name: u.name,
      org: u.brand === 'FIX' ? 'F.I.X Solutions LLC' : 'Milton Group Concepts LLC',
      role: isOwner ? 'OWNER_ADMIN (SSO VERIFIED)' : 'CUSTOMER_RESTRICTED (SSO)',
      ssoVerified: true,
      ssoProvider: cleanProv,
      access: isOwner ? 'INTERNAL_SUITE_FULL' : 'CUSTOMER_RESTRICTED',
      allowedApps: isOwner ? ['*'] : (u.allowedApps || DEFAULT_CUSTOMER_APPS),
      allowedPortals: getAllowedPortalsForUser(u),
      verifiedAt: now(),
      integrityHash: 'SHA256-' + btoa(u.email + ':' + cleanProv + ':' + u.role + ':MGC-2026').slice(0, 16),
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
    localStorage.setItem('mgc_onboarded_session', JSON.stringify(sessionObj));
    localStorage.removeItem('mgc_edge_gate_locked');
    localStorage.setItem('mgc_sim_tier', isOwner ? 'enterprise' : 'ppv');
  };

  const signOut = () => {
    sessionStorage.removeItem('mgcw.uid');
    sessionStorage.removeItem('mgcw.sso_provider');
    localStorage.removeItem('mgc_onboarded_session');
    localStorage.setItem('mgc_edge_gate_locked', '1');
    if (serverSyncOk) location.href = '/api/auth/logout';
    else location.href = 'login.html';
  };

  const log = (actor, action, detail) => { S.audit.unshift({ id: uid('a'), ts: now(), actor, action, detail }); S.audit = S.audit.slice(0, 200); };
  const notify = (toUid, title, body, channel) => { S.notifications.unshift({ id: uid('n'), toUid, title, body, channel: channel || 'in-app + email', ts: now(), read: false }); };

  /* ---------- Policy: deny by default. Mirrors server.js ---------- */
  function subActive(u) { return u && (u.role === 'owner' || u.status === 'active' || (u.plan && u.plan.base)); }
  function can(u, type, id, action) {
    if (!u) return false;
    if (u.role === 'owner' && u.id === 'owner') return true;       // sole Administrator: everything
    if (!subActive(u)) return false;                              // members need an active account
    if (type === 'page') {
      const entry = CATALOG.find(c => c.id === id);
      if (!entry || action !== 'view') return false;
      if (id === 'saasapps') return true;                         // SaaS Apps & LMS is always unlocked for active users
      if ((S.shares || []).some(s => (s.type === 'page' || s.type === 'element') && s.resource === id && s.grantee === u.id)) return true;
      return (u.pages || {})[id] === 'ready';                     // only ready pages explicitly granted by Administrator
    }
    if (type === 'app') {
      const apps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS;
      if (apps.includes('*') || apps.includes(id)) return true;
      return (S.shares || []).some(s => (s.type === 'app' || s.type === 'element') && s.resource === id && s.grantee === u.id);
    }
    if (type === 'project') {
      const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
      if (!sh) return false;
      return action === 'view' ? true : sh.perms.includes(action);
    }
    if (type === 'element') return S.shares.some(s => (s.type === 'element' || s.type === 'app') && s.resource === id && s.grantee === u.id);
    return false;
  }

  /* ---------- Lifecycle workflow ---------- */
  let lastIntakeResult = null;
  function sanitizeField(val, maxLen) {
    return String(val == null ? '' : val).replace(/[<>]/g, '').replace(/javascript:/gi, '').trim().slice(0, maxLen || 240);
  }
  function submitRequest(data) {
    const cleanEmail = sanitizeField(data && data.email, 160).toLowerCase();
    const cleanName = sanitizeField(data && data.name, 120) || (cleanEmail.split('@')[0] || 'Customer');
    const ssoProvider = sanitizeField(data && (data.ssoProvider || data.provider || 'google'), 32).toLowerCase();
    if (!['google', 'microsoft', 'apple'].includes(ssoProvider)) {
      lastIntakeResult = { ok: false, status: 403, error: 'SSO Policy Enforced: Only Google, Microsoft, or Apple SSO is permitted.' };
      return null;
    }
    if (OWNER_EMAILS.has(cleanEmail)) {
      log('system', 'security.intake_owner_spoof_blocked', cleanEmail);
      commit();
      lastIntakeResult = { ok: false, status: 403, error: 'Security Policy Enforced: Owner accounts cannot be submitted via Customer Intake. Authenticate via Login or Onboarding Portal.' };
      return null;
    }
    if (data && data.ndaAccepted === false) {
      lastIntakeResult = { ok: false, status: 400, error: 'Mutual NDA & Zero-Trust Terms attestation is required for customer intake.' };
      return null;
    }
    const payload = {
      name: cleanName,
      email: cleanEmail,
      ssoProvider,
      org: sanitizeField(data && data.org, 160) || 'External Organization',
      brand: (data && data.brand === 'FIX') ? 'FIX' : 'MGC',
      interest: (data && TAILOR[data.interest]) ? data.interest : 'ai',
      note: sanitizeField(data && data.note, 500),
      ndaAccepted: true,
      mfaVerified: Boolean(data && data.mfaVerified !== false),
      mfaMethod: sanitizeField(data && data.mfaMethod, 48) || 'FEDERATED_SSO_2FA'
    };
    const srv = postServerAction({ action: 'submitRequest', data: payload });
    if (srv && srv.error) {
      lastIntakeResult = { ok: false, status: 403, error: srv.error };
      return null;
    }
    if (srv && srv.uid) {
      lastIntakeResult = srv;
      commit();
      return srv.uid;
    }
    let existing = Object.values(S.users).find(u => (u.email || '').toLowerCase() === cleanEmail);
    const id = existing ? existing.id : uid('u');
    const tailoredPages = (TAILOR[payload.interest] || { pages: [] }).pages;
    const pagesMap = existing && existing.pages ? { ...DEFAULT_CUSTOMER_PAGES, ...existing.pages } : { ...DEFAULT_CUSTOMER_PAGES };
    tailoredPages.forEach(p => { if (!pagesMap[p]) pagesMap[p] = 'locked'; });
    S.users[id] = {
      id,
      name: payload.name,
      email: payload.email,
      org: payload.org,
      role: 'member',
      status: 'active',
      accessTier: 'CUSTOMER_RESTRICTED',
      ssoProvider: payload.ssoProvider,
      ndaAccepted: true,
      ndaTimestamp: now(),
      mfaVerified: payload.mfaVerified,
      mfaMethod: payload.mfaMethod,
      brand: payload.brand,
      quote: { interest: payload.interest, note: payload.note },
      plan: existing && existing.plan ? existing.plan : { base: true, addons: [] },
      pages: pagesMap,
      allowedApps: existing && Array.isArray(existing.allowedApps) && existing.allowedApps.length ? existing.allowedApps : DEFAULT_CUSTOMER_APPS.slice(),
      created: existing && existing.created ? existing.created : now()
    };
    if (!S.shares.some(s => s.type === 'project' && s.resource === 'p_sterling' && s.grantee === id)) {
      S.shares.push({ id: 'project_p_sterling_' + id, type: 'project', resource: 'p_sterling', grantee: id, perms: ['view'], created: now() });
    }
    let reqEntry = S.requests.find(r => r.uid === id);
    if (!reqEntry) {
      reqEntry = { id: uid('r'), uid: id, interest: payload.interest, brand: payload.brand, ssoProvider: payload.ssoProvider, ndaAccepted: true, mfaMethod: payload.mfaMethod, status: 'requested', created: now() };
      S.requests.unshift(reqEntry);
    }
    notify(id, 'Default Restricted Access Active', 'Welcome! Your default restricted customer workspace is active. Specialized pages and SCORM apps are under Owner review.');
    notify('owner', 'New access request', payload.name + ' requested access (' + (TAILOR[payload.interest] || {}).label + ').', 'in-app + email + push');
    log(id, 'request.created', payload.email + ' (' + payload.ssoProvider + ', MFA:' + payload.mfaMethod + ')');
    lastIntakeResult = {
      ok: true,
      uid: id,
      requestId: reqEntry.id,
      intakeReceipt: 'MGC-INTAKE-' + reqEntry.id.toUpperCase(),
      role: 'member',
      accessTier: 'CUSTOMER_RESTRICTED',
      ssoProvider: payload.ssoProvider,
      ndaAccepted: true,
      mfaVerified: payload.mfaVerified,
      mfaMethod: payload.mfaMethod,
      allowedApps: S.users[id].allowedApps,
      queuedTailoredPages: tailoredPages,
      integrityHash: 'SHA256-' + btoa(payload.email + ':' + payload.ssoProvider + ':CUSTOMER_RESTRICTED:' + reqEntry.id).slice(0, 24)
    };
    commit();
    return id;
  }
  function requestAppAccess(appId) {
    const u = me();
    if (!u) return false;
    const appEntry = APPS_CATALOG.find(a => a.id === appId);
    if (!appEntry) return false;
    if (postServerAction({ action: 'requestAppAccess', appId })) { commit(); return true; }
    S.features.unshift({ id: uid('f'), by: u.id, title: 'App Access Request: ' + appEntry.title, body: u.name + ' (' + u.email + ') requested access to restricted SCORM app "' + appEntry.title + '".', votes: [u.id], status: 'new', created: now() });
    notify('owner', 'Restricted App Unlock Requested', u.name + ' requested access to ' + appEntry.title);
    notify(u.id, 'App Unlock Request Sent', 'Your request to unlock "' + appEntry.title + '" has been sent to the Owner.');
    log(u.id, 'app.request_unlock', appId);
    commit();
    return true;
  }
  function approve(userId) {
    if (postServerAction({ action: 'approve', userId })) { commit(); return; }
    const u = S.users[userId]; if (!u) return;
    u.status = 'approved_building';
    u.allowedApps = Array.isArray(u.allowedApps) && u.allowedApps.length ? u.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
    const wanted = ['home', 'agile', 'resources'].concat((TAILOR[u.quote.interest] || { pages: [] }).pages);
    wanted.forEach(p => { u.pages[p] = 'pending'; S.tasks.push({ id: uid('t'), uid: userId, page: p, title: 'Build "' + CATALOG.find(c => c.id === p).title + '" for ' + u.name, done: false }); });
    const r = S.requests.find(x => x.uid === userId); if (r) r.status = 'approved';
    log('owner', 'request.approved', u.email);
    commit();
  }
  function deny(userId) {
    if (postServerAction({ action: 'deny', userId })) { commit(); return; }
    const u = S.users[userId]; if (!u) return; u.status = 'denied'; const r = S.requests.find(x => x.uid === userId); if (r) r.status = 'denied'; notify(userId, 'Request update', 'We are unable to approve this request right now.'); log('owner', 'request.denied', u.email); commit();
  }
  function completeTask(taskId, done) {
    if (postServerAction({ action: 'completeTask', taskId, done })) { commit(); return; }
    const t = S.tasks.find(x => x.id === taskId); if (!t) return;
    t.done = done; const u = S.users[t.uid]; u.pages[t.page] = done ? 'ready' : 'pending';
    const open = S.tasks.filter(x => x.uid === t.uid && !x.done).length;
    if (done && open === 0 && u.status === 'approved_building') {
      u.status = 'active';
      notify(u.id, 'Access approved — your pages are ready', 'Sign in to open your tailored workspace. Start with your action items.', 'in-app + email + push');
      log('owner', 'pages.ready', u.email);
    }
    commit();
  }
  function subscribeBase(userId) {
    if (postServerAction({ action: 'subscribeBase', userId })) { commit(); return; }
    const u = S.users[userId]; u.plan.base = true; log(userId, 'billing.base_active', '$5/mo (prototype: no real charge)'); commit();
  }
  function toggleAddon(userId, pageId) {
    if (postServerAction({ action: 'toggleAddon', userId, pageId })) { commit(); return; }
    const u = S.users[userId]; const a = u.plan.addons = u.plan.addons || [];
    const i = a.indexOf(pageId); if (i >= 0) a.splice(i, 1); else { a.push(pageId); if (u.pages[pageId] !== 'ready') { u.pages[pageId] = 'pending'; S.tasks.push({ id: uid('t'), uid: userId, page: pageId, title: 'Build add-on "' + CATALOG.find(c => c.id === pageId).title + '" for ' + u.name, done: false }); notify('owner', 'Add-on requested', u.name + ' subscribed to ' + pageId); } }
    log(userId, 'billing.addon', pageId); commit();
  }
  function toggleUserFeature(userId, featureType, featureId, enabled) {
    const res = postServerAction({ action: 'toggleUserFeature', userId, featureType, featureId, enabled });
    if (res) { commit(); return res; }
    const target = S.users[userId];
    if (!target || target.id === 'owner') return null;
    if (!target.pages) target.pages = { ...DEFAULT_CUSTOMER_PAGES };
    if (!Array.isArray(target.allowedApps)) target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
    if (featureType === 'preset') {
      if (featureId === 'reset_saas_only') {
        target.pages = { saasapps: 'ready' };
        target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
      } else if (featureId === 'grant_all_features') {
        CATALOG.forEach(c => { target.pages[c.id] = 'ready'; });
        target.allowedApps = APPS_CATALOG.map(a => a.id);
      }
      commit();
      return { ok: true, targetUser: target };
    }
    if (featureType === 'app') {
      const has = target.allowedApps.includes(featureId);
      const next = typeof enabled === 'boolean' ? enabled : !has;
      if (next && !has) target.allowedApps.push(featureId);
      if (!next && has) target.allowedApps = target.allowedApps.filter(a => a !== featureId);
      commit();
      return { ok: true, targetUser: target };
    }
    const isReady = target.pages[featureId] === 'ready';
    const next = typeof enabled === 'boolean' ? enabled : !isReady;
    if (next) target.pages[featureId] = 'ready';
    else if (featureId !== 'saasapps') delete target.pages[featureId];
    commit();
    return { ok: true, targetUser: target };
  }
  function submitPayment(payload) {
    const res = postServerAction({ action: 'submitPayment', data: payload });
    if (res) { commit(); return res; }
    return { ok: false, error: 'Unable to reach payment verification server.' };
  }
  function share(grantee, type, resource, perms) {
    if (postServerAction({ action: 'share', grantee, type, resource, perms })) { commit(); return; }
    S.shares = S.shares.filter(s => !(s.type === type && s.resource === resource && s.grantee === grantee));
    S.shares.push({ id: type + '_' + resource + '_' + grantee, type, resource, grantee, perms, created: now() });
    if (type === 'app' && S.users[grantee]) {
      S.users[grantee].allowedApps = Array.isArray(S.users[grantee].allowedApps) ? S.users[grantee].allowedApps : DEFAULT_CUSTOMER_APPS.slice();
      if (!S.users[grantee].allowedApps.includes(resource)) S.users[grantee].allowedApps.push(resource);
    }
    if (type === 'page' && S.users[grantee]) {
      if (!S.users[grantee].pages) S.users[grantee].pages = { ...DEFAULT_CUSTOMER_PAGES };
      S.users[grantee].pages[resource] = 'ready';
    }
    notify(grantee, 'New Access Granted by Owner', type + ': ' + resource + ' (' + perms.join(', ') + ')');
    log('owner', 'share.grant', type + ':' + resource + ' -> ' + grantee); commit();
  }
  function revoke(id) {
    if (postServerAction({ action: 'revoke', shareId: id })) { commit(); return; }
    const s = S.shares.find(x => x.id === id);
    if (s && s.type === 'app' && S.users[s.grantee] && Array.isArray(S.users[s.grantee].allowedApps)) {
      S.users[s.grantee].allowedApps = S.users[s.grantee].allowedApps.filter(a => a !== s.resource);
    }
    if (s && s.type === 'page' && S.users[s.grantee] && S.users[s.grantee].pages && s.resource !== 'saasapps') {
      delete S.users[s.grantee].pages[s.resource];
    }
    S.shares = S.shares.filter(x => x.id !== id); if (s) log('owner', 'share.revoke', id); commit();
  }

  /* ---------- SaaS Apps Standard Theme Shell + Thematic Cityscape Background ---------- */
  const CSS = `
  :root{--r:18px;--bg-deep:#040814;--border-subtle:rgba(148,163,184,0.28);--border-gold:rgba(197,179,88,0.52);--gold:#c5b358;--blue:#3b82f6;--emerald:#10b981}
  body.w-mgc{--bg:#040814;--card:rgba(9,16,32,0.96);--card2:rgba(12,21,42,0.95);--line:rgba(148,163,184,0.34);--tx:#F8FAFC;--mut:#CBD5E1;--ac:#3B82F6;--acx:#FFFFFF;--ok:#10B981;
    background:radial-gradient(circle at 12% 15%,rgba(37,99,235,0.22),transparent 42%),radial-gradient(circle at 88% 12%,rgba(148,163,184,0.14),transparent 38%),radial-gradient(circle at 50% 85%,rgba(197,179,88,0.12),transparent 45%),#040814}
  body.w-fix{--bg:#040814;--card:rgba(9,16,32,0.96);--card2:rgba(12,21,42,0.95);--line:rgba(197,179,88,0.46);--tx:#F8FAFC;--mut:#CBD5E1;--ac:#C5B358;--acx:#040814;--ok:#10B981;
    background:radial-gradient(circle at 12% 15%,rgba(37,99,235,0.22),transparent 42%),radial-gradient(circle at 88% 12%,rgba(220,38,38,0.16),transparent 38%),radial-gradient(circle at 50% 85%,rgba(197,179,88,0.16),transparent 45%),#040814}
  body.w-mgc::before,body.w-fix::before{content:'';position:fixed;inset:0;z-index:-10;pointer-events:none}
  body.w-mgc::before{background:linear-gradient(180deg,rgba(4,8,20,0.72) 0%,rgba(11,19,37,0.85) 55%,rgba(4,8,20,0.95) 100%),url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23E4E4E7' stroke-width='3'/><path d='M26 76V42l24 22 24-22v34' fill='none' stroke='%23A1A1AA' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat 96% 94%/min(22vw,280px),linear-gradient(rgba(148,163,184,.035) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(148,163,184,.035) 1px,transparent 1px) 0 0/44px 44px,url("https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=2500") center 38%/cover no-repeat;opacity:.82}
  body.w-fix::before{background:linear-gradient(180deg,rgba(4,8,20,0.70) 0%,rgba(11,20,38,0.85) 55%,rgba(4,8,20,0.95) 100%),url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23C5B358' stroke-width='3'/><path d='M30 38h40M30 58h28M30 78h34' stroke='%23FDE047' stroke-width='5' stroke-linecap='round'/></svg>") no-repeat 96% 94%/min(22vw,280px),linear-gradient(rgba(197,179,88,.04) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(197,179,88,.04) 1px,transparent 1px) 0 0/44px 44px,url("https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=2500") center 38%/cover no-repeat;opacity:.82}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--tx);min-height:100vh;position:relative;isolation:isolate}
  a{color:inherit}
  .wrap{max-width:1360px;margin:0 auto;padding:18px 22px 95px;position:relative;z-index:5}
  .bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(9,16,32,0.97),rgba(17,28,53,0.96));border:1.5px solid var(--border-gold);border-radius:var(--r);padding:14px 20px;margin-bottom:20px;position:sticky;top:8px;z-index:30;backdrop-filter:blur(18px);box-shadow:0 16px 44px rgba(0,0,0,0.65)}
  .brand{display:flex;gap:12px;align-items:center;font-weight:900;letter-spacing:.02em}
  .brand small{display:block;font-size:10.5px;color:var(--mut);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .btn,select,input,textarea{font:inherit;font-size:12.5px;border-radius:10px;border:1.5px solid var(--line);background:#060b17;color:var(--tx);padding:9px 13px;transition:all .18s}
  .btn{cursor:pointer;font-weight:800;text-decoration:none;display:inline-flex;gap:6px;align-items:center;background:rgba(15,23,42,0.96)}
  .btn.pri{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#60a5fa;box-shadow:0 6px 18px rgba(37,99,235,0.3)}
  body.w-fix .btn.pri{background:linear-gradient(135deg,#c5b358,#a38f36);color:#091024;border-color:#fde047}
  .btn:hover{border-color:#60a5fa;transform:translateY(-1px)}.btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}
  .chip{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;border:1.5px solid var(--line);background:rgba(4,8,20,0.92);color:var(--mut)}
  .chip.ok{color:#34d399;background:rgba(16,185,129,0.2);border-color:rgba(16,185,129,0.52)}.chip.warn{color:#fbbf24;background:rgba(197,179,88,0.2);border-color:rgba(197,179,88,0.52)}
  .card{background:var(--card);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1.5px solid var(--line);border-radius:var(--r);padding:22px;box-shadow:0 18px 45px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.05);transition:border-color .2s;position:relative;z-index:5}
  .card:hover{border-color:rgba(59,130,246,0.52)}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
  h1{font-size:24px;font-weight:900;letter-spacing:-.02em;margin:0 0 6px;color:#fff}h2{font-size:16px;font-weight:800;margin:0 0 8px;color:#fff}p{color:var(--mut);font-size:13px;line-height:1.55;margin:4px 0}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  details{border:1.5px solid var(--line);border-radius:12px;padding:10px 14px;margin-top:8px;background:rgba(6,11,23,0.92)}summary{cursor:pointer;font-weight:800;font-size:12px}
  .skel{position:relative;overflow:hidden}.skel::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);animation:sh 1.6s infinite}
  @keyframes sh{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
  .steps{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.step{flex:1;min-width:130px;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;font-size:11.5px;font-weight:800;color:var(--mut);background:rgba(9,16,32,0.95)}
  .step.on{color:#fff;background:linear-gradient(135deg,#2563eb,#1d4ed8);border-color:#60a5fa}.step.done{color:#34d399;border-color:rgba(16,185,129,0.52)}
  table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.09em}
  .demo{font-size:10px;color:#34d399;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.14);border-radius:999px;padding:4px 10px;font-weight:800}
  .lock{text-align:center;padding:44px 20px}
  .toast{position:fixed;right:18px;bottom:18px;background:linear-gradient(135deg,#10b981,#059669);color:#022c22;padding:10px 16px;border-radius:12px;font-weight:900;font-size:12px;z-index:99}
  @view-transition{navigation:auto}
  ::view-transition-old(root){animation:mgcFadeOut .22s cubic-bezier(.4,0,.2,1) both}
  ::view-transition-new(root){animation:mgcFadeIn .28s cubic-bezier(.16,1,.3,1) both}
  @keyframes mgcFadeOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-6px)}}
  @keyframes mgcFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  body{animation:mgcFadeIn .28s cubic-bezier(.16,1,.3,1)}
  body.mgc-page-leave{opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease}
  :focus-visible{outline:2.5px solid #60a5fa;outline-offset:2px}
  .skip-link{position:fixed;top:-100px;left:16px;z-index:9999;background:#3b82f6;color:#fff;padding:10px 16px;border-radius:10px;font-weight:800;text-decoration:none;transition:top .2s}
  .skip-link:focus{top:12px}
  #mgc-scorm-floating-dock{display:none!important}
  .ws-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;align-items:start}
  .ws-side{background:rgba(9,16,32,0.95);border:1.5px solid var(--line);border-radius:var(--r);padding:16px;position:sticky;top:86px;display:flex;flex-direction:column;gap:6px}
  .ws-side-title{font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);padding:4px 8px 6px}
  .ws-nav-btn{width:100%;text-align:left;background:transparent;border:1px solid transparent;color:var(--mut);padding:10px 12px;border-radius:11px;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:all .16s}
  .ws-nav-btn:hover{background:rgba(59,130,246,0.12);color:#fff}
  .ws-nav-btn.active{background:linear-gradient(135deg,rgba(37,99,235,0.28),rgba(15,23,42,0.95));border-color:rgba(96,165,250,0.48);color:#fff;font-weight:800}
  body.w-fix .ws-nav-btn.active{background:linear-gradient(135deg,rgba(197,179,88,0.26),rgba(15,23,42,0.95));border-color:rgba(197,179,88,0.55);color:#fde047}
  .ws-main{min-width:0;display:flex;flex-direction:column;gap:16px}
  .kpi-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px}
  .kpi-tile{background:rgba(9,16,32,0.92);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
  .kpi-tile small{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--mut)}
  .kpi-tile strong{font-size:20px;font-weight:900;color:#fff}
  .bento-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .bento-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .compact-card{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;transition:border-color .18s,transform .18s}
  .compact-card:hover{border-color:rgba(96,165,250,0.5);transform:translateY(-1px)}
  .compact-card h3{font-size:14.5px;font-weight:800;margin:0;color:#fff;display:flex;align-items:center;gap:8px}
  .compact-card p{font-size:12.5px;color:var(--mut);margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  @media(max-width:960px){.ws-layout{grid-template-columns:1fr}.ws-side{position:static;flex-direction:row;flex-wrap:wrap}.ws-nav-btn{width:auto;flex:1 1 auto}.bento-2,.bento-3{grid-template-columns:1fr}}
  @media(pointer:coarse){.btn,select,input,textarea{min-height:48px;font-size:16px}}
  @media(prefers-reduced-motion:reduce){*,::before,::after,::view-transition-old(root),::view-transition-new(root){animation-duration:.01ms!important;transition-duration:.01ms!important}}
  @media(max-width:640px){.wrap{padding:12px 12px 90px}.bar{position:static}}`;

  const CLEAN_URL_MAP = {
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
    'compliance-trust-center.html': '/trust-center',
    'newsletter.html': '/newsletter',
    'mobile-control.html': '/mobile'
  };

  function isMobileClientDevice() {
    try {
      const qs = new URLSearchParams(location.search);
      if (qs.get('desktop') === '1') return false;
      if (qs.get('mobile') === '1') return true;
      const ua = navigator.userAgent || '';
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS/i.test(ua)) return true;
      if (window.innerWidth > 0 && window.innerWidth < 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) return true;
    } catch (_) {}
    return false;
  }

  function maskExposedUrl() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    try {
      const pathLower = location.pathname.toLowerCase();
      const file = (pathLower.split('/').pop() || '').toLowerCase();
      if (isMobileClientDevice() && !pathLower.includes('mobile') && !pathLower.includes('auth') && !pathLower.includes('login') && !pathLower.includes('/projects/')) {
        location.replace('/mobile' + (location.hash || ''));
        return;
      }
      const clean = CLEAN_URL_MAP[file];
      if (clean && (location.pathname !== clean || location.search.includes('next='))) {
        history.replaceState(null, '', clean + (location.hash || ''));
      }
    } catch (_) {}
  }

  function wireSmoothTransitions() {
    if (document.body && !document.querySelector('.skip-link')) {
      const skip = document.createElement('a');
      skip.href = '#main-content';
      skip.className = 'skip-link';
      skip.textContent = 'Skip to main content';
      document.body.prepend(skip);
      const wrap = document.querySelector('.wrap') || document.querySelector('main');
      if (wrap && !wrap.id) wrap.id = 'main-content';
    }
    document.addEventListener('mouseover', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.dataset.prefetched) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/') || href.endsWith('.html')) {
        a.dataset.prefetched = '1';
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
      }
    }, { passive: true });
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.target || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const dest = new URL(href, location.href);
        if (dest.origin !== location.origin) return;
        if (dest.pathname === location.pathname && dest.search === location.search && dest.hash) return;
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          e.preventDefault();
          document.body.classList.add('mgc-page-leave');
          setTimeout(() => { location.href = dest.href; }, 150);
        }
      } catch (_) {}
    });
  }

  function injectCss() { maskExposedUrl(); if (!document.getElementById('w-css')) { const s = document.createElement('style'); s.id = 'w-css'; s.textContent = CSS; document.head.appendChild(s); } if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireSmoothTransitions, { once: true }); else wireSmoothTransitions(); }
  function theme(brand) { document.body.classList.remove('w-mgc', 'w-fix'); document.body.classList.add(brand === 'FIX' ? 'w-fix' : 'w-mgc'); }
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
  function unread(uidv) { return S.notifications.filter(n => n.toUid === uidv && !n.read).length; }

  /**
   * Renders the top bar with strict role scoping:
   * - Non-admin users ONLY see "⚡ SaaS Apps & LMS", "💳 Submit Payment & Billing", and any feature explicitly granted by the Administrator.
   * - Zero client-side account-switching dropdowns (#w-as) so users can never switch into or leak the Administrator account.
   */
  function header(active) {
    injectCss();
    const u = me();
    const isOwner = Boolean(u && u.role === 'owner' && u.id === 'owner');
    theme(u ? u.brand : 'MGC');

    let links = [];
    if (isOwner) {
      links = [
        ['access-admin.html', '👑 Access Admin · Grant Features'],
        ['saas-apps-and-lms-showcase.html', '⚡ SaaS Apps & LMS'],
        ['member-portal.html', 'Workspace & Billing'],
        ['agile-board.html', 'Agile Board'],
        ['admin-command-portal.html', '16 Portals Hub'],
        ['newsletter.html', '📰 Newsletter']
      ];
    } else {
      // Standard / New User: strictly SaaS Apps & LMS + Submit Payment & Billing, plus ONLY Admin-granted features
      links = [
        ['saas-apps-and-lms-showcase.html', '⚡ SaaS Apps & LMS'],
        ['member-portal.html?view=payment', '💳 Submit Payment & Billing']
      ];
      if (u) {
        CATALOG.forEach(c => {
          if (c.id !== 'saasapps' && can(u, 'page', c.id, 'view')) {
            links.push([c.href, c.icon + ' ' + c.title]);
          }
        });
      }
    }

    const nav = '<div class="nav">' + links.map(l => {
      const baseHref = l[0].split('?')[0].split('#')[0];
      const isAct = l[0] === active || baseHref === active;
      return '<a class="btn' + (isAct ? ' pri' : '') + '" href="' + l[0] + '">' + l[1] + '</a>';
    }).join('') + '</div>';

    const authBtn = u
      ? '<button class="btn" id="w-signout">🔒 Sign out</button>'
      : '<a class="btn pri" href="login.html">Sign in →</a>';
    const paymentVerified = Boolean(u && u.paymentProfile && u.paymentProfile.verified);
    const tierChip = u
      ? (isOwner
          ? '<span class="chip ok">👑 SOLE ADMINISTRATOR (MALIK A. KHABIR)</span>'
          : '<span class="chip ' + (paymentVerified ? 'ok' : 'warn') + '">' + (paymentVerified ? '✅ PAYMENT VERIFIED · SAAS & LMS' : '🛡️ SAAS APPS & LMS ACCESS') + '</span>')
      : '';
    const right = '<div class="nav">' + tierChip + authBtn + '</div>';
    const el = document.createElement('div');
    el.className = 'bar';
    el.innerHTML = '<div class="brand"><span style="font-size:22px">' + (u && u.brand === 'FIX' ? '⚡' : '🛡️') + '</span><div>' + (u && u.brand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE') + '<small>' + (u ? esc(u.name) + ' · ' + esc(isOwner ? 'Sole Administrator' : 'SaaS Apps & LMS + Secure Billing') : 'Authentication Enforced · Signed Out') + '</small></div></div>' + nav + right;
    const host = document.querySelector('.wrap');
    if (host) host.prepend(el);
    const soEl = el.querySelector('#w-signout');
    if (soEl) soEl.onclick = () => signOut();
  }

  global.MGCW = { CATALOG, APPS_CATALOG, DEFAULT_CUSTOMER_APPS, DEFAULT_CUSTOMER_PAGES, TAILOR, STEPS, STATUS_LABEL, get S() { return S; }, get lastIntakeResult() { return lastIntakeResult; }, costGuard, commit, me, signInAs, signOut, provisionCustomerSso, requestAppAccess, toggleUserFeature, submitPayment, can, notify, log, submitRequest, approve, deny, completeTask, subscribeBase, toggleAddon, share, revoke, header, theme, toast, esc, uid, now, injectCss, subActive, postServerAction, getAllowedPortalsForUser, mgcDigest, isValidAdminSecret, resolveCaseInsensitiveIdentifier };
})(window);
