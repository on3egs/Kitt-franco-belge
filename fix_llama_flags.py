with open('/home/kitt/kitt-ai/start_kyronex.sh', 'r') as f:
    content = f.read()

old = '    --defrag-thold 0.1 \\\n    &'
new = '    --cache-ram 0 \\\n    &'

if old in content:
    content = content.replace(old, new)
    with open('/home/kitt/kitt-ai/start_kyronex.sh', 'w') as f:
        f.write(content)
    print('[OK] --defrag-thold remplace par --cache-ram 0')
else:
    print('[ERR] Ligne non trouvee, contenu autour de defrag:')
    for i, line in enumerate(content.split('\n')):
        if 'defrag' in line or 'cache' in line:
            print(f'  L{i}: {repr(line)}')
