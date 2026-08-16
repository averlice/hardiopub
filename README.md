# hardiopub

A **hardened, self-hostable fork** of [audiopub-sv](https://github.com/the-byte-bender/audiopub-sv)
(the-byte-bender's AGPL-3.0 audio-sharing platform).

hardiopub keeps audiopub's features (upload, listen, live streaming, admin
moderation) but packages the deployment the way we actually run it in
production on a single Debian box:

- **Unprivileged service users** — the app runs as `audiopub`, streaming runs
  as `icecast-ap`. Neither has sudo.
- **Dedicated, loopback-only Icecast** — AudioPub's live-stream feature points
  at its *own* Icecast on `127.0.0.1:8001` with separate admin/source creds,
  instead of squatting on a shared radio server's Icecast.
- **Firejail sandbox profiles** — loopback-only network, dropped capabilities,
  seccomp, isolated `/tmp`/`/dev`. (See "Firejail status" below for the caveat.)
- **systemd units** with unit-level hardening (`NoNewPrivileges`,
  `ProtectSystem=strict`, restricted address families).
- **No SMTP / no push** — `NO_EMAIL=true` + `NO_PUSH_NOTIFICATIONS=true` because
  a personal instance has no mail server.
- **Production audio serving fix** — upstream ships the `/audio/[id]` route
  dev-only (it 403s in production, expecting a reverse proxy). hardiopub serves
  uploaded audio directly from the app, since this deployment has no reverse
  proxy (Cloudflare Tunnel → node directly).

## What works vs. upstream quirks we hit

| Problem | Fix in hardiopub |
| --- | --- |
| `/upload` returns 405 | Run the **adapter-node build entrypoint** (`build/index.js`), not the Express-wrapped `server.ts` (Express eats the multipart body). |
| Upload 500 `ENOENT audio/<id>` | Create the `audio/` and `images/` dirs (owned by the app user) under the repo root. |
| Playback dead (403) | `/audio/[id]` now serves in production (patched route). |
| App won't build | `PUBLIC_ONE_SIGNAL_APP_ID` must be defined at build time (may be empty). |
| App won't boot | `ICECAST_HOST`/`ICECAST_ADMIN_USER`/`ICECAST_ADMIN_PASSWORD` are required by `hooks.server.ts` (connection not required). |

## Requirements

- Node.js 22+ (for `--experimental-strip-types` if running `server.ts`, or just
  to run the compiled `build/index.js`)
- MariaDB/MySQL
- Icecast2 (for the dedicated streaming instance)
- firejail (optional, for sandboxing)
- A tunnel/reverse proxy for public access (e.g. Cloudflare Tunnel, Tailscale)

## Quick start

```bash
# 1. install deps + build
npm install
PUBLIC_ONE_SIGNAL_APP_ID= npm run build

# 2. create the upload dirs the app writes into
mkdir -p audio images
chown -R audiopub:audiopub audio images

# 3. db
mysql> CREATE DATABASE audiopub;
mysql> CREATE USER 'audiopub'@'127.0.0.1' IDENTIFIED BY '…';
mysql> GRANT ALL ON audiopub.* TO 'audiopub'@'127.0.0.1';
npm run db:migrate

# 4. configure
cp .env.example .env   # fill in real secrets (never commit .env!)

# 5. run (production entrypoint)
node build/index.js    # binds 127.0.0.1:3000
```

## Hardening layout (`deploy/`)

```
deploy/
  audiopub.profile          firejail profile for the app (loopback-only)
  audiopub.netfilter        loopback iptables rules
  icecast-ap.profile        firejail profile for the dedicated Icecast
  icecast-ap.netfilter      loopback iptables rules
  icecast-ap.xml            dedicated Icecast config (placeholder creds)
  audiopub.service          systemd unit (build/index.js, hardened)
  icecast-ap.service        systemd unit (firejailed, hardened)
```

Install them on the host:

```bash
cp deploy/audiopub.profile deploy/audiopub.netfilter /etc/firejail/
cp deploy/icecast-ap.profile deploy/icecast-ap.netfilter /etc/firejail/
install -o root -g root -m 644 deploy/icecast-ap.xml /etc/icecast-ap/icecast-ap.xml
install -o root -g root -m 644 deploy/audiopub.service /etc/systemd/system/
install -o root -g root -m 644 deploy/icecast-ap.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now audiopub icecast-ap
```

### Firejail status (read this)

- The **Icecast** firejail unit works when launched manually via
  `su icecast-ap` (loopback 8001, admin auth OK). The systemd unit carries an
  `ExecStartPre` workaround for a Debian firejail quirk where a stale
  read-only `/run/firejail` tmpfs from a previous run blocks the next launch.
- The **app** firejail profile is provided but the app currently runs via the
  plain systemd unit (unit-level hardening). We found firejail's `--user` flag
  and the `/run/firejail` read-only remount fought clean systemd integration,
  so we kept the app on systemd hardening + the loopback netfilter ready to
  layer back in. Treat the app firejail as experimental.

### Loopback-only by design

Both firejail netfilters drop all non-loopback traffic. The app binds
`127.0.0.1:3000`; the dedicated Icecast binds `127.0.0.1:8001`. Public access
is provided by your tunnel (Cloudflare Tunnel / Tailscale), which connects to
the loopback port — so the attack surface stays on localhost.

> Note: Cloudflare's *free* HTTP tunnel is not ideal for raw Icecast media
> streams (long-lived ICY connections, and free-tier TOS). For external
> streamers, prefer a TCP/Spectrum tunnel (paid) or expose 8001 over Tailscale
> to your streamers' tailnet.

## License

AGPL-3.0 — inherited from audiopub-sv. See `LICENSE`.
