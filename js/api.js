/* V8 ADMIN — API client */
const API_BASE = "https://v8adminuniversal.aisermelk.workers.dev";

async function requestApi(path, options = {}, isPublic = false) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body !== undefined) headers.set("Content-Type", "application/json");

  if (!isPublic) {
    const token = window.Auth?.getToken?.() || "";
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    return { error: true, message: "Não foi possível conectar ao servidor." };
  }

  let data;
  try { data = await response.json(); }
  catch { data = { error: true, message: "Resposta inválida do servidor." }; }

  if (response.status === 401 && !isPublic) {
    window.Auth?.clearSession?.();
    if (!location.pathname.endsWith("login.html") && !window.__v8Redirecting) {
      window.__v8Redirecting = true;
      location.href = "login.html";
    }
  }

  return data;
}

const API = {
  get: path => requestApi(path),
  post: (path, body = {}) => requestApi(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body = {}) => requestApi(path, { method: "PUT", body: JSON.stringify(body) }),
  del: path => requestApi(path, { method: "DELETE" }),
  getPublic: path => requestApi(path, {}, true),
  postPublic: (path, body = {}) => requestApi(path, { method: "POST", body: JSON.stringify(body) }, true),
  putPublic: (path, body = {}) => requestApi(path, { method: "PUT", body: JSON.stringify(body) }, true),
  API_BASE
};
