'use strict';
/* ============================================================
   星遇导航 StarNav — 后端服务（零依赖，仅用 Node 内置模块）
   启动：node server.js         →  http://localhost:3000
   管理入口：http://localhost:3000/?admin=starnav   （隐藏的模式按钮）
   ------------------------------------------------------------
   安全模型：
   - 密码以 scrypt 哈希保存在服务器 data.json，前端永不接触明文
   - 登录后签发 HttpOnly + SameSite Cookie 会话（7 天有效）
   - 只读（locked）内容的修改/删除/排序由服务器强制校验：
     非授权请求即使伪造数据，也只读内容也会被服务器原样保留
   ============================================================ */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------- 数据 ---------- */
function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (d && Array.isArray(d.pages)) return d;
  } catch { /* 文件缺失或损坏 → 返回空 */ }
  return { pages: [], theme: 'cosmic', activePage: null, palette: {} };
}
function saveData(d) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE); // 原子写入，避免写一半损坏
}
let data = loadData();

/* ---------- 密码（scrypt 哈希，防暴力） ---------- */
function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pwd), salt, 32).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pwd, stored) {
  if (!stored || !pwd) return false;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(pwd), salt, 32);
  const expect = Buffer.from(hash, 'hex');
  return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
}
const getPassword = () => (data.adminPassword ? String(data.adminPassword) : '');

/* ---------- 会话（持久化，重启不丢） ---------- */
const sessions = new Map(); // token -> 过期时间戳
const SESSION_MAX = 50;     // 最多保留 50 个会话

function loadSessions() {
  sessions.clear();
  const list = (data.sessions && Array.isArray(data.sessions)) ? data.sessions : [];
  const now = Date.now();
  for (const s of list) {
    if (s && typeof s.token === 'string' && Number.isFinite(s.expires) && s.expires > now) {
      sessions.set(s.token, s.expires);
    }
  }
}

function persistSessions() {
  const now = Date.now();
  for (const [t, e] of sessions) if (e <= now) sessions.delete(t);
  const list = [...sessions.entries()].map(([token, expires]) => ({ token, expires }));
  if (list.length > SESSION_MAX) list.splice(0, list.length - SESSION_MAX);
  data.sessions = list;
  saveData(data);
}

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  persistSessions();
  return token;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function validSession(req) {
  const c = parseCookies(req).starnav_sid;
  if (!c) return false;
  const exp = sessions.get(c);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(c); persistSessions(); return false; }
  return true;
}
function destroySession(req) {
  const c = parseCookies(req).starnav_sid;
  if (c && sessions.delete(c)) persistSessions();
}
const cookieHeader = (token, maxAge) =>
  `starnav_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

loadSessions(); // 恢复持久化的会话（重启不丢）

/* ---------- 工具 ---------- */
/* gzip 压缩：文本类响应显著减小体积（CSS/JS/JSON 可压到 1/5~1/8） */
function gzipBody(req, buf) {
  if (buf.length > 128 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    return zlib.gzipSync(buf);
  }
  return buf;
}
function json(res, obj, status = 200, extra = {}) {
  const body = JSON.stringify(obj);
  const buf = Buffer.from(body, 'utf8');
  const out = gzipBody({ headers: res.req.headers }, buf);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Accept-Encoding',
    ...extra,
  };
  if (out.length !== buf.length) headers['Content-Encoding'] = 'gzip';
  res.writeHead(status, headers);
  res.end(out);
}
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function parseJSON(req) {
  try { return JSON.parse((await readBody(req)) || '{}'); }
  catch { return null; }
}
const clamp = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/* ---------- 数据校验 / 只读合并 ---------- */
function sanitizeLink(l) {
  return {
    id: clamp(l.id, 60) || crypto.randomUUID(),
    title: clamp(l.title, 100) || '未命名',
    url: clamp(l.url, 500),
    desc: clamp(l.desc, 300),
    category: clamp(l.category, 50) || '未分类',
    icon: clamp(l.icon, 500),
    locked: !!l.locked,
    visits: Number.isFinite(l.visits) ? Math.max(0, Math.floor(l.visits)) : 0,
    createdAt: Number.isFinite(l.createdAt) ? l.createdAt : Date.now(),
  };
}
function sanitizeData(d) {
  if (!d || !Array.isArray(d.pages)) return null;
  const pages = d.pages.slice(0, 100).map((p) => ({
    id: clamp(p.id, 60) || crypto.randomUUID(),
    name: clamp(p.name, 50) || '未命名页面',
    icon: clamp(p.icon, 100),
    links: Array.isArray(p.links) ? p.links.slice(0, 2000).map(sanitizeLink) : [],
  }));
  const palette = {};
  if (d.palette && typeof d.palette === 'object') {
    if (typeof d.palette.cosmic === 'string') palette.cosmic = d.palette.cosmic.slice(0, 30);
    if (typeof d.palette.classic === 'string') palette.classic = d.palette.classic.slice(0, 30);
  }
  return {
    pages,
    theme: d.theme === 'classic' ? 'classic' : 'cosmic',
    activePage: typeof d.activePage === 'string' ? d.activePage : null,
    palette,
  };
}

/* 非授权写入：访客只能【添加】新站点——
   已有站点（无论是否只读）不可修改 / 删除 / 重排，页面不可删除。
   即使伪造请求，已有内容也会被服务器原样保留，仅允许追加新内容 */
function mergeForVisitor(incoming) {
  const out = { pages: [], theme: incoming.theme, activePage: incoming.activePage, palette: incoming.palette };

  for (const sp of data.pages) {
    const ip = incoming.pages.find((p) => p.id === sp.id);
    if (!ip) {
      out.pages.push(sp); // 访客不能删除页面：原样保留
      continue;
    }
    const incomingById = new Map(ip.links.map((l) => [l.id, l]));
    const merged = [];
    const seen = new Set();
    // 已有站点按存储顺序原样保留（仅访问热度允许变化），访客不可改删/重排
    for (const sl of sp.links) {
      const il = incomingById.get(sl.id);
      merged.push(il ? { ...sl, visits: Number.isFinite(il.visits) ? il.visits : sl.visits } : sl);
      seen.add(sl.id);
    }
    // 访客新增的站点追加在末尾（强制非只读）
    for (const il of ip.links) {
      if (!seen.has(il.id)) { merged.push({ ...il, locked: false }); seen.add(il.id); }
    }
    out.pages.push({ ...ip, links: merged });
  }
  // 访客新建的页面
  for (const ip of incoming.pages) {
    if (!data.pages.some((p) => p.id === ip.id)) {
      out.pages.push({ ...ip, links: (ip.links || []).map((l) => ({ ...l, locked: false })) });
    }
  }
  return { data: out };
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  if (url.pathname === '/api/session') {
    return json(res, { admin: validSession(req), hasPassword: !!getPassword() });
  }

  if (url.pathname === '/api/setup' && req.method === 'POST') {
    if (getPassword()) return json(res, { error: 'already_setup' }, 409);
    const body = await parseJSON(req);
    const pwd = String((body && body.password) || '');
    if (pwd.length < 4 || pwd.length > 128) return json(res, { error: 'weak_password' }, 400);
    data.adminPassword = hashPassword(pwd);
    saveData(data);
    return json(res, { admin: true }, 200, { 'Set-Cookie': cookieHeader(createSession(), SESSION_TTL / 1000) });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await parseJSON(req);
    if (!verifyPassword(String((body && body.password) || ''), getPassword())) {
      return json(res, { error: 'bad_credentials' }, 401);
    }
    return json(res, { admin: true }, 200, { 'Set-Cookie': cookieHeader(createSession(), SESSION_TTL / 1000) });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    destroySession(req);
    return json(res, { ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
  }

  if (url.pathname === '/api/password' && req.method === 'POST') {
    if (!validSession(req)) return json(res, { error: 'unauthorized' }, 403);
    const body = await parseJSON(req);
    if (!verifyPassword(String((body && body.old) || ''), getPassword())) {
      return json(res, { error: 'bad_credentials' }, 401);
    }
    const pwd = String((body && body.new) || '');
    if (pwd.length < 4 || pwd.length > 128) return json(res, { error: 'weak_password' }, 400);
    data.adminPassword = hashPassword(pwd);
    saveData(data);
    return json(res, { ok: true });
  }

  if (url.pathname === '/api/data' && req.method === 'GET') {
    return json(res, { pages: data.pages, theme: data.theme, activePage: data.activePage, palette: data.palette || {} });
  }

  if (url.pathname === '/api/data' && req.method === 'PUT') {
    const incoming = sanitizeData(await parseJSON(req));
    if (!incoming) return json(res, { error: 'bad_data' }, 400);

    // 应用前端数据，但服务端专属字段（密码哈希 / 会话）必须保留：
    // 密码只能通过 /api/password 修改，普通数据保存永远碰不到它
    const applyData = (clientData) => {
      data = { ...clientData, adminPassword: data.adminPassword, sessions: data.sessions };
      saveData(data);
      queueMissingIcons(); // 数据变化后自动补齐新站点的图标
      return data;
    };

    if (validSession(req)) { // 授权：完整写入
      return json(res, applyData(incoming));
    }

    // 首次初始化：服务器尚无任何数据时接受完整写入（含只读标记）
    if (!data.pages.length) {
      return json(res, applyData(incoming));
    }

    const merged = mergeForVisitor(incoming);
    if (merged.error) return json(res, { error: merged.error, page: merged.page }, 403);
    return json(res, applyData(merged.data));
  }

  /* 站点图标：本地已下载则直接返回；缺失则即时下载并落盘（前端直接调用本地接口） */
  if (url.pathname === '/api/icon' && req.method === 'GET') {
    const host = getHost(url.searchParams.get('u') || '');
    if (!host) return json(res, { error: 'bad_url' }, 400);
    try {
      fs.mkdirSync(ICONS_DIR, { recursive: true });
    } catch (e) {
      console.error(`[图标] 无法写入图标目录 ${ICONS_DIR}: ${e.message}`);
      return json(res, { error: 'icons_dir_unwritable' }, 500);
    }
    let file = iconFileFor(host);
    if (!file && !isFailed(host)) {
      const downloaded = await downloadIconOnce(host);
      file = downloaded && fs.existsSync(downloaded) ? downloaded : null;
    }
    if (!file) return json(res, { error: 'no_icon' }, 404);
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).slice(1);
    const mime = MIME['.' + ext] || 'image/png';
    const etag = `"${buf.length}-${crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
      'ETag': etag,
    });
    return res.end(buf);
  }

  /* 图标状态 / 重新下载（管理模式专用，排查用） */
  if (url.pathname === '/api/icons/status' && req.method === 'GET') {
    if (!validSession(req)) return json(res, { error: 'unauthorized' }, 403);
    return json(res, iconStatusInfo());
  }
  if (url.pathname === '/api/icons/refresh' && req.method === 'POST') {
    if (!validSession(req)) return json(res, { error: 'unauthorized' }, 403);
    const force = url.searchParams.get('force') === '1';
    if (force) {
      try {
        for (const f of fs.readdirSync(ICONS_DIR)) fs.unlinkSync(path.join(ICONS_DIR, f));
        console.log('[图标] 已清空图标缓存，开始重新下载全部');
      } catch { /* 目录不存在等 */ }
    }
    iconFailed.clear();
    iconQueue.length = 0;
    queueMissingIcons();
    return json(res, { ok: true, force, queued: iconQueue.length });
  }

  return json(res, { error: 'not_found' }, 404);
}

/* ---------- 自动下载图标（存本地，前端直接调用） ---------- */
/* 服务器在启动时与数据更新后，后台自动抓取各站点真实图标并保存到 icons/ 目录；
   前端统一请求 /api/icon?u=网址，命中本地文件直接返回，浏览器不直连第三方图标源。
   抓取顺序：站点根目录 /favicon.ico → Google s2 favicon 兜底。 */

const ICONS_DIR = path.join(ROOT, 'icons');
const ICON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 基础防 SSRF：仅允许公网 http/https，拒绝本机 / 内网地址 */
function isSafeHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split('.').map(Number);
    if (p.some((n) => n > 255)) return false;
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    return true;
  }
  return true;
}

const getHost = (urlStr) => {
  try { return new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
};

/* 抓取 URL（限时 / 限大小 / 限重定向次数），返回 { type, data } 或 null */
function httpGetRaw(urlStr, { timeout = 4000, maxBytes = 512 * 1024, redirects = 3 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch { return resolve(null); }
    if (!['http:', 'https:'].includes(u.protocol) || !isSafeHost(u.hostname)) return resolve(null);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': ICON_UA, 'Accept': '*/*' }, timeout }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, u).href; } catch { return resolve(null); }
        return resolve(httpGetRaw(next, { timeout, maxBytes, redirects: redirects - 1 }));
      }
      if (status !== 200) { res.resume(); return resolve(null); }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(); return resolve(null); }
        chunks.push(c);
      });
      res.on('end', () => resolve({ type, data: Buffer.concat(chunks) }));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/* 根据文件头嗅探真实图片类型，决定保存后缀 */
function sniffExt(buf, type) {
  if (buf.length > 4) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'webp';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'ico';
  }
  if (type.includes('svg')) return 'svg';
  if (type.startsWith('image/png')) return 'png';
  if (type.startsWith('image/x-icon') || type.startsWith('image/vnd.microsoft.icon')) return 'ico';
  if (type.startsWith('image/jpeg')) return 'jpg';
  if (type.startsWith('image/webp')) return 'webp';
  return 'png';
}

const hostHash = (host) => crypto.createHash('md5').update(host).digest('hex');

function iconFileFor(host) {
  const h = hostHash(host);
  try {
    const f = fs.readdirSync(ICONS_DIR).find((n) => n.startsWith(h + '.'));
    return f ? path.join(ICONS_DIR, f) : null;
  } catch { return null; }
}

const iconFailed = new Map();   // host -> 失败时间；30 分钟后自动重试，避免瞬时故障被永久记录
const iconInFlight = new Map(); // 并发去重
const ICON_RETRY_MS = 30 * 60 * 1000;
const isFailed = (host) => iconFailed.has(host) && (Date.now() - iconFailed.get(host)) < ICON_RETRY_MS;

async function downloadIcon(host) {
  const direct = `https://${host}/favicon.ico`;
  const s2 = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  for (const url of [direct, s2]) {
    const res = await httpGetRaw(url);
    if (res && res.data.length > 0 && res.type.startsWith('image/')) {
      const ext = sniffExt(res.data, res.type);
      const file = path.join(ICONS_DIR, `${hostHash(host)}.${ext}`);
      try {
        fs.writeFileSync(file, res.data);
        iconFailed.delete(host);
        return file;
      } catch { return null; }
    }
  }
  iconFailed.set(host, Date.now());
  console.log(`[图标] 下载失败（30 分钟后自动重试）：${host}`);
  return null;
}

/* 并发下载上限：避免浏览器首屏同时拉几十个图标导致互相超时 */
const MAX_ICON_CONCURRENCY = 6;
let iconConcurrency = 0;

function downloadIconOnce(host) {
  if (iconInFlight.has(host)) return iconInFlight.get(host);
  const p = (async () => {
    while (iconConcurrency >= MAX_ICON_CONCURRENCY) await new Promise((r) => setTimeout(r, 100));
    iconConcurrency++;
    try { return await downloadIcon(host); } finally { iconConcurrency--; }
  })().finally(() => iconInFlight.delete(host));
  iconInFlight.set(host, p);
  return p;
}

/* 后台自动补齐：启动时与数据更新后，为所有缺图标的站点排队下载（节流） */
const iconQueue = [];
let iconPumping = false;

const iconStat = { ok: 0, fail: 0 };

function queueMissingIcons() {
  for (const p of data.pages) for (const l of p.links) {
    const host = getHost(l.url);
    if (host && !isFailed(host) && !iconFileFor(host) && !iconQueue.includes(host)) {
      iconQueue.push(host);
    }
  }
  pumpIconQueue();
}

async function pumpIconQueue() {
  if (iconPumping) return;
  iconPumping = true;
  iconStat.ok = 0;
  iconStat.fail = 0;
  try {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  } catch (e) {
    console.error(`[图标] 无法创建图标目录 ${ICONS_DIR}: ${e.message}`);
    iconPumping = false;
    return;
  }
  try {
    while (iconQueue.length) {
      const host = iconQueue.shift();
      if (!iconFileFor(host) && !isFailed(host)) {
        const file = await downloadIconOnce(host);
        if (file) iconStat.ok++;
        else iconStat.fail++;
      }
      await new Promise((r) => setTimeout(r, 200)); // 节流，避免打爆小站点
    }
    if (iconStat.ok + iconStat.fail > 0) {
      console.log(`[图标] 本次下载完成：成功 ${iconStat.ok} 个，失败 ${iconStat.fail} 个`);
    }
  } catch (e) {
    console.error(`[图标] 下载过程异常: ${e.message}`);
  } finally {
    iconPumping = false;
  }
}

/* 统计缺失/已缓存的图标（管理模式排查用） */
function iconStatusInfo() {
  let cached = 0;
  try { cached = fs.readdirSync(ICONS_DIR).length; } catch { /* 目录不存在视为 0 */ }
  const hosts = new Set();
  for (const p of data.pages) for (const l of p.links) {
    const h = getHost(l.url);
    if (h) hosts.add(h);
  }
  let failed = 0;
  for (const h of iconFailed.keys()) if (isFailed(h)) failed++;
  return { total: hosts.size, cached, failed, queued: iconQueue.length, pumping: iconPumping };
}

/* ---------- 静态文件（ETag 缓存校验：内容没变则 304，不重传文件） ---------- */
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not Found'); }
    const etag = `"${st.size}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    fs.readFile(file, (err2, buf) => {
      if (err2) { res.writeHead(404); return res.end('Not Found'); }
      const out = gzipBody(req, buf);
      const headers = {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', // 每次都带 ETag 校验，命中则 304，节省带宽
        'ETag': etag,
        'Vary': 'Accept-Encoding',
      };
      if (out.length !== buf.length) headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end(out);
    });
  });
}

/* ---------- 主服务 ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      if (!res.headersSent) json(res, { error: String(e.message || e) }, e.status || 500);
    });
    return;
  }
  if (req.method === 'GET') serveStatic(req, res, url);
  else { res.writeHead(405); res.end('Method Not Allowed'); }
});

server.listen(PORT, () => {
  console.log(`✦ 星遇导航已启动：http://localhost:${PORT}`);
  console.log(`  管理入口（隐藏的模式按钮）：http://localhost:${PORT}/?admin=starnav`);
  console.log(`  数据文件：${DATA_FILE}`);
  console.log(`  图标自动下载：已启用（目录 ${ICONS_DIR}）`);
  // 启动后自动下载所有站点图标（后台、节流）
  setTimeout(() => {
    try {
      fs.mkdirSync(ICONS_DIR, { recursive: true });
      queueMissingIcons();
    } catch (e) {
      console.error(`[图标] 启动自动下载失败: ${e.message}`);
    }
  }, 800);
});
