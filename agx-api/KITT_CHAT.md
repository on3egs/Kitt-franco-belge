# KITT community chat (MSN Chat style)

The website route is `/salon-kitt`. The React client calls the KYRONEXT API
through the existing permanent KITT relay. No admin token is placed in the
website.

## AGX integration

Copy `kitt_chat_api.py` beside `/home/kitt/kitt-ai/kyronex_server.py`. Add this
import next to the other API imports:

```python
from kitt_chat_api import register_kitt_chat_routes
```

Inside `create_app()`, after `app = web.Application(...)` and after `_ADMIN_TOKEN`
has been defined, register the routes before `return app`:

```python
register_kitt_chat_routes(app, admin_token=_ADMIN_TOKEN)
```

Then run `python3 -m py_compile kitt_chat_api.py kyronex_server.py` and restart
`kitt-kyronex.service`. The front end reports the room offline until
`GET /api/kitt-chat/status` succeeds.

## Inviting a verified owner

Manix first verifies the person through the community, then creates a one-use
code prebound to the exact nickname. Call this endpoint from a trusted admin
session; substitute the admin token in the local shell without putting it in
the website or a public command transcript:

```http
POST /api/kitt-chat/invitations
X-Admin-Token: <KYRONEX_ADMIN_TOKEN>
Content-Type: application/json

{"name":"Pilote86"}
```

The response contains the one-time code. Send it privately to that verified
owner. It expires after seven days, is consumed on first successful use, and is
bound to the requested nickname. The API permits up to 250 active invites.
Invite sessions and online membership are checked by the server, not by the
browser.

## Current MVP boundaries

- The chat is restricted to administrator-issued, one-use invitations. The
  invite route requires `KYRONEXT_ADMIN_TOKEN`; it is never sent to the page.
- Members authenticate over the encrypted WebSocket with a short-lived session
  token. The page keeps it in `sessionStorage`, which is cleared when the user
  leaves the room.
- Presence is pseudonym-only. The chat does not request or reveal a member's
  location, and direct messages are not implemented.
- Messages and sessions stay in server memory: up to 100 recent messages per
  room, eight messages per member per ten seconds, and 80 connected members.
  A KYRONEXT restart clears messages and sessions; owners must request a fresh
  invite afterwards. No transcript is persisted.
- The website addition does not itself integrate or restart the live AGX
  service. A server operator must apply the two-line integration above.
