/* V8 ADMIN UNIVERSAL — Área do Cliente */
(() => {
  const state = { projects: [], leads: [], client: null, user: null, permissions: [] };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
  const can = (p) => state.permissions.includes("all") || state.permissions.includes(p);
  function hasModule(project, module) {
    const access = project?.access || {};
    const list = Array.isArray(access.editable) ? access.editable : [];
    const modules = Array.isArray(access.modules) ? access.modules : [];
    if (module === "leads" && (access.leads === true || modules.includes("leads"))) return true;
    if (!list.length && access.configured !== true) return true;
    if (list.some(x => ["page", "site", "loja"].includes(x))) {
      if (module === "configuracao" || module === "content") return true;
      return ["media", "location", "reviews", "seo", "scripts", "leads"].includes(module) && list.some(x => ["site", "loja"].includes(x));
    }
    return list.includes(module);
  }

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
    // O Worker (D1) expõe tudo em /api/client/me: {client, projects}
    const me = await API.get("/api/client/me");
    if (!me || me.success === false || me.error) {
      return showFatal(me?.error || me?.message || "Não foi possível carregar sua área.");
    }
    state.user = me.client || {};
    state.projects = Array.isArray(me.projects) ? me.projects : [];
    state.permissions = [...new Set(state.projects.flatMap(p => Array.isArray(p?.access?.editable) ? p.access.editable : []))];
    const leadsButton = document.querySelector('[data-section="leads"]');
    const hasLeads = state.projects.some(p => hasModule(p, "leads"));
    if (leadsButton) leadsButton.classList.toggle("hidden", !hasLeads);
    state.client = me.client || {};
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
    const hasLeads = state.projects.some(p => hasModule(p, "leads"));
    if (!hasLeads) {
      $("stat-leads").textContent = "0";
      return;
    }
    for (const project of state.projects) {
      if (!hasModule(project, "leads")) continue;
      const res = await API.get(`/api/data/leads/${encodeURIComponent(project.id)}`);
      const list = Array.isArray(res) ? res : res?.leads;
      if (Array.isArray(list)) state.leads.push(...list.map(l => ({ ...l, projectId: l.projectId || project.id, projectName: project.name })));
    }
    state.leads.sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
    $("stat-leads").textContent = state.leads.length;
  }

  function renderLeads() {
    const list = $("leads-list");
    const add = $("client-add-lead");
    if (!list) return;
    const allowed = state.projects.some(p => hasModule(p, "leads"));
    add?.classList.toggle("hidden", !allowed);
    if (!allowed) { list.innerHTML = `<div class="empty-state"><strong>CRM não liberado</strong><p>O gerenciamento de leads não está liberado para sua conta.</p></div>`; return; }
    if (!state.leads.length) { list.innerHTML = `<div class="empty-state"><strong>Nenhum lead</strong><p>Adicione manualmente um lead recebido pelo WhatsApp ou outro canal.</p></div>`; return; }
    list.innerHTML = state.leads.map(lead => `
      <div class="client-lead-row">
        <strong>${esc(lead.name || "Lead sem nome")}</strong>
        <button class="icon-btn" title="Editar lead" aria-label="Editar lead" data-edit-client-lead="${esc(lead.id)}" data-project-id="${esc(lead.projectId)}">✎</button>
      </div>
    `).join("");
    list.querySelectorAll("[data-edit-client-lead]").forEach(btn => btn.addEventListener("click", () => openClientLeadEditor(btn.dataset.editClientLead, btn.dataset.projectId)));
  }

  function openClientLeadEditor(id = null, projectId = "") {
    const lead = id ? state.leads.find(l => String(l.id) === String(id) && String(l.projectId) === String(projectId)) : null;
    const projects = state.projects.filter(p => hasModule(p, "leads"));
    if (!projects.length) return;
    const selectedProject = projectId || projects[0].id;
    showClientLeadModal(lead, selectedProject);
  }

  function showClientLeadModal(lead, projectId) {
    const projects = state.projects.filter(p => hasModule(p, "leads"));
    const options = projects.map(p => `<option value="${esc(p.id)}" ${String(p.id) === String(projectId) ? "selected" : ""}>${esc(p.name || "Projeto")}</option>`).join("");
    const stages = [["novo","Novo"],["contato","Contato"],["qualificado","Qualificado"],["proposta","Proposta"],["ganho","Ganho"],["perdido","Perdido"]];
    const stageOptions = stages.map(([v,l]) => `<option value="${v}" ${(lead?.status || "novo") === v ? "selected" : ""}>${l}</option>`).join("");
    const content = `<div class="crm-detail client-crm-detail"><div class="crm-detail-head"><div><p class="eyebrow">CRM</p><h2>${lead ? "Editar lead" : "Adicionar lead"}</h2><p>Cadastre contatos recebidos manualmente.</p></div></div><div class="crm-form-grid"><label>Projeto<select id="client-lead-project" ${lead ? "disabled" : ""}>${options}</select></label><label>Nome<input id="client-lead-name" value="${esc(lead?.name || "")}" required></label><label>Telefone<input id="client-lead-phone" value="${esc(lead?.phone || "")}"></label><label>E-mail<input id="client-lead-email" type="email" value="${esc(lead?.email || "")}"></label><label>Status<select id="client-lead-status">${stageOptions}</select></label><label>Valor potencial<input id="client-lead-value" type="number" min="0" step="0.01" value="${esc(lead?.value || 0)}"></label><label class="crm-full">Observações<textarea id="client-lead-notes">${esc(lead?.notes || lead?.message || "")}</textarea></label></div><div class="modal-actions modal-save-bar"><button class="btn btn-primary modal-save-floating" id="client-lead-save">${lead ? "Salvar alterações" : "Adicionar lead"}</button></div></div>`;
    const overlay = document.createElement("div"); overlay.id = "client-lead-modal"; overlay.className = "modal-overlay"; overlay.innerHTML = `<div class="modal" style="max-width:680px"><button class="modal-close" id="client-lead-close" aria-label="Fechar">×</button>${content}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    $("client-lead-close").onclick = () => overlay.remove();
    $("client-lead-save").onclick = async () => {
      const btn = $("client-lead-save"); btn.disabled = true; btn.textContent = "Salvando...";
      try {
        const pid = $("client-lead-project").value;
        const body = { name: $("client-lead-name").value.trim(), phone: $("client-lead-phone").value.trim(), email: $("client-lead-email").value.trim(), message: $("client-lead-notes").value.trim(), status: $("client-lead-status").value, value: Number($("client-lead-value").value || 0), notes: $("client-lead-notes").value.trim(), source: "manual" };
        if (!body.name) { alert("Informe o nome do lead."); return; }
        const res = lead ? await API.put(`/api/data/leads/${encodeURIComponent(pid)}/${encodeURIComponent(lead.id)}`, body) : await API.post(`/api/data/leads/${encodeURIComponent(pid)}`, body);
        if (res?.error || res?.success === false) throw new Error(res?.error || res?.message || "Não foi possível salvar o lead.");
        overlay.remove(); await loadLeads(); renderLeads(); renderOverview();
      } catch (e) { alert(e.message || "Não foi possível salvar o lead."); }
      finally { btn.disabled = false; btn.textContent = lead ? "Salvar alterações" : "Adicionar lead"; }
    };
  }

  function projectCard(p) {
    const type = p.type || "SITE";
    const status = p.status || "—";
    const editable = allowedFields(p).length > 0;
    const viewButton = p.siteUrl
      ? `<a class="btn btn-ghost btn-sm" href="${esc(p.siteUrl)}" target="_blank" rel="noopener">◉ Visualizar</a>`
      : `<button class="btn btn-ghost btn-sm" disabled title="Este projeto ainda não possui URL pública">◉ Visualizar</button>`;
    return `<article class="project-card"><div class="project-card-top"><div><h3>${esc(p.name || "Projeto")}</h3><p>${esc(p.domain || p.siteUrl || "Projeto V8")}</p></div><span class="project-badge">${esc(type)}</span></div><div class="project-meta"><span class="project-badge">${esc(status)}</span></div><div class="project-actions">${viewButton}${editable ? `<button class="btn btn-primary btn-sm" data-edit-project="${esc(p.id)}">✎ Editar</button>` : ""}</div></article>`;
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


  function setPath(obj, path, value) {
    const keys = path.split("."); let cur = obj;
    keys.forEach((key, i) => { if (i === keys.length - 1) cur[key] = value; else { if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) cur[key] = {}; cur = cur[key]; } });
  }

  // Catálogo completo do editor. Os escopos Página/Site/Loja determinam o que aparece.
  const FIELD_CATALOG = {
    general: { label: "Informações básicas", fields: { name: "Nome", status: "Status", siteUrl: "URL do site" } },
    tracking: { label: "Configurações / Tracking", fields: { pixel: "Meta Pixel", tag: "Google Tag / GTM", analytics: "Google Analytics" } },
    contact: { label: "Contato", fields: { whatsapp: "WhatsApp", email: "E-mail", phone: "Telefone" } },
    social: { label: "Redes sociais", fields: { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" } },
    content: { label: "Conteúdo", fields: { name: "Nome", job: "Profissão / cargo", headline: "Título principal", description: "Descrição", specialization: "Especialização", experience: "Experiência", address: "Endereço", registration: "Registro profissional" } },
    media: { label: "Mídia", fields: { galleryEnabled: "Ativar galeria", galleryImages: "Imagens da galeria", videoEnabled: "Ativar vídeo", video: "Vídeo" } },
    location: { label: "Localização", fields: { enabled: "Exibir mapa", address: "Endereço", mapsUrl: "Link do Google Maps", embed: "Código do mapa" } },
    reviews: { label: "Avaliações", fields: { enabled: "Ativar avaliações", placeId: "Google Place ID" } },
    seo: { label: "SEO", fields: { title: "Título", description: "Descrição", ogImage: "Imagem de compartilhamento", canonical: "Canonical", keywords: "Palavras-chave", robots: "Robots" } },
    scripts: { label: "Scripts", fields: { head: "Head", body: "Body", footer: "Footer" } }
  };

  const PAGE_SECTIONS = new Set(["general", "tracking", "contact", "social", "content"]);
  const SITE_SECTIONS = new Set(Object.keys(FIELD_CATALOG));
  const LONG_FIELDS = new Set(["content.description", "content.experience", "seo.description", "seo.keywords", "media.galleryImages", "location.embed", "scripts.head", "scripts.body", "scripts.footer"]);

  function projectScopes(project) {
    return {
      configuracao: hasModule(project, "configuracao"),
      content: hasModule(project, "content"),
      media: hasModule(project, "media"),
      location: hasModule(project, "location"),
      reviews: hasModule(project, "reviews"),
      seo: hasModule(project, "seo"),
      scripts: hasModule(project, "scripts"),
      leads: hasModule(project, "leads")
    };
  }

  function allowedFields(project) {
    const scopes = projectScopes(project);
    const list = [];
    if (scopes.configuracao) {
      ["general", "tracking", "contact", "social"].forEach(section => Object.keys(FIELD_CATALOG[section]?.fields || {}).forEach(field => list.push([section, field])));
    }
    Object.entries(FIELD_CATALOG).forEach(([section, info]) => {
      if (section === "general" || section === "tracking" || section === "contact" || section === "social") return;
      if (!scopes[section]) return;
      Object.keys(info.fields).forEach(field => list.push([section, field]));
    });
    return list;
  }

  function openEditor(id) {
    const p = state.projects.find(x => x.id === id); if (!p) return;
    const allowed = allowedFields(p);
    const scopes = projectScopes(p);
    $("#project-editor-panel").classList.remove("hidden");
    $("#editor-title").textContent = `Editar — ${p.name || "Projeto"}`;

    if (!allowed.length) {
      $("#project-editor").innerHTML = `<p class="muted-cell">Nenhum recurso foi liberado para este projeto.</p>`;
      return;
    }

    const groups = Object.entries(FIELD_CATALOG).map(([section, info]) => {
      const fields = allowed.filter(([sec]) => sec === section);
      if (!fields.length) return "";
      const inputs = fields.map(([sec, field]) => {
        const label = info.fields[field];
        const value = sec === "general" ? p[field] : p[sec]?.[field];
        const path = `${sec}.${field}`;
        if (sec === "general" && field === "status") {
          const options = ["Em produção", "Em desenvolvimento", "Pausado"];
          return `<label>${esc(label)}<select data-section="${sec}" data-field="${field}">${options.map(v => `<option ${String(value || "") === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
        }
        if ((sec === "location" && field === "enabled") || (sec === "reviews" && field === "enabled") || (sec === "media" && (field === "galleryEnabled" || field === "videoEnabled"))) {
          return `<label><span><input type="checkbox" data-section="${sec}" data-field="${field}" ${value ? "checked" : ""}> ${esc(label)}</span></label>`;
        }
        if (field === "galleryImages") {
          return `<label>${esc(label)}<textarea data-section="${sec}" data-field="${field}" placeholder="Uma URL por linha">${esc(Array.isArray(value) ? value.join("\n") : "")}</textarea></label>`;
        }
        if (LONG_FIELDS.has(path)) {
          return `<label>${esc(label)}<textarea data-section="${sec}" data-field="${field}">${esc(value || "")}</textarea></label>`;
        }
        return `<label>${esc(label)}<input data-section="${sec}" data-field="${field}" value="${esc(value || "")}"></label>`;
      }).join("");
      return `<div class="editor-group"><h3>${esc(info.label)}</h3><div class="editor-fields">${inputs}</div></div>`;
    }).join("");

    const lojaNote = scopes.loja ? `<div class="ecommerce-access-note"><strong>Loja</strong><span>Permissão preparada para os futuros módulos de e-commerce. Novos recursos poderão usar este mesmo acesso.</span></div>` : "";
    $("#project-editor").innerHTML = `<div class="editor-grid">${groups}</div>${lojaNote}<p class="muted-cell">As opções não liberadas continuam ocultas para o cliente.</p><div class="editor-footer"><button class="btn btn-primary" id="save-project">Salvar alterações</button></div>`;
    $("#save-project").onclick = () => saveProject(p.id);
    $("#project-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveProject(id) {
    const body = {};
    $$("#project-editor [data-section][data-field]").forEach(input => {
      const section = input.dataset.section;
      const field = input.dataset.field;
      let value;
      if (input.type === "checkbox") value = input.checked;
      else if (section === "media" && field === "galleryImages") value = input.value.split("\n").map(v => v.trim()).filter(Boolean);
      else value = input.value;
      if (section === "general") body[field] = value;
      else { body[section] ||= {}; body[section][field] = value; }
    });
    const btn = $("#save-project"); btn.disabled = true; btn.textContent = "Salvando...";
    try {
      const res = await API.put(`/api/client/projects/${encodeURIComponent(id)}`, body);
      if (!res || res.success === false || res.error) return alert(res?.error || res?.message || "Não foi possível salvar.");
      const index = state.projects.findIndex(p => p.id === id);
      if (index >= 0 && res.project) state.projects[index] = res.project;
      renderProjects(); renderOverview(); openEditor(id); alert("Alterações salvas com sucesso.");
    } catch (error) { console.error(error); alert("Erro ao salvar o projeto."); }
    finally { btn.disabled = false; btn.textContent = "Salvar alterações"; }
  }

  function bindProjectButtons() { $$('[data-edit-project]').forEach(b => b.addEventListener("click", () => openEditor(b.dataset.editProject))); }

  async function saveAccount(e) {
    e.preventDefault(); setMessage("");
    const password = $("#account-password").value;
    if (password && password.length < 8) return setMessage("A nova senha deve ter pelo menos 8 caracteres.", true);
    const body = { name: $("#account-name").value.trim(), phone: $("#account-phone").value.trim() };
    if (password) body.password = password;
    const res = await API.put("/api/client/profile", body);
    if (res.success === false || res.error) return setMessage(res.error || res.message || "Não foi possível salvar.", true);
    $("#account-password").value = ""; state.client = res.client; $("#user-name").textContent = res.client.name; $("#user-avatar").textContent = res.client.name.charAt(0).toUpperCase(); setMessage("Dados atualizados com sucesso.");
  }

  function showFatal(msg) { document.querySelector(".client-main").innerHTML = `<div class="client-panel"><h2>Não foi possível carregar</h2><p>${esc(msg)}</p><button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button></div>`; }


  document.addEventListener("DOMContentLoaded", async () => {
    if (!Auth.requireClient()) return;
    document.documentElement.setAttribute("data-theme", "dark");
    $$(".client-nav-item").forEach(b => b.addEventListener("click", () => switchSection(b.dataset.section)));
    $$('[data-go="projects"]').forEach(b => b.addEventListener("click", () => switchSection("projects")));
    $("#refresh-btn").addEventListener("click", load);
    $("#close-editor").addEventListener("click", () => $("#project-editor-panel").classList.add("hidden"));
    $("#client-add-lead")?.addEventListener("click", () => openClientLeadEditor());
    $("#logout-btn").addEventListener("click", () => Auth.logout());
    $("#account-form").addEventListener("submit", saveAccount);
    $("#client-menu").addEventListener("click", () => $("#client-sidebar").classList.toggle("open"));
    await load();
  });
})();
