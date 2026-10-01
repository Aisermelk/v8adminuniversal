/* V8 — CATÁLOGO independente da Loja */

const catalogState = {
  projectId: "",
  products: [],
  categories: []
};

async function renderCatalogSection() {
  const el = $("catalog-content");
  if (!el) return;

  const projects = Array.isArray(state?.projects) ? state.projects : [];

  if (!projects.length) {
    el.innerHTML = '<div class="empty-state">Nenhum projeto cadastrado.</div>';
    return;
  }

  if (
    !catalogState.projectId ||
    !projects.some((p) => p.id === catalogState.projectId)
  ) {
    catalogState.projectId = projects[0].id;
  }

  await loadCatalog();

  el.innerHTML = `
    <div class="module-head">
      <div>
        <p class="eyebrow">V8 UNIVERSAL</p>
        <h1>Catálogo</h1>
        <p>Produtos, serviços, combos, pacotes e planos. Independente da Loja.</p>
      </div>

      <div class="module-actions">
        <select id="catalog-project">
          ${projects
            .map(
              (p) => `
                <option
                  value="${escapeHtml(p.id)}"
                  ${p.id === catalogState.projectId ? "selected" : ""}
                >
                  ${escapeHtml(p.name || "Projeto")}
                </option>
              `
            )
            .join("")}
        </select>

        <button class="btn btn-primary" onclick="openCatalogItem()">
          + Adicionar item
        </button>
      </div>
    </div>

    <div class="module-toolbar">
      <input
        id="catalog-search"
        type="search"
        placeholder="Buscar no catálogo..."
      >

      <select id="catalog-type">
        <option value="">Todos os tipos</option>
        <option value="product">Produto</option>
        <option value="service">Serviço</option>
        <option value="combo">Combo</option>
        <option value="package">Pacote</option>
        <option value="plan">Plano</option>
        <option value="other">Outro</option>
      </select>

      <select id="catalog-status">
        <option value="">Todos os status</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
      </select>
    </div>

    <div id="catalog-list"></div>
  `;

  const projectSelect = $("#catalog-project");
  const searchInput = $("#catalog-search");
  const typeSelect = $("#catalog-type");
  const statusSelect = $("#catalog-status");

  if (projectSelect) {
    projectSelect.onchange = async (event) => {
      catalogState.projectId = event.target.value;

      await loadCatalog();
      paintCatalog();
    };
  }

  if (searchInput) {
    searchInput.oninput = paintCatalog;
  }

  if (typeSelect) {
    typeSelect.onchange = paintCatalog;
  }

  if (statusSelect) {
    statusSelect.onchange = paintCatalog;
  }

  paintCatalog();
}

async function loadCatalog() {
  if (!catalogState.projectId) {
    catalogState.products = [];
    catalogState.categories = [];
    return;
  }

  try {
    const response = await API.get(
      `/api/data/catalog/${encodeURIComponent(catalogState.projectId)}`
    );

    catalogState.products = Array.isArray(response?.products)
      ? response.products
      : [];

    catalogState.categories = Array.isArray(response?.categories)
      ? response.categories
      : [];
  } catch (error) {
    console.error("Erro ao carregar catálogo:", error);

    catalogState.products = [];
    catalogState.categories = [];

    toast("Erro ao carregar o catálogo.", "error");
  }
}

function paintCatalog() {
  const el = $("#catalog-list");

  if (!el) return;

  const search = $("#catalog-search");
  const type = $("#catalog-type");
  const status = $("#catalog-status");

  const q = String(search?.value || "").trim().toLowerCase();
  const selectedType = String(type?.value || "");
  const selectedStatus = String(status?.value || "");

  const list = catalogState.products.filter((product) => {
    const text = `
      ${product?.name || ""}
      ${product?.description || ""}
    `.toLowerCase();

    const matchesSearch = !q || text.includes(q);
    const matchesType =
      !selectedType || product?.itemType === selectedType;
    const matchesStatus =
      !selectedStatus || product?.status === selectedStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <strong>Nenhum item encontrado</strong>
        <p>Use os filtros ou adicione um item ao catálogo.</p>
      </div>
    `;

    return;
  }

  el.innerHTML = `
    <div class="catalog-grid">
      ${list
        .map((product) => {
          const id = escapeHtml(product.id || "");

          return `
            <article class="catalog-card">

              <div class="catalog-card-media">
                ${
                  product.image
                    ? `<img src="${escapeHtml(product.image)}" alt="">`
                    : "◈"
                }
              </div>

              <div class="catalog-card-body">

                <div class="catalog-tags">

                  <span class="badge badge-muted">
                    ${escapeHtml(product.itemType || "product")}
                  </span>

                  ${
                    product.featured
                      ? '<span class="badge badge-success">Destaque</span>'
                      : ""
                  }

                  ${
                    product.promotion
                      ? '<span class="badge">Promoção</span>'
                      : ""
                  }

                </div>

                <h3>
                  ${escapeHtml(product.name || "")}
                </h3>

                <p>
                  ${escapeHtml(product.description || "")}
                </p>

                <strong>
                  ${
                    product.price == null
                      ? "Sob consulta"
                      : formatMoney(product.price)
                  }
                </strong>

              </div>

              <div class="catalog-card-actions">

                <button
                  type="button"
                  class="btn btn-sm"
                  onclick="openCatalogItem('${id}')"
                >
                  Editar
                </button>

                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  onclick="deleteCatalogItem('${id}')"
                >
                  Excluir
                </button>

              </div>

            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function openCatalogItem(id = null) {
  closeCatalogItem();

  const product = id
    ? catalogState.products.find((item) => item.id === id)
    : null;

  const overlay = document.createElement("div");

  overlay.className = "modal-overlay";
  overlay.id = "catalog-editor";

  overlay.innerHTML = `
    <div class="modal universal-modal">

      <button
        type="button"
        class="modal-close"
        onclick="closeCatalogItem()"
      >
        ×
      </button>

      <div class="modal-max-row">
        <span>Item do catálogo</span>

        <button
          type="button"
          class="btn btn-sm"
          onclick="this.closest('.modal').classList.toggle('modal-maximized')"
        >
          □ Maximizar
        </button>
      </div>

      <h2>
        ${product ? "Editar item" : "Adicionar item"}
      </h2>

      <label>
        Nome

        <input
          id="cat-name"
          type="text"
          value="${escapeHtml(product?.name || "")}"
        >
      </label>

      <label>
        Tipo

        <select id="cat-type-edit">
          ${[
            ["product", "Produto"],
            ["service", "Serviço"],
            ["combo", "Combo"],
            ["package", "Pacote"],
            ["plan", "Plano"],
            ["other", "Outro"]
          ]
            .map(
              ([value, label]) => `
                <option
                  value="${value}"
                  ${
                    product?.itemType === value
                      ? "selected"
                      : ""
                  }
                >
                  ${label}
                </option>
              `
            )
            .join("")}
        </select>
      </label>

      <label>
        Descrição

        <textarea
          id="cat-desc"
          rows="4"
        >${escapeHtml(product?.description || "")}</textarea>
      </label>

      <div class="form-grid-2">

        <label>
          Preço

          <input
            id="cat-price"
            type="number"
            min="0"
            step="0.01"
            value="${product?.price ?? ""}"
            placeholder="Deixe vazio para 'sob consulta'"
          >
        </label>

        <label>
          Peso (kg)

          <input
            id="cat-weight"
            type="number"
            min="0"
            step="0.01"
            value="${product?.weight ?? 0}"
          >
        </label>

      </div>

      <label>
        Categoria

        <select id="cat-category">
          <option value="">Sem categoria</option>

          ${catalogState.categories
            .map(
              (category) => `
                <option
                  value="${escapeHtml(category.id)}"
                  ${
                    product?.categoryId === category.id
                      ? "selected"
                      : ""
                  }
                >
                  ${escapeHtml(category.name || "")}
                </option>
              `
            )
            .join("")}
        </select>
      </label>

      <label>
        Imagem

        <input
          id="cat-image"
          type="text"
          value="${escapeHtml(product?.image || "")}"
          placeholder="URL da imagem"
        >
      </label>

      <div class="form-grid-2">

        <label class="check-row">
          <input
            id="cat-featured"
            type="checkbox"
            ${product?.featured ? "checked" : ""}
          >

          Destaque
        </label>

        <label class="check-row">
          <input
            id="cat-promo"
            type="checkbox"
            ${product?.promotion ? "checked" : ""}
          >

          Promoção
        </label>

      </div>

      <label>
        Status

        <select id="cat-status-edit">
          <option
            value="active"
            ${product?.status !== "inactive" ? "selected" : ""}
          >
            Ativo
          </option>

          <option
            value="inactive"
            ${product?.status === "inactive" ? "selected" : ""}
          >
            Inativo
          </option>
        </select>
      </label>

      <div class="modal-actions modal-save-bar">

        <button
          type="button"
          class="btn"
          onclick="closeCatalogItem()"
        >
          Cancelar
        </button>

        <button
          type="button"
          class="btn btn-primary modal-save-floating"
          onclick="saveCatalogItem('${escapeHtml(id || "")}')"
        >
          Salvar
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(overlay);
}

function closeCatalogItem() {
  $("#catalog-editor")?.remove();
}

function getCatalogFormValue(id, fallback = "") {
  const element = document.getElementById(id);

  if (!element) {
    console.error(`Elemento do catálogo não encontrado: #${id}`);
    return fallback;
  }

  return element.value;
}

function getCatalogChecked(id, fallback = false) {
  const element = document.getElementById(id);

  if (!element) {
    console.error(`Checkbox do catálogo não encontrado: #${id}`);
    return fallback;
  }

  return Boolean(element.checked);
}

async function saveCatalogItem(id) {
  const editor = document.getElementById("catalog-editor");

  if (!editor) {
    return toast("Editor do catálogo não está aberto.", "error");
  }

  if (!catalogState.projectId) {
    return toast("Selecione um projeto.", "error");
  }

  const name = getCatalogFormValue("cat-name").trim();

  if (!name) {
    return toast("Informe o nome.", "error");
  }

  const priceValue = getCatalogFormValue("cat-price");

  const body = {
    name,
    description: getCatalogFormValue("cat-desc").trim(),
    itemType: getCatalogFormValue("cat-type-edit", "product"),
    price:
      priceValue === ""
        ? null
        : Number(priceValue),

    weight: Number(
      getCatalogFormValue("cat-weight", "0") || 0
    ),

    categoryId: getCatalogFormValue("cat-category"),
    image: getCatalogFormValue("cat-image").trim(),

    featured: getCatalogChecked("cat-featured"),
    promotion: getCatalogChecked("cat-promo"),

    status: getCatalogFormValue(
      "cat-status-edit",
      "active"
    ),

    trackStock: false,
    stock: 0
  };

  if (
    Number.isNaN(body.price) &&
    body.price !== null
  ) {
    return toast("Informe um preço válido.", "error");
  }

  if (Number.isNaN(body.weight)) {
    return toast("Informe um peso válido.", "error");
  }

  try {
    const url = id
      ? `/api/data/products/${encodeURIComponent(
          catalogState.projectId
        )}/${encodeURIComponent(id)}`
      : `/api/data/products/${encodeURIComponent(
          catalogState.projectId
        )}`;

    const response = id
      ? await API.put(url, body)
      : await API.post(url, body);

    if (
      response?.error ||
      response?.success === false
    ) {
      return toast(
        response?.error || "Erro ao salvar.",
        "error"
      );
    }

    closeCatalogItem();

    await loadCatalog();

    paintCatalog();

    toast(
      id
        ? "Item atualizado."
        : "Item adicionado."
    );
  } catch (error) {
    console.error("Erro ao salvar item do catálogo:", error);

    toast(
      "Não foi possível salvar o item.",
      "error"
    );
  }
}

async function deleteCatalogItem(id) {
  if (!id) {
    return toast("Item inválido.", "error");
  }

  if (!confirm("Excluir este item do catálogo?")) {
    return;
  }

  try {
    const response = await API.del(
      `/api/data/products/${encodeURIComponent(
        catalogState.projectId
      )}/${encodeURIComponent(id)}`
    );

    if (
      response?.error ||
      response?.success === false
    ) {
      return toast(
        response?.error || "Erro ao excluir.",
        "error"
      );
    }

    await loadCatalog();

    paintCatalog();

    toast("Item excluído.");
  } catch (error) {
    console.error("Erro ao excluir item:", error);

    toast(
      "Não foi possível excluir o item.",
      "error"
    );
  }
}

window.renderCatalogSection = renderCatalogSection;
window.openCatalogItem = openCatalogItem;
window.closeCatalogItem = closeCatalogItem;
window.saveCatalogItem = saveCatalogItem;
window.deleteCatalogItem = deleteCatalogItem;
