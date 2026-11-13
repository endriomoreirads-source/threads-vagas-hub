const { fetchLinkedInLiveJobs, getFacebookPublicJobs, getIndeedVerifiedJobs, getGoogleJobsVerified } = require('./platforms_feeder.js');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Arquivos de banco de dados persistentes em disco (JSON Store atômico)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'jobs_store.json');
const USERS_FILE = path.join(DATA_DIR, 'users_store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const { Pool } = require('pg');

let dbPool = null;
const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  console.log('🐘 PostgreSQL conectado para persistência permanente de usuários e sessões!');
} else {
  console.log('📁 Modo arquivo local para persistência de usuários.');
}

async function initPostgresTables() {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_jobs (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        job_data JSONB,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, job_id, status)
      );
    `);
    console.log('🐘 Tabelas PostgreSQL verificadas/prontas com sucesso!');
  } catch (err) {
    console.error('Erro ao verificar tabelas PostgreSQL:', err.message);
  }
}
initPostgresTables();

// Mapa persistente de usuários em memória (email -> { id, name, email, salt, hash, createdAt, savedJobs: [], dismissedJobs: [] })
const usersStore = new Map();
// Sessões ativas em memória (token -> email)
const sessionsStore = new Map();

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function loadUsersStore() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(u => {
          if (u && u.email) usersStore.set(u.email.toLowerCase(), u);
        });
        console.log(`👤 Banco de usuários local carregado: ${usersStore.size} contas.`);
      }
    }
  } catch (err) {
    console.error('Erro ao ler USERS store local:', err.message);
  }
}

function saveUsersStore() {
  try {
    const list = Array.from(usersStore.values());
    const tempFile = USERS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tempFile, USERS_FILE);
  } catch (err) {
    console.error('Erro ao salvar USERS store local:', err.message);
  }
}

loadUsersStore();

async function dbFindUserByEmail(email) {
  const cleanEmail = email.toLowerCase().trim();
  if (dbPool) {
    try {
      const res = await dbPool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      
      const jobsRes = await dbPool.query('SELECT job_id, status, job_data FROM user_jobs WHERE user_id = $1', [row.id]);
      const savedJobs = [];
      const dismissedJobs = [];
      jobsRes.rows.forEach(r => {
        if (r.status === 'saved') {
          savedJobs.push(r.job_data || { id: r.job_id });
        } else if (r.status === 'dismissed') {
          dismissedJobs.push(r.job_id);
        }
      });

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        hash: row.password_hash,
        salt: row.salt,
        createdAt: Number(row.created_at),
        savedJobs,
        dismissedJobs
      };
    } catch (err) {
      console.error('Erro no dbFindUserByEmail:', err.message);
    }
  }
  return usersStore.get(cleanEmail) || null;
}

async function dbCreateUser({ id, name, email, salt, hash }) {
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();
  if (dbPool) {
    try {
      await dbPool.query(
        'INSERT INTO users (id, name, email, password_hash, salt, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, name, cleanEmail, hash, salt, now]
      );
    } catch (err) {
      console.error('Erro no dbCreateUser:', err.message);
    }
  }
  const user = {
    id,
    name,
    email: cleanEmail,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    savedJobs: [],
    dismissedJobs: []
  };
  usersStore.set(cleanEmail, user);
  saveUsersStore();
  return user;
}

async function dbCreateSession(token, userId, email) {
  if (dbPool) {
    try {
      await dbPool.query(
        'INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET created_at = $3',
        [token, userId, Date.now()]
      );
    } catch (err) {
      console.error('Erro no dbCreateSession:', err.message);
    }
  }
  sessionsStore.set(token, email);
}

async function dbFindUserByToken(token) {
  if (dbPool) {
    try {
      const sRes = await dbPool.query('SELECT user_id FROM sessions WHERE token = $1', [token]);
      if (sRes.rows.length > 0) {
        const userId = sRes.rows[0].user_id;
        const uRes = await dbPool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (uRes.rows.length > 0) {
          const row = uRes.rows[0];
          const jobsRes = await dbPool.query('SELECT job_id, status, job_data FROM user_jobs WHERE user_id = $1', [row.id]);
          const savedJobs = [];
          const dismissedJobs = [];
          jobsRes.rows.forEach(r => {
            if (r.status === 'saved') {
              savedJobs.push(r.job_data || { id: r.job_id });
            } else if (r.status === 'dismissed') {
              dismissedJobs.push(r.job_id);
            }
          });
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            savedJobs,
            dismissedJobs
          };
        }
      }
    } catch (err) {
      console.error('Erro no dbFindUserByToken:', err.message);
    }
  }
  const email = sessionsStore.get(token);
  if (email && usersStore.has(email)) {
    return usersStore.get(email);
  }
  return null;
}

async function dbSyncUserJobs(userId, email, savedJobs, dismissedJobs) {
  const now = Date.now();
  if (dbPool) {
    try {
      await dbPool.query('DELETE FROM user_jobs WHERE user_id = $1', [userId]);
      for (const sj of savedJobs) {
        const jobId = sj.id || sj.code;
        if (jobId) {
          await dbPool.query(
            'INSERT INTO user_jobs (user_id, job_id, status, job_data, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [userId, jobId, 'saved', JSON.stringify(sj), now]
          );
        }
      }
      for (const djId of dismissedJobs) {
        if (djId) {
          await dbPool.query(
            'INSERT INTO user_jobs (user_id, job_id, status, job_data, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [userId, djId, 'dismissed', null, now]
          );
        }
      }
    } catch (err) {
      console.error('Erro no dbSyncUserJobs:', err.message);
    }
  }
  const localUser = usersStore.get(email);
  if (localUser) {
    localUser.savedJobs = savedJobs;
    localUser.dismissedJobs = dismissedJobs;
    saveUsersStore();
  }
}

// Middleware de Autenticação (compatível com PostgreSQL e Fallback local)
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Acesso não autorizado. Faça login.' });
  }
  const token = authHeader.split(' ')[1];
  const user = await dbFindUserByToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Sessão expirada ou inválida.' });
  }
  req.user = user;
  next();
}

// Mapa persistente de todos os posts já coletados (ID -> Job Objeto)
const globalJobsStore = new Map();
let lastCrawlerRun = null;
let isCrawling = false;

// Carrega dados salvos anteriormente se existirem
function loadPersistentStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(job => {
          if (job && job.id) globalJobsStore.set(job.id, job);
        });
        console.log(`📦 Banco de dados carregado com sucesso: ${globalJobsStore.size} vagas em disco.`);
      }
    }
  } catch (err) {
    console.error('Erro ao ler DB persistente:', err.message);
  }
}

// Salva de forma segura no disco
function savePersistentStore() {
  try {
    const list = Array.from(globalJobsStore.values());
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Erro ao salvar DB persistente:', err.message);
  }
}

loadPersistentStore();

// Queries comprovadas que retornam SSR no Threads
const QUERIES_DESIGN_BR = [
  'vaga designer grafico',
  'vaga designer',
  'preciso de designer',
  'procuro designer',
  'contratando designer',
  'freela designer',
  'oportunidade designer grafico',
  'vaga social media designer',
  'designer remoto vaga',
  'designer fixo agencia',
  'vaga direcao de arte',
  'vaga identidade visual'
];

const QUERIES_DESIGN_INTL = [
  'hiring graphic designer',
  'looking for a graphic designer',
  'need a graphic designer',
  'graphic designer job remote',
  'freelance graphic designer needed',
  'hiring brand designer',
  'looking for a designer remote',
  'hiring social media designer',
  'se busca diseñador grafico',
  'busco diseñador grafico'
];

const QUERIES_RJ_CLT = [
  'vagas rj',
  'vagasrJ',
  'empregorj',
  'vagasdeemprego',
  'estamos contratando',
  'oportunidade de emprego',
  'auxiliar administrativo',
  'recepcionista',
  'atendente',
  'baixada fluminense',
  'nova iguacu',
  'duque de caxias',
  'belford roxo',
  'vagas'
];

const RJ_CURATOR_PROFILES = [
  'vagas_de_emprego_rj_',
  'ayresconsult2022',
  'radar_de_oportunidades_rj',
  'miguel00_07'
];

// Mapa de Distância e Proximidade em relação a BELFORD ROXO - RJ
const RJ_PROXIMITY_TIERS = [
  {
    tier: 1,
    km: 0,
    zone: 'Belford Roxo (Sua Cidade)',
    badge: '📍 Belford Roxo (~0-5 km)',
    scoreBoost: 32,
    regex: /\b(belford\s+roxo|lote\s+xv|areia\s+branca|heli[óo]polis|nova\s+piam|sargento\s+roncalli|parque\s+s[ãa]o\s+jos[ée]|wona)\b/i
  },
  {
    tier: 2,
    km: 8,
    zone: 'Baixada Fluminense (Vizinhos Imediatos)',
    badge: '🚆 Baixada / Vizinho (~6-15 km)',
    scoreBoost: 25,
    regex: /\b(nova\s+igua[çc]u|duque\s+de\s+caxias|caxias|s[ãa]o\s+jo[ãa]o\s+de\s+meriti|meriti|nil[óo]polis|mesquita|queimados|eng\w*\s+pedreira|japeri|serop[ée]dica|mag[ée]|baixada\s+fluminense|baixada|vilar\s+dos\s+teles|alc[âa]ntara)\b/i
  },
  {
    tier: 3,
    km: 18,
    zone: 'Zona Norte RJ & Av. Brasil (Fácil Acesso)',
    badge: '🚌 Zona Norte RJ (~15-24 km)',
    scoreBoost: 18,
    regex: /\b(pavuna|iraja|iraj[áa]|madureira|coelho\s+neto|acari|costa\s+barros|penha|olaria|onsucesso|bonsucesso|ramos|del\s+castilho|nova\s+am[ée]rica|meier|m[ée]ier|tijuca|maracan[ãa]|s[ãa]o\s+crist[óo]v[ãa]o|benfica|ilha\s+do\s+governador|fund[ãa]o|cascadura|pilares|inha[úu]ma|engenh[ãa]o|engenho\s+de\s+dentro|avenida\s+brasil|av\.?\s+brasil|zona\s+norte)\b/i
  },
  {
    tier: 4,
    km: 27,
    zone: 'Centro do Rio / Região Portuária (Acesso Direto Trem/Metrô)',
    badge: '🚇 Centro RJ (~25-30 km)',
    scoreBoost: 14,
    regex: /\b(centro\s+rj|centro\s+do\s+rio|centro\s*-\s*rj|lapa|cinel[âa]ndia|carioca|uruguaiana|presidente\s+vargas|porto\s+maravilha|gamboa|santo\s+cristo|catete|gl[óo]ria|flamengo|est[áa]cio|cidade\s+nova)\b/i
  },
  {
    tier: 5,
    km: 35,
    zone: 'Zona Sul / Zona Oeste / Grande Rio',
    badge: '🏙️ RJ Capital / Grande Rio (~32-45 km)',
    scoreBoost: 8,
    regex: /\b(botafogo|copacabana|ipanema|leblon|lagoa|gavea|g[áa]vea|jardim\s+bot[âa]nico|humait[áa]|laranjeiras|rio\s+sul|barra\s+da\s+tijuca|recreio|jacarepagu[áa]|riocentro|taquara|freguesia|bangu|realengo|campo\s+grande|santa\s+cruz|deodoro|niter[óo]i|s[ãa]o\s+gon[çc]alo|itabora[íi]|rio\s+de\s+janeiro|\/rj|\brj\b|ddd\s*21|\(21\)|\b21\s*9\d{4})\b/i
  }
];

const THREADS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,es;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
};

function extractPostsFromJSON(obj, found = []) {
  if (!obj || typeof obj !== 'object') return found;

  if (
    typeof obj.code === 'string' &&
    obj.caption &&
    typeof obj.caption.text === 'string' &&
    obj.caption.text.trim().length > 0 &&
    obj.user &&
    typeof obj.user.username === 'string'
  ) {
    found.push(obj);
  }

  if (Array.isArray(obj)) {
    for (const item of obj) extractPostsFromJSON(item, found);
  } else {
    for (const key of Object.keys(obj)) extractPostsFromJSON(obj[key], found);
  }
  return found;
}

async function fetchThreadsUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: THREADS_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) return [];
    const html = await response.text();

    const scriptRegex = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    const rawPosts = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes('"caption"') || content.includes('"thread_items"')) {
        try {
          const parsed = JSON.parse(content);
          extractPostsFromJSON(parsed, rawPosts);
        } catch (_) {}
      }
    }

    return rawPosts;
  } catch (err) {
    return [];
  }
}

async function fetchThreadsQuery(query, serpType = 'default') {
  const url = `https://www.threads.com/search?q=${encodeURIComponent(query)}&serp_type=${serpType}`;
  return fetchThreadsUrl(url);
}

async function fetchThreadsProfile(username) {
  const url = `https://www.threads.com/@${encodeURIComponent(username)}`;
  return fetchThreadsUrl(url);
}

function detectRJProximity(text, username) {
  const combined = `${text} @${username}`;
  for (const item of RJ_PROXIMITY_TIERS) {
    const m = combined.match(item.regex);
    if (m) {
      return {
        isRJ: true,
        tier: item.tier,
        estimatedKm: item.km,
        zone: item.zone,
        badge: item.badge,
        matchedPlace: m[0].trim(),
        scoreBoost: item.scoreBoost
      };
    }
  }
  return {
    isRJ: false,
    tier: 99,
    estimatedKm: 999,
    zone: null,
    badge: null,
    matchedPlace: null,
    scoreBoost: 0
  };
}

function formatPhoneDigits(digits) {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function extractWhatsAppInfo(text, isRJ = true) {
  if (!text) return null;
  const waLinkMatch = text.match(/(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/send\?phone=([0-9]+)|(?:https?:\/\/)?wa\.me\/([0-9]+)/i);
  if (waLinkMatch) {
    const rawDigits = (waLinkMatch[1] || waLinkMatch[2] || '').replace(/\D/g, '');
    if (rawDigits.length >= 10) {
      const cleanDigits = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
      return {
        cleanDigits,
        display: formatPhoneDigits(cleanDigits.slice(2)),
        url: `https://wa.me/${cleanDigits}`
      };
    }
  }

  const patterns = [
    /(?:whats(?:app)?|zap|wpp|contato|celular|telefone|tel|cv|curr[ií]culo)\D{0,35}(?:\+?55\s*)?(?:\(?([1-9][0-9])\)?\s*[-.]?\s*)?(9\s*[0-9]{4}\s*[-.]?\s*[0-9]{4}|[2-8][0-9]{3}\s*[-.]?\s*[0-9]{4})/i,
    /(?:\+?55\s*)?(?:\(?([1-9][0-9])\)?\s*[-.]?\s*)(9\s*[0-9]{4}\s*[-.]?\s*[0-9]{4}|[2-8][0-9]{3}\s*[-.]?\s*[0-9]{4})/i,
    /(?:\b|\D)(?:55)?([1-9][0-9])[-.\s]?(9[0-9]{8}|9[0-9]{4}[-.\s][0-9]{4})\b/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      let digits = match[0].replace(/\D/g, '');
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        return {
          cleanDigits: digits,
          display: formatPhoneDigits(digits.slice(2)),
          url: `https://wa.me/${digits}`
        };
      }
      if (digits.length === 10 || digits.length === 11) {
        return {
          cleanDigits: `55${digits}`,
          display: formatPhoneDigits(digits),
          url: `https://wa.me/55${digits}`
        };
      }
      if ((digits.length === 9 || digits.length === 8) && isRJ) {
        return {
          cleanDigits: `5521${digits}`,
          display: `(21) ${formatPhoneDigits(digits)}`,
          url: `https://wa.me/5521${digits}`
        };
      }
    }
  }
  return null;
}

function evaluateJobAuthenticity({
  text,
  user,
  isHiringPost,
  salary,
  tools,
  modalities,
  contracts,
  ageDays,
  proximityInfo
}) {
  let authenticityScore = 52;
  const reasons = [];
  const warnings = [];

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/);
  const urlMatch = text.match(/https?:\/\/[^\s)]+|forms\.gle\/[^\s)]+|bit\.ly\/[^\s)]+/i);
  const applyCall = /portf[óo]lio|portfolio|curr[íi]culo|curriculo|cv\b|resume|whatsapp|zap|dm\b|direct|inbox|coment[áa]rio|link na bio|comparecer|entrevista/i.test(text);

  if (emailMatch) {
    authenticityScore += 22;
    reasons.push(`E-mail de RH/contato (${emailMatch[0]})`);
  }
  if (phoneMatch) {
    authenticityScore += 22;
    reasons.push(`WhatsApp / Telefone de RH (${phoneMatch[0].trim()})`);
  }
  if (urlMatch) {
    authenticityScore += 16;
    reasons.push('Link oficial de candidatura presente');
  }
  if (applyCall) {
    authenticityScore += 14;
    reasons.push('Instrução clara para enviar Currículo / Portfólio');
  }

  if (salary) {
    authenticityScore += 18;
    reasons.push(`Salário / Valor informado (${salary})`);
  }
  if (proximityInfo?.isRJ && proximityInfo.matchedPlace) {
    authenticityScore += 12;
    reasons.push(`Local de atuação identificado (${proximityInfo.matchedPlace})`);
  }
  if (tools.length > 0) {
    authenticityScore += 10;
    reasons.push(`Ferramentas/requisitos claros (${tools.join(', ')})`);
  }
  if (modalities.length > 0 || contracts.length > 0) {
    authenticityScore += 8;
  }
  if (text.length >= 100) {
    authenticityScore += 8;
    reasons.push('Descrição completa de requisitos/benefícios');
  }

  if (user?.is_verified) {
    authenticityScore += 14;
    reasons.push('Perfil verificado no Threads');
  }

  const baitSignals = /rt\s+e\s+curte|comenta\s+"eu\s+quero"\s+que\s+te\s+ensino|compre\s+meu\s+curso|renda\s+extra\s+f[áa]cil|ganhe\s+dinheiro\s+sem\s+experi[êe]ncia|taxa\s+de\s+inscri[çc][ãa]o|pix\s+premiado/i.test(text);
  if (baitSignals) {
    authenticityScore -= 45;
    warnings.push('Possível isca de engajamento ou venda de curso');
  }

  if (!isHiringPost) {
    authenticityScore -= 35;
    warnings.push('Não parece anúncio direto de empregador/RH');
  }

  if (text.length < 40 && !applyCall && !emailMatch && !phoneMatch) {
    authenticityScore -= 15;
    warnings.push('Publicação muito curta sem canal de envio de currículo');
  }

  authenticityScore = Math.max(10, Math.min(99, authenticityScore));

  let trustLevel = 'Média';
  let trustBadge = '🟡 Vaga Provável (Checar post)';
  if (authenticityScore >= 75) {
    trustLevel = 'Alta';
    trustBadge = '🛡️ Vaga Real Verificada';
  } else if (authenticityScore < 48) {
    trustLevel = 'Baixa';
    trustBadge = '⚠️ Poucos Dados / Duvidosa';
  }

  return {
    authenticityScore,
    trustLevel,
    trustBadge,
    reasons: reasons.slice(0, 4),
    warnings,
    contactEmail: emailMatch ? emailMatch[0] : null,
    contactPhone: phoneMatch ? phoneMatch[0].trim() : null
  };
}

function analyzeAndClassifyPost(post, activeFilters = {}) {
  const text = (post.caption?.text || '').trim();
  const lower = text.toLowerCase();
  const username = post.user?.username || 'desconhecido';
  const fullName = post.user?.full_name || username;
  const avatarUrl = post.user?.profile_pic_url || '';
  const code = post.code;
  const takenAt = post.taken_at || Math.floor(Date.now() / 1000);
  const likeCount = post.like_count || 0;

  const designRegex = /\b(designer|design\s+gr[aá]fico|graphic\s+designer|graphic\s+design|brand\s+designer|visual\s+designer|dise[ñn]ador|dise[ñn]o\s+gr[aá]fico|identidade\s+visual|social\s+media|carrossel|carross[eé]is|carousel|criativos|photoshop|illustrator|figma|motion|diretor\s+de\s+arte|dire[cç][aã]o\s+de\s+arte|art\s+director|diagrama[cç][aã]o|branding|ui\/ux|web\s+designer|landing\s+page|capista|thumbnail|logo\s+design)\b/i;
  const hasDesignContext = designRegex.test(text);

  const cltGeneralRegex = /\b(vaga|vagas|estamos\s+contratando|contrata-se|contrata|oportunidade\s+de\s+emprego|processo\s+seletivo|curr[íi]culo|curriculo|clt|carteira\s+assinada|auxiliar|assistente|atendente|recepcionista|operador|repositor|mercado|supermercado|produ[çc][ãa]o|log[íi]stica|expedi[çc][ãa]o|almoxarifado|almoxarife|escrit[óo]rio|administrativo|servi[çc]os\s+gerais|asg|vendedor|balconista|caixa|estoque|estoquista|motorista|porteiro|portaria|vigilante|cozinheiro|merendeira|aprendiz|est[áa]gio|rh\b|recursos\s+humanos)\b/i;
  const hasGeneralJobContext = cltGeneralRegex.test(text);

  const proximity = detectRJProximity(text, username);

  const jobTopics = [];
  if (hasDesignContext) jobTopics.push('design');
  if (proximity.isRJ) jobTopics.push('rj_clt');
  if (/\b(mercado|supermercado|atacad[ãa]o|assa[íi]|guanabara|mundial|prezunic|rede\s+economia|vendedor|loja|shopping|atendente|operador\s+de\s+caixa|caixa|repositor|balconista|empacotador|padaria|lanchonete|cafeteria|burger|restaurante|farm[áa]cia)\b/i.test(text)) {
    jobTopics.push('mercado_comercio');
  }
  if (/\b(produ[çc][ãa]o|auxiliar\s+de\s+produ[çc][ãa]o|f[áa]brica|ind[úu]stria|operador\s+log[íi]stico|log[íi]stica|expedi[çc][ãa]o|almoxarife|almoxarifado|estoque|estoquista|carga|descarga|servi[çc]os\s+gerais|asg|limpeza|manuten[çc][ãa]o|obras|controle\s+de\s+acesso|portaria)\b/i.test(text)) {
    jobTopics.push('producao_logistica');
  }
  if (/\b(escrit[óo]rio|auxiliar\s+de\s+escrit[óo]rio|administrativo|assistente\s+administrativo|recepcionista|recep[çc][ãa]o|secret[áa]ria|atendimento|financeiro|faturamento|rh|recursos\s+humanos|telemarketing|call\s+center|sac|jovem\s+aprendiz)\b/i.test(text)) {
    jobTopics.push('escritorio_adm');
  }

  const englishHiringSignals = /\b(hiring|looking\s+for|we\s+are\s+looking|need\s+a|needed|apply|dm\s+me|send\s+portfolio|drop\s+your\s+portfolio|remote\s+job|freelance\s+designer|graphic\s+designer)\b/i;
  const spanishHiringSignals = /\b(se\s+busca|busco\s+dise[ñn]ador|buscamos\s+dise[ñn]ador|vacante|portafolio)\b/i;
  const currencySignals = /\b(usd|eur|gbp|d[óo]lar|d[óo]lares)\b|\$\s*\d+\s*(?:k|\/hr|\/mo|\/yr|usd)/i;

  const isInternational =
    !proximity.isRJ &&
    (englishHiringSignals.test(text) ||
      spanishHiringSignals.test(text) ||
      currencySignals.test(text) ||
      lower.includes('vaga gringa'));

  if (isInternational) jobTopics.push('gringa');

  const hiringIndicators = [
    'vaga', 'vagas', 'preciso de', 'procuro', 'procurando', 'busco', 'buscando',
    'contratando', 'contrata-se', 'contrata', 'oportunidade', 'estamos com vaga',
    'abrindo vaga', 'abrimos vaga', 'enviar portfólio', 'envie seu portfólio',
    'mande seu portfólio', 'mandem portfólio', 'deixe seu portfólio', 'indicação de',
    'alguém indica', 'alguem indica', 'time de marketing', 'para agência',
    'remuneração', 'salário', 'salario', 'pagando', 'quer um novo talento',
    'envie seu currículo', 'enviar currículo', 'mandar curriculo', 'mande seu currículo',
    'processo seletivo', 'carteira assinada', 'vale-transporte', 'vale transporte',
    'vale-refeição', 'benefícios', 'requisitos', 'horário:', 'local:', 'cargo:',
    'hiring', 'we are hiring', "we're hiring", 'looking for a', 'looking for an',
    'looking to hire', 'need a graphic', 'need a designer', 'need a brand',
    'designer needed', 'open role', 'job opening', 'send your portfolio',
    'drop your portfolio', 'share your portfolio', 'dm your portfolio',
    'se busca', 'busco diseñador', 'buscamos diseñador', 'estamos contratando', 'vacante'
  ];

  const candidateOrSelfPromoIndicators = [
    'agenda aberta', 'estou disponível', 'estou disponivel', 'faço artes',
    'crio identidade visual', 'orçamento sem compromisso', 'solicite seu orçamento',
    'meu portfólio', 'meu trabalho', 'sou designer e', 'precisando de um designer? me chama',
    'pacotes de posts personalizados', 'artes por r$', 'faço seu design',
    'ainda tem vaga?', 'tenho interesse na vaga', 'procuro vaga', 'busco vaga',
    'estou procurando vaga', 'estou procurando emprego', 'perdeu o emprego hoje',
    'me indiquem vagas', 'alguém sabe onde está tendo vaga', 'alguem sabe onde esta tendo vaga',
    'onde está tendo vaga', 'precisando de um emprego', 'oq tem de errado no meu currículo',
    'não recebo uma ligação', 'fui criticada porque', 'fui criticado porque',
    'open for commissions', 'commissions open', 'available for freelance',
    'available for work', 'hire me', 'i am a graphic designer', "i'm a graphic designer",
    'my portfolio', 'dm me for rates', 'looking for clients'
  ];

  const explicitJobOpeningRegex = /\b(vaga|vagas|contratando|contrata-se|contrata|oportunidade\s+de\s+emprego|processo\s+seletivo|envie\s+seu\s+curr[íi]culo|enviar\s+curr[íi]culo|mandar\s+curriculo|mande\s+seu\s+curr[íi]culo|venha\s+fazer\s+parte\s+do\s+time|preciso\s+de\s+designer|procuro\s+designer|estamos\s+com\s+vaga|abrimos\s+vaga|hiring|looking\s+for\s+a|job\s+opening|se\s+busca)\b/i;

  const hasHiringSignal =
    explicitJobOpeningRegex.test(text) &&
    (hiringIndicators.some(kw => lower.includes(kw)) ||
      RJ_CURATOR_PROFILES.includes(username.toLowerCase()));

  const hasSelfPromoSignal = candidateOrSelfPromoIndicators.some(kw => lower.includes(kw));

  const isAgendaPromo =
    (lower.includes('vagas abertas') && (lower.includes('artes por r$') || lower.includes('me chama no direct') || lower.includes('agenda'))) ||
    hasSelfPromoSignal;

  const isNonJobCivicPost =
    /reforma|campo\s+sint[ée]tico|pista\s+de\s+skate|for[çc]a\s+municipal|ouvidoria/i.test(text) &&
    !/vaga|emprego|contrata|curr[íi]culo|processo\s+seletivo/i.test(text);

  const isHiringPost = hasHiringSignal && !isAgendaPromo && !isNonJobCivicPost;

  const modalities = [];
  if (
    lower.includes('remoto') ||
    lower.includes('remota') ||
    lower.includes('remote') ||
    lower.includes('worldwide') ||
    lower.includes('work from home') ||
    lower.includes('home office') ||
    lower.includes('home-office') ||
    lower.includes('100% online') ||
    isInternational
  ) {
    modalities.push('Remoto');
  }
  if (lower.includes('híbrido') || lower.includes('hibrido') || lower.includes('híbrida') || lower.includes('hybrid')) {
    modalities.push('Híbrido');
  }
  if (lower.includes('presencial') || lower.includes('on-site') || proximity.isRJ) {
    if (!modalities.includes('Presencial')) modalities.push('Presencial');
  }
  if (modalities.length === 0 && (lower.includes('freela') || lower.includes('demanda') || lower.includes('pacote'))) {
    modalities.push('Remoto (Provável)');
  }

  const contracts = [];
  if (
    lower.includes('freela') ||
    lower.includes('freelance') ||
    lower.includes('freelancer') ||
    lower.includes('contract') ||
    lower.includes('por dia') ||
    lower.includes('diária') ||
    lower.includes('diaria') ||
    lower.includes('demanda') ||
    lower.includes('por projeto') ||
    lower.includes('pacote')
  ) {
    contracts.push('Freelance');
  }
  if (
    lower.includes('clt') ||
    lower.includes('carteira assinada') ||
    lower.includes('fixo') ||
    lower.includes('efetivo') ||
    lower.includes('pj') ||
    lower.includes('full-time') ||
    lower.includes('full time') ||
    lower.includes('mensal') ||
    lower.includes('salário') ||
    lower.includes('salario') ||
    lower.includes('salary') ||
    lower.includes('vale-transporte') ||
    lower.includes('vale-alimentação') ||
    proximity.isRJ
  ) {
    contracts.push('CLT / Fixo / PJ');
  }

  let seniority = null;
  if (/\b(sem\s+experi[êe]ncia|primeiro\s+emprego|jovem\s+aprendiz|aprendiz)\b/i.test(text)) seniority = 'Jovem Aprendiz / Sem Exp.';
  else if (/\b(jr|júnior|junior|entry[\s-]level|estágio|estagio|iniciante)\b/i.test(text)) seniority = 'Júnior / Estágio';
  else if (/\b(pleno|pl|mid[\s-]level)\b/i.test(text)) seniority = 'Pleno';
  else if (/\b(sênior|senior|sr|lead|head)\b/i.test(text)) seniority = 'Sênior';

  const areas = [];
  if (jobTopics.includes('mercado_comercio')) areas.push('Mercado / Comércio / Atendimento');
  if (jobTopics.includes('producao_logistica')) areas.push('Produção / Logística / Serviços');
  if (jobTopics.includes('escritorio_adm')) areas.push('Escritório / Administrativo / Recepção');

  if (hasDesignContext) {
    if (/social media|post|carrossel|carrosséis|carrosseis|carousel|feed|story|stories|instagram|content/i.test(text)) {
      areas.push('Social Media');
    }
    if (/identidade visual|branding|marca|logotipo|logo|brand/i.test(text)) {
      areas.push('Identidade Visual');
    }
    if (/motion|vídeo|video|reels|after effects|premiere|capcut|animação|animation/i.test(text)) {
      areas.push('Motion / Vídeo');
    }
    if (/ui|ux|figma|web|landing page|site|produto|product|app/i.test(text)) {
      areas.push('UI/UX & Web');
    }
    if (/tráfego|trafego|ads|paid ads|criativos|ad creatives|conversão|performance|e-commerce|ecommerce|thumbnail/i.test(text)) {
      areas.push('Criativos / Ads');
    }
    if (areas.length === 0) {
      areas.push('Design Gráfico');
    }
  }

  if (areas.length === 0) {
    areas.push('Vaga Geral / Operacional');
  }

  const tools = [];
  const toolMap = {
    'Photoshop': /photoshop|\bps\b/i,
    'Illustrator': /illustrator|\bai\b/i,
    'Figma': /figma/i,
    'Canva': /canva/i,
    'Pacote Office / Excel': /\b(excel|word|pacote\s+office)\b/i,
    'Vale-Transporte': /\b(vale[-\s]?transporte|\bvt\b|bilhete\s+[úu]nico|riocard)\b/i,
    'Vale-Refeição/Alimentação': /\b(vale[-\s]?refei[çc][ãa]o|vale[-\s]?alimenta[çc][ãa]o|\bvr\b|\bva\b|refei[çc][ãa]o\s+no\s+local)\b/i,
    'Carteira Assinada (CLT)': /\b(carteira\s+assinada|\bclt\b)\b/i
  };
  for (const [toolName, regex] of Object.entries(toolMap)) {
    if (regex.test(text)) tools.push(toolName);
  }

  let salary = null;
  const salaryPatterns = [
    /R\$\s*\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?(?:\s*(?:a|até)\s*R\$\s*\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?)?/i,
    /sal[áa]rio\s*:?\s*(?:R\$\s*)?\d{1,3}(?:[.,]\d{3})*(?:,\d{2})?/i,
    /(?:R\$|\$|USD|EUR|€)\s*\d+(?:[.,]\d+)?\s*(?:k|mil|\/mês|\/mes|\/mo|\/month|\/yr|\/year|\/hr|\/h|\/ano|mensais|fixo|por\s+dia)?/i,
    /\d+(?:[.,]\d+)?\s*(?:k|mil)?\s*(?:USD|EUR|dólares|reais)(?:\s*\/(?:mês|mes|month|ano|year|hr))?/i
  ];
  for (const pat of salaryPatterns) {
    const m = text.match(pat);
    if (m) {
      salary = m[0].trim();
      break;
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ageDays = Math.max(0, (nowSec - takenAt) / 86400);

  const verification = evaluateJobAuthenticity({
    text,
    user: post.user,
    isHiringPost,
    salary,
    tools,
    modalities,
    contracts,
    ageDays,
    proximityInfo: proximity
  });

  let score = 58;
  if (isHiringPost) score += 18;
  if (salary) score += 8;
  if (verification.authenticityScore >= 75) score += 10;
  if (ageDays <= 4.5) score += 8;

  const {
    topic = 'todos',
    remoto = false,
    freelance = false,
    fixo = false,
    nearBelfordRoxo = false,
    selectedAreas = [],
    customKeywords = '',
    excludeWords = ''
  } = activeFilters;

  if (nearBelfordRoxo || ['rj_clt', 'mercado_comercio', 'producao_logistica', 'escritorio_adm'].includes(topic)) {
    score += proximity.scoreBoost;
  }

  if (remoto && modalities.some(m => m.startsWith('Remoto'))) score += 8;
  if (freelance && contracts.includes('Freelance')) score += 6;
  if (fixo && contracts.includes('CLT / Fixo / PJ')) score += 8;

  if (selectedAreas.length > 0) {
    const matchedAreas = selectedAreas.filter(a => areas.includes(a));
    if (matchedAreas.length > 0) score += 12;
  }

  if (customKeywords.trim()) {
    const kws = customKeywords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    for (const kw of kws) {
      if (lower.includes(kw)) score += 15;
    }
  }

  if (excludeWords.trim()) {
    const exs = excludeWords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    for (const ex of exs) {
      if (lower.includes(ex)) score -= 50;
    }
  }

  score = Math.max(5, Math.min(99, score));

  const whatsapp = extractWhatsAppInfo(text, proximity.isRJ);

  const platform = post.platform || 'threads';
  const platformLabel = post.platformLabel || 'Threads';
  const platformIcon = post.platformIcon || '🧵';
  const customUrl = post.url || `https://www.threads.com/@${username}/post/${code}`;

  return {
    id: code,
    code,
    platform,
    platformLabel,
    platformIcon,
    url: customUrl,
    embedUrl: post.embedUrl || `https://www.threads.com/t/${code}/embed/`,
    author: {
      username,
      fullName,
      avatarUrl,
      isVerified: Boolean(post.user?.is_verified),
      profileUrl: `https://www.threads.com/@${username}`
    },
    text,
    takenAt,
    firstSeenAt: Date.now(),
    ageDays: Number(ageDays.toFixed(1)),
    publishedAtISO: new Date(takenAt * 1000).toISOString(),
    likeCount,
    isHiringPost,
    isInternational,
    hasDesignContext,
    hasGeneralJobContext,
    jobTopics,
    proximity,
    whatsapp,
    modalities,
    contracts,
    seniority,
    areas,
    tools,
    salary,
    verification,
    matchScore: score
  };
}

/**
 * MOTOR DE CAPTAÇÃO AUTOMÁTICA EM SEGUNDO PLANO (CRAWLER 24H)
 * Executa periodicamente a cada 10 minutos para captar e acumular novas vagas
 */
async function runBackgroundCrawler() {
  if (isCrawling) return;
  isCrawling = true;
  const startTs = Date.now();
  console.log(`\n🤖 [CRAWLER 24H] Iniciando rodada de captação contínua às ${new Date().toLocaleTimeString('pt-BR')}...`);

  const allQueries = [...QUERIES_RJ_CLT, ...QUERIES_DESIGN_BR, ...QUERIES_DESIGN_INTL];
  let newJobsCount = 0;

  try {
    // 1. Busca termos de busca em lotes espaçados para não sobrecarregar
    for (const q of allQueries) {
      const posts = await fetchThreadsQuery(q, 'default');
      for (const raw of posts) {
        if (raw.code && !globalJobsStore.has(raw.code)) {
          const classified = analyzeAndClassifyPost(raw, { nearBelfordRoxo: true });
          if (classified.hasDesignContext || classified.hasGeneralJobContext) {
            globalJobsStore.set(raw.code, classified);
            newJobsCount++;
          }
        }
      }
      // Pequena pausa respeitosa de 600ms entre requisições
      await new Promise(r => setTimeout(r, 600));
    }

    // 2. Coleta dos perfis curadores de vagas do Rio de Janeiro
    for (const prof of RJ_CURATOR_PROFILES) {
      const posts = await fetchThreadsProfile(prof);
      for (const raw of posts) {
        if (raw.code && !globalJobsStore.has(raw.code)) {
          const classified = analyzeAndClassifyPost(raw, { nearBelfordRoxo: true });
          if (classified.hasDesignContext || classified.hasGeneralJobContext) {
            globalJobsStore.set(raw.code, classified);
            newJobsCount++;
          }
        }
      }
      await new Promise(r => setTimeout(r, 600));
    }

    // 3. Coleta Multi-Plataforma (LinkedIn, Facebook, Indeed, Google Jobs)
    console.log("🌐 [CRAWLER 24H] Coletando vagas ativas de LinkedIn, Facebook, Indeed e Google Jobs...");
    try {
      const fbJobs = getFacebookPublicJobs(analyzeAndClassifyPost);
      for (const j of fbJobs) {
        if (!globalJobsStore.has(j.code)) {
          globalJobsStore.set(j.code, j);
          newJobsCount++;
        }
      }
      const indeedJobs = getIndeedVerifiedJobs(analyzeAndClassifyPost);
      for (const j of indeedJobs) {
        if (!globalJobsStore.has(j.code)) {
          globalJobsStore.set(j.code, j);
          newJobsCount++;
        }
      }
      const googleJobs = getGoogleJobsVerified(analyzeAndClassifyPost);
      for (const j of googleJobs) {
        if (!globalJobsStore.has(j.code)) {
          globalJobsStore.set(j.code, j);
          newJobsCount++;
        }
      }
      const liJobs = await fetchLinkedInLiveJobs(analyzeAndClassifyPost);
      for (const j of liJobs) {
        if (!globalJobsStore.has(j.code)) {
          globalJobsStore.set(j.code, j);
          newJobsCount++;
        }
      }
    } catch (errPlat) {
      console.warn("⚠️ [CRAWLER 24H] Erro ao sincronizar feeds multi-plataforma:", errPlat.message);
    }

    lastCrawlerRun = Date.now();
    savePersistentStore();
    console.log(`✅ [CRAWLER 24H] Concluído em ${((Date.now() - startTs) / 1000).toFixed(1)}s! Novas vagas: +${newJobsCount}. Total no banco: ${globalJobsStore.size}`);
  } catch (err) {
    console.error('❌ [CRAWLER 24H] Erro durante a varredura:', err.message);
  } finally {
    isCrawling = false;
  }
}

// Inicia o Crawler imediatamente e agenda para rodar a cada 10 minutos (24h por dia)
const CRAWL_INTERVAL_MS = 10 * 60 * 1000;
// Injeta imediatamente as vagas multi-plataforma iniciais para resposta instantânea
try {
  const fb = getFacebookPublicJobs(analyzeAndClassifyPost);
  fb.forEach(j => { if (!globalJobsStore.has(j.code)) globalJobsStore.set(j.code, j); });
  const ind = getIndeedVerifiedJobs(analyzeAndClassifyPost);
  ind.forEach(j => { if (!globalJobsStore.has(j.code)) globalJobsStore.set(j.code, j); });
  const gg = getGoogleJobsVerified(analyzeAndClassifyPost);
  gg.forEach(j => { if (!globalJobsStore.has(j.code)) globalJobsStore.set(j.code, j); });
  fetchLinkedInLiveJobs(analyzeAndClassifyPost).then(li => {
    li.forEach(j => { if (!globalJobsStore.has(j.code)) globalJobsStore.set(j.code, j); });
    console.log(`💼 [LINKEDIN] +${li.length} vagas ao vivo adicionadas com sucesso! Total: ${globalJobsStore.size}`);
  }).catch(e => console.warn("Erro ao buscar LinkedIn inicial:", e.message));
  console.log(`🌐 [MULTI-PLATAFORMA] Feeds de Facebook, Indeed e Google Jobs carregados! Total: ${globalJobsStore.size}`);
} catch (e) {
  console.warn("Erro ao semear vagas multi-plataforma iniciais:", e.message);
}
setTimeout(() => runBackgroundCrawler(), 2000);
setInterval(() => runBackgroundCrawler(), CRAWL_INTERVAL_MS);

// ==========================================
// ROTAS DE AUTENTICAÇÃO E DADOS DO USUÁRIO
// ==========================================

// Cadastro de novo usuário
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Preencha nome, e-mail e senha.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const existingUser = await dbFindUserByEmail(cleanEmail);
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Este e-mail já está cadastrado. Faça login!' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 4 caracteres.' });
  }

  const { salt, hash } = hashPassword(password);
  const userId = 'user_' + Date.now();
  const user = await dbCreateUser({
    id: userId,
    name: name.trim(),
    email: cleanEmail,
    salt,
    hash
  });

  const token = crypto.randomBytes(24).toString('hex');
  await dbCreateSession(token, user.id, cleanEmail);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      savedJobs: user.savedJobs || [],
      dismissedJobs: user.dismissedJobs || []
    }
  });
});

// Login de usuário existente
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Informe e-mail e senha.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = await dbFindUserByEmail(cleanEmail);
  if (!user) {
    return res.status(400).json({ success: false, error: 'E-mail não cadastrado. Crie sua conta primeiro!' });
  }

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.hash) {
    return res.status(400).json({ success: false, error: 'Senha incorreta. Tente novamente.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  await dbCreateSession(token, user.id, cleanEmail);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      savedJobs: user.savedJobs || [],
      dismissedJobs: user.dismissedJobs || []
    }
  });
});

// Checar sessão ativa e obter perfil do usuário
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      savedJobs: req.user.savedJobs || [],
      dismissedJobs: req.user.dismissedJobs || []
    }
  });
});

// Sincronizar / Salvar Vagas do Usuário logado na conta dele
app.post('/api/user/sync-jobs', authMiddleware, async (req, res) => {
  const { savedJobs = [], dismissedJobs = [] } = req.body || {};
  await dbSyncUserJobs(req.user.id, req.user.email, savedJobs, dismissedJobs);
  req.user.savedJobs = savedJobs;
  req.user.dismissedJobs = dismissedJobs;
  res.json({ success: true, countSaved: savedJobs.length, countDismissed: dismissedJobs.length });
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    sessionsStore.delete(token);
    if (dbPool) {
      try {
        await dbPool.query('DELETE FROM sessions WHERE token = $1', [token]);
      } catch (_) {}
    }
  }
  res.json({ success: true });
});

/**
 * Endpoint de status do robô 24h
 */
app.get('/api/crawler/status', (req, res) => {
  res.json({
    online: true,
    totalJobsInDatabase: globalJobsStore.size,
    isCrawlingNow: isCrawling,
    lastRunAgoSeconds: lastCrawlerRun ? Math.round((Date.now() - lastCrawlerRun) / 1000) : null,
    nextRunInSeconds: lastCrawlerRun ? Math.max(0, Math.round((lastCrawlerRun + CRAWL_INTERVAL_MS - Date.now()) / 1000)) : 10
  });
});

app.get('/api/verify/:code', async (req, res) => {
  const { code } = req.params;
  const embedUrl = `https://www.threads.com/t/${encodeURIComponent(code)}/embed/`;
  try {
    const response = await fetch(embedUrl, {
      headers: { 'User-Agent': THREADS_HEADERS['User-Agent'] }
    });
    const html = await response.text();
    const isLive = response.ok && html.length > 5000 && !html.includes('Sorry, this page isn\'t available');
    res.json({
      success: true,
      code,
      isLive,
      statusText: isLive
        ? 'Publicação ativa e pública no Threads neste momento'
        : 'Publicação indisponível ou removida pelo autor'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint de busca: consulta diretamente o banco de dados persistente acumulado pelo robô 24h
 */
app.post('/api/search', async (req, res) => {
  try {
    const {
      topic = 'todos',
      topics = [], // Suporta lista de múltiplos tópicos: ['mercado_comercio', 'producao_logistica'] ou ['design', 'gringa']
      platforms = [], // Lista de plataformas selecionadas: ['threads', 'linkedin', 'facebook', 'indeed', 'google']
      modalityFilter = 'all', // 'all' | 'remote_only' | 'hybrid_only' | 'in_person_only'
      remoto = true,
      freelance = true,
      fixo = true,
      includeBrasil = true,
      includeGringa = true,
      nearBelfordRoxo = true,
      onlyVerifiedReal = false,
      customKeywords = '',
      excludeWords = '',
      onlyHiring = true,
      forceRefresh = false
    } = req.body || {};

    // Se o usuário clicar no botão de atualizar ou o banco estiver vazio, aciona o crawler
    if (forceRefresh || globalJobsStore.size === 0) {
      await runBackgroundCrawler();
    }

    const allStored = Array.from(globalJobsStore.values());
    const selectedTopicsList = Array.isArray(topics) && topics.length > 0 ? topics : (topic === 'todos' ? [] : [topic]);
    const hasRJInTopics = selectedTopicsList.some(t => ['rj_clt', 'mercado_comercio', 'producao_logistica', 'escritorio_adm'].includes(t));

    // Reavalia filtros ativos dinâmicos (Match Score personalizado)
    const evaluated = allStored.map(item => {
      let score = 58;
      if (item.isHiringPost) score += 18;
      if (item.salary) score += 8;
      if ((item.verification?.authenticityScore || 0) >= 75) score += 10;
      if ((item.ageDays || 0) <= 4.5) score += 8;

      if (nearBelfordRoxo || hasRJInTopics || ['rj_clt', 'mercado_comercio', 'producao_logistica', 'escritorio_adm'].includes(topic)) {
        score += item.proximity?.scoreBoost || 0;
      }
      if (remoto && item.modalities.some(m => m.startsWith('Remoto'))) score += 8;
      if (freelance && item.contracts.includes('Freelance')) score += 6;
      if (fixo && item.contracts.includes('CLT / Fixo / PJ')) score += 8;

      if (customKeywords.trim()) {
        const kws = customKeywords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        for (const kw of kws) {
          if (item.text.toLowerCase().includes(kw)) score += 15;
        }
      }

      const plat = item.platform || "threads";
      const platLabel = item.platformLabel || (plat === "linkedin" ? "LinkedIn" : (plat === "facebook" ? "Facebook" : (plat === "indeed" ? "Indeed" : (plat === "google" ? "Google Vagas" : "Threads"))));
      const platIcon = item.platformIcon || (plat === "linkedin" ? "💼" : (plat === "facebook" ? "👥" : (plat === "indeed" ? "🎯" : (plat === "google" ? "🔍" : "🧵"))));

      return {
        ...item,
        platform: plat,
        platformLabel: platLabel,
        platformIcon: platIcon,
        matchScore: Math.max(5, Math.min(99, score))
      };
    });

    // Filtra por Tópico(s) selecionado(s)
    let filtered = evaluated.filter(item => {
      // Se não escolheu tópicos específicos, mostra todas as vagas
      if (selectedTopicsList.length === 0) return true;

      // Se selecionou múltiplos tópicos, faz o match com qualquer um deles (OR)
      return selectedTopicsList.some(t => {
        if (t === 'design') return item.hasDesignContext;
        if (t === 'gringa') return item.isInternational;
        if (t === 'rj_clt') return item.proximity?.isRJ || (item.hasGeneralJobContext && !item.isInternational);
        if (t === 'mercado_comercio') return item.jobTopics.includes('mercado_comercio');
        if (t === 'producao_logistica') return item.jobTopics.includes('producao_logistica');
        if (t === 'escritorio_adm') return item.jobTopics.includes('escritorio_adm');
        return false;
      });
    });

    // Filtro por Plataforma
    const selectedPlatforms = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : ['threads', 'linkedin', 'facebook', 'indeed', 'google'];
    if (selectedPlatforms.length < 5) {
      filtered = filtered.filter(item => {
        const p = item.platform || 'threads';
        return selectedPlatforms.includes(p);
      });
    }

    // Filtro estrito de Modalidade
    if (modalityFilter === 'remote_only') {
      filtered = filtered.filter(item => {
        const isRemote = (item.modalities || []).some(m => m.toLowerCase().includes('remoto'));
        const isHybrid = (item.modalities || []).some(m => m.toLowerCase().includes('híbrido') || m.toLowerCase().includes('hibrido'));
        const isInPerson = (item.modalities || []).some(m => m.toLowerCase().includes('presencial') || m.toLowerCase().includes('on-site'));
        return isRemote && !isHybrid && !isInPerson;
      });
    } else if (modalityFilter === 'hybrid_only') {
      filtered = filtered.filter(item => {
        return (item.modalities || []).some(m => m.toLowerCase().includes('híbrido') || m.toLowerCase().includes('hibrido'));
      });
    } else if (modalityFilter === 'in_person_only') {
      filtered = filtered.filter(item => {
        return (item.modalities || []).some(m => m.toLowerCase().includes('presencial') || m.toLowerCase().includes('on-site'));
      });
    }

    // Filtro Brasil / Gringa
    if (!includeBrasil) filtered = filtered.filter(i => i.isInternational);
    if (!includeGringa) filtered = filtered.filter(i => !i.isInternational);

    // Filtra palavras excluídas
    if (excludeWords && excludeWords.trim()) {
      const exs = excludeWords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      filtered = filtered.filter(item => !exs.some(ex => item.text.toLowerCase().includes(ex)));
    }

    // Contratantes reais
    let primaryResults = onlyHiring
      ? filtered.filter(item => item.isHiringPost)
      : filtered;

    if (onlyVerifiedReal) {
      primaryResults = primaryResults.filter(item => (item.verification?.authenticityScore || 0) >= 60);
    }

    // Ordenação inteligente
    if (['rj_clt', 'mercado_comercio', 'producao_logistica', 'escritorio_adm'].includes(topic)) {
      primaryResults.sort((a, b) =>
        (a.proximity?.tier ?? 99) - (b.proximity?.tier ?? 99) ||
        (b.verification?.authenticityScore || 0) - (a.verification?.authenticityScore || 0) ||
        b.takenAt - a.takenAt
      );
    } else {
      primaryResults.sort((a, b) => b.takenAt - a.takenAt || b.matchScore - a.matchScore);
    }

    res.json({
      success: true,
      totalStoredInDatabase: globalJobsStore.size,
      totalMatched: primaryResults.length,
      lastCrawlerRunAgoSeconds: lastCrawlerRun ? Math.round((Date.now() - lastCrawlerRun) / 1000) : 0,
      jobs: primaryResults
    });
  } catch (error) {
    console.error('Erro na rota /api/search:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao buscar vagas.',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ThreadsJobs 24H Ativo em http://localhost:${PORT}`);
  console.log(`📡 Crawler autônomo programado para rodar a cada 10 minutos.`);
});
