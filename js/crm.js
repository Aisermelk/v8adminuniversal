/* =========================================================
   V8 ADMIN UNIVERSAL — CRM / LEADS
   Lógica centralizada de criação, edição e exclusão de leads.
   ========================================================= */

/* =========================================================
   LEADS (todos os projetos)
   ========================================================= */

function handleLeadSearch(value) { state.leadSearch = value; renderLeads(); }
function setCrmStatus(value) { state.crmStatus = value || ""; renderLeads(); }
window.setCrmStatus = setCrmStatus;

const CRM_STAGES = [
  ["novo", "Novo"], ["contato", "Contato"], ["qualificado", "Qualificado"],
  ["proposta", "Proposta"], ["ganho", "Ganho"], ["perdido", "Perdido"]
];

const CRM_STATUS_BADGE = { novo:"badge-warning", contato:"badge-muted", qualificado:"badge-muted", proposta:"badge-warning", ganho:"badge-success", perdido:"badge-danger" };

/* Mesmo padrão de Clientes/Projetos: barra de filtros da página + .table-wrap com tabela. */
function renderLeads() {
  const wrap = $("leads-table-wrap");
  if (!wrap) return;
  const search = (state.leadSearch || "").toLowerCase().trim();
  const selected = state.crmProjectId || "";
  const selectedStatus = state.crmStatus || "";
  const leads = state.leads.filter(lead => {
    if (selected && String(lead.projectId) !== String(selected)) return false;
    if (selectedStatus && String(lead.status || "novo") !== selectedStatus) return false;
    const text = [lead.name, lead.email, lead.phone, lead.message, lead.projectName || projectName(lead.projectId), lead.status, ...(lead.tags || [])].join(" ").toLowerCase();
    return !search || text.includes(search);
  });
  wrap.className = "table-wrap";
  if (!leads.length) { wrap.innerHTML = `<div class="empty-state">Nenhum lead encontrado.</div>`; return; }
  const label = Object.fromEntries(CRM_STAGES);
  const pipeline = leads.reduce((n, l) => n + Number(l.value || 0), 0);
  wrap.innerHTML = `<table><thead><tr><th>Lead</th><th>E-mail</th><th>Projeto</th><th>Status</th><th></th></tr></thead><tbody>${leads.map(lead => {
    const id = escapeHtml(lead.id), pid = escapeHtml(lead.projectId), st = lead.status || "novo";
    return `
    <tr class="row-clickable" onclick="openLeadCRM('${id}','${pid}')">
      <td><strong>${escapeHtml(lead.name || "Sem nome")}</strong></td>
      <td>${escapeHtml(lead.email || lead.phone || "—")}</td>
      <td>${escapeHtml(lead.projectName || projectName(lead.projectId) || "—")}</td>
      <td><span class="badge ${CRM_STATUS_BADGE[st] || "badge-muted"}">${escapeHtml(label[st] || st)}</span></td>
      <td onclick="event.stopPropagation()"><div class="row-actions client-row-actions">
        <button class="btn btn-primary btn-sm" title="Visualizar lead" onclick="openLeadCRM('${id}','${pid}')">◉ <span>Visualizar</span></button>
        <button class="btn btn-ghost btn-sm" title="Editar lead" onclick="openLeadCRM('${id}','${pid}')">✎ <span>Editar</span></button>
        <button class="icon-btn" title="Mais opções" onclick="openLeadActionsMenu(event,'${id}','${pid}')">⋯</button>
      </div></td>
    </tr>`;
  }).join("")}</tbody></table>
  <div class="list-summary">${leads.length} lead${leads.length === 1 ? "" : "s"}${pipeline ? ` · Pipeline: <strong>${formatMoney(pipeline)}</strong>` : ""}</div>`;
}

function openLeadActionsMenu(event, id, projectId) {
  event.stopPropagation();
  document.querySelector(".project-actions-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "project-actions-menu";
  menu.innerHTML = `<button class="danger" onclick="deleteLeadCRM('${escapeHtml(id)}','${escapeHtml(projectId)}')">Excluir</button>`;
  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once:true }), 0);
}
window.openLeadActionsMenu = openLeadActionsMenu;

function crmLeadCard(lead) {
  return `<article class="crm-lead-card crm-lead-card-compact" onclick="openLeadCRM('${escapeHtml(lead.id)}','${escapeHtml(lead.projectId)}')">
    <div class="crm-lead-top"><strong>${escapeHtml(lead.name || "Sem nome")}</strong><button class="icon-btn crm-card-action" onclick="event.stopPropagation();openLeadCRM('${escapeHtml(lead.id)}','${escapeHtml(lead.projectId)}')" aria-label="Editar lead">✎</button></div>
  </article>`;
}

function setCrmProject(value) { state.crmProjectId = value; renderLeads(); }
window.setCrmProject = setCrmProject;
function formatMoney(value) { return Number(value || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }

function openNewLeadCRM() {
  const projects = state.projects.map(p => `<option value="${escapeHtml(p.id)}" ${String(state.crmProjectId) === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
  showModal(`<div class="crm-detail"><div class="crm-detail-head"><div><p class="eyebrow">CRM</p><h2>Novo lead</h2><p>Cadastre manualmente um contato no projeto escolhido.</p></div></div>
    <div class="crm-form-grid"><label class="crm-full">Projeto<select id="new-lead-project">${projects}</select></label><label>Nome<input id="new-lead-name"></label><label>E-mail<input id="new-lead-email" type="email"></label><label>Telefone<input id="new-lead-phone"></label><label>Valor potencial<input id="new-lead-value" type="number" min="0" step="0.01"></label><label class="crm-full">Mensagem<textarea id="new-lead-message"></textarea></label></div>
    <div class="modal-actions modal-save-bar"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn btn-primary modal-save-floating" onclick="createLeadCRM()">Criar lead</button></div></div>`, "680px");
}
window.openNewLeadCRM = openNewLeadCRM;
async function createLeadCRM() {
  const projectId = $("new-lead-project")?.value; if (!projectId) return toast("Selecione um projeto.", "error");
  const res = await API.post(`/api/data/leads/${encodeURIComponent(projectId)}`, { name: $("new-lead-name").value.trim(), email: $("new-lead-email").value.trim(), phone: $("new-lead-phone").value.trim(), message: $("new-lead-message").value.trim(), metadata: { status:"novo", value:Number($("new-lead-value").value || 0), source:"manual" } });
  if (res?.error) return toast(res.error, "error");
  closeModal(); await refreshData(); state.crmProjectId = projectId; renderLeads(); toast("Lead criado no CRM.");
}
window.createLeadCRM = createLeadCRM;

function openLeadCRM(id, projectId) {
  const lead = state.leads.find(l => String(l.id) === String(id) && String(l.projectId) === String(projectId));
  if (!lead) return;
  const stages = CRM_STAGES.map(([key,label]) => `<option value="${key}" ${(lead.status || "novo") === key ? "selected" : ""}>${label}</option>`).join("");
  const activities = (lead.activities || []).map(a => `<div class="crm-activity"><strong>${escapeHtml(a.type || "nota")}</strong><span>${escapeHtml(formatLeadDate(a.at))}</span><p>${escapeHtml(a.text || "")}</p></div>`).join("") || `<div class="crm-empty">Nenhuma atividade registrada.</div>`;
  showModal(`<div class="crm-detail"><div class="crm-detail-head"><div><p class="eyebrow">CRM · ${escapeHtml(lead.projectName || projectName(projectId))}</p><h2>${escapeHtml(lead.name || "Lead")}</h2><p>${escapeHtml(lead.email || "")} ${lead.phone ? "· " + escapeHtml(lead.phone) : ""}</p></div><span class="badge badge-success">${escapeHtml(lead.status || "novo")}</span></div>
    <div class="crm-form-grid"><label>Status<select id="crm-status">${stages}</select></label><label>Valor potencial<input id="crm-value" type="number" min="0" step="0.01" value="${escapeHtml(lead.value || 0)}"></label><label>Origem<input id="crm-source" value="${escapeHtml(lead.source || "site")}"></label><label>Próximo contato<input id="crm-next" type="datetime-local" value="${escapeHtml(lead.nextContact || "")}"></label><label class="crm-full">Tags<input id="crm-tags" value="${escapeHtml((lead.tags || []).join(", "))}" placeholder="cliente, orçamento, urgente"></label><label class="crm-full">Observações<textarea id="crm-notes">${escapeHtml(lead.notes || "")}</textarea></label></div>
    <div class="crm-activity-add"><textarea id="crm-activity-text" placeholder="Registrar uma nota, ligação, WhatsApp ou acompanhamento..."></textarea><button class="btn btn-ghost" onclick="addLeadActivity('${escapeHtml(id)}','${escapeHtml(projectId)}')">Adicionar atividade</button></div>
    <div class="crm-history"><h3>Histórico</h3>${activities}</div>
    <div class="modal-actions modal-save-bar"><button class="btn btn-danger" onclick="deleteLeadCRM('${escapeHtml(id)}','${escapeHtml(projectId)}')">Excluir</button><button class="btn btn-primary modal-save-floating" onclick="saveLeadCRM('${escapeHtml(id)}','${escapeHtml(projectId)}')">Salvar CRM</button></div></div>`, "760px");
}
window.openLeadCRM = openLeadCRM;

async function saveLeadCRM(id, projectId) {
  const body = { status: $("crm-status").value, value: $("crm-value").value, source: $("crm-source").value, nextContact: $("crm-next").value, notes: $("crm-notes").value, tags: $("crm-tags").value.split(",").map(v => v.trim()).filter(Boolean) };
  const res = await API.put(`/api/data/leads/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`, body);
  if (res?.error) return toast(res.error, "error");
  const index = state.leads.findIndex(l => String(l.id) === String(id)); if (index >= 0) state.leads[index] = { ...state.leads[index], ...res.lead };
  closeModal(); renderLeads(); toast("Lead atualizado.");
}
window.saveLeadCRM = saveLeadCRM;

async function addLeadActivity(id, projectId) {
  const text = $("crm-activity-text")?.value.trim(); if (!text) return toast("Escreva a atividade.", "error");
  const res = await API.put(`/api/data/leads/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`, { activity: { type:"nota", text } });
  if (res?.error) return toast(res.error, "error");
  const index = state.leads.findIndex(l => String(l.id) === String(id)); if (index >= 0) state.leads[index] = { ...state.leads[index], ...res.lead };
  openLeadCRM(id, projectId);
}
window.addLeadActivity = addLeadActivity;

async function deleteLeadCRM(id, projectId) {
  if (!confirm("Excluir este lead? Esta ação não pode ser desfeita.")) return;
  const res = await API.del(`/api/data/leads/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`);
  if (res?.error || !res?.success) return toast(res?.error || "Não foi possível excluir.", "error");
  state.leads = state.leads.filter(l => String(l.id) !== String(id)); closeModal(); renderLeads(); toast("Lead excluído.");
}
window.deleteLeadCRM = deleteLeadCRM;

function formatLeadDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

document.addEventListener("DOMContentLoaded", () => {
  $("new-lead-btn")?.addEventListener("click", openNewLeadCRM);
});

/* =========================================================
   DASHBOARD
   ========================================================= */

async function renderDashboard() {
  const statsEl = $("dashboard-stats");
  if (!statsEl) return;
  let stats;
  try { stats = normalizeStats(await API.get("/api/dashboard/stats")); } catch { stats = {}; }
  const clients = stats?.totalClients ?? state.clients.length;
  const projects = stats?.totalProjects ?? state.projects.length;
  const leads = stats?.totalLeads ?? Object.values(state.leadsByProject).reduce((total, item) => total + Number(item?.count || 0), 0);
  const recent = Array.isArray(stats?.recentLeads) ? stats.recentLeads.slice(0, 6) : [];
  statsEl.innerHTML = `
    <button type="button" class="stat-card stat-card-click" onclick="switchSection('clients')"><span class="label">Clientes</span><strong class="value">${clients}</strong></button>
    <button type="button" class="stat-card stat-card-click" onclick="switchSection('projects')"><span class="label">Projetos</span><strong class="value">${projects}</strong></button>
    <button type="button" class="stat-card stat-card-click" onclick="switchSection('leads')"><span class="label">Leads</span><strong class="value">${leads}</strong></button>`;
  const existing = $("dashboard-new-leads");
  if (existing) existing.innerHTML = `<div class="dashboard-leads-heading"><div><h2>Novos leads</h2><p>Leads recebidos recentemente.</p></div><button class="btn btn-ghost btn-sm" type="button" onclick="switchSection('leads')">Ver CRM</button></div><div class="dashboard-leads-list">${recent.length ? recent.map(lead => `<button type="button" class="dashboard-lead-row" onclick="openLeadCRM('${escapeHtml(lead.id)}','${escapeHtml(lead.projectId)}')"><strong>${escapeHtml(lead.name || "Sem nome")}</strong><span class="icon-btn" aria-hidden="true">✎</span></button>`).join("") : `<div class="crm-empty">Nenhum lead recente.</div>`}</div>`;
}

