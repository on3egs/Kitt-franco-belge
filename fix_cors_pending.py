"""
Fix missing CORS OPTIONS handlers for /api/music/pending and /api/pdfs/pending.
"""

with open('/home/kitt/kitt-ai/kyronex_server.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_music = '    app.router.add_route("OPTIONS", "/api/music/decide",   handle_music_options)'
new_music  = (old_music + '\n'
              '    app.router.add_route("OPTIONS", "/api/music/pending",  handle_music_options)\n'
              '    app.router.add_route("OPTIONS", "/api/music/approved", handle_music_options)')

old_pdfs = '    app.router.add_route("OPTIONS", "/api/pdfs/decide",    handle_pdfs_options)'
new_pdfs  = (old_pdfs + '\n'
             '    app.router.add_route("OPTIONS", "/api/pdfs/pending",   handle_pdfs_options)\n'
             '    app.router.add_route("OPTIONS", "/api/pdfs/approved",  handle_pdfs_options)')

fixed = content
changed = 0

if old_music in fixed:
    fixed = fixed.replace(old_music, new_music)
    changed += 1
    print('[OK] Music OPTIONS routes added')
else:
    print('[ERR] Music decide route not found')

if old_pdfs in fixed:
    fixed = fixed.replace(old_pdfs, new_pdfs)
    changed += 1
    print('[OK] PDF OPTIONS routes added')
else:
    print('[ERR] PDF decide route not found')

if changed > 0:
    with open('/home/kitt/kitt-ai/kyronex_server.py', 'w', encoding='utf-8') as f:
        f.write(fixed)
    print(f'[OK] {changed} change(s) written.')
else:
    print('[ERR] No changes applied.')
