// ================================================================
// V8 ADMIN — Universal | Lógica completa do painel
// ================================================================

const CLIENT_FIELD_LABELS = {

  "tracking.pixel":
    "Meta Pixel",

  "tracking.tag":
    "Google Tag (GTM)",

  "tracking.analytics":
    "Google Analytics",

  "contact.whatsapp":
    "WhatsApp",

  "contact.email":
    "E-mail",

  "contact.phone":
    "Telefone",

  "social.facebook":
    "Facebook",

  "social.instagram":
    "Instagram",

  "social.tiktok":
    "TikTok",

  "social.youtube":
    "YouTube",

  "social.linkedin":
    "LinkedIn",

  "formspree":
    "Formspree",

};


// ================================================================
// ESTADO
// ================================================================

const state = {

  section:
    "dashboard",

  clients:
    [],

  projects:
    [],

  editingClientId:
    null,

  editingProjectId:
    null,

  projectTab:
    "geral",

  _editingProjectDraft:
    null,

  _lastGeneratedToken:
    null,

  clientSearch:
    "",

  projectSearch:
    "",

  leadsByProject:
    {},

};


// ================================================================
// UTILITÁRIO DOM
// ================================================================

function $(id) {

  return document.getElementById(id);

}


// ================================================================
// TOAST
// ================================================================

function toast(
  message,
  type = "success"
) {

  const el =
    document.createElement(
      "div"
    );

  el.className =
    `toast ${type}`;

  el.textContent =
    message;

  document.body.appendChild(
    el
  );

  setTimeout(
    () => {

      if (
        el &&
        el.parentNode
      ) {

        el.remove();

      }

    },
    3200
  );

}


// ================================================================
// MANTER SÓ DÍGITOS (WhatsApp/telefone)
// ================================================================

function applyDigitsOnly(el) {
  const cursorFromEnd = el.value.length - el.selectionStart;
  el.value = el.value.replace(/\D/g, "");
  const pos = Math.max(0, el.value.length - cursorFromEnd);
  el.setSelectionRange(pos, pos);
}


// ================================================================
// ESCAPAR HTML
// ================================================================

function escapeHtml(str) {

  if (
    str === null ||
    str === undefined
  ) {

    return "";

  }

  return String(str)

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


// ================================================================
// GET POR CAMINHO
// ================================================================

function getByPath(
  obj,
  path
) {

  return path.split(".").reduce(

    (o, k) =>
      o
        ? o[k]
        : undefined,

    obj

  );

}


// ================================================================
// SET POR CAMINHO
// ================================================================

function setByPath(
  obj,
  path,
  value
) {

  const keys =
    path.split(".");

  let cur =
    obj;

  for (
    let i = 0;
    i < keys.length - 1;
    i++
  ) {

    if (
      typeof cur[keys[i]] !==
        "object" ||
      cur[keys[i]] === null
    ) {

      cur[keys[i]] =
        {};

    }

    cur =
      cur[keys[i]];

  }

  cur[
    keys[keys.length - 1]
  ] =
    value;

}


// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    try {

      // ----------------------------------------------------------
      // SEGURANÇA
      // ----------------------------------------------------------

      if (
        typeof Auth !==
        "undefined"
      ) {

        Auth.requireAdmin();

      }


      // ----------------------------------------------------------
      // TEMA
      // ----------------------------------------------------------

      applyStoredTheme();

      setupNav();

      setupMobileMenu();

      setupThemeToggle();


      // ----------------------------------------------------------
      // PAINEL INICIAL
      // ----------------------------------------------------------

      switchSection(
        "dashboard"
      );


      // ----------------------------------------------------------
      // DADOS
      // ----------------------------------------------------------

      await refreshAllData();


    } catch (error) {

      console.error(
        "Erro ao inicializar painel:",
        error
      );

      toast(
        "Erro ao carregar o painel.",
        "error"
      );

    }

  }
);


// ================================================================
// NAVEGAÇÃO
// ================================================================

function setupNav() {

  document
    .querySelectorAll(
      ".nav-item[data-section]"
    )
    .forEach(
      (btn) => {

        btn.addEventListener(
          "click",
          () => {

            switchSection(
              btn.dataset.section
            );

          }
        );

      }
    );


  const logoutBtn =
    $("logout-btn");


  if (
    logoutBtn
  ) {

    logoutBtn.addEventListener(
      "click",
      () => {

        if (
          typeof Auth !==
          "undefined"
        ) {

          Auth.logout();

        }

      }
    );

  }

}


// ================================================================
// MENU MOBILE (hamburger)
// ================================================================

function setupMobileMenu() {

  const hamburger = $("hamburger-btn");
  const sidebar = $("sidebar");
  const overlay = $("sidebar-overlay");

  if (!hamburger || !sidebar || !overlay) return;

  function closeMenu() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    hamburger.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    const isOpen = sidebar.classList.toggle("open");
    overlay.classList.toggle("open", isOpen);
    hamburger.setAttribute("aria-expanded", String(isOpen));
  }

  hamburger.addEventListener("click", toggleMenu);
  overlay.addEventListener("click", closeMenu);

  window._closeMobileMenu = closeMenu;
}


// ================================================================
// TROCAR SEÇÃO
// ================================================================

function switchSection(
  name
) {

  state.section =
    name;

  if (typeof window._closeMobileMenu === "function") {
    window._closeMobileMenu();
  }


  document
    .querySelectorAll(
      ".nav-item[data-section]"
    )
    .forEach(
      (btn) => {

        btn.classList.toggle(
          "active",
          btn.dataset.section ===
            name
        );

      }
    );


  document
    .querySelectorAll(
      ".section"
    )
    .forEach(
      (sec) => {

        sec.classList.toggle(
          "hidden",
          sec.dataset.section !==
            name
        );

      }
    );


  if (
    name ===
    "dashboard"
  ) {

    renderDashboard();

  }


  if (
    name ===
    "clients"
  ) {

    renderClients();

  }


  if (
    name ===
    "projects"
  ) {

    renderProjects();

  }

}


// ================================================================
// CARREGAR DADOS
// ================================================================

async function refreshAllData() {

  try {

    const [
      clientsRes,
      projectsRes,
      statsRes
    ] =
      await Promise.all([

        API.get(
          "/api/data/clients"
        ),

        API.get(
          "/api/data/projects"
        ),

        API.get(
          "/api/dashboard/stats"
        )

      ]);


    state.clients =
      Array.isArray(
        clientsRes
      )
        ? clientsRes
        : [];


    state.projects =
      Array.isArray(
        projectsRes
      )
        ? projectsRes
        : [];

    state.leadsByProject =
      (statsRes && !statsRes.error && statsRes.leadsByProject) || {};


    switchSection(
      state.section
    );


  } catch (error) {

    console.error(
      "Erro ao carregar dados:",
      error
    );


    state.clients =
      [];

    state.projects =
      [];


    toast(
      "Não foi possível carregar os dados.",
      "error"
    );

  }

}


// ================================================================
// TEMA
// ================================================================

function applyStoredTheme() {

  const saved =
    localStorage.getItem(
      "v8_theme"
    ) ||
    "dark";


  document.documentElement
    .setAttribute(
      "data-theme",
      saved
    );

}


function setupThemeToggle() {

  const toggle =
    $("theme-toggle");


  if (
    !toggle
  ) {

    return;

  }


  toggle.checked =
    document.documentElement
      .getAttribute(
        "data-theme"
      ) ===
      "light";


  toggle.addEventListener(
    "change",
    () => {

      const theme =
        toggle.checked
          ? "light"
          : "dark";


      document.documentElement
        .setAttribute(
          "data-theme",
          theme
        );


      localStorage.setItem(
        "v8_theme",
        theme
      );

    }
  );

}


// ================================================================
// DASHBOARD
// ================================================================

async function renderDashboard() {

  const wrap =
    $("dashboard-stats");


  if (
    !wrap
  ) {

    return;

  }


  wrap.innerHTML = `

    <div class="stat-card">

      <div class="value">
        …
      </div>

      <div class="label">
        Carregando
      </div>

    </div>


    <div class="stat-card">

      <div class="value">
        …
      </div>

      <div class="label">
        Carregando
      </div>

    </div>


    <div class="stat-card">

      <div class="value">
        …
      </div>

      <div class="label">
        Carregando
      </div>

    </div>

  `;


  let stats;


  try {

    stats =
      await API.get(
        "/api/dashboard/stats"
      );


  } catch (error) {

    console.error(
      "Erro ao buscar estatísticas:",
      error
    );


    stats = {
      error: true
    };

  }


  // --------------------------------------------------------------
  // ESTATÍSTICAS
  // --------------------------------------------------------------

  if (
    stats &&
    !stats.error
  ) {

    wrap.innerHTML = `

      <div class="stat-card">

        <div class="value">

          ${Number(
            stats.totalProjects ||
            0
          )}

        </div>

        <div class="label">
          Projetos
        </div>

      </div>


      <div class="stat-card">

        <div class="value">

          ${Number(
            stats.totalClients ||
            0
          )}

        </div>

        <div class="label">
          Clientes
        </div>

      </div>


      <div class="stat-card"><div class="value">${Number(stats.PAGE || 0)}</div><div class="label">PAGE</div></div>
      <div class="stat-card"><div class="value">${Number(stats.SITE || 0)}</div><div class="label">SITE</div></div>
      <div class="stat-card"><div class="value">${Number(stats.LOJA || 0)}</div><div class="label">LOJA</div></div>
      <div class="stat-card"><div class="value">${Number(stats.totalLeads || 0)}</div><div class="label">Leads recebidos</div></div>

    `;


  } else {

    // ------------------------------------------------------------
    // FALLBACK
    // ------------------------------------------------------------

    wrap.innerHTML = `

      <div class="stat-card">

        <div class="value">
          ${state.projects.length}
        </div>

        <div class="label">
          Projetos
        </div>

      </div>


      <div class="stat-card">

        <div class="value">
          ${state.clients.length}
        </div>

        <div class="label">
          Clientes
        </div>

      </div>


      <div class="stat-card">

        <div class="value">
          —
        </div>

        <div class="label">
          Leads recebidos
        </div>

      </div>

    `;

  }


  // --------------------------------------------------------------
  // LEADS RECENTES
  // --------------------------------------------------------------

  const leadsWrap =
    $("dashboard-recent-leads");


  if (
    !leadsWrap
  ) {

    return;

  }


  if (
    !stats ||
    stats.error ||
    !Array.isArray(
      stats.recentLeads
    ) ||
    stats.recentLeads.length ===
      0
  ) {

    leadsWrap.innerHTML = `

      <div class="empty-state">

        <strong>
          Nenhum lead ainda
        </strong>

        Assim que o formulário
        de algum projeto receber
        uma mensagem, ela aparece aqui.

      </div>

    `;

    return;

  }


  leadsWrap.innerHTML =
    stats.recentLeads
      .map(
        (l) => `

          <div class="link-row">

            <div>

              <div>

                ${escapeHtml(
                  l.name ||
                  "Sem nome"
                )}

                <span class="meta">

                  —

                  ${escapeHtml(
                    l.projectName ||
                    ""
                  )}

                </span>

              </div>


              <div class="meta">

                ${escapeHtml(
                  l.email ||
                  ""
                )}

              </div>

            </div>


            <div class="meta">

              ${
                l.createdAt
                  ? new Date(
                      l.createdAt
                    ).toLocaleDateString(
                      "pt-BR"
                    )
                  : ""
              }

            </div>

          </div>

        `
      )
      .join("");

}


// ================================================================
// CLIENTES
// ================================================================

function renderClients() {

  const wrap =
    $("clients-table-wrap");


  if (
    !wrap
  ) {

    return;

  }


  if (
    state.clients.length ===
    0
  ) {

    wrap.innerHTML = `

      <div class="empty-state">

        <strong>
          Nenhum cliente cadastrado
        </strong>

        Cadastre seu primeiro cliente
        para vincular a um projeto.

      </div>

    `;

    return;

  }

  const term = (state.clientSearch || "").trim().toLowerCase();
  const filtered = term
    ? state.clients.filter((c) => (c.name || "").toLowerCase().includes(term))
    : state.clients;

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state">Nenhum cliente encontrado para "${escapeHtml(term)}".</div>`;
    return;
  }


  wrap.innerHTML = `

    <table>

      <thead>

        <tr>

          <th>
            Nome
          </th>

        </tr>

      </thead>


      <tbody>

        ${filtered
          .map(
            (c) => `

              <tr>

                <td data-label="Nome">

                  <button
                    type="button"
                    class="row-name-btn"
                    onclick="openClientViewPopup('${escapeHtml(c.id)}')"
                  >
                    ${escapeHtml(c.name || "")}
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


// ================================================================
// BUSCA DE CLIENTES
// ================================================================

function handleClientSearch(value) {
  state.clientSearch = value;
  renderClients();
}


// ================================================================
// POPUP DE VISUALIZAÇÃO — CLIENTE
// ================================================================

function openClientViewPopup(id) {

  const client = state.clients.find((c) => c.id === id);
  if (!client) return toast("Cliente não encontrado.", "error");

  showModal(`
    <div class="modal-header">
      <h2>${escapeHtml(client.name || "")}</h2>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="view-row"><span class="k">E-mail</span><span class="v">${escapeHtml(client.email || "—")}</span></div>
    <div class="view-row"><span class="k">Telefone</span><span class="v">${escapeHtml(client.phone || "—")}</span></div>
    <div class="view-row"><span class="k">Projeto vinculado</span><span class="v">${escapeHtml(projectNameById(client.projectId) || "—")}</span></div>

    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-primary" style="flex:1;justify-content:center" onclick="openClientModal('${escapeHtml(client.id)}')">Editar</button>
      <button class="btn btn-danger" style="flex:1;justify-content:center" onclick="confirmDeleteClient('${escapeHtml(client.id)}')">Excluir</button>
    </div>
  `);
}


// ================================================================
// NOME DO PROJETO
// ================================================================

function projectNameById(
  id
) {

  const project =
    state.projects.find(
      (p) =>
        p.id === id
    );


  return project
    ? project.name
    : null;

}


// ================================================================
// MODAL CLIENTE
// ================================================================

function openClientModal(id = null) {
  state.editingClientId = id;
  const client = id ? state.clients.find(c => c.id === id) : {
    name: "", email: "", phone: "", projectIds: [], status: "active",
    permissions: ["projects", "content", "leads", "settings", "account"]
  };
  if (!client) return toast("Cliente não encontrado.", "error");

  const selectedIds = new Set(Array.isArray(client.projectIds) ? client.projectIds : (client.projectId ? [client.projectId] : []));
  const permissions = Array.isArray(client.permissions) ? client.permissions : ["projects", "content", "leads", "settings", "account"];
  const projectOptions = state.projects.map(p => `<option value="${escapeHtml(p.id)}" ${selectedIds.has(p.id) ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("");
  const checked = key => permissions.includes("all") || permissions.includes(key) ? "checked" : "";

  showModal(`
    <div class="modal-header"><h2>${id ? "Editar cliente" : "Novo cliente"}</h2><button class="icon-btn" onclick="closeModal()">✕</button></div>
    ${id ? `<div class="field"><label>ID do cliente</label><input value="${escapeHtml(id)}" readonly></div>` : ""}
    <div class="field"><label>Nome</label><input id="client-name" value="${escapeHtml(client.name || "")}" autocomplete="name"></div>
    <div class="field-row">
      <div class="field"><label>E-mail de acesso</label><input id="client-email" type="email" value="${escapeHtml(client.email || "")}" autocomplete="username"></div>
      <div class="field"><label>Telefone</label><input id="client-phone" value="${escapeHtml(client.phone || "")}" oninput="applyDigitsOnly(this)"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${id ? "Nova senha (opcional)" : "Senha de acesso"}</label><input id="client-password" type="password" minlength="8" placeholder="Mínimo 8 caracteres" autocomplete="new-password"></div>
      <div class="field"><label>Status</label><select id="client-status"><option value="active" ${client.status !== "inactive" ? "selected" : ""}>Ativo</option><option value="inactive" ${client.status === "inactive" ? "selected" : ""}>Bloqueado</option></select></div>
    </div>
    <div class="field"><label>Projetos vinculados</label><select id="client-projects" multiple size="6">${projectOptions}</select><small class="field-help">Use Ctrl/Cmd para selecionar vários projetos.</small></div>
    <div class="field"><label>Permissões da área do cliente</label>
      <div class="permission-grid">
        <label><input type="checkbox" value="projects" ${checked("projects")}> Ver projetos</label>
        <label><input type="checkbox" value="content" ${checked("content")}> Editar conteúdo</label>
        <label><input type="checkbox" value="leads" ${checked("leads")}> Ver leads</label>
        <label><input type="checkbox" value="settings" ${checked("settings")}> Editar configurações</label>
        <label><input type="checkbox" value="account" ${checked("account")}> Minha conta</label>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveClient()">${id ? "Salvar alterações" : "Criar acesso do cliente"}</button>
  `);
}


// ================================================================
// SALVAR CLIENTE
// ================================================================

async function saveClient() {
  const projectSelect = $("client-projects");
  const selectedProjectIds = Array.from(projectSelect?.selectedOptions || []).map(o => o.value);
  const permissions = Array.from(document.querySelectorAll('.permission-grid input[type="checkbox"]:checked')).map(i => i.value);
  const body = {
    name: $("client-name")?.value.trim() || "",
    email: $("client-email")?.value.trim() || "",
    phone: $("client-phone")?.value.trim() || "",
    status: $("client-status")?.value || "active",
    projectIds: selectedProjectIds,
    projectId: selectedProjectIds[0] || "",
    permissions: permissions.length ? permissions : ["projects"]
  };
  const password = $("client-password")?.value || "";
  if (password) body.password = password;
  if (!body.name) return toast("Informe o nome do cliente.", "error");
  if (!body.email) return toast("Informe o e-mail de acesso.", "error");
  if (!state.editingClientId && password.length < 8) return toast("Defina uma senha com pelo menos 8 caracteres.", "error");

  const res = state.editingClientId
    ? await API.put("/api/data/clients", { id: state.editingClientId, ...body })
    : await API.post("/api/data/clients", body);
  if (res.error) return toast(res.message || "Erro ao salvar cliente.", "error");
  closeModal();
  toast("Cliente salvo com sucesso.");
  await loadAllData();
  renderCurrentSection();
}


// ================================================================
// EXCLUIR CLIENTE
// ================================================================

function confirmDeleteClient(id) {
  const client = state.clients.find((c) => c.id === id);
  confirmModal(
    `Excluir "${client ? client.name : "este cliente"}"? Essa ação não pode ser desfeita.`,
    () => deleteClient(id),
    "Excluir"
  );
}

async function deleteClient(
  id
) {

  {

    return;

  }


  const res =
    await API.del(
      `/api/data/clients?id=${encodeURIComponent(
        id
      )}`
    );


  if (
    res.error
  ) {

    return toast(
      res.message ||
      "Erro ao excluir cliente.",
      "error"
    );

  }


  toast(
    "Cliente excluído."
  );


  await refreshAllData();

}


// ================================================================
// STATUS
// ================================================================

const STATUS_BADGE = {

  "Em produção":
    "badge-success",

  "Em desenvolvimento":
    "badge-warning",

  "Pausado":
    "badge-muted"

};


// ================================================================
// LEADS NÃO VISTOS (por projeto, via localStorage)
// ================================================================

function getLastSeenLeadsAt(projectId) {
  return localStorage.getItem(`v8_leads_seen_${projectId}`) || null;
}

function markLeadsSeen(projectId) {
  localStorage.setItem(`v8_leads_seen_${projectId}`, new Date().toISOString());
}

function getUnseenLeadsCount(projectId) {
  const entry = state.leadsByProject?.[projectId];
  if (!entry || !entry.latestCreatedAt) return 0;

  const lastSeen = getLastSeenLeadsAt(projectId);
  if (!lastSeen) return entry.count || 0;

  return new Date(entry.latestCreatedAt) > new Date(lastSeen) ? (entry.count || 0) : 0;
}


// ================================================================
// PROJETOS
// ================================================================

function renderProjects() {

  const wrap =
    $("projects-table-wrap");


  if (
    !wrap
  ) {

    return;

  }


  if (
    state.projects.length ===
    0
  ) {

    wrap.innerHTML = `

      <div class="empty-state">

        <strong>
          Nenhum projeto cadastrado
        </strong>

        Crie o primeiro projeto
        para configurar rastreamento,
        contato e redes sociais.

      </div>

    `;

    return;

  }

  const term = (state.projectSearch || "").trim().toLowerCase();
  const list = [...state.projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const filtered = term
    ? list.filter((p) => (p.name || "").toLowerCase().includes(term))
    : list;

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state">Nenhum projeto encontrado para "${escapeHtml(term)}".</div>`;
    return;
  }


  wrap.innerHTML = `

    <table>

      <thead>

        <tr>

          <th style="width:56px"></th>
          <th>Projeto</th>
          <th>Tipo</th>
          <th>Status</th>
          <th></th>

        </tr>

      </thead>


      <tbody>

        ${filtered
          .map(
            (p, i) => `

              <tr>

                <td data-label="Ordem">
                  <div class="reorder-btns">
                    <button type="button" onclick="reorderProject('${escapeHtml(p.id)}', 'up')" ${i === 0 ? "disabled" : ""} title="Mover para cima">▲</button>
                    <button type="button" onclick="reorderProject('${escapeHtml(p.id)}', 'down')" ${i === filtered.length - 1 ? "disabled" : ""} title="Mover para baixo">▼</button>
                  </div>
                </td>

                <td data-label="Projeto">
                  <button
                    type="button"
                    class="row-name-btn"
                    onclick="openProjectViewPopup('${escapeHtml(p.id)}')"
                  >
                    ${escapeHtml(p.name || "")}
                  </button>
                  ${getUnseenLeadsCount(p.id) > 0 ? `<span class="leads-badge" title="Leads novos">${getUnseenLeadsCount(p.id)}</span>` : ""}
                </td>

                <td data-label="Tipo">
                  <span class="badge badge-muted">${escapeHtml(p.type || "SITE")}</span>
                </td>

                <td data-label="Status">
                  <span class="badge ${STATUS_BADGE[p.status] || "badge-muted"}">
                    ${escapeHtml(p.status || "Sem status")}
                  </span>
                </td>

                <td class="row-actions">
                  <button class="icon-btn" onclick="openProjectActionsMenu(event, '${escapeHtml(p.id)}')" title="Ações">⋮</button>
                </td>

              </tr>

            `
          )
          .join("")}

      </tbody>

    </table>

  `;

}


// ================================================================
// REORDENAR PROJETOS
// ================================================================

async function reorderProject(id, direction) {

  const list = [...state.projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) return;

  const a = list[idx];
  const b = list[swapWith];
  const orderA = a.order ?? 0;
  const orderB = b.order ?? 0;

  // troca as posições localmente pra resposta visual imediata
  list[idx] = b;
  list[swapWith] = a;
  state.projects = list;
  renderProjects();

  const [resA, resB] = await Promise.all([
    API.put("/api/data/projects", { id: a.id, order: orderB }),
    API.put("/api/data/projects", { id: b.id, order: orderA }),
  ]);

  if (resA.error || resB.error) {
    toast("Erro ao reordenar. Recarregando lista...", "error");
  }

  await refreshAllData();
}


// ================================================================
// MENU DE AÇÕES — PROJETO
// ================================================================

function openProjectActionsMenu(event, id) {

  event.stopPropagation();

  document.querySelectorAll(".actions-menu").forEach((el) => el.remove());

  const btn = event.currentTarget;
  const wrap = document.createElement("div");
  wrap.className = "actions-menu-wrap";

  const menu = document.createElement("div");
  menu.className = "actions-menu";
  menu.innerHTML = `
    <button onclick="openProjectViewPopup('${escapeHtml(id)}')">👁️ Visualizar</button>
    <button onclick="openProjectModal('${escapeHtml(id)}')">✏️ Editar</button>
    <button class="danger" onclick="confirmDeleteProject('${escapeHtml(id)}')">🗑️ Apagar</button>
  `;

  btn.parentElement.style.position = "relative";
  btn.parentElement.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", function closeOnce() {
      menu.remove();
      document.removeEventListener("click", closeOnce);
    }, { once: true });
  }, 0);
}


// ================================================================
// POPUP DE VISUALIZAÇÃO — PROJETO
// ================================================================

function openProjectViewPopup(id) {

  const project = state.projects.find((p) => p.id === id);
  if (!project) return toast("Projeto não encontrado.", "error");

  showModal(`
    <div class="modal-header">
      <h2>${escapeHtml(project.name || "")}</h2>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>

    <div class="view-row"><span class="k">Tipo</span><span class="v"><span class="badge badge-muted">${escapeHtml(project.type || "SITE")}</span></span></div>
    <div class="view-row"><span class="k">Status</span><span class="v"><span class="badge ${STATUS_BADGE[project.status] || "badge-muted"}">${escapeHtml(project.status || "—")}</span></span></div>
    <div class="view-row"><span class="k">WhatsApp</span><span class="v">${escapeHtml(project.contact?.whatsapp || "—")}</span></div>
    <div class="view-row"><span class="k">E-mail</span><span class="v">${escapeHtml(project.contact?.email || "—")}</span></div>
    <div class="view-row"><span class="k">ID do projeto</span><span class="v" style="font-family:monospace;font-size:11px">${escapeHtml(project.id)}</span></div>
    ${project.siteUrl ? `<div class="view-row"><span class="k">Site</span><span class="v"><a class="site-link" href="${escapeHtml(project.siteUrl)}" target="_blank" rel="noopener noreferrer">Abrir site ↗</a></span></div>` : ""}

    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-primary" style="flex:1;justify-content:center" onclick="openProjectModal('${escapeHtml(project.id)}')">Editar</button>
      <button class="btn btn-danger" style="flex:1;justify-content:center" onclick="confirmDeleteProject('${escapeHtml(project.id)}')">Excluir</button>
    </div>
  `);
}


// ================================================================
// BUSCA DE PROJETOS
// ================================================================

function handleProjectSearch(value) {
  state.projectSearch = value;
  renderProjects();
}


// ================================================================
// PROJETO PADRÃO
// ================================================================

function defaultProject() {

  return {

    name:
      "",

    status:
      "Em desenvolvimento",


    tracking: {

      pixel:
        "",

      tag:
        "",

      analytics:
        ""

    },


    contact: {

      whatsapp:
        "",

      email:
        "",

      phone:
        ""

    },


    social: {

      facebook:
        "",

      instagram:
        "",

      tiktok:
        "",

      youtube:
        "",

      linkedin:
        ""

    },


    formspree:
      ""

  };

}


// ================================================================
// MODAL PROJETO
// ================================================================

function openProjectModal(
  id = null
) {

  state.editingProjectId =
    id;

  state.projectTab =
    "geral";


  let project;


  if (
    id
  ) {

    project =
      state.projects.find(
        (p) =>
          p.id === id
      );


    if (
      !project
    ) {

      toast(
        "Projeto não encontrado.",
        "error"
      );

      return;

    }

  } else {

    project =
      defaultProject();

  }


  // --------------------------------------------------------------
  // GARANTIR ESTRUTURA
  // --------------------------------------------------------------

  project.tracking =
    project.tracking ||
    {};

  project.contact =
    project.contact ||
    {};

  project.social =
    project.social ||
    {};

  project.content =
    project.content || {};

  project.media =
    project.media || {};

  project.location =
    project.location || {};

  project.seo =
    project.seo || {};

  project.scripts =
    project.scripts || {};


  state._editingProjectDraft =
    JSON.parse(
      JSON.stringify(
        project
      )
    );


  showModal(`

    <div class="modal-header">

      <h2>

        ${
          id
            ? "Editar projeto"
            : "Novo projeto"
        }

      </h2>


      <button
        class="icon-btn"
        onclick="closeModal()"
      >
        ✕
      </button>

    </div>


    ${
      id
        ? `

          <div
            style="
              font-size:11px;
              color:var(--text-muted);
              margin-bottom:12px;
              word-break:break-all;
            "
          >

            ID:

            <strong>
              ${escapeHtml(
                id
              )}
            </strong>

          </div>

        `
        : ""
    }


    <div
      class="tabs"
      id="project-tabs"
    >

      <button
        class="tab active"
        data-tab="geral"
      >
        Geral
      </button>


      <button
        class="tab"
        data-tab="config"
      >
        Config & redes
      </button>


      ${
        id
          ? `
            <button class="tab" data-tab="content">Conteúdo</button>
            <button class="tab" data-tab="media">Mídia</button>
            <button class="tab" data-tab="location">Localização</button>
            <button class="tab" data-tab="reviews">Avaliações</button>
            <button class="tab" data-tab="seo">SEO</button>
            <button class="tab" data-tab="scripts">Scripts</button>
          `
          : ""
      }


      ${
        id && draft.type === "LOJA"
          ? `
            <button class="tab" data-tab="products">Produtos</button>
            <button class="tab" data-tab="categories">Categorias</button>
            <button class="tab" data-tab="orders">Pedidos</button>
          `
          : ""
      }

      ${
        id
          ? `

            <button
              class="tab"
              data-tab="acesso"
            >
              Acesso do cliente
            </button>

          `
          : ""
      }


      ${
        id
          ? `

            <button
              class="tab"
              data-tab="leads"
            >
              Leads
            </button>

          `
          : ""
      }

    </div>


    <div
      id="project-tab-content"
    ></div>

  `, "560px");


  document
    .querySelectorAll(
      "#project-tabs .tab"
    )
    .forEach(
      (btn) => {

        btn.addEventListener(
          "click",
          () => {

            document
              .querySelectorAll(
                "#project-tabs .tab"
              )
              .forEach(
                (b) =>
                  b.classList.remove(
                    "active"
                  )
              );


            btn.classList.add(
              "active"
            );


            state.projectTab =
              btn.dataset.tab;


            renderProjectTab();

          }
        );

      }
    );


  renderProjectTab();

}


// ================================================================
// ABAS DO PROJETO
// ================================================================

function renderProjectTab() {

  const el =
    $("project-tab-content");


  if (
    !el
  ) {

    return;

  }


  const draft =
    state._editingProjectDraft;


  if (
    !draft
  ) {

    return;

  }

  draft.type =
    ["PAGE", "SITE", "LOJA"].includes(draft.type)
      ? draft.type
      : "SITE";


  draft.tracking =
    draft.tracking ||
    {};

  draft.contact =
    draft.contact ||
    {};

  draft.social =
    draft.social ||
    {};


  // ==============================================================
  // GERAL
  // ==============================================================

  if (
    state.projectTab ===
    "geral"
  ) {

    el.innerHTML = `

      <div class="field">

        <label>
          Nome do projeto
        </label>

        <input
          id="p-name"
          value="${escapeHtml(
            draft.name ||
            ""
          )}"
        >

      </div>


      <div class="field">
        <label for="p-type">Tipo de projeto</label>
        <select id="p-type">
          ${["PAGE","SITE","LOJA"].map(type => `<option value="${type}" ${draft.type === type ? "selected" : ""}>${type}${type === "PAGE" ? " — Landing Page" : type === "SITE" ? " — Site Institucional" : " — E-commerce"}</option>`).join("")}
        </select>
        <p class="meta" style="margin-top:6px">O tipo controla os recursos disponíveis. Projetos antigos são tratados como SITE.</p>
      </div>

      <div class="field">

        <label>
          Status
        </label>


        <select id="p-status">

          ${[
            "Em desenvolvimento",
            "Em produção",
            "Pausado"
          ]
            .map(
              (s) => `

                <option
                  value="${escapeHtml(
                    s
                  )}"
                  ${
                    s ===
                    draft.status
                      ? "selected"
                      : ""
                  }
                >

                  ${escapeHtml(
                    s
                  )}

                </option>

              `
            )
            .join("")}

        </select>

      </div>


      <div class="field">

        <label>
          URL do site publicado
        </label>

        <input
          id="p-site-url"
          value="${escapeHtml(draft.siteUrl || "")}"
          placeholder="https://seusite.pages.dev"
        >

        ${draft.siteUrl ? `<a class="site-link" href="${escapeHtml(draft.siteUrl)}" target="_blank" rel="noopener noreferrer" style="margin-top:6px;display:inline-flex">Abrir site ↗</a>` : ""}

      </div>


      <button
        class="btn btn-primary"
        style="
          width:100%;
          justify-content:center
        "
        onclick="saveProject()"
      >
        Salvar projeto
      </button>

    `;

  }


  // ==============================================================
  // CONFIGURAÇÕES
  // ==============================================================

  if (
    state.projectTab ===
    "config"
  ) {

    el.innerHTML = `

      <div class="form-section">

        <h3>
          Rastreamento
        </h3>


        <div class="field">

          <label>
            Meta Pixel (ID)
          </label>

          <input
            id="p-pixel"
            value="${escapeHtml(
              draft.tracking.pixel ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            Google Tag / GTM (ID)
          </label>

          <input
            id="p-tag"
            value="${escapeHtml(
              draft.tracking.tag ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            Google Analytics (ID)
          </label>

          <input
            id="p-analytics"
            value="${escapeHtml(
              draft.tracking.analytics ||
              ""
            )}"
          >

        </div>


        ${
          draft.tracking.pixel ||
          draft.tracking.analytics
            ? `

              <button
                class="btn btn-ghost btn-sm"
                onclick="copyTrackingSnippet()"
              >
                Copiar snippet de instalação
              </button>

            `
            : ""
        }

      </div>


      <div class="form-section">

        <h3>
          Contato
        </h3>


        <div class="field">

          <label>
            WhatsApp
          </label>

          <input
            id="p-whatsapp"
            value="${escapeHtml(
              draft.contact.whatsapp ||
              ""
            )}"
            placeholder="5511999999999"
            oninput="applyDigitsOnly(this)"
          >

        </div>


        <div class="field-row">

          <div class="field">

            <label>
              E-mail
            </label>

            <input
              id="p-email"
              value="${escapeHtml(
                draft.contact.email ||
                ""
              )}"
            >

          </div>


          <div class="field">

            <label>
              Telefone
            </label>

            <input
              id="p-phone"
              value="${escapeHtml(
                draft.contact.phone ||
                ""
              )}"
              oninput="applyDigitsOnly(this)"
            >

          </div>

        </div>

      </div>


      <div class="form-section">

        <h3>
          Redes sociais
        </h3>


        <div class="field">

          <label>
            Facebook
          </label>

          <input
            id="p-facebook"
            value="${escapeHtml(
              draft.social.facebook ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            Instagram
          </label>

          <input
            id="p-instagram"
            value="${escapeHtml(
              draft.social.instagram ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            TikTok
          </label>

          <input
            id="p-tiktok"
            value="${escapeHtml(
              draft.social.tiktok ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            YouTube
          </label>

          <input
            id="p-youtube"
            value="${escapeHtml(
              draft.social.youtube ||
              ""
            )}"
          >

        </div>


        <div class="field">

          <label>
            LinkedIn
          </label>

          <input
            id="p-linkedin"
            value="${escapeHtml(
              draft.social.linkedin ||
              ""
            )}"
          >

        </div>

      </div>


      <div class="form-section">

        <h3>
          Formspree
        </h3>


        <div class="field">

          <label>
            Endpoint
          </label>

          <input
            id="p-formspree"
            value="${escapeHtml(
              draft.formspree ||
              ""
            )}"
            placeholder="https://formspree.io/f/xxxxxxx"
          >

        </div>

      </div>


      <div class="live-preview">

        <div class="preview-label">
          Prévia — como aparece no site
        </div>


        <div
          id="live-preview-content"
        ></div>

      </div>


      <button
        class="btn btn-primary"
        style="
          width:100%;
          justify-content:center;
          margin-top:16px
        "
        onclick="saveProject()"
      >
        Salvar projeto
      </button>

    `;


    [
      "p-whatsapp",
      "p-email",
      "p-phone",
      "p-facebook",
      "p-instagram",
      "p-tiktok",
      "p-youtube",
      "p-linkedin"
    ]
      .forEach(
        (id) => {

          const input =
            $(id);


          if (
            input
          ) {

            input.addEventListener(
              "input",
              renderLivePreview
            );

          }

        }
      );


    renderLivePreview();

  }


  // ==============================================================
  // CONTEÚDO
  // ==============================================================

  if (state.projectTab === "content") {

    draft.content = draft.content || {};
    const c = draft.content;

    el.innerHTML = `
      <div class="field"><label>Nome da empresa / profissional</label>
        <input id="c-name" value="${escapeHtml(c.name || "")}"></div>
      <div class="field"><label>Profissão</label>
        <input id="c-job" value="${escapeHtml(c.job || "")}"></div>
      <div class="field"><label>Título principal</label>
        <textarea id="c-headline" rows="3">${escapeHtml(c.headline || "")}</textarea></div>
      <div class="field"><label>Descrição principal</label>
        <textarea id="c-description" rows="4">${escapeHtml(c.description || "")}</textarea></div>
      <div class="field"><label>Especialização</label>
        <textarea id="c-specialization" rows="4">${escapeHtml(c.specialization || "")}</textarea></div>
      <div class="field"><label>Experiência</label>
        <textarea id="c-experience" rows="4">${escapeHtml(c.experience || "")}</textarea></div>
      <div class="field"><label>Endereço</label>
        <textarea id="c-address" rows="3">${escapeHtml(c.address || "")}</textarea></div>
      <div class="field"><label>Registro profissional</label>
        <input id="c-registration" value="${escapeHtml(c.registration || "")}"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
    `;
  }


  // ==============================================================
  // MÍDIA
  // ==============================================================

  if (state.projectTab === "media") {

    draft.media = draft.media || {};
    const m = draft.media;
    const galleryText = Array.isArray(m.galleryImages) ? m.galleryImages.join("\n") : "";

    el.innerHTML = `
      <div class="form-section">
        <h3>Galeria principal</h3>
        <div class="field"><label>Imagens (uma URL por linha)</label>
          <textarea id="m-gallery" rows="8">${escapeHtml(galleryText)}</textarea></div>
        <label class="checkbox-row">
          <input type="checkbox" id="m-gallery-enabled" ${m.galleryEnabled ? "checked" : ""}>
          Ativar galeria
        </label>
      </div>
      <div class="form-section">
        <h3>Vídeo</h3>
        <div class="field"><label>URL do vídeo (YouTube etc.)</label>
          <input id="m-video" value="${escapeHtml(m.video || "")}"></div>
        <label class="checkbox-row">
          <input type="checkbox" id="m-video-enabled" ${m.videoEnabled ? "checked" : ""}>
          Ativar vídeo
        </label>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
    `;
  }


  // ==============================================================
  // LOCALIZAÇÃO
  // ==============================================================

  if (state.projectTab === "location") {

    draft.location = draft.location || {};
    const l = draft.location;

    el.innerHTML = `
      <div class="field"><label>Endereço</label>
        <input id="l-address" value="${escapeHtml(l.address || "")}"></div>
      <div class="field"><label>URL do Google Maps</label>
        <input id="l-maps-url" value="${escapeHtml(l.mapsUrl || "")}"></div>
      <div class="field"><label>Incorporação do mapa (embed)</label>
        <textarea id="l-embed" rows="5">${escapeHtml(l.embed || "")}</textarea></div>
      <label class="checkbox-row">
        <input type="checkbox" id="l-enabled" ${l.enabled ? "checked" : ""}>
        Ativar Google Maps
      </label>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:16px" onclick="saveProject()">Salvar projeto</button>
    `;
  }


  // ==============================================================
  // AVALIAÇÕES (GOOGLE)
  // ==============================================================

  if (state.projectTab === "reviews") {

    draft.reviews = draft.reviews || {};
    const r = draft.reviews;

    el.innerHTML = `
      <div class="field">
        <label>Place ID do Google</label>
        <input id="r-place-id" value="${escapeHtml(r.placeId || "")}" placeholder="ChIJ...">
        <p style="font-size:11.5px;color:var(--text-muted);margin-top:6px">
          Encontre o Place ID do seu negócio em
          <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">developers.google.com/.../place-id</a>
        </p>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="r-enabled" ${r.enabled ? "checked" : ""}>
        Ativar avaliações do Google neste site
      </label>
      <p style="font-size:11.5px;color:var(--text-muted);margin:10px 0 16px">
        Requer o secret <code>GOOGLE_PLACES_API_KEY</code> configurado no Worker (uma vez só, vale pra todos os projetos).
      </p>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
      ${state.editingProjectId ? `
        <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:10px" onclick="previewGoogleReviews('${escapeHtml(state.editingProjectId)}')">Testar / pré-visualizar</button>
        <div id="reviews-preview" style="margin-top:14px"></div>
      ` : ""}
    `;
  }


  // ==============================================================
  // SEO
  // ==============================================================

  if (state.projectTab === "seo") {

    draft.seo = draft.seo || {};
    const s = draft.seo;

    el.innerHTML = `
      <div class="field"><label>Meta Title</label>
        <input id="s-title" value="${escapeHtml(s.title || "")}"></div>
      <div class="field"><label>Meta Description</label>
        <textarea id="s-description" rows="4">${escapeHtml(s.description || "")}</textarea></div>
      <div class="field"><label>Imagem Open Graph</label>
        <input id="s-og-image" value="${escapeHtml(s.ogImage || "")}"></div>
      <div class="field"><label>Canonical URL</label>
        <input id="s-canonical" value="${escapeHtml(s.canonical || "")}"></div>
      <div class="field"><label>Palavras-chave</label>
        <textarea id="s-keywords" rows="3">${escapeHtml(s.keywords || "")}</textarea></div>
      <div class="field"><label>Robots</label>
        <select id="s-robots">
          <option value="index, follow" ${s.robots === "index, follow" ? "selected" : ""}>Indexar</option>
          <option value="noindex, nofollow" ${s.robots === "noindex, nofollow" ? "selected" : ""}>Não indexar</option>
        </select>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
    `;
  }


  // ==============================================================
  // SCRIPTS
  // ==============================================================

  if (state.projectTab === "scripts") {

    draft.scripts = draft.scripts || {};
    const sc = draft.scripts;

    el.innerHTML = `
      <div class="field"><label>Head — código inserido no &lt;head&gt;</label>
        <textarea id="sc-head" rows="6">${escapeHtml(sc.head || "")}</textarea></div>
      <div class="field"><label>Body — código executado no corpo</label>
        <textarea id="sc-body" rows="6">${escapeHtml(sc.body || "")}</textarea></div>
      <div class="field"><label>Footer — antes do fechamento do body</label>
        <textarea id="sc-footer" rows="6">${escapeHtml(sc.footer || "")}</textarea></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
    `;
  }


  // ==============================================================
  // E-COMMERCE
  // ==============================================================

  if (["products", "categories", "orders"].includes(state.projectTab)) {
    renderStoreTab(el, state.projectTab, draft.id);
  }

  // ==============================================================
  // ACESSO
  // ==============================================================

  if (
    state.projectTab ===
    "acesso"
  ) {

    renderClientAccessTab(
      el
    );

  }


  // ==============================================================
  // LEADS
  // ==============================================================

  if (
    state.projectTab ===
    "leads"
  ) {

    renderLeadsTab(
      el
    );

  }

}


// ================================================================
// PRÉVIA
// ================================================================

function renderLivePreview() {

  const box =
    $("live-preview-content");


  if (
    !box
  ) {

    return;

  }


  const social = {

    Facebook:
      $("p-facebook")
        ?.value,

    Instagram:
      $("p-instagram")
        ?.value,

    TikTok:
      $("p-tiktok")
        ?.value,

    YouTube:
      $("p-youtube")
        ?.value,

    LinkedIn:
      $("p-linkedin")
        ?.value

  };


  const contactBits = [

    $("p-whatsapp")
      ?.value &&
      "WhatsApp",

    $("p-email")
      ?.value &&
      "E-mail",

    $("p-phone")
      ?.value &&
      "Telefone"

  ].filter(
    Boolean
  );


  const chips =
    Object.entries(
      social
    )

      .filter(
        ([, v]) =>
          v
      )

      .map(
        ([name]) =>
          `<span class="preview-chip">${escapeHtml(
            name
          )}</span>`
      )

      .join("");


  box.innerHTML = `

    <div class="preview-social">

      ${
        chips ||

        `

          <span
            class="meta"
            style="
              color:var(--text-faint)
            "
          >
            Nenhuma rede social preenchida ainda
          </span>

        `
      }

    </div>


    <div
      style="
        margin-top:10px;
        font-size:12px;
        color:var(--text-muted)
      "
    >

      Contato visível no site:

      ${
        contactBits.length
          ? contactBits.join(
              ", "
            )
          : "nenhum"
      }

    </div>

  `;

}


// ================================================================
// SNIPPET DE RASTREAMENTO
// ================================================================

// ================================================================
// PRÉ-VISUALIZAR AVALIAÇÕES DO GOOGLE
// ================================================================

async function previewGoogleReviews(projectId) {
  const box = $("reviews-preview");
  if (!box) return;

  box.innerHTML = `<div class="empty-state">Buscando avaliações...</div>`;

  const res = await API.get(`/api/public/reviews/${encodeURIComponent(projectId)}`);

  if (!res.enabled) {
    box.innerHTML = `<div class="empty-state">Preencha o Place ID e marque "Ativar", depois salve o projeto antes de testar.</div>`;
    return;
  }

  if (res.error) {
    box.innerHTML = `<div class="empty-state">Erro: ${escapeHtml(res.message || "não foi possível buscar")}</div>`;
    return;
  }

  const stars = "★".repeat(Math.round(res.rating || 0)) + "☆".repeat(5 - Math.round(res.rating || 0));

  box.innerHTML = `
    <div class="reviews-summary">
      <span class="stars">${stars}</span>
      <strong>${(res.rating || 0).toFixed(1)}</strong>
      <span class="meta">(${res.totalReviews || 0} avaliações)</span>
    </div>
    ${(res.reviews || []).map((rv) => `
      <div class="review-item">
        <div class="review-author">${escapeHtml(rv.author)} — ${"★".repeat(rv.rating)}</div>
        <div class="meta">${escapeHtml(rv.relativeTime || "")}</div>
        <p style="margin-top:4px">${escapeHtml(rv.text || "")}</p>
      </div>
    `).join("") || '<div class="empty-state">Sem comentários públicos retornados.</div>'}
  `;
}


async function copyTrackingSnippet() {

  const pixel =
    $("p-pixel")
      ?.value
      .trim() ||
    "";


  const analytics =
    $("p-analytics")
      ?.value
      .trim() ||
    "";


  let snippet =
    "";


  // --------------------------------------------------------------
  // META PIXEL
  // --------------------------------------------------------------

  if (
    pixel
  ) {

    snippet += `

<!-- Meta Pixel -->

<script>
!function(f,b,e,v,n,t,s){
if(f.fbq)return;
n=f.fbq=function(){
n.callMethod ?
n.callMethod.apply(n,arguments) :
n.queue.push(arguments)
};

if(!f._fbq)f._fbq=n;

n.push=n;
n.loaded=!0;
n.version='2.0';
n.queue=[];

t=b.createElement(e);
t.async=!0;
t.src=v;

s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)
}
(window, document, 'script',
'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '${pixel}');
fbq('track', 'PageView');
</script>

`.trim();

  }


  // --------------------------------------------------------------
  // GOOGLE ANALYTICS
  // --------------------------------------------------------------

  if (
    analytics
  ) {

    if (
      snippet
    ) {

      snippet +=
        "\n\n";

    }


    snippet += `

<!-- Google Analytics -->

<script
async
src="https://www.googletagmanager.com/gtag/js?id=${analytics}">
</script>

<script>

window.dataLayer =
window.dataLayer || [];

function gtag(){
dataLayer.push(arguments);
}

gtag('js', new Date());

gtag(
'config',
'${analytics}'
);

</script>

`.trim();

  }


  if (
    !snippet
  ) {

    return toast(
      "Preencha Pixel ou Analytics primeiro.",
      "error"
    );

  }


  try {

    await navigator
      .clipboard
      .writeText(
        snippet
      );


    toast(
      "Snippet copiado."
    );


  } catch {

    toast(
      "Não foi possível copiar automaticamente.",
      "error"
    );

  }

}


// ================================================================
// SALVAR PROJETO
// ================================================================

async function saveProject() {

  const draft =
    state._editingProjectDraft;


  if (
    !draft
  ) {

    return;

  }


  // --------------------------------------------------------------
  // GERAL
  // --------------------------------------------------------------

  if (
    state.projectTab ===
    "geral"
  ) {

    draft.name =
      $("p-name")
        ?.value
        .trim() ||
      "";


    draft.type =
      $("p-type")
        ?.value ||
      "SITE";

    draft.status =
      $("p-status")
        ?.value ||
      "Em desenvolvimento";

    draft.siteUrl =
      $("p-site-url")
        ?.value
        .trim() ||
      "";

  }


  // --------------------------------------------------------------
  // CONFIG
  // --------------------------------------------------------------

  else if (
    state.projectTab ===
    "config"
  ) {

    draft.tracking = {

      pixel:
        $("p-pixel")
          ?.value
          .trim() ||
        "",

      tag:
        $("p-tag")
          ?.value
          .trim() ||
        "",

      analytics:
        $("p-analytics")
          ?.value
          .trim() ||
        ""

    };


    draft.contact = {

      whatsapp:
        $("p-whatsapp")
          ?.value
          .trim() ||
        "",

      email:
        $("p-email")
          ?.value
          .trim() ||
        "",

      phone:
        $("p-phone")
          ?.value
          .trim() ||
        ""

    };


    draft.social = {

      facebook:
        $("p-facebook")
          ?.value
          .trim() ||
        "",

      instagram:
        $("p-instagram")
          ?.value
          .trim() ||
        "",

      tiktok:
        $("p-tiktok")
          ?.value
          .trim() ||
        "",

      youtube:
        $("p-youtube")
          ?.value
          .trim() ||
        "",

      linkedin:
        $("p-linkedin")
          ?.value
          .trim() ||
        ""

    };


    draft.formspree =
      $("p-formspree")
        ?.value
        .trim() ||
      "";

  }


  // --------------------------------------------------------------
  // CONTEÚDO
  // --------------------------------------------------------------

  else if (state.projectTab === "content") {

    draft.content = {
      name: $("c-name")?.value.trim() || "",
      job: $("c-job")?.value.trim() || "",
      headline: $("c-headline")?.value.trim() || "",
      description: $("c-description")?.value.trim() || "",
      specialization: $("c-specialization")?.value.trim() || "",
      experience: $("c-experience")?.value.trim() || "",
      address: $("c-address")?.value.trim() || "",
      registration: $("c-registration")?.value.trim() || "",
    };

  }


  // --------------------------------------------------------------
  // MÍDIA
  // --------------------------------------------------------------

  else if (state.projectTab === "media") {

    const galleryRaw = $("m-gallery")?.value || "";

    draft.media = {
      galleryEnabled: Boolean($("m-gallery-enabled")?.checked),
      galleryImages: galleryRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      videoEnabled: Boolean($("m-video-enabled")?.checked),
      video: $("m-video")?.value.trim() || "",
    };

  }


  // --------------------------------------------------------------
  // LOCALIZAÇÃO
  // --------------------------------------------------------------

  else if (state.projectTab === "location") {

    draft.location = {
      enabled: Boolean($("l-enabled")?.checked),
      address: $("l-address")?.value.trim() || "",
      mapsUrl: $("l-maps-url")?.value.trim() || "",
      embed: $("l-embed")?.value.trim() || "",
    };

  }


  // --------------------------------------------------------------
  // AVALIAÇÕES (GOOGLE)
  // --------------------------------------------------------------

  else if (state.projectTab === "reviews") {

    draft.reviews = {
      enabled: Boolean($("r-enabled")?.checked),
      placeId: $("r-place-id")?.value.trim() || "",
    };

  }


  // --------------------------------------------------------------
  // SEO
  // --------------------------------------------------------------

  else if (state.projectTab === "seo") {

    draft.seo = {
      title: $("s-title")?.value.trim() || "",
      description: $("s-description")?.value.trim() || "",
      ogImage: $("s-og-image")?.value.trim() || "",
      canonical: $("s-canonical")?.value.trim() || "",
      keywords: $("s-keywords")?.value.trim() || "",
      robots: $("s-robots")?.value || "index, follow",
    };

  }


  // --------------------------------------------------------------
  // SCRIPTS
  // --------------------------------------------------------------

  else if (state.projectTab === "scripts") {

    draft.scripts = {
      head: $("sc-head")?.value.trim() || "",
      body: $("sc-body")?.value.trim() || "",
      footer: $("sc-footer")?.value.trim() || "",
    };

  }


  // --------------------------------------------------------------
  // VALIDAR NOME
  // --------------------------------------------------------------

  if (
    !draft.name
  ) {

    return toast(
      "Informe o nome do projeto.",
      "error"
    );

  }


  let res;


  // --------------------------------------------------------------
  // ATUALIZAR
  // --------------------------------------------------------------

  if (
    state.editingProjectId
  ) {

    res =
      await API.put(
        "/api/data/projects",
        {
          id:
            state.editingProjectId,

          ...draft

        }
      );

  }


  // --------------------------------------------------------------
  // CRIAR
  // --------------------------------------------------------------

  else {

    res =
      await API.post(
        "/api/data/projects",
        draft
      );

  }


  // --------------------------------------------------------------
  // ERRO
  // --------------------------------------------------------------

  if (
    res.error
  ) {

    return toast(
      res.message ||
      "Erro ao salvar projeto.",
      "error"
    );

  }


  toast(
    "Projeto salvo com sucesso."
  );


  // --------------------------------------------------------------
  // NOVO PROJETO
  // --------------------------------------------------------------

  if (
    !state.editingProjectId
  ) {

    closeModal();

  }


  // --------------------------------------------------------------
  // ATUALIZAR PROJETO LOCAL
  // --------------------------------------------------------------

  else {

    const index =
      state.projects.findIndex(
        (p) =>
          p.id ===
          state.editingProjectId
      );


    if (
      index !== -1
    ) {

      state.projects[index] = {

        ...state.projects[index],

        ...draft

      };

    }

  }


  await refreshAllData();

}


// ================================================================
// EXCLUIR PROJETO
// ================================================================

function confirmDeleteProject(id) {
  const project = state.projects.find((p) => p.id === id);
  closeModal();
  confirmModal(
    `Excluir "${project ? project.name : "este projeto"}"?\n\nLeads e links de cliente associados serão preservados. Essa ação não pode ser desfeita.`,
    () => deleteProject(id),
    "Excluir"
  );
}

async function deleteProject(
  id
) {

    const res =
      await API.del(
        `/api/data/projects?id=${encodeURIComponent(
          id
        )}`
      );


    if (
      res.error
    ) {

      return toast(
        res.message ||
        "Erro ao excluir projeto.",
        "error"
      );

    }


    toast(
      "Projeto excluído."
    );


  await refreshAllData();

}


// ================================================================
// ACESSO DO CLIENTE
// ================================================================

async function renderClientAccessTab(
  el
) {

  el.innerHTML = `

    <div class="empty-state">
      Carregando links...
    </div>

  `;


  const projectId =
    state.editingProjectId;


  const links =
    await API.get(
      `/api/client-link/${encodeURIComponent(
        projectId
      )}`
    );


  const activeLinks =
    Array.isArray(
      links
    )
      ? links.filter(
          (l) =>
            !l.revoked
        )
      : [];


  el.innerHTML = `

    <div class="form-section">

      <h3>
        Liberar campos para o cliente
      </h3>


      <p
        style="
          color:var(--text-muted);
          font-size:12.5px;
          margin-bottom:10px
        "
      >

        Marque exatamente o que
        esse cliente pode editar.
        Você pode gerar mais de um
        link com combinações diferentes.

      </p>


      <div
        class="checkbox-grid"
        id="client-fields-checkboxes"
      >

        ${Object.entries(
          CLIENT_FIELD_LABELS
        )

          .map(
            ([path, label]) => `

              <div
                class="checkbox-row"
              >

                <input
                  type="checkbox"
                  value="${escapeHtml(
                    path
                  )}"
                  id="cf-${escapeHtml(
                    path
                  )}"
                >


                <label
                  for="cf-${escapeHtml(
                    path
                  )}"
                  style="
                    margin:0;
                    font-weight:400;
                    color:var(--text-main)
                  "
                >

                  ${escapeHtml(
                    label
                  )}

                </label>

              </div>

            `
          )

          .join("")}

      </div>


      <button
        class="btn btn-primary btn-sm"
        style="
          margin-top:12px
        "
        onclick="generateClientLink()"
      >
        Gerar link do cliente
      </button>

    </div>


    <div class="form-section">

      <h3>
        Links ativos
      </h3>


      <div
        id="client-links-list"
      >

        ${
          activeLinks.length

            ? activeLinks
                .map(
                  renderClientLinkRow
                )
                .join("")

            : `

              <div class="empty-state">

                Nenhum link gerado ainda
                para este projeto.

              </div>

            `
        }

      </div>

    </div>

  `;

}


// ================================================================
// LINHA DO LINK
// ================================================================

function renderClientLinkRow(
  l
) {

  const fields =
    Array.isArray(
      l.fields
    )
      ? l.fields
      : [];


  const fieldsLabel =
    fields

      .map(
        (f) =>
          CLIENT_FIELD_LABELS[f] ||
          f
      )

      .join(
        ", "
      );


  return `

    <div class="link-row">

      <div>

        <div
          style="
            font-size:12.5px
          "
        >

          ${escapeHtml(
            fieldsLabel
          )}

        </div>


        <div class="meta">

          criado em

          ${
            l.createdAt
              ? new Date(
                  l.createdAt
                ).toLocaleDateString(
                  "pt-BR"
                )
              : "—"
          }

        </div>

      </div>


      <div
        style="
          display:flex;
          gap:6px
        "
      >

        <button
          class="btn btn-ghost btn-sm"
          onclick="copyClientLink('${escapeHtml(
            l.jti
          )}', this)"
        >
          Copiar link
        </button>


        <button
          class="btn btn-danger btn-sm"
          onclick="revokeClientLink('${escapeHtml(
            l.jti
          )}')"
        >
          Revogar
        </button>

      </div>

    </div>

  `;

}


// ================================================================
// GERAR LINK
// ================================================================

async function generateClientLink() {

  const fields =
    Array.from(
      document.querySelectorAll(
        "#client-fields-checkboxes input:checked"
      )
    )

      .map(
        (i) =>
          i.value
      );


  if (
    fields.length ===
    0
  ) {

    return toast(
      "Marque ao menos um campo.",
      "error"
    );

  }


  const res =
    await API.post(
      `/api/client-link/${encodeURIComponent(
        state.editingProjectId
      )}`,
      {
        fields
      }
    );


  if (
    res.error
  ) {

    return toast(
      res.message ||
      "Erro ao gerar link.",
      "error"
    );

  }


  if (
    !res.token
  ) {

    return toast(
      "A API não retornou o token do link.",
      "error"
    );

  }


  state._lastGeneratedToken =
    res.token;


  toast(
    "Link gerado."
  );


  await renderClientAccessTab(
    $("project-tab-content")
  );


  setTimeout(
    () =>
      copyClientLinkByToken(
        res.token
      ),
    100
  );

}


// ================================================================
// CONSTRUIR URL DO CLIENTE
// ================================================================

function buildClientEditUrl(
  token
) {

  const base =
    window.location.href

      .replace(
        /index\.html.*$/,
        ""
      )

      .replace(
        /\/$/,
        ""
      );


  return (
    `${base}/editar.html?token=${encodeURIComponent(
      token
    )}`
  );

}


// ================================================================
// COPIAR LINK RECÉM-GERADO
// ================================================================

async function copyClientLinkByToken(
  token
) {

  const url =
    buildClientEditUrl(
      token
    );


  try {

    await navigator.clipboard
      .writeText(
        url
      );


    toast(
      "Link copiado — envie para o cliente."
    );


  } catch {

    toast(
      "Não foi possível copiar automaticamente o link.",
      "error"
    );

    console.log(
      "Link do cliente:",
      url
    );

  }

}


// ================================================================
// COPIAR LINK ANTIGO
// ================================================================

async function copyClientLink(
  jti,
  btn
) {

  toast(
    "Por segurança, o link completo só é mostrado no momento em que é gerado. Se foi perdido, revogue e gere um novo.",
    "error"
  );

}


// ================================================================
// REVOGAR LINK
// ================================================================

async function revokeClientLink(
  jti
) {

  if (
    !confirm(
      "Revogar este link?\n\n" +
      "O cliente perderá o acesso imediatamente."
    )
  ) {

    return;

  }


  const res =
    await API.post(
      `/api/client-link/${encodeURIComponent(
        jti
      )}/revoke`,
      {}
    );


  if (
    res.error
  ) {

    return toast(
      res.message ||
      "Erro ao revogar link.",
      "error"
    );

  }


  toast(
    "Link revogado."
  );


  await renderClientAccessTab(
    $("project-tab-content")
  );

}


// ================================================================
// LEADS
// ================================================================

async function renderLeadsTab(
  el
) {

  markLeadsSeen(state.editingProjectId);

  el.innerHTML = `

    <div class="empty-state">
      Carregando leads...
    </div>

  `;


  const leads =
    await API.get(
      `/api/data/leads/${encodeURIComponent(
        state.editingProjectId
      )}`
    );


  if (
    !Array.isArray(
      leads
    ) ||
    leads.length ===
    0
  ) {

    el.innerHTML = `

      <div class="empty-state">

        <strong>
          Nenhum lead ainda
        </strong>

        As mensagens enviadas
        pelo formulário deste projeto
        aparecem aqui.

      </div>

    `;

    return;

  }


  el.innerHTML =
    leads

      .map(
        (l) => `

          <div class="link-row">

            <div>

              <div>

                ${escapeHtml(
                  l.name ||
                  "Sem nome"
                )}

              </div>


              <div class="meta">

                ${escapeHtml(
                  l.email ||
                  ""
                )}

              </div>


              ${
                l.message

                  ? `

                    <div
                      class="meta"
                      style="
                        margin-top:4px
                      "
                    >

                      ${escapeHtml(
                        l.message
                      )}

                    </div>

                  `

                  : ""
              }

            </div>


            <div class="meta">

              ${
                l.createdAt
                  ? new Date(
                      l.createdAt
                    ).toLocaleDateString(
                      "pt-BR"
                    )
                  : "—"
              }

            </div>

          </div>

        `
      )

      .join("");

}


// ================================================================
// MODAL
// ================================================================

function showModal(
  innerHtml,
  maxWidth = "480px"
) {

  closeModal();


  const overlay =
    document.createElement(
      "div"
    );


  overlay.className =
    "modal-overlay";


  overlay.id =
    "modal-overlay";


  overlay.addEventListener(
    "click",
    (e) => {

      if (
        e.target ===
        overlay
      ) {

        closeModal();

      }

    }
  );


  overlay.innerHTML = `

    <div
      class="modal"
      style="
        max-width:${maxWidth}
      "
    >

      ${innerHtml}

    </div>

  `;


  document.body.appendChild(
    overlay
  );

}


// ================================================================
// FECHAR MODAL
// ================================================================

function closeModal() {

  const el =
    $("modal-overlay");


  if (
    el
  ) {

    el.remove();

  }

}


// ================================================================
// E-COMMERCE — UI MVP
// ================================================================

async function renderStoreTab(el, kind, projectId) {
  const labels = { products: "Produtos", categories: "Categorias", orders: "Pedidos" };
  el.innerHTML = `<div class="loading">Carregando ${labels[kind].toLowerCase()}...</div>`;
  const res = await API.get(`/api/store/${kind}/${encodeURIComponent(projectId)}`);
  if (res.error) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(res.message || "Não foi possível carregar.")}</div>`;
    return;
  }
  const items = Array.isArray(res) ? res : [];
  const key = kind === "products" ? "product" : kind === "categories" ? "category" : "order";

  if (kind === "products") {
    el.innerHTML = `
      <div class="form-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><h3>Produtos</h3><p class="meta">${items.length} cadastrado(s)</p></div>
          <button class="btn btn-primary btn-sm" onclick="openStoreItemModal('${kind}','${projectId}')">+ Produto</button>
        </div>
      </div>
      ${items.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Preço</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map(item => `<tr><td data-label="Produto">${escapeHtml(item.name)}</td><td data-label="Preço">R$ ${Number(item.salePrice ?? item.price).toFixed(2).replace(".", ",")}</td><td data-label="Estoque">${Number(item.stock || 0)}</td><td data-label="Status">${item.status === "active" ? "Ativo" : "Inativo"}</td><td><button class="btn btn-ghost btn-sm" onclick="openStoreItemModal('products','${projectId}','${item.id}')">Editar</button> <button class="btn btn-ghost btn-sm" onclick="deleteStoreItem('products','${projectId}','${item.id}')">Excluir</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty-state"><strong>Nenhum produto</strong>Cadastre o primeiro produto desta loja.</div>`}
    `;
    return;
  }

  if (kind === "categories") {
    el.innerHTML = `
      <div class="form-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><h3>Categorias</h3><p class="meta">${items.length} cadastrada(s)</p></div>
          <button class="btn btn-primary btn-sm" onclick="openStoreItemModal('${kind}','${projectId}')">+ Categoria</button>
        </div>
      </div>
      ${items.length ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td data-label="Nome">${escapeHtml(item.name)}</td><td data-label="Status">${item.status === "active" ? "Ativa" : "Inativa"}</td><td><button class="btn btn-ghost btn-sm" onclick="openStoreItemModal('categories','${projectId}','${item.id}')">Editar</button> <button class="btn btn-ghost btn-sm" onclick="deleteStoreItem('categories','${projectId}','${item.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhuma categoria</strong>Crie categorias para organizar os produtos.</div>`}
    `;
    return;
  }

  el.innerHTML = `
    <div class="form-section"><h3>Pedidos</h3><p class="meta">${items.length} pedido(s)</p></div>
    ${items.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Cliente</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td data-label="ID">${escapeHtml(item.id.slice(0,8))}…</td><td data-label="Cliente">${escapeHtml(item.customer?.name || "—")}</td><td data-label="Total">R$ ${Number(item.total || 0).toFixed(2).replace(".", ",")}</td><td data-label="Status">${escapeHtml(item.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="openStoreItemModal('orders','${projectId}','${item.id}')">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhum pedido</strong>Os pedidos poderão ser recebidos pela API da loja.</div>`}
  `;
}

async function openStoreItemModal(kind, projectId, itemId = "") {
  const res = await API.get(`/api/store/${kind}/${encodeURIComponent(projectId)}`);
  const items = Array.isArray(res) ? res : [];
  const item = items.find(x => x.id === itemId) || {};
  const title = kind === "products" ? "Produto" : kind === "categories" ? "Categoria" : "Pedido";

  let fields = "";
  if (kind === "products") fields = `
    <div class="field"><label>Nome</label><input id="store-name" value="${escapeHtml(item.name || "")}"></div>
    <div class="field"><label>Descrição</label><textarea id="store-description" rows="3">${escapeHtml(item.description || "")}</textarea></div>
    <div class="field-row"><div class="field"><label>Preço</label><input id="store-price" type="number" step="0.01" min="0" value="${item.price ?? 0}"></div><div class="field"><label>Preço promocional</label><input id="store-sale" type="number" step="0.01" min="0" value="${item.salePrice ?? ""}"></div></div>
    <div class="field-row"><div class="field"><label>Estoque</label><input id="store-stock" type="number" min="0" value="${item.stock ?? 0}"></div><div class="field"><label>Imagem (URL)</label><input id="store-image" value="${escapeHtml(item.image || "")}"></div></div>
    <label class="checkbox-row"><input id="store-featured" type="checkbox" ${item.featured ? "checked" : ""}> Destaque</label>`;
  else if (kind === "categories") fields = `<div class="field"><label>Nome</label><input id="store-name" value="${escapeHtml(item.name || "")}"></div><label class="checkbox-row"><input id="store-active" type="checkbox" ${item.status !== "inactive" ? "checked" : ""}> Ativa</label>`;
  else fields = `<div class="field"><label>Nome do cliente</label><input id="store-customer" value="${escapeHtml(item.customer?.name || "")}"></div><div class="field"><label>Total</label><input id="store-total" type="number" step="0.01" min="0" value="${item.total ?? 0}"></div><div class="field"><label>Status</label><select id="store-status">${["pending","confirmed","processing","completed","cancelled"].map(s => `<option ${item.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;

  showModal(`<div class="modal-header"><h2>${itemId ? "Editar" : "Novo"} ${title}</h2><button class="icon-btn" onclick="closeModal()">✕</button></div>${fields}<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveStoreItem('${kind}','${projectId}','${itemId}')">Salvar</button>`, "520px");
}

async function saveStoreItem(kind, projectId, itemId) {
  let body = { id: itemId || undefined };
  if (kind === "products") body = { ...body, name: $("store-name")?.value.trim(), description: $("store-description")?.value.trim(), price: Number($("store-price")?.value || 0), salePrice: $("store-sale")?.value === "" ? null : Number($("store-sale")?.value), stock: Number($("store-stock")?.value || 0), image: $("store-image")?.value.trim(), featured: Boolean($("store-featured")?.checked) };
  else if (kind === "categories") body = { ...body, name: $("store-name")?.value.trim(), status: $("store-active")?.checked ? "active" : "inactive" };
  else body = { ...body, customer: { name: $("store-customer")?.value.trim() }, total: Number($("store-total")?.value || 0), status: $("store-status")?.value || "pending", items: [] };

  const res = await API.put(`/api/store/${kind}/${encodeURIComponent(projectId)}`, body);
  if (res.error) return toast(res.message || "Erro ao salvar.", "error");
  closeModal();
  toast("Salvo com sucesso.");
  renderStoreTab($("project-tab-content"), kind, projectId);
}

async function deleteStoreItem(kind, projectId, itemId) {
  if (!confirm("Excluir este registro?")) return;
  const res = await API.del(`/api/store/${kind}/${encodeURIComponent(projectId)}/${encodeURIComponent(itemId)}`);
  if (res.error) return toast(res.message || "Erro ao excluir.", "error");
  toast("Excluído.");
  renderStoreTab($("project-tab-content"), kind, projectId);
}
