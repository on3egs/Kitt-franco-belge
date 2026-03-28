import re

with open('/home/kitt/kitt-ai/kyronex_server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove broken function
content = re.sub(
    r'\nasync def handle_video_view.*?(?=\nasync def handle_video_submit)',
    '\n',
    content,
    flags=re.DOTALL
)

func = (
    "\nasync def handle_video_view(request: web.Request) -> web.Response:\n"
    "    vid_id = request.match_info.get(\"id\", \"\")\n"
    "    data = _video_load()\n"
    "    for lst in (data[\"approved\"], data[\"pending\"]):\n"
    "        for v in lst:\n"
    "            if v[\"id\"] == vid_id:\n"
    "                v[\"views\"] = v.get(\"views\", 0) + 1\n"
    "                _video_save(data)\n"
    "                return _video_cors(web.json_response({\"ok\": True, \"views\": v[\"views\"]}))\n"
    "    return _video_cors(web.json_response({\"ok\": False, \"error\": \"Not found\"}, status=404))\n\n"
)

content = content.replace('\nasync def handle_video_submit', func + 'async def handle_video_submit', 1)

with open('/home/kitt/kitt-ai/kyronex_server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
