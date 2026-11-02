# NEXORA — personal AI search engine (PWA)

## Run locally
1. `npm install`
2. `cp .env.example .env` and set `ANTHROPIC_API_KEY` (and optionally `ACCESS_TOKEN`)
3. `npm run dev` → open http://localhost:5173 (API on :8787)

## Build / deploy
- `npm run build` outputs `dist/`. Deploy `dist/` to Vercel with env `VITE_API_URL=https://your-backend`.
- Run the backend (`npm start`) on a Node host with `ANTHROPIC_API_KEY`, `ACCESS_TOKEN`, `ALLOWED_ORIGIN` set.
- There is no login, so set `ACCESS_TOKEN` on the server and enter the same value in NEXORA Settings. Prefer a private network (e.g. Tailscale) or host-level access control.

## Notes
- Chats and saved answers live in IndexedDB on this browser only. Use Settings → Export for backups.
- Citations come only from the web search results returned by the Claude API.
- Check `ANTHROPIC_MODEL` and the web search tool version (`web_search_20250305` in `server/src/index.ts`) against current Anthropic docs.
