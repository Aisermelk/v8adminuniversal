/**
 * V8 ADMIN — Universal
 * Cloudflare Worker
 *
 * Worker: v8adminuniversal
 *
 * Backend:
 * Cloudflare Workers + KV
 *
 * API:
 *
 * GET     /
 * GET     /api
 * GET     /api/health
 *
 * POST    /api/login
 *
 * GET     /api/data/clients
 * POST    /api/data/clients
 * PUT     /api/data/clients
 * DELETE  /api/data/clients?id=ID
 *
 * GET     /api/data/projects
 * POST    /api/data/projects
 * PUT     /api/data/projects
 * DELETE  /api/data/projects?id=ID
 *
 * Aliases:
 *
 * GET/POST/PUT/DELETE /api/clients
 * GET/POST/PUT/DELETE /api/projects
 *
 * GET /api/dashboard/stats
 * GET /api/data/leads/:projectId
 *
 * GET  /api/public/config/:projectId
 * POST /api/public/leads/:projectId
 *
 * GET /api/client/:token
 * PUT /api/client/:token
 *
 * GET  /api/client-link/:projectId
 * POST /api/client-link/:projectId
 * POST /api/client-link/:jti/revoke
 *
 * KV:
 * V8_KV
 *
 * Secrets:
 * ADMIN_EMAIL
 * ADMIN_PASS
 * TOKEN_SECRET
 */

// ============================================================
// CONFIG
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ============================================================
// RESPONSE HELPERS
// ============================================================

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":
        "application/json; charset=UTF-8",

      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function badRequest(message = "Requisição inválida") {
  return json(
    {
      error: true,
      message,
    },
    400
  );
}

function unauthorized(
  message = "Não autorizado"
) {
  return json(
    {
      error: true,
      message,
    },
    401
  );
}

function forbidden(
  message = "Acesso negado"
) {
  return json(
    {
      error: true,
      message,
    },
    403
  );
}

function notFound(
  message = "Rota não encontrada"
) {
  return json(
    {
      error: true,
      message,
    },
    404
  );
}

function methodNotAllowed(
  message = "Método não permitido"
) {
  return json(
    {
      error: true,
      message,
    },
    405,
    {
      Allow:
        "GET, POST, PUT, DELETE, OPTIONS",
    }
  );
}

function tooMany(
  message =
    "Muitas tentativas. Tente novamente em alguns minutos."
) {
  return json(
    {
      error: true,
      message,
    },
    429
  );
}

function serverError(
  message = "Erro interno do servidor"
) {
  return json(
    {
      error: true,
      message,
    },
    500
  );
}

function uuid() {
  return crypto.randomUUID();
}

// ============================================================
// BASE64URL
// ============================================================

function b64urlEncode(bytes) {
  const uint8 = new Uint8Array(bytes);

  let binary = "";

  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlEncodeStr(str) {
  return b64urlEncode(
    new TextEncoder().encode(str)
  );
}

function b64urlDecodeStr(str) {
  str = str
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (str.length % 4) {
    str += "=";
  }

  return atob(str);
}

function base64UrlToBytes(str) {
  str = str
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (str.length % 4) {
    str += "=";
  }

  const binary = atob(str);

  const bytes = new Uint8Array(
    binary.length
  );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

// ============================================================
// TOKEN
// ============================================================

async function getSigningKey(secret) {
  if (!secret) {
    throw new Error(
      "TOKEN_SECRET não configurado"
    );
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign", "verify"]
  );
}

async function signToken(payload, secret) {
  const key =
    await getSigningKey(secret);

  const payloadStr =
    b64urlEncodeStr(
      JSON.stringify(payload)
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        payloadStr
      )
    );

  return (
    payloadStr +
    "." +
    b64urlEncode(signature)
  );
}

async function verifyToken(
  token,
  secret
) {
  if (
    !token ||
    typeof token !== "string" ||
    !secret
  ) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payloadStr = parts[0];
  const signature = parts[1];

  if (!payloadStr || !signature) {
    return null;
  }

  try {
    const key =
      await getSigningKey(secret);

    const valid =
      await crypto.subtle.verify(
        "HMAC",
        key,
        base64UrlToBytes(signature),
        new TextEncoder().encode(
          payloadStr
        )
      );

    if (!valid) {
      return null;
    }

    const payload =
      JSON.parse(
        b64urlDecodeStr(payloadStr)
      );

    if (!payload.exp) {
      return null;
    }

    if (
      Date.now() / 1000 >
      payload.exp
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// AUTH
// ============================================================

function getBearerToken(request) {
  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : null;
}

async function requireAdmin(
  request,
  env
) {
  const token =
    getBearerToken(request);

  if (!token) {
    return null;
  }

  const payload =
    await verifyToken(
      token,
      env.TOKEN_SECRET
    );

  if (!payload) {
    return null;
  }

  if (
    payload.role !== "admin"
  ) {
    return null;
  }

  return payload;
}

// ============================================================
// KV
// ============================================================

async function kvGetJSON(
  env,
  key,
  fallback = null
) {
  if (!env.V8_KV) {
    throw new Error(
      "Binding V8_KV não configurado"
    );
  }

  const raw =
    await env.V8_KV.get(key);

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPutJSON(
  env,
  key,
  value,
  options = undefined
) {
  if (!env.V8_KV) {
    throw new Error(
      "Binding V8_KV não configurado"
    );
  }

  await env.V8_KV.put(
    key,
    JSON.stringify(value),
    options
  );
}

// ============================================================
// RATE LIMIT
// ============================================================

const LOGIN_MAX_ATTEMPTS = 5;

const LOGIN_WINDOW_SECONDS =
  15 * 60;

async function checkLoginRateLimit(
  env,
  ip
) {
  const key =
    `ratelimit:login:${ip}`;

  const record =
    await kvGetJSON(
      env,
      key,
      {
        count: 0,
      }
    );

  return (
    Number(record?.count || 0) <
    LOGIN_MAX_ATTEMPTS
  );
}

async function registerLoginFailure(
  env,
  ip
) {
  const key =
    `ratelimit:login:${ip}`;

  const record =
    await kvGetJSON(
      env,
      key,
      {
        count: 0,
      }
    );

  record.count =
    Number(record.count || 0) + 1;

  await kvPutJSON(
    env,
    key,
    record,
    {
      expirationTtl:
        LOGIN_WINDOW_SECONDS,
    }
  );
}

async function clearLoginRateLimit(
  env,
  ip
) {
  if (!env.V8_KV) {
    return;
  }

  await env.V8_KV.delete(
    `ratelimit:login:${ip}`
  );
}

// ============================================================
// LOGIN
// ============================================================

async function handleLogin(
  request,
  env
) {
  if (!env.ADMIN_EMAIL) {
    return serverError(
      "ADMIN_EMAIL não configurado no Worker"
    );
  }

  if (!env.ADMIN_PASS) {
    return serverError(
      "ADMIN_PASS não configurado no Worker"
    );
  }

  if (!env.TOKEN_SECRET) {
    return serverError(
      "TOKEN_SECRET não configurado no Worker"
    );
  }

  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) || "unknown";

  if (
    !(await checkLoginRateLimit(
      env,
      ip
    ))
  ) {
    return tooMany();
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  const email =
    typeof body?.email === "string"
      ? body.email.trim()
      : "";

  const password =
    typeof body?.password === "string"
      ? body.password
      : "";

  if (!email || !password) {
    return badRequest(
      "E-mail e senha são obrigatórios"
    );
  }

  if (
    email !== env.ADMIN_EMAIL ||
    password !== env.ADMIN_PASS
  ) {
    await registerLoginFailure(
      env,
      ip
    );

    return unauthorized(
      "E-mail ou senha inválidos"
    );
  }

  await clearLoginRateLimit(
    env,
    ip
  );

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const exp =
    now +
    60 * 60 * 12;

  const token =
    await signToken(
      {
        role: "admin",
        iat: now,
        exp,
      },
      env.TOKEN_SECRET
    );

  return json({
    success: true,
    token,
    expiresAt:
      exp * 1000,
  });
}

// ============================================================
// COLLECTIONS
// ============================================================

async function handleCollectionGet(
  env,
  collection
) {
  const list =
    await kvGetJSON(
      env,
      collection,
      []
    );

  return json(
    Array.isArray(list)
      ? list
      : []
  );
}

async function handleCollectionCreate(
  request,
  env,
  collection,
  shapeFn = null
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return badRequest(
      "O corpo da requisição deve ser um objeto JSON"
    );
  }

  const list =
    await kvGetJSON(
      env,
      collection,
      []
    );

  if (!Array.isArray(list)) {
    return serverError(
      `Coleção '${collection}' inválida`
    );
  }

  const defaults =
    typeof shapeFn === "function"
      ? shapeFn()
      : {};

  const item = {
    ...defaults,
    ...body,
    id: uuid(),
    createdAt:
      Date.now(),
  };

  list.push(item);

  await kvPutJSON(
    env,
    collection,
    list
  );

  return json(
    item,
    201
  );
}

async function handleCollectionUpdate(
  request,
  env,
  collection
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  if (
    !body ||
    typeof body !== "object"
  ) {
    return badRequest(
      "O corpo da requisição deve ser um objeto JSON"
    );
  }

  if (!body.id) {
    return badRequest(
      "Campo 'id' é obrigatório"
    );
  }

  const list =
    await kvGetJSON(
      env,
      collection,
      []
    );

  if (!Array.isArray(list)) {
    return serverError(
      `Coleção '${collection}' inválida`
    );
  }

  const index =
    list.findIndex(
      item =>
        item?.id === body.id
    );

  if (index === -1) {
    return notFound(
      "Item não encontrado"
    );
  }

  list[index] = {
    ...list[index],
    ...body,
    id:
      list[index].id,
  };

  await kvPutJSON(
    env,
    collection,
    list
  );

  return json(
    list[index]
  );
}

async function handleCollectionDelete(
  request,
  env,
  collection,
  id
) {
  if (!id) {
    return badRequest(
      "Parâmetro 'id' é obrigatório"
    );
  }

  const list =
    await kvGetJSON(
      env,
      collection,
      []
    );

  if (!Array.isArray(list)) {
    return serverError(
      `Coleção '${collection}' inválida`
    );
  }

  const filtered =
    list.filter(
      item =>
        item?.id !== id
    );

  if (
    filtered.length ===
    list.length
  ) {
    return notFound(
      "Item não encontrado"
    );
  }

  await kvPutJSON(
    env,
    collection,
    filtered
  );

  return json({
    deleted: true,
    id,
  });
}

// ============================================================
// PROJECT DEFAULT
// ============================================================

function defaultProjectShape() {
  return {
    name: "",

    status:
      "Em desenvolvimento",

    tracking: {
      pixel: "",
      tag: "",
      analytics: "",
    },

    contact: {
      whatsapp: "",
      email: "",
      phone: "",
    },

    social: {
      facebook: "",
      instagram: "",
      tiktok: "",
      youtube: "",
      linkedin: "",
    },

    formspree: "",
  };
}

// ============================================================
// LEADS
// ============================================================

async function handleGetLeads(
  env,
  projectId
) {
  if (!projectId) {
    return badRequest(
      "Project ID obrigatório"
    );
  }

  const leads =
    await kvGetJSON(
      env,
      `leads:${projectId}`,
      []
    );

  return json(
    Array.isArray(leads)
      ? leads
      : []
  );
}

async function handlePublicCreateLead(
  request,
  env,
  projectId
) {
  if (!projectId) {
    return badRequest(
      "Project ID obrigatório"
    );
  }

  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    Array.isArray(projects)
      ? projects.find(
          p =>
            p?.id === projectId
        )
      : null;

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  if (
    body?.website
  ) {
    return json({
      ok: true,
    });
  }

  const lead = {
    id: uuid(),

    name:
      typeof body?.name === "string"
        ? body.name.trim()
        : "",

    email:
      typeof body?.email === "string"
        ? body.email.trim()
        : "",

    message:
      typeof body?.message === "string"
        ? body.message.trim()
        : "",

    createdAt:
      Date.now(),
  };

  if (
    !lead.name &&
    !lead.email &&
    !lead.message
  ) {
    return badRequest(
      "Informe pelo menos um dado do lead"
    );
  }

  const leads =
    await kvGetJSON(
      env,
      `leads:${projectId}`,
      []
    );

  const list =
    Array.isArray(leads)
      ? leads
      : [];

  list.unshift(lead);

  await kvPutJSON(
    env,
    `leads:${projectId}`,
    list.slice(0, 500)
  );

  return json(
    {
      ok: true,
      leadId: lead.id,
    },
    201
  );
}

// ============================================================
// PUBLIC CONFIG
// ============================================================

async function handlePublicConfig(
  env,
  projectId
) {
  if (!projectId) {
    return badRequest(
      "Project ID obrigatório"
    );
  }

  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    Array.isArray(projects)
      ? projects.find(
          p =>
            p?.id === projectId
        )
      : null;

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  return json({
    tracking:
      project.tracking || {},

    contact:
      project.contact || {},

    social:
      project.social || {},

    formspree:
      project.formspree || "",
  });
}

// ============================================================
// DASHBOARD
// ============================================================

async function handleDashboardStats(
  env
) {
  const clients =
    await kvGetJSON(
      env,
      "clients",
      []
    );

  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const clientList =
    Array.isArray(clients)
      ? clients
      : [];

  const projectList =
    Array.isArray(projects)
      ? projects
      : [];

  let totalLeads = 0;

  const recentLeads = [];

  for (
    const project of projectList
  ) {
    const leads =
      await kvGetJSON(
        env,
        `leads:${project.id}`,
        []
      );

    const list =
      Array.isArray(leads)
        ? leads
        : [];

    totalLeads +=
      list.length;

    for (
      const lead of list.slice(
        0,
        10
      )
    ) {
      recentLeads.push({
        ...lead,

        projectName:
          project.name ||
          "Projeto",
      });
    }
  }

  recentLeads.sort(
    (a, b) =>
      (b.createdAt || 0) -
      (a.createdAt || 0)
  );

  return json({
    totalClients:
      clientList.length,

    totalProjects:
      projectList.length,

    totalLeads,

    recentLeads:
      recentLeads.slice(
        0,
        5
      ),
  });
}

// ============================================================
// CLIENT LINKS
// ============================================================

const ALLOWED_CLIENT_FIELDS = [
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

async function getProject(
  env,
  projectId
) {
  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  if (!Array.isArray(projects)) {
    return null;
  }

  return projects.find(
    p =>
      p?.id === projectId
  ) || null;
}

async function handleClientLinksGet(
  env,
  projectId
) {
  const project =
    await getProject(
      env,
      projectId
    );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  const links =
    await kvGetJSON(
      env,
      `client_links:${projectId}`,
      []
    );

  return json(
    Array.isArray(links)
      ? links
      : []
  );
}

async function handleClientLinkCreate(
  request,
  env,
  projectId
) {
  const project =
    await getProject(
      env,
      projectId
    );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  if (!env.TOKEN_SECRET) {
    return serverError(
      "TOKEN_SECRET não configurado no Worker"
    );
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  const requested =
    Array.isArray(
      body?.fields
    )
      ? body.fields
      : [];

  const fields =
    requested.filter(
      field =>
        typeof field ===
          "string" &&
        ALLOWED_CLIENT_FIELDS.includes(
          field
        )
    );

  if (!fields.length) {
    return badRequest(
      "Nenhum campo válido foi selecionado"
    );
  }

  const jti = uuid();

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const exp =
    now +
    60 * 60 * 24 * 30;

  const token =
    await signToken(
      {
        role: "client",
        jti,
        projectId,
        iat: now,
        exp,
      },
      env.TOKEN_SECRET
    );

  await kvPutJSON(
    env,
    `client_token:${jti}`,
    {
      jti,
      projectId,
      fields,
      revoked: false,
      createdAt:
        Date.now(),
      expiresAt:
        exp * 1000,
    }
  );

  const links =
    await kvGetJSON(
      env,
      `client_links:${projectId}`,
      []
    );

  const list =
    Array.isArray(links)
      ? links
      : [];

  list.unshift({
    jti,
    projectId,
    fields,
    revoked: false,
    createdAt:
      Date.now(),
    expiresAt:
      exp * 1000,
  });

  await kvPutJSON(
    env,
    `client_links:${projectId}`,
    list.slice(0, 100)
  );

  return json(
    {
      ok: true,
      token,
      jti,
      projectId,
      fields,
      expiresAt:
        exp * 1000,
    },
    201
  );
}

async function handleClientLinkRevoke(
  env,
  jti
) {
  if (!jti) {
    return badRequest(
      "JTI obrigatório"
    );
  }

  const record =
    await kvGetJSON(
      env,
      `client_token:${jti}`,
      null
    );

  if (!record) {
    return notFound(
      "Link não encontrado"
    );
  }

  record.revoked = true;

  await kvPutJSON(
    env,
    `client_token:${jti}`,
    record
  );

  const links =
    await kvGetJSON(
      env,
      `client_links:${record.projectId}`,
      []
    );

  const list =
    Array.isArray(links)
      ? links
      : [];

  const updated =
    list.map(
      link =>
        link.jti === jti
          ? {
              ...link,
              revoked: true,
            }
          : link
    );

  await kvPutJSON(
    env,
    `client_links:${record.projectId}`,
    updated
  );

  return json({
    ok: true,
    revoked: true,
  });
}

// ============================================================
// CLIENT ACCESS
// ============================================================

async function requireClientToken(
  token,
  env
) {
  if (!env.TOKEN_SECRET) {
    return null;
  }

  const payload =
    await verifyToken(
      token,
      env.TOKEN_SECRET
    );

  if (
    !payload ||
    payload.role !== "client"
  ) {
    return null;
  }

  if (!payload.jti) {
    return null;
  }

  const record =
    await kvGetJSON(
      env,
      `client_token:${payload.jti}`,
      null
    );

  if (!record) {
    return null;
  }

  if (record.revoked) {
    return null;
  }

  if (
    record.expiresAt &&
    Date.now() >
      record.expiresAt
  ) {
    return null;
  }

  return {
    ...payload,

    fields:
      Array.isArray(
        record.fields
      )
        ? record.fields
        : [],

    projectId:
      record.projectId,
  };
}

async function handleClientGet(
  env,
  token
) {
  if (!token) {
    return unauthorized(
      "Token obrigatório"
    );
  }

  const auth =
    await requireClientToken(
      token,
      env
    );

  if (!auth) {
    return unauthorized(
      "Link inválido, expirado ou revogado"
    );
  }

  const project =
    await getProject(
      env,
      auth.projectId
    );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  return json({
    projectName:
      project.name,

    fields:
      auth.fields,

    data:
      project,
  });
}

async function handleClientUpdate(
  request,
  env,
  token
) {
  if (!token) {
    return unauthorized(
      "Token obrigatório"
    );
  }

  const auth =
    await requireClientToken(
      token,
      env
    );

  if (!auth) {
    return unauthorized(
      "Link inválido, expirado ou revogado"
    );
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  if (!Array.isArray(projects)) {
    return serverError(
      "Coleção de projetos inválida"
    );
  }

  const index =
    projects.findIndex(
      p =>
        p?.id ===
        auth.projectId
    );

  if (index === -1) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  for (
    const path of
      auth.fields
  ) {
    const value =
      getByPath(
        body,
        path
      );

    if (
      value !== undefined
    ) {
      setByPath(
        projects[index],
        path,
        value
      );
    }
  }

  await kvPutJSON(
    env,
    "projects",
    projects
  );

  return json({
    ok: true,
  });
}

// ============================================================
// OBJECT PATH HELPERS
// ============================================================

function getByPath(
  obj,
  path
) {
  if (
    !obj ||
    !path
  ) {
    return undefined;
  }

  return path
    .split(".")
    .reduce(
      (current, key) =>
        current &&
        typeof current ===
          "object"
          ? current[key]
          : undefined,
      obj
    );
}

function setByPath(
  obj,
  path,
  value
) {
  if (
    !obj ||
    !path
  ) {
    return;
  }

  const keys =
    path.split(".");

  let current = obj;

  for (
    let i = 0;
    i <
    keys.length - 1;
    i++
  ) {
    if (
      typeof current[
        keys[i]
      ] !== "object" ||
      current[
        keys[i]
      ] === null
    ) {
      current[keys[i]] = {};
    }

    current =
      current[keys[i]];
  }

  current[
    keys[
      keys.length - 1
    ]
  ] = value;
}

// ============================================================
// ROUTER
// ============================================================

export default {
  async fetch(
    request,
    env
  ) {
    // --------------------------------------------------------
    // CORS PREFLIGHT
    // --------------------------------------------------------

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            CORS_HEADERS,
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    const path =
      url.pathname.length > 1
        ? url.pathname.replace(
            /\/+$/,
            ""
          )
        : "/";

    const method =
      request.method.toUpperCase();

    try {
      // ======================================================
      // HOME
      // ======================================================

      if (
        path === "/" &&
        method === "GET"
      ) {
        return json({
          ok: true,

          worker:
            "v8adminuniversal",

          status:
            "online",

          api: true,

          version:
            "1.0.0",

          time:
            new Date().toISOString(),
        });
      }

      // ======================================================
      // API INFO
      // ======================================================

      if (
        path === "/api" &&
        method === "GET"
      ) {
        return json({
          ok: true,

          worker:
            "v8adminuniversal",

          status:
            "online",

          api: true,

          version:
            "1.0.0",

          endpoints: {
            health:
              "/api/health",

            login:
              "POST /api/login",

            clients:
              "/api/data/clients",

            projects:
              "/api/data/projects",

            dashboard:
              "/api/dashboard/stats",

            publicConfig:
              "/api/public/config/:projectId",

            publicLeads:
              "POST /api/public/leads/:projectId",

            client:
              "/api/client/:token",

            clientLinks:
              "/api/client-link/:projectId",
          },

          time:
            new Date().toISOString(),
        });
      }

      // ======================================================
      // HEALTH
      // ======================================================

      if (
        path ===
          "/api/health" &&
        method === "GET"
      ) {
        return json({
          ok: true,

          worker:
            "v8adminuniversal",

          status:
            "online",

          kv:
            !!env.V8_KV,

          adminEmail:
            !!env.ADMIN_EMAIL,

          adminPass:
            !!env.ADMIN_PASS,

          tokenSecret:
            !!env.TOKEN_SECRET,

          time:
            new Date().toISOString(),
        });
      }

      // ======================================================
      // LOGIN
      // ======================================================

      if (
        path ===
          "/api/login"
      ) {
        if (
          method !== "POST"
        ) {
          return methodNotAllowed(
            "Use POST /api/login"
          );
        }

        return handleLogin(
          request,
          env
        );
      }

      // ======================================================
      // PUBLIC CONFIG
      // ======================================================

      if (
        path.startsWith(
          "/api/public/config/"
        )
      ) {
        if (
          method !== "GET"
        ) {
          return methodNotAllowed(
            "Use GET nesta rota"
          );
        }

        const projectId =
          decodeURIComponent(
            path.substring(
              "/api/public/config/"
                .length
            )
          );

        return handlePublicConfig(
          env,
          projectId
        );
      }

      // ======================================================
      // PUBLIC LEADS
      // ======================================================

      if (
        path.startsWith(
          "/api/public/leads/"
        )
      ) {
        if (
          method !== "POST"
        ) {
          return methodNotAllowed(
            "Use POST nesta rota"
          );
        }

        const projectId =
          decodeURIComponent(
            path.substring(
              "/api/public/leads/"
                .length
            )
          );

        return handlePublicCreateLead(
          request,
          env,
          projectId
        );
      }

      // ======================================================
      // CLIENT TOKEN
      // ======================================================

      if (
        path.startsWith(
          "/api/client/"
        )
      ) {
        const token =
          decodeURIComponent(
            path.substring(
              "/api/client/"
                .length
            )
          );

        if (
          method === "GET"
        ) {
          return handleClientGet(
            env,
            token
          );
        }

        if (
          method === "PUT"
        ) {
          return handleClientUpdate(
            request,
            env,
            token
          );
        }

        return methodNotAllowed();
      }

      // ======================================================
      // ADMIN AUTH
      // ======================================================

      const admin =
        await requireAdmin(
          request,
          env
        );

      if (!admin) {
        return unauthorized(
          "Sessão inválida ou expirada. Faça login novamente."
        );
      }

      // ======================================================
      // DASHBOARD
      // ======================================================

      if (
        path ===
          "/api/dashboard/stats"
      ) {
        if (
          method !== "GET"
        ) {
          return methodNotAllowed();
        }

        return handleDashboardStats(
          env
        );
      }

      // ======================================================
      // CLIENTS
      // ======================================================

      if (
        path ===
          "/api/data/clients" ||
        path ===
          "/api/clients"
      ) {
        if (
          method === "GET"
        ) {
          return handleCollectionGet(
            env,
            "clients"
          );
        }

        if (
          method === "POST"
        ) {
          return handleCollectionCreate(
            request,
            env,
            "clients"
          );
        }

        if (
          method === "PUT"
        ) {
          return handleCollectionUpdate(
            request,
            env,
            "clients"
          );
        }

        if (
          method ===
          "DELETE"
        ) {
          return handleCollectionDelete(
            request,
            env,
            "clients",
            url.searchParams.get(
              "id"
            )
          );
        }

        return methodNotAllowed();
      }

      // ======================================================
      // PROJECTS
      // ======================================================

      if (
        path ===
          "/api/data/projects" ||
        path ===
          "/api/projects"
      ) {
        if (
          method === "GET"
        ) {
          return handleCollectionGet(
            env,
            "projects"
          );
        }

        if (
          method === "POST"
        ) {
          return handleCollectionCreate(
            request,
            env,
            "projects",
            defaultProjectShape
          );
        }

        if (
          method === "PUT"
        ) {
          return handleCollectionUpdate(
            request,
            env,
            "projects"
          );
        }

        if (
          method ===
          "DELETE"
        ) {
          return handleCollectionDelete(
            request,
            env,
            "projects",
            url.searchParams.get(
              "id"
            )
          );
        }

        return methodNotAllowed();
      }

      // ======================================================
      // ADMIN LEADS
      // ======================================================

      if (
        path.startsWith(
          "/api/data/leads/"
        )
      ) {
        if (
          method !== "GET"
        ) {
          return methodNotAllowed();
        }

        const projectId =
          decodeURIComponent(
            path.substring(
              "/api/data/leads/"
                .length
            )
          );

        return handleGetLeads(
          env,
          projectId
        );
      }

      // ======================================================
      // CLIENT LINKS
      // ======================================================

      if (
        path.startsWith(
          "/api/client-link/"
        )
      ) {
        const rest =
          path.substring(
            "/api/client-link/"
              .length
          );

        // ----------------------------------------------------
        // REVOKE
        // ----------------------------------------------------

        if (
          rest.endsWith(
            "/revoke"
          )
        ) {
          if (
            method !== "POST"
          ) {
            return methodNotAllowed();
          }

          const jti =
            decodeURIComponent(
              rest.replace(
                /\/revoke$/,
                ""
              )
            );

          return handleClientLinkRevoke(
            env,
            jti
          );
        }

        // ----------------------------------------------------
        // PROJECT LINK
        // ----------------------------------------------------

        const projectId =
          decodeURIComponent(
            rest
          );

        if (
          method === "GET"
        ) {
          return handleClientLinksGet(
            env,
            projectId
          );
        }

        if (
          method === "POST"
        ) {
          return handleClientLinkCreate(
            request,
            env,
            projectId
          );
        }

        return methodNotAllowed();
      }

      // ======================================================
      // NOT FOUND
      // ======================================================

      return notFound(
        `Rota não encontrada: ${method} ${path}`
      );

    } catch (error) {
      console.error(
        "V8 ADMIN Worker error:",
        error
      );

      return serverError(
        "Erro interno no Worker"
      );
    }
  },
};
