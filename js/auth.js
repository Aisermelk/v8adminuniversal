/* V8 ADMIN UNIVERSAL — autenticação universal ADMIN / CLIENTE */
const Auth = {
  TOKEN_KEY: "v8_auth_token",
  EXPIRES_KEY: "v8_auth_expires",
  USER_KEY: "v8_auth_user",

  saveSession(token, expiresAt, user = null) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.EXPIRES_KEY, String(expiresAt || 0));
    if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  getToken() { return localStorage.getItem(this.TOKEN_KEY) || ""; },
  getUser() {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY) || "null"); }
    catch { return null; }
  },
  isLoggedIn() {
    const token = this.getToken();
    const expires = Number(localStorage.getItem(this.EXPIRES_KEY) || 0);
    return Boolean(token) && Date.now() < expires;
  },
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXPIRES_KEY);
    localStorage.removeItem(this.USER_KEY);
  },
  logout() { this.clearSession(); window.location.href = "login.html"; },

  requireAdmin() {
    if (!this.isLoggedIn()) { window.location.href = "login.html"; return false; }
    const user = this.getUser();
    if (user?.role === "CLIENTE") { window.location.href = "cliente.html"; return false; }
    return true;
  },

  requireClient() {
    if (!this.isLoggedIn()) { window.location.href = "login.html"; return false; }
    const user = this.getUser();
    if (user?.role === "ADMIN") { window.location.href = "index.html"; return false; }
    return true;
  }
};

async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorBox = document.getElementById("auth-error");
  const submitBtn = document.getElementById("login-submit");
  if (!emailInput || !passwordInput || !errorBox || !submitBtn) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  errorBox.textContent = "";
  errorBox.classList.add("hidden");

  if (!email) { errorBox.textContent = "Informe seu e-mail."; errorBox.classList.remove("hidden"); emailInput.focus(); return; }
  if (!password) { errorBox.textContent = "Informe sua senha."; errorBox.classList.remove("hidden"); passwordInput.focus(); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando...";
  try {
    const res = await API.postPublic("/api/login", { email, password });
    if (!res || res.error || !res.token) {
      errorBox.textContent = res?.message || "E-mail ou senha inválidos.";
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrar";
      return;
    }
    Auth.saveSession(res.token, Number(res.expiresAt || 0), res.user || null);
    window.location.href = res.user?.role === "CLIENTE" ? "cliente.html" : "index.html";
  } catch {
    errorBox.textContent = "Não foi possível conectar ao servidor.";
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  if (form) {
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      window.location.href = user?.role === "CLIENTE" ? "cliente.html" : "index.html";
      return;
    }
    form.addEventListener("submit", handleLoginSubmit);
  }
});
