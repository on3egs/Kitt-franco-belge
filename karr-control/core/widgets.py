"""Widgets réutilisables pour l'interface curses KARR."""
import curses
import math
from core.colors import cp, bar_color, C_BORDER, C_TITLE, C_DIM, C_DEFAULT, C_OK, C_WARN, C_ERROR


def safe_addstr(win, y: int, x: int, text: str, attr: int = 0):
    """addstr sans lever d'exception si hors limites."""
    max_y, max_x = win.getmaxyx()
    if y < 0 or y >= max_y or x < 0 or x >= max_x:
        return
    available = max_x - x
    if available <= 0:
        return
    try:
        win.addstr(y, x, text[:available], attr)
    except curses.error:
        pass


def safe_addch(win, y: int, x: int, ch, attr: int = 0):
    """addch sans lever d'exception."""
    max_y, max_x = win.getmaxyx()
    if y < 0 or y >= max_y or x < 0 or x >= max_x:
        return
    try:
        win.addch(y, x, ch, attr)
    except curses.error:
        pass


def draw_box(win, y: int, x: int, h: int, w: int,
             title: str = "", color: int = None, title_color: int = None):
    """Boîte avec bordures Unicode et titre centré optionnel."""
    if color is None:
        color = cp(C_BORDER)
    if title_color is None:
        title_color = cp(C_TITLE) | curses.A_BOLD

    max_y, max_x = win.getmaxyx()
    if y + h > max_y or x + w > max_x or h < 2 or w < 2:
        return

    # Coins
    safe_addch(win, y,       x,       curses.ACS_ULCORNER, color)
    safe_addch(win, y,       x+w-1,   curses.ACS_URCORNER, color)
    safe_addch(win, y+h-1,   x,       curses.ACS_LLCORNER, color)
    safe_addch(win, y+h-1,   x+w-1,   curses.ACS_LRCORNER, color)

    # Lignes horizontales
    for i in range(1, w-1):
        safe_addch(win, y,     x+i, curses.ACS_HLINE, color)
        safe_addch(win, y+h-1, x+i, curses.ACS_HLINE, color)

    # Lignes verticales
    for i in range(1, h-1):
        safe_addch(win, y+i, x,     curses.ACS_VLINE, color)
        safe_addch(win, y+i, x+w-1, curses.ACS_VLINE, color)

    # Titre
    if title and w > 4:
        t = f" {title} "[:w-2]
        tx = x + max(1, (w - len(t)) // 2)
        safe_addstr(win, y, tx, t, title_color)


def draw_hbar(win, y: int, x: int, width: int, value: float,
              max_val: float = 100.0, label: str = "", fixed_color: int = None):
    """Barre de progression horizontale avec couleur automatique selon charge."""
    inner = width - 2
    if inner <= 0:
        return

    pct = min(max(value / max_val, 0.0), 1.0)
    filled = int(pct * inner)
    empty  = inner - filled

    color = fixed_color if fixed_color is not None else bar_color(pct * 100)

    safe_addch(win, y, x, ord('['), cp(C_DIM))
    safe_addstr(win, y, x+1,       "█" * filled, color)
    safe_addstr(win, y, x+1+filled,"░" * empty,  cp(C_DIM))
    safe_addch(win, y, x+inner+1,  ord(']'), cp(C_DIM))

    if label:
        safe_addstr(win, y, x+inner+3, label, cp(C_DIM))


def draw_vbar(win, y: int, x: int, height: int, value: float, max_val: float = 100.0):
    """Barre de progression verticale (vumètre mono)."""
    if height <= 0:
        return
    pct = min(max(value / max_val, 0.0), 1.0)
    filled = int(pct * height)

    for i in range(height):
        row = y + height - 1 - i
        if i < filled:
            if i < height * 0.6:
                color = cp(C_OK) | curses.A_BOLD
            elif i < height * 0.85:
                color = cp(C_WARN) | curses.A_BOLD
            else:
                color = cp(C_ERROR) | curses.A_BOLD
            safe_addstr(win, row, x, "█", color)
        else:
            safe_addstr(win, row, x, "░", cp(C_DIM))


def draw_double_vumeter(win, y: int, x: int, height: int,
                        left: float, right: float, max_val: float = 100.0):
    """Vumètre stéréo vertical (deux colonnes)."""
    draw_vbar(win, y, x,   height, left,  max_val)
    draw_vbar(win, y, x+2, height, right, max_val)
    safe_addstr(win, y+height, x,   "L", cp(C_DIM))
    safe_addstr(win, y+height, x+2, "R", cp(C_DIM))


def draw_label(win, y: int, x: int, label: str, value: str,
               label_attr: int = None, value_attr: int = None):
    """Affiche 'LABEL : valeur' avec attributs distincts."""
    if label_attr is None:
        label_attr = cp(C_DIM)
    if value_attr is None:
        value_attr = cp(C_DEFAULT) | curses.A_BOLD

    safe_addstr(win, y, x,              label, label_attr)
    safe_addstr(win, y, x + len(label), value, value_attr)


def draw_status_dot(win, y: int, x: int, active: bool, label: str = ""):
    """Point de statut coloré (● actif / ○ inactif)."""
    if active:
        safe_addstr(win, y, x, "●", cp(C_OK) | curses.A_BOLD)
    else:
        safe_addstr(win, y, x, "○", cp(C_DIM))
    if label:
        safe_addstr(win, y, x+2, label, cp(C_DEFAULT))


def draw_separator(win, y: int, x: int, w: int, label: str = ""):
    """Séparateur horizontal avec label centré optionnel."""
    color = cp(C_BORDER)
    if label:
        t = f"──[ {label} ]──"
        lx = x + (w - len(t)) // 2
        for i in range(x, x+w):
            safe_addch(win, y, i, curses.ACS_HLINE, color)
        safe_addstr(win, y, lx, t, cp(C_TITLE) | curses.A_BOLD)
    else:
        for i in range(x, x+w):
            safe_addch(win, y, i, curses.ACS_HLINE, color)


def draw_menu_list(win, y: int, x: int, w: int, items: list,
                   selected: int, scroll_offset: int = 0):
    """
    Menu liste vertical avec sélection et scroll.
    items = [(label, description), ...]
    """
    max_y, max_x = win.getmaxyx()
    visible = min(len(items) - scroll_offset, max_y - y - 1)

    for i in range(visible):
        idx = i + scroll_offset
        if idx >= len(items):
            break

        row = y + i
        if row >= max_y - 1:
            break

        label = items[idx][0] if isinstance(items[idx], (list, tuple)) else str(items[idx])
        label = label[:w-4]

        if idx == selected:
            prefix = " ► "
            attr = cp(C_SELECTED) | curses.A_BOLD
            # Remplir la ligne
            safe_addstr(win, row, x, " " * w, attr)
            safe_addstr(win, row, x, f"{prefix}{label}", attr)
        else:
            prefix = "   "
            attr = cp(C_DEFAULT)
            safe_addstr(win, row, x, f"{prefix}{label}", attr)


def draw_fkey_bar(win, items: list):
    """
    Barre de touches fonction en bas d'écran.
    items = [("F1", "MENU"), ("F2", "AUDIO"), ...]
    """
    max_y, max_x = win.getmaxyx()
    row = max_y - 1
    x = 0

    safe_addstr(win, row, 0, " " * max_x, cp(C_BORDER))

    for fkey, label in items:
        if x >= max_x - 1:
            break
        safe_addstr(win, row, x, fkey, cp(C_SELECTED) | curses.A_BOLD)
        x += len(fkey)
        safe_addstr(win, row, x, f" {label} ", cp(C_DIM))
        x += len(label) + 2


def wrap_text(text: str, width: int) -> list:
    """Découpe un texte en lignes de max `width` caractères."""
    if not text:
        return [""]
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            if len(current) + len(word) + 1 <= width:
                current = (current + " " + word).lstrip()
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines or [""]
