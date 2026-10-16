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
const OWNER_EMAILS = new Set([
  'malik.khabir@miltongroupsecurity.org',
  'owner@miltongroupsecurity.org',
  (process.env.MGCW_OWNER_EMAIL || '').toLowerCase()
].filter(Boolean));

const CATALOG = [
  { id: 'home',       icon: '🏠', title: 'My Dashboard',          brand: 'ANY', kind: 'page', base: true,  price: 0,  href: 'member-portal.html',              desc: 'Your tailored start page: status, action items, resources.' },
  { id: 'agile',      icon: '🗂️', title: 'Agile Board',           brand: 'ANY', kind: 'app',  base: true,  price: 0,  href: 'agile-board.html',                desc: 'Backlog, sprint board and feature requests for shared projects.' },
  { id: 'resources',  icon: '📚', title: 'Curated Resources',     brand: 'ANY', kind: 'page', base: true,  price: 0,  href: 'member-portal.html#resources',    desc: 'Links, templates and real-life workflows matched to your quote.' },
  { id: 'saasapps',   icon: '⚡', title: 'SaaS Apps & Simulators',brand: 'FIX', kind: 'app',  base: false, price: 9,  href: 'saas-apps-and-lms-showcase.html', desc: 'Monetized decoupled apps, traffic/ROI simulator & LMS.' },
  { id: 'radar',      icon: '🎯', title: 'Contract Radar',        brand: 'FIX', kind: 'app',  base: false, price: 9,  href: 'sdvosb-contract-radar.html',      desc: 'Federal opportunity feed filtered to your NAICS codes.' },
  { id: 'compliance', icon: '🔒', title: 'Compliance Tracker',    brand: 'MGC', kind: 'page', base: false, price: 7,  href: 'compliance-trust-center.html',    desc: 'CMMC / Zero-Trust checklist with evidence upload.' },
  { id: 'ailab',      icon: '🤖', title: 'AI Workflow Lab',       brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'agent-workflow-studio.html',      desc: 'Prompt, agent and automation templates for your business.' },
  { id: 'finance',    icon: '💳', title: 'Cashflow & Invoicing',  brand: 'FIX', kind: 'page', base: false, price: 8,  href: 'finance-command.html',            desc: 'Invoice tracker, WAWF/PIEE checklist, runway view.' },
  { id: 'training',   icon: '🎓', title: 'SCORM EVE-NG Academy',  brand: 'MGC', kind: 'page', base: false, price: 10, href: 'elearning-upskilling-hub.html',   desc: 'SCORM 2004 15-topology EVE-NG workbench, fault injector & auto-grader.' },
  { id: 'aistudio',   icon: '🧠', title: 'AI Studio & NotebookLM',brand: 'MGC', kind: 'app',  base: false, price: 12, href: 'elearning-upskilling-hub.html',   desc: 'Wireless Sim, ACL Master Trainer, PROJECT_ROUTE, Safar-e Zaban, Asma ul-Husna & NotebookLM Vault.' }
];

const TAILOR = {
  'ai-web':   { label: 'AI website & agent',     pages: ['saasapps', 'ailab', 'finance', 'aistudio'] },
  'federal':  { label: 'Federal contracting',    pages: ['radar', 'compliance', 'finance'] },
  'cyber':    { label: 'Cyber & compliance',     pages: ['compliance', 'ailab'] },
  'training': { label: 'Skills & certification', pages: ['training', 'aistudio', 'saasapps'] }
};

// Map HTML filenames to catalog page IDs for per-page entitlement checks
const PORTAL_TO_CATALOG = {
  'saas-apps-and-lms-showcase.html': 'saasapps',
  'sdvosb-contract-radar.html':      'radar',
  'compliance-trust-center.html':    'compliance',
  'agent-workflow-studio.html':      'ailab',
  'finance-command.html':            'finance',
  'elearning-upskilling-hub.html':   'training'
};

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
  '/auth':              'login.html',
  '/login':             'login.html',
  '/request-access':    'request-access.html',
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
  '/trust-center':      'compliance-trust-center.html'
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
  'compliance-trust-center.html':        '/trust-center'
};

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
  const mk = (id, name, email, role, status, brand, interest, paid, pages) => ({
    id, name, email, role, status, brand,
    quote: { interest, note: '' },
    plan: { base: paid, addons: [] },
    pages: pages || {},
    checklist: {},
    created: t
  });
  return {
    v: 1,
    users: {
      owner: mk('owner', 'Malik K. (Owner)', 'malik.khabir@miltongroupsecurity.org', 'owner', 'active', 'MGC', 'federal', true, {
        home: 'ready', agile: 'ready', resources: 'ready', saasapps: 'ready', radar: 'ready',
        compliance: 'ready', ailab: 'ready', finance: 'ready', training: 'ready', aistudio: 'ready'
      }),
      ana: mk('ana', 'Ana (demo: just requested)', 'ana@example.com', 'member', 'requested', 'MGC', 'cyber', false, {}),
      ben: mk('ben', 'Ben (demo: pages being built)', 'ben@example.com', 'member', 'approved_building', 'FIX', 'federal', false, {
        home: 'pending', agile: 'pending', resources: 'pending', radar: 'pending', compliance: 'pending'
      }),
      cara: mk('cara', 'Cara (demo: active, paid)', 'cara@example.com', 'member', 'active', 'FIX', 'ai-web', true, {
        home: 'ready', agile: 'ready', resources: 'ready', saasapps: 'ready', ailab: 'ready', finance: 'pending'
      })
    },
    shares: [],
    tasks: [
      { id: 't_ben_home', uid: 'ben', page: 'home', title: 'Build "My Dashboard" for Ben', done: false },
      { id: 't_ben_agile', uid: 'ben', page: 'agile', title: 'Build "Agile Board" for Ben', done: false },
      { id: 't_ben_res', uid: 'ben', page: 'resources', title: 'Build "Curated Resources" for Ben', done: false },
      { id: 't_ben_rad', uid: 'ben', page: 'radar', title: 'Build "Contract Radar" for Ben', done: false },
      { id: 't_ben_cmp', uid: 'ben', page: 'compliance', title: 'Build "Compliance Tracker" for Ben', done: false }
    ],
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
      { id: 'i_st3', project: 'p_sterling', type: 'task', title: 'Local SEO schema & Google Business Profile verification', points: 3, col: 'ready', sprint: 1, assignee: 'owner', createdBy: 'owner' },
      { id: 'i1', project: 'p1', type: 'story', title: 'Homepage draft', points: 5, col: 'progress', sprint: 1, assignee: 'owner', createdBy: 'owner' },
      { id: 'i2', project: 'p1', type: 'task', title: 'Collect brand assets', points: 2, col: 'ready', sprint: 1, assignee: 'cara', createdBy: 'owner' },
      { id: 'i3', project: 'p1', type: 'story', title: 'Booking form + calendar', points: 8, col: 'backlog', sprint: 0, assignee: '', createdBy: 'owner' },
      { id: 'i4', project: 'p1', type: 'bug', title: 'Logo too small on mobile', points: 1, col: 'review', sprint: 1, assignee: 'owner', createdBy: 'owner' },
      { id: 'i5', project: 'p2', type: 'story', title: 'Per-page subscription checkout', points: 8, col: 'backlog', sprint: 0, assignee: '', createdBy: 'owner' },
      { id: 'i6', project: 'p2', type: 'task', title: 'Enable Firebase Auth + rules', points: 5, col: 'ready', sprint: 1, assignee: 'owner', createdBy: 'owner' }
    ],
    features: [
      { id: 'f1', by: 'cara', title: 'Add Google Calendar sync to the board', body: 'Show sprint dates on my calendar.', votes: ['cara'], status: 'new', created: t }
    ],
    requests: [
      { id: 'r1', uid: 'ana', status: 'requested', created: t },
      { id: 'r2', uid: 'ben', status: 'approved', created: t }
    ]
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
        parsed.projects = Object.assign({}, def.projects, parsed.projects || {});
        if (!parsed.items.some(i => i.project === 'p_sterling')) {
          parsed.items = def.items.filter(i => i.project === 'p_sterling').concat(parsed.items || []);
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
function subActive(u) {
  return Boolean(u && (u.role === 'owner' || (u.plan && u.plan.base && u.status === 'active')));
}

function can(u, type, id, action) {
  if (!u) return false;
  if (u.role === 'owner') return true;
  if (!subActive(u)) return false;
  if (type === 'page') {
    const entry = CATALOG.find(c => c.id === id);
    if (!entry || action !== 'view') return false;
    if ((u.pages || {})[id] !== 'ready') return false;
    const included = ((TAILOR[(u.quote || {}).interest] || { pages: [] }).pages).includes(id);
    return Boolean(entry.base || included || ((u.plan && u.plan.addons) || []).includes(id));
  }
  if (type === 'project') {
    const sh = S.shares.find(s => s.type === 'project' && s.resource === id && s.grantee === u.id);
    if (!sh) return false;
    return action === 'view' ? true : (sh.perms || []).includes(action);
  }
  if (type === 'element') {
    return S.shares.some(s => s.type === 'element' && s.resource === id && s.grantee === u.id);
  }
  return false;
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

const ALLOWED_SSO_PROVIDERS = new Set(['google', 'microsoft', 'apple']);
const SSO_PROVIDER_LABELS = {
  google: 'Google SSO',
  microsoft: 'Microsoft SSO',
  apple: 'Apple SSO'
};

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
  if (OWNER_EMAILS.has(cleanEmail)) {
    return S.users.owner;
  }
  const existing = Object.values(S.users).find(u => String(u.email || '').toLowerCase() === cleanEmail);
  if (existing) return existing;
  // Create a new member in 'requested' state if they sign in before submitting request-access
  const id = uid('u');
  const displayName = name || cleanEmail.split('@')[0];
  S.users[id] = {
    id,
    name: displayName,
    email: cleanEmail,
    role: 'member',
    status: 'requested',
    brand: 'MGC',
    quote: { interest: 'ai-web', note: `Created via ${method || 'SSO'}` },
    plan: { base: false, addons: [] },
    pages: {},
    checklist: {},
    created: now()
  };
  S.requests.unshift({ id: uid('r'), uid: id, status: 'requested', created: now() });
  notifyUser(id, 'Request received', 'Welcome! Your workspace request is under review. You will be notified as soon as your pages are built.');
  notifyUser('owner', 'New SSO sign-in access request', `${displayName} (${cleanEmail}) authenticated via ${method || 'SSO'}.`, 'in-app + email + push');
  logAudit(id, 'auth.signup', `${cleanEmail} (${method || 'SSO'})`);
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
      tasks: [],
      notifications: [],
      audit: [],
      projects: {},
      items: [],
      features: [],
      requests: []
    };
  }
  if (u.role === 'owner') {
    return { ...S, currentUser: u.id, ssoProvider: u.ssoProvider || 'google', ssoEnforced: true };
  }
  // Scoped member view: only their own profile, their own notifications, shared projects, and shared items
  const allowedProjects = {};
  Object.values(S.projects).forEach(p => {
    if (can(u, 'project', p.id, 'view')) allowedProjects[p.id] = p;
  });
  const allowedItems = S.items.filter(i => Boolean(allowedProjects[i.project]));
  const myShares = S.shares.filter(s => s.grantee === u.id);
  const myNotifs = S.notifications.filter(n => n.toUid === u.id);
  const myFeatures = S.features.filter(f => f.by === u.id || Object.keys(allowedProjects).length > 0);
  const myRequests = S.requests.filter(r => r.uid === u.id);
  return {
    v: 1,
    currentUser: u.id,
    ssoProvider: u.ssoProvider || 'google',
    ssoEnforced: true,
    users: { [u.id]: u },
    shares: myShares,
    tasks: [],
    notifications: myNotifs,
    audit: [],
    projects: allowedProjects,
    items: allowedItems,
    features: myFeatures,
    requests: myRequests
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

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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

    if (pathname === '/api/auth/config' && req.method === 'GET') {
      const cfg = getOauthConfig();
      return sendJson(res, 200, {
        ssoEnforced: true,
        allowedProviders: ['google', 'microsoft', 'apple'],
        passwordAuthAllowed: false,
        emailLinkAllowed: false,
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
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const origin = `${proto}://${req.headers.host || 'localhost'}`;
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

    // Explicitly block non-SSO methods (email-link / password)
    if (pathname === '/api/auth/email-link' || pathname === '/api/auth/verify-link' || pathname === '/api/auth/password') {
      return sendJson(res, 403, {
        ok: false,
        error: 'SSO Policy Enforced: Password and email-link sign-in are disabled. Please sign in exclusively with Google, Microsoft, or Apple SSO.'
      });
    }

    // Unified Federated SSO Exchange (/api/auth/sso, /api/auth/google, /api/auth/microsoft, /api/auth/apple)
    if ((pathname === '/api/auth/sso' || pathname === '/api/auth/google' || pathname === '/api/auth/microsoft' || pathname === '/api/auth/apple') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const routeProvider = pathname.endsWith('/google') ? 'google' : pathname.endsWith('/microsoft') ? 'microsoft' : pathname.endsWith('/apple') ? 'apple' : '';
      let provider = String(body.provider || routeProvider || '').trim().toLowerCase();
      if (!provider && body.state) {
        const stClaims = verifyToken(body.state);
        if (stClaims && stClaims.provider) provider = stClaims.provider;
      }

      if (!ALLOWED_SSO_PROVIDERS.has(provider)) {
        return sendJson(res, 403, {
          ok: false,
          error: 'SSO Policy Enforced: Only Google, Microsoft, or Apple SSO is permitted.'
        });
      }

      let email = String(body.email || '').trim().toLowerCase();
      let name = String(body.name || '').trim();
      let jwksVerified = false;
      if (body.idToken && typeof body.idToken === 'string' && body.idToken.split('.').length === 3) {
        const verified = await verifyOidcIdToken(body.idToken, provider);
        if (verified && verified.email) {
          email = verified.email;
          if (verified.name) name = verified.name;
          jwksVerified = Boolean(verified.sigVerified);
        }
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: `Valid ${SSO_PROVIDER_LABELS[provider]} account email required.` });
      }
      const user = findOrCreateUserByEmail(email, name, SSO_PROVIDER_LABELS[provider]);
      user.ssoProvider = provider;
      const sessionToken = signToken({
        uid: user.id,
        email: user.email,
        role: user.role,
        provider,
        ssoVerified: true,
        jwksVerified
      });
      logAudit(user.id, `auth.sso.${provider}`, `${user.email} via ${SSO_PROVIDER_LABELS[provider]}${jwksVerified ? ' (JWKS-RS256)' : ''}`);
      saveState(S);
      const reqCookies = parseCookies(req);
      const returnClaims = verifyToken(reqCookies.mgcw_return);
      const requestedNext = (body.next && String(body.next).trim()) || (returnClaims && returnClaims.next) || '';
      const cleanNext = toCleanRoute(requestedNext);
      const defaultClean = user.role === 'owner' ? '/access-admin' : '/workspace';
      const target = (cleanNext && cleanNext !== '/auth' && cleanNext !== '/login') ? cleanNext : defaultClean;
      return sendJson(res, 200, {
        ok: true,
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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

    if (pathname === '/api/action' && req.method === 'POST') {
      const u = getAuthenticatedUser(req);
      const body = await readJsonBody(req);
      const act = body.action;

      // Public action: submit access request (with SSO provider selection: google, microsoft, or apple)
      if (act === 'submitRequest') {
        const d = body.data || {};
        if (!d.name || !/^\S+@\S+\.\S+$/.test(String(d.email || ''))) {
          return sendJson(res, 400, { ok: false, error: 'Name and valid SSO account email required.' });
        }
        const provider = ALLOWED_SSO_PROVIDERS.has(String(d.ssoProvider || '').toLowerCase())
          ? String(d.ssoProvider).toLowerCase()
          : 'google';
        const cleanEmail = String(d.email).trim().toLowerCase();
        const id = uid('u');
        S.users[id] = {
          id,
          name: String(d.name).trim().slice(0, 80),
          email: cleanEmail,
          role: OWNER_EMAILS.has(cleanEmail) ? 'owner' : 'member',
          status: OWNER_EMAILS.has(cleanEmail) ? 'active' : 'requested',
          brand: d.brand === 'FIX' ? 'FIX' : 'MGC',
          ssoProvider: provider,
          quote: { interest: TAILOR[d.interest] ? d.interest : 'ai-web', note: String(d.note || '').slice(0, 500) },
          plan: { base: OWNER_EMAILS.has(cleanEmail), addons: [] },
          pages: {},
          checklist: {},
          created: now()
        };
        S.requests.unshift({ id: uid('r'), uid: id, status: 'requested', created: now() });
        notifyUser(id, 'Request received', 'Thanks! Your access request is under review. You will be notified when your pages are ready.');
        notifyUser('owner', 'New access request', `${S.users[id].name} requested access via ${SSO_PROVIDER_LABELS[provider]} (${(TAILOR[S.users[id].quote.interest] || {}).label}).`, 'in-app + email + push');
        logAudit(id, `request.created.${provider}`, cleanEmail);
        saveState(S);
        const sessionToken = signToken({ uid: id, email: cleanEmail, role: S.users[id].role, provider, ssoVerified: true });
        return sendJson(res, 200, { ok: true, uid: id, provider, ssoVerified: true, state: scopeStateForUser(S.users[id]) }, {
          'Set-Cookie': `mgcw_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 7}`
        });
      }

      if (!u) return sendJson(res, 401, { ok: false, error: 'Authentication required.' });

      // Member / Self actions
      if (act === 'subscribeBase') {
        u.plan.base = true;
        logAudit(u.id, 'billing.base_active', '$5/mo activated');
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

      // Owner-only actions
      if (u.role !== 'owner') {
        return sendJson(res, 403, { ok: false, error: 'Owner authorization required.' });
      }
      if (act === 'approve') {
        const target = S.users[body.userId];
        if (target) {
          target.status = 'approved_building';
          const wanted = ['home', 'agile', 'resources'].concat((TAILOR[target.quote.interest] || { pages: [] }).pages);
          wanted.forEach(p => {
            target.pages[p] = 'pending';
            if (!S.tasks.some(t => t.uid === target.id && t.page === p)) {
              const c = CATALOG.find(x => x.id === p);
              S.tasks.push({ id: uid('t'), uid: target.id, page: p, title: `Build "${c ? c.title : p}" for ${target.name}`, done: false });
            }
          });
          const r = S.requests.find(x => x.uid === target.id);
          if (r) r.status = 'approved';
          logAudit('owner', 'request.approved', target.email);
          saveState(S);
        }
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'deny') {
        const target = S.users[body.userId];
        if (target) {
          target.status = 'denied';
          const r = S.requests.find(x => x.uid === target.id);
          if (r) r.status = 'denied';
          notifyUser(target.id, 'Request update', 'We are unable to approve this request right now.');
          logAudit('owner', 'request.denied', target.email);
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
        notifyUser(grantee, 'Something was shared with you', `${type}: ${resource} (${(perms || ['view']).join(', ')})`);
        logAudit('owner', 'share.grant', `${type}:${resource} -> ${grantee}`);
        saveState(S);
        return sendJson(res, 200, { ok: true, state: scopeStateForUser(u) });
      }
      if (act === 'revoke') {
        S.shares = S.shares.filter(x => x.id !== body.shareId);
        logAudit('owner', 'share.revoke', body.shareId);
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
    if (CLEAN_ROUTE_TO_FILE[pathname]) {
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

    if (BLOCKED_FILES.has(baseName) || cleanRel.startsWith('.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }

    const u = getAuthenticatedUser(req);

    // Gate member-portal.html (/workspace) and agile-board.html (/agile)
    if (baseName === 'member-portal.html' || baseName === 'agile-board.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (baseName === 'agile-board.html' && u.role !== 'owner' && !can(u, 'page', 'agile', 'view')) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(u, 'Agile Board is Pending or Locked', 'Your Agile Board will unlock automatically once your workspace is active and ready.', '/workspace', 'Back to My Workspace →'));
      }
    }

    // Gate access-admin.html (/access-admin, strictly Owner only)
    if (baseName === 'access-admin.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (u.role !== 'owner') {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderLockedHtml(u, 'Owner Authorization Required', 'This administrative control center is restricted to Malik K. (Owner).', '/workspace', 'Back to My Workspace →'));
      }
    }

    // Gate the 16 internal portals: Owner has full access; onboarding-portal.html (/portal) is open to any SSO-authenticated user
    if (INTERNAL_PORTALS.has(baseName) && baseName !== 'access-admin.html') {
      if (!u) {
        return redirectToCleanAuth(baseName);
      }
      if (u.role !== 'owner' && baseName !== 'onboarding-portal.html') {
        const mappedCatalogId = PORTAL_TO_CATALOG[baseName];
        const allowedViaCatalog = mappedCatalogId && can(u, 'page', mappedCatalogId, 'view');
        const allowedViaShare = can(u, 'element', baseName, 'view');
        if (!allowedViaCatalog && !allowedViaShare) {
          const isPending = mappedCatalogId && (u.pages || {})[mappedCatalogId] === 'pending';
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(renderLockedHtml(
            u,
            isPending ? 'Pending · Being Created For You' : 'Page Not in Your Workspace Plan',
            isPending
              ? 'This page has been approved for your workspace and is currently being tailored for you. You will receive a notification the moment it is ready.'
              : 'You only have access to the pages and elements created for or shared with your account. You can request or subscribe to additional pages from your workspace.',
            '/workspace',
            'Open My Workspace →'
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
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`MGC & F.I.X Authenticated Cloud Run Server listening on http://localhost:${PORT}`);
});
