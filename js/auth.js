// ============================================================
// V8 ADMIN — UNIVERSAL
// AUTENTICAÇÃO
// ============================================================

const Auth = {

  TOKEN_KEY: "v8_admin_token",
  EXPIRES_KEY: "v8_admin_token_expires",

  // ==========================================================
  // SALVAR SESSÃO
  // ==========================================================

  saveSession(token, expiresAt) {

    if (!token) {
      console.error("❌ Token vazio.");
      return false;
    }

    localStorage.setItem(
      this.TOKEN_KEY,
      token
    );

    localStorage.setItem(
      this.EXPIRES_KEY,
      String(expiresAt || 0)
    );

    console.log("✅ Sessão salva.");

    return true;
  },

  // ==========================================================
  // TOKEN
  // ==========================================================

  getToken() {
    return localStorage.getItem(
      this.TOKEN_KEY
    );
  },

  // ==========================================================
  // VERIFICAR LOGIN
  // ==========================================================

  isLoggedIn() {

    const token =
      localStorage.getItem(
        this.TOKEN_KEY
      );

    const expires =
      Number(
        localStorage.getItem(
          this.EXPIRES_KEY
        ) || 0
      );

    if (!token) {
      return false;
    }

    if (!expires) {
      return false;
    }

    if (Date.now() >= expires) {

      console.warn(
        "⚠️ Sessão expirada."
      );

      this.clearSession();

      return false;
    }

    return true;
  },

  // ==========================================================
  // LIMPAR SESSÃO
  // ==========================================================

  clearSession() {

    localStorage.removeItem(
      this.TOKEN_KEY
    );

    localStorage.removeItem(
      this.EXPIRES_KEY
    );
  },

  // ==========================================================
  // LOGOUT
  // ==========================================================

  logout() {

    console.log(
      "🚪 Encerrando sessão..."
    );

    this.clearSession();

    window.location.href =
      "login.html";
  },

  // ==========================================================
  // PROTEGER PÁGINA
  // ==========================================================

  requireAuth() {

    if (!this.isLoggedIn()) {

      console.warn(
        "🔐 Usuário não autenticado."
      );

      window.location.href =
        "login.html";

      return false;
    }

    return true;
  }
};


// ============================================================
// LOGIN
// ============================================================

async function handleLoginSubmit(event) {

  if (event) {
    event.preventDefault();
  }

  const emailInput =
    document.getElementById("email");

  const passwordInput =
    document.getElementById("password");

  const errorBox =
    document.getElementById("auth-error");

  const submitBtn =
    document.getElementById("login-submit");


  // ----------------------------------------------------------
  // VERIFICA ELEMENTOS
  // ----------------------------------------------------------

  if (!emailInput || !passwordInput) {

    console.error(
      "❌ Campos de login não encontrados."
    );

    return;
  }


  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;


  // ----------------------------------------------------------
  // LIMPAR ERRO
  // ----------------------------------------------------------

  if (errorBox) {

    errorBox.textContent = "";

    errorBox.classList.add(
      "hidden"
    );
  }


  // ----------------------------------------------------------
  // VALIDAÇÃO
  // ----------------------------------------------------------

  if (!email || !password) {

    showLoginError(
      "Informe seu e-mail e sua senha."
    );

    return;
  }


  // ----------------------------------------------------------
  // BOTÃO
  // ----------------------------------------------------------

  if (submitBtn) {

    submitBtn.disabled = true;

    submitBtn.textContent =
      "Entrando...";
  }


  console.log(
    "🔐 Tentando autenticar:",
    email
  );


  // ==========================================================
  // CHAMADA API
  // ==========================================================

  let res;

  try {

    res =
      await API.postPublic(
        "/api/login",
        {
          email,
          password
        }
      );

  } catch (error) {

    console.error(
      "❌ Erro durante login:",
      error
    );

    showLoginError(
      "Não foi possível conectar ao servidor."
    );

    restoreLoginButton();

    return;
  }


  // ----------------------------------------------------------
  // RESTAURA BOTÃO
  // ----------------------------------------------------------

  restoreLoginButton();


  // ==========================================================
  // ERRO DA API
  // ==========================================================

  if (
    !res ||
    res.error ||
    !res.token
  ) {

    console.error(
      "❌ Login recusado:",
      res
    );

    showLoginError(
      res?.message ||
      "E-mail ou senha inválidos."
    );

    return;
  }


  // ==========================================================
  // SALVA TOKEN
  // ==========================================================

  const saved =
    Auth.saveSession(
      res.token,
      res.expiresAt
    );


  if (!saved) {

    showLoginError(
      "Não foi possível salvar a sessão."
    );

    return;
  }


  console.log(
    "🎉 Login realizado com sucesso."
  );


  // ==========================================================
  // REDIRECIONA
  // ==========================================================

  window.location.href =
    "index.html";
}


// ============================================================
// MOSTRAR ERRO
// ============================================================

function showLoginError(message) {

  const errorBox =
    document.getElementById(
      "auth-error"
    );

  if (!errorBox) {

    alert(message);

    return;
  }

  errorBox.textContent =
    message;

  errorBox.classList.remove(
    "hidden"
  );
}


// ============================================================
// RESTAURAR BOTÃO
// ============================================================

function restoreLoginButton() {

  const submitBtn =
    document.getElementById(
      "login-submit"
    );

  if (!submitBtn) {
    return;
  }

  submitBtn.disabled = false;

  submitBtn.textContent =
    "Entrar";
}


// ============================================================
// INICIALIZAÇÃO DO LOGIN
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const form =
      document.getElementById(
        "login-form"
      );

    // --------------------------------------------------------
    // Se não existe formulário,
    // provavelmente estamos no index.html
    // --------------------------------------------------------

    if (!form) {

      console.log(
        "ℹ️ Formulário de login não encontrado. Página administrativa."
      );

      return;
    }


    // --------------------------------------------------------
    // Evita múltiplos listeners
    // --------------------------------------------------------

    form.addEventListener(
      "submit",
      handleLoginSubmit
    );


    console.log(
      "🔐 Sistema de login V8 ADMIN iniciado."
    );
  }
);
