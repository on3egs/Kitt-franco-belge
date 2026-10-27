# Pontiac Owners API (AGX integration)

The public site page is `client/src/pages/PontiacOwners.tsx`. GitHub Pages does
not host a database or accept photo uploads, so the dedicated module must be
registered on the existing KITT aiohttp service before the visitor form can
transmit profiles.

## Minimal additive integration

In `/home/kitt/kitt-ai/kyronex_server.py`:

1. Copy `pontiac_owners_api.py` beside `kyronex_server.py`.
2. Add this import beside the existing `community_music` import near the top:

   ```python
   from pontiac_owners_api import register_pontiac_owner_routes
   ```

3. In `create_app()`, add this call after the PDF `OPTIONS` routes and before
   the `# ── OBD-II Surveillance véhicule` section:

   ```python
   register_pontiac_owner_routes(app, admin_token=_ADMIN_TOKEN, notify=_send_telegram_new)
   ```

No existing handler or route needs to be replaced. `create_app()` already sets
`client_max_size=CD_UPLOAD_MAX_BYTES` to 250 MiB. After integration, restart
`kitt-kyronex.service` and verify `/api/pontiac-owners/approved` returns JSON,
then verify a new submission stays pending until moderation.

## Data and privacy

Profiles are written below `/home/kitt/kitt-ai/data/pontiac_owners/`. The API
only stores approximate location after an explicit opt-in, rounds it to a
2-degree grid, and never persists the visitor's entered coordinates. Pillow
re-encodes each JPEG to strip EXIF/GPS metadata. Public image routes only serve
approved profiles; pending previews and moderation actions require the existing
`KYRONEX_ADMIN_TOKEN`. Rejecting a profile removes its photo files. The gallery
caps the combined pending and approved profiles at 300, stores its directory
tree with mode `0700` and JSON/JPEG files with mode `0600`, and limits each
remote address to five submission POSTs per hour in memory. Source addresses
are not written to the profile store.

The review screen is `/admin-pontiac`. It keeps the admin token in memory only
and fetches pending previews through token-checked endpoints. The AGX already
has `aiohttp` and Pillow (`PIL 12.1.1`); this module was tested with an aiohttp
`TestServer` without installing dependencies.
