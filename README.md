# Infosite frontend

React/Vite test client for the sibling `Infosite` Spring Boot backend.

## Start both applications

Backend, from `Infosite`:

```powershell
$env:CHAT_CHRIS_PASSWORD = "your-test-password"
$env:CHAT_AUDREY_PASSWORD = "your-other-test-password"
.\mvnw.cmd spring-boot:run
```

Frontend, from `InfositeFrontend`:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api`, `/actuator`, and `/ws` to `http://localhost:8080`, so the browser gets a same-origin development experience while still exercising the real backend authentication, CSRF, history, and WebSocket behavior.

The frontend uses a strict port because the backend allows the exact origin `http://localhost:5173`. If Vite reports that port 5173 is already in use, stop the older Vite process instead of allowing this app to move to 5174 or 5175; a different origin will be rejected by Spring Security.

For a separately hosted frontend, copy `.env.example` to `.env` and set `VITE_API_ORIGIN` to the backend's HTTPS origin. The backend's `CHAT_FRONTEND_ORIGIN` must exactly match the frontend origin, and credentialed CORS plus secure cookie settings must be enabled as described in the backend README.

## Deploy the frontend to Render

The repository includes a `render.yaml` Blueprint for a free Render Static Site. Push this directory as its own GitHub repository, create a Render Blueprint from it, and enter the deployed backend origin when Render prompts for `VITE_API_ORIGIN`:

```text
VITE_API_ORIGIN=https://your-backend.onrender.com
```

The value contains no path or trailing slash. Vite embeds it during `npm run build`, so changing the backend URL requires **Save, rebuild, and deploy** in Render. The Blueprint runs `npm ci && npm run build`, publishes `dist`, pins the Node version in `.node-version`, adds baseline security headers, gives hashed assets long-lived caching, and rewrites unknown frontend routes to `index.html`.

After Render assigns the frontend URL, set the backend's value to the exact frontend origin and redeploy the backend:

```text
CHAT_FRONTEND_ORIGIN=https://your-frontend.onrender.com
```

For two separate `onrender.com` URLs, the backend must also use `SESSION_COOKIE_SECURE=true` and `SESSION_COOKIE_SAME_SITE=none`. Do not put either chat password in this frontend repository or in any `VITE_` variable; browser bundles make `VITE_` values public.

## Behavior covered

- Backend health indicator
- Session and CSRF initialization
- Form login with JSON errors
- Current-user restoration after refresh
- Recent message history
- Authenticated WebSocket connection and reconnect
- 500-character composer limit
- Server chat/system/error frames
- Logout and socket teardown

Build and lint with:

```powershell
npm run build
npm run lint
```
