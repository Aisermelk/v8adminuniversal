/**
 * V8 ADMIN — Universal
 * Worker (Cloudflare) — API central do painel.
 *
 * Este Worker é o "servidor" único que atende ao painel admin (index.html),
 * à tela de login (login.html), à tela de edição do cliente (editar.html)
 * e a qualquer site final que consuma a config pública de um projeto.
 *
 * Variáveis/secrets esperados (configurados via `wrangler secret put`):
 *   ADMIN_EMAIL    -> e-mail de login do painel
 *   ADMIN_PASS     -> senha de login do painel
 *   TOKEN_SECRET   -> chave secreta usada para assinar os tokens (HMAC-SHA256)
 *
 * Binding de KV esperado (configurado no wrangler.toml):
 *   V8_KV
 */

// ---------------------------------------------------------------------------
// Utilidades gerais
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function badRequest(msg) {
  return json({ error: true, message: msg }, 400);
}

function unauthorized(msg = "Não autorizado") {
  return json({ error: true, message: msg }, 401);
}

function notFound(msg = "Não encontrado") {
  return json({ error: true, message: msg }, 404);
}

function tooMany(msg = "Muitas tentativas. Tente novamente em alguns minutos.") {
  return json({ error: true, message: msg }, 429);
}

function uuid() {
  return crypto.randomUUID();
}

// Base64url helpers (sem dependências externas)
function b64urlEncode(bytes) {
  let str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(str) {
  return b64urlEncode(new TextEncoder().encode(str));
}
function b64urlDecodeStr(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

// ---------------------------------------------------------------------------
// Tokens assinados (HMAC-SHA256) — usados tanto para o admin quanto o cliente
// ---------------------------------------------------------------------------

async function getSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signToken(payload, secret) {
  const key = await getSigningKey(secret);
  const payloadStr = b64urlEncodeStr(JSON.stringify(payload));
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
  const sig = b64urlEncode(sigBuffer);
  return `${payloadStr}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadStr, sig] = token.split(".");
  if (!payloadStr || !sig) return null;

  const key = await getSigningKey(secret);
  const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
  const expectedSig = b64urlEncode(expectedSigBuffer);

  // Comparação em tempo constante
  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecodeStr(payloadStr));
  } catch {
    return null;
  }

  if (!payload.exp || Date.now() / 1000 > payload.exp) return null; // expirado
  return payload;
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAdmin(request, env) {
  const token = getBearerToken(request);
  const payload = await verifyToken(token, env.TOKEN_SECRET);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

// Cliente: token traz projectId + campos liberados (fields) + jti (id único,
// permite revogar no KV sem esperar o token expirar).
async function requireClientToken(token, env) {
  const payload = await verifyToken(token, env.TOKEN_SECRET);
  if (!payload || payload.role !== "client") return null;

  const record = await kvGetJSON(env, `client_token:${payload.jti}`);
  if (!record || record.revoked) return null; // token revogado ou nunca existiu

  return { ...payload, fields: record.fields, projectId: record.projectId };
}

// ---------------------------------------------------------------------------
// Helpers de KV (tudo em JSON)
// ---------------------------------------------------------------------------

async function kvGetJSON(env, key, fallback = null) {
  const raw = await env.V8_KV.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPutJSON(env, key, value) {
  await env.V8_KV.put(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Rate limit simples de login (por IP)
// ---------------------------------------------------------------------------

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60; // 15 minutos

async function checkLoginRateLimit(env, ip) {
  const key = `ratelimit:login:${ip}`;
  const record = await kvGetJSON(env, key, { count: 0 });
  return record.count < LOGIN_MAX_ATTEMPTS;
}

async function registerLoginFailure(env, ip) {
  const key = `ratelimit:login:${ip}`;
  const record = await kvGetJSON(env, key, { count: 0 });
  record.count += 1;
  await env.V8_KV.put(key, JSON.stringify(record), { expirationTtl: LOGIN_WINDOW_SECONDS });
}

async function clearLoginRateLimit(env, ip) {
  await env.V8_KV.delete(`ratelimit:login:${ip}`);
}

// ---------------------------------------------------------------------------
// Campos permitidos na config de um projeto (usado tanto no CRUD do admin
// quanto para filtrar o que o cliente pode ver/editar)
// ---------------------------------------------------------------------------

const CLIENT_EDITABLE_FIELD_PATHS = [
  "tracking.pixel",
  "tracking.tag",
  "tracking.analytics",
  "contact.whatsapp",
  "contact.email",
  "contact.phone",
  "social.facebook",
  "social.instagram",
  "social.tiktok",
  "social.youtube",
  "social.linkedin",
  "formspree",
];

function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function defaultProjectShape() {
  return {
    id: null,
    name: "",
    status: "Em desenvolvimento", // "Em produção" | "Em desenvolvimento" | "Pausado"
    tracking: { pixel: "", tag: "", analytics: "" },
    contact: { whatsapp: "", email: "", phone: "" },
    social: { facebook: "", instagram: "", tiktok: "", youtube: "", linkedin: "" },
    formspree: "",
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleLogin(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!(await checkLoginRateLimit(env, ip))) {
    return tooMany();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  const { email, password } = body || {};
  if (!email || !password) return badRequest("E-mail e senha são obrigatórios");

  if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASS) {
    await registerLoginFailure(env, ip);
    return unauthorized("E-mail ou senha inválidos");
  }

  await clearLoginRateLimit(env, ip);

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12 horas
  const token = await signToken({ role: "admin", iat: Math.floor(Date.now() / 1000), exp }, env.TOKEN_SECRET);

  return json({ token, expiresAt: exp * 1000 });
}

// ---- CRUD genérico para "clients" e "projects" (armazenados como lista) ----

async function handleCollectionGet(env, collection) {
  const list = await kvGetJSON(env, collection, []);
  return json(list);
}

async function handleCollectionCreate(request, env, collection, shapeFn) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }
  const list = await kvGetJSON(env, collection, []);
  const item = { ...(shapeFn ? shapeFn() : {}), ...body, id: uuid(), createdAt: Date.now() };
  list.push(item);
  await kvPutJSON(env, collection, list);
  return json(item, 201);
}

async function handleCollectionUpdate(request, env, collection) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }
  if (!body.id) return badRequest("Campo 'id' é obrigatório");

  const list = await kvGetJSON(env, collection, []);
  const idx = list.findIndex((i) => i.id === body.id);
  if (idx === -1) return notFound("Item não encontrado");

  list[idx] = { ...list[idx], ...body };
  await kvPutJSON(env, collection, list);
  return json(list[idx]);
}

async function handleCollectionDelete(request, env, collection, id) {
  if (!id) return badRequest("Parâmetro 'id' é obrigatório");
  const list = await kvGetJSON(env, collection, []);
  const filtered = list.filter((i) => i.id !== id);
  if (filtered.length === list.length) return notFound("Item não encontrado");
  await kvPutJSON(env, collection, filtered);

  // se for um projeto, também limpa leads e tokens de cliente associados
  if (collection === "projects") {
    await env.V8_KV.delete(`leads:${id}`);
    const tokenIds = await kvGetJSON(env, `client_tokens_by_project:${id}`, []);
    for (const jti of tokenIds) await env.V8_KV.delete(`client_token:${jti}`);
    await env.V8_KV.delete(`client_tokens_by_project:${id}`);
  }

  return json({ deleted: true });
}

// ---- Leads ----

async function handleGetLeads(env, projectId) {
  const leads = await kvGetJSON(env, `leads:${projectId}`, []);
  return json(leads);
}

async function handlePublicCreateLead(request, env, projectId) {
  const projects = await kvGetJSON(env, "projects", []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return notFound("Projeto não encontrado");

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  // honeypot simples: se o campo "website" vier preenchido, é bot -> ignora silenciosamente
  if (body.website) return json({ ok: true });

  const lead = {
    id: uuid(),
    name: body.name || "",
    email: body.email || "",
    message: body.message || "",
    createdAt: Date.now(),
  };

  const leads = await kvGetJSON(env, `leads:${projectId}`, []);
  leads.unshift(lead);
  await kvPutJSON(env, `leads:${projectId}`, leads.slice(0, 500)); // limite de segurança

  return json({ ok: true }, 201);
}

// ---- Links mágicos do cliente ----

async function handleCreateClientLink(request, env, projectId) {
  const projects = await kvGetJSON(env, "projects", []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return notFound("Projeto não encontrado");

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  const fields = Array.isArray(body.fields) ? body.fields.filter((f) => CLIENT_EDITABLE_FIELD_PATHS.includes(f)) : [];
  if (fields.length === 0) return badRequest("Selecione ao menos um campo liberado para o cliente");

  const jti = uuid();
  const createdAt = Date.now();

  await kvPutJSON(env, `client_token:${jti}`, { projectId, fields, createdAt, revoked: false });

  const list = await kvGetJSON(env, `client_tokens_by_project:${projectId}`, []);
  list.push(jti);
  await kvPutJSON(env, `client_tokens_by_project:${projectId}`, list);

  // token de longa duração (1 ano) — a revogação é feita via KV, não via expiração
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const token = await signToken({ role: "client", jti, exp }, env.TOKEN_SECRET);

  return json({ token, jti, fields, createdAt });
}

async function handleListClientLinks(env, projectId) {
  const jtis = await kvGetJSON(env, `client_tokens_by_project:${projectId}`, []);
  const links = [];
  for (const jti of jtis) {
    const record = await kvGetJSON(env, `client_token:${jti}`);
    if (record) links.push({ jti, ...record });
  }
  return json(links);
}

async function handleRevokeClientLink(env, jti) {
  const record = await kvGetJSON(env, `client_token:${jti}`);
  if (!record) return notFound("Link não encontrado");
  record.revoked = true;
  await kvPutJSON(env, `client_token:${jti}`, record);
  return json({ revoked: true });
}

// ---- Acesso do cliente (via token, sem login) ----

async function handleClientGet(env, token) {
  const auth = await requireClientToken(token, env);
  if (!auth) return unauthorized("Link inválido ou revogado");

  const projects = await kvGetJSON(env, "projects", []);
  const project = projects.find((p) => p.id === auth.projectId);
  if (!project) return notFound("Projeto não encontrado");

  const data = {};
  for (const path of auth.fields) {
    setByPath(data, path, getByPath(project, path) ?? "");
  }

  return json({ projectName: project.name, fields: auth.fields, data });
}

async function handleClientUpdate(request, env, token) {
  const auth = await requireClientToken(token, env);
  if (!auth) return unauthorized("Link inválido ou revogado");

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  const projects = await kvGetJSON(env, "projects", []);
  const idx = projects.findIndex((p) => p.id === auth.projectId);
  if (idx === -1) return notFound("Projeto não encontrado");

  // só aplica os campos que esse token tem permissão de editar
  for (const path of auth.fields) {
    const incoming = getByPath(body, path);
    if (incoming !== undefined) setByPath(projects[idx], path, incoming);
  }

  await kvPutJSON(env, "projects", projects);
  return json({ ok: true });
}

// ---- Config pública (consumida pelo site final) ----

async function handlePublicConfig(env, projectId) {
  const projects = await kvGetJSON(env, "projects", []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return notFound("Projeto não encontrado");

  return json({
    tracking: project.tracking,
    contact: project.contact,
    social: project.social,
    formspree: project.formspree,
  });
}

// ---- Dashboard ----

async function handleDashboardStats(env) {
  const [clients, projects] = await Promise.all([
    kvGetJSON(env, "clients", []),
    kvGetJSON(env, "projects", []),
  ]);

  let totalLeads = 0;
  const recentLeads = [];
  for (const project of projects) {
    const leads = await kvGetJSON(env, `leads:${project.id}`, []);
    totalLeads += leads.length;
    for (const lead of leads.slice(0, 5)) {
      recentLeads.push({ ...lead, projectName: project.name });
    }
  }
  recentLeads.sort((a, b) => b.createdAt - a.createdAt);

  return json({
    totalClients: clients.length,
    totalProjects: projects.length,
    totalLeads,
    recentLeads: recentLeads.slice(0, 5),
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ---- Público (sem token) ----
      if (path === "/api/login" && method === "POST") return handleLogin(request, env);

      if (path.startsWith("/api/public/config/") && method === "GET") {
        return handlePublicConfig(env, decodeURIComponent(path.split("/").pop()));
      }

      if (path.startsWith("/api/public/leads/") && method === "POST") {
        return handlePublicCreateLead(request, env, decodeURIComponent(path.split("/").pop()));
      }

      // ---- Acesso do cliente via token na URL (sem login de admin) ----
      if (path.startsWith("/api/client/") && method === "GET") {
        return handleClientGet(env, decodeURIComponent(path.split("/").pop()));
      }
      if (path.startsWith("/api/client/") && method === "PUT") {
        return handleClientUpdate(request, env, decodeURIComponent(path.split("/").pop()));
      }

      // ---- Tudo abaixo exige login de admin ----
      const admin = await requireAdmin(request, env);
      if (!admin) return unauthorized("Sessão inválida ou expirada. Faça login novamente.");

      if (path === "/api/dashboard/stats" && method === "GET") return handleDashboardStats(env);

      if (path === "/api/data/clients") {
        if (method === "GET") return handleCollectionGet(env, "clients");
        if (method === "POST") return handleCollectionCreate(request, env, "clients");
        if (method === "PUT") return handleCollectionUpdate(request, env, "clients");
        if (method === "DELETE") return handleCollectionDelete(request, env, "clients", url.searchParams.get("id"));
      }

      if (path === "/api/data/projects") {
        if (method === "GET") return handleCollectionGet(env, "projects");
        if (method === "POST") return handleCollectionCreate(request, env, "projects", defaultProjectShape);
        if (method === "PUT") return handleCollectionUpdate(request, env, "projects");
        if (method === "DELETE") return handleCollectionDelete(request, env, "projects", url.searchParams.get("id"));
      }

      if (path.startsWith("/api/data/leads/") && method === "GET") {
        return handleGetLeads(env, decodeURIComponent(path.split("/").pop()));
      }

      if (path.startsWith("/api/client-link/") && path.endsWith("/revoke") && method === "POST") {
        const jti = decodeURIComponent(path.split("/")[3]);
        return handleRevokeClientLink(env, jti);
      }
      if (path.startsWith("/api/client-link/") && method === "POST") {
        const projectId = decodeURIComponent(path.split("/").pop());
        return handleCreateClientLink(request, env, projectId);
      }
      if (path.startsWith("/api/client-link/") && method === "GET") {
        const projectId = decodeURIComponent(path.split("/").pop());
        return handleListClientLinks(env, projectId);
      }

      return notFound("Rota não encontrada");
    } catch (err) {
      return json({ error: true, message: "Erro interno", detail: String(err) }, 500);
    }
  },
};
