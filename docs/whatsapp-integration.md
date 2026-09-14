# WhatsApp integration experiment

Status: experimental branch, 2026-09-07.

## Goal

Reuse the existing Space Safari web/PWA map for WhatsApp groups without using a phone number as the Space Safari login identity.

The official WhatsApp Groups API can expose `group_id` in inbound group-message webhooks. A normal browser link opened from an arbitrary WhatsApp group does **not** receive that group id, so the bridge has to originate from a group message handled by the configured WhatsApp Business integration.

## Flow

1. A participant sends `/map` or `/kaart` in an eligible WhatsApp API group.
2. Meta calls `POST /api/whatsapp/webhook`.
3. Space Safari verifies `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`.
4. The webhook reads `group_id` in memory and derives an opaque 32-character room token.
5. Space Safari replies to the WhatsApp group with `https://<APP_URL>/w/<token>`.
6. `/w/<token>` verifies that the token was issued by this server, creates a random pseudonymous browser identity such as `Safari 7A3F`, and redirects to `/map?room=<token>`.
7. The existing group map, location TTLs and projection pipeline are reused unchanged.

The WhatsApp group id is not embedded in a reversible form and this integration does not persist it as application data.

## Environment

Configure these only for the WhatsApp experiment:

```bash
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=
```

`MAP_ROOM_SECRET` should also be configured with a strong random secret. The existing Telegram webhook secret remains a fallback for room signing for backwards compatibility.

Configure Meta's webhook callback as:

```text
https://<APP_URL>/api/whatsapp/webhook
```

The GET verification handshake uses `WHATSAPP_VERIFY_TOKEN`. POST payloads are accepted only with a valid Meta app-secret signature.

## Privacy and threat model

- No WhatsApp phone number is used as a Space Safari login.
- Browser users get a random pseudonym and random negative internal user id.
- A WhatsApp guest session is cryptographically bound to exactly one room token.
- Editing the URL cannot turn that guest session into access to another private room.
- The room token is a bearer invite. Anyone who receives the exact link can open that room, so forwarded links remain the main leakage risk.
- Location sharing remains explicit opt-in and continues to use the existing Space Safari presence TTL behavior.

## Current Meta limitation

As of this experiment, Meta's Groups API is not a general replacement for ordinary consumer WhatsApp groups. Access is restricted to eligible WhatsApp Business accounts and API groups have product limits (including a small participant cap). Verify the current Meta documentation before treating this as production-ready.

This is why Telegram remains the primary integration and this branch is deliberately isolated.
