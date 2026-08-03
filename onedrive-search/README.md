# OneDrive File Search

A small static web app that signs in with a Microsoft account, searches your
OneDrive by file name, and links straight to the real OneDrive URL for each
result (`webUrl` from Microsoft Graph — the same link you'd get from "Copy
link" / "Open" in OneDrive itself).

No backend, no database, no server-side secrets. It's a single-page app that
talks directly to [Microsoft Graph](https://learn.microsoft.com/en-us/graph/overview)
from the browser using OAuth2 Authorization Code + PKCE (via
[MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-js)),
the standard flow for public single-page apps. Your files and search results
never pass through any third-party server — only your browser and
`graph.microsoft.com`.

## 1. Register an Azure AD app (one-time, ~2 minutes)

You need your own "app registration" so Microsoft knows which app is asking
to read your OneDrive. This is free and doesn't require an Azure
subscription — a Microsoft account is enough.

1. Go to the [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   and sign in with the Microsoft account whose OneDrive you want to search.
2. Click **New registration**.
   - **Name**: anything, e.g. `OneDrive File Search`
   - **Supported account types**: choose based on what you'll sign in with —
     "Personal Microsoft accounts only" for outlook.com/live.com/hotmail.com,
     or "Accounts in any organizational directory and personal Microsoft
     accounts" if you also use a work/school account.
   - **Redirect URI**: platform **Single-page application (SPA)**, value is
     the URL where this app is hosted, e.g.
     `https://<your-username>.github.io/<repo>/onedrive-search/`
     (for local testing, also add `http://localhost:8000/onedrive-search/`).
3. Click **Register**.
4. Copy the **Application (client) ID** shown on the overview page — you'll
   paste this into the app's UI.
5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions**, and add:
   - `User.Read`
   - `Files.Read`

   These are read-only, delegated (i.e. "act as the signed-in user") scopes —
   no admin consent should be required.
6. You do **not** need a client secret. This app is a public client
   (browser-only, PKCE flow) — creating a secret would be insecure here since
   anyone could read it from the page source.

## 2. Run it

### Locally

```bash
cd onedrive-search
python3 -m http.server 8000
# open http://localhost:8000/
```

### On GitHub Pages

This folder is a static site, so if the repo has GitHub Pages enabled
(Settings → Pages → Deploy from branch → `main` / root), it's served at:

```
https://<your-username>.github.io/<repo>/onedrive-search/
```

Make sure that exact URL is added as a Redirect URI on the app registration
(step 1.2 above) — Azure AD rejects sign-in if it doesn't match exactly.

## 3. Use it

1. Open the app, paste your **Application (client) ID**, pick your account
   type, and click **Sign in with Microsoft**.
2. Approve the permissions prompt (first time only).
3. Type in the search box — results appear as you type, each with an
   **Open in OneDrive** button that links directly to the file's real
   OneDrive URL, plus a **Copy link** button.

The client ID and account-type choice are remembered in your browser's
`localStorage` so you don't have to re-enter them next time.

## How the search works

It calls Microsoft Graph's
[search endpoint](https://learn.microsoft.com/en-us/graph/api/driveitem-search):

```
GET https://graph.microsoft.com/v1.0/me/drive/root/search(q='{your query}')
```

which searches file and folder names (and some content) across your OneDrive,
and returns each item's `webUrl` — the canonical link to open it in
OneDrive/Office on the web.

## About the vendored library

`vendor/msal-browser.min.js` is [`@azure/msal-browser`](https://www.npmjs.com/package/@azure/msal-browser)
(MIT licensed, see `vendor/LICENSE-msal-browser.txt`), vendored directly
instead of loaded from a CDN so the app has no external runtime dependency
and works the same locally, on GitHub Pages, or offline. It's Microsoft's
official browser SDK for the Authorization Code + PKCE flow.

## Notes / limitations

- Search is scoped to the signed-in user's own OneDrive (`/me/drive`). It
  won't search SharePoint sites or other users' drives.
- Tokens are cached in `localStorage` via MSAL (standard for SPAs). Signing
  out clears them.
- Everything is client-side, so the client ID is visible in the page — that's
  expected and safe for a public/PKCE app registration; it is not a secret.
