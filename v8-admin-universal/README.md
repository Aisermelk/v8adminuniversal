# V8 ADMIN — Universal

Painel administrativo reutilizável (Cloudflare Worker + KV) para gerenciar
múltiplos projetos/sites: clientes, projetos, rastreamento (Pixel/Tag/GA),
contato, redes sociais, Formspree, leads e acesso de edição para clientes
via link mágico.

## 1. Publicar o Worker (backend)

```bash
cd worker
npm install -g wrangler   # se ainda não tiver
wrangler login

# Criar o KV Namespace
wrangler kv namespace create V8_KV
# Copie o "id" retornado e cole em wrangler.toml, no lugar de
# "COLE_AQUI_O_ID_DO_KV_NAMESPACE"

# Configurar os secrets (vai pedir pra digitar o valor de cada um)
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASS
wrangler secret put TOKEN_SECRET   # use uma string longa e aleatória, ex: openssl rand -hex 32

# Publicar
wrangler deploy
```

Ao final, a Cloudflare mostra a URL do Worker, algo como:
`https://v8-admin-universal.SEU-SUBDOMINIO.workers.dev`

## 2. Configurar o frontend

Abra `js/api.js` e troque a primeira linha pela URL real do seu Worker:

```js
const API_URL = "https://v8-admin-universal.SEU-SUBDOMINIO.workers.dev";
```

## 3. Publicar o frontend

Suba a pasta raiz (fora de `worker/`) no GitHub Pages, Cloudflare Pages,
Netlify ou onde preferir. Arquivos: `index.html`, `login.html`, `editar.html`,
`css/`, `js/`, `assets/`.

## 4. Primeiro acesso

Acesse `login.html` com o e-mail/senha que você definiu nos secrets
(`ADMIN_EMAIL` / `ADMIN_PASS`). Depois disso, cadastre seus projetos em
"Projetos" e clientes em "Clientes".

## 5. Consumir a config no site final de um projeto

Em qualquer site que você gerencie por aqui, busque a config pública assim:

```js
fetch("https://v8-admin-universal.SEU-SUBDOMINIO.workers.dev/api/public/config/SEU_PROJECT_ID")
  .then(r => r.json())
  .then(config => {
    // config.tracking.pixel / config.tracking.analytics / config.tracking.tag
    // config.contact.whatsapp / .email / .phone
    // config.social.facebook / .instagram / .tiktok / .youtube / .linkedin
    // config.formspree
  });
```

O `SEU_PROJECT_ID` é o `id` do projeto, visível pela URL do link do cliente
gerado no painel, ou pela API (`GET /api/data/projects`, autenticado).

## 6. Enviar leads do formulário do site para o painel

Além de enviar para o Formspree normalmente, dispare também:

```js
fetch("https://v8-admin-universal.SEU-SUBDOMINIO.workers.dev/api/public/leads/SEU_PROJECT_ID", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, message }),
});
```

Assim a mensagem aparece também no painel (Dashboard e na aba "Leads" do
projeto), além de cair no seu e-mail via Formspree.

## 7. Dar acesso de edição a um cliente

No painel, abra o projeto → aba "Acesso do cliente" → marque os campos que
ele pode editar → "Gerar link do cliente". Copie o link gerado (só aparece
uma vez) e envie para o cliente. Ele acessa `editar.html?token=...` e edita
só o que foi liberado. Você pode revogar o acesso a qualquer momento na
mesma aba.

## Observações de segurança

- A senha de admin nunca fica no código — só existe como secret do Worker.
- O login tem limite de 5 tentativas a cada 15 minutos por IP.
- Tokens são assinados (HMAC-SHA256) e validados no backend a cada
  requisição (assinatura + expiração).
- Links de cliente têm escopo embutido (projeto + campos) e podem ser
  revogados a qualquer momento, mesmo antes de expirar.
