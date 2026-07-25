# First deploy: Hetzner + Hostinger DNS

Step-by-step guide for bringing Scout up on a **Hetzner Cloud VPS** with DNS at
**Hostinger**. TLS is handled by **Caddy on the host**; Scout runs in Docker on
an internal port.

For the host-neutral contract and other providers, see
[`runbooks/first-deploy.md`](runbooks/first-deploy.md).

## What you end up with

```
Browser ──HTTPS──► Caddy on the VPS (:443)
                      │
                      └──HTTP──► Scout Docker (:8080)
                                      ├── in-image Caddy
                                      ├── FastAPI (/api/*)
                                      └── Next.js (everything else)
                   PostGIS (Docker, internal only)
```

## Before you start

Gather:

| Item | Notes |
| --- | --- |
| **Domain** | e.g. `scout-dc.com` registered at Hostinger |
| **OpenRouteService key** | [Sign up](https://openrouteservice.org/dev/#/signup); free tier is enough for launch |
| **SSH key pair** | Add the public key when creating the Hetzner server |
| **Hetzner Cloud account** | [console.hetzner.cloud](https://console.hetzner.cloud) |

---

## 1. Create the Hetzner server

1. **New Project** → **Add Server**.
2. **Location:** `fsn1` (Falkenstein) or `nbg1` (Nuremberg) — EU regions are
   GWF-verified green per [`docs/proposals/green-hosting-shortlist.md`](../docs/proposals/green-hosting-shortlist.md).
3. **Image:** Ubuntu 24.04 LTS.
4. **Type:** CX22 or larger (2 vCPU / 4 GB RAM minimum for the first build).
5. **SSH key:** select yours.
6. Create the server and note the **public IPv4**.

### Firewall (recommended)

Create a Hetzner Cloud Firewall and attach it to the server:

| Direction | Protocol | Port | Source |
| --- | --- | --- | --- |
| Inbound | TCP | 22 | Your IP (or `0.0.0.0/0` if needed) |
| Inbound | TCP | 80 | `0.0.0.0/0` |
| Inbound | TCP | 443 | `0.0.0.0/0` |

Do **not** expose Postgres (`5432`) publicly.

### SSH in

If your key has a non-default name, pass it explicitly or add a `~/.ssh/config`
entry:

```bash
ssh -i ~/.ssh/your-key-name root@YOUR_SERVER_IP
```

Optional but recommended: create a non-root deploy user with sudo and log in as
that user for the steps below.

---

## 2. Install Docker

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

If you use a non-root user:

```bash
sudo usermod -aG docker YOUR_USER
# log out and back in
```

---

## 3. Point Hostinger DNS at Hetzner

In Hostinger → **Domains** → your domain → **DNS / DNS Zone**:

| Type | Name | Points to |
| --- | --- | --- |
| **A** | `@` | `YOUR_HETZNER_IP` |
| **A** | `www` | `YOUR_HETZNER_IP` |

Also:

- Remove conflicting **A** / **AAAA** records (parking, website builder, old
  hosting).
- Disable **domain forwarding** / **URL redirect** if enabled.
- Leave **MX** / email **TXT** records alone if you use mail on this domain.
- You do **not** need Hostinger SSL — Caddy on the server handles HTTPS.

Verify propagation from your laptop:

```bash
dig +short yourdomain.com A
```

---

## 4. Clone Scout and configure secrets

```bash
sudo mkdir -p /opt/scout
sudo chown "$USER":"$USER" /opt/scout   # skip if logged in as root
cd /opt
git clone https://github.com/RSid/scout.git
cd scout
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set:

```bash
SCOUT_DB_PASSWORD='generate-a-long-random-password'
SCOUT_ORS_API_KEY='eyJ...your-token...'
SCOUT_HTTP_PORT=8080
```

`SCOUT_HTTP_PORT` must stay **8080** when host Caddy owns ports 80 and 443.
You do not need to set `SCOUT_DATABASE_URL` for prod Compose — it is built
from `SCOUT_DB_PASSWORD` inside [`docker-compose.prod.yml`](docker-compose.prod.yml).

---

## 5. Build and start the stack

Always pass **`--project-directory .`** so Compose reads `.env` from the repo
root (not `infra/.env`).

```bash
cd /opt/scout
docker compose --project-directory . -f infra/docker-compose.prod.yml up -d --build
```

The first build can take 10–20+ minutes. Watch logs:

```bash
docker compose --project-directory . -f infra/docker-compose.prod.yml logs -f app
```

Smoke-test on the server:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

---

## 6. Load data (first deploy only)

Run once after the database is healthy. Order matters — `ingest-pois` joins
against `dc_addresses` by MAR_ID, and `ingest-street-segments` stamps each
feature's `street_name` via a KNN update, so features and addresses must be
loaded first:

```bash
docker compose --project-directory . -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-features
docker compose --project-directory . -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-addresses
docker compose --project-directory . -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-pois
docker compose --project-directory . -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-street-segments
```

All four scripts are idempotent UPSERTs. Re-run only after recreating the
database volume or when intentionally refreshing data (see
[`runbooks/refresh-dc-addresses.md`](runbooks/refresh-dc-addresses.md)).

Confirm features loaded:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

The `features` count in the response should be greater than zero.

---

## 7. Install Caddy and enable HTTPS

Scout serves plain HTTP inside Docker. Caddy on the host terminates TLS.

### Install Caddy

On Ubuntu 24.04 the simplest path is often the distro package:

```bash
sudo apt update
sudo apt install -y caddy
caddy version
```

If the Cloudsmith repository install fails, the Ubuntu package is fine for a
reverse proxy.

### Configure Caddy

Replace `yourdomain.com` and the email address:

```bash
sudo tee /etc/caddy/Caddyfile <<'EOF'
{
	email you@example.com
}

http://yourdomain.com {
	redir https://yourdomain.com{uri} permanent
}

https://yourdomain.com {
	reverse_proxy 127.0.0.1:8080 {
		header_up Host {host}
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-Host {host}
	}

	handle_errors {
		root * /var/www/scout-maintenance
		rewrite * /index.html
		file_server
	}
}

http://www.yourdomain.com {
	redir https://yourdomain.com{uri} permanent
}

https://www.yourdomain.com {
	redir https://yourdomain.com{uri} permanent
}
EOF

sudo rm -f /etc/caddy/Caddyfile.d/*
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

> **Important:** keep HTTP and HTTPS in **separate blocks**. An unconditional
> `redir https://…` inside a combined `yourdomain.com { }` block redirects HTTPS
> requests to the same URL and causes a redirect loop.

### Install the maintenance page

The `handle_errors` block above serves a static page when the app container is
unreachable (during deploys or restarts). Copy it into place:

```bash
sudo mkdir -p /var/www/scout-maintenance
sudo cp infra/maintenance/index.html /var/www/scout-maintenance/index.html
```

To test it, stop the app container and visit the site — you should see the
maintenance page instead of a Caddy error. Start the app again to resume.

Confirm ports:

```bash
sudo lsof -iTCP:80 -sTCP:LISTEN    # caddy
sudo lsof -iTCP:443 -sTCP:LISTEN   # caddy
sudo lsof -iTCP:8080 -sTCP:LISTEN  # docker-proxy
```

---

## 8. Verify end-to-end

```bash
curl -sI --max-redirs 0 http://yourdomain.com/   | grep -iE '^HTTP|^location'   # 301/308 → https
curl -sI --max-redirs 0 https://yourdomain.com/  | grep -iE '^HTTP|^location'   # 200
curl -fsS https://yourdomain.com/api/health
```

In a browser, open `https://yourdomain.com/plan` and confirm the map, address
search, and route planning work.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `set SCOUT_DB_PASSWORD in .env` | Compose reading wrong `.env` | Add `--project-directory .` to every compose command |
| Build OOM / killed | Server too small | Resize to CX32 or add swap |
| `308` on HTTP, loop on HTTPS | Unconditional `redir` in Caddyfile | Use the split HTTP/HTTPS config in step 7 |
| Health OK, no autocomplete | MAR not loaded | Run `ingest-addresses` |
| Health OK, landmark names not searchable | POIs not loaded | Run `ingest-pois` (requires `ingest-addresses` first) |
| Health OK, street names missing from popups | Street segments not loaded | Run `ingest-street-segments` (requires features loaded first) |
| Health OK, routing fails | Missing ORS key | Set `SCOUT_ORS_API_KEY` in `.env` and recreate the app container |
| DNS OK but HTTPS fails | Port 80/443 blocked or Caddy down | Check Hetzner firewall and `sudo systemctl status caddy` |

Diagnostic commands:

```bash
curl -sI -H "Host: yourdomain.com" http://127.0.0.1:8080/          # expect 200
curl -sI --max-redirs 0 https://yourdomain.com/ | grep -i location   # expect no 301 loop
sudo journalctl -u caddy -n 40 --no-pager
```

---

## Next steps

- **Subsequent deploys:** see the [Deploy](../readme.md#deploy) section in the
  top-level README.
- **Refresh DC address data:** [`runbooks/refresh-dc-addresses.md`](runbooks/refresh-dc-addresses.md).
- **Third-party TOS review before public launch:** AGENTS.md rule #12 and
  [`docs/proposals/green-hosting-shortlist.md`](../docs/proposals/green-hosting-shortlist.md) §6.
