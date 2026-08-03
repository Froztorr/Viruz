// OneDrive File Search — client-side only.
//
// Uses MSAL.js (loaded as a global `msal` from the <script> tag in index.html)
// to sign the user in with the OAuth2 Authorization Code + PKCE flow, then
// calls Microsoft Graph's OneDrive search endpoint. No server, no client
// secret: this is a public SPA client, same pattern GitHub Pages can host.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["User.Read", "Files.Read"];
const SEARCH_DEBOUNCE_MS = 400;

const els = {
  clientId: document.getElementById("client-id"),
  tenant: document.getElementById("tenant"),
  redirectHint: document.getElementById("redirect-uri-hint"),
  signinBtn: document.getElementById("signin-btn"),
  signoutBtn: document.getElementById("signout-btn"),
  status: document.getElementById("status"),
  accountLabel: document.getElementById("account-label"),
  setupCard: document.getElementById("setup-card"),
  searchCard: document.getElementById("search-card"),
  resultsCard: document.getElementById("results-card"),
  searchInput: document.getElementById("search-input"),
  searchStatus: document.getElementById("search-status"),
  results: document.getElementById("results"),
  emptyState: document.getElementById("empty-state"),
};

const redirectUri = window.location.origin + window.location.pathname;
els.redirectHint.textContent = redirectUri;

const STORAGE_KEY = "onedrive-search:config";

function loadSavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConfig(clientId, tenant) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ clientId, tenant }));
}

const saved = loadSavedConfig();
if (saved) {
  els.clientId.value = saved.clientId || "";
  els.tenant.value = saved.tenant || "consumers";
}

let msalInstance = null;
let searchDebounceTimer = null;

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.classList.toggle("error", isError);
}

function setSearchStatus(message) {
  els.searchStatus.textContent = message || "";
}

async function getMsalInstance(clientId, tenant) {
  const config = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenant}`,
      redirectUri,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  };
  const instance = new msal.PublicClientApplication(config);
  await instance.initialize();
  return instance;
}

async function init() {
  const clientId = els.clientId.value.trim();
  const tenant = els.tenant.value;
  if (!clientId) return;

  msalInstance = await getMsalInstance(clientId, tenant);

  const redirectResult = await msalInstance.handleRedirectPromise().catch((err) => {
    setStatus(`Sign-in failed: ${err.errorMessage || err.message}`, true);
    return null;
  });

  const existingAccounts = msalInstance.getAllAccounts();
  const account = redirectResult?.account || existingAccounts[0];

  if (account) {
    msalInstance.setActiveAccount(account);
    onSignedIn(account);
  }
}

function onSignedIn(account) {
  els.accountLabel.textContent = account.username;
  els.signoutBtn.classList.remove("hidden");
  els.signinBtn.textContent = "Signed in";
  els.signinBtn.disabled = true;
  els.setupCard.querySelectorAll("input, select").forEach((el) => (el.disabled = true));
  els.searchCard.classList.remove("hidden");
  els.resultsCard.classList.remove("hidden");
  setStatus("");
  els.searchInput.focus();
}

async function acquireToken() {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error("Not signed in");
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (err) {
    const result = await msalInstance.acquireTokenPopup({ scopes: SCOPES });
    return result.accessToken;
  }
}

els.signinBtn.addEventListener("click", async () => {
  const clientId = els.clientId.value.trim();
  const tenant = els.tenant.value;
  if (!clientId) {
    setStatus("Enter your Azure AD Application (client) ID first.", true);
    return;
  }
  saveConfig(clientId, tenant);
  setStatus("Redirecting to Microsoft sign-in…");
  try {
    msalInstance = await getMsalInstance(clientId, tenant);
    await msalInstance.loginRedirect({ scopes: SCOPES });
  } catch (err) {
    setStatus(`Sign-in failed: ${err.message}`, true);
  }
});

els.signoutBtn.addEventListener("click", async () => {
  const account = msalInstance?.getActiveAccount();
  if (!msalInstance || !account) return;
  await msalInstance.logoutRedirect({ account });
});

els.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  const query = els.searchInput.value.trim();
  if (!query) {
    renderResults([]);
    setSearchStatus("");
    return;
  }
  setSearchStatus("Searching…");
  searchDebounceTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
});

async function runSearch(query) {
  try {
    const token = await acquireToken();
    const url =
      `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(query)}')` +
      `?$top=25&$select=id,name,webUrl,size,file,folder,parentReference,lastModifiedDateTime`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Graph API error ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    const items = data.value || [];
    renderResults(items);
    setSearchStatus(items.length ? `${items.length} result${items.length === 1 ? "" : "s"}` : "");
  } catch (err) {
    setSearchStatus("");
    setStatus(`Search failed: ${err.message}`, true);
  }
}

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function iconFor(item) {
  if (item.folder) return "📁";
  const name = item.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const map = {
    pdf: "📕",
    doc: "📄", docx: "📄",
    xls: "📊", xlsx: "📊",
    ppt: "📽️", pptx: "📽️",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️",
    zip: "🗜️",
    mp4: "🎞️", mov: "🎞️",
    mp3: "🎵", wav: "🎵",
  };
  return map[ext] || "📄";
}

function renderResults(items) {
  els.results.innerHTML = "";
  els.emptyState.classList.toggle("hidden", items.length !== 0);

  for (const item of items) {
    const li = document.createElement("li");

    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.textContent = iconFor(item);

    const info = document.createElement("div");
    info.className = "file-info";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.name;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    const path = (item.parentReference?.path || "").replace(/^\/drive\/root:?/, "") || "/";
    const size = item.file ? formatBytes(item.size) : "";
    const modified = item.lastModifiedDateTime
      ? new Date(item.lastModifiedDateTime).toLocaleDateString()
      : "";
    meta.textContent = [path, size, modified].filter(Boolean).join(" · ");

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const openLink = document.createElement("a");
    openLink.className = "btn-link";
    openLink.href = item.webUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open in OneDrive";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-secondary";
    copyBtn.textContent = "Copy link";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.webUrl);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy link"), 1500);
    });

    actions.appendChild(openLink);
    actions.appendChild(copyBtn);

    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(actions);
    els.results.appendChild(li);
  }
}

init();
