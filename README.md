# AllDrive

Unified Google Drive viewer — connect multiple Google Drive accounts and browse all your files in one place.

**Privacy-first:** Everything runs locally on your device by default. Optionally sync your account to access from multiple devices.

## Features

- 🔒 Local account — credentials stored in your browser (IndexedDB), never sent to any server
- ☁️ Optional server sync — one click to enable cross-device access
- 📁 Connect multiple Google Drive accounts
- 🖼️ View photos, videos, PDFs and all file types
- ⬆️ Upload files directly to any connected drive
- 🔍 Search and filter across all drives

## Tech Stack

- **Client:** React + TypeScript + Vite + Tailwind CSS v4
- **Server:** Node.js + Express + TypeScript
- **Database:** MongoDB (only used when user opts into sync)
- **Auth:** IndexedDB-backed local accounts + optional JWT sync

---

## Setup

### Prerequisites

- Node.js 20.19+ (Vite 8 requirement; 22 recommended)
- MongoDB — every `/api` route returns 503 without it, including connecting a drive

### 1. Clone & install

```bash
git clone <repo-url>
cd AllDrive
npm install
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/alldrive
JWT_SECRET=any-long-random-string
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/drives/callback
CLIENT_URL=http://localhost:5173
PORT=5000
```

### 3. Google Cloud Console setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable **Google Drive API** (APIs & Services → Library)
4. Create OAuth credentials (APIs & Services → Credentials → Create OAuth Client ID):
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs:
     - `http://localhost:5173/callback` ← required for local drive connect
     - `http://localhost:5173/api/drives/callback` ← for server sync mode (Vite proxies `/api` to the server)

   Everything runs through port 5173 in dev (Vite is pinned to it with `strictPort`). In production, `npm run build` then `NODE_ENV=production npm start --prefix server` serves the client and API from the server's single port.
5. Copy the **Client ID** and **Client Secret** into `server/.env`
6. OAuth consent screen → add your Gmail as a **Test user**

### 4. Run

```bash
npm run dev
```

Opens at **http://localhost:5173**

---

## Deploy for free

One free [Render](https://render.com) web service runs the API and serves the built client from the same URL, backed by a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster. `render.yaml` in the repo root describes the service.

1. **Database — MongoDB Atlas (M0, free)**
   - Create a free M0 cluster and a database user.
   - Network Access → add `0.0.0.0/0` (Render's free tier has no fixed outbound IP).
   - Copy the connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/alldrive`.
2. **App — Render**
   - Push this repo to GitHub, then in Render: **New → Blueprint** → select the repo.
   - Render reads `render.yaml` and asks for the secret values. Use your service URL (shown as `https://<name>.onrender.com`; if you don't know it yet, enter placeholders and fix them after the first deploy):

     | Variable | Value |
     |---|---|
     | `MONGODB_URI` | the Atlas connection string |
     | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
     | `CLIENT_URL` | `https://<name>.onrender.com` (no trailing slash) |
     | `GOOGLE_REDIRECT_URI` | `https://<name>.onrender.com/api/drives/callback` |

     `JWT_SECRET` is generated automatically; `PORT` is set by Render.
3. **Google Cloud Console** → your OAuth client → add the production URLs next to the localhost ones:
   - Authorized JavaScript origins: `https://<name>.onrender.com`
   - Authorized redirect URIs: `https://<name>.onrender.com/callback` and `https://<name>.onrender.com/api/drives/callback`
4. Open `https://<name>.onrender.com` and connect a drive.

Every push to the default branch redeploys automatically.

**Free-tier limits to know about**

- The Render service sleeps after ~15 minutes without traffic; the next visit takes up to a minute to wake it.
- While the Google OAuth consent screen is in **Testing**, only the Google accounts listed as test users can sign in (up to 100), and their refresh tokens expire after 7 days. Publishing the app for everyone requires Google's verification because the Drive and Photos scopes are sensitive.
- Atlas M0 gives 512 MB, which is plenty: only account and drive metadata is stored, never files.

---

## How it works

### Local mode (default)
1. Create a local account at `/register` — stored only in your browser
2. Go to **My Drives** → **Connect Google Drive**
3. Authorize with Google — the access token is stored in `localStorage` only
4. Browse all your files at `/dashboard`

### Sync to all devices (optional)
1. Click the cloud icon in the navbar → **Sync to all devices**
2. Set a password — your account is pushed to the server
3. On another device, go to `/sync` → **Already synced** → sign in

---

## Project structure

```
AllDrive/
├── client/          # React frontend
│   └── src/
│       ├── api/         # Axios API wrappers
│       ├── components/  # Shared UI components
│       ├── context/     # React contexts (LocalAccount, LocalDrive)
│       ├── pages/       # Route pages
│       ├── services/    # IndexedDB service (local accounts)
│       └── utils/       # Helpers
└── server/          # Express backend
    └── src/
        ├── config/      # DB + Google OAuth config
        ├── controllers/ # Route handlers
        ├── middleware/  # JWT auth
        ├── models/      # Mongoose models
        ├── routes/      # Express routers
        └── services/    # Google Drive API wrapper
```
