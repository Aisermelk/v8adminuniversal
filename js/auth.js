// V8 ADMIN — Universal | Autenticação do admin
const Auth = {
  TOKEN_KEY: "v8_admin_token",
  EXPIRES_KEY: "v8_admin_token_expires",

  saveSession(token, expiresAt) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.EXPIRES_KEY, String(expiresAt));
  },

  isLoggedIn() {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const expires = Number(localStorage.getItem(this.EXPIRES_KEY) || 0);
    // Checagem só de UX (evita flash de tela protegida); a validação real
    // de assinatura + expiração acontece sempre no Worker a cada requisição.
    return Boolean(token) && Date.now() < expires;
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXPIRES_KEY);
    window.location.href = "login.html";
  },

  requireAuth() {
    if (!this.isLoggedIn()) window.location.href = "login.html";
  },
};

// ---- lógica exclusiva da página login.html ----
async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorBox = document.getElementById("auth-error");
  const submitBtn = document.getElementById("login-submit");

  errorBox.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando...";

  const res = await API.postPublic("/api/login", { email, password });

  submitBtn.disabled = false;
  submitBtn.textContent = "Entrar";

  if (res.error || !res.token) {
    errorBox.textContent = res.message || "Não foi possível entrar.";
    errorBox.classList.remove("hidden");
    return;
  }

  Auth.saveSession(res.token, res.expiresAt);
  window.location.href = "index.html";
}
