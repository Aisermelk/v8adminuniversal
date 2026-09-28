/* V8 ADMIN UNIVERSAL — Área do Cliente */
(() => {
  const state = { projects: [], leads: [], client: null, user: null, permissions: [] };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
  const can = (p) => state.permissions.includes("all") || state.permissions.includes(p);

  function setMessage(text, error = false) {
    const el = $("#account-message");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("error", error);
  }

  function switchSection(name) {
    $$(".client-nav-item").forEach(b => b.classList.toggle("active", b.dataset.section === name));
    $$(".client-section").forEach(s => s.classList.toggle("active", s.id === `section-${name}`));
    const titles = {
      overview: ["Visão geral", "Acompanhe seus projetos e informações."],
      projects: ["Meus projetos", "Visualize e edite somente o que foi liberado para sua conta."],
      leads: ["Leads", "Contatos recebidos pelos seus projetos."],
      account: ["Minha conta", "Atualize seus dados pessoais e sua senha."]
    };
    $("#page-title").textContent = titles[name][0];
    $("#page-subtitle").textContent = titles[name][1];
    $("#client-sidebar")?.classList.remove("open");
  }

  async function load() {
    const me = await API.get("/api/auth/me");
    if (me.error) return;
    state.user = me.user;
    state.permissions = me.permissions || [];
    const [projects, account] = await Promise.all([API.get("/api/client/projects"), API.get("/api/client/account")]);
    if (projects.error || account.error) return showFatal(projects.message || account.message || "Não foi possível carregar sua área.");
    state.projects = Array.isArray(projects) ? projects : [];
    state.client = account.client || {};
    $("#user-name").textContent = state.client.name || state.user?.name || "Cliente";
    $("#user-email").textContent = state.client.email || state.user?.email || "—";
    $("#user-avatar").textContent = (state.client.name || "C").trim().charAt(0).toUpperCase();
    $("#account-name").value = state.client.name || "";
    $("#account-email").value = state.client.email || "";
    $("#account-phone").value = state.client.phone || "";
    $("#stat-projects").textContent = state.projects.length;
    $("#stat-status").textContent = state.client.status === "inactive" ? "Bloqueado" : "Ativo";
    await loadLeads();
    renderProjects();
    renderOverview();
    renderLeads();
  }

  async function loadLeads() {
    state.leads = [];
    if (!can("leads")) return;
    for (const project of state.projects) {
      const res = await API.get(`/api/client/leads/${encodeURIComponent(project.id)}`);
      if (!res.error && Array.isArray(res)) state.leads.push(...res.map(l => ({ ...l, projectName: project.name })));
    }
    state.leads.sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
    $("#stat-leads").textContent = state.leads.length;
  }

  function projectCard(p) {
    const type = p.type || "SITE";
    const status = p.status || "—";
    const editable = can("content") || can("settings");
    return `<article class="project-card"><div class="project-card-top"><div><h3>${esc(p.name || "Projeto")}</h3><p>${esc(p.domain || p.siteUrl || "Projeto V8")}</p></div><span class="project-badge">${esc(type)}</span></div><div class="project-meta"><span class="project-badge">${esc(status)}</span></div><div class="project-actions">${editable ? `<button class="btn btn-primary btn-sm" data-edit-project="${esc(p.id)}">Editar</button>` : ""}${p.siteUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(p.siteUrl)}" target="_blank" rel="noopener">Abrir site</a>` : ""}</div></article>`;
  }

  function renderProjects() {
    const html = state.projects.length ? state.projects.map(projectCard).join("") : `<div class="empty-state"><strong>Nenhum projeto disponível</strong><p>Quando um projeto for vinculado à sua conta, ele aparecerá aqui.</p></div>`;
    $("#projects-list").innerHTML = html;
    bindProjectButtons();
  }

  function renderOverview() {
    $("#overview-projects").innerHTML = state.projects.slice(0,4).map(projectCard).join("") || `<div class="empty-state"><strong>Sem projetos</strong><p>Não há projetos vinculados à sua conta.</p></div>`;
    bindProjectButtons();
  }

  function renderLeads() {
    const tbody = $("#leads-table");
    if (!can("leads")) { tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">A visualização de leads não está liberada para sua conta.</td></tr>`; return; }
    if (!state.leads.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">Nenhum lead recebido ainda.</td></tr>`; return; }
    tbody.innerHTML = state.leads.map(l => `<tr><td>${formatDate(l.createdAt)}</td><td>${esc(l.name || "—")}</td><td>${esc(l.email || l.phone || "—")}</td><td>${esc(l.projectName || "—")}</td><td>${esc(l.status || "new")}</td></tr>`).join("");
  }

  function formatDate(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" }); }

  function flattenObject(obj, prefix = "", out = []) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    Object.entries(obj).forEach(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out.push({ path, value });
      else if (value && typeof value === "object" && !Array.isArray(value)) flattenObject(value, path, out);
    });
    return out;
  }

  function setPath(obj, path, value) {
    const keys = path.split("."); let cur = obj;
    keys.forEach((key, i) => { if (i === keys.length - 1) cur[key] = value; else { if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) cur[key] = {}; cur = cur[key]; } });
  }

  function openEditor(id) {
    const p = state.projects.find(x => x.id === id); if (!p) return;
    $("#project-editor-panel").classList.remove("hidden");
    $("#editor-title").textContent = `Editar — ${p.name || "Projeto"}`;
    const contentFields = can("content") ? flattenObject(p.content || {}).filter(x => x.path.length < 100).slice(0,80) : [];
    const contact = p.contact || {};
    const settings = p.settings || {};
    let html = `<div class="editor-grid">`;
    if (can("content")) {
      html += `<div class="editor-group"><h3>Conteúdo</h3><div class="editor-fields">${contentFields.length ? contentFields.map((f,i) => `<label>${esc(f.path)}<textarea data-content-path="${esc(f.path)}">${esc(f.value)}</textarea></label>`).join("") : `<p class="muted-cell">Este projeto ainda não possui campos de conteúdo editáveis.</p>`}</div></div>`;
    }
    if (can("settings") || can("content")) {
      html += `<div class="editor-group"><h3>Contato e configurações</h3><div class="editor-fields">${can("settings") ? `<label>WhatsApp<input data-contact="whatsapp" value="${esc(contact.whatsapp || "")}"></label><label>E-mail<input data-contact="email" value="${esc(contact.email || "")}"></label><label>Telefone<input data-contact="phone" value="${esc(contact.phone || "")}"></label>` : ""}${can("settings") && Object.keys(settings).length ? `<p class="muted-cell">Outras configurações são gerenciadas pelo administrador.</p>` : ""}</div></div>`;
    }
    html += `</div><div class="editor-footer"><button class="btn btn-primary" id="save-project">Salvar alterações</button></div>`;
    $("#project-editor").innerHTML = html;
    $("#save-project").onclick = () => saveProject(p.id);
    $("#project-editor-panel").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function saveProject(id) {
    const content = {};
    $$("[data-content-path]").forEach(el => setPath(content, el.dataset.contentPath, el.value));
    const contact = {};
    $$("[data-contact]").forEach(el => contact[el.dataset.contact] = el.value.trim());
    const body = {};
    if (can("content")) body.content = content;
    if (can("settings")) body.contact = contact;
    const btn = $("#save-project"); btn.disabled = true; btn.textContent = "Salvando...";
    const res = await API.put(`/api/client/projects/${encodeURIComponent(id)}`, body);
    btn.disabled = false; btn.textContent = "Salvar alterações";
    if (res.error) return alert(res.message || "Não foi possível salvar.");
    const index = state.projects.findIndex(p => p.id === id); if (index >= 0) state.projects[index] = res.project;
    renderProjects(); renderOverview(); openEditor(id); alert("Alterações salvas com sucesso.");
  }

  function bindProjectButtons() { $$('[data-edit-project]').forEach(b => b.addEventListener("click", () => openEditor(b.dataset.editProject))); }

  async function saveAccount(e) {
    e.preventDefault(); setMessage("");
    const password = $("#account-password").value;
    if (password && password.length < 8) return setMessage("A nova senha deve ter pelo menos 8 caracteres.", true);
    const body = { name: $("#account-name").value.trim(), phone: $("#account-phone").value.trim() };
    if (password) body.password = password;
    const res = await API.put("/api/client/account", body);
    if (res.error) return setMessage(res.message || "Não foi possível salvar.", true);
    $("#account-password").value = ""; state.client = res.client; $("#user-name").textContent = res.client.name; $("#user-avatar").textContent = res.client.name.charAt(0).toUpperCase(); setMessage("Dados atualizados com sucesso.");
  }

  function showFatal(msg) { document.querySelector(".client-main").innerHTML = `<div class="client-panel"><h2>Não foi possível carregar</h2><p>${esc(msg)}</p><button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button></div>`; }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireClient()) return;
    $$(".client-nav-item").forEach(b => b.addEventListener("click", () => switchSection(b.dataset.section)));
    $$('[data-go="projects"]').forEach(b => b.addEventListener("click", () => switchSection("projects")));
    $("#refresh-btn").addEventListener("click", load);
    $("#close-editor").addEventListener("click", () => $("#project-editor-panel").classList.add("hidden"));
    $("#logout-btn").addEventListener("click", () => Auth.logout());
    $("#account-form").addEventListener("submit", saveAccount);
    $("#client-menu").addEventListener("click", () => $("#client-sidebar").classList.toggle("open"));
    await load();
  });
})();
