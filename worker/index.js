const TOKEN_TTL = 24 * 60 * 60 * 1000;
const GOOGLE_REVIEWS_CACHE_TTL = 86400;
const MIGRATION_KEY = "d1:migration:v2";

const KEYS = {
    clients: "data:clients",
    projects: "data:projects",
    leads: "data:leads",
    products: "data:products"
};

/* =========================================================
   RELAÇÃO CLIENTE ↔ PROJETO (N:N)
   Mantém client_id em projects para compatibilidade legada,
   mas usa client_project como fonte de autorização quando disponível.
========================================================= */
let clientProjectSchemaPromise = null;

async function ensureClientProjectRelation(env) {
    if (!env?.V8_D1) return false;
    if (!clientProjectSchemaPromise) {
        clientProjectSchemaPromise = env.V8_D1.prepare(`
            CREATE TABLE IF NOT EXISTS client_project (
                client_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                created_at TEXT NOT NULL,
                PRIMARY KEY (client_id, project_id),
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        `).run()
        .then(async () => {
            await env.V8_D1.prepare(`
                CREATE INDEX IF NOT EXISTS idx_client_project_project
                ON client_project(project_id)
            `).run();
            await env.V8_D1.prepare(`
                INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at)
                SELECT client_id, id, 'owner', COALESCE(created_at, ?)
                FROM projects
                WHERE client_id IS NOT NULL AND client_id <> ''
            `).bind(now()).run();
            return true;
        })
        .catch(error => {
            console.error('Falha ao preparar client_project:', error);
            clientProjectSchemaPromise = null;
            return false;
        });
    }
    return clientProjectSchemaPromise;
}


const ROUTES = {
    publicConfig: /^\/api\/public\/config\/([^/]+)$/,
    publicLeads: /^\/api\/public\/leads\/([^/]+)$/,
    publicReviews: /^\/api\/public\/reviews\/([^/]+)$/,
    project: /^\/api\/data\/projects\/([^/]+)$/,
    leads: /^\/api\/data\/leads\/([^/]+)$/ ,
    leadItem: /^\/api\/data\/leads\/([^/]+)\/([^/]+)$/,
    products: /^\/api\/data\/products\/([^/]+)$/,
    productItem: /^\/api\/data\/products\/([^/]+)\/([^/]+)$/
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

async function hmacSha256(value, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(String(secret || "")),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC", key, new TextEncoder().encode(value)
    );
    return new Uint8Array(signature);
}

async function verifyHmacSha256(value, signature, secret) {
    try {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(String(secret || "")),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );
        return await crypto.subtle.verify(
            "HMAC", key, signature, new TextEncoder().encode(value)
        );
    } catch {
        return false;
    }
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

    const signature = await hmacSha256(
        encoded,
        env.TOKEN_SECRET || ""
    );

    return `${encoded}.${bytesToBase64(signature)}`;
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

    let valid = false;
    try {
        valid = await verifyHmacSha256(
            encoded,
            base64ToBytes(signature),
            env.TOKEN_SECRET || ""
        );
    } catch {
        valid = false;
    }

    // Compatibilidade temporária com tokens da versão anterior.
    if (!valid) {
        const legacy = await sha256(`${encoded}.${env.TOKEN_SECRET || ""}`);
        valid = signature === legacy;
    }

    if (!valid) return null;

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
    tracking: [
        "pixel",
        "tag",
        "analytics"
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
    media: [
        "galleryEnabled",
        "galleryImages",
        "videoEnabled",
        "video"
    ],
    location: [
        "enabled",
        "address",
        "mapsUrl",
        "embed"
    ],
    reviews: [
        "enabled",
        "placeId"
    ],
    seo: [
        "title",
        "description",
        "ogImage",
        "canonical",
        "keywords",
        "robots"
    ],
    scripts: [
        "head",
        "body",
        "footer"
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

const CLIENT_ACCESS_MODULES = new Set([
    "configuracao",
    "content",
    "media",
    "location",
    "reviews",
    "seo",
    "scripts",
    "leads",
    "ecommerce"
]);

function sanitizeAccess(access) {
    const list = Array.isArray(access?.editable) ? access.editable : [];
    const legacy = list.some(item => ["page", "site", "loja"].includes(item));
    const normalized = legacy
        ? [
            ...(list.some(item => ["page", "site", "loja"].includes(item)) ? ["configuracao", "content"] : []),
            ...(list.some(item => ["site", "loja"].includes(item)) ? ["media", "location", "reviews", "seo", "scripts", "leads"] : [])
          ]
        : list.filter(item => CLIENT_ACCESS_MODULES.has(item));
    return { editable: [...new Set(normalized)], configured: access?.configured === true };
}

function expandClientAccess(access) {
    const sanitized = sanitizeAccess(access);
    const expanded = new Set();
    const modules = (!sanitized.configured && !sanitized.editable.length)
        ? new Set(CLIENT_ACCESS_MODULES)
        : new Set(sanitized.editable);
    if (modules.has("configuracao")) ["name", "status", "siteUrl", "tracking", "contact", "social", "formspree"].forEach(v => expanded.add(v));
    if (modules.has("content")) expanded.add("content");
    if (modules.has("media")) expanded.add("media");
    if (modules.has("location")) expanded.add("location");
    if (modules.has("reviews")) expanded.add("reviews");
    if (modules.has("seo")) expanded.add("seo");
    if (modules.has("scripts")) expanded.add("scripts");
    if (modules.has("leads")) expanded.add("leads");
    if (modules.has("ecommerce")) expanded.add("ecommerce");
    return expanded;
}

function hasClientModuleAccess(project, module) {
    const access = sanitizeAccess(project?.access);
    if (!access.configured && !access.editable.length) return true;
    return access.editable.includes(module);
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
        expandClientAccess(project.access);

    const body =
        await readJson(request);

    const changes = {};
    let applied = 0;
    let blocked = 0;

    /* Campos de nível do projeto. */
    for (const field of CLIENT_ROOT_FIELDS) {
        if (!(field in body)) continue;

        const allowed =
            editable.has(field);

        if (!allowed) {
            blocked++;
            continue;
        }

        let value = String(body[field] ?? "")
            .trim()
            .slice(0, 5000);

        if (field === "siteUrl" && value && !/^https?:\/\//i.test(value)) {
            return json({
                success: false,
                error: "Informe um link começando com http:// ou https://."
            }, 400, origin);
        }

        changes[field] = value;
        applied++;
    }

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

            const module = section === "tracking" || section === "contact" || section === "social" ? "configuracao" : section;
            const allowed = editable.has(module) || editable.has(path);

            if (!allowed) {
                blocked++;
                continue;
            }

            let value;

            if (
                (section === "location" && field === "enabled") ||
                (section === "reviews" && field === "enabled") ||
                (section === "media" && (field === "galleryEnabled" || field === "videoEnabled"))
            ) {
                value = !!incoming[field];
            } else if (section === "media" && field === "galleryImages") {
                value = Array.isArray(incoming[field])
                    ? incoming[field].map(v => String(v ?? "").trim()).filter(Boolean).slice(0, 100)
                    : [];
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

function sanitizeEcommerce(input) {
    const ec = input && typeof input === "object" ? input : {};
    const mp = ec.mercadoPago && typeof ec.mercadoPago === "object" ? ec.mercadoPago : {};
    const ip = ec.infinitePay && typeof ec.infinitePay === "object" ? ec.infinitePay : {};
    const pickup = ec.pickup && typeof ec.pickup === "object" ? ec.pickup : {};
    const shipping = Array.isArray(ec.shipping) ? ec.shipping : [];

    const validStates = new Set([
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
        "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
        "RS", "RO", "RR", "SC", "SP", "SE", "TO"
    ]);

    return {
        enabled: !!ec.enabled,
        originState: validStates.has(ec.originState) ? ec.originState : "",
        pickup: { enabled: !!pickup.enabled },
        mercadoPago: {
            enabled: !!mp.enabled,
            accessToken: String(mp.accessToken || "").trim().slice(0, 500),
            publicKey: String(mp.publicKey || "").trim().slice(0, 500)
        },
        infinitePay: {
            enabled: !!ip.enabled,
            handle: String(ip.handle || "").trim().slice(0, 200)
        },
        shipping: shipping.slice(0, 30).map(r => ({
            id: String(r?.id || uuid()).slice(0, 60),
            carrier: r?.carrier === "transportadora" ? "transportadora" : "correios",
            maxWeight: Math.max(0, Number(r?.maxWeight) || 0),
            sameState: Math.max(0, Number(r?.sameState) || 0),
            otherState: Math.max(0, Number(r?.otherState) || 0)
        }))
    };
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

    const ecommerce =
        sanitizeEcommerce(
            data.ecommerce ??
            existing.ecommerce ??
            {}
        );

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

        projectType: (() => {
            const value = String(data.projectType ?? existing.projectType ?? data.type ?? existing.type ?? "site").toLowerCase();
            if (value === "page") return "page";
            if (value === "loja" || value === "store") return "loja";
            return "site";
        })(),

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

        ecommerce,

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

    const metadata = parseJson(row.metadata_json, {});
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        message: row.message,
        metadata,
        status: metadata.status || "novo",
        source: metadata.source || "site",
        value: Number(metadata.value || 0),
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        notes: metadata.notes || "",
        nextContact: metadata.nextContact || "",
        assignedTo: metadata.assignedTo || "",
        activities: Array.isArray(metadata.activities) ? metadata.activities : [],
        createdAt: row.created_at
    };
}

/* =========================================================
   PRODUTOS (LOJA)
   ========================================================= */

function rowToProduct(row) {
    if (!row) return null;
    return {
        id: row.id, projectId: row.project_id, name: row.name,
        description: row.description || "", price: row.price == null ? null : Number(row.price),
        itemType: row.item_type || "product", categoryId: row.category_id || "",
        featured: !!row.featured, promotion: !!row.promotion,
        weight: Number(row.weight || 0), trackStock: !!row.track_stock,
        stock: Number(row.stock || 0), image: row.image || "", status: row.status || "active",
        order: Number(row.product_order || 0), createdAt: row.created_at, updatedAt: row.updated_at,
        tags: (() => { const t = parseJson(row.tags_json, []); return Array.isArray(t) ? t.map(String) : []; })()
    };
}

function sanitizeProductInput(data, current) {
    const base = current || {};
    const name = String(data.name ?? base.name ?? "").trim().slice(0, 200);
    const description = String(data.description ?? base.description ?? "").trim().slice(0, 5000);
    const image = String(data.image ?? base.image ?? "").trim().slice(0, 1000);
    const itemType = ["product","service","combo","package","plan","other"].includes(String(data.itemType ?? base.itemType ?? "product")) ? String(data.itemType ?? base.itemType ?? "product") : "product";
    const categoryId = String(data.categoryId ?? base.categoryId ?? "").trim().slice(0, 100);
    const rawPrice = data.price === null || data.price === "" ? null : (data.price ?? base.price);
    const price = rawPrice === null || rawPrice === undefined || rawPrice === "" ? null : Math.max(0, Number(rawPrice)) || 0;
    const weight = Math.max(0, Number(data.weight ?? base.weight ?? 0)) || 0;
    const stock = Math.max(0, Math.round(Number(data.stock ?? base.stock ?? 0))) || 0;
    const trackStock = "trackStock" in data ? !!data.trackStock : !!base.trackStock;
    const featured = "featured" in data ? !!data.featured : !!base.featured;
    const promotion = "promotion" in data ? !!data.promotion : !!base.promotion;
    const status = ["active", "inactive"].includes(data.status) ? data.status : (base.status || "active");
    const rawTags = "tags" in data ? data.tags : (base.tags || []);
    const tags = [...new Set((Array.isArray(rawTags) ? rawTags : []).map(t => String(t).trim().slice(0, 100)).filter(Boolean))].slice(0, 30);
    return { name, description, image, price, itemType, categoryId, featured, promotion, weight, stock, trackStock, status, tags };
}

async function d1ListProducts(env, projectId) {
    await ensureProductSchema(env);
    const result = await env.V8_D1
        .prepare(
            `SELECT * FROM products
             WHERE project_id=?
             ORDER BY product_order ASC, created_at ASC`
        )
        .bind(projectId)
        .all();

    return result.results.map(rowToProduct);
}

async function d1CreateProduct(env, projectId, data) {
    await ensureProductSchema(env);
    const clean = sanitizeProductInput(data, null);

    if (!clean.name) {
        return { error: "Informe o nome do produto." };
    }

    const countRow = await env.V8_D1
        .prepare(`SELECT COUNT(*) AS total FROM products WHERE project_id=?`)
        .bind(projectId)
        .first();

    const product = {
        id: uuid(),
        projectId,
        ...clean,
        order: Number(countRow?.total || 0),
        createdAt: now(),
        updatedAt: now()
    };

    await env.V8_D1
        .prepare(
            `INSERT INTO products
                (id, project_id, name, description, price, item_type, category_id, featured, promotion, weight,
                 track_stock, stock, image, status, product_order, created_at, updated_at, tags_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
            product.id, projectId, product.name, product.description, product.price, product.itemType, product.categoryId,
            product.featured ? 1 : 0, product.promotion ? 1 : 0, product.weight, product.trackStock ? 1 : 0,
            product.stock, product.image, product.status, product.order, product.createdAt, product.updatedAt,
            JSON.stringify(product.tags || [])
        )
        .run();

    return { product };
}

async function d1UpdateProduct(env, projectId, productId, data) {
    await ensureProductSchema(env);
    const row = await env.V8_D1
        .prepare(`SELECT * FROM products WHERE id=? AND project_id=? LIMIT 1`)
        .bind(productId, projectId)
        .first();

    if (!row) {
        return { error: "Produto não encontrado." };
    }

    const current = rowToProduct(row);
    const clean = sanitizeProductInput(data, current);

    if (!clean.name) {
        return { error: "Informe o nome do produto." };
    }

    await env.V8_D1
        .prepare(
            `UPDATE products SET
                name=?, description=?, price=?, item_type=?, category_id=?, featured=?, promotion=?, weight=?,
                track_stock=?, stock=?, image=?, status=?, updated_at=?, tags_json=?
             WHERE id=? AND project_id=?`
        )
        .bind(
            clean.name, clean.description, clean.price, clean.itemType, clean.categoryId, clean.featured ? 1 : 0, clean.promotion ? 1 : 0, clean.weight,
            clean.trackStock ? 1 : 0, clean.stock, clean.image, clean.status,
            now(), JSON.stringify(clean.tags || []), productId, projectId
        )
        .run();

    const updated = await env.V8_D1
        .prepare(`SELECT * FROM products WHERE id=? AND project_id=? LIMIT 1`)
        .bind(productId, projectId)
        .first();

    return { product: rowToProduct(updated) };
}

async function d1DeleteProduct(env, projectId, productId) {
    await ensureProductSchema(env);
    const result = await env.V8_D1
        .prepare(`DELETE FROM products WHERE id=? AND project_id=?`)
        .bind(productId, projectId)
        .run();

    return !!result.success && Number(result.meta?.changes || 0) > 0;
}

/* =========================================================
   CATÁLOGO / PAGAMENTOS
========================================================= */
let productSchemaReady = false;
async function ensureProductSchema(env) {
    if (productSchemaReady) return;
    const columns = await env.V8_D1.prepare(`PRAGMA table_info(products)`).all();
    const info = columns.results || [];
    const names = new Set(info.map(r=>r.name));
    const additions = [
      ["item_type", "TEXT NOT NULL DEFAULT 'product'"],
      ["category_id", "TEXT DEFAULT ''"],
      ["featured", "INTEGER NOT NULL DEFAULT 0"],
      ["promotion", "INTEGER NOT NULL DEFAULT 0"],
      ["tags_json", "TEXT NOT NULL DEFAULT '[]'"]
    ];
    for (const [name, definition] of additions) if (!names.has(name)) await env.V8_D1.prepare(`ALTER TABLE products ADD COLUMN ${name} ${definition}`).run();

    // Bancos antigos tinham price NOT NULL: impede "sob consulta" (preço vazio) e gera erro 500.
    const priceCol = info.find(r=>r.name === "price");
    if (priceCol && Number(priceCol.notnull) === 1) {
        const cols = "id, project_id, name, description, price, item_type, category_id, featured, promotion, weight, track_stock, stock, image, status, product_order, created_at, updated_at, tags_json";
        await env.V8_D1.batch([
            env.V8_D1.prepare(`DROP TABLE IF EXISTS products_new`),
            env.V8_D1.prepare(`CREATE TABLE products_new (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL DEFAULT NULL, item_type TEXT NOT NULL DEFAULT 'product', category_id TEXT DEFAULT '', featured INTEGER NOT NULL DEFAULT 0, promotion INTEGER NOT NULL DEFAULT 0, weight REAL NOT NULL DEFAULT 0, track_stock INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, image TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active', product_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]')`),
            env.V8_D1.prepare(`INSERT INTO products_new (${cols}) SELECT ${cols} FROM products`),
            env.V8_D1.prepare(`DROP TABLE products`),
            env.V8_D1.prepare(`ALTER TABLE products_new RENAME TO products`),
            env.V8_D1.prepare(`CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id)`),
            env.V8_D1.prepare(`CREATE INDEX IF NOT EXISTS idx_products_project_type ON products(project_id, item_type)`),
            env.V8_D1.prepare(`CREATE INDEX IF NOT EXISTS idx_products_project_category ON products(project_id, category_id)`)
        ]);
    }
    productSchemaReady = true;
}

let catalogSchemaReady = false;
async function ensureCatalogSchema(env) {
    if (catalogSchemaReady) return;
    await env.V8_D1.prepare(`CREATE TABLE IF NOT EXISTS catalog_categories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', category_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
    await env.V8_D1.prepare(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT DEFAULT '', customer_name TEXT DEFAULT '', customer_email TEXT DEFAULT '', description TEXT DEFAULT '', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'BRL', provider TEXT NOT NULL DEFAULT 'manual', provider_payment_id TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', due_date TEXT DEFAULT '', paid_at TEXT DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
    await env.V8_D1.prepare(`CREATE TABLE IF NOT EXISTS catalog_tags (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
    await env.V8_D1.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_tags_project ON catalog_tags(project_id)`).run();
    const catCols = await env.V8_D1.prepare(`PRAGMA table_info(catalog_categories)`).all();
    if (!(catCols.results || []).some(c => c.name === "parent_id")) {
        await env.V8_D1.prepare(`ALTER TABLE catalog_categories ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''`).run();
    }
    catalogSchemaReady = true;
}
function rowToTag(row) { return row ? { id:row.id, projectId:row.project_id, name:row.name, createdAt:row.created_at, updatedAt:row.updated_at } : null; }
function rowToCategory(row) { return row ? { id:row.id, projectId:row.project_id, name:row.name, parentId:row.parent_id||"", description:row.description||"", order:Number(row.category_order||0), createdAt:row.created_at, updatedAt:row.updated_at } : null; }
function rowToPayment(row) { return row ? { id:row.id, projectId:row.project_id, sourceType:row.source_type, sourceId:row.source_id||"", customerName:row.customer_name||"", customerEmail:row.customer_email||"", description:row.description||"", amount:Number(row.amount||0), currency:row.currency||"BRL", provider:row.provider||"manual", providerPaymentId:row.provider_payment_id||"", status:row.status||"pending", dueDate:row.due_date||"", paidAt:row.paid_at||"", metadata:parseJson(row.metadata_json,{}), createdAt:row.created_at, updatedAt:row.updated_at } : null; }
async function d1ListCategories(env, projectId) { await ensureCatalogSchema(env); const r=await env.V8_D1.prepare(`SELECT * FROM catalog_categories WHERE project_id=? ORDER BY category_order ASC, name ASC`).bind(projectId).all(); return (r.results||[]).map(rowToCategory); }
async function d1SaveCategory(env, projectId, data, id=null) {
    await ensureCatalogSchema(env);
    const name = String(data.name||"").trim().slice(0,120);
    if (!name) return {error:"Informe o nome da categoria."};
    const description = String(data.description||"").trim().slice(0,500);
    const nowValue = now();
    let parentId = String(data.parentId||"").trim().slice(0,100);
    if (parentId) {
        if (id && parentId === id) return {error:"Uma categoria não pode ser subcategoria dela mesma."};
        const parent = await env.V8_D1.prepare(`SELECT id, parent_id FROM catalog_categories WHERE id=? AND project_id=?`).bind(parentId,projectId).first();
        if (!parent) return {error:"Categoria pai não encontrada."};
        if (parent.parent_id) return {error:"Subcategorias só podem ficar dentro de uma categoria principal."};
        if (id) {
            const kids = await env.V8_D1.prepare(`SELECT COUNT(*) total FROM catalog_categories WHERE parent_id=? AND project_id=?`).bind(id,projectId).first();
            if (Number(kids?.total||0) > 0) return {error:"Esta categoria já tem subcategorias e não pode virar subcategoria."};
        }
    }
    if (id) {
        await env.V8_D1.prepare(`UPDATE catalog_categories SET name=?, description=?, parent_id=?, updated_at=? WHERE id=? AND project_id=?`).bind(name,description,parentId,nowValue,id,projectId).run();
        const row = await env.V8_D1.prepare(`SELECT * FROM catalog_categories WHERE id=? AND project_id=?`).bind(id,projectId).first();
        return {category:rowToCategory(row)};
    }
    const newId = uuid();
    const count = await env.V8_D1.prepare(`SELECT COUNT(*) total FROM catalog_categories WHERE project_id=?`).bind(projectId).first();
    await env.V8_D1.prepare(`INSERT INTO catalog_categories(id,project_id,name,description,parent_id,category_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(newId,projectId,name,description,parentId,Number(count?.total||0),nowValue,nowValue).run();
    return {category:rowToCategory(await env.V8_D1.prepare(`SELECT * FROM catalog_categories WHERE id=?`).bind(newId).first())};
}
async function d1DeleteCategory(env, projectId, id) { await ensureCatalogSchema(env); await ensureProductSchema(env); await env.V8_D1.prepare(`UPDATE products SET category_id='' WHERE project_id=? AND category_id=?`).bind(projectId,id).run(); await env.V8_D1.prepare(`UPDATE catalog_categories SET parent_id='' WHERE project_id=? AND parent_id=?`).bind(projectId,id).run(); const r=await env.V8_D1.prepare(`DELETE FROM catalog_categories WHERE id=? AND project_id=?`).bind(id,projectId).run(); return Number(r.meta?.changes||0)>0; }
async function d1ListTags(env, projectId) { await ensureCatalogSchema(env); const r=await env.V8_D1.prepare(`SELECT * FROM catalog_tags WHERE project_id=? ORDER BY name COLLATE NOCASE ASC`).bind(projectId).all(); return (r.results||[]).map(rowToTag); }
async function d1SaveTag(env, projectId, data, id=null) {
    await ensureCatalogSchema(env);
    const name = String(data.name||"").trim().slice(0,60);
    if (!name) return {error:"Informe o nome da tag."};
    const dup = await env.V8_D1.prepare(`SELECT id FROM catalog_tags WHERE project_id=? AND LOWER(name)=LOWER(?) AND id<>?`).bind(projectId,name,id||"").first();
    if (dup) return {error:"Já existe uma tag com esse nome.", tag: rowToTag(await env.V8_D1.prepare(`SELECT * FROM catalog_tags WHERE id=?`).bind(dup.id).first()), duplicate:true};
    const nowValue = now();
    if (id) {
        await env.V8_D1.prepare(`UPDATE catalog_tags SET name=?, updated_at=? WHERE id=? AND project_id=?`).bind(name,nowValue,id,projectId).run();
        return {tag:rowToTag(await env.V8_D1.prepare(`SELECT * FROM catalog_tags WHERE id=? AND project_id=?`).bind(id,projectId).first())};
    }
    const newId = uuid();
    await env.V8_D1.prepare(`INSERT INTO catalog_tags(id,project_id,name,created_at,updated_at) VALUES(?,?,?,?,?)`).bind(newId,projectId,name,nowValue,nowValue).run();
    return {tag:rowToTag(await env.V8_D1.prepare(`SELECT * FROM catalog_tags WHERE id=?`).bind(newId).first())};
}
async function d1DeleteTag(env, projectId, id) {
    await ensureCatalogSchema(env); await ensureProductSchema(env);
    const used = await env.V8_D1.prepare(`SELECT id, tags_json FROM products WHERE project_id=? AND tags_json LIKE ?`).bind(projectId, `%${id}%`).all();
    const stmts = [];
    for (const row of (used.results||[])) {
        const list = parseJson(row.tags_json, []);
        if (Array.isArray(list) && list.includes(id)) stmts.push(env.V8_D1.prepare(`UPDATE products SET tags_json=? WHERE id=? AND project_id=?`).bind(JSON.stringify(list.filter(t=>t!==id)),row.id,projectId));
    }
    if (stmts.length) await env.V8_D1.batch(stmts);
    const r = await env.V8_D1.prepare(`DELETE FROM catalog_tags WHERE id=? AND project_id=?`).bind(id,projectId).run();
    return Number(r.meta?.changes||0)>0;
}
async function d1ListPayments(env, projectId) { await ensureCatalogSchema(env); const r=await env.V8_D1.prepare(`SELECT * FROM payments WHERE project_id=? ORDER BY created_at DESC LIMIT 500`).bind(projectId).all(); return (r.results||[]).map(rowToPayment); }
async function d1CreatePayment(env, projectId, data) { await ensureCatalogSchema(env); const amount=Math.max(0,Number(data.amount)||0); if(!amount) return {error:"Informe um valor maior que zero."}; const id=uuid(), nowValue=now(); await env.V8_D1.prepare(`INSERT INTO payments(id,project_id,source_type,source_id,customer_name,customer_email,description,amount,currency,provider,provider_payment_id,status,due_date,paid_at,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,projectId,String(data.sourceType||"manual"),String(data.sourceId||""),String(data.customerName||""),String(data.customerEmail||""),String(data.description||""),amount,"BRL",String(data.provider||"manual"),String(data.providerPaymentId||""),["pending","paid","cancelled","refunded"].includes(data.status)?data.status:"pending",String(data.dueDate||""),String(data.paidAt||""),JSON.stringify(data.metadata||{}),nowValue,nowValue).run(); return {payment:rowToPayment(await env.V8_D1.prepare(`SELECT * FROM payments WHERE id=?`).bind(id).first())}; }

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

    const project = rowToProject(row);
    if (!project) return null;
    project.clientIds = project.clientId ? [project.clientId] : [];
    return project;
}

async function d1ListProjects(
    env,
    user = null
) {
    let result;

    if (user?.type === "client") {
        if (await ensureClientProjectRelation(env)) {
            try {
                result = await env.V8_D1.prepare(
                    `SELECT p.*
                     FROM projects p
                     INNER JOIN client_project cp ON cp.project_id=p.id
                     WHERE cp.client_id=?
                     AND p.deleted_at IS NULL
                     ORDER BY p.project_order ASC, p.created_at DESC`
                ).bind(user.sub).all();
            } catch (error) {
                console.error('Falha na consulta N:N; usando compatibilidade legada:', error);
                result = await env.V8_D1.prepare(
                    `SELECT * FROM projects WHERE client_id=? AND deleted_at IS NULL
                     ORDER BY project_order ASC, created_at DESC`
                ).bind(user.sub).all();
            }
        } else {
            result = await env.V8_D1.prepare(
                `SELECT * FROM projects WHERE client_id=? AND deleted_at IS NULL
                 ORDER BY project_order ASC, created_at DESC`
            ).bind(user.sub).all();
        }
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

    const projects = result.results.map(row => {
        const project = rowToProject(row);
        project.clientIds = project.clientId ? [project.clientId] : [];
        return project;
    });

    if (await ensureClientProjectRelation(env)) {
        try {
            const links = await env.V8_D1.prepare(
                `SELECT client_id, project_id FROM client_project`
            ).all();
            const byProject = new Map();
            for (const link of (links.results || [])) {
                if (!byProject.has(link.project_id)) byProject.set(link.project_id, []);
                byProject.get(link.project_id).push(link.client_id);
            }
            projects.forEach(project => {
                project.clientIds = byProject.get(project.id) || (project.clientId ? [project.clientId] : []);
            });
        } catch (error) {
            console.error('Falha ao carregar relações de clientes:', error);
        }
    }

    return projects;
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
        scripts: project.scripts,
        ecommerce: project.ecommerce
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

    if (clientId && await ensureClientProjectRelation(env)) {
        await env.V8_D1.prepare(
            `INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at) VALUES (?,?,?,?)`
        ).bind(clientId, project.id, 'owner', timestamp).run();
    }

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

    if (await ensureClientProjectRelation(env) && data.clientId !== undefined) {
        await env.V8_D1.prepare(`DELETE FROM client_project WHERE project_id=?`).bind(id).run();
        if (clientId) {
            await env.V8_D1.prepare(
                `INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at) VALUES (?,?,?,?)`
            ).bind(clientId, id, 'owner', now()).run();
        }
    }

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

    const metadata = { ...(data.metadata || {}) };
    for (const key of ["status", "source", "notes", "nextContact", "assignedTo"]) {
        if (key in data) metadata[key] = String(data[key] ?? "").trim().slice(0, 5000);
    }
    if ("value" in data) metadata.value = Math.max(0, Number(data.value || 0));
    if ("tags" in data) metadata.tags = Array.isArray(data.tags) ? data.tags.map(v => String(v).trim()).filter(Boolean).slice(0, 30) : [];
    const lead = {
        id: uuid(),
        projectId,
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        message: data.message || "",
        metadata,
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

async function d1UpdateLead(env, projectId, leadId, changes) {
    const row = await env.V8_D1.prepare(`SELECT * FROM leads WHERE id=? AND project_id=? LIMIT 1`).bind(leadId, projectId).first();
    if (!row) return null;
    const current = rowToLead(row);
    const metadata = { ...(current.metadata || {}) };
    for (const key of ["status", "source", "notes", "nextContact", "assignedTo"]) {
        if (key in changes) metadata[key] = String(changes[key] ?? "").trim().slice(0, 5000);
    }
    if ("value" in changes) metadata.value = Math.max(0, Number(changes.value || 0));
    if ("tags" in changes) metadata.tags = Array.isArray(changes.tags) ? changes.tags.map(v => String(v).trim()).filter(Boolean).slice(0, 30) : [];
    if (changes.activity) {
        metadata.activities = Array.isArray(metadata.activities) ? metadata.activities : [];
        const text = String(changes.activity.text || "").trim().slice(0, 2000);
        if (text) metadata.activities.unshift({ id: uuid(), type: String(changes.activity.type || "nota"), text, at: now() });
        metadata.activities = metadata.activities.slice(0, 100);
    }
    await env.V8_D1.prepare(`UPDATE leads SET metadata_json=? WHERE id=? AND project_id=?`).bind(JSON.stringify(metadata), leadId, projectId).run();
    const updated = await env.V8_D1.prepare(`SELECT * FROM leads WHERE id=? AND project_id=? LIMIT 1`).bind(leadId, projectId).first();
    return rowToLead(updated);
}

async function d1DeleteLead(env, projectId, leadId) {
    const result = await env.V8_D1.prepare(`DELETE FROM leads WHERE id=? AND project_id=?`).bind(leadId, projectId).run();
    return !!result.success && Number(result.meta?.changes || 0) > 0;
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

    if (user.type === "client") {
        if (await ensureClientProjectRelation(env)) {
            try {
                const link = await env.V8_D1.prepare(
                    `SELECT 1 FROM client_project WHERE client_id=? AND project_id=? LIMIT 1`
                ).bind(user.sub, projectId).first();
                if (!link) return null;
            } catch (error) {
                console.error('Falha na autorização N:N; usando compatibilidade legada:', error);
                if (project.clientId !== user.sub) return null;
            }
        } else if (project.clientId !== user.sub) {
            return null;
        }
    }

    return project;
}

/* =========================================================
   LOGIN
   ========================================================= */

async function checkLoginRateLimit(request, env) {
    if (!env?.V8_KV) return { allowed: true, key: null };
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    const digest = await sha256(ip);
    const key = `auth:login:${digest.slice(0, 32)}`;
    const nowMs = Date.now();
    const windowMs = 15 * 60 * 1000;
    const current = await env.V8_KV.get(key, "json");
    if (!current || Number(current.resetAt || 0) <= nowMs) {
        await env.V8_KV.put(key, JSON.stringify({ count: 0, resetAt: nowMs + windowMs }), { expirationTtl: 15 * 60 });
        return { allowed: true, key };
    }
    if (Number(current.count || 0) >= 5) {
        return { allowed: false, key, retryAfter: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)) };
    }
    return { allowed: true, key, current };
}

async function registerLoginFailure(env, rate) {
    if (!rate?.key || !env?.V8_KV) return;
    const current = rate.current || await env.V8_KV.get(rate.key, "json") || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    const count = Number(current.count || 0) + 1;
    await env.V8_KV.put(rate.key, JSON.stringify({ count, resetAt: current.resetAt }), { expirationTtl: Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000)) });
}

async function clearLoginFailures(env, rate) {
    if (rate?.key && env?.V8_KV) await env.V8_KV.delete(rate.key);
}

async function login(
    request,
    env,
    origin
) {
    const rate = await checkLoginRateLimit(request, env);
    if (!rate.allowed) {
        return json({ success: false, error: "Muitas tentativas de login. Tente novamente mais tarde.", retryAfter: rate.retryAfter }, 429, origin);
    }
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
        const response = await adminLogin(body, env, origin);
        if (response.status === 200) await clearLoginFailures(env, rate); else await registerLoginFailure(env, rate);
        return response;
    }

    if (type === "client") {
        const response = await clientLogin(body, env, origin);
        if (response.status === 200) await clearLoginFailures(env, rate); else await registerLoginFailure(env, rate);
        return response;
    }

    if (
        String(body.email || "").trim() ===
            String(env.ADMIN_EMAIL || "").trim() &&
        String(body.password || "") ===
            String(env.ADMIN_PASS || "")
    ) {
        const response = await adminLogin(body, env, origin);
        if (response.status === 200) await clearLoginFailures(env, rate); else await registerLoginFailure(env, rate);
        return response;
    }

    const response = await clientLogin(body, env, origin);
    if (response.status === 200) await clearLoginFailures(env, rate); else await registerLoginFailure(env, rate);
    return response;
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
        byProject
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
            leadsByProject
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
            if (await ensureClientProjectRelation(env)) {
                await env.V8_D1.prepare(
                    `INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at) VALUES (?,?,?,?)`
                ).bind(client.id, body.projectId, 'owner', now()).run();
            }
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
            if (await ensureClientProjectRelation(env)) {
                await env.V8_D1.prepare(
                    `INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at) VALUES (?,?,?,?)`
                ).bind(id, body.projectId, 'owner', now()).run();
            }
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
                `UPDATE projects SET client_id=NULL, updated_at=? WHERE client_id=?`
            )
            .bind(now(), id)
            .run();

        if (await ensureClientProjectRelation(env)) {
            await env.V8_D1.prepare(`DELETE FROM client_project WHERE client_id=?`).bind(id).run();
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
    await ensureProductSchema(env);
    await ensureCatalogSchema(env);
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

    const kvProducts = (await env.V8_KV.get(KEYS.products, "json")) || [];
    const embeddedProducts = [];
    for (const project of projects) {
        const candidates = [project.products, project.catalog?.products, project.content?.products].filter(Array.isArray);
        for (const list of candidates) for (const product of list) embeddedProducts.push({...product, projectId: product.projectId || project.id});
    }
    const allProducts = [...(Array.isArray(kvProducts)?kvProducts:[]), ...embeddedProducts];
    const seenProducts = new Set();
    for (const item of allProducts) {
        if (!item?.id || !item?.projectId || seenProducts.has(`${item.projectId}:${item.id}`)) continue;
        seenProducts.add(`${item.projectId}:${item.id}`);
        const clean = sanitizeProductInput(item, null);
        if (!clean.name) continue;
        statements.push(env.V8_D1.prepare(`INSERT OR IGNORE INTO products(id,project_id,name,description,price,item_type,category_id,featured,promotion,weight,track_stock,stock,image,status,product_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(item.id,item.projectId,clean.name,clean.description,clean.price,clean.itemType,clean.categoryId,clean.featured?1:0,clean.promotion?1:0,clean.weight,clean.trackStock?1:0,clean.stock,clean.image,clean.status,Number(item.order||item.productOrder||0),item.createdAt||now(),item.updatedAt||now()));
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
        products: seenProducts.size,
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

    if (match && method === "GET") {
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
        (method === "GET" || method === "POST")
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

        if (user.type === "client" && !hasClientModuleAccess(project, "leads")) {
            return json({ success: false, error: "Acesso a Leads não liberado para este projeto." }, 403, origin);
        }

        if (method === "POST") {
            if (user.type === "client" && !hasClientModuleAccess(project, "leads")) {
                return json({ success: false, error: "Acesso a Leads não liberado para este projeto." }, 403, origin);
            }
            if (user.type !== "admin" && user.type !== "client") return json({ success: false, error: "Acesso restrito." }, 403, origin);
            const body = await readJson(request);
            if (user.type === "client") body.metadata = { ...(body.metadata || {}), source: body.metadata?.source || "manual" };
            const created = await d1CreateLead(env, projectId, body);
            return json({ success: true, lead: rowToLead({ ...created, project_id: created.projectId, metadata_json: JSON.stringify(created.metadata), created_at: created.createdAt }) }, 201, origin);
        }

        return json(
            {
                success: true,
                leads: await d1ListLeads(env, projectId)
            },
            200,
            origin
        );
    }

    const leadItemMatch = path.match(ROUTES.leadItem);
    if (leadItemMatch) {
        const [, projectId, leadId] = leadItemMatch;
        const project = await d1GetProject(env, projectId);
        if (!project) return json({ success: false, error: "Projeto não encontrado." }, 404, origin);
        if (user.type !== "admin" && !(user.type === "client" && hasClientModuleAccess(project, "leads"))) {
            return json({ success: false, error: "Acesso a Leads não liberado para este projeto." }, 403, origin);
        }
        if (method === "GET") {
            const result = await env.V8_D1.prepare(`SELECT * FROM leads WHERE id=? AND project_id=? LIMIT 1`).bind(leadId, projectId).first();
            return result ? json({ success: true, lead: rowToLead(result) }, 200, origin) : json({ success: false, error: "Lead não encontrado." }, 404, origin);
        }
        if (method === "PUT" || method === "POST") {
            const updated = await d1UpdateLead(env, projectId, leadId, await readJson(request));
            return updated ? json({ success: true, lead: updated }, 200, origin) : json({ success: false, error: "Lead não encontrado." }, 404, origin);
        }
        if (method === "DELETE") {
            if (user.type !== "admin") return json({ success: false, error: "Exclusão de lead restrita ao administrador." }, 403, origin);
            return json({ success: await d1DeleteLead(env, projectId, leadId) }, 200, origin);
        }
    }

    /* =====================================================
       CATÁLOGO — independente da Loja
    ===================================================== */
    const catalogMatch = path.match(/^\/api\/data\/catalog\/([^/]+)$/);
    const categoryMatch = path.match(/^\/api\/data\/catalog\/([^/]+)\/categories$/);
    const categoryItemMatch = path.match(/^\/api\/data\/catalog\/([^/]+)\/categories\/([^/]+)$/);
    const tagMatch = path.match(/^\/api\/data\/catalog\/([^/]+)\/tags$/);
    const tagItemMatch = path.match(/^\/api\/data\/catalog\/([^/]+)\/tags\/([^/]+)$/);
    const paymentsMatch = path.match(/^\/api\/data\/payments\/([^/]+)$/);
    if (categoryMatch || categoryItemMatch || tagMatch || tagItemMatch || catalogMatch || paymentsMatch) {
        const projectId = (categoryMatch||categoryItemMatch||tagMatch||tagItemMatch||catalogMatch||paymentsMatch)[1];
        const project = await getProjectForUser(env, projectId, user);
        if (!project) return json({success:false,error:"Projeto não encontrado."},404,origin);
        if (user.type !== "admin" && !(hasClientModuleAccess(project,"catalog") || hasClientModuleAccess(project,"ecommerce"))) return json({success:false,error:"Acesso ao Catálogo não liberado para este projeto."},403,origin);
        if (categoryMatch) { if(method==="GET") return json({success:true,categories:await d1ListCategories(env,projectId)},200,origin); if(method==="POST"){const r=await d1SaveCategory(env,projectId,await readJson(request)); return r.error?json({success:false,error:r.error},400,origin):json({success:true,...r},200,origin);} }
        if (categoryItemMatch) { const id=categoryItemMatch[2]; if(method==="PUT"||method==="POST"){const r=await d1SaveCategory(env,projectId,await readJson(request),id); return r.error?json({success:false,error:r.error},400,origin):json({success:true,...r},200,origin);} if(method==="DELETE") return json({success:await d1DeleteCategory(env,projectId,id)},200,origin); }
        if (tagMatch) { if(method==="GET") return json({success:true,tags:await d1ListTags(env,projectId)},200,origin); if(method==="POST"){const r=await d1SaveTag(env,projectId,await readJson(request)); if(r.duplicate) return json({success:true,...r,error:undefined},200,origin); return r.error?json({success:false,error:r.error},400,origin):json({success:true,...r},200,origin);} }
        if (tagItemMatch) { const id=tagItemMatch[2]; if(method==="PUT"||method==="POST"){const r=await d1SaveTag(env,projectId,await readJson(request),id); return r.error?json({success:false,error:r.error},400,origin):json({success:true,...r},200,origin);} if(method==="DELETE") return json({success:await d1DeleteTag(env,projectId,id)},200,origin); }
        if (catalogMatch) { if(method==="GET") return json({success:true,products:await d1ListProducts(env,projectId),categories:await d1ListCategories(env,projectId),tags:await d1ListTags(env,projectId)},200,origin); }
        if (paymentsMatch) { if(method==="GET") return json({success:true,payments:await d1ListPayments(env,projectId)},200,origin); if(method==="POST"){const r=await d1CreatePayment(env,projectId,await readJson(request)); return r.error?json({success:false,error:r.error},400,origin):json({success:true,...r},201,origin);} }
    }

    /* =====================================================
       PRODUTOS (LOJA)
       ===================================================== */

    const productsMatch = path.match(ROUTES.products);
    if (productsMatch) {
        const [, projectId] = productsMatch;
        const project = await getProjectForUser(env, projectId, user);
        if (!project) return json({ success: false, error: "Projeto não encontrado." }, 404, origin);
        if (user.type !== "admin" && !(hasClientModuleAccess(project, "ecommerce") || hasClientModuleAccess(project, "catalog"))) {
            return json({ success: false, error: "Acesso à Loja não liberado para este projeto." }, 403, origin);
        }

        if (method === "GET") {
            const products = await d1ListProducts(env, projectId);
            return json({ success: true, products }, 200, origin);
        }

        if (method === "POST") {
            const result = await d1CreateProduct(env, projectId, await readJson(request));
            if (result.error) return json({ success: false, error: result.error }, 400, origin);
            return json({ success: true, product: result.product }, 200, origin);
        }
    }

    const productItemMatch = path.match(ROUTES.productItem);
    if (productItemMatch) {
        const [, projectId, productId] = productItemMatch;
        const project = await getProjectForUser(env, projectId, user);
        if (!project) return json({ success: false, error: "Projeto não encontrado." }, 404, origin);
        if (user.type !== "admin" && !(hasClientModuleAccess(project, "ecommerce") || hasClientModuleAccess(project, "catalog"))) {
            return json({ success: false, error: "Acesso à Loja não liberado para este projeto." }, 403, origin);
        }

        if (method === "PUT" || method === "POST") {
            const result = await d1UpdateProduct(env, projectId, productId, await readJson(request));
            if (result.error) return json({ success: false, error: result.error }, result.error === "Produto não encontrado." ? 404 : 400, origin);
            return json({ success: true, product: result.product }, 200, origin);
        }

        if (method === "DELETE") {
            const deleted = await d1DeleteProduct(env, projectId, productId);
            return deleted
                ? json({ success: true }, 200, origin)
                : json({ success: false, error: "Produto não encontrado." }, 404, origin);
        }
    }

    if (path === "/api/health" && method === "GET") {
        let d1 = false; try { await env.V8_D1.prepare("SELECT 1 AS ok").first(); d1 = true; } catch {}
        return json({success:true, worker:true, kv:!!env.V8_KV, d1, version:"v3-universal"},200,origin);
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
                        "Erro interno do servidor.",
                    detail: String(error?.message || error).slice(0, 300)
                },
                500,
                cors(request)
            );
        }
    }
};
