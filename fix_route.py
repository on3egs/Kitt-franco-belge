with open('/home/kitt/kitt-ai/kyronex_server.py', 'r', encoding='utf-8') as f:
    content = f.read()

old = '    app.router.add_route("OPTIONS", "/api/videos/decide",   handle_video_options)'
new = (
    '    app.router.add_route("OPTIONS", "/api/videos/decide",   handle_video_options)\n'
    '    app.router.add_post("/api/videos/view/{id}", handle_video_view)\n'
    '    app.router.add_route("OPTIONS", "/api/videos/view/{id}", handle_video_options)'
)

if old in content:
    content = content.replace(old, new)
    with open('/home/kitt/kitt-ai/kyronex_server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('route added')
else:
    print('target not found')
