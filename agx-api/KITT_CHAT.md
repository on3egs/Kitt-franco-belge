# KITT community chat (MSN Chat style)

The website route is `/salon-kitt`. It uses the existing permanent KITT relay.
Visitors can read the public salons without an account. Posting requires an
approved Pontiac owner profile that includes at least one photo, plus the
shared permanent access code `1982`. The administrator token is never
sent to the website.

## Owner access flow

1. The visitor submits their Pontiac profile and one to four photos at
   `/communaute-pontiac#inscription`.
2. Manix reviews the private submission and approves it. Only then does the
   profile and its photos appear on the public globe and become selectable in
   the chat form.
3. Once approved, the owner selects their profile in the chat. The site shows
   the permanent shared code `1982` and fills it in automatically. No manual
   invitation from Manix is required.
4. The server rechecks the approved, photo-backed profile both when issuing the
   invitation and when the owner joins and opens the live chat. The profile's
   approved name is used as the chat identity. The shared code is a club access
   code; it is not a personal credential proving ownership of a selected profile.

To issue a code from a trusted AGX shell, send the approved profile ID to this
endpoint with the admin token held only on the server:

```http
POST /api/kitt-chat/invitations
X-Admin-Token: <KYRONEX_ADMIN_TOKEN>
Content-Type: application/json

{"ownerId":"<APPROVED_PROFILE_ID>"}
```

This compatibility endpoint returns the same reusable code `1982`, with
`expiresInSeconds: null`. It checks the approved profile and still requires
administrator authorization. The normal visitor flow needs no invitation
issuance call.

## AGX integration

The server must import both helpers from the Pontiac API and register chat with
the approved-owner lookup:

```python
from pontiac_owners_api import get_approved_owner, register_pontiac_owner_routes
from kitt_chat_api import register_kitt_chat_routes
```

Inside `create_app()`, after `_ADMIN_TOKEN` has been defined and the Pontiac
routes are registered:

```python
register_kitt_chat_routes(
    app, admin_token=_ADMIN_TOKEN, owner_lookup=get_approved_owner
)
```

Run `python3 -m py_compile pontiac_owners_api.py kitt_chat_api.py kyronex_server.py`
and restart `kitt-kyronex.service` after changing the server.

## Visitor and privacy limits

- Visitors choose a temporary pseudo for each visit, can read the latest 30
  messages and write in public rooms. Their pseudo is not registered as a
  Pontiac account. They appear in the presence list with the “Invite” role.
- Public visitors are capped at 50 simultaneous connections and 30 connection
  attempts per source address per ten minutes; each connection may post up to
  eight messages per ten seconds. Buzz and owner-only tools remain restricted.
- The shared code and member sessions have no time-based expiration. A session is remembered in
  the browser's `localStorage`; **Quitter le salon** only closes the connection.
  **Oublier cet appareil** clears the saved session. The AGX stores only a hash
  of each session token in a private file, so sessions survive a server restart.
  Approval is checked whenever a member reconnects. Up to five device sessions
  are retained for a profile; creating another replaces the oldest remembered
  device session. Re-entering `1982` can reconnect that device later.
- The Pontiac admin page remembers its admin token in that browser after a
  successful login and loads the private queue automatically. **Oublier ce
  jeton** clears it from that device.
- The four salons have no direct messaging or location sharing. Member posts
  are limited to eight per ten seconds and 500 characters each.
- Each room retains up to 500 messages for at most 90 days, persisted on the
  AGX. Mission notes are opt-in and can be edited or deleted by the member.
  There are no individual expiring invitation codes.
