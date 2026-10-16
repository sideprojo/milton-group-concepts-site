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
  const CATALOG = [
    { id: 'home',      icon: '🏠', title: 'My Dashboard',          brand: 'ANY', kind: 'page', base: true,  price: 0,  desc: 'Your tailored start page: status, action items, resources.' },
    { id: 'agile',     icon: '🗂️', title: 'Agile Board',           brand: 'ANY', kind: 'app',  base: true,  price: 0,  desc: 'Backlog, sprint board and feature requests for shared projects.' },
    { id: 'resources', icon: '📚', title: 'Curated Resources',     brand: 'ANY', kind: 'page', base: true,  price: 0,  desc: 'Links, templates and real-life workflows matched to your quote.' },
    { id: 'radar',     icon: '🎯', title: 'Contract Radar',        brand: 'FIX', kind: 'app',  base: false, price: 9,  desc: 'Federal opportunity feed filtered to your NAICS codes.' },
    { id: 'compliance',icon: '🔒', title: 'Compliance Tracker',    brand: 'MGC', kind: 'page', base: false, price: 7,  desc: 'CMMC / Zero-Trust checklist with evidence upload.' },
    { id: 'ailab',     icon: '🤖', title: 'AI Workflow Lab',       brand: 'MGC', kind: 'app',  base: false, price: 12, desc: 'Prompt, agent and automation templates for your business.' },
    { id: 'finance',   icon: '💳', title: 'Cashflow & Invoicing',  brand: 'FIX', kind: 'page', base: false, price: 8,  desc: 'Invoice tracker, WAWF/PIEE checklist, runway view.' },
    { id: 'training',  icon: '🎓', title: 'Skills Academy',        brand: 'MGC', kind: 'page', base: false, price: 10, desc: 'Guided labs and exam practice (step-gated learning).' }
  ];
  const STEPS = ['requested', 'approved_building', 'active'];
  const STATUS_LABEL = { requested: 'Pending approval', approved_building: 'Pages being built', active: 'Active', denied: 'Not approved', suspended: 'Suspended' };

  /* ---------- Tailoring: quote interest -> curated content (resources, actions, workflows) ---------- */
  const TAILOR = {
    'ai-web': { label: 'AI website & agent', pages: ['ailab', 'finance'],
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
    'training': { label: 'Skills & certification', pages: ['training', 'ailab'],
      actions: ['Pick one target certification', 'Block 5 study sessions this week', 'Complete diagnostic quiz', 'Book exam date'],
      resources: [['Cisco Learning Network', 'https://learningnetwork.cisco.com/'], ['Microsoft Learn', 'https://learn.microsoft.com/training/'], ['Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/']],
      workflows: ['Diagnostic → weak domains → targeted labs → practice exam → retake gaps'] }
  };

  /* ---------- Seed (demo users cover every lifecycle state) ---------- */
  function seed() {
    const t = now();
    const mk = (id, name, email, role, status, brand, interest, paid, pages) => ({ id, name, email, role, status, brand, quote: { interest, note: '' }, plan: { base: paid, addons: [] }, pages: pages || {}, created: t });
    return {
      v: 1,
      users: {
        owner: mk('owner', 'Malik K. (Owner)', 'owner@miltongroupsecurity.org', 'owner', 'active', 'MGC', 'federal', true, { home: 'ready', agile: 'ready', resources: 'ready', radar: 'ready', compliance: 'ready', ailab: 'ready', finance: 'ready', training: 'ready' }),
        ana: mk('ana', 'Ana (demo: just requested)', 'ana@example.com', 'member', 'requested', 'MGC', 'cyber', false, {}),
        ben: mk('ben', 'Ben (demo: pages being built)', 'ben@example.com', 'member', 'approved_building', 'FIX', 'federal', false, { home: 'pending', agile: 'pending', resources: 'pending', radar: 'pending', compliance: 'pending' }),
        cara: mk('cara', 'Cara (demo: active, paid)', 'cara@example.com', 'member', 'active', 'FIX', 'ai-web', true, { home: 'ready', agile: 'ready', resources: 'ready', ailab: 'ready', finance: 'pending' })
      },
      shares: [], tasks: [], notifications: [], audit: [],
      projects: { p1: { id: 'p1', name: 'Shared: Website launch', owner: 'owner', brand: 'FIX' }, p2: { id: 'p2', name: 'Internal: Q4 platform', owner: 'owner', brand: 'MGC' } },
      items: [
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

  /* ---------- db adapter (swap for Firestore in production) ---------- */
  const db = {
    load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) {} const s = seed(); localStorage.setItem(KEY, JSON.stringify(s)); return s; },
    save(s) { localStorage.setItem(KEY, JSON.stringify(s)); },
    reset() { localStorage.removeItem(KEY); sessionStorage.removeItem('mgcw.uid'); }
  };
  let S = db.load();
  const commit = () => db.save(S);
  const me = () => S.users[sessionStorage.getItem('mgcw.uid') || ''] || null;
  const signInAs = (id) => { sessionStorage.setItem('mgcw.uid', id); };
  const log = (actor, action, detail) => { S.audit.unshift({ id: uid('a'), ts: now(), actor, action, detail }); S.audit = S.audit.slice(0, 200); };
  const notify = (toUid, title, body, channel) => { S.notifications.unshift({ id: uid('n'), toUid, title, body, channel: channel || 'in-app + email', ts: now(), read: false }); };

  /* ---------- Policy: deny by default. Mirrors firestore.rules ---------- */
  function subActive(u) { return u && (u.role === 'owner' || (u.plan && u.plan.base && u.status === 'active')); }
  function can(u, type, id, action) {
    if (!u) return false;
    if (u.role === 'owner') return true;                          // owner: everything
    if (!subActive(u)) return false;                              // members need a paid, active account for anything
    if (type === 'page') {
      const entry = CATALOG.find(c => c.id === id);
      if (!entry || action !== 'view') return false;
      if (u.pages[id] !== 'ready') return false;                  // pending pages are never openable
      const included = ((TAILOR[u.quote.interest] || { pages: [] }).pages).includes(id);
      return entry.base || included || (u.plan.addons || []).includes(id);
    }
    if (type === 'project') {
      const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
      if (!sh) return false;
      return action === 'view' ? true : sh.perms.includes(action);
    }
    if (type === 'element') return S.shares.some(s => s.type === 'element' && s.resource === id && s.grantee === u.id);
    return false;
  }
  function addonOk(u, id) { return (u.plan.addons || []).includes(id); }

  /* ---------- Lifecycle workflow ---------- */
  function submitRequest(data) {
    const id = uid('u');
    S.users[id] = { id, name: data.name, email: data.email, role: 'member', status: 'requested', brand: data.brand, quote: { interest: data.interest, note: data.note || '' }, plan: { base: false, addons: [] }, pages: {}, created: now() };
    S.requests.unshift({ id: uid('r'), uid: id, status: 'requested', created: now() });
    notify(id, 'Request received', 'Thanks! Your access request is under review. You will be notified when your pages are ready.');
    notify('owner', 'New access request', data.name + ' requested access (' + (TAILOR[data.interest] || {}).label + ').', 'in-app + email + push');
    log(id, 'request.created', data.email);
    commit(); return id;
  }
  function approve(userId) {
    const u = S.users[userId]; if (!u) return;
    u.status = 'approved_building';
    const wanted = ['home', 'agile', 'resources'].concat((TAILOR[u.quote.interest] || { pages: [] }).pages);
    wanted.forEach(p => { u.pages[p] = 'pending'; S.tasks.push({ id: uid('t'), uid: userId, page: p, title: 'Build "' + CATALOG.find(c => c.id === p).title + '" for ' + u.name, done: false }); });
    const r = S.requests.find(x => x.uid === userId); if (r) r.status = 'approved';
    log('owner', 'request.approved', u.email);
    commit();
  }
  function deny(userId) { const u = S.users[userId]; if (!u) return; u.status = 'denied'; const r = S.requests.find(x => x.uid === userId); if (r) r.status = 'denied'; notify(userId, 'Request update', 'We are unable to approve this request right now.'); log('owner', 'request.denied', u.email); commit(); }
  function completeTask(taskId, done) {
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
  function subscribeBase(userId) { const u = S.users[userId]; u.plan.base = true; log(userId, 'billing.base_active', '$5/mo (prototype: no real charge)'); commit(); }
  function toggleAddon(userId, pageId) {
    const u = S.users[userId]; const a = u.plan.addons = u.plan.addons || [];
    const i = a.indexOf(pageId); if (i >= 0) a.splice(i, 1); else { a.push(pageId); if (u.pages[pageId] !== 'ready') { u.pages[pageId] = 'pending'; S.tasks.push({ id: uid('t'), uid: userId, page: pageId, title: 'Build add-on "' + CATALOG.find(c => c.id === pageId).title + '" for ' + u.name, done: false }); notify('owner', 'Add-on requested', u.name + ' subscribed to ' + pageId); } }
    log(userId, 'billing.addon', pageId); commit();
  }
  function share(grantee, type, resource, perms) {
    S.shares = S.shares.filter(s => !(s.type === type && s.resource === resource && s.grantee === grantee));
    S.shares.push({ id: type + '_' + resource + '_' + grantee, type, resource, grantee, perms, created: now() });
    notify(grantee, 'Something was shared with you', type + ': ' + resource + ' (' + perms.join(', ') + ')');
    log('owner', 'share.grant', type + ':' + resource + ' -> ' + grantee); commit();
  }
  function revoke(id) { const s = S.shares.find(x => x.id === id); S.shares = S.shares.filter(x => x.id !== id); if (s) log('owner', 'share.revoke', id); commit(); }

  /* ---------- Themed shell (MGC gray/black/white, F.I.X navy/gold, with external-site backdrops) ---------- */
  const CSS = `
  :root{--r:14px}
  body.w-mgc{--bg:#09090B;--card:#141519;--card2:#18181B;--line:#3F3F46;--tx:#FAFAFA;--mut:#A1A1AA;--ac:#FFFFFF;--acx:#09090B;--ok:#E4E4E7;
    background:radial-gradient(circle at 15% 15%,#1b1b20 0%,#050507 65%)}
  body.w-fix{--bg:#0B1426;--card:#111d36;--card2:#16233f;--line:rgba(197,179,88,.38);--tx:#F8FAFC;--mut:#94A3B8;--ac:#FDE047;--acx:#0B1426;--ok:#C5B358;
    background:radial-gradient(circle at 16% 14%,rgba(197,179,88,.16),transparent 42%),radial-gradient(circle at 84% 18%,rgba(45,55,72,.55),transparent 45%),#0B1426}
  body.w-mgc::before,body.w-fix::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none}
  body.w-mgc::before{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23E4E4E7' stroke-width='3'/><path d='M26 76V42l24 22 24-22v34' fill='none' stroke='%23A1A1AA' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat 96% 94%/min(26vw,320px),linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/44px 44px;opacity:.5}
  body.w-fix::before{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'><path d='M50 4 92 20v36c0 30-19 50-42 60C27 106 8 86 8 56V20z' fill='none' stroke='%23C5B358' stroke-width='3'/><path d='M30 38h40M30 58h28M30 78h34' stroke='%23FDE047' stroke-width='5' stroke-linecap='round'/></svg>") no-repeat 96% 94%/min(26vw,320px),linear-gradient(rgba(197,179,88,.05) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,rgba(197,179,88,.05) 1px,transparent 1px) 0 0/44px 44px;opacity:.5}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--tx);min-height:100vh}
  a{color:inherit}
  .wrap{max-width:1180px;margin:0 auto;padding:14px 16px 70px}
  .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;position:sticky;top:8px;z-index:20;backdrop-filter:blur(10px)}
  .brand{display:flex;gap:10px;align-items:center;font-weight:900;letter-spacing:.03em}
  .brand small{display:block;font-size:10px;color:var(--mut);font-weight:700;letter-spacing:.1em;text-transform:uppercase}
  .nav{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .btn,select,input,textarea{font:inherit;font-size:12px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--tx);padding:7px 11px}
  .btn{cursor:pointer;font-weight:800;text-decoration:none;display:inline-flex;gap:6px;align-items:center}
  .btn.pri{background:var(--ac);color:var(--acx);border-color:var(--ac)}
  .btn:hover{border-color:var(--ac)}.btn[disabled]{opacity:.45;cursor:not-allowed}
  .chip{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mut)}
  .chip.ok{color:var(--acx);background:var(--ac);border-color:var(--ac)}.chip.warn{color:var(--ac);border-color:var(--ac)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}p{color:var(--mut);font-size:13px;line-height:1.5;margin:4px 0}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  details{border:1px solid var(--line);border-radius:10px;padding:8px 11px;margin-top:8px}summary{cursor:pointer;font-weight:800;font-size:12px}
  .skel{position:relative;overflow:hidden}.skel::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);animation:sh 1.6s infinite}
  @keyframes sh{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
  .steps{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.step{flex:1;min-width:130px;padding:9px;border:1px solid var(--line);border-radius:10px;font-size:11px;font-weight:800;color:var(--mut)}
  .step.on{color:var(--acx);background:var(--ac);border-color:var(--ac)}.step.done{color:var(--ok);border-color:var(--ok)}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
  .demo{font-size:10px;color:var(--mut);border:1px dashed var(--line);border-radius:8px;padding:3px 8px}
  .lock{text-align:center;padding:40px 16px}
  .toast{position:fixed;right:16px;bottom:16px;background:var(--ac);color:var(--acx);padding:10px 14px;border-radius:10px;font-weight:800;font-size:12px;z-index:99}
  @media(max-width:640px){.wrap{padding:10px 10px 90px}.bar{position:static}}`;

  function injectCss() { if (document.getElementById('w-css')) return; const s = document.createElement('style'); s.id = 'w-css'; s.textContent = CSS; document.head.appendChild(s); }
  function theme(brand) { document.body.classList.remove('w-mgc', 'w-fix'); document.body.classList.add(brand === 'FIX' ? 'w-fix' : 'w-mgc'); }
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
  function unread(uidv) { return S.notifications.filter(n => n.toUid === uidv && !n.read).length; }

  /** Renders the top bar. `active` = current page file; sign-in switcher is DEMO ONLY. */
  function header(active) {
    injectCss(); const u = me(); theme(u ? u.brand : 'MGC');
    const links = [['member-portal.html', 'My Workspace'], ['agile-board.html', 'Agile Board']].concat(u && u.role === 'owner' ? [['access-admin.html', 'Access Admin']] : []);
    const opts = Object.values(S.users).map(x => '<option value="' + x.id + '"' + (u && u.id === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
    const nav = '<div class="nav">' + links.map(l => '<a class="btn' + (l[0] === active ? ' pri' : '') + '" href="' + l[0] + '">' + l[1] + '</a>').join('') + '</div>';
    const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
    const right = '<div class="nav">' + (isLocal ? '<span class="demo" title="Real sign-in = Firebase Auth. This switcher exists only so you can review each user\'s view.">DEMO sign-in</span><select id="w-as" aria-label="View as user"><option value="">— signed out —</option>' + opts + '</select>' : '') + (u ? '<a class="btn" href="member-portal.html#inbox">🔔 ' + unread(u.id) + '</a>' : '') + (isLocal ? '<button class="btn" id="w-reset" title="Reset demo data">↺</button>' : '') + '</div>';
    const el = document.createElement('div'); el.className = 'bar';
    el.innerHTML = '<div class="brand"><span style="font-size:20px">' + (u && u.brand === 'FIX' ? '⚡' : '🛡️') + '</span><div>' + (u && u.brand === 'FIX' ? 'F.I.X SOLUTIONS' : 'MGC WORKSPACE') + '<small>' + (u ? esc(STATUS_LABEL[u.status]) + ' · ' + u.role : 'signed out') + '</small></div></div>' + nav + right;
    const host = document.querySelector('.wrap'); host.prepend(el);
    const asEl = el.querySelector('#w-as'); if (asEl) asEl.onchange = (e) => { if (e.target.value) signInAs(e.target.value); else sessionStorage.removeItem('mgcw.uid'); location.reload(); };
    const rsEl = el.querySelector('#w-reset'); if (rsEl) rsEl.onclick = () => { if (confirm('Reset all demo data?')) { db.reset(); location.reload(); } };
  }

  global.MGCW = { CATALOG, TAILOR, STEPS, STATUS_LABEL, get S() { return S; }, commit, me, signInAs, can, notify, log, submitRequest, approve, deny, completeTask, subscribeBase, toggleAddon, share, revoke, header, theme, toast, esc, uid, now, injectCss, subActive };
})(window);
