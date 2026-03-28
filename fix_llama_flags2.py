with open('/home/kitt/kitt-ai/start_kyronex.sh', 'r') as f:
    content = f.read()

# Ajouter --no-warmup avant --cache-ram 0
old = '    --cache-ram 0 \\\n    &'
new = '    --no-warmup \\\n    --cache-ram 0 \\\n    &'

if old in content:
    content = content.replace(old, new)
    with open('/home/kitt/kitt-ai/start_kyronex.sh', 'w') as f:
        f.write(content)
    print('[OK] --no-warmup ajoute')
else:
    print('[ERR] pattern non trouve')
    for i, line in enumerate(content.split('\n')):
        if 'cache' in line or 'warmup' in line or '&' == line.strip():
            print(f'  L{i}: {repr(line)}')
