# KITT community chat (MSN Chat style)

The website route is `/salon-kitt`. It uses the existing permanent KITT relay.
Visitors can read the public salons without an account. Posting requires an
approved Pontiac owner profile that includes at least one photo, plus a
one-use invitation bound to that profile. The administrator token is never
sent to the website.

## Owner access flow

1. The visitor submits their Pontiac profile and one to four photos at
   `/communaute-pontiac#inscription`.
2. Manix reviews the private submission and approves it. Only then does the
   profile and its photos appear on the public globe and become selectable in
   the chat form.
3. When Manix approves a profile in `/admin-pontiac`, the site creates a
   one-use code bound to that profile and displays it once. Manix copies it and
   sends it privately to the owner, who selects the same Pontiac profile and
   enters the code on the chat page.
4. The server rechecks the approved, photo-backed profile both when issuing the
   invitation and when the owner joins and opens the live chat. The profile's
   approved name is used as the chat identity; the browser cannot choose a
   different name or profile ID.

To issue a code from a trusted AGX shell, send the approved profile ID to this
endpoint with the admin token held only on the server:

```http
POST /api/kitt-chat/invitations
X-Admin-Token: <KYRONEX_ADMIN_TOKEN>
Content-Type: application/json

{"ownerId":"<APPROVED_PROFILE_ID>"}
```

The code expires after seven days, is single-use, and is cryptographically
bound to the selected profile. Do not publish it. The endpoint permits up to
250 active invitations. The admin page calls it automatically after approval;
the endpoint is also available for a trusted server-side retry if generation
was interrupted.

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

- Guests can read up to 30 recent messages per room and see member pseudonyms.
  Guests are not included in the online member count and cannot post; the
  server rejects their write attempts even if they bypass the page controls.
- The guest preview is capped at 50 simultaneous visitors and 30 connection
  attempts per source address per ten minutes.
- Members use the invitation code once. Their 365-day session is remembered in
  the browser's `localStorage`; **Quitter le salon** only closes the connection.
  **Oublier cet appareil** clears the saved session. The AGX stores only a hash
  of each session token in a private file, so sessions survive a server restart.
  Approval is checked whenever a member reconnects.
- The Pontiac admin page remembers its admin token in that browser after a
  successful login and loads the private queue automatically. **Oublier ce
  jeton** clears it from that device.
- The four salons have no direct messaging or location sharing. Member posts
  are limited to eight per ten seconds and 500 characters each.
- Messages and unused invitation codes stay in server memory. Each room
  retains up to 100 recent lines. A KYRONEX restart clears messages and unused
  invitation codes, but remembered member sessions remain valid. No transcript
  is persisted.
