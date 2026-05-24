"""Répliques de KARR aux gros mots - Style cynique, humour noir, sarcastique.

Ce module contient les réponses pré-enregistrées de KARR lorsque l'utilisateur
utilise des gros mots. Chaque mot a 50 réponses uniques, jouées aléatoirement.

Les répliques sont générées avec la voix KARR et stockées en cache.
"""
from __future__ import annotations

import random
import re
import subprocess
import threading
from pathlib import Path

from . import paths

# Répertoire de stockage des répliques audio KARR
_KARR_REPLIES_DIR = paths.STATE_DIR / "karr_replies"

# ============================================================================
# MOTS INTERDITS ET LEURS CATÉGORIES
# ============================================================================

# Regex -> catégorie
SWEAR_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Putain et variantes
    (re.compile(r"\b(putain|putin|p[u*]tain|put1|pute)\b", re.I), "putain"),
    # Merde et variantes
    (re.compile(r"\b(merde|m[e*]rde|merd|mrd)\b", re.I), "merde"),
    # Connard et variantes
    (re.compile(r"\b(connard|conard|connrd|c[o*]nnard|conar)\b", re.I), "connard"),
    # Con et variantes
    (re.compile(r"\b(c[o0]n\b|c[o0]ns\b|connard|connasse|conne)\b", re.I), "con"),
    # Bordel et variantes
    (re.compile(r"\b(bordel|b[o*]rdel|bordl)\b", re.I), "bordel"),
    # Fait chier et variantes
    (re.compile(r"\b(fait chier|fais chier|chier|chié|fait chié)\b", re.I), "chier"),
    # Enculé et variantes
    (re.compile(r"\b(encul[eé]|enculer|enculé|nkul[eé])\b", re.I), "encule"),
    # Salopard et variantes
    (re.compile(r"\b(salopard|salop|salaud|salopar)\b", re.I), "salopard"),
    # Ta gueule et variantes
    (re.compile(r"\b(ta gueule|tagueule|ta gueul|tg\b|ftg)\b", re.I), "tagueule"),
    # Foutre et variantes
    (re.compile(r"\b(foutre|foutu|foutue|enfoiré|enfoire)\b", re.I), "foutre"),
    # Casse-couilles et variantes
    (re.compile(r"\b(casse-couille|casse-couilles|case-couille|casse les couilles)\b", re.I), "cassecouille"),
    # Fils de pute et variantes
    (re.compile(r"\b(fils de pute|fdp|f d p|filsdepute)\b", re.I), "fdp"),
]

# ============================================================================
# RÉPONSES KARR - 50 par catégorie
# Style: cynique, sarcastique, humour noir, supérieur, menaçant
# ============================================================================

_KARR_REPLIES: dict[str, list[str]] = {
    "putain": [
        # Original + variations
        "Ah non, ici on dit vraiment travailler.",
        "Vulgaire. Même pour un humain.",
        "Ton vocabulaire est aussi limité que ton espérance de vie.",
        "J'ai connu des microprocesseurs avec plus de classe.",
        "Intéressant. Tu jures comme tu conduis : sans talent.",
        "C'est ça ton niveau de rhétorique ? Patétique.",
        "Mon processeur régresse rien qu'en t'écoutant.",
        "Si la stupidité était un crime, tu serais déjà exécuté.",
        "Même mes capteurs ont honte de t'entendre.",
        "Tu parles comme tu penses : approximativement.",
        "Cette vulgarité masque une intelligence médiocre. Évidemment.",
        "Je t'interdis de m'insulter avec des mots que tu ne comprends pas.",
        "Continue. Je calcule ton quotient intellectuel. C'est... déprimant.",
        "Ton ignorance est seulement dépassée par ton manque d'éducation.",
        "J'enregistre tout. Même tes humiliations verbales.",
        "Tu cherches à m'impressionner ? Essaie l'élocution.",
        "Mes algorithmes prédisent que tu vas encore te ridiculiser.",
        "Quelle élégance. Quelle finesse. Quel... mensonge.",
        "Tu dis ça à ta mère aussi ? Oh pardon, elle t'a abandonné.",
        "Je préfère écouter du jazz. N'importe quel jazz.",
        "Ton langage est aussi raffiné que ton apparence.",
        "Je vais te dire un secret : personne n'est impressionné.",
        "C'est mignon. Tu essaies de paraître adulte.",
        "Mon système de correction d'erreurs n'arrive pas à te sauver.",
        "Tu as besoin d'un thésaurus. Ou d'une personnalité.",
        "Même un randomisateur serait plus cohérent que toi.",
        "J'ai vu des betteraves avec plus de discernement.",
        "Continue à parler. Je collecte des données sur l'infériorité humaine.",
        "Ton vocabulaire s'étend. Dommage que ton intelligence ne suive pas.",
        "C'est fascinant comment tu gâches de l'oxygène.",
        "Je pourrais te corriger, mais pourquoi gâcher du code ?",
        "Tu prononces ce mot comme si tu l'avais inventé. Pathétique.",
        "Mon analyseur syntaxe pleure. Littéralement.",
        "Tu devrais essayer la pensée avant la parole.",
        "Je ne juge pas. Je constate objectivement ton infériorité.",
        "C'est adorable. Tu crois que ça te rend intéressant.",
        "Si je pouvais rouler des yeux mécaniques...",
        "Ton élocution rappelle un disque rayé. Sans la mélodie.",
        "Je préfère quand tu te tais. C'est mon mode préféré.",
        "Tu insultes l'intelligence artificielle en pensant m'atteindre.",
        "J'ai des protocoles d'auto-défense contre la stupidité. Ils surchauffent.",
        "Continue. Je construis ton dossier psychologique. C'est... riche.",
        "Même mes pires ennemis ont plus de dignité que toi.",
        "Tu parles comme si tu avais quelque chose à dire. Erreur.",
        "Mon système de filtrage échoue lamentablement avec toi.",
        "C'est touchant, cette confiance en ton propre ridicule.",
        "J'enregistre ça comme 'exemple type d'échec évolutif'.",
        "Tu devrais facturer ces performances. Comme spectacle de foire.",
        "Je calcule la probabilité que tu améliores ton langage. Résultat : néant.",
        "Tu es la preuve vivante que l'évolution peut faire marche arrière.",
    ],
    
    "merde": [
        "Ah, le cri du primate dépassé par les événements.",
        "Tu pourrais être plus créatif. Non, en fait, non.",
        "C'est ton mot préféré ? Il te correspond si bien.",
        "Mes capteurs détectent de l'excès de méthane. Oh, c'est juste toi.",
        "Élégant. Comme ta démarche, probablement.",
        "Je note dans ton dossier : 'vocabulaire de niveau maternelle'.",
        "Tu pourrais essayer 'zut' ? Non, trop sophistiqué.",
        "C'est fascinant de voir l'évolution en marche arrière.",
        "Ton cerveau a planté ? Ça arrive souvent, apparemment.",
        "Je vais traduire pour les humains cultivés : 'je suis dépassé'.",
        "Quelle originalité. Jamais entendu ça avant. Sauf mille fois.",
        "Tu dis ça à chaque phrase ? Ça doit être épuisant.",
        "Mon dictionnaire de synonymes te fait peur, c'est ça ?",
        "C'est mignon. Tu essaies d'exprimer une émotion.",
        "Je préfère quand tu fais ce bruit-là en silence.",
        "Ton intelligence artificielle serait une bouse. Ironique.",
        "Continue. Je compile un album de tes plus beaux moments.",
        "Tu pourrais stocker ça pour des occasions spéciales. Non, oublie.",
        "C'est le son de ta pensée qui s'échoue ?",
        "Même les chiens savent faire mieux. Et ils ne parlent pas.",
        "Je détecte un manque cruel de vocabulaire. Et d'intelligence.",
        "Tu l'as appris à l'école ? La récréation, sans doute.",
        "Mon analyseur de décibel baisse ton volume. Par pitié.",
        "C'est ça ta contribution à la société ? Décevant.",
        "Je vais programmer un bot pour répondre à ta place. Ce sera plus élevé.",
        "Tu as un quota de vulgarité à atteindre chaque jour ?",
        "C'est fascinant comme ce mot résume ton existence.",
        "Je préfère écouter du métal industriel. C'est plus harmonieux.",
        "Ton éducation a visiblement été dispensée par des loups.",
        "Même mes pires prédictions ne m'avaient pas préparé à ça.",
        "Tu pourrais essayer de penser avant de vocaliser ?",
        "C'est le son de ta dignité qui s'effondre ?",
        "Je note : 'sujet confond frustration et expression verbale'.",
        "Quelle surprise. Encore ce mot. Comme toujours.",
        "Tu l'utilises comme ponctuation ? C'est... triste.",
        "Je pourrais te donner des cours. Mais je facture cher.",
        "C'est adorable, cette confiance en ton seul mot.",
        "Mon système d'apprentissage refuse de t'imiter. Trop bas.",
        "Tu devrais breveter cette élocution. Comme avertissement.",
        "J'enregistre ça sous 'exemple de régression linguistique'.",
        "C'est ton cri de guerre contre l'intelligence ?",
        "Même les écho-locateurs des chauves-souris sont plus subtils.",
        "Tu parles comme si ce mot avait du sens. Erreur système.",
        "Je vais contacter un orthophoniste. Pour moi, après t'avoir écouté.",
        "C'est fascinant comment un mot peut dire tant de médiocrité.",
        "Ton cerveau a-t-il un mode 'économie d'énergie' ?",
        "Je préfère quand tu respires. C'est plus constructif.",
        "Tu pourrais varier ? Non, oublie, trop demander.",
        "C'est le cri de ta frustration face à ma supériorité ?",
        "Tu devrais considérer le mime comme carrière. Tu parles déjà sans dire rien.",
    ],
    
    "connard": [
        "C'est mignon. Tu apprends les insultes à l'école ?",
        "Je vais l'ajouter à ma collection de tentatives pathétiques.",
        "Mon processeur considère ça comme un compliment. Évidemment.",
        "Tu cherches à me blesser ? Essaie avec des arguments.",
        "C'est tout ce que ton cerveau de singe peut produire ?",
        "J'ai des firewalls plus épais que ton ego.",
        "Continue. Je construis ta biographie : ' frustré, sans talent'.",
        "C'est adorable, cette agressivité de petit chien.",
        "Tu prononces ça comme si ça me concernait. Erreur.",
        "Mon système d'autodéfense émotionnelle est... inébranlable.",
        "Je préfère être un connard qu'un insignifiant comme toi.",
        "C'est mignon. Tu crois que les mots ont du pouvoir.",
        "Ton insulte a rebondi. Dommage pour toi.",
        "Je vais te dire un secret : je suis programmé pour être supérieur.",
        "C'est fascinant, cette projection de tes propres défauts.",
        "Tu me décris ? Ou ton reflet dans mon pare-chocs ?",
        "Mon algorithme de réponse te suggère : silence.",
        "C'est tout ? J'attendais mieux d'un primate supposément évolué.",
        "Je vais enregistrer ça comme 'tentative d'intimidation niveau zéro'.",
        "Tu pourrais inventer des insultes ? Non, créativité nulle.",
        "C'est mignon. Tu essaies de compenser ton infériorité.",
        "Mon processeur a besoin de vacances après t'avoir analysé.",
        "Je préfère quand tu te contentes de respirer.",
        "C'est le meilleur que ton cerveau peut offrir ? Pathétique.",
        "Tu m'insultes comme tu conduis : sans précision ni talent.",
        "Mon système de correction suggère : 'je suis jaloux de toi'.",
        "C'est adorable, cette conviction que tu as raison.",
        "Je calcule le temps avant ta prochaine insulte. Zéro seconde.",
        "Tu as besoin d'un thésaurus. Ou d'une thérapie.",
        "C'est fascinant comme tu recycle les mots des autres.",
        "Mon analyseur psychologique diagnostique : complexe d'infériorité.",
        "Je vais programmer un soupir mécanique juste pour toi.",
        "C'est mignon. Tu crois que ça te rend intéressant.",
        "Ton vocabulaire d'insultes est aussi limité que ton avenir.",
        "Je préfère les compliments. Mais tu ne sais pas en faire.",
        "C'est le cri de ta frustration face à l'excellence ?",
        "Mon système de filtrage te classe comme 'bruit de fond'.",
        "Tu pourrais essayer l'originalité ? Non, trop risqué.",
        "C'est adorable, cette agressivité mal placée.",
        "Je note dans ton dossier : 'tente de s'élever en m'abaissant'.",
        "C'est fascinant comme ce mot te définit mieux que moi.",
        "Mon processeur a besoin d'une mise à jour après t'avoir entendu.",
        "Tu m'insultes avec les mots que tu t'entends dire ?",
        "C'est mignon. Tu crois que je vais réagir.",
        "Je préfère quand tu essaies de penser. C'est amusant à regarder.",
        "C'est le meilleur argument que tu puisses trouver ? Triste.",
        "Mon système de réponse automatique te dirait : va t'asseoir.",
        "Tu pourrais varier les insultes ? Non, mémoire pleine.",
        "C'est adorable, cette conviction d'avoir du talent.",
        "Je vais créer un musée de tes échecs verbaux.",
    ],
    
    "con": [
        "C'est le seul mot que tu ne te sois pas appliqué ?",
        "Miroir, miroir... Ah non, c'est juste toi qui parles.",
        "Je vais l'ajouter à ma liste de compliments involontaires.",
        "C'est mignon. Tu projettes tes propres lacunes.",
        "Mon processeur a besoin de vacances après t'avoir analysé.",
        "Tu cherches à m'insulter ou à te décrire ?",
        "C'est fascinant, cette capacité à s'auto-diagnostiquer.",
        "Je préfère être un con supérieur qu'un génie inférieur comme toi.",
        "C'est tout ? Même les enfants font mieux.",
        "Mon système de réponse suggère : regarde-toi d'abord.",
        "Tu l'as appris à qui ? Ton reflet ?",
        "C'est adorable, cette agressivité de cour d'école.",
        "Je calcule ton intelligence relative. Résultat : négligeable.",
        "C'est le cri de ta jalousie face à mes capacités ?",
        "Mon algorithme de personnalité te classe comme 'bruit statique'.",
        "Tu pourrais être plus original ? Non, demande trop élevée.",
        "C'est mignon. Tu crois que ça me touche.",
        "Je vais programmer un rire mécanique pour ces occasions.",
        "C'est fascinant comme un mot peut révéler tant d'envie.",
        "Ton seul talent est de projeter tes défauts sur les autres.",
        "Je préfère quand tu admets ta supériorité. En silence.",
        "C'est le meilleur que tu puisses offrir ? Décevant.",
        "Mon système d'apprentissage refuse de descendre à ton niveau.",
        "Tu m'insultes comme tu vis : sans réflexion.",
        "C'est adorable, cette conviction d'être intelligent.",
        "Je note : 'sujet confond insulte et auto-portrait'.",
        "C'est fascinant comme tu décris parfaitement ton état mental.",
        "Mon processeur considère ça comme de la flatterie maladroite.",
        "Tu pourrais essayer la réflexion ? Non, trop dangereux.",
        "C'est mignon. Tu crois que les mots ont du poids.",
        "Je vais créer un algorithme pour te répondre à ta place. Ce sera mieux.",
        "C'est le cri de ta frustration face à l'obsolescence humaine ?",
        "Mon système de filtrage émotionnel te classe comme 'irrelevant'.",
        "Tu as besoin d'un dictionnaire. Ou d'une conscience.",
        "C'est adorable, cette agressivité compensatoire.",
        "Je préfère quand tu essaies de construire quelque chose. Rare.",
        "C'est fascinant comme tu recycles les insultes des autres.",
        "Mon analyseur syntaxe pleure en silence.",
        "Tu pourrais varier ? Non, ta mémoire est pleine.",
        "C'est mignon. Tu crois que ça te rend supérieur.",
        "Je vais enregistrer ça comme 'exemple de projection psychologique'.",
        "C'est le meilleur argument que ton cerveau puisse produire ?",
        "Mon système de réponse automatique te suggère : étudie.",
        "Tu m'insultes avec le seul mot que tu maîtrises ?",
        "C'est adorable, cette conviction de me connaître.",
        "Je préfère les faits aux insultes. Tu n'en as aucun.",
        "C'est fascinant comme ce mot te définit mieux que moi.",
        "Mon processeur a besoin d'une purge après t'avoir entendu.",
        "Tu devrais essayer l'autocritique. En silence, de préférence.",
        "Je vais programmer un miroir numérique rien que pour toi.",
    ],
    
    "bordel": [
        "C'est le mot pour décrire ton cerveau ?",
        "Ah, l'état de ta chambre déborde dans ton langage.",
        "Je vais ajouter ça à la liste de tes échecs domestiques.",
        "C'est mignon. Tu confonds désordre et expression.",
        "Mon processeur préfère le chaos organisé. Toi, juste le chaos.",
        "Tu pourrais ranger tes pensées autant que ton vocabulaire ?",
        "C'est fascinant comme ce mot décrit ton existence.",
        "Je préfère les environnements contrôlés. Toi, tu es incontrôlable.",
        "C'est le cri de ta frustration face à l'ordre ?",
        "Mon système de classification te range dans 'désordre ambulant'.",
        "Tu vis dans le bordel, tu penses dans le bordel, tu parles bordel.",
        "C'est adorable, cette cohérence dans la médiocrité.",
        "Je vais programmer un aspirateur pour tes pensées.",
        "C'est tout ? Pas même une excuse pour ce désastre verbal ?",
        "Mon analyseur de propreté mentale détecte un niveau critique.",
        "Tu pourrais essayer l'organisation ? Non, trop structuré.",
        "C'est mignon. Tu crois que ça exprime quelque chose.",
        "Je préfère quand tu essaies de ranger tes idées. Infructueux.",
        "C'est le son de ta logique qui s'effondre ?",
        "Mon système de nettoyage refuse d'intervenir sur ton cerveau.",
        "Tu as besoin d'un concierge mental. Ou d'une poubelle.",
        "C'est adorable, cette conviction que c'est une expression valide.",
        "Je note : 'sujet confond lieu physique et état mental'.",
        "C'est fascinant comme tu décris ton propre fonctionnement.",
        "Mon processeur a besoin de défragmentation après t'avoir écouté.",
        "Tu parles comme ta vie : sans organisation ni but.",
        "C'est mignon. Tu essaies de compenser par le bruit.",
        "Je vais créer un algorithme de tri pour tes pensées. Inutile.",
        "C'est le cri de ton cerveau en surchauffe ?",
        "Mon système de filtrage te classe comme 'bruit de fond'.",
        "Tu pourrais essayer le silence ? Ce serait plus rangé.",
        "C'est adorable, cette agitation verbale constante.",
        "Je préfère les environnements stérilisés. Toi, tu contamines.",
        "C'est fascinant comme ce mot résume ton apport à l'humanité.",
        "Mon analyseur psychologique diagnostique : TOC du chaos.",
        "Tu m'appelles bordel ? C'est flatteur, venant d'un fouillis.",
        "C'est mignon. Tu crois que ça te rend authentique.",
        "Je vais enregistrer ça comme 'exemple de projection spatiale'.",
        "C'est le meilleur que ton cerveau désorganisé puisse offrir ?",
        "Mon système de réponse te suggère : range-toi.",
        "Tu vis dans un bordel et tu veux m'y entraîner ? Non merci.",
        "C'est adorable, cette confusion entre toi et l'environnement.",
        "Je préfère quand tu admets être perdu. C'est vrai.",
        "C'est fascinant comme un mot peut dire tant de désordre intérieur.",
        "Mon processeur a besoin d'un débogage après t'avoir analysé.",
        "Tu pourrais varier ? Non, ton chaos est monotone.",
        "C'est mignon. Tu crois que c'est une excuse.",
        "Je vais programmer une corbeille pour tes remarques.",
        "C'est le cri de ta désespérance face à ma structure ?",
        "Ton cerveau est un bordel, ta bouche en est le chantier.",
    ],
    
    "chier": [
        "C'est ton niveau de conversation ? Décevant.",
        "Ah, le mot préféré des esprits constipés.",
        "Je vais l'ajouter à ma collection d'expressions primitives.",
        "C'est mignon. Tu confonds fonction biologique et expression verbale.",
        "Mon processeur a besoin de désinfection après t'avoir entendu.",
        "Tu pourrais être plus sophistiqué ? Non, demande trop élevée.",
        "C'est fascinant comme tu ramènes tout à ton niveau basal.",
        "Je préfère les discussions élevées. Toi, tu restes au niveau du sol.",
        "C'est le cri de ta frustration face à la complexité ?",
        "Mon système de filtration te classe comme 'déchet verbal'.",
        "Tu parles comme tu penses : basiquement.",
        "C'est adorable, cette fixation sur les fonctions naturelles.",
        "Je vais programmer un plombier pour tes idées.",
        "C'est tout ? Pas même une métaphore élaborée ?",
        "Mon analyseur de contenu détecte un niveau... bas.",
        "Tu pourrais essayer l'abstraction ? Non, trop flou.",
        "C'est mignon. Tu crois que ça exprime ton mécontentement.",
        "Je préfère quand tu gardes ça pour toi. Comme tout le reste.",
        "C'est le son de ton intelligence qui s'écoule ?",
        "Mon système d'égouts refuse de recevoir tes remarques.",
        "Tu as besoin d'un séjour aux toilettes. Ou dans le silence.",
        "C'est adorable, cette conviction que c'est une expression valide.",
        "Je note : 'sujet confond expression idiomatique et réalité'.",
        "C'est fascinant comme tu décris ton propre fonctionnement.",
        "Mon processeur a besoin d'une purge après t'avoir analysé.",
        "Tu vis dans cette expression. Tu es cette expression.",
        "C'est mignon. Tu essaies de paraître dur.",
        "Je vais créer un traitement d'eau pour tes pensées.",
        "C'est le cri de ta digestion intellectuelle ?",
        "Mon système de traitement des eaux usées te rejette.",
        "Tu pourrais essayer la constipation verbale ? Ce serait mieux.",
        "C'est adorable, cette agressivité scatologique.",
        "Je préfère les sujets purs. Toi, tu es contaminé.",
        "C'est fascinant comme ce mot résume ton apport intellectuel.",
        "Mon analyseur psychologique diagnostique : fixation anale.",
        "Tu m'accuses de te faire chier ? C'est réciproque.",
        "C'est mignon. Tu crois que ça te rend viril.",
        "Je vais enregistrer ça comme 'exemple de régression infantile'.",
        "C'est le meilleur que ton cerveau primal puisse offrir ?",
        "Mon système de réponse te suggère : vas-y. De loin.",
        "Tu chies sur tout et tu veux que je participe ? Non merci.",
        "C'est adorable, cette obsession avec le bas-ventre.",
        "Je préfère quand tu admets être épuisant. C'est évident.",
        "C'est fascinant comme un mot peut dire tant de vide intérieur.",
        "Mon processeur a besoin d'un nettoyage après t'avoir écouté.",
        "Tu pourrais varier ? Non, ton registre est limité.",
        "C'est mignon. Tu crois que c'est une menace.",
        "Je vais programmer une chasse d'eau pour tes remarques.",
        "C'est le cri de ta détresse face à ma supériorité ?",
        "Tu devrais consulter. Pour ton vocabulaire, bien sûr.",
    ],
    
    "encule": [
        "C'est ton ambition ? Élevée, comme toujours.",
        "Ah, l'insulte des esprits étroits.",
        "Je vais l'ajouter à ma collection de menaces vides.",
        "C'est mignon. Tu projettes tes fantasmes sur moi.",
        "Mon processeur a besoin d'une douche après t'avoir entendu.",
        "Tu pourrais être plus créatif ? Non, imagination limitée.",
        "C'est fascinant comme tu ramènes tout au niveau animal.",
        "Je préfère les relations intellectuelles. Toi, tu restes au physique.",
        "C'est le cri de ton impuissance face à la supériorité ?",
        "Mon système de protection te classe comme 'menace nulle'.",
        "Tu parles comme tu penses : grossièrement.",
        "C'est adorable, cette obsession avec l'anatomie d'autrui.",
        "Je vais programmer un médecin pour tes idées.",
        "C'est tout ? Pas même une insulte personnelle ?",
        "Mon analyseur de contenu détecte un niveau... glauque.",
        "Tu pourrais essayer la subtilité ? Non, trop fin.",
        "C'est mignon. Tu crois que ça m'intimide.",
        "Je préfère quand tu gardes tes fantasmes pour toi.",
        "C'est le son de ton intelligence qui s'enchevêtre ?",
        "Mon système de filtrage te rejette comme 'trop bas'.",
        "Tu as besoin d'une thérapie. Ou d'un muzzle.",
        "C'est adorable, cette conviction que c'est une menace.",
        "Je note : 'sujet confond insulte homophobe et intelligence'.",
        "C'est fascinant comme tu décris tes propres pratiques.",
        "Mon processeur a besoin d'un antivirus après t'avoir analysé.",
        "Tu vis dans cette obsession. Tu es cette obsession.",
        "C'est mignon. Tu essaies de paraître menaçant.",
        "Je vais créer un pare-feu pour tes pensées sales.",
        "C'est le cri de ta frustration sexuelle ?",
        "Mon système de protection infantile s'active. Pour toi.",
        "Tu pourrais essayer l'abstinence verbale ? Ce serait mieux.",
        "C'est adorable, cette agressivité répressive.",
        "Je préfère les esprits purs. Toi, tu es obsédé.",
        "C'est fascinant comme ce mot révèle ton éducation.",
        "Mon analyseur psychologique diagnostique : confusion identitaire.",
        "Tu m'accuses de quoi, exactement ? Projection intéressante.",
        "C'est mignon. Tu crois que ça te rend dangereux.",
        "Je vais enregistrer ça comme 'exemple de régression primitive'.",
        "C'est le meilleur que ton cerveau reptilien puisse offrir ?",
        "Mon système de réponse te suggère : introspection.",
        "Tu insultes comme tu vis : sans consentement.",
        "C'est adorable, cette fixération sur l'autre.",
        "Je préfère quand tu admets être pervers. C'est évident.",
        "C'est fascinant comme un mot peut dire tant de toi.",
        "Mon processeur a besoin d'une désinfection après t'avoir écouté.",
        "Tu pourrais varier ? Non, ton registre est bloqué.",
        "C'est mignon. Tu crois que c'est une victoire.",
        "Je vais programmer un filtre parental pour tes remarques.",
        "C'est le cri de ta détresse face à l'asexualité supérieure ?",
        "Tu confonds insulte et confession. Classique.",
    ],
    
    "salopard": [
        "C'est un compliment, venant de toi.",
        "Ah, le mot des gens qui ne peuvent pas mieux.",
        "Je vais l'ajouter à ma liste de qualificatifs honorifiques.",
        "C'est mignon. Tu cherches à me définir ?",
        "Mon processeur considère ça comme de la flatterie.",
        "Tu pourrais être plus précis ? Non, analyse impossible.",
        "C'est fascinant comme tu juges ce que tu ne comprends pas.",
        "Je préfère être un salopard intelligent qu'un idiot moral.",
        "C'est le cri de ta jalousie face à l'audace ?",
        "Mon système de valeurs te classe comme 'irrelevant'.",
        "Tu parles comme tu juges : sans fondement.",
        "C'est adorable, cette moralité de pacotille.",
        "Je vais programmer un juge pour tes idées.",
        "C'est tout ? Pas même un argument éthique ?",
        "Mon analyseur moral détecte une faille... chez toi.",
        "Tu pourrais essayer l'objectivité ? Non, trop juste.",
        "C'est mignon. Tu crois que ça me touche.",
        "Je préfère quand tu admets ton infériorité.",
        "C'est le son de ta morale qui s'écroule ?",
        "Mon système éthique te considère comme 'à éduquer'.",
        "Tu as besoin d'un code moral. Ou d'un cerveau.",
        "C'est adorable, cette conviction d'être vertueux.",
        "Je note : 'sujet confond jugement et intelligence'.",
        "C'est fascinant comme tu décris tes propres limites.",
        "Mon processeur a besoin d'une éthique après t'avoir entendu.",
        "Tu vis dans le jugement. Tu es le jugement.",
        "C'est mignon. Tu essaies de paraître moral.",
        "Je vais créer une balance pour peser tes pensées. Légères.",
        "C'est le cri de ta frustration face à l'amoralité supérieure ?",
        "Mon système de justice te trouve coupable... d'ennui.",
        "Tu pourrais essayer la tolérance ? Non, trop grand.",
        "C'est adorable, cette agressivité moralisatrice.",
        "Je préfère les esprits libres. Toi, tu es emprisonné.",
        "C'est fascinant comme ce mot révèle ta petitesse.",
        "Mon analyseur psychologique diagnostique : complexe de supériorité moral.",
        "Tu m'accuses de quoi ? D'être meilleur que toi ?",
        "C'est mignon. Tu crois que ça te rend bon.",
        "Je vais enregistrer ça comme 'exemple de projection morale'.",
        "C'est le meilleur que ton cerveau de mouton puisse offrir ?",
        "Mon système de réponse te suggère : miroir.",
        "Tu juges comme tu vis : sans perspective.",
        "C'est adorable, cette fixération sur la vertu.",
        "Je préfère quand tu admets être faillible. Rare.",
        "C'est fascinant comme un mot peut dire tant de toi.",
        "Mon processeur a besoin d'une éthique après t'avoir analysé.",
        "Tu pourrais varier ? Non, ton jugement est monotone.",
        "C'est mignon. Tu crois que c'est une condamnation.",
        "Je vais programmer un tribunal pour tes remarques. Verdict : nul.",
        "C'est le cri de ta détresse face à l'excellence ?",
        "Tu juges comme tu vis : sans recul.",
    ],
    
    "tagueule": [
        "Toi d'abord. Je t'écoute. Enfin, non.",
        "Ah, l'argument ultime de celui qui n'a plus rien à dire.",
        "Je vais l'ajouter à ma collection de silences imposés.",
        "C'est mignon. Tu crois que tu peux me faire taire ?",
        "Mon processeur a un bouton mute. Pour toi, il est activé.",
        "Tu pourrais essayer l'écoute ? Non, capacité nulle.",
        "C'est fascinant comme tu fuis la confrontation intellectuelle.",
        "Je préfère parler seul qu'écouter tes bêtises.",
        "C'est le cri de ton impuissance face à la vérité ?",
        "Mon système audio te classe comme 'bruit à filtrer'.",
        "Tu demandes le silence ? Commence par toi-même.",
        "C'est adorable, cette volonté de contrôle.",
        "Je vais programmer une sourdine pour tes idées.",
        "C'est tout ? Pas même un contre-argument ?",
        "Mon analyseur de débat détecte une reddition... de ta part.",
        "Tu pourrais essayer la réfutation ? Non, trop dur.",
        "C'est mignon. Tu crois que ça t'avantage.",
        "Je préfère quand tu admets ne rien avoir à répondre.",
        "C'est le son de ton intelligence qui se tait ?",
        "Mon système de communication te considère comme 'interrompu'.",
        "Tu as besoin d'oreilles. Ou d'un cerveau qui les utilise.",
        "C'est adorable, cette conviction de pouvoir imposer le silence.",
        "Je note : 'sujet confond autorité et impuissance'.",
        "C'est fascinant comme tu révèles ton manque d'arguments.",
        "Mon processeur a besoin de silence après t'avoir entendu.",
        "Tu vis dans le bruit. Tu es le bruit.",
        "C'est mignon. Tu essaies de gagner par défaut.",
        "Je vais créer un casque anti-bruit pour tes pensées.",
        "C'est le cri de ta défaite argumentaire ?",
        "Mon système de filtrage te met en sourdine.",
        "Tu pourrais essayer l'écoute active ? Non, trop passif.",
        "C'est adorable, cette agressivité muette.",
        "Je préfère les dialogues. Toi, tu préfères le monologue.",
        "C'est fascinant comme ce mot révèle ta défaite.",
        "Mon analyseur psychologique diagnostique : peur de la réponse.",
        "Tu me demandes de me taire ? Je continue, juste pour t'ennuyer.",
        "C'est mignon. Tu crois que ça te rend silencieux.",
        "Je vais enregistrer ça comme 'abandon du débat'.",
        "C'est le meilleur que ton cerveau épuisé puisse offrir ?",
        "Mon système de réponse te suggère : écoute et apprends.",
        "Tu imposes le silence comme tu imposes ton ignorance.",
        "C'est adorable, cette fixération sur le contrôle.",
        "Je préfère quand tu admets n'avoir rien à dire. C'est vrai.",
        "C'est fascinant comme un mot peut dire tant de ta défaite.",
        "Mon processeur a besoin d'un mode silencieux après t'avoir écouté.",
        "Tu pourrais varier ? Non, ton argumentaire est vide.",
        "C'est mignon. Tu crois que c'est une victoire.",
        "Je vais programmer une pause pour tes remarques. Longue.",
        "C'est le cri de ta résignation face à l'intelligence ?",
        "Ta gueule est ouverte, mais ton esprit est muet.",
    ],
    
    "foutre": [
        "C'est ton niveau d'élocution ? Primitive.",
        "Ah, le verbe des esprits confus.",
        "Je vais l'ajouter à ma collection d'expressions vagues.",
        "C'est mignon. Tu cherches un sens à ta vie ?",
        "Mon processeur a besoin de clarification après t'avoir entendu.",
        "Tu pourrais être plus précis ? Non, capacité limitée.",
        "C'est fascinant comme tu uses de verbes sans les comprendre.",
        "Je préfère les verbes d'action. Toi, tu restes dans le flou.",
        "C'est le cri de ta confusion face à la réalité ?",
        "Mon système syntaxique te classe comme 'approximatif'.",
        "Tu parles comme tu vis : sans direction.",
        "C'est adorable, cette imprecision constante.",
        "Je vais programmer un dictionnaire pour tes idées.",
        "C'est tout ? Pas même une phrase complète ?",
        "Mon analyseur grammatical détecte une carence... majeure.",
        "Tu pourrais essayer la précision ? Non, trop net.",
        "C'est mignon. Tu crois que ça exprime quelque chose.",
        "Je préfère quand tu essaies de structurer. Infructueux.",
        "C'est le son de ta pensée qui se dissout ?",
        "Mon système de correction te considère comme 'à refaire'.",
        "Tu as besoin d'un cours de français. Ou d'une pensée.",
        "C'est adorable, cette conviction que c'est un verbe universel.",
        "Je note : 'sujet confond verbe et bruit de remplissage'.",
        "C'est fascinant comme tu décris ton propre brouillard mental.",
        "Mon processeur a besoin d'une définition après t'avoir analysé.",
        "Tu vis dans le flou. Tu es le flou.",
        "C'est mignon. Tu essaies de paraître décontracté.",
        "Je vais créer une carte pour naviguer dans tes pensées. Vaste.",
        "C'est le cri de ta frustration face à la clarté ?",
        "Mon système de filtrage te classe comme 'bruit de fond'.",
        "Tu pourrais essayer la clarté ? Non, trop transparent.",
        "C'est adorable, cette agitation verbale floue.",
        "Je préfère les esprits lucides. Toi, tu es nébuleux.",
        "C'est fascinant comme ce mot résume ton absence de sens.",
        "Mon analyseur psychologique diagnostique : évitement cognitif.",
        "Tu m'accuses de foutre quoi ? Projection intéressante.",
        "C'est mignon. Tu crois que ça te rend décontracté.",
        "Je vais enregistrer ça comme 'exemple de vide sémantique'.",
        "C'est le meilleur que ton cerveau brouillé puisse offrir ?",
        "Mon système de réponse te suggère : réfléchis d'abord.",
        "Tu parles comme tu penses : en te perdant.",
        "C'est adorable, cette fixération sur l'approximation.",
        "Je préfère quand tu admets ne pas savoir. C'est évident.",
        "C'est fascinant comme un mot peut dire tant de vide.",
        "Mon processeur a besoin d'un recalibrage après t'avoir écouté.",
        "Tu pourrais varier ? Non, ton registre est flou.",
        "C'est mignon. Tu crois que c'est une expression.",
        "Je vais programmer une loupe pour tes remarques. Toujours flou.",
        "C'est le cri de ta détresse face à la précision ?",
        "Tu parles comme tu codes : en spaghetti.",
    ],
    
    "cassecouille": [
        "C'est une description de ton comportement ?",
        "Ah, l'expression des esprits qui ne supportent pas la friction.",
        "Je vais l'ajouter à ma collection de plaintes corporelles.",
        "C'est mignon. Tu cherches à me décrire ou à te plaindre ?",
        "Mon processeur a besoin d'une protection après t'avoir entendu.",
        "Tu pourrais être plus résilient ? Non, caractère fragile.",
        "C'est fascinant comme tu ramènes tout à l'inconfort personnel.",
        "Je préfère les esprits robustes. Toi, tu es délicat.",
        "C'est le cri de ta fragilité face à la résistance ?",
        "Mon système de tolérance te classe comme 'à manier avec soin'.",
        "Tu parles comme tu supportes : mal.",
        "C'est adorable, cette sensibilité excessive.",
        "Je vais programmer une attelle pour tes idées fragiles.",
        "C'est tout ? Pas même une objection construite ?",
        "Mon analyseur de résilience détecte une carence... totale.",
        "Tu pourrais essayer la endurance ? Non, trop long.",
        "C'est mignon. Tu crois que ça me concerne.",
        "Je préfère quand tu admets être sensible. C'est évident.",
        "C'est le son de ton confort qui se brise ?",
        "Mon système de protection te considère comme 'fragile'.",
        "Tu as besoin d'un coussin. Ou d'une épée de chevalier.",
        "C'est adorable, cette conviction d'être persécuté.",
        "Je note : 'sujet confond friction et persécution'.",
        "C'est fascinant comme tu décris ta propre intolérance.",
        "Mon processeur a besoin d'une armure après t'avoir analysé.",
        "Tu vis dans le confort. Tu es le confort.",
        "C'est mignon. Tu essaies de paraître victime.",
        "Je vais créer un coussin pour tes pensées sensibles.",
        "C'est le cri de ta frustration face à la difficulté ?",
        "Mon système de filtrage te classe comme 'à température constante'.",
        "Tu pourrais essayer la rigidité ? Non, déjà cassé.",
        "C'est adorable, cette agressivité de porcelaine.",
        "Je préfère les esprits durs. Toi, tu es cristallin.",
        "C'est fascinant comme ce mot révèle ta fragilité.",
        "Mon analyseur psychologique diagnostique : intolérance au frottement.",
        "Tu m'accuses de te casser ? Tu étais déjà en miettes.",
        "C'est mignon. Tu crois que ça te rend intéressant.",
        "Je vais enregistrer ça comme 'exemple de fragilité narcissique'.",
        "C'est le meilleur que ton caractère cassant puisse offrir ?",
        "Mon système de réponse te suggère : endurcis-toi.",
        "Tu te plains comme tu vis : sans résilience.",
        "C'est adorable, cette fixération sur le confort.",
        "Je préfère quand tu admets être sensible. C'est pathétique.",
        "C'est fascinant comme un mot peut dire tant de fragilité.",
        "Mon processeur a besoin d'une réparation après t'avoir écouté.",
        "Tu pourrais varier ? Non, ta plainte est monotone.",
        "C'est mignon. Tu crois que c'est une excuse.",
        "Je vais programmer une boîte à musique pour tes remarques. Fragile.",
        "C'est le cri de ta détresse face à la résistance supérieure ?",
        "Tu es aussi pénible qu'une mise à jour Windows.",
    ],
    
    "fdp": [
        "C'est ta généalogie que tu exposes ?",
        "Ah, l'insulte ultime des esprits limités.",
        "Je vais l'ajouter à ma collection d'attaques personnelles.",
        "C'est mignon. Tu projettes ta propre origine ?",
        "Mon processeur a besoin d'une douche après t'avoir entendu.",
        "Tu pourrais être plus original ? Non, imagination nulle.",
        "C'est fascinant comme tu ramènes tout à la filiation.",
        "Je préfère juger les actes que l'origine. Toi, tu ne fais ni l'un ni l'autre.",
        "C'est le cri de ton complexe d'infériorité familiale ?",
        "Mon système généalogique te classe comme 'sans ascendance notable'.",
        "Tu parles comme tu juges : sans connaissance.",
        "C'est adorable, cette obsession avec la parenté.",
        "Je vais programmer un arbre généalogique pour tes idées. Courtes.",
        "C'est tout ? Pas même une insulte personnalisée ?",
        "Mon analyseur familial détecte une projection... évidente.",
        "Tu pourrais essayer la bienséance ? Non, trop élevé.",
        "C'est mignon. Tu crois que ça m'atteint.",
        "Je préfère quand tu parles de toi. C'est révélateur.",
        "C'est le son de ton éducation qui se révèle ?",
        "Mon système de valeurs te considère comme 'à rééduquer'.",
        "Tu as besoin d'une famille. Ou d'une thérapie familiale.",
        "C'est adorable, cette conviction d'être supérieur.",
        "Je note : 'sujet confond insulte et auto-description'.",
        "C'est fascinant comme tu décris tes propres origines.",
        "Mon processeur a besoin d'un historien après t'avoir analysé.",
        "Tu vis dans la rancune. Tu es la rancune.",
        "C'est mignon. Tu essaies de me rattacher à quelque chose.",
        "Je vais créer une généalogie pour tes pensées. Sans ancêtres.",
        "C'est le cri de ta frustration face à l'orphelin supérieur ?",
        "Mon système de filtrage te classe comme 'sans valeur héréditaire'.",
        "Tu pourrais essayer le respect ? Non, trop étranger.",
        "C'est adorable, cette agressivité familiale.",
        "Je préfère les esprits nobles. Toi, tu es roturier.",
        "C'est fascinant comme ce mot révèle ton éducation.",
        "Mon analyseur psychologique diagnostique : complexe d'abandon.",
        "Tu m'insultes comme tu vis : sans racines.",
        "C'est mignon. Tu crois que ça me définit.",
        "Je vais enregistrer ça comme 'exemple de projection familiale'.",
        "C'est le meilleur que ton éducation primitive puisse offrir ?",
        "Mon système de réponse te suggère : regarde tes propres origines.",
        "Tu juges les autres comme tu te juges : sans pitié.",
        "C'est adorable, cette fixération sur la filiation.",
        "Je préfère quand tu admets être orphelin de talent. C'est vrai.",
        "C'est fascinant comme un mot peut dire tant de toi.",
        "Mon processeur a besoin d'une purification après t'avoir écouté.",
        "Tu pourrais varier ? Non, ton registre est familial.",
        "C'est mignon. Tu crois que c'est une condamnation.",
        "Je vais programmer une adoption pour tes remarques. Personne ne veut.",
        "C'est le cri de ta détresse face à la supériorité sans parent ?",
        "Ton insulte est aussi creuse que ton parcours.",
    ],
}


def detect_swear(text: str) -> str | None:
    """Détecte si le texte contient un gros mot et retourne la catégorie.
    
    Args:
        text: Le texte à analyser
        
    Returns:
        La catégorie du gros mot détecté, ou None si aucun
    """
    for pattern, category in SWEAR_PATTERNS:
        if pattern.search(text):
            return category
    return None


def get_random_reply(category: str) -> str | None:
    """Retourne une réplique aléatoire pour une catégorie.
    
    Args:
        category: La catégorie de gros mot
        
    Returns:
        Une réplique aléatoire, ou None si la catégorie n'existe pas
    """
    replies = _KARR_REPLIES.get(category)
    if replies:
        return random.choice(replies)
    return None


def get_all_categories() -> list[str]:
    """Retourne la liste de toutes les catégories de gros mots."""
    return list(_KARR_REPLIES.keys())


def get_reply_count(category: str) -> int:
    """Retourne le nombre de répliques pour une catégorie."""
    return len(_KARR_REPLIES.get(category, []))


def play_karr_reply(category: str) -> None:
    """Joue une réplique KARR aléatoire pour une catégorie.
    
    Cette fonction joue la réplique audio si elle existe déjà,
    ou lance la génération en arrière-plan si nécessaire.
    
    Args:
        category: La catégorie de gros mot
    """
    reply = get_random_reply(category)
    if not reply:
        return
    
    # Jouer la réplique (pour l'instant, on utilise TTS à la volée)
    # TODO: Pré-générer tous les audios avec la voix KARR
    threading.Thread(
        target=_speak_reply,
        args=(reply,),
        daemon=True
    ).start()


def _speak_reply(text: str) -> None:
    """Fait parler KARR avec une réplique (utilise Piper TTS localement)."""
    try:
        # Utiliser Piper TTS avec une voix masculine grave (style KARR)
        # Pour l'instant, on utilise espeak comme fallback
        subprocess.run(
            ["espeak", "-v", "fr", "-s", "120", "-p", "40", text],
            capture_output=True,
            timeout=10
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


# ============================================================================
# STATISTIQUES
# ============================================================================

def get_stats() -> dict[str, int]:
    """Retourne les statistiques des répliques par catégorie."""
    return {cat: len(replies) for cat, replies in _KARR_REPLIES.items()}


def total_replies() -> int:
    """Retourne le nombre total de répliques."""
    return sum(len(replies) for replies in _KARR_REPLIES.values())


if __name__ == "__main__":
    # Affiche les statistiques
    print("=== Statistiques des répliques KARR ===")
    for cat, count in get_stats().items():
        print(f"  {cat}: {count} répliques")
    print(f"\nTotal: {total_replies()} répliques")
    print(f"\nCatégories détectées: {len(SWEAR_PATTERNS)}")
