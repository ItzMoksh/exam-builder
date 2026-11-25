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
<title>Exam Builder</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6f9;color:#1d2430;
    font:17px/1.5 "Segoe UI",system-ui,Arial,sans-serif;padding:16px;box-sizing:border-box}
  form{background:#fff;border:1px solid #d9dee6;border-radius:14px;padding:32px;width:100%;max-width:380px}
  h1{font-size:24px;margin:0 0 4px} p{color:#5b6676;margin:0 0 20px}
  label{display:block;font-weight:600;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;font:inherit;padding:11px 12px;border:1px solid #b9c2cf;border-radius:8px}
  button{margin-top:16px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:#1f4e79;color:#fff;cursor:pointer}
  .err{color:#b42318;margin:12px 0 0;font-weight:500}
</style></head><body>
<form method="post" action="/__login">
  <h1>Exam Builder</h1>
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
