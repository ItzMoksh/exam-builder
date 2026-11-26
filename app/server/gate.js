// Password gate shared by the Cloudflare (functions/_middleware.js) and Vercel (middleware.js) hosts.
// The password is the SITE_PASSWORD environment variable. Once entered, a cookie keeps the browser
// signed in for a year. Without it, every request (pages, images, data, API) gets the login page.

export const COOKIE = "eb_auth";
const YEAR = 60 * 60 * 24 * 365;

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function loginPage(error = "") {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Vidya · Physics paper builder</title>
<meta name="theme-color" content="#4a1010">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;600&family=Rozha+One&family=Tiro+Devanagari+Sanskrit&display=swap" rel="stylesheet">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#4a1010;color:#2e1a12;
    font:17px/1.5 "Mukta","Segoe UI",system-ui,sans-serif;padding:16px;box-sizing:border-box}
  form{background:#fffdf7;border:1px solid #e2cb95;border-radius:18px;padding:34px 32px 30px;width:100%;max-width:390px;
    box-shadow:inset 0 0 0 6px #fffdf7,inset 0 0 0 7px #ebd9ae,0 20px 50px rgba(0,0,0,.35);text-align:center}
  .mark{display:block;margin:0 auto 6px}
  h1{font-family:"Rozha One",Georgia,serif;font-weight:400;font-size:38px;line-height:1;margin:0;color:#4a1010}
  .sa{font-family:"Tiro Devanagari Sanskrit",serif;color:#a8520f;font-size:19px;margin:6px 0 2px}
  p{color:#6e5446;margin:0 0 22px}
  label{display:block;font-weight:600;margin-bottom:6px;text-align:left;color:#4a1010}
  input{width:100%;box-sizing:border-box;font:inherit;padding:12px 13px;border:1px solid #d6bd85;border-radius:10px;background:#fffefb}
  input:focus{outline:3px solid #f0a830;outline-offset:1px}
  button{margin-top:18px;width:100%;font:inherit;font-weight:600;padding:13px;border:0;border-radius:999px;background:#6b1a1a;color:#fff6e3;
    cursor:pointer;box-shadow:0 0 0 2px #fffdf7,0 0 0 3px #c9a04a}
  .err{color:#a61b1b;margin:12px 0 0;font-weight:600}
</style></head><body>
<form method="post" action="/__login">
  <svg class="mark" width="64" height="64" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2 C29 9 41 12 43 22 L43 46 L5 46 L5 22 C7 12 19 9 24 2Z" fill="#7E2323" stroke="#E9C46A" stroke-width="1.5"/><path d="M24 17 C28.5 23 28.5 31 24 37 C19.5 31 19.5 23 24 17Z" fill="#F4C557"/><path d="M24 37 C18.5 35.5 13.5 31 12.5 24.5 C18 25.5 22 30 24 37Z M24 37 C29.5 35.5 34.5 31 35.5 24.5 C30 25.5 26 30 24 37Z" fill="#E58A24"/><path d="M13 41 H35" stroke="#F4C557" stroke-width="2" stroke-linecap="round"/></svg>
  <h1>Vidya</h1>
  <div class="sa" lang="sa">विद्या ददाति विनयम्</div>
  <p>Enter the password to make test papers.</p>
  <label for="pw">Password</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
  ${error ? `<p class="err">${error}</p>` : ""}
  <button type="submit">Open</button>
</form></body></html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

/**
 * Returns a Response to send instead of the request (login page, login redirect, 401),
 * or null when the browser is signed in and the request may go through.
 */
export async function gate(request, password) {
  if (!password) {
    return new Response("The site password is not set. Add SITE_PASSWORD in the hosting settings.", { status: 503 });
  }
  const token = await sha256("exam-builder:" + password);
  const url = new URL(request.url);

  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData();
    if ((form.get("password") || "") !== password) return loginPage("That password isn't right. Please try again.");
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": `${COOKIE}=${token}; Max-Age=${YEAR}; Path=/; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  const cookies = (request.headers.get("Cookie") || "").split(/;\s*/);
  if (cookies.includes(`${COOKIE}=${token}`)) return null;
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "signed out" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  return loginPage();
}
