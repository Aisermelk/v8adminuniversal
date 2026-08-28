// ============================================================
// V8 ADMIN — UNIVERSAL
// Cliente de API
// ============================================================

const API_URL =
  "https://v8adminuniversal.aisermelk.workers.dev";

const API = {

  async request(
    path,
    method = "GET",
    body = null,
    useAuth = true
  ) {

    const url = `${API_URL}${path}`;

    const headers = {
      "Accept": "application/json"
    };

    // --------------------------------------------------------
    // AUTENTICAÇÃO
    // --------------------------------------------------------

    if (useAuth) {

      const token =
        localStorage.getItem("v8_admin_token");

      if (token) {
        headers["Authorization"] =
          `Bearer ${token}`;
      }
    }

    // --------------------------------------------------------
    // CONFIGURAÇÃO
    // --------------------------------------------------------

    const config = {
      method,
      headers
    };

    if (body !== null) {

      headers["Content-Type"] =
        "application/json";

      config.body =
        JSON.stringify(body);
    }

    console.log(
      "🌐 V8 API:",
      method,
      url
    );

    // --------------------------------------------------------
    // FETCH
    // --------------------------------------------------------

    let response;

    try {

      response =
        await fetch(url, config);

    } catch (error) {

      console.error(
        "❌ Falha de conexão:",
        error
      );

      return {
        error: true,
        status: 0,
        message:
          "Não foi possível conectar ao servidor."
      };
    }

    // --------------------------------------------------------
    // RESPOSTA
    // --------------------------------------------------------

    const rawText =
      await response.text();

    console.log(
      "📡 V8 API RESPONSE:",
      response.status,
      rawText
    );

    let data = {};

    if (rawText.trim()) {

      try {

        data =
          JSON.parse(rawText);

      } catch {

        return {
          error: true,
          status: response.status,
          message:
            `Resposta inválida da API (HTTP ${response.status}).`,
          raw: rawText
        };
      }
    }

    // --------------------------------------------------------
    // NÃO AUTORIZADO
    // --------------------------------------------------------

    if (
      response.status === 401 &&
      useAuth
    ) {

      localStorage.removeItem(
        "v8_admin_token"
      );

      localStorage.removeItem(
        "v8_admin_token_expires"
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
          "Sessão expirada."
      };
    }

    // --------------------------------------------------------
    // ERRO HTTP
    // --------------------------------------------------------

    if (!response.ok) {

      console.error(
        "❌ API ERROR:",
        {
          status: response.status,
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

    // --------------------------------------------------------
    // SUCESSO
    // --------------------------------------------------------

    return data;
  },

  get(path) {
    return this.request(
      path,
      "GET",
      null,
      true
    );
  },

  post(path, body) {
    return this.request(
      path,
      "POST",
      body,
      true
    );
  },

  put(path, body) {
    return this.request(
      path,
      "PUT",
      body,
      true
    );
  },

  del(path) {
    return this.request(
      path,
      "DELETE",
      null,
      true
    );
  },

  getPublic(path) {
    return this.request(
      path,
      "GET",
      null,
      false
    );
  },

  postPublic(path, body) {
    return this.request(
      path,
      "POST",
      body,
      false
    );
  },

  putPublic(path, body) {
    return this.request(
      path,
      "PUT",
      body,
      false
    );
  }
};

console.log(
  "🚀 V8 ADMIN API carregada:",
  API_URL
);
