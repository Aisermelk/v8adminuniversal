const TOKEN_TTL = 24 * 60 * 60 * 1000;
const GOOGLE_REVIEWS_CACHE_TTL = 86400;
const MIGRATION_KEY = "d1:migration:v1";

const KEYS = {
    clients: "data:clients",
    projects: "data:projects",
    leads: "data:leads"
};

const ROUTES = {
    publicConfig: /^\/api\/public\/config\/([^/]+)$/,
    publicLeads: /^\/api\/public\/leads\/([^/]+)$/,
    publicReviews: /^\/api\/public\/reviews\/([^/]+)$/,
    project: /^\/api\/data\/projects\/([^/]+)$/,
    leads: /^\/api\/data\/leads\/([^/]+)$/
};

/* =========================================================
   RESPONSE
   ========================================================= */

function json(data, status = 200, origin = "*") {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
        }
    });
}

function cors(request) {
    return request.headers.get("Origin") || "*";
}

function uuid() {
    return crypto.randomUUID();
}

function now() {
    return new Date().toISOString();
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

/* =========================================================
   CRYPTO
   ========================================================= */

function bytesToBase64(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);

    return Uint8Array.from(
        binary,
        char => char.charCodeAt(0)
    );
}

async function sha256(value) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    );

    return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(
        new Uint8Array(16)
    );

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        key,
        256
    );

    return {
        hash: bytesToBase64(
            new Uint8Array(bits)
        ),
        salt: bytesToBase64(salt)
    };
}

async function verifyPassword(password, hash, salt) {
    if (!hash || !salt) {
        return false;
    }

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: base64ToBytes(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        key,
        256
    );

    return (
        bytesToBase64(
            new Uint8Array(bits)
        ) === hash
    );
}

/* =========================================================
   TOKEN
   ========================================================= */

async function createToken(payload, env) {
    const data = {
        ...payload,
        iat: Date.now(),
        exp: Date.now() + TOKEN_TTL
    };

    const encoded = bytesToBase64(
        new TextEncoder().encode(
            JSON.stringify(data)
        )
    );

    const signature = await sha256(
        `${encoded}.${env.TOKEN_SECRET || ""}`
    );

    return `${encoded}.${signature}`;
}

async function verifyToken(request, env) {
    const header =
        request.headers.get("Authorization") || "";

    if (!header.startsWith("Bearer ")) {
        return null;
    }

    const token = header.slice(7);
    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [encoded, signature] = parts;

    const expected = await sha256(
        `${encoded}.${env.TOKEN_SECRET || ""}`
    );

    if (signature !== expected) {
        return null;
    }

    try {
        const payload = JSON.parse(
            new TextDecoder().decode(
                base64ToBytes(encoded)
            )
        );

        if (
            !payload.exp ||
            Date.now() > payload.exp
        ) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

async function requireAuth(
    request,
    env,
    origin,
    types = ["admin", "client"]
) {
    const user = await verifyToken(
        request,
        env
    );

    if (
        !user ||
        !types.includes(user.type)
    ) {
        return {
            user: null,
            response: json(
                {
                    success: false,
                    error: "Não autorizado."
                },
                401,
                origin
            )
        };
    }

    return {
        user,
        response: null
    };
}

/* =========================================================
   NORMALIZATION
   ========================================================= */

/* =========================================================
   PERMISSÕES DE EDIÇÃO DO CLIENTE
   Só estes campos podem ser liberados pelo administrador.
   Scripts, tracking, reviews, mídia e embed ficam sempre só com o admin.
========================================================= */

const CLIENT_EDITABLE_FIELDS = {
    content: [
        "name",
        "job",
        "headline",
        "description",
        "specialization",
        "experience",
        "address",
        "registration"
    ],
    contact: [
        "whatsapp",
        "email",
        "phone"
    ],
    social: [
        "facebook",
        "instagram",
        "tiktok",
        "youtube",
        "linkedin"
    ],
    location: [
        "enabled",
        "address",
        "mapsUrl"
    ],
    seo: [
        "title",
        "description",
        "ogImage",
        "keywords"
    ]
};

const CLIENT_URL_FIELDS = new Set([
    "social.facebook",
    "social.instagram",
    "social.tiktok",
    "social.youtube",
    "social.linkedin",
    "location.mapsUrl",
    "seo.ogImage"
]);

function sanitizeAccess(access) {
    const list =
        Array.isArray(access?.editable)
            ? access.editable
            : [];

    const valid = list.filter(item => {
        if (typeof item !== "string") {
            return false;
        }

        const [section, field] =
            item.split(".");

        const fields =
            CLIENT_EDITABLE_FIELDS[section];

        if (!fields) {
            return false;
        }

        return (
            field === undefined ||
            fields.includes(field)
        );
    });

    return {
        editable: [...new Set(valid)]
    };
}

async function clientUpdateProject(
    request,
    env,
    user,
    projectId,
    origin
) {
    const project =
        await getProjectForUser(
            env,
            projectId,
            user
        );

    if (!project) {
        return json(
            {
                success: false,
                error:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const editable =
        sanitizeAccess(project.access)
            .editable;

    const body =
        await readJson(request);

    const changes = {};
    let applied = 0;
    let blocked = 0;

    for (
        const [section, fields]
        of Object.entries(
            CLIENT_EDITABLE_FIELDS
        )
    ) {
        const incoming =
            body?.[section];

        if (
            !incoming ||
            typeof incoming !== "object"
        ) {
            continue;
        }

        for (const field of fields) {
            if (!(field in incoming)) {
                continue;
            }

            const path =
                `${section}.${field}`;

            const allowed =
                editable.includes(section) ||
                editable.includes(path);

            if (!allowed) {
                blocked++;
                continue;
            }

            let value;

            if (
                section === "location" &&
                field === "enabled"
            ) {
                value =
                    !!incoming[field];
            } else {
                value =
                    String(
                        incoming[field] ?? ""
                    )
                        .trim()
                        .slice(0, 5000);

                if (
                    value &&
                    CLIENT_URL_FIELDS.has(path) &&
                    !/^https?:\/\//i.test(value)
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Informe um link começando com http:// ou https://."
                        },
                        400,
                        origin
                    );
                }
            }

            if (!changes[section]) {
                changes[section] = {
                    ...project[section]
                };
            }

            changes[section][field] =
                value;

            applied++;
        }
    }

    if (blocked && !applied) {
        return json(
            {
                success: false,
                error:
                    "Você não tem permissão para editar estes campos."
            },
            403,
            origin
        );
    }

    if (!applied) {
        return json(
            {
                success: true,
                project,
                applied: 0,
                blocked
            },
            200,
            origin
        );
    }

    const updated =
        await d1UpdateProject(
            env,
            projectId,
            changes
        );

    return json(
        {
            success: true,
            project: updated,
            applied,
            blocked
        },
        200,
        origin
    );
}

function normalizeProject(
    data = {},
    existing = {}
) {
    const reviews =
        data.reviews ??
        existing.reviews ??
        {};

    const tracking =
        data.tracking ??
        existing.tracking ??
        {};

    const contact =
        data.contact ??
        existing.contact ??
        {};

    const social =
        data.social ??
        existing.social ??
        {};

    const content =
        data.content ??
        existing.content ??
        {};

    const media =
        data.media ??
        existing.media ??
        {};

    const location =
        data.location ??
        existing.location ??
        {};

    const seo =
        data.seo ??
        existing.seo ??
        {};

    const scripts =
        data.scripts ??
        existing.scripts ??
        {};

    const access =
        data.access ??
        existing.access ??
        {};

    return {
        id:
            data.id ||
            existing.id ||
            uuid(),

        name:
            data.name ??
            existing.name ??
            "",

        status:
            data.status ??
            existing.status ??
            "Em desenvolvimento",

        order:
            data.order ??
            data.projectOrder ??
            existing.order ??
            0,

        projectOrder:
            data.projectOrder ??
            data.order ??
            existing.projectOrder ??
            existing.order ??
            0,

        siteUrl:
            data.siteUrl ??
            existing.siteUrl ??
            "",

        reviews: {
            enabled: !!reviews.enabled,
            placeId: reviews.placeId || ""
        },

        tracking: {
            pixel: tracking.pixel || "",
            tag: tracking.tag || "",
            analytics: tracking.analytics || ""
        },

        contact: {
            whatsapp: contact.whatsapp || "",
            email: contact.email || "",
            phone: contact.phone || ""
        },

        social: {
            facebook: social.facebook || "",
            instagram: social.instagram || "",
            tiktok: social.tiktok || "",
            youtube: social.youtube || "",
            linkedin: social.linkedin || ""
        },

        formspree:
            data.formspree ??
            existing.formspree ??
            "",

        content: {
            name: content.name || "",
            job: content.job || "",
            headline: content.headline || "",
            description: content.description || "",
            specialization:
                content.specialization || "",
            experience:
                content.experience || "",
            address:
                content.address || "",
            registration:
                content.registration || ""
        },

        media: {
            galleryEnabled:
                !!media.galleryEnabled,

            galleryImages:
                Array.isArray(
                    media.galleryImages
                )
                    ? media.galleryImages
                    : [],

            videoEnabled:
                !!media.videoEnabled,

            video:
                media.video || ""
        },

        location: {
            enabled:
                !!location.enabled,

            address:
                location.address || "",

            mapsUrl:
                location.mapsUrl || "",

            embed:
                location.embed || ""
        },

        seo: {
            title:
                seo.title || "",

            description:
                seo.description || "",

            ogImage:
                seo.ogImage || "",

            canonical:
                seo.canonical || "",

            keywords:
                seo.keywords || "",

            robots:
                seo.robots || ""
        },

        access:
            sanitizeAccess(access),

        scripts: {
            head:
                scripts.head || "",

            body:
                scripts.body || "",

            footer:
                scripts.footer || ""
        },

        createdAt:
            data.createdAt ||
            existing.createdAt ||
            now(),

        updatedAt: now()
    };
}

function normalizeClient(
    data = {},
    existing = {}
) {
    return {
        id:
            data.id ||
            existing.id ||
            uuid(),

        name:
            data.name ??
            existing.name ??
            "",

        email:
            String(
                data.email ??
                existing.email ??
                ""
            )
                .trim()
                .toLowerCase(),

        phone:
            data.phone ??
            existing.phone ??
            "",

        legacyProjectId:
            data.legacyProjectId ??
            data.projectId ??
            existing.legacyProjectId ??
            "",

        status:
            data.status ??
            existing.status ??
            "active",

        metadata:
            data.metadata ??
            existing.metadata ??
            {}
    };
}

/* =========================================================
   D1 ROW MAPPERS
   ========================================================= */

function parseJson(
    value,
    fallback = {}
) {
    try {
        return JSON.parse(value || "");
    } catch {
        return fallback;
    }
}

function rowToClient(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        legacyProjectId:
            row.legacy_project_id || "",
        status: row.status,
        metadata:
            parseJson(
                row.metadata_json,
                {}
            ),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function rowToProject(
    row,
    includeInternal = true
) {
    if (!row) {
        return null;
    }

    const config =
        parseJson(
            row.config_json,
            {}
        );

    const metadata =
        parseJson(
            row.metadata_json,
            {}
        );

    // Os campos da linha do banco vêm por último para que um "id" ou
    // "name" antigo dentro do config_json (migração do KV) nunca os sobrescreva.
    const project = {
        ...config,
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        status: row.status,
        order: row.project_order,
        projectOrder: row.project_order,
        siteUrl: row.site_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };

    if (includeInternal) {
        project.metadata = metadata;
        project.deletedAt = row.deleted_at;
    } else {
        delete project.clientId;
        delete project.createdAt;
        delete project.updatedAt;
        delete project.metadata;
        delete project.deletedAt;
    }

    return project;
}

function rowToLead(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        message: row.message,
        metadata:
            parseJson(
                row.metadata_json,
                {}
            ),
        createdAt: row.created_at
    };
}

/* =========================================================
   D1 CLIENTS
   ========================================================= */

async function d1GetClient(
    env,
    id
) {
    const row =
        await env.V8_D1
            .prepare(
                "SELECT * FROM clients WHERE id = ?"
            )
            .bind(id)
            .first();

    return rowToClient(row);
}

async function d1GetClientAuth(
    env,
    email
) {
    return env.V8_D1
        .prepare(
            `SELECT
                id,
                name,
                email,
                phone,
                legacy_project_id,
                status,
                metadata_json,
                created_at,
                updated_at,
                password_hash,
                password_salt,
                last_login_at
             FROM clients
             WHERE LOWER(email)=LOWER(?)
             AND status='active'
             LIMIT 1`
        )
        .bind(email)
        .first();
}

async function d1ListClients(env) {
    const result =
        await env.V8_D1
            .prepare(
                `SELECT *
                 FROM clients
                 ORDER BY created_at DESC`
            )
            .all();

    return result.results.map(rowToClient);
}

async function d1CreateClient(
    env,
    client,
    password = ""
) {
    const timestamp = now();

    let passwordHash = "";
    let passwordSalt = "";

    if (password) {
        const result =
            await hashPassword(password);

        passwordHash = result.hash;
        passwordSalt = result.salt;
    }

    await env.V8_D1
        .prepare(
            `INSERT INTO clients
            (
                id,
                name,
                email,
                phone,
                legacy_project_id,
                status,
                metadata_json,
                created_at,
                updated_at,
                password_hash,
                password_salt
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
            client.id,
            client.name,
            client.email,
            client.phone,
            client.legacyProjectId,
            client.status,
            JSON.stringify(
                client.metadata
            ),
            timestamp,
            timestamp,
            passwordHash,
            passwordSalt
        )
        .run();

    return d1GetClient(
        env,
        client.id
    );
}

/* =========================================================
   CLIENT FIRST ACCESS
   ========================================================= */

async function setClientPassword(
    request,
    env,
    origin
) {
    const body =
        await readJson(request);

    const email =
        String(body.email || "")
            .trim()
            .toLowerCase();

    const password =
        String(body.password || "");

    if (!email || !password) {
        return json(
            {
                success: false,
                error:
                    "E-mail e senha são obrigatórios."
            },
            400,
            origin
        );
    }

    if (password.length < 8) {
        return json(
            {
                success: false,
                error:
                    "A senha deve ter pelo menos 8 caracteres."
            },
            400,
            origin
        );
    }

    const client =
        await env.V8_D1
            .prepare(
                `SELECT id,password_hash
                 FROM clients
                 WHERE LOWER(email)=LOWER(?)
                 AND status='active'
                 LIMIT 1`
            )
            .bind(email)
            .first();

    if (!client) {
        return json(
            {
                success: false,
                error:
                    "Cliente não encontrado."
            },
            404,
            origin
        );
    }

    if (client.password_hash) {
        return json(
            {
                success: false,
                error:
                    "Este cliente já possui uma senha. Use o login."
            },
            409,
            origin
        );
    }

    const passwordData =
        await hashPassword(password);

    const result =
        await env.V8_D1
            .prepare(
                `UPDATE clients
                 SET password_hash=?,
                     password_salt=?,
                     updated_at=?
                 WHERE id=?
                 AND (
                     password_hash=''
                     OR password_hash IS NULL
                 )`
            )
            .bind(
                passwordData.hash,
                passwordData.salt,
                now(),
                client.id
            )
            .run();

    if (
        !result.success ||
        !result.meta?.changes
    ) {
        return json(
            {
                success: false,
                error:
                    "Não foi possível criar a senha. Tente novamente."
            },
            409,
            origin
        );
    }

    return json(
        {
            success: true,
            message:
                "Senha criada com sucesso. Agora você já pode entrar."
        },
        200,
        origin
    );
}

/* =========================================================
   D1 PROJECTS
   ========================================================= */

async function d1GetProject(
    env,
    id
) {
    const row =
        await env.V8_D1
            .prepare(
                `SELECT *
                 FROM projects
                 WHERE id=?
                 AND deleted_at IS NULL`
            )
            .bind(id)
            .first();

    return rowToProject(row);
}

async function d1ListProjects(
    env,
    user = null
) {
    let result;

    if (user?.type === "client") {
        result =
            await env.V8_D1
                .prepare(
                    `SELECT *
                     FROM projects
                     WHERE client_id=?
                     AND deleted_at IS NULL
                     ORDER BY
                         project_order ASC,
                         created_at DESC`
                )
                .bind(user.sub)
                .all();
    } else {
        result =
            await env.V8_D1
                .prepare(
                    `SELECT *
                     FROM projects
                     WHERE deleted_at IS NULL
                     ORDER BY
                         project_order ASC,
                         created_at DESC`
                )
                .all();
    }

    return result.results.map(
        row => rowToProject(row)
    );
}

function projectConfig(project) {
    return {
        reviews: project.reviews,
        tracking: project.tracking,
        contact: project.contact,
        social: project.social,
        formspree: project.formspree,
        content: project.content,
        media: project.media,
        location: project.location,
        seo: project.seo,
        access: project.access,
        scripts: project.scripts
    };
}

async function d1CreateProject(
    env,
    project,
    clientId = null
) {
    const timestamp = now();

    await env.V8_D1
        .prepare(
            `INSERT INTO projects
            (
                id,
                client_id,
                name,
                status,
                project_order,
                site_url,
                config_json,
                metadata_json,
                created_at,
                updated_at
            )
            VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
            project.id,
            clientId,
            project.name,
            project.status,
            project.projectOrder,
            project.siteUrl,
            JSON.stringify(
                projectConfig(project)
            ),
            JSON.stringify({}),
            timestamp,
            timestamp
        )
        .run();

    return d1GetProject(
        env,
        project.id
    );
}

async function d1UpdateProject(
    env,
    id,
    data
) {
    const row =
        await env.V8_D1
            .prepare(
                `SELECT *
                 FROM projects
                 WHERE id=?
                 AND deleted_at IS NULL`
            )
            .bind(id)
            .first();

    if (!row) {
        return null;
    }

    const current =
        rowToProject(row);

    const project =
        normalizeProject(
            data,
            current
        );

    const clientId =
        data.clientId !== undefined
            ? data.clientId || null
            : row.client_id;

    await env.V8_D1
        .prepare(
            `UPDATE projects
             SET client_id=?,
                 name=?,
                 status=?,
                 project_order=?,
                 site_url=?,
                 config_json=?,
                 updated_at=?
             WHERE id=?`
        )
        .bind(
            clientId,
            project.name,
            project.status,
            project.projectOrder,
            project.siteUrl,
            JSON.stringify(
                projectConfig(project)
            ),
            now(),
            id
        )
        .run();

    return d1GetProject(
        env,
        id
    );
}

async function d1DeleteProject(
    env,
    id
) {
    const result =
        await env.V8_D1
            .prepare(
                `UPDATE projects
                 SET deleted_at=?,
                     updated_at=?
                 WHERE id=?`
            )
            .bind(
                now(),
                now(),
                id
            )
            .run();

    return result.success;
}

/* =========================================================
   D1 LEADS
   ========================================================= */

async function d1ListLeads(
    env,
    projectId
) {
    const result =
        await env.V8_D1
            .prepare(
                `SELECT *
                 FROM leads
                 WHERE project_id=?
                 ORDER BY created_at DESC`
            )
            .bind(projectId)
            .all();

    return result.results.map(
        rowToLead
    );
}

async function d1CreateLead(
    env,
    projectId,
    data
) {
    const project =
        await d1GetProject(
            env,
            projectId
        );

    if (!project) {
        return null;
    }

    const lead = {
        id: uuid(),
        projectId,
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        message: data.message || "",
        metadata: data.metadata || {},
        createdAt: now()
    };

    await env.V8_D1
        .prepare(
            `INSERT INTO leads
            (
                id,
                project_id,
                name,
                email,
                phone,
                message,
                metadata_json,
                created_at
            )
            VALUES (?,?,?,?,?,?,?,?)`
        )
        .bind(
            lead.id,
            lead.projectId,
            lead.name,
            lead.email,
            lead.phone,
            lead.message,
            JSON.stringify(
                lead.metadata
            ),
            lead.createdAt
        )
        .run();

    return lead;
}

/* =========================================================
   ACCESS CONTROL
   ========================================================= */

async function getProjectForUser(
    env,
    projectId,
    user
) {
    const project =
        await d1GetProject(
            env,
            projectId
        );

    if (!project) {
        return null;
    }

    if (
        user.type === "client" &&
        project.clientId !== user.sub
    ) {
        return null;
    }

    return project;
}

/* =========================================================
   LOGIN
   ========================================================= */

async function login(
    request,
    env,
    origin
) {
    const body =
        await readJson(request);

    /*
     * O login usa um único formulário.
     * Se o tipo não for enviado, tentamos primeiro
     * o administrador e, caso não seja, o cliente.
     */
    const type =
        String(body.type || "").trim().toLowerCase();

    if (type === "admin") {
        return adminLogin(
            body,
            env,
            origin
        );
    }

    if (type === "client") {
        return clientLogin(
            body,
            env,
            origin
        );
    }

    if (
        String(body.email || "").trim() ===
            String(env.ADMIN_EMAIL || "").trim() &&
        String(body.password || "") ===
            String(env.ADMIN_PASS || "")
    ) {
        return adminLogin(
            body,
            env,
            origin
        );
    }

    return clientLogin(
        body,
        env,
        origin
    );
}

async function adminLogin(
    body,
    env,
    origin
) {
    const email =
        String(body.email || "")
            .trim();

    const password =
        String(body.password || "");

    if (
        !email ||
        !password ||
        email !== env.ADMIN_EMAIL ||
        password !== env.ADMIN_PASS
    ) {
        return json(
            {
                success: false,
                error:
                    "Credenciais inválidas."
            },
            401,
            origin
        );
    }

    const token =
        await createToken(
            {
                sub:
                    env.ADMIN_EMAIL ||
                    "admin",
                type: "admin"
            },
            env
        );

    const expiresAt =
        Date.now() + TOKEN_TTL;

    return json(
        {
            success: true,
            token,
            expiresAt,
            type: "admin",
            user: {
                type: "admin",
                email:
                    env.ADMIN_EMAIL
            }
        },
        200,
        origin
    );
}

async function clientLogin(
    body,
    env,
    origin
) {
    const email =
        String(body.email || "")
            .trim()
            .toLowerCase();

    const password =
        String(body.password || "");

    if (!email || !password) {
        return json(
            {
                success: false,
                error:
                    "E-mail e senha são obrigatórios."
            },
            400,
            origin
        );
    }

    const client =
        await d1GetClientAuth(
            env,
            email
        );

    if (!client) {
        return json(
            {
                success: false,
                error:
                    "Credenciais inválidas."
            },
            401,
            origin
        );
    }

    const valid =
        await verifyPassword(
            password,
            client.password_hash,
            client.password_salt
        );

    if (!valid) {
        return json(
            {
                success: false,
                error:
                    "Credenciais inválidas."
            },
            401,
            origin
        );
    }

    await env.V8_D1
        .prepare(
            `UPDATE clients
             SET last_login_at=?,
                 updated_at=?
             WHERE id=?`
        )
        .bind(
            now(),
            now(),
            client.id
        )
        .run();

    const token =
        await createToken(
            {
                sub: client.id,
                type: "client"
            },
            env
        );

    const expiresAt =
        Date.now() + TOKEN_TTL;

    return json(
        {
            success: true,
            token,
            expiresAt,
            type: "client",
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                type: "client"
            }
        },
        200,
        origin
    );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function dashboardStats(
    env,
    origin
) {
    const [
        clients,
        projects,
        leads,
        byProject,
        recent
    ] = await Promise.all([
        env.V8_D1
            .prepare(
                `SELECT COUNT(*) AS total
                 FROM clients`
            )
            .first(),

        env.V8_D1
            .prepare(
                `SELECT COUNT(*) AS total
                 FROM projects
                 WHERE deleted_at IS NULL`
            )
            .first(),

        env.V8_D1
            .prepare(
                `SELECT COUNT(*) AS total
                 FROM leads`
            )
            .first(),

        env.V8_D1
            .prepare(
                `SELECT project_id,
                        COUNT(*) AS count,
                        MAX(created_at) AS latest
                 FROM leads
                 GROUP BY project_id`
            )
            .all(),

        env.V8_D1
            .prepare(
                `SELECT *
                 FROM leads
                 ORDER BY created_at DESC
                 LIMIT 5`
            )
            .all()
    ]);

    const leadsByProject = {};

    for (const row of byProject.results || []) {
        leadsByProject[row.project_id] = {
            count: row.count,
            latestCreatedAt: row.latest
        };
    }

    const totals = {
        clients: clients?.total || 0,
        projects: projects?.total || 0,
        leads: leads?.total || 0
    };

    return json(
        {
            success: true,
            stats: totals,
            totalClients: totals.clients,
            totalProjects: totals.projects,
            totalLeads: totals.leads,
            leadsByProject,
            recentLeads:
                (recent.results || []).map(
                    rowToLead
                )
        },
        200,
        origin
    );
}

/* =========================================================
   CLIENT API
   ========================================================= */

async function clientMe(
    env,
    user,
    origin
) {
    const client =
        await d1GetClient(
            env,
            user.sub
        );

    if (!client) {
        return json(
            {
                success: false,
                error:
                    "Cliente não encontrado."
            },
            404,
            origin
        );
    }

    const projects =
        await d1ListProjects(
            env,
            user
        );

    return json(
        {
            success: true,
            client,
            projects
        },
        200,
        origin
    );
}

async function updateClientProfile(
    request,
    env,
    user,
    origin
) {
    const body =
        await readJson(request);

    const current =
        await env.V8_D1
            .prepare(
                "SELECT * FROM clients WHERE id=?"
            )
            .bind(user.sub)
            .first();

    if (!current) {
        return json(
            {
                success: false,
                error:
                    "Cliente não encontrado."
            },
            404,
            origin
        );
    }

    const name =
        body.name !== undefined
            ? String(body.name).trim()
            : current.name;

    const phone =
        body.phone !== undefined
            ? String(body.phone).trim()
            : current.phone;

    const password =
        body.password !== undefined &&
        body.password !== null
            ? String(body.password)
            : "";

    if (
        password &&
        password.length < 8
    ) {
        return json(
            {
                success: false,
                error:
                    "A senha deve ter pelo menos 8 caracteres."
            },
            400,
            origin
        );
    }

    if (password) {
        const passwordData =
            await hashPassword(
                password
            );

        await env.V8_D1
            .prepare(
                `UPDATE clients
                 SET name=?,
                     phone=?,
                     password_hash=?,
                     password_salt=?,
                     updated_at=?
                 WHERE id=?`
            )
            .bind(
                name,
                phone,
                passwordData.hash,
                passwordData.salt,
                now(),
                user.sub
            )
            .run();
    } else {
        await env.V8_D1
            .prepare(
                `UPDATE clients
                 SET name=?,
                     phone=?,
                     updated_at=?
                 WHERE id=?`
            )
            .bind(
                name,
                phone,
                now(),
                user.sub
            )
            .run();
    }

    return clientMe(
        env,
        user,
        origin
    );
}

/* =========================================================
   ADMIN — CLIENTS
   ========================================================= */

async function adminClients(
    request,
    env,
    origin
) {
    const method =
        request.method;

    if (method === "GET") {
        return json(
            {
                success: true,
                clients:
                    await d1ListClients(
                        env
                    )
            },
            200,
            origin
        );
    }

    if (method === "POST") {
        const body =
            await readJson(request);

        const client =
            normalizeClient(body);

        if (
            !client.name ||
            !client.email
        ) {
            return json(
                {
                    success: false,
                    error:
                        "Nome e e-mail são obrigatórios."
                },
                400,
                origin
            );
        }

        const exists =
            await env.V8_D1
                .prepare(
                    `SELECT id
                     FROM clients
                     WHERE LOWER(email)=LOWER(?)
                     LIMIT 1`
                )
                .bind(client.email)
                .first();

        if (exists) {
            return json(
                {
                    success: false,
                    error:
                        "Já existe um cliente com este e-mail."
                },
                409,
                origin
            );
        }

        const password =
            body.password
                ? String(body.password)
                : "";

        if (
            password &&
            password.length < 8
        ) {
            return json(
                {
                    success: false,
                    error:
                        "A senha deve ter pelo menos 8 caracteres."
                },
                400,
                origin
            );
        }

        const created =
            await d1CreateClient(
                env,
                client,
                password
            );

        if (body.projectId) {
            await env.V8_D1
                .prepare(
                    `UPDATE projects
                     SET client_id=?,
                         updated_at=?
                     WHERE id=?`
                )
                .bind(
                    client.id,
                    now(),
                    body.projectId
                )
                .run();
        }

        return json(
            {
                success: true,
                client: created
            },
            201,
            origin
        );
    }

    if (method === "PUT") {
        const body =
            await readJson(request);

        const id = body.id;

        if (!id) {
            return json(
                {
                    success: false,
                    error:
                        "ID do cliente é obrigatório."
                },
                400,
                origin
            );
        }

        const current =
            await env.V8_D1
                .prepare(
                    "SELECT * FROM clients WHERE id=?"
                )
                .bind(id)
                .first();

        if (!current) {
            return json(
                {
                    success: false,
                    error:
                        "Cliente não encontrado."
                },
                404,
                origin
            );
        }

        const client =
            normalizeClient(
                body,
                rowToClient(current)
            );

        const duplicate =
            await env.V8_D1
                .prepare(
                    `SELECT id
                     FROM clients
                     WHERE LOWER(email)=LOWER(?)
                     AND id<>?
                     LIMIT 1`
                )
                .bind(
                    client.email,
                    id
                )
                .first();

        if (duplicate) {
            return json(
                {
                    success: false,
                    error:
                        "O e-mail já pertence a outro cliente."
                },
                409,
                origin
            );
        }

        const password =
            body.password !== undefined &&
            body.password !== null
                ? String(body.password)
                : "";

        if (
            password &&
            password.length < 8
        ) {
            return json(
                {
                    success: false,
                    error:
                        "A senha deve ter pelo menos 8 caracteres."
                },
                400,
                origin
            );
        }

        if (password) {
            const passwordData =
                await hashPassword(
                    password
                );

            await env.V8_D1
                .prepare(
                    `UPDATE clients
                     SET name=?,
                         email=?,
                         phone=?,
                         legacy_project_id=?,
                         status=?,
                         metadata_json=?,
                         password_hash=?,
                         password_salt=?,
                         updated_at=?
                     WHERE id=?`
                )
                .bind(
                    client.name,
                    client.email,
                    client.phone,
                    client.legacyProjectId,
                    client.status,
                    JSON.stringify(
                        client.metadata
                    ),
                    passwordData.hash,
                    passwordData.salt,
                    now(),
                    id
                )
                .run();
        } else {
            await env.V8_D1
                .prepare(
                    `UPDATE clients
                     SET name=?,
                         email=?,
                         phone=?,
                         legacy_project_id=?,
                         status=?,
                         metadata_json=?,
                         updated_at=?
                     WHERE id=?`
                )
                .bind(
                    client.name,
                    client.email,
                    client.phone,
                    client.legacyProjectId,
                    client.status,
                    JSON.stringify(
                        client.metadata
                    ),
                    now(),
                    id
                )
                .run();
        }

        if (body.projectId) {
            await env.V8_D1
                .prepare(
                    `UPDATE projects
                     SET client_id=?,
                         updated_at=?
                     WHERE id=?`
                )
                .bind(
                    id,
                    now(),
                    body.projectId
                )
                .run();
        }

        return json(
            {
                success: true,
                client:
                    await d1GetClient(
                        env,
                        id
                    )
            },
            200,
            origin
        );
    }

    if (method === "DELETE") {
        const body =
            await readJson(request);

        const id =
            body.id ||
            new URL(request.url)
                .searchParams
                .get("id");

        if (!id) {
            return json(
                {
                    success: false,
                    error:
                        "ID do cliente é obrigatório."
                },
                400,
                origin
            );
        }

        await env.V8_D1
            .prepare(
                "DELETE FROM clients WHERE id=?"
            )
            .bind(id)
            .run();

        return json(
            {
                success: true
            },
            200,
            origin
        );
    }

    return json(
        {
            success: false,
            error:
                "Método não permitido."
        },
        405,
        origin
    );
}

/* =========================================================
   ADMIN — PROJECTS
   ========================================================= */

async function adminProjects(
    request,
    env,
    origin
) {
    if (request.method === "GET") {
        return json(
            {
                success: true,
                projects:
                    await d1ListProjects(
                        env
                    )
            },
            200,
            origin
        );
    }

    if (request.method === "POST") {
        const body =
            await readJson(request);

        const project =
            normalizeProject(body);

        const created =
            await d1CreateProject(
                env,
                project,
                body.clientId || null
            );

        return json(
            {
                success: true,
                project: created
            },
            201,
            origin
        );
    }

    if (request.method === "PUT") {
        const body =
            await readJson(request);

        if (!body.id) {
            return json(
                {
                    success: false,
                    error:
                        "ID do projeto é obrigatório."
                },
                400,
                origin
            );
        }

        const project =
            await d1UpdateProject(
                env,
                body.id,
                body
            );

        if (!project) {
            return json(
                {
                    success: false,
                    error:
                        "Projeto não encontrado."
                },
                404,
                origin
            );
        }

        return json(
            {
                success: true,
                project
            },
            200,
            origin
        );
    }

    if (request.method === "DELETE") {
        const body =
            await readJson(request);

        const id =
            body.id ||
            new URL(request.url)
                .searchParams
                .get("id");

        if (!id) {
            return json(
                {
                    success: false,
                    error:
                        "ID do projeto é obrigatório."
                },
                400,
                origin
            );
        }

        await d1DeleteProject(
            env,
            id
        );

        return json(
            {
                success: true
            },
            200,
            origin
        );
    }

    return json(
        {
            success: false,
            error:
                "Método não permitido."
        },
        405,
        origin
    );
}

/* =========================================================
   PUBLIC CONFIG
   ========================================================= */

async function publicConfig(
    env,
    projectId,
    origin
) {
    const project =
        await d1GetProject(
            env,
            projectId
        );

    if (!project) {
        return json(
            {
                success: false,
                error:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    const publicProject = {
        ...project
    };

    delete publicProject.clientId;
    delete publicProject.createdAt;
    delete publicProject.updatedAt;
    delete publicProject.metadata;
    delete publicProject.deletedAt;

    return json(
        {
            success: true,
            project: publicProject
        },
        200,
        origin
    );
}

/* =========================================================
   GOOGLE REVIEWS
   ========================================================= */

async function publicGoogleReviews(
    env,
    projectId,
    origin
) {
    const project =
        await d1GetProject(
            env,
            projectId
        );

    if (!project) {
        return json(
            {
                success: false,
                error:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    if (
        !project.reviews?.enabled ||
        !project.reviews?.placeId
    ) {
        return json(
            {
                success: true,
                enabled: false,
                rating: null,
                totalReviews: 0,
                reviews: []
            },
            200,
            origin
        );
    }

    const cacheKey =
        `google_reviews:${projectId}`;

    const cached =
        await env.V8_KV.get(
            cacheKey,
            "json"
        );

    if (cached) {
        return json(
            {
                success: true,
                ...cached
            },
            200,
            origin
        );
    }

    if (!env.GOOGLE_PLACES_API_KEY) {
        return json(
            {
                success: false,
                error:
                    "Google Places API não configurada."
            },
            500,
            origin
        );
    }

    const url = new URL(
        "https://maps.googleapis.com/maps/api/place/details/json"
    );

    url.searchParams.set(
        "place_id",
        project.reviews.placeId
    );

    url.searchParams.set(
        "fields",
        "rating,user_ratings_total,reviews"
    );

    url.searchParams.set(
        "language",
        "pt-BR"
    );

    url.searchParams.set(
        "key",
        env.GOOGLE_PLACES_API_KEY
    );

    const response =
        await fetch(url);

    if (!response.ok) {
        return json(
            {
                success: false,
                error:
                    "Falha ao consultar Google Places."
            },
            502,
            origin
        );
    }

    const data =
        await response.json();

    if (data.status !== "OK") {
        return json(
            {
                success: false,
                error:
                    data.error_message ||
                    `Google Places: ${data.status}`
            },
            502,
            origin
        );
    }

    const result =
        data.result || {};

    const payload = {
        enabled: true,

        rating:
            result.rating || 0,

        totalReviews:
            result.user_ratings_total || 0,

        reviews:
            (result.reviews || [])
                .slice(0, 5)
                .map(review => ({
                    author:
                        review.author_name ||
                        "",

                    rating:
                        review.rating ||
                        0,

                    text:
                        review.text ||
                        "",

                    relativeTime:
                        review.relative_time_description ||
                        "",

                    profilePhoto:
                        review.profile_photo_url ||
                        ""
                }))
    };

    await env.V8_KV.put(
        cacheKey,
        JSON.stringify(payload),
        {
            expirationTtl:
                GOOGLE_REVIEWS_CACHE_TTL
        }
    );

    return json(
        {
            success: true,
            ...payload
        },
        200,
        origin
    );
}

/* =========================================================
   PUBLIC LEADS
   ========================================================= */

async function publicLead(
    request,
    env,
    projectId,
    origin
) {
    const body =
        await readJson(request);

    const project =
        await d1GetProject(
            env,
            projectId
        );

    if (!project) {
        return json(
            {
                success: false,
                error:
                    "Projeto não encontrado."
            },
            404,
            origin
        );
    }

    if (
        !body.name &&
        !body.email &&
        !body.phone &&
        !body.message
    ) {
        return json(
            {
                success: false,
                error:
                    "Envie pelo menos um dado do contato."
            },
            400,
            origin
        );
    }

    const lead =
        await d1CreateLead(
            env,
            projectId,
            body
        );

    return json(
        {
            success: true,
            lead: {
                id: lead.id,
                createdAt:
                    lead.createdAt
            }
        },
        201,
        origin
    );
}

/* =========================================================
   MIGRATION KV → D1
   ========================================================= */

async function migrateKvToD1(
    env,
    origin
) {
    const previous =
        await env.V8_KV.get(
            MIGRATION_KEY,
            "json"
        );

    if (previous) {
        return json(
            {
                success: true,
                alreadyMigrated: true,
                result: previous
            },
            200,
            origin
        );
    }

    const clients =
        (await env.V8_KV.get(
            KEYS.clients,
            "json"
        )) || [];

    const projects =
        (await env.V8_KV.get(
            KEYS.projects,
            "json"
        )) || [];

    const leads =
        (await env.V8_KV.get(
            KEYS.leads,
            "json"
        )) || [];

    const statements = [];

    for (const client of clients) {
        const normalized =
            normalizeClient(client);

        statements.push(
            env.V8_D1
                .prepare(
                    `INSERT OR IGNORE INTO clients
                    (
                        id,
                        name,
                        email,
                        phone,
                        legacy_project_id,
                        status,
                        metadata_json,
                        created_at,
                        updated_at,
                        password_hash,
                        password_salt
                    )
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
                )
                .bind(
                    normalized.id,
                    normalized.name,
                    normalized.email,
                    normalized.phone,
                    normalized.legacyProjectId,
                    normalized.status,
                    JSON.stringify(
                        normalized.metadata
                    ),
                    client.createdAt ||
                        now(),
                    client.updatedAt ||
                        now(),
                    "",
                    ""
                )
        );
    }

    for (const item of projects) {
        const project =
            normalizeProject(item);

        let clientId =
            item.clientId || null;

        if (!clientId) {
            const owner =
                clients.find(
                    client =>
                        client.projectId ===
                            project.id ||
                        client.legacyProjectId ===
                            project.id
                );

            if (owner) {
                clientId = owner.id;
            }
        }

        statements.push(
            env.V8_D1
                .prepare(
                    `INSERT OR IGNORE INTO projects
                    (
                        id,
                        client_id,
                        name,
                        status,
                        project_order,
                        site_url,
                        config_json,
                        metadata_json,
                        created_at,
                        updated_at
                    )
                    VALUES (?,?,?,?,?,?,?,?,?,?)`
                )
                .bind(
                    project.id,
                    clientId,
                    project.name,
                    project.status,
                    project.projectOrder,
                    project.siteUrl,
                    JSON.stringify(
                        projectConfig(project)
                    ),
                    JSON.stringify({}),
                    project.createdAt,
                    project.updatedAt
                )
        );
    }

    for (const item of leads) {
        if (!item.projectId) {
            continue;
        }

        statements.push(
            env.V8_D1
                .prepare(
                    `INSERT OR IGNORE INTO leads
                    (
                        id,
                        project_id,
                        name,
                        email,
                        phone,
                        message,
                        metadata_json,
                        created_at
                    )
                    VALUES (?,?,?,?,?,?,?,?)`
                )
                .bind(
                    item.id || uuid(),
                    item.projectId,
                    item.name || "",
                    item.email || "",
                    item.phone || "",
                    item.message || "",
                    JSON.stringify(
                        item.metadata || {}
                    ),
                    item.createdAt ||
                        now()
                )
        );
    }

    for (
        let index = 0;
        index < statements.length;
        index += 50
    ) {
        const batch =
            statements.slice(
                index,
                index + 50
            );

        await env.V8_D1.batch(
            batch
        );
    }

    const summary = {
        clients: clients.length,
        projects: projects.length,
        leads: leads.length,
        statements:
            statements.length
    };

    await env.V8_KV.put(
        MIGRATION_KEY,
        JSON.stringify(summary)
    );

    return json(
        {
            success: true,
            migrated: summary
        },
        200,
        origin
    );
}

/* =========================================================
   API INFO
   ========================================================= */

function apiInfo(origin) {
    return json(
        {
            success: true,
            name:
                "V8 Admin Universal API",
            version: "1.0.0",
            status: "online",

            architecture: {
                database:
                    "Cloudflare D1",

                cache:
                    "Cloudflare KV",

                reviews:
                    "Google Places API",

                storage:
                    "Cloudflare R2 - futuro",

                ai:
                    "futuro"
            },

            endpoints: {
                login:
                    "POST /api/login",

                firstAccess:
                    "POST /api/client/set-password",

                dashboard:
                    "GET /api/dashboard/stats",

                clients:
                    "/api/data/clients",

                projects:
                    "/api/data/projects",

                leads:
                    "/api/data/leads/:projectId",

                clientMe:
                    "GET /api/client/me",

                clientProfile:
                    "PUT /api/client/profile",

                publicConfig:
                    "GET /api/public/config/:projectId",

                publicLeads:
                    "POST /api/public/leads/:projectId",

                publicReviews:
                    "GET /api/public/reviews/:projectId"
            }
        },
        200,
        origin
    );
}

/* =========================================================
   ROUTER
   ========================================================= */

async function router(
    request,
    env
) {
    const origin =
        cors(request);

    const url =
        new URL(request.url);

    const path =
        url.pathname;

    const method =
        request.method;

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
                        "GET, POST, PUT, DELETE, OPTIONS"
                }
            }
        );
    }

    if (path === "/") {
        return json(
            {
                success: true,
                service:
                    "V8 Admin Universal",
                status: "online"
            },
            200,
            origin
        );
    }

    if (path === "/api") {
        return apiInfo(origin);
    }

    if (
        path === "/api/login" &&
        method === "POST"
    ) {
        return login(
            request,
            env,
            origin
        );
    }

    /*
     * PRIMEIRO ACESSO DO CLIENTE
     *
     * Esta rota precisa ficar antes do requireAuth,
     * pois o cliente ainda não possui senha/token.
     */

    if (
        path === "/api/client/set-password" &&
        method === "POST"
    ) {
        return setClientPassword(
            request,
            env,
            origin
        );
    }

    /* =====================================================
       PUBLIC
       ===================================================== */

    let match =
        path.match(
            ROUTES.publicConfig
        );

    if (
        match &&
        method === "GET"
    ) {
        return publicConfig(
            env,
            match[1],
            origin
        );
    }

    match =
        path.match(
            ROUTES.publicReviews
        );

    if (
        match &&
        method === "GET"
    ) {
        return publicGoogleReviews(
            env,
            match[1],
            origin
        );
    }

    match =
        path.match(
            ROUTES.publicLeads
        );

    if (
        match &&
        method === "POST"
    ) {
        return publicLead(
            request,
            env,
            match[1],
            origin
        );
    }

    /* =====================================================
       AUTH
       ===================================================== */

    const auth =
        await requireAuth(
            request,
            env,
            origin
        );

    if (auth.response) {
        return auth.response;
    }

    const user =
        auth.user;

    /* =====================================================
       CLIENT
       ===================================================== */

    if (
        path === "/api/client/me" &&
        method === "GET"
    ) {
        if (user.type !== "client") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao cliente."
                },
                403,
                origin
            );
        }

        return clientMe(
            env,
            user,
            origin
        );
    }

    if (
        path === "/api/client/profile" &&
        (
            method === "PUT" ||
            method === "POST"
        )
    ) {
        if (user.type !== "client") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao cliente."
                },
                403,
                origin
            );
        }

        return updateClientProfile(
            request,
            env,
            user,
            origin
        );
    }

    /* =====================================================
       CLIENT — EDITAR PROJETO (somente campos liberados)
       ===================================================== */

    const clientProjectMatch =
        path.match(
            /^\/api\/client\/projects\/([^/]+)$/
        );

    if (
        clientProjectMatch &&
        (
            method === "PUT" ||
            method === "POST"
        )
    ) {
        if (user.type !== "client") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao cliente."
                },
                403,
                origin
            );
        }

        return clientUpdateProject(
            request,
            env,
            user,
            decodeURIComponent(
                clientProjectMatch[1]
            ),
            origin
        );
    }

    /* =====================================================
       PROJECT LIST
       ===================================================== */

    if (
        path === "/api/data/projects" &&
        method === "GET"
    ) {
        return json(
            {
                success: true,
                projects:
                    await d1ListProjects(
                        env,
                        user
                    )
            },
            200,
            origin
        );
    }

    /* =====================================================
       PROJECT ITEM
       ===================================================== */

    match =
        path.match(
            ROUTES.project
        );

    if (match) {
        const projectId =
            match[1];

        if (user.type === "client") {
            if (method !== "GET") {
                return json(
                    {
                        success: false,
                        error:
                            "Acesso negado."
                    },
                    403,
                    origin
                );
            }

            const project =
                await getProjectForUser(
                    env,
                    projectId,
                    user
                );

            if (!project) {
                return json(
                    {
                        success: false,
                        error:
                            "Projeto não encontrado."
                    },
                    404,
                    origin
                );
            }

            return json(
                {
                    success: true,
                    project
                },
                200,
                origin
            );
        }

        if (user.type === "admin") {
            if (method === "GET") {
                const project =
                    await d1GetProject(
                        env,
                        projectId
                    );

                if (!project) {
                    return json(
                        {
                            success: false,
                            error:
                                "Projeto não encontrado."
                        },
                        404,
                        origin
                    );
                }

                return json(
                    {
                        success: true,
                        project
                    },
                    200,
                    origin
                );
            }

            if (method === "DELETE") {
                await d1DeleteProject(
                    env,
                    projectId
                );

                return json(
                    {
                        success: true
                    },
                    200,
                    origin
                );
            }
        }
    }

    /* =====================================================
       LEADS
       ===================================================== */

    match =
        path.match(
            ROUTES.leads
        );

    if (
        match &&
        method === "GET"
    ) {
        const projectId =
            match[1];

        const project =
            await getProjectForUser(
                env,
                projectId,
                user
            );

        if (!project) {
            return json(
                {
                    success: false,
                    error:
                        "Acesso negado."
                },
                403,
                origin
            );
        }

        return json(
            {
                success: true,
                leads:
                    await d1ListLeads(
                        env,
                        projectId
                    )
            },
            200,
            origin
        );
    }

    /* =====================================================
       ADMIN
       ===================================================== */

    if (
        path === "/api/data/leads" &&
        method === "GET"
    ) {
        if (user.type !== "admin") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao administrador."
                },
                403,
                origin
            );
        }

        const result =
            await env.V8_D1
                .prepare(
                    `SELECT leads.*,
                            projects.name AS project_name
                     FROM leads
                     LEFT JOIN projects
                         ON projects.id = leads.project_id
                     ORDER BY leads.created_at DESC
                     LIMIT 500`
                )
                .all();

        return json(
            {
                success: true,
                leads:
                    (result.results || []).map(
                        row => ({
                            ...rowToLead(row),
                            projectName:
                                row.project_name || ""
                        })
                    )
            },
            200,
            origin
        );
    }

    if (
        path === "/api/dashboard/stats" &&
        method === "GET"
    ) {
        if (user.type !== "admin") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao administrador."
                },
                403,
                origin
            );
        }

        return dashboardStats(
            env,
            origin
        );
    }

    if (
        path === "/api/data/clients"
    ) {
        if (user.type !== "admin") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao administrador."
                },
                403,
                origin
            );
        }

        return adminClients(
            request,
            env,
            origin
        );
    }

    if (
        path === "/api/data/projects" &&
        user.type === "admin"
    ) {
        return adminProjects(
            request,
            env,
            origin
        );
    }

    if (
        path === "/api/admin/migrate-kv-to-d1" &&
        method === "POST"
    ) {
        if (user.type !== "admin") {
            return json(
                {
                    success: false,
                    error:
                        "Acesso restrito ao administrador."
                },
                403,
                origin
            );
        }

        return migrateKvToD1(
            env,
            origin
        );
    }

    return json(
        {
            success: false,
            error:
                "Rota não encontrada."
        },
        404,
        origin
    );
}

/* =========================================================
   WORKER
   ========================================================= */

export default {
    async fetch(request, env) {
        try {
            return await router(
                request,
                env
            );
        } catch (error) {
            console.error(
                "V8 Admin Universal Error:",
                error
            );

            return json(
                {
                    success: false,
                    error:
                        "Erro interno do servidor."
                },
                500,
                cors(request)
            );
        }
    }
};
