'use strict';

/* ============================================================
   星遇导航 StarNav — 交互逻辑
   多页面 + 排序 + 增删改，数据保存在 localStorage，纯前端无依赖
   ============================================================ */

/* ---------- 工具函数 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const uid = () => (
  (crypto.randomUUID && crypto.randomUUID()) ||
  'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
);

const getDomain = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); }
  catch { return u; }
};

const normUrl = (u) => {
  u = u.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
};

const isValidUrl = (u) => {
  try { new URL(u); return true; } catch { return false; }
};

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 文字头像的渐变色板 */
const GRADIENTS = [
  'linear-gradient(135deg,#22d3ee,#3b82f6)',
  'linear-gradient(135deg,#a78bfa,#ec4899)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#34d399,#0ea5e9)',
  'linear-gradient(135deg,#f472b6,#8b5cf6)',
  'linear-gradient(135deg,#fbbf24,#f97316)',
  'linear-gradient(135deg,#60a5fa,#a855f7)',
  'linear-gradient(135deg,#2dd4bf,#6366f1)',
];
const hashGradient = (s) => {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + (ch.codePointAt(0) || 0)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
};

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

/* ---------- 默认站点数据 ---------- */
const DEFAULT_LINKS = [
  // 🔮 AI 助手
  { title: 'ChatGPT', url: 'https://chat.openai.com', desc: '全球领先的 AI 对话助手，写作、编程、问答全能', category: 'AI 助手', icon: '🤖' },
  { title: 'Claude', url: 'https://claude.ai', desc: 'Anthropic 的智能助手，长文理解与代码能力出色', category: 'AI 助手', icon: '🧠' },
  { title: 'Gemini', url: 'https://gemini.google.com', desc: 'Google 多模态 AI，与全家桶深度集成', category: 'AI 助手', icon: '✨' },
  { title: 'DeepSeek', url: 'https://chat.deepseek.com', desc: '国产开源大模型，推理能力强，免费使用', category: 'AI 助手', icon: '🐋' },
  { title: 'Midjourney', url: 'https://www.midjourney.com', desc: 'AI 艺术创作，生成惊艳的图片作品', category: 'AI 助手', icon: '🎨' },
  { title: '通义千问', url: 'https://tongyi.aliyun.com', desc: '阿里巴巴 AI 助手，文档、代码、创作样样行', category: 'AI 助手', icon: '🍃' },

  // 🛠️ 开发工具
  { title: 'GitHub', url: 'https://github.com', desc: '全球最大的代码托管与开源协作平台', category: '开发工具', icon: '🐙' },
  { title: 'MDN', url: 'https://developer.mozilla.org', desc: 'Web 开发最权威的参考文档', category: '开发工具', icon: '📘' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com', desc: '程序员问答社区，bug 的天敌', category: '开发工具', icon: '💬' },
  { title: 'CodePen', url: 'https://codepen.io', desc: '在线前端代码实验场，灵感迸发地', category: '开发工具', icon: '🖊️' },
  { title: 'Vercel', url: 'https://vercel.com', desc: '现代 Web 应用部署平台，秒级上线', category: '开发工具', icon: '▲' },
  { title: 'npm', url: 'https://www.npmjs.com', desc: 'JavaScript 包管理仓库，海量开源库', category: '开发工具', icon: '📦' },

  // 🎨 设计灵感
  { title: 'Dribbble', url: 'https://dribbble.com', desc: '全球设计师作品集社区，找灵感必逛', category: '设计灵感', icon: '🏀' },
  { title: 'Behance', url: 'https://www.behance.net', desc: 'Adobe 创意作品平台，顶尖设计师聚集地', category: '设计灵感', icon: '🎯' },
  { title: 'Figma', url: 'https://www.figma.com', desc: '协作式 UI 设计工具，实时多人共创', category: '设计灵感', icon: '🖌️' },
  { title: 'Unsplash', url: 'https://unsplash.com', desc: '高质量免费可商用图片库', category: '设计灵感', icon: '📷' },
  { title: 'Awwwards', url: 'https://www.awwwards.com', desc: '全球优秀网站设计评选与展示', category: '设计灵感', icon: '🏆' },
  { title: '站酷', url: 'https://www.zcool.com.cn', desc: '国内设计师交流与作品分享平台', category: '设计灵感', icon: '🇨🇳' },

  // 📚 学习资源
  { title: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '视频学习宝库，教程、纪录片应有尽有', category: '学习资源', icon: '📺' },
  { title: '知乎', url: 'https://www.zhihu.com', desc: '高质量问答社区，各行各业的经验之谈', category: '学习资源', icon: '❓' },
  { title: '掘金', url: 'https://juejin.cn', desc: '中文技术社区，前端后端优质文章', category: '学习资源', icon: '⛏️' },
  { title: 'Coursera', url: 'https://www.coursera.org', desc: '国际顶尖大学在线课程平台', category: '学习资源', icon: '🎓' },
  { title: '中国大学MOOC', url: 'https://www.icourse163.org', desc: '国内名校公开课，免费学遍高校', category: '学习资源', icon: '🏛️' },
  { title: 'LeetCode', url: 'https://leetcode.cn', desc: '算法刷题平台，面试必备', category: '学习资源', icon: '⚡' },

  // 🎬 娱乐影音
  { title: 'YouTube', url: 'https://www.youtube.com', desc: '全球最大视频平台，内容无所不包', category: '娱乐影音', icon: '▶️' },
  { title: '网易云音乐', url: 'https://music.163.com', desc: '发现好音乐，歌单与评论都精彩', category: '娱乐影音', icon: '🎵' },
  { title: '豆瓣', url: 'https://www.douban.com', desc: '电影、图书、音乐评分社区', category: '娱乐影音', icon: '🥁' },
  { title: '爱奇艺', url: 'https://www.iqiyi.com', desc: '海量影视综艺在线观看', category: '娱乐影音', icon: '🍿' },
  { title: 'Steam', url: 'https://store.steampowered.com', desc: '全球最大的 PC 游戏平台', category: '娱乐影音', icon: '🎮' },
  { title: '微博', url: 'https://weibo.com', desc: '社交媒体平台，热点资讯一手掌握', category: '娱乐影音', icon: '🐦' },

  // 🚀 效率办公
  { title: 'Notion', url: 'https://www.notion.so', desc: '全能笔记、文档与协作工具', category: '效率办公', icon: '📝' },
  { title: '飞书', url: 'https://www.feishu.cn', desc: '一站式办公协作平台，文档会议一体化', category: '效率办公', icon: '🦁' },
  { title: '腾讯文档', url: 'https://docs.qq.com', desc: '在线协作文档，随时多人编辑', category: '效率办公', icon: '📄' },
  { title: '语雀', url: 'https://www.yuque.com', desc: '蚂蚁集团知识库，结构化写作利器', category: '效率办公', icon: '🐦' },
  { title: '幕布', url: 'https://mubu.com', desc: '大纲笔记工具，思维可视化', category: '效率办公', icon: '📋' },
  { title: '石墨文档', url: 'https://shimo.im', desc: '云端协同办公，轻量高效', category: '效率办公', icon: '🪨' },

  // 🪙 币圈
  { title: '币安 Binance', url: 'https://www.binance.com/zh-CN', desc: '全球最大的加密货币交易平台', category: '币圈', icon: '🟡' },
  { title: '欧易 OKX', url: 'https://www.okx.com/zh-hans', desc: '全球领先的数字资产交易平台', category: '币圈', icon: '🟠' },
  { title: 'CoinGecko', url: 'https://www.coingecko.com/zh', desc: '加密货币行情与数据聚合平台', category: '币圈', icon: '🦎' },
  { title: 'CoinMarketCap', url: 'https://coinmarketcap.com/zh', desc: '全球加密货币市值排行与数据', category: '币圈', icon: '📈' },
  { title: 'Etherscan', url: 'https://etherscan.io', desc: '以太坊区块浏览器，链上数据查询', category: '币圈', icon: '🔷' },
  { title: 'Blockchain.com', url: 'https://www.blockchain.com/explorer', desc: '比特币区块浏览器与钱包', category: '币圈', icon: '⛓️' },
  { title: 'DeBank', url: 'https://debank.com', desc: 'DeFi 资产聚合与链上数据', category: '币圈', icon: '🏦' },
  { title: 'Dune', url: 'https://dune.com', desc: '链上数据分析与可视化看板', category: '币圈', icon: '🐋' },
  { title: 'TokenInsight', url: 'https://www.tokeninsight.com/zh', desc: '加密市场数据与研究报告', category: '币圈', icon: '🔍' },
  { title: '慢雾 SlowMist', url: 'https://www.slowmist.com', desc: '区块链安全审计与威胁情报', category: '币圈', icon: '🛡️' },
  { title: '律动 BlockBeats', url: 'https://www.theblockbeats.info', desc: '加密货币行业新闻资讯', category: '币圈', icon: '📰' },
  { title: 'PANews', url: 'https://www.panewslab.com', desc: '区块链行业中文媒体', category: '币圈', icon: '📡' },
];

/* ---------- 数据层（多页面模型，服务端持久化 + 本地缓存） ---------- */
const LS_KEY = 'starnav:data:v2';
const LS_KEY_V1 = 'starnav:links:v1';

const freshPage = (name, icon, links) => ({ id: uid(), name, icon, links });

/* 默认种子：内置站点为只读内容（locked: true），仅授权人员可修改 */
function buildSeed() {
  const now = Date.now();
  const pageId = uid();
  return {
    pages: [freshPage('首页', '🏠', DEFAULT_LINKS.map((l, i) => ({
      ...l, id: uid(), visits: 0, locked: true,
      createdAt: now - (DEFAULT_LINKS.length - 1 - i) * 1000,
    })))],
    theme: 'cosmic',
    activePage: pageId,
  };
}

/* 从本地缓存读取（旧版 v1 自动迁移），用于快速首屏与服务器初始化 */
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.pages) && d.pages.length) {
        if (!d.pages.some((p) => p.id === d.activePage)) d.activePage = d.pages[0].id;
        return d;
      }
    }
  } catch { /* 忽略损坏数据 */ }
  try {
    const raw1 = localStorage.getItem(LS_KEY_V1);
    if (raw1) {
      const arr = JSON.parse(raw1);
      if (Array.isArray(arr) && arr.length) {
        const now = Date.now();
        const pageId = uid();
        const links = arr.map((l, i) => ({
          ...l,
          id: l.id || uid(),
          visits: l.visits || 0,
          locked: false,
          createdAt: now - (arr.length - 1 - i) * 1000, // 保持原“最新在前”的顺序
        }));
        localStorage.removeItem(LS_KEY_V1);
        return { pages: [freshPage('首页', '🏠', links)], theme: 'cosmic', activePage: pageId };
      }
    }
  } catch { /* 忽略 */ }
  return null;
}

function cacheLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* 静默 */ }
}

let data = loadLocal();
let serverHasPassword = true; // boot 后按服务器实际状态校正
let admin = false;            // 服务端会话授权状态（boot 时获取）

const publicData = () => ({
  pages: data.pages,
  theme: data.theme,
  activePage: data.activePage,
  palette: data.palette || {},
});

/* 保存到服务器（服务器是权威数据源；只读内容由服务端强制保留） */
let saveSeq = 0;
async function saveData() {
  const seq = ++saveSeq;
  try {
    const before = JSON.stringify(publicData());
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: before,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      if (e.error === 'locked_page') toast(`该页面含只读内容，服务器拒绝了删除操作（${e.page || ''}）`);
      else if (e.error === 'bad_data') toast('数据格式错误，保存失败');
      else toast(`保存失败（${res.status}）`);
      return false;
    }
    const saved = await res.json();
    if (seq !== saveSeq) return true; // 有更新的保存请求在途，忽略过期回写
    data = saved;
    cacheLocal();
    if (JSON.stringify(publicData()) !== before) renderAll(); // 服务器回写与本地不同（如恢复只读内容）
    return true;
  } catch {
    toast('⚠️ 保存失败：无法连接服务器');
    return false;
  }
}

const activePage = () => data.pages.find((p) => p.id === data.activePage) || data.pages[0];
const links = () => activePage().links;

/* 合并新增的内置站点（当前用于币圈分类）：
   按 URL 去重，把"已有数据里不存在"的默认站点追加到当前页面，
   避免老用户升级后看不到新分类，也不会重复添加 */
function mergeNewDefaults() {
  const candidates = DEFAULT_LINKS.filter((l) => l.category === '币圈');
  const known = new Set();
  for (const p of data.pages) for (const l of p.links) known.add(l.url);
  const fresh = candidates.filter((l) => !known.has(l.url));
  if (!fresh.length) return false;
  const target = activePage() || data.pages[0];
  if (!target) return false;
  const now = Date.now();
  target.links.push(...fresh.map((l, i) => ({
    ...l, id: uid(), visits: 0, locked: true,
    createdAt: now - (fresh.length - 1 - i) * 1000,
  })));
  return true;
}

/* ---------- 状态 ---------- */
const state = {
  cat: '全部',
  q: '',
  editingId: null,
  sort: 'recent',
  theme: (data && data.theme === 'classic') ? 'classic' : 'cosmic',
  palette: (data && data.palette) || {}, // 每种布局各自的配色：{ cosmic: 'aurora', classic: 'hao' }
};

const categories = () => [...new Set(links().map((l) => l.category))];

/* 排序规则 */
const SORTS = {
  recent: { label: '最新', fn: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
  oldest: { label: '最早', fn: (a, b) => (a.createdAt || 0) - (b.createdAt || 0) },
  name:   { label: '名称', fn: (a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN') },
  visits: { label: '热度', fn: (a, b) => (b.visits || 0) - (a.visits || 0) },
  manual: { label: '手动', fn: null },
};

const filtered = () => {
  const q = state.q.toLowerCase();
  const list = links().filter((l) => {
    const okCat = state.cat === '全部' || l.category === state.cat;
    const hay = `${l.title} ${l.desc} ${l.category} ${l.url} ${getDomain(l.url)}`.toLowerCase();
    return okCat && (!q || hay.includes(q));
  });
  if (state.sort === 'manual' || !SORTS[state.sort]) return list;
  return [...list].sort(SORTS[state.sort].fn);
};

/* ---------- 渲染 ---------- */
const grid = $('#grid');
const chips = $('#chips');
const pagesTabs = $('#pagesTabs');
const empty = $('#empty');
const search = $('#search');

function renderAll() {
  applyTheme();
  applyPalette();
  renderPages();
  renderChips();
  renderGrid();
  renderStats();
  renderDatalist();
  updateSortBar();
  renderPalettePop();
}

/* ---- 页面标签栏 ---- */
function renderPages() {
  pagesTabs.innerHTML = data.pages.map((p) => `
    <div class="page-tab${p.id === data.activePage ? ' active' : ''}" data-page="${p.id}" role="tab" tabindex="0" aria-selected="${p.id === data.activePage}">
      <span class="page-ico">${p.icon || '📄'}</span>
      <span class="page-name">${esc(p.name)}</span>
      <span class="page-cnt">${p.links.length}</span>
      <span class="page-ops">
        <i class="page-op" data-op="rename" title="重命名" role="button">✎</i>
        <i class="page-op page-op-del" data-op="delete" title="删除页面" role="button">✕</i>
      </span>
    </div>`).join('');

  // 让当前页标签保持在可视范围内
  const at = pagesTabs.querySelector('.page-tab.active');
  if (at) {
    pagesTabs.scrollLeft = Math.max(0, at.offsetLeft - pagesTabs.clientWidth / 2 + at.clientWidth / 2);
  }
}

function renderChips() {
  const counts = {};
  links().forEach((l) => { counts[l.category] = (counts[l.category] || 0) + 1; });
  const all = [['全部', links().length], ...categories().map((c) => [c, counts[c]])];
  chips.innerHTML = all.map(([c, n]) => (
    `<button class="chip${c === state.cat ? ' active' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}<span class="cnt">${n}</span></button>`
  )).join('');
}

function renderGrid(animate = true) {
  grid.classList.toggle('reflow', !animate);
  if (state.theme === 'classic') { renderClassicGrid(); return; }

  const list = filtered();
  const manual = state.sort === 'manual';
  grid.innerHTML = list.map((l, i) => cardHTML(l, animate ? Math.min(i * 28, 420) : 0, manual)).join('');
  updateEmpty(list);
}

/* 空状态提示 */
function updateEmpty(list) {
  empty.hidden = list.length > 0;
  if (list.length === 0) {
    if (state.q) {
      $('#emptyTitle').textContent = '没有找到相关站点';
      $('#emptyDesc').textContent = `没有与「${state.q}」匹配的结果，换个关键词试试。`;
      $('#emptyBtn').textContent = '清除搜索';
    } else {
      $('#emptyTitle').textContent = '这里空空如也';
      $('#emptyDesc').textContent = `「${activePage().name}」页面还没有站点，点击下方按钮添加第一个。`;
      $('#emptyBtn').textContent = '添加第一个站点';
    }
  }
}

/* ---- hao123 经典风格：按分类分组渲染为“分类盒 + 多列文字链接” ---- */
function renderClassicGrid() {
  const list = filtered();
  const manual = state.sort === 'manual';

  // 按分类分组（保持分类首次出现顺序；搜索时归入「搜索结果」一组）
  const groups = [];
  const map = new Map();
  for (const l of list) {
    const key = state.q ? '搜索结果' : l.category;
    if (!map.has(key)) { map.set(key, []); groups.push(key); }
    map.get(key).push(l);
  }

  grid.innerHTML = groups.map((g) => `
    <section class="classic-box">
      <header class="classic-box-head">
        <span class="cb-title">${esc(g)}</span>
        <span class="cb-cnt">共 ${map.get(g).length} 个</span>
      </header>
      <div class="classic-box-body">
        ${map.get(g).map((l) => classicLinkHTML(l, manual)).join('')}
      </div>
    </section>`).join('');

  updateEmpty(list);
}

function classicLinkHTML(l, manual) {
  const editable = canModify(l);
  const ops = [
    ...(manual && editable
      ? [`<i class="cl-op" data-action="up" title="上移">↑</i>`,
         `<i class="cl-op" data-action="down" title="下移">↓</i>`]
      : []),
    `<i class="cl-op" data-action="copy" title="复制链接">⧉</i>`,
    ...(editable
      ? [`<i class="cl-op" data-action="edit" title="编辑">✎</i>`,
         `<i class="cl-op cl-op-del" data-action="delete" title="删除">✕</i>`]
      : []),
  ].join('');

  return `
  <a class="classic-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-id="${l.id}">
    <span class="cl-icon">${miniIcon(l)}</span>
    <span class="cl-title">${hl(l.title, state.q)}</span>
    ${l.locked ? '<span class="lck" title="只读内容，需进入管理模式修改">🔒</span>' : ''}
    <span class="cl-desc">${hl(l.desc || '', state.q)}</span>
    <span class="cl-visits"${l.visits ? '' : ' hidden'}>🔥 ${l.visits || 0}</span>
    <span class="cl-ops">${ops}</span>
  </a>`;
}

function miniIcon(l) {
  if (l.icon && EMOJI_RE.test(l.icon)) return l.icon;
  const ch = [...(l.title || '?')][0] || '?';
  return `<span class="cl-letter" style="--g:${hashGradient(l.title)}">${esc(ch)}</span>`;
}

function cardHTML(l, delay, manual) {
  const editable = canModify(l);
  const actions = [
    ...(manual && editable
      ? [`<button type="button" class="act" data-action="up" title="上移" aria-label="上移">↑</button>`,
         `<button type="button" class="act" data-action="down" title="下移" aria-label="下移">↓</button>`]
      : []),
    `<button type="button" class="act" data-action="copy" title="复制链接" aria-label="复制链接">⧉</button>`,
    ...(editable
      ? [`<button type="button" class="act" data-action="edit" title="编辑" aria-label="编辑">✎</button>`,
         `<button type="button" class="act act-del" data-action="delete" title="删除" aria-label="删除">✕</button>`]
      : []),
  ].join('');

  return `
  <article class="card${manual ? ' manual' : ''}" style="animation-delay:${delay}ms" data-id="${l.id}"${manual && editable ? ' draggable="true"' : ''}>
    <a class="card-hit" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${esc(l.title)}"></a>
    <div class="card-body">
      <div class="card-top">
        ${iconHTML(l)}
        <div class="card-actions">${actions}</div>
      </div>
      <h3 class="card-title">${hl(l.title, state.q)}</h3>
      <p class="card-desc">${hl(l.desc || '暂无描述', state.q)}</p>
      <div class="card-meta">
        <span class="domain" title="${esc(l.url)}">${esc(getDomain(l.url))}</span>
        <span class="tag">${esc(l.category)}</span>
        ${l.locked ? '<span class="lck" title="只读内容，需进入管理模式修改">🔒</span>' : ''}
        <span class="visits"${l.visits ? '' : ' hidden'}>🔥 ${l.visits || 0}</span>
      </div>
    </div>
  </article>`;
}

function iconHTML(l) {
  if (l.icon && EMOJI_RE.test(l.icon)) {
    return `<span class="icon icon-emoji" aria-hidden="true">${l.icon}</span>`;
  }
  if (l.icon && /^https?:\/\//i.test(l.icon)) {
    return `<img class="icon icon-img" src="${esc(l.icon)}" alt="" loading="lazy" data-letter="${esc(l.title)}" onerror="window.__letter && window.__letter(this)">`;
  }
  const fav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(l.url))}&sz=64`;
  return `<img class="icon icon-img" src="${fav}" alt="" loading="lazy" data-letter="${esc(l.title)}" onerror="window.__letter && window.__letter(this)">`;
}

/* favicon 加载失败时回退为渐变文字头像 */
window.__letter = (img) => {
  const t = img.dataset.letter || '?';
  const s = document.createElement('span');
  s.className = 'icon icon-letter';
  s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--g', hashGradient(t));
  s.textContent = [...t][0] || '?';
  img.replaceWith(s);
};

/* 搜索关键词高亮（仅高亮首个匹配） */
function hl(text, q) {
  const s = esc(text);
  if (!q) return s;
  const idx = s.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return s;
  return s.slice(0, idx) + '<mark>' + s.slice(idx, idx + q.length) + '</mark>' + s.slice(idx + q.length);
}

function renderStats() {
  animateNumber($('#statTotal'), links().length);
  animateNumber($('#statCats'), categories().length);
}

function animateNumber(el, to) {
  const from = Number(el.dataset.val || 0);
  el.dataset.val = to;
  if (from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const dur = 450;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderDatalist() {
  $('#catList').innerHTML = categories().map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function updateSortBar() {
  $$('.sort-btn').forEach((b) => b.classList.toggle('active', b.dataset.sort === state.sort));
}

/* ---------- 配色方案 ---------- */
const PALETTES = {
  cosmic: [
    { id: 'starnav', name: '星航', css: ['#22d3ee', '#a78bfa', '#f472b6'] },
    { id: 'aurora', name: '极光', css: ['#2dd4bf', '#60a5fa', '#818cf8'] },
    { id: 'sunset', name: '落日', css: ['#fb923c', '#f472b6', '#c084fc'] },
    { id: 'neon', name: '霓虹', css: ['#a3e635', '#22d3ee', '#e879f9'] },
    { id: 'ocean', name: '深海', css: ['#38bdf8', '#22d3ee', '#2dd4bf'] },
    { id: 'berry', name: '莓果', css: ['#f472b6', '#c084fc', '#a78bfa'] },
    { id: 'gold', name: '鎏金', css: ['#fbbf24', '#f97316', '#fb7185'] },
  ],
  classic: [
    { id: 'hao', name: 'hao123 红', css: ['#e4393c', '#2d64b3'] },
    { id: 'azure', name: '天蓝', css: ['#1e6fd9', '#1e6fd9'] },
    { id: 'green', name: '墨绿', css: ['#1a7f37', '#2d64b3'] },
    { id: 'orange', name: '橙意', css: ['#e86f1e', '#2d64b3'] },
    { id: 'purple', name: '紫韵', css: ['#7c3aed', '#2d64b3'] },
  ],
};

function applyPalette() {
  document.documentElement.dataset.palette = (state.palette && state.palette[state.theme]) || '';
}

function renderPalettePop() {
  const list = PALETTES[state.theme] || [];
  const current = (state.palette && state.palette[state.theme]) || list[0].id;
  $('#paletteGrid').innerHTML = list.map((p) => {
    const g = p.css.length === 3
      ? `linear-gradient(135deg, ${p.css[0]}, ${p.css[1]} 55%, ${p.css[2]})`
      : `linear-gradient(135deg, ${p.css[0]}, ${p.css[1]})`;
    return `<button type="button" class="swatch${p.id === current ? ' active' : ''}" data-palette="${p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)}" style="background:${g}"></button>`;
  }).join('');
}

$('#paletteBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  renderPalettePop();
  $('#palettePop').hidden = !$('#palettePop').hidden;
});

$('#paletteGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b) return;
  const id = b.dataset.palette;
  const name = (PALETTES[state.theme] || []).find((p) => p.id === id);
  state.palette[state.theme] = id;
  data.palette = { ...state.palette };
  saveData();
  applyPalette();
  renderPalettePop();
  toast(`已切换配色：${name ? name.name : id}`);
});

document.addEventListener('click', (e) => {
  const pop = $('#palettePop');
  if (!pop.hidden && !e.target.closest('.palette-wrap')) pop.hidden = true;
});

/* ---------- 风格切换（星空 / hao123 经典） ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeBtn').textContent = state.theme === 'cosmic' ? '🏮 经典风格' : '🪐 星空风格';
}

$('#themeBtn').addEventListener('click', () => {
  state.theme = state.theme === 'cosmic' ? 'classic' : 'cosmic';
  data.theme = state.theme;
  saveData();
  applyTheme();
  applyPalette();
  renderGrid();
  renderPalettePop();
  toast(state.theme === 'classic' ? '已切换到 hao123 经典风格' : '已切换到星空风格');
});

/* ---------- 管理模式（授权，服务端会话） ---------- */
/* 入口隐藏：仅在地址栏携带 ?admin=密钥 时显示锁按钮；
   真正的权限校验在服务端（scrypt 密码哈希 + HttpOnly Cookie 会话）。 */
const ADMIN_TOKEN = 'starnav';
const isAdminEntry = new URLSearchParams(location.search).get('admin') === ADMIN_TOKEN;

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应 */ }
  return { ok: res.ok, status: res.status, body };
};

function setAdmin(v) {
  admin = v;
  $('#lockBtn').hidden = !isAdminEntry; // 非指定网址访问时，锁按钮不显示
  $('#lockBtn').textContent = admin ? '🔓 管理模式' : '🔒 管理模式';
  $('#lockBtn').classList.toggle('admin-on', admin);
  $('#lockBtn').title = admin ? '管理模式（已授权）' : '管理模式：解锁后可修改只读内容';
}

/* 是否可修改某个站点（只读内容需授权） */
const canModify = (l) => !l.locked || admin;

$('#lockBtn').addEventListener('click', () => {
  if (!booted) { toast('正在连接服务器，请稍候…'); return; }
  openAuthModal();
});

/* ---------- 授权弹窗（首次设置 / 登录 / 修改密码 / 已授权） ---------- */
let authMode = 'login';

function openAuthModal() {
  authOverlay.hidden = false;
  if (admin) renderAuthMode('active');
  else renderAuthMode(serverHasPassword ? 'login' : 'setup');
}

function renderAuthMode(mode) {
  authMode = mode;
  authForm.reset();
  const w = (id, show) => { $(id).hidden = !show; };
  if (mode === 'setup') {
    $('#authTitle').textContent = '首次设置管理密码';
    $('#authDesc').textContent = '设置后，只读内容仅凭此密码可修改（密码以哈希形式保存在服务器，非授权请求无法改动只读内容）。';
    w('#authOldWrap', false); w('#authNewWrap', true); w('#authConfirmWrap', true);
    $('#authNewLabel').textContent = '新密码';
    $('#authActions').hidden = false;
    $('#authOk').textContent = '设置并进入';
    $('#authLinks').innerHTML = '';
  } else if (mode === 'login') {
    $('#authTitle').textContent = '管理模式';
    $('#authDesc').textContent = '输入管理密码后，可修改只读内容。';
    w('#authOldWrap', false); w('#authNewWrap', true); w('#authConfirmWrap', false);
    $('#authNewLabel').textContent = '管理密码';
    $('#authActions').hidden = false;
    $('#authOk').textContent = '进入';
    $('#authLinks').innerHTML = '';
  } else if (mode === 'change') {
    $('#authTitle').textContent = '修改管理密码';
    $('#authDesc').textContent = '输入当前密码与新密码。';
    w('#authOldWrap', true); w('#authNewWrap', true); w('#authConfirmWrap', true);
    $('#authNewLabel').textContent = '新密码';
    $('#authActions').hidden = false;
    $('#authOk').textContent = '保存';
    $('#authLinks').innerHTML = '<button type="button" class="auth-link" data-act="back">← 返回</button>';
  } else { // active：已授权
    $('#authTitle').textContent = '管理模式';
    $('#authDesc').textContent = '当前已授权，只读内容可以修改。';
    w('#authOldWrap', false); w('#authNewWrap', false); w('#authConfirmWrap', false);
    $('#authActions').hidden = true;
    $('#authLinks').innerHTML =
      '<button type="button" class="auth-link primary" data-act="logout">退出管理模式</button>' +
      '<button type="button" class="auth-link" data-act="change">修改管理密码</button>';
  }
  setTimeout(() => {
    const f = authForm.querySelector('input:not([hidden])');
    if (f) f.focus();
  }, 60);
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = $('#auth-new').value;
  if (authMode === 'setup') {
    if (!pwd) return shake($('#auth-new'));
    if (pwd !== $('#auth-confirm').value) { toast('两次输入的密码不一致'); return shake($('#auth-confirm')); }
    const r = await api('/api/setup', { method: 'POST', body: JSON.stringify({ password: pwd }) });
    if (r.ok) {
      serverHasPassword = true;
      setAdmin(true);
      authOverlay.hidden = true;
      renderGrid();
      toast('管理密码已设置，已进入管理模式');
    } else {
      toast(r.body && r.body.error === 'weak_password' ? '密码至少需要 4 位' : '设置失败');
    }
  } else if (authMode === 'login') {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pwd }) });
    if (r.ok) {
      setAdmin(true);
      authOverlay.hidden = true;
      renderGrid();
      toast('已进入管理模式，只读内容现在可修改');
    } else {
      toast('密码错误');
      shake($('#auth-new'));
    }
  } else if (authMode === 'change') {
    const r = await api('/api/password', {
      method: 'POST',
      body: JSON.stringify({ old: $('#auth-old').value, new: pwd }),
    });
    if (r.ok) { toast('管理密码已更新'); renderAuthMode('active'); }
    else if (r.status === 401) { toast('当前密码错误'); shake($('#auth-old')); }
    else if (r.status === 403) { toast('需先进入管理模式'); renderAuthMode('active'); }
    else toast('修改失败');
  }
});

$('#authLinks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'back') {
    renderAuthMode(admin ? 'active' : (serverHasPassword ? 'login' : 'setup'));
  } else if (act === 'logout') {
    api('/api/logout', { method: 'POST' });
    setAdmin(false);
    authOverlay.hidden = true;
    renderGrid();
    toast('已退出管理模式');
  } else if (act === 'change') {
    renderAuthMode('change');
  }
});

$('#authCancel').addEventListener('click', () => { authOverlay.hidden = true; });
authOverlay.addEventListener('click', (e) => { if (e.target === authOverlay) authOverlay.hidden = true; });

/* 初始化统计区 */
$('#stats').innerHTML = `已收藏 <b id="statTotal">0</b> 个站点 · <b id="statCats">0</b> 个分类`;

/* ---------- 弹窗（添加 / 编辑） ---------- */
const overlay = $('#overlay');
const form = $('#linkForm');
const fTitle = $('#f-title');
const fUrl = $('#f-url');
const fDesc = $('#f-desc');
const fCat = $('#f-cat');
const fIcon = $('#f-icon');

function openModal(item) {
  if (item && item.locked && !admin) { toast('该站点为只读内容，需先进入管理模式'); return; }
  state.editingId = item ? item.id : null;
  $('#modalTitle').textContent = item ? '编辑站点' : '添加站点';
  $('#submitBtn').textContent = item ? '保存修改' : '添加';
  fTitle.value = item ? item.title : '';
  fUrl.value = item ? item.url : '';
  fDesc.value = item ? item.desc || '' : '';
  fCat.value = item ? item.category : '';
  fIcon.value = item ? item.icon || '' : '';
  $('#f-locked-wrap').hidden = !admin;
  $('#f-locked').checked = !!(item && item.locked);
  overlay.hidden = false;
  setTimeout(() => fTitle.focus(), 60);
}

function closeModal() {
  overlay.hidden = true;
  state.editingId = null;
  form.reset();
}

$('#fab').addEventListener('click', () => openModal());
$('#cancelBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // 强制重排以重启动画
  el.classList.add('shake');
  el.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = fTitle.value.trim();
  let url = normUrl(fUrl.value.trim());
  const desc = fDesc.value.trim();
  const cat = fCat.value.trim() || '未分类';
  const icon = fIcon.value.trim();

  if (!title) return shake(fTitle);
  if (!url || !isValidUrl(url)) return shake(fUrl);

  if (state.editingId) {
    const l = links().find((x) => x.id === state.editingId);
    if (l) {
      Object.assign(l, {
        title, url, desc, category: cat, icon,
        locked: admin ? $('#f-locked').checked : l.locked,
      });
      toast(`已更新「${title}」`);
    }
  } else {
    links().unshift({
      id: uid(), title, url, desc, category: cat, icon, visits: 0, createdAt: Date.now(),
      locked: admin ? $('#f-locked').checked : false, // 新添加默认可自定义
    });
    state.cat = '全部';
    state.q = '';
    search.value = '';
    toast(`已添加「${title}」`);
  }
  saveData();
  renderAll();
  closeModal();
});

/* ---------- 轻提示 ---------- */
const toasts = $('#toasts');

function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>` +
    (opts.label ? `<button type="button" class="toast-act">${esc(opts.label)}</button>` : '');
  toasts.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const dismiss = () => {
    if (!el.isConnected) return;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  };
  if (opts.label) el.querySelector('.toast-act').addEventListener('click', () => { opts.onClick && opts.onClick(); dismiss(); });
  setTimeout(dismiss, opts.label ? 6000 : 2600);
}

/* ---------- 复制链接 ---------- */
function copyLink(l) {
  const done = () => toast(`已复制链接：${l.title}`);
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = l.url;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('复制失败，请手动复制'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(l.url).then(done).catch(fallback);
  } else fallback();
}

/* ---------- 删除站点（支持撤销） ---------- */
let lastDeleted = null;
let undoTimer = null;

function deleteLink(id) {
  const list = links();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (list[i].locked && !admin) { toast('只读内容，需进入管理模式后才能删除'); return; }
  const [item] = list.splice(i, 1);
  saveData();
  renderAll();
  lastDeleted = { item, i };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { lastDeleted = null; }, 6000);
  toast(`已删除「${item.title}」`, {
    label: '撤销',
    onClick() {
      if (!lastDeleted) return;
      links().splice(Math.min(lastDeleted.i, links().length), 0, lastDeleted.item);
      lastDeleted = null;
      clearTimeout(undoTimer);
      saveData();
      renderAll();
      toast('已恢复删除的站点');
    },
  });
}

/* ---------- 网格交互 ---------- */

grid.addEventListener('click', (e) => {
  const row = e.target.closest('.card, .classic-link');
  if (!row) return;
  const l = links().find((x) => x.id === row.dataset.id);
  if (!l) return;

  const act = e.target.closest('[data-action]');
  if (act) {
    e.preventDefault();
    const a = act.dataset.action;
    if (a === 'copy') copyLink(l);
    else if (a === 'edit') openModal(l);
    else if (a === 'delete') deleteLink(l.id);
    else if (a === 'up') moveLink(l.id, -1);
    else if (a === 'down') moveLink(l.id, 1);
    return;
  }

  // 正常打开：记录一次访问热度
  l.visits = (l.visits || 0) + 1;
  saveData();
  const v = row.querySelector('.visits, .cl-visits');
  if (v) { v.textContent = `🔥 ${l.visits}`; v.hidden = false; }
});

/* 手动排序：上移 / 下移 */
function moveLink(id, dir) {
  const list = links();
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  if (list[i].locked && !admin) { toast('只读内容，需进入管理模式后才能调整顺序'); return; }
  [list[i], list[j]] = [list[j], list[i]];
  saveData();
  renderGrid(false);
}

/* 手动排序：拖拽 */
let dragId = null;

grid.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card || state.sort !== 'manual') return;
  const l = links().find((x) => x.id === card.dataset.id);
  if (!l || !canModify(l)) { e.preventDefault(); return; }
  dragId = card.dataset.id;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});

grid.addEventListener('dragend', () => {
  grid.querySelectorAll('.card').forEach((c) => c.classList.remove('dragging', 'drop-before', 'drop-after'));
  dragId = null;
});

grid.addEventListener('dragover', (e) => {
  if (state.sort !== 'manual' || !dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.target.closest('.card');
  grid.querySelectorAll('.card').forEach((c) => c.classList.remove('drop-before', 'drop-after'));
  if (card && card.dataset.id !== dragId) {
    const r = card.getBoundingClientRect();
    card.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  }
});

grid.addEventListener('drop', (e) => {
  if (state.sort !== 'manual' || !dragId) return;
  e.preventDefault();
  const target = e.target.closest('.card');
  grid.querySelectorAll('.card').forEach((c) => c.classList.remove('drop-before', 'drop-after'));

  const list = links();
  const from = list.findIndex((l) => l.id === dragId);
  dragId = null;
  if (from < 0) return;

  // 丢回自己或空白区域：保持原位 / 追加到末尾
  if (!target || target.dataset.id === list[from].id) return;

  const to = list.findIndex((l) => l.id === target.dataset.id);
  const before = target.classList.contains('drop-before');
  const [moved] = list.splice(from, 1);
  let insertAt = to + (before ? 0 : 1);
  if (from < to) insertAt--;
  list.splice(Math.max(0, Math.min(insertAt, list.length)), 0, moved);

  saveData();
  renderGrid(false);
});

/* 3D 倾斜 */
if (!REDUCED_MOTION) {
  let current = null;
  grid.addEventListener('mouseover', (e) => {
    const c = e.target.closest('.card');
    if (c && c !== current) current = c;
  });
  grid.addEventListener('mousemove', (e) => {
    if (dragId || !current || !current.contains(e.target)) return;
    const r = current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    current.style.transform =
      `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-3px)`;
  });
  grid.addEventListener('mouseout', (e) => {
    if (current && !current.contains(e.relatedTarget)) {
      current.style.transform = '';
      current = null;
    }
  });
}

/* 点击涟漪 */
grid.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  const r = c.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 1.2;
  const sp = document.createElement('span');
  sp.className = 'ripple';
  sp.style.width = sp.style.height = `${d}px`;
  sp.style.left = `${e.clientX - r.left - d / 2}px`;
  sp.style.top = `${e.clientY - r.top - d / 2}px`;
  c.append(sp);
  setTimeout(() => sp.remove(), 650);
});

/* ---------- 页面（自定义页面） ---------- */

function switchPage(id) {
  if (id === data.activePage) return;
  data.activePage = id;
  saveData();
  state.cat = '全部';
  state.q = '';
  search.value = '';
  renderAll();
}

function startRename(id) {
  const tab = pagesTabs.querySelector(`[data-page="${id}"]`);
  const nameEl = tab.querySelector('.page-name');
  const input = document.createElement('input');
  input.className = 'page-rename';
  input.value = nameEl.textContent;
  input.maxLength = 16;
  input.setAttribute('aria-label', '页面名称');
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    if (!input.isConnected) return;
    const v = input.value.trim();
    const p = data.pages.find((x) => x.id === id);
    if (p && v && v !== p.name) { p.name = v; saveData(); }
    renderPages();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') renderPages();
  });
  input.addEventListener('blur', commit);
}

let lastDeletedPage = null;
let pageUndoTimer = null;

function deletePage(id) {
  if (data.pages.length <= 1) { toast('至少保留一个页面'); return; }
  const i = data.pages.findIndex((p) => p.id === id);
  if (i < 0) return;
  if (data.pages[i].links.some((l) => l.locked) && !admin) {
    toast('该页面包含只读内容，需进入管理模式后才能删除');
    return;
  }
  const [page] = data.pages.splice(i, 1);
  if (data.activePage === id) {
    data.activePage = data.pages[Math.min(i, data.pages.length - 1)].id;
    state.cat = '全部';
    state.q = '';
    search.value = '';
  }
  saveData();
  renderAll();
  lastDeletedPage = { page, i };
  clearTimeout(pageUndoTimer);
  pageUndoTimer = setTimeout(() => { lastDeletedPage = null; }, 6000);
  toast(`已删除页面「${page.name}」`, {
    label: '撤销',
    onClick() {
      if (!lastDeletedPage) return;
      data.pages.splice(Math.min(lastDeletedPage.i, data.pages.length), 0, lastDeletedPage.page);
      lastDeletedPage = null;
      clearTimeout(pageUndoTimer);
      saveData();
      renderAll();
      toast('已恢复删除的页面');
    },
  });
}

pagesTabs.addEventListener('click', (e) => {
  const op = e.target.closest('.page-op');
  const tab = e.target.closest('.page-tab');
  if (!tab) return;
  const id = tab.dataset.page;
  if (op) {
    if (op.dataset.op === 'delete') deletePage(id);
    else if (op.dataset.op === 'rename') startRename(id);
    return;
  }
  switchPage(id);
});

pagesTabs.addEventListener('keydown', (e) => {
  const tab = e.target.closest('.page-tab');
  if (tab && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    switchPage(tab.dataset.page);
  }
});

$('#pageAdd').addEventListener('click', () => {
  const page = freshPage(`新页面 ${data.pages.length + 1}`, '📄', []);
  data.pages.push(page);
  data.activePage = page.id;
  state.cat = '全部';
  state.q = '';
  search.value = '';
  saveData();
  renderAll();
  startRename(page.id);
  toast(`已创建「${page.name}」，可直接输入名称`);
});

/* ---------- 分类筛选 / 排序 ---------- */

chips.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.cat = b.dataset.cat;
  state.q = '';
  search.value = '';
  renderAll();
});

$('#sortBar').addEventListener('click', (e) => {
  const b = e.target.closest('.sort-btn');
  if (!b || b.dataset.sort === state.sort) return;
  state.sort = b.dataset.sort;
  renderGrid();
  updateSortBar();
  if (state.sort === 'manual') {
    toast(state.theme === 'classic'
      ? '手动排序：使用 ↑ ↓ 按钮调整顺序'
      : '手动排序：直接拖拽卡片，或用 ↑ ↓ 按钮调整顺序');
  }
});

/* ---------- 搜索 ---------- */
search.addEventListener('input', () => {
  state.q = search.value.trim();
  renderGrid();
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const list = filtered();
    if (list.length) window.open(list[0].url, '_blank');
  }
});

/* 随机探索 */
$('#randomBtn').addEventListener('click', () => {
  const list = filtered();
  const pool = list.length ? list : links();
  if (!pool.length) { toast('这个页面还没有站点，先添加一个吧'); return; }
  const l = pool[Math.floor(Math.random() * pool.length)];
  window.open(l.url, '_blank');
  toast(`🎲 随机探索：${l.title}`);
});

/* 空状态按钮 */
$('#emptyBtn').addEventListener('click', () => {
  if (state.q) {
    state.q = '';
    search.value = '';
    renderGrid();
  } else {
    openModal();
  }
});

/* ---------- 键盘快捷键 ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== search && overlay.hidden) {
    e.preventDefault();
    search.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    search.focus();
  }
  if (e.key === 'Escape') {
    const pop = $('#palettePop');
    if (!pop.hidden) { pop.hidden = true; return; }
    if (!overlay.hidden) closeModal();
    else if (document.activeElement === search) {
      if (search.value) {
        search.value = '';
        state.q = '';
        renderGrid();
      } else search.blur();
    }
  }
});

/* ---------- 时钟与问候 ---------- */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function tickClock() {
  const d = new Date();
  $('#time').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
  $('#date').textContent =
    `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK[d.getDay()]}`;

  const h = d.getHours();
  let g;
  if (h < 5) g = '夜深了，注意休息 🌙';
  else if (h < 9) g = '早上好，开启元气满满的一天 ☀️';
  else if (h < 12) g = '上午好，保持专注 ✨';
  else if (h < 14) g = '中午好，别忘了好好吃饭 🍜';
  else if (h < 18) g = '下午好，继续加油 💪';
  else if (h < 22) g = '晚上好，享受你的夜晚 🌆';
  else g = '夜深了，早点休息 🌙';

  const gEl = $('#greeting');
  if (gEl.dataset.g !== g) { gEl.dataset.g = g; gEl.textContent = g; }
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- 鼠标聚光灯 ---------- */
document.addEventListener('mousemove', (e) => {
  document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
  document.documentElement.style.setProperty('--my', `${e.clientY}px`);
});

/* ---------- 星空背景（粒子 + 视差 + 流星） ---------- */
function initStars() {
  const canvas = $('#stars');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w, h;
  const COUNT = 150;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let shooting = null;
  let nextShoot = performance.now() + 3500 + Math.random() * 7000;
  let running = !document.hidden;
  let raf;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawn = (anywhere) => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -4,
    r: Math.random() * 1.4 + 0.3,
    s: Math.random() * 0.22 + 0.04,
    p: Math.random() * Math.PI * 2,
    a: Math.random() * 0.5 + 0.3,
  });

  const init = () => {
    resize();
    stars = Array.from({ length: COUNT }, () => spawn(true));
  };

  const frame = (t) => {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    // 鼠标视差
    const px = (mouse.x - w / 2) / w;
    const py = (mouse.y - h / 2) / h;

    for (const s of stars) {
      s.y += s.s;
      if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
      const tw = 0.55 + 0.45 * Math.sin(t / 900 * s.s * 10 + s.p);
      const ox = px * s.r * 26;
      const oy = py * s.r * 26;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#cfe3ff';
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 流星
    if (t > nextShoot && !shooting) {
      shooting = {
        x: Math.random() * w * 0.7 + w * 0.15,
        y: Math.random() * h * 0.3,
        vx: -(5 + Math.random() * 5),
        vy: 2.2 + Math.random() * 1.8,
        life: 0,
      };
      nextShoot = t + 7000 + Math.random() * 9000;
    }
    if (shooting) {
      shooting.x += shooting.vx;
      shooting.y += shooting.vy;
      shooting.life += 1;
      const g = ctx.createLinearGradient(
        shooting.x, shooting.y,
        shooting.x - shooting.vx * 14, shooting.y - shooting.vy * 14
      );
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(shooting.x, shooting.y);
      ctx.lineTo(shooting.x - shooting.vx * 14, shooting.y - shooting.vy * 14);
      ctx.stroke();
      if (shooting.life > 55) shooting = null;
    }
    ctx.globalAlpha = 1;
  };

  init();
  raf = requestAnimationFrame(frame);
  addEventListener('resize', init);
  addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
}

if (!REDUCED_MOTION) initStars();

/* ---------- 启动 ---------- */
let booted = false;

async function boot() {
  try {
    // 会话状态与服务器数据并行获取，减少等待
    const [s, r] = await Promise.all([
      api('/api/session'),
      api('/api/data'),
    ]);
    if (s.ok && s.body) {
      serverHasPassword = !!s.body.hasPassword;
      admin = !!s.body.admin;
      setAdmin(admin);
    }
    if (!r.ok || !r.body) throw new Error('data ' + r.status);
    const serverData = r.body;
    if (!Array.isArray(serverData.pages) || serverData.pages.length === 0) {
      // 服务器尚无数据：用本地缓存或默认种子完成首次初始化
      if (!data || !data.pages.length) data = buildSeed();
      await saveData();
    } else {
      data = serverData;
      cacheLocal();
    }
    if (data.theme === 'classic' && state.theme !== 'classic') state.theme = 'classic';
    state.palette = data.palette || {};
    // 老数据自动补入新增的内置站点（如币圈分类），并持久化
    if (mergeNewDefaults()) await saveData();
  } catch {
    $('#connBanner').hidden = false;
    if (!data || !data.pages.length) data = buildSeed();
    mergeNewDefaults();
    toast('⚠️ 无法连接服务器，当前为离线浏览（改动不会保存）');
  }
  booted = true;
  setAdmin(admin);
  renderAll();
}

/* 首屏立即渲染：先用本地缓存（或默认种子）秒开页面，
   再在后台与服务器同步——服务器慢也不影响首屏打开 */
if (!data || !data.pages.length) data = buildSeed();
setAdmin(admin);
renderAll();
boot();
