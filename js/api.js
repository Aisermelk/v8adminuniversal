// V8 ADMIN — Universal | Cliente de API
// Ajuste API_URL depois de publicar o Worker (`wrangler deploy`).
const API_URL = "https://v8-admin-universal.SEU-SUBDOMINIO.workers.dev";

const API = {
  async request(path, method = "GET", body = null, useAuth = true) {
    const headers = { "Content-Type": "application/json" };
    if (useAuth) {
      const token = localStorage.getItem("v8_admin_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(`${API_URL}${path}`, config);
    } catch (err) {
      return { error: true, message: "Não foi possível conectar à API." };
    }

    if (response.status === 401 && useAuth) {
      Auth.logout();
      return { error: true, message: "Sessão expirada." };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: true, message: "Resposta inválida da API." };
    }
    return data;
  },

  get(path) { return this.request(path, "GET"); },
  post(path, body) { return this.request(path, "POST", body); },
  put(path, body) { return this.request(path, "PUT", body); },
  del(path) { return this.request(path, "DELETE"); },

  // chamadas públicas (sem token) — usadas em login.html e editar.html
  getPublic(path) { return this.request(path, "GET", null, false); },
  postPublic(path, body) { return this.request(path, "POST", body, false); },
  putPublic(path, body) { return this.request(path, "PUT", body, false); },
};
