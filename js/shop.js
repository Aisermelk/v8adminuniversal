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
    return { id: "", name: "", description: "", price: 0, weight: 0, stock: 0, trackStock: false, image: "", status: "active" };
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

    <label>Nome do produto</label>
    <input id="prod-name" value="${escapeHtml(p.name || "")}" placeholder="Ex.: Caneca personalizada">

    <label>Descrição</label>
    <textarea id="prod-description" rows="3">${escapeHtml(p.description || "")}</textarea>

    <div style="display:flex;gap:12px">
      <div style="flex:1">
        <label>Preço (R$)</label>
        <input id="prod-price" type="number" min="0" step="0.01" value="${p.price ?? 0}">
      </div>
      <div style="flex:1">
        <label>Peso (kg)</label>
        <input id="prod-weight" type="number" min="0" step="0.01" value="${p.weight ?? 0}">
      </div>
    </div>

    <label style="display:flex;align-items:center;gap:8px;margin-top:14px">
      <input type="checkbox" id="prod-track-stock" ${p.trackStock ? "checked" : ""} onchange="document.getElementById('prod-stock-wrap').classList.toggle('hidden', !this.checked)">
      Controlar estoque deste produto
    </label>

    <div id="prod-stock-wrap" class="${p.trackStock ? "" : "hidden"}">
      <label>Estoque disponível</label>
      <input id="prod-stock" type="number" min="0" step="1" value="${p.stock ?? 0}">
    </div>

    <label>Imagem (link)</label>
    <input id="prod-image" value="${escapeHtml(p.image || "")}" placeholder="https://...">
    <small class="form-help">Cole o link de uma imagem já hospedada.</small>

    <label>Status</label>
    <select id="prod-status">
      <option value="active" ${p.status === "active" ? "selected" : ""}>Ativo (aparece na loja)</option>
      <option value="inactive" ${p.status === "inactive" ? "selected" : ""}>Inativo (oculto)</option>
    </select>

    <div class="modal-actions">
      <button class="btn" onclick="closeProductOverlay()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveProduct('${escapeHtml(id || "")}')">Salvar</button>
    </div>
  `);
}

async function saveProduct(id) {
  const name = $("prod-name")?.value.trim();
  if (!name) return toast("Informe o nome do produto.", "error");

  const body = {
    name,
    description: $("prod-description")?.value.trim() || "",
    price: Number($("prod-price")?.value || 0),
    weight: Number($("prod-weight")?.value || 0),
    trackStock: !!$("prod-track-stock")?.checked,
    stock: Number($("prod-stock")?.value || 0),
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

  const wrap = $("project-tab-content");
  if (wrap) renderProjectShop(wrap);
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

  const wrap = $("project-tab-content");
  if (wrap) renderProjectShop(wrap);
}

window.renderProjectShop = renderProjectShop;
window.openProductModal = openProductModal;
window.closeProductOverlay = closeProductOverlay;
window.saveProduct = saveProduct;
window.confirmDeleteProduct = confirmDeleteProduct;
window.deleteProduct = deleteProduct;
