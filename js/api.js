// V8 ADMIN — Universal | Cliente de API

const API_URL = "https://v8adminuniversal.aisermelk.workers.dev";

const API = {

  async request(path, method = "GET", body = null, useAuth = true) {

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    if (useAuth) {
      const token = localStorage.getItem("v8_admin_token");

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const config = {
      method,
      headers
    };

    if (body !== null) {
      config.body = JSON.stringify(body);
    }

    let response;

    try {
      response = await fetch(`${API_URL}${path}`, config);
    } catch (err) {

      console.error("Erro de conexão:", err);

      return {
        error: true,
        message: "Não foi possível conectar à API."
      };
    }

    /*
     * Sessão expirada
     */
    if (response.status === 401 && useAuth) {

      if (typeof Auth !== "undefined") {
        Auth.logout();
      }

      return {
        error: true,
        message: "Sessão expirada."
      };
    }

    /*
     * Lê a resposta como texto primeiro.
     * Isso evita o erro "Resposta inválida da API"
     * quando o Worker retorna HTML ou texto.
     */

    let rawText = "";

    try {
      rawText = await response.text();
    } catch (err) {

      console.error("Erro ao ler resposta:", err);

      return {
        error: true,
        message: "Não foi possível ler a resposta da API."
      };
    }

    /*
     * Tenta converter para JSON
     */

    let data;

    try {

      data = rawText ? JSON.parse(rawText) : {};

    } catch (err) {

      console.error("Resposta não JSON da API:", {
        status: response.status,
        statusText: response.statusText,
        path,
        response: rawText
      });

      return {
        error: true,
        message:
          `A API retornou uma resposta inválida (HTTP ${response.status}).`
      };
    }

    /*
     * Erro HTTP
     */

    if (!response.ok) {

      console.error("Erro HTTP da API:", {
        status: response.status,
        path,
        data
      });

      return {
        error: true,
        message:
          data?.message ||
          data?.error ||
          `Erro da API (HTTP ${response.status}).`
      };
    }

    return data;
  },

  get(path) {
    return this.request(path, "GET");
  },

  post(path, body) {
    return this.request(path, "POST", body);
  },

  put(path, body) {
    return this.request(path, "PUT", body);
  },

  del(path) {
    return this.request(path, "DELETE");
  },

  getPublic(path) {
    return this.request(path, "GET", null, false);
  },

  postPublic(path, body) {
    return this.request(path, "POST", body, false);
  },

  putPublic(path, body) {
    return this.request(path, "PUT", body, false);
  }
};
