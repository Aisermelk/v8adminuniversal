/* ============================================================
   V8 ADMIN — UNIVERSAL
   dashboard.js

   Compatível com:
   Cloudflare Worker + KV

   API:
   /api/login
   /api/dashboard/stats
   /api/data/projects
   /api/data/clients
   /api/data/leads/:projectId
   /api/client-link/:projectId
   /api/client-link/:projectId/revoke

   ============================================================ */

"use strict";

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */

const V8_CONFIG = {

    API_URL:
        window.V8_API_URL ||
        localStorage.getItem("V8_API_URL") ||
        "https://v8digital-api.aisermelk.workers.dev",

    LOGIN_PAGE:
        window.V8_LOGIN_PAGE ||
        "index.html",

    TOKEN_KEY:
        "v8_admin_token",

    EXPIRES_KEY:
        "v8_admin_expires",

    PROJECT_KEY:
        "v8_selected_project"

};


/* ============================================================
   ESTADO
   ============================================================ */

const state = {

    projects: [],

    clients: [],

    leads: [],

    links: [],

    stats: {},

    selectedProject: null,

    loading: false

};


/* ============================================================
   HELPERS
   ============================================================ */

function $(selector) {
    return document.querySelector(selector);
}


function $all(selector) {
    return Array.from(
        document.querySelectorAll(selector)
    );
}


function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatDate(value) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return date.toLocaleString(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    );
}


function formatDateOnly(value) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return date.toLocaleDateString(
        "pt-BR"
    );
}


function showMessage(
    message,
    type = "success"
) {

    let box =
        document.querySelector(
            "#v8-message"
        );

    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "v8-message";

        box.style.position =
            "fixed";

        box.style.top =
            "20px";

        box.style.right =
            "20px";

        box.style.zIndex =
            "99999";

        box.style.padding =
            "14px 18px";

        box.style.borderRadius =
            "10px";

        box.style.fontFamily =
            "Arial, sans-serif";

        box.style.fontSize =
            "14px";

        box.style.boxShadow =
            "0 10px 30px rgba(0,0,0,.15)";

        document.body.appendChild(
            box
        );
    }

    box.textContent =
        message;

    box.style.background =
        type === "error"
            ? "#dc2626"
            : "#16a34a";

    box.style.color =
        "#fff";

    box.style.display =
        "block";

    clearTimeout(
        box._timeout
    );

    box._timeout =
        setTimeout(
            () => {

                box.style.display =
                    "none";

            },
            4000
        );
}


function confirmAction(message) {

    return window.confirm(
        message
    );
}


/* ============================================================
   TOKEN
   ============================================================ */

function getToken() {

    return localStorage.getItem(
        V8_CONFIG.TOKEN_KEY
    );
}


function setToken(
    token,
    expiresAt
) {

    localStorage.setItem(
        V8_CONFIG.TOKEN_KEY,
        token
    );

    if (expiresAt) {

        localStorage.setItem(
            V8_CONFIG.EXPIRES_KEY,
            String(expiresAt)
        );

    }
}


function clearToken() {

    localStorage.removeItem(
        V8_CONFIG.TOKEN_KEY
    );

    localStorage.removeItem(
        V8_CONFIG.EXPIRES_KEY
    );
}


function isTokenExpired() {

    const expires =
        localStorage.getItem(
            V8_CONFIG.EXPIRES_KEY
        );

    if (!expires) {
        return false;
    }

    return (
        Date.now() >=
        Number(expires)
    );
}


/* ============================================================
   API
   ============================================================ */

async function api(
    endpoint,
    options = {}
) {

    const token =
        getToken();

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
                V8_CONFIG.API_URL +
                endpoint,
                {
                    ...options,
                    headers
                }
            );

    } catch (error) {

        throw new Error(
            "Não foi possível conectar à API."
        );

    }

    let data = null;

    try {

        data =
            await response.json();

    } catch {

        data = null;

    }

    if (
        response.status === 401
    ) {

        clearToken();

        redirectLogin();

        throw new Error(
            "Sessão expirada."
        );
    }

    if (!response.ok) {

        throw new Error(
            data?.message ||
            `Erro HTTP ${response.status}`
        );

    }

    return data;
}


/* ============================================================
   LOGIN
   ============================================================ */

async function login(
    email,
    password
) {

    const data =
        await api(
            "/api/login",
            {
                method:
                    "POST",

                body:
                    JSON.stringify({
                        email,
                        password
                    })
            }
        );

    if (
        !data ||
        !data.token
    ) {

        throw new Error(
            "Token não recebido."
        );

    }

    setToken(
        data.token,
        data.expiresAt
    );

    return data;
}


/* ============================================================
   LOGOUT
   ============================================================ */

function logout() {

    clearToken();

    localStorage.removeItem(
        V8_CONFIG.PROJECT_KEY
    );

    redirectLogin();
}


/* ============================================================
   REDIRECIONAR LOGIN
   ============================================================ */

function redirectLogin() {

    window.location.href =
        V8_CONFIG.LOGIN_PAGE;
}


/* ============================================================
   VERIFICAR AUTENTICAÇÃO
   ============================================================ */

function requireLogin() {

    const token =
        getToken();

    if (!token) {

        redirectLogin();

        return false;
    }

    if (isTokenExpired()) {

        clearToken();

        redirectLogin();

        return false;
    }

    return true;
}


/* ============================================================
   DASHBOARD
   ============================================================ */

async function loadDashboard() {

    const data =
        await api(
            "/api/dashboard/stats"
        );

    state.stats =
        data || {};

    renderStats(
        state.stats
    );

    renderRecentLeads(
        state.stats.recentLeads || []
    );

    return data;
}


/* ============================================================
   ESTATÍSTICAS
   ============================================================ */

function renderStats(stats) {

    setText(
        [
            "#totalProjects",
            "#total-projects",
            "[data-stat='projects']"
        ],
        stats.totalProjects ??
        state.projects.length
    );

    setText(
        [
            "#totalClients",
            "#total-clients",
            "[data-stat='clients']"
        ],
        stats.totalClients ??
        state.clients.length
    );

    setText(
        [
            "#totalLeads",
            "#total-leads",
            "[data-stat='leads']"
        ],
        stats.totalLeads ??
        state.leads.length
    );

}


function setText(
    selectors,
    value
) {

    if (
        !Array.isArray(selectors)
    ) {

        selectors =
            [selectors];

    }

    for (
        const selector of selectors
    ) {

        const elements =
            $all(selector);

        if (!elements.length) {
            continue;
        }

        elements.forEach(
            element => {

                element.textContent =
                    value;

            }
        );

        return;
    }
}


/* ============================================================
   PROJETOS — CARREGAR
   ============================================================ */

async function loadProjects() {

    const data =
        await api(
            "/api/data/projects"
        );

    state.projects =
        Array.isArray(data)
            ? data
            : [];

    renderProjects(
        state.projects
    );

    populateProjectSelectors();

    restoreSelectedProject();

    return state.projects;
}


/* ============================================================
   PROJETOS — RENDER
   ============================================================ */

function renderProjects(
    projects
) {

    const containers = [

        "#projectsList",

        "#projects-list",

        "[data-projects-list]"

    ];

    let container = null;

    for (
        const selector of containers
    ) {

        container =
            $(selector);

        if (container) {
            break;
        }

    }

    if (!container) {
        return;
    }

    if (!projects.length) {

        container.innerHTML = `
            <div class="v8-empty">
                <strong>Nenhum projeto cadastrado</strong>
                <p>Crie o primeiro projeto para começar.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        projects
            .map(
                project =>
                    projectCard(project)
            )
            .join("");

}


function projectCard(
    project
) {

    const status =
        project.status ||
        "Em desenvolvimento";

    return `

        <div
            class="v8-project-card"
            data-project-id="${escapeHTML(project.id)}"
        >

            <div class="v8-project-card-header">

                <div>

                    <h3>
                        ${escapeHTML(
                            project.name ||
                            "Projeto sem nome"
                        )}
                    </h3>

                    <small>
                        ID:
                        ${escapeHTML(project.id)}
                    </small>

                </div>

                <span class="v8-status">
                    ${escapeHTML(status)}
                </span>

            </div>

            <div class="v8-project-card-info">

                <div>
                    <strong>WhatsApp</strong>
                    <span>
                        ${escapeHTML(
                            project.contact?.whatsapp ||
                            "-"
                        )}
                    </span>
                </div>

                <div>
                    <strong>Instagram</strong>
                    <span>
                        ${escapeHTML(
                            project.social?.instagram ||
                            "-"
                        )}
                    </span>
                </div>

                <div>
                    <strong>Pixel</strong>
                    <span>
                        ${escapeHTML(
                            project.tracking?.pixel ||
                            "-"
                        )}
                    </span>
                </div>

                <div>
                    <strong>Atualizado</strong>
                    <span>
                        ${formatDate(
                            project.updatedAt
                        )}
                    </span>
                </div>

            </div>

            <div class="v8-project-actions">

                <button
                    type="button"
                    data-action="select-project"
                    data-id="${escapeHTML(project.id)}"
                >
                    Abrir
                </button>

                <button
                    type="button"
                    data-action="edit-project"
                    data-id="${escapeHTML(project.id)}"
                >
                    Editar
                </button>

                <button
                    type="button"
                    data-action="project-leads"
                    data-id="${escapeHTML(project.id)}"
                >
                    Leads
                </button>

                <button
                    type="button"
                    data-action="client-link"
                    data-id="${escapeHTML(project.id)}"
                >
                    Link do cliente
                </button>

                <button
                    type="button"
                    data-action="delete-project"
                    data-id="${escapeHTML(project.id)}"
                >
                    Excluir
                </button>

            </div>

        </div>

    `;
}


/* ============================================================
   PROJETO SELECIONADO
   ============================================================ */

function selectProject(
    projectId
) {

    const project =
        state.projects.find(
            p =>
                p.id === projectId
        );

    if (!project) {

        showMessage(
            "Projeto não encontrado.",
            "error"
        );

        return null;
    }

    state.selectedProject =
        project;

    localStorage.setItem(
        V8_CONFIG.PROJECT_KEY,
        project.id
    );

    renderSelectedProject(
        project
    );

    return project;
}


function restoreSelectedProject() {

    const saved =
        localStorage.getItem(
            V8_CONFIG.PROJECT_KEY
        );

    if (!saved) {
        return;
    }

    const project =
        state.projects.find(
            p =>
                p.id === saved
        );

    if (project) {

        state.selectedProject =
            project;

        renderSelectedProject(
            project
        );

    }
}


function renderSelectedProject(
    project
) {

    setText(
        [
            "#selectedProjectName",
            "#selected-project-name",
            "[data-selected-project='name']"
        ],
        project.name || "-"
    );

    setText(
        [
            "#selectedProjectId",
            "#selected-project-id",
            "[data-selected-project='id']"
        ],
        project.id || "-"
    );

}


/* ============================================================
   PROJETOS — CRIAR
   ============================================================ */

async function createProject(
    projectData
) {

    const payload = {

        name:
            projectData.name ||
            "",

        status:
            projectData.status ||
            "Em desenvolvimento",

        tracking: {

            pixel:
                projectData.tracking?.pixel ||
                "",

            tag:
                projectData.tracking?.tag ||
                "",

            analytics:
                projectData.tracking?.analytics ||
                ""

        },

        contact: {

            whatsapp:
                projectData.contact?.whatsapp ||
                "",

            email:
                projectData.contact?.email ||
                "",

            phone:
                projectData.contact?.phone ||
                ""

        },

        social: {

            facebook:
                projectData.social?.facebook ||
                "",

            instagram:
                projectData.social?.instagram ||
                "",

            tiktok:
                projectData.social?.tiktok ||
                "",

            youtube:
                projectData.social?.youtube ||
                "",

            linkedin:
                projectData.social?.linkedin ||
                ""

        },

        formspree:
            projectData.formspree ||
            ""

    };

    const data =
        await api(
            "/api/data/projects",
            {
                method:
                    "POST",

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );

    await loadProjects();

    await loadDashboard();

    showMessage(
        "Projeto criado com sucesso."
    );

    return data.project;
}


/* ============================================================
   PROJETOS — ATUALIZAR
   ============================================================ */

async function updateProject(
    project
) {

    if (!project?.id) {

        throw new Error(
            "ID do projeto obrigatório."
        );

    }

    const data =
        await api(
            "/api/data/projects",
            {
                method:
                    "PUT",

                body:
                    JSON.stringify(
                        project
                    )
            }
        );

    await loadProjects();

    await loadDashboard();

    showMessage(
        "Projeto atualizado com sucesso."
    );

    return data.project;
}


/* ============================================================
   PROJETOS — EXCLUIR
   ============================================================ */

async function deleteProject(
    projectId
) {

    const project =
        state.projects.find(
            p =>
                p.id === projectId
        );

    if (!project) {

        showMessage(
            "Projeto não encontrado.",
            "error"
        );

        return;
    }

    const confirmed =
        confirmAction(
            `Tem certeza que deseja excluir o projeto "${project.name}"?\n\n` +
            `Esta ação também removerá os leads e links associados.`
        );

    if (!confirmed) {
        return;
    }

    await api(
        "/api/data/projects?id=" +
        encodeURIComponent(
            projectId
        ),
        {
            method:
                "DELETE"
        }
    );

    if (
        state.selectedProject?.id ===
        projectId
    ) {

        state.selectedProject =
            null;

        localStorage.removeItem(
            V8_CONFIG.PROJECT_KEY
        );

    }

    await loadProjects();

    await loadClients();

    await loadDashboard();

    showMessage(
        "Projeto excluído."
    );
}


/* ============================================================
   FORMULÁRIO DE PROJETO
   ============================================================ */

function getProjectFormData(
    form
) {

    const data =
        new FormData(form);

    return {

        name:
            data.get("name") ||
            "",

        status:
            data.get("status") ||
            "Em desenvolvimento",

        tracking: {

            pixel:
                data.get("pixel") ||
                "",

            tag:
                data.get("tag") ||
                "",

            analytics:
                data.get("analytics") ||
                ""

        },

        contact: {

            whatsapp:
                data.get("whatsapp") ||
                "",

            email:
                data.get("email") ||
                "",

            phone:
                data.get("phone") ||
                ""

        },

        social: {

            facebook:
                data.get("facebook") ||
                "",

            instagram:
                data.get("instagram") ||
                "",

            tiktok:
                data.get("tiktok") ||
                "",

            youtube:
                data.get("youtube") ||
                "",

            linkedin:
                data.get("linkedin") ||
                ""

        },

        formspree:
            data.get("formspree") ||
            ""

    };
}


/* ============================================================
   PREENCHER FORMULÁRIO
   ============================================================ */

function fillProjectForm(
    form,
    project
) {

    if (!form || !project) {
        return;
    }

    setField(
        form,
        "name",
        project.name
    );

    setField(
        form,
        "status",
        project.status
    );

    setField(
        form,
        "pixel",
        project.tracking?.pixel
    );

    setField(
        form,
        "tag",
        project.tracking?.tag
    );

    setField(
        form,
        "analytics",
        project.tracking?.analytics
    );

    setField(
        form,
        "whatsapp",
        project.contact?.whatsapp
    );

    setField(
        form,
        "email",
        project.contact?.email
    );

    setField(
        form,
        "phone",
        project.contact?.phone
    );

    setField(
        form,
        "facebook",
        project.social?.facebook
    );

    setField(
        form,
        "instagram",
        project.social?.instagram
    );

    setField(
        form,
        "tiktok",
        project.social?.tiktok
    );

    setField(
        form,
        "youtube",
        project.social?.youtube
    );

    setField(
        form,
        "linkedin",
        project.social?.linkedin
    );

    setField(
        form,
        "formspree",
        project.formspree
    );

}


function setField(
    form,
    name,
    value
) {

    const field =
        form.elements[name];

    if (!field) {
        return;
    }

    field.value =
        value || "";
}


/* ============================================================
   CLIENTES — CARREGAR
   ============================================================ */

async function loadClients() {

    const data =
        await api(
            "/api/data/clients"
        );

    state.clients =
        Array.isArray(data)
            ? data
            : [];

    renderClients(
        state.clients
    );

    populateProjectSelectors();

    return state.clients;
}


/* ============================================================
   CLIENTES — RENDER
   ============================================================ */

function renderClients(
    clients
) {

    const container =
        $(
            "#clientsList"
        ) ||
        $(
            "#clients-list"
        ) ||
        $(
            "[data-clients-list]"
        );

    if (!container) {
        return;
    }

    if (!clients.length) {

        container.innerHTML = `
            <div class="v8-empty">
                Nenhum cliente cadastrado.
            </div>
        `;

        return;
    }

    container.innerHTML =
        clients
            .map(
                client =>
                    clientCard(client)
            )
            .join("");

}


function clientCard(
    client
) {

    const project =
        state.projects.find(
            p =>
                p.id ===
                client.projectId
        );

    return `

        <div
            class="v8-client-card"
            data-client-id="${escapeHTML(client.id)}"
        >

            <div>

                <h3>
                    ${escapeHTML(
                        client.name ||
                        "Cliente"
                    )}
                </h3>

                <p>
                    ${escapeHTML(
                        client.email ||
                        "-"
                    )}
                </p>

                <p>
                    ${escapeHTML(
                        client.phone ||
                        "-"
                    )}
                </p>

                <small>
                    Projeto:
                    ${escapeHTML(
                        project?.name ||
                        client.projectId ||
                        "-"
                    )}
                </small>

            </div>

            <div>

                <button
                    type="button"
                    data-action="edit-client"
                    data-id="${escapeHTML(client.id)}"
                >
                    Editar
                </button>

                <button
                    type="button"
                    data-action="delete-client"
                    data-id="${escapeHTML(client.id)}"
                >
                    Excluir
                </button>

            </div>

        </div>

    `;
}


/* ============================================================
   CLIENTES — CRIAR
   ============================================================ */

async function createClient(
    clientData
) {

    const payload = {

        name:
            clientData.name ||
            "",

        email:
            clientData.email ||
            "",

        phone:
            clientData.phone ||
            "",

        projectId:
            clientData.projectId ||
            ""

    };

    const data =
        await api(
            "/api/data/clients",
            {
                method:
                    "POST",

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );

    await loadClients();

    await loadDashboard();

    showMessage(
        "Cliente criado com sucesso."
    );

    return data.client;
}


/* ============================================================
   CLIENTES — ATUALIZAR
   ============================================================ */

async function updateClient(
    client
) {

    if (!client?.id) {

        throw new Error(
            "ID do cliente obrigatório."
        );

    }

    const data =
        await api(
            "/api/data/clients",
            {
                method:
                    "PUT",

                body:
                    JSON.stringify(
                        client
                    )
            }
        );

    await loadClients();

    showMessage(
        "Cliente atualizado com sucesso."
    );

    return data.client;
}


/* ============================================================
   CLIENTES — EXCLUIR
   ============================================================ */

async function deleteClient(
    clientId
) {

    const client =
        state.clients.find(
            c =>
                c.id === clientId
        );

    if (!client) {
        return;
    }

    const confirmed =
        confirmAction(
            `Excluir o cliente "${client.name}"?`
        );

    if (!confirmed) {
        return;
    }

    await api(
        "/api/data/clients?id=" +
        encodeURIComponent(
            clientId
        ),
        {
            method:
                "DELETE"
        }
    );

    await loadClients();

    await loadDashboard();

    showMessage(
        "Cliente excluído."
    );
}


/* ============================================================
   LEADS — CARREGAR
   ============================================================ */

async function loadLeads(
    projectId
) {

    if (!projectId) {

        state.leads =
            [];

        renderLeads(
            []
        );

        return [];
    }

    const data =
        await api(
            "/api/data/leads/" +
            encodeURIComponent(
                projectId
            )
        );

    state.leads =
        Array.isArray(data)
            ? data
            : [];

    renderLeads(
        state.leads
    );

    return state.leads;
}


/* ============================================================
   LEADS — RENDER
   ============================================================ */

function renderLeads(
    leads
) {

    const container =
        $(
            "#leadsList"
        ) ||
        $(
            "#leads-list"
        ) ||
        $(
            "[data-leads-list]"
        );

    if (!container) {
        return;
    }

    if (!leads.length) {

        container.innerHTML = `
            <div class="v8-empty">
                Nenhum lead encontrado.
            </div>
        `;

        return;
    }

    container.innerHTML = `

        <div class="v8-leads-table-wrapper">

            <table class="v8-leads-table">

                <thead>

                    <tr>
                        <th>Nome</th>
                        <th>E-mail</th>
                        <th>Telefone</th>
                        <th>Mensagem</th>
                        <th>Data</th>
                    </tr>

                </thead>

                <tbody>

                    ${leads
                        .map(
                            lead =>
                                `
                                <tr>

                                    <td>
                                        ${escapeHTML(
                                            lead.name ||
                                            "-"
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHTML(
                                            lead.email ||
                                            "-"
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHTML(
                                            lead.phone ||
                                            "-"
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHTML(
                                            lead.message ||
                                            "-"
                                        )}
                                    </td>

                                    <td>
                                        ${formatDate(
                                            lead.createdAt
                                        )}
                                    </td>

                                </tr>
                                `
                        )
                        .join("")}

                </tbody>

            </table>

        </div>

    `;
}


/* ============================================================
   LINKS DO CLIENTE
   ============================================================ */

async function loadClientLinks(
    projectId
) {

    if (!projectId) {

        state.links =
            [];

        renderClientLinks(
            []
        );

        return [];
    }

    const data =
        await api(
            "/api/client-link/" +
            encodeURIComponent(
                projectId
            )
        );

    state.links =
        Array.isArray(data)
            ? data
            : [];

    renderClientLinks(
        state.links
    );

    return state.links;
}


/* ============================================================
   RENDER LINKS
   ============================================================ */

function renderClientLinks(
    links
) {

    const container =
        $(
            "#clientLinksList"
        ) ||
        $(
            "#client-links-list"
        ) ||
        $(
            "[data-client-links-list]"
        );

    if (!container) {
        return;
    }

    if (!links.length) {

        container.innerHTML = `
            <div class="v8-empty">
                Nenhum link de cliente criado.
            </div>
        `;

        return;
    }

    container.innerHTML =
        links
            .map(
                link =>
                    clientLinkCard(link)
            )
            .join("");

}


function clientLinkCard(
    link
) {

    const currentUrl =
        window.location.origin +
        "/client.html?token=" +
        encodeURIComponent(
            link.token
        );

    let status =
        "Ativo";

    if (link.revoked) {
        status = "Revogado";
    } else if (
        link.expiresAt &&
        Date.now() >
        new Date(
            link.expiresAt
        ).getTime()
    ) {
        status = "Expirado";
    }

    return `

        <div
            class="v8-client-link-card"
        >

            <div>

                <strong>
                    Link do cliente
                </strong>

                <span>
                    Status:
                    ${escapeHTML(status)}
                </span>

                <span>
                    Criado:
                    ${formatDate(
                        link.createdAt
                    )}
                </span>

                <span>
                    Expira:
                    ${formatDate(
                        link.expiresAt
                    )}
                </span>

            </div>

            <div>

                <input
                    type="text"
                    readonly
                    value="${escapeHTML(
                        currentUrl
                    )}"
                >

                <button
                    type="button"
                    data-action="copy-link"
                    data-link="${escapeHTML(
                        currentUrl
                    )}"
                >
                    Copiar
                </button>

                ${
                    !link.revoked
                        ? `
                            <button
                                type="button"
                                data-action="revoke-link"
                                data-jti="${escapeHTML(
                                    link.jti
                                )}"
                            >
                                Revogar
                            </button>
                        `
                        : ""
                }

            </div>

        </div>

    `;
}


/* ============================================================
   GERAR LINK
   ============================================================ */

async function generateClientLink(
    projectId,
    fields
) {

    if (!projectId) {

        throw new Error(
            "Projeto obrigatório."
        );

    }

    if (
        !Array.isArray(fields) ||
        !fields.length
    ) {

        throw new Error(
            "Selecione pelo menos um campo."
        );

    }

    const data =
        await api(
            "/api/client-link/" +
            encodeURIComponent(
                projectId
            ),
            {
                method:
                    "POST",

                body:
                    JSON.stringify({
                        fields
                    })
            }
        );

    await loadClientLinks(
        projectId
    );

    showMessage(
        "Link do cliente criado."
    );

    return data;
}


/* ============================================================
   REVOGAR LINK
   ============================================================ */

async function revokeClientLink(
    jti
) {

    if (!jti) {
        return;
    }

    const confirmed =
        confirmAction(
            "Revogar este link do cliente?"
        );

    if (!confirmed) {
        return;
    }

    await api(
        "/api/client-link/" +
        encodeURIComponent(
            jti
        ) +
        "/revoke",
        {
            method:
                "POST"
        }
    );

    if (
        state.selectedProject
    ) {

        await loadClientLinks(
            state.selectedProject.id
        );

    }

    showMessage(
        "Link revogado."
    );
}


/* ============================================================
   COPIAR LINK
   ============================================================ */

async function copyLink(
    link
) {

    try {

        await navigator.clipboard.writeText(
            link
        );

        showMessage(
            "Link copiado."
        );

    } catch {

        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value =
            link;

        document.body.appendChild(
            textarea
        );

        textarea.select();

        document.execCommand(
            "copy"
        );

        textarea.remove();

        showMessage(
            "Link copiado."
        );

    }
}


/* ============================================================
   CONFIG PÚBLICA
   ============================================================ */

async function loadPublicConfig(
    projectId
) {

    if (!projectId) {

        throw new Error(
            "Projeto obrigatório."
        );

    }

    const data =
        await fetch(
            V8_CONFIG.API_URL +
            "/api/public/config/" +
            encodeURIComponent(
                projectId
            )
        );

    const result =
        await data.json();

    if (!data.ok) {

        throw new Error(
            result?.message ||
            "Erro ao carregar configuração."
        );

    }

    return result;
}


/* ============================================================
   SELECTS DE PROJETOS
   ============================================================ */

function populateProjectSelectors() {

    const selectors = $all(
        "select[name='projectId'], " +
        "#projectId, " +
        "[data-project-selector]"
    );

    selectors.forEach(
        select => {

            const current =
                select.value;

            select.innerHTML = `

                <option value="">
                    Selecione o projeto
                </option>

                ${
                    state.projects
                        .map(
                            project =>
                                `
                                <option
                                    value="${escapeHTML(
                                        project.id
                                    )}"
                                >
                                    ${escapeHTML(
                                        project.name ||
                                        project.id
                                    )}
                                </option>
                                `
                        )
                        .join("")
                }

            `;

            if (
                state.projects.some(
                    p =>
                        p.id ===
                        current
                )
            ) {

                select.value =
                    current;

            }

        }
    );
}


/* ============================================================
   MODAL
   ============================================================ */

function openModal(
    selector
) {

    const modal =
        typeof selector === "string"
            ? $(selector)
            : selector;

    if (!modal) {
        return;
    }

    modal.classList.add(
        "active"
    );

    modal.style.display =
        "flex";

    document.body.classList.add(
        "modal-open"
    );
}


function closeModal(
    selector
) {

    const modal =
        typeof selector === "string"
            ? $(selector)
            : selector;

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "active"
    );

    modal.style.display =
        "none";

    document.body.classList.remove(
        "modal-open"
    );
}


/* ============================================================
   EVENTOS DE PROJETO
   ============================================================ */

function setupProjectEvents() {

    document.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "[data-action]"
                );

            if (!button) {
                return;
            }

            const action =
                button.dataset.action;

            const id =
                button.dataset.id;

            try {

                if (
                    action ===
                    "select-project"
                ) {

                    const project =
                        selectProject(id);

                    if (project) {

                        await loadLeads(
                            project.id
                        );

                        await loadClientLinks(
                            project.id
                        );

                    }

                }


                if (
                    action ===
                    "edit-project"
                ) {

                    const project =
                        state.projects.find(
                            p =>
                                p.id === id
                        );

                    if (!project) {
                        return;
                    }

                    openProjectEditor(
                        project
                    );

                }


                if (
                    action ===
                    "delete-project"
                ) {

                    await deleteProject(
                        id
                    );

                }


                if (
                    action ===
                    "project-leads"
                ) {

                    const project =
                        selectProject(id);

                    if (project) {

                        await loadLeads(
                            id
                        );

                    }

                }


                if (
                    action ===
                    "client-link"
                ) {

                    const project =
                        selectProject(id);

                    if (project) {

                        await loadClientLinks(
                            id
                        );

                        openClientLinkEditor(
                            id
                        );

                    }

                }


                if (
                    action ===
                    "copy-link"
                ) {

                    await copyLink(
                        button.dataset.link
                    );

                }


                if (
                    action ===
                    "revoke-link"
                ) {

                    await revokeClientLink(
                        button.dataset.jti
                    );

                }


                if (
                    action ===
                    "delete-client"
                ) {

                    await deleteClient(
                        id
                    );

                }


                if (
                    action ===
                    "edit-client"
                ) {

                    const client =
                        state.clients.find(
                            c =>
                                c.id === id
                        );

                    if (client) {

                        openClientEditor(
                            client
                        );

                    }

                }

            } catch (error) {

                console.error(
                    error
                );

                showMessage(
                    error.message ||
                    "Ocorreu um erro.",
                    "error"
                );

            }

        }
    );

}


/* ============================================================
   EDITOR DE PROJETO
   ============================================================ */

function openProjectEditor(
    project
) {

    const form =
        $(
            "#projectForm"
        ) ||
        $(
            "#project-form"
        );

    if (form) {

        fillProjectForm(
            form,
            project
        );

        form.dataset.projectId =
            project.id;

    }

    const title =
        $(
            "#projectModalTitle"
        ) ||
        $(
            "#project-modal-title"
        );

    if (title) {

        title.textContent =
            "Editar projeto";

    }

    const modal =
        $(
            "#projectModal"
        ) ||
        $(
            "#project-modal"
        );

    if (modal) {

        openModal(
            modal
        );

    }

}


/* ============================================================
   EDITOR DE CLIENTE
   ============================================================ */

function openClientEditor(
    client
) {

    const form =
        $(
            "#clientForm"
        ) ||
        $(
            "#client-form"
        );

    if (!form) {
        return;
    }

    setField(
        form,
        "name",
        client.name
    );

    setField(
        form,
        "email",
        client.email
    );

    setField(
        form,
        "phone",
        client.phone
    );

    setField(
        form,
        "projectId",
        client.projectId
    );

    form.dataset.clientId =
        client.id;

    const title =
        $(
            "#clientModalTitle"
        ) ||
        $(
            "#client-modal-title"
        );

    if (title) {

        title.textContent =
            "Editar cliente";

    }

    const modal =
        $(
            "#clientModal"
        ) ||
        $(
            "#client-modal"
        );

    if (modal) {

        openModal(
            modal
        );

    }

}


/* ============================================================
   EDITOR DE LINK
   ============================================================ */

function openClientLinkEditor(
    projectId
) {

    const form =
        $(
            "#clientLinkForm"
        ) ||
        $(
            "#client-link-form"
        );

    if (!form) {
        return;
    }

    form.dataset.projectId =
        projectId;

    const modal =
        $(
            "#clientLinkModal"
        ) ||
        $(
            "#client-link-modal"
        );

    if (modal) {

        openModal(
            modal
        );

    }

}


/* ============================================================
   FORMULÁRIO DE PROJETO
   ============================================================ */

function setupProjectForm() {

    const form =
        $(
            "#projectForm"
        ) ||
        $(
            "#project-form"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            try {

                const projectData =
                    getProjectFormData(
                        form
                    );

                const projectId =
                    form.dataset.projectId;

                if (projectId) {

                    await updateProject({

                        id:
                            projectId,

                        ...projectData

                    });

                } else {

                    await createProject(
                        projectData
                    );

                }

                delete form.dataset.projectId;

                closeModal(
                    $(
                        "#projectModal"
                    ) ||
                    $(
                        "#project-modal"
                    )
                );

                form.reset();

            } catch (error) {

                showMessage(
                    error.message,
                    "error"
                );

            }

        }
    );

}


/* ============================================================
   FORMULÁRIO DE CLIENTE
   ============================================================ */

function setupClientForm() {

    const form =
        $(
            "#clientForm"
        ) ||
        $(
            "#client-form"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            try {

                const data =
                    new FormData(
                        form
                    );

                const client = {

                    name:
                        data.get("name") ||
                        "",

                    email:
                        data.get("email") ||
                        "",

                    phone:
                        data.get("phone") ||
                        "",

                    projectId:
                        data.get("projectId") ||
                        ""

                };

                const clientId =
                    form.dataset.clientId;

                if (clientId) {

                    await updateClient({

                        id:
                            clientId,

                        ...client

                    });

                } else {

                    await createClient(
                        client
                    );

                }

                delete form.dataset.clientId;

                form.reset();

                closeModal(
                    $(
                        "#clientModal"
                    ) ||
                    $(
                        "#client-modal"
                    )
                );

            } catch (error) {

                showMessage(
                    error.message,
                    "error"
                );

            }

        }
    );

}


/* ============================================================
   FORMULÁRIO LINK
   ============================================================ */

function setupClientLinkForm() {

    const form =
        $(
            "#clientLinkForm"
        ) ||
        $(
            "#client-link-form"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            try {

                const projectId =
                    form.dataset.projectId;

                if (!projectId) {

                    throw new Error(
                        "Projeto não selecionado."
                    );

                }

                const fields =
                    Array.from(
                        form.querySelectorAll(
                            "input[name='fields']:checked"
                        )
                    )
                    .map(
                        input =>
                            input.value
                    );

                await generateClientLink(
                    projectId,
                    fields
                );

                closeModal(
                    $(
                        "#clientLinkModal"
                    ) ||
                    $(
                        "#client-link-modal"
                    )
                );

                form.reset();

            } catch (error) {

                showMessage(
                    error.message,
                    "error"
                );

            }

        }
    );

}


/* ============================================================
   BOTÕES DE FECHAR MODAL
   ============================================================ */

function setupModalEvents() {

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-close-modal]"
                );

            if (!button) {
                return;
            }

            const selector =
                button.dataset.closeModal;

            closeModal(
                selector
            );

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                event.target.classList.contains(
                    "modal"
                )
            ) {

                closeModal(
                    event.target
                );

            }

        }
    );

}


/* ============================================================
   BOTÃO NOVO PROJETO
   ============================================================ */

function setupNewProjectButton() {

    const buttons =
        $all(
            "#newProject, " +
            "#new-project, " +
            "[data-action='new-project']"
        );

    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const form =
                        $(
                            "#projectForm"
                        ) ||
                        $(
                            "#project-form"
                        );

                    if (form) {

                        form.reset();

                        delete form.dataset.projectId;

                    }

                    const title =
                        $(
                            "#projectModalTitle"
                        ) ||
                        $(
                            "#project-modal-title"
                        );

                    if (title) {

                        title.textContent =
                            "Novo projeto";

                    }

                    openModal(
                        $(
                            "#projectModal"
                        ) ||
                        $(
                            "#project-modal"
                        )
                    );

                }
            );

        }
    );

}


/* ============================================================
   BOTÃO NOVO CLIENTE
   ============================================================ */

function setupNewClientButton() {

    const buttons =
        $all(
            "#newClient, " +
            "#new-client, " +
            "[data-action='new-client']"
        );

    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const form =
                        $(
                            "#clientForm"
                        ) ||
                        $(
                            "#client-form"
                        );

                    if (form) {

                        form.reset();

                        delete form.dataset.clientId;

                    }

                    const title =
                        $(
                            "#clientModalTitle"
                        ) ||
                        $(
                            "#client-modal-title"
                        );

                    if (title) {

                        title.textContent =
                            "Novo cliente";

                    }

                    populateProjectSelectors();

                    openModal(
                        $(
                            "#clientModal"
                        ) ||
                        $(
                            "#client-modal"
                        )
                    );

                }
            );

        }
    );

}


/* ============================================================
   SELECTOR DE PROJETO
   ============================================================ */

function setupProjectSelector() {

    const selectors =
        $all(
            "#projectSelector, " +
            "#project-selector, " +
            "[data-project-selector]"
        );

    selectors.forEach(
        select => {

            select.addEventListener(
                "change",
                async () => {

                    const projectId =
                        select.value;

                    if (!projectId) {
                        return;
                    }

                    try {

                        const project =
                            selectProject(
                                projectId
                            );

                        if (!project) {
                            return;
                        }

                        await Promise.all([
                            loadLeads(projectId),
                            loadClientLinks(projectId)
                        ]);

                    } catch (error) {

                        showMessage(
                            error.message,
                            "error"
                        );

                    }

                }
            );

        }
    );

}


/* ============================================================
   BOTÃO LOGOUT
   ============================================================ */

function setupLogout() {

    const buttons =
        $all(
            "#logout, " +
            "#logoutButton, " +
            "[data-action='logout']"
        );

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

}


/* ============================================================
   RECARREGAR
   ============================================================ */

function setupRefresh() {

    const buttons =
        $all(
            "#refresh, " +
            "#refreshButton, " +
            "[data-action='refresh']"
        );

    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async event => {

                    event.preventDefault();

                    try {

                        await initializeDashboard();

                        showMessage(
                            "Dados atualizados."
                        );

                    } catch (error) {

                        showMessage(
                            error.message,
                            "error"
                        );

                    }

                }
            );

        }
    );

}


/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

async function initializeDashboard() {

    if (
        !requireLogin()
    ) {
        return;
    }

    try {

        state.loading =
            true;

        await Promise.all([
            loadProjects(),
            loadClients()
        ]);

        await loadDashboard();

        if (
            state.selectedProject
        ) {

            await Promise.all([

                loadLeads(
                    state.selectedProject.id
                ),

                loadClientLinks(
                    state.selectedProject.id
                )

            ]);

        }

    } catch (error) {

        console.error(
            "V8 ADMIN:",
            error
        );

        showMessage(
            error.message ||
            "Erro ao carregar painel.",
            "error"
        );

    } finally {

        state.loading =
            false;

    }

}


/* ============================================================
   LOGIN FORM
   ============================================================ */

function setupLoginForm() {

    const form =
        $(
            "#loginForm"
        ) ||
        $(
            "#login-form"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const data =
                new FormData(
                    form
                );

            const email =
                String(
                    data.get("email") ||
                    ""
                )
                .trim();

            const password =
                String(
                    data.get("password") ||
                    ""
                );

            if (
                !email ||
                !password
            ) {

                showMessage(
                    "Informe e-mail e senha.",
                    "error"
                );

                return;
            }

            try {

                const button =
                    form.querySelector(
                        "button[type='submit']"
                    );

                if (button) {

                    button.disabled =
                        true;

                    button.dataset.originalText =
                        button.textContent;

                    button.textContent =
                        "Entrando...";

                }

                await login(
                    email,
                    password
                );

                window.location.href =
                    "dashboard.html";

            } catch (error) {

                showMessage(
                    error.message ||
                    "Falha no login.",
                    "error"
                );

                const button =
                    form.querySelector(
                        "button[type='submit']"
                    );

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        button.dataset.originalText ||
                        "Entrar";

                }

            }

        }
    );

}


/* ============================================================
   AUTO DETECÇÃO
   ============================================================ */

function isDashboardPage() {

    return !!(
        $(
            "#projectsList"
        ) ||
        $(
            "#projects-list"
        ) ||
        $(
            "#dashboard"
        ) ||
        document.body.dataset.page ===
            "dashboard"
    );

}


/* ============================================================
   API PÚBLICA GLOBAL
   ============================================================ */

window.V8Admin = {

    api,

    login,

    logout,

    loadDashboard,

    loadProjects,

    loadClients,

    loadLeads,

    loadClientLinks,

    createProject,

    updateProject,

    deleteProject,

    createClient,

    updateClient,

    deleteClient,

    generateClientLink,

    revokeClientLink,

    loadPublicConfig,

    selectProject,

    openModal,

    closeModal,

    state,

    config:
        V8_CONFIG

};


/* ============================================================
   START
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupLoginForm();

        setupProjectEvents();

        setupProjectForm();

        setupClientForm();

        setupClientLinkForm();

        setupModalEvents();

        setupNewProjectButton();

        setupNewClientButton();

        setupProjectSelector();

        setupLogout();

        setupRefresh();

        if (
            isDashboardPage()
        ) {

            await initializeDashboard();

        }

    }
);
