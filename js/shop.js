/* =========================================================
   LOJA — PRODUTOS (painel do administrador)
   Aba "Loja" dentro do editor de projeto.
   ========================================================= */

const shopState = {
  projectId: null,
  products: []
};

async function renderProjectShop(el) {
  const projectId = state.editingProjectId;

  if (!projectId) {
    el.innerHTML = `<div class="empty-state">Salve o projeto primeiro.</div>`;
    return;
  }

  shopState.projectId = projectId;

  el.innerHTML = `<div class="loading">Carregando produtos...</div>`;

  try {
    const res = await API.get(`/api/data/products/${encodeURIComponent(projectId)}`);
    shopState.products = Array.isArray(res?.products) ? res.products : [];
    paintShop(el);
  } catch (error) {
    console.error(error);
    el.innerHTML = `<div class="empty-state">Erro ao carregar produtos.</div>`;
  }
}

function paintShop(el) {
  const products = shopState.products;

  el.innerHTML = `
    <div class="shop-toolbar">
      <p class="form-help" style="margin:0">
        ${products.length} produto${products.length === 1 ? "" : "s"} cadastrado${products.length === 1 ? "" : "s"}
      </p>
      <button class="btn btn-primary btn-sm" onclick="openProductModal()">+ Novo produto</button>
    </div>

    ${!products.length ? `
      <div class="empty-state">
        Nenhum produto cadastrado. Clique em "Novo produto" para começar a loja.
      </div>
    ` : `
      <div class="shop-grid">
        ${products.map(p => `
          <div class="shop-card">
            <div class="shop-card-image" style="${p.image ? `background-image:url('${escapeHtml(p.image)}')` : ""}">
              ${!p.image ? "🛒" : ""}
            </div>
            <div class="shop-card-body">
              <strong>${escapeHtml(p.name)}</strong>
              <span class="shop-card-price">${formatMoney(p.price)}</span>
              <span class="badge ${p.status === "active" ? "badge-success" : "badge-muted"}">
                ${p.status === "active" ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div class="shop-card-actions">
              <button class="btn btn-sm" onclick="openProductModal('${escapeHtml(p.id)}')">Editar</button>
              <button class="btn btn-sm btn-danger" onclick="confirmDeleteProduct('${escapeHtml(p.id)}')">Excluir</button>
            </div>
          </div>
        `).join("")}
      </div>
    `}
  `;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getProductDraft(id) {
  if (!id) {
    return { id: "", name: "", shortDescription: "", description: "", price: 0, promoPrice: 0, sku: "", categoryId: "", subcategory: "", brand: "", featured: false, weight: 0, height: 0, width: 0, length: 0, stock: 0, minStock: 0, trackStock: false, availability: "available", image: "", images: [], videoUrl: "", slug: "", metaTitle: "", metaDescription: "", ogImage: "", minStock: 0, status: "active" };
  }
  return shopState.products.find(p => p.id === id) || null;
}

// Um overlay próprio, empilhado sobre o editor do projeto — não usa o
// showModal()/closeModal() globais, porque eles controlam um único modal
// (#modal-overlay), e o editor do projeto já está usando esse mesmo modal.
function openProductOverlay(html) {
  closeProductOverlay();
  const overlay = document.createElement("div");
  overlay.id = "product-modal-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <button class="modal-close" onclick="closeProductOverlay()" aria-label="Fechar">×</button>
      ${html}
    </div>
  `;
  overlay.addEventListener("click", e => { if (e.target === overlay) closeProductOverlay(); });
  document.body.appendChild(overlay);
}

function closeProductOverlay() {
  document.getElementById("product-modal-overlay")?.remove();
}

function openProductModal(id = null) {
  const p = getProductDraft(id);
  if (id && !p) return toast("Produto não encontrado.", "error");
  openProductOverlay(`
    <h2>${id ? "Editar produto" : "Novo produto"}</h2>
    <div class="store-form-grid">
      <label>Nome<input id="prod-name" value="${escapeHtml(p.name || "")}" required></label>
      <label>SKU<input id="prod-sku" value="${escapeHtml(p.sku || "")}"></label>
      <label class="store-full">Descrição curta<input id="prod-short-description" value="${escapeHtml(p.shortDescription || "")}"></label>
      <label class="store-full">Descrição completa<textarea id="prod-description" rows="4">${escapeHtml(p.description || "")}</textarea></label>
      <label>Preço<input id="prod-price" type="number" min="0" step="0.01" value="${p.price ?? 0}"></label>
      <label>Preço promocional<input id="prod-promo-price" type="number" min="0" step="0.01" value="${p.promoPrice ?? 0}"></label>
      <label>SKU/Marca<input id="prod-brand" value="${escapeHtml(p.brand || "")}"></label>
      <label>Categoria<input id="prod-category-id" value="${escapeHtml(p.categoryId || "")}"></label>
      <label>Subcategoria<input id="prod-subcategory" value="${escapeHtml(p.subcategory || "")}"></label>
      <label>Slug<input id="prod-slug" value="${escapeHtml(p.slug || "")}"></label>
      <label>Imagem principal<input id="prod-image" value="${escapeHtml(p.image || "")}"></label>
      <label>Vídeo (URL)<input id="prod-video-url" value="${escapeHtml(p.videoUrl || "")}"></label>
      <label class="store-full">Galeria — uma URL por linha<textarea id="prod-images" rows="3">${escapeHtml((p.images || []).join("\n"))}</textarea></label>
      <label>Peso<input id="prod-weight" type="number" min="0" step="0.01" value="${p.weight ?? 0}"></label>
      <label>Estoque mínimo<input id="prod-min-stock" type="number" min="0" value="${p.minStock ?? 0}"></label>
      <label>Altura<input id="prod-height" type="number" min="0" step="0.01" value="${p.height ?? 0}"></label>
      <label>Largura<input id="prod-width" type="number" min="0" step="0.01" value="${p.width ?? 0}"></label>
      <label>Comprimento<input id="prod-length" type="number" min="0" step="0.01" value="${p.length ?? 0}"></label>
      <label>Disponibilidade<select id="prod-availability"><option value="available" ${p.availability==="available"?"selected":""}>Disponível</option><option value="unavailable" ${p.availability==="unavailable"?"selected":""}>Indisponível</option><option value="preorder" ${p.availability==="preorder"?"selected":""}>Pré-venda</option></select></label>
      <label>Status<select id="prod-status"><option value="active" ${p.status==="active"?"selected":""}>Ativo</option><option value="inactive" ${p.status==="inactive"?"selected":""}>Inativo</option><option value="draft" ${p.status==="draft"?"selected":""}>Rascunho</option></select></label>
      <label class="store-check"><input type="checkbox" id="prod-featured" ${p.featured ? "checked" : ""}> Destaque</label>
      <label class="store-check"><input type="checkbox" id="prod-track-stock" ${p.trackStock ? "checked" : ""}> Controlar estoque</label>
      <label>Estoque<input id="prod-stock" type="number" min="0" value="${p.stock ?? 0}"></label>
      <label>Meta title<input id="prod-meta-title" value="${escapeHtml(p.metaTitle || "")}"></label>
      <label class="store-full">Meta description<textarea id="prod-meta-description">${escapeHtml(p.metaDescription || "")}</textarea></label>
      <label class="store-full">Imagem OG<input id="prod-og-image" value="${escapeHtml(p.ogImage || "")}"></label>
      <div class="store-form-actions"><button class="btn" onclick="closeProductOverlay()">Cancelar</button><button class="btn btn-primary" onclick="saveProduct('${escapeHtml(id || "")}')">Salvar produto</button></div>
    </div>
  `);
}

async function saveProduct(id) {
  const name = $("prod-name")?.value.trim();
  if (!name) return toast("Informe o nome do produto.", "error");

  const body = {
    name,
    shortDescription: $("prod-short-description")?.value.trim() || "",
    description: $("prod-description")?.value.trim() || "",
    price: Number($("prod-price")?.value || 0),
    promoPrice: Number($("prod-promo-price")?.value || 0),
    sku: $("prod-sku")?.value.trim() || "",
    categoryId: $("prod-category-id")?.value.trim() || "",
    subcategory: $("prod-subcategory")?.value.trim() || "",
    brand: $("prod-brand")?.value.trim() || "",
    featured: !!$("prod-featured")?.checked,
    slug: $("prod-slug")?.value.trim() || "",
    videoUrl: $("prod-video-url")?.value.trim() || "",
    images: ($("prod-images")?.value || "").split(/\r?\n/).map(v => v.trim()).filter(Boolean),
    metaTitle: $("prod-meta-title")?.value.trim() || "",
    metaDescription: $("prod-meta-description")?.value.trim() || "",
    ogImage: $("prod-og-image")?.value.trim() || "",
    weight: Number($("prod-weight")?.value || 0),
    height: Number($("prod-height")?.value || 0),
    width: Number($("prod-width")?.value || 0),
    length: Number($("prod-length")?.value || 0),
    trackStock: !!$("prod-track-stock")?.checked,
    stock: Number($("prod-stock")?.value || 0),
    minStock: Number($("prod-min-stock")?.value || 0),
    availability: $("prod-availability")?.value || "available",
    image: $("prod-image")?.value.trim() || "",
    status: $("prod-status")?.value || "active"
  };

  const res = id
    ? await API.put(`/api/data/products/${encodeURIComponent(shopState.projectId)}/${encodeURIComponent(id)}`, body)
    : await API.post(`/api/data/products/${encodeURIComponent(shopState.projectId)}`, body);

  if (!res || res.success === false || res.error) {
    return toast(res?.error || "Não foi possível salvar o produto.", "error");
  }

  closeProductOverlay();
  toast(id ? "Produto atualizado." : "Produto criado.");
  refreshShopView();
}

function confirmDeleteProduct(id) {
  const p = shopState.products.find(x => x.id === id);
  if (!p) return;

  openProductOverlay(`
    <h2>Excluir produto</h2>
    <p>Tem certeza que deseja excluir <strong>${escapeHtml(p.name)}</strong>? Essa ação não pode ser desfeita.</p>
    <div class="modal-actions">
      <button class="btn" onclick="closeProductOverlay()">Cancelar</button>
      <button class="btn btn-danger" onclick="deleteProduct('${escapeHtml(id)}')">Excluir</button>
    </div>
  `);
}

async function deleteProduct(id) {
  const res = await API.del(`/api/data/products/${encodeURIComponent(shopState.projectId)}/${encodeURIComponent(id)}`);
  if (!res || res.success === false) {
    return toast(res?.error || "Não foi possível excluir o produto.", "error");
  }

  closeProductOverlay();
  toast("Produto excluído.");
  refreshShopView();
}

// Reflete o resultado de criar/editar/excluir produto na tela certa,
// seja a aba "Loja" dentro do editor de projeto, seja a página Loja
// no menu principal — as duas telas usam o mesmo shopState.
function refreshShopView() {
  const projectWrap = $("project-tab-content");
  if (projectWrap && state.projectTab === "loja") {
    renderProjectShop(projectWrap);
    return;
  }

  const storeWrap = $("store-tab-content");
  if (storeWrap && storePage.tab === "produtos") {
    paintStoreTab();
  }
  if (typeof state !== "undefined" && state.section === "catalog" && typeof renderCatalogSection === "function") {
    renderCatalogSection();
  }
}

window.renderProjectShop = renderProjectShop;
window.openProductModal = openProductModal;
window.closeProductOverlay = closeProductOverlay;
window.saveProduct = saveProduct;
window.confirmDeleteProduct = confirmDeleteProduct;
window.deleteProduct = deleteProduct;

/* =========================================================
   LOJA — página principal (menu lateral)
   Um seletor de projeto + abas: Produtos / Configuração.
   Deixa você editar a loja de qualquer cliente sem precisar
   abrir o editor completo do projeto.
   ========================================================= */

const storePage = { projectId: "", tab: "produtos" };

const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

function renderStoreSection() {
  const el = $("store-content");
  if (!el) return;

  const projects = state.projects || [];

  if (!projects.length) {
    el.innerHTML = `<div class="store-empty"><strong>Nenhum projeto cadastrado</strong><p>Crie um projeto para configurar uma loja.</p></div>`;
    return;
  }

  if (!storePage.projectId || !projects.some(p => p.id === storePage.projectId)) {
    storePage.projectId = projects[0].id;
  }

  el.innerHTML = `
    <div class="store-toolbar">
      <div>
        <h2>Loja</h2>
        <p>Produtos e configuração da loja virtual de cada projeto</p>
      </div>
      <select id="store-project-select">
        ${projects.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === storePage.projectId ? "selected" : ""}>${escapeHtml(p.name || "Projeto")}</option>`).join("")}
      </select>
    </div>

    <div class="store-tabs">
      <button class="store-tab ${storePage.tab === "produtos" ? "active" : ""}" data-store-tab="produtos" onclick="switchStoreTab('produtos')">Produtos</button>
      <button class="store-tab ${storePage.tab === "config" ? "active" : ""}" data-store-tab="config" onclick="switchStoreTab('config')">Configuração</button>
    </div>

    <div id="store-tab-content"><div class="loading">Carregando...</div></div>
  `;

  $("store-project-select").onchange = e => {
    storePage.projectId = e.target.value;
    paintStoreTab();
  };

  paintStoreTab();
}

function switchStoreTab(tab) {
  storePage.tab = tab;
  document.querySelectorAll("[data-store-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.storeTab === tab);
  });
  paintStoreTab();
}

async function paintStoreTab() {
  const content = $("store-tab-content");
  if (!content) return;

  const projectId = storePage.projectId;

  if (storePage.tab === "produtos") {
    shopState.projectId = projectId;
    content.innerHTML = `<div class="loading">Carregando produtos...</div>`;
    try {
      const res = await API.get(`/api/data/products/${encodeURIComponent(projectId)}`);
      shopState.products = Array.isArray(res?.products) ? res.products : [];
      paintStoreProducts(content);
    } catch (error) {
      console.error(error);
      content.innerHTML = `<div class="store-empty">Erro ao carregar produtos.</div>`;
    }
    return;
  }

  paintStoreConfig(content, projectId);
}

function paintStoreProducts(el) {
  const products = shopState.products;

  el.innerHTML = `
    <div class="store-panel">
      <div class="store-panel-head">
        <div>
          <h3>Produtos</h3>
          <p>${products.length} produto${products.length === 1 ? "" : "s"} cadastrado${products.length === 1 ? "" : "s"}</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openProductModal()">+ Novo produto</button>
      </div>

      ${!products.length ? `
        <div class="store-empty">
          <strong>Nenhum produto cadastrado</strong>
          <p>Clique em "Novo produto" para começar a loja deste projeto.</p>
        </div>
      ` : `
        <div class="store-product-grid">
          ${products.map(p => `
            <div class="store-product-card">
              <div class="store-product-image">
                ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : "SEM IMAGEM"}
              </div>
              <div class="store-product-body">
                <h4>${escapeHtml(p.name)}</h4>
                <div class="store-price"><strong>${formatMoney(p.price)}</strong></div>
                <span class="badge ${p.status === "active" ? "badge-success" : "badge-muted"}">
                  ${p.status === "active" ? "Ativo" : "Inativo"}
                </span>
                <div class="store-actions" style="margin-top:12px">
                  <button class="btn btn-sm" onclick="openProductModal('${escapeHtml(p.id)}')">Editar</button>
                  <button class="btn btn-sm btn-danger" onclick="confirmDeleteProduct('${escapeHtml(p.id)}')">Excluir</button>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `}
    </div>
  `;
}

function paintStoreConfig(el, projectId) {
  const project = state.projects.find(p => p.id === projectId);

  if (!project) {
    el.innerHTML = `<div class="store-empty">Projeto não encontrado.</div>`;
    return;
  }

  const ec = project.ecommerce || {};
  const mp = ec.mercadoPago || {};
  const ip = ec.infinitePay || {};
  const pickup = ec.pickup || {};
  const shipping = Array.isArray(ec.shipping) ? ec.shipping : [];

  el.innerHTML = `
    <div class="store-panel">
      <div class="store-panel-head"><div><h3>Status da loja</h3><p>Liga ou desliga a loja deste projeto.</p></div></div>
      <label class="store-check"><input type="checkbox" id="ec-enabled" ${ec.enabled ? "checked" : ""}> Loja ativa (produtos ficam visíveis no site)</label>
    </div>

    <div class="store-panel">
      <div class="store-panel-head"><div><h3>Entrega</h3><p>Formas de entrega disponíveis nesta loja.</p></div></div>
      <div class="store-form-grid">
        <label class="store-check store-full"><input type="checkbox" id="ec-pickup" ${pickup.enabled ? "checked" : ""}> Permitir retirar na loja (grátis)</label>
        <label>Estado de origem (para calcular frete)
          <select id="ec-origin">
            <option value="">Selecione...</option>
            ${BRAZIL_STATES.map(uf => `<option value="${uf}" ${ec.originState === uf ? "selected" : ""}>${uf}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>

    <div class="store-panel">
      <div class="store-panel-head">
        <div><h3>Tabela de frete</h3><p>Faixas por peso, para Correios e Transportadora.</p></div>
        <button class="btn btn-sm" onclick="addShippingRow()">+ Adicionar faixa</button>
      </div>
      <div id="shipping-rows" class="store-list">
        ${shipping.length ? shipping.map(rowShippingHtml).join("") : `<div class="store-empty">Nenhuma faixa cadastrada. Sem faixas, só "Retirar na loja" aparece no carrinho.</div>`}
      </div>
    </div>

    <div class="store-panel">
      <div class="store-panel-head"><div><h3>Mercado Pago</h3><p>Pix e cartão, processados na própria conta do cliente.</p></div></div>
      <div class="store-form-grid">
        <label class="store-check store-full"><input type="checkbox" id="mp-enabled" ${mp.enabled ? "checked" : ""}> Ativar Mercado Pago</label>
        <label class="store-full">Access Token<input id="mp-token" value="${escapeHtml(mp.accessToken || "")}" placeholder="APP_USR-..."></label>
        <label class="store-full">Public Key<input id="mp-public" value="${escapeHtml(mp.publicKey || "")}" placeholder="APP_USR-..."></label>
      </div>
      <small class="form-help">Na conta do Mercado Pago do cliente: Seu negócio → Configurações → Credenciais de produção.</small>
    </div>

    <div class="store-panel">
      <div class="store-panel-head"><div><h3>InfinitePay</h3><p>Link de pagamento, gerado na conta do cliente.</p></div></div>
      <div class="store-form-grid">
        <label class="store-check store-full"><input type="checkbox" id="ip-enabled" ${ip.enabled ? "checked" : ""}> Ativar InfinitePay</label>
        <label class="store-full">InfiniteTag (@usuario)<input id="ip-handle" value="${escapeHtml(ip.handle || "")}" placeholder="@minhaloja"></label>
      </div>
    </div>

    <div class="store-form-actions" style="margin-top:4px">
      <button class="btn btn-primary" id="store-config-save" onclick="saveStoreConfig('${escapeHtml(projectId)}')">Salvar configuração</button>
    </div>
  `;
}

function rowShippingHtml(r) {
  return `
    <div class="store-list-row" data-id="${escapeHtml(r.id)}">
      <div class="store-form-grid" style="flex:1">
        <label>Transportador
          <select data-f="carrier">
            <option value="correios" ${r.carrier === "correios" ? "selected" : ""}>Correios</option>
            <option value="transportadora" ${r.carrier === "transportadora" ? "selected" : ""}>Transportadora</option>
          </select>
        </label>
        <label>Até (kg)<input data-f="maxWeight" type="number" min="0" step="0.1" value="${r.maxWeight ?? 1}"></label>
        <label>Mesmo estado (R$)<input data-f="sameState" type="number" min="0" step="0.01" value="${r.sameState ?? 0}"></label>
        <label>Outros estados (R$)<input data-f="otherState" type="number" min="0" step="0.01" value="${r.otherState ?? 0}"></label>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeShippingRow('${escapeHtml(r.id)}')">Remover</button>
    </div>
  `;
}

function readShippingRowsFromDom() {
  return [...document.querySelectorAll("#shipping-rows .store-list-row")].map(row => ({
    id: row.dataset.id,
    carrier: row.querySelector('[data-f="carrier"]').value,
    maxWeight: Number(row.querySelector('[data-f="maxWeight"]').value || 0),
    sameState: Number(row.querySelector('[data-f="sameState"]').value || 0),
    otherState: Number(row.querySelector('[data-f="otherState"]').value || 0)
  }));
}

function renderShippingRows(rows) {
  const wrap = $("shipping-rows");
  if (!wrap) return;
  wrap.innerHTML = rows.length
    ? rows.map(rowShippingHtml).join("")
    : `<div class="store-empty">Nenhuma faixa cadastrada. Sem faixas, só "Retirar na loja" aparece no carrinho.</div>`;
}

function addShippingRow() {
  const rows = readShippingRowsFromDom();
  rows.push({ id: "r" + Date.now(), carrier: "correios", maxWeight: 1, sameState: 0, otherState: 0 });
  renderShippingRows(rows);
}

function removeShippingRow(id) {
  renderShippingRows(readShippingRowsFromDom().filter(r => r.id !== id));
}

async function saveStoreConfig(projectId) {
  const btn = $("store-config-save");
  if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }

  const ecommerce = {
    enabled: !!$("ec-enabled")?.checked,
    originState: $("ec-origin")?.value || "",
    pickup: { enabled: !!$("ec-pickup")?.checked },
    mercadoPago: {
      enabled: !!$("mp-enabled")?.checked,
      accessToken: $("mp-token")?.value.trim() || "",
      publicKey: $("mp-public")?.value.trim() || ""
    },
    infinitePay: {
      enabled: !!$("ip-enabled")?.checked,
      handle: $("ip-handle")?.value.trim() || ""
    },
    shipping: readShippingRowsFromDom()
  };

  const res = await API.put("/api/data/projects", { id: projectId, ecommerce });

  if (btn) { btn.disabled = false; btn.textContent = "Salvar configuração"; }

  if (!res || res.success === false || res.error) {
    return toast(res?.error || "Não foi possível salvar a configuração.", "error");
  }

  const idx = state.projects.findIndex(p => p.id === projectId);
  if (idx >= 0 && res.project) state.projects[idx] = res.project;

  toast("Configuração da loja salva.");
}

window.renderStoreSection = renderStoreSection;
window.switchStoreTab = switchStoreTab;
window.addShippingRow = addShippingRow;
window.removeShippingRow = removeShippingRow;
window.saveStoreConfig = saveStoreConfig;
