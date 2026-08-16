const SUPABASE_URL = "https://nwjiiuyefxbvpyytnhah.supabase.co";
const SUPABASE_KEY = "sb_publishable_KFUNLb1SlBwtXmmc0K2Tyg_AQmQqge6";
const APP_URL = "https://derkitoo.github.io/spark/";
const app = document.getElementById("app");

const storage = {
  get: keys => chrome.storage.local.get(keys),
  set: values => chrome.storage.local.set(values),
  remove: keys => chrome.storage.local.remove(keys),
};

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (!response.ok) return null;
  const data = await response.json();
  const next = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in, user: data.user };
  await storage.set({ spark_session: next }); return next;
}

async function getSession() {
  const { spark_session: session } = await storage.get("spark_session");
  if (!session) return null;
  if ((session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60) return refreshSession(session);
  return session;
}

async function login() {
  const redirect = chrome.identity.getRedirectURL("supabase");
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  const result = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!result) throw new Error("Connexion annulée");
  const url = new URL(result); const params = new URLSearchParams(url.hash.slice(1));
  const access_token = params.get("access_token"), refresh_token = params.get("refresh_token"), expires_in = Number(params.get("expires_in") || 3600);
  if (!access_token || !refresh_token) throw new Error(params.get("error_description") || "Session absente");
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access_token}` } });
  const user = await userResponse.json();
  await storage.set({ spark_session: { access_token, refresh_token, expires_at: Math.floor(Date.now() / 1000) + expires_in, user } });
  renderCapture({ access_token, refresh_token, expires_at: Math.floor(Date.now() / 1000) + expires_in, user });
}

function renderAuth(message = "") {
  app.innerHTML = `<section class="auth"><span class="logo">S</span><h1>Capture with Spark</h1><p>Connecte l’extension au même compte Google que ton espace Spark.</p><button class="google"><b>G</b>Continuer avec Google</button><div class="status error">${message}</div><small>Tes captures sont privées et synchronisées via Supabase.</small></section>`;
  app.querySelector(".google").onclick = async e => { e.currentTarget.disabled = true; try { await login(); } catch (error) { renderAuth(error.message); } };
}

async function pageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let selection = "";
  if (tab?.id && /^https?:/.test(tab.url || "")) { try { const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString().trim() || "" }); selection = result?.result || ""; } catch {} }
  return { title: tab?.title || "Nouvelle idée", url: tab?.url || "", selection };
}

async function saveIdea(session, context) {
  const title = app.querySelector(".title").value.trim(), note = app.querySelector(".note").value.trim(), category = app.querySelector("select").value;
  if (!title) throw new Error("Ajoute un titre à l’idée.");
  const content = [note, context.selection ? `Extrait : “${context.selection}”` : "", context.url ? `Source : ${context.url}` : ""].filter(Boolean).join("\n\n");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ideas`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: session.user.id, title, content, category, status: "Capturée" }) });
  if (response.status === 401) { const fresh = await refreshSession(session); if (fresh) return saveIdea(fresh, context); }
  if (!response.ok) throw new Error("La capture n’a pas pu être synchronisée.");
}

async function renderCapture(session) {
  const context = await pageContext(); const displayName = session.user?.user_metadata?.full_name || session.user?.email || "Compte";
  app.innerHTML = `<header class="top"><div class="wordmark"><span class="logo">S</span>Spark</div><button class="account" title="Se déconnecter">${displayName} · quitter</button></header><section class="capture"><span class="eyebrow">QUICK CAPTURE</span><h1>Garde cette étincelle.</h1><div class="source"><strong>${escapeHtml(context.title)}</strong><small>${escapeHtml(context.url)}</small></div>${context.selection ? `<div class="selected">“${escapeHtml(context.selection)}”</div>` : ""}<textarea class="title" aria-label="Titre">${escapeHtml(context.selection ? context.selection.slice(0, 180) : context.title)}</textarea><textarea class="note" placeholder="Ajoute une note personnelle…"></textarea><div class="row"><select><option>Personnel</option><option>Projet</option><option>Créativité</option><option>Travail</option><option>À partager</option></select><button class="save">Enregistrer ↗</button></div><div class="status"></div><a class="open" href="${APP_URL}" target="_blank">Ouvrir ma bibliothèque Spark</a></section>`;
  app.querySelector(".account").onclick = async () => { await storage.remove("spark_session"); renderAuth(); };
  app.querySelector(".save").onclick = async e => { const status = app.querySelector(".status"); e.currentTarget.disabled = true; status.className = "status"; status.textContent = "Synchronisation…"; try { await saveIdea(session, context); status.textContent = "✓ Idée ajoutée à Spark"; setTimeout(() => window.close(), 900); } catch (error) { status.className = "status error"; status.textContent = error.message; e.currentTarget.disabled = false; } };
}

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value || ""; return div.innerHTML; }
(async () => { const session = await getSession(); session ? renderCapture(session) : renderAuth(); })();
