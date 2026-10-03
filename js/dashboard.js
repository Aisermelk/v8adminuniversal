/* =========================================================
   V8 ADMIN UNIVERSAL — DASHBOARD
   Versão enxuta / otimizada
   ========================================================= */

const state = {
  section: "dashboard",
  clients: [],
  projects: [],
  leads: [],
  leadsByProject: {},
  clientSearch: "",
  clientStatus: "",
  clientProjectId: "",
  projectSearch: "",
  projectSort: "name-asc",
  projectStatus: "",
  leadSearch: "",
  crmProjectId: "",
  crmStatus: "",
  editingClientId: null,
  editingProjectId: null,
  projectTab: "geral",
  projectDraft: null
};

const STATUS_BADGE = {
  "Em produção": "badge-success",
  "Em desenvolvimento": "badge-warning",
  "Pausado": "badge-muted"
};

const $ = id => document.getElementById(String(id).replace(/^#/, ""));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function getProject(id) {
  return state.projects.find(p => String(p.id) === String(id));
}

function getClient(id) {
  return state.clients.find(c => String(c.id) === String(id));
}

function projectName(id) {
  return getProject(id)?.name || "Sem projeto";
}

// Um cliente pode ter vários projetos vinculados (pela aba Acesso de cada projeto).
function clientProjectNames(clientId) {
  const names = state.projects
    .filter(p => Array.isArray(p.clientIds)
      ? p.clientIds.map(String).includes(String(clientId))
      : String(p.clientId) === String(clientId))
    .map(p => p.name);

  if (!names.length) return "Sem projeto";
  if (names.length === 1) return names[0];

  return `${names[0]} +${names.length - 1}`;
}

function defaultProject() {
  return {
    name: "",
    projectType: "site",
    status: "Em desenvolvimento",
    siteUrl: "",
    clientId: "",
    tracking: {},
    contact: {},
    social: {},
    content: {},
    media: {},
    location: {},
    reviews: {},
    seo: {},
    scripts: {},
    ecommerce: {},
    formspree: ""
  };
}

function normalizeProject(project = {}) {
  const base = defaultProject();

  return {
    ...base,
    ...project,
    projectType: (() => {
      const v = String(
        project.projectType || project.type || "site"
      ).toLowerCase();

      return v === "page"
        ? "page"
        : (v === "loja" || v === "store" ? "loja" : "site");
    })(),

    tracking: {
      ...base.tracking,
      ...(project.tracking || {})
    },

    contact: {
      ...base.contact,
      ...(project.contact || {})
    },

    social: {
      ...base.social,
      ...(project.social || {})
    },

    content: {
      ...base.content,
      ...(project.content || {})
    },

    media: {
      ...base.media,
      ...(project.media || {})
    },

    location: {
      ...base.location,
      ...(project.location || {})
    },

    reviews: {
      ...base.reviews,
      ...(project.reviews || {})
    },

    seo: {
      ...base.seo,
      ...(project.seo || {})
    },

    scripts: {
      ...base.scripts,
      ...(project.scripts || {})
    },

    ecommerce: {
      ...base.ecommerce,
      ...(project.ecommerce || {})
    }
  };
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    Auth.requireAuth();

    applyTheme();
    setupNavigation();
    setupMobile();
    setupTheme();

    await refreshData();
    switchSection("dashboard");
  } catch (error) {
    console.error(error);
    toast("Erro ao carregar o painel.", "error");
  }
});

/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

function setupNavigation() {
  document.querySelectorAll(".nav-item[data-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchSection(btn.dataset.section);
    });
  });

  $("logout-btn")?.addEventListener("click", () => Auth.logout());
}

function switchSection(section) {
  state.section = section;

  window._closeMobileMenu?.();

  document.querySelectorAll(".nav-item[data-section]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === section);
  });

  document.querySelectorAll(".section").forEach(el => {
    el.classList.toggle("hidden", el.dataset.section !== section);
  });

  if (section === "dashboard") renderDashboard();
  if (section === "clients") renderClients();
  if (section === "projects") renderProjects();
  if (section === "leads") renderLeads();
  if (section === "catalog") renderCatalogSection();
  if (section === "store") renderStoreSection();
  if (section === "payments") renderPaymentsSection();
}

/* =========================================================
   MOBILE / TEMA
   ========================================================= */

function setupMobile() {
  const button = $("hamburger-btn");
  const sidebar = $("sidebar");
  const overlay = $("sidebar-overlay");

  if (!button || !sidebar || !overlay) return;

  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    overlay.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  });

  overlay.addEventListener("click", close);
  window._closeMobileMenu = close;
}

function applyTheme() {
  const theme = localStorage.getItem("v8_theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);
}

function setupTheme() {
  const toggle = $("theme-toggle");
  if (!toggle) return;

  toggle.checked =
    document.documentElement.getAttribute("data-theme") === "light";

  toggle.addEventListener("change", () => {
    const theme = toggle.checked ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("v8_theme", theme);
  });
}

/* =========================================================
   DADOS
   ========================================================= */

function unwrapList(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

function normalizeStats(raw) {
  if (!raw || raw.success === false) return {};

  const s = raw.stats || raw;

  return {
    totalClients: s.totalClients ?? s.clients,
    totalProjects: s.totalProjects ?? s.projects,
    totalLeads: s.totalLeads ?? s.leads,
    leadsByProject: s.leadsByProject || raw.leadsByProject || {},
    recentLeads: s.recentLeads || raw.recentLeads || []
  };
}

async function refreshData() {
  try {
    const [clients, projects, stats, leads] = await Promise.all([
      API.get("/api/data/clients"),
      API.get("/api/data/projects"),
      API.get("/api/dashboard/stats"),
      API.get("/api/data/leads")
    ]);

    state.projects = unwrapList(projects, "projects");
    state.leads = unwrapList(leads, "leads");

    state.clients = unwrapList(clients, "clients").map(client => ({
      ...client,
      projectId:
        client.projectId ||
        state.projects.find(p => p.clientId === client.id)?.id ||
        client.legacyProjectId ||
        ""
    }));

    const projectFilter = $("client-project-filter");

    if (projectFilter) {
      const current = state.clientProjectId;

      projectFilter.innerHTML =
        `<option value="">Todos os projetos</option>` +
        state.projects
          .map(
            p =>
              `<option value="${escapeHtml(p.id)}">${escapeHtml(
                p.name
              )}</option>`
          )
          .join("");

      projectFilter.value = current;
    }

    const crmProjectFilter = $("crm-project-filter-page");

    if (crmProjectFilter) {
      const current = state.crmProjectId;

      crmProjectFilter.innerHTML =
        `<option value="">Todos os projetos</option>` +
        state.projects
          .map(
            p =>
              `<option value="${escapeHtml(p.id)}">${escapeHtml(
                p.name
              )}</option>`
          )
          .join("");

      crmProjectFilter.value = current;
    }

    state.stats = normalizeStats(stats);
    state.leadsByProject = state.stats.leadsByProject || {};

    if (state.section === "dashboard") renderDashboard();
    if (state.section === "clients") renderClients();
    if (state.section === "projects") renderProjects();
    if (state.section === "leads") renderLeads();
    if (state.section === "catalog") renderCatalogSection();
    if (state.section === "store") renderStoreSection();
    if (state.section === "payments") renderPaymentsSection();
  } catch (error) {
    console.error(error);
    toast("Não foi possível carregar os dados.", "error");
  }
}

/* =========================================================
   CLIENTES
   ========================================================= */

function renderClients() {
  const wrap = $("clients-table-wrap");

  if (!wrap) return;

  const search = state.clientSearch.toLowerCase().trim();
  const status = state.clientStatus || "";
  const projectId = state.clientProjectId || "";

  const clients = state.clients.filter(client => {
    const text = [
      client.name,
      client.email,
      client.phone,
      clientProjectNames(client.id)
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const matchesStatus =
      !status ||
      String(client.status || "active") === status;

    const projectIds = state.projects
      .filter(p =>
        Array.isArray(p.clientIds)
          ? p.clientIds.includes(client.id)
          : p.clientId === client.id
      )
      .map(p => p.id);

    const matchesProject =
      !projectId ||
      projectIds.includes(projectId) ||
      String(client.projectId || "") === projectId;

    return matchesSearch && matchesStatus && matchesProject;
  });

  if (!clients.length) {
    wrap.innerHTML =
      `<div class="empty-state">Nenhum cliente encontrado.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>E-mail</th>
          <th>Projeto</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>

      <tbody>
        ${clients
          .map(
            client => `
              <tr>
                <td>
                  <strong>${escapeHtml(client.name || "Sem nome")}</strong>
                </td>

                <td>
                  ${escapeHtml(client.email || "")}
                </td>

                <td>
                  ${escapeHtml(clientProjectNames(client.id))}
                </td>

                <td>
                  ${escapeHtml(client.status || "active")}
                </td>

                <td>
                  <button
                    class="btn"
                    onclick="openClientViewPopup('${escapeHtml(
                      client.id
                    )}')">
                    Visualizar
                  </button>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   PROJETOS
   ========================================================= */

function renderProjects() {
  const wrap = $("projects-table-wrap");

  if (!wrap) return;

  const search = state.projectSearch.toLowerCase().trim();
  const status = state.projectStatus || "";

  let projects = state.projects.filter(project => {
    const text = [
      project.name,
      project.id,
      project.siteUrl,
      project.projectType,
      project.status
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const matchesStatus =
      !status ||
      String(project.status || "") === status;

    return matchesSearch && matchesStatus;
  });

  projects.sort((a, b) => {
    const aName = String(a.name || "").toLowerCase();
    const bName = String(b.name || "").toLowerCase();

    if (state.projectSort === "name-desc") {
      return bName.localeCompare(aName);
    }

    return aName.localeCompare(bName);
  });

  if (!projects.length) {
    wrap.innerHTML =
      `<div class="empty-state">Nenhum projeto encontrado.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Projeto</th>
          <th>ID</th>
          <th>Tipo</th>
          <th>Status</th>
          <th>Leads</th>
          <th>Ações</th>
        </tr>
      </thead>

      <tbody>
        ${projects
          .map(project => {
            const projectId = String(project.id || "");

            const leadsInfo =
              state.leadsByProject?.[projectId];

            const leadsCount =
              Number(leadsInfo?.count || 0);

            const badgeClass =
              STATUS_BADGE[project.status] ||
              "badge-muted";

            return `
              <tr>
                <td>
                  <strong>
                    ${escapeHtml(project.name || "Sem nome")}
                  </strong>
                </td>

                <td>
                  <div class="project-id-cell">
                    <code
                      class="project-id-value"
                      title="ID do projeto">
                      ${escapeHtml(projectId)}
                    </code>

                    <button
                      type="button"
                      class="icon-btn"
                      title="Copiar ID do projeto"
                      aria-label="Copiar ID do projeto"
                      onclick="copyProjectId(event, '${escapeHtml(
                        projectId
                      )}')">
                      📋
                    </button>
                  </div>
                </td>

                <td>
                  ${escapeHtml(
                    project.projectType ||
                      project.type ||
                      "site"
                  )}
                </td>

                <td>
                  <span class="badge ${badgeClass}">
                    ${escapeHtml(
                      project.status ||
                        "Em desenvolvimento"
                    )}
                  </span>
                </td>

                <td>
                  ${leadsCount}
                </td>

                <td>
                  <div class="table-actions">
                    <button
                    type="button"
                    class="icon-btn"
                    title="Visualizar projeto"
                    aria-label="Visualizar projeto"
                    onclick="openProjectViewPopup('${escapeHtml(projectId)}')">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true">
                      <path
                        d="M2.5 12C4.3 8.3 7.6 6 12 6C16.4 6 19.7 8.3 21.5 12C19.7 15.7 16.4 18 12 18C7.6 18 4.3 15.7 2.5 12Z"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"/>
                        <circle
                        cx="12"
                        cy="12"
                        r="3"
                        stroke="currentColor"
                        stroke-width="1.8"/>
                      </svg>
                    </button>
                    
                    <button
                    class="btn"
                      onclick="openProjectActionsMenu('${escapeHtml(
                        projectId
                      )}')">
                      ⋯
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   COPIAR ID DO PROJETO
   ========================================================= */

async function copyProjectId(event, id) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const value = String(id || "").trim();

  if (!value) {
    toast("ID do projeto não encontrado.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    toast("ID do projeto copiado.");
  } catch (error) {
    console.error(error);

    try {
      const textarea = document.createElement("textarea");

      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      document.execCommand("copy");

      textarea.remove();

      toast("ID do projeto copiado.");
    } catch (fallbackError) {
      console.error(fallbackError);
      toast("Não foi possível copiar o ID.", "error");
    }
  }
}

/* =========================================================
   BUSCA / FILTROS
   ========================================================= */

function handleClientSearch(value) {
  state.clientSearch = value || "";
  renderClients();
}

function handleProjectSearch(value) {
  state.projectSearch = value || "";
  renderProjects();
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  const totalClients =
    state.stats?.totalClients ??
    state.clients.length;

  const totalProjects =
    state.stats?.totalProjects ??
    state.projects.length;

  const totalLeads =
    state.stats?.totalLeads ??
    state.leads.length;

  const clientsEl = $("stat-total-clients");
  const projectsEl = $("stat-total-projects");
  const leadsEl = $("stat-total-leads");

  if (clientsEl) clientsEl.textContent = totalClients;
  if (projectsEl) projectsEl.textContent = totalProjects;
  if (leadsEl) leadsEl.textContent = totalLeads;
}

/* =========================================================
   LEADS / CRM
   ========================================================= */

function renderLeads() {
  const wrap = $("leads-table-wrap");

  if (!wrap) return;

  const search = state.leadSearch.toLowerCase().trim();
  const projectId = state.crmProjectId || "";
  const status = state.crmStatus || "";

  const leads = state.leads.filter(lead => {
    const text = [
      lead.name,
      lead.email,
      lead.phone,
      lead.message
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const matchesProject =
      !projectId ||
      String(lead.projectId || "") ===
        String(projectId);

    const matchesStatus =
      !status ||
      String(lead.status || "") ===
        String(status);

    return (
      matchesSearch &&
      matchesProject &&
      matchesStatus
    );
  });

  if (!leads.length) {
    wrap.innerHTML =
      `<div class="empty-state">Nenhum lead encontrado.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Contato</th>
          <th>Projeto</th>
          <th>Status</th>
          <th>Data</th>
        </tr>
      </thead>

      <tbody>
        ${leads
          .map(
            lead => `
              <tr>
                <td>
                  <strong>
                    ${escapeHtml(
                      lead.name || "Sem nome"
                    )}
                  </strong>
                </td>

                <td>
                  ${escapeHtml(
                    lead.email ||
                      lead.phone ||
                      ""
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    projectName(
                      lead.projectId
                    )
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    lead.status || "novo"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    lead.createdAt
                      ? new Date(
                          lead.createdAt
                        ).toLocaleString("pt-BR")
                      : ""
                  )}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   MODAL DO PROJETO
   ========================================================= */

function openProjectViewPopup(id) {
  const project = getProject(id);

  if (!project) {
    toast("Projeto não encontrado.", "error");
    return;
  }

  showModal(
    `
      <h2>${escapeHtml(project.name || "Projeto")}</h2>

      <div class="preview-box">
        <strong>ID do projeto</strong>

        <div class="project-id-cell">
          <code class="project-id-value">
            ${escapeHtml(project.id)}
          </code>

          <button
            type="button"
            class="icon-btn"
            title="Copiar ID do projeto"
            onclick="copyProjectId(event, '${escapeHtml(
              project.id
            )}')">
            📋
          </button>
        </div>
      </div>

      <div class="preview-box">
        <strong>Tipo</strong><br>
        ${escapeHtml(
          project.projectType ||
            project.type ||
            "site"
        )}
      </div>

      <div class="preview-box">
        <strong>Status</strong><br>
        ${escapeHtml(
          project.status ||
            "Em desenvolvimento"
        )}
      </div>

      ${
        project.siteUrl
          ? `
            <div class="preview-box">
              <strong>URL</strong><br>
              ${escapeHtml(project.siteUrl)}
            </div>
          `
          : ""
      }

      <div class="modal-actions">
        <button
          class="btn"
          onclick="closeModal()">
          Fechar
        </button>

        <button
          class="btn btn-primary"
          onclick="closeModal();openProjectModal('${escapeHtml(
            project.id
          )}')">
          Editar projeto
        </button>
      </div>
    `,
    "700px"
  );
}

/* =========================================================
   PROJETO — EDIÇÃO
   ========================================================= */

function openProjectModal(id = null) {
  state.editingProjectId = id;

  const existing = id
    ? getProject(id)
    : null;

  state.projectDraft = normalizeProject(
    existing || defaultProject()
  );

  state.projectTab = "geral";

  renderProjectModal();
}

function renderProjectModal() {
  const p = state.projectDraft;

  if (!p) return;

  showModal(
    `
      <h2>
        ${
          state.editingProjectId
            ? "Editar projeto"
            : "Novo projeto"
        }
      </h2>

      <div class="modal-tabs">
        <button
          class="btn ${
            state.projectTab === "geral"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('geral')">
          Geral
        </button>

        <button
          class="btn ${
            state.projectTab === "config"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('config')">
          Configuração
        </button>

        <button
          class="btn ${
            state.projectTab === "content"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('content')">
          Conteúdo
        </button>

        <button
          class="btn ${
            state.projectTab === "media"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('media')">
          Mídia
        </button>

        <button
          class="btn ${
            state.projectTab === "location"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('location')">
          Localização
        </button>

        <button
          class="btn ${
            state.projectTab === "reviews"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('reviews')">
          Avaliações
        </button>

        <button
          class="btn ${
            state.projectTab === "seo"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('seo')">
          SEO
        </button>

        <button
          class="btn ${
            state.projectTab === "scripts"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('scripts')">
          Scripts
        </button>

        <button
          class="btn ${
            state.projectTab === "acesso"
              ? "btn-primary"
              : ""
          }"
          onclick="setProjectTab('acesso')">
          Acesso
        </button>
      </div>

      <div id="project-modal-content"></div>
    `,
    "1000px"
  );

  renderProjectTab();
}

function setProjectTab(tab) {
  state.projectTab = tab;
  renderProjectModal();
}

function renderProjectTab() {
  const el = $("project-modal-content");

  if (!el) return;

  const p = state.projectDraft;

  if (state.projectTab === "geral") {
    el.innerHTML = `
      ${
        state.editingProjectId
          ? `
            <div class="preview-box">
              <strong>ID do projeto</strong>

              <div class="project-id-cell">
                <code class="project-id-value">
                  ${escapeHtml(p.id)}
                </code>

                <button
                  type="button"
                  class="icon-btn"
                  title="Copiar ID do projeto"
                  onclick="copyProjectId(event, '${escapeHtml(
                    p.id
                  )}')">
                  📋
                </button>
              </div>
            </div>
          `
          : ""
      }

      <label>
        Nome do projeto
        <input
          id="p-name"
          value="${escapeHtml(p.name)}">
      </label>

      <label>
        Tipo
        <select id="p-project-type">
          <option value="site" ${
            p.projectType === "site"
              ? "selected"
              : ""
          }>
            Site
          </option>

          <option value="page" ${
            p.projectType === "page"
              ? "selected"
              : ""
          }>
            Página
          </option>

          <option value="loja" ${
            p.projectType === "loja"
              ? "selected"
              : ""
          }>
            Loja
          </option>
        </select>
      </label>

      <label>
        Status
        <select id="p-status">
          <option ${
            p.status === "Em produção"
              ? "selected"
              : ""
          }>
            Em produção
          </option>

          <option ${
            p.status === "Em desenvolvimento"
              ? "selected"
              : ""
          }>
            Em desenvolvimento
          </option>

          <option ${
            p.status === "Pausado"
              ? "selected"
              : ""
          }>
            Pausado
          </option>
        </select>
      </label>

      <label>
        URL do site
        <input
          id="p-site-url"
          value="${escapeHtml(
            p.siteUrl
          )}">
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar projeto
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "config") {
    el.innerHTML = `
      <label>
        Meta Pixel
        <input
          id="p-pixel"
          value="${escapeHtml(
            p.tracking?.pixel || ""
          )}">
      </label>

      <label>
        Google Tag
        <input
          id="p-tag"
          value="${escapeHtml(
            p.tracking?.tag || ""
          )}">
      </label>

      <label>
        Google Analytics
        <input
          id="p-analytics"
          value="${escapeHtml(
            p.tracking?.analytics || ""
          )}">
      </label>

      <label>
        WhatsApp
        <input
          id="p-whatsapp"
          value="${escapeHtml(
            p.contact?.whatsapp || ""
          )}">
      </label>

      <label>
        E-mail
        <input
          id="p-email"
          value="${escapeHtml(
            p.contact?.email || ""
          )}">
      </label>

      <label>
        Telefone
        <input
          id="p-phone"
          value="${escapeHtml(
            p.contact?.phone || ""
          )}">
      </label>

      <label>
        Facebook
        <input
          id="p-facebook"
          value="${escapeHtml(
            p.social?.facebook || ""
          )}">
      </label>

      <label>
        Instagram
        <input
          id="p-instagram"
          value="${escapeHtml(
            p.social?.instagram || ""
          )}">
      </label>

      <label>
        TikTok
        <input
          id="p-tiktok"
          value="${escapeHtml(
            p.social?.tiktok || ""
          )}">
      </label>

      <label>
        YouTube
        <input
          id="p-youtube"
          value="${escapeHtml(
            p.social?.youtube || ""
          )}">
      </label>

      <label>
        LinkedIn
        <input
          id="p-linkedin"
          value="${escapeHtml(
            p.social?.linkedin || ""
          )}">
      </label>

      <label>
        Formspree
        <input
          id="p-formspree"
          value="${escapeHtml(
            p.formspree || ""
          )}">
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar configuração
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "content") {
    el.innerHTML = `
      <label>
        Nome
        <input
          id="c-name"
          value="${escapeHtml(
            p.content?.name || ""
          )}">
      </label>

      <label>
        Profissão
        <input
          id="c-job"
          value="${escapeHtml(
            p.content?.job || ""
          )}">
      </label>

      <label>
        Headline
        <input
          id="c-headline"
          value="${escapeHtml(
            p.content?.headline || ""
          )}">
      </label>

      <label>
        Descrição
        <textarea id="c-description">${escapeHtml(
          p.content?.description || ""
        )}</textarea>
      </label>

      <label>
        Especialização
        <textarea id="c-specialization">${escapeHtml(
          p.content?.specialization || ""
        )}</textarea>
      </label>

      <label>
        Experiência
        <input
          id="c-experience"
          value="${escapeHtml(
            p.content?.experience || ""
          )}">
      </label>

      <label>
        Endereço
        <input
          id="c-address"
          value="${escapeHtml(
            p.content?.address || ""
          )}">
      </label>

      <label>
        Registro
        <input
          id="c-registration"
          value="${escapeHtml(
            p.content?.registration || ""
          )}">
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar conteúdo
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "media") {
    el.innerHTML = `
      <label>
        Galeria — uma URL por linha
        <textarea id="m-gallery">${escapeHtml(
          (p.media?.galleryImages || []).join("\n")
        )}</textarea>
      </label>

      <label>
        <input
          type="checkbox"
          id="m-gallery-enabled"
          ${
            p.media?.galleryEnabled
              ? "checked"
              : ""
          }>
        Ativar galeria
      </label>

      <label>
        Vídeo
        <input
          id="m-video"
          value="${escapeHtml(
            p.media?.video || ""
          )}">
      </label>

      <label>
        <input
          type="checkbox"
          id="m-video-enabled"
          ${
            p.media?.videoEnabled
              ? "checked"
              : ""
          }>
        Ativar vídeo
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar mídia
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "location") {
    el.innerHTML = `
      <label>
        Endereço
        <input
          id="l-address"
          value="${escapeHtml(
            p.location?.address || ""
          )}">
      </label>

      <label>
        URL do Google Maps
        <input
          id="l-maps-url"
          value="${escapeHtml(
            p.location?.mapsUrl || ""
          )}">
      </label>

      <label>
        Embed
        <textarea id="l-embed">${escapeHtml(
          p.location?.embed || ""
        )}</textarea>
      </label>

      <label>
        <input
          type="checkbox"
          id="l-enabled"
          ${
            p.location?.enabled
              ? "checked"
              : ""
          }>
        Ativar localização
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar localização
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "reviews") {
    el.innerHTML = `
      <label>
        Google Place ID
        <input
          id="r-place-id"
          value="${escapeHtml(
            p.reviews?.placeId || ""
          )}">
      </label>

      <label>
        <input
          type="checkbox"
          id="r-enabled"
          ${
            p.reviews?.enabled
              ? "checked"
              : ""
          }>
        Ativar avaliações
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar avaliações
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "seo") {
    el.innerHTML = `
      <label>
        Título
        <input
          id="s-title"
          value="${escapeHtml(
            p.seo?.title || ""
          )}">
      </label>

      <label>
        Descrição
        <textarea id="s-description">${escapeHtml(
          p.seo?.description || ""
        )}</textarea>
      </label>

      <label>
        OG Image
        <input
          id="s-og-image"
          value="${escapeHtml(
            p.seo?.ogImage || ""
          )}">
      </label>

      <label>
        Canonical
        <input
          id="s-canonical"
          value="${escapeHtml(
            p.seo?.canonical || ""
          )}">
      </label>

      <label>
        Keywords
        <input
          id="s-keywords"
          value="${escapeHtml(
            p.seo?.keywords || ""
          )}">
      </label>

      <label>
        Robots
        <input
          id="s-robots"
          value="${escapeHtml(
            p.seo?.robots || ""
          )}">
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar SEO
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "scripts") {
    el.innerHTML = `
      <label>
        Head
        <textarea id="sc-head">${escapeHtml(
          p.scripts?.head || ""
        )}</textarea>
      </label>

      <label>
        Body
        <textarea id="sc-body">${escapeHtml(
          p.scripts?.body || ""
        )}</textarea>
      </label>

      <label>
        Footer
        <textarea id="sc-footer">${escapeHtml(
          p.scripts?.footer || ""
        )}</textarea>
      </label>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          onclick="saveProject()">
          Salvar scripts
        </button>
      </div>
    `;

    return;
  }

  if (state.projectTab === "acesso") {
    const linkedClient = state.clients.find(
      client =>
        String(client.id) ===
        String(p.clientId || "")
    );

    el.innerHTML = `
      <label>
        Cliente vinculado
        <select id="a-client">
          <option value="">
            Nenhum cliente vinculado
          </option>

          ${state.clients
            .map(
              client => `
                <option
                  value="${escapeHtml(
                    client.id
                  )}"
                  ${
                    String(
                      linkedClient?.id ||
                        p.clientId ||
                        ""
                    ) ===
                    String(client.id)
                      ? "selected"
                      : ""
                  }>
                  ${escapeHtml(
                    client.name
                  )} — ${escapeHtml(
                    client.email
                  )}
                </option>
              `
            )
            .join("")}
        </select>
      </label>

      ${
        linkedClient
          ? `
            <div class="preview-box">
              <strong>
                ${escapeHtml(
                  linkedClient.name
                )}
              </strong><br>

              ${escapeHtml(
                linkedClient.email
              )}<br>

              <small>
                Status:
                ${escapeHtml(
                  linkedClient.status ||
                    "active"
                )}
              </small>
            </div>

            <div class="modal-actions">
              <button
                class="btn"
                onclick="closeModal();openClientModal('${escapeHtml(
                  linkedClient.id
                )}')">
                Editar cliente
              </button>
            </div>
          `
          : `
            <div class="empty-state">
              Nenhum cliente vinculado.
            </div>
          `
      }

      ${renderClientPermissions(p)}

      <div class="modal-actions">
        <button
          class="btn btn-primary modal-save-floating"
          onclick="saveProject()">
          Salvar acesso
        </button>
      </div>
    `;

    return;
  }
}

/* =========================================================
   PERMISSÕES
   ========================================================= */

function renderClientPermissions(project) {
  const permissions =
    project?.access?.permissions || {};

  const checked = key =>
    permissions[key] ? "checked" : "";

  return `
    <div class="preview-box">
      <strong>Permissões do cliente</strong>

      <label>
        <input
          type="checkbox"
          data-client-permission="leads"
          ${checked("leads")}>
        CRM / Leads
      </label>

      <label>
        <input
          type="checkbox"
          data-client-permission="content"
          ${checked("content")}>
        Conteúdo
      </label>

      <label>
        <input
          type="checkbox"
          data-client-permission="settings"
          ${checked("settings")}>
        Configurações
      </label>

      <label>
        <input
          type="checkbox"
          data-client-permission="catalog"
          ${checked("catalog")}>
        Catálogo
      </label>

      <label>
        <input
          type="checkbox"
          data-client-permission="store"
          ${checked("store")}>
        Ecommerce
      </label>
    </div>
  `;
}

function collectClientPermissions() {
  const permissions = {};

  document
    .querySelectorAll(
      "[data-client-permission]"
    )
    .forEach(input => {
      permissions[
        input.dataset.clientPermission
      ] = input.checked;
    });

  return {
    permissions
  };
}

/* =========================================================
   LEADS DO PROJETO
   ========================================================= */

async function renderProjectLeads(el) {
  const projectId =
    state.editingProjectId;

  if (!projectId) {
    el.innerHTML =
      `<div class="empty-state">Salve o projeto primeiro.</div>`;
    return;
  }

  markLeadsSeen(projectId);

  el.innerHTML =
    `<div class="loading">Carregando leads...</div>`;

  try {
    const leads = unwrapList(
      await API.get(
        `/api/data/leads/${encodeURIComponent(
          projectId
        )}`
      ),
      "leads"
    );

    if (!leads.length) {
      el.innerHTML =
        `<div class="empty-state">Nenhum lead encontrado.</div>`;
      return;
    }

    el.innerHTML = leads
      .map(
        lead => `
          <div class="lead-item">
            <strong>
              ${escapeHtml(
                lead.name || "Sem nome"
              )}
            </strong>

            <span>
              ${escapeHtml(
                lead.email || ""
              )}
            </span>

            <span>
              ${escapeHtml(
                lead.phone || ""
              )}
            </span>

            <p>
              ${escapeHtml(
                lead.message || ""
              )}
            </p>

            <small>
              ${escapeHtml(
                lead.createdAt
                  ? new Date(
                      lead.createdAt
                    ).toLocaleString("pt-BR")
                  : ""
              )}
            </small>
          </div>
        `
      )
      .join("");
  } catch (error) {
    console.error(error);

    el.innerHTML =
      `<div class="empty-state">Erro ao carregar leads.</div>`;
  }
}

function getSeenKey(projectId) {
  return `v8_leads_seen_${projectId}`;
}

function markLeadsSeen(projectId) {
  localStorage.setItem(
    getSeenKey(projectId),
    new Date().toISOString()
  );
}

function getUnseenLeadsCount(projectId) {
  const info =
    state.leadsByProject?.[projectId];

  if (!info?.latestCreatedAt) return 0;

  const seen =
    localStorage.getItem(
      getSeenKey(projectId)
    );

  if (!seen) {
    return Number(info.count || 0);
  }

  return new Date(
    info.latestCreatedAt
  ) > new Date(seen)
    ? Number(info.count || 0)
    : 0;
}

/* =========================================================
   SALVAR PROJETO
   ========================================================= */

async function saveProject() {
  const p = state.projectDraft;

  if (!p) return;

  if (state.projectTab === "geral") {
    p.name =
      $("p-name")?.value.trim();

    p.projectType =
      $("p-project-type")?.value ||
      "site";

    p.status =
      $("p-status")?.value;

    p.siteUrl =
      $("p-site-url")?.value.trim();
  }

  if (state.projectTab === "config") {
    p.tracking = {
      pixel:
        $("p-pixel")?.value.trim(),

      tag:
        $("p-tag")?.value.trim(),

      analytics:
        $("p-analytics")?.value.trim()
    };

    p.contact = {
      whatsapp:
        $("p-whatsapp")?.value.trim(),

      email:
        $("p-email")?.value.trim(),

      phone:
        $("p-phone")?.value.trim()
    };

    p.social = {
      facebook:
        $("p-facebook")?.value.trim(),

      instagram:
        $("p-instagram")?.value.trim(),

      tiktok:
        $("p-tiktok")?.value.trim(),

      youtube:
        $("p-youtube")?.value.trim(),

      linkedin:
        $("p-linkedin")?.value.trim()
    };

    p.formspree =
      $("p-formspree")?.value.trim();
  }

  if (state.projectTab === "content") {
    p.content = {
      name:
        $("c-name")?.value.trim(),

      job:
        $("c-job")?.value.trim(),

      headline:
        $("c-headline")?.value.trim(),

      description:
        $("c-description")?.value.trim(),

      specialization:
        $("c-specialization")?.value.trim(),

      experience:
        $("c-experience")?.value.trim(),

      address:
        $("c-address")?.value.trim(),

      registration:
        $("c-registration")?.value.trim()
    };
  }

  if (state.projectTab === "media") {
    p.media = {
      galleryImages:
        ($("m-gallery")?.value || "")
          .split("\n")
          .map(v => v.trim())
          .filter(Boolean),

      galleryEnabled:
        $("m-gallery-enabled")?.checked ||
        false,

      video:
        $("m-video")?.value.trim(),

      videoEnabled:
        $("m-video-enabled")?.checked ||
        false
    };
  }

  if (state.projectTab === "location") {
    p.location = {
      address:
        $("l-address")?.value.trim(),

      mapsUrl:
        $("l-maps-url")?.value.trim(),

      embed:
        $("l-embed")?.value.trim(),

      enabled:
        $("l-enabled")?.checked ||
        false
    };
  }

  if (state.projectTab === "reviews") {
    p.reviews = {
      placeId:
        $("r-place-id")?.value.trim(),

      enabled:
        $("r-enabled")?.checked ||
        false
    };
  }

  if (state.projectTab === "seo") {
    p.seo = {
      title:
        $("s-title")?.value.trim(),

      description:
        $("s-description")?.value.trim(),

      ogImage:
        $("s-og-image")?.value.trim(),

      canonical:
        $("s-canonical")?.value.trim(),

      keywords:
        $("s-keywords")?.value.trim(),

      robots:
        $("s-robots")?.value.trim()
    };
  }

  if (state.projectTab === "scripts") {
    p.scripts = {
      head:
        $("sc-head")?.value || "",

      body:
        $("sc-body")?.value || "",

      footer:
        $("sc-footer")?.value || ""
    };
  }

  if (state.projectTab === "acesso") {
    p.clientId =
      $("a-client")?.value || "";

    p.access =
      collectClientPermissions();
  }

  if (!p.name) {
    toast(
      "Informe o nome do projeto.",
      "error"
    );

    return;
  }

  try {
    const result =
      state.editingProjectId
        ? await API.put(
            "/api/data/projects",
            {
              id:
                state.editingProjectId,
              ...p
            }
          )
        : await API.post(
            "/api/data/projects",
            p
          );

    if (result?.error) {
      toast(
        result.error,
        "error"
      );

      return;
    }

    toast("Projeto salvo.");

    closeModal();

    await refreshData();

    if (state.editingProjectId) {
      const updated =
        getProject(
          state.editingProjectId
        );

      if (updated) {
        state.projectDraft =
          normalizeProject(
            updated
          );
      }
    }
  } catch (error) {
    console.error(error);

    toast(
      "Erro ao salvar projeto.",
      "error"
    );
  }
}

/* =========================================================
   EXCLUIR PROJETO
   ========================================================= */

function confirmDeleteProject(id) {
  closeModal();

  confirmModal(
    "Excluir este projeto e seus dados associados?",
    () => deleteProject(id),
    "Excluir"
  );
}

async function deleteProject(id) {
  try {
    const result =
      await API.del(
        `/api/data/projects?id=${encodeURIComponent(
          id
        )}`
      );

    if (result?.error) {
      toast(
        result.error,
        "error"
      );

      return;
    }

    toast("Projeto excluído.");

    await refreshData();
  } catch (error) {
    console.error(error);

    toast(
      "Erro ao excluir projeto.",
      "error"
    );
  }
}

/* =========================================================
   MODAIS
   ========================================================= */

function showModal(
  content,
  maxWidth = "480px"
) {
  closeModal();

  const overlay =
    document.createElement("div");

  overlay.id =
    "modal-overlay";

  overlay.className =
    "modal-overlay";

  overlay.innerHTML = `
    <div
      class="modal"
      style="max-width:${maxWidth}">

      <button
        class="modal-close"
        onclick="closeModal()"
        aria-label="Fechar">
        ×
      </button>

      ${content}
    </div>
  `;

  overlay.addEventListener(
    "click",
    event => {
      if (
        event.target === overlay
      ) {
        closeModal();
      }
    }
  );

  document.body.appendChild(
    overlay
  );
}

function closeModal() {
  $("modal-overlay")?.remove();
}

function confirmModal(
  message,
  onConfirm,
  label = "Confirmar"
) {
  showModal(`
    <h2>Confirmação</h2>

    <p>
      ${escapeHtml(message)}
    </p>

    <div class="modal-actions">
      <button
        class="btn"
        onclick="closeModal()">
        Cancelar
      </button>

      <button
        id="confirm-modal-yes"
        class="btn btn-danger">
        ${escapeHtml(label)}
      </button>
    </div>
  `);

  $("confirm-modal-yes")
    ?.addEventListener(
      "click",
      () => {
        closeModal();
        onConfirm();
      }
    );
}

/* =========================================================
   EXPORTAÇÕES PARA HTML INLINE
   ========================================================= */

window.switchSection =
  switchSection;

window.handleClientSearch =
  handleClientSearch;

window.copyProjectId =
  copyProjectId;

window.handleProjectSearch =
  handleProjectSearch;

window.openClientModal =
  openClientModal;

window.openClientViewPopup =
  openClientViewPopup;

window.openClientActionsMenu =
  openClientActionsMenu;

window.saveClient =
  saveClient;

window.confirmDeleteClient =
  confirmDeleteClient;

window.openProjectModal =
  openProjectModal;

window.openProjectViewPopup =
  openProjectViewPopup;

window.openProjectActionsMenu =
  openProjectActionsMenu;

window.saveProject =
  saveProject;

window.confirmDeleteProject =
  confirmDeleteProject;

window.copyTrackingSnippet =
  copyTrackingSnippet;

window.closeModal =
  closeModal;

window.setProjectTab =
  setProjectTab;


// V8 universal modules navigation fallback
document.addEventListener(
  "click",
  e => {
    const b =
      e.target.closest(
        ".nav-item[data-section]"
      );

    if (!b) return;

    if (
      b.dataset.section ===
      "catalog"
    ) {
      setTimeout(
        () =>
          renderCatalogSection?.(),
        0
      );
    }

    if (
      b.dataset.section ===
      "payments"
    ) {
      setTimeout(
        () =>
          renderPaymentsSection?.(),
        0
      );
    }
  }
);
