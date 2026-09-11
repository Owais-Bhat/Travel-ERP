# Self-hosted Jitsi Meet — setup runbook

Powers the in-app "Video Classes" classroom (`mode: 'jitsi'`). This is
infrastructure that runs on your Hostinger VPS, separate from the app
deploy — nothing here is built/deployed by `git push`.

## 1. Prerequisites

- A Hostinger VPS with a public IPv4 address and Docker + Docker Compose installed.
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- A domain/subdomain you control (e.g. `meet.yourdomain.com`) pointed at the
  VPS's IP via an **A record** in DNS. Wait for it to resolve
  (`ping meet.yourdomain.com`) before continuing — Jitsi's automatic TLS
  step will fail otherwise.
- Firewall/security-group ports open on the VPS:
  - `80/tcp`, `443/tcp` — web + Let's Encrypt certificate issuance
  - `10000/udp` — the JVB video bridge (**the one everyone forgets** — if
    calls connect but no audio/video ever appears, this is almost always why)
  - `4443/tcp` — fallback for the video bridge when UDP is blocked on the
    client's network

## 2. Deploy the stack

```bash
git clone https://github.com/jitsi/docker-jitsi-meet.git
cd docker-jitsi-meet
cp env.example .env
./gen-passwords.sh
```

Edit `.env` and set at minimum:

```
PUBLIC_URL=https://meet.yourdomain.com
LETSENCRYPT_DOMAIN=meet.yourdomain.com
LETSENCRYPT_EMAIL=you@yourdomain.com
ENABLE_LETSENCRYPT=1
```

Then bring it up:

```bash
mkdir -p ~/.jitsi-meet-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}
docker compose up -d
```

First boot takes a minute while Let's Encrypt issues the certificate —
watch it with `docker compose logs -f web`.

## 3. Verify

```bash
curl -I https://meet.yourdomain.com
```

should return `200 OK`. Then open `https://meet.yourdomain.com/test-room`
in two separate browser tabs (or a laptop + phone) and confirm you can see
and hear both sides — this is the real test, since the room UI can load
fine even when the `10000/udp` firewall rule is missing and media never
connects.

## 4. Wire it into the app

Set on the backend (`backend/.env`, see `backend/.env.example`):

```
JITSI_DOMAIN=meet.yourdomain.com
```

Restart the backend process. `GET /institutions/current` will now report
`jitsi_enabled: true`, which makes the "In-app classroom" option appear in
Video Classes' schedule modal.

## 5. `docker-compose.override.yml` in this folder

Optional starting point for institution-specific tuning (resource limits,
recording via Jibri, etc.) — copy it into your `docker-jitsi-meet` checkout
as `docker-compose.override.yml` and adjust before `docker compose up -d`.
Not required for a basic working setup.
