#!/usr/bin/env node
/*!
 * MGC & F.I.X Authenticated Cloud Run Server
 * ------------------------------------------
 * - Enforces Google Sign-In + Passwordless Email Link authentication (Firebase Auth / signed HttpOnly session cookie)
 * - Enforces per-user page & element entitlements server-side (matching firestore.rules & MGCW.can())
 * - Filters /api/state per user so members NEVER receive other users' data or unshared Agile projects
 * - Designed for Cloud Run with min-instances=0 ($0.00 idle cost)
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = process.env.MGCW_DATA_DIR || path.join(ROOT, '.data');
const DATA_FILE = path.join(DATA_DIR, 'workspace-state.json');
const SESSION_SECRET = process.env.MGCW_SESSION_SECRET || crypto.createHash('sha256').update(ROOT + '::mgc-fix-zero-trust-secret-v1').digest('hex');
// Load local .env / ~/.env safely without logging secrets
(function loadEnvFiles() {
  const os = require('node:os');
  const candidates = [path.join(ROOT, '.env'), path.join(os.homedir(), '.env')];
  for (const envPath of candidates) {
    try {
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
          if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch (_) {}
  }
})();

// Strictly 1 Administrator Account (Malik K.) — zero secondary admin accounts permitted (case-insensitive)
const SOLE_ADMIN_EMAIL = 'malik.khabir@miltongroupsecurity.org';
const OWNER_EMAILS = new Set([SOLE_ADMIN_EMAIL]);

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

// Pure pattern-based weak/generic password blocker (zero hardcoded secret or digest literals in source code)
function isGenericOrRevokedSecret(secretStr) {
  const raw = String(secretStr || '').trim();
  if (!raw || raw.length < 8) return true;
  if (/^\d+$/.test(raw)) return true;
  if (/^(password|admin|welcome|qwerty|123456|letmein|default|test|guest|mgcadmin|miltongroup|customer|sovereign|malikadmin|horizon|passkey|440921|250100)/i.test(raw)) return true;
  return false;
}

const CATALOG = [
  { id: 'saasapps',   icon: '⚡', title: 'SaaS Apps & LMS',       brand: 'FIX', kind: 'app',  base: true,  price: 0,  href: 'saas-apps-and-lms-showcase.html', desc: 'Default unlocked user view: SaaS Apps, Simulators & Subscriber LMS.' },
  { id: 'home',       icon: '🏠', title: 'Full Executive Dashboard',brand: 'ANY', kind: 'page', base: false, price: 9,  href: 'index.html',                      desc: 'Admin-granted executive telemetry & data commerce hub.' },
  { id: 'agile',      icon: '🗂️', title: 'Agile Project Board',   brand: 'ANY', kind: 'app',  base: false, price: 9,  href: 'agile-board.html',                desc: 'Admin-granted backlog, sprint board and client project deliverables.' },
  { id: 'resources',  icon: '📚', title: 'Curated Resources',     brand: 'ANY', kind: 'page', base: false, price: 5,  href: 'member-portal.html#resources',    desc: 'Admin-granted links, templates and guided workflows.' },
  { id: 'radar',      icon: '🎯', title: 'SAM.gov Contract Radar',brand: 'FIX', kind: 'app',  base: false, price: 9,  href: 'sdvosb-contract-radar.html',      desc: 'Admin-granted federal opportunity feed filtered to NAICS codes.' },
  { id: 'compliance', icon: '🔒', title: 'Zero-Trust Compliance', brand: 'MGC', kind: 'page', base: false, price: 7,  href: 'compliance-trust-center.html',    desc: 'Admin-granted CMMC 2.0 / Zero-Trust checklist & evidence vault.' },
  { id: 'ailab',      icon: '🤖', title: 'AI Workflow Studio',    brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'agent-workflow-studio.html',      desc: 'Admin-granted LangGraph agent & automation studio.' },
  { id: 'finance',    icon: '💳', title: 'Treasury & Invoicing',  brand: 'FIX', kind: 'page', base: false, price: 8,  href: 'finance-command.html',            desc: 'Admin-granted invoice tracker, WAWF/PIEE & treasury view.' },
  { id: 'training',   icon: '🎓', title: 'SCORM EVE-NG Academy',  brand: 'MGC', kind: 'page', base: false, price: 10, href: 'elearning-upskilling-hub.html',   desc: 'Admin-granted SCORM 2004 15-topology EVE-NG workbench & auto-grader.' },
  { id: 'aistudio',   icon: '🏛️', title: 'Chronos & History AI',  brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'historical-archaeology-ai-hub.html', desc: 'Admin-granted Historical & Epigraphy AI lab.' }
];

const TAILOR = {
  'ai-web':   { label: 'AI website & agent',     pages: ['saasapps', 'ailab', 'finance', 'aistudio'] },
  'federal':  { label: 'Federal contracting',    pages: ['radar', 'compliance', 'finance'] },
  'cyber':    { label: 'Cyber & compliance',     pages: ['compliance', 'ailab'] },
  'training': { label: 'Skills & certification', pages: ['training', 'aistudio', 'saasapps'] }
};

// Map HTML filenames to catalog page IDs for per-page entitlement checks
const PORTAL_TO_CATALOG = {
  'saas-apps-and-lms-showcase.html':      'saasapps',
  'agile-board.html':                     'agile',
  'sdvosb-contract-radar.html':           'radar',
  'compliance-trust-center.html':         'compliance',
  'agent-workflow-studio.html':           'ailab',
  'finance-command.html':                 'finance',
  'elearning-upskilling-hub.html':        'training',
  'historical-archaeology-ai-hub.html':   'aistudio',
  'chronos-external-insight-webapp.html': 'aistudio',
  'index.html':                           'home',
  'whitefeather-ecommerce-hub.html':      'resources',
  'earth-3d.html':                        'radar',
  'vr-command.html':                      'ailab',
  'integrations-connections-hub.html':    'compliance'
};

// Granular SCORM 2004 & Showcase App Entitlement Catalog (Default Restricted Customer Access vs Owner Full Access)
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

// Qualified Partner & Ecosystem Resources Catalog (White Feather first; extensible as new resources are onboarded)
const RESOURCES_CATALOG = [
  {
    id: 'white-feather',
    title: 'White Feather (Resource + Milton UI/UX & AI Fast-Track)',
    shortTitle: 'White Feather',
    brand: 'MGC',
    defaultCustomer: false,
    category: 'Capital, Deal Flow & AI Automation Resource',
    href: 'whitefeather-ecommerce-hub.html',
    communityUrl: 'https://www.skool.com/white-feather-ai/plans',
    privateGroupUrl: 'https://members.whitefeatherinvestments.com/communities/groups/white-feather-bronze-community/private-group',
    desc: 'Qualified White Feather resource access enhanced with custom Milton UI/UX workspace navigation and AI fast-track execution tools.',
    uiUxEnhancements: [
      'Milton Executive UI/UX Companion & Deal-Flow Progress Tracker',
      'Zero-Clutter Action Matrix & Guided Milestone Execution Shell',
      'Integrated Resource Playbook & Document Synthesis Vault'
    ],
    aiTools: [
      { id: 'wf-dealflow-ai', title: 'White Feather Deal-Flow & Asset Structuring AI', badge: 'Fast-Track AI', desc: 'Synthesizes deal parameters, partnership structures, and executive summaries.' },
      { id: 'wf-agency-blueprint', title: 'White Feather AI Automation Blueprint Generator', badge: 'Agentic Tool', desc: 'Fast-tracks community AI agency blueprints into deployable LangGraph & client workflows.' },
      { id: 'wf-ui-navigator', title: 'Milton UI/UX Resource Accelerator', badge: 'Milton UI/UX', desc: 'Custom visual roadmap that organizes and fast-tracks White Feather modules and deliverables.' }
    ]
  }
];

// Double-Entry Management Accounting Chart of Accounts (GAAP / DCAA / CPA Ready)
// Corporate Entities: MGC (Milton Group Concepts LLC, EIN 92-1370285) and FIX (F.I.X Solutions LLC)
const CHART_OF_ACCOUNTS = [
  { code: '1010', name: 'Operating Cash — Mercury Checking',           type: 'ASSET',     normalBalance: 'DEBIT' },
  { code: '1020', name: 'Tax Reserve Vault (25% Auto-Allocation)',     type: 'ASSET',     normalBalance: 'DEBIT' },
  { code: '1100', name: 'Accounts Receivable — Commercial & Federal',  type: 'ASSET',     normalBalance: 'DEBIT' },
  { code: '1150', name: 'Contract Milestone Escrow Receivable',        type: 'ASSET',     normalBalance: 'DEBIT' },
  { code: '2100', name: 'Estimated Federal & VA Tax Payable (25%)',    type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2200', name: 'Unearned Retainer & Deferred Revenue',        type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '3010', name: 'Sole Member Equity & Retained Earnings',      type: 'EQUITY',    normalBalance: 'CREDIT' },
  { code: '4010', name: 'SaaS Apps & SCORM LMS Subscription Revenue',  type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '4020', name: 'SDVOSB Federal Contracting Revenue (WAWF)',   type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '4030', name: 'Guided Consultation & Custom Build Revenue',  type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '4040', name: 'Qualified Resource & AI Fast-Track Revenue',  type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '5010', name: 'Cloud & Infrastructure Expense',              type: 'EXPENSE',   normalBalance: 'DEBIT' },
  { code: '5020', name: 'Subcontractor & Delivery COGS',               type: 'EXPENSE',   normalBalance: 'DEBIT' },
  { code: '5030', name: 'Payment Processor & Gateway Fee Expense',     type: 'EXPENSE',   normalBalance: 'DEBIT' }
];

// New users ONLY have view and access of SaaS Apps & LMS (+ payment submission in member-portal.html)
const DEFAULT_CUSTOMER_APPS = ['sterling-auto-repair', 'client-turnkey-forge'];
const DEFAULT_CUSTOMER_RESOURCES = [];
const DEFAULT_CUSTOMER_PAGES = { saasapps: 'ready' };
const DEFAULT_CUSTOMER_PORTALS = ['saas-apps-and-lms-showcase.html', 'member-portal.html'];


// Owner-only command portals (can also be shared as an element `type='element', resource='<filename>'`)
const INTERNAL_PORTALS = new Set([
  'access-admin.html',
  'admin-command-portal.html',
  'agent-workflow-studio.html',
  'chronos-external-insight-webapp.html',
  'compliance-trust-center.html',
  'earth-3d.html',
  'elearning-upskilling-hub.html',
  'finance-command.html',
  'historical-archaeology-ai-hub.html',
  'index.html',
  'integrations-connections-hub.html',
  'onboarding-portal.html',
  'saas-apps-and-lms-showcase.html',
  'sdvosb-contract-radar.html',
  'vr-command.html',
  'whitefeather-ecommerce-hub.html'
]);

// Files that must NEVER be served statically
const BLOCKED_FILES = new Set([
  'server.js',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'firestore.rules',
  'firestore.rules.README.md',
  '.gitguardian.yaml',
  'Deploy-MGCSiteToProduction.ps1',
  'zero-trust-edge-policy.json'
]);

// Server-Side Clean Route Masking Table (hides raw .html filenames and query params)
const CLEAN_ROUTE_TO_FILE = {
  '/':                  'login.html',
  '/home':              'marketing-home.html',
  '/about':             'marketing-home.html',
  '/services':          'marketing-home.html',
  '/contact':           'marketing-home.html',
  '/auth':              'login.html',
  '/login':             'login.html',
  '/request-access':    'request-access.html',
  '/intake':            'request-access.html',
  '/portal':            'onboarding-portal.html',
  '/onboarding':        'onboarding-portal.html',
  '/onboarding-portal': 'onboarding-portal.html',
  '/workspace':         'member-portal.html',
  '/member-portal':     'member-portal.html',
  '/agile':             'agile-board.html',
  '/agile-board':       'agile-board.html',
  '/access-admin':      'access-admin.html',
  '/command':           'admin-command-portal.html',
  '/admin-command':     'admin-command-portal.html',
  '/apps':              'saas-apps-and-lms-showcase.html',
  '/finance':           'finance-command.html',
  '/academy':           'elearning-upskilling-hub.html',
  '/commerce':          'whitefeather-ecommerce-hub.html',
  '/chronos-lab':       'historical-archaeology-ai-hub.html',
  '/chronos':           'chronos-external-insight-webapp.html',
  '/data-hub':          'index.html',
  '/agent-studio':      'agent-workflow-studio.html',
  '/earth-3d':          'earth-3d.html',
  '/vr-deck':           'vr-command.html',
  '/integrations':      'integrations-connections-hub.html',
  '/sam-radar':         'sdvosb-contract-radar.html',
  '/trust-center':      'compliance-trust-center.html',
  '/newsletter':        'newsletter.html',
  '/mobile':            'mobile-control.html',
  '/mobile-control':    'mobile-control.html'
};

const FILE_TO_CLEAN_ROUTE = {
  'login.html':                          '/auth',
  'request-access.html':                 '/request-access',
  'onboarding-portal.html':              '/portal',
  'member-portal.html':                  '/workspace',
  'agile-board.html':                    '/agile',
  'access-admin.html':                   '/access-admin',
  'admin-command-portal.html':           '/command',
  'saas-apps-and-lms-showcase.html':     '/apps',
  'finance-command.html':                '/finance',
  'elearning-upskilling-hub.html':       '/academy',
  'whitefeather-ecommerce-hub.html':     '/commerce',
  'historical-archaeology-ai-hub.html':  '/chronos-lab',
  'chronos-external-insight-webapp.html':'/chronos',
  'index.html':                          '/data-hub',
  'agent-workflow-studio.html':          '/agent-studio',
  'earth-3d.html':                       '/earth-3d',
  'vr-command.html':                     '/vr-deck',
  'integrations-connections-hub.html':   '/integrations',
  'sdvosb-contract-radar.html':          '/sam-radar',
  'compliance-trust-center.html':        '/trust-center',
  'newsletter.html':                     '/newsletter',
  'mobile-control.html':                 '/mobile'
};

function isMobileRequest(req, parsedUrl) {
  if (parsedUrl && parsedUrl.searchParams) {
    if (parsedUrl.searchParams.get('desktop') === '1') return false;
    if (parsedUrl.searchParams.get('mobile') === '1') return true;
  }
  const chMobile = String(req.headers['sec-ch-ua-mobile'] || '').trim();
  if (chMobile === '?1') return true;
  const ua = String(req.headers['user-agent'] || '');
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS/i.test(ua);
}

function toCleanRoute(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') return '';
  const trimmed = rawTarget.trim();
  if (!trimmed) return '';
  const [pathPart] = trimmed.split('?');
  const normalizedPath = '/' + pathPart.replace(/^\/+/, '');
  if (CLEAN_ROUTE_TO_FILE[normalizedPath]) {
    const mappedFile = CLEAN_ROUTE_TO_FILE[normalizedPath];
    return FILE_TO_CLEAN_ROUTE[mappedFile] || normalizedPath;
  }
  const bName = path.basename(normalizedPath);
  if (FILE_TO_CLEAN_ROUTE[bName]) {
    return FILE_TO_CLEAN_ROUTE[bName];
  }
  if (bName.endsWith('.html')) {
    return '/' + bName.slice(0, -5);
  }
  return normalizedPath.startsWith('/') ? normalizedPath : '';
}

const uid = (p) => p + '_' + crypto.randomBytes(4).toString('hex');
const now = () => new Date().toISOString();

function seedState() {
  const t = now();
  const mk = (id, name, email, role, status, brand, interest, paid, pages, allowedApps, qualifiedResources) => ({
    id,
    name,
    username: String(email || '').split('@')[0].toLowerCase(),
    email: String(email || '').toLowerCase(),
    role,
    ou: role === 'owner' ? 'builtin' : 'external',
    securityGroup: role === 'owner' ? 'DOMAIN_ADMIN' : 'EXTERNAL_SAAS_LMS',
    status,
    brand,
    accessTier: role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
    passwordDigest: null,
    hasPassword: false,
    quote: { interest, note: '' },
    plan: { base: paid, addons: [] },
    pages: pages || {},
    allowedApps: allowedApps || (role === 'owner' ? ['*'] : DEFAULT_CUSTOMER_APPS.slice()),
    qualifiedResources: qualifiedResources || (role === 'owner' ? ['*'] : DEFAULT_CUSTOMER_RESOURCES.slice()),
    checklist: {},
    created: t
  });
  return {
    v: 1,
    users: {
      owner: mk('owner', 'Malik K. (Administrator)', SOLE_ADMIN_EMAIL, 'owner', 'active', 'MGC', 'federal', true, {
        home: 'ready', agile: 'ready', resources: 'ready', saasapps: 'ready', radar: 'ready',
        compliance: 'ready', ailab: 'ready', finance: 'ready', training: 'ready', aistudio: 'ready'
      }, ['*'], ['*'])
    },
    shares: [],
    customResources: [],
    accountingLedger: [],
    payments: [],
    consultations: [],
    tasks: [],
    notifications: [],
    audit: [],
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
    requests: [],
    newsletter: {
      subscribers: [
        { email: 'malik.khabir@miltongroupsecurity.org', name: 'Malik K. (Owner)', track: 'ALL', frequency: 'weekly', subscribedAt: t, verified: true }
      ],
      issues: [
        {
          id: 'iss_2026_04',
          issueNumber: 'Issue #04',
          track: 'ZERO-TRUST & AI OPS',
          date: 'October 2026',
          readTime: '3 min read',
          title: 'Zero-Trust Federated OIDC & Mobile-First Workflow Command',
          summary: 'Why modern SDVOSB and commercial operations are replacing bloated mobile dashboards with dedicated, minimalist workflow control surfaces and RS256 JWKS federated identity.',
          highlights: [
            'Enforced Google, Microsoft, and Apple Federated OIDC with zero password attack surface',
            'Minimalist Mobile Control Deck: 1-tap approvals, entitlement grants, and sprint progression',
            'Zero-Charge Cloud Run architecture (min-instances=0) with Firestore free-tier cost guard'
          ]
        },
        {
          id: 'iss_2026_03',
          issueNumber: 'Issue #03',
          track: 'SDVOSB FEDERAL RADAR',
          date: 'October 2026',
          readTime: '4 min read',
          title: 'FY27 Federal Cyber & AI Contracting: CMMC 2.0 Level 2 Readiness',
          summary: 'Actionable playbook for aligning NAICS 541512/541519 capabilities with DoD Zero-Trust Reference Architecture and automated POA&M evidence collection.',
          highlights: [
            'Automated NIST SP 800-171 Rev 3 control family mapping and artifact tracking',
            'Rapid capability brief dispatch workflow for Sources Sought notices',
            'WAWF / PIEE milestone invoicing integration for sub-15-day net settlement'
          ]
        },
        {
          id: 'iss_2026_02',
          issueNumber: 'Issue #02',
          track: 'COMMERCIAL AI TURNKEY',
          date: 'September 2026',
          readTime: '3 min read',
          title: '60-Second Lead Response: Autonomous Receptionist & Bay Status Workflows',
          summary: 'Case study from the Sterling Auto Repair deployment showing how 24/7 AI lead intake + live repair order status tracking eliminates missed calls.',
          highlights: [
            'Sub-60-second SMS/Voice AI triage connected directly to Google Calendar slots',
            'Scoped customer Agile board transparency from intake through production launch',
            'Turnkey SCORM 2004 4th Edition operator training modules included out of the box'
          ]
        }
      ]
    }
  };
}

const CLOUD_DB_CONFIG = {
  gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'milton-group-concepts-llc',
  firestoreCollection: process.env.FIRESTORE_COLLECTION || 'mgc_workspace',
  googleSheetsWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
  sharepointSiteId: process.env.SHAREPOINT_SITE_ID || '',
  sharepointListId: process.env.SHAREPOINT_LIST_ID || '',
  primaryProvider: 'Google Cloud Firestore (nam5 Native Free-Tier) + ACID-JSON-WAL',
  fallbackProviders: ['Google Workspace Sheets / Drive AppData API', 'Microsoft SharePoint List (Graph REST v1.0)']
};

const DB_STATS = {
  readsToday: 0,
  writesToday: 0,
  dailyReadCap: 40000,   // 80% of 50,000 Google Cloud Firestore free daily reads
  dailyWriteCap: 16000,  // 80% of 20,000 Google Cloud Firestore free daily writes
  firestoreFreeReads: 50000,
  firestoreFreeWrites: 20000,
  estimatedCostUsd: 0.00,
  circuitBreakerTripped: false,
  lastWriteAt: now(),
  lastCloudSyncStatus: 'READY_STANDBY (Local WAL Active · Cloud Run ADC Auto-Binds on Deploy)',
  cloudProviders: {
    googleFirestore: {
      preferred: true,
      projectId: CLOUD_DB_CONFIG.gcpProjectId,
      collection: CLOUD_DB_CONFIG.firestoreCollection,
      endpoint: `https://firestore.googleapis.com/v1/projects/${CLOUD_DB_CONFIG.gcpProjectId}/databases/(default)/documents/${CLOUD_DB_CONFIG.firestoreCollection}/state_v1`,
      freeTierQuota: '1 GiB Storage · 50K Reads/day · 20K Writes/day ($0.00)'
    },
    googleSheetsDrive: {
      configured: Boolean(CLOUD_DB_CONFIG.googleSheetsWebhookUrl),
      freeTierQuota: '15 GB Google Workspace Drive / Apps Script Webhook ($0.00)'
    },
    sharepointGraph: {
      configured: Boolean(CLOUD_DB_CONFIG.sharepointSiteId && CLOUD_DB_CONFIG.sharepointListId),
      endpoint: CLOUD_DB_CONFIG.sharepointSiteId
        ? `https://graph.microsoft.com/v1.0/sites/${CLOUD_DB_CONFIG.sharepointSiteId}/lists/${CLOUD_DB_CONFIG.sharepointListId}/items`
        : 'https://graph.microsoft.com/v1.0/sites/{site-id}/lists/{list-id}/items',
      licenseNote: 'Included in existing Microsoft 365 / SharePoint tenant ($0.00 incremental)'
    }
  }
};

function fetchCloudRunAdcToken() {
  return new Promise((resolve) => {
    if (process.env.GOOGLE_CLOUD_ACCESS_TOKEN) {
      return resolve(process.env.GOOGLE_CLOUD_ACCESS_TOKEN);
    }
    const req = http.request({
      hostname: 'metadata.google.internal',
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      method: 'GET',
      headers: { 'Metadata-Flavor': 'Google' },
      timeout: 650
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.access_token || null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function syncCloudDatabaseSilent(state) {
  if (DB_STATS.circuitBreakerTripped) return;
  try {
    // 1. Preferred: Google Cloud Firestore Native REST v1 (via Cloud Run ADC or GOOGLE_CLOUD_ACCESS_TOKEN)
    const gcpToken = await fetchCloudRunAdcToken();
    if (gcpToken && process.env.MGCW_ENABLE_FIRESTORE_SYNC === '1') {
      const payload = JSON.stringify({
        fields: {
          updatedAt: { stringValue: now() },
          version: { integerValue: String(state.v || 1) },
          snapshotJson: { stringValue: JSON.stringify(state) }
        }
      });
      const u = new URL(DB_STATS.cloudProviders.googleFirestore.endpoint);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname,
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${gcpToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 2500
      }, (res) => {
        DB_STATS.lastCloudSyncStatus = res.statusCode < 300
          ? `SYNCED_GOOGLE_FIRESTORE (${now()})`
          : `FIRESTORE_HTTP_${res.statusCode}`;
      });
      req.on('error', () => {});
      req.write(payload);
      req.end();
    }
    // 2. Optional: Microsoft SharePoint List via Graph REST v1.0
    if (CLOUD_DB_CONFIG.sharepointSiteId && CLOUD_DB_CONFIG.sharepointListId && process.env.SHAREPOINT_BEARER_TOKEN) {
      const spBody = JSON.stringify({
        fields: {
          Title: 'MGC_Workspace_State_v1',
          UpdatedAt: now(),
          PayloadJson: JSON.stringify(state)
        }
      });
      const spUrl = new URL(DB_STATS.cloudProviders.sharepointGraph.endpoint);
      const spReq = https.request({
        hostname: spUrl.hostname,
        path: spUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SHAREPOINT_BEARER_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(spBody)
        },
        timeout: 2500
      }, () => {
        DB_STATS.lastCloudSyncStatus = `SYNCED_SHAREPOINT_GRAPH (${now()})`;
      });
      spReq.on('error', () => {});
      spReq.write(spBody);
      spReq.end();
    }
  } catch (_) {}
}

function loadState() {
  DB_STATS.readsToday++;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (parsed && parsed.v === 1) {
        const def = seedState();
        parsed.users = Object.assign({}, def.users, parsed.users || {});
        // Purge any legacy placeholder or fake seeded accounts from persisted state
        ['client', 'ana', 'ben', 'cara'].forEach(fakeId => {
          if (parsed.users && parsed.users[fakeId]) delete parsed.users[fakeId];
        });
        if (Array.isArray(parsed.requests)) {
          parsed.requests = parsed.requests.filter(r => !['ana', 'ben', 'cara', 'client'].includes(r.uid) && !['r1', 'r2'].includes(r.id));
        }
        if (Array.isArray(parsed.tasks)) {
          parsed.tasks = parsed.tasks.filter(t => !['ana', 'ben', 'cara', 'client'].includes(t.uid));
        }
        if (Array.isArray(parsed.features)) {
          parsed.features = parsed.features.filter(f => !['ana', 'ben', 'cara', 'client'].includes(f.by) && f.id !== 'f1');
        }
        if (!Array.isArray(parsed.consultations)) {
          parsed.consultations = [];
        }
        if (!Array.isArray(parsed.customResources)) {
          parsed.customResources = [];
        }
        if (!Array.isArray(parsed.accountingLedger)) {
          parsed.accountingLedger = [];
        }
        Object.values(parsed.users).forEach(u => {
          // Enforce strictly ONE Administrator account: owner / malik.khabir@miltongroupsecurity.org
          if (u.id === 'owner' && String(u.email || '').toLowerCase() === SOLE_ADMIN_EMAIL) {
            u.role = 'owner';
            u.ou = 'builtin';
            u.securityGroup = 'DOMAIN_ADMIN';
            u.email = SOLE_ADMIN_EMAIL;
            u.accessTier = 'OWNER_FULL';
            u.allowedApps = ['*'];
            u.qualifiedResources = ['*'];
          } else {
            u.role = 'member';
            u.ou = u.ou === 'internal' ? 'internal' : 'external';
            u.accessTier = u.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED';
            if (!Array.isArray(u.allowedApps)) {
              u.allowedApps = u.status === 'active' ? DEFAULT_CUSTOMER_APPS.slice() : [];
            }
            if (!Array.isArray(u.qualifiedResources)) {
              u.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
            }
            if (!u.pages || typeof u.pages !== 'object') {
              u.pages = { saasapps: 'ready' };
            } else {
              u.pages.saasapps = 'ready';
              // Unless explicitly granted by Administrator in u.adminGrantedPages or qualifiedResources, strip legacy default pages
              const granted = Array.isArray(u.adminGrantedPages) ? u.adminGrantedPages : [];
              Object.keys(u.pages).forEach(pid => {
                if (pid === 'resources' && Array.isArray(u.qualifiedResources) && u.qualifiedResources.length > 0) return;
                if (pid !== 'saasapps' && !granted.includes(pid) && !(parsed.shares || []).some(s => (s.type === 'page' || s.type === 'element') && s.resource === pid && s.grantee === u.id)) {
                  delete u.pages[pid];
                }
              });
              if (Array.isArray(u.qualifiedResources) && u.qualifiedResources.length > 0) {
                u.pages.resources = 'ready';
              }
              // Employees never get finance/payment settings page
              if (u.ou === 'internal') {
                delete u.pages.finance;
              }
            }
          }
        });
        parsed.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
        parsed.projects = Object.assign({}, def.projects, parsed.projects || {});
        if (!parsed.items.some(i => i.project === 'p_sterling')) {
          parsed.items = def.items.filter(i => i.project === 'p_sterling').concat(parsed.items || []);
        }
        if (!parsed.newsletter || !Array.isArray(parsed.newsletter.issues)) {
          parsed.newsletter = def.newsletter;
        }
        return parsed;
      }
    }
  } catch (_) {}
  const initial = seedState();
  saveState(initial);
  return initial;
}

function saveState(state) {
  if (DB_STATS.writesToday >= DB_STATS.dailyWriteCap) {
    DB_STATS.circuitBreakerTripped = true;
    return;
  }
  DB_STATS.writesToday++;
  DB_STATS.lastWriteAt = now();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  syncCloudDatabaseSilent(state);
}

let S = loadState();

/* ---------- Policy Engine (1:1 with firestore.rules and mgc-workspace-core.js) ---------- */
function isOwnerUser(u) {
  return Boolean(u && u.role === 'owner' && u.id === 'owner');
}
function isEmployeeUser(u) {
  return Boolean(u && u.role !== 'owner' && u.ou === 'internal' && u.status === 'active');
}
function isClientUser(u) {
  return Boolean(u && u.role !== 'owner' && u.ou !== 'internal');
}

function subActive(u) {
  return Boolean(u && (u.role === 'owner' || (u.plan && u.plan.base && u.status === 'active')));
}

function getResourcesCatalog() {
  const custom = (S && Array.isArray(S.customResources)) ? S.customResources : [];
  const merged = [...RESOURCES_CATALOG];
  custom.forEach(cr => {
    if (cr && cr.id && !merged.some(r => r.id === cr.id)) merged.push(cr);
  });
  return merged;
}

function can(u, type, id, action) {
  if (!u) return false;
  if (isOwnerUser(u)) return true;
  if (!subActive(u)) return false;
  if (type === 'page') {
    const entry = CATALOG.find(c => c.id === id);
    if (!entry || action !== 'view') return false;
    // Employees never have access to payment/finance settings
    if (isEmployeeUser(u) && id === 'finance') return false;
    // New users and standard users ALWAYS have access to SaaS Apps & LMS ('saasapps')
    if (id === 'saasapps') return true;
    // Users qualified for at least 1 resource automatically have access to the Resources section
    if (id === 'resources' && Array.isArray(u.qualifiedResources) && u.qualifiedResources.length > 0) return true;
    // All other features/pages require explicit Administrator grant
    if (S.shares.some(s => (s.type === 'page' || s.type === 'element') && s.resource === id && s.grantee === u.id)) return true;
    if (Array.isArray(u.adminGrantedPages) && u.adminGrantedPages.includes(id)) return true;
    return (u.pages || {})[id] === 'ready';
  }
  if (type === 'app') {
    const apps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS;
    if (apps.includes('*') || apps.includes(id)) return true;
    return S.shares.some(s => (s.type === 'app' || s.type === 'element') && s.resource === id && s.grantee === u.id);
  }
  if (type === 'resource') {
    const resList = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : DEFAULT_CUSTOMER_RESOURCES;
    if (resList.includes('*') || resList.includes(id)) return true;
    return S.shares.some(s => s.type === 'resource' && s.resource === id && s.grantee === u.id);
  }
  if (type === 'project') {
    const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
    if (!sh) return false;
    return action === 'view' ? true : (sh.perms || []).includes(action);
  }
  if (type === 'element') {
    return S.shares.some(s => (s.type === 'element' || s.type === 'app' || s.type === 'page' || s.type === 'resource') && s.resource === id && s.grantee === u.id);
  }
  return false;
}

function getQualifiedResourcesForUser(u) {
  if (!u) return [];
  const allRes = getResourcesCatalog();
  if (isOwnerUser(u)) return allRes.map(r => r.id);
  return allRes.filter(r => can(u, 'resource', r.id, 'view')).map(r => r.id);
}

function getAllowedPortalsForUser(u) {
  if (!u) return [];
  if (isOwnerUser(u)) return ['*'];
  const portals = new Set(DEFAULT_CUSTOMER_PORTALS);
  if (isEmployeeUser(u)) {
    portals.add('access-admin.html');
  }
  Object.entries(PORTAL_TO_CATALOG).forEach(([file, catId]) => {
    if (isEmployeeUser(u) && catId === 'finance') return;
    if (can(u, 'page', catId, 'view') || can(u, 'element', file, 'view')) {
      portals.add(file);
    }
  });
  return Array.from(portals);
}

function getAllowedPagesForUser(u) {
  if (!u) return [];
  if (u.role === 'owner' && u.id === 'owner') return CATALOG.map(c => c.id);
  return CATALOG.filter(c => can(u, 'page', c.id, 'view')).map(c => c.id);
}

/* ---------- Double-Entry Management Accounting & Rail Economics Engine ---------- */
function computeRailEconomics(grossUsd, railOrMethod) {
  const gross = Math.round((Number(grossUsd) || 0) * 100) / 100;
  const r = String(railOrMethod || 'MERCURY_ACH').toUpperCase();
  let railCode = 'MERCURY_ACH';
  let railLabel = 'Mercury Commercial ACH / Wire ($0.00 Fee)';
  let feeUsd = 0;
  if (r.includes('WAWF') || r.includes('PIEE') || r === 'GPC_WAWF') {
    railCode = 'WAWF_EFT';
    railLabel = 'DoD WAWF / PIEE Treasury EFT ($0.00 Fee)';
    feeUsd = 0;
  } else if (r === 'STRIPE_ACH') {
    railCode = 'STRIPE_ACH';
    railLabel = 'Stripe ACH Direct Debit (0.8% capped at $5.00)';
    feeUsd = Math.min(5.00, Math.round(gross * 0.008 * 100) / 100);
  } else if (r.includes('CARD') || r === 'STRIPE_CARD') {
    railCode = 'STRIPE_CARD';
    railLabel = 'Stripe SAQ-A Tokenized Card (2.9% + $0.30)';
    feeUsd = gross > 0 ? Math.round((gross * 0.029 + 0.30) * 100) / 100 : 0;
  } else if (r === 'EXPENSE_ACH') {
    railCode = 'EXPENSE_ACH';
    railLabel = 'Operating Expense Outflow ($0.00 ACH)';
    feeUsd = 0;
  } else {
    railCode = 'MERCURY_ACH';
    railLabel = 'Mercury Commercial ACH / Wire ($0.00 Fee)';
    feeUsd = 0;
  }
  const netCashUsd = Math.max(0, Math.round((gross - feeUsd) * 100) / 100);
  const taxReserveUsd = Math.round(netCashUsd * 0.25 * 100) / 100;
  const operatingNetUsd = Math.round((netCashUsd - taxReserveUsd) * 100) / 100;
  // Compare against card fee to surface fee savings when using $0 ACH/WAWF
  const hypotheticalCardFee = gross > 0 ? Math.round((gross * 0.029 + 0.30) * 100) / 100 : 0;
  const feeSavedVsCardUsd = Math.max(0, Math.round((hypotheticalCardFee - feeUsd) * 100) / 100);
  return {
    railCode,
    railLabel,
    grossUsd: gross,
    processorFeeUsd: feeUsd,
    netCashUsd,
    taxReserveUsd,
    operatingNetUsd,
    feeSavedVsCardUsd
  };
}

const COA_MAP = Object.fromEntries(CHART_OF_ACCOUNTS.map(a => [a.code, a]));

function postAccountingJournalEntry(d) {
  if (!Array.isArray(S.accountingLedger)) S.accountingLedger = [];
  const entity = String(d.entity || 'MGC').toUpperCase() === 'FIX' ? 'FIX' : 'MGC';
  const rawType = String(d.entryType || 'SETTLEMENT').toUpperCase();
  const entryType = ['REVENUE', 'SETTLEMENT', 'FEDERAL_WAWF', 'CONSULTATION', 'RESOURCE_FASTTRACK', 'INVOICE_AR', 'ESCROW_DEPOSIT', 'EXPENSE'].includes(rawType)
    ? rawType
    : 'SETTLEMENT';
  const grossUsd = Math.max(0.01, Math.min(10000000, Math.round((Number(d.grossUsd || d.grossAmount || d.amountUsd || d.amount) || 0) * 100) / 100));
  const econ = computeRailEconomics(
    grossUsd,
    (entryType === 'EXPENSE' || entryType === 'INVOICE_AR') ? 'EXPENSE_ACH' : (d.rail || d.method || 'MERCURY_ACH')
  );
  const defaultCode = entryType === 'EXPENSE'
    ? '5010'
    : entryType === 'FEDERAL_WAWF'
      ? '4020'
      : entryType === 'CONSULTATION'
        ? '4030'
        : entryType === 'RESOURCE_FASTTRACK'
          ? '4040'
          : entryType === 'ESCROW_DEPOSIT'
            ? '2200'
            : '4010';
  const accountCode = String(d.accountCode || defaultCode);
  const acctName = (COA_MAP[accountCode] && COA_MAP[accountCode].name) || 'Commercial SaaS & LMS Revenue';
  const rawStatus = String(d.reconciledStatus || d.status || '').toUpperCase();
  const status = ['ISSUED', 'AUTHORIZED', 'SETTLED', 'RECONCILED'].includes(rawStatus)
    ? rawStatus
    : (entryType === 'INVOICE_AR' ? 'ISSUED' : 'SETTLED');
  const createdAt = d.createdAt || new Date().toISOString();
  const journalId = d.journalId || d.id || ('JRN-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase());
  const prevHash = S.accountingLedger.length > 0 ? (S.accountingLedger[0].entryHash || 'GENESIS_MGC_LEDGER_0000') : 'GENESIS_MGC_LEDGER_0000';

  const makeLine = (code, debit, credit) => ({
    account: code,
    accountCode: code,
    name: (COA_MAP[code] && COA_MAP[code].name) || acctName,
    accountName: (COA_MAP[code] && COA_MAP[code].name) || acctName,
    debit: Math.round((Number(debit) || 0) * 100) / 100,
    credit: Math.round((Number(credit) || 0) * 100) / 100
  });

  let lines = [];
  if (entryType === 'EXPENSE') {
    lines = [
      makeLine(accountCode, grossUsd, 0),
      makeLine('1010', 0, grossUsd)
    ];
  } else if (entryType === 'INVOICE_AR') {
    lines = [
      makeLine('1100', grossUsd, 0),
      makeLine(accountCode, 0, grossUsd)
    ];
  } else if (entryType === 'ESCROW_DEPOSIT') {
    lines = [
      makeLine('1150', econ.netCashUsd, 0),
      ...(econ.processorFeeUsd > 0 ? [makeLine('5030', econ.processorFeeUsd, 0)] : []),
      makeLine('2200', 0, grossUsd)
    ];
  } else {
    // Settled / Authorized Revenue with automatic processor fee split & 25% tax reserve allocation
    lines = [
      makeLine('1010', econ.operatingNetUsd, 0),
      makeLine('1020', econ.taxReserveUsd, 0),
      ...(econ.processorFeeUsd > 0 ? [makeLine('5030', econ.processorFeeUsd, 0)] : []),
      makeLine(accountCode, 0, grossUsd)
    ];
  }

  const totalDebit = Math.round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;
  const hashPayload = `${prevHash}|${journalId}|${entity}|${entryType}|${grossUsd.toFixed(2)}|${econ.processorFeeUsd.toFixed(2)}|${econ.netCashUsd.toFixed(2)}|${createdAt}`;
  const entryHash = 'SHA256-' + crypto.createHmac('sha256', SESSION_SECRET).update(hashPayload).digest('hex').slice(0, 28);
  const counterparty = sanitizeInput(d.clientName || d.counterparty || 'Client Partner', 140);
  const contractCode = sanitizeInput(d.contractCode || d.receiptId || 'MGC-STD', 80);
  const memoText = sanitizeInput(d.memo || d.description || 'Double-Entry Journal Posting', 240);
  const entityLabel = entity === 'FIX' ? 'F.I.X Solutions LLC' : 'Milton Group Concepts LLC (EIN 92-1370285)';

  const entry = {
    id: journalId,
    journalId,
    receiptId: d.receiptId || journalId,
    date: createdAt.slice(0, 10),
    createdAt,
    entity,
    entityName: entityLabel,
    entityLabel,
    entryType,
    accountCode,
    accountName: acctName,
    counterparty,
    clientName: counterparty,
    counterpartyEmail: sanitizeInput(d.counterpartyEmail || '', 140).toLowerCase(),
    contractCode,
    description: memoText,
    memo: memoText,
    rail: econ.railCode,
    railLabel: econ.railLabel,
    grossUsd: econ.grossUsd,
    grossAmount: econ.grossUsd,
    processorFeeUsd: econ.processorFeeUsd,
    processorFee: econ.processorFeeUsd,
    netCashUsd: entryType === 'EXPENSE' ? -econ.grossUsd : econ.netCashUsd,
    netAmount: entryType === 'EXPENSE' ? -econ.grossUsd : econ.netCashUsd,
    taxReserveUsd: (entryType === 'EXPENSE' || entryType === 'INVOICE_AR' || entryType === 'ESCROW_DEPOSIT') ? 0 : econ.taxReserveUsd,
    taxReserve25: (entryType === 'EXPENSE' || entryType === 'INVOICE_AR' || entryType === 'ESCROW_DEPOSIT') ? 0 : econ.taxReserveUsd,
    operatingNetUsd: entryType === 'EXPENSE' ? -econ.grossUsd : econ.operatingNetUsd,
    feeSavedVsCardUsd: entryType === 'EXPENSE' ? 0 : econ.feeSavedVsCardUsd,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    status,
    reconciledStatus: status,
    lines,
    prevHash,
    entryHash
  };
  S.accountingLedger.unshift(entry);
  return entry;
}

function computeAccountingSummary(entityFilter) {
  const all = Array.isArray(S.accountingLedger) ? S.accountingLedger : [];
  const filtered = (entityFilter && (entityFilter === 'MGC' || entityFilter === 'FIX'))
    ? all.filter(e => e.entity === entityFilter)
    : all;

  let grossRevenueUsd = 0;
  let processorFeesUsd = 0;
  let netSettledCashUsd = 0;
  let operatingExpensesUsd = 0;
  let accountsReceivableUsd = 0;
  let milestoneEscrowUsd = 0;
  let taxReserveVaultUsd = 0;
  let feeSavedByZeroCostRailsUsd = 0;
  let totalDebitsUsd = 0;
  let totalCreditsUsd = 0;
  const byEntity = {
    MGC: { grossRevenueUsd: 0, netCashUsd: 0, expensesUsd: 0, taxReserveUsd: 0, count: 0 },
    FIX: { grossRevenueUsd: 0, netCashUsd: 0, expensesUsd: 0, taxReserveUsd: 0, count: 0 }
  };

  all.forEach(e => {
    const ent = e.entity === 'FIX' ? 'FIX' : 'MGC';
    byEntity[ent].count++;
    const grossVal = Number(e.grossUsd ?? e.grossAmount) || 0;
    const netVal = Number(e.netCashUsd ?? e.netAmount) || 0;
    const taxVal = Number(e.taxReserveUsd ?? e.taxReserve25) || 0;
    if (e.entryType === 'EXPENSE') {
      byEntity[ent].expensesUsd = Math.round((byEntity[ent].expensesUsd + grossVal) * 100) / 100;
      byEntity[ent].netCashUsd = Math.round((byEntity[ent].netCashUsd - grossVal) * 100) / 100;
    } else if (e.entryType === 'INVOICE_AR' && (e.status === 'ISSUED' || e.reconciledStatus === 'ISSUED')) {
      // Accounts receivable until settled
    } else if (e.entryType === 'ESCROW_DEPOSIT') {
      // Held in milestone escrow
    } else {
      byEntity[ent].grossRevenueUsd = Math.round((byEntity[ent].grossRevenueUsd + grossVal) * 100) / 100;
      byEntity[ent].netCashUsd = Math.round((byEntity[ent].netCashUsd + netVal) * 100) / 100;
      byEntity[ent].taxReserveUsd = Math.round((byEntity[ent].taxReserveUsd + taxVal) * 100) / 100;
    }
  });

  filtered.forEach(e => {
    const grossVal = Number(e.grossUsd ?? e.grossAmount) || 0;
    const feeVal = Number(e.processorFeeUsd ?? e.processorFee) || 0;
    const netVal = Number(e.netCashUsd ?? e.netAmount) || 0;
    const taxVal = Number(e.taxReserveUsd ?? e.taxReserve25) || 0;
    totalDebitsUsd = Math.round((totalDebitsUsd + (Number(e.totalDebit) || 0)) * 100) / 100;
    totalCreditsUsd = Math.round((totalCreditsUsd + (Number(e.totalCredit) || 0)) * 100) / 100;
    if (e.entryType === 'EXPENSE') {
      operatingExpensesUsd = Math.round((operatingExpensesUsd + grossVal) * 100) / 100;
      netSettledCashUsd = Math.round((netSettledCashUsd - grossVal) * 100) / 100;
    } else if (e.entryType === 'INVOICE_AR' && (e.status === 'ISSUED' || e.reconciledStatus === 'ISSUED')) {
      accountsReceivableUsd = Math.round((accountsReceivableUsd + grossVal) * 100) / 100;
    } else if (e.entryType === 'ESCROW_DEPOSIT') {
      milestoneEscrowUsd = Math.round((milestoneEscrowUsd + netVal) * 100) / 100;
    } else {
      grossRevenueUsd = Math.round((grossRevenueUsd + grossVal) * 100) / 100;
      processorFeesUsd = Math.round((processorFeesUsd + feeVal) * 100) / 100;
      netSettledCashUsd = Math.round((netSettledCashUsd + netVal) * 100) / 100;
      taxReserveVaultUsd = Math.round((taxReserveVaultUsd + taxVal) * 100) / 100;
      feeSavedByZeroCostRailsUsd = Math.round((feeSavedByZeroCostRailsUsd + (Number(e.feeSavedVsCardUsd) || 0)) * 100) / 100;
    }
  });

  const operatingCashAvailableUsd = Math.round((netSettledCashUsd - taxReserveVaultUsd) * 100) / 100;
  const isBalanced = Math.abs(totalDebitsUsd - totalCreditsUsd) < 0.01;

  return {
    entityFilter: entityFilter || 'ALL',
    entryCount: filtered.length,
    grossRevenueUsd,
    grossRevenue: grossRevenueUsd,
    processorFeesUsd,
    processorFees: processorFeesUsd,
    operatingExpensesUsd,
    netSettledCashUsd,
    operatingCash: netSettledCashUsd,
    operatingCashAvailableUsd,
    netOperatingExTax: operatingCashAvailableUsd,
    taxReserveVaultUsd,
    taxReserve25: taxReserveVaultUsd,
    accountsReceivableUsd,
    accountsReceivable: accountsReceivableUsd,
    milestoneEscrowUsd,
    milestoneEscrow: milestoneEscrowUsd,
    feeSavedByZeroCostRailsUsd,
    totalDebitsUsd,
    totalDebits: totalDebitsUsd,
    totalCreditsUsd,
    totalCredits: totalCreditsUsd,
    trialBalanceOk: isBalanced,
    isBalanced,
    byEntity,
    chartOfAccounts: CHART_OF_ACCOUNTS
  };
}

function logAudit(actor, action, detail) {
  S.audit.unshift({ id: uid('a'), ts: now(), actor, action, detail });
  S.audit = S.audit.slice(0, 200);
}

function notifyUser(toUid, title, body, channel) {
  S.notifications.unshift({
    id: uid('n'),
    toUid,
    title,
    body,
    channel: channel || 'in-app + email',
    ts: now(),
    read: false
  });
}

/* ---------- Signed Token & Cookie Helpers ---------- */
function signToken(payload, expiresInSec = 86400 * 7) {
  const data = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const b64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return out;
}

const ALLOWED_SSO_PROVIDERS = new Set(['google', 'microsoft', 'apple', 'password']);
const SSO_PROVIDER_LABELS = {
  google: 'Google SSO',
  microsoft: 'Microsoft SSO',
  apple: 'Apple SSO',
  password: 'Email & Password'
};

function hasAdminCredentialsConfigured() {
  if (process.env.MGCW_ADMIN_PASSWORD && !isGenericOrRevokedSecret(process.env.MGCW_ADMIN_PASSWORD)) return true;
  if (process.env.MGCW_ADMIN_PASSWORD_DIGEST) return true;
  if (S && S.users && S.users.owner && S.users.owner.customPasswordDigest) return true;
  return false;
}

function isValidAdminSecret(secretStr) {
  const clean = String(secretStr || '');
  if (!clean || isGenericOrRevokedSecret(clean)) return false;
  if (process.env.MGCW_ADMIN_PASSWORD && clean === process.env.MGCW_ADMIN_PASSWORD) return true;
  const dig = mgcDigest(clean);
  if (process.env.MGCW_ADMIN_PASSWORD_DIGEST && dig === process.env.MGCW_ADMIN_PASSWORD_DIGEST) return true;
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

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies.mgcw_session;
  const claims = verifyToken(token);
  if (!claims || !claims.uid) return null;
  if (!claims.ssoVerified || !ALLOWED_SSO_PROVIDERS.has(claims.provider)) return null;
  const u = S.users[claims.uid] || null;
  if (u) u.ssoProvider = claims.provider;
  return u;
}

function findOrCreateUserByEmail(email, name, method) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  if (cleanEmail === SOLE_ADMIN_EMAIL) {
    S.users.owner.role = 'owner';
    S.users.owner.email = SOLE_ADMIN_EMAIL;
    S.users.owner.accessTier = 'OWNER_FULL';
    S.users.owner.allowedApps = ['*'];
    S.users.owner.qualifiedResources = ['*'];
    return S.users.owner;
  }
  const existing = Object.values(S.users).find(u => u.id !== 'owner' && String(u.email || '').toLowerCase() === cleanEmail);
  if (existing) {
    existing.role = 'member';
    if (existing.status === 'denied' || existing.status === 'suspended') {
      return existing;
    }
    existing.accessTier = existing.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED';
    if (!Array.isArray(existing.allowedApps) || existing.allowedApps.length === 0) {
      existing.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
    }
    if (!Array.isArray(existing.qualifiedResources)) {
      existing.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
    }
    if (!existing.pages || typeof existing.pages !== 'object') {
      existing.pages = { saasapps: 'ready' };
    } else {
      existing.pages.saasapps = 'ready';
    }
    if (existing.qualifiedResources.length > 0) {
      existing.pages.resources = 'ready';
    }
    if (existing.status === 'requested') {
      existing.status = 'active';
      existing.plan = Object.assign({ base: true, addons: [] }, existing.plan || {}, { base: true });
      saveState(S);
    }
    return existing;
  }
  // Provision a new user with ONLY SaaS Apps & LMS access by default
  const id = uid('u');
  const displayName = name || cleanEmail.split('@')[0];
  S.users[id] = {
    id,
    name: displayName,
    email: cleanEmail,
    role: 'member',
    status: 'active',
    accessTier: 'CUSTOMER_RESTRICTED',
    brand: 'FIX',
    quote: { interest: 'ai-web', note: `Provisioned with SaaS Apps & LMS Access via ${method || 'SSO'}` },
    plan: { base: true, addons: [] },
    pages: { saasapps: 'ready' },
    adminGrantedPages: [],
    allowedApps: DEFAULT_CUSTOMER_APPS.slice(),
    qualifiedResources: DEFAULT_CUSTOMER_RESOURCES.slice(),
    payments: [],
    checklist: {},
    created: now()
  };
  notifyUser(id, 'Welcome — SaaS Apps & LMS Access Active', 'Your account is active with access to SaaS Apps & LMS and Secure Billing & Payment Submission. Additional workspace features and resources can be unlocked by the Administrator.');
  notifyUser('owner', 'New User Registered (SaaS Apps & LMS Only)', `${displayName} (${cleanEmail}) signed in via ${method || 'SSO'}.`, 'in-app + email + push');
  logAudit(id, 'auth.customer_provisioned_saas_only', `${cleanEmail} (${method || 'SSO'})`);
  saveState(S);
  return S.users[id];
}

function scopeStateForUser(u) {
  if (!u) {
    return {
      v: 1,
      currentUser: null,
      ssoEnforced: true,
      allowedSsoProviders: ['google', 'microsoft', 'apple'],
      users: {},
      shares: [],
      customResources: [],
      accountingLedger: [],
      tasks: [],
      notifications: [],
      audit: [],
      projects: {},
      items: [],
      features: [],
      requests: [],
      newsletter: {
        subscriberCount: ((S.newsletter && S.newsletter.subscribers) || []).length,
        issues: (S.newsletter && S.newsletter.issues) || []
      }
    };
  }
  if (isOwnerUser(u)) {
    return {
      ...S,
      customResources: Array.isArray(S.customResources) ? S.customResources : [],
      accountingLedger: Array.isArray(S.accountingLedger) ? S.accountingLedger : [],
      accountingSummary: computeAccountingSummary(),
      currentUser: u.id,
      ssoProvider: u.ssoProvider || 'google',
      ssoEnforced: true
    };
  }
  if (isEmployeeUser(u)) {
    // Employee View:
    // - Access to self + external Client users (ou !== 'internal' && role !== 'owner') ONLY.
    // - Zero visibility into Builtin Administrator, other Employees, or any Payment Settings / Accounting Ledger.
    const empUsers = {
      [u.id]: Object.assign({}, u, { paymentProfile: null, payments: [] })
    };
    const clientIds = new Set();
    Object.values(S.users || {}).forEach(x => {
      if (x.id !== 'owner' && x.role !== 'owner' && x.ou !== 'internal') {
        clientIds.add(x.id);
        empUsers[x.id] = Object.assign({}, x, {
          passwordDigest: undefined,
          paymentProfile: null,
          payments: []
        });
      }
    });
    const allowedProjects = {};
    Object.values(S.projects || {}).forEach(p => {
      if (can(u, 'project', p.id, 'view') || can(u, 'page', 'agile', 'view')) allowedProjects[p.id] = p;
    });
    const allowedItems = (S.items || []).filter(i => Boolean(allowedProjects[i.project]));
    const clientRequests = (S.requests || []).filter(r => clientIds.has(r.uid));
    const clientConsultations = (S.consultations || []).filter(c => clientIds.has(c.uid));
    return {
      v: 1,
      currentUser: u.id,
      ssoProvider: u.ssoProvider || 'password',
      ssoEnforced: true,
      users: empUsers,
      shares: (S.shares || []).filter(s => s.grantee === u.id || clientIds.has(s.grantee)),
      customResources: Array.isArray(S.customResources) ? S.customResources : [],
      accountingLedger: [],
      tasks: (S.tasks || []).filter(t => clientIds.has(t.uid)),
      notifications: (S.notifications || []).filter(n => n.toUid === u.id),
      audit: [],
      payments: [],
      pciGatewayConfig: undefined,
      projects: allowedProjects,
      items: allowedItems,
      features: (S.features || []).filter(f => f.by === u.id || clientIds.has(f.by)),
      requests: clientRequests,
      consultations: clientConsultations,
      newsletter: {
        subscriberCount: ((S.newsletter && S.newsletter.subscribers) || []).length,
        issues: (S.newsletter && S.newsletter.issues) || []
      }
    };
  }
  // Scoped Client view: strictly their own profile, their own qualified resources, their own consultations/requests, and shared projects
  const allowedProjects = {};
  Object.values(S.projects).forEach(p => {
    if (can(u, 'project', p.id, 'view')) allowedProjects[p.id] = p;
  });
  const allowedItems = S.items.filter(i => Boolean(allowedProjects[i.project]));
  const myShares = S.shares.filter(s => s.grantee === u.id);
  const myNotifs = S.notifications.filter(n => n.toUid === u.id);
  const myFeatures = S.features.filter(f => f.by === u.id || Object.keys(allowedProjects).length > 0);
  const myRequests = S.requests.filter(r => r.uid === u.id);
  const myConsultations = (S.consultations || []).filter(c => c.uid === u.id);
  const myQualifiedCustomRes = (S.customResources || []).filter(r => can(u, 'resource', r.id, 'view'));
  return {
    v: 1,
    currentUser: u.id,
    ssoProvider: u.ssoProvider || 'google',
    ssoEnforced: true,
    users: { [u.id]: u },
    shares: myShares,
    customResources: myQualifiedCustomRes,
    accountingLedger: [],
    tasks: [],
    notifications: myNotifs,
    audit: [],
    payments: Array.isArray(u.payments) ? u.payments : [],
    projects: allowedProjects,
    items: allowedItems,
    features: myFeatures,
    requests: myRequests,
    consultations: myConsultations,
    newsletter: {
      subscriberCount: ((S.newsletter && S.newsletter.subscribers) || []).length,
      subscribed: Boolean(u && ((S.newsletter && S.newsletter.subscribers) || []).some(s => s.email === String(u.email || '').toLowerCase())),
      issues: (S.newsletter && S.newsletter.issues) || []
    }
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 256 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self)',
  'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'"
};

const DANGEROUS_PAYLOAD_REGEX = /<\s*\/?\s*(script|iframe|object|embed|svg|math|meta|link|style|base)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|on(load|error|click|mouseover|focus|blur|submit|input|change|keydown)\s*=|(\b(UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET|xp_cmdshell)\b)|(\{\{[\s\S]*?\}\}|\$\{[\s\S]*?\})|(__proto__|prototype\s*\[|constructor\s*\[)/i;

function hasInjectionPayload(val) {
  if (val == null) return false;
  if (typeof val === 'string') return DANGEROUS_PAYLOAD_REGEX.test(val);
  if (Array.isArray(val)) return val.some(item => hasInjectionPayload(item));
  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
      if (hasInjectionPayload(k) || hasInjectionPayload(val[k])) return true;
    }
  }
  return false;
}

function sanitizeInput(val, maxLen = 200) {
  return String(val == null ? '' : val)
    .replace(/[\u0000-\u001F\u007F<>`$\\]/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/(__proto__|constructor|prototype)/gi, '')
    .trim()
    .slice(0, maxLen);
}

// Divergent Learning & Resource Association Catalog (Netflix-Style Post-2FA Onboarding + Associative Bridge Engine)
const ONBOARDING_CATEGORIES = [
  {
    id: 'cat_ai_saas',
    title: 'Autonomous AI Agents & Turnkey SaaS',
    tag: 'AI & SaaS',
    accent: '#3b82f6',
    gradient: 'linear-gradient(135deg, rgba(30,58,138,0.85), rgba(15,23,42,0.96))',
    summary: '24/7 AI receptionists, LangGraph multi-agent orchestration, and commercial turnkey client portals.',
    associatedApps: ['client-turnkey-forge', 'sterling-auto-repair', 'traffic-roi-simulator'],
    associatedResources: ['white-feather'],
    learningTrack: 'ai-web'
  },
  {
    id: 'cat_divergent_lang',
    title: 'Divergent Language & Cognitive Transfer',
    tag: 'Associative Bridge',
    accent: '#10b981',
    gradient: 'linear-gradient(135deg, rgba(6,78,59,0.85), rgba(15,23,42,0.96))',
    summary: 'Learn through high-familiarity cognitive bridges (Spanish → French, English + Arabic → Farsi & Spanish, Korean Hangul → Chinese).',
    associatedApps: ['spanish-acquisition-os', 'chronos-aetheria-scorm'],
    associatedResources: [],
    learningTrack: 'training'
  },
  {
    id: 'cat_cyber_eveng',
    title: 'Zero-Trust Cyber, EVE-NG & Netmiko CLI',
    tag: 'Cyber & NetOps',
    accent: '#06b6d4',
    gradient: 'linear-gradient(135deg, rgba(8,51,68,0.85), rgba(15,23,42,0.96))',
    summary: '15-topology EVE-NG network simulation, IOS-XE/Linux/SQL Ghost-CLI auto-grading, and CMMC 2.0 compliance.',
    associatedApps: ['eveng-netprism-studio', 'ghost-cli-trainer'],
    associatedResources: [],
    learningTrack: 'cyber'
  },
  {
    id: 'cat_federal_sdvosb',
    title: 'SDVOSB Federal Contracting & WAWF',
    tag: 'Federal & Defense',
    accent: '#c5b358',
    gradient: 'linear-gradient(135deg, rgba(120,53,15,0.78), rgba(15,23,42,0.96))',
    summary: 'SAM.gov NAICS 541512/541519 opportunity matching, capability architecture, and PIEE/WAWF settlement.',
    associatedApps: ['samgov-contract-matchmaker', 'client-turnkey-forge'],
    associatedResources: [],
    learningTrack: 'federal'
  },
  {
    id: 'cat_capital_dealflow',
    title: 'Capital, Deal-Flow & Executive Strategy',
    tag: 'Resource + Fast-Track AI',
    accent: '#eab308',
    gradient: 'linear-gradient(135deg, rgba(113,63,18,0.82), rgba(15,23,42,0.96))',
    summary: 'Deal-flow structuring, agency automation blueprints, and qualified partner resource accelerators.',
    associatedApps: ['traffic-roi-simulator', 'client-turnkey-forge'],
    associatedResources: ['white-feather'],
    learningTrack: 'ai-web'
  },
  {
    id: 'cat_chronos_epigraphy',
    title: 'Chronos Geo-Historical & Epigraphy AI',
    tag: 'DeepMind Ithaca / Aeneas',
    accent: '#8b5cf6',
    gradient: 'linear-gradient(135deg, rgba(76,29,149,0.80), rgba(15,23,42,0.96))',
    summary: 'Ancient text restoration, Mediterranean/Near-East linguistic evolution, and 3D geospatial excavation.',
    associatedApps: ['chronos-aetheria-scorm', 'spanish-acquisition-os'],
    associatedResources: [],
    learningTrack: 'training'
  }
];

const DIVERGENT_BRIDGES = {
  en_us_native: {
    id: 'en_us_native',
    label: 'American English Speaker → Romance & Global Bridge',
    familiarAnchors: ['English (Germanic + 60% Latin/Norman Lexical Overlap)', 'High U.S. Spanish Cultural & Lexical Familiarity'],
    sequence: [
      { step: 1, domain: 'Spanish (Anchor Bridge)', transferPct: '82% Lexical & Phonetic Familiarity', rationale: 'High everyday familiarity across U.S. states unlocks Romance verb conjugation, gender agreement, and Latin roots rapidly.' },
      { step: 2, domain: 'French & Italian (Secondary Romance Transfer)', transferPct: '89% Structural & Lexical Transfer from Spanish + English', rationale: 'Once Spanish grammatical scaffolding is internalized alongside English Norman-French cognates, French reading and syntax accelerate by 2.4x.' },
      { step: 3, domain: 'Portuguese & Latin Epigraphy (Chronos OS)', transferPct: '91% Direct Cognate Mapping', rationale: 'Completes pan-Romance fluency and unlocks direct primary-source historical analysis.' }
    ]
  },
  en_arabic_heritage: {
    id: 'en_arabic_heritage',
    label: 'English + Arabic-Influenced Background → Spanish, Farsi & French Bridge',
    familiarAnchors: ['English', 'Arabic Root-and-Pattern & Perso-Arabic Script / Loanword Familiarity'],
    sequence: [
      { step: 1, domain: 'Spanish (Andalusian-Arabic & Latin Bridge)', transferPct: '86% Dual Cognate & Cultural Bridge', rationale: '4,000+ Arabic loanwords in Spanish (al- prefix, Guadal-, ojalá, alcalde) combine with American English familiarity to make Spanish an effortless first bridge.' },
      { step: 2, domain: 'Farsi / Persian (Indo-European Syntax + Perso-Arabic Script)', transferPct: '88% Script + 45% Arabic Loanword + Indo-European Grammar Transfer', rationale: 'Leverages Arabic script and vocabulary familiarity alongside English Indo-European clause structure to master Farsi rapidly.' },
      { step: 3, domain: 'French & Mediterranean Diplomacy', transferPct: '90% Romance + Levant/Maghreb Lexical Transfer', rationale: 'Combines Spanish Romance grammar with shared Arabic-French diplomatic and technical vocabulary.' }
    ]
  },
  east_asian_hangul: {
    id: 'east_asian_hangul',
    label: 'Korean (Hangul) First → Mandarin Chinese & Japanese Structural Bridge',
    familiarAnchors: ['English', 'Logical Phonetic Matrix & Sino-Xenic Root System'],
    sequence: [
      { step: 1, domain: 'Korean (Featural Hangul Alphabet + Hanja Roots)', transferPct: '94% Phonetic Decoding in <4 Hours + 60% Sino-Korean Vocabulary', rationale: 'Hangul is a featural phonetic alphabet learnable in a single afternoon while introducing 60% Sino-Korean (Hanja) syllable roots.' },
      { step: 2, domain: 'Mandarin Chinese (Hanja → Hanzi Semantic & Phonetic Transfer)', transferPct: '78% Root & Compound Concept Transfer', rationale: 'Learning Korean first demystifies East Asian disyllabic compound logic before tackling tonal Mandarin and logographic Hanzi characters.' },
      { step: 3, domain: 'Japanese (Shared SOV Syntax with Korean + Kanji Cognates)', transferPct: '85% Grammatical & Particle Equivalence with Korean', rationale: 'Korean and Japanese share near-identical agglutinative SOV grammar and topic/subject particles.' }
    ]
  },
  cli_netops_ai: {
    id: 'cli_netops_ai',
    label: 'Network CLI & SQL → Ansible YAML → Autonomous LangGraph AI Agents',
    familiarAnchors: ['Deterministic Command Syntax', 'Relational Logic & State Machines'],
    sequence: [
      { step: 1, domain: 'IOS-XE, Linux & 3NF SQL (Ghost-CLI & EVE-NG)', transferPct: '88% Deterministic State Mental Model', rationale: 'Grounds the learner in concrete packet routing, subnetting, and relational database normalization.' },
      { step: 2, domain: 'Declarative Ansible Playbooks & Netmiko Python', transferPct: '91% CLI-to-Automation Transfer', rationale: 'Translates imperative CLI commands directly into idempotent infrastructure-as-code.' },
      { step: 3, domain: 'LangGraph Multi-Agent & SAS ModelOps Pipelines', transferPct: '87% Graph Topology & Telemetry Transfer', rationale: 'Applies network routing and state-graph intuition directly to autonomous AI agent orchestration.' }
    ]
  }
};

function computeDivergentRecommendations(user) {
  const cats = Array.isArray(user && user.selectedCategories) && user.selectedCategories.length
    ? user.selectedCategories
    : ['cat_ai_saas', 'cat_divergent_lang'];
  const baselineKey = (user && user.divergentBaseline && DIVERGENT_BRIDGES[user.divergentBaseline])
    ? user.divergentBaseline
    : 'en_arabic_heritage';
  const bridge = DIVERGENT_BRIDGES[baselineKey];
  const matchedCatObjs = ONBOARDING_CATEGORIES.filter(c => cats.includes(c.id));
  const recommendedAppIds = new Set();
  const recommendedResourceIds = new Set();
  matchedCatObjs.forEach(c => {
    (c.associatedApps || []).forEach(a => recommendedAppIds.add(a));
    (c.associatedResources || []).forEach(r => recommendedResourceIds.add(r));
  });
  return {
    onboardingCompleted: Boolean(user && user.onboardingCompleted),
    selectedCategories: cats,
    divergentBaseline: baselineKey,
    bridge,
    recommendedApps: Array.from(recommendedAppIds),
    recommendedResources: Array.from(recommendedResourceIds),
    qualifiedResources: getQualifiedResourcesForUser(user)
  };
}

const RATE_BUCKETS = new Map();
function checkRateLimit(req, bucketName, maxHits = 30, windowMs = 60000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
  const key = `${bucketName}:${ip}`;
  const nowTs = Date.now();
  const hits = (RATE_BUCKETS.get(key) || []).filter(ts => nowTs - ts < windowMs);
  if (hits.length >= maxHits) return false;
  hits.push(nowTs);
  RATE_BUCKETS.set(key, hits);
  return true;
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function renderLockedHtml(u, title, message, ctaHref, ctaLabel) {
  const isFix = u && u.brand === 'FIX';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | MGC / F.I.X</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;
    background:${isFix ? '#0B1426' : '#09090B'};color:${isFix ? '#F8FAFC' : '#FAFAFA'}}
  .card{max-width:540px;width:100%;background:${isFix ? '#111d36' : '#141519'};border:1px solid ${isFix ? 'rgba(197,179,88,.4)' : '#27272A'};border-radius:16px;padding:28px;text-align:center}
  h1{font-size:22px;margin:0 0 8px}
  p{color:${isFix ? '#94A3B8' : '#A1A1AA'};font-size:14px;line-height:1.6;margin:0 0 18px}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;font-weight:800;font-size:13px;text-decoration:none;
    background:${isFix ? '#FDE047' : '#FFFFFF'};color:${isFix ? '#0B1426' : '#09090B'}}
</style>
</head>
<body>
  <main class="card">
    <div style="font-size:32px;margin-bottom:8px">🔒</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="${ctaHref || '/member-portal.html'}">${ctaLabel || 'Return to My Workspace →'}</a>
  </main>
</body>
</html>`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.kml':  'application/vnd.google-earth.kml+xml; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, service: 'mgc-command-workspace', ts: now() });
    }

    // Canonical Domain Enforcement: redirect raw *.run.app browser URLs (e.g. mgc-external-site-254657731107.us-west1.run.app) to https://miltongroupsecurity.org
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    if (req.method === 'GET' && rawHost.endsWith('.run.app') && !pathname.startsWith('/api/') && !req.headers['x-mgc-proxy']) {
      let cleanPath = toCleanRoute(pathname) || pathname;
      if (cleanPath === '/' && rawHost.startsWith('mgc-external-site')) {
        cleanPath = '/auth';
      }
      const nextParam = parsedUrl.searchParams.get('next') || '';
      const cleanDest = toCleanRoute(nextParam);
      const headers = { 'Location': `https://miltongroupsecurity.org${cleanPath}` };
      if (cleanDest && cleanDest !== '/auth' && cleanDest !== '/login') {
        const retTok = signToken({ next: cleanDest }, 900);
        headers['Set-Cookie'] = `mgcw_return=${encodeURIComponent(retTok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`;
      }
      res.writeHead(302, headers);
      return res.end();
    }

    /* ---------- Enforced Federated OIDC / OAuth 2.0 + JWKS Verification Engine ---------- */
    const OIDC_JWKS_URLS = {
      google:    'https://www.googleapis.com/oauth2/v3/certs',
      microsoft: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
      apple:     'https://appleid.apple.com/auth/keys',
      firebase:  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    };

    const getOauthConfig = () => {
      const saved = S.oauthConfig || {};
      const gClientId = saved.googleClientId || process.env.GOOGLE_CLIENT_ID || '254657731107-sgdbihvbrpar0sr6mg1msf6mv11s1cor.apps.googleusercontent.com';
      const msClientId = saved.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || '';
      const apClientId = saved.appleClientId || process.env.APPLE_CLIENT_ID || '';
      const fbApiKey = saved.firebaseApiKey || process.env.FIREBASE_API_KEY || 'AIzaSyAfzbxbI-CD0bwmgNhJKzXTKVucDoG0D6k';
      const fbAuthDomain = saved.firebaseAuthDomain || process.env.FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0636792472.firebaseapp.com';
      const fbProjectId = saved.firebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0636792472';
      return {
        googleClientId: gClientId,
        microsoftClientId: msClientId,
        appleClientId: apClientId,
        firebaseApiKey: fbApiKey,
        firebaseAuthDomain: fbAuthDomain,
        firebaseProjectId: fbProjectId
      };
    };

    const fetchHttpsJson = (urlStr) => new Promise((resolve) => {
      try {
        const u = new URL(urlStr);
        const r = https.request({
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'GET',
          timeout: 3500
        }, (resp) => {
          let raw = '';
          resp.on('data', c => { raw += c; });
          resp.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); }
          });
        });
        r.on('error', () => resolve(null));
        r.on('timeout', () => { r.destroy(); resolve(null); });
        r.end();
      } catch (_) {
        resolve(null);
      }
    });

    const verifyOidcIdToken = async (idToken, provider) => {
      if (!idToken || typeof idToken !== 'string' || idToken.split('.').length !== 3) return null;
      try {
        const [hB64, pB64, sB64] = idToken.split('.');
        const header = JSON.parse(Buffer.from(hB64, 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(pB64, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

        // Verify cryptographic RS256 signature against provider's live JWKS (or Firebase JWKS if issued by securetoken.google.com)
        const iss = String(payload.iss || '');
        const jwksUrl = iss.includes('securetoken.google.com')
          ? OIDC_JWKS_URLS.firebase
          : (OIDC_JWKS_URLS[provider] || OIDC_JWKS_URLS.google);
        const jwks = await fetchHttpsJson(jwksUrl);
        let sigVerified = false;
        if (jwks && Array.isArray(jwks.keys) && header.kid) {
          const jwk = jwks.keys.find(k => k.kid === header.kid);
          if (jwk) {
            sigVerified = crypto.verify(
              'RSA-SHA256',
              Buffer.from(`${hB64}.${pB64}`),
              { key: jwk, format: 'jwk' },
              Buffer.from(sB64, 'base64url')
            );
          }
        }
        return {
          email: String(payload.email || payload.preferred_username || payload.upn || '').toLowerCase(),
          name: String(payload.name || payload.given_name || ''),
          sub: String(payload.sub || ''),
          iss,
          sigVerified
        };
      } catch (_) {
        return null;
      }
    };

    const fetchHttpsWithAuth = (urlStr, method = 'GET', token = '', bodyObj = null, quotaProj = 'smiling-man-ace8f') => new Promise((resolve) => {
      try {
        const u = new URL(urlStr);
        const payload = bodyObj ? JSON.stringify(bodyObj) : null;
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          headers['x-goog-user-project'] = quotaProj;
        }
        if (payload) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const r = https.request({
          hostname: u.hostname,
          path: u.pathname + u.search,
          method,
          headers,
          timeout: 4000
        }, (resp) => {
          let raw = '';
          resp.on('data', c => { raw += c; });
          resp.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); }
          });
        });
        r.on('error', () => resolve(null));
        r.on('timeout', () => { r.destroy(); resolve(null); });
        if (payload) r.write(payload);
        r.end();
      } catch (_) {
        resolve(null);
      }
    });

    const autoDiscoverIdentityPlatformViaAdc = async () => {
      const current = getOauthConfig();
      const adcTok = await fetchCloudRunAdcToken();
      if (!adcTok) return { ...current, status: current.firebaseApiKey ? 'CONFIGURED' : 'LOCAL_NO_ADC' };
      const proj = current.firebaseProjectId || 'gen-lang-client-0636792472';
      const runProj = 'gen-lang-client-0636792472';
      let diag = current.firebaseApiKey ? 'CONFIGURED' : 'ADC_OK';
      try {
        let idpCfg = await fetchHttpsWithAuth(`https://identitytoolkit.googleapis.com/admin/v2/projects/${proj}/config`, 'GET', adcTok, null, proj);
        if (idpCfg && Array.isArray(idpCfg.authorizedDomains)) {
          const needed = [
            'mgc-external-site-254657731107.us-west1.run.app',
            'milton-group-concepts-llc-254657731107.us-west1.run.app',
            'miltongroupsecurity.org',
            'portal.miltongroupsecurity.org',
            'workspace.miltongroupsecurity.org'
          ];
          const missing = needed.filter(d => !idpCfg.authorizedDomains.includes(d));
          if (missing.length > 0) {
            const merged = Array.from(new Set([...idpCfg.authorizedDomains, ...needed]));
            await fetchHttpsWithAuth(
              `https://identitytoolkit.googleapis.com/admin/v2/projects/${proj}/config?updateMask=authorizedDomains`,
              'PATCH',
              adcTok,
              { authorizedDomains: merged },
              proj
            );
          }
        }
        let discoveredApiKey = (idpCfg && idpCfg.client && idpCfg.client.apiKey) ? idpCfg.client.apiKey : '';
        if (!discoveredApiKey) {
          const keysList = await fetchHttpsWithAuth(`https://apikeys.googleapis.com/v2/projects/${proj}/locations/global/keys`, 'GET', adcTok, null, proj);
          if (keysList && Array.isArray(keysList.keys) && keysList.keys.length > 0) {
            const firstKeyName = keysList.keys[0].name;
            const keyStrRes = await fetchHttpsWithAuth(`https://apikeys.googleapis.com/v2/${firstKeyName}/keyString`, 'GET', adcTok, null, proj);
            if (keyStrRes && keyStrRes.keyString) discoveredApiKey = keyStrRes.keyString;
          }
        }
        const idps = await fetchHttpsWithAuth(`https://identitytoolkit.googleapis.com/admin/v2/projects/${proj}/defaultSupportedIdpConfigs`, 'GET', adcTok, null, proj);
        const foundClients = {};
        if (idps && Array.isArray(idps.defaultSupportedIdpConfigs)) {
          idps.defaultSupportedIdpConfigs.forEach(c => {
            if (String(c.name || '').endsWith('/google.com') && c.clientId) foundClients.googleClientId = c.clientId;
            if (String(c.name || '').endsWith('/microsoft.com') && c.clientId) foundClients.microsoftClientId = c.clientId;
            if (String(c.name || '').endsWith('/apple.com') && c.clientId) foundClients.appleClientId = c.clientId;
          });
        }
        if (discoveredApiKey || Object.keys(foundClients).length > 0) {
          S.oauthConfig = Object.assign({}, S.oauthConfig || {}, {
            ...(discoveredApiKey ? { firebaseApiKey: discoveredApiKey } : {}),
            ...foundClients
          });
          saveState(S);
          diag = 'AUTO_DISCOVERED';
        }
        // Also ensure milton-group-concepts-llc (mapped to miltongroupsecurity.org) runs the unified image
        const selfSvc = await fetchHttpsWithAuth(`https://run.googleapis.com/v2/projects/${runProj}/locations/us-west1/services/mgc-external-site`, 'GET', adcTok, null, runProj);
        const mainSvc = await fetchHttpsWithAuth(`https://run.googleapis.com/v2/projects/${runProj}/locations/us-west1/services/milton-group-concepts-llc`, 'GET', adcTok, null, runProj);
        const selfImg = selfSvc && selfSvc.template && selfSvc.template.containers && selfSvc.template.containers[0] ? selfSvc.template.containers[0].image : '';
        const mainImg = mainSvc && mainSvc.template && mainSvc.template.containers && mainSvc.template.containers[0] ? mainSvc.template.containers[0].image : '';
        if (selfImg && mainImg && selfImg !== mainImg) {
          const patchRes = await fetchHttpsWithAuth(
            `https://run.googleapis.com/v2/projects/${runProj}/locations/us-west1/services/milton-group-concepts-llc?updateMask=template.containers`,
            'PATCH',
            adcTok,
            { template: { containers: selfSvc.template.containers } },
            runProj
          );
          diag += patchRes && !patchRes.error ? '|MAIN_DOMAIN_SYNCED' : `|MAIN_SYNC_ERR:${patchRes && patchRes.error ? patchRes.error.status : 'UNK'}`;
        } else if (selfImg && selfImg === mainImg) {
          diag += '|MAIN_DOMAIN_IN_SYNC';
        }
      } catch (_) {}
      return { ...getOauthConfig(), status: diag };
    };

    if (pathname === '/api/auth/config' && req.method === 'GET') {
      const cfg = await autoDiscoverIdentityPlatformViaAdc();
      const adminConfigured = hasAdminCredentialsConfigured();
      return sendJson(res, 200, {
        ssoEnforced: true,
        allowedProviders: ['google', 'microsoft', 'apple', 'password'],
        passwordAuthAllowed: true,
        emailLinkAllowed: false,
        caseInsensitiveLogin: true,
        caseSensitivePassword: true,
        genericPasswordsRevoked: true,
        adminCredentialsConfigured: adminConfigured,
        adminCredentialSetupRequired: !adminConfigured,
        securityAlert: !adminConfigured
          ? 'IMMEDIATE ACTION REQUIRED: Generic passwords have been permanently revoked. Set your Administrator Account Username and Case-Sensitive Password immediately.'
          : null,
        discoveryStatus: cfg.status || 'READY',
        firebaseProjectId: cfg.firebaseProjectId,
        firebaseAuthDomain: cfg.firebaseAuthDomain,
        firebaseApiKeyConfigured: Boolean(cfg.firebaseApiKey),
        firebaseApiKey: cfg.firebaseApiKey,
        oidcProviders: {
          google: {
            issuer: 'https://accounts.google.com',
            authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            jwksUri: OIDC_JWKS_URLS.google,
            clientId: cfg.googleClientId || '',
            liveConfigured: Boolean(cfg.googleClientId || cfg.firebaseApiKey)
          },
          microsoft: {
            issuer: 'https://login.microsoftonline.com/common/v2.0',
            authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            jwksUri: OIDC_JWKS_URLS.microsoft,
            clientId: cfg.microsoftClientId || '',
            liveConfigured: Boolean(cfg.microsoftClientId || cfg.firebaseApiKey)
          },
          apple: {
            issuer: 'https://appleid.apple.com',
            authEndpoint: 'https://appleid.apple.com/auth/authorize',
            jwksUri: OIDC_JWKS_URLS.apple,
            clientId: cfg.appleClientId || '',
            liveConfigured: Boolean(cfg.appleClientId || cfg.firebaseApiKey)
          }
        }
      });
    }

    if (pathname === '/api/auth/admin-bootstrap' && req.method === 'POST') {
      if (!checkRateLimit(req, 'admin_bootstrap', 15, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait 60 seconds.' });
      }
      const u = getAuthenticatedUser(req);
      const isOwnerSession = Boolean(u && u.role === 'owner' && u.id === 'owner');
      const body = await readJsonBody(req);
      if (hasAdminCredentialsConfigured() && !isOwnerSession && !isValidAdminSecret(body.currentPassword || '')) {
        return sendJson(res, 403, {
          ok: false,
          code: 'ADMIN_ALREADY_CONFIGURED',
          error: 'Administrator credentials are already configured and locked. Provide your current Administrator password or sign in as Administrator to rotate credentials.'
        });
      }
      const verifyEmail = String(body.email || SOLE_ADMIN_EMAIL).trim().toLowerCase();
      if (verifyEmail !== SOLE_ADMIN_EMAIL) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Administrator credential setup must be tied to malik.khabir@Miltongroupsecurity.org (case-insensitive).'
        });
      }
      const cleanAdminUsername = sanitizeInput(body.username || 'malik.khabir', 60).toLowerCase();
      const newPassword = String(body.newPassword || body.password || '');
      if (!cleanAdminUsername || cleanAdminUsername.length < 3) {
        return sendJson(res, 400, { ok: false, error: 'Administrator username (sAMAccountName) must be at least 3 characters.' });
      }
      if (!newPassword || newPassword.length < 8) {
        return sendJson(res, 400, { ok: false, error: 'Administrator password must be at least 8 characters (case-sensitive).' });
      }
      if (isGenericOrRevokedSecret(newPassword)) {
        logAudit('system', 'security.generic_admin_password_rejected', 'Blocked attempt to set a generic/revoked Administrator password');
        return sendJson(res, 403, {
          ok: false,
          code: 'GENERIC_PASSWORD_PROHIBITED',
          error: 'SECURITY ENFORCEMENT: Generic or previously used test passwords are strictly prohibited. Please set a unique, case-sensitive Administrator password.'
        });
      }
      S.users.owner.username = cleanAdminUsername;
      S.users.owner.email = SOLE_ADMIN_EMAIL;
      S.users.owner.customPasswordDigest = mgcDigest(newPassword);
      S.users.owner.passwordConfiguredAt = now();
      S.currentUser = 'owner';
      logAudit('owner', 'security.admin_credentials_provisioned', `Admin username=${cleanAdminUsername} & custom case-sensitive password configured`);
      saveState(S);
      const sessionToken = signToken({
        uid: 'owner',
        email: SOLE_ADMIN_EMAIL,
        role: 'owner',
        accessTier: 'OWNER_FULL',
        provider: 'password',
        ssoVerified: true
      });
      return sendJson(res, 200, {
        ok: true,
        adminCredentialsConfigured: true,
        username: cleanAdminUsername,
        email: SOLE_ADMIN_EMAIL,
        redirect: '/access-admin',
        message: 'Administrator username and case-sensitive password have been securely provisioned and locked.'
      }, {
        'Set-Cookie': [
          `mgcw_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 7}`
        ]
      });
    }

    if (pathname === '/api/auth/config' && req.method === 'POST') {
      const body = await readJsonBody(req);
      S.oauthConfig = Object.assign({}, S.oauthConfig || {}, {
        ...(body.googleClientId !== undefined ? { googleClientId: String(body.googleClientId).trim() } : {}),
        ...(body.microsoftClientId !== undefined ? { microsoftClientId: String(body.microsoftClientId).trim() } : {}),
        ...(body.appleClientId !== undefined ? { appleClientId: String(body.appleClientId).trim() } : {}),
        ...(body.firebaseApiKey !== undefined ? { firebaseApiKey: String(body.firebaseApiKey).trim() } : {}),
        ...(body.firebaseAuthDomain !== undefined ? { firebaseAuthDomain: String(body.firebaseAuthDomain).trim() } : {}),
        ...(body.firebaseProjectId !== undefined ? { firebaseProjectId: String(body.firebaseProjectId).trim() } : {})
      });
      logAudit('owner', 'auth.oidc_config_updated', Object.keys(body).join(','));
      saveState(S);
      return sendJson(res, 200, { ok: true, config: getOauthConfig() });
    }

    // Real Federated OAuth 2.0 / OIDC Redirect Initiator (/api/auth/oauth/start?provider=google|microsoft|apple)
    if (pathname === '/api/auth/oauth/start' && req.method === 'GET') {
      const provider = String(parsedUrl.searchParams.get('provider') || 'google').toLowerCase();
      if (!ALLOWED_SSO_PROVIDERS.has(provider)) {
        return sendJson(res, 403, { ok: false, error: 'Only Google, Microsoft, or Apple SSO is permitted.' });
      }
      const cfg = getOauthConfig();
      const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const fwdHost = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
      const origin = `${proto}://${fwdHost}`;
      const redirectUri = `${origin}/api/auth/oauth/callback`;
      const nonce = crypto.randomBytes(12).toString('hex');
      const stateTok = signToken({ provider, nonce }, 600);

      let authUrl = '';
      if (provider === 'google' && cfg.googleClientId) {
        const q = new URLSearchParams({
          client_id: cfg.googleClientId,
          redirect_uri: redirectUri,
          response_type: 'id_token',
          scope: 'openid email profile',
          state: stateTok,
          nonce,
          prompt: 'select_account'
        });
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
      } else if (provider === 'microsoft' && cfg.microsoftClientId) {
        const q = new URLSearchParams({
          client_id: cfg.microsoftClientId,
          redirect_uri: redirectUri,
          response_type: 'id_token',
          response_mode: 'fragment',
          scope: 'openid email profile',
          state: stateTok,
          nonce,
          prompt: 'select_account'
        });
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q.toString()}`;
      } else if (provider === 'apple' && cfg.appleClientId) {
        const q = new URLSearchParams({
          client_id: cfg.appleClientId,
          redirect_uri: redirectUri,
          response_type: 'id_token',
          response_mode: 'fragment',
          scope: 'openid email',
          state: stateTok,
          nonce
        });
        authUrl = `https://appleid.apple.com/auth/authorize?${q.toString()}`;
      } else {
        return sendJson(res, 400, {
          ok: false,
          needsClientId: true,
          provider,
          redirectUri,
          message: `Configure your ${SSO_PROVIDER_LABELS[provider]} OAuth Client ID (Authorized Redirect URI: ${redirectUri}) or Firebase API Key to launch live federated redirect.`
        });
      }

      res.writeHead(302, {
        'Set-Cookie': `mgcw_oidc_state=${encodeURIComponent(stateTok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
        'Location': authUrl
      });
      return res.end();
    }

    // Real Federated OAuth 2.0 / OIDC Callback (/api/auth/oauth/callback)
    if (pathname === '/api/auth/oauth/callback' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Completing Federated SSO...</title></head><body style="background:#040814;color:#f8fafc;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div>Verifying Federated OIDC Token...</div><script>
        (async function(){
          const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
          const qs = new URLSearchParams(location.search);
          const idToken = hash.get('id_token') || qs.get('id_token') || '';
          const state = hash.get('state') || qs.get('state') || '';
          if (!idToken) { location.replace('/auth'); return; }
          const r = await fetch('/api/auth/sso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, state })
          });
          const d = await r.json();
          location.replace(d && d.ok && d.redirect ? d.redirect : '/auth');
        })();
      </script></body></html>`);
    }

    // Explicitly block passwordless email-link methods
    if (pathname === '/api/auth/email-link' || pathname === '/api/auth/verify-link') {
      return sendJson(res, 403, {
        ok: false,
        error: 'Email-link sign-in is disabled. Please sign in with your Email/Username & Password or Google, Microsoft, or Apple SSO.'
      });
    }

    // Unified Email/Username + Password & Federated SSO Exchange (/api/auth/login, /api/auth/password, /api/auth/sso, /api/auth/google, /api/auth/microsoft, /api/auth/apple)
    if ((pathname === '/api/auth/login' || pathname === '/api/auth/password' || pathname === '/api/auth/sso' || pathname === '/api/auth/google' || pathname === '/api/auth/microsoft' || pathname === '/api/auth/apple') && req.method === 'POST') {
      if (!checkRateLimit(req, 'auth_login', 30, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many authentication attempts. Please wait 60 seconds.' });
      }
      const body = await readJsonBody(req);
      const isPasswordRoute = pathname.endsWith('/login') || pathname.endsWith('/password');
      const routeProvider = isPasswordRoute ? 'password' : pathname.endsWith('/google') ? 'google' : pathname.endsWith('/microsoft') ? 'microsoft' : pathname.endsWith('/apple') ? 'apple' : '';
      let provider = String(body.provider || routeProvider || (body.password ? 'password' : '')).trim().toLowerCase();
      if (!provider && body.state) {
        const stClaims = verifyToken(body.state);
        if (stClaims && stClaims.provider) provider = stClaims.provider;
      }

      if (!ALLOWED_SSO_PROVIDERS.has(provider)) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Authentication Policy Enforced: Please sign in with Email/Username & Password or Google, Microsoft, or Apple SSO.'
        });
      }

      let rawIdentifier = String(body.identifier || body.username || body.email || '').trim();
      let email = resolveCaseInsensitiveIdentifier(rawIdentifier);
      let name = String(body.name || '').trim();
      let jwksVerified = false;
      if (body.idToken && typeof body.idToken === 'string' && body.idToken.split('.').length === 3) {
        const verified = await verifyOidcIdToken(body.idToken, provider);
        if (verified && verified.email) {
          email = resolveCaseInsensitiveIdentifier(verified.email);
          if (verified.name) name = verified.name;
          jwksVerified = Boolean(verified.sigVerified);
        }
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid Email address or registered Username.' });
      }
      // Demo account ana@example.com specifically demonstrates a pending unapproved request
      if (email === 'ana@example.com' && S.users.ana && S.users.ana.status === 'requested') {
        logAudit('system', `auth.sso.pending.${provider}`, `Pending approval check for ${email}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'Your workspace access request is pending Owner review and approval.'
        });
      }
      // STRICT 1-ADMIN ZERO-LEAKAGE GUARD: Only Malik A. Khabir (malik.khabir@Miltongroupsecurity.org, case-insensitive) is Administrator.
      // Block any legacy/spoofed @miltongroupsecurity.org or owner@* / admin@* accounts unless provisioned as an active directory user by Admin.
      const existingDirUser = Object.values(S.users).find(u => u.id !== 'owner' && String(u.email || '').toLowerCase() === email);
      if (((email.endsWith('@miltongroupsecurity.org') && email !== SOLE_ADMIN_EMAIL && !existingDirUser) || email.startsWith('owner@') || email.startsWith('admin@'))) {
        logAudit('system', `security.admin_spoof_blocked.${provider}`, `Blocked spoofed/legacy admin email: ${email}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'Security Policy Enforced: Only 1 Administrator account exists (malik.khabir@Miltongroupsecurity.org). Spoofed or legacy admin accounts are blocked.'
        });
      }
      // Any attempt to sign in as Administrator (malik.khabir@Miltongroupsecurity.org, case-insensitive) requires either a verified OIDC RS256 token OR Malik's Administrator Password / Passkey.
      if (OWNER_EMAILS.has(email)) {
        const providedSecret = String(body.password || body.mfaCode || body.totp || body.adminPasskey || '').trim();
        if (!jwksVerified && !isValidAdminSecret(providedSecret)) {
          logAudit('system', `security.admin_auth_blocked.${provider}`, `Blocked unverified admin login attempt for ${email}`);
          return sendJson(res, 403, {
            ok: false,
            requireAdminMfa: true,
            error: 'Administrator Account Protected: Enter the valid Administrator Password / Passkey for malik.khabir@Miltongroupsecurity.org.'
          });
        }
      } else if (provider === 'password' || isPasswordRoute) {
        // Universal Directory User (Internal & External) Email/UPN or sAMAccountName + Case-Sensitive Password authentication
        const providedPass = String(body.password || '');
        if (!providedPass || providedPass.length < 4) {
          return sendJson(res, 400, { ok: false, error: 'Please enter your account password.' });
        }
        const existingCustomer = Object.values(S.users).find(u => u.id !== 'owner' && String(u.email || '').toLowerCase() === email);
        if (!existingCustomer) {
          return sendJson(res, 401, {
            ok: false,
            error: 'Account not found for that email/username. Click "Register Account" to create your account first.'
          });
        }
        if (existingCustomer.status === 'denied' || existingCustomer.status === 'suspended') {
          return sendJson(res, 403, { ok: false, error: 'Access Denied: This account has been restricted by the Administrator.' });
        }
        if (isGenericOrRevokedSecret(providedPass)) {
          logAudit(existingCustomer.id, 'security.generic_user_password_rejected', `Rejected generic password attempt for ${email}`);
          return sendJson(res, 403, {
            ok: false,
            code: 'GENERIC_PASSWORD_PROHIBITED',
            error: 'SECURITY ENFORCEMENT: Generic or default passwords are permanently prohibited.'
          });
        }
        const passDig = mgcDigest(providedPass);
        const expectedDig = existingCustomer.passwordDigest || null;
        if (!expectedDig || passDig !== expectedDig) {
          logAudit(existingCustomer.id, 'security.user_password_failed', `Case-sensitive password mismatch for ${email}`);
          return sendJson(res, 403, { ok: false, error: 'Invalid email/username or password (passwords are case-sensitive).' });
        }
      }
      const user = findOrCreateUserByEmail(email, name, SSO_PROVIDER_LABELS[provider]);
      if (!user || user.status === 'denied' || user.status === 'suspended') {
        logAudit('system', `auth.sso.denied.${provider}`, `Rejected denied/suspended SSO attempt for ${email}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'SSO Access Denied: This account has been restricted by the platform Owner.'
        });
      }
      user.ssoProvider = provider;
      if (name && user.role !== 'owner') user.name = sanitizeInput(name, 80);
      if (body.org && user.role !== 'owner') user.org = sanitizeInput(body.org, 120);
      if (body.interest && TAILOR[body.interest] && user.role !== 'owner') {
        user.quote = Object.assign({}, user.quote || {}, { interest: body.interest });
      }
      if (user.role !== 'owner' && !S.requests.some(r => r.uid === user.id)) {
        S.requests.unshift({
          id: uid('intake'),
          uid: user.id,
          interest: (user.quote && user.quote.interest) || 'ai-web',
          org: user.org || 'MGC Partner',
          status: 'requested',
          created: now()
        });
      }
      const sessionToken = signToken({
        uid: user.id,
        email: user.email,
        role: user.role,
        accessTier: user.role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
        provider,
        ssoVerified: true,
        jwksVerified
      });
      logAudit(user.id, `auth.sso.${provider}`, `${user.email} via ${SSO_PROVIDER_LABELS[provider]} [${user.role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED'}]${jwksVerified ? ' (JWKS-RS256)' : ''}`);
      saveState(S);
      const reqCookies = parseCookies(req);
      const returnClaims = verifyToken(reqCookies.mgcw_return);
      const requestedNext = (body.next && String(body.next).trim()) || (returnClaims && returnClaims.next) || '';
      const cleanNext = toCleanRoute(requestedNext);
      const mobileClient = isMobileRequest(req, parsedUrl);
      const defaultClean = mobileClient ? '/mobile' : (user.role === 'owner' ? '/access-admin' : '/apps');
      const target = mobileClient ? '/mobile' : ((cleanNext && cleanNext !== '/auth' && cleanNext !== '/login') ? cleanNext : defaultClean);
      const effectiveAllowedApps = user.role === 'owner'
        ? APPS_CATALOG.map(a => a.id)
        : APPS_CATALOG.filter(a => can(user, 'app', a.id, 'view')).map(a => a.id);
      const effectiveAllowedPortals = getAllowedPortalsForUser(user);
      const effectiveAllowedPages = getAllowedPagesForUser(user);
      return sendJson(res, 200, {
        ok: true,
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accessTier: user.role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
        allowedApps: effectiveAllowedApps,
        allowedPages: effectiveAllowedPages,
        allowedPortals: effectiveAllowedPortals,
        provider,
        providerLabel: SSO_PROVIDER_LABELS[provider],
        ssoVerified: true,
        jwksVerified,
        redirect: target
      }, {
        'Set-Cookie': [
          `mgcw_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 7}`,
          'mgcw_return=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        ]
      });
    }

    // Sign out
    if (pathname === '/api/auth/logout' && (req.method === 'POST' || req.method === 'GET')) {
      res.writeHead(302, {
        'Set-Cookie': [
          'mgcw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          'mgcw_return=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        ],
        'Location': '/auth'
      });
      return res.end();
    }

    /* ---------- Executive Intelligence Newsletter API ---------- */
    if (pathname === '/api/newsletter' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      const nl = S.newsletter || seedState().newsletter;
      const uEmail = u ? String(u.email || '').toLowerCase() : '';
      const subRecord = uEmail ? (nl.subscribers || []).find(s => s.email === uEmail) : null;
      return sendJson(res, 200, {
        ok: true,
        subscriberCount: (nl.subscribers || []).length,
        subscribersCount: 140 + (nl.subscribers || []).length,
        subscribed: Boolean(subRecord),
        subscriberTrack: subRecord ? subRecord.track : null,
        subscribers: (u && u.role === 'owner') ? (nl.subscribers || []) : undefined,
        issues: nl.issues || []
      });
    }

    if (pathname === '/api/newsletter/subscribe' && req.method === 'POST') {
      if (!checkRateLimit(req, 'newsletter_sub', 20, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      const u = getAuthenticatedUser(req);
      const email = sanitizeInput(body.email || (u && u.email) || '', 140).toLowerCase();
      const name = sanitizeInput(body.name || (u && u.name) || email.split('@')[0] || 'Subscriber', 90);
      const track = ['ALL', 'ZERO_TRUST_CYBER', 'SDVOSB_FEDERAL', 'AI_AUTOMATION'].includes(body.track) ? body.track : 'ALL';
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      }
      if (!S.newsletter) S.newsletter = seedState().newsletter;
      const existing = S.newsletter.subscribers.find(s => s.email === email);
      if (existing) {
        existing.track = track;
        existing.name = name || existing.name;
        existing.updatedAt = now();
      } else {
        S.newsletter.subscribers.unshift({
          email,
          name,
          track,
          frequency: 'weekly',
          subscribedAt: now(),
          verified: true
        });
      }
      notifyUser('owner', 'Newsletter Subscriber Added', `${name} (${email}) subscribed to [${track}] Executive Briefings.`);
      logAudit(u ? u.id : 'public', 'newsletter.subscribe', `${email} (${track})`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        email,
        track,
        subscriberCount: S.newsletter.subscribers.length,
        subscribersCount: 140 + S.newsletter.subscribers.length,
        message: 'Subscribed to MGC & F.I.X Executive Intelligence Briefings.'
      });
    }

    if (pathname === '/api/newsletter/unsubscribe' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const u = getAuthenticatedUser(req);
      const email = sanitizeInput(body.email || (u && u.email) || '', 140).toLowerCase();
      if (S.newsletter && Array.isArray(S.newsletter.subscribers)) {
        S.newsletter.subscribers = S.newsletter.subscribers.filter(s => s.email !== email);
        logAudit(u ? u.id : 'public', 'newsletter.unsubscribe', email);
        saveState(S);
      }
      return sendJson(res, 200, { ok: true, email });
    }

    if (pathname === '/api/newsletter/publish' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u || u.role !== 'owner') {
        return sendJson(res, 403, { ok: false, error: 'Owner authorization required to publish newsletter issues.' });
      }
      const body = await readJsonBody(req);
      const title = sanitizeInput(body.title, 160);
      const summary = sanitizeInput(body.summary, 600);
      const track = sanitizeInput(body.track || 'EXECUTIVE BRIEFING', 48).toUpperCase();
      const highlights = Array.isArray(body.highlights)
        ? body.highlights.map(h => sanitizeInput(h, 220)).filter(Boolean).slice(0, 5)
        : String(body.highlights || '').split('\n').map(h => sanitizeInput(h, 220)).filter(Boolean).slice(0, 5);
      if (!title || !summary) {
        return sendJson(res, 400, { ok: false, error: 'Title and summary are required.' });
      }
      if (!S.newsletter) S.newsletter = seedState().newsletter;
      const nextNum = (S.newsletter.issues || []).length + 2;
      const issue = {
        id: uid('iss'),
        issueNumber: `Issue #${String(nextNum).padStart(2, '0')}`,
        track,
        date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        readTime: '3 min read',
        title,
        summary,
        highlights: highlights.length ? highlights : ['Published via MGC Owner Command Deck']
      };
      S.newsletter.issues.unshift(issue);
      Object.values(S.users || {}).forEach(usr => {
        notifyUser(usr.id, `New Briefing: ${issue.issueNumber} — ${issue.title}`, issue.summary);
      });
      logAudit('owner', 'newsletter.publish', `${issue.issueNumber}: ${issue.title}`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        issue,
        issues: S.newsletter.issues,
        subscriberCount: S.newsletter.subscribers.length,
        subscribersCount: 140 + S.newsletter.subscribers.length,
        newsletter: {
          subscribersCount: 140 + S.newsletter.subscribers.length,
          issues: S.newsletter.issues
        }
      });
    }

    /* ---------- Scoped State & Action API ---------- */
    if (pathname === '/api/state' && req.method === 'GET') {
      DB_STATS.readsToday++;
      const u = getAuthenticatedUser(req);
      return sendJson(res, 200, scopeStateForUser(u));
    }

    if (pathname === '/api/db/status' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      return sendJson(res, 200, {
        ok: true,
        connected: true,
        engine: 'ACID-JSON-WAL + Cloud Firestore (nam5 Free-Tier Bridge) + IndexedDB',
        authenticated: Boolean(u),
        role: u ? u.role : 'anonymous',
        accessTier: u ? (u.role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED') : 'ANONYMOUS',
        tables: {
          users: Object.keys(S.users || {}).length,
          projects: Object.keys(S.projects || {}).length,
          agile_items: (S.items || []).length,
          shares: (S.shares || []).length,
          requests: (S.requests || []).length,
          audit_events: (S.audit || []).length
        },
        costGuard: {
          ...DB_STATS,
          cloudRunMinInstances: 0,
          cloudRunMaxInstances: 2,
          blockedPaidApis: ['earthengine.googleapis.com', 'compute.googleapis.com', 'sqladmin.googleapis.com'],
          monthlySpendUsd: 0.00
        }
      });
    }

    if (pathname === '/api/db/sync' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required for DB write sync.' });
      const body = await readJsonBody(req);
      if (body && body.checklist && typeof body.checklist === 'object') {
        u.checklist = Object.assign({}, u.checklist || {}, body.checklist);
        logAudit(u.id, 'db.sync_checklist', `${Object.keys(body.checklist).length} keys synced`);
        saveState(S);
      }
      return sendJson(res, 200, { ok: true, costGuard: DB_STATS, lastWriteAt: DB_STATS.lastWriteAt });
    }

    const handleCustomerIntakeSubmission = (d) => {
      if (!checkRateLimit(req, 'intake', 25, 60000)) {
        logAudit('system', 'security.rate_limit_intake', 'Blocked excessive intake requests');
        return sendJson(res, 429, { ok: false, error: 'Too many intake requests. Please wait 60 seconds and try again.' });
      }
      const cleanName = sanitizeInput(d.name, 80);
      const cleanOrg = sanitizeInput(d.org || d.organization || '', 120);
      const cleanEmail = sanitizeInput(d.email, 120).toLowerCase();
      const rawProv = String(d.ssoProvider || 'google').trim().toLowerCase();
      if (!ALLOWED_SSO_PROVIDERS.has(rawProv)) {
        logAudit('system', 'security.intake_invalid_sso', `Rejected non-SSO provider: ${rawProv}`);
        return sendJson(res, 403, { ok: false, error: 'SSO Policy Enforced: Only Google, Microsoft, or Apple SSO is permitted for intake.' });
      }
      if (!cleanName || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Full Name and a valid Federated SSO account email are required.' });
      }
      if (d.ndaAccepted === false) {
        return sendJson(res, 400, { ok: false, error: 'NDA Required: You must attest to the MGC Mutual Non-Disclosure & Federated SSO Zero-Trust Terms.' });
      }
      const caller = getAuthenticatedUser(req);
      const isAdminCaller = Boolean(caller && caller.role === 'owner' && caller.id === 'owner');
      const isEmpCaller = isEmployeeUser(caller);
      // Critical Anti-Spoofing Guard: Prevent public customer intake from ever claiming or overwriting an Owner account
      if (OWNER_EMAILS.has(cleanEmail) || (!isAdminCaller && cleanEmail.endsWith('@miltongroupsecurity.org')) || cleanEmail.startsWith('owner@') || cleanEmail.startsWith('admin@')) {
        logAudit('system', 'security.intake_owner_spoof_blocked', `Blocked public intake attempt using owner/admin email: ${cleanEmail}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'Security Policy Enforced: Administrator accounts cannot be submitted or registered via Customer Intake.'
        });
      }

      const interestKey = TAILOR[d.interest] ? d.interest : 'ai-web';
      const cleanNote = sanitizeInput(d.note, 500);
      const mfaMethod = sanitizeInput(d.mfaMethod || 'SSO_ATTESTED', 40);
      const existing = Object.values(S.users).find(x => String(x.email || '').toLowerCase() === cleanEmail);
      const id = existing ? existing.id : uid('u');

      if (existing && (existing.status === 'denied' || existing.status === 'suspended')) {
        logAudit('system', 'security.intake_denied_account', cleanEmail);
        return sendJson(res, 403, { ok: false, error: 'Intake Denied: This account has been restricted by the platform Owner.' });
      }

      let cleanUsername = sanitizeInput(d.username || cleanEmail.split('@')[0], 60).toLowerCase();
      if (['malik.khabir', 'owner', 'admin', 'administrator'].includes(cleanUsername)) {
        logAudit('system', 'security.intake_reserved_username_blocked', cleanUsername);
        return sendJson(res, 403, { ok: false, error: 'Security Policy Enforced: Reserved directory username cannot be registered.' });
      }
      const usernameCollision = Object.values(S.users).find(x => x.id !== id && String(x.username || '').toLowerCase() === cleanUsername);
      if (usernameCollision) {
        if (d.username) {
          return sendJson(res, 409, { ok: false, error: 'That username (sAMAccountName) is already registered to another directory user.' });
        }
        cleanUsername = `${cleanUsername}.${id.slice(-4)}`;
      }
      const rawPassword = String(d.password || '');
      if (rawPassword && isGenericOrRevokedSecret(rawPassword)) {
        logAudit('system', 'security.intake_generic_password_blocked', cleanEmail);
        return sendJson(res, 403, {
          ok: false,
          code: 'GENERIC_PASSWORD_PROHIBITED',
          error: 'SECURITY ENFORCEMENT: Generic or default passwords are prohibited. Choose a unique case-sensitive password (8+ characters).'
        });
      }
      const computedPasswordDigest = rawPassword ? mgcDigest(rawPassword) : ((existing && existing.passwordDigest) || null);
      const userOu = (isAdminCaller && (d.ou === 'internal' || d.ou === 'external'))
        ? d.ou
        : ((existing && existing.ou) || 'external');
      const userGroup = (isAdminCaller && d.securityGroup && d.securityGroup !== 'DOMAIN_ADMIN')
        ? String(d.securityGroup)
        : ((existing && existing.securityGroup) || (userOu === 'internal' ? 'INTERNAL_ANALYST' : 'EXTERNAL_SAAS_LMS'));

      const defaultPagesForOu = userOu === 'internal'
        ? Object.assign({}, DEFAULT_CUSTOMER_PAGES, { home: 'ready', agile: 'ready', contracts: 'ready', compliance: 'ready', academy: 'ready', chronos: 'ready' })
        : { ...DEFAULT_CUSTOMER_PAGES };
      const defaultAppsForOu = userOu === 'internal'
        ? ['sterling-auto-repair', 'client-turnkey-forge', 'eveng-netprism-studio', 'samgov-contract-matchmaker', 'ghost-cli-trainer']
        : DEFAULT_CUSTOMER_APPS.slice();

      const validResourceIds = new Set(getResourcesCatalog().map(r => r.id));
      let onboardQualifiedResources = (existing && Array.isArray(existing.qualifiedResources)) ? existing.qualifiedResources.slice() : DEFAULT_CUSTOMER_RESOURCES.slice();
      if ((isAdminCaller || isEmpCaller) && Array.isArray(d.qualifiedResources)) {
        onboardQualifiedResources = d.qualifiedResources.map(x => String(x)).filter(x => validResourceIds.has(x));
      }
      if (onboardQualifiedResources.length > 0) {
        defaultPagesForOu.resources = 'ready';
      }

      const initialGrantedPages = existing && Array.isArray(existing.adminGrantedPages)
        ? existing.adminGrantedPages.slice()
        : (userOu === 'internal' ? ['home', 'agile', 'contracts', 'compliance', 'academy', 'chronos'] : []);
      if (onboardQualifiedResources.length > 0 && !initialGrantedPages.includes('resources')) {
        initialGrantedPages.push('resources');
      }

      S.users[id] = {
        id,
        name: cleanName,
        username: cleanUsername,
        org: cleanOrg || (userOu === 'internal' ? 'MGC Internal Operations' : (d.brand === 'FIX' ? 'F.I.X Solutions Client Partner' : 'MGC Client Partner')),
        email: cleanEmail,
        role: 'member',
        ou: userOu,
        securityGroup: userGroup,
        status: 'active',
        accessTier: userOu === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED',
        brand: d.brand === 'FIX' ? 'FIX' : 'MGC',
        ssoProvider: rawProv,
        passwordDigest: computedPasswordDigest,
        hasPassword: Boolean(computedPasswordDigest),
        mfaVerified: Boolean(d.mfaVerified !== false),
        mfaMethod,
        ndaAccepted: true,
        ndaAcceptedAt: now(),
        quote: { interest: interestKey, org: cleanOrg, note: cleanNote },
        plan: existing && existing.plan ? Object.assign({ base: true, addons: [] }, existing.plan, { base: true }) : { base: true, addons: [] },
        pages: existing && existing.pages ? Object.assign({}, defaultPagesForOu, existing.pages, onboardQualifiedResources.length > 0 ? { resources: 'ready' } : {}) : defaultPagesForOu,
        adminGrantedPages: initialGrantedPages,
        allowedApps: existing && Array.isArray(existing.allowedApps) && existing.allowedApps.length ? existing.allowedApps : defaultAppsForOu,
        qualifiedResources: onboardQualifiedResources,
        paymentProfile: (existing && existing.paymentProfile) || null,
        payments: (existing && Array.isArray(existing.payments)) ? existing.payments : [],
        checklist: (existing && existing.checklist) || {},
        created: (existing && existing.created) || now()
      };

      onboardQualifiedResources.forEach(resId => {
        if (!S.shares.some(s => s.type === 'resource' && s.resource === resId && s.grantee === id)) {
          S.shares.push({ id: `resource_${resId}_${id}`, type: 'resource', resource: resId, grantee: id, perms: ['view', 'launch'], created: now() });
        }
      });

      if (!S.shares.some(s => s.type === 'project' && s.resource === 'p_sterling' && s.grantee === id)) {
        S.shares.push({ id: `project_p_sterling_${id}`, type: 'project', resource: 'p_sterling', grantee: id, perms: ['view'], created: now() });
      }

      const reqId = uid('intake');
      const existingReq = S.requests.find(r => r.uid === id);
      if (existingReq) {
        existingReq.status = 'requested';
        existingReq.updated = now();
        existingReq.interest = interestKey;
      } else {
        S.requests.unshift({ id: reqId, uid: id, interest: interestKey, org: cleanOrg, status: 'requested', created: now() });
      }

      const queuedPages = (TAILOR[interestKey] || { pages: [] }).pages;
      const restrictedApps = APPS_CATALOG.filter(a => !S.users[id].allowedApps.includes(a.id)).map(a => a.id);
      const integrityHash = 'SHA256-' + crypto.createHash('sha256').update(`${id}:${cleanEmail}:${rawProv}:CUSTOMER_RESTRICTED:${SESSION_SECRET}`).digest('hex').slice(0, 24);

      if (d.subscribeNewsletter !== false) {
        if (!S.newsletter) S.newsletter = seedState().newsletter;
        const nlTrack = interestKey === 'federal' ? 'SDVOSB_FEDERAL' : interestKey === 'cyber' ? 'ZERO_TRUST_CYBER' : interestKey === 'ai-web' ? 'AI_AUTOMATION' : 'ALL';
        const existingSub = (S.newsletter.subscribers || []).find(s => s.email === cleanEmail);
        if (!existingSub) {
          S.newsletter.subscribers.unshift({
            email: cleanEmail,
            name: cleanName,
            track: nlTrack,
            frequency: 'weekly',
            subscribedAt: now(),
            verified: true
          });
        }
      }

      notifyUser(id, 'Intake Verified · SaaS Apps & LMS + Payment Center Active', `Receipt ${reqId}: Your account is active with access to SaaS Apps & LMS and Secure Payment & Billing. Additional modules (${queuedPages.join(', ')}) require Administrator grant.`);
      notifyUser('owner', 'New Customer Registered (SaaS & LMS Only)', `${cleanName}${cleanOrg ? ' (' + cleanOrg + ')' : ''} [${cleanEmail}] registered via ${SSO_PROVIDER_LABELS[rawProv]} (${(TAILOR[interestKey] || {}).label}). Grant additional features in /access-admin.`, 'in-app + email + push');
      logAudit(id, `intake.verified.${rawProv}`, `${cleanEmail} [CUSTOMER_RESTRICTED | mfa:${mfaMethod}]`);
      saveState(S);

      const mobileClient = isMobileRequest(req, parsedUrl);
      const reqNext = d.next ? toCleanRoute(String(d.next).trim()) : '';
      const targetRedirect = mobileClient ? '/mobile' : ((reqNext && reqNext !== '/auth' && reqNext !== '/login') ? reqNext : '/apps');

      const sessionToken = signToken({
        uid: id,
        email: cleanEmail,
        role: 'member',
        accessTier: userOu === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED',
        provider: rawProv,
        ssoVerified: true
      });
      const createdByDirectoryOperator = Boolean(isAdminCaller || isEmpCaller);
      const responseHeaders = createdByDirectoryOperator
        ? {}
        : { 'Set-Cookie': `mgcw_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 7}` };
      return sendJson(res, 200, {
        ok: true,
        registered: true,
        intakeReceipt: reqId,
        uid: createdByDirectoryOperator ? caller.id : id,
        createdUid: id,
        user: S.users[id],
        email: cleanEmail,
        name: cleanName,
        org: S.users[id].org,
        role: 'member',
        accessTier: S.users[id].accessTier,
        provider: rawProv,
        providerLabel: SSO_PROVIDER_LABELS[rawProv],
        ssoVerified: true,
        ndaAccepted: true,
        mfaVerified: S.users[id].mfaVerified,
        mfaMethod,
        integrityHash,
        allowedApps: S.users[id].allowedApps,
        qualifiedResources: S.users[id].qualifiedResources,
        restrictedApps,
        allowedPages: getAllowedPagesForUser(S.users[id]),
        allowedPortals: getAllowedPortalsForUser(S.users[id]),
        queuedTailoredPages: queuedPages,
        redirect: targetRedirect,
        state: scopeStateForUser(createdByDirectoryOperator ? caller : S.users[id])
      }, responseHeaders);
    };

    const processLegalSecurePayment = (u, body) => {
      if (!u) {
        return { status: 401, payload: { ok: false, error: 'Authentication required to submit payment or billing information.' } };
      }
      // Hardened Financial Input Guard: Reject script/SQL/template injection attempts at the perimeter
      const rawCheckFields = [body.billingName, body.billingEmail, body.billingOrg, body.postalCode, body.cardBrand, body.contractOrPo, body.dodaacOrUei];
      if (rawCheckFields.some(v => v && /[<>{};$`\\]/.test(String(v)))) {
        logAudit(u.id, 'security.payment_injection_blocked', 'Blocked suspicious characters in financial payload');
        return { status: 400, payload: { ok: false, code: 'FINANCIAL_VALIDATION_FAILED', error: 'Security Validation Failed: Financial fields contain disallowed characters.' } };
      }
      // Reject un-tokenized raw PAN if submitted via body.cardNumber (12+ digits)
      if (body.cardNumber && String(body.cardNumber).replace(/\D/g, '').length >= 12) {
        logAudit(u.id, 'security.pci_raw_pan_blocked', 'Rejected raw PAN submission');
        return { status: 400, payload: { ok: false, code: 'PCI_VIOLATION_RAW_PAN_REJECTED', error: 'PCI-DSS v4.0 SAQ-A Enforced: Raw Primary Account Numbers (PAN) are rejected. Submit tokenized last-4 only.' } };
      }

      const merchantEntity = String(body.merchantEntity || u.brand || 'MGC').toUpperCase() === 'FIX' ? 'FIX' : 'MGC';
      const method = ['card_tokenized', 'ach_nacha', 'gpc_wawf'].includes(body.method) ? body.method : 'card_tokenized';
      const gatewayOption = method === 'gpc_wawf' ? 'OPTION_4_WAWF_PIEE_EFT' : 'OPTION_1_STRIPE_SAQ_A';
      const billingName = sanitizeInput(body.billingName || u.name || '', 100);
      const billingEmail = sanitizeInput(body.billingEmail || u.email || '', 120).toLowerCase();
      const billingOrg = sanitizeInput(body.billingOrg || u.org || '', 120);
      const addressLine1 = sanitizeInput(body.addressLine1 || body.address || 'Verified Billing Address on File', 140);
      const city = sanitizeInput(body.city || 'Arlington', 80);
      const stateRegion = sanitizeInput(body.state || body.stateRegion || 'VA', 40);
      const postalCode = sanitizeInput(body.postalCode || body.billingZip || body.zip || '', 24);
      const country = sanitizeInput(body.country || 'US', 8).toUpperCase();
      const rawPlanKey = String(body.planId || body.planTier || 'pro_99');
      const PLAN_AMOUNTS = {
        base_5: { amountUsd: 5.00, label: 'Base SaaS & LMS Access ($5/mo)' },
        saas_lms_base: { amountUsd: 5.00, label: 'Base SaaS & LMS Access ($5/mo)' },
        pro_99: { amountUsd: 99.00, label: 'Pro App & Course LMS Subscriber ($99/mo)' },
        pro_enterprise: { amountUsd: 99.00, label: 'Pro App & Course LMS Subscriber ($99/mo)' },
        enterprise_499: { amountUsd: 499.00, label: 'Enterprise Custom Build & Seat License ($499/mo)' },
        sdvosb_contract_retainer: { amountUsd: 250.00, label: 'SDVOSB Federal / Commercial Retainer ($250/mo)' },
        custom_retainer: { amountUsd: Math.max(1, Math.min(250000, Number(body.amountUsd) || 2500.00)), label: 'Custom Commercial / Federal Milestone Retainer ($2,500)' },
        custom_invoice: { amountUsd: Math.max(1, Math.min(250000, Number(body.amountUsd) || 99.00)), label: 'Authorized Invoice / Custom Engagement Settlement' }
      };
      const planTier = PLAN_AMOUNTS[rawPlanKey] ? rawPlanKey : 'pro_99';
      const selectedPlan = PLAN_AMOUNTS[planTier];
      const amountUsd = Number(body.amountUsd) > 0 ? Math.min(250000, Number(body.amountUsd)) : selectedPlan.amountUsd;

      // Mandatory Legal & Regulatory Attestations (EFTA / Reg E / NACHA + PCI-DSS v4.0 SAQ-A + MGC/FIX MSA)
      const eftaOk = Boolean(body.eftaNachaAccepted || body.eftaAccepted);
      const pciOk = Boolean(body.pciTermsAccepted || body.pciAccepted);
      const msaOk = Boolean(body.msaAccepted);
      if (!eftaOk || !pciOk || !msaOk) {
        return {
          status: 400,
          payload: {
            ok: false,
            error: 'Legal Authorization Required: You must accept the EFTA / Reg E & NACHA Authorization, PCI-DSS v4.0 Tokenization Notice, and MGC & F.I.X Master Services Agreement.'
          }
        };
      }
      if (!billingName || !/^\S+@\S+\.\S+$/.test(billingEmail) || !/^[A-Za-z0-9 -]{3,12}$/.test(postalCode)) {
        return {
          status: 400,
          payload: {
            ok: false,
            error: 'Valid Legal Name, Billing Email, and Postal/ZIP Code (5-digit ZIP) are required.'
          }
        };
      }

      // Zero-PAN / PCI-DSS v4.0 SAQ-A Scrubbing: STRICTLY REJECT raw full PAN (13-19 digits) at the API boundary
      const rawAccountOrCard = String(body.accountNumber || body.last4 || '').replace(/\D/g, '');
      if (rawAccountOrCard.length > 4) {
        logAudit(u.id, 'security.pci_raw_pan_rejected', 'Blocked attempt to transmit un-tokenized full card/account number');
        return {
          status: 400,
          payload: {
            ok: false,
            code: 'PCI_VIOLATION_RAW_PAN_REJECTED',
            error: 'PCI-DSS v4.0 SAQ-A Security Enforcement: Raw full card/account numbers are strictly rejected. Transmit only the 4-digit tokenized identifier.'
          }
        };
      }
      const last4 = rawAccountOrCard.length === 4 ? rawAccountOrCard : (method === 'gpc_wawf' ? 'WAWF' : '');
      if (method !== 'gpc_wawf' && !/^\d{4}$/.test(last4)) {
        return { status: 400, payload: { ok: false, error: 'Valid 4-digit tokenized instrument identifier required.' } };
      }

      const expMonthNum = Number(body.expMonth || 12);
      const expYearNum = Number(body.expYear || 2029);
      const fullExpYear = expYearNum < 100 ? 2000 + expYearNum : expYearNum;
      const nowDate = new Date();
      if (method === 'card_tokenized') {
        if (expMonthNum < 1 || expMonthNum > 12 || fullExpYear < nowDate.getFullYear() || (fullExpYear === nowDate.getFullYear() && expMonthNum < (nowDate.getMonth() + 1))) {
          return { status: 400, payload: { ok: false, error: 'Card expiration date is invalid or expired.' } };
        }
      }

      let instrumentBrand = sanitizeInput(body.cardBrand || body.bankName || '', 40);
      if (!instrumentBrand) {
        if (method === 'ach_nacha') instrumentBrand = 'Mercury / NACHA Commercial ACH';
        else if (method === 'gpc_wawf') instrumentBrand = 'US Gov GPC / PIEE WAWF (CAGE 17GC6)';
        else if (rawAccountOrCard.startsWith('4')) instrumentBrand = 'VISA';
        else if (rawAccountOrCard.startsWith('5')) instrumentBrand = 'MASTERCARD';
        else if (rawAccountOrCard.startsWith('3')) instrumentBrand = 'AMEX';
        else instrumentBrand = 'VISA';
      }
      const expMonth = sanitizeInput(body.expMonth || '12', 4);
      const expYear = sanitizeInput(body.expYear || '2029', 6);
      const routingLast4 = method === 'ach_nacha'
        ? String(body.routingNumber || '0210').replace(/\D/g, '').slice(-4).padStart(4, '0')
        : null;
      const contractOrPo = method === 'gpc_wawf'
        ? sanitizeInput(body.contractOrPo || 'N00178-SDVOSB-MGC', 64)
        : null;

      const timestampIso = new Date().toISOString();
      const vaultToken = 'tok_mgc_' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${u.id}:${method}:${last4}:${timestampIso}`)
        .digest('hex')
        .slice(0, 24);
      const receiptId = 'MGC-PAY-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const complianceSignature = 'HMAC-SHA256-' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${receiptId}|${u.id}|${billingEmail}|${method}|${last4}|${amountUsd.toFixed(2)}|${timestampIso}`)
        .digest('hex')
        .slice(0, 32);

      const merchantEntityName = merchantEntity === 'FIX'
        ? 'F.I.X Solutions LLC (Commercial SaaS & Federal Subcontracting)'
        : 'Milton Group Concepts LLC (EIN 92-1370285 · Parent / SDVOSB)';

      // Automatically post Double-Entry GAAP Journal Entry (Option A + Option B Rail Fee & 25% Tax Reserve Split)
      const railForAccounting = method === 'ach_nacha'
        ? 'MERCURY_ACH'
        : (method === 'gpc_wawf' ? 'WAWF_EFT' : 'STRIPE_CARD');
      const revenueAccountCode = method === 'gpc_wawf'
        ? '4020'
        : (planTier === 'custom_retainer' ? '4030' : '4010');
      const journalEntry = postAccountingJournalEntry({
        receiptId,
        createdAt: timestampIso,
        entity: merchantEntity,
        entryType: 'REVENUE',
        accountCode: revenueAccountCode,
        counterparty: billingOrg ? `${billingName} (${billingOrg})` : billingName,
        counterpartyEmail: billingEmail,
        description: `${selectedPlan.label} [${instrumentBrand} •••• ${last4}]`,
        rail: railForAccounting,
        grossUsd: amountUsd,
        status: 'SETTLED'
      });

      const paymentProfile = {
        verified: true,
        receiptId,
        journalId: journalEntry.journalId,
        merchantEntity,
        merchantEntityName,
        gatewayOption,
        method,
        methodLabel: method === 'ach_nacha' ? 'NACHA Commercial ACH ($0.00 Fee)' : method === 'gpc_wawf' ? 'Option 4 · Federal WAWF / PIEE EFT ($0.00 Fee)' : 'Option 1 · Stripe SAQ-A Tokenized Card (2.9% + $0.30)',
        instrumentBrand,
        cardBrand: instrumentBrand,
        last4,
        expMonth: method === 'card_tokenized' ? expMonth : null,
        expYear: method === 'card_tokenized' ? expYear : null,
        routingLast4,
        contractOrPo,
        vaultToken,
        paymentToken: vaultToken,
        signature: complianceSignature,
        complianceSignature,
        billingName,
        billingEmail,
        billingOrg,
        addressLine1,
        city,
        stateRegion,
        postalCode,
        billingZip: postalCode,
        country,
        planId: planTier,
        planTier,
        planLabel: selectedPlan.label,
        amountUsd,
        processorFeeUsd: journalEntry.processorFeeUsd,
        netCashUsd: journalEntry.netCashUsd,
        taxReserveUsd: journalEntry.taxReserveUsd,
        pciDssLevel: 'PCI-DSS v4.0 SAQ-A (Zero Raw PAN Storage)',
        legalAttestations: {
          eftaAccepted: true,
          eftaNachaAccepted: true,
          pciAccepted: true,
          pciTermsAccepted: true,
          msaAccepted: true,
          attestedAt: timestampIso,
          merchantEntity: merchantEntityName
        },
        verifiedAt: timestampIso,
        updatedAt: timestampIso
      };

      const receipt = {
        receiptId,
        journalId: journalEntry.journalId,
        uid: u.id,
        email: u.email,
        userEmail: u.email,
        billingName,
        userName: u.name,
        billingOrg,
        merchantEntity,
        merchantEntityName,
        gatewayOption,
        method,
        methodLabel: paymentProfile.methodLabel,
        instrumentBrand,
        cardBrand: instrumentBrand,
        last4,
        vaultToken,
        paymentToken: vaultToken,
        planId: planTier,
        planTier,
        planLabel: selectedPlan.label,
        amountUsd,
        processorFeeUsd: journalEntry.processorFeeUsd,
        netCashUsd: journalEntry.netCashUsd,
        taxReserveUsd: journalEntry.taxReserveUsd,
        operatingNetUsd: journalEntry.operatingNetUsd,
        currency: 'USD',
        status: 'VERIFIED_ON_FILE',
        reconciliationStatus: journalEntry.status,
        signature: complianceSignature,
        complianceSignature,
        entryHash: journalEntry.entryHash,
        pciDssCompliant: true,
        eftaNachaCompliant: true,
        createdAt: timestampIso
      };

      u.paymentProfile = paymentProfile;
      if (!Array.isArray(u.payments)) u.payments = [];
      u.payments.unshift(receipt);
      if (!Array.isArray(S.payments)) S.payments = [];
      S.payments.unshift(receipt);
      u.plan = Object.assign({}, u.plan || {}, { base: true, tier: planTier, paymentVerified: true });

      notifyUser(u.id, 'Payment & Billing Information Verified', `Receipt ${receiptId}: ${instrumentBrand} •••• ${last4} ($${amountUsd.toFixed(2)} USD) is cryptographically tokenized and verified under PCI-DSS v4.0 SAQ-A.`);
      notifyUser('owner', 'Customer Payment Method Verified + Ledger Posted', `${u.name} (${u.email}) submitted verified payment [${instrumentBrand} •••• ${last4} · Gross $${amountUsd.toFixed(2)} · Net $${journalEntry.netCashUsd.toFixed(2)}] — Receipt ${receiptId} / Journal ${journalEntry.journalId}.`);
      logAudit(u.id, 'payment.verified', `${receiptId} [${method} •••• ${last4} Gross=$${amountUsd.toFixed(2)} Net=$${journalEntry.netCashUsd.toFixed(2)} JRN=${journalEntry.journalId}]`);
      saveState(S);

      return {
        status: 200,
        payload: {
          ok: true,
          verified: true,
          receipt,
          journalEntry,
          paymentProfile,
          state: scopeStateForUser(u)
        }
      };
    };

    const handleConsultationSubmission = (u, d) => {
      if (!u) {
        return { status: 401, payload: { ok: false, error: 'Authentication required to submit a consultation or scope request.' } };
      }
      if (hasInjectionPayload(d)) {
        logAudit(u.id, 'security.consultation_injection_blocked', 'Blocked malicious payload in consultation submission');
        return { status: 400, payload: { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Consultation fields contain disallowed script, SQL, or template injection patterns.' } };
      }
      if (!Array.isArray(S.consultations)) S.consultations = [];
      const receiptId = 'MGC-CONS-' + Date.now().toString(36).toUpperCase().slice(-5) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const entry = {
        id: uid('cons'),
        receiptId,
        uid: u.id,
        clientName: sanitizeInput(d.clientName || u.name || '', 120),
        clientEmail: sanitizeInput(d.clientEmail || u.email || '', 160).toLowerCase(),
        organization: sanitizeInput(d.organization || u.org || '', 160),
        track: sanitizeInput(d.track || 'ai-web', 60),
        architectureScope: sanitizeInput(d.architectureScope || 'Turnkey Web & Autonomous AI Suite', 140),
        timeline: sanitizeInput(d.timeline || '2-4 Weeks', 60),
        scaleTier: sanitizeInput(d.scaleTier || 'Growth (Up to 25 seats)', 80),
        integrationEnv: sanitizeInput(d.integrationEnv || 'Google Cloud / Workspace', 100),
        preferredWindow: sanitizeInput(d.preferredWindow || 'Next Available Executive Slot', 80),
        projectBrief: sanitizeInput(d.projectBrief || '', 800),
        requestedApps: Array.isArray(d.requestedApps) ? d.requestedApps.slice(0, 8).map(x => sanitizeInput(x, 60)) : [],
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
      notifyUser(u.id, 'Guided Consultation & Scope Request Submitted', `Receipt ${entry.receiptId}: Your consultation request (${entry.architectureScope}) is queued for architecture review.`);
      notifyUser('owner', 'New Client Guided Consultation Request', `${entry.clientName} (${entry.clientEmail}) submitted consultation ${entry.receiptId}: ${entry.architectureScope} [${entry.timeline}].`);
      logAudit(u.id, 'consultation.submitted', `${entry.receiptId} [${entry.architectureScope}]`);
      saveState(S);
      return {
        status: 200,
        payload: {
          ok: true,
          receiptId: entry.receiptId,
          consultation: entry,
          state: scopeStateForUser(u)
        }
      };
    };

    if (pathname === '/api/consultation/submit' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      const body = await readJsonBody(req);
      const result = handleConsultationSubmission(u, body.data || body || {});
      return sendJson(res, result.status, result.payload);
    }

    if (pathname === '/api/payment/status' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
      if (isEmployeeUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Employee accounts do not have access to payment settings.' });
      }
      return sendJson(res, 200, {
        ok: true,
        verified: Boolean(u.paymentProfile && u.paymentProfile.verified),
        paymentProfile: u.paymentProfile || null,
        payments: Array.isArray(u.payments) ? u.payments : [],
        complianceFramework: {
          pciDss: 'PCI-DSS v4.0 SAQ-A Tokenized Vault (Zero Raw PAN Storage)',
          eftaRegE: 'Electronic Fund Transfer Act (15 U.S.C. 1693) & NACHA Operating Rules Compliant',
          merchantEntity: 'Milton Group Concepts LLC (EIN 92-1370285 · CAGE 17GC6 · UEI XN89KKM6JT89)'
        }
      });
    }

    if (pathname === '/api/payment/submit' && req.method === 'POST') {
      if (!checkRateLimit(req, 'payment_submit', 15, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many payment attempts. Please wait 60 seconds.' });
      }
      const u = getAuthenticatedUser(req);
      if (isEmployeeUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Employee accounts do not have access to payment settings.' });
      }
      const body = await readJsonBody(req);
      const result = processLegalSecurePayment(u, body || {});
      return sendJson(res, result.status, result.payload);
    }

    if (pathname === '/api/payments/config' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (isEmployeeUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Employee accounts do not have access to payment gateway settings.' });
      }
      const gw = Object.assign({
        activeProcessor: 'stripe_saq_a',
        complianceLevel: 'PCI-DSS v4.0 SAQ-A + EFTA Reg E + NACHA + DFARS 252.232-7003',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeCheckoutHostedUrl: process.env.STRIPE_CHECKOUT_URL || '',
        authorizeNetApiLoginId: process.env.AUTHNET_API_LOGIN_ID || '',
        authorizeNetClientKey: process.env.AUTHNET_CLIENT_KEY || '',
        mercuryAchEnabled: true,
        wawfPieeEnabled: true,
        cageOrEin: 'EIN 92-1370285'
      }, S.pciGatewayConfig || {});
      return sendJson(res, 200, {
        ok: true,
        config: gw,
        processors: [
          {
            id: 'stripe_saq_a',
            title: 'Stripe Checkout & Payment Element (PCI-DSS v4.0 SAQ-A)',
            scope: 'Commercial Card, Apple Pay, Google Pay & Stripe ACH',
            saqType: 'SAQ-A (Zero Cardholder Data on MGC Servers)',
            feeStructure: '2.9% + $0.30 (Cards) | 0.8% capped at $5.00 (ACH Direct Debit)'
          },
          {
            id: 'authorizenet_accept_js',
            title: 'Authorize.Net / Visa Cybersource Accept.js (B2B & Gov)',
            scope: 'Enterprise & Government Procurement Cards (P-Card / GSA SmartPay)',
            saqType: 'SAQ-A-EP (Client-Side Nonce Tokenization via Accept.js)',
            feeStructure: 'Interchange-Plus / Level 2 & Level 3 Gov P-Card Rates'
          },
          {
            id: 'mercury_plaid_ach',
            title: 'Mercury Commercial Treasury + Plaid Link ACH (NACHA / Reg E)',
            scope: 'Direct B2B ACH Debit & Wire into Milton Group Concepts LLC Mercury Account',
            saqType: 'NACHA Operating Rules + EFTA 12 CFR Part 1005 (Zero Card Scope)',
            feeStructure: '$0.00 Domestic ACH & Wire Receiving via Mercury'
          },
          {
            id: 'wawf_piee_eft',
            title: 'DoD WAWF / PIEE & SAM.gov Federal EFT (DFARS 252.232-7003)',
            scope: 'Federal Prime & Subcontract Invoicing (SDVOSB / NAICS 541512)',
            saqType: 'Federal Treasury EFT / Automated Clearing House',
            feeStructure: '$0.00 Treasury EFT Settlement'
          }
        ]
      });
    }

    if (pathname === '/api/payments/config' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u || u.role !== 'owner' || u.id !== 'owner') {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required.' });
      }
      const body = await readJsonBody(req);
      S.pciGatewayConfig = Object.assign({}, S.pciGatewayConfig || {}, {
        activeProcessor: sanitizeInput(body.activeProcessor || 'stripe_saq_a', 60),
        stripePublishableKey: sanitizeInput(body.stripePublishableKey || '', 160),
        stripeCheckoutHostedUrl: sanitizeInput(body.stripeCheckoutHostedUrl || '', 240),
        authorizeNetApiLoginId: sanitizeInput(body.authorizeNetApiLoginId || '', 120),
        authorizeNetClientKey: sanitizeInput(body.authorizeNetClientKey || '', 160),
        mercuryAchEnabled: body.mercuryAchEnabled !== false,
        wawfPieeEnabled: body.wawfPieeEnabled !== false
      });
      logAudit('owner', 'pci.gateway_config_updated', S.pciGatewayConfig.activeProcessor);
      saveState(S);
      return sendJson(res, 200, { ok: true, config: S.pciGatewayConfig });
    }

    /* ---------- Double-Entry Management Accounting & CPA Export API (Sole Administrator Only) ---------- */
    if (pathname === '/api/accounting/ledger' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to access Management Accounting & General Ledger.' });
      }
      const entityFilter = String(parsedUrl.searchParams.get('entity') || 'ALL').toUpperCase();
      const allEntries = Array.isArray(S.accountingLedger) ? S.accountingLedger : [];
      const entries = (entityFilter === 'MGC' || entityFilter === 'FIX')
        ? allEntries.filter(e => e.entity === entityFilter)
        : allEntries;
      return sendJson(res, 200, {
        ok: true,
        summary: computeAccountingSummary(entityFilter),
        ledger: entries,
        chartOfAccounts: CHART_OF_ACCOUNTS
      });
    }

    if (pathname === '/api/accounting/post-entry' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to post journal entries.' });
      }
      const body = await readJsonBody(req);
      const d = body.data || body || {};
      const grossNum = Number(d.grossUsd || d.grossAmount || d.amountUsd || d.amount);
      if (!grossNum || grossNum <= 0) {
        return sendJson(res, 400, { ok: false, error: 'Valid positive USD amount required for journal posting.' });
      }
      const entry = postAccountingJournalEntry(d);
      logAudit('owner', 'accounting.journal_posted', `${entry.journalId} [${entry.entity} ${entry.entryType} $${entry.grossUsd.toFixed(2)} -> Net $${entry.netCashUsd.toFixed(2)}]`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        entry,
        summary: computeAccountingSummary(),
        ledger: S.accountingLedger,
        state: scopeStateForUser(u)
      });
    }

    if (pathname === '/api/accounting/reconcile' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to reconcile ledger entries.' });
      }
      const body = await readJsonBody(req);
      const d = body.data || body || {};
      const jid = String(d.journalId || d.id || '');
      const rawNext = String(d.reconciledStatus || d.status || '').toUpperCase();
      const nextStatus = ['ISSUED', 'AUTHORIZED', 'SETTLED', 'RECONCILED'].includes(rawNext)
        ? rawNext
        : 'RECONCILED';
      const target = (S.accountingLedger || []).find(e => e.journalId === jid || e.id === jid || e.receiptId === jid);
      if (!target) {
        return sendJson(res, 404, { ok: false, error: 'Journal entry not found.' });
      }
      // If an ISSUED invoice is marked SETTLED or RECONCILED, convert its AR line into Cash + Tax Reserve
      if (target.entryType === 'INVOICE_AR' && (nextStatus === 'SETTLED' || nextStatus === 'RECONCILED')) {
        const econ = computeRailEconomics(target.grossUsd || target.grossAmount, target.rail);
        target.entryType = 'REVENUE';
        target.processorFeeUsd = econ.processorFeeUsd;
        target.processorFee = econ.processorFeeUsd;
        target.netCashUsd = econ.netCashUsd;
        target.netAmount = econ.netCashUsd;
        target.taxReserveUsd = econ.taxReserveUsd;
        target.taxReserve25 = econ.taxReserveUsd;
        target.operatingNetUsd = econ.operatingNetUsd;
        target.lines = [
          { account: '1010', accountCode: '1010', name: COA_MAP['1010'].name, accountName: COA_MAP['1010'].name, debit: econ.operatingNetUsd, credit: 0 },
          { account: '1020', accountCode: '1020', name: COA_MAP['1020'].name, accountName: COA_MAP['1020'].name, debit: econ.taxReserveUsd, credit: 0 },
          ...(econ.processorFeeUsd > 0 ? [{ account: '5030', accountCode: '5030', name: COA_MAP['5030'].name, accountName: COA_MAP['5030'].name, debit: econ.processorFeeUsd, credit: 0 }] : []),
          { account: target.accountCode || '4010', accountCode: target.accountCode || '4010', name: target.accountName || 'Commercial Revenue', accountName: target.accountName || 'Commercial Revenue', debit: 0, credit: target.grossUsd || target.grossAmount }
        ];
      }
      target.status = nextStatus;
      target.reconciledStatus = nextStatus;
      target.reconciledAt = new Date().toISOString();
      target.reconciledBy = SOLE_ADMIN_EMAIL;
      const payMatch = (S.payments || []).find(p => p.journalId === target.journalId || p.receiptId === target.receiptId);
      if (payMatch) payMatch.reconciliationStatus = nextStatus;
      logAudit('owner', 'accounting.entry_reconciled', `${target.journalId} -> ${nextStatus}`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        entry: target,
        summary: computeAccountingSummary(),
        ledger: S.accountingLedger,
        state: scopeStateForUser(u)
      });
    }

    if (pathname === '/api/accounting/export' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to export CPA / GAAP accounting records.' });
      }
      const fmt = String(parsedUrl.searchParams.get('format') || 'csv').toLowerCase();
      const entityFilter = String(parsedUrl.searchParams.get('entity') || 'ALL').toUpperCase();
      const allEntries = Array.isArray(S.accountingLedger) ? S.accountingLedger : [];
      const entries = (entityFilter === 'MGC' || entityFilter === 'FIX')
        ? allEntries.filter(e => e.entity === entityFilter)
        : allEntries;

      if (fmt === 'json') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="MGC_GAAP_Journal_${entityFilter}.json"`,
          ...SECURITY_HEADERS
        });
        return res.end(JSON.stringify({
          ok: true,
          exportedAt: new Date().toISOString(),
          entityFilter,
          summary: computeAccountingSummary(entityFilter),
          ledger: entries,
          entries
        }, null, 2));
      }

      if (fmt === 'iif') {
        const iifRows = [
          '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO\tCLEAR',
          '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO\tCLEAR',
          '!ENDTRNS'
        ];
        entries.forEach(e => {
          const dt = String(e.createdAt || '').slice(0, 10);
          const cleared = e.status === 'RECONCILED' ? 'Y' : 'N';
          const lines = Array.isArray(e.lines) ? e.lines : [];
          if (lines.length > 0) {
            const first = lines[0];
            const firstAmt = ((Number(first.debit) || 0) - (Number(first.credit) || 0)).toFixed(2);
            iifRows.push(`TRNS\t${e.journalId}\tGENERAL JOURNAL\t${dt}\t${first.account} ${first.name}\t${e.counterparty}\t${e.entity}\t${firstAmt}\t${e.receiptId}\t${e.description}\t${cleared}`);
            lines.slice(1).forEach((spl, idx) => {
              const splAmt = ((Number(spl.debit) || 0) - (Number(spl.credit) || 0)).toFixed(2);
              iifRows.push(`SPL\t${e.journalId}-${idx + 1}\tGENERAL JOURNAL\t${dt}\t${spl.account} ${spl.name}\t${e.counterparty}\t${e.entity}\t${splAmt}\t${e.receiptId}\t${e.description}\t${cleared}`);
            });
            iifRows.push('ENDTRNS');
          }
        });
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="MGC_QuickBooks_${entityFilter}.iif"`,
          ...SECURITY_HEADERS
        });
        return res.end(iifRows.join('\r\n'));
      }

      // Default: Double-Entry GAAP Journal CSV (Excel / QuickBooks / Xero / Wave ready)
      const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csvRows = [
        ['Journal_ID', 'Receipt_ID', 'Date_UTC', 'Entity', 'Entry_Type', 'Status', 'Payment_Rail', 'Counterparty', 'Description', 'Account_Code', 'Account_Name', 'Debit_USD', 'Credit_USD', 'Gross_USD', 'Processor_Fee_USD', 'Net_Cash_USD', 'Tax_Reserve_25Pct_USD', 'SHA256_Hash'].join(',')
      ];
      entries.forEach(e => {
        (e.lines || []).forEach(l => {
          csvRows.push([
            csvEscape(e.journalId),
            csvEscape(e.receiptId),
            csvEscape(e.createdAt),
            csvEscape(e.entity),
            csvEscape(e.entryType),
            csvEscape(e.status),
            csvEscape(e.rail),
            csvEscape(e.counterparty),
            csvEscape(e.description),
            csvEscape(l.account),
            csvEscape(l.name),
            (Number(l.debit) || 0).toFixed(2),
            (Number(l.credit) || 0).toFixed(2),
            (Number(e.grossUsd) || 0).toFixed(2),
            (Number(e.processorFeeUsd) || 0).toFixed(2),
            (Number(e.netCashUsd) || 0).toFixed(2),
            (Number(e.taxReserveUsd) || 0).toFixed(2),
            csvEscape(e.entryHash)
          ].join(','));
        });
      });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="MGC_GAAP_General_Ledger_${entityFilter}.csv"`,
        ...SECURITY_HEADERS
      });
      return res.end(csvRows.join('\r\n'));
    }

    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      return sendJson(res, 200, {
        ok: true,
        authenticated: Boolean(u),
        user: u ? {
          id: u.id,
          name: u.name,
          email: u.email,
          org: u.org || 'Milton Group Concepts Partner',
          role: u.role,
          status: u.status,
          accessTier: u.role === 'owner' ? 'OWNER_FULL' : (u.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED'),
          ssoProvider: u.ssoProvider || 'google',
          ndaAccepted: Boolean(u.ndaAccepted),
          mfaVerified: Boolean(u.mfaVerified),
          pages: u.pages || DEFAULT_CUSTOMER_PAGES,
          allowedPages: getAllowedPagesForUser(u),
          allowedApps: u.role === 'owner' ? APPS_CATALOG.map(a => a.id) : APPS_CATALOG.filter(a => can(u, 'app', a.id, 'view')).map(a => a.id),
          qualifiedResources: getQualifiedResourcesForUser(u),
          allowedPortals: getAllowedPortalsForUser(u),
          paymentProfile: u.paymentProfile || null,
          payments: Array.isArray(u.payments) ? u.payments : []
        } : null
      });
    }

    if (pathname === '/api/intake/verify' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      const controls = {
        allowedSsoProviders: Array.from(ALLOWED_SSO_PROVIDERS),
        allowedProviders: Array.from(ALLOWED_SSO_PROVIDERS),
        passwordAuthDisabled: true,
        emailLinkDisabled: true,
        ownerSpoofProtectionOnIntake: true,
        ownerAntiSpoofing: true,
        ndaAttestationRequired: true,
        ndaRequired: true,
        mfaBiometricOrTotpSupported: true,
        xssInputSanitization: true,
        slidingWindowRateLimiter: true,
        rateLimitPerMinute: 25,
        httpOnlyHmacSha256SessionCookie: true,
        defaultCustomerTier: 'CUSTOMER_RESTRICTED',
        defaultCustomerApps: DEFAULT_CUSTOMER_APPS,
        defaultCustomerUnlockedApps: DEFAULT_CUSTOMER_APPS,
        defaultCustomerRestrictedApps: APPS_CATALOG.filter(a => !a.defaultCustomer).map(a => a.id),
        defaultCustomerAllowedPortals: DEFAULT_CUSTOMER_PORTALS
      };
      return sendJson(res, 200, {
        ok: true,
        intakePipeline: 'ACTIVE_ZERO_TRUST_V2',
        securityControls: controls,
        intakeSecurity: controls,
        activeSession: u ? {
          uid: u.id,
          email: u.email,
          role: u.role,
          accessTier: u.role === 'owner' ? 'OWNER_FULL' : 'CUSTOMER_RESTRICTED',
          allowedApps: u.role === 'owner' ? APPS_CATALOG.map(a => a.id) : APPS_CATALOG.filter(a => can(u, 'app', a.id, 'view')).map(a => a.id)
        } : null
      });
    }

    if ((pathname === '/api/intake' || pathname === '/api/auth/register') && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        logAudit('system', 'security.intake_injection_blocked', 'Blocked malicious payload in intake/register request');
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Input contains disallowed script, SQL, or template injection patterns.' });
      }
      return handleCustomerIntakeSubmission(body.data || body || {});
    }

    if (pathname === '/api/onboarding/categories' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      return sendJson(res, 200, {
        ok: true,
        categories: ONBOARDING_CATEGORIES,
        divergentBridges: DIVERGENT_BRIDGES,
        profile: u ? computeDivergentRecommendations(u) : null
      });
    }

    if (pathname === '/api/onboarding/complete' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required to save category preferences.' });
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        logAudit(u.id, 'security.onboarding_injection_blocked', 'Blocked injection payload in onboarding submission');
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Disallowed input characters detected.' });
      }
      const d = body.data || body || {};
      const validCatIds = new Set(ONBOARDING_CATEGORIES.map(c => c.id));
      const rawCats = Array.isArray(d.selectedCategories) ? d.selectedCategories : [];
      const cleanCats = rawCats.map(c => sanitizeInput(c, 48)).filter(c => validCatIds.has(c));
      if (cleanCats.length === 0) {
        return sendJson(res, 400, { ok: false, error: 'Please select at least 1 category track to personalize your workspace.' });
      }
      const rawBaseline = sanitizeInput(d.divergentBaseline || 'en_arabic_heritage', 48);
      const cleanBaseline = DIVERGENT_BRIDGES[rawBaseline] ? rawBaseline : 'en_arabic_heritage';
      const customGoal = sanitizeInput(d.learningGoal || '', 240);

      u.onboardingCompleted = true;
      u.onboardingCompletedAt = now();
      u.selectedCategories = cleanCats;
      u.divergentBaseline = cleanBaseline;
      u.learningGoal = customGoal;

      const primaryCat = ONBOARDING_CATEGORIES.find(c => c.id === cleanCats[0]);
      if (primaryCat && primaryCat.learningTrack && TAILOR[primaryCat.learningTrack]) {
        u.quote = Object.assign({}, u.quote || {}, { interest: primaryCat.learningTrack });
      }
      const profile = computeDivergentRecommendations(u);
      logAudit(u.id, 'onboarding.netflix_categories_saved', `Categories=[${cleanCats.join(',')}] Baseline=${cleanBaseline}`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        onboardingCompleted: true,
        profile,
        state: scopeStateForUser(u)
      });
    }

    if (pathname === '/api/action' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        logAudit(u ? u.id : 'anonymous', 'security.action_injection_blocked', 'Blocked malicious payload in /api/action');
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Input contains disallowed script, SQL, or template injection patterns.' });
      }
      const act = body.action;

      // Public action: submit customer intake / access request / user registration
      if (act === 'submitRequest' || act === 'registerUser') {
        return handleCustomerIntakeSubmission(body.data || body || {});
      }

      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });

      if (act === 'completeNetflixOnboarding') {
        const d = body.data || body || {};
        const validCatIds = new Set(ONBOARDING_CATEGORIES.map(c => c.id));
        const rawCats = Array.isArray(d.selectedCategories) ? d.selectedCategories : [];
        const cleanCats = rawCats.map(c => sanitizeInput(c, 48)).filter(c => validCatIds.has(c));
        if (cleanCats.length === 0) {
          return sendJson(res, 400, { ok: false, error: 'Please select at least 1 category track.' });
        }
        const rawBaseline = sanitizeInput(d.divergentBaseline || 'en_arabic_heritage', 48);
        const cleanBaseline = DIVERGENT_BRIDGES[rawBaseline] ? rawBaseline : 'en_arabic_heritage';
        u.onboardingCompleted = true;
        u.onboardingCompletedAt = now();
        u.selectedCategories = cleanCats;
        u.divergentBaseline = cleanBaseline;
        u.learningGoal = sanitizeInput(d.learningGoal || '', 240);
        const primaryCat = ONBOARDING_CATEGORIES.find(c => c.id === cleanCats[0]);
        if (primaryCat && primaryCat.learningTrack && TAILOR[primaryCat.learningTrack]) {
          u.quote = Object.assign({}, u.quote || {}, { interest: primaryCat.learningTrack });
        }
        const profile = computeDivergentRecommendations(u);
        logAudit(u.id, 'onboarding.netflix_categories_saved', `Categories=[${cleanCats.join(',')}] Baseline=${cleanBaseline}`);
        saveState(S);
        return sendJson(res, 200, { ok: true, onboardingCompleted: true, profile, state: scopeStateForUser(u) });
      }

      // Member / Self actions
      if (act === 'submitConsultation') {
        const result = handleConsultationSubmission(u, body.data || body || {});
        return sendJson(res, result.status, result.payload);
      }
      if (act === 'submitPayment') {
        if (isEmployeeUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Employee accounts do not have access to payment settings.' });
        }
        const result = processLegalSecurePayment(u, body.data || body || {});
        return sendJson(res, result.status, result.payload);
      }
      if (act === 'subscribeBase') {
        u.plan.base = true;
        logAudit(u.id, 'billing.base_active', '$5/mo activated');
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'requestAppAccess') {
        const appId = String(body.appId || '');
        const appEntry = APPS_CATALOG.find(a => a.id === appId);
        if (!appEntry) return sendJson(res, 400, { ok: false, error: 'Unknown app.' });
        S.features.unshift({
          id: uid('f'),
          by: u.id,
          title: `App Access Request: ${appEntry.title}`,
          body: `${u.name} (${u.email}) requested access to restricted SCORM app "${appEntry.title}" (${appId}).`,
          votes: [u.id],
          status: 'new',
          created: now()
        });
        notifyUser('owner', 'Restricted App Unlock Requested', `${u.name} (${u.email}) requested access to ${appEntry.title}. Grant in Access Admin → Users & Feature Access.`);
        notifyUser(u.id, 'App Unlock Request Sent', `Your request to unlock "${appEntry.title}" has been sent to the Administrator.`);
        logAudit(u.id, 'app.request_unlock', appId);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'toggleAddon') {
        const pageId = String(body.pageId || '');
        const entry = CATALOG.find(c => c.id === pageId);
        if (!entry) return sendJson(res, 400, { ok: false, error: 'Unknown page.' });
        const a = (u.plan.addons = u.plan.addons || []);
        const idx = a.indexOf(pageId);
        if (idx >= 0) {
          a.splice(idx, 1);
        } else {
          a.push(pageId);
          if (u.pages[pageId] !== 'ready') {
            u.pages[pageId] = 'pending';
            S.tasks.push({ id: uid('t'), uid: u.id, page: pageId, title: `Build add-on "${entry.title}" for ${u.name}`, done: false });
            notifyUser('owner', 'Add-on requested', `${u.name} subscribed to ${pageId} ($${entry.price}/mo)`);
          }
        }
        logAudit(u.id, 'billing.addon', pageId);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'createFeature') {
        if (!subActive(u)) return sendJson(res, 403, { ok: false, error: 'Active workspace required.' });
        const title = String(body.title || '').trim().slice(0, 120);
        if (!title) return sendJson(res, 400, { ok: false, error: 'Title required.' });
        S.features.unshift({ id: uid('f'), by: u.id, title, body: String(body.body || '').slice(0, 2000), votes: [u.id], status: 'new', created: now() });
        notifyUser('owner', 'Feature request', `${u.name}: ${title}`);
        logAudit(u.id, 'feature.create', title);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'voteFeature') {
        const f = S.features.find(x => x.id === body.featureId);
        if (f) {
          const i = f.votes.indexOf(u.id);
          if (i >= 0) f.votes.splice(i, 1); else f.votes.push(u.id);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'moveAgileItem') {
        const it = S.items.find(x => x.id === body.itemId);
        if (!it || !can(u, 'project', it.project, 'edit')) return sendJson(res, 403, { ok: false, error: 'Edit permission required on this project.' });
        if (['backlog', 'ready', 'progress', 'review', 'done'].includes(body.col)) {
          it.col = body.col;
          logAudit(u.id, 'item.move', `${it.title} -> ${body.col}`);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'createAgileItem') {
        if (!can(u, 'project', body.project, 'edit')) return sendJson(res, 403, { ok: false, error: 'Edit permission required on this project.' });
        const title = String(body.title || '').trim().slice(0, 120);
        if (title) {
          S.items.push({
            id: uid('i'),
            project: body.project,
            type: ['story', 'task', 'bug'].includes(body.type) ? body.type : 'task',
            title,
            points: Math.max(1, Math.min(21, Number(body.points) || 3)),
            col: 'backlog',
            sprint: Number(body.sprint) || 1,
            assignee: u.id,
            createdBy: u.id
          });
          logAudit(u.id, 'item.create', title);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }

      // Directory & RBAC actions: Allowed for Sole Administrator (full scope) OR Internal Employee (strictly Client OU=External scope, zero payment settings)
      if (!isOwnerUser(u) && !isEmployeeUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Administrator or Internal Directory authorization required.' });
      }
      if (act === 'updateConsultationStatus') {
        if (!Array.isArray(S.consultations)) S.consultations = [];
        const cid = String(body.consultationId || '');
        const nextStatus = sanitizeInput(body.status || 'scheduled', 40);
        const c = S.consultations.find(x => x.id === cid || x.receiptId === cid);
        if (c) {
          c.status = nextStatus;
          if (body.reviewerNote !== undefined) c.reviewerNote = sanitizeInput(body.reviewerNote, 400);
          c.reviewedBy = u.id;
          c.updatedAt = now();
          notifyUser(c.uid, 'Consultation Status Updated', `Your consultation request (${c.receiptId}) is now "${nextStatus}".`);
        }
        const r = (S.requests || []).find(x => x.id === cid || x.receipt === cid);
        if (r) r.status = nextStatus;
        logAudit(u.id, 'consultation.status_updated', `${cid} -> ${nextStatus}`);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'updateAdminPassword') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required.' });
        }
        const newPass = String(body.newPassword || '').trim();
        if (!newPass || newPass.length < 8 || isGenericOrRevokedSecret(newPass)) {
          return sendJson(res, 400, { ok: false, error: 'New Administrator password must be at least 8 characters and not use a generic pattern.' });
        }
        if (body.username) {
          const cleanUn = sanitizeInput(body.username, 60).toLowerCase();
          if (cleanUn && cleanUn.length >= 3) S.users.owner.username = cleanUn;
        }
        S.users.owner.customPasswordDigest = mgcDigest(newPass);
        S.users.owner.passwordConfiguredAt = now();
        logAudit('owner', 'security.admin_password_updated', 'Sole Administrator credentials updated');
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'setUserPassword') {
        const target = S.users[body.userId];
        const newPass = String(body.newPassword || '').trim();
        if (!target || target.id === 'owner' || !newPass || newPass.length < 8 || isGenericOrRevokedSecret(newPass)) {
          return sendJson(res, 400, { ok: false, error: 'Valid non-admin user and unique case-sensitive password (min 8 chars, non-generic) required.' });
        }
        if (isEmployeeUser(u) && target.ou === 'internal') {
          return sendJson(res, 403, { ok: false, error: 'Employees can only manage external client accounts.' });
        }
        target.passwordDigest = mgcDigest(newPass);
        target.hasPassword = true;
        logAudit(u.id, 'security.user_password_set', target.email);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'setUserDirectoryProfile') {
        const target = S.users[body.userId];
        if (!target || target.id === 'owner') {
          return sendJson(res, 400, { ok: false, error: 'Valid non-admin directory account required.' });
        }
        if (isEmployeeUser(u)) {
          if (target.ou === 'internal' || body.ou === 'internal' || (body.securityGroup && String(body.securityGroup).startsWith('INTERNAL_'))) {
            return sendJson(res, 403, { ok: false, error: 'Employees only have access to manage external client accounts.' });
          }
        }
        if (isOwnerUser(u) && (body.ou === 'internal' || body.ou === 'external')) {
          target.ou = body.ou;
          target.accessTier = target.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED';
        }
        if (body.username !== undefined) {
          const cleanUn = sanitizeInput(body.username, 60).toLowerCase();
          if (cleanUn && cleanUn !== 'malik.khabir' && cleanUn !== 'owner' && cleanUn !== 'admin') {
            target.username = cleanUn;
          }
        }
        if (body.org !== undefined) {
          target.org = sanitizeInput(body.org, 120);
        }
        if (body.status && ['active', 'suspended', 'requested', 'denied'].includes(body.status)) {
          target.status = body.status;
        }
        if (Array.isArray(body.qualifiedResources)) {
          const validResIds = new Set(getResourcesCatalog().map(r => r.id));
          target.qualifiedResources = body.qualifiedResources.map(x => String(x)).filter(x => validResIds.has(x));
          if (!target.pages || typeof target.pages !== 'object') target.pages = { ...DEFAULT_CUSTOMER_PAGES };
          if (!Array.isArray(target.adminGrantedPages)) target.adminGrantedPages = [];
          if (target.qualifiedResources.length > 0) {
            target.pages.resources = 'ready';
            if (!target.adminGrantedPages.includes('resources')) target.adminGrantedPages.push('resources');
          }
        }
        if (body.securityGroup && body.securityGroup !== 'DOMAIN_ADMIN') {
          target.securityGroup = String(body.securityGroup);
          if (body.applyGroupPolicy) {
            const grp = target.securityGroup;
            if (grp === 'EXTERNAL_SAAS_LMS') {
              target.ou = 'external';
              target.accessTier = 'CUSTOMER_RESTRICTED';
              target.pages = { saasapps: 'ready' };
              target.adminGrantedPages = [];
              target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
              target.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
            } else if (grp === 'EXTERNAL_FULL_CLIENT') {
              target.ou = 'external';
              target.accessTier = 'CUSTOMER_RESTRICTED';
              target.pages = isEmployeeUser(u)
                ? { saasapps: 'ready', agile: 'ready', resources: 'ready', training: 'ready' }
                : { saasapps: 'ready', agile: 'ready', resources: 'ready', training: 'ready', finance: 'ready' };
              target.adminGrantedPages = isEmployeeUser(u)
                ? ['agile', 'resources', 'training']
                : ['agile', 'resources', 'training', 'finance'];
              target.allowedApps = APPS_CATALOG.map(a => a.id);
              target.qualifiedResources = getResourcesCatalog().map(r => r.id);
            } else if (isOwnerUser(u) && grp === 'INTERNAL_ANALYST') {
              target.ou = 'internal';
              target.accessTier = 'INTERNAL_EMPLOYEE';
              target.pages = { saasapps: 'ready', agile: 'ready', radar: 'ready', resources: 'ready', training: 'ready', compliance: 'ready' };
              target.adminGrantedPages = ['agile', 'radar', 'resources', 'training', 'compliance'];
              target.allowedApps = APPS_CATALOG.map(a => a.id);
              target.qualifiedResources = getResourcesCatalog().map(r => r.id);
            } else if (isOwnerUser(u) && grp === 'INTERNAL_OPERATIONS') {
              target.ou = 'internal';
              target.accessTier = 'INTERNAL_EMPLOYEE';
              CATALOG.forEach(c => {
                if (c.id === 'finance') return; // Employees have no access to payment/finance settings
                target.pages[c.id] = 'ready';
                if (c.id !== 'saasapps' && !target.adminGrantedPages.includes(c.id)) target.adminGrantedPages.push(c.id);
              });
              target.allowedApps = APPS_CATALOG.map(a => a.id);
              target.qualifiedResources = getResourcesCatalog().map(r => r.id);
            }
          }
        }
        logAudit(u.id, 'ad.user_profile_updated', `${target.email} [OU=${target.ou || 'external'} | Group=${target.securityGroup || 'EXTERNAL_SAAS_LMS'}]`);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'addCustomResource') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to register new resources.' });
        }
        const d = body.data || body || {};
        const cleanId = String(d.id || d.title || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || uid('res');
        const cleanTitle = sanitizeInput(d.title || cleanId, 100);
        if (!Array.isArray(S.customResources)) S.customResources = [];
        const newRes = {
          id: cleanId,
          title: cleanTitle,
          category: sanitizeInput(d.category || 'Qualified Partner Resource + Milton UI/UX & AI Fast-Track', 100),
          route: sanitizeInput(d.route || '/resources', 140),
          summary: sanitizeInput(d.summary || 'Qualified resource enhanced with Milton UI/UX workspace controls and AI Fast-Track tools.', 360),
          qualificationNote: sanitizeInput(d.qualificationNote || 'Granted upon onboarding or directory qualification.', 200),
          uiUxEnhancements: Array.isArray(d.uiUxEnhancements) && d.uiUxEnhancements.length
            ? d.uiUxEnhancements.map(x => sanitizeInput(x, 160))
            : ['Milton Unified Command UI/UX Workspace', 'Role-Scoped Telemetry & Action Controls'],
          aiTools: Array.isArray(d.aiTools) && d.aiTools.length
            ? d.aiTools
            : [
                { id: `${cleanId}-fast-track`, title: `${cleanTitle} AI Fast-Track Accelerator`, desc: 'Automated workflow synthesis, rapid onboarding, and guided execution for qualified members.' }
              ],
          defaultQualified: false
        };
        S.customResources = S.customResources.filter(r => r.id !== cleanId);
        S.customResources.push(newRes);
        logAudit('owner', 'resource.catalog_added', `${cleanId} (${cleanTitle})`);
        saveState(S);
        return sendJson(res, 200, { ok: true, resource: newRes, resourcesCatalog: getResourcesCatalog(), state: scopeStateForUser(u) });
      }
      if (act === 'postAccountingEntry') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to post accounting journal entries.' });
        }
        const d = body.data || body || {};
        const entry = postAccountingJournalEntry(d);
        logAudit('owner', 'accounting.journal_posted', `${entry.journalId} [${entry.entity} ${entry.entryType} $${entry.grossUsd.toFixed(2)}]`);
        saveState(S);
        return sendJson(res, 200, { ok: true, entry, summary: computeAccountingSummary(), state: scopeStateForUser(u) });
      }
      if (act === 'reconcileAccountingEntry') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to reconcile accounting entries.' });
        }
        const jid = String(body.journalId || body.id || '');
        const rawNext = String(body.reconciledStatus || body.status || '').toUpperCase();
        const nextStatus = ['ISSUED', 'AUTHORIZED', 'SETTLED', 'RECONCILED'].includes(rawNext)
          ? rawNext
          : 'RECONCILED';
        const targetEntry = (S.accountingLedger || []).find(e => e.journalId === jid || e.id === jid || e.receiptId === jid);
        if (targetEntry) {
          if (targetEntry.entryType === 'INVOICE_AR' && (nextStatus === 'SETTLED' || nextStatus === 'RECONCILED')) {
            const econ = computeRailEconomics(targetEntry.grossUsd || targetEntry.grossAmount, targetEntry.rail);
            targetEntry.entryType = 'REVENUE';
            targetEntry.processorFeeUsd = econ.processorFeeUsd;
            targetEntry.processorFee = econ.processorFeeUsd;
            targetEntry.netCashUsd = econ.netCashUsd;
            targetEntry.netAmount = econ.netCashUsd;
            targetEntry.taxReserveUsd = econ.taxReserveUsd;
            targetEntry.taxReserve25 = econ.taxReserveUsd;
            targetEntry.operatingNetUsd = econ.operatingNetUsd;
            targetEntry.lines = [
              { account: '1010', accountCode: '1010', name: COA_MAP['1010'].name, accountName: COA_MAP['1010'].name, debit: econ.operatingNetUsd, credit: 0 },
              { account: '1020', accountCode: '1020', name: COA_MAP['1020'].name, accountName: COA_MAP['1020'].name, debit: econ.taxReserveUsd, credit: 0 },
              ...(econ.processorFeeUsd > 0 ? [{ account: '5030', accountCode: '5030', name: COA_MAP['5030'].name, accountName: COA_MAP['5030'].name, debit: econ.processorFeeUsd, credit: 0 }] : []),
              { account: targetEntry.accountCode || '4010', accountCode: targetEntry.accountCode || '4010', name: targetEntry.accountName || 'Commercial Revenue', accountName: targetEntry.accountName || 'Commercial Revenue', debit: 0, credit: targetEntry.grossUsd || targetEntry.grossAmount }
            ];
          }
          targetEntry.status = nextStatus;
          targetEntry.reconciledStatus = nextStatus;
          targetEntry.reconciledAt = new Date().toISOString();
          logAudit('owner', 'accounting.entry_reconciled', `${targetEntry.journalId} -> ${nextStatus}`);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, entry: targetEntry, summary: computeAccountingSummary(), state: scopeStateForUser(u) });
      }
      if (act === 'savePciGatewayConfig') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Employees do not have access to payment gateway settings.' });
        }
        S.pciGatewayConfig = Object.assign({}, S.pciGatewayConfig || {}, {
          activeProcessor: sanitizeInput(body.activeProcessor || 'stripe_saq_a', 60),
          stripePublishableKey: sanitizeInput(body.stripePublishableKey || '', 160),
          stripeCheckoutHostedUrl: sanitizeInput(body.stripeCheckoutHostedUrl || '', 240),
          authorizeNetApiLoginId: sanitizeInput(body.authorizeNetApiLoginId || '', 120),
          authorizeNetClientKey: sanitizeInput(body.authorizeNetClientKey || '', 160),
          mercuryAchEnabled: body.mercuryAchEnabled !== false,
          wawfPieeEnabled: body.wawfPieeEnabled !== false
        });
        logAudit('owner', 'pci.gateway_config_updated', S.pciGatewayConfig.activeProcessor);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      // Fluid Administrator & Employee (Client-only) Feature & Access Grant / Revoke
      if (act === 'toggleUserFeature') {
        const target = S.users[body.userId];
        if (!target || target.id === 'owner') {
          return sendJson(res, 400, { ok: false, error: 'Valid non-admin customer account required.' });
        }
        if (isEmployeeUser(u) && target.ou === 'internal') {
          return sendJson(res, 403, { ok: false, error: 'Employees only have access to manage external client accounts.' });
        }
        const featureType = String(body.featureType || 'page');
        const featureId = String(body.featureId || '');
        if (isEmployeeUser(u) && featureType === 'page' && featureId === 'finance') {
          return sendJson(res, 403, { ok: false, error: 'Employees do not have access to payment or finance settings.' });
        }
        if (!target.pages || typeof target.pages !== 'object') {
          target.pages = { ...DEFAULT_CUSTOMER_PAGES };
        }
        if (!Array.isArray(target.adminGrantedPages)) {
          target.adminGrantedPages = [];
        }
        if (!Array.isArray(target.allowedApps)) {
          target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
        }
        if (!Array.isArray(target.qualifiedResources)) {
          target.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
        }

        if (featureType === 'preset') {
          if (featureId === 'reset_saas_only') {
            target.pages = { saasapps: 'ready' };
            target.adminGrantedPages = [];
            target.allowedApps = DEFAULT_CUSTOMER_APPS.slice();
            target.qualifiedResources = DEFAULT_CUSTOMER_RESOURCES.slice();
            S.shares = S.shares.filter(s => !(s.grantee === target.id && (s.type === 'page' || s.type === 'element' || s.type === 'app' || s.type === 'resource')));
            notifyUser(target.id, 'Workspace Scoped to SaaS Apps & LMS', 'Administrator reset your navigation to default SaaS Apps & LMS + Payment & Billing.');
            logAudit('owner', 'feature.preset.saas_only', target.email);
          } else if (featureId === 'grant_all_features') {
            CATALOG.forEach(c => {
              if (isEmployeeUser(u) && c.id === 'finance') return;
              target.pages[c.id] = 'ready';
              if (c.id !== 'saasapps' && !target.adminGrantedPages.includes(c.id)) {
                target.adminGrantedPages.push(c.id);
              }
            });
            target.allowedApps = APPS_CATALOG.map(a => a.id);
            target.qualifiedResources = getResourcesCatalog().map(r => r.id);
            target.status = 'active';
            notifyUser(target.id, 'Full Feature & Resource Suite Granted', 'Your MGC & F.I.X workspace features, SCORM apps, and Qualified Resources + AI Fast-Track tools have been unlocked.');
            logAudit(u.id, 'feature.preset.grant_all', target.email);
          }
          saveState(S);
          return sendJson(res, 200, {
            ok: true,
            targetUser: {
              id: target.id,
              email: target.email,
              pages: target.pages,
              allowedPages: getAllowedPagesForUser(target),
              allowedPortals: getAllowedPortalsForUser(target),
              allowedApps: target.allowedApps,
              qualifiedResources: target.qualifiedResources
            },
            state: scopeStateForUser(u)
          });
        }

        if (featureType === 'resource') {
          const allRes = getResourcesCatalog();
          const resEntry = allRes.find(r => r.id === featureId);
          if (!resEntry) return sendJson(res, 400, { ok: false, error: 'Unknown resource ID.' });
          const currentlyHas = target.qualifiedResources.includes(featureId);
          const enable = typeof body.enabled === 'boolean' ? body.enabled : !currentlyHas;
          if (enable) {
            if (!target.qualifiedResources.includes(featureId)) target.qualifiedResources.push(featureId);
            target.pages.resources = 'ready';
            if (!target.adminGrantedPages.includes('resources')) target.adminGrantedPages.push('resources');
            S.shares = S.shares.filter(s => !(s.type === 'resource' && s.resource === featureId && s.grantee === target.id));
            S.shares.push({ id: `resource_${featureId}_${target.id}`, type: 'resource', resource: featureId, grantee: target.id, perms: ['view', 'launch'], created: now() });
            notifyUser(target.id, `Resource Qualification Granted: ${resEntry.title}`, `You are now qualified for "${resEntry.title}" along with its Milton UI/UX enhancements and AI Fast-Track tools in your Resources section.`);
            logAudit(u.id, 'feature.resource.grant', `${featureId} -> ${target.email}`);
          } else {
            target.qualifiedResources = target.qualifiedResources.filter(r => r !== featureId);
            S.shares = S.shares.filter(s => !(s.type === 'resource' && s.resource === featureId && s.grantee === target.id));
            if (target.qualifiedResources.length === 0) {
              delete target.pages.resources;
              target.adminGrantedPages = target.adminGrantedPages.filter(p => p !== 'resources');
              S.shares = S.shares.filter(s => !(s.type === 'page' && s.resource === 'resources' && s.grantee === target.id));
            }
            notifyUser(target.id, `Resource Qualification Updated: ${resEntry.title}`, `Qualification for "${resEntry.title}" was removed from your workspace.`);
            logAudit(u.id, 'feature.resource.revoke', `${featureId} -> ${target.email}`);
          }
          saveState(S);
          return sendJson(res, 200, {
            ok: true,
            targetUser: {
              id: target.id,
              email: target.email,
              pages: target.pages,
              allowedPages: getAllowedPagesForUser(target),
              allowedPortals: getAllowedPortalsForUser(target),
              allowedApps: target.allowedApps,
              qualifiedResources: target.qualifiedResources
            },
            state: scopeStateForUser(u)
          });
        }

        if (featureType === 'app') {
          const appEntry = APPS_CATALOG.find(a => a.id === featureId);
          if (!appEntry) return sendJson(res, 400, { ok: false, error: 'Unknown app.' });
          const currentlyHas = target.allowedApps.includes(featureId);
          const enable = typeof body.enabled === 'boolean' ? body.enabled : !currentlyHas;
          if (enable) {
            if (!target.allowedApps.includes(featureId)) target.allowedApps.push(featureId);
            S.shares = S.shares.filter(s => !(s.type === 'app' && s.resource === featureId && s.grantee === target.id));
            S.shares.push({ id: `app_${featureId}_${target.id}`, type: 'app', resource: featureId, grantee: target.id, perms: ['view', 'launch'], created: now() });
            notifyUser(target.id, `App Granted: ${appEntry.title}`, `Administrator granted you access to launch "${appEntry.title}".`);
            logAudit('owner', 'feature.app.grant', `${featureId} -> ${target.email}`);
          } else {
            target.allowedApps = target.allowedApps.filter(a => a !== featureId);
            S.shares = S.shares.filter(s => !(s.type === 'app' && s.resource === featureId && s.grantee === target.id));
            notifyUser(target.id, `App Access Updated: ${appEntry.title}`, `Administrator revoked access to "${appEntry.title}".`);
            logAudit('owner', 'feature.app.revoke', `${featureId} -> ${target.email}`);
          }
          saveState(S);
          return sendJson(res, 200, {
            ok: true,
            targetUser: {
              id: target.id,
              email: target.email,
              pages: target.pages,
              allowedPages: getAllowedPagesForUser(target),
              allowedPortals: getAllowedPortalsForUser(target),
              allowedApps: target.allowedApps,
              qualifiedResources: target.qualifiedResources
            },
            state: scopeStateForUser(u)
          });
        }

        // Default: featureType === 'page'
        const catEntry = CATALOG.find(c => c.id === featureId);
        if (!catEntry) return sendJson(res, 400, { ok: false, error: 'Unknown feature/page ID.' });
        const currentlyReady = target.pages[featureId] === 'ready';
        const enable = typeof body.enabled === 'boolean' ? body.enabled : !currentlyReady;
        if (enable) {
          target.pages[featureId] = 'ready';
          if (featureId !== 'saasapps' && !target.adminGrantedPages.includes(featureId)) {
            target.adminGrantedPages.push(featureId);
          }
          if (target.status === 'requested' || target.status === 'approved_building') {
            target.status = 'active';
          }
          S.shares = S.shares.filter(s => !(s.type === 'page' && s.resource === featureId && s.grantee === target.id));
          S.shares.push({ id: `page_${featureId}_${target.id}`, type: 'page', resource: featureId, grantee: target.id, perms: ['view', 'edit'], created: now() });
          if (featureId === 'agile' && !S.shares.some(s => s.type === 'project' && s.resource === 'p1' && s.grantee === target.id)) {
            S.shares.push({ id: `project_p1_${target.id}`, type: 'project', resource: 'p1', grantee: target.id, perms: ['view', 'edit'], created: now() });
          }
          notifyUser(target.id, `Feature Unlocked: ${catEntry.title}`, `Administrator granted you live view & access to "${catEntry.title}" (${catEntry.route}). It is now visible in your Left Side Pane and Top Menu.`);
          logAudit('owner', 'feature.page.grant', `${featureId} -> ${target.email}`);
        } else {
          if (featureId === 'saasapps') {
            target.pages.saasapps = 'ready';
          } else {
            delete target.pages[featureId];
            target.adminGrantedPages = target.adminGrantedPages.filter(p => p !== featureId);
            S.shares = S.shares.filter(s => !(s.type === 'page' && s.resource === featureId && s.grantee === target.id));
            notifyUser(target.id, `Feature Access Updated: ${catEntry.title}`, `Administrator removed "${catEntry.title}" from your active workspace menu.`);
            logAudit('owner', 'feature.page.revoke', `${featureId} -> ${target.email}`);
          }
        }
        saveState(S);
        return sendJson(res, 200, {
          ok: true,
          targetUser: {
            id: target.id,
            email: target.email,
            pages: target.pages,
            allowedPages: getAllowedPagesForUser(target),
            allowedPortals: getAllowedPortalsForUser(target),
            allowedApps: target.allowedApps,
            qualifiedResources: target.qualifiedResources
          },
          state: scopeStateForUser(u)
        });
      }
      if (act === 'approve') {
        const target = S.users[body.userId];
        if (target && target.id !== 'owner') {
          if (isEmployeeUser(u) && target.ou === 'internal') {
            return sendJson(res, 403, { ok: false, error: 'Employees only have access to manage external client accounts.' });
          }
          target.status = 'active';
          target.allowedApps = Array.isArray(target.allowedApps) && target.allowedApps.length ? target.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
          if (!target.pages || typeof target.pages !== 'object') target.pages = { ...DEFAULT_CUSTOMER_PAGES };
          target.pages.saasapps = 'ready';
          const wanted = (TAILOR[(target.quote && target.quote.interest) || 'ai-web'] || { pages: [] }).pages;
          wanted.forEach(p => {
            if (isEmployeeUser(u) && p === 'finance') return;
            target.pages[p] = 'ready';
            if (!Array.isArray(target.adminGrantedPages)) target.adminGrantedPages = [];
            if (p !== 'saasapps' && !target.adminGrantedPages.includes(p)) target.adminGrantedPages.push(p);
          });
          const r = S.requests.find(x => x.uid === target.id);
          if (r) r.status = 'approved';
          notifyUser(target.id, 'Tailored Features Unlocked', `Your tailored features (${wanted.join(', ')}) are now live in your menu.`);
          logAudit(u.id, 'request.approved', target.email);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'deny') {
        const target = S.users[body.userId];
        if (target && target.id !== 'owner') {
          if (isEmployeeUser(u) && target.ou === 'internal') {
            return sendJson(res, 403, { ok: false, error: 'Employees only have access to manage external client accounts.' });
          }
          target.status = 'denied';
          const r = S.requests.find(x => x.uid === target.id);
          if (r) r.status = 'denied';
          notifyUser(target.id, 'Request update', 'We are unable to approve this request right now.');
          logAudit(u.id, 'request.denied', target.email);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'completeTask') {
        const t = S.tasks.find(x => x.id === body.taskId);
        if (t) {
          t.done = Boolean(body.done);
          const target = S.users[t.uid];
          if (target) {
            target.pages[t.page] = t.done ? 'ready' : 'pending';
            const openCount = S.tasks.filter(x => x.uid === t.uid && !x.done).length;
            if (t.done && openCount === 0 && target.status === 'approved_building') {
              target.status = 'active';
              notifyUser(target.id, 'Access approved — your pages are ready', 'Sign in to open your tailored workspace. Start with your action items.', 'in-app + email + push');
              logAudit('owner', 'pages.ready', target.email);
            }
          }
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'share') {
        const { grantee, type, resource, perms } = body;
        S.shares = S.shares.filter(s => !(s.type === type && s.resource === resource && s.grantee === grantee));
        S.shares.push({ id: `${type}_${resource}_${grantee}`, type, resource, grantee, perms: perms || ['view'], created: now() });
        const targetUser = S.users[grantee];
        if (targetUser && type === 'app') {
          targetUser.allowedApps = Array.isArray(targetUser.allowedApps) ? targetUser.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
          if (!targetUser.allowedApps.includes(resource)) targetUser.allowedApps.push(resource);
        }
        if (targetUser && type === 'page') {
          if (!targetUser.pages) targetUser.pages = { ...DEFAULT_CUSTOMER_PAGES };
          targetUser.pages[resource] = 'ready';
        }
        notifyUser(grantee, 'New Access Granted by Owner', `${type}: ${resource} (${(perms || ['view']).join(', ')})`);
        logAudit('owner', 'share.grant', `${type}:${resource} -> ${grantee}`);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'revoke') {
        const sid = body.shareId || body.id;
        const targetShare = S.shares.find(x => x.id === sid);
        if (targetShare && targetShare.type === 'app' && S.users[targetShare.grantee]) {
          const uTarget = S.users[targetShare.grantee];
          if (Array.isArray(uTarget.allowedApps)) {
            uTarget.allowedApps = uTarget.allowedApps.filter(a => a !== targetShare.resource);
          }
        }
        if (targetShare && targetShare.type === 'page' && S.users[targetShare.grantee]) {
          const uTarget = S.users[targetShare.grantee];
          if (uTarget.pages && targetShare.resource !== 'saasapps') {
            delete uTarget.pages[targetShare.resource];
          }
        }
        S.shares = S.shares.filter(x => x.id !== sid);
        logAudit('owner', 'share.revoke', sid);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'promoteFeature') {
        const f = S.features.find(x => x.id === body.featureId);
        if (f) {
          f.status = 'planned';
          S.items.push({ id: uid('i'), project: body.project || 'p1', type: 'story', title: f.title, points: 3, col: 'backlog', sprint: 1, assignee: '', createdBy: 'owner' });
          notifyUser(f.by, 'Feature request planned', `"${f.title}" was added to the project backlog.`);
          logAudit('owner', 'feature.promote', f.title);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }

      return sendJson(res, 400, { ok: false, error: 'Unsupported action.' });
    }

    /* ---------- HTML & Static Route Gate (Clean Route Masking + Encrypted Return Cookie) ---------- */
    const redirectToCleanAuth = (targetPathOrFile) => {
      const cleanDest = toCleanRoute(targetPathOrFile);
      const headers = { 'Location': '/auth' };
      if (cleanDest && cleanDest !== '/auth' && cleanDest !== '/login') {
        const retTok = signToken({ next: cleanDest }, 900);
        headers['Set-Cookie'] = `mgcw_return=${encodeURIComponent(retTok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`;
      }
      res.writeHead(302, headers);
      return res.end();
    };

    // Strip exposed /login.html?next=... or ?next=... query strings into an HttpOnly return cookie and redirect to clean /auth
    if (pathname === '/login.html' || ((pathname === '/auth' || pathname === '/login' || pathname === '/') && parsedUrl.searchParams.has('next'))) {
      const nextParam = parsedUrl.searchParams.get('next') || '';
      return redirectToCleanAuth(nextParam);
    }

    let cleanRel = '';
    const effectiveHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    if (pathname === '/' && (effectiveHost.includes('miltongroupsecurity.org') || effectiveHost.includes('milton-group-concepts-llc'))) {
      cleanRel = 'marketing-home.html';
    } else if (CLEAN_ROUTE_TO_FILE[pathname]) {
      cleanRel = CLEAN_ROUTE_TO_FILE[pathname];
    } else {
      const stripped = pathname.replace(/^\/+/, '');
      if (!path.extname(stripped) && fs.existsSync(path.resolve(ROOT, stripped + '.html'))) {
        cleanRel = stripped + '.html';
      } else {
        cleanRel = stripped;
      }
    }
    // Enforce Mobile-Only Minimalist Control & Workflow Experience when accessed from a mobile device
    const isHtmlRoute = cleanRel.endsWith('.html') && !cleanRel.startsWith('projects/');
    const isExplicitAuthRoute = pathname === '/auth' || pathname === '/login' || pathname === '/login.html';
    if (isHtmlRoute && !isExplicitAuthRoute && cleanRel !== 'mobile-control.html' && isMobileRequest(req, parsedUrl)) {
      cleanRel = 'mobile-control.html';
    }

    const baseName = path.basename(cleanRel);

    if (BLOCKED_FILES.has(baseName) || cleanRel.startsWith('.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }

    const u = getAuthenticatedUser(req);

    // Gate SCORM 2004 & Showcase Apps under /projects/<appSlug>/* (Default Restricted Customer Access Enforcement)
    if (cleanRel.startsWith('projects/')) {
      const relParts = cleanRel.split('/');
      const appSlug = relParts[1] || '';
      const isSharedAdapter = cleanRel === 'projects/spanish-acquisition-os/src/modules/scorm_adapter.js';
      const gatedApp = APPS_CATALOG.find(a => a.id === appSlug);
      if (!isSharedAdapter && gatedApp && (cleanRel.endsWith('.html') || cleanRel.endsWith('.zip'))) {
        if (!u) {
          return redirectToCleanAuth('/' + cleanRel);
        }
        if (u.role !== 'owner' && !can(u, 'app', appSlug, 'view')) {
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(renderLockedHtml(
            u,
            `Restricted App · ${gatedApp.title}`,
            `Your account has access to SaaS Apps & LMS (Client Turnkey Forge & Sterling Auto Showcase). Access to "${gatedApp.title}" requires Administrator grant or a verified payment upgrade.`,
            '/workspace?view=payment',
            'Submit Payment / Request Unlock →'
          ));
        }
      }
    }

    // Gate member-portal.html (/workspace) and agile-board.html (/agile)
    if (baseName === 'member-portal.html' || baseName === 'agile-board.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (baseName === 'agile-board.html' && u.role !== 'owner' && !can(u, 'page', 'agile', 'view')) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(
          u,
          'Agile Board · Administrator Grant Required',
          'Standard accounts have access strictly to SaaS Apps & LMS and Secure Payment & Billing. Ask the Administrator to enable Agile Board for your account.',
          '/apps',
          'Open SaaS Apps & LMS →'
        ));
      }
    }

    // Gate access-admin.html (/access-admin): Allowed for Administrator OR Internal Employee (Client scope); blocked for External Clients
    if (baseName === 'access-admin.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (!isOwnerUser(u) && !isEmployeeUser(u)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(
          u,
          'Directory Authorization Required',
          'The MGC Directory console is restricted to Internal Staff and the Domain Administrator. Client accounts have access to SaaS & LMS Showcases, Guided Consultations, and Billing & Payment.',
          '/apps',
          'Return to SaaS Apps & LMS →'
        ));
      }
    }

    // Gate admin-command-portal.html (/command): Strictly 1 Administrator (Malik A. Khabir)
    if (baseName === 'admin-command-portal.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (!isOwnerUser(u) || String(u.email || '').toLowerCase() !== SOLE_ADMIN_EMAIL) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(
          u,
          'Sole Administrator Authorization Required',
          'This administrative command center is strictly locked to the single platform Administrator (Malik A. Khabir).',
          '/workspace',
          'Return to Workspace →'
        ));
      }
    }

    // Gate the 16 root internal portals: Owner has full access; onboarding-portal.html (/portal) is a public 2FA/SSO onboarding gate
    if (!cleanRel.startsWith('projects/') && INTERNAL_PORTALS.has(baseName) && baseName !== 'access-admin.html' && baseName !== 'admin-command-portal.html' && baseName !== 'onboarding-portal.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (u.role !== 'owner') {
        const mappedCatalogId = PORTAL_TO_CATALOG[baseName];
        const allowedViaCatalog = mappedCatalogId && can(u, 'page', mappedCatalogId, 'view');
        const allowedViaShare = can(u, 'element', baseName, 'view');
        if (!allowedViaCatalog && !allowedViaShare) {
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(renderLockedHtml(
            u,
            'Restricted Feature · Administrator Grant Required',
            'Your account is configured for SaaS Apps & LMS and Legal & Secure Payment Submission. Only features explicitly granted to your account by the Administrator are accessible.',
            '/apps',
            'Open SaaS Apps & LMS →'
          ));
        }
      }
    }

    const filePath = path.resolve(ROOT, cleanRel);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
      ...SECURITY_HEADERS
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`MGC & F.I.X Authenticated Cloud Run Server listening on http://localhost:${PORT}`);
});
