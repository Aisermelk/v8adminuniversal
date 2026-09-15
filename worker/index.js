// ============================================================
// V8 ADMIN UNIVERSAL
// index.js
//
// Cloudflare Worker + KV
//
// Binding:
// V8_KV
//
// Secrets:
// ADMIN_EMAIL
// ADMIN_PASS
// TOKEN_SECRET
//
// ============================================================


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN_TTL = 24 * 60 * 60 * 1000;
const CLIENT_LINK_TTL = 30 * 24 * 60 * 60 * 1000;


// ============================================================
// CHAVES KV
// ============================================================

const KEYS = {
    clients: "data:clients",
    projects: "data:projects",
    leads: "data:leads",
    clientLinks: "data:client-links",
    products: "data:products",
    categories: "data:categories",
    orders: "data:orders"
};


// ============================================================
// RESPONSE JSON
// ============================================================

function json(data, status = 200, origin = "*") {

    return new Response(
        JSON.stringify(data),
        {
            status,

            headers: {
                "Content-Type": "application/json; charset=utf-8",

                "Access-Control-Allow-Origin": origin,

                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization",

                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",

                "Cache-Control":
                    "no-store"
            }
        }
    );
}


// ============================================================
// CORS
// ============================================================

function cors(request) {

    const origin =
        request.headers.get("Origin");

    return origin || "*";
}


// ============================================================
// HASH SHA-256
// ============================================================

async function sha256(value) {

    const data =
        new TextEncoder().encode(value);

    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    return Array
        .from(new Uint8Array(hash))
        .map(
            b =>
                b.toString(16).padStart(2, "0")
        )
        .join("");
}

// HMAC-SHA256 para novos tokens. Mantém o verificador legado abaixo
// para não invalidar sessões emitidas pela versão anterior.
async function hmacSha256(value, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}


// ============================================================
// UUID
// ============================================================

function uuid() {

    return crypto.randomUUID();
}


// ============================================================
// AUTENTICAÇÃO / SESSÕES
// ============================================================

const PASSWORD_ITERATIONS = 120000;

function base64UrlEncode(value) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(normalized + padding);
}

async function pbkdf2Hash(password, saltBytes, iterations = PASSWORD_ITERATIONS) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
        key,
        256
    );
    return base64UrlEncode(new Uint8Array(bits));
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return {
        passwordSalt: base64UrlEncode(salt),
        passwordHash: await pbkdf2Hash(password, salt, PASSWORD_ITERATIONS),
        passwordIterations: PASSWORD_ITERATIONS
    };
}

async function verifyPassword(password, storedHash, storedSalt, storedIterations) {
    if (!storedHash || !storedSalt) return false;
    try {
        const saltBinary = base64UrlDecode(storedSalt);
        const salt = Uint8Array.from(saltBinary, c => c.charCodeAt(0));
        const hash = await pbkdf2Hash(password, salt, Number(storedIterations) || PASSWORD_ITERATIONS);
        return hash === storedHash;
    } catch {
        return false;
    }
}

async function createToken(env, user) {
    const now = Date.now();
    const expiresAt = now + TOKEN_TTL;
    const payload = {
        sub: String(user.id),
        iat: now,
        exp: expiresAt,
        type: user.role === "CLIENTE" ? "client" : "admin",
        role: user.role === "CLIENTE" ? "CLIENTE" : "ADMIN",
        clientId: user.clientId || (user.role === "CLIENTE" ? user.id : null)
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = await hmacSha256(encoded, String(env.TOKEN_SECRET || ""));
    return { token: `${encoded}.${signature}`, expiresAt, user: payload };
}

async function verifyToken(request, env) {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;
    const secret = String(env.TOKEN_SECRET || "");
    if (!secret) return null;
    const expectedHmac = await hmacSha256(encoded, secret);
    const expectedLegacy = await sha256(encoded + secret);
    if (signature !== expectedHmac && signature !== expectedLegacy) return null;
    let payload;
    try { payload = JSON.parse(base64UrlDecode(encoded)); } catch { return null; }
    if (!payload?.exp || Date.now() >= payload.exp) return null;
    if (!["admin", "client"].includes(payload.type)) return null;
    if (payload.type === "admin") {
        return { ...payload, role: "ADMIN", id: payload.sub };
    }
    const clients = await getClients(env);
    const client = clients.find(c => c.id === payload.clientId || c.id === payload.sub);
    if (!client || client.status === "inactive") return null;
    return { ...payload, role: "CLIENTE", id: client.id, clientId: client.id, client };
}

async function requireAuth(request, env, origin) {
    const user = await verifyToken(request, env);
    if (!user) return { error: json({ error: true, message: "Não autorizado." }, 401, origin) };
    return { user };
}

function safeClient(client = {}) {
    const { passwordHash, passwordSalt, passwordIterations, ...safe } = client;
    return {
        ...safe,
        role: "CLIENTE",
        status: safe.status || "active",
        projectIds: Array.isArray(safe.projectIds) ? safe.projectIds : (safe.projectId ? [safe.projectId] : []),
        permissions: Array.isArray(safe.permissions) ? safe.permissions : ["projects", "content", "leads", "settings", "account"]
    };
}

function clientProjectIds(client = {}) {
    return [...new Set([
        ...(Array.isArray(client.projectIds) ? client.projectIds : []),
        ...(client.projectId ? [client.projectId] : [])
    ].map(String).filter(Boolean))];
}

function hasClientPermission(client, permission) {
    const permissions = Array.isArray(client?.permissions) ? client.permissions : ["projects", "content", "leads", "settings", "account"];
    return permissions.includes("all") || permissions.includes(permission);
}

async function getAuthenticatedClient(user, env) {
    if (!user || user.role !== "CLIENTE") return null;
    const clients = await getClients(env);
    return clients.find(c => c.id === user.clientId);
}

async function clientOwnsProject(client, projectId) {
    return clientProjectIds(client).includes(String(projectId));
}

// ============================================================
// KV GET
// ============================================================

async function kvGet(
    env,
    key,
    fallback = null
) {

    if (!env.V8_KV) {
        throw new Error(
            "Binding V8_KV não configurado."
        );
    }

    const value =
        await env.V8_KV.get(
            key,
            "json"
        );

    return value === null
        ? fallback
        : value;
}


// ============================================================
// KV PUT
// ============================================================

async function kvPut(
    env,
    key,
    value
) {

    if (!env.V8_KV) {
        throw new Error(
            "Binding V8_KV não configurado."
        );
    }

    await env.V8_KV.put(
        key,
        JSON.stringify(value)
    );

    return true;
}


// ============================================================
// KV DELETE
// ============================================================

async function kvDelete(
    env,
    key
) {

    if (!env.V8_KV) {
        throw new Error(
            "Binding V8_KV não configurado."
        );
    }

    await env.V8_KV.delete(key);

    return true;
}


// ============================================================
// DATA LOADERS
// ============================================================

async function getClients(env) {

    return await kvGet(
        env,
        KEYS.clients,
        []
    );
}


async function getProjects(env) {

    return await kvGet(
        env,
        KEYS.projects,
        []
    );
}


async function getLeads(env) {

    return await kvGet(
        env,
        KEYS.leads,
        []
    );
}


async function getClientLinks(env) {

    return await kvGet(
        env,
        KEYS.clientLinks,
        []
    );
}

async function getProducts(env) { return await kvGet(env, KEYS.products, []); }
async function getCategories(env) { return await kvGet(env, KEYS.categories, []); }
async function getOrders(env) { return await kvGet(env, KEYS.orders, []); }

function isStoreProject(project) {
    return project?.type === "LOJA";
}

function normalizeProduct(input = {}, projectId) {
    const now = new Date().toISOString();
    return {
        ...input,
        id: input.id || uuid(),
        projectId,
        name: String(input.name || ""),
        slug: String(input.slug || slugify(input.name || "")),
        description: String(input.description || ""),
        price: Number.isFinite(Number(input.price)) ? Number(input.price) : 0,
        salePrice: input.salePrice === null || input.salePrice === "" || input.salePrice === undefined
            ? null : Number(input.salePrice),
        image: String(input.image || ""),
        images: Array.isArray(input.images) ? input.images : [],
        categoryId: String(input.categoryId || ""),
        stock: Math.max(0, Number(input.stock) || 0),
        status: input.status === "inactive" ? "inactive" : "active",
        featured: Boolean(input.featured),
        createdAt: input.createdAt || now,
        updatedAt: now
    };
}

function normalizeCategory(input = {}, projectId) {
    const now = new Date().toISOString();
    return {
        ...input,
        id: input.id || uuid(),
        projectId,
        name: String(input.name || ""),
        slug: String(input.slug || slugify(input.name || "")),
        status: input.status === "inactive" ? "inactive" : "active",
        createdAt: input.createdAt || now,
        updatedAt: now
    };
}

function normalizeOrder(input = {}, projectId) {
    const now = new Date().toISOString();
    const allowed = ["pending", "confirmed", "processing", "completed", "cancelled"];
    return {
        ...input,
        id: input.id || uuid(),
        projectId,
        customer: input.customer && typeof input.customer === "object" ? input.customer : {},
        items: Array.isArray(input.items) ? input.items : [],
        total: Number(input.total) || 0,
        status: allowed.includes(input.status) ? input.status : "pending",
        createdAt: input.createdAt || now,
        updatedAt: now
    };
}


// ============================================================
// DATA NORMALIZATION
// ============================================================

function normalizeProject(project = {}) {
    const now = new Date().toISOString();
    const previous = project || {};

    return {
        ...previous,
        id: previous.id || uuid(),
        name: String(previous.name || ""),
        slug: String(previous.slug || slugify(previous.name || "")),
        type: ["PAGE", "SITE", "LOJA"].includes(previous.type)
            ? previous.type
            : "SITE",
        status: previous.status || "Em desenvolvimento",
        order: typeof previous.order === "number" ? previous.order : Date.now(),
        domain: String(previous.domain || ""),
        siteUrl: String(previous.siteUrl || ""),
        reviews: {
            ...(previous.reviews || {}),
            enabled: Boolean(previous.reviews?.enabled),
            placeId: previous.reviews?.placeId || ""
        },
        tracking: {
            ...(previous.tracking || {}),
            pixel: previous.tracking?.pixel || "",
            tag: previous.tracking?.tag || "",
            analytics: previous.tracking?.analytics || ""
        },
        contact: {
            ...(previous.contact || {}),
            whatsapp: previous.contact?.whatsapp || "",
            email: previous.contact?.email || "",
            phone: previous.contact?.phone || ""
        },
        social: {
            ...(previous.social || {}),
            facebook: previous.social?.facebook || "",
            instagram: previous.social?.instagram || "",
            tiktok: previous.social?.tiktok || "",
            youtube: previous.social?.youtube || "",
            linkedin: previous.social?.linkedin || ""
        },
        formspree: previous.formspree || "",
        content: { ...(previous.content || {}) },
        media: {
            ...(previous.media || {}),
            galleryEnabled: Boolean(previous.media?.galleryEnabled),
            galleryImages: Array.isArray(previous.media?.galleryImages) ? previous.media.galleryImages : [],
            videoEnabled: Boolean(previous.media?.videoEnabled),
            video: previous.media?.video || ""
        },
        location: { ...(previous.location || {}) },
        seo: {
            ...(previous.seo || {}),
            robots: previous.seo?.robots || "index, follow"
        },
        scripts: { ...(previous.scripts || {}) },
        createdAt: previous.createdAt || now,
        updatedAt: now
    };
}

function slugify(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

function normalizeClient(client = {}) {
    const now = new Date().toISOString();
    const legacyProjectId = String(client.projectId || "");
    const projectIds = Array.isArray(client.projectIds)
        ? [...new Set(client.projectIds.map(String).filter(Boolean))]
        : (legacyProjectId ? [legacyProjectId] : []);
    return {
        ...client,
        id: client.id || uuid(),
        name: String(client.name || "").trim(),
        email: String(client.email || "").trim().toLowerCase(),
        phone: String(client.phone || "").trim(),
        role: "CLIENTE",
        status: client.status === "inactive" ? "inactive" : "active",
        projectId: legacyProjectId || projectIds[0] || "",
        projectIds,
        permissions: Array.isArray(client.permissions) && client.permissions.length
            ? [...new Set(client.permissions.map(String))]
            : ["projects", "content", "leads", "settings", "account"],
        createdAt: client.createdAt || now,
        updatedAt: now
    };
}


// ============================================================
// LOGIN
// ============================================================

async function checkLoginRateLimit(env, request) {
    if (!env.V8_KV) return true;
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    const key = `security:login:${await sha256(ip.split(",")[0].trim())}`;
    const current = await kvGet(env, key, { count: 0 });
    if (Number(current.count || 0) >= 5) return false;
    await env.V8_KV.put(key, JSON.stringify({ count: Number(current.count || 0) + 1 }), { expirationTtl: 15 * 60 });
    return true;
}

async function clearLoginRateLimit(env, request) {
    if (!env.V8_KV) return;
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    const key = `security:login:${await sha256(ip.split(",")[0].trim())}`;
    await kvDelete(env, key);
}

async function handleLogin(request, env, origin) {
    if (!(await checkLoginRateLimit(env, request))) {
        return json({ error: true, message: "Muitas tentativas. Tente novamente em alguns minutos." }, 429, origin);
    }
    let body;
    try { body = await request.json(); }
    catch { return json({ error: true, message: "Dados de login inválidos." }, 400, origin); }

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) return json({ error: true, message: "Informe e-mail e senha." }, 400, origin);
    if (!env.TOKEN_SECRET) return json({ error: true, message: "TOKEN_SECRET não configurado no Worker." }, 500, origin);

    const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminPass = String(env.ADMIN_PASS || "");
    if (email === adminEmail && adminPass && password === adminPass) {
        await clearLoginRateLimit(env, request);
        const session = await createToken(env, { id: adminEmail || "admin", role: "ADMIN" });
        return json({ ok: true, token: session.token, expiresAt: session.expiresAt, user: { id: adminEmail || "admin", name: "Administrador", role: "ADMIN" } }, 200, origin);
    }

    const clients = await getClients(env);
    const client = clients.find(c => String(c.email || "").trim().toLowerCase() === email);
    if (client && client.status !== "inactive" && await verifyPassword(password, client.passwordHash, client.passwordSalt, client.passwordIterations)) {
        await clearLoginRateLimit(env, request);
        const session = await createToken(env, { id: client.id, role: "CLIENTE", clientId: client.id });
        return json({
            ok: true,
            token: session.token,
            expiresAt: session.expiresAt,
            user: { id: client.id, name: client.name, email: client.email, role: "CLIENTE", clientId: client.id }
        }, 200, origin);
    }
    return json({ error: true, message: "E-mail ou senha inválidos." }, 401, origin);
}

async function authMe(request, env, origin) {
    const user = await verifyToken(request, env);
    if (!user) return json({ error: true, message: "Sessão inválida ou expirada." }, 401, origin);
    if (user.role === "CLIENTE") {
        const client = await getAuthenticatedClient(user, env);
        if (!client) return json({ error: true, message: "Conta do cliente não encontrada." }, 401, origin);
        return json({ ok: true, user: { id: client.id, name: client.name, email: client.email, role: "CLIENTE", clientId: client.id }, permissions: client.permissions || [] }, 200, origin);
    }
    return json({ ok: true, user: { id: user.id, name: "Administrador", role: "ADMIN" }, permissions: ["all"] }, 200, origin);
}

async function clientProjects(request, env, origin, user) {
    const client = await getAuthenticatedClient(user, env);
    if (!client) return json({ error: true, message: "Cliente não encontrado." }, 404, origin);
    if (!hasClientPermission(client, "projects")) return json({ error: true, message: "Permissão insuficiente." }, 403, origin);
    const projects = await getProjects(env);
    const ids = new Set(clientProjectIds(client));
    return json(projects.filter(p => ids.has(String(p.id))).map(p => ({ ...p, clientId: undefined })), 200, origin);
}

async function clientProject(request, env, origin, user, projectId) {
    const client = await getAuthenticatedClient(user, env);
    if (!client || !(await clientOwnsProject(client, projectId))) return json({ error: true, message: "Projeto não encontrado." }, 404, origin);
    const projects = await getProjects(env);
    const index = projects.findIndex(p => p.id === projectId);
    if (index < 0) return json({ error: true, message: "Projeto não encontrado." }, 404, origin);
    if (request.method === "GET") return json({ ok: true, project: projects[index] }, 200, origin);
    if (request.method !== "PUT") return json({ error: true, message: "Método não permitido." }, 405, origin);
    if (!hasClientPermission(client, "content") && !hasClientPermission(client, "settings")) return json({ error: true, message: "Você não possui permissão para editar este projeto." }, 403, origin);
    let body;
    try { body = await request.json(); } catch { return json({ error: true, message: "JSON inválido." }, 400, origin); }
    const current = projects[index];
    const updated = JSON.parse(JSON.stringify(current));
    const editableGroups = [];
    if (hasClientPermission(client, "content") && body.content && typeof body.content === "object") editableGroups.push("content");
    if (hasClientPermission(client, "settings") && body.settings && typeof body.settings === "object") editableGroups.push("settings");
    if (hasClientPermission(client, "settings") && body.contact && typeof body.contact === "object") editableGroups.push("contact");
    if (hasClientPermission(client, "settings") && body.social && typeof body.social === "object") editableGroups.push("social");
    for (const group of editableGroups) {
        updated[group] = { ...(updated[group] || {}), ...body[group] };
    }
    updated.id = current.id;
    updated.clientId = current.clientId || client.id;
    updated.createdAt = current.createdAt;
    updated.updatedAt = new Date().toISOString();
    projects[index] = normalizeProject(updated);
    await kvPut(env, KEYS.projects, projects);
    return json({ ok: true, project: projects[index] }, 200, origin);
}

async function clientLeads(env, origin, user, projectId) {
    const client = await getAuthenticatedClient(user, env);
    if (!client || !hasClientPermission(client, "leads")) return json({ error: true, message: "Permissão insuficiente." }, 403, origin);
    if (!(await clientOwnsProject(client, projectId))) return json({ error: true, message: "Projeto não encontrado." }, 404, origin);
    const leads = await getLeads(env);
    return json(leads.filter(l => l.projectId === projectId).sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0)), 200, origin);
}

async function clientAccount(request, env, origin, user) {
    const clients = await getClients(env);
    const index = clients.findIndex(c => c.id === user.clientId);
    if (index < 0) return json({ error: true, message: "Cliente não encontrado." }, 404, origin);
    if (request.method === "GET") return json({ ok: true, client: safeClient(clients[index]) }, 200, origin);
    if (request.method !== "PUT") return json({ error: true, message: "Método não permitido." }, 405, origin);
    const current = clients[index];
    if (!hasClientPermission(current, "account")) return json({ error: true, message: "Permissão insuficiente." }, 403, origin);
    let body;
    try { body = await request.json(); } catch { return json({ error: true, message: "JSON inválido." }, 400, origin); }
    const next = { ...current };
    if (body.name !== undefined) next.name = String(body.name).trim().slice(0,160);
    if (body.phone !== undefined) next.phone = String(body.phone).trim().slice(0,60);
    if (body.password) {
        if (String(body.password).length < 8) return json({ error: true, message: "A nova senha deve ter pelo menos 8 caracteres." }, 400, origin);
        const pass = await hashPassword(String(body.password));
        Object.assign(next, pass);
    }
    next.email = current.email;
    next.id = current.id;
    next.updatedAt = new Date().toISOString();
    clients[index] = next;
    await kvPut(env, KEYS.clients, clients);
    return json({ ok: true, client: safeClient(next) }, 200, origin);
}



// ============================================================
// DASHBOARD
// ============================================================

async function dashboardStats(
    env,
    origin
) {

    const [
        projects,
        clients,
        leads
    ] =
        await Promise.all([
            getProjects(env),
            getClients(env),
            getLeads(env)
        ]);

    const recentLeads =
        leads
            .slice()
            .sort(
                (a, b) =>
                    new Date(
                        b.createdAt || 0
                    ) -
                    new Date(
                        a.createdAt || 0
                    )
            )
            .slice(0, 10)
            .map(
                lead => {

                    const project =
                        projects.find(
                            p =>
                                p.id ===
                                lead.projectId
                        );

                    return {
                        ...lead,

                        projectName:
                            project?.name || ""
                    };
                }
            );

    const leadsByProject = {};
    for (const lead of leads) {
        if (!lead.projectId) continue;
        const entry = leadsByProject[lead.projectId] || { count: 0, latestCreatedAt: null };
        entry.count += 1;
        if (!entry.latestCreatedAt || new Date(lead.createdAt || 0) > new Date(entry.latestCreatedAt)) {
            entry.latestCreatedAt = lead.createdAt || null;
        }
        leadsByProject[lead.projectId] = entry;
    }

    const typeCounts = projects.reduce((acc, project) => {
        const type = ["PAGE", "SITE", "LOJA"].includes(project.type) ? project.type : "SITE";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, { PAGE: 0, SITE: 0, LOJA: 0 });

    const ecommerce = await storeStats(env, projects.map(p => p.id));

    return json(
        {
            ok: true,
            totalProjects: projects.length,
            totalClients: clients.length,
            totalLeads: leads.length,
            ...typeCounts,
            ...ecommerce,
            recentLeads,
            leadsByProject
        },
        200,
        origin
    );
}


// ============================================================
// CLIENTES — LIST
// ============================================================

async function listClients(
    env,
    origin
) {

    const clients =
        await getClients(env);

    return json(
        clients.map(safeClient),
        200,
        origin
    );
}


// ============================================================
// CLIENTES — CREATE
// ============================================================

async function createClient(
    request,
    env,
    origin
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    const clients = await getClients(env);
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) return json({ error: true, message: "E-mail do cliente é obrigatório." }, 400, origin);
    if (clients.some(c => String(c.email || "").toLowerCase() === email)) return json({ error: true, message: "Já existe um cliente com este e-mail." }, 409, origin);
    const password = String(body?.password || "");
    if (password.length < 8) return json({ error: true, message: "A senha do cliente deve ter pelo menos 8 caracteres." }, 400, origin);
    const client = normalizeClient({ ...body, email });
    Object.assign(client, await hashPassword(password));
    clients.push(client);

    await kvPut(
        env,
        KEYS.clients,
        clients
    );

    return json(
        {
            ok: true,
            client: safeClient(client)
        },
        201,
        origin
    );
}


// ============================================================
// CLIENTES — UPDATE
// ============================================================

async function updateClient(
    request,
    env,
    origin
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    if (!body?.id) {

        return json(
            {
                error: true,
                message:
                    "ID do cliente obrigatório."
            },
            400,
            origin
        );
    }

    const clients =
        await getClients(env);

    const index =
        clients.findIndex(
            c =>
                c.id === body.id
        );

    if (index === -1) {

        return json(
            {
                error: true,
                message:
                    "Cliente não encontrado."
            },
            404,
            origin
        );
    }

    const current = clients[index];
    const next = normalizeClient({ ...current, ...body, id: current.id, createdAt: current.createdAt });
    if (String(body.email || current.email).trim().toLowerCase() !== String(current.email || "").toLowerCase()) {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) return json({ error: true, message: "E-mail obrigatório." }, 400, origin);
        if (clients.some((c, i) => i !== index && String(c.email || "").toLowerCase() === email)) return json({ error: true, message: "Já existe um cliente com este e-mail." }, 409, origin);
        next.email = email;
    }
    if (body.password !== undefined && String(body.password) !== "") {
        if (String(body.password).length < 8) return json({ error: true, message: "A senha deve ter pelo menos 8 caracteres." }, 400, origin);
        Object.assign(next, await hashPassword(String(body.password)));
    }
    next.updatedAt = new Date().toISOString();
    clients[index] = next;

    await kvPut(
        env,
        KEYS.clients,
        clients
    );

    return json(
        {
            ok: true,
            client: safeClient(clients[index])
        },
        200,
        origin
    );
}


// ============================================================
// CLIENTES — DELETE
// ============================================================

async function deleteClient(
    env,
    origin,
    url
) {

    const id =
        url.searchParams.get("id");

    if (!id) {

        return json(
            {
                error: true,
                message:
                    "ID obrigatório."
            },
            400,
            origin
        );
    }

    const clients =
        await getClients(env);

    const exists =
        clients.some(
            client =>
                client.id === id
        );

    if (!exists) {

        return json(
            {
                error: true,
                message:
                    "Cliente não encontrado."
            },
            404,
            origin
        );
    }

    const filtered =
        clients.filter(
            client =>
                client.id !== id
        );

    await kvPut(
        env,
        KEYS.clients,
        filtered
    );

    return json(
        {
            ok: true
        },
        200,
        origin
    );
}


// ============================================================
// PROJETOS — LIST
// ============================================================

async function listProjects(
    env,
    origin
) {

    const projects =
        await getProjects(env);

    const sorted =
        [...projects].sort(
            (a, b) =>
                (a.order ?? 0) - (b.order ?? 0)
        );

    return json(
        sorted,
        200,
        origin
    );
}


// ============================================================
// PROJETOS — CREATE
// ============================================================

async function createProject(
    request,
    env,
    origin
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const project =
        normalizeProject(body);

    projects.push(project);

    await kvPut(
        env,
        KEYS.projects,
        projects
    );

    return json(
        {
            ok: true,
            project
        },
        201,
        origin
    );
}


// ============================================================
// PROJETOS — UPDATE
// ============================================================

async function updateProject(
    request,
    env,
    origin
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    if (!body?.id) {

        return json(
            {
                error: true,
                message:
                    "ID do projeto obrigatório."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const index =
        projects.findIndex(
            project =>
                project.id === body.id
        );

    if (index === -1) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const current =
        projects[index];

    projects[index] =
        normalizeProject(
            {
                ...current,

                ...body,

                id:
                    current.id,

                createdAt:
                    current.createdAt
            }
        );

    await kvPut(
        env,
        KEYS.projects,
        projects
    );

    return json(
        {
            ok: true,

            project:
                projects[index]
        },
        200,
        origin
    );
}


// ============================================================
// PROJETOS — DELETE
//
// IMPORTANTE:
// Por segurança, este endpoint NÃO apaga automaticamente
// leads nem links do projeto.
// ============================================================

async function deleteProject(
    env,
    origin,
    url
) {

    const id =
        url.searchParams.get("id");

    if (!id) {

        return json(
            {
                error: true,
                message:
                    "ID obrigatório."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p =>
                p.id === id
        );

    if (!project) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const filtered =
        projects.filter(
            p =>
                p.id !== id
        );

    await kvPut(
        env,
        KEYS.projects,
        filtered
    );

    return json(
        {
            ok: true,

            message:
                "Projeto removido. Leads e links foram preservados."
        },
        200,
        origin
    );
}


// ============================================================
// PROJETO — RESTAURAR / VERIFICAR
// ============================================================

async function getProject(
    env,
    origin,
    id
) {

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p =>
                p.id === id
        );

    if (!project) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    return json(
        {
            ok: true,
            project
        },
        200,
        origin
    );
}


// ============================================================
// PUBLIC CONFIG
// ============================================================

async function publicConfig(
    env,
    origin,
    projectId
) {

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p =>
                p.id === projectId
        );

    if (!project) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    return json(
        {
            ok: true,

            project: {

                id:
                    project.id,

                name:
                    project.name,

                slug:
                    project.slug || "",

                type:
                    project.type || "SITE",

                status:
                    project.status,

                domain:
                    project.domain || "",

                siteUrl:
                    project.siteUrl || "",

                reviews:
                    project.reviews || { enabled: false, placeId: "" },

                tracking:
                    project.tracking || {},

                contact:
                    project.contact || {},

                social:
                    project.social || {},

                formspree:
                    project.formspree || "",

                content:
                    project.content || {},

                media:
                    project.media || {},

                location:
                    project.location || {},

                seo:
                    project.seo || {},

                scripts:
                    project.scripts || {}

            }
        },
        200,
        origin
    );
}


// ============================================================
// GOOGLE REVIEWS (nota + comentários), com cache no KV
// ============================================================

const GOOGLE_REVIEWS_CACHE_TTL = 60 * 60 * 24; // 24 horas

async function publicGoogleReviews(
    env,
    origin,
    projectId
) {

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p => p.id === projectId
        );

    if (!project) {
        return json(
            { error: true, message: "Projeto não encontrado." },
            404,
            origin
        );
    }

    const placeId =
        project.reviews?.placeId || "";

    if (!project.reviews?.enabled || !placeId) {
        return json(
            { enabled: false },
            200,
            origin
        );
    }

    const cacheKey =
        `google_reviews:${projectId}`;

    const cached =
        await kvGet(env, cacheKey);

    if (cached) {
        return json(
            { enabled: true, ...cached, cached: true },
            200,
            origin
        );
    }

    if (!env.GOOGLE_PLACES_API_KEY) {
        return json(
            {
                enabled: true,
                error: true,
                message: "GOOGLE_PLACES_API_KEY não configurado no Worker."
            },
            200,
            origin
        );
    }

    try {

        const url =
            "https://maps.googleapis.com/maps/api/place/details/json" +
            `?place_id=${encodeURIComponent(placeId)}` +
            "&fields=rating,user_ratings_total,reviews" +
            `&language=pt-BR` +
            `&key=${env.GOOGLE_PLACES_API_KEY}`;

        const response =
            await fetch(url);

        const data =
            await response.json();

        if (data.status !== "OK") {
            return json(
                {
                    enabled: true,
                    error: true,
                    message: "Google respondeu: " + data.status
                },
                200,
                origin
            );
        }

        const result = {

            rating:
                data.result?.rating || 0,

            totalReviews:
                data.result?.user_ratings_total || 0,

            reviews:
                (data.result?.reviews || []).slice(0, 5).map(r => ({
                    author: r.author_name,
                    rating: r.rating,
                    text: r.text,
                    relativeTime: r.relative_time_description,
                    profilePhoto: r.profile_photo_url || ""
                }))

        };

        await env.V8_KV.put(
            cacheKey,
            JSON.stringify(result),
            { expirationTtl: GOOGLE_REVIEWS_CACHE_TTL }
        );

        return json(
            { enabled: true, ...result, cached: false },
            200,
            origin
        );

    } catch (error) {

        return json(
            {
                enabled: true,
                error: true,
                message: "Erro ao buscar avaliações: " + String(error)
            },
            200,
            origin
        );
    }
}


// ============================================================
// LEADS — LIST
// ============================================================

async function listLeads(
    env,
    origin,
    projectId
) {

    const leads =
        await getLeads(env);

    const filtered =
        leads
            .filter(
                lead =>
                    lead.projectId ===
                    projectId
            )
            .sort(
                (a, b) =>
                    new Date(
                        b.createdAt || 0
                    ) -
                    new Date(
                        a.createdAt || 0
                    )
            );

    return json(
        filtered,
        200,
        origin
    );
}


// ============================================================
// LEADS — CREATE PÚBLICO
// ============================================================

async function createLead(
    request,
    env,
    origin,
    projectId
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const projectExists =
        projects.some(
            project =>
                project.id === projectId
        );

    if (!projectExists) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const leads =
        await getLeads(env);

    const limit = (value, max) => String(value || "").trim().slice(0, max);
    const lead = {

        id:
            uuid(),

        projectId,

        name: limit(body?.name, 160),
        email: limit(body?.email, 240),
        phone: limit(body?.phone, 60),
        message: limit(body?.message, 3000),
        source: limit(body?.source, 120),
        status: "new",

        createdAt:
            new Date().toISOString()
    };

    leads.push(lead);

    await kvPut(
        env,
        KEYS.leads,
        leads
    );

    return json(
        {
            ok: true,
            lead
        },
        201,
        origin
    );
}


// ============================================================
// CLIENT LINK — CREATE
// ============================================================

async function generateClientLink(
    request,
    env,
    origin,
    projectId
) {

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    const allowedFields = new Set([
        "tracking.pixel", "tracking.tag", "tracking.analytics",
        "contact.whatsapp", "contact.email", "contact.phone",
        "social.facebook", "social.instagram", "social.tiktok",
        "social.youtube", "social.linkedin", "formspree"
    ]);

    const fields = Array.isArray(body?.fields)
        ? [...new Set(body.fields.filter(field => allowedFields.has(field)))]
        : [];

    if (!fields.length) {

        return json(
            {
                error: true,
                message:
                    "Nenhum campo selecionado."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p =>
                p.id === projectId
        );

    if (!project) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const jti =
        uuid();

    const token =
        `${uuid()}-${uuid()}`;

    const tokenHash = await sha256(token);

    const link = {
        jti,
        tokenHash,
        // token é retornado apenas na criação; links antigos ainda podem
        // possuir "token" e continuam sendo validados por compatibilidade.
        projectId,

        fields,

        revoked:
            false,

        createdAt:
            new Date().toISOString(),

        expiresAt:
            new Date(
                Date.now() +
                CLIENT_LINK_TTL
            ).toISOString()
    };

    const links =
        await getClientLinks(env);

    links.push(link);

    await kvPut(
        env,
        KEYS.clientLinks,
        links
    );

    return json(
        {
            ok: true,

            jti,

            token,

            expiresAt:
                link.expiresAt
        },
        201,
        origin
    );
}


// ============================================================
// CLIENT LINKS — LIST
// ============================================================

async function listClientLinks(
    env,
    origin,
    projectId
) {

    const links =
        await getClientLinks(env);

    return json(
        links.filter(
            link =>
                link.projectId ===
                projectId
        ),
        200,
        origin
    );
}


// ============================================================
// CLIENT LINK — REVOKE
// ============================================================

async function revokeClientLink(
    env,
    origin,
    jti
) {

    const links =
        await getClientLinks(env);

    const index =
        links.findIndex(
            link =>
                link.jti === jti
        );

    if (index === -1) {

        return json(
            {
                error: true,
                message:
                    "Link não encontrado."
            },
            404,
            origin
        );
    }

    links[index] = {

        ...links[index],

        revoked:
            true,

        revokedAt:
            new Date().toISOString()
    };

    await kvPut(
        env,
        KEYS.clientLinks,
        links
    );

    return json(
        {
            ok: true
        },
        200,
        origin
    );
}


// ============================================================
// CLIENT ACCESS — VALIDAR
// ============================================================

async function validateClientLink(
    env,
    origin,
    token
) {

    const links =
        await getClientLinks(env);

    const tokenHash = await sha256(token);
    const link =
        links.find(
            item =>
                item.tokenHash === tokenHash ||
                item.token === token
        );

    if (!link) {

        return {
            error:
                json(
                    {
                        error: true,
                        message:
                            "Link inválido."
                    },
                    404,
                    origin
                )
        };
    }

    if (link.revoked) {

        return {
            error:
                json(
                    {
                        error: true,
                        message:
                            "Este link foi revogado."
                    },
                    403,
                    origin
                )
        };
    }

    if (
        link.expiresAt &&
        Date.now() >
            new Date(
                link.expiresAt
            ).getTime()
    ) {

        return {
            error:
                json(
                    {
                        error: true,
                        message:
                            "Este link expirou."
                    },
                    403,
                    origin
                )
        };
    }

    return {
        link
    };
}


// ============================================================
// CLIENT ACCESS — GET
// ============================================================

async function getClientAccess(
    env,
    origin,
    token
) {

    const validation =
        await validateClientLink(
            env,
            origin,
            token
        );

    if (validation.error) {
        return validation.error;
    }

    const link =
        validation.link;

    const projects =
        await getProjects(env);

    const project =
        projects.find(
            p =>
                p.id ===
                link.projectId
        );

    if (!project) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    return json(
        {
            ok: true,

            id:
                project.id,

            name:
                project.name,

            status:
                project.status,

            allowedFields:
                link.fields,

            // aliases mantidos para compatibilidade com editar.html
            fields:
                link.fields,

            data:
                project,

            projectName:
                project.name,

            config:
                project
        },
        200,
        origin
    );
}


// ============================================================
// CLIENT ACCESS — UPDATE
// ============================================================

async function updateClientAccess(
    request,
    env,
    origin,
    token
) {

    const validation =
        await validateClientLink(
            env,
            origin,
            token
        );

    if (validation.error) {
        return validation.error;
    }

    const link =
        validation.link;

    let body;

    try {

        body =
            await request.json();

    } catch {

        return json(
            {
                error: true,
                message:
                    "JSON inválido."
            },
            400,
            origin
        );
    }

    const projects =
        await getProjects(env);

    const index =
        projects.findIndex(
            project =>
                project.id ===
                link.projectId
        );

    if (index === -1) {

        return json(
            {
                error: true,
                message:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const current =
        projects[index];

    const updated =
        JSON.parse(
            JSON.stringify(current)
        );

    for (
        const field of link.fields
    ) {

        if (
            typeof field !==
            "string"
        ) {
            continue;
        }

        if (field === "formspree") {

            if (
                Object.prototype.hasOwnProperty.call(
                    body,
                    "formspree"
                )
            ) {

                updated.formspree =
                    body.formspree;
            }

            continue;
        }

        const parts =
            field.split(".");

        if (parts.length !== 2) {
            continue;
        }

        const [
            group,
            key
        ] = parts;

        if (
            body?.[group] &&
            Object.prototype.hasOwnProperty.call(
                body[group],
                key
            )
        ) {

            if (
                !updated[group] ||
                typeof updated[group] !==
                    "object"
            ) {

                updated[group] = {};
            }

            updated[group][key] =
                body[group][key];
        }
    }

    updated.id =
        current.id;

    updated.createdAt =
        current.createdAt;

    updated.updatedAt =
        new Date().toISOString();

    projects[index] =
        updated;

    await kvPut(
        env,
        KEYS.projects,
        projects
    );

    return json(
        {
            ok: true,
            project:
                updated
        },
        200,
        origin
    );
}


// ============================================================
// E-COMMERCE — MVP
// ============================================================

async function ensureStoreProject(env, origin, projectId) {
    const projects = await getProjects(env);
    const project = projects.find(p => p.id === projectId);
    if (!project) return { error: json({ error: true, message: "Projeto não encontrado." }, 404, origin) };
    if (!isStoreProject(project)) return { error: json({ error: true, message: "Recurso disponível somente para projetos LOJA." }, 403, origin) };
    return { project };
}

async function listStoreCollection(env, origin, projectId, kind) {
    const check = await ensureStoreProject(env, origin, projectId);
    if (check.error) return check.error;
    const source = kind === "products" ? await getProducts(env) : kind === "categories" ? await getCategories(env) : await getOrders(env);
    return json(source.filter(item => item.projectId === projectId), 200, origin);
}

async function upsertStoreItem(request, env, origin, projectId, kind) {
    const check = await ensureStoreProject(env, origin, projectId);
    if (check.error) return check.error;
    let body;
    try { body = await request.json(); } catch { return json({ error: true, message: "JSON inválido." }, 400, origin); }

    const key = kind === "products" ? KEYS.products : kind === "categories" ? KEYS.categories : KEYS.orders;
    const all = kind === "products" ? await getProducts(env) : kind === "categories" ? await getCategories(env) : await getOrders(env);
    const index = body?.id ? all.findIndex(item => item.id === body.id && item.projectId === projectId) : -1;
    const item = kind === "products"
        ? normalizeProduct(body, projectId)
        : kind === "categories"
            ? normalizeCategory(body, projectId)
            : normalizeOrder(body, projectId);

    if (index >= 0) {
        item.id = all[index].id;
        item.createdAt = all[index].createdAt;
        all[index] = item;
    } else {
        all.push(item);
    }
    await kvPut(env, key, all);
    return json({ ok: true, [kind === "products" ? "product" : kind === "categories" ? "category" : "order"]: item }, index >= 0 ? 200 : 201, origin);
}

async function deleteStoreItem(env, origin, projectId, kind, id) {
    const check = await ensureStoreProject(env, origin, projectId);
    if (check.error) return check.error;
    const key = kind === "products" ? KEYS.products : kind === "categories" ? KEYS.categories : KEYS.orders;
    const all = kind === "products" ? await getProducts(env) : kind === "categories" ? await getCategories(env) : await getOrders(env);
    const next = all.filter(item => !(item.id === id && item.projectId === projectId));
    if (next.length === all.length) return json({ error: true, message: "Registro não encontrado." }, 404, origin);
    await kvPut(env, key, next);
    return json({ ok: true }, 200, origin);
}

async function storeStats(env, projectIds) {
    const [products, categories, orders] = await Promise.all([getProducts(env), getCategories(env), getOrders(env)]);
    const ids = new Set(projectIds);
    return {
        totalProducts: products.filter(p => ids.has(p.projectId)).length,
        totalCategories: categories.filter(c => ids.has(c.projectId)).length,
        totalOrders: orders.filter(o => ids.has(o.projectId)).length
    };
}

// ============================================================
// API — INFO
// ============================================================

async function apiInfo(
    env,
    origin
) {

    return json(
        {
            ok: true,

            api:
                "V8 Admin Universal",

            version:
                "2.0.1",

            worker:
                "v8adminuniversal",

            endpoints: {

                login:
                    "POST /api/login",

                session:
                    "GET /api/auth/me",

                clientArea:
                    "/api/client/projects",

                clientAccount:
                    "/api/client/account",

                dashboard:
                    "GET /api/dashboard/stats",

                projects:
                    "/api/data/projects",

                clients:
                    "/api/data/clients",

                leads:
                    "GET /api/data/leads/:projectId",

                publicConfig:
                    "GET /api/public/config/:projectId",

                publicLead:
                    "POST /api/public/leads/:projectId",

                clientLink:
                    "/api/client-link/:projectId",

                clientAccess:
                    "/api/client-access/:token"
            },

            kv:
                !!env.V8_KV,

            time:
                new Date().toISOString()
        },
        200,
        origin
    );
}


// ============================================================
// ROUTER
// ============================================================

async function router(
    request,
    env
) {

    const url =
        new URL(
            request.url
        );

    const path =
        url.pathname;

    const method =
        request.method;

    const origin =
        cors(request);


    // ========================================================
    // OPTIONS
    // ========================================================

    if (method === "OPTIONS") {

        return new Response(
            null,
            {
                status: 204,

                headers: {

                    "Access-Control-Allow-Origin":
                        origin,

                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization",

                    "Access-Control-Allow-Methods":
                        "GET, POST, PUT, DELETE, OPTIONS",

                    "Access-Control-Max-Age":
                        "86400"
                }
            }
        );
    }


    // ========================================================
    // HEALTH
    // ========================================================

    if (
        path === "/" &&
        method === "GET"
    ) {

        return json(
            {
                ok: true,

                worker:
                    "v8adminuniversal",

                status:
                    "online",

                api:
                    true,

                kv:
                    !!env.V8_KV,

                time:
                    new Date().toISOString()
            },
            200,
            origin
        );
    }


    // ========================================================
    // API INFO
    // ========================================================

    if (
        path === "/api" &&
        method === "GET"
    ) {

        return apiInfo(
            env,
            origin
        );
    }


    // ========================================================
    // LOGIN
    // ========================================================

    if (
        path === "/api/login" &&
        method === "POST"
    ) {

        return handleLogin(
            request,
            env,
            origin
        );
    }


    // ========================================================
    // PUBLIC CONFIG
    // ========================================================

    const publicConfigMatch =
        path.match(
            /^\/api\/public\/config\/([^/]+)$/
        );

    if (
        publicConfigMatch &&
        method === "GET"
    ) {

        return publicConfig(
            env,
            origin,
            decodeURIComponent(
                publicConfigMatch[1]
            )
        );
    }


    // ========================================================
    // PUBLIC LEADS
    // ========================================================

    const publicLeadMatch =
        path.match(
            /^\/api\/public\/leads\/([^/]+)$/
        );

    if (
        publicLeadMatch &&
        method === "POST"
    ) {

        return createLead(
            request,
            env,
            origin,
            decodeURIComponent(
                publicLeadMatch[1]
            )
        );
    }


    // ========================================================
    // PUBLIC GOOGLE REVIEWS
    // ========================================================

    const publicReviewsMatch =
        path.match(
            /^\/api\/public\/reviews\/([^/]+)$/
        );

    if (
        publicReviewsMatch &&
        method === "GET"
    ) {

        return publicGoogleReviews(
            env,
            origin,
            decodeURIComponent(
                publicReviewsMatch[1]
            )
        );
    }


    // ========================================================
    // CLIENT ACCESS
    // ========================================================

    const clientAccessMatch =
        path.match(
            /^\/api\/client-access\/([^/]+)$/
        );

    if (clientAccessMatch) {

        const token =
            decodeURIComponent(
                clientAccessMatch[1]
            );

        if (method === "GET") {

            return getClientAccess(
                env,
                origin,
                token
            );
        }

        if (
            method === "PUT" ||
            method === "POST"
        ) {

            return updateClientAccess(
                request,
                env,
                origin,
                token
            );
        }
    }


    // ========================================================
    // LOJA — LEITURA PÚBLICA / PEDIDO
    // ========================================================
    const publicStoreMatch = path.match(/^\/api\/public\/store\/(products|categories|orders)\/([^/]+)$/);
    if (publicStoreMatch) {
        const kind = publicStoreMatch[1];
        const projectId = decodeURIComponent(publicStoreMatch[2]);
        if (method === "GET" && (kind === "products" || kind === "categories")) {
            return listStoreCollection(env, origin, projectId, kind);
        }
        if (method === "POST" && kind === "orders") {
            return upsertStoreItem(request, env, origin, projectId, "orders");
        }
    }

    // ========================================================
    // AUTH
    // ========================================================

    const authResult = await requireAuth(request, env, origin);
    if (authResult.error) return authResult.error;
    const authUser = authResult.user;

    // ========================================================
    // SESSÃO / ÁREA DO CLIENTE
    // ========================================================
    if (path === "/api/auth/me" && method === "GET") return authMe(request, env, origin);
    if (authUser.role === "CLIENTE") {
        if (path === "/api/client/projects" && method === "GET") return clientProjects(request, env, origin, authUser);
        const clientProjectMatch = path.match(/^\/api\/client\/projects\/([^/]+)$/);
        if (clientProjectMatch && (method === "GET" || method === "PUT")) return clientProject(request, env, origin, authUser, decodeURIComponent(clientProjectMatch[1]));
        const clientLeadsMatch = path.match(/^\/api\/client\/leads\/([^/]+)$/);
        if (clientLeadsMatch && method === "GET") return clientLeads(env, origin, authUser, decodeURIComponent(clientLeadsMatch[1]));
        if (path === "/api/client/account" && (method === "GET" || method === "PUT")) return clientAccount(request, env, origin, authUser);
        return json({ error: true, message: "Acesso restrito à área do cliente." }, 403, origin);
    }


    // ========================================================
    // DASHBOARD
    // ========================================================

    if (
        path === "/api/dashboard/stats" &&
        method === "GET"
    ) {

        return dashboardStats(
            env,
            origin
        );
    }


    // ========================================================
    // CLIENTES
    // ========================================================

    if (
        path === "/api/data/clients"
    ) {

        if (method === "GET") {

            return listClients(
                env,
                origin
            );
        }

        if (method === "POST") {

            return createClient(
                request,
                env,
                origin
            );
        }

        if (method === "PUT") {

            return updateClient(
                request,
                env,
                origin
            );
        }

        if (method === "DELETE") {

            return deleteClient(
                env,
                origin,
                url
            );
        }
    }


    // ========================================================
    // PROJETOS
    // ========================================================

    if (
        path === "/api/data/projects"
    ) {

        if (method === "GET") {

            return listProjects(
                env,
                origin
            );
        }

        if (method === "POST") {

            return createProject(
                request,
                env,
                origin
            );
        }

        if (method === "PUT") {

            return updateProject(
                request,
                env,
                origin
            );
        }

        if (method === "DELETE") {

            return deleteProject(
                env,
                origin,
                url
            );
        }
    }


    // ========================================================
    // PROJETO INDIVIDUAL
    // ========================================================

    const projectMatch =
        path.match(
            /^\/api\/data\/projects\/([^/]+)$/
        );

    if (
        projectMatch &&
        method === "GET"
    ) {

        return getProject(
            env,
            origin,
            decodeURIComponent(
                projectMatch[1]
            )
        );
    }


    // ========================================================
    // LEADS
    // ========================================================

    const leadsMatch =
        path.match(
            /^\/api\/data\/leads\/([^/]+)$/
        );

    if (
        leadsMatch &&
        method === "GET"
    ) {

        return listLeads(
            env,
            origin,
            decodeURIComponent(
                leadsMatch[1]
            )
        );
    }


    // ========================================================
    // E-COMMERCE
    // ========================================================

    const storeMatch = path.match(/^\/api\/store\/(products|categories|orders)\/([^/]+)(?:\/([^/]+))?$/);
    if (storeMatch) {
        const kind = storeMatch[1];
        const projectId = decodeURIComponent(storeMatch[2]);
        const itemId = storeMatch[3] ? decodeURIComponent(storeMatch[3]) : null;
        if (method === "GET" && !itemId) return listStoreCollection(env, origin, projectId, kind);
        if ((method === "POST" || method === "PUT") && !itemId) return upsertStoreItem(request, env, origin, projectId, kind);
        if (method === "DELETE" && itemId) return deleteStoreItem(env, origin, projectId, kind, itemId);
    }

    // ========================================================
    // CLIENT LINK
    // ========================================================

    const clientLinkMatch =
        path.match(
            /^\/api\/client-link\/([^/]+)$/
        );

    if (clientLinkMatch) {

        const projectId =
            decodeURIComponent(
                clientLinkMatch[1]
            );

        if (method === "GET") {

            return listClientLinks(
                env,
                origin,
                projectId
            );
        }

        if (method === "POST") {

            return generateClientLink(
                request,
                env,
                origin,
                projectId
            );
        }
    }


    // ========================================================
    // REVOKE CLIENT LINK
    // ========================================================

    const revokeMatch =
        path.match(
            /^\/api\/client-link\/([^/]+)\/revoke$/
        );

    if (
        revokeMatch &&
        method === "POST"
    ) {

        return revokeClientLink(
            env,
            origin,
            decodeURIComponent(
                revokeMatch[1]
            )
        );
    }


    // ========================================================
    // 404
    // ========================================================

    return json(
        {
            error: true,

            message:
                "Endpoint não encontrado.",

            path,

            method
        },
        404,
        origin
    );
}


// ============================================================
// ENTRYPOINT
// ============================================================

export default {

    async fetch(
        request,
        env,
        ctx
    ) {

        try {

            return await router(
                request,
                env
            );

        } catch (error) {

            console.error(
                "V8 ADMIN UNIVERSAL ERROR:",
                error
            );

            return json(
                {
                    error: true,

                    message:
                        "Erro interno do servidor.",

                    requestId:
                        crypto.randomUUID()
                },
                500,
                cors(request)
            );
        }
    }
};
