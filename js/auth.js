// ================================================================
// V8 ADMIN — Universal
// Autenticação do administrador
// ================================================================

const Auth = {

  TOKEN_KEY: "v8_admin_token",
  EXPIRES_KEY: "v8_admin_token_expires",

  // --------------------------------------------------------------
  // SALVAR SESSÃO
  // --------------------------------------------------------------

  saveSession(token, expiresAt) {

    localStorage.setItem(
      this.TOKEN_KEY,
      token
    );

    localStorage.setItem(
      this.EXPIRES_KEY,
      String(expiresAt)
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

    return (
      Boolean(token) &&
      Date.now() < expires
    );
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
  // LOGOUT
  // --------------------------------------------------------------

  logout() {

    localStorage.removeItem(
      this.TOKEN_KEY
    );

    localStorage.removeItem(
      this.EXPIRES_KEY
    );

    window.location.href =
      "login.html";
  },

  // --------------------------------------------------------------
  // PROTEGER PÁGINA
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
    // CHAMADA À API
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
    // ERRO DA API
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
    // SALVA SESSÃO
    // ------------------------------------------------------------

    Auth.saveSession(
      res.token,
      expiresAt
    );


    // ------------------------------------------------------------
    // REDIRECIONA
    // ------------------------------------------------------------

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
```
