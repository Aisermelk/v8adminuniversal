```javascript
// ================================================================
// V8 ADMIN — Universal
// Comunicação com a API
// ================================================================

const API_BASE =
  "https://v8adminuniversal.aisermelk.workers.dev";

const API = {

  // --------------------------------------------------------------
  // GET AUTENTICADO
  // --------------------------------------------------------------

  async get(path) {

    const token =
      Auth?.getToken?.() || "";

    const response =
      await fetch(
        API_BASE + path,
        {
          method: "GET",

          headers: {
            "Content-Type":
              "application/json",

            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`
                }
              : {})
          }
        }
      );

    return response.json();
  },


  // --------------------------------------------------------------
  // POST AUTENTICADO
  // --------------------------------------------------------------

  async post(path, body = {}) {

    const token =
      Auth?.getToken?.() || "";

    const response =
      await fetch(
        API_BASE + path,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`
                }
              : {})
          },

          body:
            JSON.stringify(body)
        }
      );

    return response.json();
  },


  // --------------------------------------------------------------
  // PUT AUTENTICADO
  // --------------------------------------------------------------

  async put(path, body = {}) {

    const token =
      Auth?.getToken?.() || "";

    const response =
      await fetch(
        API_BASE + path,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",

            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`
                }
              : {})
          },

          body:
            JSON.stringify(body)
        }
      );

    return response.json();
  },


  // --------------------------------------------------------------
  // DELETE AUTENTICADO
  // --------------------------------------------------------------

  async del(path) {

    const token =
      Auth?.getToken?.() || "";

    const response =
      await fetch(
        API_BASE + path,
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",

            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`
                }
              : {})
          }
        }
      );

    return response.json();
  },


  // --------------------------------------------------------------
  // POST PÚBLICO
  // Usado pelo login
  // --------------------------------------------------------------

  async postPublic(path, body = {}) {

    const response =
      await fetch(
        API_BASE + path,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(body)
        }
      );

    return response.json();
  }

};
```
