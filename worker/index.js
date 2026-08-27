/**
 * V8 ADMIN — Universal
 * Cloudflare Worker
 *
 * Worker: v8adminuniversal
 * API: https://v8adminuniversal.aisermelk.workers.dev
 *
 * Rotas principais:
 * POST /api/login
 * GET  /api/health
 * GET  /
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
// CONFIGURAÇÃO
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
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

function unauthorized(message = "Não autorizado") {
  return json(
    {
      error: true,
      message,
    },
    401
  );
}

function notFound(message = "Rota não encontrada") {
  return json(
    {
      error: true,
      message,
    },
    404
  );
}

function tooMany(
  message = "Muitas tentativas. Tente novamente em alguns minutos."
) {
  return json(
    {
      error: true,
      message,
    },
    429
  );
}

function serverError(message = "Erro interno do servidor") {
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
  return b64urlEncode(new TextEncoder().encode(str));
}

function b64urlDecodeStr(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");

  while (str.length % 4) {
    str += "=";
  }

  return atob(str);
}

// ============================================================
// TOKEN HMAC SHA-256
// ============================================================

async function getSigningKey(secret) {
  if (!secret) {
    throw new Error("TOKEN_SECRET não configurado");
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
  const key = await getSigningKey(secret);

  const payloadStr = b64urlEncodeStr(JSON.stringify(payload));

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadStr)
  );

  const sig = b64urlEncode(signature);

  return `${payloadStr}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payloadStr = parts[0];
  const sig = parts[1];

  if (!payloadStr || !sig) {
    return null;
  }

  try {
    const key = await getSigningKey(secret);

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payloadStr)
    );

    const expectedSig = b64urlEncode(expectedSignature);

    if (sig.length !== expectedSig.length) {
      return null;
    }

    let diff = 0;

    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }

    if (diff !== 0) {
      return null;
    }

    const payload = JSON.parse(b64urlDecodeStr(payloadStr));

    if (!payload.exp) {
      return null;
    }

    if (Date.now() / 1000 > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// AUTORIZAÇÃO
// ============================================================

function getBearerToken(request) {
  const authorization =
    request.headers.get("Authorization") || "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

async function requireAdmin(request, env) {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const payload = await verifyToken(
    token,
    env.TOKEN_SECRET
  );

  if (!payload) {
    return null;
  }

  if (payload.role !== "admin") {
    return null;
  }

  return payload;
}

// ============================================================
// KV
// ============================================================

async function kvGetJSON(env, key, fallback = null) {
  if (!env.V8_KV) {
    throw new Error("Binding V8_KV não configurado");
  }

  const raw = await env.V8_KV.get(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPutJSON(env, key, value) {
  if (!env.V8_KV) {
    throw new Error("Binding V8_KV não configurado");
  }

  await env.V8_KV.put(
    key,
    JSON.stringify(value)
  );
}

// ============================================================
// RATE LIMIT LOGIN
// ============================================================

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

async function checkLoginRateLimit(env, ip) {
  const key = `ratelimit:login:${ip}`;

  const record = await kvGetJSON(
    env,
    key,
    {
      count: 0,
    }
  );

  return record.count < LOGIN_MAX_ATTEMPTS;
}

async function registerLoginFailure(env, ip) {
  const key = `ratelimit:login:${ip}`;

  const record = await kvGetJSON(
    env,
    key,
    {
      count: 0,
    }
  );

  record.count += 1;

  await env.V8_KV.put(
    key,
    JSON.stringify(record),
    {
      expirationTtl: LOGIN_WINDOW_SECONDS,
    }
  );
}

async function clearLoginRateLimit(env, ip) {
  await env.V8_KV.delete(
    `ratelimit:login:${ip}`
  );
}

// ============================================================
// LOGIN
// ============================================================

async function handleLogin(request, env) {
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
    request.headers.get("CF-Connecting-IP") ||
    "unknown";

  if (!(await checkLoginRateLimit(env, ip))) {
    return tooMany();
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
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
    await registerLoginFailure(env, ip);

    return unauthorized(
      "E-mail ou senha inválidos"
    );
  }

  await clearLoginRateLimit(env, ip);

  const now =
    Math.floor(Date.now() / 1000);

  const exp =
    now + 60 * 60 * 12;

  const token = await signToken(
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
    expiresAt: exp * 1000,
  });
}

// ============================================================
// CLIENTES / PROJETOS
// ============================================================

async function handleCollectionGet(
  env,
  collection
) {
  const list = await kvGetJSON(
    env,
    collection,
    []
  );

  return json(list);
}

async function handleCollectionCreate(
  request,
  env,
  collection,
  shapeFn
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  const list = await kvGetJSON(
    env,
    collection,
    []
  );

  const item = {
    ...(shapeFn ? shapeFn() : {}),
    ...body,
    id: uuid(),
    createdAt: Date.now(),
  };

  list.push(item);

  await kvPutJSON(
    env,
    collection,
    list
  );

  return json(item, 201);
}

async function handleCollectionUpdate(
  request,
  env,
  collection
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return badRequest("JSON inválido");
  }

  if (!body?.id) {
    return badRequest(
      "Campo 'id' é obrigatório"
    );
  }

  const list = await kvGetJSON(
    env,
    collection,
    []
  );

  const index = list.findIndex(
    item => item.id === body.id
  );

  if (index === -1) {
    return notFound(
      "Item não encontrado"
    );
  }

  list[index] = {
    ...list[index],
    ...body,
  };

  await kvPutJSON(
    env,
    collection,
    list
  );

  return json(list[index]);
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

  const list = await kvGetJSON(
    env,
    collection,
    []
  );

  const filtered = list.filter(
    item => item.id !== id
  );

  if (filtered.length === list.length) {
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
// PROJETO PADRÃO
// ============================================================

function defaultProjectShape() {
  return {
    id: null,

    name: "",

    status: "Em desenvolvimento",

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

    createdAt: Date.now(),
  };
}

// ============================================================
// LEADS
// ============================================================

async function handleGetLeads(
  env,
  projectId
) {
  const leads = await kvGetJSON(
    env,
    `leads:${projectId}`,
    []
  );

  return json(leads);
}

async function handlePublicCreateLead(
  request,
  env,
  projectId
) {
  const projects = await kvGetJSON(
    env,
    "projects",
    []
  );

  const project = projects.find(
    p => p.id === projectId
  );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return badRequest(
      "JSON inválido"
    );
  }

  if (body?.website) {
    return json({
      ok: true,
    });
  }

  const lead = {
    id: uuid(),
    name: body?.name || "",
    email: body?.email || "",
    message: body?.message || "",
    createdAt: Date.now(),
  };

  const leads = await kvGetJSON(
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
  const projects = await kvGetJSON(
    env,
    "projects",
    []
  );

  const project = projects.find(
    p => p.id === projectId
  );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  return json({
    tracking: project.tracking || {},
    contact: project.contact || {},
    social: project.social || {},
    formspree: project.formspree || "",
  });
}

// ============================================================
// DASHBOARD
// ============================================================

async function handleDashboardStats(env) {
  const [
    clients,
    projects,
  ] = await Promise.all([
    kvGetJSON(env, "clients", []),
    kvGetJSON(env, "projects", []),
  ]);

  let totalLeads = 0;

  const recentLeads = [];

  for (const project of projects) {
    const leads = await kvGetJSON(
      env,
      `leads:${project.id}`,
      []
    );

    totalLeads += leads.length;

    for (const lead of leads.slice(0, 5)) {
      recentLeads.push({
        ...lead,
        projectName: project.name,
      });
    }
  }

  recentLeads.sort(
    (a, b) =>
      b.createdAt - a.createdAt
  );

  return json({
    totalClients: clients.length,
    totalProjects: projects.length,
    totalLeads,
    recentLeads:
      recentLeads.slice(0, 5),
  });
}

// ============================================================
// ROUTER PRINCIPAL
// ============================================================

export default {
  async fetch(request, env) {
    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    // Remove "/" final para evitar:
    // /api/login/
    // não encontrar /api/login
    const path =
      url.pathname.length > 1
        ? url.pathname.replace(/\/+$/, "")
        : "/";

    const method =
      request.method.toUpperCase();

    try {
      // ======================================================
      // TESTE PRINCIPAL
      // ======================================================

      if (
        path === "/" &&
        method === "GET"
      ) {
        return json({
          ok: true,
          worker: "v8adminuniversal",
          status: "online",
          api: true,
          time: new Date().toISOString(),
        });
      }

      // ======================================================
      // HEALTH CHECK
      // ======================================================

      if (
        path === "/api/health" &&
        method === "GET"
      ) {
        return json({
          ok: true,
          worker: "v8adminuniversal",
          status: "online",
          kv: !!env.V8_KV,
          adminEmail:
            !!env.ADMIN_EMAIL,
          adminPass:
            !!env.ADMIN_PASS,
          tokenSecret:
            !!env.TOKEN_SECRET,
          time: new Date().toISOString(),
        });
      }

      // ======================================================
      // LOGIN
      // ======================================================

      if (
        path === "/api/login" &&
        method === "POST"
      ) {
        return handleLogin(
          request,
          env
        );
      }

      // ======================================================
      // CONFIG PÚBLICA
      // ======================================================

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

      // ======================================================
      // LEADS PÚBLICOS
      // ======================================================

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

      // ======================================================
      // CLIENTE
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
      }

      // ======================================================
      // ADMIN
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
          "/api/dashboard/stats" &&
        method === "GET"
      ) {
        return handleDashboardStats(
          env
        );
      }

      // ======================================================
      // CLIENTS
      // ======================================================

      if (
        path === "/api/data/clients"
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
          method === "DELETE"
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
      }

      // ======================================================
      // PROJECTS
      // ======================================================

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
          method === "DELETE"
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
      }

      // ======================================================
      // LEADS ADMIN
      // ======================================================

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

      // ======================================================
      // ROTA NÃO ENCONTRADA
      // ======================================================

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
          detail: String(error),
        },
        500
      );
    }
  },
};

// ============================================================
// FUNÇÕES DE CLIENTE
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
    payload.role !== "client"
  ) {
    return null;
  }

  const record =
    await kvGetJSON(
      env,
      `client_token:${payload.jti}`
    );

  if (
    !record ||
    record.revoked
  ) {
    return null;
  }

  return {
    ...payload,
    fields: record.fields,
    projectId: record.projectId,
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
      "Link inválido ou revogado"
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
      p => p.id === auth.projectId
    );

  if (!project) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  return json({
    projectName: project.name,
    fields: auth.fields,
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
      "Link inválido ou revogado"
    );
  }

  let body;

  try {
    body = await request.json();
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
      p => p.id === auth.projectId
    );

  if (index === -1) {
    return notFound(
      "Projeto não encontrado"
    );
  }

  for (
    const path of auth.fields
  ) {
    setByPath(
      projects[index],
      path,
      getByPath(body, path)
    );
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
// CAMPOS
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
    i < keys.length - 1;
    i++
  ) {
    if (
      typeof current[keys[i]] !==
        "object" ||
      current[keys[i]] === null
    ) {
      current[keys[i]] = {};
    }

    current =
      current[keys[i]];
  }

  current[
    keys[keys.length - 1]
  ] = value;
}
