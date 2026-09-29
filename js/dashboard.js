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
  projectSearch: "",
  projectSort: "name-asc",
  projectStatus: "",
  leadSearch: "",
  crmProjectId: "",
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

const $ = id => document.getElementById(id);

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
    .filter(p => String(p.clientId) === String(clientId))
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
    projectType: (() => { const v = String(project.projectType || project.type || "site").toLowerCase(); return v === "page" ? "page" : (v === "loja" || v === "store" ? "loja" : "site"); })(),
    tracking: { ...base.tracking, ...(project.tracking || {}) },
    contact: { ...base.contact, ...(project.contact || {}) },
    social: { ...base.social, ...(project.social || {}) },
    content: { ...base.content, ...(project.content || {}) },
    media: { ...base.media, ...(project.media || {}) },
    location: { ...base.location, ...(project.location || {}) },
    reviews: { ...base.reviews, ...(project.reviews || {}) },
    seo: { ...base.seo, ...(project.seo || {}) },
    scripts: { ...base.scripts, ...(project.scripts || {}) },
    ecommerce: { ...base.ecommerce, ...(project.ecommerce || {}) }
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
  if (section === "store") renderStoreSection();
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

// A API (D1) devolve listas embrulhadas: {success, clients:[...]}.
// Aceita tanto o formato novo quanto array puro (formato antigo).
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

    state.stats = normalizeStats(stats);
    state.leadsByProject = state.stats.leadsByProject || {};

    if (state.section === "dashboard") renderDashboard();
    if (state.section === "clients") renderClients();
    if (state.section === "projects") renderProjects();
    if (state.section === "leads") renderLeads();
    if (state.section === "store") renderStoreSection();
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
  const clients = state.clients.filter(client =>
    !search || String(client.name || "").toLowerCase().includes(search) || String(client.email || "").toLowerCase().includes(search)
  );
  if (!clients.length) { wrap.innerHTML = `<div class="empty-state">Nenhum cliente encontrado.</div>`; return; }
  wrap.innerHTML = `<table><thead><tr><th>Cliente</th><th>E-mail</th><th>Projeto</th><th></th></tr></thead><tbody>${clients.map(client => `
    <tr class="row-clickable" onclick="openClientViewPopup('${escapeHtml(client.id)}')">
      <td><strong>${escapeHtml(client.name || "—")}</strong></td>
      <td>${escapeHtml(client.email || "—")}</td>
      <td>${escapeHtml(clientProjectNames(client.id))}</td>
      <td onclick="event.stopPropagation()"><div class="row-actions client-row-actions">
        <button class="btn btn-primary btn-sm" title="Visualizar cliente" onclick="openClientViewPopup('${escapeHtml(client.id)}')">◉ <span>Visualizar</span></button>
        <button class="btn btn-ghost btn-sm" title="Editar cliente" onclick="openClientModal('${escapeHtml(client.id)}')">✎ <span>Editar</span></button>
        <button class="icon-btn" title="Mais opções" onclick="openClientActionsMenu(event,'${escapeHtml(client.id)}')">⋯</button>
      </div></td>
    </tr>`).join("")}</tbody></table>`;
}

function handleClientSearch(value) {
  state.clientSearch = value;
  renderClients();
}

function openClientActionsMenu(event, id) {
  event.stopPropagation();
  document.querySelector(".project-actions-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "project-actions-menu";
  menu.innerHTML = `<button class="danger" onclick="confirmDeleteClient('${escapeHtml(id)}')">Excluir</button>`;
  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once:true }), 0);
}

function openClientViewPopup(id) {
  const client = getClient(id);
  if (!client) return;

  showModal(`
    <h2>${escapeHtml(client.name)}</h2>

    <div class="detail-list">
      <div><strong>E-mail</strong><span>${escapeHtml(client.email)}</span></div>
      <div><strong>Telefone</strong><span>${escapeHtml(client.phone)}</span></div>
      <div><strong>Projetos</strong><span>${escapeHtml(clientProjectNames(client.id))}</span></div>
      <div><strong>Status</strong><span>${escapeHtml(client.status || "active")}</span></div>
    </div>

    <div class="modal-actions">
      <button class="btn" onclick="closeModal();openClientModal('${escapeHtml(client.id)}')">
        Editar
      </button>

      <button class="btn btn-danger" onclick="confirmDeleteClient('${escapeHtml(client.id)}')">
        Excluir
      </button>
    </div>
  `);
}

function openClientModal(id = null) {
  state.editingClientId = id;

  const client = id
    ? getClient(id)
    : {
        name: "",
        email: "",
        phone: "",
        projectId: ""
      };

  if (!client) return;

  showModal(`
    <h2>${id ? "Editar cliente" : "Novo cliente"}</h2>

    <label>Nome</label>
    <input id="client-name" value="${escapeHtml(client.name)}">

    <label>E-mail</label>
    <input id="client-email" type="email" value="${escapeHtml(client.email)}">

    <label>Telefone</label>
    <input id="client-phone" value="${escapeHtml(client.phone)}">

    <label>Projeto</label>
    <select id="client-project">
      <option value="">Sem projeto</option>
      ${state.projects.map(project => `
        <option
          value="${escapeHtml(project.id)}"
          ${String(client.projectId || "") === String(project.id) ? "selected" : ""}>
          ${escapeHtml(project.name)}
        </option>
      `).join("")}
    </select>

    <label>${id ? "Nova senha (opcional)" : "Senha (opcional)"}</label>
    <input
      id="client-password"
      type="password"
      autocomplete="new-password"
      minlength="8"
      placeholder="${id ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}">
    <small class="form-help">
      ${id
        ? "Preencha só se quiser redefinir a senha deste cliente."
        : "Se deixar em branco, o cliente cria a própria senha em \"Primeiro acesso\" na tela de login, usando este mesmo e-mail."}
    </small>

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveClient()">
        Salvar
      </button>
    </div>
  `);
}

async function saveClient() {
  const name = $("client-name")?.value.trim();
  const email = $("client-email")?.value.trim();
  const phone = $("client-phone")?.value.trim();
  const projectId = $("client-project")?.value || "";
  const password = $("client-password")?.value || "";

  if (!name) {
    toast("Informe o nome do cliente.", "error");
    return;
  }

  if (!email) {
    toast("Informe o e-mail do cliente.", "error");
    return;
  }

  if (password && password.length < 8) {
    toast("A senha deve ter pelo menos 8 caracteres.", "error");
    return;
  }

  const body = { name, email, phone, projectId };

  if (password) body.password = password;

  try {
    const result = state.editingClientId
      ? await API.put("/api/data/clients", {
          id: state.editingClientId,
          ...body
        })
      : await API.post("/api/data/clients", body);

    if (result?.error) {
      toast(result.error, "error");
      return;
    }

    closeModal();
    toast("Cliente salvo.");
    await refreshData();
  } catch (error) {
    console.error(error);
    toast("Erro ao salvar cliente.", "error");
  }
}

function confirmDeleteClient(id) {
  confirmModal(
    "Excluir este cliente?",
    () => deleteClient(id),
    "Excluir"
  );
}

async function deleteClient(id) {
  try {
    const result = await API.del(
      `/api/data/clients?id=${encodeURIComponent(id)}`
    );

    if (result?.error) {
      toast(result.error, "error");
      return;
    }

    closeModal();
    toast("Cliente excluído.");
    await refreshData();
  } catch (error) {
    console.error(error);
    toast("Erro ao excluir cliente.", "error");
  }
}

/* =========================================================
   PROJETOS
   ========================================================= */

function renderProjects() {
  const wrap = $("projects-table-wrap");
  if (!wrap) return;

  const search = state.projectSearch.toLowerCase().trim();
  const status = state.projectStatus || "";
  const sort = state.projectSort || "name-asc";

  const dateValue = project => {
    const value = project.createdAt || project.created_at || project.updatedAt || project.updated_at || project.date || 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const projects = [...state.projects]
    .filter(project => {
      const matchesSearch = !search || String(project.name || "").toLowerCase().includes(search);
      const matchesStatus = !status || String(project.status || "") === status;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sort === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""), "pt-BR");
      if (sort === "date-desc") return dateValue(b) - dateValue(a);
      if (sort === "date-asc") return dateValue(a) - dateValue(b);
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });

  if (!projects.length) {
    wrap.innerHTML = `<div class="empty-state">Nenhum projeto encontrado.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Projeto</th>
          <th>Status</th>
          <th>Leads</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${projects.map(project => {
          const leads = getUnseenLeadsCount(project.id);
          const statusClass = STATUS_BADGE[project.status] || "badge-muted";
          const typeKey = String(project.projectType || project.type || "site").toLowerCase();
          const typeClass = typeKey === "page" ? "page" : (typeKey === "loja" || typeKey === "store" ? "loja" : "site");
          const typeLabel = typeClass === "page" ? "Page" : (typeClass === "loja" ? "Loja" : "Site");
          return `
            <tr class="row-clickable" onclick="openProjectModal('${escapeHtml(project.id)}')">
              <td><strong>${escapeHtml(project.name)}</strong><div class="project-type-tag project-type-${typeClass}">${typeLabel}</div></td>
              <td><span class="badge ${statusClass}">${escapeHtml(project.status)}</span></td>
              <td>${leads ? `<span class="badge badge-danger">${leads}</span>` : "—"}</td>
              <td onclick="event.stopPropagation()">
                <div class="row-actions project-row-actions">
                  <button class="btn btn-primary btn-sm" title="Editar projeto" onclick="openProjectModal('${escapeHtml(project.id)}')">✎ <span>Editar</span></button>
                  <button class="btn btn-ghost btn-sm" title="Abrir CRM do projeto" onclick="state.crmProjectId='${escapeHtml(project.id)}';switchSection('leads')">♙ <span>CRM</span></button>
                  <button class="icon-btn" title="Mais opções" onclick="openProjectActionsMenu(event,'${escapeHtml(project.id)}')">⋯</button>
                </div>
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function handleProjectSearch(value) {
  state.projectSearch = value;
  renderProjects();
}

function handleProjectSort(value) {
  state.projectSort = value || "name-asc";
  renderProjects();
}

function handleProjectStatus(value) {
  state.projectStatus = value || "";
  renderProjects();
}


function openProjectActionsMenu(event, id) {
  event.stopPropagation();

  document.querySelector(".project-actions-menu")?.remove();

  const menu = document.createElement("div");
  menu.className = "project-actions-menu";

  menu.innerHTML = `
    <button onclick="openProjectViewPopup('${escapeHtml(id)}')">
      Visualizar
    </button>

    <button onclick="openProjectModal('${escapeHtml(id)}')">
      Editar
    </button>

    <button class="danger" onclick="confirmDeleteProject('${escapeHtml(id)}')">
      Excluir
    </button>
  `;

  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener(
      "click",
      () => menu.remove(),
      { once: true }
    );
  });
}

function openProjectViewPopup(id) {
  const project = getProject(id);
  if (!project) return;

  showModal(`
    <h2>${escapeHtml(project.name)}</h2>

    <div class="detail-list">
      <div>
        <strong>Status</strong>
        <span>${escapeHtml(project.status)}</span>
      </div>

      <div>
        <strong>Cliente</strong>
        <span>${escapeHtml(getClient(project.clientId)?.name || "Não vinculado")}</span>
      </div>

      <div>
        <strong>Site</strong>
        <span>${escapeHtml(project.siteUrl || "—")}</span>
      </div>

      <div>
        <strong>WhatsApp</strong>
        <span>${escapeHtml(project.contact?.whatsapp || "—")}</span>
      </div>

      <div>
        <strong>E-mail</strong>
        <span>${escapeHtml(project.contact?.email || "—")}</span>
      </div>

      <div>
        <strong>ID</strong>
        <span>${escapeHtml(project.id)}</span>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn" onclick="closeModal();openProjectModal('${escapeHtml(project.id)}')">
        Editar
      </button>

      <button class="btn btn-danger" onclick="confirmDeleteProject('${escapeHtml(project.id)}')">
        Excluir
      </button>
    </div>
  `);
}

/* =========================================================
   EDITOR DE PROJETO
   ========================================================= */

function openProjectModal(id = null) {
  state.editingProjectId = id;
  state.projectTab = "geral";

  const project = id ? getProject(id) : defaultProject();
  if (!project) return;

  state.projectDraft = normalizeProject(project);

  const tabs = [
    ["geral", "Geral"],
    ["config", "Configuração"]
  ];

  if (id) {
    tabs.push(
      ["content", "Conteúdo"],
      ["media", "Mídia"],
      ["location", "Localização"],
      ["reviews", "Reviews"],
      ["seo", "SEO"],
      ["scripts", "Scripts"],
      ["acesso", "Acesso"],
      ["leads", "Leads"],
      ["loja", "Loja"]
    );
  }

  showModal(`
    <div class="project-editor">
      <div class="project-tabs">
        ${tabs.map(([key, label]) => `
          <button
            class="project-tab ${key === "geral" ? "active" : ""}"
            data-tab="${key}">
            ${label}
          </button>
        `).join("")}
      </div>

      <div id="project-tab-content"></div>
    </div>
  `, "900px");

  document.querySelectorAll(".project-tab").forEach(button => {
    button.addEventListener("click", () => {
      state.projectTab = button.dataset.tab;

      document.querySelectorAll(".project-tab").forEach(tab => {
        tab.classList.toggle(
          "active",
          tab.dataset.tab === state.projectTab
        );
      });

      renderProjectTab();
    });
  });

  renderProjectTab();
}

const PROJECT_TABS = {
  geral: renderProjectGeneral,
  config: renderProjectConfig,
  content: renderProjectContent,
  media: renderProjectMedia,
  location: renderProjectLocation,
  reviews: renderProjectReviews,
  seo: renderProjectSeo,
  scripts: renderProjectScripts,
  acesso: renderProjectAccess,
  leads: renderProjectLeads,
  // renderProjectShop mora em js/shop.js, carregado depois deste arquivo;
  // a função-seta só resolve o nome na hora do clique, não na hora da leitura deste objeto.
  loja: (el) => renderProjectShop(el)
};

function renderProjectTab() {
  const renderer = PROJECT_TABS[state.projectTab];
  if (renderer) renderer($("project-tab-content"));
}

/* =========================================================
   ABA — GERAL
   ========================================================= */

function renderProjectGeneral(el) {
  const p = state.projectDraft;

  el.innerHTML = `
    <label>Nome do projeto</label>
    <input id="p-name" value="${escapeHtml(p.name)}">

    <label>Tipo de projeto</label>
    <select id="p-project-type">
      <option value="page" ${p.projectType === "page" ? "selected" : ""}>Page</option>
      <option value="site" ${p.projectType === "site" ? "selected" : ""}>Site</option>
      <option value="loja" ${p.projectType === "loja" ? "selected" : ""}>Loja</option>
    </select>

    <label>Status</label>
    <select id="p-status">
      ${["Em produção", "Em desenvolvimento", "Pausado"].map(status => `
        <option ${p.status === status ? "selected" : ""}>
          ${status}
        </option>
      `).join("")}
    </select>

    <label>URL do site</label>
    <input id="p-site-url" value="${escapeHtml(p.siteUrl)}">

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — CONFIGURAÇÃO
   ========================================================= */

function renderProjectConfig(el) {
  const p = state.projectDraft;

  el.innerHTML = `
    <h3>Tracking</h3>

    <label>Meta Pixel</label>
    <input id="p-pixel" value="${escapeHtml(p.tracking.pixel)}">

    <label>Google Tag / GTM</label>
    <input id="p-tag" value="${escapeHtml(p.tracking.tag)}">

    <label>Google Analytics</label>
    <input id="p-analytics" value="${escapeHtml(p.tracking.analytics)}">

    <h3>Contato</h3>

    <label>WhatsApp</label>
    <input id="p-whatsapp" value="${escapeHtml(p.contact.whatsapp)}">

    <label>E-mail</label>
    <input id="p-email" value="${escapeHtml(p.contact.email)}">

    <label>Telefone</label>
    <input id="p-phone" value="${escapeHtml(p.contact.phone)}">

    <h3>Redes sociais</h3>

    ${[
      ["facebook", "Facebook"],
      ["instagram", "Instagram"],
      ["tiktok", "TikTok"],
      ["youtube", "YouTube"],
      ["linkedin", "LinkedIn"]
    ].map(([key, label]) => `
      <label>${label}</label>
      <input id="p-${key}" value="${escapeHtml(p.social[key])}">
    `).join("")}

    <label>Formspree</label>
    <input id="p-formspree" value="${escapeHtml(p.formspree)}">

    <div class="modal-actions">
      <button class="btn" onclick="copyTrackingSnippet()">
        Copiar tracking
      </button>

      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>

    <div id="tracking-preview"></div>
  `;

  renderTrackingPreview();
}

function renderTrackingPreview() {
  const el = $("tracking-preview");
  const p = state.projectDraft;

  if (!el) return;

  const items = [];

  if (p.contact.whatsapp) items.push("WhatsApp");
  if (p.contact.email) items.push("E-mail");
  if (p.contact.phone) items.push("Telefone");

  el.innerHTML = items.length
    ? `<div class="preview-box">${items.map(escapeHtml).join(" · ")}</div>`
    : "";
}

async function copyTrackingSnippet() {
  const pixel = $("p-pixel")?.value.trim();
  const analytics = $("p-analytics")?.value.trim();

  let code = "";

  if (pixel) {
    code += `
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixel}');
fbq('track','PageView');
</script>`.trim();
  }

  if (analytics) {
    code += `

<script async src="https://www.googletagmanager.com/gtag/js?id=${analytics}"></script>
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${analytics}');
</script>`.trim();
  }

  if (!code) {
    toast("Nenhum tracking configurado.", "error");
    return;
  }

  await navigator.clipboard.writeText(code);
  toast("Código copiado.");
}

/* =========================================================
   ABA — CONTEÚDO
   ========================================================= */

function renderProjectContent(el) {
  const c = state.projectDraft.content;

  const fields = [
    ["name", "Nome"],
    ["job", "Profissão"],
    ["headline", "Título principal"],
    ["description", "Descrição"],
    ["specialization", "Especialização"],
    ["experience", "Experiência"],
    ["address", "Endereço"],
    ["registration", "Registro"]
  ];

  el.innerHTML = fields.map(([key, label]) => `
    <label>${label}</label>
    ${key === "description"
      ? `<textarea id="c-${key}">${escapeHtml(c[key])}</textarea>`
      : `<input id="c-${key}" value="${escapeHtml(c[key])}">`
    }
  `).join("") + `
    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — MÍDIA
   ========================================================= */

function renderProjectMedia(el) {
  const m = state.projectDraft.media;

  el.innerHTML = `
    <label>Galeria — uma URL por linha</label>
    <textarea id="m-gallery">${escapeHtml(
      Array.isArray(m.galleryImages)
        ? m.galleryImages.join("\n")
        : ""
    )}</textarea>

    <label>
      <input
        type="checkbox"
        id="m-gallery-enabled"
        ${m.galleryEnabled ? "checked" : ""}>
      Ativar galeria
    </label>

    <label>Vídeo</label>
    <input id="m-video" value="${escapeHtml(m.video)}">

    <label>
      <input
        type="checkbox"
        id="m-video-enabled"
        ${m.videoEnabled ? "checked" : ""}>
      Ativar vídeo
    </label>

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — LOCALIZAÇÃO
   ========================================================= */

function renderProjectLocation(el) {
  const l = state.projectDraft.location;

  el.innerHTML = `
    <label>Endereço</label>
    <input id="l-address" value="${escapeHtml(l.address)}">

    <label>URL do Google Maps</label>
    <input id="l-maps-url" value="${escapeHtml(l.mapsUrl)}">

    <label>Embed</label>
    <textarea id="l-embed">${escapeHtml(l.embed)}</textarea>

    <label>
      <input
        type="checkbox"
        id="l-enabled"
        ${l.enabled ? "checked" : ""}>
      Ativar localização
    </label>

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — REVIEWS
   ========================================================= */

function renderProjectReviews(el) {
  const r = state.projectDraft.reviews;

  el.innerHTML = `
    <label>Google Place ID</label>
    <input id="r-place-id" value="${escapeHtml(r.placeId)}">

    <label>
      <input
        type="checkbox"
        id="r-enabled"
        ${r.enabled ? "checked" : ""}>
      Ativar avaliações
    </label>

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>

    <div id="reviews-preview"></div>
  `;

  if (state.editingProjectId) {
    previewGoogleReviews(state.editingProjectId);
  }
}

async function previewGoogleReviews(projectId) {
  const el = $("reviews-preview");
  if (!el) return;

  el.innerHTML = `<div class="loading">Carregando avaliações...</div>`;

  try {
    const data = await API.get(`/api/public/reviews/${encodeURIComponent(projectId)}`);

    if (data?.disabled) {
      el.innerHTML = `<div class="empty-state">Reviews desativadas.</div>`;
      return;
    }

    if (data?.error) {
      el.innerHTML = `<div class="empty-state">${escapeHtml(data.error)}</div>`;
      return;
    }

    const rating = Number(data.rating || 0);
    const total = Number(data.user_ratings_total || data.totalReviews || 0);

    el.innerHTML = `
      <div class="reviews-summary">
        <strong>${rating.toFixed(1)} ★</strong>
        <span>${total} avaliações</span>
      </div>

      ${(data.reviews || []).map(review => `
        <div class="review-item">
          <strong>${escapeHtml(review.author_name || "Cliente")}</strong>
          <span>${escapeHtml(review.relative_time_description || "")}</span>
          <p>${escapeHtml(review.text || "")}</p>
        </div>
      `).join("")}
    `;
  } catch (error) {
    console.error(error);
    el.innerHTML = `<div class="empty-state">Erro ao carregar avaliações.</div>`;
  }
}

/* =========================================================
   ABA — SEO
   ========================================================= */

function renderProjectSeo(el) {
  const s = state.projectDraft.seo;

  el.innerHTML = `
    <label>Título</label>
    <input id="s-title" value="${escapeHtml(s.title)}">

    <label>Descrição</label>
    <textarea id="s-description">${escapeHtml(s.description)}</textarea>

    <label>Imagem OG</label>
    <input id="s-og-image" value="${escapeHtml(s.ogImage)}">

    <label>Canonical</label>
    <input id="s-canonical" value="${escapeHtml(s.canonical)}">

    <label>Palavras-chave</label>
    <input id="s-keywords" value="${escapeHtml(s.keywords)}">

    <label>Robots</label>
    <input id="s-robots" value="${escapeHtml(s.robots)}">

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — SCRIPTS
   ========================================================= */

function renderProjectScripts(el) {
  const s = state.projectDraft.scripts;

  el.innerHTML = `
    <label>Head</label>
    <textarea id="sc-head">${escapeHtml(s.head)}</textarea>

    <label>Body</label>
    <textarea id="sc-body">${escapeHtml(s.body)}</textarea>

    <label>Footer</label>
    <textarea id="sc-footer">${escapeHtml(s.footer)}</textarea>

    <div class="modal-actions">
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — ACESSO
   ========================================================= */

const CLIENT_ACCESS_MODULES = {
  configuracao: { label: "Configuração", description: "Informações básicas, tracking, contato e redes sociais.", icon: "⚙" },
  content: { label: "Conteúdo", description: "Textos, apresentação, especialização e informações profissionais.", icon: "✦" },
  media: { label: "Mídia", description: "Galeria, imagens e vídeos do projeto.", icon: "▧" },
  location: { label: "Localização", description: "Endereço, mapa e informações de localização.", icon: "⌖" },
  reviews: { label: "Reviews", description: "Avaliações e integração com Google Reviews.", icon: "★" },
  seo: { label: "SEO", description: "Título, descrição, canonical, imagem e indexação.", icon: "◎" },
  scripts: { label: "Scripts", description: "Códigos Head, Body e Footer.", icon: "</>" },
  leads: { label: "Leads", description: "Visualização dos leads recebidos pelo projeto e CRM.", icon: "♙" },
  ecommerce: { label: "Loja", description: "Cadastro de produtos da loja virtual do projeto.", icon: "🛒" }
};

function getAccessModules(p) {
  const editable = Array.isArray(p?.access?.editable) ? p.access.editable : [];
  if (!editable.length && p?.access?.configured !== true) {
    return Object.fromEntries(Object.keys(CLIENT_ACCESS_MODULES).map(k => [k, true]));
  }
  if (editable.some(x => ["page", "site", "loja"].includes(x))) {
    return {
      configuracao: editable.some(x => ["page", "site", "loja"].includes(x)),
      content: editable.some(x => ["page", "site", "loja"].includes(x)),
      media: editable.some(x => ["site", "loja"].includes(x)),
      location: editable.some(x => ["site", "loja"].includes(x)),
      reviews: editable.some(x => ["site", "loja"].includes(x)),
      seo: editable.some(x => ["site", "loja"].includes(x)),
      scripts: editable.some(x => ["site", "loja"].includes(x)),
      leads: editable.some(x => ["site", "loja"].includes(x))
    };
  }
  return Object.fromEntries(Object.keys(CLIENT_ACCESS_MODULES).map(k => [k, editable.includes(k)]));
}

function renderClientPermissions(p) {
  const modules = getAccessModules(p);
  return `
    <div class="access-heading">
      <div><h3>Acesso do cliente</h3><p class="form-help">Cada módulo é independente. O padrão é <strong>liberado</strong>; desmarque manualmente o que quiser bloquear.</p></div>
      <span class="access-default-badge">ACESSO LIBERADO</span>
    </div>
    <div class="client-access-grid client-access-modules">
      ${Object.entries(CLIENT_ACCESS_MODULES).map(([key, info]) => `
        <label class="client-access-card ${modules[key] ? "is-on" : ""}">
          <span class="client-access-check"><input type="checkbox" data-access-module="${key}" ${modules[key] ? "checked" : ""} onchange="toggleAccessModule('${key}', this.checked)"></span>
          <span class="client-access-icon">${info.icon}</span>
          <span class="client-access-copy"><strong>${escapeHtml(info.label)}</strong><small>${escapeHtml(info.description)}</small></span>
          <span class="client-access-status">${modules[key] ? "Acesso liberado" : "Bloqueado"}</span>
        </label>`).join("")}
    </div>`;
}
function toggleAccessModule(module, on) {
  const card = document.querySelector(`[data-access-module="${module}"]`)?.closest(".client-access-card");
  card?.classList.toggle("is-on", on);
  const status = card?.querySelector(".client-access-status");
  if (status) status.textContent = on ? "Acesso liberado" : "Bloqueado";
}
window.toggleAccessModule = toggleAccessModule;
function collectClientPermissions() {
  return { editable: [...document.querySelectorAll("[data-access-module]:checked")].map(input => input.dataset.accessModule), configured: true };
}

function renderProjectAccess(el) {
  const p = state.projectDraft;

  const linkedClient =
    getClient(p.clientId) ||
    state.clients.find(client =>
      String(client.projectId || "") === String(p.id || "")
    );

  el.innerHTML = `
    <h3>Acesso do cliente</h3>

    <p class="form-help">
      Cada cliente possui um único login e pode acessar apenas seus projetos.
    </p>

    <label>Cliente responsável</label>

    <select id="a-client">
      <option value="">Nenhum cliente vinculado</option>

      ${state.clients.map(client => `
        <option
          value="${escapeHtml(client.id)}"
          ${String(linkedClient?.id || p.clientId || "") === String(client.id) ? "selected" : ""}>
          ${escapeHtml(client.name)} — ${escapeHtml(client.email)}
        </option>
      `).join("")}
    </select>

    ${
      linkedClient
        ? `
          <div class="preview-box">
            <strong>${escapeHtml(linkedClient.name)}</strong><br>
            ${escapeHtml(linkedClient.email)}<br>
            <small>Status: ${escapeHtml(linkedClient.status || "active")}</small>
          </div>

          <div class="modal-actions">
            <button
              class="btn"
              onclick="closeModal();openClientModal('${escapeHtml(linkedClient.id)}')">
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
      <button class="btn btn-primary modal-save-floating" onclick="saveProject()">
        Salvar acesso
      </button>
    </div>
  `;
}

/* =========================================================
   ABA — LEADS
   ========================================================= */

async function renderProjectLeads(el) {
  const projectId = state.editingProjectId;

  if (!projectId) {
    el.innerHTML = `<div class="empty-state">Salve o projeto primeiro.</div>`;
    return;
  }

  markLeadsSeen(projectId);

  el.innerHTML = `<div class="loading">Carregando leads...</div>`;

  try {
    const leads = unwrapList(
      await API.get(`/api/data/leads/${encodeURIComponent(projectId)}`),
      "leads"
    );

    if (!leads.length) {
      el.innerHTML = `<div class="empty-state">Nenhum lead encontrado.</div>`;
      return;
    }

    el.innerHTML = leads.map(lead => `
      <div class="lead-item">
        <strong>${escapeHtml(lead.name || "Sem nome")}</strong>

        <span>${escapeHtml(lead.email || "")}</span>

        <span>${escapeHtml(lead.phone || "")}</span>

        <p>${escapeHtml(lead.message || "")}</p>

        <small>
          ${escapeHtml(
            lead.createdAt
              ? new Date(lead.createdAt).toLocaleString("pt-BR")
              : ""
          )}
        </small>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    el.innerHTML = `<div class="empty-state">Erro ao carregar leads.</div>`;
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
  const info = state.leadsByProject?.[projectId];

  if (!info?.latestCreatedAt) return 0;

  const seen = localStorage.getItem(getSeenKey(projectId));

  if (!seen) return Number(info.count || 0);

  return new Date(info.latestCreatedAt) > new Date(seen)
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
    p.name = $("p-name")?.value.trim();
    p.projectType = $("p-project-type")?.value || "site";
    p.status = $("p-status")?.value;
    p.siteUrl = $("p-site-url")?.value.trim();
  }

  if (state.projectTab === "config") {
    p.tracking = {
      pixel: $("p-pixel")?.value.trim(),
      tag: $("p-tag")?.value.trim(),
      analytics: $("p-analytics")?.value.trim()
    };

    p.contact = {
      whatsapp: $("p-whatsapp")?.value.trim(),
      email: $("p-email")?.value.trim(),
      phone: $("p-phone")?.value.trim()
    };

    p.social = {
      facebook: $("p-facebook")?.value.trim(),
      instagram: $("p-instagram")?.value.trim(),
      tiktok: $("p-tiktok")?.value.trim(),
      youtube: $("p-youtube")?.value.trim(),
      linkedin: $("p-linkedin")?.value.trim()
    };

    p.formspree = $("p-formspree")?.value.trim();
  }

  if (state.projectTab === "content") {
    p.content = {
      name: $("c-name")?.value.trim(),
      job: $("c-job")?.value.trim(),
      headline: $("c-headline")?.value.trim(),
      description: $("c-description")?.value.trim(),
      specialization: $("c-specialization")?.value.trim(),
      experience: $("c-experience")?.value.trim(),
      address: $("c-address")?.value.trim(),
      registration: $("c-registration")?.value.trim()
    };
  }

  if (state.projectTab === "media") {
    p.media = {
      galleryImages: ($("m-gallery")?.value || "")
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean),
      galleryEnabled: $("m-gallery-enabled")?.checked || false,
      video: $("m-video")?.value.trim(),
      videoEnabled: $("m-video-enabled")?.checked || false
    };
  }

  if (state.projectTab === "location") {
    p.location = {
      address: $("l-address")?.value.trim(),
      mapsUrl: $("l-maps-url")?.value.trim(),
      embed: $("l-embed")?.value.trim(),
      enabled: $("l-enabled")?.checked || false
    };
  }

  if (state.projectTab === "reviews") {
    p.reviews = {
      placeId: $("r-place-id")?.value.trim(),
      enabled: $("r-enabled")?.checked || false
    };
  }

  if (state.projectTab === "seo") {
    p.seo = {
      title: $("s-title")?.value.trim(),
      description: $("s-description")?.value.trim(),
      ogImage: $("s-og-image")?.value.trim(),
      canonical: $("s-canonical")?.value.trim(),
      keywords: $("s-keywords")?.value.trim(),
      robots: $("s-robots")?.value.trim()
    };
  }

  if (state.projectTab === "scripts") {
    p.scripts = {
      head: $("sc-head")?.value || "",
      body: $("sc-body")?.value || "",
      footer: $("sc-footer")?.value || ""
    };
  }

  if (state.projectTab === "acesso") {
    p.clientId = $("a-client")?.value || "";
    p.access = collectClientPermissions();
  }

  if (!p.name) {
    toast("Informe o nome do projeto.", "error");
    return;
  }

  try {
    const result = state.editingProjectId
      ? await API.put("/api/data/projects", {
          id: state.editingProjectId,
          ...p
        })
      : await API.post("/api/data/projects", p);

    if (result?.error) {
      toast(result.error, "error");
      return;
    }

    toast("Projeto salvo.");
    closeModal();
    await refreshData();

    if (state.editingProjectId) {
      const updated = getProject(state.editingProjectId);
      if (updated) state.projectDraft = normalizeProject(updated);
    }
  } catch (error) {
    console.error(error);
    toast("Erro ao salvar projeto.", "error");
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
    const result = await API.del(
      `/api/data/projects?id=${encodeURIComponent(id)}`
    );

    if (result?.error) {
      toast(result.error, "error");
      return;
    }

    toast("Projeto excluído.");
    await refreshData();
  } catch (error) {
    console.error(error);
    toast("Erro ao excluir projeto.", "error");
  }
}

/* =========================================================
   MODAIS
   ========================================================= */

function showModal(content, maxWidth = "480px") {
  closeModal();

  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <div class="modal" style="max-width:${maxWidth}">
      <button
        class="modal-close"
        onclick="closeModal()"
        aria-label="Fechar">
        ×
      </button>

      ${content}
    </div>
  `;

  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeModal();
  });

  document.body.appendChild(overlay);
}

function closeModal() {
  $("modal-overlay")?.remove();
}

function confirmModal(message, onConfirm, label = "Confirmar") {
  showModal(`
    <h2>Confirmação</h2>

    <p>${escapeHtml(message)}</p>

    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">
        Cancelar
      </button>

      <button
        id="confirm-modal-yes"
        class="btn btn-danger">
        ${escapeHtml(label)}
      </button>
    </div>
  `);

  $("confirm-modal-yes")?.addEventListener("click", () => {
    closeModal();
    onConfirm();
  });
}

/* =========================================================
   EXPORTAÇÕES PARA HTML INLINE
   ========================================================= */

window.switchSection = switchSection;
window.handleClientSearch = handleClientSearch;
window.handleProjectSearch = handleProjectSearch;
window.openClientModal = openClientModal;
window.openClientViewPopup = openClientViewPopup;
window.openClientActionsMenu = openClientActionsMenu;
window.saveClient = saveClient;
window.confirmDeleteClient = confirmDeleteClient;

window.openProjectModal = openProjectModal;
window.openProjectViewPopup = openProjectViewPopup;
window.openProjectActionsMenu = openProjectActionsMenu;
window.saveProject = saveProject;
window.confirmDeleteProject = confirmDeleteProject;

window.copyTrackingSnippet = copyTrackingSnippet;
window.closeModal = closeModal;
