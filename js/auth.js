```javascript
// ================================================================
// V8 ADMIN — Universal | Autenticação do administrador
// ================================================================

const Auth = {

  TOKEN_KEY:
    "v8_admin_token",

  EXPIRES_KEY:
    "v8_admin_token_expires",


  // ==============================================================
  // SALVAR SESSÃO
  // ==============================================================

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


  // ==============================================================
  // VERIFICAR LOGIN
  // ==============================================================

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

    /*
     * Esta verificação é apenas para UX.
     *
     * A segurança real acontece no Worker,
     * que valida assinatura e expiração do token
     * em cada requisição protegida.
     */

    return (
      Boolean(token) &&
      Date.now() < expires
    );

  },


  // ==============================================================
  // OBTER TOKEN
  // ==============================================================

  getToken() {

    return localStorage.getItem(
      this.TOKEN_KEY
    );

  },


  // ==============================================================
  // LOGOUT
  // ==============================================================

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


  // ==============================================================
  // EXIGIR AUTENTICAÇÃO
  // ==============================================================

  requireAuth() {

    if (
      !this.isLoggedIn()
    ) {

      window.location.href =
        "login.html";

    }

  }

};


// ================================================================
// LOGIN — login.html
// ================================================================

async function handleLoginSubmit(
  event
) {

  event.preventDefault();

  const emailInput =
    document.getElementById(
      "email"
    );

  const passwordInput =
    document.getElementById(
      "password"
    );

  const errorBox =
    document.getElementById(
      "auth-error"
    );

  const submitBtn =
    document.getElementById(
      "login-submit"
    );


  // --------------------------------------------------------------
  // VALIDAÇÃO DOS ELEMENTOS
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
  // LIMPAR ERRO
  // --------------------------------------------------------------

  errorBox.textContent =
    "";

  errorBox.classList.add(
    "hidden"
  );


  // --------------------------------------------------------------
  // VALIDAR CAMPOS
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
  // BLOQUEAR BOTÃO
  // --------------------------------------------------------------

  submitBtn.disabled =
    true;

  submitBtn.textContent =
    "Entrando...";


  try {

    // ------------------------------------------------------------
    // API DE LOGIN
    //
    // IMPORTANTE:
    // api.js precisa ser carregado ANTES deste arquivo.
    // ------------------------------------------------------------

    if (
      typeof API === "undefined"
    ) {

      throw new Error(
        "API não está disponível. Verifique a ordem dos scripts no login.html."
      );

    }


    const res =
      await API.postPublic(
        "/api/login",
        {
          email,
          password
        }
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

      return;

    }


    // ------------------------------------------------------------
    // VALIDAR EXPIRAÇÃO
    // ------------------------------------------------------------

    if (
      !res.expiresAt
    ) {

      console.error(
        "A API não retornou expiresAt."
      );

      errorBox.textContent =
        "A API retornou uma sessão inválida.";

      errorBox.classList.remove(
        "hidden"
      );

      return;

    }


    // ------------------------------------------------------------
    // SALVAR SESSÃO
    // ------------------------------------------------------------

    Auth.saveSession(
      res.token,
      res.expiresAt
    );


    // ------------------------------------------------------------
    // ENTRAR NO PAINEL
    // ------------------------------------------------------------

    window.location.href =
      "index.html";


  } catch (error) {

    console.error(
      "Erro durante login:",
      error
    );

    errorBox.textContent =
      error?.message ||
      "Não foi possível realizar o login.";

    errorBox.classList.remove(
      "hidden"
    );

  } finally {

    submitBtn.disabled =
      false;

    submitBtn.textContent =
      "Entrar";

  }

}
```
