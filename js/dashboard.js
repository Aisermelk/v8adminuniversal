// ============================================================
// V8 ADMIN — UNIVERSAL
// Dashboard / Projetos / Clientes / Integrações
// ============================================================

const CLIENT_FIELD_LABELS = {

  // ----------------------------------------------------------
  // RASTREAMENTO
  // ----------------------------------------------------------

  "tracking.pixel":
    "Meta Pixel",

  "tracking.tag":
    "Google Tag (GTM)",

  "tracking.analytics":
    "Google Analytics",


  // ----------------------------------------------------------
  // CONTATO
  // ----------------------------------------------------------

  "contact.whatsapp":
    "WhatsApp",

  "contact.email":
    "E-mail",

  "contact.phone":
    "Telefone",


  // ----------------------------------------------------------
  // REDES SOCIAIS
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // GOOGLE
  // ----------------------------------------------------------

  "google.maps":
    "Google Maps",

  "google.reviews":
    "Google Reviews",


  // ----------------------------------------------------------
  // FORMULÁRIO
  // ----------------------------------------------------------

  "formspree":
    "Formspree",


  // ----------------------------------------------------------
  // SEO
  // ----------------------------------------------------------

  "seo.title":
    "Título SEO",

  "seo.description":
    "Descrição SEO",


  // ----------------------------------------------------------
  // VISUAL
  // ----------------------------------------------------------

  "branding.favicon":
    "Favicon",


  // ----------------------------------------------------------
  // GALERIA
  // ----------------------------------------------------------

  "gallery.enabled":
    "Galeria",

  "gallery.images":
    "Imagens da galeria",


  // ----------------------------------------------------------
  // SCRIPTS
  // ----------------------------------------------------------

  "scripts.custom":
    "Scripts personalizados",

};



// ============================================================
// ESTADO
// ============================================================

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

};



// ============================================================
// UTILITÁRIO $
// ============================================================

function $(id) {

  return document.getElementById(id);

}



// ============================================================
// TOAST
// ============================================================

function toast(
  message,
  type = "success"
) {

  const el =
    document.createElement("div");

  el.className =
    `toast ${type}`;

  el.textContent =
    message;

  document.body.appendChild(el);

  setTimeout(() => {

    el.remove();

  }, 3200);

}



// ============================================================
// ESCAPE HTML
// ============================================================

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



// ============================================================
// GET BY PATH
// ============================================================

function getByPath(
  obj,
  path
) {

  return path
    .split(".")
    .reduce(
      (o, k) =>
        o
          ? o[k]
          : undefined,
      obj
    );

}



// ============================================================
// SET BY PATH
// ============================================================

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



// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    try {

      if (
        typeof Auth !==
        "undefined"
      ) {

        Auth.requireAuth();

      }


      applyStoredTheme();

      setupNav();

      setupThemeToggle();

      switchSection(
        "dashboard"
      );

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



// ============================================================
// NAVEGAÇÃO
// ============================================================

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


  if (logoutBtn) {

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



// ============================================================
// TROCAR SEÇÃO
// ============================================================

function switchSection(
  name
) {

  state.section =
    name;


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



// ============================================================
// CARREGAR DADOS
// ============================================================

async function refreshAllData() {

  try {

    const [
      clientsRes,
      projectsRes
    ] =
      await Promise.all([

        API.get(
          "/api/data/clients"
        ),

        API.get(
          "/api/data/projects"
        ),

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



// ============================================================
// TEMA
// ============================================================

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



// ============================================================
// TEMA TOGGLE
// ============================================================

function setupThemeToggle() {

  const toggle =
    $("theme-toggle");


  if (!toggle) {

    return;

  }


  toggle.checked =
    document.documentElement
      .getAttribute(
        "data-theme"
      ) === "light";


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



// ============================================================
// DASHBOARD
// ============================================================

async function renderDashboard() {

  const wrap =
    $("dashboard-stats");


  if (!wrap) {

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


      <div class="stat-card">

        <div class="value">
          ${Number(
            stats.totalLeads ||
            0
          )}
        </div>

        <div class="label">
          Leads recebidos
        </div>

      </div>

    `;

  } else {

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



  const leadsWrap =
    $("dashboard-recent-leads");


  if (!leadsWrap) {

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

        Assim que o formulário de algum
        projeto receber uma mensagem,
        ela aparece aqui.

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



// ============================================================
// CLIENTES
// ============================================================

function renderClients() {

  const wrap =
    $("clients-table-wrap");


  if (!wrap) {

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


  wrap.innerHTML = `

    <table>

      <thead>

        <tr>

          <th>
            Nome
          </th>

          <th>
            Contato
          </th>

          <th>
            Projeto vinculado
          </th>

          <th>
            Ações
          </th>

        </tr>

      </thead>


      <tbody>

        ${state.clients
          .map(
            (c) => `

              <tr>

                <td>

                  ${escapeHtml(
                    c.name ||
                    ""
                  )}

                </td>


                <td>

                  ${escapeHtml(
                    c.email ||
                    c.phone ||
                    "—"
                  )}

                </td>


                <td>

                  ${escapeHtml(
                    projectNameById(
                      c.projectId
                    ) ||
                    "—"
                  )}

                </td>


                <td class="row-actions">

                  <button
                    class="icon-btn"
                    onclick="openClientModal('${escapeHtml(
                      c.id
                    )}')"
                    title="Editar"
                  >
                    ✏️
                  </button>


                  <button
                    class="icon-btn"
                    onclick="deleteClient('${escapeHtml(
                      c.id
                    )}')"
                    title="Excluir"
                  >
                    🗑️
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



// ============================================================
// PROJETO POR ID
// ============================================================

function projectNameById(
  id
) {

  const project =
    state.projects.find(
      (p) =>
        p.id ===
        id
    );


  return project
    ? project.name
    : null;

}



// ============================================================
// MODAL CLIENTE
// ============================================================

function openClientModal(
  id = null
) {

  state.editingClientId =
    id;


  const client =
    id

      ? state.clients.find(
          (c) =>
            c.id ===
            id
        )

      : {

          name: "",

          email: "",

          phone: "",

          projectId: "",

        };


  if (!client) {

    toast(
      "Cliente não encontrado.",
      "error"
    );

    return;

  }


  const projectOptions =
    state.projects
      .map(
        (p) => `

          <option
            value="${escapeHtml(
              p.id
            )}"

            ${
              p.id ===
              client.projectId
                ? "selected"
                : ""
            }
          >

            ${escapeHtml(
              p.name
            )}

          </option>

        `
      )
      .join("");


  showModal(`

    <div class="modal-header">

      <h2>

        ${
          id
            ? "Editar cliente"
            : "Novo cliente"
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

          <div class="field">

            <label>
              ID do cliente
            </label>

            <input
              value="${escapeHtml(
                id
              )}"
              readonly
            >

          </div>

        `
        : ""
    }


    <div class="field">

      <label>
        Nome
      </label>

      <input
        id="client-name"
        value="${escapeHtml(
          client.name ||
          ""
        )}"
      >

    </div>


    <div class="field-row">

      <div class="field">

        <label>
          E-mail
        </label>

        <input
          id="client-email"
          value="${escapeHtml(
            client.email ||
            ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Telefone
        </label>

        <input
          id="client-phone"
          value="${escapeHtml(
            client.phone ||
            ""
          )}"
        >

      </div>

    </div>


    <div class="field">

      <label>
        Projeto vinculado
      </label>

      <select id="client-project">

        <option value="">
          — nenhum —
        </option>

        ${projectOptions}

      </select>

    </div>


    <button
      class="btn btn-primary"
      style="
        width:100%;
        justify-content:center
      "
      onclick="saveClient()"
    >

      Salvar cliente

    </button>

  `);

}



// ============================================================
// SALVAR CLIENTE
// ============================================================

async function saveClient() {

  const body = {

    name:
      $("client-name")
        ?.value
        .trim() ||
      "",

    email:
      $("client-email")
        ?.value
        .trim() ||
      "",

    phone:
      $("client-phone")
        ?.value
        .trim() ||
      "",

    projectId:
      $("client-project")
        ?.value ||
      "",

  };


  if (!body.name) {

    return toast(
      "Informe o nome do cliente.",
      "error"
    );

  }


  const res =
    state.editingClientId

      ? await API.put(
          "/api/data/clients",
          {
            id:
              state.editingClientId,
            ...body,
          }
        )

      : await API.post(
          "/api/data/clients",
          body
        );


  if (res.error) {

    return toast(
      res.message ||
      "Erro ao salvar cliente.",
      "error"
    );

  }


  closeModal();


  toast(
    "Cliente salvo com sucesso."
  );


  await refreshAllData();

}



// ============================================================
// EXCLUIR CLIENTE
// ============================================================

async function deleteClient(
  id
) {

  if (
    !confirm(
      "Excluir este cliente?"
    )
  ) {

    return;

  }


  const res =
    await API.del(
      `/api/data/clients?id=${encodeURIComponent(
        id
      )}`
    );


  if (res.error) {

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



// ============================================================
// STATUS
// ============================================================

const STATUS_BADGE = {

  "Em produção":
    "badge-success",

  "Em desenvolvimento":
    "badge-warning",

  "Pausado":
    "badge-muted",

};



// ============================================================
// PROJETOS
// ============================================================

function renderProjects() {

  const wrap =
    $("projects-table-wrap");


  if (!wrap) {

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
        contato, redes sociais,
        Google e outras integrações.

      </div>

    `;

    return;

  }


  wrap.innerHTML = `

    <table>

      <thead>

        <tr>

          <th>
            Projeto
          </th>

          <th>
            ID do projeto
          </th>

          <th>
            Status
          </th>

          <th>
            Ações
          </th>

        </tr>

      </thead>


      <tbody>

        ${state.projects
          .map(
            (p) => `

              <tr>

                <td>

                  ${escapeHtml(
                    p.name ||
                    ""
                  )}

                </td>


                <td>

                  <span
                    class="meta"
                    title="${escapeHtml(
                      p.id ||
                      ""
                    )}"

                    style="
                      font-family:monospace;
                      font-size:11px;
                      word-break:break-all;
                    "
                  >

                    ${escapeHtml(
                      p.id ||
                      "—"
                    )}

                  </span>

                </td>


                <td>

                  <span
                    class="badge ${
                      STATUS_BADGE[
                        p.status
                      ] ||
                      "badge-muted"
                    }"
                  >

                    ${escapeHtml(
                      p.status ||
                      "Sem status"
                    )}

                  </span>

                </td>


                <td class="row-actions">

                  <button
                    class="icon-btn"
                    onclick="openProjectModal('${escapeHtml(
                      p.id
                    )}')"
                    title="Editar"
                  >
                    ✏️
                  </button>


                  <button
                    class="icon-btn"
                    onclick="deleteProject('${escapeHtml(
                      p.id
                    )}')"
                    title="Excluir"
                  >
                    🗑️
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



// ============================================================
// PROJETO PADRÃO
// ============================================================

function defaultProject() {

  return {

    name:
      "",

    status:
      "Em desenvolvimento",


    // ----------------------------------------------------------
    // RASTREAMENTO
    // ----------------------------------------------------------

    tracking: {

      pixel:
        "",

      tag:
        "",

      analytics:
        "",

    },


    // ----------------------------------------------------------
    // CONTATO
    // ----------------------------------------------------------

    contact: {

      whatsapp:
        "",

      email:
        "",

      phone:
        "",

    },


    // ----------------------------------------------------------
    // REDES SOCIAIS
    // ----------------------------------------------------------

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
        "",

    },


    // ----------------------------------------------------------
    // GOOGLE
    // ----------------------------------------------------------

    google: {

      maps:
        "",

      reviews:
        "",

    },


    // ----------------------------------------------------------
    // FORMULÁRIO
    // ----------------------------------------------------------

    formspree:
      "",


    // ----------------------------------------------------------
    // GALERIA
    // ----------------------------------------------------------

    gallery: {

      enabled:
        false,

      images:
        [],

    },


    // ----------------------------------------------------------
    // SEO
    // ----------------------------------------------------------

    seo: {

      title:
        "",

      description:
        "",

      keywords:
        "",

    },


    // ----------------------------------------------------------
    // BRANDING
    // ----------------------------------------------------------

    branding: {

      favicon:
        "",

    },


    // ----------------------------------------------------------
    // SCRIPTS PERSONALIZADOS
    // ----------------------------------------------------------

    scripts: {

      custom:
        "",

    },

  };

}



// ============================================================
// NORMALIZAR PROJETO
// ============================================================

function normalizeProject(
  project
) {

  const p =
    project ||
    defaultProject();


  p.tracking =
    p.tracking ||
    {};

  p.contact =
    p.contact ||
    {};

  p.social =
    p.social ||
    {};

  p.google =
    p.google ||
    {};

  p.gallery =
    p.gallery ||
    {};

  p.seo =
    p.seo ||
    {};

  p.branding =
    p.branding ||
    {};

  p.scripts =
    p.scripts ||
    {};


  if (
    !Array.isArray(
      p.gallery.images
    )
  ) {

    p.gallery.images =
      [];

  }


  if (
    typeof p.gallery.enabled !==
    "boolean"
  ) {

    p.gallery.enabled =
      false;

  }


  return p;

}



// ============================================================
// MODAL PROJETO
// ============================================================

function openProjectModal(
  id = null
) {

  state.editingProjectId =
    id;

  state.projectTab =
    "geral";


  let project;


  if (id) {

    project =
      state.projects.find(
        (p) =>
          p.id ===
          id
      );


    if (!project) {

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


  project =
    normalizeProject(
      project
    );


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
              ${escapeHtml(id)}
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


      <button
        class="tab"
        data-tab="google"
      >
        Google
      </button>


      <button
        class="tab"
        data-tab="galeria"
      >
        Galeria
      </button>


      <button
        class="tab"
        data-tab="seo"
      >
        SEO
      </button>


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

  `, "700px");


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



// ============================================================
// ABAS DO PROJETO
// ============================================================

function renderProjectTab() {

  const el =
    $("project-tab-content");


  if (!el) {

    return;

  }


  const draft =
    state._editingProjectDraft;


  if (!draft) {

    return;

  }


  normalizeProject(
    draft
  );


  // ==========================================================
  // GERAL
  // ==========================================================

  if (
    state.projectTab ===
    "geral"
  ) {

    el.innerHTML = `

      ${
        state.editingProjectId
          ? `

            <div class="field">

              <label>

                ID do projeto

                <span
                  style="
                    color:var(--text-muted);
                    font-weight:400
                  "
                >

                  (use este ID para
                  integrar o site)

                </span>

              </label>


              <div
                style="
                  display:flex;
                  gap:6px
                "
              >

                <input
                  id="p-project-id"
                  value="${escapeHtml(
                    state.editingProjectId
                  )}"
                  readonly
                  style="
                    font-family:monospace;
                    font-size:12.5px
                  "
                >


                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  onclick="copyProjectId('${escapeHtml(
                    state.editingProjectId
                  )}')"
                >

                  Copiar

                </button>

              </div>

            </div>

          `
          : ""
      }


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
          placeholder="Ex.: Studio Voar"
        >

      </div>


      <div class="field">

        <label>
          Status
        </label>

        <select id="p-status">

          ${[
            "Em desenvolvimento",
            "Em produção",
            "Pausado",
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


      <div class="form-section">

        <h3>
          Identidade
        </h3>


        <div class="field">

          <label>
            Favicon
          </label>

          <input
            id="p-favicon"
            value="${escapeHtml(
              draft.branding
                ?.favicon ||
              ""
            )}"
            placeholder="https://site.com/favicon.png"
          >

          <div class="meta">

            URL da imagem que será usada
            como favicon do site.

          </div>

        </div>

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



  // ==========================================================
  // CONFIGURAÇÕES
  // ==========================================================

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
            placeholder="123456789012345"
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
            placeholder="GTM-XXXXXXX"
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
            placeholder="G-XXXXXXXXXX"
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
      "p-linkedin",

    ].forEach(
      (id) => {

        const input =
          $(id);


        if (input) {

          input.addEventListener(
            "input",
            renderLivePreview
          );

        }

      }
    );


    renderLivePreview();

  }



  // ==========================================================
  // GOOGLE
  // ==========================================================

  if (
    state.projectTab ===
    "google"
  ) {

    el.innerHTML = `

      <div class="form-section">

        <h3>
          Google Maps
        </h3>


        <p
          class="meta"
          style="margin-bottom:12px"
        >

          Configure o endereço ou
          URL do Google Maps que o
          site deverá utilizar.

        </p>


        <div class="field">

          <label>
            Google Maps
          </label>

          <input
            id="p-google-maps"
            value="${escapeHtml(
              draft.google.maps ||
              ""
            )}"
            placeholder="https://maps.google.com/..."
          >

        </div>


        <div class="field">

          <label>
            Google Maps — Embed / iframe
          </label>

          <textarea
            id="p-google-maps-embed"
            rows="5"
            placeholder="<iframe src=...></iframe>"
          >${escapeHtml(
            draft.google.mapsEmbed ||
            ""
          )}</textarea>

        </div>

      </div>


      <div class="form-section">

        <h3>
          Google Reviews
        </h3>


        <p
          class="meta"
          style="margin-bottom:12px"
        >

          Informe o link público das
          avaliações da empresa.

        </p>


        <div class="field">

          <label>
            Link das avaliações
          </label>

          <input
            id="p-google-reviews"
            value="${escapeHtml(
              draft.google.reviews ||
              ""
            )}"
            placeholder="https://g.page/r/..."
          >

        </div>


        <div class="field">

          <label>
            Place ID
          </label>

          <input
            id="p-google-place-id"
            value="${escapeHtml(
              draft.google.placeId ||
              ""
            )}"
            placeholder="ChIJ..."
          >

        </div>

      </div>


      <div class="live-preview">

        <div class="preview-label">
          Google configurado
        </div>


        <div
          style="
            font-size:12px;
            color:var(--text-muted)
          "
        >

          ${
            draft.google.maps ||
            draft.google.reviews ||
            draft.google.placeId
              ? "Sim — existem configurações Google cadastradas."
              : "Nenhuma configuração Google cadastrada ainda."
          }

        </div>

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

  }



  // ==========================================================
  // GALERIA
  // ==========================================================

  if (
    state.projectTab ===
    "galeria"
  ) {

    const images =
      Array.isArray(
        draft.gallery.images
      )
        ? draft.gallery.images
        : [];


    el.innerHTML = `

      <div class="form-section">

        <h3>
          Galeria do projeto
        </h3>


        <div class="checkbox-row">

          <input
            type="checkbox"
            id="p-gallery-enabled"
            ${
              draft.gallery.enabled
                ? "checked"
                : ""
            }
          >


          <label
            for="p-gallery-enabled"
            style="
              margin:0;
              font-weight:400;
              color:var(--text-main)
            "
          >

            Ativar galeria

          </label>

        </div>


        <div
          class="field"
          style="margin-top:14px"
        >

          <label>
            Imagens
          </label>


          <textarea
            id="p-gallery-images"
            rows="8"
            placeholder="Cole uma URL de imagem por linha"
          >${escapeHtml(
            images.join("\n")
          )}</textarea>


          <div class="meta">

            Uma URL por linha.
            Exemplo:

            https://site.com/imagem1.jpg

            https://site.com/imagem2.jpg

          </div>

        </div>

      </div>


      <div class="live-preview">

        <div class="preview-label">
          Prévia da galeria
        </div>


        <div
          id="gallery-preview"
          style="
            display:grid;
            grid-template-columns:
              repeat(3,1fr);
            gap:8px;
          "
        >

          ${
            images.length
              ? images
                  .filter(Boolean)
                  .map(
                    (url) => `

                      <img
                        src="${escapeHtml(
                          url
                        )}"
                        alt="Imagem"
                        style="
                          width:100%;
                          height:90px;
                          object-fit:cover;
                          border-radius:8px;
                          background:var(--surface);
                        "
                        onerror="
                          this.style.opacity='.25'
                        "
                      >

                    `
                  )
                  .join("")
              : `

                <span
                  class="meta"
                  style="
                    grid-column:1/-1
                  "
                >

                  Nenhuma imagem cadastrada.

                </span>

              `
          }

        </div>

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

        Salvar galeria

      </button>

    `;

  }



  // ==========================================================
  // SEO
  // ==========================================================

  if (
    state.projectTab ===
    "seo"
  ) {

    el.innerHTML = `

      <div class="form-section">

        <h3>
          SEO do projeto
        </h3>


        <div class="field">

          <label>
            Título SEO
          </label>

          <input
            id="p-seo-title"
            value="${escapeHtml(
              draft.seo.title ||
              ""
            )}"
            placeholder="Nome da empresa | Serviço"
          >

        </div>


        <div class="field">

          <label>
            Descrição SEO
          </label>

          <textarea
            id="p-seo-description"
            rows="4"
            placeholder="Descrição da empresa para mecanismos de busca..."
          >${escapeHtml(
            draft.seo.description ||
            ""
          )}</textarea>

        </div>


        <div class="field">

          <label>
            Palavras-chave
          </label>

          <input
            id="p-seo-keywords"
            value="${escapeHtml(
              draft.seo.keywords ||
              ""
            )}"
            placeholder="empresa, serviço, cidade"
          >

        </div>

      </div>


      <div class="form-section">

        <h3>
          Scripts personalizados
        </h3>


        <div class="field">

          <label>
            Scripts
          </label>

          <textarea
            id="p-custom-scripts"
            rows="8"
            placeholder="Cole aqui scripts personalizados..."
          >${escapeHtml(
            draft.scripts.custom ||
            ""
          )}</textarea>


          <div class="meta">

            Use somente scripts confiáveis.
            O loader poderá aplicar esses
            scripts automaticamente no site.

          </div>

        </div>

      </div>


      <button
        class="btn btn-primary"
        style="
          width:100%;
          justify-content:center
        "
        onclick="saveProject()"
      >

        Salvar SEO

      </button>

    `;

  }



  // ==========================================================
  // ACESSO
  // ==========================================================

  if (
    state.projectTab ===
    "acesso"
  ) {

    renderClientAccessTab(
      el
    );

  }



  // ==========================================================
  // LEADS
  // ==========================================================

  if (
    state.projectTab ===
    "leads"
  ) {

    renderLeadsTab(
      el
    );

  }

}



// ============================================================
// PRÉVIA
// ============================================================

function renderLivePreview() {

  const box =
    $("live-preview-content");


  if (!box) {

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
        ?.value,

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
      "Telefone",

  ].filter(Boolean);


  const chips =
    Object.entries(
      social
    )

      .filter(
        ([, v]) => v
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

            Nenhuma rede social
            preenchida ainda

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



// ============================================================
// SNIPPET DE TRACKING
// ============================================================

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


  if (pixel) {

    snippet += `

<!-- Meta Pixel -->

<script>

!function(f,b,e,v,n,t,s){

if(f.fbq)return;

n=f.fbq=function(){

n.callMethod ?

n.callMethod.apply(
  n,
  arguments
) :

n.queue.push(arguments)

};

if(!f._fbq)
  f._fbq=n;

n.push=n;
n.loaded=!0;
n.version='2.0';
n.queue=[];

t=b.createElement(e);
t.async=!0;
t.src=v;

s=b.getElementsByTagName(e)[0];

s.parentNode.insertBefore(
  t,
  s
)

}

(
  window,
  document,
  'script',
  'https://connect.facebook.net/en_US/fbevents.js'
);

fbq(
  'init',
  '${pixel}'
);

fbq(
  'track',
  'PageView'
);

</script>

`.trim();

  }


  if (analytics) {

    if (snippet) {

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
  window.dataLayer ||
  [];

function gtag(){

  dataLayer.push(
    arguments
  );

}

gtag(
  'js',
  new Date()
);

gtag(
  'config',
  '${analytics}'
);

</script>

`.trim();

  }


  if (!snippet) {

    return toast(
      "Preencha Pixel ou Analytics primeiro.",
      "error"
    );

  }


  try {

    await navigator.clipboard.writeText(
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



// ============================================================
// COPIAR ID
// ============================================================

async function copyProjectId(
  id
) {

  try {

    await navigator.clipboard.writeText(
      id
    );


    toast(
      "ID do projeto copiado."
    );

  } catch {

    toast(
      id,
      "success"
    );

  }

}



// ============================================================
// LER CAMPOS DO PROJETO
// ============================================================

function collectProjectFormData(
  draft
) {

  // ----------------------------------------------------------
  // GERAL
  // ----------------------------------------------------------

  const name =
    $("p-name")
      ?.value
      .trim();


  const status =
    $("p-status")
      ?.value;


  if (name !== undefined) {

    draft.name =
      name;

  }


  if (status !== undefined) {

    draft.status =
      status;

  }


  // ----------------------------------------------------------
  // BRANDING
  // ----------------------------------------------------------

  if (
    $("p-favicon")
  ) {

    draft.branding =
      draft.branding ||
      {};

    draft.branding.favicon =
      $("p-favicon")
        .value
        .trim();

  }


  // ----------------------------------------------------------
  // TRACKING
  // ----------------------------------------------------------

  if (
    $("p-pixel") ||
    $("p-tag") ||
    $("p-analytics")
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
        "",

    };

  }


  // ----------------------------------------------------------
  // CONTATO
  // ----------------------------------------------------------

  if (
    $("p-whatsapp") ||
    $("p-email") ||
    $("p-phone")
  ) {

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
        "",

    };

  }


  // ----------------------------------------------------------
  // REDES SOCIAIS
  // ----------------------------------------------------------

  if (
    $("p-facebook") ||
    $("p-instagram") ||
    $("p-tiktok") ||
    $("p-youtube") ||
    $("p-linkedin")
  ) {

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
        "",

    };

  }


  // ----------------------------------------------------------
  // FORMSPREE
  // ----------------------------------------------------------

  if (
    $("p-formspree")
  ) {

    draft.formspree =
      $("p-formspree")
        .value
        .trim();

  }


  // ----------------------------------------------------------
  // GOOGLE
  // ----------------------------------------------------------

  if (
    $("p-google-maps") ||
    $("p-google-reviews") ||
    $("p-google-place-id") ||
    $("p-google-maps-embed")
  ) {

    draft.google =
      draft.google ||
      {};


    draft.google.maps =
      $("p-google-maps")
        ?.value
        .trim() ||
      "";


    draft.google.mapsEmbed =
      $("p-google-maps-embed")
        ?.value
        .trim() ||
      "";


    draft.google.reviews =
      $("p-google-reviews")
        ?.value
        .trim() ||
      "";


    draft.google.placeId =
      $("p-google-place-id")
        ?.value
        .trim() ||
      "";

  }


  // ----------------------------------------------------------
  // GALERIA
  // ----------------------------------------------------------

  if (
    $("p-gallery-enabled") ||
    $("p-gallery-images")
  ) {

    draft.gallery =
      draft.gallery ||
      {};


    draft.gallery.enabled =
      Boolean(
        $("p-gallery-enabled")
          ?.checked
      );


    draft.gallery.images =
      (
        $("p-gallery-images")
          ?.value ||
        ""
      )

        .split("\n")

        .map(
          (url) =>
            url.trim()
        )

        .filter(Boolean);

  }


  // ----------------------------------------------------------
  // SEO
  // ----------------------------------------------------------

  if (
    $("p-seo-title") ||
    $("p-seo-description") ||
    $("p-seo-keywords")
  ) {

    draft.seo =
      draft.seo ||
      {};


    draft.seo.title =
      $("p-seo-title")
        ?.value
        .trim() ||
      "";


    draft.seo.description =
      $("p-seo-description")
        ?.value
        .trim() ||
      "";


    draft.seo.keywords =
      $("p-seo-keywords")
        ?.value
        .trim() ||
      "";

  }


  // ----------------------------------------------------------
  // SCRIPTS
  // ----------------------------------------------------------

  if (
    $("p-custom-scripts")
  ) {

    draft.scripts =
      draft.scripts ||
      {};


    draft.scripts.custom =
      $("p-custom-scripts")
        .value
        .trim();

  }


  return draft;

}



// ============================================================
// SALVAR PROJETO
// ============================================================

async function saveProject() {

  const draft =
    state._editingProjectDraft;


  if (!draft) {

    return;

  }


  collectProjectFormData(
    draft
  );


  if (!draft.name) {

    return toast(
      "Informe o nome do projeto.",
      "error"
    );

  }


  let res;


  if (
    state.editingProjectId
  ) {

    res =
      await API.put(
        "/api/data/projects",
        {
          id:
            state.editingProjectId,

          ...draft,

        }
      );

  } else {

    res =
      await API.post(
        "/api/data/projects",
        draft
      );

  }


  if (res.error) {

    return toast(
      res.message ||
      "Erro ao salvar projeto.",
      "error"
    );

  }


  toast(
    "Projeto salvo com sucesso."
  );


  if (
    !state.editingProjectId
  ) {

    closeModal();

  } else {

    const index =
      state.projects.findIndex(
        (p) =>
          p.id ===
          state.editingProjectId
      );


    if (
      index !==
      -1
    ) {

      state.projects[
        index
      ] = {

        ...state.projects[
          index
        ],

        ...draft,

      };

    }

  }


  await refreshAllData();

}



// ============================================================
// EXCLUIR PROJETO
// ============================================================

async function deleteProject(
  id
) {

  if (
    !confirm(
      "Excluir este projeto?\n\n" +
      "Isso também remove leads " +
      "e links de cliente associados."
    )
  ) {

    return;

  }


  const res =
    await API.del(
      `/api/data/projects?id=${encodeURIComponent(
        id
      )}`
    );


  if (res.error) {

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



// ============================================================
// ACESSO DO CLIENTE
// ============================================================

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
                    path.replace(
                      /\./g,
                      "-"
                    )
                  )}"
                >


                <label
                  for="cf-${escapeHtml(
                    path.replace(
                      /\./g,
                      "-"
                    )
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
        style="margin-top:12px"
        onclick="generateClientLink()"
      >

        Gerar link do cliente

      </button>

    </div>


    <div class="form-section">

      <h3>
        Links ativos
      </h3>


      <div id="client-links-list">

        ${
          Array.isArray(
            links
          ) &&
          links.length

            ? links

                .filter(
                  (l) =>
                    !l.revoked
                )

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



// ============================================================
// LINHA LINK CLIENTE
// ============================================================

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
          CLIENT_FIELD_LABELS[
            f
          ] ||
          f
      )

      .join(", ");


  return `

    <div class="link-row">

      <div>

        <div
          style="font-size:12.5px"
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



// ============================================================
// GERAR LINK
// ============================================================

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
        fields,
      }
    );


  if (res.error) {

    return toast(
      res.message ||
      "Erro ao gerar link.",
      "error"
    );

  }


  state._lastGeneratedToken =
    res.token;


  toast(
    "Link gerado."
  );


  renderProjectTab();


  setTimeout(
    () =>
      copyClientLinkByToken(
        res.token
      ),
    100
  );

}



// ============================================================
// URL DO CLIENTE
// ============================================================

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


  return `${base}/editar.html?token=${encodeURIComponent(
    token
  )}`;

}



// ============================================================
// COPIAR LINK GERADO
// ============================================================

async function copyClientLinkByToken(
  token
) {

  const url =
    buildClientEditUrl(
      token
    );


  try {

    await navigator.clipboard.writeText(
      url
    );


    toast(
      "Link copiado — envie para o cliente."
    );

  } catch {

    toast(
      url,
      "success"
    );

  }

}



// ============================================================
// COPIAR LINK ANTIGO
// ============================================================

async function copyClientLink(
  jti,
  btn
) {

  toast(
    "Por segurança, o link completo só é mostrado no momento em que é gerado. Se foi perdido, revogue e gere um novo.",
    "error"
  );

}



// ============================================================
// REVOGAR LINK
// ============================================================

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


  if (res.error) {

    return toast(
      res.message ||
      "Erro ao revogar link.",
      "error"
    );

  }


  toast(
    "Link revogado."
  );


  renderProjectTab();

}



// ============================================================
// LEADS
// ============================================================

async function renderLeadsTab(
  el
) {

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
                      style="margin-top:4px"
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



// ============================================================
// MODAL
// ============================================================

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
      style="max-width:${maxWidth}"
    >

      ${innerHtml}

    </div>

  `;


  document.body.appendChild(
    overlay
  );

}



// ============================================================
// FECHAR MODAL
// ============================================================

function closeModal() {

  const el =
    $("modal-overlay");


  if (el) {

    el.remove();

  }

}



// ============================================================
// EXPOR FUNÇÕES GLOBALMENTE
// ============================================================

window.openClientModal =
  openClientModal;

window.saveClient =
  saveClient;

window.deleteClient =
  deleteClient;

window.openProjectModal =
  openProjectModal;

window.saveProject =
  saveProject;

window.deleteProject =
  deleteProject;

window.copyProjectId =
  copyProjectId;

window.copyTrackingSnippet =
  copyTrackingSnippet;

window.generateClientLink =
  generateClientLink;

window.copyClientLinkByToken =
  copyClientLinkByToken;

window.copyClientLink =
  copyClientLink;

window.revokeClientLink =
  revokeClientLink;

window.closeModal =
  closeModal;
