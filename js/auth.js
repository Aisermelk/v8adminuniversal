// ================================================================
// V8 ADMIN UNIVERSAL
// AUTENTICAÇÃO UNIFICADA
// Admin + Cliente
// ================================================================

const Auth = {

  TOKEN_KEY: "v8_auth_token",
  EXPIRES_KEY: "v8_auth_token_expires",
  TYPE_KEY: "v8_auth_type",

  // --------------------------------------------------------------
  // SALVAR SESSÃO
  // --------------------------------------------------------------

  saveSession(token, expiresAt, type = "admin") {

    localStorage.setItem(
      this.TOKEN_KEY,
      token
    );

    localStorage.setItem(
      this.EXPIRES_KEY,
      String(expiresAt)
    );

    localStorage.setItem(
      this.TYPE_KEY,
      type
    );
  },

  // --------------------------------------------------------------
  // VERIFICAR LOGIN
  // --------------------------------------------------------------

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

    if (
      !token ||
      !expires
    ) {

      return false;
    }

    if (
      Date.now() >= expires
    ) {

      this.clearSession();

      return false;
    }

    return true;
  },

  // --------------------------------------------------------------
  // PEGAR TOKEN
  // --------------------------------------------------------------

  getToken() {

    return localStorage.getItem(
      this.TOKEN_KEY
    );
  },

  // --------------------------------------------------------------
  // PEGAR TIPO DE USUÁRIO
  // --------------------------------------------------------------

  getType() {

    return localStorage.getItem(
      this.TYPE_KEY
    ) || "";
  },

  // --------------------------------------------------------------
  // VERIFICAR SE É ADMIN
  // --------------------------------------------------------------

  isAdmin() {

    return (
      this.isLoggedIn() &&
      this.getType() === "admin"
    );
  },

  // --------------------------------------------------------------
  // VERIFICAR SE É CLIENTE
  // --------------------------------------------------------------

  isClient() {

    return (
      this.isLoggedIn() &&
      this.getType() === "client"
    );
  },

  // --------------------------------------------------------------
  // LIMPAR SESSÃO
  // --------------------------------------------------------------

  clearSession() {

    localStorage.removeItem(
      this.TOKEN_KEY
    );

    localStorage.removeItem(
      this.EXPIRES_KEY
    );

    localStorage.removeItem(
      this.TYPE_KEY
    );

    // Remove também as chaves antigas
    // usadas pela versão anterior.

    localStorage.removeItem(
      "v8_admin_token"
    );

    localStorage.removeItem(
      "v8_admin_token_expires"
    );
  },

  // --------------------------------------------------------------
  // LOGOUT
  // --------------------------------------------------------------

  logout() {

    this.clearSession();

    window.location.href =
      "login.html";
  },

  // --------------------------------------------------------------
  // PROTEGER ÁREA ADMINISTRATIVA
  // --------------------------------------------------------------

  requireAdmin() {

    if (
      !this.isLoggedIn()
    ) {

      window.location.href =
        "login.html";

      return false;
    }

    if (
      !this.isAdmin()
    ) {

      window.location.href =
        "cliente.html";

      return false;
    }

    return true;
  },

  // --------------------------------------------------------------
  // PROTEGER ÁREA DO CLIENTE
  // --------------------------------------------------------------

  requireClient() {

    if (
      !this.isLoggedIn()
    ) {

      window.location.href =
        "login.html";

      return false;
    }

    if (
      !this.isClient()
    ) {

      window.location.href =
        "index.html";

      return false;
    }

    return true;
  },

  // --------------------------------------------------------------
  // PROTEÇÃO GENÉRICA
  // Mantida para compatibilidade
  // --------------------------------------------------------------

  requireAuth() {

    if (
      !this.isLoggedIn()
    ) {

      window.location.href =
        "login.html";

      return false;
    }

    return true;
  }

};


// ================================================================
// LOGIN
// ================================================================

async function handleLoginSubmit(event) {

  event.preventDefault();

  const emailInput =
    document.getElementById("email");

  const passwordInput =
    document.getElementById("password");

  const errorBox =
    document.getElementById("auth-error");

  const submitBtn =
    document.getElementById("login-submit");


  // --------------------------------------------------------------
  // VERIFICA ELEMENTOS
  // --------------------------------------------------------------

  if (
    !emailInput ||
    !passwordInput ||
    !errorBox ||
    !submitBtn
  ) {

    console.error(
      "Elementos do formulário de login não encontrados."
    );

    return;
  }


  // --------------------------------------------------------------
  // DADOS
  // --------------------------------------------------------------

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;


  // --------------------------------------------------------------
  // LIMPA ERRO
  // --------------------------------------------------------------

  errorBox.textContent = "";

  errorBox.classList.add(
    "hidden"
  );


  // --------------------------------------------------------------
  // VALIDAÇÃO
  // --------------------------------------------------------------

  if (!email) {

    errorBox.textContent =
      "Informe seu e-mail.";

    errorBox.classList.remove(
      "hidden"
    );

    emailInput.focus();

    return;
  }


  if (!password) {

    errorBox.textContent =
      "Informe sua senha.";

    errorBox.classList.remove(
      "hidden"
    );

    passwordInput.focus();

    return;
  }


  // --------------------------------------------------------------
  // BOTÃO
  // --------------------------------------------------------------

  submitBtn.disabled = true;

  submitBtn.textContent =
    "Entrando...";


  try {

    // ------------------------------------------------------------
    // LOGIN
    // ------------------------------------------------------------

    const res =
      await API.postPublic(
        "/api/login",
        {
          email,
          password
        }
      );


    console.log(
      "Resposta do login:",
      res
    );


    // ------------------------------------------------------------
    // ERRO
    // ------------------------------------------------------------

    if (
      !res ||
      res.error ||
      !res.token
    ) {

      errorBox.textContent =
        res?.message ||
        "E-mail ou senha inválidos.";

      errorBox.classList.remove(
        "hidden"
      );

      submitBtn.disabled = false;

      submitBtn.textContent =
        "Entrar";

      return;
    }


    // ------------------------------------------------------------
    // EXPIRAÇÃO
    // ------------------------------------------------------------

    const expiresAt =
      Number(
        res.expiresAt || 0
      );


    if (
      !expiresAt
    ) {

      console.error(
        "A API não retornou expiresAt.",
        res
      );

      errorBox.textContent =
        "A API não retornou a validade da sessão.";

      errorBox.classList.remove(
        "hidden"
      );

      submitBtn.disabled = false;

      submitBtn.textContent =
        "Entrar";

      return;
    }


    // ------------------------------------------------------------
    // TIPO DE USUÁRIO
    // ------------------------------------------------------------

    const type =
      res.type ||
      res.user?.type ||
      "admin";


    // ------------------------------------------------------------
    // SALVA SESSÃO
    // ------------------------------------------------------------

    Auth.saveSession(
      res.token,
      expiresAt,
      type
    );


    // ------------------------------------------------------------
    // REDIRECIONAMENTO
    // ------------------------------------------------------------

    if (
      type === "client"
    ) {

      window.location.href =
        "cliente.html";

      return;
    }


    // Admin

    window.location.href =
      "index.html";

  } catch (error) {

    console.error(
      "Erro durante login:",
      error
    );

    errorBox.textContent =
      "Não foi possível conectar ao servidor.";

    errorBox.classList.remove(
      "hidden"
    );

    submitBtn.disabled = false;

    submitBtn.textContent =
      "Entrar";
  }

}


// ================================================================
// LOGIN FORM
// ================================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const form =
      document.getElementById(
        "login-form"
      );

    if (!form) {
      return;
    }

    form.addEventListener(
      "submit",
      handleLoginSubmit
    );

  }
);