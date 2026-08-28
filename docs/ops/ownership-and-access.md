# Ownership and access register

Who owns which account, who pays for it, how the developer gets in, and where every
credential lives. This document holds **names and roles only — never secret values**.
Update it in the same commit as any ownership, role, or key change.

## Principles

- **Split ownership.** The product owner (Paulina) owns and pays for every account that
  holds product data or a paid data subscription: Neon, Google Cloud / Maps Platform,
  AviationStack. The developer (Tomasz / Auditmos) keeps the platform accounts for now:
  Cloudflare (Workers, DNS, Email Sending, Turnstile), the `landingos.app` domain
  (Cloudflare Registrar), and the GitHub repository.
- **Bitwarden is the only credential channel.** Every key, password, and recovery code
  travels through the Bitwarden Organisation `LandingOS`, collection `infra` — never
  chat, SMS, or email. Local secret files on the developer's machine are working copies
  of vault items, not the source of truth.
- **Owner accepts commercial terms.** The owner accepting Google Maps Platform and
  AviationStack commercial terms is the "commercial/licensing acceptance" evidence
  required by the production gate in [`docs/landingos-mvp.md`](../landingos-mvp.md)
  (AFK delivery and production release gates).
- **Least privilege for the developer.** On owner-held accounts the developer holds a
  role that can operate but not delete, bill, or transfer (see the register).

## How the developer uses the vault

The developer never logs into the owner's Bitwarden account. Her Organisation shares
the `infra` collection with his own Bitwarden account, so its items appear in his own
vault (web, browser extension, or the `bw` CLI) once he accepts the org invite.

Deploy-time flow: open the shared secure note (e.g. `landingos .staging.vars`) → paste
into the matching gitignored local file (`apps/data-service/.staging.vars` or
`apps/user-application/.env.staging`) → `bash apps/{app}/sync-secrets.sh staging`,
which uploads the values as Cloudflare Worker secrets. `pnpm run deploy:{env}:*` itself
never reads provider keys — Workers get them from Cloudflare. The vault is the durable
copy; local files are a cache any machine can rebuild from the vault. Scriptable
variant when wanted: `bw get notes "landingos .staging.vars" > apps/data-service/.staging.vars`.

## Register

| Asset | Owner / payer | Developer access | Dashboard |
|---|---|---|---|
| Bitwarden Organisation `LandingOS` | Paulina (org owner) | member of collection `infra` | <https://vault.bitwarden.com> |
| Neon Organisation `LandingOS` (Postgres, all envs) | Paulina — org **Admin**, plan + card | **Editor** (connection strings, SQL, branches; cannot delete/transfer projects or manage billing/members) | <https://console.neon.tech> |
| Google Cloud project `landingos-prod` + billing account | Paulina — project **Owner** + **Billing Account Administrator** | `roles/editor` on the project, `roles/billing.viewer` on the billing account | <https://console.cloud.google.com> |
| AviationStack account | Paulina's email; single-user product — the shared login in the vault *is* the access model | via vault login when needed | <https://aviationstack.com/dashboard> |
| Cloudflare account (Workers `landingos-*`, zone, Email Sending, Turnstile) | Tomasz (unchanged, for now) | owner | <https://dash.cloudflare.com> |
| Domain `landingos.app` (Cloudflare Registrar) | Tomasz (unchanged, for now) | owner | Cloudflare dashboard → Domain Registration |
| GitHub `auditmos/landingos` | Tomasz (unchanged, for now) | owner | <https://github.com/auditmos/landingos> |

## Secrets map

Where each Worker secret comes from and which vault item holds it. Push to Cloudflare
with `bash apps/{app}/sync-secrets.sh {env}`; `ds` = data-service, `ua` = user-application.

| Secret name | Worker(s) | Envs | Source vendor | Vault item (`LandingOS/infra`) |
|---|---|---|---|---|
| `DATABASE_HOST` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | ds, ua | per env | Neon (Paulina's org) | secure notes `landingos .staging.vars` / `.production.vars` / `.env.staging` / `.env.production` |
| `GOOGLE_MAPS_API_KEY` | ds | per env (separate keys) | Google Cloud `landingos-prod` (Paulina) | `Google Maps key — staging` / `— production` |
| `AVIATIONSTACK_ACCESS_KEY` | ds | shared | AviationStack (Paulina) | `AviationStack — login + access key` |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_COOKIE_DOMAIN` | ds, ua | per env | generated | secure notes above |
| `API_TOKEN` (ds) ↔ `DATA_SERVICE_API_TOKEN` (ua) | ds, ua | per env | generated pair | secure notes above |
| `TURNSTILE_SECRET_KEY` (+ build-time `VITE_TURNSTILE_SITE_KEY`) | ds, ua | per env | Cloudflare Turnstile (Tomasz's account) | secure notes above |
| `ANALYTICS_PSEUDONYM_SECRET` | ds | per env | generated | secure notes above |
| `ALLOWED_ORIGINS`, `VITE_DATA_SERVICE_URL` | ds / ua | per env | config, not sensitive | secure notes above |
| `LANDINGOS_PROVIDER_MODE`, `LANDINGOS_{FLIGHT,PLACES,TRANSIT}_PROVIDER` | ds | per env | config (provider selection) | secure notes above |

## Dates and money

| Item | Value | Next action |
|---|---|---|
| Google Maps Platform ToS accepted by owner | _fill at onboarding_ | record date here (production-gate evidence) |
| Google budget alert | _e.g. 200 PLN/mo, 50/90/100%_ | review after first live month |
| Neon plan | Free → **Launch** ($19/mo) at pilot start | upgrade before production |
| AviationStack plan | Free (100 req/mo) → **Basic** ($49.99/mo, commercial licence) at pilot start | upgrade before `LANDINGOS_PROVIDER_MODE=live` in production |
| Domain `landingos.app` renewal | Cloudflare Registrar, Tomasz's card | annual |
| Key rotation cadence | Google + AviationStack keys yearly, or immediately on suspicion | set a reminder at onboarding |

## Rotation one-liners

- **Google Maps key**: GCP console → Credentials → create new key with the same API
  restrictions → update vault note + `apps/data-service/.{env}.vars` →
  `bash apps/data-service/sync-secrets.sh {env}` → delete old key.
- **AviationStack key**: dashboard → reset API access key → same sync flow (key is
  shared across envs).
- **Neon password**: Neon console → role → reset password → update `DATABASE_PASSWORD`
  in both apps' secret files + vault → sync both apps for that env.
- **Auth/API secrets** (`BETTER_AUTH_SECRET`, `API_TOKEN` pair, `ANALYTICS_PSEUDONYM_SECRET`):
  generate (`openssl rand -hex 32`), update vault + files, sync both apps. Rotating
  `BETTER_AUTH_SECRET` invalidates active sessions.

## If the collaboration ends

Paulina keeps, with no action needed: the database and all product data (Neon), the
Google Cloud project and keys, the AviationStack subscription, and the vault.

To take over the platform later she would additionally need (a planned migration, not
done today): the Cloudflare account contents (Workers, zone, Email Sending sender
domain, Turnstile widget), the `landingos.app` registration (Cloudflare Registrar
supports an inter-account move), and the GitHub repository (a repo transfer keeps
issues, secrets, and webhooks). Until then, revoking the developer means: remove him
from the Neon org, the GCP project IAM, and the Bitwarden collection, then rotate the
three provider credentials above.
