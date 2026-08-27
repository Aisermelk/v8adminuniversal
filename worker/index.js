/**
 * V8 ADMIN — Universal
 * Cloudflare Worker
 *
 * Worker: v8adminuniversal
 *
 * API:
 * GET  /
 * GET  /api/health
 * POST /api/login
 *
 * GET/POST/PUT/DELETE /api/data/clients
 * GET/POST/PUT/DELETE /api/data/projects
 *
 * GET /api/dashboard/stats
 * GET /api/data/leads/:projectId
 *
 * GET  /api/public/config/:projectId
 * POST /api/public/leads/:projectId
 *
 * GET  /api/client/:token
 * PUT  /api/client/:token
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
    "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
};

// ============================================================
// RESPOSTAS
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":
        "application/json; charset=UTF-8",
      ...CORS_HEADERS,
    },
  });
}

function badRequest(message) {
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
    ["sign"]
  );
}

async function signToken(payload, secret) {
  const key = await getSigningKey(secret);

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
    typeof token !== "string"
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
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(
          secret
        ),
        {
          name: "HMAC",
          hash: "SHA-256",
        },
        false,
        ["verify"]
      );

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

function base64UrlToBytes(str) {
  str = str
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (str.length % 4) {
    str += "=";
  }

  const binary = atob(str);

  const bytes =
    new Uint8Array(
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
// AUTH ADMIN
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
    ? match[1]
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

  if (!raw) {
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
  value
) {
  if (!env.V8_KV) {
    throw new Error(
      "Binding V8_KV não configurado"
    );
  }

  await env.V8_KV.put(
    key,
    JSON.stringify(value)
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
    record.count <
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

  record.count++;

  await env.V8_KV.put(
    key,
    JSON.stringify(record),
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
    typeof body?.email ===
    "string"
      ? body.email.trim()
      : "";

  const password =
    typeof body?.password ===
    "string"
      ? body.password
      : "";

  if (!email || !password) {
    return badRequest(
      "E-mail e senha são obrigatórios"
    );
  }

  if (
    email !==
      env.ADMIN_EMAIL ||
    password !==
      env.ADMIN_PASS
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
// COLEÇÕES
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
  shapeFn
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

  const list =
    await kvGetJSON(
      env,
      collection,
      []
    );

  const item = {
    ...(shapeFn
      ? shapeFn()
      : {}),
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

  if (!body?.id) {
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

  const index =
    list.findIndex(
      item =>
        item.id ===
        body.id
    );

  if (index === -1) {
    return notFound(
      "Item não encontrado"
    );
  }

  list[index] = {
    ...list[index],
    ...body,
    id: list[index].id,
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

  const filtered =
    list.filter(
      item =>
        item.id !== id
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
  });
}

// ============================================================
// PROJETO
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
  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    projects.find(
      p =>
        p.id ===
        projectId
    );

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

  // Honeypot
  if (body?.website) {
    return json({
      ok: true,
    });
  }

  const lead = {
    id: uuid(),
    name:
      typeof body?.name ===
      "string"
        ? body.name.trim()
        : "",
    email:
      typeof body?.email ===
      "string"
        ? body.email.trim()
        : "",
    message:
      typeof body?.message ===
      "string"
        ? body.message.trim()
        : "",
    createdAt:
      Date.now(),
  };

  const leads =
    await kvGetJSON(
      env,
      `leads:${projectId}`,
      []
    );

  leads.unshift(lead);

  await kvPutJSON(
    env,
    `leads:${projectId}`,
    leads.slice(0, 500)
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
// CONFIG PÚBLICA
// ============================================================

async function handlePublicConfig(
  env,
  projectId
) {
  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    projects.find(
      p =>
        p.id ===
        projectId
    );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  return json({
    tracking:
      project.tracking ||
      {},
    contact:
      project.contact ||
      {},
    social:
      project.social ||
      {},
    formspree:
      project.formspree ||
      "",
  });
}

// ============================================================
// DASHBOARD STATS
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

  let totalLeads = 0;
  const recentLeads = [];

  for (
    const project of projects
  ) {
    const leads =
      await kvGetJSON(
        env,
        `leads:${project.id}`,
        []
      );

    totalLeads +=
      leads.length;

    for (
      const lead of
        leads.slice(0, 10)
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
      clients.length,

    totalProjects:
      projects.length,

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

async function handleClientLinksGet(
  env,
  projectId
) {
  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    projects.find(
      p =>
        p.id ===
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
  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    projects.find(
      p =>
        p.id ===
        projectId
    );

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

  const requested =
    Array.isArray(
      body?.fields
    )
      ? body.fields
      : [];

  const fields =
    requested.filter(
      field =>
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

  links.unshift({
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
    links.slice(0, 100)
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

  const updated =
    links.map(
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
// CLIENTE
// ============================================================

async function requireClientToken(
  token,
  env
) {
  const payload =
    await verifyToken(
      token,
      env.TOKEN_SECRET
    );

  if (
    !payload ||
    payload.role !==
      "client"
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
      record.fields || [],
    projectId:
      record.projectId,
  };
}

async function handleClientGet(
  env,
  token
) {
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

  const projects =
    await kvGetJSON(
      env,
      "projects",
      []
    );

  const project =
    projects.find(
      p =>
        p.id ===
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
    data: project,
  });
}

async function handleClientUpdate(
  request,
  env,
  token
) {
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

  const index =
    projects.findIndex(
      p =>
        p.id ===
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
      value !==
      undefined
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
// GET / SET BY PATH
// ============================================================

function getByPath(
  obj,
  path
) {
  return path
    .split(".")
    .reduce(
      (current, key) =>
        current
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
      // ------------------------------------------------------
      // HOME
      // ------------------------------------------------------

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
          time:
            new Date().toISOString(),
        });
      }

      // ------------------------------------------------------
      // HEALTH
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // LOGIN
      // ------------------------------------------------------

      if (
        path ===
          "/api/login" &&
        method === "POST"
      ) {
        return handleLogin(
          request,
          env
        );
      }

      // ------------------------------------------------------
      // PUBLIC CONFIG
      // ------------------------------------------------------

      if (
        path.startsWith(
          "/api/public/config/"
        ) &&
        method === "GET"
      ) {
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

      // ------------------------------------------------------
      // PUBLIC LEADS
      // ------------------------------------------------------

      if (
        path.startsWith(
          "/api/public/leads/"
        ) &&
        method === "POST"
      ) {
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

      // ------------------------------------------------------
      // CLIENT LINK ACCESS
      // ------------------------------------------------------

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

        return notFound(
          "Método não permitido"
        );
      }

      // ------------------------------------------------------
      // ADMIN AUTH
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // DASHBOARD
      // ------------------------------------------------------

      if (
        path ===
          "/api/dashboard/stats" &&
        method === "GET"
      ) {
        return handleDashboardStats(
          env
        );
      }

      // ------------------------------------------------------
      // CLIENTS
      // ------------------------------------------------------

      if (
        path ===
        "/api/data/clients"
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

        return badRequest(
          "Método não permitido"
        );
      }

      // ------------------------------------------------------
      // PROJECTS
      // ------------------------------------------------------

      if (
        path ===
        "/api/data/projects"
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

        return badRequest(
          "Método não permitido"
        );
      }

      // ------------------------------------------------------
      // ADMIN LEADS
      // ------------------------------------------------------

      if (
        path.startsWith(
          "/api/data/leads/"
        ) &&
        method === "GET"
      ) {
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

      // ------------------------------------------------------
      // CLIENT LINKS
      // ------------------------------------------------------

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

        // ----------------------------------------------
        // REVOKE
        // /api/client-link/:jti/revoke
        // ----------------------------------------------

        if (
          rest.endsWith(
            "/revoke"
          ) &&
          method === "POST"
        ) {
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

        // ----------------------------------------------
        // PROJECT LINK
        // /api/client-link/:projectId
        // ----------------------------------------------

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

        return badRequest(
          "Método não permitido"
        );
      }

      // ------------------------------------------------------
      // NOT FOUND
      // ------------------------------------------------------

      return notFound(
        `Rota não encontrada: ${method} ${path}`
      );

    } catch (error) {
      console.error(
        "Worker error:",
        error
      );

      return json(
        {
          error: true,
          message:
            "Erro interno no Worker",
          detail:
            String(error),
        },
        500
      );
    }
  },
};
