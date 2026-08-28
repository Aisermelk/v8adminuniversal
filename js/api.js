```javascript
// ============================================================
// V8 ADMIN — UNIVERSAL
// Cliente de API
// ============================================================

const API_URL = "https://v8adminuniversal.aisermelk.workers.dev";

const API = {

  // ==========================================================
  // REQUEST PRINCIPAL
  // ==========================================================

  async request(path, method = "GET", body = null, useAuth = true) {

    const url = `${API_URL}${path}`;

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json"
    };

    // --------------------------------------------------------
    // TOKEN
    // --------------------------------------------------------

    if (useAuth) {

      const token =
        localStorage.getItem("v8_admin_token");

      if (token) {
        headers["Authorization"] =
          `Bearer ${token}`;
      }
    }

    const config = {
      method,
      headers
    };

    if (body !== null) {
      config.body =
        JSON.stringify(body);
    }

    console.log("🌐 API REQUEST:", {
      method,
      url,
      authenticated: useAuth
    });

    // ========================================================
    // FETCH
    // ========================================================

    let response;

    try {

      response =
        await fetch(url, config);

    } catch (error) {

      console.error(
        "❌ ERRO DE CONEXÃO COM A API:",
        error
      );

      return {
        error: true,
        message:
          "Não foi possível conectar ao servidor."
      };
    }

    // ========================================================
    // RESPOSTA
    // ========================================================

    let rawText = "";

    try {

      rawText =
        await response.text();

    } catch (error) {

      console.error(
        "❌ ERRO AO LER RESPOSTA:",
        error
      );

      return {
        error: true,
        message:
          "Não foi possível ler a resposta do servidor."
      };
    }

    console.log("📡 API RESPONSE:", {
      status: response.status,
      statusText: response.statusText,
      url,
      body: rawText
    });

    // ========================================================
    // TENTA JSON
    // ========================================================

    let data = {};

    if (rawText.trim()) {

      try {

        data =
          JSON.parse(rawText);

      } catch (error) {

        console.error(
          "❌ API NÃO RETORNOU JSON:",
          {
            status: response.status,
            url,
            response: rawText
          }
        );

        return {
          error: true,
          status: response.status,
          message:
            `A API retornou uma resposta inválida (HTTP ${response.status}).`,
          raw: rawText
        };
      }
    }

    // ========================================================
    // 401 — NÃO AUTORIZADO
    // ========================================================

    if (
      response.status === 401 &&
      useAuth
    ) {

      console.warn(
        "🔐 Sessão inválida ou expirada."
      );

      localStorage.removeItem(
        "v8_admin_token"
      );

      if (
        typeof Auth !== "undefined" &&
        typeof Auth.logout === "function"
      ) {
        Auth.logout();
      }

      return {
        error: true,
        status: 401,
        message:
          data?.message ||
          "Sessão expirada. Faça login novamente."
      };
    }

    // ========================================================
    // ERROS HTTP
    // ========================================================

    if (!response.ok) {

      console.error(
        "❌ ERRO HTTP DA API:",
        {
          status: response.status,
          statusText: response.statusText,
          url,
          data
        }
      );

      return {
        error: true,
        status: response.status,
        message:
          data?.message ||
          data?.error ||
          `Erro da API (HTTP ${response.status}).`
      };
    }

    // ========================================================
    // SUCESSO
    // ========================================================

    console.log(
      "✅ API OK:",
      path
    );

    return data;
  },

  // ==========================================================
  // GET
  // ==========================================================

  get(path) {
    return this.request(
      path,
      "GET",
      null,
      true
    );
  },

  // ==========================================================
  // POST
  // ==========================================================

  post(path, body = null) {
    return this.request(
      path,
      "POST",
      body,
      true
    );
  },

  // ==========================================================
  // PUT
  // ==========================================================

  put(path, body = null) {
    return this.request(
      path,
      "PUT",
      body,
      true
    );
  },

  // ==========================================================
  // DELETE
  // ==========================================================

  del(path) {
    return this.request(
      path,
      "DELETE",
      null,
      true
    );
  },

  // ==========================================================
  // GET PÚBLICO
  // ==========================================================

  getPublic(path) {
    return this.request(
      path,
      "GET",
      null,
      false
    );
  },

  // ==========================================================
  // POST PÚBLICO
  // ==========================================================

  postPublic(path, body = null) {
    return this.request(
      path,
      "POST",
      body,
      false
    );
  },

  // ==========================================================
  // PUT PÚBLICO
  // ==========================================================

  putPublic(path, body = null) {
    return this.request(
      path,
      "PUT",
      body,
      false
    );
  }
};


// ============================================================
// TESTE RÁPIDO
// ============================================================

console.log(
  "🚀 V8 ADMIN API carregada:",
  API_URL
);
```
