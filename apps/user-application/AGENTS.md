# user-application

TanStack Start frontend with SSR on Cloudflare Workers.

## Stack

- TanStack Start (Router + Query + Form)
- Cloudflare Workers with service bindings
- Better Auth for authentication
- Consumes `@repo/data-ops` for direct DB access and Zod schemas

## Structure

```
src/
├── server.ts                 # Worker entry, DB + auth init
├── router.tsx                # TanStack Router config
├── routes/                   # File-based routing
│   ├── __root.tsx            # Root layout
│   ├── index.tsx             # Landing page
│   ├── faq/$categoryId.tsx   # Dynamic FAQ pages
│   ├── _auth/                # Protected routes (require auth)
│   └── api/                  # API handlers (Better Auth)
├── lib/
│   ├── utils.ts              # Shared utilities
│   ├── auth-client.ts        # Better Auth client
│   └── data-service.ts       # Service binding client (DATA_SERVICE)
└── components/               # React components
    ├── landing/              # Landing page sections
    ├── faq/                  # FAQ page component
    ├── navigation/           # Nav bar
    ├── theme/                # Theme toggle + provider
    ├── auth/                 # Auth components
    └── ui/                   # Radix/shadcn primitives
```

## Dev

```bash
pnpm run dev                # local dev (port 3000)
pnpm run build              # build for production (default)
pnpm run build:staging      # build with staging config
pnpm run build:production   # build with production config
pnpm run deploy:staging     # build:staging + wrangler deploy
pnpm run deploy:production  # build:production + wrangler deploy
```

## Env vars

`.env` (local) or Cloudflare dashboard:
- `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `BETTER_AUTH_SECRET`
- `CLOUDFLARE_ENV` - dev | staging | production
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional, OAuth)
- `VITE_DATA_SERVICE_URL` - public API URL
- `VITE_API_TOKEN` - client-side API auth

<important if="you are making server-side calls to data-service from user-application">
## Service Binding (DATA_SERVICE)

Use `fetchDataService()` from `lib/data-service.ts` for server-side calls via Worker service binding. Never call the public API URL from server code.

```ts
import { fetchDataService } from "@/lib/data-service";

const response = await fetchDataService("/health/live");
const data = await response.json();
```

- Server-only — uses `env` from `cloudflare:workers`
- No HTTP/DNS overhead — internal Worker-to-Worker RPC
- Health check: `GET /api/health` verifies binding, DB, and env
</important>

<important if="the Flight Room chat is not delivering messages in real time (only after a page refresh)">
## Flight Room realtime / WebSocket CSP gotcha

The browser opens the room WebSocket **directly** to the data-service origin
(`ws://localhost:8788` in dev, `wss://<api-host>` in prod) — see `roomWebSocketUrl()`
in `lib/room-api.ts`. It does NOT go through the `DATA_SERVICE` service binding.

The most common "messages only appear on refresh" cause is the page CSP: `connect-src`
in `lib/security-headers.ts` must list the **ws:/wss: origin**, not just the http:/https:
one. CSP treats `ws:`/`wss:` as distinct schemes, so `http://localhost:8788` does NOT
authorize `ws://localhost:8788` — the socket is blocked while REST still works (hence
refresh loads messages but live delivery is silent). Confirm in DevTools → Console for a
`connect-src` violation. The server-side Hono middleware in data-service does NOT strip
the 101 upgrade (verified in real workerd) — don't chase that.
</important>

## Don't

- Import `env` from 'cloudflare:workers' in client code (server only)
- Put DB queries here - add to `@repo/data-ops/{domain}`
- Skip `enabled: !!id` on detail queries (prevents empty ID fetches)
- Use useState for URL-driven state - use `validateSearch` + `useNavigate`
