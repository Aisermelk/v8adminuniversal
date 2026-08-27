// V8 ADMIN — Universal | Lógica do painel

const CLIENT_FIELD_LABELS = {
  "tracking.pixel": "Meta Pixel",
  "tracking.tag": "Google Tag (GTM)",
  "tracking.analytics": "Google Analytics",
  "contact.whatsapp": "WhatsApp",
  "contact.email": "E-mail",
  "contact.phone": "Telefone",
  "social.facebook": "Facebook",
  "social.instagram": "Instagram",
  "social.tiktok": "TikTok",
  "social.youtube": "YouTube",
  "social.linkedin": "LinkedIn",
  "formspree": "Formspree",
};

const state = {
  section: "dashboard",
  clients: [],
  projects: [],
  editingClientId: null,
  editingProjectId: null,
  projectTab: "geral",
};

function $(id) { return document.getElementById(id); }

function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ---------------------------------------------------------------- //
// Init                                                              //
// ---------------------------------------------------------------- //

document.addEventListener("DOMContentLoaded", () => {
  if (typeof Auth !== "undefined") Auth.requireAuth();
  applyStoredTheme();
  setupNav();
  setupThemeToggle();
  switchSection("dashboard");
  refreshAllData();
});

function setupNav() {
  document.querySelectorAll(".nav-item[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
  const logoutBtn = $("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.logout());
}

function switchSection(name) {
  state.section = name;
  document.querySelectorAll(".nav-item[data-section]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  document.querySelectorAll(".section").forEach((sec) => {
    sec.classList.toggle("hidden", sec.dataset.section !== name);
  });
  if (name === "dashboard") renderDashboard();
  if (name === "clients") renderClients();
  if (name === "projects") renderProjects();
}

async function refreshAllData() {
  const [clientsRes, projectsRes] = await Promise.all([
    API.get("/api/data/clients"),
    API.get("/api/data/projects"),
  ]);
  state.clients = Array.isArray(clientsRes) ? clientsRes : [];
  state.projects = Array.isArray(projectsRes) ? projectsRes : [];
  switchSection(state.section);
}

// ---------------------------------------------------------------- //
// Tema                                                               //
// ---------------------------------------------------------------- //

function applyStoredTheme() {
  const saved = localStorage.getItem("v8_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}

function setupThemeToggle() {
  const toggle = $("theme-toggle");
  if (!toggle) return;
  toggle.checked = document.documentElement.getAttribute("data-theme") === "light";
  toggle.addEventListener("change", () => {
    const theme = toggle.checked ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("v8_theme", theme);
  });
}

// ---------------------------------------------------------------- //
// Dashboard                                                          //
// ---------------------------------------------------------------- //

async function renderDashboard() {
  const wrap = $("dashboard-stats");
  if (!wrap) return;
  wrap.innerHTML = `<div class="stat-card"><div class="value">…</div><div class="label">Carregando</div></div>`;

  const stats = await API.get("/api/dashboard/stats");
  if (stats.error) {
    wrap.innerHTML = `<div class="empty-state">Não foi possível carregar as estatísticas.</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="stat-card"><div class="value">${stats.totalProjects}</div><div class="label">Projetos</div></div>
    <div class="stat-card"><div class="value">${stats.totalClients}</div><div class="label">Clientes</div></div>
    <div class="stat-card"><div class="value">${stats.totalLeads}</div><div class="label">Leads recebidos</div></div>
  `;

  const leadsWrap = $("dashboard-recent-leads");
  if (!leadsWrap) return;
  if (!stats.recentLeads || stats.recentLeads.length === 0) {
    leadsWrap.innerHTML = `<div class="empty-state"><strong>Nenhum lead ainda</strong>Assim que o formulário de algum projeto receber uma mensagem, ela aparece aqui.</div>`;
    return;
  }
  leadsWrap.innerHTML = stats.recentLeads.map((l) => `
    <div class="link-row">
      <div>
        <div>${escapeHtml(l.name || "Sem nome")} <span class="meta">— ${escapeHtml(l.projectName)}</span></div>
        <div class="meta">${escapeHtml(l.email || "")}</div>
      </div>
      <div class="meta">${new Date(l.createdAt).toLocaleDateString("pt-BR")}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------- //
// Clientes                                                           //
// ---------------------------------------------------------------- //

function renderClients() {
  const wrap = $("clients-table-wrap");
  if (!wrap) return;

  if (state.clients.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><strong>Nenhum cliente cadastrado</strong>Cadastre seu primeiro cliente para vincular a um projeto.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Nome</th><th>Contato</th><th>Projeto vinculado</th><th></th></tr></thead>
      <tbody>
        ${state.clients.map((c) => `
          <tr>
            <td>${escapeHtml(c.name || "")}</td>
            <td>${escapeHtml(c.email || c.phone || "—")}</td>
            <td>${escapeHtml(projectNameById(c.projectId) || "—")}</td>
            <td class="row-actions">
              <button class="icon-btn" onclick="openClientModal('${c.id}')" title="Editar">✏️</button>
              <button class="icon-btn" onclick="deleteClient('${c.id}')" title="Excluir">🗑️</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function projectNameById(id) {
  const p = state.projects.find((p) => p.id === id);
  return p ? p.name : null;
}

function openClientModal(id = null) {
  state.editingClientId = id;
  const client = id ? state.clients.find((c) => c.id === id) : { name: "", email: "", phone: "", projectId: "" };

  const projectOptions = state.projects.map((p) => `<option value="${p.id}" ${p.id === client.projectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");

  showModal(`
    <div class="modal-header"><h2>${id ? "Editar cliente" : "Novo cliente"}</h2><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="field"><label>Nome</label><input id="client-name" value="${escapeHtml(client.name)}"></div>
    <div class="field-row">
      <div class="field"><label>E-mail</label><input id="client-email" value="${escapeHtml(client.email || "")}"></div>
      <div class="field"><label>Telefone</label><input id="client-phone" value="${escapeHtml(client.phone || "")}"></div>
    </div>
    <div class="field"><label>Projeto vinculado</label><select id="client-project"><option value="">— nenhum —</option>${projectOptions}</select></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveClient()">Salvar cliente</button>
  `);
}

async function saveClient() {
  const body = {
    name: $("client-name").value.trim(),
    email: $("client-email").value.trim(),
    phone: $("client-phone").value.trim(),
    projectId: $("client-project").value,
  };
  if (!body.name) return toast("Informe o nome do cliente", "error");

  const res = state.editingClientId
    ? await API.put("/api/data/clients", { id: state.editingClientId, ...body })
    : await API.post("/api/data/clients", body);

  if (res.error) return toast(res.message || "Erro ao salvar", "error");
  closeModal();
  toast("Cliente salvo");
  await refreshAllData();
}

async function deleteClient(id) {
  if (!confirm("Excluir este cliente?")) return;
  const res = await API.del(`/api/data/clients?id=${id}`);
  if (res.error) return toast(res.message || "Erro ao excluir", "error");
  toast("Cliente excluído");
  await refreshAllData();
}

// ---------------------------------------------------------------- //
// Projetos                                                           //
// ---------------------------------------------------------------- //

const STATUS_BADGE = {
  "Em produção": "badge-success",
  "Em desenvolvimento": "badge-warning",
  "Pausado": "badge-muted",
};

function renderProjects() {
  const wrap = $("projects-table-wrap");
  if (!wrap) return;

  if (state.projects.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><strong>Nenhum projeto cadastrado</strong>Crie o primeiro projeto para configurar rastreamento, contato e redes sociais.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
  <tr>
    <th>Projeto</th>
    <th>ID do projeto</th>
    <th>Status</th>
    <th></th>
  </tr>
</thead>
      <tbody>
        ${state.projects.map((p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td><span class="badge ${STATUS_BADGE[p.status] || "badge-muted"}">${escapeHtml(p.status)}</span></td>
            <td class="row-actions">
              <button class="icon-btn" onclick="openProjectModal('${p.id}')" title="Editar">✏️</button>
              <button class="icon-btn" onclick="deleteProject('${p.id}')" title="Excluir">🗑️</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function defaultProject() {
  return {
    name: "", status: "Em desenvolvimento",
    tracking: { pixel: "", tag: "", analytics: "" },
    contact: { whatsapp: "", email: "", phone: "" },
    social: { facebook: "", instagram: "", tiktok: "", youtube: "", linkedin: "" },
    formspree: "",
  };
}

function openProjectModal(id = null) {
  state.editingProjectId = id;
  state.projectTab = "geral";
  const project = id ? state.projects.find((p) => p.id === id) : defaultProject();
  state._editingProjectDraft = JSON.parse(JSON.stringify(project));

  showModal(`
    <div class="modal-header"><h2>${id ? "Editar projeto" : "Novo projeto"}</h2><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="tabs" id="project-tabs">
      <button class="tab active" data-tab="geral">Geral</button>
      <button class="tab" data-tab="config">Config &amp; redes</button>
      ${id ? '<button class="tab" data-tab="acesso">Acesso do cliente</button>' : ""}
      ${id ? '<button class="tab" data-tab="leads">Leads</button>' : ""}
    </div>
    <div id="project-tab-content"></div>
  `, "560px");

  document.querySelectorAll("#project-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#project-tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.projectTab = btn.dataset.tab;
      renderProjectTab();
    });
  });

  renderProjectTab();
}

function renderProjectTab() {
  const el = $("project-tab-content");
  const draft = state._editingProjectDraft;

  if (state.projectTab === "geral") {
    el.innerHTML = `
      <div class="field"><label>Nome do projeto</label><input id="p-name" value="${escapeHtml(draft.name)}"></div>
      <div class="field"><label>Status</label>
        <select id="p-status">
          ${["Em desenvolvimento", "Em produção", "Pausado"].map((s) => `<option value="${s}" ${s === draft.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveProject()">Salvar projeto</button>
    `;
  }

  if (state.projectTab === "config") {
    el.innerHTML = `
      <div class="form-section">
        <h3>Rastreamento</h3>
        <div class="field"><label>Meta Pixel (ID)</label><input id="p-pixel" value="${escapeHtml(draft.tracking.pixel)}"></div>
        <div class="field"><label>Google Tag / GTM (ID)</label><input id="p-tag" value="${escapeHtml(draft.tracking.tag)}"></div>
        <div class="field"><label>Google Analytics (ID)</label><input id="p-analytics" value="${escapeHtml(draft.tracking.analytics)}"></div>
        ${draft.tracking.pixel || draft.tracking.analytics ? `<button class="btn btn-ghost btn-sm" onclick="copyTrackingSnippet()">Copiar snippet de instalação</button>` : ""}
      </div>
      <div class="form-section">
        <h3>Contato</h3>
        <div class="field"><label>WhatsApp</label><input id="p-whatsapp" value="${escapeHtml(draft.contact.whatsapp)}" placeholder="5511999999999"></div>
        <div class="field-row">
          <div class="field"><label>E-mail</label><input id="p-email" value="${escapeHtml(draft.contact.email)}"></div>
          <div class="field"><label>Telefone</label><input id="p-phone" value="${escapeHtml(draft.contact.phone)}"></div>
        </div>
      </div>
      <div class="form-section">
        <h3>Redes sociais</h3>
        <div class="field"><label>Facebook</label><input id="p-facebook" value="${escapeHtml(draft.social.facebook)}"></div>
        <div class="field"><label>Instagram</label><input id="p-instagram" value="${escapeHtml(draft.social.instagram)}"></div>
        <div class="field"><label>TikTok</label><input id="p-tiktok" value="${escapeHtml(draft.social.tiktok)}"></div>
        <div class="field"><label>YouTube</label><input id="p-youtube" value="${escapeHtml(draft.social.youtube)}"></div>
        <div class="field"><label>LinkedIn</label><input id="p-linkedin" value="${escapeHtml(draft.social.linkedin)}"></div>
      </div>
      <div class="form-section">
        <h3>Formspree</h3>
        <div class="field"><label>Endpoint</label><input id="p-formspree" value="${escapeHtml(draft.formspree)}" placeholder="https://formspree.io/f/xxxxxxx"></div>
      </div>
      <div class="live-preview">
        <div class="preview-label">Prévia — como aparece no site</div>
        <div id="live-preview-content"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:16px" onclick="saveProject()">Salvar projeto</button>
    `;
    ["p-whatsapp", "p-email", "p-phone", "p-facebook", "p-instagram", "p-tiktok", "p-youtube", "p-linkedin"].forEach((id) => {
      $(id).addEventListener("input", renderLivePreview);
    });
    renderLivePreview();
  }

  if (state.projectTab === "acesso") {
    renderClientAccessTab(el);
  }

  if (state.projectTab === "leads") {
    renderLeadsTab(el);
  }
}

function renderLivePreview() {
  const box = $("live-preview-content");
  if (!box) return;
  const social = {
    Facebook: $("p-facebook")?.value, Instagram: $("p-instagram")?.value, TikTok: $("p-tiktok")?.value,
    YouTube: $("p-youtube")?.value, LinkedIn: $("p-linkedin")?.value,
  };
  const contactBits = [$("p-whatsapp")?.value && "WhatsApp", $("p-email")?.value && "E-mail", $("p-phone")?.value && "Telefone"].filter(Boolean);
  const chips = Object.entries(social).filter(([, v]) => v).map(([name]) => `<span class="preview-chip">${name}</span>`).join("");

  box.innerHTML = `
    <div class="preview-social">${chips || '<span class="meta" style="color:var(--text-faint)">Nenhuma rede social preenchida ainda</span>'}</div>
    <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Contato visível no site: ${contactBits.length ? contactBits.join(", ") : "nenhum"}</div>
  `;
}

async function copyTrackingSnippet() {
  const pixel = $("p-pixel").value.trim();
  const analytics = $("p-analytics").value.trim();
  let snippet = "";
  if (pixel) {
    snippet += `<!-- Meta Pixel -->\n<script>\n!function(f,b,e,v,n,t,s){...}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '${pixel}');\nfbq('track', 'PageView');\n</script>\n\n`;
  }
  if (analytics) {
    snippet += `<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${analytics}"></script>\n<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${analytics}');\n</script>`;
  }
  if (!snippet) return toast("Preencha Pixel ou Analytics primeiro", "error");
  try {
    await navigator.clipboard.writeText(snippet);
    toast("Snippet copiado");
  } catch {
    toast("Não foi possível copiar automaticamente", "error");
  }
}

async function saveProject() {
  const draft = state._editingProjectDraft;

  if (state.projectTab === "geral") {
    draft.name = $("p-name").value.trim();
    draft.status = $("p-status").value;
  } else {
    draft.tracking = { pixel: $("p-pixel")?.value.trim() || "", tag: $("p-tag")?.value.trim() || "", analytics: $("p-analytics")?.value.trim() || "" };
    draft.contact = { whatsapp: $("p-whatsapp")?.value.trim() || "", email: $("p-email")?.value.trim() || "", phone: $("p-phone")?.value.trim() || "" };
    draft.social = {
      facebook: $("p-facebook")?.value.trim() || "", instagram: $("p-instagram")?.value.trim() || "",
      tiktok: $("p-tiktok")?.value.trim() || "", youtube: $("p-youtube")?.value.trim() || "", linkedin: $("p-linkedin")?.value.trim() || "",
    };
    draft.formspree = $("p-formspree")?.value.trim() || "";
  }

  if (!draft.name) return toast("Informe o nome do projeto", "error");

  const res = state.editingProjectId
    ? await API.put("/api/data/projects", { id: state.editingProjectId, ...draft })
    : await API.post("/api/data/projects", draft);

  if (res.error) return toast(res.message || "Erro ao salvar", "error");
  toast("Projeto salvo");

  if (!state.editingProjectId) {
    closeModal();
  } else {
    // mantém modal aberto, atualiza cache local
  }
  await refreshAllData();
}

async function deleteProject(id) {
  if (!confirm("Excluir este projeto? Isso também remove leads e links de cliente associados.")) return;
  const res = await API.del(`/api/data/projects?id=${id}`);
  if (res.error) return toast(res.message || "Erro ao excluir", "error");
  toast("Projeto excluído");
  await refreshAllData();
}

// ---------------------------------------------------------------- //
// Acesso do cliente (link mágico)                                    //
// ---------------------------------------------------------------- //

async function renderClientAccessTab(el) {
  el.innerHTML = `<div class="empty-state">Carregando links...</div>`;
  const projectId = state.editingProjectId;

  const links = await API.get(`/api/client-link/${projectId}`);

  el.innerHTML = `
    <div class="form-section">
      <h3>Liberar campos para o cliente</h3>
      <p style="color:var(--text-muted);font-size:12.5px;margin-bottom:10px">Marque exatamente o que esse cliente pode editar. Você pode gerar mais de um link com combinações diferentes.</p>
      <div class="checkbox-grid" id="client-fields-checkboxes">
        ${Object.entries(CLIENT_FIELD_LABELS).map(([path, label]) => `
          <div class="checkbox-row"><input type="checkbox" value="${path}" id="cf-${path}"><label for="cf-${path}" style="margin:0;font-weight:400;color:var(--text-main)">${label}</label></div>
        `).join("")}
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="generateClientLink()">Gerar link do cliente</button>
    </div>
    <div class="form-section">
      <h3>Links ativos</h3>
      <div id="client-links-list">
        ${Array.isArray(links) && links.length ? links.filter(l => !l.revoked).map(renderClientLinkRow).join("") : '<div class="empty-state">Nenhum link gerado ainda para este projeto.</div>'}
      </div>
    </div>
  `;
}

function renderClientLinkRow(l) {
  const fieldsLabel = l.fields.map((f) => CLIENT_FIELD_LABELS[f] || f).join(", ");
  return `
    <div class="link-row">
      <div>
        <div style="font-size:12.5px">${escapeHtml(fieldsLabel)}</div>
        <div class="meta">criado em ${new Date(l.createdAt).toLocaleDateString("pt-BR")}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="copyClientLink('${l.jti}', this)">Copiar link</button>
        <button class="btn btn-danger btn-sm" onclick="revokeClientLink('${l.jti}')">Revogar</button>
      </div>
    </div>
  `;
}

async function generateClientLink() {
  const fields = Array.from(document.querySelectorAll("#client-fields-checkboxes input:checked")).map((i) => i.value);
  if (fields.length === 0) return toast("Marque ao menos um campo", "error");

  const res = await API.post(`/api/client-link/${state.editingProjectId}`, { fields });
  if (res.error) return toast(res.message || "Erro ao gerar link", "error");

  state._lastGeneratedToken = res.token;
  toast("Link gerado");
  renderProjectTab();
  setTimeout(() => copyClientLinkByToken(res.token), 100);
}

function buildClientEditUrl(token) {
  const base = window.location.href.replace(/index\.html.*$/, "").replace(/\/$/, "");
  return `${base}/editar.html?token=${token}`;
}

async function copyClientLinkByToken(token) {
  try {
    await navigator.clipboard.writeText(buildClientEditUrl(token));
    toast("Link copiado — envie para o cliente");
  } catch {
    toast(buildClientEditUrl(token), "success");
  }
}

// Para links já existentes só temos o jti salvo (o token completo só existe
// no momento da geração). Reconstituímos preservando o jti — o token pode
// ser copiado de novo a qualquer momento gerando um novo (revogando o antigo)
// se for perdido, já que por segurança não guardamos o token assinado, só o jti.
async function copyClientLink(jti, btn) {
  toast("Por segurança, o link completo só é mostrado no momento em que é gerado. Se foi perdido, revogue e gere um novo.", "error");
}

async function revokeClientLink(jti) {
  if (!confirm("Revogar este link? O cliente perderá o acesso imediatamente.")) return;
  const res = await API.post(`/api/client-link/${jti}/revoke`, {});
  if (res.error) return toast(res.message || "Erro ao revogar", "error");
  toast("Link revogado");
  renderProjectTab();
}

// ---------------------------------------------------------------- //
// Leads                                                              //
// ---------------------------------------------------------------- //

async function renderLeadsTab(el) {
  el.innerHTML = `<div class="empty-state">Carregando leads...</div>`;
  const leads = await API.get(`/api/data/leads/${state.editingProjectId}`);

  if (!Array.isArray(leads) || leads.length === 0) {
    el.innerHTML = `<div class="empty-state"><strong>Nenhum lead ainda</strong>As mensagens enviadas pelo formulário deste projeto aparecem aqui.</div>`;
    return;
  }

  el.innerHTML = leads.map((l) => `
    <div class="link-row">
      <div>
        <div>${escapeHtml(l.name || "Sem nome")}</div>
        <div class="meta">${escapeHtml(l.email || "")}</div>
        ${l.message ? `<div class="meta" style="margin-top:4px">${escapeHtml(l.message)}</div>` : ""}
      </div>
      <div class="meta">${new Date(l.createdAt).toLocaleDateString("pt-BR")}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------- //
// Modal genérico                                                     //
// ---------------------------------------------------------------- //

function showModal(innerHtml, maxWidth = "480px") {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-overlay";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  overlay.innerHTML = `<div class="modal" style="max-width:${maxWidth}">${innerHtml}</div>`;
  document.body.appendChild(overlay);
}

function closeModal() {
  const el = $("modal-overlay");
  if (el) el.remove();
}

// ---------------------------------------------------------------- //
// Utils                                                              //
// ---------------------------------------------------------------- //

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
