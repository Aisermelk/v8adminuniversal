/* V8 ADMIN UNIVERSAL — Loja V1 / área do cliente */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const state = { projects: [], project: null, categories: [], products: [], rules: [], settings: null, orders: [] };

  function allowedProjects() {
    return state.projects.filter(p => {
      const access = p?.access || {};
      const modules = Array.isArray(access.editable) ? access.editable : [];
      return String(p?.projectType || p?.type || "").toLowerCase() === "loja" && (!access.configured || modules.includes("loja"));
    });
  }

  async function api(path, options = {}) {
    const token = Auth?.getToken?.() || "";
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    try { return await res.json(); } catch { return { success: false, error: `Erro ${res.status}.` }; }
  }

  async function loadProjectData() {
    if (!state.project) return;
    const id = encodeURIComponent(state.project.id);
    const [cats, products, settings, rules, orders] = await Promise.all([
      api(`/api/data/ecommerce/${id}/categories`),
      api(`/api/data/ecommerce/${id}/products`),
      api(`/api/data/ecommerce/${id}/settings`),
      api(`/api/data/ecommerce/${id}/shipping-rules`),
      api(`/api/data/ecommerce/${id}/orders`)
    ]);
    state.categories = cats?.categories || [];
    state.products = products?.products || [];
    state.settings = settings?.settings || null;
    state.rules = rules?.rules || [];
    state.orders = orders?.orders || [];
    render();
  }

  function render() {
    const root = $("#store-app"); if (!root) return;
    if (!state.project) {
      root.innerHTML = `<div class="client-panel store-empty"><strong>Nenhuma loja liberada</strong><p>Quando um projeto do tipo LOJA for liberado para sua conta, ele aparecerá aqui.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="store-toolbar">
        <div><h2>${esc(state.project.name || "Loja")}</h2><p>Catálogo e operação da loja.</p></div>
        <select id="store-project-select">${allowedProjects().map(p => `<option value="${esc(p.id)}" ${p.id===state.project.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>
      </div>
      <div class="store-tabs">
        <button class="store-tab active" data-store-tab="products">Produtos</button>
        <button class="store-tab" data-store-tab="categories">Categorias</button>
        <button class="store-tab" data-store-tab="shipping">Frete</button>
        <button class="store-tab" data-store-tab="orders">Pedidos</button>
      </div>
      <div id="store-content"></div>`;
    $("#store-project-select").onchange = async e => { state.project = state.projects.find(p => p.id === e.target.value); await loadProjectData(); };
    root.querySelectorAll("[data-store-tab]").forEach(b => b.onclick = () => { root.querySelectorAll(".store-tab").forEach(x => x.classList.remove("active")); b.classList.add("active"); renderTab(b.dataset.storeTab); });
    renderTab("products");
  }

  function renderTab(tab) {
    const el = $("#store-content"); if (!el) return;
    if (tab === "products") renderProducts(el);
    if (tab === "categories") renderCategories(el);
    if (tab === "shipping") renderShipping(el);
    if (tab === "orders") renderOrders(el);
  }

  function renderProducts(el) {
    el.innerHTML = `<div class="store-panel"><div class="store-panel-head"><div><h3>Produtos</h3><p>${state.products.length} produto(s) cadastrado(s).</p></div><button class="btn btn-primary" id="new-product">+ Adicionar produto</button></div><div class="store-product-grid">${state.products.length ? state.products.map(productCard).join("") : `<div class="store-empty"><strong>Nenhum produto</strong><p>Cadastre o primeiro produto da loja.</p></div>`}</div></div>`;
    $("#new-product").onclick = () => productModal();
    el.querySelectorAll("[data-edit-product]").forEach(b => b.onclick = () => productModal(state.products.find(p => p.id === b.dataset.editProduct)));
    el.querySelectorAll("[data-delete-product]").forEach(b => b.onclick = async () => { if (!confirm("Excluir este produto?")) return; const r=await api(`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/products/${encodeURIComponent(b.dataset.deleteProduct)}`,{method:"DELETE"}); if(r?.error) return alert(r.error); await loadProjectData(); });
  }

  function productCard(p) {
    const cat = state.categories.find(c => c.id === p.categoryId);
    const display = p.onSale && p.promotionalPrice != null ? `<strong>${money(p.promotionalPrice)}</strong><del>${money(p.price)}</del>` : `<strong>${money(p.price)}</strong>`;
    return `<article class="store-product-card"><div class="store-product-image">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<span>SEM IMAGEM</span>`}</div><div class="store-product-body"><div class="store-tags">${p.featured?'<span>Destaque</span>':''}${p.onSale?'<span>Promoção</span>':''}${!p.active?'<span>Inativo</span>':''}</div><h4>${esc(p.name)}</h4><small>${esc(cat?.name || "Sem categoria")} · Estoque: ${p.stock}</small><div class="store-price">${display}</div><div class="store-actions"><button class="btn btn-ghost btn-sm" data-edit-product="${esc(p.id)}">Editar</button><button class="btn btn-ghost btn-sm danger" data-delete-product="${esc(p.id)}">Excluir</button></div></div></article>`;
  }

  function renderCategories(el) {
    el.innerHTML = `<div class="store-panel"><div class="store-panel-head"><div><h3>Categorias</h3><p>Crie e organize as categorias da sua loja.</p></div><button class="btn btn-primary" id="new-category">+ Nova categoria</button></div><div class="store-list">${state.categories.length ? state.categories.map(c => `<div class="store-list-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.description||"Sem descrição")}</small></div><div><button class="btn btn-ghost btn-sm" data-edit-category="${esc(c.id)}">Editar</button><button class="btn btn-ghost btn-sm danger" data-delete-category="${esc(c.id)}">Excluir</button></div></div>`).join("") : '<div class="store-empty"><strong>Nenhuma categoria</strong></div>'}</div></div>`;
    $("#new-category").onclick = () => categoryModal();
    el.querySelectorAll("[data-edit-category]").forEach(b => b.onclick=()=>categoryModal(state.categories.find(c=>c.id===b.dataset.editCategory)));
    el.querySelectorAll("[data-delete-category]").forEach(b => b.onclick=async()=>{if(!confirm("Excluir esta categoria? Os produtos ficarão sem categoria."))return;const r=await api(`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/categories/${encodeURIComponent(b.dataset.deleteCategory)}`,{method:"DELETE"});if(r?.error)return alert(r.error);await loadProjectData();});
  }

  function renderShipping(el) {
    const s=state.settings||{};
    el.innerHTML=`<div class="store-panel"><div class="store-panel-head"><div><h3>Frete e retirada</h3><p>Configuração baseada em peso e região.</p></div></div><form id="shipping-settings" class="store-form-grid"><label>CEP de origem<input id="origin-cep" value="${esc(s.originCep||"")}" placeholder="00000-000"></label><label>UF de origem<input id="origin-state" maxlength="2" value="${esc(s.originState||"")}" placeholder="RS"></label><label class="store-check"><input type="checkbox" id="pickup-enabled" ${s.pickupEnabled!==false?'checked':''}> Retirar na loja</label><label class="store-check"><input type="checkbox" id="correios-enabled" ${s.correiosEnabled!==false?'checked':''}> Correios</label><label class="store-check"><input type="checkbox" id="carrier-enabled" ${s.carrierEnabled!==false?'checked':''}> Transportadora</label><div class="store-form-actions"><button class="btn btn-primary">Salvar configuração</button></div></form></div><div class="store-panel"><div class="store-panel-head"><div><h3>Faixas de frete</h3><p>O preço pode ser diferente para o mesmo estado e outros estados.</p></div><button class="btn btn-primary" id="new-rule">+ Nova faixa</button></div><div class="store-list">${state.rules.length?state.rules.map(r=>`<div class="store-list-row"><div><strong>${r.method==='correios'?'Correios':'Transportadora'} · até ${r.maxWeightKg} kg</strong><small>Mesmo estado: ${money(r.sameStatePrice)} · Outros estados: ${money(r.otherStatePrice)}</small></div><button class="btn btn-ghost btn-sm danger" data-delete-rule="${esc(r.id)}">Excluir</button></div>`).join(""):'<div class="store-empty"><strong>Nenhuma faixa cadastrada</strong></div>'}</div></div>`;
    $("#shipping-settings").onsubmit=async e=>{e.preventDefault();const r=await api(`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/settings`,{method:"PUT",body:JSON.stringify({originCep:$("#origin-cep").value.trim(),originState:$("#origin-state").value.trim().toUpperCase(),pickupEnabled:$("#pickup-enabled").checked,correiosEnabled:$("#correios-enabled").checked,carrierEnabled:$("#carrier-enabled").checked})});if(r?.error)return alert(r.error);state.settings=r.settings;alert("Configuração salva.");};
    $("#new-rule").onclick=()=>ruleModal();
    el.querySelectorAll("[data-delete-rule]").forEach(b=>b.onclick=async()=>{if(!confirm("Excluir esta faixa?"))return;const r=await api(`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/shipping-rules/${encodeURIComponent(b.dataset.deleteRule)}`,{method:"DELETE"});if(r?.error)return alert(r.error);await loadProjectData();});
  }

  function renderOrders(el) { el.innerHTML=`<div class="store-panel"><div class="store-panel-head"><div><h3>Pedidos</h3><p>Pedidos recebidos pela loja.</p></div></div>${state.orders.length?`<div class="store-list">${state.orders.map(o=>`<div class="store-list-row"><div><strong>#${esc(o.id.slice(0,8))} · ${esc(o.customerName||'Cliente')}</strong><small>${o.items.length} item(ns) · ${esc(o.orderStatus)} · ${esc(o.paymentStatus)}</small></div><strong>${money(o.total)}</strong></div>`).join("")}</div>`:'<div class="store-empty"><strong>Nenhum pedido ainda</strong></div>'}</div>`; }

  function modal(title, body, save) {
    const ov=document.createElement("div");ov.className="modal-overlay";ov.innerHTML=`<div class="modal store-modal"><button class="modal-close">×</button><div class="panel-heading"><div><h2>${title}</h2></div></div>${body}<div class="modal-actions"><button class="btn btn-primary" id="store-modal-save">Salvar</button></div></div>`;document.body.appendChild(ov);ov.querySelector(".modal-close").onclick=()=>ov.remove();ov.addEventListener("click",e=>{if(e.target===ov)ov.remove()});ov.querySelector("#store-modal-save").onclick=async()=>{const btn=ov.querySelector("#store-modal-save");btn.disabled=true;try{await save(ov);ov.remove();await loadProjectData();}catch(e){alert(e.message||"Não foi possível salvar.")}finally{btn.disabled=false;}};
  }

  function productModal(p=null){const cats=state.categories;modal(p?"Editar produto":"Adicionar produto",`<div class="store-form-grid"><label>Nome<input id="p-name" value="${esc(p?.name||"")}" required></label><label>Categoria<select id="p-category"><option value="">Sem categoria</option>${cats.map(c=>`<option value="${esc(c.id)}" ${c.id===p?.categoryId?'selected':''}>${esc(c.name)}</option>`).join("")}</select></label><label>Preço<input id="p-price" type="number" min="0" step="0.01" value="${p?.price??""}"></label><label>Preço promocional<input id="p-promo" type="number" min="0" step="0.01" value="${p?.promotionalPrice??""}></label><label>Peso (kg)<input id="p-weight" type="number" min="0" step="0.001" value="${p?.weightKg??""}></label><label>Estoque<input id="p-stock" type="number" min="0" step="1" value="${p?.stock??0}"></label><label>SKU<input id="p-sku" value="${esc(p?.sku||"")}"></label><label>Imagem (URL)<input id="p-image" value="${esc(p?.image||"")}"></label><label class="store-check"><input type="checkbox" id="p-active" ${p?.active!==false?'checked':''}> Produto ativo</label><label class="store-check"><input type="checkbox" id="p-featured" ${p?.featured?'checked':''}> Produto em destaque</label><label class="store-check"><input type="checkbox" id="p-onsale" ${p?.onSale?'checked':''}> Produto em promoção</label><label class="store-full">Descrição<textarea id="p-description">${esc(p?.description||"")}</textarea></label></div>`,async()=>{const body={name:$("#p-name").value.trim(),categoryId:$("#p-category").value,price:Number($("#p-price").value||0),promotionalPrice:$("#p-promo").value===""?null:Number($("#p-promo").value),weightKg:Number($("#p-weight").value||0),stock:Number($("#p-stock").value||0),sku:$("#p-sku").value.trim(),image:$("#p-image").value.trim(),active:$("#p-active").checked,featured:$("#p-featured").checked,onSale:$("#p-onsale").checked,description:$("#p-description").value};if(!body.name)throw new Error("Informe o nome do produto.");const path=`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/products${p?`/${encodeURIComponent(p.id)}`:""}`;const r=await api(path,{method:p?"PUT":"POST",body:JSON.stringify(body)});if(r?.error)throw new Error(r.error);});}

  function categoryModal(c=null){modal(c?"Editar categoria":"Nova categoria",`<div class="store-form-grid"><label>Nome<input id="c-name" value="${esc(c?.name||"")}"></label><label>Imagem (URL)<input id="c-image" value="${esc(c?.image||"")}"></label><label class="store-full">Descrição<textarea id="c-description">${esc(c?.description||"")}</textarea></label><label class="store-check"><input type="checkbox" id="c-active" ${c?.active!==false?'checked':''}> Categoria ativa</label></div>`,async()=>{const body={name:$("#c-name").value.trim(),image:$("#c-image").value.trim(),description:$("#c-description").value,active:$("#c-active").checked};if(!body.name)throw new Error("Informe o nome da categoria.");const path=`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/categories${c?`/${encodeURIComponent(c.id)}`:""}`;const r=await api(path,{method:c?"PUT":"POST",body:JSON.stringify(body)});if(r?.error)throw new Error(r.error);});}

  function ruleModal(){modal("Nova faixa de frete",`<div class="store-form-grid"><label>Tipo<select id="r-method"><option value="correios">Correios</option><option value="transportadora">Transportadora</option></select></label><label>Até (kg)<input id="r-max" type="number" min="0.001" step="0.001"></label><label>Mesmo estado (R$)<input id="r-same" type="number" min="0" step="0.01"></label><label>Outros estados (R$)<input id="r-other" type="number" min="0" step="0.01"></label></div>`,async()=>{const body={method:$("#r-method").value,maxWeightKg:Number($("#r-max").value||0),sameStatePrice:Number($("#r-same").value||0),otherStatePrice:Number($("#r-other").value||0),active:true};if(body.maxWeightKg<=0)throw new Error("Informe o limite de peso.");const r=await api(`/api/data/ecommerce/${encodeURIComponent(state.project.id)}/shipping-rules`,{method:"POST",body:JSON.stringify(body)});if(r?.error)throw new Error(r.error);});}

  async function init() {
    const me=await API.get("/api/client/me");
    state.projects=Array.isArray(me?.projects)?me.projects:[];
    const projects=allowedProjects(); state.project=projects[0]||null;
    await loadProjectData();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
