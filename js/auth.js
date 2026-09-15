/* V8 ADMIN UNIVERSAL — autenticação universal ADMIN / CLIENTE */
const Auth = {
  TOKEN_KEY: "v8_auth_token",
  EXPIRES_KEY: "v8_auth_expires",
  USER_KEY: "v8_auth_user",
  _validationPromise: null,

  saveSession(token, expiresAt, user = null) {
    localStorage.setItem(this.TOKEN_KEY, token || "");
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
    // Esta função é apenas uma checagem local rápida.
    // A validade real é confirmada pelo Worker em validateSession().
    return Boolean(token) && (!expires || Date.now() < expires);
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXPIRES_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  logout() {
    this.clearSession();
    window.location.replace("login.html");
  },

  /**
   * Confirma a sessão no servidor. Isso evita o estado em que o navegador
   * acredita que o token ainda é válido, mas o Worker já o rejeita (401).
   * Não usa API.get() de propósito: uma sessão inválida não deve provocar
   * redirecionamento automático durante a própria validação.
   */
  async validateSession() {
    if (this._validationPromise) return this._validationPromise;

    this._validationPromise = (async () => {
      const token = this.getToken();
      if (!token) return null;

      const expires = Number(localStorage.getItem(this.EXPIRES_KEY) || 0);
      if (expires && Date.now() >= expires) {
        this.clearSession();
        return null;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });

        let data = null;
        try { data = await response.json(); } catch { data = null; }

        if (!response.ok || !data || data.error || !data.user) {
          this.clearSession();
          return null;
        }

        // Atualiza somente os dados confiáveis do usuário retornados pelo Worker.
        localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
        return {
          user: data.user,
          permissions: Array.isArray(data.permissions) ? data.permissions : []
        };
      } catch (error) {
        console.error("Erro ao validar sessão:", error);
        // Falha de rede não deve apagar uma sessão válida. O carregamento
        // das APIs tratará a indisponibilidade do servidor normalmente.
        return null;
      } finally {
        this._validationPromise = null;
      }
    })();

    return this._validationPromise;
  },

  async requireAdmin() {
    const session = await this.validateSession();
    if (!session) {
      if (!location.pathname.endsWith("login.html")) {
        window.location.replace("login.html");
      }
      return false;
    }

    if (session.user?.role === "CLIENTE") {
      if (!location.pathname.endsWith("cliente.html")) {
        window.location.replace("cliente.html");
      }
      return false;
    }

    return true;
  },

  async requireClient() {
    const session = await this.validateSession();
    if (!session) {
      if (!location.pathname.endsWith("login.html")) {
        window.location.replace("login.html");
      }
      return false;
    }

    if (session.user?.role === "ADMIN") {
      if (!location.pathname.endsWith("index.html")) {
        window.location.replace("index.html");
      }
      return false;
    }

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
    window.location.replace(res.user?.role === "CLIENTE" ? "cliente.html" : "index.html");
  } catch {
    errorBox.textContent = "Não foi possível conectar ao servidor.";
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  if (!form) return;

  // Nunca redirecionar apenas porque existe um token no LocalStorage.
  // Primeiro confirme esse token no Worker. Isso elimina o loop:
  // login.html -> index.html -> 401 -> login.html -> ...
  if (Auth.getToken()) {
    const session = await Auth.validateSession();
    if (session?.user) {
      window.location.replace(session.user.role === "CLIENTE" ? "cliente.html" : "index.html");
      return;
    }
  }

  form.addEventListener("submit", handleLoginSubmit);
});
