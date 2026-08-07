# GroundworkOS Network API

A small, standalone directory service for the GroundworkOS Network. Where the main GroundworkOS app is deployed once per contractor (each contractor has their own database and no visibility into any other contractor's data), this service is the one piece that is shared: it lets a subcontractor maintain a single verified identity (CIS status, insurance, CSCS/plant tickets) that any number of GroundworkOS contractor deployments can invite, look up and link to, instead of every contractor re-collecting the same paperwork.

## Why a separate service

Each GroundworkOS instance is single-tenant (one contractor, one database). A genuine two-sided network, where a groundworker's verified profile is visible to every contractor they work for, has to live somewhere that isn't owned by any single contractor. This service is that shared place. It is intentionally minimal: plain Express and `pg`, no ORM, no build toolchain beyond `tsc`, so it is cheap to host on its own (e.g. a small Railway service with its own Postgres database) alongside the main app.

## How it fits together

- A contractor's GroundworkOS instance calls this service (using a per-contractor API key) to invite a subcontractor onto the network, search for a subcontractor who is already on it, or link an existing profile to their own local subcontractor record.
- The subcontractor themselves never needs an account or password. They get a link to `/portal/:claimToken`, a plain HTML page served directly by this service, where they fill in their own CIS/insurance/certification details once.
- Every contractor who has linked that same profile can then read back the verified data through this service, instead of asking the subcontractor to re-enter it.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string for this service's own database (separate from any contractor's GroundworkOS database). |
| `NETWORK_ADMIN_SECRET` | yes | Shared secret required to call `POST /admin/contractors` and mint a new contractor API key. Keep this out of any contractor-facing config. |
| `PORT` | no | Defaults to `4001`. |

## Deploying

1. Provision a new small Postgres database and a place to run a Node process (e.g. a second Railway service in the same project, or any host that can run `node`).
2. Set `DATABASE_URL` and `NETWORK_ADMIN_SECRET`, then run `pnpm --filter @workspace/network-api run build` followed by `pnpm --filter @workspace/network-api run start`. Tables are created automatically on first boot.
3. For each contractor that should join the network, call `POST /admin/contractors` once (see below) and give that contractor's GroundworkOS deployment the returned `apiKey` as `NETWORK_API_URL` / `NETWORK_API_KEY`.

## API reference

All endpoints below except the two `by-token` endpoints and `/portal/:token` require an `x-api-key` header identifying the calling contractor.

- `POST /admin/contractors` (`x-admin-secret` header) - `{ name }` -> `{ id, name, apiKey }`. Registers a new contractor and issues its API key.
- `POST /profiles` - `{ companyName, contactName?, email?, phone?, utrNumber?, localSubcontractorId }` -> `{ id, claimToken }`. Creates a network profile and an invite link for a subcontractor.
- `GET /profiles/search?q=` -> matching profiles. Lets a contractor find a subcontractor who is already on the network instead of re-inviting them.
- `POST /profiles/:profileId/link` - `{ localSubcontractorId }`. Links an existing profile to the calling contractor's own subcontractor record.
- `GET /profiles/:profileId` -> the profile.
- `GET /profiles/by-token/:token` (public) -> the profile, for the subcontractor-facing portal.
- `PATCH /profiles/by-token/:token` (public) -> updates the subcontractor-editable fields (contact details, insurance, CSCS/NRSWA cards).
- `GET /portal/:token` (public) -> the HTML page a subcontractor uses to view/edit their own profile.
