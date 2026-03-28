with open('C:/Users/ON3EG/Documents/kitt-franco-belge/client/src/pages/Musique.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = [
    ('\u00e2\u20ac\u201d',               '\u2014'),      # â€" -> — (em dash)
    ('\u00f0\u0178\u201d\u2021',         '\U0001f507'),  # ðŸ"‡ -> 🔇
    ('\u00f0\u0178\u201d\u0160',         '\U0001f50a'),  # ðŸ"Š -> 🔊
    ('Pr\u00c3\u00a9c\u00c3\u00a9dent', 'Pr\u00e9c\u00e9dent'),  # Précédent
    ('\u00e2\u00ae',                      '\u23ee'),      # â® -> ⏮
    ('\u00e2\u00b8',                      '\u23f8'),      # â¸ -> ⏸
    ('\u00e2\u2013\u00b6',               '\u25b6'),      # â–¶ -> ▶
    ('\u00e2\u00ad',                      '\u23ed'),      # â­ -> ⏭
    ('\u00e2\u2013\u00a0',               '\u25a0'),      # â– -> ■
    ('\u00e2\u2020\u00c3\u02c6',         '\u2190'),      # â†Ã^ -> ←
]

changed = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        changed += 1

with open('C:/Users/ON3EG/Documents/kitt-franco-belge/client/src/pages/Musique.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Fixed {changed}/{len(fixes)} patterns OK')
# Additional fixes
