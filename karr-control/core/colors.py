"""Palettes de couleurs CRT rétro-futuristes pour curses."""
import curses

# ── IDs des paires de couleurs ────────────────────────────────────────────
C_DEFAULT    = 1   # Vert phosphore sur noir — texte courant
C_TITLE      = 2   # Amber brillant — titres, headers
C_BORDER     = 3   # Vert foncé — bordures, séparateurs
C_ALERT      = 4   # Rouge vif — erreurs, alertes critiques
C_SELECTED   = 5   # Noir sur vert — élément sélectionné (inversé)
C_DIM        = 6   # Vert sombre — texte secondaire, labels
C_CYAN       = 7   # Cyan — informations réseau, statuts
C_OK         = 8   # Vert brillant — statut OK, valeurs normales
C_WARN       = 9   # Jaune — avertissements, valeurs moyennes
C_ERROR      = 10  # Rouge — erreur, valeurs critiques
C_INPUT      = 11  # Blanc — saisie utilisateur
C_AI         = 12  # Vert phosphore brillant — réponses KARR
C_USER       = 13  # Amber — messages utilisateur
C_HEADER     = 14  # Amber fond noir — barre de titre globale
C_SEL_MENU   = 15  # Amber sur fond sombre — menu sélectionné


def init_colors():
    """Initialise toutes les paires de couleurs CRT."""
    curses.start_color()
    curses.use_default_colors()

    # Tenter des couleurs custom si terminal 256c
    if curses.can_change_color() and curses.COLORS >= 256:
        try:
            # Vert phosphore vif
            curses.init_color(200, 0, 824, 196)    # #00D232
            # Vert phosphore sombre
            curses.init_color(201, 0, 392, 94)     # #006418
            # Amber vif
            curses.init_color(202, 941, 706, 0)    # #F0B400
            # Amber sombre
            curses.init_color(203, 549, 392, 0)    # #8C6400
            # Rouge KARR
            curses.init_color(204, 862, 78, 78)    # #DC1414

            GRN  = 200
            DGRN = 201
            AMB  = 202
            DAMB = 203
            RED  = 204
        except Exception:
            GRN = DGRN = curses.COLOR_GREEN
            AMB = DAMB = curses.COLOR_YELLOW
            RED = curses.COLOR_RED
    else:
        GRN = DGRN = curses.COLOR_GREEN
        AMB = DAMB = curses.COLOR_YELLOW
        RED = curses.COLOR_RED

    BLK  = curses.COLOR_BLACK
    WHT  = curses.COLOR_WHITE
    CYN  = curses.COLOR_CYAN
    YEL  = curses.COLOR_YELLOW
    MAG  = curses.COLOR_MAGENTA

    curses.init_pair(C_DEFAULT,   GRN,  BLK)
    curses.init_pair(C_TITLE,     AMB,  BLK)
    curses.init_pair(C_BORDER,    DGRN, BLK)
    curses.init_pair(C_ALERT,     RED,  BLK)
    curses.init_pair(C_SELECTED,  BLK,  GRN)
    curses.init_pair(C_DIM,       DGRN, BLK)
    curses.init_pair(C_CYAN,      CYN,  BLK)
    curses.init_pair(C_OK,        GRN,  BLK)
    curses.init_pair(C_WARN,      YEL,  BLK)
    curses.init_pair(C_ERROR,     RED,  BLK)
    curses.init_pair(C_INPUT,     WHT,  BLK)
    curses.init_pair(C_AI,        GRN,  BLK)
    curses.init_pair(C_USER,      AMB,  BLK)
    curses.init_pair(C_HEADER,    AMB,  BLK)
    curses.init_pair(C_SEL_MENU,  BLK,  AMB)


def cp(n: int) -> int:
    """Raccourci : retourne curses.color_pair(n)."""
    return curses.color_pair(n)


def bar_color(pct: float) -> int:
    """Retourne la couleur d'une barre selon le pourcentage."""
    if pct >= 90:
        return cp(C_ERROR) | curses.A_BOLD
    if pct >= 75:
        return cp(C_WARN)
    return cp(C_OK)
