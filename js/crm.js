/* =========================================================
   V8 ADMIN UNIVERSAL — CRM / LEADS
   Lógica centralizada de criação, edição e exclusão de leads.
   ========================================================= */

/* =========================================================
   LEADS (todos os projetos)
   ========================================================= */

function handleLeadSearch(value) {
  state.leadSearch = value;
  renderLeads();
}

function setCrmFilter(name, value) {
  if (!Object.prototype.hasOwnProperty.call(state, name)) return;
  state[name] = value;
  renderLeads();
}
window.setCrmFilter = setCrmFilter;

function leadMatchesPeriod(lead, period) {
  if (!period) return true;
  const created = new Date(lead.createdAt || 0);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();
  const days = Number(period);
  if (!days) return true;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return created >= start;
}

const CRM_STAGES = [
  ["novo", "Novo"], ["contato", "Contato"], ["qualificado", "Qualificado"],
  ["proposta", "Proposta"], ["ganho", "Ganho"], ["perdido", "Perdido"]
];

function renderLeads() {
  const wrap = $("leads-table-wrap");
  if (!wrap) return;

  const search = (state.leadSearch || "").toLowerCase().trim();
  const selected = state.crmProjectId;
  const projects = [...state.projects].sort((a,b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  const clients = [...state.clients].sort((a,b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  const sources = [...new Set(state.leads.map(l => String(l.source || "site")).filter(Boolean))].sort();
  const assignees = [...new Set(state.leads.map(l => String(l.assignedTo || "")).filter(Boolean))].sort();

  const leads = state.leads.filter(lead => {
    if (selected && String(lead.projectId) !== String(selected)) return false;
    if (state.crmStatus && String(lead.status || "novo") !== state.crmStatus) return false;
    if (state.crmSource && String(lead.source || "site") !== state.crmSource) return false;
    if (state.crmAssignedTo && String(lead.assignedTo || "") !== state.crmAssignedTo) return false;
    if (state.crmClientId) {
      const project = getProject(lead.projectId);
      if (String(project?.clientId || "") !== String(state.crmClientId)) return false;
    }
    if (!leadMatchesPeriod(lead, state.crmPeriod)) return false;
    const text = [lead.name, lead.email, lead.phone, lead.message, lead.projectName || projectName(lead.projectId), lead.status, lead.source, lead.assignedTo, ...(lead.tags || [])].join(" ").toLowerCase();
    return !search || text.includes(search);
  });

  const counts = Object.fromEntries(CRM_STAGES.map(([k]) => [k, leads.filter(l => (l.status || "novo") === k).length]));

  wrap.outerHTML = `<div id="leads-table-wrap" class="crm-shell">
    <div class="crm-toolbar">
      <div class="crm-filters">
        <input value="${escapeHtml(state.leadSearch || "")}" placeholder="Buscar nome, contato, tag..." oninput="handleLeadSearch(this.value)" aria-label="Buscar leads">
        <select onchange="setCrmFilter('crmProjectId',this.value)" aria-label="Projeto"><option value="">Todos os projetos</option>${projects.map(p => `<option value="${escapeHtml(p.id)}" ${String(selected) === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
        <select onchange="setCrmFilter('crmClientId',this.value)" aria-label="Cliente"><option value="">Todos os clientes</option>${clients.map(c => `<option value="${escapeHtml(c.id)}" ${String(state.crmClientId) === String(c.id) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
        <select onchange="setCrmFilter('crmStatus',this.value)" aria-label="Status"><option value="">Todos os status</option>${CRM_STAGES.map(([k,l]) => `<option value="${k}" ${state.crmStatus===k?"selected":""}>${l}</option>`).join("")}</select>
        <select onchange="setCrmFilter('crmSource',this.value)" aria-label="Origem"><option value="">Todas as origens</option>${sources.map(v => `<option value="${escapeHtml(v)}" ${state.crmSource===v?"selected":""}>${escapeHtml(v)}</option>`).join("")}</select>
        <select onchange="setCrmFilter('crmAssignedTo',this.value)" aria-label="Responsável"><option value="">Todos os responsáveis</option>${assignees.map(v => `<option value="${escapeHtml(v)}" ${state.crmAssignedTo===v?"selected":""}>${escapeHtml(v)}</option>`).join("")}</select>
        <select onchange="setCrmFilter('crmPeriod',this.value)" aria-label="Período"><option value="">Todo período</option><option value="7" ${state.crmPeriod==="7"?"selected":""}>Últimos 7 dias</option><option value="30" ${state.crmPeriod==="30"?"selected":""}>Últimos 30 dias</option><option value="90" ${state.crmPeriod==="90"?"selected":""}>Últimos 90 dias</option></select>
        <span class="crm-summary">${leads.length} lead${leads.length === 1 ? "" : "s"}</span>
      </div>
      <div class="crm-summary-value">Pipeline: <strong>${formatMoney(leads.reduce((n,l) => n + Number(l.value || 0), 0))}</strong></div>
    </div>
    <div class="crm-board">${CRM_STAGES.map(([key,label]) => `
      <section class="crm-column crm-${key}"><header><div><strong>${label}</strong><span>${counts[key]}</span></div></header><div class="crm-dropzone">
        ${leads.filter(l => (l.status || "novo") === key).map(crmLeadCard).join("") || `<div class="crm-empty">Nenhum lead</div>`}
      </div></section>`).join("")}</div>
  </div>`;
}
