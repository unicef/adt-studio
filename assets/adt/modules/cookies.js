/**
 * Sets a cookie with the given name, value, expiration (in days), and path.
 * @param {string} name - The name of the cookie.
 * @param {string} value - The value to store.
 * @param {number} [days=7] - Number of days until the cookie expires.
 * @param {string} [path="/"] - The path where the cookie is valid.
 */
export const setCookie = (name, value, days = 7, path = "/") => {
   let expires = "";
   if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
   }
   document.cookie = name + "=" + (value || "") + expires + "; path=" + path;
};

/**
 * Retrieves the value of a cookie by name.
 * @param {string} name - The name of the cookie to retrieve.
 * @returns {string|null} The cookie value, or null if not found.
 */
export const getCookie = (name) => {
   const nameEQ = name + "=";
   const ca = document.cookie.split(";");
   for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
   }
   return null;
};

/**
 * Erases a cookie by name and path.
 * @param {string} name - The name of the cookie to erase.
 * @param {string} [path="/"] - The path where the cookie is valid.
 */
export const eraseCookie = (name, path = "/") => {
   document.cookie = name + "=; Max-Age=-99999999; path=" + path;
};