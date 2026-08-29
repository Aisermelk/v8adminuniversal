/* ============================================================
   V8 ADMIN — UNIVERSAL
   DASHBOARD.JS
   ============================================================

   Compatível com:

   Cloudflare Pages
        ↓
   V8 Admin Universal
        ↓
   Cloudflare Worker API
        ↓
   Cloudflare KV

   Endpoints utilizados:

   POST   /api/login
   GET    /api/dashboard/stats
   GET    /api/data/projects
   GET    /api/data/clients
   GET    /api/data/leads/:projectId

   ============================================================ */

"use strict";


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const V8_CONFIG = {

    /*
     * URL da API.
     *
     * Se dashboard.js estiver no mesmo domínio do Worker,
     * deixe vazio.
     *
     * Caso o painel esteja no Cloudflare Pages e a API esteja
     * em outro domínio, informe a URL do Worker.
     */

    API_URL:
        window.V8_API_URL ||
        localStorage.getItem("V8_API_URL") ||
        "",

    TOKEN_KEYS: [
        "v8_token",
        "V8_TOKEN",
        "token",
        "authToken",
        "adminToken"
    ],

    PROJECT_KEYS: [
        "v8_project_id",
        "V8_PROJECT_ID",
        "selectedProjectId",
        "projectId"
    ]

};


// ============================================================
// ESTADO GLOBAL
// ============================================================

const DashboardState = {

    stats: {

        totalProjects: 0,
        totalClients: 0,
        totalLeads: 0,
        recentLeads: []

    },

    projects: [],

    clients: [],

    leads: [],

    loading: false,

    lastUpdate: null

};


// ============================================================
// DOM READY
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initDashboard();

    }
);


// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function initDashboard() {

    console.log(
        "[V8 ADMIN] Inicializando dashboard..."
    );

    setupLogout();

    setupRefresh();

    setupNavigation();

    setupTheme();

    const token =
        getToken();

    if (!token) {

        console.warn(
            "[V8 ADMIN] Token não encontrado."
        );

        redirectLogin();

        return;

    }

    await loadDashboard();

}


// ============================================================
// API URL
// ============================================================

function getApiUrl() {

    let base =
        V8_CONFIG.API_URL;

    if (!base) {

        /*
         * Se não houver URL configurada,
         * usa o mesmo domínio.
         */

        base =
            window.location.origin;

    }

    return base
        .replace(/\/+$/, "");

}


// ============================================================
// TOKEN
// ============================================================

function getToken() {

    for (
        const key of V8_CONFIG.TOKEN_KEYS
    ) {

        const token =
            localStorage.getItem(key);

        if (
            token &&
            token.trim()
        ) {

            return token.trim();

        }

    }

    return null;

}


// ============================================================
// SALVAR TOKEN
// ============================================================

function saveToken(token) {

    if (!token) {
        return;
    }

    localStorage.setItem(
        "v8_token",
        token
    );

}


// ============================================================
// REMOVER TOKEN
// ============================================================

function removeToken() {

    for (
        const key of V8_CONFIG.TOKEN_KEYS
    ) {

        localStorage.removeItem(key);

    }

}


// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(
    endpoint,
    options = {}
) {

    const token =
        getToken();

    const url =
        `${getApiUrl()}${endpoint}`;

    const headers = {

        "Content-Type":
            "application/json",

        ...(options.headers || {})

    };

    if (token) {

        headers.Authorization =
            `Bearer ${token}`;

    }

    let response;

    try {

        response =
            await fetch(
                url,
                {
                    ...options,
                    headers,
                    cache: "no-store"
                }
            );

    } catch (error) {

        console.error(
            "[V8 ADMIN] Erro de conexão:",
            error
        );

        throw new Error(
            "Não foi possível conectar à API."
        );

    }

    let data = null;

    const contentType =
        response.headers.get(
            "content-type"
        ) || "";

    if (
        contentType.includes(
            "application/json"
        )
    ) {

        try {

            data =
                await response.json();

        } catch {

            data = null;

        }

    } else {

        try {

            const text =
                await response.text();

            data =
                text
                    ? { message: text }
                    : null;

        } catch {

            data = null;

        }

    }


    // ========================================================
    // TOKEN EXPIRADO
    // ========================================================

    if (
        response.status === 401
    ) {

        console.warn(
            "[V8 ADMIN] Sessão expirada."
        );

        removeToken();

        redirectLogin();

        throw new Error(
            "Sessão expirada."
        );

    }


    // ========================================================
    // ERRO DA API
    // ========================================================

    if (!response.ok) {

        const message =
            data?.message ||
            data?.error ||
            `Erro HTTP ${response.status}`;

        throw new Error(message);

    }


    return data;

}


// ============================================================
// LOAD DASHBOARD
// ============================================================

async function loadDashboard() {

    if (
        DashboardState.loading
    ) {

        return;

    }

    DashboardState.loading =
        true;

    setLoadingState(true);

    try {

        console.log(
            "[V8 ADMIN] Carregando dashboard..."
        );


        // ====================================================
        // ESTATÍSTICAS
        // ====================================================

        const stats =
            await apiRequest(
                "/api/dashboard/stats"
            );

        console.log(
            "[V8 ADMIN] Stats:",
            stats
        );

        DashboardState.stats =
            normalizeStats(stats);


        // ====================================================
        // PROJETOS
        // ====================================================

        try {

            const projects =
                await apiRequest(
                    "/api/data/projects"
                );

            DashboardState.projects =
                Array.isArray(projects)
                    ? projects
                    : Array.isArray(projects?.projects)
                        ? projects.projects
                        : [];

        } catch (error) {

            console.warn(
                "[V8 ADMIN] Erro ao carregar projetos:",
                error
            );

            DashboardState.projects =
                [];

        }


        // ====================================================
        // CLIENTES
        // ====================================================

        try {

            const clients =
                await apiRequest(
                    "/api/data/clients"
                );

            DashboardState.clients =
                Array.isArray(clients)
                    ? clients
                    : Array.isArray(clients?.clients)
                        ? clients.clients
                        : [];

        } catch (error) {

            console.warn(
                "[V8 ADMIN] Erro ao carregar clientes:",
                error
            );

            DashboardState.clients =
                [];

        }


        // ====================================================
        // RENDER
        // ====================================================

        renderStats();

        renderRecentLeads();

        renderProjects();

        renderDashboardSummary();


        DashboardState.lastUpdate =
            new Date();


        updateLastUpdate();


        console.log(
            "[V8 ADMIN] Dashboard carregado."
        );


    } catch (error) {

        console.error(
            "[V8 ADMIN] Falha no dashboard:",
            error
        );

        showDashboardError(
            error.message
        );

    } finally {

        DashboardState.loading =
            false;

        setLoadingState(false);

    }

}


// ============================================================
// NORMALIZAR STATS
// ============================================================

function normalizeStats(data) {

    return {

        totalProjects:
            Number(
                data?.totalProjects ||
                data?.projects ||
                0
            ),

        totalClients:
            Number(
                data?.totalClients ||
                data?.clients ||
                0
            ),

        totalLeads:
            Number(
                data?.totalLeads ||
                data?.leads ||
                0
            ),

        recentLeads:
            Array.isArray(
                data?.recentLeads
            )
                ? data.recentLeads
                : []

    };

}


// ============================================================
// RENDER STATS
// ============================================================

function renderStats() {

    const stats =
        DashboardState.stats;


    // IDs possíveis

    setText(
        [
            "totalProjects",
            "total-projects",
            "projectsCount",
            "projectCount"
        ],
        stats.totalProjects
    );


    setText(
        [
            "totalClients",
            "total-clients",
            "clientsCount",
            "clientCount"
        ],
        stats.totalClients
    );


    setText(
        [
            "totalLeads",
            "total-leads",
            "leadsCount",
            "leadCount"
        ],
        stats.totalLeads
    );


    // Elementos com data-stat

    setDataStat(
        "projects",
        stats.totalProjects
    );

    setDataStat(
        "clients",
        stats.totalClients
    );

    setDataStat(
        "leads",
        stats.totalLeads
    );

}


// ============================================================
// RENDER LEADS
// ============================================================

function renderRecentLeads() {

    const leads =
        DashboardState.stats.recentLeads;


    const containers =
        getElements([
            "recentLeads",
            "recent-leads",
            "leadsRecentes",
            "leads-recentes",
            "dashboardLeads",
            "leadsList"
        ]);


    if (
        !containers.length
    ) {

        console.warn(
            "[V8 ADMIN] Container de leads não encontrado."
        );

        return;

    }


    containers.forEach(
        container => {

            if (
                !leads.length
            ) {

                container.innerHTML = `

                    <div class="v8-empty-state">

                        <strong>
                            Nenhum lead recebido
                        </strong>

                        <span>
                            Os novos contatos aparecerão aqui.
                        </span>

                    </div>

                `;

                return;

            }


            const sorted =
                leads
                    .slice()
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            new Date(
                                b.createdAt || 0
                            ) -
                            new Date(
                                a.createdAt || 0
                            )
                    );


            container.innerHTML =
                sorted
                    .slice(
                        0,
                        10
                    )
                    .map(
                        lead =>
                            createLeadHTML(
                                lead
                            )
                    )
                    .join("");


            bindLeadActions(
                container
            );

        }
    );

}


// ============================================================
// LEAD HTML
// ============================================================

function createLeadHTML(
    lead
) {

    const name =
        escapeHTML(
            lead.name ||
            "Sem nome"
        );

    const email =
        escapeHTML(
            lead.email ||
            ""
        );

    const phone =
        escapeHTML(
            lead.phone ||
            ""
        );

    const message =
        escapeHTML(
            lead.message ||
            ""
        );

    const projectName =
        escapeHTML(
            lead.projectName ||
            getProjectName(
                lead.projectId
            ) ||
            "Projeto"
        );

    const date =
        formatDate(
            lead.createdAt
        );


    return `

        <div
            class="v8-lead-item"
            data-lead-id="${escapeAttr(
                lead.id || ""
            )}"
        >

            <div class="v8-lead-main">

                <div class="v8-lead-name">
                    ${name}
                </div>

                <div class="v8-lead-project">
                    ${projectName}
                </div>

                ${
                    email
                        ? `
                            <div class="v8-lead-email">
                                ${email}
                            </div>
                        `
                        : ""
                }

                ${
                    phone
                        ? `
                            <div class="v8-lead-phone">
                                ${phone}
                            </div>
                        `
                        : ""
                }

                ${
                    message
                        ? `
                            <div class="v8-lead-message">
                                ${message}
                            </div>
                        `
                        : ""
                }

            </div>

            <div class="v8-lead-date">
                ${date}
            </div>

        </div>

    `;

}


// ============================================================
// PROJETOS
// ============================================================

function renderProjects() {

    const projects =
        DashboardState.projects;


    const containers =
        getElements([
            "projectsList",
            "projects-list",
            "dashboardProjects",
            "recentProjects"
        ]);


    if (
        !containers.length
    ) {

        return;

    }


    containers.forEach(
        container => {

            if (
                !projects.length
            ) {

                container.innerHTML = `

                    <div class="v8-empty-state">

                        <strong>
                            Nenhum projeto cadastrado
                        </strong>

                        <span>
                            Crie seu primeiro projeto.
                        </span>

                    </div>

                `;

                return;

            }


            container.innerHTML =
                projects
                    .slice(
                        0,
                        10
                    )
                    .map(
                        project =>
                            createProjectHTML(
                                project
                            )
                    )
                    .join("");

        }
    );

}


// ============================================================
// PROJECT HTML
// ============================================================

function createProjectHTML(
    project
) {

    const name =
        escapeHTML(
            project.name ||
            "Projeto sem nome"
        );

    const status =
        escapeHTML(
            project.status ||
            "Em desenvolvimento"
        );

    const id =
        escapeAttr(
            project.id ||
            ""
        );


    return `

        <div
            class="v8-project-item"
            data-project-id="${id}"
        >

            <div class="v8-project-info">

                <strong>
                    ${name}
                </strong>

                <span>
                    ${status}
                </span>

            </div>

        </div>

    `;

}


// ============================================================
// RESUMO
// ============================================================

function renderDashboardSummary() {

    const projectCount =
        DashboardState.projects.length;

    const clientCount =
        DashboardState.clients.length;

    const leadCount =
        DashboardState.stats.totalLeads;


    setText(
        [
            "dashboardSummary",
            "summaryText"
        ],
        ``
    );


    const summary =
        document.querySelector(
            "[data-dashboard-summary]"
        );


    if (!summary) {
        return;
    }


    summary.innerHTML = `

        <div>
            <strong>
                ${projectCount}
            </strong>
            <span>
                projetos
            </span>
        </div>

        <div>
            <strong>
                ${clientCount}
            </strong>
            <span>
                clientes
            </span>
        </div>

        <div>
            <strong>
                ${leadCount}
            </strong>
            <span>
                leads
            </span>
        </div>

    `;

}


// ============================================================
// CARREGAR LEADS DE PROJETO
// ============================================================

async function loadProjectLeads(
    projectId
) {

    if (!projectId) {

        return [];

    }


    try {

        const result =
            await apiRequest(
                `/api/data/leads/${encodeURIComponent(
                    projectId
                )}`
            );


        const leads =
            Array.isArray(result)
                ? result
                : Array.isArray(result?.leads)
                    ? result.leads
                    : [];


        return leads;

    } catch (error) {

        console.error(
            "[V8 ADMIN] Erro nos leads:",
            error
        );

        return [];

    }

}


// ============================================================
// PROJETO POR ID
// ============================================================

function getProjectName(
    projectId
) {

    if (!projectId) {
        return "";
    }

    const project =
        DashboardState.projects.find(
            item =>
                item.id ===
                projectId
        );

    return project?.name || "";

}


// ============================================================
// REFRESH
// ============================================================

function setupRefresh() {

    const buttons =
        getElements([
            "refreshDashboard",
            "refresh-dashboard",
            "btnRefresh",
            "refreshBtn"
        ]);


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async event => {

                    event.preventDefault();

                    await loadDashboard();

                }
            );

        }
    );


    // Botões data-action

    document
        .querySelectorAll(
            '[data-action="refresh"]'
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async event => {

                        event.preventDefault();

                        await loadDashboard();

                    }
                );

            }
        );

}


// ============================================================
// LOGOUT
// ============================================================

function setupLogout() {

    const buttons =
        getElements([
            "logout",
            "btnLogout",
            "logoutBtn",
            "sair"
        ]);


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    logout();

                }
            );

        }
    );


    document
        .querySelectorAll(
            '[data-action="logout"]'
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        logout();

                    }
                );

            }
        );

}


// ============================================================
// LOGOUT
// ============================================================

function logout() {

    removeToken();

    localStorage.removeItem(
        "v8_user"
    );

    localStorage.removeItem(
        "V8_USER"
    );

    redirectLogin();

}


// ============================================================
// LOGIN REDIRECT
// ============================================================

function redirectLogin() {

    const current =
        window.location.pathname;


    if (
        current.includes(
            "login"
        )
    ) {

        return;

    }


    window.location.href =
        "login.html";

}


// ============================================================
// NAVEGAÇÃO
// ============================================================

function setupNavigation() {

    document
        .querySelectorAll(
            "[data-page]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    event => {

                        const page =
                            element.dataset.page;

                        if (!page) {
                            return;
                        }

                        event.preventDefault();

                        window.location.href =
                            page;

                    }
                );

            }
        );

}


// ============================================================
// TEMA
// ============================================================

function setupTheme() {

    const checkbox =
        document.querySelector(
            "#themeToggle"
        ) ||
        document.querySelector(
            "#theme-toggle"
        ) ||
        document.querySelector(
            '[data-theme-toggle]'
        );


    if (!checkbox) {

        return;

    }


    const saved =
        localStorage.getItem(
            "v8_theme"
        );


    if (
        saved === "light"
    ) {

        document.body.classList.add(
            "light"
        );

        if (
            "checked" in checkbox
        ) {

            checkbox.checked =
                true;

        }

    }


    checkbox.addEventListener(
        "change",
        () => {

            if (
                checkbox.checked
            ) {

                document.body.classList.add(
                    "light"
                );

                localStorage.setItem(
                    "v8_theme",
                    "light"
                );

            } else {

                document.body.classList.remove(
                    "light"
                );

                localStorage.setItem(
                    "v8_theme",
                    "dark"
                );

            }

        }
    );

}


// ============================================================
// LOADING
// ============================================================

function setLoadingState(
    loading
) {

    const elements =
        document.querySelectorAll(
            "[data-dashboard-loading]"
        );


    elements.forEach(
        element => {

            element.style.display =
                loading
                    ? ""
                    : "none";

        }
    );


    if (loading) {

        setLoadingText();

    }

}


// ============================================================
// LOADING TEXT
// ============================================================

function setLoadingText() {

    const elements =
        getElements([
            "dashboardLoading",
            "loading",
            "dashboard-status"
        ]);


    elements.forEach(
        element => {

            element.textContent =
                "Carregando...";

        }
    );

}


// ============================================================
// ERRO
// ============================================================

function showDashboardError(
    message
) {

    console.error(
        "[V8 ADMIN]",
        message
    );


    const containers =
        getElements([
            "dashboardLoading",
            "loading",
            "dashboard-status"
        ]);


    containers.forEach(
        element => {

            element.innerHTML = `

                <div class="v8-error">

                    <strong>
                        Não foi possível carregar o dashboard.
                    </strong>

                    <span>
                        ${escapeHTML(
                            message ||
                            "Erro desconhecido."
                        )}
                    </span>

                    <button
                        type="button"
                        data-action="refresh"
                    >
                        Tentar novamente
                    </button>

                </div>

            `;

        }
    );


    document
        .querySelectorAll(
            '[data-action="refresh"]'
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    loadDashboard
                );

            }
        );

}


// ============================================================
// DATA ATUALIZAÇÃO
// ============================================================

function updateLastUpdate() {

    const elements =
        getElements([
            "lastUpdate",
            "last-update",
            "updatedAt"
        ]);


    if (
        !DashboardState.lastUpdate
    ) {

        return;

    }


    const text =
        DashboardState.lastUpdate
            .toLocaleTimeString(
                "pt-BR",
                {
                    hour:
                        "2-digit",

                    minute:
                        "2-digit"
                }
            );


    elements.forEach(
        element => {

            element.textContent =
                `Atualizado às ${text}`;

        }
    );

}


// ============================================================
// ELEMENTOS
// ============================================================

function getElements(
    ids
) {

    const result = [];

    ids.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );

            if (
                element &&
                !result.includes(
                    element
                )
            ) {

                result.push(
                    element
                );

            }

        }
    );


    return result;

}


// ============================================================
// SET TEXT
// ============================================================

function setText(
    ids,
    value
) {

    getElements(ids)
        .forEach(
            element => {

                element.textContent =
                    value;

            }
        );

}


// ============================================================
// DATA STAT
// ============================================================

function setDataStat(
    name,
    value
) {

    document
        .querySelectorAll(
            `[data-stat="${name}"]`
        )
        .forEach(
            element => {

                element.textContent =
                    value;

            }
        );

}


// ============================================================
// LEAD ACTIONS
// ============================================================

function bindLeadActions(
    container
) {

    container
        .querySelectorAll(
            "[data-phone]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    () => {

                        const phone =
                            element.dataset.phone;

                        if (!phone) {
                            return;
                        }

                        const clean =
                            phone.replace(
                                /\D/g,
                                ""
                            );

                        window.open(
                            `https://wa.me/${clean}`,
                            "_blank"
                        );

                    }
                );

            }
        );

}


// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(
    value
) {

    if (!value) {

        return "";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleString(
        "pt-BR",
        {
            day:
                "2-digit",

            month:
                "2-digit",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"

        }
    );

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );

}


// ============================================================
// ESCAPE ATTRIBUTE
// ============================================================

function escapeAttr(
    value
) {

    return escapeHTML(
        value
    );

}


// ============================================================
// TESTE DA API
// ============================================================

async function testAPI() {

    try {

        const result =
            await apiRequest(
                "/"
            );

        console.log(
            "[V8 ADMIN] API ONLINE:",
            result
        );

        return result;

    } catch (error) {

        console.error(
            "[V8 ADMIN] API OFFLINE:",
            error
        );

        throw error;

    }

}


// ============================================================
// EXPOR FUNÇÕES
// ============================================================

window.V8Dashboard = {

    load:
        loadDashboard,

    refresh:
        loadDashboard,

    logout,

    getToken,

    saveToken,

    testAPI,

    apiRequest,

    getProjects:
        () =>
            DashboardState.projects,

    getClients:
        () =>
            DashboardState.clients,

    getLeads:
        () =>
            DashboardState.leads,

    state:
        DashboardState

};


// ============================================================
// LOG
// ============================================================

console.log(
    "%cV8 ADMIN — Dashboard carregado",
    "font-weight:bold"
);

console.log(
    "[V8 ADMIN] API:",
    getApiUrl()
);
