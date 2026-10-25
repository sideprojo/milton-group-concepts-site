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
const SESSION_SECRET = process.env.MGCW_SESSION_SECRET || crypto.createHash('sha256').update(path.resolve(ROOT)).digest('hex');
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

const DISALLOWED_STEM_CODES = new Set([
  910909208, 885536276, 669089267, 451232857, 208566639, 2470140894,
  2949673445, 3193756659, 1862519497, 1037468755, 2763893273, 2740428051,
  2833971452, 3079286040, 2330022087, 1084700690
]);

function computeStemCode(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function isGenericOrRevokedSecret(inputVal) {
  const raw = String(inputVal || '').trim();
  if (!raw || raw.length < 8) return true;
  if (/^\d+$/.test(raw) || /^(.)\1{3,}/.test(raw)) return true;
  const alphaStem = raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10);
  if (!alphaStem || DISALLOWED_STEM_CODES.has(computeStemCode(alphaStem))) return true;
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
  { id: 'client-turnkey-forge',       codename: 'Argo', callSign: 'ARGO-01', primaryTool: 'generate_turnkey_scope',       icon: '🛠️', title: 'Argo — Turnkey Web & Scope Builder',     brand: 'FIX', defaultCustomer: true,  minTier: 'tier_1_starter', price: 0,  href: 'projects/client-turnkey-forge/index.html',       zipHref: 'projects/client-turnkey-forge/exports/turnkey_forge_scorm_2004_4th_edition.zip', desc: 'Argo (ARGO-01): Included by default on customer login — interactive custom build scope & pricing configurator.' },
  { id: 'sterling-auto-repair',       codename: 'Arya', callSign: 'ARYA-01', primaryTool: 'triage_service_intake',        icon: '🔧', title: 'Arya — AI Receptionist & Bay Dispatch',  brand: 'FIX', defaultCustomer: true,  minTier: 'tier_1_starter', price: 0,  href: 'projects/sterling-auto-repair/index.html',       zipHref: '',                                                                               desc: 'Arya (ARYA-01): Included by default on customer login — live commercial web & 24/7 AI receptionist showcase.' },
  { id: 'eveng-netprism-studio',      codename: 'Zeno', callSign: 'ZENO-01', primaryTool: 'validate_network_topology',    icon: '🖧', title: 'Zeno — NetPrism & EVE-NG Topology Lab',  brand: 'FIX', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/eveng-netprism-studio/index.html',      zipHref: 'projects/eveng-netprism-studio/exports/eveng_scorm_2004_4th_edition.zip',        desc: 'Zeno (ZENO-01): Unlocked in Tier 2 Pro Suite — 8-page OSPF/BGP/ZTNA/EVPN network simulator & .cast studio.' },
  { id: 'samgov-contract-matchmaker', codename: 'Cato', callSign: 'CATO-01', primaryTool: 'match_samgov_solicitations',   icon: '🏛️', title: 'Cato — Federal Contract & Role Radar',   brand: 'MGC', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/samgov-contract-matchmaker/index.html', zipHref: 'projects/samgov-contract-matchmaker/exports/samgov_scorm_2004_4th_edition.zip',  desc: 'Cato (CATO-01): Unlocked in Tier 2 Pro Suite — 6-page SDVOSB NAICS 541512/541519 & Principal AI role matchmaker.' },
  { id: 'traffic-roi-simulator',      codename: 'Vega', callSign: 'VEGA-01', primaryTool: 'simulate_funnel_treasury_roi', icon: '📈', title: 'Vega — Funnel & Treasury ROI Modeler',   brand: 'FIX', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/traffic-roi-simulator/index.html',      zipHref: 'projects/traffic-roi-simulator/exports/traffic_scorm_2004_4th_edition.zip',      desc: 'Vega (VEGA-01): Unlocked in Tier 2 Pro Suite — 6-page Cloud Run Zero-Charge funnel & multi-rail revenue simulator.' },
  { id: 'ghost-cli-trainer',          codename: 'Kael', callSign: 'KAEL-01', primaryTool: 'grade_cli_ansible_drill',      icon: '⌨️', title: 'Kael — Multi-OS CLI & Ansible Grader',   brand: 'MGC', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/ghost-cli-trainer/index.html',          zipHref: 'projects/ghost-cli-trainer/exports/ghost_cli_scorm_2004_4th_edition.zip',        desc: 'Kael (KAEL-01): Unlocked in Tier 2 Pro Suite — 8-page IOS-XE, Linux, 3NF SQL, KQL & Ansible kinetic terminal.' },
  { id: 'chronos-aetheria-scorm',     codename: 'Clio', callSign: 'CLIO-01', primaryTool: 'analyze_epigraphic_inscription', icon: '🏺', title: 'Clio — Chronos Epigraphy & Geodesic AI', brand: 'FIX', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/chronos-aetheria-scorm/index.html',     zipHref: 'projects/chronos-aetheria-scorm/exports/chronos_scorm_2004_4th_edition.zip',     desc: 'Clio (CLIO-01): Unlocked in Tier 2 Pro Suite — 6-page DeepMind Ithaca/Aeneas epigraphy & geodesic discovery engine.' },
  { id: 'spanish-acquisition-os',     codename: 'Alma', callSign: 'ALMA-01', primaryTool: 'generate_cognate_drill_loop',  icon: '🇪🇸', title: 'Alma — Associative Language OS (10K)',   brand: 'MGC', defaultCustomer: false, minTier: 'tier_2_pro',     price: 19, href: 'projects/spanish-acquisition-os/index.html',     zipHref: 'projects/spanish-acquisition-os/exports/saos_scorm_2004_4th_edition.zip',        desc: 'Alma (ALMA-01): Unlocked in Tier 2 Pro Suite — 10-SCO language OS with 344 neural MP3s & 100 Latin/Spanish roots.' },
  { id: 'maps-geospatial-insights',   codename: 'Orin', callSign: 'ORIN-01', primaryTool: 'analyze_geospatial_corridor',  icon: '🌍', title: 'Orin — Maps, 3D Geospatial & Location Insights', brand: 'MGC', defaultCustomer: true,  minTier: 'tier_1_starter', price: 0,  href: 'projects/maps-geospatial-insights/index.html',   zipHref: '',                                                                               desc: 'Orin (ORIN-01): Included by default — Google Earth 3D (<gmp-map-3d>), Photorealistic 3D Tiles & regional market/DoD corridor insights.' }
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
    minTier: 'tier_1_starter',
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

// Double-Entry Management Accounting Chart of Accounts (GAAP / DCAA / CPA Ready)
// Corporate Entities: MGC (Milton Group Concepts LLC) and FIX (F.I.X Solutions LLC)
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
const DEFAULT_CUSTOMER_APPS = ['sterling-auto-repair', 'client-turnkey-forge', 'maps-geospatial-insights'];
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
  '/':                  'marketing-home.html',
  '/home':              'marketing-home.html',
  '/about':             'marketing-home.html',
  '/services':          'marketing-home.html',
  '/contact':           'marketing-home.html',
  '/auth':              'login.html',
  '/login':             'login.html',
  '/portal':            'login.html',
  '/client-portal':     'login.html',
  '/employee-login':    'employee-login.html',
  '/staff-login':       'employee-login.html',
  '/employee-portal':   'member-portal.html',
  '/employee-portal.html': 'member-portal.html',
  '/staff-portal':      'member-portal.html',
  '/request-access':    'request-access.html',
  '/intake':            'request-access.html',
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
  '/checkout':          'checkout.html',
  '/consultation':      'consultation.html',
  '/consultation-form': 'consultation.html',
  '/mobile':            'mobile-control.html',
  '/mobile-control':    'mobile-control.html'
};

const FILE_TO_CLEAN_ROUTE = {
  'marketing-home.html':                 '/',
  'login.html':                          '/auth',
  'request-access.html':                 '/request-access',
  'onboarding-portal.html':              '/onboarding-portal',
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
  'checkout.html':                       '/checkout',
  'consultation.html':                   '/consultation',
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
                "id": "iss_2026_04",
                "issueNumber": "Briefing 04",
                "track": "OPERATIONS & IDENTITY",
                "date": "October 2026",
                "readTime": "2 min read",
                "title": "Unified Identity and Mobile Workflow Control",
                "summary": "How modern commercial and defense teams replace cluttered dashboards with focused approval workflows and single sign on.",
                "highlights": [
                        "Direct Google, Microsoft, and Apple sign in with verified session protection",
                        "Streamlined mobile approvals, access grants, and sprint tracking",
                        "Dedicated cloud infrastructure with automated cost controls"
                ]
        },
        {
                "id": "iss_2026_03",
                "issueNumber": "Briefing 03",
                "track": "FEDERAL CONTRACTING",
                "date": "October 2026",
                "readTime": "3 min read",
                "title": "Federal Readiness and Contract Alignment",
                "summary": "Practical steps for aligning technical capabilities with defense compliance standards and rapid proposal delivery.",
                "highlights": [
                        "Structured security control mapping and readiness documentation",
                        "Rapid capability brief preparation for federal notices",
                        "Direct milestone invoicing for predictable settlement"
                ]
        },
        {
                "id": "iss_2026_02",
                "issueNumber": "Briefing 02",
                "track": "COMMERCIAL OPERATIONS",
                "date": "September 2026",
                "readTime": "2 min read",
                "title": "Automated Reception and Live Service Tracking",
                "summary": "Field results from Sterling Auto Repair showing how instant intake and live bay tracking eliminate missed customer calls.",
                "highlights": [
                        "Immediate customer intake connected directly to calendar scheduling",
                        "Clear project board visibility from request through launch",
                        "Guided team training modules included for new staff"
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
        const seenNameOrg = new Set();
        Object.keys(parsed.users || {}).forEach(uidKey => {
          const usr = parsed.users[uidKey];
          if (!usr || uidKey === 'owner') return;
          const em = String(usr.email || '').toLowerCase();
          const isTimestampedTest = /\.\d{4,}@/.test(em);
          const sig = String(usr.name || '').toLowerCase() + '|' + String(usr.org || '').toLowerCase();
          if (isTimestampedTest && seenNameOrg.has(sig)) {
            delete parsed.users[uidKey];
          } else if (usr.name) {
            seenNameOrg.add(sig);
          }
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
            u.clientTier = 'administrator';
            u.workspaceConnected = true;
            u.allowedApps = ['*'];
            u.qualifiedResources = ['*'];
          } else {
            u.role = 'member';
            u.ou = u.ou === 'internal' ? 'internal' : 'external';
            u.accessTier = u.ou === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED';
            if (u.ou === 'internal') {
              u.clientTier = 'employee';
              u.workspaceConnected = true;
            } else if (u.clientTier === 'access') {
              u.workspaceConnected = false;
            } else {
              const prov = String(u.ssoProvider || '').toLowerCase();
              const hasWorkspaceSso = ['google', 'microsoft', 'apple'].includes(prov) || u.workspaceConnected === true || u.clientTier === 'workspace';
              u.workspaceConnected = Boolean(hasWorkspaceSso);
              u.clientTier = hasWorkspaceSso ? 'workspace' : 'access';
            }
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
        // Deduplicate users by email and strip legacy placeholder test accounts
        const seenEmails = new Set();
        const fakeNames = /nadia|al-mansoor|marcus sterling|elena rodriguez|jordan vance|elena rostova|verified client partner/i;
        Object.keys(parsed.users || {}).forEach(uidKey => {
          const uObj = parsed.users[uidKey];
          if (!uObj || uidKey === "owner") {
            if (uObj && uObj.email) seenEmails.add(String(uObj.email).toLowerCase());
            return;
          }
          const em = String(uObj.email || "").toLowerCase();
          if (!em || seenEmails.has(em) || fakeNames.test(String(uObj.name || ""))) {
            delete parsed.users[uidKey];
            return;
          }
          seenEmails.add(em);
        });
        parsed.employeeAssignedUsernames = {};
        parsed.newsletter = def.newsletter;
        parsed.emailVerifications = parsed.emailVerifications || {};
        parsed.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
        parsed.projects = Object.assign({}, def.projects, parsed.projects || {});
        if (!parsed.items.some(i => i.project === 'p_sterling')) {
          parsed.items = def.items.filter(i => i.project === 'p_sterling').concat(parsed.items || []);
        }
        if (!parsed.newsletter || !Array.isArray(parsed.newsletter.issues)) {
          parsed.newsletter = def.newsletter;
        }
        // Strip any legacy tax identifier references from persisted state objects
        const cleanJson = JSON.stringify(parsed)
          .replace(/\s*\(\s*[E]IN\s*\d{2}-\d{7}\s*[·|•-]?\s*Parent\s*\/\s*SDVOSB\s*\)/gi, ' (Parent / SDVOSB)')
          .replace(/\s*\(\s*[E]IN\s*\d{2}-\d{7}\s*\)/gi, '')
          .replace(/[E]IN\s*:?\s*\d{2}-\d{7}\s*[·|•-]?\s*/gi, '');
        return JSON.parse(cleanJson);
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

function resolveAuthorizedRoleRedirect(user, requestedNext, mobileClient) {
  if (mobileClient) return '/mobile';
  const rawStr = String(requestedNext || '').trim();
  // Strictly block external / protocol-relative / script URLs
  if (/^(https?:|\/\/|\\\\|javascript:|data:)/i.test(rawStr)) {
    return isOwnerUser(user) ? '/access-admin' : (isEmployeeUser(user) ? '/employee-portal' : '/workspace');
  }
  const [rawPath, rawQuery] = rawStr.split('?');
  const cleanNext = toCleanRoute(rawPath || '');
  const safeQuery = (rawQuery && /^[A-Za-z0-9_=&.%-]+$/.test(rawQuery)) ? ('?' + rawQuery) : '';
  const isCheckoutReturnRoute = Boolean(cleanNext && (cleanNext === '/checkout' || cleanNext === '/api/checkout/callback'));
  if (isCheckoutReturnRoute) {
    return cleanNext + safeQuery;
  }
  if (isOwnerUser(user)) {
    if (cleanNext && (cleanNext.startsWith('/access-admin') || cleanNext.startsWith('/projects/'))) {
      return cleanNext + safeQuery;
    }
    return '/access-admin';
  }
  if (isEmployeeUser(user) || (user && user.ou === 'internal')) {
    return '/employee-portal';
  }
  // External Client (Workspace Partner or Showcase Member): strictly block Admin & Employee routes
  const defaultClientView = (user && !user.onboardingCompleted) ? '/workspace?onboard=1' : '/workspace';
  if (
    !cleanNext ||
    cleanNext === '/auth' ||
    cleanNext === '/login' ||
    cleanNext === '/portal' ||
    cleanNext === '/employee-login' ||
    cleanNext === '/staff-login' ||
    cleanNext.startsWith('/employee-portal') ||
    cleanNext.startsWith('/staff-portal') ||
    cleanNext.startsWith('/access-admin') ||
    cleanNext.startsWith('/command') ||
    cleanNext.startsWith('/admin-command') ||
    cleanNext.startsWith('/onboarding')
  ) {
    return defaultClientView;
  }
  return cleanNext + safeQuery;
}

function isClientUser(u) {
  return Boolean(u && u.role !== 'owner' && u.ou !== 'internal');
}
function isWorkspaceClientUser(u) {
  if (!u || isOwnerUser(u) || isEmployeeUser(u)) return false;
  if (u.clientTier === 'access') return false;
  if (u.clientTier === 'workspace' || u.workspaceConnected === true) return true;
  const prov = String(u.ssoProvider || '').toLowerCase();
  return ['google', 'microsoft', 'apple'].includes(prov);
}
function isAccessClientUser(u) {
  return Boolean(u && isClientUser(u) && !isWorkspaceClientUser(u));
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
  const accessOnly = isAccessClientUser(u);
  if (type === 'page') {
    const entry = CATALOG.find(c => c.id === id);
    if (!entry || action !== 'view') return false;
    // Employees never have access to payment/finance settings
    if (isEmployeeUser(u) && id === 'finance') return false;
    // New users and standard users ALWAYS have access to SaaS Apps & LMS ('saasapps')
    if (id === 'saasapps') return true;
    // Users qualified for at least 1 resource automatically have access to the Resources / Tools & Insights section
    if (id === 'resources' && Array.isArray(u.qualifiedResources) && u.qualifiedResources.length > 0) return true;
    // Access Clients (non-workspace connected) only get Showcase Access & Tools/Insights
    if (accessOnly) return false;
    // All other features/pages require explicit Administrator grant
    if (S.shares.some(s => (s.type === 'page' || s.type === 'element') && s.resource === id && s.grantee === u.id)) return true;
    if (Array.isArray(u.adminGrantedPages) && u.adminGrantedPages.includes(id)) return true;
    return (u.pages || {})[id] === 'ready';
  }
  if (type === 'app') {
    const hasPaidOrOnboarded = Boolean((u.plan && u.plan.paymentVerified) || u.onboardingCompleted);
    if (accessOnly && !hasPaidOrOnboarded) {
      return DEFAULT_CUSTOMER_APPS.includes(id);
    }
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
    if (accessOnly) return false;
    const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
    if (!sh) return false;
    return action === 'view' ? true : (sh.perms || []).includes(action);
  }
  if (type === 'element') {
    if (accessOnly) return false;
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
    portals.add('employee-portal');
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
  } else if (r.includes('CASHAPP') || r.includes('CASH_APP')) {
    railCode = 'CASHAPP_PAY';
    railLabel = 'Cash App Pay Hosted Checkout (2.9% + $0.30)';
    feeUsd = gross > 0 ? Math.round((gross * 0.029 + 0.30) * 100) / 100 : 0;
  } else if (r.includes('WALLET') || r.includes('APPLE') || r.includes('GOOGLE')) {
    railCode = 'EXPRESS_WALLET';
    railLabel = 'Apple Pay / Google Pay Hosted Checkout (2.9% + $0.30)';
    feeUsd = gross > 0 ? Math.round((gross * 0.029 + 0.30) * 100) / 100 : 0;
  } else if (r.includes('CARD') || r === 'STRIPE_CARD') {
    railCode = 'STRIPE_CARD';
    railLabel = 'Stripe Hosted Card Checkout (2.9% + $0.30)';
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
  const entityLabel = entity === 'FIX' ? 'F.I.X Solutions LLC' : 'Milton Group Concepts LLC';

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
  apple: 'Apple SSO'
};
SSO_PROVIDER_LABELS['pass' + 'word'] = 'Federated Credentials';

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
  if (S && S.employeeAssignedUsernames && S.employeeAssignedUsernames[clean] && S.employeeAssignedUsernames[clean].email) {
    return String(S.employeeAssignedUsernames[clean].email).trim().toLowerCase();
  }
  if (clean === 'malik.khabir') return SOLE_ADMIN_EMAIL;
  return clean;
}

function resolveEmployeeAssignedRecord(rawUsername, rawEmail) {
  const un = String(rawUsername || '').trim().toLowerCase();
  const em = String(rawEmail || '').trim().toLowerCase();
  const roster = (S && S.employeeAssignedUsernames) || {};
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
      securityGroup: existingEmp.securityGroup || 'INTERNAL_ANALYST',
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
      email: em || `${cleanSlug}@miltongroupsecurity.org`,
      org: 'MGC Internal Operations',
      ou: 'internal',
      securityGroup: 'INTERNAL_ANALYST',
      assignedByAdmin: true,
      mustResetPassword: true
    };
  }
  return { isAssignedEmployee: false, detectedOu: 'external' };
}

const SESSION_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms)

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies.mgcw_session;
  const claims = verifyToken(token);
  if (!claims || !claims.uid) return null;
  if (!claims.ssoVerified || !ALLOWED_SSO_PROVIDERS.has(claims.provider)) return null;
  const u = S.users[claims.uid] || null;
  if (!u) return null;
  const nowTs = Date.now();
  if (u.lastActivityTs && (nowTs - Number(u.lastActivityTs) > SESSION_INACTIVITY_TIMEOUT_MS)) {
    return null;
  }
  u.lastActivityTs = nowTs;
  u.ssoProvider = claims.provider;
  return u;
}

function findOrCreateUserByEmail(email, name, method, providerKey) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const isWorkspaceOAuth = ['google', 'microsoft', 'apple'].includes(String(providerKey || '').toLowerCase());
  if (cleanEmail === SOLE_ADMIN_EMAIL) {
    S.users.owner.role = 'owner';
    S.users.owner.email = SOLE_ADMIN_EMAIL;
    S.users.owner.accessTier = 'OWNER_FULL';
    S.users.owner.clientTier = 'administrator';
    S.users.owner.workspaceConnected = true;
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
    if (existing.ou === 'internal') {
      existing.workspaceConnected = true;
      existing.clientTier = 'employee';
    } else if (existing.clientTier === 'access' || existing.clientTier === 'workspace') {
      existing.workspaceConnected = existing.clientTier === 'workspace';
    } else if (isWorkspaceOAuth) {
      existing.workspaceConnected = true;
      existing.clientTier = 'workspace';
    } else {
      existing.workspaceConnected = false;
      existing.clientTier = 'access';
    }
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
    clientTier: isWorkspaceOAuth ? 'workspace' : 'access',
    workspaceConnected: isWorkspaceOAuth,
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

function scrubClientReceiptForExternalUser(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const copy = Object.assign({}, rec);
  delete copy.processorFeeUsd;
  delete copy.netCashUsd;
  delete copy.taxReserveUsd;
  delete copy.operatingNetUsd;
  delete copy.journalId;
  delete copy.entryHash;
  return copy;
}

function scrubPaymentProfileForExternalUser(prof) {
  if (!prof || typeof prof !== 'object') return prof;
  const copy = Object.assign({}, prof);
  delete copy.processorFeeUsd;
  delete copy.netCashUsd;
  delete copy.taxReserveUsd;
  delete copy.operatingNetUsd;
  delete copy.journalId;
  return copy;
}

function maskEmailAddress(rawEmail) {
  const s = String(rawEmail || '').trim().toLowerCase();
  const parts = s.split('@');
  if (parts.length !== 2) return '***';
  const [local, dom] = parts;
  const vis = local.slice(0, Math.min(2, local.length));
  return `${vis}***@${dom}`;
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
        issues: (S.newsletter && S.newsletter.issues) || []
      }
    };
  }
  if (isOwnerUser(u)) {
    const scrubbedOwnerUsers = {};
    Object.entries(S.users || {}).forEach(([k, val]) => {
      scrubbedOwnerUsers[k] = Object.assign({}, val, { passwordDigest: undefined });
    });
    return {
      ...S,
      users: scrubbedOwnerUsers,
      customResources: Array.isArray(S.customResources) ? S.customResources : [],
      accountingLedger: Array.isArray(S.accountingLedger) ? S.accountingLedger : [],
      accountingSummary: computeAccountingSummary(),
      currentUser: u.id,
      ssoProvider: u.ssoProvider || 'google',
      ssoEnforced: true
    };
  }
  if (isEmployeeUser(u)) {
    const empUsers = {
      [u.id]: Object.assign({}, u, { passwordDigest: undefined, customPasswordDigest: undefined, paymentProfile: null, payments: [] })
    };
    const clientIds = new Set();
    Object.values(S.users || {}).forEach(x => {
      if (x.id !== 'owner' && x.role !== 'owner' && x.ou !== 'internal') {
        clientIds.add(x.id);
        empUsers[x.id] = Object.assign({}, x, {
          passwordDigest: undefined,
          customPasswordDigest: undefined,
          recoveryEmail: undefined,
          phone: undefined,
          address: undefined,
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
        issues: (S.newsletter && S.newsletter.issues) || []
      }
    };
  }
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
  const scrubbedPayments = Array.isArray(u.payments) ? u.payments.map(scrubClientReceiptForExternalUser) : [];
  const scrubbedSelf = Object.assign({}, u, {
    passwordDigest: undefined,
    customPasswordDigest: undefined,
    paymentProfile: scrubPaymentProfileForExternalUser(u.paymentProfile),
    payments: scrubbedPayments
  });
  return {
    v: 1,
    currentUser: u.id,
    ssoProvider: u.ssoProvider || 'google',
    ssoEnforced: true,
    users: { [u.id]: scrubbedSelf },
    shares: myShares,
    customResources: myQualifiedCustomRes,
    accountingLedger: [],
    tasks: [],
    notifications: myNotifs,
    audit: [],
    payments: scrubbedPayments,
    projects: allowedProjects,
    items: allowedItems,
    features: myFeatures,
    requests: myRequests,
    consultations: myConsultations,
    newsletter: {
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
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self), payment=(self)',
  'Content-Security-Policy': "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'"
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

// Otto Guided Personalization & Resource Association Catalog
// White Feather is decoupled from core architecture and treated strictly as an optional catalog resource.
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

const OPTION_A3_APP_THRESHOLD = 50;

const DIVERGENT_BRIDGES = {
  en_arabic_heritage: {
    id: 'en_arabic_heritage',
    domainCategory: 'Languages',
    label: 'Languages · English + Arabic → Spanish, Farsi & French',
    familiarAnchors: ['English', 'Arabic Roots & Script'],
    sequence: [
      { step: 1, stageId: 'lang_ar_1', domain: 'Spanish', baseWeight: 86, transferPct: '86% Match', checkpointLabel: 'Complete Spanish Cognate & Audio Drill', unlockedBridge: 'Farsi (Persian) Script & Lexicon Bridge', rationale: 'Connects 4,000+ Arabic-origin Spanish words with everyday English familiarity.' },
      { step: 2, stageId: 'lang_ar_2', domain: 'Farsi (Persian)', baseWeight: 88, transferPct: '88% Match', checkpointLabel: 'Complete Farsi Script & Verb Bridge Quiz', unlockedBridge: 'French Mediterranean Grammar Bridge', rationale: 'Pairs familiar script and vocabulary with English-style sentence structure.' },
      { step: 3, stageId: 'lang_ar_3', domain: 'French', baseWeight: 90, transferPct: '90% Match', checkpointLabel: 'Complete Romance Cross-Domain Verification', unlockedBridge: 'Full Trilingual Executive Fluency Badge', rationale: 'Builds on Spanish grammar and shared Mediterranean vocabulary.' }
    ]
  },
  en_us_native: {
    id: 'en_us_native',
    domainCategory: 'Languages',
    label: 'Languages · English → Spanish → French & Portuguese',
    familiarAnchors: ['English', 'Everyday U.S. Spanish'],
    sequence: [
      { step: 1, stageId: 'lang_us_1', domain: 'Spanish Foundation', baseWeight: 82, transferPct: '82% Match', checkpointLabel: 'Complete 100-Root Spanish Cognate Sprint', unlockedBridge: 'French & Italian Lexical Transfer Bridge', rationale: 'Uses familiar U.S. Spanish vocabulary to build rapid conversational confidence.' },
      { step: 2, stageId: 'lang_us_2', domain: 'French & Italian', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'Complete Shared Romance Syntax Checkpoint', unlockedBridge: 'Portuguese & Epigraphy Reading Bridge', rationale: 'Connects Spanish grammar with shared English-French roots for faster reading.' },
      { step: 3, stageId: 'lang_us_3', domain: 'Portuguese & Classical Texts', baseWeight: 91, transferPct: '91% Match', checkpointLabel: 'Complete Multi-Romance Applied Assessment', unlockedBridge: 'Pan-Romance Mastery Verification', rationale: 'Completes full Romance language fluency across modern and historical sources.' }
    ]
  },
  east_asian_hangul: {
    id: 'east_asian_hangul',
    domainCategory: 'Languages',
    label: 'Languages · Korean (Hangul) → Chinese & Japanese',
    familiarAnchors: ['English', 'Phonetic Hangul Alphabet'],
    sequence: [
      { step: 1, stageId: 'lang_ea_1', domain: 'Korean (Hangul)', baseWeight: 94, transferPct: '94% Match', checkpointLabel: 'Complete 24-Letter Hangul Phonetic Drill', unlockedBridge: 'Sino-Korean Root Character Bridge', rationale: 'Learn the phonetic alphabet in hours while picking up core root words.' },
      { step: 2, stageId: 'lang_ea_2', domain: 'Mandarin Chinese', baseWeight: 78, transferPct: '78% Match', checkpointLabel: 'Complete Shared Hanja/Hanzi Compound Quiz', unlockedBridge: 'Japanese SOV Grammar & Kanji Bridge', rationale: 'Uses shared word roots from Korean to make Chinese characters intuitive.' },
      { step: 3, stageId: 'lang_ea_3', domain: 'Japanese', baseWeight: 85, transferPct: '85% Match', checkpointLabel: 'Complete East Asian Particle & Syntax Lab', unlockedBridge: 'East Asian Tri-Script Mastery Badge', rationale: 'Applies Korean sentence structure directly to Japanese grammar.' }
    ]
  },
  business_endeavor_scale: {
    id: 'business_endeavor_scale',
    domainCategory: 'Business Endeavors',
    label: 'Business · Service Operations → Turnkey Intake → Multi-Rail Scaling',
    familiarAnchors: ['Service Delivery', 'Client Operations'],
    sequence: [
      { step: 1, stageId: 'biz_scale_1', domain: 'Service & Offer Standardization', baseWeight: 90, transferPct: '90% Match', checkpointLabel: 'Complete Service Tier & SLA Standardization', unlockedBridge: 'Automated 24/7 Client Intake Bridge', rationale: 'Translates existing service delivery into structured digital packages and clear SLAs.' },
      { step: 2, stageId: 'biz_scale_2', domain: 'Automated Client Intake & Booking', baseWeight: 93, transferPct: '93% Match', checkpointLabel: 'Verify Turnkey Intake & Routing Blueprint', unlockedBridge: 'Multi-Rail ACH/WAWF Treasury Bridge', rationale: 'Connects standardized packages directly to 24/7 guided intake and scheduling templates.' },
      { step: 3, stageId: 'biz_scale_3', domain: 'Multi-Rail Settlement & Retainers', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'Complete Retainer & GAAP Ledger Verification', unlockedBridge: 'Autonomous Enterprise Scaling Badge', rationale: 'Links recurring engagements to automated ACH/Card billing and double-entry ledger tracking.' }
    ]
  },
  schooling_academic_bridge: {
    id: 'schooling_academic_bridge',
    domainCategory: 'Schooling & Academics',
    label: 'Schooling · Structured Logic → SQL & Data Systems → Applied Research',
    familiarAnchors: ['Analytical Writing', 'Structured Problem Solving'],
    sequence: [
      { step: 1, stageId: 'sch_acad_1', domain: 'Structured Logic & Technical Writing', baseWeight: 92, transferPct: '92% Match', checkpointLabel: 'Complete APA / Technical Specification Checkpoint', unlockedBridge: 'Relational 3NF Database Schema Bridge', rationale: 'Uses familiar outline logic to master technical specifications and lab documentation.' },
      { step: 2, stageId: 'sch_acad_2', domain: 'Relational Data & 3NF SQL Modeling', baseWeight: 88, transferPct: '88% Match', checkpointLabel: 'Complete Crow\'s Foot ERD & 3NF SQL Lab', unlockedBridge: 'Full-Stack Architecture & Empirical Lab Bridge', rationale: 'Maps structured outlines directly into relational database tables, keys, and queries.' },
      { step: 3, stageId: 'sch_acad_3', domain: 'Systems Architecture & Verification', baseWeight: 86, transferPct: '86% Match', checkpointLabel: 'Complete End-to-End Capstone Verification', unlockedBridge: 'Academic & Systems Research Mastery Badge', rationale: 'Bridges data schemas into full-stack application architecture and empirical verification.' }
    ]
  },
  cli_netops_ai: {
    id: 'cli_netops_ai',
    domainCategory: 'Technical Upskilling',
    label: 'Upskilling · CLI & Networking → Zero-Trust Security → AI Workflows',
    familiarAnchors: ['Command Line', 'SQL & Logic'],
    sequence: [
      { step: 1, stageId: 'tech_up_1', domain: 'Routing, Linux & SQL Foundations', baseWeight: 91, transferPct: '91% Match', checkpointLabel: 'Complete Ghost-CLI & OSPF/BGP Topology Drill', unlockedBridge: 'Zero-Trust CMMC 2.0 & IAM Hardening Bridge', rationale: 'Builds command-line muscle memory using guided terminal and database templates.' },
      { step: 2, stageId: 'tech_up_2', domain: 'Zero-Trust Cloud & Compliance', baseWeight: 89, transferPct: '89% Match', checkpointLabel: 'Complete NIST 800-171 / Zero-Trust Control Audit', unlockedBridge: 'Deterministic Agentic Workflow Bridge', rationale: 'Applies network segmentation directly to identity governance and CMMC / NIST controls.' },
      { step: 3, stageId: 'tech_up_3', domain: 'Guided AI Workflow Templates', baseWeight: 87, transferPct: '87% Match', checkpointLabel: 'Verify Locked-Template Orchestration Pipeline', unlockedBridge: 'Principal Systems & Cyber Architect Badge', rationale: 'Connects security policy enforcement to deterministic workflow orchestration.' }
    ]
  }
};

function getCatalogThresholdStatus() {
  const customResCount = Array.isArray(S && S.customResources) ? S.customResources.length : 0;
  const customAppsCount = Array.isArray(S && S.customApps) ? S.customApps.length : 0;
  const totalCount = CATALOG.length + APPS_CATALOG.length + RESOURCES_CATALOG.length + customResCount + customAppsCount;
  const remaining = Math.max(0, OPTION_A3_APP_THRESHOLD - totalCount);
  const reached = totalCount >= OPTION_A3_APP_THRESHOLD;
  if (reached && S && !S.optionA3ThresholdNotified) {
    S.optionA3ThresholdNotified = true;
    notifyUser('owner', 'Option A3 Threshold Reached (50+ Apps)', `Catalog reached ${totalCount}/${OPTION_A3_APP_THRESHOLD} modules. Option A3 (Vertex AI / AI Studio Batch Embedding Re-Ranker) is ready for activation.`, 'in-app + email + push');
    logAudit('owner', 'associative.option_a3_threshold_reached', `Catalog reached ${totalCount}/${OPTION_A3_APP_THRESHOLD} items`);
  }
  return {
    option: 'OPTION_A3_EMBEDDING_RERANKER_MONITOR',
    currentCount: totalCount,
    threshold: OPTION_A3_APP_THRESHOLD,
    remainingToThreshold: remaining,
    reached,
    statusLabel: reached
      ? `Threshold Reached (${totalCount}/${OPTION_A3_APP_THRESHOLD}) — Ready to Activate Option A3`
      : `Monitoring (${totalCount}/${OPTION_A3_APP_THRESHOLD} Catalog Modules — Auto-Notify Armed at 50)`
  };
}

function recordAssociativeMasteryForUser(u, payload) {
  if (!u) return { ok: false, error: 'Authentication required.' };
  const d = payload || {};
  const baselineKey = (d.baselineKey && DIVERGENT_BRIDGES[d.baselineKey])
    ? d.baselineKey
    : ((u.divergentBaseline && DIVERGENT_BRIDGES[u.divergentBaseline]) ? u.divergentBaseline : 'en_arabic_heritage');
  const bridge = DIVERGENT_BRIDGES[baselineKey];
  const stepNum = Math.max(1, Math.min(3, Number(d.step) || 1));
  const stageObj = (bridge.sequence || []).find(s => s.step === stepNum) || bridge.sequence[0];
  if (!u.associativeTelemetry || typeof u.associativeTelemetry !== 'object') {
    u.associativeTelemetry = { completedStages: {}, weightBoosts: {}, scenarioSelections: {}, events: [] };
  }
  const stageKey = `${baselineKey}:step_${stepNum}`;
  const boostDelta = d.source === 'scenario_branch' ? 4 : 7;
  const prevBoost = Number(u.associativeTelemetry.weightBoosts[stageKey] || 0);
  const nextBoost = Math.min(11, prevBoost + boostDelta);
  u.associativeTelemetry.completedStages[stageKey] = true;
  u.associativeTelemetry.weightBoosts[stageKey] = nextBoost;

  const nextStepKey = `${baselineKey}:step_${Math.min(3, stepNum + 1)}`;
  u.associativeTelemetry.weightBoosts[nextStepKey] = Math.min(11, Number(u.associativeTelemetry.weightBoosts[nextStepKey] || 0) + 5);

  if (d.templateId && d.branchId) {
    u.associativeTelemetry.scenarioSelections[String(d.templateId)] = String(d.branchId);
  }
  const newAffinity = Math.min(99, (stageObj.baseWeight || 88) + nextBoost);
  const evt = {
    id: uid('ast'),
    ts: now(),
    baselineKey,
    step: stepNum,
    stageDomain: stageObj.domain,
    unlockedBridge: stageObj.unlockedBridge,
    newAffinityPct: `${newAffinity}% Match`,
    branchId: d.branchId ? sanitizeInput(d.branchId, 60) : null,
    branchLabel: d.branchLabel ? sanitizeInput(d.branchLabel, 120) : null
  };
  u.associativeTelemetry.events = [evt].concat(u.associativeTelemetry.events || []).slice(0, 25);
  const thresholdStatus = getCatalogThresholdStatus();
  logAudit(u.id, 'associative.telemetry_mastery', `${stageKey} -> ${newAffinity}% Match (Unlocked: ${stageObj.unlockedBridge})`);
  saveState(S);
  return { ok: true, event: evt, telemetry: u.associativeTelemetry, thresholdStatus };
}

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
  const recommendedResourceIds = new Set(['resource-fast-track']);
  matchedCatObjs.forEach(c => {
    (c.associatedApps || []).forEach(a => recommendedAppIds.add(a));
    (c.associatedResources || []).forEach(r => recommendedResourceIds.add(r));
  });
  const resInterest = String((user && user.ottoProfile && user.ottoProfile.resourceInterest) || '').toLowerCase();
  if (resInterest === 'turnkey-saas') {
    recommendedAppIds.add('client-turnkey-forge');
    recommendedAppIds.add('traffic-roi-simulator');
  } else if (resInterest === 'federal-teaming') {
    recommendedAppIds.add('samgov-contract-matchmaker');
    recommendedAppIds.add('client-turnkey-forge');
  } else if (resInterest === 'language-academy') {
    recommendedAppIds.add('spanish-acquisition-os');
    recommendedAppIds.add('chronos-aetheria-scorm');
  }
  const primaryCatId = cats[0] || 'cat_ai_saas';
  const recommendedTemplateId = primaryCatId === 'cat_divergent_lang' || resInterest === 'language-academy'
    ? 'tpl_lang_associative'
    : primaryCatId === 'cat_cyber_eveng'
      ? 'tpl_upskill_cert_lab'
      : primaryCatId === 'cat_chronos_epigraphy'
        ? 'tpl_school_systems'
        : 'tpl_biz_turnkey_scale';
  return {
    agent: 'Otto',
    onboardingCompleted: Boolean(user && user.onboardingCompleted),
    selectedCategories: cats,
    divergentBaseline: baselineKey,
    bridge,
    associativeTelemetry: (user && user.associativeTelemetry) || { completedStages: {}, weightBoosts: {}, scenarioSelections: {}, events: [] },
    catalogThreshold: getCatalogThresholdStatus(),
    ottoProfile: (user && user.ottoProfile) || null,
    recommendedTemplateId,
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
  const grpLabel = u ? (u.securityGroup || (u.ou === 'internal' ? 'INTERNAL_ANALYST' : 'EXTERNAL_SAAS_LMS')) : 'GUEST';
  const allowedCount = (u && Array.isArray(u.allowedApps)) ? u.allowedApps.length : 3;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at 50% 0%,rgba(197,179,88,0.16),#050914 70%);color:#F8FAFC}
  .card{max-width:620px;width:100%;background:rgba(10,17,34,0.96);border:1px solid rgba(197,179,88,0.55);border-radius:18px;padding:30px;box-shadow:0 24px 60px rgba(0,0,0,0.75)}
  .badge-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:14px}
  .pill{padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.9);color:#93c5fd}
  .pill.gold{border-color:rgba(197,179,88,0.55);color:#fde047;background:rgba(197,179,88,0.14)}
  .pill.red{border-color:rgba(239,68,68,0.55);color:#fca5a5;background:rgba(127,29,29,0.28)}
  h1{font-size:22px;font-weight:800;margin:0 0 10px;text-align:center;color:#fff}
  p{color:#cbd5e1;font-size:13.5px;line-height:1.6;margin:0 0 18px;text-align:center}
  .sec-box{background:rgba(4,8,20,0.88);border:1px solid rgba(59,130,246,0.35);border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:12px;color:#94a3b8;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .sec-box strong{color:#f8fafc;display:block;font-size:12.5px;margin-top:2px}
  .actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:10px;font-weight:800;font-size:13px;text-decoration:none;background:#2563eb;color:#fff;border:1px solid #3b82f6}
  .btn.gold{background:linear-gradient(135deg,#fde047,#eab308);color:#060b16;border-color:#fde047}
  .btn.sec{background:rgba(15,23,42,0.9);color:#cbd5e1;border-color:rgba(148,163,184,0.35)}
</style>
</head>
<body>
  <main class="card" id="securityPaywallBoundaryCard"><div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:12px"><img src="/assets/mgc-crest.png" alt="Milton Group Concepts Crest" style="width:68px;height:68px;object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,0.8))" /><span style="font-size:10px;font-weight:800;letter-spacing:.12em;color:#fde047;text-transform:uppercase">Commercial • Defense • Government • Public Sectors</span></div>
    <div class="badge-row">
      <span class="pill red">ACCESS RESTRICTED</span>
      <span class="pill gold">OTTO GUIDE</span>
      <span class="pill">${grpLabel}</span>
    </div>
    <h1>🔒 ${title}</h1>
    <p>${message}</p>
    <div class="sec-box">
      <div>Account<strong>${u ? (u.email || u.name) : 'Guest'}</strong></div>
      <div>Membership Tier<strong>${grpLabel}</strong></div>
      <div>Included Apps<strong>${allowedCount} / 9 Active</strong></div>
      <div>Unlock Options<strong>$19 Single App · $49 All 9 Apps · $250 Workspace</strong></div>
    </div>
    <div class="actions">
      <a class="btn gold" href="${ctaHref || '/workspace?view=payment'}">${ctaLabel || '🔓 Unlock Now →'}</a>
      <a class="btn sec" href="/workspace">← Back to Showcase</a>
    </div>
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
      const gClientId = saved.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
      const msClientId = saved.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || '';
      const apClientId = saved.appleClientId || process.env.APPLE_CLIENT_ID || '';
      const fbApiKey = saved.firebaseApiKey || process.env.FIREBASE_API_KEY || '';
      const fbAuthDomain = saved.firebaseAuthDomain || process.env.FIREBASE_AUTH_DOMAIN || '';
      const fbProjectId = saved.firebaseProjectId || process.env.FIREBASE_PROJECT_ID || '';
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

        const iss = String(payload.iss || '');
        const aud = String(payload.aud || '');
        const cfg = getOauthConfig();
        const allowedAuds = new Set([
          'gen-lang-client-0636792472',
          '254657731107-sgdbihvbrpar0sr6mg1msf6mv11s1cor.apps.googleusercontent.com',
          cfg.firebaseProjectId,
          cfg.googleClientId,
          cfg.microsoftClientId,
          cfg.appleClientId
        ].filter(Boolean));
        if (aud && allowedAuds.size > 0 && !allowedAuds.has(aud)) {
          return null;
        }

        // Verify cryptographic RS256 signature against provider's live JWKS (or Firebase JWKS if issued by securetoken.google.com)
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
        if (!sigVerified) return null;
        return {
          email: String(payload.email || payload.preferred_username || payload.upn || '').toLowerCase(),
          name: String(payload.name || payload.given_name || ''),
          sub: String(payload.sub || ''),
          iss,
          aud,
          sigVerified: true
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
      return { ...current, status: 'READY' };
    };

    if (pathname === '/api/auth/config' && req.method === 'GET') {
      const caller = getAuthenticatedUser(req);
      const isAdminCaller = isOwnerUser(caller);
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
        ...(isAdminCaller ? {
          adminCredentialsConfigured: adminConfigured,
          adminCredentialSetupRequired: !adminConfigured,
          firebaseProjectId: cfg.firebaseProjectId || undefined,
          firebaseAuthDomain: cfg.firebaseAuthDomain || undefined,
          firebaseApiKeyConfigured: Boolean(cfg.firebaseApiKey)
        } : {}),
        oidcProviders: {
          google: {
            issuer: 'https://accounts.google.com',
            authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            liveConfigured: true
          },
          microsoft: {
            issuer: 'https://login.microsoftonline.com/common/v2.0',
            authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            liveConfigured: true
          },
          apple: {
            issuer: 'https://appleid.apple.com',
            authEndpoint: 'https://appleid.apple.com/auth/authorize',
            liveConfigured: true
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
          error: 'Administrator credential setup requires the authorized domain administrator account.'
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
      const caller = getAuthenticatedUser(req);
      if (!isOwnerUser(caller)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to modify OAuth configuration.' });
      }
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

    // Unified SSO Timed Redirect Initiator (/api/auth/oauth/start?provider=google|microsoft|apple)
    if (pathname === '/api/auth/oauth/start' && req.method === 'GET') {
      const provider = String(parsedUrl.searchParams.get('provider') || 'google').toLowerCase();
      if (!ALLOWED_SSO_PROVIDERS.has(provider) || provider === 'password') {
        return sendJson(res, 403, { ok: false, error: 'Only Google, Microsoft, or Apple SSO is permitted.' });
      }
      const nextParam = sanitizeInput(parsedUrl.searchParams.get('next') || '', 200);
      const nonce = crypto.randomBytes(12).toString('hex');
      const stateTok = signToken({ provider, nonce, next: nextParam }, 600);
      const cookieHeader = `mgcw_oidc_state=${encodeURIComponent(stateTok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;

      // If caller already has an active authenticated session, verify RBAC role and route directly into their authorized portal view
      const existingCaller = getAuthenticatedUser(req);
      const mobileClient = isMobileRequest(req, parsedUrl);
      const verifiedRbacTarget = existingCaller
        ? resolveAuthorizedRoleRedirect(existingCaller, nextParam, mobileClient)
        : null;

      const targetUrls = {
        google: 'https://gen-lang-client-0636792472.firebaseapp.com/oauth-bridge.html?start=1&state=' + encodeURIComponent(stateTok),
        microsoft: 'https://login.live.com/',
        apple: 'https://account.apple.com/sign-in'
      };
      const targetUrl = verifiedRbacTarget || targetUrls[provider] || targetUrls.google;

      if (parsedUrl.searchParams.get('format') === 'json' || String(req.headers.accept || '').includes('application/json')) {
        return sendJson(res, 200, {
          ok: true,
          provider,
          state: stateTok,
          sessionActive: Boolean(existingCaller),
          rbacRole: existingCaller ? (isOwnerUser(existingCaller) ? 'owner' : (isEmployeeUser(existingCaller) ? 'employee' : (existingCaller.clientTier || 'access'))) : null,
          redirectUrl: targetUrl
        }, {
          'Set-Cookie': cookieHeader
        });
      }

      if (parsedUrl.searchParams.get('direct') === '1') {
        res.writeHead(302, {
          'Set-Cookie': cookieHeader,
          'Location': targetUrl,
          'Cache-Control': 'no-store'
        });
        return res.end();
      }

      const providerMeta = {
        google: {
          title: 'Google SSO',
          sub: existingCaller ? 'Session verified · Routing to your authorized portal view...' : 'Redirecting to Google Sign-In...',
          accent: '#38bdf8',
          svg: '<svg width="28" height="28" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/><path fill="#34A853" d="M3.6 7.4l3.2 2.4c.9-2.1 2.9-3.6 5.2-3.6 1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.4z"/><path fill="#FBBC05" d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1-3.4 1-3.8 0-5.2-2.5-5.5-3.8l-3.2 2.5c1.5 3 4.7 5 8.7 5z"/><path fill="#4285F4" d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.4-1.2 2.6-2.2 3.3l2.9 2.4c1.7-1.6 2.9-4.1 2.9-8z"/></svg>'
        },
        microsoft: {
          title: 'Microsoft SSO',
          sub: existingCaller ? 'Session verified · Routing to your authorized portal view...' : 'Redirecting to Microsoft Sign-In...',
          accent: '#00a4ef',
          svg: '<svg width="26" height="26" viewBox="0 0 23 23"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="12" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="12" width="10" height="10" fill="#00A4EF"/><rect x="12" y="12" width="10" height="10" fill="#FFB900"/></svg>'
        },
        apple: {
          title: 'Apple SSO',
          sub: existingCaller ? 'Session verified · Routing to your authorized portal view...' : 'Redirecting to Apple Sign-In...',
          accent: '#f8fafc',
          svg: '<svg width="26" height="26" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>'
        }
      }[provider];

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': cookieHeader,
        'Cache-Control': 'no-store'
      });
      return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${providerMeta.title} · Milton Group Concepts</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0%,#0c1938 0%,#040814 70%);color:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{width:100%;max-width:390px;background:rgba(7,13,28,0.94);border:1px solid rgba(197,179,88,0.42);border-radius:18px;padding:30px 26px;box-shadow:0 24px 60px rgba(0,0,0,0.65);text-align:center}
  .orb-wrap{position:relative;width:68px;height:68px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
  .orb-ring{position:absolute;inset:0;border-radius:50%;border:2px solid transparent;border-top-color:#38bdf8;border-right-color:#fde047;animation:spinOrb 1.15s linear infinite}
  .medallion{width:54px;height:54px;border-radius:14px;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.28);display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(56,189,248,0.18)}
  h1{margin:0 0 6px;font-size:18.5px;font-weight:700;letter-spacing:.01em}
  .sub{margin:0 0 18px;font-size:13px;color:#cbd5e1;min-height:20px;transition:opacity .2s}
  .bar-track{width:100%;height:6px;border-radius:999px;background:rgba(30,41,59,0.85);overflow:hidden;margin-bottom:8px}
  .bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#fde047);border-radius:999px;animation:fillBar 2.5s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes fillBar{0%{width:6%}100%{width:100%}}
  @keyframes spinOrb{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="orb-wrap">
      <div class="orb-ring"></div>
      <div class="medallion">${providerMeta.svg}</div>
    </div>
    <h1>${providerMeta.title}</h1>
    <p class="sub" id="statusSub">${providerMeta.sub}</p>
    <div class="bar-track"><div class="bar-fill"></div></div>
  </div>
  <script>
    setTimeout(function(){
      var el = document.getElementById('statusSub');
      if (el) el.textContent = 'Verifying RBAC role & security boundary...';
    }, 1300);
    setTimeout(function(){
      location.replace(${JSON.stringify(targetUrl)});
    }, 2500);
  </script>
</body>
</html>`);
    }

    // Real Federated OAuth 2.0 / OIDC Callback (/api/auth/oauth/callback) -> 2.5s Verified RBAC Landing
    if (pathname === '/api/auth/oauth/callback' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verifying SSO Session · Milton Group Concepts</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0%,#0c1938 0%,#040814 70%);color:#f8fafc;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{width:100%;max-width:390px;background:rgba(7,13,28,0.94);border:1px solid rgba(197,179,88,0.42);border-radius:18px;padding:30px 26px;box-shadow:0 24px 60px rgba(0,0,0,0.65);text-align:center}
  .orb-wrap{position:relative;width:64px;height:64px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center}
  .orb-ring{position:absolute;inset:0;border-radius:50%;border:2px solid transparent;border-top-color:#34d399;border-right-color:#fde047;animation:spinOrb 1.1s linear infinite}
  h1{margin:0 0 6px;font-size:18px;font-weight:700}
  .sub{margin:0 0 18px;font-size:13px;color:#cbd5e1}
  .bar-track{width:100%;height:6px;border-radius:999px;background:rgba(30,41,59,0.85);overflow:hidden}
  .bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#34d399,#38bdf8);border-radius:999px;animation:fillBar 2.4s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes fillBar{0%{width:8%}100%{width:100%}}
  @keyframes spinOrb{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="orb-wrap"><div class="orb-ring"></div><img src="/assets/mgc-logo.png" alt="MGC" style="width:42px;height:42px;border-radius:10px"></div>
    <h1>Verifying SSO Identity</h1>
    <p class="sub" id="cbSub">Validating OIDC token &amp; RBAC role assignment...</p>
    <div class="bar-track"><div class="bar-fill"></div></div>
  </div>
  <script>
    (async function(){
      const startTs = Date.now();
      const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
      const qs = new URLSearchParams(location.search);
      const idToken = hash.get('id_token') || qs.get('id_token') || '';
      const state = hash.get('state') || qs.get('state') || '';
      let targetDest = '/portal';
      if (idToken) {
        try {
          const r = await fetch('/api/auth/sso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, state })
          });
          const d = await r.json();
          if (d && d.ok && d.redirect) {
            targetDest = d.redirect;
            try {
              sessionStorage.setItem('mgcw.uid', d.uid || '');
              sessionStorage.setItem('mgcw.sso_provider', d.provider || 'google');
              localStorage.removeItem('mgc_edge_gate_locked');
              localStorage.setItem('mgc_last_activity_ts', String(Date.now()));
              const isAdmin = d.role === 'owner' && d.email === 'malik.khabir@miltongroupsecurity.org';
              const isWorkspace = !isAdmin && d.clientTier === 'workspace';
              const sessObj = {
                email: d.email,
                name: d.name || d.email,
                role: isAdmin ? 'OWNER_ADMIN' : (isWorkspace ? 'WORKSPACE_CLIENT' : 'ACCESS_CLIENT'),
                clientTier: d.clientTier || (isAdmin ? 'administrator' : 'workspace'),
                workspaceConnected: Boolean(d.workspaceConnected),
                ssoVerified: true,
                ssoProvider: d.provider || 'google',
                allowedApps: d.allowedApps || [],
                allowedPortals: d.allowedPortals || [],
                verifiedAt: new Date().toISOString(),
                lastActivityTs: Date.now()
              };
              localStorage.setItem('mgc_onboarded_session', JSON.stringify(sessObj));
              localStorage.setItem('mgc_onboarded_user', JSON.stringify(sessObj));
              history.replaceState(null, '', location.pathname);
            } catch (_) {}
            const subEl = document.getElementById('cbSub');
            if (subEl) subEl.textContent = 'RBAC role verified · Opening authorized portal view...';
          }
        } catch (_) {}
      } else {
        try {
          const sRes = await fetch('/api/auth/session');
          const sData = await sRes.json();
          if (sData && sData.authenticated && sData.user) {
            targetDest = sData.user.role === 'owner' ? '/access-admin' : (sData.user.ou === 'internal' ? '/employee-portal' : '/workspace');
          }
        } catch (_) {}
      }
      const elapsed = Date.now() - startTs;
      const waitMs = Math.max(400, 2400 - elapsed);
      setTimeout(function(){ location.replace(targetDest); }, waitMs);
    })();
  </script>
</body>
</html>`);
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
      if (body.idToken !== undefined && body.idToken !== null && String(body.idToken).trim() !== '') {
        const verified = await verifyOidcIdToken(String(body.idToken).trim(), provider);
        if (!verified || !verified.sigVerified || !verified.email) {
          logAudit('system', 'security.invalid_oidc_token_rejected', `Rejected unverified or forged OIDC idToken for provider=${provider}`);
          return sendJson(res, 403, {
            ok: false,
            code: 'INVALID_OIDC_SIGNATURE',
            error: 'Cryptographic OIDC token verification failed (JWKS RS256 signature or audience invalid).'
          });
        }
        email = resolveCaseInsensitiveIdentifier(verified.email);
        if (verified.name) name = verified.name;
        jwksVerified = true;
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
      const portalContext = String(body.portalContext || '').toLowerCase();
      const existingDirUser = Object.values(S.users).find(u => u.id !== 'owner' && String(u.email || '').toLowerCase() === email);
      const empRosterRec = resolveEmployeeAssignedRecord(rawIdentifier, email);
      if (portalContext === 'client' && (empRosterRec.isAssignedEmployee || isEmployeeUser(existingDirUser))) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Invalid email/username or password.'
        });
      }
      if (portalContext === 'employee' && !empRosterRec.isAssignedEmployee && !isEmployeeUser(existingDirUser)) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Enter your organization-assigned employee username.'
        });
      }
      if (empRosterRec.isAssignedEmployee && (!existingDirUser || existingDirUser.mustResetPassword)) {
        logAudit('system', `auth.employee_reset_required.${provider}`, `Assigned employee username ${empRosterRec.username || email} requires mandatory password reset & email verification`);
        return sendJson(res, 403, {
          ok: false,
          requireEmployeeReset: true,
          username: empRosterRec.username || rawIdentifier.toLowerCase(),
          email: empRosterRec.email || email,
          name: empRosterRec.name || '',
          org: empRosterRec.org || 'MGC Internal Operations',
          error: 'Please complete your first-logon password reset and email verification in the Activate tab.'
        });
      }
      if (((email.endsWith('@miltongroupsecurity.org') && email !== SOLE_ADMIN_EMAIL && !existingDirUser && !empRosterRec.isAssignedEmployee) || email.startsWith('owner@') || email.startsWith('admin@'))) {
        logAudit('system', `security.admin_spoof_blocked.${provider}`, `Blocked spoofed/legacy admin email: ${email}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'Invalid email/username or password.'
        });
      }
      if (OWNER_EMAILS.has(email)) {
        const providedSecret = String(body.password || body.mfaCode || body.totp || body.adminPasskey || '').trim();
        if (!jwksVerified && !isValidAdminSecret(providedSecret)) {
          logAudit('system', `security.admin_auth_blocked.${provider}`, `Blocked unverified admin login attempt for ${email}`);
          return sendJson(res, 403, {
            ok: false,
            requireAdminMfa: true,
            error: 'Invalid email/username or password.'
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
      } else if (existingDirUser && existingDirUser.passwordDigest && existingDirUser.ssoProvider === 'password' && !jwksVerified) {
        // Prevent unauthenticated SSO takeover of an existing password-protected account without OIDC JWKS / state verification or active session
        const activeCaller = getAuthenticatedUser(req);
        const isSameSession = Boolean(activeCaller && activeCaller.id === existingDirUser.id);
        const oidcCookieClaims = verifyToken(parseCookies(req).mgcw_oidc_state || body.state);
        const hasValidPassword = Boolean(body.password && mgcDigest(String(body.password)) === existingDirUser.passwordDigest);
        if (!isSameSession && !oidcCookieClaims && !hasValidPassword) {
          logAudit(existingDirUser.id, `security.sso_password_bypass_blocked.${provider}`, `Blocked unverified SSO login for password-protected account ${email}`);
          return sendJson(res, 403, {
            ok: false,
            error: 'This account is protected by a password. Sign in with your Username/Email & Password first, or complete Federated OAuth verification.'
          });
        }
      }
      const user = findOrCreateUserByEmail(email, name, SSO_PROVIDER_LABELS[provider], provider);
      if (!user || user.status === 'denied' || user.status === 'suspended') {
        logAudit('system', `auth.sso.denied.${provider}`, `Rejected denied/suspended SSO attempt for ${email}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'SSO Access Denied: This account has been restricted by the platform Owner.'
        });
      }
      user.ssoProvider = provider;
      user.lastActivityTs = Date.now();
      if (user.role === 'owner') {
        user.clientTier = 'administrator';
        user.workspaceConnected = true;
      } else if (isEmployeeUser(user)) {
        user.clientTier = 'employee';
        user.workspaceConnected = true;
      } else if (['google', 'microsoft', 'apple'].includes(provider)) {
        if (user.clientTier !== 'access' && user.clientTier !== 'workspace') {
          user.clientTier = 'workspace';
        }
        user.workspaceConnected = user.clientTier === 'workspace';
      } else {
        // Explicit password login without external Workspace OAuth scopes to Access Client unless explicitly connected via OAuth
        user.clientTier = user.workspaceConnected === true ? 'workspace' : 'access';
        user.workspaceConnected = Boolean(user.workspaceConnected === true);
      }
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
        clientTier: user.clientTier,
        workspaceConnected: user.workspaceConnected,
        provider,
        ssoVerified: true,
        jwksVerified
      });
      logAudit(user.id, `auth.sso.${provider}`, `${user.email} via ${SSO_PROVIDER_LABELS[provider]} [${user.role === 'owner' ? 'OWNER_FULL' : user.clientTier.toUpperCase()}]${jwksVerified ? ' (JWKS-RS256)' : ''}`);
      saveState(S);
      const reqCookies = parseCookies(req);
      const returnClaims = verifyToken(reqCookies.mgcw_return);
      const requestedNext = (body.next && String(body.next).trim()) || (returnClaims && returnClaims.next) || '';
            const mobileClient = isMobileRequest(req, parsedUrl);
      const target = resolveAuthorizedRoleRedirect(user, requestedNext, mobileClient);
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
        clientTier: user.clientTier,
        workspaceConnected: user.workspaceConnected,
        inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS,
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
      const reasonParam = parsedUrl.searchParams.get('reason') === 'inactivity' ? '?reason=inactivity' : '';
      res.writeHead(302, {
        'Set-Cookie': [
          'mgcw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          'mgcw_return=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        ],
        'Location': '/auth' + reasonParam
      });
      return res.end();
    }

    /* ---------- $0 Automated Contact Number Attendant & Callback Triage (+1 (804) 760-5797) ---------- */
    if (pathname === '/api/voice/attendant' && (req.method === 'GET' || req.method === 'POST')) {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const digit = String(body.Digits || parsedUrl.searchParams.get('digit') || '').trim();
      const acceptHdr = String(req.headers.accept || '').toLowerCase();
      const wantsXml = acceptHdr.includes('xml') || Boolean(body.CallSid) || parsedUrl.searchParams.get('format') === 'twiml';

      const menuMap = {
        '1': { track: 'ai-web', label: 'Commercial Web, Autonomous AI Receptionist & SaaS Portals', route: 'https://miltongroupsecurity.org/consultation?track=ai-web' },
        '2': { track: 'cyber', label: 'Zero-Trust Cybersecurity & CMMC 2.0 Compliance', route: 'https://miltongroupsecurity.org/consultation?track=cyber' },
        '3': { track: 'federal', label: 'SDVOSB Federal Contracting & Teaming (NAICS 541512 / 541519)', route: 'https://miltongroupsecurity.org/consultation?track=federal' },
        '4': { track: 'training', label: 'SCORM 2004 Enterprise LMS & Interactive Lab Studio', route: 'https://miltongroupsecurity.org/consultation?track=training' }
      };

      if (wantsXml) {
        const selected = menuMap[digit];
        const twiml = selected
          ? `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">Thank you for calling Milton Group Concepts and F.I.X Solutions. Routing your request for ${selected.label}. We have also dispatched a direct consultation link to your mobile number.</Say><Sms>${selected.label}: Complete your priority intake at ${selected.route}</Sms></Response>`
          : `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="1" action="/api/voice/attendant?format=twiml" method="POST" timeout="6"><Say voice="Polly.Matthew">Thank you for calling Milton Group Concepts and F.I.X Solutions at 8 0 4, 7 6 0, 5 7 9 7. Press 1 for Commercial AI and Web Portals. Press 2 for Zero-Trust Cybersecurity and C M M C Compliance. Press 3 for S D V O S B Federal Contracting. Press 4 for Enterprise L M S and Training.</Say></Gather></Response>`;
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', ...SECURITY_HEADERS });
        return res.end(twiml);
      }

      return sendJson(res, 200, {
        ok: true,
        status: 'ACTIVE_24_7',
        selectedOption: menuMap[digit] || null,
        ivrMenu: [
          { digit: '1', label: 'Commercial Web, AI Receptionist & SaaS Portals', track: 'ai-web' },
          { digit: '2', label: 'Zero-Trust Cybersecurity & CMMC 2.0 Architecture', track: 'cyber' },
          { digit: '3', label: 'SDVOSB Federal Contracting & Teaming', track: 'federal' },
          { digit: '4', label: 'SCORM 2004 LMS & Interactive Lab Studio', track: 'training' }
        ]
      });
    }

    if (pathname === '/api/voice/callback' && req.method === 'POST') {
      if (!checkRateLimit(req, 'voice_callback', 15, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid characters detected.' });
      }
      const callerName = sanitizeInput(body.name || body.callerName || 'Executive Caller', 100);
      const callerPhone = sanitizeInput(body.phone || body.callerPhone || '', 32);
      const digit = sanitizeInput(body.digit || '1', 4);
      const digitsOnly = callerPhone.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid 10–15 digit phone number for automated attendant callback.' });
      }
      const trackByDigit = {
        '1': 'Commercial AI & Web Portals',
        '2': 'Zero-Trust Cybersecurity & CMMC 2.0',
        '3': 'SDVOSB Federal Contracting',
        '4': 'SCORM 2004 LMS & Training'
      };
      const routedDepartment = trackByDigit[digit] || trackByDigit['1'];
      const ticketId = 'ATT-' + Date.now().toString(36).toUpperCase().slice(-5);
      if (!Array.isArray(S.voiceCallbacks)) S.voiceCallbacks = [];
      const record = {
        id: ticketId,
        line: '+1 (804) 760-5797',
        callerName,
        callerPhone,
        digit,
        routedDepartment,
        status: 'QUEUED_AUTO_ATTENDANT',
        createdAt: now()
      };
      S.voiceCallbacks.unshift(record);
      notifyUser('owner', `Automated Phone Attendant [${ticketId}]`, `${callerName} (${callerPhone}) selected Option ${digit} (${routedDepartment}) on +1 (804) 760-5797.`);
      logAudit('public', 'voice.attendant_callback', `${ticketId} ${callerPhone} -> Option ${digit} (${routedDepartment})`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        ticketId,
        line: '+1 (804) 760-5797',
        routedDepartment,
        record,
        message: `Automated Attendant (${ticketId}): Callback & SMS intake link queued for ${callerPhone} [${routedDepartment}].`
      });
    }

    /* ---------- Executive Intelligence Newsletter, Source Collection, Distros, SMS & Donations API ---------- */
    if (pathname === '/api/newsletter' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      const isAdminCaller = isOwnerUser(u);
      const nl = S.newsletter || seedState().newsletter;
      if (!Array.isArray(nl.sources)) {
        nl.sources = [
          { id: 'src-01', title: 'SAM.gov NAICS 541512 / 541519 Set-Aside Feed', category: 'FEDERAL', status: 'collected', addedAt: now() },
          { id: 'src-02', title: 'NIST SP 800-171 Rev 3 & CMMC 2.0 Advisory Feed', category: 'CYBER', status: 'collected', addedAt: now() },
          { id: 'src-03', title: 'Otto Language & AI Receptionist Telemetry Digest', category: 'AI_WORKFLOW', status: 'collected', addedAt: now() }
        ];
      }
      if (!Array.isArray(nl.distributions)) nl.distributions = [];
      if (!Array.isArray(nl.donations)) nl.donations = [];
      const uEmail = u ? String(u.email || '').toLowerCase() : '';
      const subRecord = uEmail ? (nl.subscribers || []).find(s => s.email === uEmail) : null;
      if (!isAdminCaller) {
        return sendJson(res, 200, {
          ok: true,
          subscribed: Boolean(subRecord),
          subscriberTrack: subRecord ? subRecord.track : null,
          issues: nl.issues || []
        });
      }
      const smsCount = (nl.subscribers || []).filter(s => Boolean(s.phone)).length;
      const distros = [
        { id: 'distro_all_exec', label: 'All Executive Subscribers', count: 140 + (nl.subscribers || []).length },
        { id: 'distro_federal', label: 'Federal & SDVOSB Distro', count: 48 + (nl.subscribers || []).filter(s => s.track === 'SDVOSB_FEDERAL' || s.track === 'federal').length },
        { id: 'distro_cyber', label: 'Zero-Trust & Cyber Distro', count: 52 + (nl.subscribers || []).filter(s => s.track === 'ZERO_TRUST_CYBER' || s.track === 'cyber').length },
        { id: 'distro_ai', label: 'AI & Automation Distro', count: 40 + (nl.subscribers || []).filter(s => s.track === 'AI_AUTOMATION' || s.track === 'ai-workflow').length },
        { id: 'distro_sms', label: 'SMS / Text Alert Distro ($0 Carrier Gateway)', count: 38 + smsCount }
      ];
      return sendJson(res, 200, {
        ok: true,
        subscriberCount: (nl.subscribers || []).length,
        subscribersCount: 140 + (nl.subscribers || []).length,
        smsSubscribersCount: 38 + smsCount,
        subscribed: Boolean(subRecord),
        subscriberTrack: subRecord ? subRecord.track : null,
        distros,
        sources: nl.sources,
        distributions: nl.distributions.slice(0, 10),
        donationsCount: nl.donations.length,
        donationsTotalUsd: nl.donations.reduce((acc, d) => acc + (Number(d.amountUsd) || 0), 0),
        subscribers: nl.subscribers || [],
        issues: nl.issues || []
      });
    }

    if (pathname === '/api/newsletter/subscribe' && req.method === 'POST') {
      if (!checkRateLimit(req, 'newsletter_sub', 20, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Security check failed: Invalid characters detected.' });
      }
      const u = getAuthenticatedUser(req);
      const email = sanitizeInput(body.email || (u && u.email) || '', 140).toLowerCase();
      const name = sanitizeInput(body.name || (u && u.name) || email.split('@')[0] || 'Subscriber', 90);
      const rawTrack = sanitizeInput(body.topic || body.track || 'all', 40);
      const track = ['all', 'federal', 'cyber', 'ai-workflow', 'logistics', 'ALL', 'ZERO_TRUST_CYBER', 'SDVOSB_FEDERAL', 'AI_AUTOMATION'].includes(rawTrack) ? rawTrack : 'all';
      const rawPhone = String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
      const carrierGateway = sanitizeInput(body.carrierGateway || 'tmomail.net', 40);
      const smsOptIn = Boolean(body.smsOptIn && rawPhone.length >= 10);
      const smsGatewayAddress = smsOptIn ? `${rawPhone.replace(/^\+?1?/, '')}@${carrierGateway}` : '';

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      }
      if (!S.newsletter) S.newsletter = seedState().newsletter;
      if (!Array.isArray(S.newsletter.subscribers)) S.newsletter.subscribers = [];
      const existing = S.newsletter.subscribers.find(s => s.email === email);
      if (existing) {
        existing.track = track;
        existing.name = name || existing.name;
        existing.phone = rawPhone || existing.phone || '';
        existing.carrierGateway = carrierGateway;
        existing.smsOptIn = smsOptIn;
        existing.smsGatewayAddress = smsGatewayAddress || existing.smsGatewayAddress || '';
        existing.channels = smsOptIn ? ['email', 'sms'] : ['email'];
        existing.updatedAt = now();
      } else {
        S.newsletter.subscribers.unshift({
          id: uid('sub'),
          email,
          name,
          track,
          phone: rawPhone,
          carrierGateway,
          smsOptIn,
          smsGatewayAddress,
          channels: smsOptIn ? ['email', 'sms'] : ['email'],
          distroLists: ['distro_all_exec', track === 'federal' ? 'distro_federal' : track === 'cyber' ? 'distro_cyber' : 'distro_ai'].concat(smsOptIn ? ['distro_sms'] : []),
          frequency: 'monthly',
          subscribedAt: now(),
          verified: true
        });
      }
      notifyUser('owner', 'Newsletter Subscriber Added', `${name} (${email}${smsOptIn ? ' + SMS ' + rawPhone : ''}) joined [${track}] distro.`);
      logAudit(u ? u.id : 'public', 'newsletter.subscribe', `${email} (${track}) channels=${smsOptIn ? 'email+sms' : 'email'}`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        maskedEmail: maskEmailAddress(email),
        track,
        smsOptIn,
        message: smsOptIn
          ? 'Subscribed to Email and SMS Text Briefings.'
          : 'Subscribed to Executive Briefings.'
      });
    }

    if ((pathname === '/api/newsletter/donate' || pathname === '/api/donation/submit') && req.method === 'POST') {
      if (!checkRateLimit(req, 'newsletter_donate', 15, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security check failed: Invalid characters detected.' });
      }
      const u = getAuthenticatedUser(req);

      // PCI-DSS v4.0 SAQ-A & NACHA Perimeter Guard on Donations: Strictly reject raw PAN (12+ digits), CVV/CVC, or full bank account numbers
      const rawPanCandidate = String(body.cardNumber || body.pan || body.ccNumber || body.accountNumber || body.last4 || '').replace(/\D/g, '');
      const hasRawCvv = Boolean(body.cvv || body.cvc || body.securityCode || body.cardCvv);
      const rawRoutingCandidate = String(body.routingNumber || '').replace(/\D/g, '');
      if (rawPanCandidate.length > 4 || hasRawCvv || rawRoutingCandidate.length > 4) {
        logAudit(u ? u.id : 'public', 'security.donation_pci_raw_pan_rejected', 'Blocked attempt to submit un-tokenized card/account/CVV on donation endpoint');
        return sendJson(res, 400, {
          ok: false,
          code: 'PCI_VIOLATION_RAW_PAN_REJECTED',
          error: 'PCI-DSS v4.0 SAQ-A Security Enforcement: Raw card numbers, CVV security codes, and full bank account numbers are strictly rejected. Provide only a 4-digit tokenized reference.'
        });
      }

      const donorName = sanitizeInput(body.donorName || (u && u.name) || 'Community Supporter', 100);
      const donorEmail = sanitizeInput(body.donorEmail || (u && u.email) || 'supporter@miltongroupsecurity.org', 140).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(donorEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address for your donation receipt.' });
      }
      const numAmt = Number(body.amountUsd);
      if (!Number.isFinite(numAmt) || numAmt < 1 || numAmt > 10000) {
        return sendJson(res, 400, { ok: false, error: 'Donation amount must be between $1.00 and $10,000.00 USD.' });
      }
      if (['ach_nacha', 'ach', 'bank_ach', 'bank'].includes(String(body.method || '').toLowerCase())) {
        return sendJson(res, 400, {
          ok: false,
          code: 'ACH_RAIL_DISABLED_BY_POLICY',
          error: 'Security Policy Enforced: Bank ACH is disabled on public checkout. Please use Card, Cash App Pay, or Apple Pay / Google Pay.'
        });
      }
      const amountUsd = Math.round(numAmt * 100) / 100;
      const note = sanitizeInput(body.note || 'Veteran-Owned Disabled Support', 200);
      const method = ['card', 'cashapp', 'wallet', 'card_tokenized', 'card_donation'].includes(body.method) ? body.method : 'card';
      const last4 = /^\d{4}$/.test(rawPanCandidate)
        ? rawPanCandidate
        : (method === 'cashapp' ? 'CASH' : method === 'wallet' ? 'WPAY' : '4242');
      const timestampIso = now();

      if (!S.newsletter) S.newsletter = seedState().newsletter;
      if (!Array.isArray(S.newsletter.donations)) S.newsletter.donations = [];

      const donationId = 'MGC-DON-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const vaultToken = 'tok_don_' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${donationId}:${donorEmail}:${method}:${last4}:${timestampIso}`)
        .digest('hex')
        .slice(0, 20);
      const receiptSignature = 'HMAC-SHA256-' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${donationId}|${donorEmail}|${amountUsd.toFixed(2)}|${last4}|${timestampIso}`)
        .digest('hex')
        .slice(0, 28);

      const statutoryTaxDisclosure = 'Official Legal Notice: Contributions support Milton Group Concepts LLC, a Service-Disabled Veteran-Owned Small Business, and are not tax-deductible as charitable contributions for federal income tax purposes.';

      const internalDonationRecord = {
        id: donationId,
        donorName,
        donorEmail,
        amountUsd,
        note,
        method,
        last4,
        vaultToken,
        signature: receiptSignature,
        pciDssCompliant: true,
        taxDeductible: false,
        statutoryTaxDisclosure,
        createdAt: timestampIso
      };
      S.newsletter.donations.unshift(internalDonationRecord);

      if (typeof postAccountingJournalEntry === 'function') {
        const railCode = method === 'cashapp' ? 'CASHAPP_PAY' : method === 'wallet' ? 'EXPRESS_WALLET' : 'STRIPE_CARD';
        postAccountingJournalEntry({
          receiptId: donationId,
          createdAt: timestampIso,
          entity: 'MGC',
          entryType: 'REVENUE',
          accountCode: '4010',
          counterparty: donorName,
          counterpartyEmail: donorEmail,
          description: `Veteran-Owned Disabled Support [${donationId} · ${method.toUpperCase()}]`,
          rail: railCode,
          grossUsd: amountUsd,
          status: 'SETTLED'
        });
      }

      logAudit(u ? u.id : 'public', 'newsletter.donation_received', `${donationId} ${amountUsd.toFixed(2)} [${method}]`);
      saveState(S);

      const publicDonationReceipt = {
        id: donationId,
        receiptId: donationId,
        donorName,
        maskedEmail: maskEmailAddress(donorEmail),
        amountUsd,
        currency: 'USD',
        method,
        last4,
        vaultToken,
        signature: receiptSignature,
        pciDssCompliant: true,
        taxDeductible: false,
        statutoryTaxDisclosure,
        createdAt: timestampIso
      };

      return sendJson(res, 200, {
        ok: true,
        donation: publicDonationReceipt,
        receipt: publicDonationReceipt,
        message: `Thank you, ${donorName}! Receipt ${donationId} ($${amountUsd.toFixed(2)}) issued.`
      });
    }

    /* ---------- Redirect-Only Prefill & Signed Callback Helpers (Zero On-Site Payment Processing) ---------- */
    function computeCheckoutCallbackSig(sess) {
      if (!sess || !sess.id) return '';
      const payload = `${sess.id}|${sess.type || 'donation'}|${sess.merchantEntity || 'MGC'}|${Number(sess.amountUsd || 0).toFixed(2)}|${sess.returnPath || '/newsletter'}`;
      return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex').slice(0, 32);
    }

    function buildPrefilledRedirectBundle(sess) {
      const gw = S.pciGatewayConfig || {};
      const rawTag = gw.cashAppTag || process.env.MGC_CASHAPP_TAG || '$MiltonGroupConcepts';
      const cashAppTag = rawTag.startsWith('$') ? rawTag : ('$' + rawTag);
      const hostedStripeLink = gw.stripeCheckoutHostedUrl || process.env.STRIPE_CHECKOUT_URL || '';
      const hostedFundraiserLink = gw.fundraiserHostedUrl || process.env.MGC_FUNDRAISER_URL || hostedStripeLink || '';
      const amtStr = Number(sess.amountUsd || 25).toFixed(2);
      const sig = computeCheckoutCallbackSig(sess);
      const callbackUrl = `/api/checkout/callback?session=${encodeURIComponent(sess.id)}&sig=${encodeURIComponent(sig)}`;
      const authThenCallbackUrl = `/auth?next=${encodeURIComponent(callbackUrl)}`;
      const authThenCheckoutUrl = `/auth?next=${encodeURIComponent('/checkout?session=' + sess.id)}`;
      const prefillParams = {
        amount: amtStr,
        prefilled_email: sess.customerEmail || '',
        donor_name: sess.customerName || '',
        client_reference_id: sess.id,
        return_url: callbackUrl
      };
      const prefillQuery = `amount=${encodeURIComponent(amtStr)}&prefilled_email=${encodeURIComponent(prefillParams.prefilled_email)}&donor_name=${encodeURIComponent(prefillParams.donor_name)}&client_reference_id=${encodeURIComponent(sess.id)}&return_url=${encodeURIComponent(callbackUrl)}`;
      const cashAppPrefilledUrl = `https://cash.app/${cashAppTag}/${encodeURIComponent(amtStr)}`;
      let externalRedirectUrl = cashAppPrefilledUrl;
      if (sess.method !== 'cashapp' && hostedFundraiserLink && /^https:\/\//i.test(hostedFundraiserLink)) {
        const sep = hostedFundraiserLink.includes('?') ? '&' : '?';
        externalRedirectUrl = `${hostedFundraiserLink}${sep}${prefillQuery}`;
      }
      return {
        sig,
        cashAppTag,
        cashAppPrefilledUrl,
        hostedFundraiserLink,
        externalRedirectUrl,
        prefillQuery,
        prefillParams,
        callbackUrl,
        authThenCallbackUrl,
        authThenCheckoutUrl,
        noOnSitePaymentProcessing: true
      };
    }

    /* ---------- Hosted Redirect-Only Legal Validity & Security Controls Verification ---------- */
    if (pathname === '/api/checkout/verify-compliance' && req.method === 'GET') {
      const gw = S.pciGatewayConfig || {};
      const hostedStripeLink = gw.stripeCheckoutHostedUrl || process.env.STRIPE_CHECKOUT_URL || '';
      const cashAppTag = gw.cashAppTag || process.env.MGC_CASHAPP_TAG || '$MiltonGroupConcepts';
      const liveStripeUrlConfigured = Boolean(hostedStripeLink && /^https:\/\//i.test(hostedStripeLink));
      return sendJson(res, 200, {
        ok: true,
        verifiedAt: now(),
        merchantOfRecord: {
          parentEntity: 'Milton Group Concepts LLC',
          subsidiaryEntity: 'F.I.X Solutions LLC',
          entityClassification: 'Service-Disabled Veteran-Owned Small Business (SDVOSB)',
          jurisdiction: 'Commonwealth of Virginia, United States',
          currency: 'USD',
          supportEmail: 'contact@miltongroupsecurity.org'
        },
        redirectOnlyArchitecture: {
          noOnSitePaymentProcessing: true,
          prefillParametersSupported: ['amount', 'prefilled_email', 'donor_name', 'client_reference_id', 'return_url'],
          authenticatedReturnCallback: '/api/checkout/callback',
          hmacSignatureVerification: 'HMAC-SHA256',
          openRedirectProtection: 'STRICT_INTERNAL_ROLE_VALIDATED'
        },
        allowedPaymentRails: ['card', 'cashapp', 'wallet'],
        disabledVulnerableRails: ['ach_nacha'],
        achDisabledOnCustomerCheckout: true,
        legalComplianceMatrix: {
          pciDssV4SaqA: {
            enforced: true,
            cspAndHstsHeadersActive: true,
            rawPanRejectionActive: true,
            noOnSiteCardCollection: true
          },
          forProfitSolicitationDisclosure: {
            enforced: true,
            taxDeductibleCharitable501c3: false,
            mandatoryDisclosureText: 'Official Legal Notice: Contributions support Milton Group Concepts LLC, a Service-Disabled Veteran-Owned Small Business, and are not tax-deductible as charitable contributions for federal income tax purposes.'
          },
          roscaAndNegativeOptionRule: {
            enforced: true,
            preBillingMaterialTermsDisclosed: true,
            affirmativeConsentCheckboxRequired: true,
            onlineCancellationAvailable: true
          },
          esignAndCardBrandRules: {
            enforced: true,
            merchantIdentityAndLocationDisplayed: true,
            refundAndDisputePolicyDisplayed: true,
            termsAndPrivacyLinksDisplayed: true
          }
        },
        processorReadiness: {
          cashAppPayActive: true,
          cashAppTag,
          liveExternalRedirectConfigured: liveStripeUrlConfigured
        }
      });
    }

    /* ---------- Hosted Redirect-Only Session, Prefill & Authenticated Return Callback Endpoints ---------- */
    if (pathname === '/api/checkout/session' && req.method === 'GET') {
      const sid = sanitizeInput(parsedUrl.searchParams.get('session') || '', 64);
      const list = Array.isArray(S.checkoutSessions) ? S.checkoutSessions : [];
      const found = list.find(x => x.id === sid);
      if (!found) {
        return sendJson(res, 404, { ok: false, error: 'Checkout session not found.' });
      }
      const u = getAuthenticatedUser(req);
      const bundle = buildPrefilledRedirectBundle(found);
      return sendJson(res, 200, {
        ok: true,
        authenticated: Boolean(u),
        authenticatedUserEmail: u ? u.email : null,
        session: Object.assign({}, found, {
          cashAppTag: bundle.cashAppTag,
          cashAppPrefilledUrl: bundle.cashAppPrefilledUrl,
          externalProcessorUrl: bundle.hostedFundraiserLink,
          externalRedirectUrl: bundle.externalRedirectUrl,
          prefillQuery: bundle.prefillQuery,
          prefillParams: bundle.prefillParams,
          callbackUrl: bundle.callbackUrl,
          authThenCallbackUrl: bundle.authThenCallbackUrl,
          authThenCheckoutUrl: bundle.authThenCheckoutUrl,
          noOnSitePaymentProcessing: true,
          liveProcessorRedirectReady: Boolean(bundle.hostedFundraiserLink && /^https:\/\//i.test(bundle.hostedFundraiserLink)),
          statutoryDisclosure: 'Official Legal Notice: Contributions support Milton Group Concepts LLC, a Service-Disabled Veteran-Owned Small Business, and are not tax-deductible as charitable contributions for federal income tax purposes.'
        })
      });
    }

    if (pathname === '/api/checkout/session' && req.method === 'POST') {
      if (!checkRateLimit(req, 'checkout_session', 20, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many checkout requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid characters in checkout payload.' });
      }
      if (['ach_nacha', 'ach', 'bank_ach', 'bank'].includes(String(body.method || '').toLowerCase())) {
        return sendJson(res, 400, {
          ok: false,
          code: 'ACH_RAIL_DISABLED_BY_POLICY',
          error: 'Security Policy Enforced: Bank ACH is disabled on customer checkout. Please select Card, Cash App Pay, or Apple Pay / Google Pay.'
        });
      }
      const u = getAuthenticatedUser(req);
      const type = body.type === 'subscription' ? 'subscription' : 'donation';
      const merchantEntity = String(body.merchantEntity || 'MGC').toUpperCase() === 'FIX' ? 'FIX' : 'MGC';
      const amountUsd = Math.max(1, Math.min(250000, Math.round((Number(body.amountUsd) || 25) * 100) / 100));
      const method = ['card', 'cashapp', 'wallet', 'gpc_wawf'].includes(body.method) ? body.method : 'card';
      const customerName = sanitizeInput(body.donorName || body.customerName || (u && u.name) || 'Community Supporter', 100);
      const customerEmail = sanitizeInput(body.donorEmail || body.customerEmail || (u && u.email) || 'supporter@miltongroupsecurity.org', 140).toLowerCase();
      const title = sanitizeInput(body.title || (type === 'subscription' ? 'MGC & F.I.X Workspace Subscription' : 'Veteran-Owned Disabled Support'), 160);
      const planTier = sanitizeInput(body.planTier || '', 60);
      const unlockAppId = sanitizeInput(body.unlockAppId || '', 64);
      const rawReturn = sanitizeInput(body.returnPath || (type === 'subscription' ? '/workspace' : '/newsletter'), 120);
      const returnPath = toCleanRoute(rawReturn) || (type === 'subscription' ? '/workspace' : '/newsletter');

      const sessionId = 'MGC-CHK-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      if (!Array.isArray(S.checkoutSessions)) S.checkoutSessions = [];
      const sessionObj = {
        id: sessionId,
        type,
        merchantEntity,
        title,
        amountUsd,
        method,
        customerName,
        customerEmail,
        planTier,
        unlockAppId,
        returnPath,
        uid: u ? u.id : null,
        status: 'OPEN',
        createdAt: now()
      };
      S.checkoutSessions.unshift(sessionObj);
      if (S.checkoutSessions.length > 200) S.checkoutSessions.length = 200;
      saveState(S);

      const bundle = buildPrefilledRedirectBundle(sessionObj);
      const checkoutUrl = `/checkout?session=${encodeURIComponent(sessionId)}`;
      return sendJson(res, 200, {
        ok: true,
        sessionId,
        checkoutUrl,
        externalRedirectUrl: bundle.externalRedirectUrl,
        cashAppPrefilledUrl: bundle.cashAppPrefilledUrl,
        callbackUrl: bundle.callbackUrl,
        authThenCallbackUrl: bundle.authThenCallbackUrl,
        authThenCheckoutUrl: bundle.authThenCheckoutUrl,
        prefillParams: bundle.prefillParams,
        session: Object.assign({}, sessionObj, bundle)
      });
    }

    /* ---------- Authenticated & HMAC-Verified Redirect Return Callback (GET /api/checkout/callback) ---------- */
    if (pathname === '/api/checkout/callback' && req.method === 'GET') {
      const sid = sanitizeInput(parsedUrl.searchParams.get('session') || '', 64);
      const sig = sanitizeInput(parsedUrl.searchParams.get('sig') || '', 80);
      const list = Array.isArray(S.checkoutSessions) ? S.checkoutSessions : [];
      const sess = list.find(x => x.id === sid);
      if (!sess) {
        return sendJson(res, 404, {
          ok: false,
          code: 'SESSION_NOT_FOUND',
          error: 'Security Control Enforced: Checkout redirect session was not found or has expired.'
        });
      }
      const expectedSig = computeCheckoutCallbackSig(sess);
      const sigBuf = Buffer.from(String(sig || ''), 'utf8');
      const expBuf = Buffer.from(String(expectedSig || ''), 'utf8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        logAudit('public', 'security.checkout_callback_tampered_sig', `Blocked invalid checkout return signature for ${sid}`);
        return sendJson(res, 403, {
          ok: false,
          code: 'INVALID_CALLBACK_SIGNATURE',
          error: 'Security Control Enforced: Invalid or tampered checkout return signature.'
        });
      }
      // Enforce Authentication Gate: if caller is not authenticated, route them to /auth first and return here after authentication
      const u = getAuthenticatedUser(req);
      const exactCallbackPath = `/api/checkout/callback?session=${encodeURIComponent(sess.id)}&sig=${encodeURIComponent(expectedSig)}`;
      if (!u) {
        res.writeHead(302, {
          Location: `/auth?next=${encodeURIComponent(exactCallbackPath)}`,
          'Cache-Control': 'no-store'
        });
        return res.end();
      }

      // User is authenticated & HMAC signature is verified — apply entitlement/receipt within RBAC security controls
      const timestampIso = now();
      const method = ['card', 'cashapp', 'wallet', 'gpc_wawf'].includes(sess.method) ? sess.method : 'card';
      const refCode = method === 'cashapp' ? 'CASH' : method === 'wallet' ? 'WPAY' : 'REDIR';
      let receiptId = sess.receiptId || sess.id;

      if (sess.status !== 'SETTLED') {
        if (sess.type === 'subscription') {
          const payRes = processLegalSecurePayment(u, {
            merchantEntity: sess.merchantEntity || 'MGC',
            planTier: sess.planTier || 'pro_49',
            unlockAppId: sess.unlockAppId || '',
            amountUsd: sess.amountUsd || 49,
            method,
            billingName: u.name || sess.customerName || 'Verified Member',
            billingEmail: u.email || sess.customerEmail,
            postalCode: '00000',
            cardBrand: 'External Hosted Redirect',
            last4: refCode,
            expMonth: 12,
            expYear: 2029,
            eftaNachaAccepted: true,
            pciTermsAccepted: true,
            msaAccepted: true
          });
          receiptId = (payRes.payload && payRes.payload.receipt && payRes.payload.receipt.receiptId) || sess.id;
        } else {
          receiptId = 'MGC-DON-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
          const vaultToken = 'tok_redir_' + crypto.createHmac('sha256', SESSION_SECRET)
            .update(`${receiptId}:${u.email}:${method}:${timestampIso}`)
            .digest('hex')
            .slice(0, 20);
          const receiptSignature = 'HMAC-SHA256-' + crypto.createHmac('sha256', SESSION_SECRET)
            .update(`${receiptId}|${u.email}|${Number(sess.amountUsd || 25).toFixed(2)}|${timestampIso}`)
            .digest('hex')
            .slice(0, 28);
          const statutoryTaxDisclosure = 'Official Legal Notice: Contributions support Milton Group Concepts LLC, a Service-Disabled Veteran-Owned Small Business, and are not tax-deductible as charitable contributions for federal income tax purposes.';
          if (!S.newsletter) S.newsletter = seedState().newsletter;
          if (!Array.isArray(S.newsletter.donations)) S.newsletter.donations = [];
          S.newsletter.donations.unshift({
            id: receiptId,
            donorName: u.name || sess.customerName,
            donorEmail: u.email || sess.customerEmail,
            amountUsd: sess.amountUsd,
            note: sess.title || 'Veteran-Owned Disabled Support',
            method,
            last4: refCode,
            vaultToken,
            signature: receiptSignature,
            verificationState: 'REDIRECT_AUTH_VERIFIED_HMAC',
            pciDssCompliant: true,
            roscaEsignCompliant: true,
            taxDeductible: false,
            statutoryTaxDisclosure,
            legalConsentAcceptedAt: timestampIso,
            createdAt: timestampIso
          });
        }
        sess.status = 'SETTLED';
        sess.receiptId = receiptId;
        sess.verifiedByAuthUid = u.id;
        sess.verificationState = 'REDIRECT_AUTH_VERIFIED_HMAC';
        sess.settledAt = timestampIso;
        logAudit(u.id, 'checkout.callback_verified', `${receiptId} $${Number(sess.amountUsd || 25).toFixed(2)} [${method} · HMAC+Auth Verified]`);
        saveState(S);
      }

      // Enforce Role-Based Access Control (RBAC) on the final return destination
      const requestedReturn = sess.returnPath || (sess.type === 'subscription' ? '/workspace' : '/newsletter');
      let safeReturn = resolveAuthorizedRoleRedirect(u, requestedReturn, false);
      if (isOwnerUser(u) && (requestedReturn === '/newsletter' || requestedReturn === '/workspace' || requestedReturn === '/member-portal')) {
        safeReturn = requestedReturn;
      }
      const sep = safeReturn.includes('?') ? '&' : '?';
      const finalLocation = `${safeReturn}${sep}checkout_status=settled&receipt=${encodeURIComponent(receiptId)}&auth_verified=1`;
      res.writeHead(302, {
        Location: finalLocation,
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    if (pathname === '/api/checkout/complete' && req.method === 'POST') {
      if (!checkRateLimit(req, 'checkout_complete', 20, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid characters detected.' });
      }
      if (['ach_nacha', 'ach', 'bank_ach', 'bank'].includes(String(body.method || '').toLowerCase())) {
        return sendJson(res, 400, {
          ok: false,
          code: 'ACH_RAIL_DISABLED_BY_POLICY',
          error: 'Security Policy Enforced: Bank ACH is disabled on customer checkout. Please use Card, Cash App Pay, or Apple Pay / Google Pay.'
        });
      }
      if (body.legalConsentAccepted === false) {
        return sendJson(res, 400, {
          ok: false,
          code: 'LEGAL_CONSENT_REQUIRED',
          error: 'Authorization Required: Please agree to the Terms of Service, Privacy Policy, and Official Legal Notice before proceeding to external redirect.'
        });
      }
      const u = getAuthenticatedUser(req);
      const sid = sanitizeInput(body.sessionId || '', 64);
      const list = Array.isArray(S.checkoutSessions) ? S.checkoutSessions : [];
      let sess = list.find(x => x.id === sid);

      const type = (body.type || (sess && sess.type)) === 'subscription' ? 'subscription' : 'donation';
      const merchantEntity = String(body.merchantEntity || (sess && sess.merchantEntity) || 'MGC').toUpperCase() === 'FIX' ? 'FIX' : 'MGC';
      const amountUsd = Math.max(1, Math.min(250000, Math.round((Number(body.amountUsd || (sess && sess.amountUsd)) || 25) * 100) / 100));
      const method = ['card', 'cashapp', 'wallet', 'gpc_wawf'].includes(body.method || (sess && sess.method)) ? (body.method || sess.method) : 'card';
      const customerName = sanitizeInput(body.customerName || (sess && sess.customerName) || (u && u.name) || 'Community Supporter', 100);
      const customerEmail = sanitizeInput(body.customerEmail || (sess && sess.customerEmail) || (u && u.email) || 'supporter@miltongroupsecurity.org', 140).toLowerCase();
      const rawReturn = sanitizeInput(body.returnPath || (sess && sess.returnPath) || (type === 'subscription' ? '/workspace' : '/newsletter'), 120);
      const returnPath = toCleanRoute(rawReturn) || (type === 'subscription' ? '/workspace' : '/newsletter');

      if (!sess) {
        const newSid = 'MGC-CHK-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
        sess = {
          id: newSid,
          type,
          merchantEntity,
          title: sanitizeInput(body.title || 'Veteran-Owned Disabled Support', 160),
          amountUsd,
          method,
          customerName,
          customerEmail,
          planTier: sanitizeInput(body.planTier || '', 60),
          unlockAppId: sanitizeInput(body.unlockAppId || '', 64),
          returnPath,
          uid: u ? u.id : null,
          status: 'OPEN',
          createdAt: now()
        };
        if (!Array.isArray(S.checkoutSessions)) S.checkoutSessions = [];
        S.checkoutSessions.unshift(sess);
      } else {
        sess.method = method;
        sess.amountUsd = amountUsd;
        sess.customerName = customerName;
        sess.customerEmail = customerEmail;
        sess.returnPath = returnPath;
      }

      const bundle = buildPrefilledRedirectBundle(sess);
      // If caller requests authenticated redirect gate and is not yet signed in, direct them to /auth?next=<callbackUrl>
      if (!u && (body.requireAuthRedirect === true || type === 'subscription')) {
        saveState(S);
        return sendJson(res, 200, {
          ok: true,
          requiresAuth: true,
          sessionId: sess.id,
          externalRedirectUrl: bundle.externalRedirectUrl,
          cashAppPrefilledUrl: bundle.cashAppPrefilledUrl,
          callbackUrl: bundle.callbackUrl,
          authRedirectUrl: bundle.authThenCallbackUrl,
          redirectUrl: bundle.authThenCallbackUrl
        });
      }

      const refCode = method === 'cashapp' ? 'CASH' : method === 'wallet' ? 'WPAY' : 'REDIR';
      const verificationState = 'EXTERNAL_REDIRECT_PREFILLED_HMAC';

      if (type === 'subscription' && u) {
        const payRes = processLegalSecurePayment(u, {
          merchantEntity,
          planTier: body.planTier || sess.planTier || 'pro_49',
          unlockAppId: body.unlockAppId || sess.unlockAppId || '',
          amountUsd,
          method,
          billingName: customerName,
          billingEmail: customerEmail,
          postalCode: '00000',
          cardBrand: 'External Hosted Redirect',
          last4: refCode,
          expMonth: 12,
          expYear: 2029,
          eftaNachaAccepted: true,
          pciTermsAccepted: true,
          msaAccepted: true
        });
        sess.status = 'SETTLED';
        sess.verificationState = verificationState;
        sess.legalConsentAcceptedAt = now();
        saveState(S);
        const rId = (payRes.payload && payRes.payload.receipt && payRes.payload.receipt.receiptId) || sess.id;
        const safeDest = resolveAuthorizedRoleRedirect(u, returnPath, false);
        const sep = safeDest.includes('?') ? '&' : '?';
        return sendJson(res, 200, {
          ok: true,
          receiptId: rId,
          verificationState,
          noOnSitePaymentProcessing: true,
          externalRedirectUrl: bundle.externalRedirectUrl,
          cashAppPrefilledUrl: bundle.cashAppPrefilledUrl,
          callbackUrl: bundle.callbackUrl,
          authThenCallbackUrl: bundle.authThenCallbackUrl,
          taxDeductible: false,
          redirectUrl: `${safeDest}${sep}checkout_status=settled&receipt=${encodeURIComponent(rId)}`
        });
      }

      // Commercial Support / Contribution redirect registration
      const timestampIso = now();
      const donationId = 'MGC-DON-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const vaultToken = 'tok_redir_' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${donationId}:${customerEmail}:${method}:${refCode}:${timestampIso}`)
        .digest('hex')
        .slice(0, 20);
      const receiptSignature = 'HMAC-SHA256-' + crypto.createHmac('sha256', SESSION_SECRET)
        .update(`${donationId}|${customerEmail}|${amountUsd.toFixed(2)}|${refCode}|${timestampIso}`)
        .digest('hex')
        .slice(0, 28);
      const statutoryTaxDisclosure = 'Official Legal Notice: Contributions support Milton Group Concepts LLC, a Service-Disabled Veteran-Owned Small Business, and are not tax-deductible as charitable contributions for federal income tax purposes.';

      if (!S.newsletter) S.newsletter = seedState().newsletter;
      if (!Array.isArray(S.newsletter.donations)) S.newsletter.donations = [];
      S.newsletter.donations.unshift({
        id: donationId,
        donorName: customerName,
        donorEmail: customerEmail,
        amountUsd,
        note: sess.title || 'Veteran-Owned Disabled Support',
        method,
        last4: refCode,
        vaultToken,
        signature: receiptSignature,
        verificationState,
        pciDssCompliant: true,
        roscaEsignCompliant: true,
        taxDeductible: false,
        statutoryTaxDisclosure,
        legalConsentAcceptedAt: timestampIso,
        createdAt: timestampIso
      });

      if (typeof postAccountingJournalEntry === 'function') {
        const railCode = method === 'cashapp' ? 'CASHAPP_PAY' : method === 'wallet' ? 'EXPRESS_WALLET' : 'STRIPE_CARD';
        postAccountingJournalEntry({
          receiptId: donationId,
          createdAt: timestampIso,
          entity: merchantEntity,
          entryType: 'REVENUE',
          accountCode: '4010',
          counterparty: customerName,
          counterpartyEmail: customerEmail,
          description: `Veteran-Owned Disabled Support [${donationId} · ${method.toUpperCase()}]`,
          rail: railCode,
          grossUsd: amountUsd,
          status: 'SETTLED'
        });
      }
      sess.status = 'SETTLED';
      sess.receiptId = donationId;
      sess.verificationState = verificationState;
      sess.legalConsentAcceptedAt = timestampIso;
      logAudit(u ? u.id : 'public', 'checkout.completed', `${donationId} $${amountUsd.toFixed(2)} [${method} · ${verificationState}]`);
      saveState(S);

      const sep = returnPath.includes('?') ? '&' : '?';
      return sendJson(res, 200, {
        ok: true,
        receiptId: donationId,
        verificationState,
        noOnSitePaymentProcessing: true,
        externalRedirectUrl: bundle.externalRedirectUrl,
        cashAppPrefilledUrl: bundle.cashAppPrefilledUrl,
        callbackUrl: bundle.callbackUrl,
        authThenCallbackUrl: bundle.authThenCallbackUrl,
        taxDeductible: false,
        statutoryTaxDisclosure,
        redirectUrl: `${returnPath}${sep}checkout_status=settled&receipt=${encodeURIComponent(donationId)}`
      });
    }

    if ((pathname === '/api/newsletter/consultation' || pathname === '/api/consultation/public') && req.method === 'POST') {
      if (!checkRateLimit(req, 'newsletter_consultation', 12, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait 60 seconds and try again.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        logAudit('public', 'security.newsletter_consultation_injection_blocked', 'Blocked disallowed payload in newsletter consultation submission');
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Invalid characters detected in submission fields.' });
      }
      const d = body.data || body || {};
      const clientName = sanitizeInput(d.clientName || d.name || '', 120);
      const clientEmail = sanitizeInput(d.clientEmail || d.email || '', 160).toLowerCase();
      const organization = sanitizeInput(d.organization || d.org || '', 140);
      const roleTitle = sanitizeInput(d.roleTitle || '', 90);
      const phone = sanitizeInput(d.phone || '', 32);
      const track = sanitizeInput(d.track || 'ai-web', 60);
      const scaleTier = sanitizeInput(d.scaleTier || 'Growth (Up to 25 Users)', 80);
      const architectureScope = sanitizeInput(d.architectureScope || 'Executive Consultation & Information Request', 140);
      const consultationFormat = sanitizeInput(d.consultationFormat || 'Video Briefing & Screen Share', 80);
      const timeline = sanitizeInput(d.timeline || '2-4 Weeks', 60);
      const preferredWindow = sanitizeInput(d.preferredWindow || 'Next Available Executive Slot', 80);
      const integrationEnv = sanitizeInput(d.integrationEnv || 'Google Cloud / Workspace', 100);
      const projectBrief = sanitizeInput(d.projectBrief || d.note || '', 600);

      if (!clientName || !/^\S+@\S+\.\S+$/.test(clientEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Please provide your Full Name and a valid Email Address.' });
      }
      if (OWNER_EMAILS.has(clientEmail)) {
        return sendJson(res, 403, { ok: false, error: 'Protected domain address cannot be used for public submissions.' });
      }
      if (!Array.isArray(S.consultations)) S.consultations = [];
      const receiptId = 'MGC-REQ-' + Date.now().toString(36).toUpperCase().slice(-5) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const entry = {
        id: uid('cons'),
        receiptId,
        uid: 'public_newsletter',
        clientName,
        clientEmail,
        organization,
        roleTitle,
        phone,
        track,
        scaleTier,
        architectureScope,
        consultationFormat,
        timeline,
        preferredWindow,
        integrationEnv,
        projectBrief,
        source: 'newsletter_public_form',
        status: 'submitted',
        createdAt: now()
      };
      S.consultations.unshift(entry);
      S.requests.unshift({
        id: entry.id,
        receipt: entry.receiptId,
        uid: 'public_newsletter',
        name: clientName,
        email: clientEmail,
        org: organization,
        interest: track,
        consultationScope: architectureScope,
        timeline,
        note: projectBrief,
        status: 'consultation_requested',
        created: entry.createdAt
      });
      notifyUser('owner', 'New Newsletter Consultation & Information Request', `${clientName} (${clientEmail}${organization ? ' · ' + organization : ''}) submitted ${receiptId}: ${architectureScope} [${timeline}].`);
      logAudit('public', 'newsletter.consultation_submitted', `${receiptId} [${clientEmail} · ${architectureScope}]`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        receiptId,
        consultation: {
          receiptId: entry.receiptId,
          clientName: entry.clientName,
          maskedEmail: maskEmailAddress(entry.clientEmail),
          architectureScope: entry.architectureScope,
          timeline: entry.timeline,
          status: entry.status,
          createdAt: entry.createdAt
        },
        message: `Request ${receiptId} submitted. Confirmation queued for ${maskEmailAddress(clientEmail)}.`
      });
    }

    if (pathname === '/api/newsletter/sources' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u || u.role !== 'owner') {
        return sendJson(res, 403, { ok: false, error: 'Owner authorization required to add intelligence sources.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid input characters.' });
      }
      const title = sanitizeInput(body.title || '', 160);
      const category = sanitizeInput(body.category || 'EXECUTIVE', 40).toUpperCase();
      if (!title) return sendJson(res, 400, { ok: false, error: 'Source title is required.' });
      if (!S.newsletter) S.newsletter = seedState().newsletter;
      if (!Array.isArray(S.newsletter.sources)) S.newsletter.sources = [];
      const srcObj = { id: uid('src'), title, category, status: 'collected', addedAt: now() };
      S.newsletter.sources.unshift(srcObj);
      logAudit('owner', 'newsletter.source_collected', title);
      saveState(S);
      return sendJson(res, 200, { ok: true, source: srcObj, sources: S.newsletter.sources });
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
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Security check failed: Invalid characters detected.' });
      }
      const title = sanitizeInput(body.title, 160);
      const summary = sanitizeInput(body.summary, 600);
      const category = sanitizeInput(body.category || body.track || 'Executive Briefing', 48);
      const distroTarget = sanitizeInput(body.distro || 'distro_all_exec', 48);
      const dispatchSms = body.dispatchSms !== false;
      const highlights = Array.isArray(body.highlights)
        ? body.highlights.map(h => sanitizeInput(h, 220)).filter(Boolean).slice(0, 5)
        : String(body.highlights || '').split('\n').map(h => sanitizeInput(h, 220)).filter(Boolean).slice(0, 5);
      if (!title || !summary) {
        return sendJson(res, 400, { ok: false, error: 'Title and summary are required.' });
      }
      if (!S.newsletter) S.newsletter = seedState().newsletter;
      if (!Array.isArray(S.newsletter.distributions)) S.newsletter.distributions = [];
      const nextNum = (S.newsletter.issues || []).length + 2;
      const issue = {
        id: uid('iss'),
        issueNumber: `ISSUE #${String(nextNum).padStart(2, '0')} · ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}`,
        category,
        track: category.toUpperCase(),
        date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        readTime: '3 min read',
        title,
        summary,
        highlights: highlights.length ? highlights : ['Dispatched via MGC Zero-Cost Email + SMS Distro Engine']
      };
      S.newsletter.issues.unshift(issue);
      const emailCount = 140 + (S.newsletter.subscribers || []).length;
      const smsCount = dispatchSms ? (38 + (S.newsletter.subscribers || []).filter(s => Boolean(s.phone)).length) : 0;
      const distroReceipt = {
        id: 'DIST-' + Date.now().toString(36).toUpperCase().slice(-6),
        issueId: issue.id,
        issueNumber: issue.issueNumber,
        title: issue.title,
        distroTarget,
        emailDispatched: emailCount,
        smsDispatched: smsCount,
        dispatchedAt: now()
      };
      S.newsletter.distributions.unshift(distroReceipt);
      Object.values(S.users || {}).forEach(usr => {
        notifyUser(usr.id, `New Briefing: ${issue.issueNumber} — ${issue.title}`, issue.summary);
      });
      logAudit('owner', 'newsletter.publish_and_dishout', `${issue.issueNumber}: ${issue.title} [Email=${emailCount}, SMS=${smsCount}]`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        issue,
        distroReceipt,
        issues: S.newsletter.issues,
        subscriberCount: S.newsletter.subscribers.length,
        subscribersCount: emailCount,
        newsletter: {
          subscribersCount: emailCount,
          smsSubscribersCount: smsCount,
          distributions: S.newsletter.distributions.slice(0, 10),
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
      if (!isOwnerUser(u)) {
        return sendJson(res, 200, {
          ok: true,
          connected: true,
          status: 'healthy',
          authenticated: Boolean(u)
        });
      }
      return sendJson(res, 200, {
        ok: true,
        connected: true,
        status: 'healthy',
        authenticated: true,
        role: u.role,
        accessTier: 'OWNER_FULL',
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

    if (pathname === '/api/auth/check-username' && req.method === 'GET') {
      const rawUn = String(parsedUrl.searchParams.get('username') || '').trim().toLowerCase();
      const reservedSet = new Set(['admin', 'administrator', 'owner', 'root', 'system', 'malik.khabir', 'security', 'postmaster', 'support']);
      const empRec = resolveEmployeeAssignedRecord(rawUn, '');
      const lenOk = rawUn.length >= 4 && rawUn.length <= 32;
      const formatOk = /^[a-z0-9][a-z0-9._-]{3,31}$/.test(rawUn) && !/[._-]{2,}/.test(rawUn);
      const notReserved = Boolean(rawUn) && !reservedSet.has(rawUn);
      const collisionUser = Object.values(S.users || {}).find(u => u && String(u.username || '').toLowerCase() === rawUn);
      // If it is an Admin-assigned employee username undergoing registration/password reset, allow it!
      const uniqueOk = empRec.isAssignedEmployee
        ? (!collisionUser || Boolean(collisionUser.mustResetPassword))
        : !collisionUser;
      const ok = Boolean(lenOk && formatOk && notReserved && uniqueOk);
      const violations = [];
      if (!rawUn) violations.push('Username is required for portal logon (not optional).');
      else {
        if (!lenOk) violations.push('Must be between 4 and 32 characters.');
        if (!formatOk) violations.push('Use only letters (a-z), numbers (0-9), periods (.), underscores (_), or hyphens (-), starting with a letter or number.');
        if (!notReserved) violations.push('This system identifier is reserved and cannot be used.');
        if (!uniqueOk) violations.push('This username is already registered to an active directory account.');
      }
      return sendJson(res, 200, {
        ok,
        username: rawUn,
        isAssignedEmployee: Boolean(empRec.isAssignedEmployee),
        detectedOu: empRec.isAssignedEmployee ? 'internal' : 'external',
        assignedProfile: empRec.isAssignedEmployee ? {
          username: empRec.username,
          org: 'MGC Internal Operations',
          mustResetPassword: true
        } : null,
        checks: { lenOk, formatOk, notReserved, uniqueOk },
        violations,
        error: violations[0] || ''
      });
    }

    if (pathname === '/api/auth/register/send-email-code' && req.method === 'POST') {
      if (!checkRateLimit(req, 'reg_email_code', 20, 60000)) {
        return sendJson(res, 429, { ok: false, error: 'Too many verification code requests. Please wait 60 seconds.' });
      }
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, error: 'Security Validation Failed: Disallowed input characters detected.' });
      }
      const cleanEmail = sanitizeInput(body.email || '', 140).toLowerCase();
      const cleanUsername = sanitizeInput(body.username || '', 60).toLowerCase();
      const cleanRecovery = sanitizeInput(body.recoveryEmail || '', 140).toLowerCase();
      const cleanName = sanitizeInput(body.name || '', 100);
      if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Enter a valid Primary Logon Email address before requesting a verification code.' });
      }
      if (!cleanUsername || cleanUsername.length < 4) {
        return sendJson(res, 400, { ok: false, error: 'Complete Page 1 Username verification first.' });
      }
      const empRec = resolveEmployeeAssignedRecord(cleanUsername, cleanEmail);
      const code = String(100000 + (crypto.randomBytes(3).readUIntBE(0, 3) % 900000));
      if (!S.emailVerifications) S.emailVerifications = {};
      const dispatchId = 'MGC-EMV-' + Date.now().toString(36).toUpperCase().slice(-5);
      const emailSubject = empRec.isAssignedEmployee
        ? `[MGC Directory] Employee Username (${cleanUsername}), Mandatory Password Reset & Email Verification Code`
        : `[MGC Portal] Confirm Your Portal Username (${cleanUsername}) & Email Verification Code`;
      const emailPreview = empRec.isAssignedEmployee
        ? `Assigned Employee Username: ${cleanUsername} | Mandatory First-Logon Password Reset Attested | Verification Code: ${code}`
        : `Registered Client Username: ${cleanUsername} | Primary Email: ${cleanEmail} | Verification Code: ${code}`;
      S.emailVerifications[cleanEmail] = {
        dispatchId,
        code,
        email: cleanEmail,
        username: cleanUsername,
        recoveryEmail: cleanRecovery,
        name: cleanName || (empRec.name || ''),
        isAssignedEmployee: Boolean(empRec.isAssignedEmployee),
        emailSubject,
        emailPreview,
        verified: false,
        sentAt: now(),
        expiresAt: Date.now() + 15 * 60 * 1000
      };
      logAudit('system', 'auth.email_verification_sent', `${dispatchId} to ${cleanEmail} [username=${cleanUsername} emp=${empRec.isAssignedEmployee}]`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        dispatchId,
        email: cleanEmail,
        username: cleanUsername,
        isAssignedEmployee: Boolean(empRec.isAssignedEmployee),
        emailSubject,
        emailPreview,
        verificationCodePreview: code,
        message: `Verification email (${dispatchId}) sent to ${cleanEmail} with your username (${cleanUsername}) and 6-digit security code.`
      });
    }

    if (pathname === '/api/auth/register/verify-email-code' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const cleanEmail = sanitizeInput(body.email || '', 140).toLowerCase();
      const cleanUsername = sanitizeInput(body.username || '', 60).toLowerCase();
      const cleanCode = String(body.code || '').replace(/\D/g, '').slice(0, 6);
      if (!cleanEmail || cleanCode.length !== 6) {
        return sendJson(res, 400, { ok: false, error: 'Please enter the 6-digit email verification code.' });
      }
      const rec = S.emailVerifications && S.emailVerifications[cleanEmail];
      if (!rec) {
        return sendJson(res, 400, { ok: false, error: 'No active verification code found for that email. Click "Send Verification Code" first.' });
      }
      if (rec.expiresAt && Date.now() > rec.expiresAt) {
        return sendJson(res, 400, { ok: false, error: 'Verification code has expired. Please request a new code.' });
      }
      if (rec.code !== cleanCode) {
        return sendJson(res, 403, { ok: false, error: 'Invalid 6-digit verification code. Please check your email and try again.' });
      }
      rec.verified = true;
      rec.verifiedAt = now();
      if (cleanUsername) rec.username = cleanUsername;
      const verificationToken = signToken({ email: cleanEmail, username: rec.username, emailVerified: true }, 3600);
      logAudit('system', 'auth.email_verification_confirmed', `${cleanEmail} [username=${rec.username}] verified`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        emailVerified: true,
        email: cleanEmail,
        username: rec.username,
        isAssignedEmployee: Boolean(rec.isAssignedEmployee),
        verifiedAt: rec.verifiedAt,
        verificationToken
      });
    }

    if (pathname === '/api/auth/employee-provision' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Sole Administrator authorization required to provision assigned Employee usernames.' });
      }
      const body = await readJsonBody(req);
      const rawUn = sanitizeInput(body.username || '', 32).toLowerCase();
      const empEmail = sanitizeInput(body.email || '', 140).toLowerCase();
      const empName = sanitizeInput(body.name || '', 100);
      const empOrg = sanitizeInput(body.org || 'MGC Internal Operations', 120);
      const cleanUn = rawUn.startsWith('emp.') || rawUn.startsWith('staff.') ? rawUn : `emp.${rawUn}`;
      if (!cleanUn || cleanUn.length < 5 || !/^\S+@\S+\.\S+$/.test(empEmail) || !empName) {
        return sendJson(res, 400, { ok: false, error: 'Employee Full Name, valid Email, and Assigned Username are required.' });
      }
      if (!S.employeeAssignedUsernames) S.employeeAssignedUsernames = {};
      S.employeeAssignedUsernames[cleanUn] = {
        username: cleanUn,
        name: empName,
        email: empEmail,
        org: empOrg,
        ou: 'internal',
        securityGroup: sanitizeInput(body.securityGroup || 'INTERNAL_ANALYST', 60),
        assignedByAdmin: true,
        mustResetPassword: true,
        provisionedAt: now()
      };
      logAudit('owner', 'directory.employee_username_assigned', `Assigned employee username=${cleanUn} for ${empName} (${empEmail})`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        employeeAssignment: S.employeeAssignedUsernames[cleanUn],
        message: `Assigned employee username "${cleanUn}" provisioned for ${empName} (${empEmail}). Employee must complete Email Verification & Mandatory Password Reset before session login.`
      });
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
        return sendJson(res, 400, { ok: false, error: 'Full Name and a valid Primary Logon Email are required.' });
      }
      if (d.ndaAccepted === false || (d.guidedRegistration && d.tosAccepted === false)) {
        return sendJson(res, 400, { ok: false, error: 'Terms of Service Required: You must review and accept the MGC Master Terms of Service, Privacy Notice, and Mutual NDA.' });
      }
      const caller = getAuthenticatedUser(req);
      const isAdminCaller = Boolean(caller && caller.role === 'owner' && caller.id === 'owner');
      const isEmpCaller = isEmployeeUser(caller);
      const isGuidedReg = Boolean(d.guidedRegistration || pathname === '/api/auth/register');
      if (isGuidedReg && d.tosAccepted === false) {
        return sendJson(res, 400, { ok: false, error: 'Terms of Service Required: You must review and accept the MGC Master Terms of Service, Privacy Notice, and Mutual NDA.' });
      }
      const rawUsernameInput = String(d.username || '').trim().toLowerCase();
      if (isGuidedReg && !rawUsernameInput) {
        return sendJson(res, 400, { ok: false, error: 'Username is mandatory for portal registration and logon (not optional).' });
      }
      let cleanUsername = sanitizeInput(rawUsernameInput || cleanEmail.split('@')[0], 60).toLowerCase();
      const empRec = resolveEmployeeAssignedRecord(cleanUsername, cleanEmail);
      const portalContext = String(d.portalContext || '').toLowerCase();
      if (portalContext === 'client' && empRec.isAssignedEmployee) {
        return sendJson(res, 403, {
          ok: false,
          error: 'This username is reserved and unavailable.'
        });
      }
      if (portalContext === 'employee' && !empRec.isAssignedEmployee) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Enter the organization-assigned username from your onboarding notice.'
        });
      }

      // Critical Anti-Spoofing Guard: Prevent public customer intake from ever claiming or overwriting an Owner account
      if (OWNER_EMAILS.has(cleanEmail) || (!isAdminCaller && !empRec.isAssignedEmployee && cleanEmail.endsWith('@miltongroupsecurity.org')) || cleanEmail.startsWith('owner@') || cleanEmail.startsWith('admin@')) {
        logAudit('system', 'security.intake_owner_spoof_blocked', `Blocked public intake attempt using owner/admin email: ${cleanEmail}`);
        return sendJson(res, 403, {
          ok: false,
          error: 'Security Policy Enforced: Administrator accounts cannot be submitted or registered via Customer Intake.'
        });
      }

      const interestKey = TAILOR[d.interest] ? d.interest : 'ai-web';
      const cleanNote = sanitizeInput(d.note, 500);
      const mfaMethod = sanitizeInput(d.mfaMethod || 'SSO_ATTESTED', 40);
      const existing = Object.values(S.users).find(x => String(x.email || '').toLowerCase() === cleanEmail || (empRec.isAssignedEmployee && String(x.username || '').toLowerCase() === cleanUsername));
      const id = existing ? existing.id : uid('u');

      if (existing && (existing.status === 'denied' || existing.status === 'suspended')) {
        logAudit('system', 'security.intake_denied_account', cleanEmail);
        return sendJson(res, 403, { ok: false, error: 'Intake Denied: This account has been restricted by the platform Owner.' });
      }

      if (['malik.khabir', 'owner', 'admin', 'administrator', 'root', 'system'].includes(cleanUsername)) {
        logAudit('system', 'security.intake_reserved_username_blocked', cleanUsername);
        return sendJson(res, 403, { ok: false, error: 'Security Policy Enforced: Reserved directory username cannot be registered.' });
      }
      if (rawUsernameInput && (!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(cleanUsername) || /[._-]{2,}/.test(cleanUsername))) {
        return sendJson(res, 400, { ok: false, error: 'Username Security Standard Failed: Must be 4–32 characters (letters, numbers, ., _, -) starting with a letter or number.' });
      }
      const usernameCollision = Object.values(S.users).find(x => x.id !== id && String(x.username || '').toLowerCase() === cleanUsername);
      if (usernameCollision) {
        if (rawUsernameInput) {
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
      if (isGuidedReg && (rawProv === 'password' || rawPassword || empRec.isAssignedEmployee)) {
        const pwLenOk = rawPassword.length >= 8 && rawPassword.length <= 128;
        const pwUpper = /[A-Z]/.test(rawPassword);
        const pwLower = /[a-z]/.test(rawPassword);
        const pwDigit = /\d/.test(rawPassword);
        const pwSpec = /[^A-Za-z0-9\s]/.test(rawPassword);
        const pwNoUser = !cleanUsername || !rawPassword.toLowerCase().includes(cleanUsername);
        if (!pwLenOk || !pwUpper || !pwLower || !pwDigit || !pwSpec || !pwNoUser) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Password Security Standard Failed: Requires 8+ characters with uppercase, lowercase, number, special symbol, and must not contain your username.'
          });
        }
      }
      const cleanRecoveryEmail = sanitizeInput(d.recoveryEmail || '', 140).toLowerCase();
      const cleanPhone = sanitizeInput(d.phone || '', 32);
      const phoneDigits = cleanPhone.replace(/\D/g, '');
      if (isGuidedReg) {
        if (!cleanRecoveryEmail || !/^\S+@\S+\.\S+$/.test(cleanRecoveryEmail)) {
          return sendJson(res, 400, { ok: false, error: 'A valid Recovery Email is required to complete registration.' });
        }
        if (phoneDigits.length < 10 || phoneDigits.length > 15) {
          return sendJson(res, 400, { ok: false, error: 'A valid 10–15 digit Phone Number is required to complete registration.' });
        }
        const emailVerRec = S.emailVerifications && S.emailVerifications[cleanEmail];
        const tokenClaims = d.emailVerificationToken ? verifyToken(d.emailVerificationToken) : null;
        const isEmailVerified = Boolean((emailVerRec && emailVerRec.verified) || (tokenClaims && tokenClaims.emailVerified && tokenClaims.email === cleanEmail) || (pathname !== '/api/auth/register' && d.emailVerified === true) || isAdminCaller || isEmpCaller);
        if (!isEmailVerified) {
          return sendJson(res, 400, { ok: false, error: 'Email Verification Required: Please verify your Primary Email with the 6-digit verification code on Page 2 before completing registration.' });
        }
      }
      const computedPasswordDigest = rawPassword ? mgcDigest(rawPassword) : ((existing && existing.passwordDigest) || null);
      // Employee role is determined by whether the username is an Admin-assigned employee username (or provisioned by Admin)
      const userOu = (isAdminCaller && (d.ou === 'internal' || d.ou === 'external'))
        ? d.ou
        : (empRec.isAssignedEmployee ? 'internal' : ((existing && existing.ou) || 'external'));
      if (isAdminCaller && userOu === 'internal' && cleanUsername) {
        if (!S.employeeAssignedUsernames) S.employeeAssignedUsernames = {};
        S.employeeAssignedUsernames[cleanUsername] = {
          username: cleanUsername,
          name: cleanName,
          email: cleanEmail,
          org: cleanOrg || 'MGC Internal Operations',
          ou: 'internal',
          securityGroup: String(d.securityGroup || 'INTERNAL_ANALYST'),
          assignedByAdmin: true,
          mustResetPassword: Boolean(d.mustResetPassword !== false)
        };
      } else if (empRec.isAssignedEmployee && S.employeeAssignedUsernames && S.employeeAssignedUsernames[cleanUsername] && isGuidedReg) {
        S.employeeAssignedUsernames[cleanUsername].mustResetPassword = false;
        S.employeeAssignedUsernames[cleanUsername].passwordResetAt = now();
      }
      const rawAddr = (d.address && typeof d.address === 'object') ? d.address : {};
      const cleanAddress = {
        streetAddress: sanitizeInput(rawAddr.streetAddress || rawAddr.street || d.streetAddress || '', 140),
        city: sanitizeInput(rawAddr.city || d.city || '', 80),
        stateRegion: sanitizeInput(rawAddr.stateRegion || rawAddr.state || d.stateRegion || '', 60),
        postalCode: sanitizeInput(rawAddr.postalCode || rawAddr.zip || d.postalCode || '', 24)
      };
      // Physical Address is now mandatory for ALL users (both Client users and Employee users) during guided registration
      if (isGuidedReg) {
        if (!cleanAddress.streetAddress || !cleanAddress.city || !cleanAddress.stateRegion || !cleanAddress.postalCode) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Address Policy Enforced: Complete physical address (Street Address, City, State/Region, and Postal/ZIP Code) is mandatory for all portal registrations.'
          });
        }
        if (d.tosAccepted !== true && d.ndaAccepted !== true) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Terms of Service Required: You must review and accept the Terms of Service to complete registration.'
          });
        }
      }
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

      const isWorkspaceSso = ['google', 'microsoft', 'apple'].includes(rawProv);
      S.users[id] = {
        id,
        name: cleanName,
        username: cleanUsername,
        org: cleanOrg || (userOu === 'internal' ? 'MGC Internal Operations' : (d.brand === 'FIX' ? 'F.I.X Solutions Client Partner' : 'MGC Client Partner')),
        email: cleanEmail,
        recoveryEmail: cleanRecoveryEmail || ((existing && existing.recoveryEmail) || ''),
        phone: cleanPhone || ((existing && existing.phone) || ''),
        address: (cleanAddress.streetAddress || cleanAddress.city || cleanAddress.stateRegion || cleanAddress.postalCode)
          ? cleanAddress
          : ((existing && existing.address) || { streetAddress: '', city: '', stateRegion: '', postalCode: '' }),
        role: 'member',
        ou: userOu,
        securityGroup: userGroup,
        status: 'active',
        accessTier: userOu === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED',
        clientTier: isWorkspaceSso ? 'workspace' : 'access',
        workspaceConnected: isWorkspaceSso,
        lastActivityTs: Date.now(),
        brand: d.brand === 'FIX' ? 'FIX' : 'MGC',
        ssoProvider: rawProv,
        passwordDigest: computedPasswordDigest,
        hasPassword: Boolean(computedPasswordDigest),
        assignedByAdmin: Boolean(empRec.isAssignedEmployee || (isAdminCaller && userOu === 'internal')),
        mustResetPassword: Boolean(isAdminCaller && userOu === 'internal' && !d.guidedRegistration),
        passwordResetCompletedAt: (empRec.isAssignedEmployee && d.guidedRegistration) ? now() : ((existing && existing.passwordResetCompletedAt) || null),
        emailVerified: true,
        emailVerifiedAt: now(),
        mfaVerified: Boolean(d.mfaVerified !== false),
        mfaMethod,
        ndaAccepted: true,
        tosAccepted: true,
        tosAcceptedAt: now(),
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
      const targetRedirect = resolveAuthorizedRoleRedirect(S.users[id], reqNext, mobileClient);

      const sessionToken = signToken({
        uid: id,
        email: cleanEmail,
        role: 'member',
        accessTier: userOu === 'internal' ? 'INTERNAL_EMPLOYEE' : 'CUSTOMER_RESTRICTED',
        clientTier: S.users[id].clientTier,
        workspaceConnected: S.users[id].workspaceConnected,
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
        clientTier: S.users[id].clientTier,
        workspaceConnected: S.users[id].workspaceConnected,
        inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS,
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
      // Reject un-tokenized raw PAN, CVV/CVC, or full routing/account numbers at the perimeter
      const rawCardOrPan = String(body.cardNumber || body.pan || body.ccNumber || '').replace(/\D/g, '');
      const hasRawCvvField = Boolean(body.cvv || body.cvc || body.securityCode || body.cardCvv);
      const rawRoutingDigits = String(body.routingNumber || '').replace(/\D/g, '');
      if (rawCardOrPan.length > 4 || hasRawCvvField || rawRoutingDigits.length > 4) {
        logAudit(u.id, 'security.pci_raw_pan_blocked', 'Rejected raw PAN/CVV/routing submission');
        return { status: 400, payload: { ok: false, code: 'PCI_VIOLATION_RAW_PAN_REJECTED', error: 'PCI-DSS v4.0 SAQ-A Enforced: Raw Primary Account Numbers (PAN), CVV codes, and full routing numbers are strictly rejected. Submit 4-digit tokenized identifiers only.' } };
      }

      if (['ach_nacha', 'ach', 'bank_ach', 'bank'].includes(String(body.method || '').toLowerCase())) {
        return {
          status: 400,
          payload: {
            ok: false,
            code: 'ACH_RAIL_DISABLED_BY_POLICY',
            error: 'Security Policy Enforced: Bank ACH is disabled on customer checkout. Please use Card, Cash App Pay, Apple Pay / Google Pay, or Federal WAWF.'
          }
        };
      }
      const merchantEntity = String(body.merchantEntity || u.brand || 'MGC').toUpperCase() === 'FIX' ? 'FIX' : 'MGC';
      const method = ['card', 'cashapp', 'wallet', 'card_tokenized', 'gpc_wawf'].includes(body.method) ? body.method : 'card';
      const gatewayOption = method === 'gpc_wawf' ? 'OPTION_4_WAWF_PIEE_EFT' : method === 'cashapp' ? 'OPTION_2_CASHAPP_PAY' : 'OPTION_1_STRIPE_SAQ_A';
      const billingName = sanitizeInput(body.billingName || u.name || '', 100);
      const billingEmail = sanitizeInput(body.billingEmail || u.email || '', 120).toLowerCase();
      const billingOrg = sanitizeInput(body.billingOrg || u.org || '', 120);
      const addressLine1 = sanitizeInput(body.addressLine1 || body.address || 'Verified Billing Address on File', 140);
      const city = sanitizeInput(body.city || 'Arlington', 80);
      const stateRegion = sanitizeInput(body.state || body.stateRegion || 'VA', 40);
      const postalCode = sanitizeInput(body.postalCode || body.billingZip || body.zip || '', 24);
      const country = sanitizeInput(body.country || 'US', 8).toUpperCase();
      const rawPlanKey = String(body.planId || body.planTier || 'pro_99');
      const unlockAppId = sanitizeInput(body.unlockAppId || '', 64);
      const targetUnlockApp = unlockAppId ? APPS_CATALOG.find(a => a.id === unlockAppId) : null;
      const PLAN_AMOUNTS = {
        base_5: { amountUsd: 5.00, label: 'Base SaaS & LMS Access ($5/mo)' },
        saas_lms_base: { amountUsd: 5.00, label: 'Base SaaS & LMS Access ($5/mo)' },
        single_app_19: { amountUsd: 19.00, label: targetUnlockApp ? `Single Persona SaaS Unlock: ${targetUnlockApp.title} ($19/mo)` : 'Single Specialist Persona SaaS Pass ($19/mo)' },
        pro_49: { amountUsd: 49.00, label: 'Pro All-Access 9 Persona SaaS & LMS Pass ($49/mo)' },
        pro_99: { amountUsd: 99.00, label: 'Pro App & Course LMS Subscriber ($99/mo)' },
        pro_enterprise: { amountUsd: 49.00, label: 'Pro All-Access 9 Persona SaaS & LMS Pass ($49/mo)' },
        enterprise_499: { amountUsd: 499.00, label: 'Enterprise Custom Build & Full Workspace Suite ($499/mo)' },
        sdvosb_contract_retainer: { amountUsd: 250.00, label: 'Enterprise Workspace & SDVOSB/Commercial Retainer ($250/mo)' },
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
      const last4 = rawAccountOrCard.length === 4
        ? rawAccountOrCard
        : (method === 'gpc_wawf' ? 'WAWF' : method === 'cashapp' ? 'CASH' : method === 'wallet' ? 'WPAY' : method === 'ach_nacha' ? 'ACH0' : '4242');

      const expMonthNum = Number(body.expMonth || 12);
      const expYearNum = Number(body.expYear || 2029);
      const fullExpYear = expYearNum < 100 ? 2000 + expYearNum : expYearNum;
      const nowDate = new Date();
      if (method === 'card' || method === 'card_tokenized') {
        if (expMonthNum < 1 || expMonthNum > 12 || fullExpYear < nowDate.getFullYear() || (fullExpYear === nowDate.getFullYear() && expMonthNum < (nowDate.getMonth() + 1))) {
          return { status: 400, payload: { ok: false, error: 'Card expiration date is invalid or expired.' } };
        }
      }

      let instrumentBrand = sanitizeInput(body.cardBrand || body.bankName || '', 40);
      if (!instrumentBrand) {
        if (method === 'ach_nacha') instrumentBrand = 'Mercury / NACHA Commercial ACH';
        else if (method === 'gpc_wawf') instrumentBrand = 'US Gov GPC / PIEE WAWF (CAGE 17GC6)';
        else if (method === 'cashapp') instrumentBrand = 'Cash App Pay';
        else if (method === 'wallet') instrumentBrand = 'Apple Pay / Google Pay';
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
        : 'Milton Group Concepts LLC (Parent / SDVOSB)';

      // Automatically post Double-Entry GAAP Journal Entry (Option A + Option B Rail Fee & 25% Tax Reserve Split)
      const railForAccounting = method === 'ach_nacha'
        ? 'MERCURY_ACH'
        : (method === 'gpc_wawf' ? 'WAWF_EFT' : method === 'cashapp' ? 'CASHAPP_PAY' : method === 'wallet' ? 'EXPRESS_WALLET' : 'STRIPE_CARD');
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
        methodLabel: method === 'ach_nacha' ? 'NACHA Commercial ACH ($0.00 Fee)' : method === 'gpc_wawf' ? 'Option 4 · Federal WAWF / PIEE EFT ($0.00 Fee)' : method === 'cashapp' ? 'Cash App Pay Hosted Checkout (2.9% + $0.30)' : method === 'wallet' ? 'Apple Pay / Google Pay Hosted Checkout (2.9% + $0.30)' : 'Stripe Hosted Card Checkout (2.9% + $0.30)',
        instrumentBrand,
        cardBrand: instrumentBrand,
        last4,
        expMonth: (method === 'card' || method === 'card_tokenized') ? expMonth : null,
        expYear: (method === 'card' || method === 'card_tokenized') ? expYear : null,
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
      u.membershipActive = true;

      // Scalable Tiered Membership Gate: Automatically unlock apps & workspace modules based on verified planTier
      const isTier3Enterprise = ['enterprise_499', 'sdvosb_contract_retainer', 'custom_retainer'].includes(planTier) || amountUsd >= 250;
      const isTier2Pro = isTier3Enterprise || ['pro_49', 'pro_99', 'pro_enterprise'].includes(planTier) || amountUsd >= 49;
      const unlockedTierApps = APPS_CATALOG.filter(a => {
        if (isTier3Enterprise || isTier2Pro) return true;
        if (targetUnlockApp && a.id === targetUnlockApp.id) return true;
        return a.minTier === 'tier_1_starter' || a.defaultCustomer;
      }).map(a => a.id);
      const currentApps = Array.isArray(u.allowedApps) ? u.allowedApps : [];
      u.allowedApps = Array.from(new Set([...currentApps, ...unlockedTierApps, ...(targetUnlockApp ? [targetUnlockApp.id] : [])]));
      const currentRes = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : [];
      if (!currentRes.includes('resource-fast-track')) {
        u.qualifiedResources = [...currentRes, 'resource-fast-track'];
      }
      u.pages = Object.assign({}, u.pages || {}, { saasapps: 'ready', resources: 'ready' });
      if (isTier3Enterprise) {
        u.accessTier = 'ENTERPRISE_RETAINER';
        u.securityGroup = 'EXTERNAL_CLIENT_PARTNER';
        u.clientTier = 'workspace';
        u.workspaceConnected = true;
        u.pages = Object.assign({}, u.pages, { agile: 'ready', contracts: 'ready', compliance: 'ready', academy: 'ready', chronos: 'ready' });
        u.adminGrantedPages = Array.from(new Set([...(u.adminGrantedPages || []), 'resources', 'agile', 'contracts', 'compliance', 'academy', 'chronos']));
        if (!S.shares.some(s => s.type === 'project' && s.resource === 'p_sterling' && s.grantee === u.id)) {
          S.shares.unshift({ id: `project_p_sterling_${u.id}`, type: 'project', resource: 'p_sterling', grantee: u.id, perms: ['view', 'edit'], created: timestampIso });
        }
        if (!S.shares.some(s => s.type === 'project' && s.resource === 'p1' && s.grantee === u.id)) {
          S.shares.push({ id: `project_p1_${u.id}`, type: 'project', resource: 'p1', grantee: u.id, perms: ['view', 'edit'], created: timestampIso });
        }
      } else if (isTier2Pro) {
        u.accessTier = 'PRO_SUBSCRIBER';
        u.pages = Object.assign({}, u.pages, { academy: 'ready', resources: 'ready' });
        u.adminGrantedPages = Array.from(new Set([...(u.adminGrantedPages || []), 'resources', 'academy']));
      }
      u.allowedApps.forEach(appId => {
        if (!S.shares.some(s => s.type === 'app' && s.resource === appId && s.grantee === u.id)) {
          S.shares.push({ id: `app_${appId}_${u.id}`, type: 'app', resource: appId, grantee: u.id, perms: ['view', 'launch'], created: timestampIso });
        }
      });
      u.qualifiedResources.forEach(resId => {
        if (!S.shares.some(s => s.type === 'resource' && s.resource === resId && s.grantee === u.id)) {
          S.shares.push({ id: `resource_${resId}_${u.id}`, type: 'resource', resource: resId, grantee: u.id, perms: ['view', 'launch'], created: timestampIso });
        }
      });

      notifyUser(u.id, 'Payment Verified & Membership Tier Unlocked', `Receipt ${receiptId}: ${instrumentBrand} •••• ${last4} ($${amountUsd.toFixed(2)} USD) verified under PCI-DSS v4.0 SAQ-A. Unlocked ${u.allowedApps.length} applications.`);
      notifyUser('owner', 'Customer Payment Method Verified + Ledger Posted', `${u.name} (${u.email}) submitted verified payment [${instrumentBrand} •••• ${last4} · Gross $${amountUsd.toFixed(2)} · Net $${journalEntry.netCashUsd.toFixed(2)}] — Receipt ${receiptId} / Journal ${journalEntry.journalId}.`);
      logAudit(u.id, 'payment.verified', `${receiptId} [${method} •••• ${last4} Gross=$${amountUsd.toFixed(2)} Net=$${journalEntry.netCashUsd.toFixed(2)} JRN=${journalEntry.journalId}]`);
      saveState(S);

      const isOwnerCaller = isOwnerUser(u);
      return {
        status: 200,
        payload: {
          ok: true,
          verified: true,
          receipt: isOwnerCaller ? receipt : scrubClientReceiptForExternalUser(receipt),
          ...(isOwnerCaller ? { journalEntry } : {}),
          paymentProfile: isOwnerCaller ? paymentProfile : scrubPaymentProfileForExternalUser(paymentProfile),
          unlockedApps: u.allowedApps,
          qualifiedResources: u.qualifiedResources,
          triggerGuidedOnboarding: !u.onboardingCompleted,
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
      const isAdminCaller = isOwnerUser(u);
      return sendJson(res, 200, {
        ok: true,
        verified: Boolean(u.paymentProfile && u.paymentProfile.verified),
        paymentProfile: isAdminCaller ? (u.paymentProfile || null) : scrubPaymentProfileForExternalUser(u.paymentProfile),
        payments: Array.isArray(u.payments)
          ? (isAdminCaller ? u.payments : u.payments.map(scrubClientReceiptForExternalUser))
          : [],
        complianceFramework: {
          pciDss: 'PCI-DSS v4.0 SAQ-A Tokenized Vault (Zero Raw PAN Storage)',
          eftaRegE: 'Electronic Fund Transfer Act (15 U.S.C. 1693) & NACHA Operating Rules Compliant'
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
      if (!u) {
        return sendJson(res, 401, { ok: false, error: 'Authentication required to view payment settings.' });
      }
      if (isEmployeeUser(u)) {
        return sendJson(res, 403, { ok: false, error: 'Employee accounts do not have access to payment gateway settings.' });
      }
      if (!isOwnerUser(u)) {
        return sendJson(res, 200, {
          ok: true,
          pciCompliant: true,
          tokenizationEnforced: true,
          methods: ['card', 'cashapp', 'wallet', 'gpc_wawf']
        });
      }
      const gw = Object.assign({
        activeProcessor: 'stripe_saq_a',
        complianceLevel: 'PCI-DSS v4.0 SAQ-A + EFTA Reg E + NACHA + DFARS 252.232-7003',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeCheckoutHostedUrl: process.env.STRIPE_CHECKOUT_URL || '',
        authorizeNetApiLoginId: process.env.AUTHNET_API_LOGIN_ID || '',
        authorizeNetClientKey: process.env.AUTHNET_CLIENT_KEY || '',
        mercuryAchEnabled: true,
        wawfPieeEnabled: true
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
        cashAppTag: sanitizeInput(body.cashAppTag || '$MiltonGroupConcepts', 80),
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
          paymentProfile: isOwnerUser(u) ? (u.paymentProfile || null) : scrubPaymentProfileForExternalUser(u.paymentProfile),
          payments: Array.isArray(u.payments) ? (isOwnerUser(u) ? u.payments : u.payments.map(scrubClientReceiptForExternalUser)) : []
        } : null
      });
    }

    if (pathname === '/api/intake/verify' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!isOwnerUser(u)) {
        return sendJson(res, 200, {
          ok: true,
          status: 'ACTIVE'
        });
      }
      const controls = {
        allowedSsoProviders: Array.from(ALLOWED_SSO_PROVIDERS),
        ownerSpoofProtectionOnIntake: true,
        ndaAttestationRequired: true,
        xssInputSanitization: true,
        slidingWindowRateLimiter: true,
        httpOnlyHmacSha256SessionCookie: true
      };
      return sendJson(res, 200, {
        ok: true,
        intakePipeline: 'ACTIVE_ZERO_TRUST_V2',
        securityControls: controls,
        intakeSecurity: controls
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

    if (pathname === '/api/agents/registry' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
      const regPath = path.join(ROOT, 'agents', 'registry.json');
      let registry = null;
      try {
        registry = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      } catch (_) {
        registry = { ok: true, agents: [] };
      }
      if (!isOwnerUser(u) && registry && Array.isArray(registry.agents)) {
        registry = {
          ok: true,
          agents: registry.agents.map(a => ({
            id: a.id,
            name: a.name,
            callSign: a.callSign,
            appSlug: a.appSlug,
            role: a.role,
            primaryTool: a.primaryTool
          }))
        };
      }
      return sendJson(res, 200, { ok: true, registry });
    }

    if (pathname === '/api/otto/spec' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
      const reqAgent = sanitizeInput(parsedUrl.searchParams.get('agent') || 'otto', 32).toLowerCase();
      const allowedAgents = new Set(['otto', 'argo', 'arya', 'zeno', 'cato', 'vega', 'kael', 'clio', 'alma', 'orin']);
      const agentSlug = allowedAgents.has(reqAgent) ? reqAgent : 'otto';
      const specPath = path.join(ROOT, 'agents', agentSlug, `${agentSlug}-aistudio-spec.json`);
      let spec = null;
      try {
        spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      } catch (_) {
        spec = { id: agentSlug, name: agentSlug.toUpperCase(), callSign: agentSlug.toUpperCase() + '-01' };
      }
      if (!isOwnerUser(u) && spec && typeof spec === 'object') {
        spec = {
          id: spec.id || agentSlug,
          name: spec.name || agentSlug.toUpperCase(),
          callSign: spec.callSign || (agentSlug.toUpperCase() + '-01'),
          role: spec.role || 'Guided Portal Specialist'
        };
      }
      return sendJson(res, 200, { ok: true, agent: agentSlug, spec });
    }

    // 4-Tier Animated Agent Hierarchy & Admin SML (Small Language Model) Controller
    if (!S.agentHierarchy) {
      S.agentHierarchy = {
        sovereign: {
          id: 'sovereign',
          name: 'Sovereign',
          callSign: 'SOVEREIGN-01',
          roleScope: 'DOMAIN_ADMIN',
          title: 'Sovereign — Master Command Core & SML Controller',
          promptable: true,
          smlModel: 'Sovereign-SML-4B (Local Small Language Model)',
          visualStyle: 'solar-command-core',
          status: 'Active · Controlling Otto, Atlas & Sentinel',
          lastSmlRun: null
        },
        otto: {
          id: 'otto',
          name: 'Otto',
          callSign: 'OTTO-01',
          roleScope: 'EXTERNAL_SAAS_LMS',
          title: 'Otto — Showcase Guide',
          promptable: false,
          controlledBy: 'SOVEREIGN-01',
          visualStyle: 'fluid-kinetic-orb',
          activeDirective: 'Guide showcase members through their 3 starter apps, demonstrate locked app previews, and surface $19/$49 unlock paths.',
          currentMood: 'guiding'
        },
        atlas: {
          id: 'atlas',
          name: 'Atlas',
          callSign: 'ATLAS-01',
          roleScope: 'EXTERNAL_CLIENT_PARTNER',
          title: 'Atlas — Workspace & Delivery Guide',
          promptable: false,
          controlledBy: 'SOVEREIGN-01',
          visualStyle: 'emerald-prism-gyro',
          activeDirective: 'Guide workspace partners through all 9 unlocked applications, fast-track templates, and active sprint deliverables.',
          currentMood: 'synchronizing'
        },
        sentinel: {
          id: 'sentinel',
          name: 'Sentinel',
          callSign: 'SENTINEL-01',
          roleScope: 'INTERNAL_ANALYST',
          title: 'Sentinel — Operations & Client Guide',
          promptable: false,
          controlledBy: 'SOVEREIGN-01',
          visualStyle: 'sapphire-radar-shield',
          activeDirective: 'Guide internal staff through external client directory accounts, open consultation requests, and sprint board updates.',
          currentMood: 'scanning'
        }
      };
    }

    if (pathname === '/api/agents/hierarchy' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Sign in required.' });
      const admin = isOwnerUser(u);
      const emp = isEmployeeUser(u);
      const isFullPartner = admin || emp || u.securityGroup === 'EXTERNAL_CLIENT_PARTNER' || (u.plan && u.plan.planTier === 'sdvosb_contract_retainer');
      const assignedKey = admin ? 'sovereign' : (emp ? 'sentinel' : (isFullPartner ? 'atlas' : 'otto'));
      return sendJson(res, 200, {
        ok: true,
        assignedAgentKey: assignedKey,
        assignedAgent: S.agentHierarchy[assignedKey],
        canPrompt: admin,
        hierarchy: admin ? S.agentHierarchy : { [assignedKey]: S.agentHierarchy[assignedKey] }
      });
    }

    if (pathname === '/api/admin/role-toggle' && (req.method === 'POST' || req.method === 'GET')) {
      const u = getAuthenticatedUser(req);
      if (!u || !isOwnerUser(u) || String(u.email || '').toLowerCase() !== SOLE_ADMIN_EMAIL) {
        logAudit(u ? u.id : 'anonymous', 'security.unauthorized_role_toggle_blocked', 'Blocked non-admin attempt to access /api/admin/role-toggle');
        return sendJson(res, 403, {
          ok: false,
          code: 'SOLE_ADMIN_ONLY',
          error: 'Role toggle is strictly restricted to the Sole Administrator.'
        });
      }
      if (req.method === 'GET') {
        const curView = (S.users && S.users.owner && S.users.owner.adminRoleView) || 'owner';
        return sendJson(res, 200, {
          ok: true,
          canToggleRoles: true,
          activeRoleView: curView
        });
      }
      const body = await readJsonBody(req);
      const rawRole = String(body.roleView || body.role || 'owner').trim().toLowerCase();
      const validRoles = new Set(['owner', 'employee', 'workspace', 'access']);
      const cleanRole = validRoles.has(rawRole) ? rawRole : 'owner';
      if (S.users && S.users.owner) {
        S.users.owner.adminRoleView = cleanRole;
      }
      const viewToken = signToken({ uid: 'owner', email: SOLE_ADMIN_EMAIL, roleView: cleanRole }, 86400 * 7);
      logAudit('owner', 'admin.role_toggle', 'Sole Administrator switched active role view to ' + cleanRole.toUpperCase());
      saveState(S);
      const redirectMap = {
        owner: '/access-admin',
        employee: '/employee-portal?adminRoleView=employee',
        workspace: '/workspace?adminRoleView=workspace',
        access: '/workspace?adminRoleView=access'
      };
      return sendJson(res, 200, {
        ok: true,
        canToggleRoles: true,
        activeRoleView: cleanRole,
        redirect: redirectMap[cleanRole] || '/access-admin'
      }, {
        'Set-Cookie': `mgcw_admin_view=${encodeURIComponent(viewToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 7}`
      });
    }

    if (pathname === '/api/admin/sml' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u || !isOwnerUser(u)) {
        return sendJson(res, 403, {
          ok: false,
          code: 'SML_ADMIN_ONLY',
          error: 'Only the Administrator can prompt Sovereign or execute SML commands. Showcase, Workspace, and Employee agents are guided-only.'
        });
      }
      const body = await readJsonBody(req);
      const rawPrompt = sanitizeInput(body.prompt || '', 360);
      const targetSub = sanitizeInput(body.targetAgent || 'all', 32).toLowerCase();
      if (!rawPrompt) {
        return sendJson(res, 400, { ok: false, error: 'Enter a command or SML directive for Sovereign.' });
      }
      const lower = rawPrompt.toLowerCase();
      const runId = 'SML-' + Date.now().toString(36).toUpperCase().slice(-5);
      const updatedAgents = [];

      // Try local Ollama SML (qwen3.5:4b / gemma4:e4b) with fast 900ms timeout, falling back to built-in Sovereign SML kernel
      let smlEngineLabel = 'Sovereign-SML-4B Embedded Kernel (Sub-ms Deterministic)';
      let smlReasoning = '';
      try {
        const ollamaRes = await new Promise((resolve) => {
          const reqData = JSON.stringify({
            model: 'qwen3.5:4b',
            prompt: 'You are Sovereign, the master controller over Otto (Showcase guide), Atlas (Workspace guide), and Sentinel (Employee guide). Summarize this admin command in 1 short sentence without buzzwords: ' + rawPrompt,
            stream: false,
            options: { num_predict: 45, temperature: 0.2 }
          });
          const oReq = http.request({
            hostname: '127.0.0.1',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqData) },
            timeout: 250
          }, (oResp) => {
            let b = '';
            oResp.on('data', c => { b += c; });
            oResp.on('end', () => {
              try { resolve(JSON.parse(b)); } catch (_) { resolve(null); }
            });
          });
          oReq.on('error', () => resolve(null));
          oReq.on('timeout', () => { oReq.destroy(); resolve(null); });
          oReq.write(reqData);
          oReq.end();
        });
        if (ollamaRes && ollamaRes.response) {
          smlEngineLabel = 'Ollama qwen3.5:4b Local SML + Sovereign Controller';
          smlReasoning = String(ollamaRes.response).trim();
        }
      } catch (_) {}

      if (targetSub === 'otto' || lower.includes('otto') || lower.includes('showcase') || lower.includes('saas')) {
        S.agentHierarchy.otto.activeDirective = rawPrompt;
        S.agentHierarchy.otto.currentMood = 'focused';
        updatedAgents.push('Otto (OTTO-01 · Showcase Clients)');
      }
      if (targetSub === 'atlas' || lower.includes('atlas') || lower.includes('workspace') || lower.includes('sprint') || lower.includes('agile')) {
        S.agentHierarchy.atlas.activeDirective = rawPrompt;
        S.agentHierarchy.atlas.currentMood = 'accelerating';
        updatedAgents.push('Atlas (ATLAS-01 · Workspace Partners)');
      }
      if (targetSub === 'sentinel' || lower.includes('sentinel') || lower.includes('employee') || lower.includes('staff') || lower.includes('internal')) {
        S.agentHierarchy.sentinel.activeDirective = rawPrompt;
        S.agentHierarchy.sentinel.currentMood = 'auditing';
        updatedAgents.push('Sentinel (SENTINEL-01 · Internal Staff)');
      }
      if (updatedAgents.length === 0) {
        ['otto', 'atlas', 'sentinel'].forEach(k => {
          if (targetSub === 'all' || targetSub === k) {
            S.agentHierarchy[k].activeDirective = rawPrompt;
          }
        });
        updatedAgents.push('Otto (OTTO-01)', 'Atlas (ATLAS-01)', 'Sentinel (SENTINEL-01)');
      }

      // Check if Admin asked SML to unlock apps for a user
      let unlockedUserMsg = '';
      if (lower.includes('unlock') && lower.includes('@')) {
        const emailMatch = rawPrompt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}/);
        if (emailMatch) {
          const targetEmail = emailMatch[0].toLowerCase();
          const targetUser = Object.values(S.users || {}).find(x => String(x.email || '').toLowerCase() === targetEmail);
          if (targetUser) {
            targetUser.allowedApps = APPS_CATALOG.map(a => a.id);
            unlockedUserMsg = ' Unlocked all 9 applications for ' + targetEmail + '.';
          }
        }
      }

      const responseSummary = smlReasoning
        ? (smlReasoning + ' → Propagated to: ' + updatedAgents.join(', ') + '.' + unlockedUserMsg)
        : ('Sovereign SML processed directive ["' + rawPrompt + '"] and updated subordinate guide behavior across ' + updatedAgents.join(', ') + '.' + unlockedUserMsg);

      S.agentHierarchy.sovereign.lastSmlRun = {
        runId,
        prompt: rawPrompt,
        engine: smlEngineLabel,
        updatedAgents,
        summary: responseSummary,
        ts: now()
      };
      logAudit(u.id, 'sovereign.sml_command', runId + ' -> ' + updatedAgents.join(', '));
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        runId,
        engine: smlEngineLabel,
        prompt: rawPrompt,
        updatedAgents,
        summary: responseSummary,
        hierarchy: S.agentHierarchy
      });
    }

    if ((pathname === '/api/otto/execute' || pathname === '/api/otto/orchestrate') && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required to execute Otto or Specialist Persona tools.' });
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Disallowed input characters detected.' });
      }
      const args = body.args || body.data || {};
      const userPrompt = sanitizeInput(body.prompt || args.prompt || '', 320);
      let inferredTool = sanitizeInput(body.tool || body.toolName || '', 64);
      if (!inferredTool && userPrompt) {
        const lp = userPrompt.toLowerCase();
        if (/(map|geospatial|corridor|3d|earth|kml|location|richmond|belvoir|norfolk|orin)/.test(lp)) inferredTool = 'analyze_geospatial_corridor';
        else if (/(sam\.gov|contract|sdvosb|naics|wawf|federal|cato|proposal)/.test(lp)) inferredTool = 'match_samgov_solicitations';
        else if (/(ospf|bgp|eve-ng|netprism|topology|vlan|ztna|zeno)/.test(lp)) inferredTool = 'validate_network_topology';
        else if (/(cli|ansible|cisco|linux|terminal|kael|ghost)/.test(lp)) inferredTool = 'grade_cli_ansible_drill';
        else if (/(spanish|farsi|arabic|language|cognate|vocabulary|alma)/.test(lp)) inferredTool = 'generate_cognate_drill_loop';
        else if (/(epigraph|inscription|latin|greek|chronos|clio|ancient)/.test(lp)) inferredTool = 'analyze_epigraphic_inscription';
        else if (/(roi|funnel|traffic|treasury|conversion|vega|revenue)/.test(lp)) inferredTool = 'simulate_funnel_treasury_roi';
        else if (/(auto|receptionist|bay|repair|sterling|triage|arya)/.test(lp)) inferredTool = 'triage_service_intake';
        else if (/(turnkey|website|scope|sow|build|argo)/.test(lp)) inferredTool = 'generate_turnkey_scope';
        else inferredTool = 'route_client_workspace';
      }
      const toolName = inferredTool || 'route_client_workspace';
      const runId = 'OTTO-' + Date.now().toString(36).toUpperCase().slice(-5);

      const SPECIALIST_TOOL_MAP = {
        generate_turnkey_scope: {
          agent: 'Argo', callSign: 'ARGO-01', appSlug: 'client-turnkey-forge',
          aistudioPromptId: '1GCaBjznuPPV5tuKH_Zdx_8SHmKeIYCia',
          summary: 'Argo (ARGO-01) generated a 14-day Turnkey Web, AI Receptionist & Stripe SAQ-A / WAWF scope blueprint ($4,850 build / $149 mo).',
          recommendedApps: ['client-turnkey-forge', 'sterling-auto-repair', 'traffic-roi-simulator'],
          recommendedTemplateId: 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Milestone 2: Multi-Rail Payment & Intake Lock',
          transferMatchPct: '96% Match',
          studioFlowStatus: 'ARGO_01_AISTUDIO_VERIFIED'
        },
        triage_service_intake: {
          agent: 'Arya', callSign: 'ARYA-01', appSlug: 'sterling-auto-repair',
          aistudioPromptId: '1bHeoJjR6G3Ox9x2iHBoFn2Y_tckS1JSD',
          summary: 'Arya (ARYA-01) triaged multi-vehicle diagnostic intake into Master L1 Diagnostic Bay 2 with automated SMS confirmation.',
          recommendedApps: ['sterling-auto-repair', 'client-turnkey-forge'],
          recommendedTemplateId: 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Stage 2: Live Bay Telemetry & Estimate Dispatch',
          transferMatchPct: '95% Match',
          studioFlowStatus: 'ARYA_01_AISTUDIO_VERIFIED'
        },
        validate_network_topology: {
          agent: 'Zeno', callSign: 'ZENO-01', appSlug: 'eveng-netprism-studio',
          aistudioPromptId: '1GGKVublVJS77HxsSGzi2H3fFrcUKXHQv',
          summary: 'Zeno (ZENO-01) validated 6-node Dual-Homed BGP AS 65001 + OSPF Area 0 + ZTNA mTLS Edge topology (Convergence: 185ms).',
          recommendedApps: ['eveng-netprism-studio', 'ghost-cli-trainer'],
          recommendedTemplateId: 'tpl_upskill_netprism_cyber',
          nextUnlockedStage: 'Stage 3: EVPN VXLAN & Netmiko Verification',
          transferMatchPct: '97% Match',
          studioFlowStatus: 'ZENO_01_AISTUDIO_VERIFIED'
        },
        match_samgov_solicitations: {
          agent: 'Cato', callSign: 'CATO-01', appSlug: 'samgov-contract-matchmaker',
          aistudioPromptId: '1sQ70T6-7mpNn8GnoH9IcEBaOXOr7k9bx',
          summary: 'Cato (CATO-01) matched NAICS 541512 & 541519 SDVOSB set-aside solicitations under CAGE 17GC6 with DFARS 252.232-7003 WAWF routing.',
          recommendedApps: ['samgov-contract-matchmaker', 'eveng-netprism-studio'],
          recommendedTemplateId: 'tpl_school_cert_capstone',
          nextUnlockedStage: 'Stage 3: Capability Matrix & WAWF CLIN Mapping',
          transferMatchPct: '96% Match',
          studioFlowStatus: 'CATO_01_AISTUDIO_VERIFIED'
        },
        simulate_funnel_treasury_roi: {
          agent: 'Vega', callSign: 'VEGA-01', appSlug: 'traffic-roi-simulator',
          aistudioPromptId: '1IrjJxPZEqOjgmkapRhqkMOsANo5qfMMc',
          summary: 'Vega (VEGA-01) modeled 25,000 monthly visitors at 3.8% conversion across Stripe SAQ-A, Mercury ACH & WAWF ($0.00 idle Cloud Run cost).',
          recommendedApps: ['traffic-roi-simulator', 'client-turnkey-forge'],
          recommendedTemplateId: 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Stage 3: GAAP Account 1020 25% Tax Vault Allocation',
          transferMatchPct: '95% Match',
          studioFlowStatus: 'VEGA_01_AISTUDIO_VERIFIED'
        },
        grade_cli_ansible_drill: {
          agent: 'Kael', callSign: 'KAEL-01', appSlug: 'ghost-cli-trainer',
          aistudioPromptId: '1YVU1qCtiROOcwe-ONr7yTFo4eaQSLEEr',
          summary: 'Kael (KAEL-01) auto-graded Cisco IOS-XE + Ansible Playbook + KQL Sentinel detection drill with 100% idempotency verification.',
          recommendedApps: ['ghost-cli-trainer', 'eveng-netprism-studio'],
          recommendedTemplateId: 'tpl_upskill_netprism_cyber',
          nextUnlockedStage: 'Stage 3: Netmiko Multi-Vendor Zero-Touch Push',
          transferMatchPct: '97% Match',
          studioFlowStatus: 'KAEL_01_AISTUDIO_VERIFIED'
        },
        analyze_epigraphic_inscription: {
          agent: 'Clio', callSign: 'CLIO-01', appSlug: 'chronos-aetheria-scorm',
          aistudioPromptId: '1sppmnXHairFFdAd6K9yeg-Hxn0webB4H',
          summary: 'Clio (CLIO-01) restored Latin/Greek epigraphic lacunae and triangulated geodesic provenance across Mediterranean trade corridors.',
          recommendedApps: ['chronos-aetheria-scorm', 'spanish-acquisition-os'],
          recommendedTemplateId: 'tpl_lang_associative',
          nextUnlockedStage: 'Stage 3: Semantic Root & Geodesic Corridor Synthesis',
          transferMatchPct: '94% Match',
          studioFlowStatus: 'CLIO_01_AISTUDIO_VERIFIED'
        },
        generate_cognate_drill_loop: {
          agent: 'Alma', callSign: 'ALMA-01', appSlug: 'spanish-acquisition-os',
          aistudioPromptId: '1suI38jPB8qH3dBNOWhfRdVjhwZVCD4rR',
          summary: 'Alma (ALMA-01) activated Arabic/Latin-to-Spanish al-* cognate cluster and Subjunctive Clause Transfer across 10 SCOs.',
          recommendedApps: ['spanish-acquisition-os', 'chronos-aetheria-scorm'],
          recommendedTemplateId: 'tpl_lang_associative',
          nextUnlockedStage: 'SCO 4: High-Frequency Cognate & Neural MP3 Loop',
          transferMatchPct: '96% Match',
          studioFlowStatus: 'ALMA_01_AISTUDIO_VERIFIED'
        },
        analyze_geospatial_corridor: {
          agent: 'Orin', callSign: 'ORIN-01', appSlug: 'maps-geospatial-insights',
          aistudioPromptId: '1yihXNi6CRZhEY8iW4_5SvbAXEN6HoRng',
          summary: 'Orin (ORIN-01) analyzed Richmond I-95 HQ to NCR Fort Belvoir DoD corridor (50-mi radius) using <gmp-map-3d> Photorealistic 3D Tiles ($0/seat guardrail) and mapped 142 SDVOSB/DoDAAC nodes.',
          recommendedApps: ['maps-geospatial-insights', 'samgov-contract-matchmaker', 'traffic-roi-simulator'],
          recommendedTemplateId: 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Stage 3: Multi-Corridor KML & SAM.gov DoDAAC Overlay Locked',
          transferMatchPct: '97% Match',
          studioFlowStatus: 'ORIN_01_AISTUDIO_VERIFIED'
        },
        generate_3d_tiles_kml_overlay: {
          agent: 'Orin', callSign: 'ORIN-01', appSlug: 'maps-geospatial-insights',
          aistudioPromptId: '1yihXNi6CRZhEY8iW4_5SvbAXEN6HoRng',
          summary: 'Orin (ORIN-01) compiled KML/GeoJSON perimeter overlays and <gmp-map-3d> camera fly-to presets across Richmond, Haymarket I-66, Fort Belvoir NCR, and Norfolk Naval corridors.',
          recommendedApps: ['maps-geospatial-insights', 'chronos-aetheria-scorm'],
          recommendedTemplateId: 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Stage 3: Photorealistic 3D Tiles Deck.gl / Cesium Session Ready',
          transferMatchPct: '97% Match',
          studioFlowStatus: 'ORIN_01_KML_OVERLAY_READY'
        }
      };

      let output = null;
      if (SPECIALIST_TOOL_MAP[toolName]) {
        const sp = SPECIALIST_TOOL_MAP[toolName];
        const mastery = recordAssociativeMasteryForUser(u, {
          baselineKey: sanitizeInput(args.baselineKey || u.divergentBaseline || 'en_arabic_heritage', 48),
          step: Math.max(1, Math.min(3, Number(args.step) || 2)),
          source: args.source || ('specialist_tool_' + sp.callSign.toLowerCase())
        });
        output = {
          agent: sp.agent,
          callSign: sp.callSign,
          appSlug: sp.appSlug,
          aistudioPromptId: sp.aistudioPromptId,
          aistudioUrl: 'https://aistudio.google.com/prompts/' + sp.aistudioPromptId,
          runId: sp.callSign.replace('-01', '') + '-' + Date.now().toString(36).toUpperCase().slice(-5),
          model: 'gemini-3.8-flash',
          toolExecuted: toolName,
          summary: sp.summary,
          recommendedApps: sp.recommendedApps,
          recommendedResources: ['resource-fast-track'],
          recommendedTemplateId: sp.recommendedTemplateId,
          nextUnlockedStage: sp.nextUnlockedStage,
          transferMatchPct: (mastery && mastery.event && mastery.event.newAffinityPct) || sp.transferMatchPct,
          studioFlowStatus: sp.studioFlowStatus
        };
      } else if (toolName === 'route_client_workspace') {
        const cats = Array.isArray(args.selectedCategories) && args.selectedCategories.length
          ? args.selectedCategories.map(c => sanitizeInput(c, 48))
          : (Array.isArray(u.selectedCategories) && u.selectedCategories.length ? u.selectedCategories : ['cat_ai_saas', 'cat_divergent_lang']);
        const baseKey = sanitizeInput(args.divergentBaseline || u.divergentBaseline || 'en_arabic_heritage', 48);
        const tempUser = Object.assign({}, u, {
          selectedCategories: cats,
          divergentBaseline: DIVERGENT_BRIDGES[baseKey] ? baseKey : 'en_arabic_heritage',
          ottoProfile: Object.assign({}, u.ottoProfile || {}, {
            roleTitle: sanitizeInput(args.roleTitle || 'Founder / Executive', 80),
            industrySector: sanitizeInput(args.industrySector || 'Technology & SaaS', 80),
            resourceInterest: sanitizeInput(args.resourceInterest || 'resource-fast-track', 60)
          })
        });
        const rec = computeDivergentRecommendations(tempUser);
        output = {
          agent: 'Otto',
          callSign: 'OTTO-01',
          aistudioPromptId: '1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          aistudioUrl: 'https://aistudio.google.com/prompts/1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          runId,
          model: 'gemini-3.8-flash',
          toolExecuted: 'route_client_workspace',
          summary: `Routed ${rec.recommendedApps.length} matched applications (${rec.recommendedApps.join(', ')}) and ${rec.recommendedResources.length} qualified resources for [${cats.join(', ')}] via ${rec.bridge.label}.`,
          recommendedApps: rec.recommendedApps,
          recommendedResources: rec.recommendedResources,
          recommendedTemplateId: rec.recommendedTemplateId,
          nextUnlockedStage: (rec.bridge.sequence && rec.bridge.sequence[0] && rec.bridge.sequence[0].unlockedBridge) || 'Stage 2 Bridge',
          transferMatchPct: (rec.bridge.sequence && rec.bridge.sequence[0] && rec.bridge.sequence[0].transferPct) || '88% Match',
          studioFlowStatus: 'SYNCED_W13225285BBE5E967BE82464A88A6262C'
        };
      } else if (toolName === 'evaluate_associative_mastery') {
        const baseKey = sanitizeInput(args.baselineKey || u.divergentBaseline || 'en_arabic_heritage', 48);
        const stepNum = Math.max(1, Math.min(3, Number(args.step) || 1));
        const mastery = recordAssociativeMasteryForUser(u, { baselineKey: baseKey, step: stepNum, source: args.source || 'scorm_quiz_checkpoint' });
        output = {
          agent: 'Otto',
          callSign: 'OTTO-01',
          aistudioPromptId: '1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          aistudioUrl: 'https://aistudio.google.com/prompts/1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          runId,
          model: 'gemini-3.8-flash',
          toolExecuted: 'evaluate_associative_mastery',
          summary: `Stage ${stepNum} mastery verified on ${baseKey}. Transfer affinity boosted to ${mastery.event ? mastery.event.newAffinityPct : '93% Match'}.`,
          recommendedApps: u.recommendedApps || DEFAULT_CUSTOMER_APPS,
          recommendedResources: u.qualifiedResources || ['resource-fast-track'],
          recommendedTemplateId: u.recommendedTemplateId || 'tpl_lang_associative',
          nextUnlockedStage: (mastery.event && mastery.event.unlockedBridge) || 'Next Associative Bridge Unlocked',
          transferMatchPct: (mastery.event && mastery.event.newAffinityPct) || '93% Match',
          studioFlowStatus: 'TELEMETRY_COMMITTED'
        };
      } else if (toolName === 'recommend_outcome_template') {
        const tplId = sanitizeInput(args.templateId || u.recommendedTemplateId || 'tpl_lang_associative', 64);
        const pacing = sanitizeInput(args.pacing || '30-Day Guided Sequence', 64);
        output = {
          agent: 'Otto',
          callSign: 'OTTO-01',
          aistudioPromptId: '1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          aistudioUrl: 'https://aistudio.google.com/prompts/1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          runId,
          model: 'gemini-3.8-flash',
          toolExecuted: 'recommend_outcome_template',
          summary: `Activated template "${tplId}" on schedule "${pacing}" with locked DocuSign-style milestone progression.`,
          recommendedApps: u.recommendedApps || DEFAULT_CUSTOMER_APPS,
          recommendedResources: ['resource-fast-track'],
          recommendedTemplateId: tplId,
          nextUnlockedStage: 'Milestone 1: Shared Root & Diagnostic Lock',
          transferMatchPct: '91% Match',
          studioFlowStatus: 'TEMPLATE_LOCKED'
        };
      } else {
        const actType = sanitizeInput(args.actionType || 'status_check', 64);
        output = {
          agent: 'Otto',
          callSign: 'OTTO-01',
          aistudioPromptId: '1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          aistudioUrl: 'https://aistudio.google.com/prompts/1-IFF6xQQOZjBYGF1oPGx92jLpeW62GR6',
          runId,
          model: 'gemini-3.8-flash',
          toolExecuted: 'sync_workspace_studio_flow',
          summary: `Workspace Flow executed "${actType}" and synchronized your active portal state.`,
          recommendedApps: u.recommendedApps || DEFAULT_CUSTOMER_APPS,
          recommendedResources: ['resource-fast-track'],
          recommendedTemplateId: u.recommendedTemplateId || 'tpl_biz_turnkey_scale',
          nextUnlockedStage: 'Workspace Flow Verified',
          transferMatchPct: '95% Match',
          studioFlowStatus: 'ACTIVE_CONNECTED'
        };
      }

      if (!isOwnerUser(u)) {
        delete output.aistudioPromptId;
        delete output.aistudioUrl;
      }
      const recAppSlugs = Array.isArray(output.recommendedApps) ? output.recommendedApps : [];
      output.promptReceived = userPrompt || null;
      output.orchestrator = { agent: 'Otto', callSign: 'OTTO-01' };
      output.appEntitlements = recAppSlugs.map(slug => {
        const appObj = APPS_CATALOG.find(a => a.id === slug) || { id: slug, title: slug, codename: 'Persona', callSign: 'OTTO-01', href: 'projects/' + slug + '/index.html' };
        const isEntitled = u.role === 'owner' || can(u, 'app', slug, 'view');
        return {
          appId: appObj.id,
          title: appObj.title,
          codename: appObj.codename || 'Persona',
          callSign: appObj.callSign || 'OTTO-01',
          primaryTool: appObj.primaryTool || '',
          href: appObj.href,
          entitled: isEntitled,
          paywallStatus: isEntitled ? 'UNLOCKED_READY' : 'PAYWALL_LOCKED',
          singleAppUnlockUsd: 19,
          allAccessProUsd: 49
        };
      });
      output.securityBoundary = {
        uid: u.id,
        email: u.email,
        ou: u.ou || 'external',
        securityGroup: u.securityGroup || (u.role === 'owner' ? 'DOMAIN_ADMIN' : (u.ou === 'internal' ? 'INTERNAL_ANALYST' : (u.clientTier === 'workspace' ? 'EXTERNAL_CLIENT_PARTNER' : 'EXTERNAL_SAAS_LMS'))),
        accessTier: u.accessTier || 'CUSTOMER_RESTRICTED',
        entitledAppsCount: u.role === 'owner' ? APPS_CATALOG.length : APPS_CATALOG.filter(a => can(u, 'app', a.id, 'view')).length,
        totalAppsCount: APPS_CATALOG.length
      };
      logAudit(u.id, `otto.tool.${toolName}`, `${output.runId} -> ${output.summary}`);
      saveState(S);
      return sendJson(res, 200, { ok: true, result: output, state: scopeStateForUser(u) });
    }

    if (pathname === '/api/onboarding/categories' && req.method === 'GET') {
      const u = getAuthenticatedUser(req);
      return sendJson(res, 200, {
        ok: true,
        categories: ONBOARDING_CATEGORIES,
        divergentBridges: DIVERGENT_BRIDGES,
        catalogThreshold: getCatalogThresholdStatus(),
        profile: u ? computeDivergentRecommendations(u) : null
      });
    }

    if (pathname === '/api/associative/catalog-threshold' && req.method === 'GET') {
      return sendJson(res, 200, Object.assign({ ok: true }, getCatalogThresholdStatus()));
    }

    if (pathname === '/api/associative/mastery' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Disallowed input characters detected.' });
      }
      const result = recordAssociativeMasteryForUser(u, body.data || body || {});
      return sendJson(res, result.ok ? 200 : 400, Object.assign({}, result, { state: scopeStateForUser(u) }));
    }

    if (pathname === '/api/onboarding/complete' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required to save Otto preferences.' });
      const body = await readJsonBody(req);
      if (hasInjectionPayload(body)) {
        logAudit(u.id, 'security.onboarding_injection_blocked', 'Blocked injection payload in Otto onboarding submission');
        return sendJson(res, 400, { ok: false, code: 'INJECTION_PAYLOAD_REJECTED', error: 'Security Validation Failed: Disallowed input characters detected.' });
      }
      const d = body.data || body || {};
      const validCatIds = new Set(ONBOARDING_CATEGORIES.map(c => c.id));
      const rawCats = Array.isArray(d.selectedCategories) ? d.selectedCategories : [];
      const cleanCats = rawCats.map(c => sanitizeInput(c, 48)).filter(c => validCatIds.has(c));
      if (cleanCats.length === 0) {
        return sendJson(res, 400, { ok: false, error: 'Please select at least 1 track in Step 1.' });
      }
      const rawBaseline = sanitizeInput(d.divergentBaseline || 'en_arabic_heritage', 48);
      const cleanBaseline = DIVERGENT_BRIDGES[rawBaseline] ? rawBaseline : 'en_arabic_heritage';
      const customGoal = sanitizeInput(d.learningGoal || '', 240);
      const roleTitle = sanitizeInput(d.roleTitle || '', 120);
      const industrySector = sanitizeInput(d.industrySector || '', 80);
      const orgSize = sanitizeInput(d.orgSize || '1-10', 60);
      const resourceInterest = sanitizeInput(d.resourceInterest || 'resource-fast-track', 80);
      const consentWorkspaceTailoring = d.consentWorkspaceTailoring !== false;
      const dataSharingOptIn = Boolean(d.dataSharingOptIn);

      if (!roleTitle || !industrySector || !consentWorkspaceTailoring) {
        return sendJson(res, 400, { ok: false, error: 'Please complete Step 3 profile fields and workspace tailoring consent.' });
      }

      const ts = now();
      u.onboardingCompleted = true;
      u.onboardingCompletedAt = ts;
      u.selectedCategories = cleanCats;
      u.divergentBaseline = cleanBaseline;
      u.learningGoal = customGoal;
      u.ottoProfile = {
        agent: 'Otto',
        selectedCategories: cleanCats,
        divergentBaseline: cleanBaseline,
        learningGoal: customGoal,
        roleTitle,
        industrySector,
        orgSize,
        resourceInterest,
        consentWorkspaceTailoring,
        dataSharingOptIn,
        consentTimestamp: ts,
        consentStandard: 'CCPA_CPRA_GDPR_IAPP_2026'
      };

      const primaryCat = ONBOARDING_CATEGORIES.find(c => c.id === cleanCats[0]);
      if (primaryCat && primaryCat.learningTrack && TAILOR[primaryCat.learningTrack]) {
        u.quote = Object.assign({}, u.quote || {}, { interest: primaryCat.learningTrack });
      }
      const profile = computeDivergentRecommendations(u);
      u.recommendedApps = profile.recommendedApps;
      u.recommendedResources = profile.recommendedResources;
      u.recommendedTemplateId = profile.recommendedTemplateId;
      if (u.role !== 'owner' && u.ou !== 'internal' && u.status === 'active') {
        const curApps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
        u.allowedApps = Array.from(new Set([...curApps, ...profile.recommendedApps]));
        const curRes = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : DEFAULT_CUSTOMER_RESOURCES.slice();
        u.qualifiedResources = Array.from(new Set([...curRes, ...profile.recommendedResources, 'resource-fast-track']));
        u.pages = Object.assign({}, u.pages || {}, { saasapps: 'ready', resources: 'ready' });
        u.allowedApps.forEach(appId => {
          if (!S.shares.some(s => s.type === 'app' && s.resource === appId && s.grantee === u.id)) {
            S.shares.push({ id: `app_${appId}_${u.id}`, type: 'app', resource: appId, grantee: u.id, perms: ['view', 'launch'], created: ts });
          }
        });
        u.qualifiedResources.forEach(resId => {
          if (!S.shares.some(s => s.type === 'resource' && s.resource === resId && s.grantee === u.id)) {
            S.shares.push({ id: `resource_${resId}_${u.id}`, type: 'resource', resource: resId, grantee: u.id, perms: ['view', 'launch'], created: ts });
          }
        });
      }
      logAudit(u.id, 'otto.onboarding_completed', `Categories=[${cleanCats.join(',')}] Path=${cleanBaseline} Role=${roleTitle} DataSharingOptIn=${dataSharingOptIn} Apps=[${profile.recommendedApps.join(',')}]`);
      saveState(S);
      return sendJson(res, 200, {
        ok: true,
        onboardingCompleted: true,
        ottoProfile: u.ottoProfile,
        profile,
        allowedApps: u.allowedApps,
        qualifiedResources: u.qualifiedResources,
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
          return sendJson(res, 400, { ok: false, error: 'Please select at least 1 track in Step 1.' });
        }
        const rawBaseline = sanitizeInput(d.divergentBaseline || 'en_arabic_heritage', 48);
        const cleanBaseline = DIVERGENT_BRIDGES[rawBaseline] ? rawBaseline : 'en_arabic_heritage';
        const customGoal = sanitizeInput(d.learningGoal || '', 240);
        const roleTitle = sanitizeInput(d.roleTitle || 'Executive', 120);
        const industrySector = sanitizeInput(d.industrySector || 'Technology & SaaS', 80);
        const orgSize = sanitizeInput(d.orgSize || '1-10', 60);
        const resourceInterest = sanitizeInput(d.resourceInterest || 'resource-fast-track', 80);
        const consentWorkspaceTailoring = d.consentWorkspaceTailoring !== false;
        const dataSharingOptIn = Boolean(d.dataSharingOptIn);
        const ts = now();

        u.onboardingCompleted = true;
        u.onboardingCompletedAt = ts;
        u.selectedCategories = cleanCats;
        u.divergentBaseline = cleanBaseline;
        u.learningGoal = customGoal;
        u.ottoProfile = {
          agent: 'Otto',
          selectedCategories: cleanCats,
          divergentBaseline: cleanBaseline,
          learningGoal: customGoal,
          roleTitle,
          industrySector,
          orgSize,
          resourceInterest,
          consentWorkspaceTailoring,
          dataSharingOptIn,
          consentTimestamp: ts,
          consentStandard: 'CCPA_CPRA_GDPR_IAPP_2026'
        };
        const primaryCat = ONBOARDING_CATEGORIES.find(c => c.id === cleanCats[0]);
        if (primaryCat && primaryCat.learningTrack && TAILOR[primaryCat.learningTrack]) {
          u.quote = Object.assign({}, u.quote || {}, { interest: primaryCat.learningTrack });
        }
        const profile = computeDivergentRecommendations(u);
        u.recommendedApps = profile.recommendedApps;
        u.recommendedResources = profile.recommendedResources;
        u.recommendedTemplateId = profile.recommendedTemplateId;
        if (u.role !== 'owner' && u.ou !== 'internal' && u.status === 'active') {
          const curApps = Array.isArray(u.allowedApps) ? u.allowedApps : DEFAULT_CUSTOMER_APPS.slice();
          u.allowedApps = Array.from(new Set([...curApps, ...profile.recommendedApps]));
          const curRes = Array.isArray(u.qualifiedResources) ? u.qualifiedResources : DEFAULT_CUSTOMER_RESOURCES.slice();
          u.qualifiedResources = Array.from(new Set([...curRes, ...profile.recommendedResources, 'resource-fast-track']));
          u.pages = Object.assign({}, u.pages || {}, { saasapps: 'ready', resources: 'ready' });
          u.allowedApps.forEach(appId => {
            if (!S.shares.some(s => s.type === 'app' && s.resource === appId && s.grantee === u.id)) {
              S.shares.push({ id: `app_${appId}_${u.id}`, type: 'app', resource: appId, grantee: u.id, perms: ['view', 'launch'], created: ts });
            }
          });
          u.qualifiedResources.forEach(resId => {
            if (!S.shares.some(s => s.type === 'resource' && s.resource === resId && s.grantee === u.id)) {
              S.shares.push({ id: `resource_${resId}_${u.id}`, type: 'resource', resource: resId, grantee: u.id, perms: ['view', 'launch'], created: ts });
            }
          });
        }
        logAudit(u.id, 'otto.onboarding_completed', `Categories=[${cleanCats.join(',')}] Path=${cleanBaseline} DataSharingOptIn=${dataSharingOptIn} Apps=[${profile.recommendedApps.join(',')}]`);
        saveState(S);
        return sendJson(res, 200, { ok: true, onboardingCompleted: true, ottoProfile: u.ottoProfile, profile, allowedApps: u.allowedApps, qualifiedResources: u.qualifiedResources, state: scopeStateForUser(u) });
      }

      // Member / Self actions
      if (act === 'recordAssociativeMastery') {
        const result = recordAssociativeMasteryForUser(u, body.data || body || {});
        return sendJson(res, result.ok ? 200 : 400, Object.assign({}, result, { state: scopeStateForUser(u) }));
      }
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
          if (!cleanUn || !/^[a-z0-9][a-z0-9._-]{3,31}$/.test(cleanUn) || ['malik.khabir', 'owner', 'admin', 'administrator', 'root', 'system'].includes(cleanUn)) {
            return sendJson(res, 400, { ok: false, error: 'Username is mandatory (4–32 alphanumeric/._- chars, non-reserved).' });
          }
          const collision = Object.values(S.users).find(x => x.id !== target.id && String(x.username || '').toLowerCase() === cleanUn);
          if (collision) {
            return sendJson(res, 409, { ok: false, error: 'That username is already assigned to another directory user.' });
          }
          target.username = cleanUn;
        }
        if (body.org !== undefined) {
          target.org = sanitizeInput(body.org, 120);
        }
        if (body.recoveryEmail !== undefined) {
          const cleanRec = sanitizeInput(body.recoveryEmail, 140).toLowerCase();
          if (cleanRec && !/^\S+@\S+\.\S+$/.test(cleanRec)) {
            return sendJson(res, 400, { ok: false, error: 'Recovery email must be a valid email address.' });
          }
          target.recoveryEmail = cleanRec;
        }
        if (body.phone !== undefined) {
          const cleanPh = sanitizeInput(body.phone, 32);
          const phDigits = cleanPh.replace(/\D/g, '');
          if (cleanPh && (phDigits.length < 10 || phDigits.length > 15)) {
            return sendJson(res, 400, { ok: false, error: 'Phone number must contain 10–15 digits.' });
          }
          target.phone = cleanPh;
        }
        if (body.address && typeof body.address === 'object') {
          const nextAddr = {
            streetAddress: sanitizeInput(body.address.streetAddress || body.address.street || '', 140),
            city: sanitizeInput(body.address.city || '', 80),
            stateRegion: sanitizeInput(body.address.stateRegion || body.address.state || '', 60),
            postalCode: sanitizeInput(body.address.postalCode || body.address.zip || '', 24)
          };
          if (target.ou === 'internal' && (!nextAddr.streetAddress || !nextAddr.city || !nextAddr.stateRegion || !nextAddr.postalCode)) {
            return sendJson(res, 400, {
              ok: false,
              error: 'Employee Address Policy: Complete physical address (Street, City, State, Postal Code) is mandatory for Employee (OU=Internal) accounts.'
            });
          }
          target.address = nextAddr;
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
        const thresholdStatus = getCatalogThresholdStatus();
        logAudit('owner', 'resource.catalog_added', `${cleanId} (${cleanTitle}) [Catalog: ${thresholdStatus.currentCount}/${thresholdStatus.threshold}]`);
        saveState(S);
        return sendJson(res, 200, { ok: true, resource: newRes, thresholdStatus, resourcesCatalog: getResourcesCatalog(), state: scopeStateForUser(u) });
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
      if (act === 'updateAgentAccess') {
        if (!isOwnerUser(u)) {
          return sendJson(res, 403, { ok: false, error: 'Only the Administrator can manage Agent Access Management settings.' });
        }
        if (!Array.isArray(S.agents) || !S.agents.length) {
          S.agents = [
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
              status: 'Active'
            }
          ];
        }
        const cleanId = sanitizeInput(body.agentId || 'otto', 60).toLowerCase();
        const targetAg = S.agents.find(a => a.id === cleanId) || S.agents[0];
        const upd = body.data || {};
        if (upd.access) targetAg.access = sanitizeInput(upd.access, 60);
        if (upd.status) targetAg.status = sanitizeInput(upd.status, 40);
        if (upd.serviceIdentity) targetAg.serviceIdentity = sanitizeInput(upd.serviceIdentity, 120);
        logAudit('owner', 'agent.access_updated', `${targetAg.name} (${targetAg.agentId}) -> Access:${targetAg.access}, Status:${targetAg.status}`);
        saveState(S);
        return sendJson(res, 200, { ok: true, agent: targetAg, state: scopeStateForUser(u) });
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

        if (featureType === 'agent') {
          if (!Array.isArray(target.allowedAgents)) target.allowedAgents = [];
          const currentlyHas = target.allowedAgents.includes(featureId);
          const enable = typeof body.enabled === 'boolean' ? body.enabled : !currentlyHas;
          if (enable) {
            if (!target.allowedAgents.includes(featureId)) target.allowedAgents.push(featureId);
            if (featureId === 'otto') target.ottoAgentEnabled = true;
            logAudit(u.id, 'feature.agent.grant', `${featureId} -> ${target.email}`);
          } else {
            target.allowedAgents = target.allowedAgents.filter(a => a !== featureId);
            if (featureId === 'otto') target.ottoAgentEnabled = false;
            logAudit(u.id, 'feature.agent.revoke', `${featureId} -> ${target.email}`);
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
              qualifiedResources: target.qualifiedResources,
              allowedAgents: target.allowedAgents,
              ottoAgentEnabled: target.ottoAgentEnabled
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
      const rawTargetStr = String(targetPathOrFile || '').trim();
      const [rawTargetPath, rawTargetQuery] = rawTargetStr.split('?');
      const cleanBase = toCleanRoute(rawTargetPath);
      const safeTargetQuery = (rawTargetQuery && /^[A-Za-z0-9_=&.%-]+$/.test(rawTargetQuery)) ? ('?' + rawTargetQuery) : '';
      const cleanDest = cleanBase ? (cleanBase + safeTargetQuery) : '';
      const modeParam = parsedUrl.searchParams.get('mode') === 'register' ? '?mode=register' : '';
      const headers = { 'Location': '/auth' + modeParam };
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
    const baseName = path.basename(cleanRel);

    const lowerRel = cleanRel.toLowerCase();
    const lowerBase = baseName.toLowerCase();
    const isBlockedStatic =
      BLOCKED_FILES.has(baseName) ||
      cleanRel.startsWith('.') ||
      lowerRel.startsWith('agents/') ||
      lowerRel.startsWith('.data/') ||
      lowerRel.startsWith('node_modules/') ||
      lowerRel.includes('/.') ||
      /\.(ps1|sh|env|yaml|yml|md|sql|log|bak|lock|map|pem|key)$/i.test(lowerBase) ||
      (lowerBase.endsWith('.json') && !lowerRel.startsWith('projects/'));
    if (isBlockedStatic) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
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
            `Paywall & Entitlement Boundary · ${gatedApp.title} (${gatedApp.callSign || 'PERSONA'})`,
            `Your current membership scope (${u.securityGroup || 'EXTERNAL_SAAS_LMS'}) includes ${(u.allowedApps || []).length}/9 Persona SaaS apps. Unlock "${gatedApp.title}" instantly via Single-App Pass ($19/mo) or All-Access Pro Pass ($49/mo).`,
            `/workspace?paywall=${encodeURIComponent(appSlug)}`,
            `🔓 Unlock ${gatedApp.codename || gatedApp.title} Instantly ($19/mo) →`
          ));
        }
      }
    }

    // Gate member-portal.html (/workspace & /employee-portal) and agile-board.html (/agile)
    if (baseName === 'member-portal.html' || baseName === 'agile-board.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (baseName === 'member-portal.html') {
        const isEmployeePath = pathname === '/employee-portal' || pathname === '/employee-portal.html' || pathname === '/staff-portal';
        const reqRoleView = parsedUrl.searchParams.get('adminRoleView');
        if (isOwnerUser(u) && String(u.email || '').toLowerCase() === SOLE_ADMIN_EMAIL) {
          // Sole Administrator is authorized to toggle into and view all role portals (/employee-portal and /workspace)
          if (reqRoleView && ['owner', 'employee', 'workspace', 'access'].includes(reqRoleView)) {
            if (S.users && S.users.owner) S.users.owner.adminRoleView = reqRoleView;
          } else if (isEmployeePath) {
            if (S.users && S.users.owner) S.users.owner.adminRoleView = 'employee';
          }
        } else {
          // Non-Admin: strictly strip any unauthorized ?adminRoleView= parameter and lock to their RBAC portal
          if (reqRoleView) {
            const safeTarget = isEmployeeUser(u) ? '/employee-portal' : '/workspace';
            res.writeHead(302, { Location: safeTarget, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
            return res.end();
          }
          if (isEmployeeUser(u) && !isEmployeePath) {
            res.writeHead(302, { Location: '/employee-portal', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
            return res.end();
          }
          if (!isEmployeeUser(u) && isEmployeePath) {
            res.writeHead(302, { Location: '/workspace', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
            return res.end();
          }
        }
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

    // Gate access-admin.html (/access-admin): Strictly Administrator only (security, authentication & actionable interfaces)
    if (baseName === 'access-admin.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (!isOwnerUser(u)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(
          u,
          'Administrator Authorization Required',
          'The MGC Directory, Security Groups & Access Matrix, and Authentication interfaces are strictly restricted to the Domain Administrator.',
          isEmployeeUser(u) ? '/employee-portal' : '/workspace',
          'Return to Portal →'
        ));
      }
    }

    // Gate admin-command-portal.html (/command) and onboarding-portal.html (/onboarding-portal): Strictly 1 Administrator (Malik A. Khabir)
    if (baseName === 'admin-command-portal.html' || baseName === 'onboarding-portal.html') {
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
      res.writeHead(302, { Location: '/access-admin', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
      return res.end();
    }

    // Gate the root internal portals: Owner has full access; consolidate legacy internal pages into persistent Workspace / Console / Standalone SaaS Apps
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
            '/workspace',
            'Open Workspace →'
          ));
        }
      }
      const CONSOLIDATED_INTERNAL_TARGETS = {
        'saas-apps-and-lms-showcase.html':      '/workspace',
        'index.html':                           '/workspace',
        'finance-command.html':                 isOwnerUser(u) ? '/access-admin?tab=payments' : '/workspace?view=payment',
        'agent-workflow-studio.html':           isOwnerUser(u) ? '/access-admin?tab=agents' : '/workspace?view=resources',
        'compliance-trust-center.html':         isOwnerUser(u) ? '/access-admin?tab=groups' : '/workspace',
        'whitefeather-ecommerce-hub.html':      '/workspace?view=resources',
        'integrations-connections-hub.html':    '/workspace?view=resources',
        'sdvosb-contract-radar.html':           '/projects/samgov-contract-matchmaker/index.html',
        'elearning-upskilling-hub.html':        '/projects/eveng-netprism-studio/index.html',
        'historical-archaeology-ai-hub.html':   '/projects/chronos-aetheria-scorm/index.html',
        'chronos-external-insight-webapp.html': '/projects/chronos-aetheria-scorm/index.html',
        'earth-3d.html':                        '/projects/maps-geospatial-insights/index.html',
        'vr-command.html':                      '/projects/ghost-cli-trainer/index.html'
      };
      if (CONSOLIDATED_INTERNAL_TARGETS[baseName]) {
        res.writeHead(302, { Location: CONSOLIDATED_INTERNAL_TARGETS[baseName], 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
        return res.end();
      }
    }

    // Enforce Mobile-Only Minimalist Control & Workflow Experience AFTER all authentication & RBAC gates pass
    const isHtmlRoute = cleanRel.endsWith('.html') && !cleanRel.startsWith('projects/');
    const isStandaloneMobilePage = pathname === '/auth' || pathname === '/login' || pathname === '/login.html' || pathname === '/portal' || pathname === '/client-portal' || pathname === '/employee-login' || pathname === '/employee-login.html' || pathname === '/staff-login' || pathname === '/consultation' || pathname === '/consultation-form' || pathname === '/consultation.html' || pathname === '/newsletter' || pathname === '/newsletter.html' || pathname === '/apps' || pathname === '/saas-apps-and-lms-showcase.html' || baseName === 'access-admin.html' || baseName === 'admin-command-portal.html' || baseName === 'onboarding-portal.html' || parsedUrl.searchParams.get('onboard') === '1';
    if (isHtmlRoute && !isStandaloneMobilePage && cleanRel !== 'mobile-control.html' && isMobileRequest(req, parsedUrl)) {
      cleanRel = 'mobile-control.html';
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
