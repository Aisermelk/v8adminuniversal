/* V8 — CATÁLOGO independente da Loja
   Categorias, subcategorias (2 níveis) e tags por projeto. */
const catalogState = { projectId:"", products:[], categories:[], tags:[], cat:"", sub:"", tag:"", editTags:new Set() };

const CATALOG_TYPES = [["product","Produto"],["service","Serviço"],["combo","Combo"],["package","Pacote"],["plan","Plano"],["other","Outro"]];
const catUrl = (suffix="") => `/api/data/catalog/${encodeURIComponent(catalogState.projectId)}${suffix}`;
const catRoots = () => catalogState.categories.filter(c => !c.parentId);
const catChildren = id => catalogState.categories.filter(c => c.parentId === id);
const catById = id => catalogState.categories.find(c => c.id === id);
const tagById = id => catalogState.tags.find(t => t.id === id);
function catPath(id){ const c=catById(id); if(!c) return ""; const p=c.parentId?catById(c.parentId):null; return p?`${p.name} › ${c.name}`:c.name; }
function catFail(r, fallback){ if(r?.error||r?.success===false){ toast(r?.error||fallback,"error"); return true; } return false; }

/* ---------- Tela principal: barra de filtros (padrão Clientes) + vitrine por categoria ---------- */
catalogState.collapsed = new Set();
catalogState.editVariations = [];
async function renderCatalogSection(){
  const el=$("catalog-content"); if(!el)return; const projects=state.projects||[];
  if(!projects.length){el.innerHTML='<div class="empty-state">Nenhum projeto cadastrado.</div>';return;}
  if(!catalogState.projectId || !projects.some(p=>p.id===catalogState.projectId)) catalogState.projectId=projects[0].id;
  await loadCatalog();
  el.innerHTML=`<div class="module-head"><div><p class="eyebrow">V8 UNIVERSAL</p><h1>Catálogo</h1><p>Produtos, serviços, combos, pacotes e planos. Independente da Loja.</p></div>
    <div class="module-actions"><select id="catalog-project">${projects.map(p=>`<option value="${escapeHtml(p.id)}" ${p.id===catalogState.projectId?'selected':''}>${escapeHtml(p.name||'Projeto')}</option>`).join('')}</select>
    <button class="btn" onclick="openCatalogCategories()">Categorias</button><button class="btn" onclick="openCatalogTags()">Tags</button><button class="btn" onclick="$('catalog-import-file').click()">Importar</button><input type="file" id="catalog-import-file" accept="application/json,.json" hidden onchange="importCatalogJson(this)">
    <button class="btn btn-primary" onclick="openCatalogItem()">+ Adicionar item</button></div></div>
    <div class="entity-filters client-filters">
      <div class="search-bar"><input type="text" id="catalog-search" placeholder="Buscar item, tag ou categoria..." oninput="paintCatalog()"></div>
      <select id="catalog-category" onchange="setCatalogCategory(this.value)" aria-label="Filtrar por categoria"></select>
      <select id="catalog-status" onchange="paintCatalog()" aria-label="Filtrar por status"><option value="">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
    </div>
    <div id="catalog-list"></div>`;
  $("#catalog-project").onchange=async e=>{catalogState.projectId=e.target.value;catalogState.cat="";await loadCatalog();paintCatalog();};
  paintCatalog();
}
async function loadCatalog(){
  const r=await API.get(catUrl());
  catalogState.products=r?.products||[]; catalogState.categories=r?.categories||[]; catalogState.tags=r?.tags||[];
  if(catalogState.cat && catalogState.cat!=="__none__" && !catById(catalogState.cat)) catalogState.cat="";
}
function setCatalogCategory(v){ catalogState.cat=v; paintCatalog(); }
function toggleVitrine(id){ catalogState.collapsed.has(id)?catalogState.collapsed.delete(id):catalogState.collapsed.add(id); paintCatalog(); }

function fillCatalogCategorySelect(){
  const sel=$("catalog-category"); if(!sel)return;
  const sig=JSON.stringify(catalogState.categories.map(c=>[c.id,c.name,c.parentId]))+catalogState.cat;
  if(sel.dataset.sig===sig) return; sel.dataset.sig=sig;
  let html=`<option value="">Todas as categorias</option>`;
  for(const c of catRoots()){
    html+=`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    for(const k of catChildren(c.id)) html+=`<option value="${escapeHtml(k.id)}">${escapeHtml(c.name)} › ${escapeHtml(k.name)}</option>`;
  }
  html+=`<option value="__none__">Sem categoria</option>`;
  sel.innerHTML=html; sel.value=catalogState.cat||"";
}
function catalogItemMatches(p,q,st){
  if(st && p.status!==st) return false;
  if(q){
    const tagNames=(p.tags||[]).map(id=>tagById(id)?.name||'').join(' ');
    const typeLabel=(CATALOG_TYPES.find(x=>x[0]===p.itemType)||[0,''])[1];
    if(!`${p.name} ${p.description} ${tagNames} ${typeLabel} ${catPath(p.categoryId)}`.toLowerCase().includes(q)) return false;
  }
  const c=catalogState.cat;
  if(!c) return true;
  if(c==="__none__") return !p.categoryId || !catById(p.categoryId);
  const cat=catById(c); if(!cat) return true;
  if(cat.parentId) return p.categoryId===c;
  return p.categoryId===c || catChildren(c).some(k=>k.id===p.categoryId);
}
function catalogCardHtml(p){
  const tags=(p.tags||[]).map(tagById).filter(Boolean);
  return `<article class="catalog-card"><div class="catalog-card-media">${p.image?`<img src="${escapeHtml(p.image)}" alt="">`:'◈'}</div><div class="catalog-card-body">
    <div class="catalog-tags"><span class="badge badge-muted">${escapeHtml((CATALOG_TYPES.find(x=>x[0]===p.itemType)||[0,p.itemType||'Produto'])[1])}</span>${p.featured?'<span class="badge badge-success">Destaque</span>':''}${p.promotion?'<span class="badge">Promoção</span>':''}${p.status==='inactive'?'<span class="badge badge-muted">Inativo</span>':''}</div>
    <h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||'')}</p>
    ${tags.length?`<div class="catalog-tags">${tags.map(x=>`<span class="tag-chip">#${escapeHtml(x.name)}</span>`).join('')}</div>`:''}
    <strong>${catalogPriceHtml(p)}</strong></div>
    <div class="catalog-card-actions"><button class="btn btn-sm" onclick="openCatalogItem('${escapeHtml(p.id)}')">Editar</button><button class="btn btn-sm btn-danger" onclick="deleteCatalogItem('${escapeHtml(p.id)}')">Excluir</button></div></article>`;
}
function catalogPriceHtml(p){
  const vs=p.variations||[];
  if(vs.length){ const min=Math.min(...vs.map(v=>Number(v.price||0))); return `A partir de ${formatMoney(min)} <small class="muted-note">· ${vs.length} variações</small>`; }
  if(p.price==null) return 'Sob consulta';
  return `${p.originalPrice&&p.originalPrice>p.price?`<s class="muted-note">${formatMoney(p.originalPrice)}</s> `:''}${formatMoney(p.price)}`;
}
const catalogGrid=items=>`<div class="catalog-grid">${items.map(catalogCardHtml).join('')}</div>`;

/* Vitrine: uma seção por categoria (com subcategorias dentro), sem abas. */
function paintCatalog(){
  fillCatalogCategorySelect();
  const el=$("catalog-list"); if(!el)return;
  const q=($("catalog-search")?.value||'').trim().toLowerCase(), st=$("catalog-status")?.value||'';
  const filtered=!!(q||st||catalogState.cat);
  const list=catalogState.products.filter(p=>catalogItemMatches(p,q,st));
  const roots=catRoots();
  if(!roots.length){
    el.innerHTML=list.length?catalogGrid(list):`<div class="empty-state"><strong>Nenhum item encontrado</strong><p>Use os filtros ou adicione um item ao catálogo.</p></div>`;
    return;
  }
  const inCat=id=>list.filter(p=>p.categoryId===id);
  const addBtn=id=>`<button type="button" class="btn btn-sm" onclick="event.stopPropagation();openCatalogItem(null,'${escapeHtml(id)}')">+ Item</button>`;
  const head=(id,title,count,add)=>`<header class="vitrine-head" onclick="toggleVitrine('${escapeHtml(id)}')"><span class="vitrine-chevron">${catalogState.collapsed.has(id)&&!filtered?'▸':'▾'}</span><h2>${escapeHtml(title)}</h2><span class="vitrine-count">${count}</span>${add?addBtn(id):''}</header>`;
  let html="";
  for(const r of roots){
    const direct=inCat(r.id), kids=catChildren(r.id).map(k=>({k,items:inCat(k.id)}));
    const total=direct.length+kids.reduce((n,x)=>n+x.items.length,0);
    if(filtered && !total) continue;
    const closed=catalogState.collapsed.has(r.id)&&!filtered;
    html+=`<section class="vitrine-section">${head(r.id,r.name,total,true)}`;
    if(!closed){
      html+=`<div class="vitrine-body">`;
      if(direct.length) html+=catalogGrid(direct);
      for(const {k,items} of kids){
        if(filtered && !items.length) continue;
        html+=`<div class="vitrine-sub"><div class="vitrine-subhead"><h3>${escapeHtml(k.name)}</h3><span class="vitrine-count">${items.length}</span>${addBtn(k.id)}</div>${items.length?catalogGrid(items):'<p class="vitrine-empty">Nenhum item nesta subcategoria.</p>'}</div>`;
      }
      if(!total) html+=`<p class="vitrine-empty">Nenhum item nesta categoria.</p>`;
      html+=`</div>`;
    }
    html+=`</section>`;
  }
  const known=new Set(catalogState.categories.map(c=>c.id));
  const loose=list.filter(p=>!p.categoryId||!known.has(p.categoryId));
  if(loose.length){
    const closed=catalogState.collapsed.has("__none__")&&!filtered;
    html+=`<section class="vitrine-section">${head("__none__","Sem categoria",loose.length,false)}${closed?'':`<div class="vitrine-body">${catalogGrid(loose)}</div>`}</section>`;
  }
  el.innerHTML=html||`<div class="empty-state"><strong>Nenhum item encontrado</strong><p>Use os filtros ou adicione um item ao catálogo.</p></div>`;
}

/* ---------- Item (criar / editar) ---------- */
function categoryOptions(selected){
  let html=`<option value="">Sem categoria</option>`;
  for(const c of catRoots()){
    html+=`<option value="${escapeHtml(c.id)}" ${selected===c.id?'selected':''}>${escapeHtml(c.name)}</option>`;
    for(const k of catChildren(c.id)) html+=`<option value="${escapeHtml(k.id)}" ${selected===k.id?'selected':''}>${escapeHtml(c.name)} › ${escapeHtml(k.name)}</option>`;
  }
  return html;
}
function paintCatalogTagPicker(){
  const box=$("cat-tag-picker"); if(!box)return;
  box.innerHTML=catalogState.tags.length?catalogState.tags.map(t=>`<button type="button" class="tag-chip tag-chip-btn ${catalogState.editTags.has(t.id)?'on':''}" onclick="toggleCatalogEditTag('${escapeHtml(t.id)}')">#${escapeHtml(t.name)}</button>`).join(''):'<span class="muted-note">Nenhuma tag criada ainda.</span>';
}
function toggleCatalogEditTag(id){ catalogState.editTags.has(id)?catalogState.editTags.delete(id):catalogState.editTags.add(id); paintCatalogTagPicker(); }
async function addCatalogTagFromInput(){
  const input=$("cat-tag-new"); const name=(input?.value||'').trim(); if(!name)return;
  const r=await API.post(catUrl("/tags"),{name}); if(catFail(r,'Erro ao criar tag.'))return;
  if(r.tag){ if(!tagById(r.tag.id)) catalogState.tags.push(r.tag); catalogState.editTags.add(r.tag.id); }
  input.value=''; paintCatalogTagPicker();
}
function openCatalogItem(id=null,presetCat=''){
  closeCatalogItem();
  const p=id?catalogState.products.find(x=>x.id===id):null;
  catalogState.editTags=new Set(p?.tags||[]);
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id='catalog-editor';
  overlay.onclick=e=>{ if(e.target===overlay) closeCatalogItem(); };
  overlay.innerHTML=`<div class="modal universal-modal"><button class="modal-close" onclick="closeCatalogItem()">×</button>
    <div class="modal-max-row"><span>Item do catálogo</span><button class="btn btn-sm" onclick="this.closest('.modal').classList.toggle('modal-maximized')">□ Maximizar</button></div>
    <h2>${p?'Editar item':'Adicionar item'}</h2>
    <label>Nome<input id="cat-name" value="${escapeHtml(p?.name||'')}"></label>
    <label>Tipo<select id="cat-type-edit">${CATALOG_TYPES.map(([v,l])=>`<option value="${v}" ${p?.itemType===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Descrição curta (aparece no card)<input id="cat-short" maxlength="300" value="${escapeHtml(p?.shortDescription||'')}"></label>
    <label>Descrição completa<textarea id="cat-desc" rows="4">${escapeHtml(p?.description||'')}</textarea></label>
    <div class="form-grid-2"><label>Preço<input id="cat-price" type="number" min="0" step="0.01" value="${p?.price??''}" placeholder="Deixe vazio para 'sob consulta'"></label><label>Preço antigo (de)<input id="cat-orig" type="number" min="0" step="0.01" value="${p?.originalPrice??''}" placeholder="Opcional: mostra riscado"></label></div>
    <div class="form-grid-2"><label>Peso (kg)<input id="cat-weight" type="number" min="0" step="0.01" value="${p?.weight??0}"></label><label>SKU<input id="cat-sku" value="${escapeHtml(p?.sku||'')}"></label></div>
    <label class="check-row"><input id="cat-track" type="checkbox" ${p?.trackStock?'checked':''}> Controlar estoque</label>
    <label>Estoque<input id="cat-stock" type="number" min="0" step="1" value="${p?.stock??0}"></label>
    <label>Categoria / subcategoria<select id="cat-category">${categoryOptions(p?.categoryId||presetCat||'')}</select></label>
    <div class="field-block"><span class="field-label">Tags</span><div id="cat-tag-picker" class="tag-picker"></div>
      <div class="tag-add"><input id="cat-tag-new" placeholder="Nova tag (Enter para criar)" onkeydown="if(event.key==='Enter'){event.preventDefault();addCatalogTagFromInput();}"><button type="button" class="btn btn-sm" onclick="addCatalogTagFromInput()">+ Criar tag</button></div></div>
    <label>Imagens (uma URL por linha; a primeira é a principal)<textarea id="cat-images" rows="3" placeholder="https://...">${escapeHtml((p?.images?.length?p.images:(p?.image?[p.image]:[])).join('\n'))}</textarea></label>
    <div class="field-block"><span class="field-label">Variações (opcional: cada uma com preço próprio)</span><div id="cat-variations" class="manager-list"></div><button type="button" class="btn btn-sm" onclick="addCatalogVariation()">+ Adicionar variação</button></div>
    <div class="form-grid-2"><label class="check-row"><input id="cat-featured" type="checkbox" ${p?.featured?'checked':''}> Destaque</label><label class="check-row"><input id="cat-promo" type="checkbox" ${p?.promotion?'checked':''}> Promoção</label></div>
    <label>Status<select id="cat-status-edit"><option value="active" ${p?.status!=='inactive'?'selected':''}>Ativo</option><option value="inactive" ${p?.status==='inactive'?'selected':''}>Inativo</option></select></label>
    <div class="modal-actions modal-save-bar"><button class="btn" onclick="closeCatalogItem()">Cancelar</button><button class="btn btn-primary modal-save-floating" onclick="saveCatalogItem('${escapeHtml(id||'')}')">Salvar</button></div></div>`;
  catalogState.editVariations=(p?.variations||[]).map(v=>({...v}));
  document.body.appendChild(overlay); paintCatalogTagPicker(); paintCatalogVariations();
}
function readCatalogVariations(){
  return [...document.querySelectorAll('#cat-variations .var-row')].map(r=>({id:r.dataset.id||'',name:r.querySelector('.v-name').value.trim(),price:Number(r.querySelector('.v-price').value||0),originalPrice:r.querySelector('.v-orig').value===''?null:Number(r.querySelector('.v-orig').value),sku:r.querySelector('.v-sku').value.trim(),stock:r.querySelector('.v-stock').value===''?null:Number(r.querySelector('.v-stock').value)})).filter(v=>v.name);
}
function paintCatalogVariations(){
  const box=$('cat-variations'); if(!box)return;
  box.innerHTML=catalogState.editVariations.length?catalogState.editVariations.map((v,i)=>`<div class="var-row" data-id="${escapeHtml(v.id||'')}"><input class="v-name" placeholder="Nome (ex.: 4GB + 64GB)" value="${escapeHtml(v.name||'')}"><input class="v-price" type="number" min="0" step="0.01" placeholder="Preço" value="${v.price??''}"><input class="v-orig" type="number" min="0" step="0.01" placeholder="De" value="${v.originalPrice??''}"><input class="v-sku" placeholder="SKU" value="${escapeHtml(v.sku||'')}"><input class="v-stock" type="number" min="0" step="1" placeholder="Estoque" value="${v.stock??''}"><button type="button" class="btn btn-sm btn-danger" onclick="removeCatalogVariation(${i})">×</button></div>`).join(''):'<span class="muted-note">Sem variações: vale o preço acima.</span>';
}
function addCatalogVariation(){ catalogState.editVariations=readCatalogVariations(); catalogState.editVariations.push({id:'',name:'',price:'',originalPrice:null,sku:'',stock:null}); paintCatalogVariations(); }
function removeCatalogVariation(i){ catalogState.editVariations=readCatalogVariations(); catalogState.editVariations.splice(i,1); paintCatalogVariations(); }
function closeCatalogItem(){ $('#catalog-editor')?.remove(); }
async function saveCatalogItem(id){
  const images=$('#cat-images').value.split('\n').map(x=>x.trim()).filter(Boolean);
  const body={name:$('#cat-name').value.trim(),shortDescription:$('#cat-short').value.trim(),description:$('#cat-desc').value.trim(),itemType:$('#cat-type-edit').value,price:$('#cat-price').value===''?null:Number($('#cat-price').value),originalPrice:$('#cat-orig').value===''?null:Number($('#cat-orig').value),sku:$('#cat-sku').value.trim(),weight:Number($('#cat-weight').value||0),categoryId:$('#cat-category').value,tags:[...catalogState.editTags],images,image:images[0]||'',variations:readCatalogVariations(),featured:$('#cat-featured').checked,promotion:$('#cat-promo').checked,status:$('#cat-status-edit').value,trackStock:$('#cat-track').checked,stock:Number($('#cat-stock').value||0)};
  if(!body.name)return toast('Informe o nome.','error');
  const url=id?`/api/data/products/${encodeURIComponent(catalogState.projectId)}/${encodeURIComponent(id)}`:`/api/data/products/${encodeURIComponent(catalogState.projectId)}`;
  const r=id?await API.put(url,body):await API.post(url,body);
  if(catFail(r,'Erro ao salvar.'))return;
  closeCatalogItem(); await loadCatalog(); paintCatalog(); toast(id?'Item atualizado.':'Item adicionado.');
}
async function deleteCatalogItem(id){
  if(!confirm('Excluir este item do catálogo?'))return;
  const r=await API.del(`/api/data/products/${encodeURIComponent(catalogState.projectId)}/${encodeURIComponent(id)}`);
  if(catFail(r,'Erro ao excluir.'))return;
  await loadCatalog(); paintCatalog(); toast('Item excluído.');
}

/* ---------- Gerenciador de categorias / subcategorias ---------- */
function openCatalogCategories(){
  closeCatalogManager();
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id='catalog-manager';
  overlay.onclick=e=>{ if(e.target===overlay) closeCatalogManager(); };
  overlay.innerHTML=`<div class="modal universal-modal"><button class="modal-close" onclick="closeCatalogManager()">×</button><h2>Categorias e subcategorias</h2>
    <div class="manager-add"><input id="mgr-cat-name" placeholder="Nome da categoria ou subcategoria" onkeydown="if(event.key==='Enter'){event.preventDefault();addCatalogCategory();}"><select id="mgr-cat-parent"></select><button class="btn btn-primary" onclick="addCatalogCategory()">Adicionar</button></div>
    <div id="mgr-cat-list" class="manager-list"></div><div class="modal-actions"><button class="btn" onclick="closeCatalogManager()">Fechar</button></div></div>`;
  document.body.appendChild(overlay); paintCatalogCategoryManager();
}
function paintCatalogCategoryManager(){
  const sel=$("mgr-cat-parent"), list=$("mgr-cat-list"); if(!sel||!list)return;
  const keep=sel.value;
  sel.innerHTML=`<option value="">Categoria principal</option>${catRoots().map(c=>`<option value="${escapeHtml(c.id)}">Subcategoria de ${escapeHtml(c.name)}</option>`).join('')}`; sel.value=keep||"";
  const count=id=>catalogState.products.filter(p=>p.categoryId===id).length;
  const row=(c,sub)=>`<div class="manager-row ${sub?'is-sub':''}"><span class="manager-name">${sub?'↳ ':''}${escapeHtml(c.name)} <small>${count(c.id)} item(ns)</small></span><span class="manager-actions"><button class="btn btn-sm" onclick="renameCatalogCategory('${escapeHtml(c.id)}')">Renomear</button><button class="btn btn-sm btn-danger" onclick="deleteCatalogCategory('${escapeHtml(c.id)}')">Excluir</button></span></div>`;
  list.innerHTML=catRoots().length?catRoots().map(c=>row(c,false)+catChildren(c.id).map(k=>row(k,true)).join('')).join(''):'<div class="empty-state"><p>Nenhuma categoria ainda. Crie a primeira acima.</p></div>';
}
function closeCatalogManager(){ $('#catalog-manager')?.remove(); }
async function addCatalogCategory(){
  const name=$("mgr-cat-name").value.trim(); if(!name)return toast('Informe o nome.','error');
  const r=await API.post(catUrl("/categories"),{name,parentId:$("mgr-cat-parent").value}); if(catFail(r,'Erro ao criar categoria.'))return;
  $("mgr-cat-name").value=''; await loadCatalog(); paintCatalogCategoryManager(); paintCatalog(); toast('Categoria criada.');
}
async function renameCatalogCategory(id){
  const c=catById(id); if(!c)return; const name=prompt('Novo nome:',c.name); if(name===null||!name.trim())return;
  const r=await API.put(catUrl(`/categories/${encodeURIComponent(id)}`),{name:name.trim(),parentId:c.parentId,description:c.description}); if(catFail(r,'Erro ao renomear.'))return;
  await loadCatalog(); paintCatalogCategoryManager(); paintCatalog();
}
async function deleteCatalogCategory(id){
  const c=catById(id); if(!c)return; const kids=catChildren(id).length;
  if(!confirm(`Excluir "${c.name}"? Os itens ficam sem categoria${kids?' e as subcategorias viram categorias principais':''}.`))return;
  const r=await API.del(catUrl(`/categories/${encodeURIComponent(id)}`)); if(catFail(r,'Erro ao excluir.'))return;
  await loadCatalog(); paintCatalogCategoryManager(); paintCatalog(); toast('Categoria excluída.');
}

/* ---------- Gerenciador de tags ---------- */
function openCatalogTags(){
  closeCatalogTagManager();
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id='catalog-tag-manager';
  overlay.onclick=e=>{ if(e.target===overlay) closeCatalogTagManager(); };
  overlay.innerHTML=`<div class="modal universal-modal"><button class="modal-close" onclick="closeCatalogTagManager()">×</button><h2>Tags</h2>
    <div class="manager-add"><input id="mgr-tag-name" placeholder="Nome da tag" onkeydown="if(event.key==='Enter'){event.preventDefault();addCatalogTag();}"><button class="btn btn-primary" onclick="addCatalogTag()">Adicionar</button></div>
    <div id="mgr-tag-list" class="manager-list"></div><div class="modal-actions"><button class="btn" onclick="closeCatalogTagManager()">Fechar</button></div></div>`;
  document.body.appendChild(overlay); paintCatalogTagManager();
}
function paintCatalogTagManager(){
  const list=$("mgr-tag-list"); if(!list)return;
  const count=id=>catalogState.products.filter(p=>(p.tags||[]).includes(id)).length;
  list.innerHTML=catalogState.tags.length?catalogState.tags.map(t=>`<div class="manager-row"><span class="manager-name">#${escapeHtml(t.name)} <small>${count(t.id)} item(ns)</small></span><span class="manager-actions"><button class="btn btn-sm" onclick="renameCatalogTag('${escapeHtml(t.id)}')">Renomear</button><button class="btn btn-sm btn-danger" onclick="deleteCatalogTag('${escapeHtml(t.id)}')">Excluir</button></span></div>`).join(''):'<div class="empty-state"><p>Nenhuma tag ainda. Crie a primeira acima.</p></div>';
}
function closeCatalogTagManager(){ $('#catalog-tag-manager')?.remove(); }
async function addCatalogTag(){
  const name=$("mgr-tag-name").value.trim(); if(!name)return toast('Informe o nome.','error');
  const r=await API.post(catUrl("/tags"),{name}); if(catFail(r,'Erro ao criar tag.'))return;
  $("mgr-tag-name").value=''; await loadCatalog(); paintCatalogTagManager(); paintCatalog(); toast('Tag criada.');
}
async function renameCatalogTag(id){
  const t=tagById(id); if(!t)return; const name=prompt('Novo nome da tag:',t.name); if(name===null||!name.trim())return;
  const r=await API.put(catUrl(`/tags/${encodeURIComponent(id)}`),{name:name.trim()}); if(catFail(r,'Erro ao renomear.'))return;
  await loadCatalog(); paintCatalogTagManager(); paintCatalog();
}
async function deleteCatalogTag(id){
  const t=tagById(id); if(!t)return; if(!confirm(`Excluir a tag "${t.name}"? Ela será removida dos itens.`))return;
  const r=await API.del(catUrl(`/tags/${encodeURIComponent(id)}`)); if(catFail(r,'Erro ao excluir.'))return;
  await loadCatalog(); paintCatalogTagManager(); paintCatalog(); toast('Tag excluída.');
}

/* ---------- Importar catálogo (JSON) ----------
   Formato: { "categories":[{"name":"TV Box","parent":""}], "products":[{ name, category, subcategory?, price, originalPrice, sku, shortDescription, description, images[], variations[], tags[], featured, promotion, weight, stock }] } */
async function importCatalogJson(input){
  const file=input.files&&input.files[0]; input.value=''; if(!file)return;
  let data; try{ data=JSON.parse(await file.text()); }catch{ return toast('Arquivo JSON inválido.','error'); }
  const products=Array.isArray(data)?data:(data.products||[]); if(!products.length) return toast('Nenhum produto no arquivo.','error');
  if(!confirm(`Importar ${products.length} item(ns) para este projeto?`))return;
  const catIds={}; const key=(n,p='')=>`${p}::${String(n).trim().toLowerCase()}`;
  catalogState.categories.forEach(c=>{ catIds[key(c.name,c.parentId||'')]=c.id; });
  const ensureCat=async(name,parentId='')=>{ if(!name)return ''; const k=key(name,parentId); if(catIds[k])return catIds[k];
    const r=await API.post(catUrl('/categories'),{name,parentId}); if(r?.category){ catIds[k]=r.category.id; return r.category.id; } return ''; };
  const tagIds={}; catalogState.tags.forEach(t=>{ tagIds[t.name.toLowerCase()]=t.id; });
  let ok=0, fail=0;
  for(const p of products){
    try{
      const parent=await ensureCat(p.category||''); const cid=p.subcategory?await ensureCat(p.subcategory,parent):parent;
      const tagList=[]; for(const t of (p.tags||[])){ const k=String(t).toLowerCase(); if(!tagIds[k]){ const r=await API.post(catUrl('/tags'),{name:t}); if(r?.tag) tagIds[k]=r.tag.id; } if(tagIds[k]) tagList.push(tagIds[k]); }
      const images=p.images||(p.image?[p.image]:[]);
      const body={name:p.name,shortDescription:p.shortDescription||'',description:p.description||'',itemType:'product',price:p.price??null,originalPrice:p.originalPrice??null,sku:p.sku||'',weight:p.weight??0,categoryId:cid,tags:tagList,images,image:images[0]||'',variations:p.variations||[],featured:!!p.featured,promotion:!!p.promotion,status:'active',trackStock:p.stock!=null,stock:p.stock||0};
      const r=await API.post(`/api/data/products/${encodeURIComponent(catalogState.projectId)}`,body); (r?.error||r?.success===false)?fail++:ok++;
    }catch{ fail++; }
  }
  await loadCatalog(); paintCatalog(); toast(`Importação concluída: ${ok} item(ns)${fail?`, ${fail} com erro`:''}.`, fail?'error':undefined);
}

Object.assign(window,{importCatalogJson,addCatalogVariation,removeCatalogVariation,renderCatalogSection,paintCatalog,openCatalogItem,closeCatalogItem,saveCatalogItem,deleteCatalogItem,setCatalogCategory,toggleVitrine,toggleCatalogEditTag,addCatalogTagFromInput,openCatalogCategories,closeCatalogManager,addCatalogCategory,renameCatalogCategory,deleteCatalogCategory,openCatalogTags,closeCatalogTagManager,addCatalogTag,renameCatalogTag,deleteCatalogTag});
