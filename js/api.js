// ================================================================
// V8 ADMIN — Universal | Cliente de API
// ================================================================

const API_URL =
  "https://v8adminuniversal.aisermelk.workers.dev";

const API = {

  // ==============================================================
  // REQUEST
  // ==============================================================

  async request(
    path,
    method = "GET",
    body = null,
    useAuth = true
  ) {

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    // ------------------------------------------------------------
    // AUTENTICAÇÃO
    // ------------------------------------------------------------

    if (useAuth) {

      const token =
        localStorage.getItem(
          "v8_admin_token"
        );

      if (token) {

        headers["Authorization"] =
          `Bearer ${token}`;

      }

    }

    const config = {
      method,
      headers
    };

    // ------------------------------------------------------------
    // BODY
    // ------------------------------------------------------------

    if (body !== null) {

      config.body =
        JSON.stringify(body);

    }

    let response;

    // ------------------------------------------------------------
    // CONEXÃO COM A API
    // ------------------------------------------------------------

    try {

      response =
        await fetch(
          `${API_URL}${path}`,
          config
        );

    } catch (err) {

      console.error(
        "Erro de conexão com a API:",
        err
      );

      return {
        error: true,
        message:
          "Não foi possível conectar à API."
      };

    }

    // ------------------------------------------------------------
    // SESSÃO EXPIRADA
    // ------------------------------------------------------------

    if (
      response.status === 401 &&
      useAuth
    ) {

      console.warn(
        "Sessão expirada."
      );

      if (
        typeof Auth !== "undefined" &&
        Auth &&
        typeof Auth.logout === "function"
      ) {

        Auth.logout();

      }

      return {
        error: true,
        message:
          "Sessão expirada."
      };

    }

    // ------------------------------------------------------------
    // LER RESPOSTA COMO TEXTO
    //
    // Fazemos isso antes do JSON.parse para evitar problemas
    // quando o Worker retorna HTML, texto vazio ou outra resposta.
    // ------------------------------------------------------------

    let rawText = "";

    try {

      rawText =
        await response.text();

    } catch (err) {

      console.error(
        "Erro ao ler resposta da API:",
        err
      );

      return {
        error: true,
        message:
          "Não foi possível ler a resposta da API."
      };

    }

    // ------------------------------------------------------------
    // CONVERTER PARA JSON
    // ------------------------------------------------------------

    let data;

    try {

      data =
        rawText
          ? JSON.parse(rawText)
          : {};

    } catch (err) {

      console.error(
        "Resposta não JSON da API:",
        {
          status:
            response.status,

          statusText:
            response.statusText,

          path,

          response:
            rawText
        }
      );

      return {
        error: true,
        message:
          `A API retornou uma resposta inválida (HTTP ${response.status}).`
      };

    }

    // ------------------------------------------------------------
    // ERROS HTTP
    // ------------------------------------------------------------

    if (!response.ok) {

      console.error(
        "Erro HTTP da API:",
        {
          status:
            response.status,

          path,

          data
        }
      );

      return {
        error: true,

        message:
          data?.message ||
          data?.error ||
          `Erro da API (HTTP ${response.status}).`
      };

    }

    // ------------------------------------------------------------
    // SUCESSO
    // ------------------------------------------------------------

    return data;

  },


  // ==============================================================
  // GET AUTENTICADO
  // ==============================================================

  get(path) {

    return this.request(
      path,
      "GET",
      null,
      true
    );

  },


  // ==============================================================
  // POST AUTENTICADO
  // ==============================================================

  post(path, body) {

    return this.request(
      path,
      "POST",
      body,
      true
    );

  },


  // ==============================================================
  // PUT AUTENTICADO
  // ==============================================================

  put(path, body) {

    return this.request(
      path,
      "PUT",
      body,
      true
    );

  },


  // ==============================================================
  // DELETE AUTENTICADO
  // ==============================================================

  del(path) {

    return this.request(
      path,
      "DELETE",
      null,
      true
    );

  },


  // ==============================================================
  // GET PÚBLICO
  //
  // Não envia o token de administrador.
  // Usado, por exemplo, pelo login.
  // ==============================================================

  getPublic(path) {

    return this.request(
      path,
      "GET",
      null,
      false
    );

  },


  // ==============================================================
  // POST PÚBLICO
  //
  // Usado principalmente pelo /api/login.
  // ==============================================================

  postPublic(path, body) {

    return this.request(
      path,
      "POST",
      body,
      false
    );

  },


  // ==============================================================
  // PUT PÚBLICO
  // ==============================================================

  putPublic(path, body) {

    return this.request(
      path,
      "PUT",
      body,
      false
    );

  },


  // ==============================================================
  // DELETE PÚBLICO
  // ==============================================================

  delPublic(path) {

    return this.request(
      path,
      "DELETE",
      null,
      false
    );

  }

};
