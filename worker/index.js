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
    clientLinks: "data:client-links"
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


// ============================================================
// UUID
// ============================================================

function uuid() {

    return crypto.randomUUID();
}


// ============================================================
// TOKEN ADMIN
// ============================================================

async function createToken(env) {

    const now =
        Date.now();

    const expiresAt =
        now + TOKEN_TTL;

    const payload = {
        sub:
            env.ADMIN_EMAIL || "admin",

        iat:
            now,

        exp:
            expiresAt,

        type:
            "admin"
    };

    const encoded =
        btoa(
            JSON.stringify(payload)
        );

    const signature =
        await sha256(
            encoded +
            String(env.TOKEN_SECRET || "")
        );

    return {
        token:
            `${encoded}.${signature}`,

        expiresAt
    };
}


// ============================================================
// VALIDAR TOKEN
// ============================================================

async function verifyToken(request, env) {

    const auth =
        request.headers.get(
            "Authorization"
        );

    if (!auth) {
        return false;
    }

    if (!auth.startsWith("Bearer ")) {
        return false;
    }

    const token =
        auth.slice(7).trim();

    const parts =
        token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    const encoded =
        parts[0];

    const signature =
        parts[1];

    const expected =
        await sha256(
            encoded +
            String(env.TOKEN_SECRET || "")
        );

    if (signature !== expected) {
        return false;
    }

    let payload;

    try {

        payload =
            JSON.parse(
                atob(encoded)
            );

    } catch {

        return false;
    }

    if (!payload) {
        return false;
    }

    if (!payload.exp) {
        return false;
    }

    if (Date.now() >= payload.exp) {
        return false;
    }

    if (payload.type !== "admin") {
        return false;
    }

    return true;
}


// ============================================================
// AUTH
// ============================================================

async function requireAuth(
    request,
    env,
    origin
) {

    const valid =
        await verifyToken(
            request,
            env
        );

    if (!valid) {

        return json(
            {
                error: true,
                message:
                    "Não autorizado."
            },
            401,
            origin
        );
    }

    return null;
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


// ============================================================
// DATA NORMALIZATION
// ============================================================

function normalizeProject(project = {}) {

    const now =
        new Date().toISOString();

    return {

        id:
            project.id ||
            uuid(),

        name:
            String(
                project.name || ""
            ),

        status:
            project.status ||
            "Em desenvolvimento",

        tracking: {

            pixel:
                project.tracking?.pixel ||
                "",

            tag:
                project.tracking?.tag ||
                "",

            analytics:
                project.tracking?.analytics ||
                ""

        },

        contact: {

            whatsapp:
                project.contact?.whatsapp ||
                "",

            email:
                project.contact?.email ||
                "",

            phone:
                project.contact?.phone ||
                ""

        },

        social: {

            facebook:
                project.social?.facebook ||
                "",

            instagram:
                project.social?.instagram ||
                "",

            tiktok:
                project.social?.tiktok ||
                "",

            youtube:
                project.social?.youtube ||
                "",

            linkedin:
                project.social?.linkedin ||
                ""

        },

        formspree:
            project.formspree ||
            "",

        content: {

            name:
                project.content?.name || "",

            job:
                project.content?.job || "",

            headline:
                project.content?.headline || "",

            description:
                project.content?.description || "",

            specialization:
                project.content?.specialization || "",

            experience:
                project.content?.experience || "",

            address:
                project.content?.address || "",

            registration:
                project.content?.registration || ""

        },

        media: {

            galleryEnabled:
                Boolean(project.media?.galleryEnabled),

            galleryImages:
                Array.isArray(project.media?.galleryImages)
                    ? project.media.galleryImages
                    : [],

            videoEnabled:
                Boolean(project.media?.videoEnabled),

            video:
                project.media?.video || ""

        },

        location: {

            enabled:
                Boolean(project.location?.enabled),

            address:
                project.location?.address || "",

            mapsUrl:
                project.location?.mapsUrl || "",

            embed:
                project.location?.embed || ""

        },

        seo: {

            title:
                project.seo?.title || "",

            description:
                project.seo?.description || "",

            ogImage:
                project.seo?.ogImage || "",

            canonical:
                project.seo?.canonical || "",

            keywords:
                project.seo?.keywords || "",

            robots:
                project.seo?.robots || "index, follow"

        },

        scripts: {

            head:
                project.scripts?.head || "",

            body:
                project.scripts?.body || "",

            footer:
                project.scripts?.footer || ""

        },

        createdAt:
            project.createdAt ||
            now,

        updatedAt:
            now
    };
}


function normalizeClient(client = {}) {

    const now =
        new Date().toISOString();

    return {

        id:
            client.id ||
            uuid(),

        name:
            String(
                client.name || ""
            ),

        email:
            String(
                client.email || ""
            ),

        phone:
            String(
                client.phone || ""
            ),

        projectId:
            client.projectId ||
            "",

        createdAt:
            client.createdAt ||
            now,

        updatedAt:
            now
    };
}


// ============================================================
// LOGIN
// ============================================================

async function handleLogin(
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
                    "Dados de login inválidos."
            },
            400,
            origin
        );
    }

    const email =
        String(
            body?.email || ""
        )
        .trim()
        .toLowerCase();

    const password =
        String(
            body?.password || ""
        );

    const configuredEmail =
        String(
            env.ADMIN_EMAIL || ""
        )
        .trim()
        .toLowerCase();

    const configuredPassword =
        String(
            env.ADMIN_PASS || ""
        );

    if (
        !email ||
        !password
    ) {

        return json(
            {
                error: true,
                message:
                    "Informe e-mail e senha."
            },
            400,
            origin
        );
    }

    if (
        !configuredEmail ||
        !configuredPassword ||
        !env.TOKEN_SECRET
    ) {

        return json(
            {
                error: true,
                message:
                    "Configuração de autenticação incompleta no Worker."
            },
            500,
            origin
        );
    }

    if (
        email !== configuredEmail ||
        password !== configuredPassword
    ) {

        return json(
            {
                error: true,
                message:
                    "E-mail ou senha inválidos."
            },
            401,
            origin
        );
    }

    const session =
        await createToken(env);

    return json(
        {
            ok: true,

            token:
                session.token,

            expiresAt:
                session.expiresAt
        },
        200,
        origin
    );
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

    return json(
        {
            ok: true,

            totalProjects:
                projects.length,

            totalClients:
                clients.length,

            totalLeads:
                leads.length,

            recentLeads
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
        clients,
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

    const clients =
        await getClients(env);

    const client =
        normalizeClient(body);

    clients.push(client);

    await kvPut(
        env,
        KEYS.clients,
        clients
    );

    return json(
        {
            ok: true,
            client
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

    clients[index] = {

        ...clients[index],

        ...body,

        id:
            clients[index].id,

        createdAt:
            clients[index].createdAt,

        updatedAt:
            new Date().toISOString()
    };

    await kvPut(
        env,
        KEYS.clients,
        clients
    );

    return json(
        {
            ok: true,
            client:
                clients[index]
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

    return json(
        projects,
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

                status:
                    project.status,

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

    const lead = {

        id:
            uuid(),

        projectId,

        name:
            String(
                body?.name || ""
            ),

        email:
            String(
                body?.email || ""
            ),

        phone:
            String(
                body?.phone || ""
            ),

        message:
            String(
                body?.message || ""
            ),

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

    const fields =
        Array.isArray(body?.fields)
            ? body.fields
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

    const link = {

        jti,

        token,

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

    const link =
        links.find(
            item =>
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
                "1.0.0",

            worker:
                "v8adminuniversal",

            endpoints: {

                login:
                    "POST /api/login",

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
    // AUTH
    // ========================================================

    const authError =
        await requireAuth(
            request,
            env,
            origin
        );

    if (authError) {
        return authError;
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

                    detail:
                        error?.message ||
                        String(error)
                },
                500,
                cors(request)
            );
        }
    }
};
