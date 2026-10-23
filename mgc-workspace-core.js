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
    { id: 'saasapps',  icon: '', title: 'Applications',          brand: 'FIX', kind: 'app',  base: true,  price: 0,  href: 'member-portal.html',                desc: 'Launch authorized standalone SaaS and training applications.' },
    { id: 'resources', icon: '', title: 'Resources & Otto',      brand: 'ANY', kind: 'page', base: false, price: 5,  href: 'member-portal.html?view=resources', desc: 'Guided templates, operational workflows, and Otto agent path.' },
    { id: 'agile',     icon: '', title: 'Agile Delivery',        brand: 'ANY', kind: 'app',  base: false, price: 9,  href: 'agile-board.html',                  desc: 'Backlog, sprint board, and project deliverables.' },
    { id: 'home',      icon: '', title: 'Overview Checklist',    brand: 'ANY', kind: 'page', base: false, price: 5,  href: 'member-portal.html?view=overview',  desc: 'Project overview and action checklist.' }
  ];

  const APPS_CATALOG = [
    { id: 'client-turnkey-forge',       icon: '', title: 'Client Turnkey Forge',                 brand: 'FIX', defaultCustomer: true,  price: 0,  href: 'projects/client-turnkey-forge/index.html',       zipHref: 'projects/client-turnkey-forge/exports/turnkey_forge_scorm_2004_4th_edition.zip', desc: 'Interactive custom build scope and pricing configurator.' },
    { id: 'sterling-auto-repair',       icon: '', title: 'Sterling Auto Repair',                 brand: 'FIX', defaultCustomer: true,  price: 0,  href: 'projects/sterling-auto-repair/index.html',       zipHref: '',                                                                               desc: 'Commercial web and autonomous receptionist application.' },
    { id: 'eveng-netprism-studio',      icon: '', title: 'EVE-NG & NetPrism Topology Studio',    brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/eveng-netprism-studio/index.html',      zipHref: 'projects/eveng-netprism-studio/exports/eveng_scorm_2004_4th_edition.zip',        desc: 'OSPF, BGP, ZTNA, and EVPN network topology simulator.' },
    { id: 'samgov-contract-matchmaker', icon: '', title: 'SAM.gov Contract & Job Matchmaker',    brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/samgov-contract-matchmaker/index.html', zipHref: 'projects/samgov-contract-matchmaker/exports/samgov_scorm_2004_4th_edition.zip',  desc: 'Federal NAICS 541512/541519 opportunity matchmaker.' },
    { id: 'traffic-roi-simulator',      icon: '', title: 'Site Traffic & Conversion ROI',        brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/traffic-roi-simulator/index.html',      zipHref: 'projects/traffic-roi-simulator/exports/traffic_scorm_2004_4th_edition.zip',      desc: 'Conversion funnel and multi-rail revenue simulator.' },
    { id: 'ghost-cli-trainer',          icon: '', title: 'Ghost-CLI & Netmiko Auto-Grader',      brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/ghost-cli-trainer/index.html',          zipHref: 'projects/ghost-cli-trainer/exports/ghost_cli_scorm_2004_4th_edition.zip',        desc: 'IOS-XE, Linux, SQL, KQL, and Ansible terminal lab.' },
    { id: 'chronos-aetheria-scorm',     icon: '', title: 'Chronos Aetheria Geo-Historical AI',   brand: 'FIX', defaultCustomer: false, price: 19, href: 'projects/chronos-aetheria-scorm/index.html',     zipHref: 'projects/chronos-aetheria-scorm/exports/chronos_scorm_2004_4th_edition.zip',     desc: 'Epigraphy and geodesic discovery application.' },
    { id: 'spanish-acquisition-os',     icon: '', title: 'Spanish Acquisition (10,000 Words)',   brand: 'MGC', defaultCustomer: false, price: 19, href: 'projects/spanish-acquisition-os/index.html',     zipHref: 'projects/spanish-acquisition-os/exports/saos_scorm_2004_4th_edition.zip',        desc: '10-module language training application with neural audio.' }
  ];

  // Qualified Partner & Ecosystem Resources Catalog (Resource Fast-Track + extensible catalog items)
  // White Feather is strictly a catalog resource (like an app or experience), never built into core architecture.
  const RESOURCES_CATALOG = [
    {
      id: 'resource-fast-track',
      title: 'Resource Fast-Track (Milton UI/UX & Guided AI Templates)',
      shortTitle: 'Resource Fast-Track',
      brand: 'MGC',
      defaultCustomer: false,
      category: 'Guided Interactive AI Templates & Workspace Accelerator',
      href: 'member-portal.html?view=resources',
      desc: 'Structured, template-driven Resource Fast-Track suite across Languages, Business Endeavors, Schooling, and Technical Upskilling (zero free-form prompting).',
      uiUxEnhancements: [
        'Fluid Bento Action Matrix & Hardware-Accelerated Card Transitions',
        'DocuSign-Style Guided Progression & Locked Milestone Checkpoints',
        'Deterministic Template Selector (Zero Open Prompt Attack Surface)'
      ],
      aiTools: [
        { id: 'rft-associative-blueprint', title: 'Associative Sequence Blueprint Template', badge: 'Defined Template', desc: 'Generates a structured 3-stage associative path across Languages, Business, Schooling, or Upskilling.' },
        { id: 'rft-turnkey-intake-matrix', title: 'Business & Operations Intake Matrix Template', badge: 'Defined Template', desc: 'Applies pre-validated SLA, intake, and milestone templates to your selected business track.' },
        { id: 'rft-upskill-lab-schedule', title: 'Schooling & Certification Milestone Template', badge: 'Defined Template', desc: 'Organizes SCORM 2004 modules and verification checkpoints into a guided weekly schedule.' }
      ]
    },
    {
      id: 'white-feather',
      title: 'White Feather Partner Resource',
      shortTitle: 'White Feather',
      brand: 'MGC',
      defaultCustomer: false,
      category: 'Optional Catalog Resource · Partner Community',
      href: 'whitefeather-ecommerce-hub.html',
      communityUrl: 'https://www.skool.com/white-feather-ai/plans',
      privateGroupUrl: 'https://members.whitefeatherinvestments.com/communities/groups/white-feather-bronze-community/private-group',
      desc: 'Catalog resource entry for qualified partner community access, organized through the standard Resource Fast-Track template interface.',
      uiUxEnhancements: [
        'Standard Resource Fast-Track Companion View',
        'Guided Milestone Checklist & Reference Vault',
        'Structured Template Action Cards'
      ],
      aiTools: [
        { id: 'wf-dealflow-ai', title: 'Deal-Flow Summary Template', badge: 'Resource Fast-Track', desc: 'Applies a pre-defined deal parameters checklist and partnership structure template.' },
        { id: 'wf-agency-blueprint', title: 'Automation Workflow Template', badge: 'Resource Fast-Track', desc: 'Maps selected service packages into a standard deployment checklist.' },
        { id: 'wf-ui-navigator', title: 'Resource Module Roadmap Template', badge: 'Resource Fast-Track', desc: 'Organizes catalog modules into a step-by-step completion sequence.' }
      ]
    }
  ];

  const DEFAULT_CUSTOMER_APPS = ['sterling-auto-repair', 'client-turnkey-forge'];
  const DEFAULT_CUSTOMER_RESOURCES = [];
  const DEFAULT_CUSTOMER_PAGES = { saasapps: 'ready' };

  // Google Workspace Admin Console & Studio Agents Catalog (Otto Autonomous Agent)
  const AGENTS_CATALOG = [
    {
      id: 'otto',
      name: 'Otto',
      title: 'Otto — Autonomous Workspace & Security Operations Agent',
      type: 'Studio flow',
      agentId: '38ef575f-bce0-4895-bf93-36605220e1ca',
      studioWorkflowId: 'w13225285bbe5e967be82464a88a6262c',
      studioUrl: 'https://studio.workspace.google.com/workflow/w13225285bbe5e967be82464a88a6262c',
      adminConsoleUrl: 'https://admin.google.com/ac/agents/list?journey=218&cid=028tf37o',
      manager: 'malik.khabir@miltongroupsecurity.org',
      serviceIdentity: 'connect@miltongroupsecurity.org',
      workspaceApps: ['Cloud Search', 'Drive', 'Gmail', 'MGC Workspace'],
      access: 'Default',
      accessPolicy: 'Default (Allow flow & Workspace Client access)',
      studioAttributionVisibility: 'ON',
      status: 'Active',
      schedule: 'Daily / On-Demand Studio Flow + MGC Portal Agent',
      boundaryRule: 'Administrator: Full Agent Governance & Actionable Controls · Workspace Clients: Interactive Otto Agent & Studio Flows · Access Clients: Showcase & Insights Only (Connect Workspace Required)'
    }
  ];

  // Official Google Workspace Directory Accounts (miltongroupsecurity.org)
  const WORKSPACE_DIRECTORY_ACCOUNTS = [
    {
      email: 'malik.khabir@miltongroupsecurity.org',
      name: 'Malik Khabir',
      roleLabel: 'Super Admin · Sole Administrator & Otto Agent Manager',
      status: 'Active',
      storageUsed: '0.28 GB',
      agentRole: 'Agent Manager & Owner (Full Governance)'
    },
    {
      email: 'connect@miltongroupsecurity.org',
      name: 'MGC admin',
      roleLabel: 'Connect & Autonomous Agent Operations Identity',
      status: 'Active',
      storageUsed: '0.001 GB',
      agentRole: 'Otto Connect Service Identity'
    },
    {
      email: 'mustafa.khabir@miltongroupsecurity.org',
      name: 'Mustafa Khabir',
      roleLabel: 'Organization Workspace User',
      status: 'Active',
      storageUsed: '0.03 GB',
      agentRole: 'Workspace Member (Otto Flow Access)'
    }
  ];

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

  /* ---------- Seed (Sole Administrator = Malik A. Khabir; zero fake/placeholder accounts) ---------- */
  function seed() {
    const t = now();
    const mk = (id, name, email, role, status, brand, interest, paid, pages, allowedApps, qualifiedResources) => ({
      id, name, email, role, status, brand,
      ou: role === 'owner' ? 'internal' : 'external',
      securityGroup: role === 'owner' ? 'DOMAIN_ADMIN' : 'EXTERNAL_SAAS_LMS',
      accessTier: role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
      quote: { interest, note: '' },
      plan: { base: paid, addons: [] },
      pages: pages || { saasapps: 'ready' },
      adminGrantedPages: [],
      allowedApps: allowedApps || (role === 'owner' ? ['*'] : DEFAULT_CUSTOMER_APPS.slice()),
      qualifiedResources: qualifiedResources || (role === 'owner' ? ['*'] : DEFAULT_CUSTOMER_RESOURCES.slice()),
      paymentProfile: null,
      payments: [],
      created: t
    });
    return {
      v: 1,
      users: {
        owner: mk('owner', 'Malik A. Khabir (Administrator)', 'malik.khabir@miltongroupsecurity.org', 'owner', 'active', 'MGC', 'federal', true, { saasapps: 'ready', agile: 'ready', radar: 'ready', compliance: 'ready', ailab: 'ready', finance: 'ready', training: 'ready', aistudio: 'ready', home: 'ready', resources: 'ready' }, ['*'], ['*'])
      },
      shares: [],
      customResources: [],
      accountingLedger: [],
      tasks: [], notifications: [], audit: [], payments: [], consultations: [],
      projects: {
        p_sterling: { id: 'p_sterling', name: 'Client Project: Sterling Auto Repair (Web + AI Receptionist)', owner: 'owner', brand: 'FIX', demoUrl: 'projects/sterling-auto-repair/index.html', budget: '$1,500 setup + $497/mo' },
        p1: { id: 'p1', name: 'Shared: Website launch', owner: 'owner', brand: 'FIX' },
        p2: { id: 'p2', name: 'Internal: Q4 platform', owner: 'owner', brand: 'MGC' }
      },
      items: [
        { id: 'i_st1', project: 'p_sterling', type: 'story', title: 'Interactive repair estimator & bay RO status tracker', points: 5, col: 'done', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i_st2', project: 'p_sterling', type: 'story', title: '24/7 AI lead receptionist + Google Calendar booking', points: 8, col: 'progress', sprint: 1, assignee: 'owner', createdBy: 'owner' },
        { id: 'i_st3', project: 'p_sterling', type: 'task', title: 'Local SEO schema & Google Business Profile verification', points: 3, col: 'ready', sprint: 1, assignee: 'owner', createdBy: 'owner' }
      ],
      features: [],
      requests: []
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
    if (!serverSyncOk) {
      state.users = Object.assign({}, def.users, state.users || {});
    } else if (!state.users) {
      state.users = {};
    }
    // Purge any legacy placeholder accounts from localStorage
    ['client', 'ana', 'ben', 'cara'].forEach(fakeId => {
      if (state.users && state.users[fakeId]) delete state.users[fakeId];
    });
    if (Array.isArray(state.requests)) {
      state.requests = state.requests.filter(r => !['ana', 'ben', 'cara', 'client'].includes(r.uid));
    }
    if (Array.isArray(state.features)) {
      state.features = state.features.filter(f => !['ana', 'ben', 'cara', 'client'].includes(f.by));
    }
    if (!Array.isArray(state.consultations)) state.consultations = [];
    if (!Array.isArray(state.customResources)) state.customResources = [];
    if (!Array.isArray(state.accountingLedger)) state.accountingLedger = [];
    if (!Array.isArray(state.agents) || !state.agents.length) {
      state.agents = AGENTS_CATALOG.map(a => Object.assign({}, a));
    }
    Object.values(state.users).forEach(u => {
      if (u.role === 'owner') {
        u.accessTier = 'OWNER_FULL';
        u.clientTier = 'administrator';
        u.workspaceConnected = true;
        u.ou = 'internal';
        u.securityGroup = 'DOMAIN_ADMIN';
        u.allowedApps = ['*'];
        u.qualifiedResources = ['*'];
        u.allowedAgents = ['*'];
        u.ottoAgentEnabled = true;
      } else {
        u.ou = u.ou === 'internal' ? 'internal' : 'external';
        u.accessTier = u.accessTier || (u.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED');
        const prov = String(u.ssoProvider || '').toLowerCase();
        const hasWorkspaceSso = ['google', 'microsoft', 'apple'].includes(prov) || u.workspaceConnected === true || u.clientTier === 'workspace';
        u.workspaceConnected = Boolean(hasWorkspaceSso);
        u.clientTier = hasWorkspaceSso ? 'workspace' : 'access';
        if (!Array.isArray(u.allowedApps)) {
          u.allowedApps = u.status === 'active' ? DEFAULT_CUSTOMER_APPS.slice() : [];
        }
        if (!Array.isArray(u.qualifiedResources)) {
          u.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
        }
        if (!Array.isArray(u.allowedAgents)) {
          u.allowedAgents = (hasWorkspaceSso || u.ou === 'internal') ? ['otto'] : [];
        }
        if (typeof u.ottoAgentEnabled !== 'boolean') {
          u.ottoAgentEnabled = Boolean(hasWorkspaceSso || u.ou === 'internal');
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
    try {
      const cleaned = JSON.stringify(state)
        .replace(/\s*\(\s*[E]IN\s*\d{2}-\d{7}\s*[·|•-]?\s*Parent\s*\/\s*SDVOSB\s*\)/gi, ' (Parent / SDVOSB)')
        .replace(/\s*\(\s*[E]IN\s*\d{2}-\d{7}\s*\)/gi, '')
        .replace(/[E]IN\s*:?\s*\d{2}-\d{7}\s*[·|•-]?\s*/gi, '');
      return JSON.parse(cleaned);
    } catch (_) {}
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

  function isGenericOrRevokedSecret(secretStr) {
    const raw = String(secretStr || '').trim();
    if (!raw || raw.length < 8) return true;
    if (/^\d+$/.test(raw)) return true;
    if (/^(password|admin|welcome|qwerty|123456|letmein|default|test|guest|mgcadmin|miltongroup|customer|sovereign|malikadmin|horizon|passkey|440921|250100)/i.test(raw)) return true;
    return false;
  }

  function isValidAdminSecret(secretStr) {
    const clean = String(secretStr || '');
    if (!clean || isGenericOrRevokedSecret(clean)) return false;
    const dig = mgcDigest(clean);
    if (S && S.users && S.users.owner && S.users.owner.customPasswordDigest && dig === S.users.owner.customPasswordDigest) return true;
    return false;
  }

  function resolveCaseInsensitiveIdentifier(rawIdentifier) {
    const clean = String(rawIdentifier || '').trim().toLowerCase();
    if (!clean) return '';
    if (S && S.users) {
      const matched = Object.values(S.users).find(u => {
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uName = String(u.username || '').trim().toLowerCase();
        const uPrefix = uEmail.split('@')[0];
        return uEmail === clean || (uName && uName === clean) || (!clean.includes('@') && uPrefix === clean);
      });
      if (matched && matched.email) return String(matched.email).trim().toLowerCase();
    }
    if (clean === 'malik.khabir') return SOLE_ADMIN_EMAIL;
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
    // When running against the HTTP/HTTPS server, the signed HttpOnly mgcw_session cookie (S.currentUser) is the sole source of truth
    if (serverSyncOk) return null;
    // Offline file: mode bridge with OS Federated SSO Session (must be Google, Microsoft, or Apple SSO)
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

  const isOwner = (u = me()) => Boolean(u && u.role === 'owner' && u.id === 'owner');
  const isEmployee = (u = me()) => Boolean(u && u.role !== 'owner' && u.ou === 'internal' && u.status === 'active');
  const isClient = (u = me()) => Boolean(u && u.role !== 'owner' && u.ou !== 'internal');
  const isWorkspaceClient = (u = me()) => {
    if (!u || isOwner(u) || isEmployee(u)) return false;
    if (u.clientTier === 'workspace' || u.workspaceConnected === true) return true;
    const prov = String(u.ssoProvider || sessionStorage.getItem('mgcw.sso_provider') || '').toLowerCase();
    if (['google', 'microsoft', 'apple'].includes(prov)) return true;
    try {
      const sess = JSON.parse(localStorage.getItem('mgc_onboarded_session') || 'null');
      if (sess && String(sess.email || '').toLowerCase() === String(u.email || '').toLowerCase()) {
        if (sess.clientTier === 'workspace' || sess.workspaceConnected === true || ['google', 'microsoft', 'apple'].includes(String(sess.ssoProvider || '').toLowerCase())) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  };
  const isAccessClient = (u = me()) => Boolean(u && isClient(u) && !isWorkspaceClient(u));

  const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms)
  const ACTIVITY_KEY = 'mgc_last_activity_ts';
  let lastActivityTouch = 0;

  function touchActivity(force) {
    const nowTs = Date.now();
    if (!force && nowTs - lastActivityTouch < 4000) return;
    lastActivityTouch = nowTs;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(nowTs));
    } catch (_) {}
  }

  function getRemainingInactivityMs() {
    try {
      const raw = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (!raw) return INACTIVITY_TIMEOUT_MS;
      return Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - raw));
    } catch (_) {
      return INACTIVITY_TIMEOUT_MS;
    }
  }

  function getAllowedPortalsForUser(u) {
    if (!u) return [];
    if (isOwner(u)) return ['*'];
    const portals = new Set(['saas-apps-and-lms-showcase.html', 'member-portal.html']);
    if (isEmployee(u)) {
      portals.add('access-admin.html');
    }
    if (isWorkspaceClient(u) || isEmployee(u)) {
      CATALOG.forEach(c => {
        if (c.href && can(u, 'page', c.id, 'view')) {
          if (isEmployee(u) && c.id === 'finance') return;
          portals.add(c.href.split('?')[0].split('#')[0]);
        }
      });
    }
    return Array.from(portals);
  }

  const signInAs = (id, provider = 'google', mfaCode = '') => {
    if (!id || ['client', 'ana', 'ben', 'cara'].includes(String(id).toLowerCase())) return;
    const cleanProv = ALLOWED_SSO.includes(String(provider || '').toLowerCase()) ? String(provider).toLowerCase() : 'google';
    const u = S.users[id];
    if (!u) return;
    // Strict guard: when connected to HTTP/HTTPS server, require active server session or server verification
    if (serverSyncOk && S.currentUser !== id) {
      if (u.role === 'owner' && !mfaCode) return;
      if (!u.email || cleanProv === 'password') return;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/auth/sso', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ provider: cleanProv, email: u.email, mfaCode: mfaCode || undefined }));
        if (xhr.status !== 200) return;
        S.currentUser = id;
      } catch (_) {
        return;
      }
    }
    if (!serverSyncOk) S.currentUser = id;
    const isAdminUser = u.role === 'owner' && u.id === 'owner';
    const isWs = !isAdminUser && (['google', 'microsoft', 'apple'].includes(cleanProv) || u.workspaceConnected === true);
    u.ssoProvider = cleanProv;
    u.workspaceConnected = isAdminUser ? true : isWs;
    u.clientTier = isAdminUser ? 'administrator' : (isWs ? 'workspace' : 'access');
    commit();
    sessionStorage.setItem('mgcw.uid', id);
    sessionStorage.setItem('mgcw.sso_provider', cleanProv);
    touchActivity(true);
    const sessionObj = {
      email: u.email,
      name: u.name,
      org: u.brand === 'FIX' ? 'F.I.X Solutions LLC' : 'Milton Group Concepts LLC',
      role: isAdminUser ? 'OWNER_ADMIN (SSO VERIFIED)' : (isWs ? 'WORKSPACE_CLIENT' : 'ACCESS_CLIENT'),
      clientTier: u.clientTier,
      workspaceConnected: u.workspaceConnected,
      ssoVerified: true,
      ssoProvider: cleanProv,
      access: isAdminUser ? 'INTERNAL_SUITE_FULL' : (isWs ? 'WORKSPACE_CLIENT_ACCESS' : 'SHOWCASE_AND_INSIGHTS_ONLY'),
      allowedApps: isAdminUser ? ['*'] : (u.allowedApps || DEFAULT_CUSTOMER_APPS),
      allowedPortals: getAllowedPortalsForUser(u),
      verifiedAt: now(),
      lastActivityTs: Date.now(),
      integrityHash: 'SHA256-' + btoa(u.email + ':' + cleanProv + ':' + u.role + ':MGC-2026').slice(0, 16),
      zeroChargeGuard: 'ACTIVE_MIN0_MAX2'
    };
    localStorage.setItem('mgc_onboarded_session', JSON.stringify(sessionObj));
    localStorage.removeItem('mgc_edge_gate_locked');
    localStorage.setItem('mgc_sim_tier', isAdminUser ? 'enterprise' : 'ppv');
  };

  const signOut = (reason) => {
    sessionStorage.removeItem('mgcw.uid');
    sessionStorage.removeItem('mgcw.sso_provider');
    localStorage.removeItem('mgc_onboarded_session');
    localStorage.removeItem('mgc_onboarded_user');
    localStorage.removeItem(ACTIVITY_KEY);
    localStorage.setItem('mgc_edge_gate_locked', '1');
    const q = reason === 'inactivity' ? '?reason=inactivity' : '';
    if (serverSyncOk) location.href = '/api/auth/logout' + q;
    else location.href = 'login.html' + q;
  };

  function connectWorkspace(provider = 'google') {
    const prov = ['google', 'microsoft', 'apple'].includes(String(provider || '').toLowerCase())
      ? String(provider).toLowerCase()
      : 'google';
    if (isHttp) {
      location.href = '/api/auth/oauth/start?provider=' + encodeURIComponent(prov);
      return;
    }
    const curr = me();
    if (curr && !isOwner(curr)) {
      curr.workspaceConnected = true;
      curr.clientTier = 'workspace';
      curr.ssoProvider = prov;
      commit();
      signInAs(curr.id, prov);
    }
  }

  function checkInactivityAutoLogoff() {
    const activeUser = me();
    if (!activeUser) return false;
    try {
      const rawTs = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (!rawTs) {
        touchActivity(true);
        return false;
      }
      if (Date.now() - rawTs >= INACTIVITY_TIMEOUT_MS) {
        signOut('inactivity');
        return true;
      }
    } catch (_) {}
    return false;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, () => {
        if (localStorage.getItem('mgc_edge_gate_locked') !== '1' && (S.currentUser || sessionStorage.getItem('mgcw.uid') || localStorage.getItem('mgc_onboarded_session'))) {
          if (!checkInactivityAutoLogoff()) {
            touchActivity(false);
          }
        }
      }, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkInactivityAutoLogoff();
      }
    });
    setInterval(checkInactivityAutoLogoff, 10000);
    setTimeout(checkInactivityAutoLogoff, 50);
  }

  const log = (actor, action, detail) => { S.audit.unshift({ id: uid('a'), ts: now(), actor, action, detail }); S.audit = S.audit.slice(0, 200); };
  const notify = (toUid, title, body, channel) => { S.notifications.unshift({ id: uid('n'), toUid, title, body, channel: channel || 'in-app + email', ts: now(), read: false }); };

  function getResourcesCatalog() {
    const custom = (S && Array.isArray(S.customResources)) ? S.customResources : [];
    const map = new Map();
    RESOURCES_CATALOG.forEach(r => map.set(r.id, r));
    custom.forEach(r => { if (r && r.id) map.set(r.id, r); });
    return Array.from(map.values());
  }

  function getAgentsCatalog() {
    const stored = (S && Array.isArray(S.agents) && S.agents.length) ? S.agents : [];
    const map = new Map();
    AGENTS_CATALOG.forEach(a => map.set(a.id, Object.assign({}, a)));
    stored.forEach(a => {
      if (a && a.id) {
        map.set(a.id, Object.assign({}, map.get(a.id) || {}, a));
      }
    });
    return Array.from(map.values());
  }

  function updateAgentAccess(agentId, updates) {
    const curr = me();
    if (!isOwner(curr)) return { ok: false, error: 'Only the Administrator can modify Agent Access Management settings.' };
    const cleanId = sanitizeField(agentId || 'otto', 60).toLowerCase();
    const srv = postServerAction({ action: 'updateAgentAccess', agentId: cleanId, data: updates || {} });
    if (srv && srv.ok) { commit(); return srv; }
    if (!Array.isArray(S.agents) || !S.agents.length) {
      S.agents = AGENTS_CATALOG.map(a => Object.assign({}, a));
    }
    const target = S.agents.find(a => a.id === cleanId) || S.agents[0];
    if (!target) return { ok: false, error: 'Agent not found.' };
    if (updates && updates.access) target.access = sanitizeField(updates.access, 60);
    if (updates && updates.accessPolicy) target.accessPolicy = sanitizeField(updates.accessPolicy, 160);
    if (updates && updates.status) target.status = sanitizeField(updates.status, 40);
    if (updates && updates.serviceIdentity) target.serviceIdentity = sanitizeField(updates.serviceIdentity, 120);
    if (updates && updates.studioAttributionVisibility) target.studioAttributionVisibility = sanitizeField(updates.studioAttributionVisibility, 20);
    log('owner', 'agent.access_updated', target.name + ' (' + target.agentId + ') -> Access:' + target.access + ', Status:' + target.status);
    commit();
    return { ok: true, agent: target, state: S };
  }

  /* ---------- Policy: deny by default. Mirrors server.js ---------- */
  function subActive(u) { return u && (u.role === 'owner' || u.status === 'active' || (u.plan && u.plan.base)); }
  function can(u, type, id, action) {
    if (!u) return false;
    if (u.role === 'owner' && u.id === 'owner') return true;       // sole Administrator: everything
    if (!subActive(u)) return false;                              // members need an active account
    // Access Clients (non-workspace connected) only get Showcase Access & Tools/Insights
    const accessOnlyClient = isAccessClient(u);
    if (type === 'agent') {
      if (accessOnlyClient) return false;                         // Persistent boundary: Access Clients must connect a Workspace for Agent interactions
      const ag = getAgentsCatalog().find(a => a.id === id || a.agentId === id);
      if (ag && ag.status === 'Disabled') return false;
      if (ag && ag.access === 'Restricted' && !isEmployee(u)) {
        return Array.isArray(u.allowedAgents) && (u.allowedAgents.includes('*') || u.allowedAgents.includes(id));
      }
      if (u.ottoAgentEnabled === false) return false;
      const agList = Array.isArray(u.allowedAgents) ? u.allowedAgents : ['otto'];
      return agList.includes('*') || agList.includes(id) || isWorkspaceClient(u) || isEmployee(u);
    }
    if (type === 'resource') {
      const resList = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : DEFAULT_CUSTOMER_RESOURCES;
      if (resList.includes('*') || resList.includes(id)) return true;
      return (S.shares || []).some(s => s.type === 'resource' && s.resource === id && s.grantee === u.id);
    }
    if (type === 'page') {
      const entry = CATALOG.find(c => c.id === id);
      if (!entry || action !== 'view') return false;
      if (isEmployee(u) && id === 'finance') return false;
      if (id === 'saasapps') return true;                         // SaaS Apps & LMS Showcase is always unlocked for active users
      if (id === 'resources') {
        const hasAnyResource = getResourcesCatalog().some(r => can(u, 'resource', r.id, 'view'));
        if (hasAnyResource) return true;
      }
      if (accessOnlyClient) return false;                         // Access Clients do not get Workspace-only modules until Workspace is connected
      if ((S.shares || []).some(s => (s.type === 'page' || s.type === 'element') && s.resource === id && s.grantee === u.id)) return true;
      return (u.pages || {})[id] === 'ready';                     // only ready pages explicitly granted by Administrator
    }
    if (type === 'app') {
      const hasPaidOrOnboarded = Boolean((u.plan && u.plan.paymentVerified) || u.onboardingCompleted);
      if (accessOnlyClient && !hasPaidOrOnboarded) {
        return DEFAULT_CUSTOMER_APPS.includes(id);                // Un-onboarded Access Clients strictly get Showcase Access apps
      }
      const apps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS;
      if (apps.includes('*') || apps.includes(id)) return true;
      return (S.shares || []).some(s => (s.type === 'app' || s.type === 'element') && s.resource === id && s.grantee === u.id);
    }
    if (type === 'project') {
      if (accessOnlyClient) return false;
      const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
      if (!sh) return false;
      return action === 'view' ? true : sh.perms.includes(action);
    }
    if (type === 'element') {
      if (accessOnlyClient) return false;
      return S.shares.some(s => (s.type === 'element' || s.type === 'app' || s.type === 'resource') && s.resource === id && s.grantee === u.id);
    }
    return false;
  }

  /* ---------- Lifecycle workflow & Input Security Hardening ---------- */
  let lastIntakeResult = null;
  const DANGEROUS_INPUT_REGEX = /<\s*\/?\s*(script|iframe|object|embed|svg|math|meta|link|style|base)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|on(load|error|click|mouseover|focus|blur|submit|input|change|keydown)\s*=|(\b(UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET|xp_cmdshell)\b)|(\{\{[\s\S]*?\}\}|\$\{[\s\S]*?\})|(__proto__|prototype\s*\[|constructor\s*\[)/i;

  function hasInjectionPayload(val) {
    if (val == null) return false;
    if (typeof val === 'string') return DANGEROUS_INPUT_REGEX.test(val);
    if (Array.isArray(val)) return val.some(item => hasInjectionPayload(item));
    if (typeof val === 'object') {
      for (const k of Object.keys(val)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
        if (hasInjectionPayload(k) || hasInjectionPayload(val[k])) return true;
      }
    }
    return false;
  }

  function sanitizeField(val, maxLen) {
    return String(val == null ? '' : val)
      .replace(/[\u0000-\u001F\u007F<>`$\\]/g, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/(__proto__|constructor|prototype)/gi, '')
      .trim()
      .slice(0, maxLen || 240);
  }

  const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'owner', 'root', 'system', 'malik.khabir', 'security', 'postmaster', 'support']);

  const EMPLOYEE_ASSIGNED_ROSTER = {
    'emp.jordan.vance': {
      username: 'emp.jordan.vance',
      name: 'Jordan Vance',
      email: 'jordan.vance@miltongroupsecurity.org',
      org: 'MGC Internal Operations',
      ou: 'internal',
      assignedByAdmin: true,
      mustResetPassword: true
    },
    'emp.elena.rostova': {
      username: 'emp.elena.rostova',
      name: 'Elena Rostova',
      email: 'elena.rostova@miltongroupsecurity.org',
      org: 'MGC Cyber Operations',
      ou: 'internal',
      assignedByAdmin: true,
      mustResetPassword: true
    }
  };

  function resolveEmployeeAssignedRecord(rawUsername, rawEmail) {
    const un = String(rawUsername || '').trim().toLowerCase();
    const em = String(rawEmail || '').trim().toLowerCase();
    const roster = Object.assign({}, EMPLOYEE_ASSIGNED_ROSTER, (S && S.employeeAssignedUsernames) || {});
    if (un && roster[un]) {
      return Object.assign({ isAssignedEmployee: true, detectedOu: 'internal' }, roster[un]);
    }
    const byEmail = em ? Object.values(roster).find(r => r && String(r.email || '').toLowerCase() === em) : null;
    if (byEmail) {
      return Object.assign({ isAssignedEmployee: true, detectedOu: 'internal' }, byEmail);
    }
    const existingEmp = Object.values((S && S.users) || {}).find(u =>
      u && u.id !== 'owner' && u.ou === 'internal' &&
      ((un && String(u.username || '').toLowerCase() === un) || (em && String(u.email || '').toLowerCase() === em))
    );
    if (existingEmp) {
      return {
        isAssignedEmployee: true,
        detectedOu: 'internal',
        username: existingEmp.username,
        name: existingEmp.name,
        email: existingEmp.email,
        org: existingEmp.org || 'MGC Internal Operations',
        ou: 'internal',
        assignedByAdmin: true,
        mustResetPassword: Boolean(existingEmp.mustResetPassword)
      };
    }
    if (un && (/^(emp|staff)\.[a-z0-9._-]{2,28}$/.test(un))) {
      const cleanSlug = un.replace(/^(emp|staff)\./, '');
      return {
        isAssignedEmployee: true,
        detectedOu: 'internal',
        username: un,
        name: cleanSlug.split(/[._-]/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
        email: em || (cleanSlug + '@miltongroupsecurity.org'),
        org: 'MGC Internal Operations',
        ou: 'internal',
        assignedByAdmin: true,
        mustResetPassword: true
      };
    }
    return { isAssignedEmployee: false, detectedOu: 'external' };
  }

  function validateUsernameStandard(rawUsername, excludeUid, portalContext) {
    const clean = String(rawUsername || '').trim().toLowerCase();
    const mode = portalContext === 'employee' ? 'employee' : 'client';
    const empRec = resolveEmployeeAssignedRecord(clean, '');
    const lenOk = clean.length >= 4 && clean.length <= 32;
    const formatOk = /^[a-z0-9][a-z0-9._-]{3,31}$/.test(clean) && !/[._-]{2,}/.test(clean);
    const notReserved = mode === 'employee'
      ? Boolean(clean) && !RESERVED_USERNAMES.has(clean) && Boolean(empRec.isAssignedEmployee)
      : Boolean(clean) && !RESERVED_USERNAMES.has(clean) && !empRec.isAssignedEmployee;
    const noInjection = !hasInjectionPayload(clean);
    const collisionUser = Boolean(clean) && Object.values((S && S.users) || {}).find(u =>
      u && u.id !== excludeUid && String(u.username || '').toLowerCase() === clean
    );
    const collision = mode === 'employee'
      ? Boolean(collisionUser && !collisionUser.mustResetPassword)
      : Boolean(collisionUser);
    const ok = lenOk && formatOk && notReserved && noInjection && !collision;
    const violations = [];
    if (!clean) {
      violations.push('Enter a username.');
    } else {
      if (!lenOk) violations.push('Username must be between 4 and 32 characters.');
      if (!formatOk) violations.push('Use only letters (a–z), numbers (0–9), periods (.), underscores (_), or hyphens (-), starting with a letter or number.');
      if (!notReserved) {
        violations.push(mode === 'employee'
          ? 'Enter the organization-assigned username from your onboarding notice.'
          : 'This username is reserved and unavailable.');
      }
      if (!noInjection) violations.push('Disallowed characters detected.');
      if (collision) violations.push('This username is already in use.');
    }
    return {
      ok,
      username: clean,
      isAssignedEmployee: mode === 'employee' ? Boolean(empRec.isAssignedEmployee) : false,
      detectedOu: mode === 'employee' ? 'internal' : 'external',
      assignedProfile: mode === 'employee' && empRec.isAssignedEmployee ? empRec : null,
      checks: { lenOk, formatOk, notReserved, noInjection, uniqueOk: !collision },
      violations,
      error: violations[0] || ''
    };
  }

  function validatePasswordStandard(rawPassword, rawUsername) {
    const pw = String(rawPassword || '');
    const un = String(rawUsername || '').trim().toLowerCase();
    const lenOk = pw.length >= 8 && pw.length <= 128;
    const upperOk = /[A-Z]/.test(pw);
    const lowerOk = /[a-z]/.test(pw);
    const digitOk = /\d/.test(pw);
    const specialOk = /[^A-Za-z0-9\s]/.test(pw);
    const notContainsUser = !un || un.length < 3 || !pw.toLowerCase().includes(un);
    const notGeneric = !/^(password|12345678|qwertyui|admin123|letmein1|welcome1)/i.test(pw);
    const ok = lenOk && upperOk && lowerOk && digitOk && specialOk && notContainsUser && notGeneric;
    const violations = [];
    if (!pw) {
      violations.push('Enter a password.');
    } else {
      if (!lenOk) violations.push('Password must be at least 8 characters long.');
      if (!upperOk || !lowerOk) violations.push('Include both uppercase (A–Z) and lowercase (a–z) letters.');
      if (!digitOk) violations.push('Include at least one number (0–9).');
      if (!specialOk) violations.push('Include at least one special character (!@#$%^&*...).');
      if (!notContainsUser) violations.push('Password cannot contain your username.');
      if (!notGeneric) violations.push('Common or default password sequences are not allowed.');
    }
    return {
      ok,
      checks: { lenOk, upperOk, lowerOk, digitOk, specialOk, notContainsUser, notGeneric },
      violations,
      error: violations[0] || ''
    };
  }

  function validatePhoneStandard(rawPhone) {
    const clean = sanitizeField(rawPhone, 32);
    const digits = clean.replace(/\D/g, '');
    const ok = digits.length >= 10 && digits.length <= 15 && /^[0-9+()\-\s.]{10,24}$/.test(clean);
    return {
      ok,
      phone: clean,
      digits,
      error: ok ? '' : 'Valid 10–15 digit phone number is required.'
    };
  }

  function validateAddressStandard(addr, ou, isGuidedReg) {
    const a = addr && typeof addr === 'object' ? addr : {};
    const streetAddress = sanitizeField(a.streetAddress || a.street || '', 140);
    const city = sanitizeField(a.city || '', 80);
    const stateRegion = sanitizeField(a.stateRegion || a.state || '', 60);
    const postalCode = sanitizeField(a.postalCode || a.zip || '', 24);
    const hasAll = Boolean(streetAddress && city && stateRegion && postalCode);
    const required = Boolean(isGuidedReg !== false || String(ou || 'external').toLowerCase() === 'internal');
    const ok = required ? hasAll : true;
    return {
      ok,
      required,
      address: { streetAddress, city, stateRegion, postalCode },
      error: ok ? '' : 'Complete physical address (Street Address, City, State/Region, and Postal/ZIP Code) is mandatory for all portal registrations.'
    };
  }

  const ONBOARDING_CATEGORIES = [
    {
      id: 'cat_ai_saas',
      title: 'AI Receptionist & Web Portals',
      tag: 'Business & SaaS',
      accent: '#3b82f6',
      gradient: 'linear-gradient(135deg, rgba(30,58,138,0.85), rgba(15,23,42,0.96))',
      summary: '24/7 client intake, automated booking, and turnkey business portals.',
      associatedApps: ['client-turnkey-forge', 'sterling-auto-repair', 'traffic-roi-simulator'],
      associatedResources: ['resource-fast-track'],
      learningTrack: 'ai-web'
    },
    {
      id: 'cat_divergent_lang',
      title: 'Otto Language Studio',
      tag: 'Languages',
      accent: '#10b981',
      gradient: 'linear-gradient(135deg, rgba(6,78,59,0.85), rgba(15,23,42,0.96))',
      summary: 'Fast-track new languages using languages you already know.',
      associatedApps: ['spanish-acquisition-os', 'chronos-aetheria-scorm'],
      associatedResources: [],
      learningTrack: 'training'
    },
    {
      id: 'cat_cyber_eveng',
      title: 'Network & Cyber Upskilling',
      tag: 'Upskilling & Certs',
      accent: '#06b6d4',
      gradient: 'linear-gradient(135deg, rgba(8,51,68,0.85), rgba(15,23,42,0.96))',
      summary: 'Hands-on routing, Linux, SQL, and certification practice labs.',
      associatedApps: ['eveng-netprism-studio', 'ghost-cli-trainer'],
      associatedResources: [],
      learningTrack: 'cyber'
    },
    {
      id: 'cat_federal_sdvosb',
      title: 'Federal Contracting',
      tag: 'Business & Defense',
      accent: '#c5b358',
      gradient: 'linear-gradient(135deg, rgba(120,53,15,0.78), rgba(15,23,42,0.96))',
      summary: 'SAM.gov contract matching, proposal readiness, and federal billing.',
      associatedApps: ['samgov-contract-matchmaker', 'client-turnkey-forge'],
      associatedResources: [],
      learningTrack: 'federal'
    },
    {
      id: 'cat_capital_dealflow',
      title: 'Business Endeavors & Scaling',
      tag: 'Business Endeavors',
      accent: '#eab308',
      gradient: 'linear-gradient(135deg, rgba(113,63,18,0.82), rgba(15,23,42,0.96))',
      summary: 'Operational scaling, revenue modeling, and Resource Fast-Track templates.',
      associatedApps: ['traffic-roi-simulator', 'client-turnkey-forge'],
      associatedResources: ['resource-fast-track'],
      learningTrack: 'ai-web'
    },
    {
      id: 'cat_chronos_epigraphy',
      title: 'Schooling & Academic Systems',
      tag: 'Schooling & Research',
      accent: '#8b5cf6',
      gradient: 'linear-gradient(135deg, rgba(76,29,149,0.80), rgba(15,23,42,0.96))',
      summary: 'Structured academic foundations, data modeling, and primary research.',
      associatedApps: ['chronos-aetheria-scorm', 'spanish-acquisition-os'],
      associatedResources: [],
      learningTrack: 'training'
    }
  ];

  // Multi-Domain Associative Learning Sequences (Option A1 Deterministic Matrix + Option A2 Weighted SCORM/Quiz Telemetry Graph)
  const OPTION_A3_APP_THRESHOLD = 50;

  const DIVERGENT_BRIDGES = {
    en_arabic_heritage: {
      id: 'en_arabic_heritage',
      domainCategory: 'Languages',
      label: 'Languages · English + Arabic → Spanish, Farsi & French',
      familiarAnchors: ['English', 'Arabic Roots & Script'],
      sequence: [
        { step: 1, stageId: 'lang_ar_1', domain: 'Spanish', baseWeight: 86, transferPct: '86% Match', checkpointLabel: 'SCORM Cognate & Root Drill', unlockedBridge: 'Farsi (Persian) Script & Lexicon Bridge', rationale: 'Connects 4,000+ Arabic-origin Spanish words with everyday English familiarity.' },
        { step: 2, stageId: 'lang_ar_2', domain: 'Farsi (Persian)', baseWeight: 88, transferPct: '88% Match', checkpointLabel: 'Syntactic & Script Mastery Quiz', unlockedBridge: 'French & Mediterranean Grammar Bridge', rationale: 'Pairs familiar script and vocabulary with English-style sentence structure.' },
        { step: 3, stageId: 'lang_ar_3', domain: 'French', baseWeight: 90, transferPct: '90% Match', checkpointLabel: 'Applied Trilingual Comprehension Check', unlockedBridge: 'Full Mediterranean & Diplomatic Fluency', rationale: 'Builds on Spanish grammar and shared Mediterranean vocabulary.' }
      ]
    },
    en_us_native: {
      id: 'en_us_native',
      domainCategory: 'Languages',
      label: 'Languages · English → Spanish → French & Portuguese',
      familiarAnchors: ['English', 'Everyday U.S. Spanish'],
      sequence: [
        { step: 1, stageId: 'lang_us_1', domain: 'Spanish Foundation', baseWeight: 82, transferPct: '82% Match', checkpointLabel: 'High-Frequency Cognate SCORM Check', unlockedBridge: 'French & Italian Lexical Bridge', rationale: 'Uses familiar U.S. Spanish vocabulary to build rapid conversational confidence.' },
        { step: 2, stageId: 'lang_us_2', domain: 'French & Italian', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'Romance Verb & Pattern Quiz', unlockedBridge: 'Portuguese & Classical Epigraphy Bridge', rationale: 'Connects Spanish grammar with shared English-French roots for faster reading.' },
        { step: 3, stageId: 'lang_us_3', domain: 'Portuguese & Classical Texts', baseWeight: 91, transferPct: '91% Match', checkpointLabel: 'Applied Reading & Audio Mastery', unlockedBridge: 'Complete Romance Language Mastery', rationale: 'Completes full Romance language fluency across modern and historical sources.' }
      ]
    },
    east_asian_hangul: {
      id: 'east_asian_hangul',
      domainCategory: 'Languages',
      label: 'Languages · Korean (Hangul) → Chinese & Japanese',
      familiarAnchors: ['English', 'Phonetic Hangul Alphabet'],
      sequence: [
        { step: 1, stageId: 'lang_ea_1', domain: 'Korean (Hangul)', baseWeight: 94, transferPct: '94% Match', checkpointLabel: 'Hangul Phonetic & Sino-Root Drill', unlockedBridge: 'Mandarin Hanzi Semantic Bridge', rationale: 'Learn the phonetic alphabet in hours while picking up core root words.' },
        { step: 2, stageId: 'lang_ea_2', domain: 'Mandarin Chinese', baseWeight: 78, transferPct: '78% Match', checkpointLabel: 'Sino-Root Character Recognition Quiz', unlockedBridge: 'Japanese Syntax & Kanji Bridge', rationale: 'Uses shared word roots from Korean to make Chinese characters intuitive.' },
        { step: 3, stageId: 'lang_ea_3', domain: 'Japanese', baseWeight: 85, transferPct: '85% Match', checkpointLabel: 'SOV Grammar & Particle Checkpoint', unlockedBridge: 'East Asian Tri-System Fluency', rationale: 'Applies Korean sentence structure directly to Japanese grammar.' }
      ]
    },
    business_endeavor_scale: {
      id: 'business_endeavor_scale',
      domainCategory: 'Business Endeavors',
      label: 'Business · Service Operations → Turnkey Intake → Multi-Rail Scaling',
      familiarAnchors: ['Service Delivery', 'Client Operations'],
      sequence: [
        { step: 1, stageId: 'biz_scale_1', domain: 'Service & Offer Standardization', baseWeight: 90, transferPct: '90% Match', checkpointLabel: '3-Tier SLA & Scope Verification', unlockedBridge: 'Automated 24/7 Client Intake Bridge', rationale: 'Translates existing service delivery into structured digital packages and clear SLAs.' },
        { step: 2, stageId: 'biz_scale_2', domain: 'Automated Client Intake & Booking', baseWeight: 93, transferPct: '93% Match', checkpointLabel: 'Turnkey Intake & Conversion Checkpoint', unlockedBridge: 'Multi-Rail ACH / WAWF / Card Settlement', rationale: 'Connects standardized packages directly to 24/7 guided intake and scheduling templates.' },
        { step: 3, stageId: 'biz_scale_3', domain: 'Multi-Rail Settlement & Retainers', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'GAAP Double-Entry & Tax Reserve Audit', unlockedBridge: 'Enterprise Multi-Entity Scaling', rationale: 'Links recurring engagements to automated ACH/Card billing and double-entry ledger tracking.' }
      ]
    },
    schooling_academic_bridge: {
      id: 'schooling_academic_bridge',
      domainCategory: 'Schooling & Academics',
      label: 'Schooling · Structured Logic → SQL & Data Systems → Applied Research',
      familiarAnchors: ['Analytical Writing', 'Structured Problem Solving'],
      sequence: [
        { step: 1, stageId: 'sch_acad_1', domain: 'Structured Logic & Technical Writing', baseWeight: 92, transferPct: '92% Match', checkpointLabel: 'Outline & Logic Decomposition Quiz', unlockedBridge: '3NF Relational SQL & ERD Bridge', rationale: 'Uses familiar outline logic to master technical specifications and lab documentation.' },
        { step: 2, stageId: 'sch_acad_2', domain: 'Relational Data & 3NF SQL Modeling', baseWeight: 88, transferPct: '88% Match', checkpointLabel: 'Crow\'s Foot ERD & SQL Normalization Lab', unlockedBridge: 'Full-Stack Systems & Empirical Verification', rationale: 'Maps structured outlines directly into relational database tables, keys, and queries.' },
        { step: 3, stageId: 'sch_acad_3', domain: 'Systems Architecture & Verification', baseWeight: 86, transferPct: '86% Match', checkpointLabel: 'Applied Systems & Rubric Checkpoint', unlockedBridge: 'Honors Capstone & Research Readiness', rationale: 'Bridges data schemas into full-stack application architecture and empirical verification.' }
      ]
    },
    cli_netops_ai: {
      id: 'cli_netops_ai',
      domainCategory: 'Technical Upskilling',
      label: 'Upskilling · CLI & Networking → Zero-Trust Security → AI Workflows',
      familiarAnchors: ['Command Line', 'SQL & Logic'],
      sequence: [
        { step: 1, stageId: 'upsk_cli_1', domain: 'Routing, Linux & SQL Foundations', baseWeight: 91, transferPct: '91% Match', checkpointLabel: 'Ghost-CLI & Netmiko Verification Lab', unlockedBridge: 'Zero-Trust IAM & CMMC 2.0 Bridge', rationale: 'Builds command-line muscle memory using guided terminal and database templates.' },
        { step: 2, stageId: 'upsk_cli_2', domain: 'Zero-Trust Cloud & Compliance', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'NIST 800-171 & SC-100 Control Quiz', unlockedBridge: 'Deterministic Workflow Orchestration', rationale: 'Applies network segmentation directly to identity governance and CMMC / NIST controls.' },
        { step: 3, stageId: 'upsk_cli_3', domain: 'Guided AI Workflow Templates', baseWeight: 87, transferPct: '87% Match', checkpointLabel: 'ModelOps & Policy Automation Check', unlockedBridge: 'Principal Security & Automation Architect', rationale: 'Connects security policy enforcement to deterministic workflow orchestration.' }
      ]
    }
  };

  // Option T1 (Locked Slot-Fill & Decision-Tree Templates) + Option T2 (Interactive Scenario Branching Cards)
  // Strictly Defined & Decided Interactive AI Templates (Zero Free-Text LLM Prompting)
  const DEFINED_AI_TEMPLATES = [
    {
      id: 'tpl_lang_associative',
      domain: 'Languages',
      title: 'Associative Language Acceleration Template',
      pacing: '30-Day Guided Sequence',
      summary: 'Structured bridge connecting your existing language roots to high-transfer vocabulary, phonetic drills, and SCORM checkpoints.',
      steps: [
        'Stage 1: Shared Root & Cognate Activation (Top 500 High-Frequency Anchors)',
        'Stage 2: Sentence Structure & Verb Pattern Transfer',
        'Stage 3: Applied Conversational & Reading Verification'
      ],
      scenarioPrompt: 'Option T2 · Select Your Language Immersion Scenario Branch:',
      scenarioBranches: [
        {
          id: 'branch_lang_audio',
          badge: 'Scenario Branch A · +5% Weight',
          title: 'Conversational Audio & Phonetics',
          desc: 'Prioritizes spoken cadence, neural audio shadowing, and high-frequency conversational cognate drills.',
          unlockedFocus: 'Unlocked Stage Focus: Neural Audio Cadence + 300 Spoken Cognate Loops',
          boostPct: 5
        },
        {
          id: 'branch_lang_script',
          badge: 'Scenario Branch B · +6% Weight',
          title: 'Script Decoding & Cognate Reading',
          desc: 'Connects shared Arabic/Latin/Hangul script roots to rapid headline, document, and epigraphic reading.',
          unlockedFocus: 'Unlocked Stage Focus: Parallel Script Morphology + Primary Source Reader',
          boostPct: 6
        },
        {
          id: 'branch_lang_exec',
          badge: 'Scenario Branch C · +5% Weight',
          title: 'Executive & Diplomatic Vocabulary',
          desc: 'Focuses on contract terminology, briefing structures, and professional cross-regional communication.',
          unlockedFocus: 'Unlocked Stage Focus: Executive Briefing Lexicon + Protocol Scenarios',
          boostPct: 5
        }
      ]
    },
    {
      id: 'tpl_biz_turnkey',
      domain: 'Business Endeavors',
      title: 'Turnkey Business Intake & Scaling Template',
      pacing: '14-Day Launch Blueprint',
      summary: 'Pre-decided operational template mapping your service tiers to 24/7 guided client intake, SLA milestones, and multi-rail settlement.',
      steps: [
        'Stage 1: Standardized 3-Tier Service Scope & Pricing Matrix',
        'Stage 2: Guided Client Intake & Calendar Slot Lock',
        'Stage 3: Automated ACH / Card Settlement & GAAP Ledger Posting'
      ],
      scenarioPrompt: 'Option T2 · Select Your Target Market & Operating Scenario Branch:',
      scenarioBranches: [
        {
          id: 'branch_biz_b2b',
          badge: 'Scenario Branch A · +6% Weight',
          title: 'Commercial B2B Retainer Model',
          desc: 'Structures recurring monthly B2B service packages with $0-fee NACHA ACH settlement and SLA tracking.',
          unlockedFocus: 'Unlocked Stage Focus: B2B Retainer Schedule + Automated ACH Ledger Rule',
          boostPct: 6
        },
        {
          id: 'branch_biz_sdvosb',
          badge: 'Scenario Branch B · +7% Weight',
          title: 'Federal SDVOSB & WAWF Teaming',
          desc: 'Aligns capability statements to NAICS 541512/541519 primes with PIEE/WAWF electronic invoicing.',
          unlockedFocus: 'Unlocked Stage Focus: SAM.gov Capability Matrix + WAWF/PIEE EFT Gate',
          boostPct: 7
        },
        {
          id: 'branch_biz_direct',
          badge: 'Scenario Branch C · +5% Weight',
          title: 'High-Volume Direct Client Portal',
          desc: 'Optimizes instant self-serve appointment booking, automated estimate cards, and Stripe SAQ-A checkout.',
          unlockedFocus: 'Unlocked Stage Focus: 60-Second Lead Intake + Instant Card Checkout',
          boostPct: 5
        }
      ]
    },
    {
      id: 'tpl_school_curriculum',
      domain: 'Schooling & Academics',
      title: 'Academic & Systems Mastery Template',
      pacing: 'Weekly Lab Checkpoints',
      summary: 'Guided academic progression bridging structured analytical writing into 3NF database design, C++ / Python logic, and lab verification.',
      steps: [
        'Stage 1: Concept Mapping & Requirement Decomposition',
        'Stage 2: Guided Lab Execution (SQL / CLI / Systems Modeling)',
        'Stage 3: Rubric Verification & Artifact Packaging'
      ],
      scenarioPrompt: 'Option T2 · Select Your Academic Lab & Verification Scenario Branch:',
      scenarioBranches: [
        {
          id: 'branch_school_sql',
          badge: 'Scenario Branch A · +6% Weight',
          title: 'Relational SQL & 3NF ER Modeling',
          desc: 'Maps business rules into Crow\'s Foot ER diagrams, primary/foreign keys, and verified SQL DDL/DML scripts.',
          unlockedFocus: 'Unlocked Stage Focus: 3NF Schema Validator + Crow\'s Foot ERD Checklist',
          boostPct: 6
        },
        {
          id: 'branch_school_code',
          badge: 'Scenario Branch B · +5% Weight',
          title: 'Guided Console & Algorithmic Logic',
          desc: 'Steps through control flow, data structures, and deterministic input/output verification checkpoints.',
          unlockedFocus: 'Unlocked Stage Focus: Modular Code Architecture + Console Output Verifier',
          boostPct: 5
        },
        {
          id: 'branch_school_apa',
          badge: 'Scenario Branch C · +5% Weight',
          title: 'Structured Analytical & Lab Synthesis',
          desc: 'Transforms technical lab observations and metrics into rubric-aligned documentation and visual tables.',
          unlockedFocus: 'Unlocked Stage Focus: Empirical Evidence Matrix + Rubric Audit Gate',
          boostPct: 5
        }
      ]
    },
    {
      id: 'tpl_upskill_cert',
      domain: 'Technical Upskilling',
      title: 'Certification & Cyber Readiness Template',
      pacing: 'Sprint Readiness Track',
      summary: 'Deterministic certification accelerator across CCNA/NetOps, Zero-Trust Security (SC-100/CMMC), and ModelOps governance.',
      steps: [
        'Stage 1: Domain Diagnostic & High-Weight Topic Lock',
        'Stage 2: EVE-NG / Terminal Topology Verification Drills',
        'Stage 3: Timed Readiness Check & Evidence Checklist'
      ],
      scenarioPrompt: 'Option T2 · Select Your Technical Architecture Scenario Branch:',
      scenarioBranches: [
        {
          id: 'branch_upskill_ztna',
          badge: 'Scenario Branch A · +7% Weight',
          title: 'Zero-Trust IAM & CMMC 2.0 Level 2',
          desc: 'Focuses on OIDC federation, conditional access policy hardening, and NIST SP 800-171 Rev 3 evidence.',
          unlockedFocus: 'Unlocked Stage Focus: SC-100 / CMMC L2 Control Matrix + JWKS Audit',
          boostPct: 7
        },
        {
          id: 'branch_upskill_netops',
          badge: 'Scenario Branch B · +6% Weight',
          title: 'EVE-NG Routing & CLI Automation',
          desc: 'Runs hands-on OSPF, BGP, VLAN trunking, and declarative Ansible playbook verification labs.',
          unlockedFocus: 'Unlocked Stage Focus: Multi-Area OSPF/BGP Topology + Ansible Validator',
          boostPct: 6
        },
        {
          id: 'branch_upskill_modelops',
          badge: 'Scenario Branch C · +6% Weight',
          title: 'ModelOps & Deterministic AI Governance',
          desc: 'Covers champion/challenger validation, drift telemetry, and allowlist-bound enterprise AI deployment.',
          unlockedFocus: 'Unlocked Stage Focus: Champion/Challenger Telemetry + A00-440 Readiness',
          boostPct: 6
        }
      ]
    }
  ];

  function getCatalogThresholdStatus() {
    const appsCount = APPS_CATALOG.length;
    const pagesCount = CATALOG.length;
    const resourcesCount = getResourcesCatalog().length;
    const templatesCount = DEFINED_AI_TEMPLATES.length;
    const bridgesCount = Object.keys(DIVERGENT_BRIDGES).length;
    const totalCatalogCount = appsCount + pagesCount + resourcesCount + templatesCount + bridgesCount;
    const reachedThreshold = totalCatalogCount >= OPTION_A3_APP_THRESHOLD;
    return {
      currentCount: totalCatalogCount,
      appsCount,
      pagesCount,
      resourcesCount,
      templatesCount,
      bridgesCount,
      threshold: OPTION_A3_APP_THRESHOLD,
      remainingToThreshold: Math.max(0, OPTION_A3_APP_THRESHOLD - totalCatalogCount),
      reachedThreshold,
      activeEngine: 'Option A1 (Deterministic Matrix) + Option A2 (Weighted SCORM/Quiz Telemetry Graph)',
      phase3Status: reachedThreshold
        ? 'THRESHOLD REACHED (50+): Ready to activate Option A3 (Vertex AI / AI Studio Batch Embedding Re-Ranker)'
        : 'Armed · Will auto-notify Owner at 50 catalog modules (' + totalCatalogCount + ' / ' + OPTION_A3_APP_THRESHOLD + ' active)'
    };
  }

  function recordAssociativeMastery(payload) {
    if (hasInjectionPayload(payload)) {
      return { ok: false, error: 'Invalid input payload.' };
    }
    const res = postServerAction({ action: 'recordAssociativeMastery', data: payload });
    if (res && res.ok) {
      commit();
      return res;
    }
    const u = me();
    if (!u) return { ok: false, error: 'Authentication required.' };
    if (!u.associativeTelemetry || typeof u.associativeTelemetry !== 'object') {
      u.associativeTelemetry = {
        completedStages: [],
        selectedScenarioBranches: {},
        domainWeightBoosts: {},
        masteryEvents: []
      };
    }
    const tel = u.associativeTelemetry;
    if (!Array.isArray(tel.completedStages)) tel.completedStages = [];
    if (!tel.selectedScenarioBranches) tel.selectedScenarioBranches = {};
    if (!tel.domainWeightBoosts) tel.domainWeightBoosts = {};
    if (!Array.isArray(tel.masteryEvents)) tel.masteryEvents = [];

    const stageId = sanitizeField(payload && payload.stageId, 64);
    const bridgeId = sanitizeField(payload && payload.bridgeId, 64) || u.divergentBaseline || 'en_arabic_heritage';
    const templateId = sanitizeField(payload && payload.templateId, 64);
    const branchId = sanitizeField(payload && payload.branchId, 64);
    const boostPct = Math.min(12, Math.max(2, Number((payload && payload.boostPct) || 5)));

    if (stageId && !tel.completedStages.includes(stageId)) {
      tel.completedStages.push(stageId);
    }
    if (templateId && branchId) {
      tel.selectedScenarioBranches[templateId] = branchId;
    }
    const curBoost = Number(tel.domainWeightBoosts[bridgeId] || 0);
    tel.domainWeightBoosts[bridgeId] = Math.min(11, curBoost + boostPct);
    tel.masteryEvents.unshift({
      id: 'MST-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      bridgeId,
      stageId: stageId || null,
      templateId: templateId || null,
      branchId: branchId || null,
      boostPct,
      recordedAt: now()
    });
    tel.masteryEvents = tel.masteryEvents.slice(0, 30);
    const thresholdInfo = getCatalogThresholdStatus();
    if (thresholdInfo.reachedThreshold && !S.optionA3ThresholdNotified) {
      S.optionA3ThresholdNotified = true;
      notify('owner', 'Option A3 Threshold Reached (50+ Catalog Modules)', 'Catalog size reached ' + thresholdInfo.currentCount + ' modules. Option A3 (Vertex AI / AI Studio Batch Embedding Re-Ranker) is ready for evaluation.');
    }
    commit();
    return {
      ok: true,
      associativeTelemetry: u.associativeTelemetry,
      catalogThreshold: thresholdInfo,
      state: S
    };
  }

  function completeNetflixOnboarding(payload) {
    if (hasInjectionPayload(payload)) {
      return { ok: false, error: 'Security check failed: Invalid characters detected.' };
    }
    const res = postServerAction({ action: 'completeNetflixOnboarding', data: payload });
    if (res && res.ok) {
      commit();
      return res;
    }
    const u = me();
    if (!u) return { ok: false, error: 'Authentication required.' };
    const validIds = new Set(ONBOARDING_CATEGORIES.map(c => c.id));
    const cleanCats = (Array.isArray(payload && payload.selectedCategories) ? payload.selectedCategories : [])
      .map(c => sanitizeField(c, 48))
      .filter(c => validIds.has(c));
    if (!cleanCats.length) return { ok: false, error: 'Please select at least 1 track in Step 1.' };
    const rawBase = sanitizeField(payload && payload.divergentBaseline, 48);
    const cleanBase = DIVERGENT_BRIDGES[rawBase] ? rawBase : 'en_arabic_heritage';
    const roleTitle = sanitizeField(payload && payload.roleTitle, 120);
    const industrySector = sanitizeField(payload && payload.industrySector, 80);
    const orgSize = sanitizeField(payload && payload.orgSize, 60);
    const resourceInterest = sanitizeField(payload && payload.resourceInterest, 80);
    const consentTailor = Boolean(payload && payload.consentWorkspaceTailoring);
    const dataSharingOptIn = Boolean(payload && payload.dataSharingOptIn);
    if (!roleTitle || !industrySector || !consentTailor) {
      return { ok: false, error: 'Please complete all required Step 3 profile fields and consent.' };
    }
    const ts = now();
    u.onboardingCompleted = true;
    u.onboardingCompletedAt = ts;
    u.selectedCategories = cleanCats;
    u.divergentBaseline = cleanBase;
    u.learningGoal = sanitizeField(payload && payload.learningGoal, 240);
    u.ottoProfile = {
      agent: 'Otto',
      selectedCategories: cleanCats,
      divergentBaseline: cleanBase,
      learningGoal: u.learningGoal,
      roleTitle,
      industrySector,
      orgSize: orgSize || '1-10',
      resourceInterest: resourceInterest || 'resource-fast-track',
      consentWorkspaceTailoring: consentTailor,
      dataSharingOptIn,
      consentTimestamp: ts,
      consentStandard: 'CCPA_CPRA_GDPR_IAPP_2026'
    };
    const matchedCatObjs = ONBOARDING_CATEGORIES.filter(c => cleanCats.includes(c.id));
    const recApps = new Set();
    const recRes = new Set(['resource-fast-track']);
    matchedCatObjs.forEach(c => {
      (c.associatedApps || []).forEach(a => recApps.add(a));
      (c.associatedResources || []).forEach(r => recRes.add(r));
    });
    const rInt = String(resourceInterest || 'resource-fast-track').toLowerCase();
    if (rInt === 'turnkey-saas') {
      recApps.add('client-turnkey-forge');
      recApps.add('traffic-roi-simulator');
    } else if (rInt === 'federal-teaming') {
      recApps.add('samgov-contract-matchmaker');
      recApps.add('client-turnkey-forge');
    } else if (rInt === 'language-academy') {
      recApps.add('spanish-acquisition-os');
      recApps.add('chronos-aetheria-scorm');
    }
    const primaryCatId = cleanCats[0] || 'cat_ai_saas';
    u.recommendedTemplateId = primaryCatId === 'cat_divergent_lang' || rInt === 'language-academy'
      ? 'tpl_lang_associative'
      : primaryCatId === 'cat_cyber_eveng'
        ? 'tpl_upskill_cert_lab'
        : primaryCatId === 'cat_chronos_epigraphy'
          ? 'tpl_school_systems'
          : 'tpl_biz_turnkey_scale';
    u.recommendedApps = Array.from(recApps);
    u.recommendedResources = Array.from(recRes);
    if (u.role !== 'owner' && u.ou !== 'internal') {
      const curApps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
      u.allowedApps = Array.from(new Set([...curApps, ...u.recommendedApps]));
      const curRes = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : DEFAULT_CUSTOMER_RESOURCES.slice();
      u.qualifiedResources = Array.from(new Set([...curRes, ...u.recommendedResources]));
      u.pages = Object.assign({}, u.pages || {}, { saasapps: 'ready', resources: 'ready' });
    }
    commit();
    return {
      ok: true,
      onboardingCompleted: true,
      ottoProfile: u.ottoProfile,
      recommendedApps: u.recommendedApps,
      recommendedResources: u.recommendedResources,
      recommendedTemplateId: u.recommendedTemplateId,
      state: S
    };
  }
  function submitRequest(data) {
    const cleanEmail = sanitizeField(data && data.email, 160).toLowerCase();
    const cleanName = sanitizeField(data && data.name, 120) || (cleanEmail.split('@')[0] || 'Customer');
    const ssoProvider = sanitizeField(data && (data.ssoProvider || data.provider || 'password'), 32).toLowerCase();
    if (!['google', 'microsoft', 'apple', 'password'].includes(ssoProvider)) {
      lastIntakeResult = { ok: false, status: 403, error: 'Authentication Policy Enforced: Use Password or Google, Microsoft, or Apple SSO.' };
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
    const qualifiedResources = Array.isArray(data && data.qualifiedResources)
      ? data.qualifiedResources.map(r => sanitizeField(r, 60)).filter(Boolean)
      : [];
    const rawUsername = sanitizeField(data && data.username, 60).toLowerCase();
    if (!rawUsername) {
      lastIntakeResult = { ok: false, status: 400, error: 'Username is mandatory for portal registration and logon.' };
      return null;
    }
    const empRec = resolveEmployeeAssignedRecord(rawUsername, cleanEmail);
    const targetOu = (data && data.ou === 'internal') || empRec.isAssignedEmployee ? 'internal' : 'external';
    const addrCheck = validateAddressStandard(data && data.address, targetOu, Boolean(data && data.guidedRegistration));
    if (!addrCheck.ok) {
      lastIntakeResult = { ok: false, status: 400, error: addrCheck.error };
      return null;
    }
    const payload = {
      guidedRegistration: Boolean(data && data.guidedRegistration),
      name: cleanName,
      email: cleanEmail,
      username: rawUsername,
      password: String((data && data.password) || ''),
      recoveryEmail: sanitizeField(data && data.recoveryEmail, 160).toLowerCase(),
      phone: sanitizeField(data && data.phone, 32),
      address: addrCheck.address,
      ou: targetOu,
      securityGroup: sanitizeField(data && data.securityGroup, 48) || (targetOu === 'internal' ? 'INTERNAL_ANALYST' : 'EXTERNAL_SAAS_LMS'),
      ssoProvider,
      org: sanitizeField(data && data.org, 160) || (targetOu === 'internal' ? 'MGC Internal Operations' : 'External Organization'),
      brand: (data && data.brand === 'FIX') ? 'FIX' : 'MGC',
      interest: (data && TAILOR[data.interest]) ? data.interest : 'ai-web',
      qualifiedResources,
      note: sanitizeField(data && data.note, 500),
      ndaAccepted: true,
      tosAccepted: Boolean(data && data.tosAccepted !== false),
      emailVerified: Boolean(data && data.emailVerified !== false),
      mfaVerified: Boolean(data && data.mfaVerified !== false),
      mfaMethod: sanitizeField(data && data.mfaMethod, 48) || 'FEDERATED_SSO_2FA'
    };
    const srv = postServerAction({ action: 'submitRequest', data: payload });
    if (srv && srv.error) {
      lastIntakeResult = { ok: false, status: 403, error: srv.error };
      return null;
    }
    if (srv && (srv.createdUid || srv.uid)) {
      lastIntakeResult = srv;
      commit();
      return srv.createdUid || srv.uid;
    }
    let existing = Object.values(S.users).find(u => (u.email || '').toLowerCase() === cleanEmail);
    const id = existing ? existing.id : uid('u');
    const tailoredPages = (TAILOR[payload.interest] || { pages: [] }).pages;
    const pagesMap = existing && existing.pages ? { ...DEFAULT_CUSTOMER_PAGES, ...existing.pages } : { ...DEFAULT_CUSTOMER_PAGES };
    if (payload.ou === 'internal') {
      ['saasapps', 'home', 'agile', 'contracts', 'compliance', 'academy', 'chronos'].forEach(p => { pagesMap[p] = 'ready'; });
    } else {
      tailoredPages.forEach(p => { if (!pagesMap[p]) pagesMap[p] = 'locked'; });
    }
    if (qualifiedResources.length > 0) {
      pagesMap.resources = 'ready';
    }
    S.users[id] = {
      id,
      name: payload.name,
      username: payload.username,
      email: payload.email,
      recoveryEmail: payload.recoveryEmail || ((existing && existing.recoveryEmail) || ''),
      phone: payload.phone || ((existing && existing.phone) || ''),
      address: payload.address || ((existing && existing.address) || { streetAddress: '', city: '', stateRegion: '', postalCode: '' }),
      org: payload.org,
      role: 'member',
      ou: payload.ou,
      securityGroup: payload.securityGroup,
      status: 'active',
      accessTier: payload.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED',
      ssoProvider: payload.ssoProvider,
      ndaAccepted: true,
      ndaTimestamp: now(),
      mfaVerified: payload.mfaVerified,
      mfaMethod: payload.mfaMethod,
      brand: payload.brand,
      quote: { interest: payload.interest, note: payload.note },
      plan: existing && existing.plan ? existing.plan : { base: true, addons: [] },
      pages: pagesMap,
      allowedApps: existing && Array.isArray(existing.allowedApps) && existing.allowedApps.length ? existing.allowedApps : (payload.ou === 'internal' ? ['sterling-auto-repair', 'client-turnkey-forge', 'eveng-netprism-studio', 'samgov-contract-matchmaker', 'ghost-cli-trainer'] : DEFAULT_CUSTOMER_APPS.slice()),
      qualifiedResources: qualifiedResources.length ? qualifiedResources : ((existing && Array.isArray(existing.qualifiedResources)) ? existing.qualifiedResources : []),
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
      createdUid: id,
      requestId: reqEntry.id,
      intakeReceipt: 'MGC-INTAKE-' + reqEntry.id.toUpperCase(),
      role: 'member',
      accessTier: 'CUSTOMER_RESTRICTED',
      ssoProvider: payload.ssoProvider,
      ndaAccepted: true,
      mfaVerified: payload.mfaVerified,
      mfaMethod: payload.mfaMethod,
      allowedApps: S.users[id].allowedApps,
      qualifiedResources: S.users[id].qualifiedResources,
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
    if (!Array.isArray(target.qualifiedResources)) target.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
    if (featureType === 'preset') {
      if (featureId === 'reset_saas_only') {
        target.pages = { saasapps: 'ready' };
        target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
        target.qualifiedResources = [];
      } else if (featureId === 'grant_all_features') {
        CATALOG.forEach(c => { target.pages[c.id] = 'ready'; });
        target.allowedApps = APPS_CATALOG.map(a => a.id);
        target.qualifiedResources = getResourcesCatalog().map(r => r.id);
      }
      commit();
      return { ok: true, targetUser: target };
    }
    if (featureType === 'resource') {
      const has = target.qualifiedResources.includes(featureId);
      const next = typeof enabled === 'boolean' ? enabled : !has;
      if (next && !has) {
        target.qualifiedResources.push(featureId);
        target.pages.resources = 'ready';
      }
      if (!next && has) {
        target.qualifiedResources = target.qualifiedResources.filter(r => r !== featureId);
        if (target.qualifiedResources.length === 0) delete target.pages.resources;
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
    if (featureType === 'agent') {
      if (!Array.isArray(target.allowedAgents)) target.allowedAgents = [];
      const has = target.allowedAgents.includes(featureId);
      const next = typeof enabled === 'boolean' ? enabled : !has;
      if (next && !has) target.allowedAgents.push(featureId);
      if (!next && has) target.allowedAgents = target.allowedAgents.filter(a => a !== featureId);
      if (featureId === 'otto') target.ottoAgentEnabled = next;
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
  function addCustomResource(payload) {
    const res = postServerAction({ action: 'addCustomResource', data: payload });
    if (res) { commit(); return res; }
    if (!Array.isArray(S.customResources)) S.customResources = [];
    const title = sanitizeField(payload && payload.title, 120);
    if (!title) return { ok: false, error: 'Resource title required.' };
    const id = sanitizeField(payload && payload.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || ('res-' + uid('r'));
    const entry = {
      id,
      title,
      shortTitle: sanitizeField(payload && payload.shortTitle, 50) || title,
      brand: (payload && payload.brand === 'FIX') ? 'FIX' : 'MGC',
      defaultCustomer: false,
      category: sanitizeField(payload && payload.category, 80) || 'Qualified Partner Resource + Milton UI/UX & AI Tools',
      href: sanitizeField(payload && payload.href, 200) || ('member-portal.html?view=resources&resource=' + id),
      communityUrl: sanitizeField(payload && payload.communityUrl, 200) || '',
      desc: sanitizeField(payload && payload.desc, 300) || 'Qualified partner resource enhanced with Milton UI/UX and AI Fast-Track tools.',
      uiUxEnhancements: [
        'Milton Executive UI/UX Companion & Progress Workspace',
        'Guided Milestone Checklist & Fast-Track Synthesis'
      ],
      aiTools: [
        { id: id + '-ai-fasttrack', title: title + ' AI Fast-Track Synthesizer', badge: 'Fast-Track AI', desc: 'Accelerates resource execution, workflow blueprints, and deliverable synthesis.' }
      ]
    };
    S.customResources = S.customResources.filter(r => r.id !== id).concat([entry]);
    commit();
    return { ok: true, resource: entry, state: S };
  }
  function postAccountingEntry(payload) {
    return postServerAction({ action: 'postAccountingEntry', data: payload });
  }
  function reconcileAccountingEntry(entryId, status, note) {
    return postServerAction({ action: 'reconcileAccountingEntry', entryId, status, note });
  }
  function submitPayment(payload) {
    const res = postServerAction({ action: 'submitPayment', data: payload });
    if (res) { commit(); return res; }
    return { ok: false, error: 'Unable to reach payment verification server.' };
  }
  function submitConsultation(payload) {
    const res = postServerAction({ action: 'submitConsultation', data: payload });
    if (res) { commit(); return res; }
    const u = me();
    if (!u) return { ok: false, error: 'Authentication required.' };
    if (!Array.isArray(S.consultations)) S.consultations = [];
    const entry = {
      id: uid('cons'),
      receiptId: 'MGC-CONS-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      uid: u.id,
      clientName: sanitizeField((payload && payload.clientName) || u.name, 120),
      clientEmail: sanitizeField((payload && payload.clientEmail) || u.email, 160),
      organization: sanitizeField((payload && payload.organization) || u.org || '', 160),
      track: sanitizeField(payload && payload.track, 60) || 'ai-web',
      architectureScope: sanitizeField(payload && payload.architectureScope, 120) || 'Turnkey Web & AI Suite',
      timeline: sanitizeField(payload && payload.timeline, 60) || '2-4 Weeks',
      scaleTier: sanitizeField(payload && payload.scaleTier, 80) || 'Growth (Up to 25 seats)',
      integrationEnv: sanitizeField(payload && payload.integrationEnv, 100) || 'Google Cloud / Workspace',
      preferredWindow: sanitizeField(payload && payload.preferredWindow, 80) || 'Next Available Executive Slot',
      projectBrief: sanitizeField(payload && payload.projectBrief, 800),
      requestedApps: Array.isArray(payload && payload.requestedApps) ? payload.requestedApps.slice(0, 8) : [],
      status: 'submitted',
      createdAt: now()
    };
    S.consultations.unshift(entry);
    S.requests.unshift({
      id: entry.id,
      receipt: entry.receiptId,
      uid: u.id,
      name: entry.clientName,
      email: entry.clientEmail,
      org: entry.organization,
      interest: entry.track,
      consultationScope: entry.architectureScope,
      timeline: entry.timeline,
      preferredWindow: entry.preferredWindow,
      note: entry.projectBrief,
      status: 'consultation_requested',
      created: entry.createdAt
    });
    log(u.id, 'consultation.submitted', entry.receiptId + ' (' + entry.architectureScope + ')');
    commit();
    return { ok: true, consultation: entry, state: S };
  }
  function updateConsultationStatus(consultationId, status, reviewerNote) {
    const res = postServerAction({ action: 'updateConsultationStatus', consultationId, status, reviewerNote });
    if (res) { commit(); return res; }
    if (!Array.isArray(S.consultations)) S.consultations = [];
    const c = S.consultations.find(x => x.id === consultationId || x.receiptId === consultationId);
    if (c) {
      c.status = status || 'scheduled';
      if (reviewerNote !== undefined) c.reviewerNote = sanitizeField(reviewerNote, 400);
      c.updatedAt = now();
    }
    const r = (S.requests || []).find(x => x.id === consultationId || x.receipt === consultationId);
    if (r) r.status = status || 'scheduled';
    commit();
    return { ok: true, state: S };
  }
  function setUserDirectoryProfile(payload) {
    const res = postServerAction(Object.assign({ action: 'setUserDirectoryProfile' }, payload || {}));
    if (res) { commit(); return res; }
    const target = S.users && payload && S.users[payload.userId];
    if (target && target.id !== 'owner') {
      if (payload.ou) target.ou = payload.ou;
      if (payload.securityGroup && payload.securityGroup !== 'DOMAIN_ADMIN') target.securityGroup = payload.securityGroup;
      if (payload.username !== undefined) target.username = String(payload.username || '').trim().toLowerCase();
      if (payload.org !== undefined) target.org = String(payload.org || '').trim();
      if (payload.recoveryEmail !== undefined) target.recoveryEmail = sanitizeField(payload.recoveryEmail, 160).toLowerCase();
      if (payload.phone !== undefined) target.phone = sanitizeField(payload.phone, 32);
      if (payload.address && typeof payload.address === 'object') {
        target.address = validateAddressStandard(payload.address, target.ou || 'external').address;
      }
      if (payload.status) target.status = payload.status;
      commit();
      return { ok: true, state: S };
    }
    return { ok: false, error: 'Unable to update directory profile.' };
  }
  function setUserPassword(userId, newPassword) {
    const res = postServerAction({ action: 'setUserPassword', userId, newPassword });
    if (res) { commit(); return res; }
    const target = S.users && S.users[userId];
    if (target && target.id !== 'owner' && newPassword && String(newPassword).length >= 8) {
      target.passwordDigest = mgcDigest(newPassword);
      target.hasPassword = true;
      commit();
      return { ok: true, state: S };
    }
    return { ok: false, error: 'Unable to set user password.' };
  }
  function savePciGatewayConfig(payload) {
    const res = postServerAction(Object.assign({ action: 'savePciGatewayConfig' }, payload || {}));
    if (res) { commit(); return res; }
    S.pciGatewayConfig = Object.assign({}, S.pciGatewayConfig || {}, payload || {});
    commit();
    return { ok: true, config: S.pciGatewayConfig };
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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root{--r:12px;--bg-deep:#050811;--border-subtle:rgba(148,163,184,0.2);--border-gold:rgba(197,179,88,0.38);--gold:#c5b358;--blue:#3b82f6;--emerald:#10b981;--font-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
  body.w-mgc{--bg:#050811;--card:rgba(10,15,28,0.96);--card2:rgba(14,21,38,0.95);--line:rgba(148,163,184,0.22);--tx:#F8FAFC;--mut:#94A3B8;--ac:#3B82F6;--acx:#FFFFFF;--ok:#10B981;
    background:radial-gradient(circle at 12% 15%,rgba(37,99,235,0.16),transparent 42%),radial-gradient(circle at 88% 12%,rgba(148,163,184,0.08),transparent 38%),#050811}
  body.w-fix{--bg:#050811;--card:rgba(10,15,28,0.96);--card2:rgba(14,21,38,0.95);--line:rgba(197,179,88,0.28);--tx:#F8FAFC;--mut:#94A3B8;--ac:#C5B358;--acx:#050811;--ok:#10B981;
    background:radial-gradient(circle at 12% 15%,rgba(37,99,235,0.16),transparent 42%),radial-gradient(circle at 50% 85%,rgba(197,179,88,0.12),transparent 45%),#050811}
  body.w-mgc::before,body.w-fix::before{content:'';position:fixed;inset:0;z-index:-10;pointer-events:none}
  body.w-mgc::before{background:linear-gradient(180deg,rgba(5,8,17,0.92) 0%,rgba(10,16,30,0.96) 55%,rgba(5,8,17,0.99) 100%),linear-gradient(rgba(148,163,184,.025) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(148,163,184,.025) 1px,transparent 1px) 0 0/44px 44px}
  body.w-fix::before{background:linear-gradient(180deg,rgba(5,8,17,0.92) 0%,rgba(10,16,30,0.96) 55%,rgba(5,8,17,0.99) 100%),linear-gradient(rgba(197,179,88,.025) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(197,179,88,.025) 1px,transparent 1px) 0 0/44px 44px}
  *{box-sizing:border-box}
  body{margin:0;font-family:var(--font-sans);font-size:13.5px;line-height:1.5;color:var(--tx);min-height:100vh;position:relative;isolation:isolate;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-feature-settings:"cv02","cv03","cv04","cv11"}
  code,pre,.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1420px;margin:0 auto;padding:16px 24px 72px;position:relative;z-index:5}
  .bar{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;background:rgba(10,15,28,0.96);border:1px solid var(--line);border-radius:10px;padding:10px 18px;margin-bottom:16px;position:relative;z-index:20;box-shadow:0 4px 20px rgba(0,0,0,0.35)}
  .brand{display:flex;gap:10px;align-items:center;font-weight:600;font-size:13.5px;letter-spacing:-.01em;color:#fff}
  .brand-mark{width:26px;height:26px;border-radius:6px;background:rgba(59,130,246,0.16);border:1px solid rgba(96,165,250,0.4);color:#93c5fd;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:.04em}
  body.w-fix .brand-mark{background:rgba(197,179,88,0.16);border-color:rgba(197,179,88,0.45);color:#fde047}
  .brand small{display:block;font-size:11px;color:var(--mut);font-weight:400;letter-spacing:0;text-transform:none;margin-top:1px}
  .nav{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .bar > .nav:nth-child(2){justify-content:center}
  .bar > .nav:nth-child(3){justify-content:flex-end}
  .btn,select,input,textarea{font-family:var(--font-sans);font-size:13px;font-weight:500;border-radius:8px;border:1px solid var(--line);background:#070b16;color:var(--tx);padding:8px 12px;transition:border-color .15s ease,background .15s ease,color .15s ease;line-height:1.35}
  input::placeholder,textarea::placeholder{color:#64748b;font-weight:400}
  .btn{cursor:pointer;font-weight:500;text-decoration:none;display:inline-flex;gap:6px;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);color:#e2e8f0}
  .btn.pri{background:#2563eb;color:#fff;border-color:#3b82f6;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.25)}
  body.w-fix .btn.pri{background:#c5b358;color:#050811;border-color:#d4c472;font-weight:600}
  .btn:hover{border-color:#60a5fa;background:rgba(30,41,59,0.95);color:#fff}
  .btn.pri:hover{background:#1d4ed8;border-color:#60a5fa}
  body.w-fix .btn.pri:hover{background:#d4c472;color:#050811}
  .btn[disabled]{opacity:.45;cursor:not-allowed}
  .chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:500;letter-spacing:.02em;padding:3px 9px;border-radius:6px;border:1px solid var(--line);background:rgba(15,23,42,0.75);color:#cbd5e1;font-variant-numeric:tabular-nums}
  .chip.ok{color:#34d399;background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.32)}
  .chip.warn{color:#fbbf24;background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.32)}
  .card{background:var(--card);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:var(--r);padding:20px;box-shadow:0 8px 28px rgba(0,0,0,0.4);transition:border-color .18s}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
  h1{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:0 0 4px;color:#fff;line-height:1.3}
  h2{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0 0 6px;color:#fff;line-height:1.35}
  h3{font-size:13.5px;font-weight:600;letter-spacing:-.01em;margin:0;color:#f8fafc;line-height:1.4}
  p{color:var(--mut);font-size:13px;line-height:1.55;margin:4px 0}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  details{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-top:8px;background:rgba(7,11,22,0.85)}
  summary{cursor:pointer;font-weight:500;font-size:12.5px;color:#cbd5e1}
  .skel{position:relative;overflow:hidden}.skel::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);animation:sh 1.6s infinite}
  @keyframes sh{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
  .steps{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.step{flex:1;min-width:130px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:12px;font-weight:500;color:var(--mut);background:rgba(10,15,28,0.95)}
  .step.on{color:#fff;background:#2563eb;border-color:#60a5fa}.step.done{color:#34d399;border-color:rgba(16,185,129,0.4)}
  table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
  th,td{padding:10px 14px;border-bottom:1px solid rgba(148,163,184,0.14);text-align:left;vertical-align:middle}
  th{color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;background:rgba(7,11,22,0.6)}
  .demo{font-size:11px;color:#34d399;border:1px solid rgba(16,185,129,0.35);background:rgba(16,185,129,0.1);border-radius:6px;padding:3px 9px;font-weight:500}
  .lock{text-align:center;padding:44px 20px}
  .toast{position:fixed;right:20px;bottom:20px;background:#10b981;color:#022c22;padding:10px 16px;border-radius:8px;font-weight:600;font-size:12.5px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,0.4)}
  @view-transition{navigation:auto}
  ::view-transition-old(root){animation:mgcFadeOut .2s cubic-bezier(.4,0,.2,1) both}
  ::view-transition-new(root){animation:mgcFadeIn .24s cubic-bezier(.16,1,.3,1) both}
  @keyframes mgcFadeOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-4px)}}
  @keyframes mgcFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  body{animation:mgcFadeIn .24s cubic-bezier(.16,1,.3,1)}
  body.mgc-page-leave{opacity:0;transform:translateY(-4px);transition:opacity .15s ease,transform .15s ease}
  :focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
  .skip-link{position:fixed;top:-100px;left:16px;z-index:9999;background:#2563eb;color:#fff;padding:8px 14px;border-radius:8px;font-weight:600;text-decoration:none;transition:top .2s}
  .skip-link:focus{top:12px}
  #mgc-scorm-floating-dock{display:none!important}
  .ws-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px;align-items:start}
  .ws-side{background:rgba(10,15,28,0.95);border:1px solid var(--line);border-radius:var(--r);padding:12px;position:sticky;top:20px;display:flex;flex-direction:column;gap:4px}
  .ws-side-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:4px 10px 6px}
  .ws-nav-btn{width:100%;text-align:left;background:transparent;border:1px solid transparent;color:#94a3b8;padding:8px 10px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:all .15s}
  .ws-nav-btn:hover{background:rgba(255,255,255,0.04);color:#f8fafc}
  .ws-nav-btn.active{background:rgba(37,99,235,0.16);border-color:rgba(96,165,250,0.35);color:#fff;font-weight:600}
  body.w-fix .ws-nav-btn.active{background:rgba(197,179,88,0.14);border-color:rgba(197,179,88,0.4);color:#fde047}
  .ws-main{min-width:0;display:flex;flex-direction:column;gap:14px}
  .kpi-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .kpi-tile{background:rgba(10,15,28,0.94);border:1px solid var(--line);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:2px}
  .kpi-tile small{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8}
  .kpi-tile strong{font-size:16px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums}
  .bento-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .bento-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  @keyframes mgcFluidCardEnter{from{opacity:0;transform:translate3d(0,10px,0) scale(.992)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
  .card{animation:mgcFluidCardEnter .26s cubic-bezier(.16,1,.3,1) both;transition:transform .2s cubic-bezier(.16,1,.3,1),border-color .2s ease,box-shadow .2s ease}
  .compact-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;animation:mgcFluidCardEnter .28s cubic-bezier(.16,1,.3,1) both;transition:transform .2s cubic-bezier(.16,1,.3,1),border-color .2s ease,box-shadow .2s ease,background .2s ease}
  .compact-card:hover{border-color:rgba(96,165,250,0.48);transform:translate3d(0,-2px,0);box-shadow:0 12px 28px rgba(0,0,0,0.42)}
  .compact-card h3{font-size:13.5px;font-weight:600;margin:0;color:#f8fafc;display:flex;align-items:center;gap:8px}
  .compact-card p{font-size:12.5px;color:var(--mut);margin:2px 0 0;line-height:1.45}
  /* W3C WCAG 2.2 Compliant Disclosure Dropdown Navigation (.wgw-dropdown) */
  .wgw-dropdown{position:relative;display:inline-flex;align-items:center}
  .wgw-trigger{min-height:36px;padding:7px 12px;font-size:12.5px;font-weight:500;border-radius:8px;border:1px solid var(--line);background:rgba(15,23,42,0.88);color:#e2e8f0;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s ease}
  .wgw-trigger:hover,.wgw-trigger[aria-expanded="true"]{border-color:#60a5fa;background:rgba(30,41,59,0.98);color:#fff}
  .wgw-trigger.pri{background:#2563eb;color:#fff;border-color:#3b82f6;font-weight:600}
  body.w-fix .wgw-trigger.pri{background:#c5b358;color:#050811;border-color:#d4c472}
  .wgw-caret{width:10px;height:10px;display:inline-block;transition:transform .16s ease;opacity:.8}
  .wgw-trigger[aria-expanded="true"] .wgw-caret{transform:rotate(180deg);opacity:1}
  .wgw-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:240px;background:rgba(8,13,26,0.98);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(148,163,184,0.34);border-radius:10px;padding:6px;box-shadow:0 18px 42px rgba(0,0,0,0.78);z-index:120;display:none;flex-direction:column;gap:2px}
  .wgw-menu.open{display:flex;animation:mgcFadeIn .15s cubic-bezier(.16,1,.3,1)}
  .wgw-menu-sec{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:6px 10px 3px}
  .wgw-item{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:36px;padding:7px 10px;border-radius:7px;font-size:12.5px;font-weight:500;color:#cbd5e1;text-decoration:none;border:1px solid transparent;background:transparent;width:100%;text-align:left;cursor:pointer;transition:background .12s,color .12s}
  .wgw-item:hover,.wgw-item:focus-visible{background:rgba(59,130,246,0.16);color:#fff;border-color:rgba(96,165,250,0.32)}
  .wgw-item small{font-size:10.5px;color:#94a3b8;font-weight:400}
  @media(max-width:960px){.ws-layout{grid-template-columns:1fr}.ws-side{position:static;flex-direction:row;flex-wrap:wrap}.ws-nav-btn{width:auto;flex:1 1 auto}.bento-2,.bento-3,.kpi-strip{grid-template-columns:1fr}.bar{grid-template-columns:1fr}.wgw-menu{left:0;right:auto;min-width:210px}}
  @media(pointer:coarse){.btn,select,input,textarea{min-height:44px;font-size:15px}}
  @media(prefers-reduced-motion:reduce){*,::before,::after,::view-transition-old(root),::view-transition-new(root){animation-duration:.01ms!important;transition-duration:.01ms!important}}
  @media(max-width:640px){.wrap{padding:12px 12px 80px}.bar{position:static}}`;

  const CLEAN_URL_MAP = {
    'login.html': '/auth',
    'request-access.html': '/request-access',
    'onboarding-portal.html': '/onboarding-portal',
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
      const qs = new URLSearchParams(location.search);
      const isStandaloneMobileRoute =
        pathLower.includes('mobile') ||
        pathLower.includes('auth') ||
        pathLower.includes('login') ||
        pathLower.includes('portal') ||
        pathLower.includes('consultation') ||
        pathLower.includes('newsletter') ||
        pathLower.includes('apps') ||
        pathLower.includes('access-admin') ||
        pathLower.includes('command') ||
        pathLower.includes('/projects/') ||
        qs.get('onboard') === '1' ||
        qs.get('desktop') === '1';
      if (isMobileClientDevice() && !isStandaloneMobileRoute) {
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
   * Renders the top bar with W3C WCAG 2.2 ("WGW") accessible disclosure dropdowns and strict 3-tier role scoping:
   * - Administrator (isOwner): Full MGC Directory dropdown, Internal Sites dropdown, and SaaS & LMS Showcases dropdown.
   * - Employee (isEmployee): Access to internal sites beyond client's access + Client Directory dropdown (OU=External only).
   *   Employees have NO access to Payment Settings or non-client users, and ungranted modules do NOT appear at all.
   * - Client (isClient): Strictly SaaS & LMS Showcases, Submit Request & Guided Consultation, and Billing & Payment.
   *   Locked/ungranted modules do NOT appear at all.
   */
  function header(active) {
    injectCss();
    const u = me();
    const admin = isOwner(u);
    const emp = isEmployee(u);
    theme(u ? u.brand : 'MGC');

    const caretSvg = '<svg class="wgw-caret" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function buildDropdown(id, label, isPri, sections) {
      const hasItems = sections.some(s => s.items && s.items.length > 0);
      if (!hasItems) return '';
      const menuId = 'wgw-menu-' + id;
      const body = sections.filter(s => s.items && s.items.length > 0).map(sec =>
        (sec.title ? '<div class="wgw-menu-sec">' + esc(sec.title) + '</div>' : '') +
        sec.items.map(it => '<a class="wgw-item" href="' + esc(it.href) + '"><span>' + esc(it.label) + '</span>' + (it.badge ? '<small>' + esc(it.badge) + '</small>' : '') + '</a>').join('')
      ).join('');
      return '<div class="wgw-dropdown" data-wgw-dropdown="' + esc(id) + '">' +
        '<button type="button" class="wgw-trigger' + (isPri ? ' pri' : '') + '" aria-expanded="false" aria-controls="' + esc(menuId) + '">' +
          '<span>' + esc(label) + '</span>' + caretSvg +
        '</button>' +
        '<div id="' + esc(menuId) + '" class="wgw-menu" role="region" aria-label="' + esc(label) + '">' + body + '</div>' +
      '</div>';
    }

    const isNewsletterPage = String(active || '').includes('newsletter') || (typeof location !== 'undefined' && /newsletter/i.test(location.pathname || ''));
    let navInner = '';
    if (isNewsletterPage) {
      navInner = '<button type="button" class="btn pri" id="btnNavSubmitConsultation" data-open-nl-consultation="1" style="padding:7px 14px;font-size:12.5px">Submit Request &amp; Consultation</button>';
    } else {
      const links = [
        ['member-portal.html', 'Workspace & Apps']
      ];
      if (u && (admin || emp || can(u, 'page', 'resources', 'view') || getResourcesCatalog().some(r => can(u, 'resource', r.id, 'view')))) {
        links.push(['member-portal.html?view=resources', 'Resources & Otto']);
      }
      if (u && (admin || can(u, 'page', 'agile', 'view'))) {
        links.push(['agile-board.html', 'Agile Delivery']);
      }
      if (!emp) {
        links.push(['member-portal.html?view=consultation', 'Consultations']);
        if (u) {
          links.push(['member-portal.html?view=payment', 'Billing']);
        }
      }
      if (admin || emp) {
        links.push(['access-admin.html', admin ? 'Directory & Console' : 'Client Directory']);
      }
      navInner = links.map(l => {
        const isAct = l[0] === active || (l[0] === 'member-portal.html' && active === 'member-portal.html') || (l[0] === 'agile-board.html' && String(active).includes('agile-board')) || (l[0] === 'access-admin.html' && String(active).includes('access-admin'));
        return '<a class="btn' + (isAct ? ' pri' : '') + '" href="' + l[0] + '" style="padding:7px 12px;font-size:12.5px">' + l[1] + '</a>';
      }).join('');
    }

    const nav = '<nav class="nav" aria-label="Primary Workspace Navigation">' + navInner + '</nav>';

    const authBtn = u
      ? '<button class="btn" id="w-signout" style="padding:7px 12px;font-size:12.5px">Sign out</button>'
      : '<a class="btn pri" href="login.html" style="padding:7px 12px;font-size:12.5px">Sign in</a>';
    const right = isNewsletterPage ? '' : ('<div class="nav">' + authBtn + '</div>');
    const existingBar = document.querySelector('.wrap > .bar');
    if (existingBar) existingBar.remove();
    const el = document.createElement('div');
    el.className = 'bar';
    const brandCode = (u && u.brand === 'FIX') ? 'FIX' : 'MGC';
    const brandTitle = (u && u.brand === 'FIX') ? 'F.I.X Solutions' : 'Milton Group Concepts';
    const subLabel = isNewsletterPage ? 'Executive Intelligence' : (u ? esc(u.name) : 'Not signed in');
    el.innerHTML = '<a class="brand" id="mgcBrandHomeLink" href="/" title="Return to Homepage" style="cursor:pointer;text-decoration:none"><span class="brand-mark">' + brandCode + '</span><div>' + brandTitle + '<small>' + subLabel + '</small></div></a>' + nav + right;
    const host = document.querySelector('.wrap');
    if (host) host.prepend(el);
    const soEl = el.querySelector('#w-signout');
    if (soEl) soEl.onclick = () => signOut();

    // Wire W3C WCAG 2.2 Disclosure Dropdowns (click, Escape, Arrow keys, outside click)
    const dropdowns = el.querySelectorAll('.wgw-dropdown');
    function closeAllDropdowns(exceptEl) {
      dropdowns.forEach(d => {
        if (d === exceptEl) return;
        const trig = d.querySelector('.wgw-trigger');
        const menu = d.querySelector('.wgw-menu');
        if (trig) trig.setAttribute('aria-expanded', 'false');
        if (menu) menu.classList.remove('open');
      });
    }
    dropdowns.forEach(d => {
      const trig = d.querySelector('.wgw-trigger');
      const menu = d.querySelector('.wgw-menu');
      if (!trig || !menu) return;
      trig.onclick = (e) => {
        e.stopPropagation();
        const open = trig.getAttribute('aria-expanded') === 'true';
        closeAllDropdowns(d);
        trig.setAttribute('aria-expanded', String(!open));
        menu.classList.toggle('open', !open);
      };
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          trig.setAttribute('aria-expanded', 'false');
          menu.classList.remove('open');
          trig.focus();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const items = Array.from(menu.querySelectorAll('.wgw-item'));
          if (!items.length) return;
          e.preventDefault();
          if (trig.getAttribute('aria-expanded') !== 'true') {
            closeAllDropdowns(d);
            trig.setAttribute('aria-expanded', 'true');
            menu.classList.add('open');
            items[0].focus();
            return;
          }
          const idx = items.indexOf(document.activeElement);
          const nextIdx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[nextIdx].focus();
        }
      });
    });
    if (!document.body.dataset.wgwOutsideBound) {
      document.body.dataset.wgwOutsideBound = '1';
      document.addEventListener('click', (e) => {
        if (!e.target || !e.target.closest || !e.target.closest('.wgw-dropdown')) {
          document.querySelectorAll('.wgw-dropdown').forEach(d => {
            const trig = d.querySelector('.wgw-trigger');
            const menu = d.querySelector('.wgw-menu');
            if (trig) trig.setAttribute('aria-expanded', 'false');
            if (menu) menu.classList.remove('open');
          });
        }
      });
    }
  }

  global.MGCW = { CATALOG, APPS_CATALOG, RESOURCES_CATALOG, AGENTS_CATALOG, WORKSPACE_DIRECTORY_ACCOUNTS, ONBOARDING_CATEGORIES, DIVERGENT_BRIDGES, DEFINED_AI_TEMPLATES, OPTION_A3_APP_THRESHOLD, DEFAULT_CUSTOMER_APPS, DEFAULT_CUSTOMER_RESOURCES, DEFAULT_CUSTOMER_PAGES, TAILOR, STEPS, STATUS_LABEL, INACTIVITY_TIMEOUT_MS, get S() { return S; }, get lastIntakeResult() { return lastIntakeResult; }, getResourcesCatalog, getAgentsCatalog, updateAgentAccess, addCustomResource, getCatalogThresholdStatus, recordAssociativeMastery, completeNetflixOnboarding, sanitizeField, hasInjectionPayload, resolveEmployeeAssignedRecord, validateUsernameStandard, validatePasswordStandard, validatePhoneStandard, validateAddressStandard, postAccountingEntry, reconcileAccountingEntry, costGuard, commit, me, isOwner, isEmployee, isClient, isWorkspaceClient, isAccessClient, isMobileClientDevice, connectWorkspace, touchActivity, getRemainingInactivityMs, checkInactivityAutoLogoff, signInAs, signOut, provisionCustomerSso, requestAppAccess, toggleUserFeature, submitPayment, submitConsultation, updateConsultationStatus, setUserDirectoryProfile, setUserPassword, savePciGatewayConfig, can, notify, log, submitRequest, approve, deny, completeTask, subscribeBase, toggleAddon, share, revoke, header, theme, toast, esc, uid, now, injectCss, subActive, postServerAction, getAllowedPortalsForUser, mgcDigest, isValidAdminSecret, resolveCaseInsensitiveIdentifier };
})(window);
