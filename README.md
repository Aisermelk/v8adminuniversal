# V8 ADMIN — Universal

Painel administrativo reutilizável (Cloudflare Worker + KV) para gerenciar
múltiplos projetos/sites: clientes, projetos, rastreamento (Pixel/Tag/GA),
contato, redes sociais, Formspree, leads e acesso de edição para clientes
via link mágico.

**Worker em produção:** `v8adminuniversal`
**URL da API:** `https://v8adminuniversal.aisermelk.workers.dev`
**Deploy:** automático via repositório GitHub conectado à Cloudflare
(Workers Builds) — não é feito por `wrangler deploy` manual.

## 1. Como o deploy funciona aqui

Toda vez que você dá `git push` na branch `main`, a Cloudflare builda e
publica o Worker sozinha, lendo o `worker/wrangler.toml`. Configuração
necessária (feita uma única vez, em **Workers & Pages → v8adminuniversal
→ Settings → Build**):

| Campo | Valor |
|---|---|
| Diretório raiz | `worker` |
| Comando da build | *(nenhum)* |
| Comando de implantação | `npx wrangler deploy` |
| Ramificação de produção | `main` |

⚠️ **Ponto crítico**: o "Diretório raiz" precisa ser `worker`, porque é lá
que fica o `wrangler.toml`. Se ficar `/` (raiz do repositório), a Cloudflare
não encontra o arquivo de configuração e publica o Worker **sem o binding
do KV** — foi exatamente isso que já aconteceu uma vez neste projeto.

## 2. Secrets (variáveis sensíveis)

Não ficam no `wrangler.toml` nem no código. Configure uma vez em
**Settings → Variáveis e segredos** (ou via `wrangler secret put` se algum
dia publicar manualmente):

- `ADMIN_EMAIL` — e-mail de login do painel
- `ADMIN_PASS` — senha de login do painel
- `TOKEN_SECRET` — string longa e aleatória (ex: gerada com `openssl rand -hex 32`), usada para assinar os tokens

## 3. KV Namespace

Binding `V8_KV`, já declarado em `worker/wrangler.toml` com o `id` do
namespace de produção. Se ele algum dia sumir de **Settings → Associações**
(o que só deve acontecer se o "Diretório raiz" for alterado por engano):

1. Vá em Associações → Adicionar → KV Namespace
2. Nome da variável: `V8_KV` (exatamente assim)
3. Selecione o namespace **existente** (não crie um novo — os dados
   salvos ficariam órfãos)
4. Salve

## 4. Frontend

`API_URL` em `js/api.js` já aponta para a URL de produção do Worker.
Publique a pasta raiz (fora de `worker/`) — `index.html`, `login.html`,
`editar.html`, `css/`, `js/`, `assets/` — onde você já estiver hospedando
o site do painel.

## 5. Primeiro acesso

Acesse `login.html` com o e-mail/senha definidos nos secrets. Depois,
cadastre projetos em "Projetos" e clientes em "Clientes".

## 6. Consumir a config no site final de um projeto

```js
fetch("https://v8adminuniversal.aisermelk.workers.dev/api/public/config/SEU_PROJECT_ID")
  .then(r => r.json())
  .then(config => {
    // config.tracking.pixel / .tag / .analytics
    // config.contact.whatsapp / .email / .phone
    // config.social.facebook / .instagram / .tiktok / .youtube / .linkedin
    // config.formspree
  });
```

`SEU_PROJECT_ID` é o `id` do projeto (visível pela API autenticada
`GET /api/data/projects`, ou pela URL do link de cliente gerado no painel).

## 7. Enviar leads do formulário do site para o painel

```js
fetch("https://v8adminuniversal.aisermelk.workers.dev/api/public/leads/SEU_PROJECT_ID", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, message }),
});
```

Isso salva a mensagem no KV (visível no Dashboard e na aba "Leads" do
projeto), além do envio normal via Formspree.

## 8. Dar acesso de edição a um cliente

No painel: projeto → aba "Acesso do cliente" → marque os campos liberados
→ "Gerar link do cliente". O link só é mostrado uma vez (o token assinado
não fica salvo, só o registro de permissões) — copie e envie na hora. Para
revogar, use o botão "Revogar" na mesma aba, a qualquer momento.

## 9. Diagnóstico rápido

- `GET /` e `GET /api/health` respondem sem autenticação e mostram se o
  Worker está online, se o `V8_KV` está conectado (`kv: true/false`) e se
  os três secrets estão configurados — útil pra depurar sem precisar
  logar no painel.

## Segurança

- Senha de admin só existe como secret do Worker, nunca no código.
- Login com limite de 5 tentativas a cada 15 minutos por IP.
- Tokens assinados com HMAC-SHA256, verificados via `crypto.subtle.verify`
  e com expiração checada a cada requisição.
- Links de cliente têm escopo embutido (projeto + campos liberados) e são
  revogáveis a qualquer momento, mesmo antes de expirar.
