#!/usr/bin/env python3
# patch_smart_history.py
# Injecte _trim_history() dans kyronex_server.py et remplace les 2 history[-6:]

TARGET = "/home/kitt/kitt-ai/kyronex_server.py"

# ── Fonction helper a inserer apres get_system_prompt ──
HELPER = '''
# ── Trim intelligent de l historique (evite depassement ctx) ────────────────
_CTX_SIZE   = 1536   # tokens max du modele
_MAX_REPLY  = 320    # tokens reserves pour la reponse
_SAFETY     = 80     # marge de securite

def _trim_history(history: list, sys_prompt: str, user_msg: str) -> list:
    """Retourne le sous-ensemble de l historique qui tient dans le budget tokens.
    Priorite aux echanges les plus recents. Garde toujours au minimum 1 echange (2 msgs)."""
    def _tok(s: str) -> int:
        return max(1, len(s) // 4)

    budget = _CTX_SIZE - _tok(sys_prompt) - _tok(user_msg) - _MAX_REPLY - _SAFETY
    if budget <= 0:
        return []

    # Parcourt l historique de la fin vers le debut
    kept = []
    used = 0
    msgs = list(history)  # copie
    # Itere par paires (user+assistant) pour garder des echanges complets
    pairs = []
    i = len(msgs) - 1
    while i >= 0:
        if msgs[i]["role"] == "assistant" and i > 0 and msgs[i-1]["role"] == "user":
            pairs.append((msgs[i-1], msgs[i]))
            i -= 2
        else:
            # Message orphelin : on l inclut seul
            pairs.append((msgs[i],))
            i -= 1

    for pair in pairs:
        pair_tokens = sum(_tok(m.get("content","")) for m in pair)
        if used + pair_tokens <= budget:
            used += pair_tokens
            kept = list(pair) + kept
        else:
            break  # plus de budget, on arrete

    return kept

'''

# ── Remplacements dans le code ──
OLD_QUERY  = "    messages = [{'role': 'system', 'content': get_system_prompt(user_name, user_lang, mac)}]\n    messages.extend(history[-6:])\n    messages.append({'role': 'user', 'content': enriched_msg})"
NEW_QUERY  = "    _sp_q = get_system_prompt(user_name, user_lang, mac)\n    messages = [{'role': 'system', 'content': _sp_q}]\n    messages.extend(_trim_history(history, _sp_q, enriched_msg))\n    messages.append({'role': 'user', 'content': enriched_msg})"

OLD_STREAM = "    messages = [{'role': 'system', 'content': sys_prompt}]\n    messages.extend(conversations[session_id][-6:])\n    messages.append({'role': 'user', 'content': llm_user_msg})"
NEW_STREAM = "    messages = [{'role': 'system', 'content': sys_prompt}]\n    messages.extend(_trim_history(conversations[session_id], sys_prompt, llm_user_msg))\n    messages.append({'role': 'user', 'content': llm_user_msg})"

ANCHOR = "# Compatibilite \u2014 utilise par query_llm (non-streaming)\nSYSTEM_PROMPT = _BASE_PROMPT"

with open(TARGET, "r", encoding="utf-8") as f:
    src = f.read()

# 1. Insere le helper apres get_system_prompt
if "_trim_history" in src:
    print("Helper deja present, on saute l insertion.")
else:
    if ANCHOR in src:
        src = src.replace(ANCHOR, ANCHOR + "\n" + HELPER)
        print("Helper insere.")
    else:
        print("ANCHOR introuvable — insertion impossible.")

# 2. Remplace dans query_llm (non-streaming)
if "history[-6:]" in src:
    src = src.replace(
        "    messages = [{\"role\": \"system\", \"content\": get_system_prompt(user_name, user_lang, mac)}]\n    messages.extend(history[-6:])\n    messages.append({\"role\": \"user\", \"content\": enriched_msg})",
        "    _sp_q = get_system_prompt(user_name, user_lang, mac)\n    messages = [{\"role\": \"system\", \"content\": _sp_q}]\n    messages.extend(_trim_history(history, _sp_q, enriched_msg))\n    messages.append({\"role\": \"user\", \"content\": enriched_msg})"
    )
    print("Remplacement query_llm OK.")
else:
    print("WARN: pattern query_llm non trouve.")

# 3. Remplace dans handle_chat_stream (streaming)
if "conversations[session_id][-6:]" in src:
    src = src.replace(
        "    messages = [{\"role\": \"system\", \"content\": sys_prompt}]\n    messages.extend(conversations[session_id][-6:])\n    messages.append({\"role\": \"user\", \"content\": llm_user_msg})",
        "    messages = [{\"role\": \"system\", \"content\": sys_prompt}]\n    messages.extend(_trim_history(conversations[session_id], sys_prompt, llm_user_msg))\n    messages.append({\"role\": \"user\", \"content\": llm_user_msg})"
    )
    print("Remplacement streaming OK.")
else:
    print("WARN: pattern streaming non trouve.")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(src)

print("Patch termine.")
