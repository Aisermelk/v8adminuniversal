/* V8 — PAGAMENTOS independente da Loja.
   Aba "Cobranças" (lista padrão Clientes) e aba "Configuração" (InfinitePay / Mercado Pago). */
const paymentState = { projectId:"", payments:[], tab:"charges" };
const PAY_STATUS = { pending:["Pendente","badge-warning"], paid:["Pago","badge-success"], cancelled:["Cancelado","badge-muted"], refunded:["Reembolsado","badge-muted"] };
const PAY_PROVIDER = { manual:"Manual", infinitepay:"InfinitePay", mercadopago:"Mercado Pago" };
const payUrl = (suffix="") => `/api/data/payments/${encodeURIComponent(paymentState.projectId)}${suffix}`;
const payById = id => paymentState.payments.find(p => p.id === id);
const payProject = () => (state.projects||[]).find(p => p.id === paymentState.projectId) || {};
const payFail = (r, fallback) => { if (r?.error || r?.success === false) { toast(r?.error || fallback, "error"); return true; } return false; };
const payDate = d => d ? String(d).slice(0,10).split("-").reverse().join("/") : "—";
const payOverdue = p => p.status === "pending" && p.dueDate && String(p.dueDate).slice(0,10) < new Date().toISOString().slice(0,10);
function payClosePopups(){ document.querySelector(".project-actions-menu")?.remove(); }

async function renderPaymentsSection(){
  const el = $("payments-content"); if (!el) return;
  const projects = state.projects || [];
  if (!projects.length) { el.innerHTML = '<div class="empty-state">Nenhum projeto cadastrado.</div>'; return; }
  if (!paymentState.projectId || !projects.some(p => p.id === paymentState.projectId)) paymentState.projectId = projects[0].id;
  el.innerHTML = `<div class="module-head"><div><p class="eyebrow">V8 FINANCEIRO</p><h1>Pagamentos</h1><p>Cobranças e provedores de pagamento, independentes da Loja.</p></div>
    <div class="module-actions"><select id="payment-project">${projects.map(p=>`<option value="${escapeHtml(p.id)}" ${p.id===paymentState.projectId?'selected':''}>${escapeHtml(p.name||'Projeto')}</option>`).join('')}</select>
    <button class="btn btn-primary" onclick="openPaymentForm()">+ Nova cobrança</button></div></div>
    <div class="store-tabs">
      <button class="store-tab ${paymentState.tab==='charges'?'active':''}" onclick="switchPaymentTab('charges')">Cobranças</button>
      <button class="store-tab ${paymentState.tab==='settings'?'active':''}" onclick="switchPaymentTab('settings')">Configuração</button>
    </div><div id="payment-body"></div>`;
  $("#payment-project").onchange = async e => { paymentState.projectId = e.target.value; await loadPayments(); paintPaymentBody(); };
  await loadPayments(); paintPaymentBody();
}
function switchPaymentTab(tab){ paymentState.tab = tab; renderPaymentsSection(); }
async function loadPayments(){ const r = await API.get(payUrl()); paymentState.payments = r?.payments || []; }
function paintPaymentBody(){ paymentState.tab === "settings" ? paintPaymentSettings() : paintPaymentCharges(); }

/* ---------- Cobranças ---------- */
function paintPaymentCharges(){
  const box = $("payment-body"); if (!box) return;
  const all = paymentState.payments;
  const sum = st => all.filter(p => p.status === st).reduce((n,p) => n + Number(p.amount||0), 0);
  const overdue = all.filter(payOverdue);
  box.innerHTML = `<div class="pay-summary">
      <div class="pay-card"><span>A receber</span><strong>${formatMoney(sum('pending'))}</strong><small>${all.filter(p=>p.status==='pending').length} pendente(s)</small></div>
      <div class="pay-card"><span>Recebido</span><strong>${formatMoney(sum('paid'))}</strong><small>${all.filter(p=>p.status==='paid').length} paga(s)</small></div>
      <div class="pay-card ${overdue.length?'is-alert':''}"><span>Vencidas</span><strong>${formatMoney(overdue.reduce((n,p)=>n+Number(p.amount||0),0))}</strong><small>${overdue.length} cobrança(s)</small></div>
    </div>
    <div class="entity-filters client-filters">
      <div class="search-bar"><input type="text" id="payment-search" placeholder="Buscar por cliente ou descrição..." oninput="paintPaymentList()"></div>
      <select id="payment-status" onchange="paintPaymentList()" aria-label="Filtrar por status"><option value="">Todos os status</option>${Object.entries(PAY_STATUS).map(([v,[l]])=>`<option value="${v}">${l}</option>`).join('')}<option value="overdue">Vencidas</option></select>
      <select id="payment-provider" onchange="paintPaymentList()" aria-label="Filtrar por provedor"><option value="">Todos os provedores</option>${Object.entries(PAY_PROVIDER).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
    </div><div id="payment-list"></div>`;
  paintPaymentList();
}
function paintPaymentList(){
  const wrap = $("payment-list"); if (!wrap) return;
  const q = ($("payment-search")?.value||'').toLowerCase().trim(), st = $("payment-status")?.value||'', pv = $("payment-provider")?.value||'';
  const list = paymentState.payments.filter(p =>
    (!q || `${p.customerName} ${p.customerEmail} ${p.description}`.toLowerCase().includes(q)) &&
    (!st || (st === 'overdue' ? payOverdue(p) : p.status === st)) && (!pv || p.provider === pv));
  if (!list.length) { wrap.innerHTML = `<div class="empty-state"><strong>Nenhuma cobrança</strong><p>Crie uma cobrança ou ajuste os filtros.</p></div>`; return; }
  wrap.className = "table-wrap";
  wrap.innerHTML = `<table><thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Provedor</th><th>Status</th><th></th></tr></thead><tbody>${list.map(p => {
    const id = escapeHtml(p.id), [label, cls] = PAY_STATUS[p.status] || [p.status, "badge-muted"];
    return `<tr class="row-clickable" onclick="openPaymentDetail('${id}')">
      <td><strong>${escapeHtml(p.customerName||'—')}</strong></td><td>${escapeHtml(p.description||'—')}</td><td>${formatMoney(p.amount)}</td>
      <td>${payDate(p.dueDate)}</td><td>${escapeHtml(PAY_PROVIDER[p.provider]||p.provider)}</td>
      <td><span class="badge ${cls}">${label}</span>${payOverdue(p)?' <span class="badge badge-danger">Vencida</span>':''}</td>
      <td onclick="event.stopPropagation()"><div class="row-actions client-row-actions">
        <button class="btn btn-primary btn-sm" onclick="openPaymentDetail('${id}')">◉ <span>Visualizar</span></button>
        <button class="btn btn-ghost btn-sm" onclick="openPaymentForm('${id}')">✎ <span>Editar</span></button>
        <button class="icon-btn" title="Mais opções" onclick="openPaymentMenu(event,'${id}')">⋯</button></div></td></tr>`;
  }).join('')}</tbody></table><div class="list-summary">${list.length} cobrança${list.length===1?'':'s'} · Total: <strong>${formatMoney(list.reduce((n,p)=>n+Number(p.amount||0),0))}</strong></div>`;
}
function openPaymentMenu(event, id){
  event.stopPropagation(); payClosePopups();
  const p = payById(id); if (!p) return;
  const online = p.provider !== "manual";
  const menu = document.createElement("div"); menu.className = "project-actions-menu";
  menu.innerHTML = `${p.status!=='paid'?`<button onclick="setPaymentStatus('${id}','paid')">Marcar como paga</button>`:''}
    ${online&&p.status==='pending'?`<button onclick="generatePaymentLink('${id}')">Gerar / copiar link</button><button onclick="verifyPayment('${id}')">Verificar pagamento</button>`:''}
    ${p.status==='pending'?`<button onclick="setPaymentStatus('${id}','cancelled')">Cancelar cobrança</button>`:''}
    <button class="danger" onclick="deletePayment('${id}')">Excluir</button>`;
  menu.style.position = "fixed"; menu.style.left = `${Math.min(event.clientX, window.innerWidth-230)}px`; menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", payClosePopups, { once:true }), 0);
}

/* ---------- Criar / editar ---------- */
function openPaymentForm(id=null){
  $('#payment-editor')?.remove(); payClosePopups();
  const p = id ? payById(id) : null, s = payProject().paymentSettings || {};
  const o = document.createElement('div'); o.id = 'payment-editor'; o.className = 'modal-overlay';
  o.onclick = e => { if (e.target === o) o.remove(); };
  o.innerHTML = `<div class="modal universal-modal"><button class="modal-close" onclick="$('#payment-editor').remove()">×</button>
    <h2>${p?'Editar cobrança':'Nova cobrança'}</h2>
    <label>Cliente<input id="pay-name" value="${escapeHtml(p?.customerName||'')}"></label>
    <label>E-mail<input id="pay-email" type="email" value="${escapeHtml(p?.customerEmail||'')}"></label>
    <label>Descrição<input id="pay-desc" value="${escapeHtml(p?.description||'')}"></label>
    <div class="form-grid-2"><label>Valor<input id="pay-amount" type="number" min="0.01" step="0.01" value="${p?.amount??''}"></label>
    <label>Vencimento<input id="pay-due" type="date" value="${escapeHtml((p?.dueDate||'').slice(0,10))}"></label></div>
    <div class="form-grid-2"><label>Provedor<select id="pay-provider"><option value="manual" ${p?.provider==='manual'||!p?'selected':''}>Manual (sem link)</option>
      <option value="infinitepay" ${p?.provider==='infinitepay'?'selected':''}>InfinitePay (Pix e cartão)</option><option value="mercadopago" ${p?.provider==='mercadopago'?'selected':''}>Mercado Pago</option></select></label>
    ${p?`<label>Status<select id="pay-status">${Object.entries(PAY_STATUS).map(([v,[l]])=>`<option value="${v}" ${p.status===v?'selected':''}>${l}</option>`).join('')}</select></label>`:'<div></div>'}</div>
    <div class="modal-actions modal-save-bar"><button class="btn" onclick="$('#payment-editor').remove()">Cancelar</button>
    <button class="btn btn-primary modal-save-floating" onclick="savePayment('${id||''}')">${p?'Salvar':'Criar cobrança'}</button></div></div>`;
  document.body.appendChild(o);
}
async function savePayment(id){
  const body = { customerName:$('#pay-name').value.trim(), customerEmail:$('#pay-email').value.trim(), description:$('#pay-desc').value.trim(),
    amount:Number($('#pay-amount').value||0), dueDate:$('#pay-due').value, provider:$('#pay-provider').value };
  if (id) body.status = $('#pay-status').value;
  if (!body.amount) return toast('Informe um valor maior que zero.', 'error');
  const r = id ? await API.put(payUrl(`/${encodeURIComponent(id)}`), body) : await API.post(payUrl(), body);
  if (payFail(r, 'Erro ao salvar cobrança.')) return;
  $('#payment-editor')?.remove();
  const saved = r.payment;
  // Cobrança nova com provedor online: já gera o link de pagamento.
  if (!id && saved && saved.provider !== 'manual') {
    const c = await API.post(payUrl(`/${encodeURIComponent(saved.id)}/checkout`), {});
    await loadPayments(); paintPaymentBody();
    if (payFail(c, 'A cobrança foi criada, mas não foi possível gerar o link.')) return;
    toast('Cobrança criada e link gerado.'); openPaymentDetail(saved.id); return;
  }
  await loadPayments(); paintPaymentBody(); toast(id ? 'Cobrança atualizada.' : 'Cobrança criada.');
}

/* ---------- Ações ---------- */
async function setPaymentStatus(id, status){
  payClosePopups();
  const r = await API.put(payUrl(`/${encodeURIComponent(id)}`), { status });
  if (payFail(r, 'Erro ao atualizar.')) return;
  await loadPayments(); paintPaymentBody(); $('#payment-detail')?.remove();
  toast(status === 'paid' ? 'Cobrança marcada como paga.' : 'Cobrança cancelada.');
}
async function deletePayment(id){
  payClosePopups(); if (!confirm('Excluir esta cobrança?')) return;
  const r = await API.del(payUrl(`/${encodeURIComponent(id)}`)); if (payFail(r, 'Erro ao excluir.')) return;
  $('#payment-detail')?.remove(); await loadPayments(); paintPaymentBody(); toast('Cobrança excluída.');
}
async function copyText(text){ try { await navigator.clipboard.writeText(text); return true; } catch { const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); try{document.execCommand('copy');}catch{} t.remove(); return true; } }
async function generatePaymentLink(id){
  payClosePopups(); const p = payById(id); if (!p) return;
  let url = p.metadata?.checkoutUrl || "";
  if (!url) {
    const r = await API.post(payUrl(`/${encodeURIComponent(id)}/checkout`), {}); if (payFail(r, 'Não foi possível gerar o link.')) return;
    url = r.url; await loadPayments(); paintPaymentBody();
  }
  await copyText(url); toast('Link copiado.');
}
async function verifyPayment(id){
  payClosePopups();
  const r = await API.post(payUrl(`/${encodeURIComponent(id)}/verify`), {}); if (payFail(r, 'Não foi possível verificar.')) return;
  await loadPayments(); paintPaymentBody();
  if ($('#payment-detail')) openPaymentDetail(id);
  toast(r.paid ? 'Pagamento confirmado!' : 'Ainda não consta pagamento.');
}
function openPaymentDetail(id){
  $('#payment-detail')?.remove(); payClosePopups();
  const p = payById(id); if (!p) return;
  const [label, cls] = PAY_STATUS[p.status] || [p.status, 'badge-muted'], m = p.metadata || {}, online = p.provider !== 'manual';
  const o = document.createElement('div'); o.id = 'payment-detail'; o.className = 'modal-overlay';
  o.onclick = e => { if (e.target === o) o.remove(); };
  const row = (k, v) => `<div class="pay-detail-row"><span>${k}</span><strong>${v}</strong></div>`;
  o.innerHTML = `<div class="modal universal-modal"><button class="modal-close" onclick="$('#payment-detail').remove()">×</button>
    <h2>Cobrança</h2>
    ${row('Status', `<span class="badge ${cls}">${label}</span>${payOverdue(p)?' <span class="badge badge-danger">Vencida</span>':''}`)}
    ${row('Valor', formatMoney(p.amount))}${row('Cliente', escapeHtml(p.customerName||'—'))}${row('E-mail', escapeHtml(p.customerEmail||'—'))}
    ${row('Descrição', escapeHtml(p.description||'—'))}${row('Vencimento', payDate(p.dueDate))}${row('Provedor', escapeHtml(PAY_PROVIDER[p.provider]||p.provider))}
    ${p.paidAt?row('Pago em', payDate(p.paidAt)):''}${m.captureMethod?row('Forma de pagamento', m.captureMethod==='pix'?'Pix':(m.captureMethod==='credit_card'?'Cartão de crédito':escapeHtml(m.captureMethod))):''}
    ${m.receiptUrl?row('Comprovante', `<a href="${escapeHtml(m.receiptUrl)}" target="_blank" rel="noopener">Abrir</a>`):''}
    ${m.checkoutUrl?`<div class="pay-link"><input readonly id="pay-link-input" value="${escapeHtml(m.checkoutUrl)}"><button class="btn btn-sm" onclick="copyText($('#pay-link-input').value).then(()=>toast('Link copiado.'))">Copiar</button><a class="btn btn-sm" href="${escapeHtml(m.checkoutUrl)}" target="_blank" rel="noopener">Abrir</a></div>`:''}
    <div class="modal-actions">${online&&p.status==='pending'?`${m.checkoutUrl?'':`<button class="btn" onclick="generatePaymentLink('${escapeHtml(p.id)}').then(()=>openPaymentDetail('${escapeHtml(p.id)}'))">Gerar link</button>`}<button class="btn" onclick="verifyPayment('${escapeHtml(p.id)}')">Verificar pagamento</button>`:''}
    ${p.status!=='paid'?`<button class="btn btn-primary" onclick="setPaymentStatus('${escapeHtml(p.id)}','paid')">Marcar como paga</button>`:''}
    <button class="btn" onclick="openPaymentForm('${escapeHtml(p.id)}')">Editar</button></div></div>`;
  document.body.appendChild(o);
}

/* ---------- Configuração dos provedores ---------- */
function paintPaymentSettings(){
  const box = $("payment-body"); if (!box) return;
  const project = payProject();
  const s = project.paymentSettings || { infinitePay: (project.ecommerce||{}).infinitePay || {}, mercadoPago: (project.ecommerce||{}).mercadoPago || {} };
  const ip = s.infinitePay || {}, mp = s.mercadoPago || {};
  box.innerHTML = `<div class="store-panel"><div class="store-panel-head"><div><h3>InfinitePay</h3><p>Pix (taxa zero) e cartão de crédito em até 12x, na conta do cliente.</p></div></div>
      <div class="store-form-grid"><label class="store-check store-full"><input type="checkbox" id="ip-enabled" ${ip.enabled?'checked':''}> Ativar InfinitePay</label>
      <label class="store-full">InfiniteTag<input id="ip-handle" value="${escapeHtml(ip.handle||'')}" placeholder="minhaloja"></label></div>
      <small class="form-help">É o nome de usuário no app InfinitePay. Digite sem @ e sem $ (se digitar, o painel remove). Não precisa de token.</small></div>
    <div class="store-panel"><div class="store-panel-head"><div><h3>Mercado Pago</h3><p>Pix e cartão, processados na conta do cliente.</p></div></div>
      <div class="store-form-grid"><label class="store-check store-full"><input type="checkbox" id="mp-enabled" ${mp.enabled?'checked':''}> Ativar Mercado Pago</label>
      <label class="store-full">Access Token<input id="mp-token" type="password" autocomplete="off" value="${escapeHtml(mp.accessToken||'')}" placeholder="APP_USR-..."></label>
      <label class="store-full">Public Key<input id="mp-public" value="${escapeHtml(mp.publicKey||'')}" placeholder="APP_USR-..."></label></div>
      <small class="form-help">Na conta do Mercado Pago do cliente: Seu negócio → Configurações → Credenciais de produção.</small></div>
    <div class="store-panel"><div class="store-panel-head"><div><h3>Confirmação automática</h3><p>Cada link já é criado com o aviso (webhook) apontando para este painel: quando o cliente paga, a cobrança vira "Pago" sozinha. O botão "Verificar pagamento" consulta o provedor direto, como garantia.</p></div></div></div>
    <div class="store-form-actions"><button class="btn btn-primary" id="pay-settings-save" onclick="savePaymentSettings()">Salvar configuração</button></div>`;
}
async function savePaymentSettings(){
  const btn = $("pay-settings-save"); if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
  const handle = ($("ip-handle")?.value||"").trim().replace(/^[@$]+/, "");
  const paymentSettings = {
    infinitePay: { enabled: !!$("ip-enabled")?.checked, handle },
    mercadoPago: { enabled: !!$("mp-enabled")?.checked, accessToken: $("mp-token")?.value.trim()||"", publicKey: $("mp-public")?.value.trim()||"" }
  };
  const res = await API.put("/api/data/projects", { id: paymentState.projectId, paymentSettings });
  if (btn) { btn.disabled = false; btn.textContent = "Salvar configuração"; }
  if (payFail(res, "Não foi possível salvar a configuração.")) return;
  const i = state.projects.findIndex(p => p.id === paymentState.projectId);
  if (i >= 0 && res.project) state.projects[i] = res.project;
  if ($("ip-handle")) $("ip-handle").value = handle;
  toast("Configuração de pagamentos salva.");
}

Object.assign(window,{renderPaymentsSection,switchPaymentTab,paintPaymentList,openPaymentForm,savePayment,openPaymentDetail,openPaymentMenu,setPaymentStatus,deletePayment,generatePaymentLink,verifyPayment,savePaymentSettings,copyText});
