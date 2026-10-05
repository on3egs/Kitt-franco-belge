"""Connaissances générales vérifiées pour KYRONEXT.
Réponses courtes, factuelles et variées. Ce module n'active aucun thème
et n'exécute aucune commande véhicule.
"""
from __future__ import annotations
import hashlib
import re
import unicodedata

_SESSION_LAST: dict[tuple[str, str], int] = {}

def _norm(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower().replace("’", "'")
    value = re.sub(r"[^a-z0-9' -]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def _is_explanation_request(n: str) -> bool:
    markers = (
        "explique", "expliquer", "presenter", "presente", "que peux tu me dire",
        "comment fonctionne", "comment marche", "difference", "qu est ce que",
        "c est quoi", "pourquoi", "a quoi sert", "comment definir", "resume",
        "parle moi", "decris", "decrire"
    )
    return any(marker in n for marker in markers)

def _pick(topic: str, n: str, session_id: str, variants: tuple[str, ...]) -> str:
    key = (session_id or "default", topic)
    if key in _SESSION_LAST:
        idx = (_SESSION_LAST[key] + 1) % len(variants)
    else:
        idx = hashlib.sha256(n.encode("utf-8")).digest()[0] % len(variants)
    _SESSION_LAST[key] = idx
    return variants[idx]

_ENTRIES: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("sky_blue", (r"\bciel\b.*\bbleu\b",), (
        "Le ciel paraît bleu parce que les molécules de l'atmosphère diffusent plus efficacement les courtes longueurs d'onde de la lumière solaire, surtout le bleu, que les longueurs d'onde rouges.",
        "La lumière du Soleil contient toutes les couleurs. Dans l'atmosphère, la diffusion de Rayleigh disperse davantage le bleu, ce qui donne au ciel sa couleur apparente.",
        "Ce n'est pas l'air qui est bleu : la lumière solaire est diffusée par les molécules de l'atmosphère, et le bleu est envoyé dans beaucoup plus de directions que le rouge."
    )),
    ("rainbow", (r"arc[s -]?en[- ]ciel",), (
        "Un arc-en-ciel apparaît quand la lumière solaire entre dans des gouttes d'eau, y est réfractée, réfléchie puis à nouveau réfractée. Les différentes longueurs d'onde ressortent sous des angles légèrement différents, séparant les couleurs.",
        "Les gouttes de pluie agissent comme de petits prismes : elles dévient et réfléchissent la lumière du Soleil, ce qui sépare la lumière blanche en couleurs visibles.",
        "Pour voir un arc-en-ciel, le Soleil est généralement derrière l'observateur et des gouttelettes d'eau sont devant lui. La réfraction et la réflexion internes produisent l'arc coloré."
    )),
    ("weather_climate", (r"\bmeteo\b.*\bclimat\b", r"\bclimat\b.*\bmeteo\b"), (
        "La météo décrit l'état de l'atmosphère à court terme, par exemple la pluie, le vent ou la température aujourd'hui. Le climat décrit les tendances moyennes et leur variabilité sur de longues périodes, généralement plusieurs décennies.",
        "Météo et climat ne sont pas la même échelle de temps : la météo concerne les heures et les jours, tandis que le climat résume des statistiques observées sur des décennies.",
        "Un épisode froid relève de la météo. Le climat, lui, se juge sur de longues séries de températures, précipitations, vents et autres variables."
    )),
    ("seasons", (r"\bsaisons?\b",), (
        "Les saisons viennent surtout de l'inclinaison de l'axe terrestre, environ 23,5 degrés. En tournant autour du Soleil, chaque hémisphère reçoit alternativement des rayons plus directs et des journées plus longues ou plus courtes.",
        "Ce n'est pas la distance au Soleil qui crée principalement les saisons, mais l'inclinaison de la Terre. Elle modifie l'angle des rayons solaires et la durée du jour au cours de l'année.",
        "Printemps, été, automne et hiver résultent de l'axe incliné de la Terre combiné à son orbite autour du Soleil."
    )),
    ("gravity", (r"\bgravite\b",), (
        "La gravité est l'interaction liée à la masse et à l'énergie. Près de la Terre, elle attire les objets vers son centre ; à grande échelle, elle maintient notamment les planètes en orbite.",
        "En physique classique, les masses s'attirent. En relativité générale, on décrit la gravité comme la courbure de l'espace-temps produite par la masse et l'énergie.",
        "La gravité explique à la fois pourquoi un objet tombe au sol et pourquoi la Lune reste en orbite autour de la Terre."
    )),
    ("moon", (r"\blune\b",), (
        "La Lune est le satellite naturel de la Terre. Elle ne produit pas sa propre lumière visible : nous la voyons parce qu'elle réfléchit la lumière du Soleil.",
        "La Lune est un corps rocheux en orbite autour de la Terre. Ses phases viennent de la portion de sa face éclairée par le Soleil que nous pouvons voir depuis la Terre.",
        "Notre Lune est un satellite rocheux. Sa gravité contribue fortement aux marées, et sa lumière apparente est de la lumière solaire réfléchie."
    )),
    ("tides", (r"\bmarees?\b",), (
        "Les marées sont principalement dues aux différences d'attraction gravitationnelle de la Lune sur les différentes parties de la Terre, avec une contribution du Soleil.",
        "La Lune exerce une attraction différente sur le côté proche et le côté éloigné de la Terre. Cela crée deux renflements océaniques qui, avec la rotation terrestre, produisent les cycles de marée.",
        "Les marées ne sont pas simplement l'eau 'tirée' d'un seul côté : le système Terre-Lune crée deux bosses de marée, modulées aussi par le Soleil et la forme des côtes."
    )),
    ("ice_floats", (r"\bglace\b.*\bflott", r"\bflott.*\bglace\b"), (
        "La glace flotte parce qu'elle est moins dense que l'eau liquide. En gelant, les molécules d'eau forment une structure cristalline plus ouverte qui occupe davantage de volume.",
        "L'eau est particulière : son solide est moins dense que son liquide. Cette baisse de densité lors du gel permet à la glace de rester à la surface.",
        "Quand l'eau gèle, son réseau cristallin espace davantage les molécules. À masse égale, la glace prend plus de volume et devient donc moins dense que l'eau."
    )),
    ("germination", (r"germination", r"\bgraine\b.*\bpouss"), (
        "Une graine germe lorsque l'eau réactive son métabolisme. La racine embryonnaire sort d'abord et pousse selon la gravité, tandis que la tige se développe vers la lumière.",
        "L'humidité, une température adaptée et souvent l'oxygène déclenchent la germination. Les réserves de la graine nourrissent la jeune plante jusqu'à ce qu'elle puisse photosynthétiser.",
        "La graine ne 'sait' pas où aller : ses cellules répondent à des signaux comme la gravité, la lumière, l'eau et des hormones végétales."
    )),
    ("virus_bacteria", (r"virus.*bacter", r"bacter.*virus"), (
        "Une bactérie est une cellule vivante capable de se reproduire seule dans de bonnes conditions. Un virus n'est pas une cellule et doit détourner une cellule hôte pour se multiplier.",
        "Les bactéries sont des organismes unicellulaires. Les virus sont des particules infectieuses contenant du matériel génétique et dépendent entièrement des cellules qu'ils infectent.",
        "Antibiotiques et antiviraux ne ciblent pas la même chose : les antibiotiques agissent sur certaines bactéries, pas sur les virus."
    )),
    ("sleep", (r"\bsommeil\b", r"\bdorm"), (
        "Le sommeil permet notamment au cerveau de consolider des souvenirs, de réguler de nombreux processus hormonaux et d'entretenir le fonctionnement du corps.",
        "Dormir n'est pas une simple mise en veille : le cerveau reste actif, trie des informations et alterne plusieurs phases essentielles à la récupération.",
        "Le besoin de sommeil vient de plusieurs mécanismes biologiques, dont une pression de sommeil qui augmente pendant l'éveil et une horloge circadienne d'environ vingt-quatre heures."
    )),
    ("memory", (r"memoire humaine", r"cerveau.*memor", r"memor.*cerveau"), (
        "La mémoire repose sur des réseaux de neurones dont les connexions se modifient avec l'expérience. L'attention, la répétition et le sommeil favorisent la consolidation des souvenirs.",
        "Le cerveau ne stocke pas un souvenir comme un fichier unique : différentes composantes sont encodées dans des réseaux distribués puis réactivées lors du rappel.",
        "Mémoriser passe grossièrement par l'encodage, la consolidation puis la récupération. L'hippocampe joue un rôle majeur pour de nombreux souvenirs récents."
    )),
    ("immune_system", (r"systeme immunitaire",), (
        "Le système immunitaire combine des défenses rapides et non spécifiques avec une réponse adaptative capable de reconnaître plus précisément certains agents infectieux.",
        "Il comprend des barrières comme la peau, des cellules qui réagissent immédiatement et des lymphocytes capables de former une mémoire immunitaire.",
        "Son rôle est de détecter ce qui menace l'organisme, de l'éliminer autant que possible puis, pour certaines infections, de conserver une mémoire de la rencontre."
    )),
    ("muscle_soreness", (r"courbatures?", r"muscles?.*douloureux.*effort"), (
        "Les courbatures tardives après un effort inhabituel sont surtout liées à de petites lésions et à une réaction inflammatoire dans les muscles, pas à de l'acide lactique resté plusieurs jours.",
        "Un exercice inhabituel, surtout avec des contractions excentriques, peut provoquer des microdommages musculaires. La douleur apparaît souvent plusieurs heures plus tard et culmine en un ou deux jours.",
        "Après un effort nouveau, le muscle doit réparer de minuscules dommages. Cette réparation et l'inflammation associée expliquent une grande partie des courbatures."
    )),
    ("body_temperature", (r"temperature du corps", r"regul.*temperature"), (
        "Le corps maintient sa température grâce à l'hypothalamus, qui coordonne notamment la transpiration, la dilatation ou la contraction des vaisseaux et les frissons.",
        "Quand il fait chaud, le corps augmente les pertes de chaleur, surtout par la transpiration et la circulation cutanée. Quand il fait froid, il réduit ces pertes et peut produire de la chaleur par les frissons.",
        "La thermorégulation est un système de contrôle : des capteurs détectent les écarts de température et le cerveau ajuste la production et la dissipation de chaleur."
    )),
    ("atom", (r"\batomes?\b",), (
        "Un atome est une unité de matière formée d'un noyau contenant protons et neutrons, entouré d'électrons. Le nombre de protons définit l'élément chimique.",
        "À très petite échelle, la matière est constituée d'atomes. Leur noyau concentre presque toute la masse, tandis que les électrons occupent des états quantiques autour de lui.",
        "Un atome n'est pas une petite bille pleine : il possède un noyau minuscule et un nuage électronique beaucoup plus étendu."
    )),
    ("magnet", (r"\baimant", r"magnet"), (
        "Un aimant crée un champ magnétique. Dans des matériaux ferromagnétiques comme le fer, ce champ peut aligner des domaines magnétiques et produire une forte attraction.",
        "Le magnétisme vient du comportement des électrons et de leurs moments magnétiques. Dans certains matériaux, beaucoup de ces moments s'alignent et forment un aimant permanent.",
        "Un aimant n'attire pas tous les métaux : le fer, le nickel et le cobalt réagissent fortement, tandis que l'aluminium ou le cuivre beaucoup moins dans les conditions ordinaires."
    )),
    ("mass_weight", (r"masse.*poids", r"poids.*masse"), (
        "La masse mesure la quantité de matière et l'inertie d'un objet ; elle s'exprime en kilogrammes. Le poids est une force due à la gravité et s'exprime en newtons.",
        "Ta masse reste pratiquement la même sur la Terre et sur la Lune, mais ton poids change parce que l'accélération gravitationnelle n'y est pas la même.",
        "Masse et poids ne sont donc pas synonymes : le poids vaut approximativement masse multipliée par l'accélération de la pesanteur."
    )),
    ("boiling_altitude", (r"eau.*bout.*altitude", r"ebullition.*altitude"), (
        "En altitude, la pression atmosphérique est plus faible. L'eau atteint donc la pression de vapeur nécessaire à l'ébullition à une température inférieure à 100 degrés Celsius.",
        "Un liquide bout lorsque sa pression de vapeur atteint la pression ambiante. Comme la pression baisse avec l'altitude, la température d'ébullition de l'eau baisse aussi.",
        "C'est pourquoi une cuisson dans l'eau bouillante peut être plus lente en montagne : l'eau bout plus tôt, mais à une température plus basse."
    )),
    ("battery", (r"\bbatterie\b",), (
        "Une batterie convertit de l'énergie chimique en énergie électrique grâce à des réactions d'oxydoréduction entre ses électrodes. Une batterie rechargeable peut inverser en grande partie ces réactions lors de la charge.",
        "Deux électrodes et un électrolyte permettent à des ions de circuler à l'intérieur pendant que les électrons passent par le circuit extérieur, fournissant du courant.",
        "Une batterie ne stocke pas directement des électrons comme un réservoir : elle stocke surtout de l'énergie sous forme chimique puis la convertit en électricité."
    )),
    ("wifi_bluetooth", (r"wi[- ]?fi.*bluetooth", r"bluetooth.*wi[- ]?fi"), (
        "Le Wi-Fi sert surtout à relier des appareils à un réseau local et à Internet avec un débit élevé et une portée de plusieurs dizaines de mètres. Le Bluetooth vise plutôt les liaisons directes à courte portée et basse consommation.",
        "Les deux utilisent des ondes radio, mais pas pour le même usage : le Wi-Fi privilégie le réseau et le débit, tandis que le Bluetooth privilégie la proximité, les accessoires et l'économie d'énergie.",
        "Un casque sans fil utilise souvent le Bluetooth ; un ordinateur connecté à une box utilise généralement le Wi-Fi. Les protocoles, la portée et les débits sont différents."
    )),
    ("ip_address", (r"adresse ip",), (
        "Une adresse IP identifie une interface sur un réseau utilisant le protocole Internet afin que les paquets puissent être acheminés vers la bonne destination.",
        "L'adresse IP joue un rôle comparable à une adresse de routage : les routeurs s'en servent pour décider où envoyer les paquets de données.",
        "IPv4 utilise des adresses sur 32 bits et IPv6 sur 128 bits. Une adresse IP n'identifie pas forcément une personne de façon permanente."
    )),
    ("operating_system", (r"systeme d exploitation",), (
        "Un système d'exploitation gère le matériel, la mémoire, les fichiers, les périphériques et l'exécution des programmes. Il fournit aussi des services communs aux applications.",
        "Windows, Linux, macOS ou Android sont des systèmes d'exploitation : ils font l'interface entre les logiciels et les ressources matérielles de la machine.",
        "Sans système d'exploitation généraliste, chaque programme devrait gérer lui-même une grande partie du processeur, de la mémoire, du stockage et des périphériques."
    )),
    ("backups", (r"sauvegard",), (
        "Une sauvegarde permet de récupérer des données après une panne, une suppression, un vol, un logiciel malveillant ou une erreur humaine. Elle doit être séparée de la copie de travail.",
        "Une bonne sauvegarde ne sert que si elle peut être restaurée. Il faut donc conserver plusieurs copies et tester périodiquement la restauration.",
        "La règle dite 3-2-1 recommande trois copies des données, sur au moins deux types de support, dont une copie conservée ailleurs ou isolée."
    )),
    ("ram_storage", (r"ram.*stockage", r"stockage.*ram"), (
        "La RAM est une mémoire de travail rapide et volatile : son contenu disparaît normalement à l'arrêt. Le stockage, comme un SSD, conserve les données durablement mais est plus lent.",
        "Plus de RAM permet de garder davantage de programmes et de données actifs sans devoir les déplacer vers le stockage. Le SSD sert surtout à conserver fichiers, applications et système.",
        "RAM et SSD n'ont donc pas le même rôle : l'une sert au travail immédiat du processeur, l'autre à la conservation persistante des données."
    )),
    ("gps", (r"\bgps\b",), (
        "Un récepteur GPS mesure le temps mis par les signaux de plusieurs satellites pour arriver jusqu'à lui. À partir de ces distances apparentes, il calcule sa position et son heure.",
        "Le GPS ne nécessite pas forcément Internet pour calculer une position : il écoute les satellites. Une connexion réseau peut cependant accélérer l'acquisition et fournir cartes ou trafic.",
        "Avec au moins quatre satellites correctement reçus, le récepteur peut résoudre sa position en trois dimensions ainsi que l'erreur de son horloge."
    )),
    ("encryption", (r"chiffrement", r"chiffr.*donnees"), (
        "Le chiffrement transforme des données lisibles en données inintelligibles sans la clé appropriée. Il protège surtout la confidentialité pendant le stockage ou le transport.",
        "Un bon système de chiffrement repose sur des algorithmes publics et des clés secrètes, pas sur le secret de l'algorithme lui-même.",
        "Le chiffrement ne remplace pas toutes les protections : il faut aussi gérer correctement les clés, l'authentification et l'intégrité des données."
    )),
    ("ai_model", (r"modele d intelligence artificielle", r"modele.*ia"), (
        "Un modèle d'intelligence artificielle est une fonction paramétrée apprise à partir de données. Pour un modèle de langage, ces paramètres servent à estimer quels éléments de texte sont plausibles dans un contexte donné.",
        "Pendant l'entraînement, le modèle ajuste de nombreux paramètres pour réduire ses erreurs sur des exemples. À l'utilisation, il applique ces paramètres à de nouvelles entrées.",
        "Un modèle d'IA n'est pas une base de données qui récite forcément ses exemples : il apprend des régularités statistiques, avec des limites et un risque d'erreur."
    )),
    ("rules_vs_examples", (r"regle.*apprentissage.*exemple", r"apprentissage.*exemple.*regle", r"regle programmee.*exemple"), (
        "Avec des règles programmées, un humain décrit explicitement quoi faire dans chaque cas prévu. Avec l'apprentissage par exemples, le système ajuste ses paramètres à partir de données pour généraliser à de nouveaux cas.",
        "Une logique à règles est déterministe tant que les règles couvrent le cas. Un modèle appris peut traiter des situations plus variées, mais il peut aussi produire des erreurs difficiles à prévoir.",
        "Les deux approches peuvent être combinées : règles strictes pour les actions critiques, apprentissage pour la perception ou la conversation."
    )),
    ("rome", (r"rome.*europe", r"influence de rome", r"empire romain"), (
        "Rome a profondément influencé l'Europe par le droit, les infrastructures, l'administration, le latin et la diffusion d'institutions qui ont survécu à l'Empire.",
        "L'héritage romain se retrouve notamment dans les langues romanes, de nombreux principes juridiques, l'urbanisme, les routes et une partie des structures politiques européennes.",
        "L'influence de Rome ne vient pas d'un seul élément : plusieurs siècles d'Empire ont diffusé des pratiques administratives, juridiques, linguistiques et techniques sur un immense territoire."
    )),
    ("renaissance", (r"renaissance",), (
        "La Renaissance désigne une période de profond renouvellement culturel en Europe, surtout du XIVe au XVIe siècle, marquée par l'humanisme, les arts, les sciences et la redécouverte de textes antiques.",
        "Elle n'a pas commencé partout au même moment, mais l'Italie a joué un rôle majeur. L'imprimerie, les échanges et le mécénat ont accéléré la diffusion des idées nouvelles.",
        "La Renaissance transforme notamment l'art, l'architecture, l'étude des textes, les sciences et la représentation de l'être humain."
    )),
    ("industrial_revolution", (r"revolution industrielle",), (
        "La Révolution industrielle correspond au passage progressif d'une production surtout artisanale à une production mécanisée, concentrée dans des usines et alimentée par de nouvelles sources d'énergie.",
        "À partir du XVIIIe siècle en Grande-Bretagne puis ailleurs, machines à vapeur, charbon, textile mécanisé, chemins de fer et industrie lourde ont bouleversé le travail et les villes.",
        "Elle a accru fortement la production, mais aussi provoqué urbanisation rapide, nouvelles classes sociales et conditions de travail souvent très dures."
    )),
    ("printing_press", (r"imprimerie",), (
        "L'imprimerie à caractères mobiles a permis de reproduire des textes beaucoup plus vite et à moindre coût que la copie manuscrite, ce qui a accéléré la diffusion des connaissances.",
        "En Europe, l'imprimerie de Gutenberg au XVe siècle a rendu les livres plus accessibles et facilité la circulation des idées religieuses, scientifiques et politiques.",
        "L'effet majeur de l'imprimerie est la multiplication de copies identiques : les idées peuvent atteindre beaucoup plus de lecteurs et être discutées plus largement."
    )),
    ("navigation_before_gps", (r"avant le gps", r"marins.*rep.*gps", r"navigation.*gps"), (
        "Avant le GPS, les marins combinaient cartes, compas, observation des astres, mesure de la vitesse et du temps, ainsi que des repères côtiers.",
        "Avec un sextant et un chronomètre précis, on pouvait déterminer latitude et longitude à partir d'observations astronomiques. Le compas donnait le cap.",
        "La navigation traditionnelle reposait sur plusieurs sources à la fois : estime, étoiles, Soleil, cartes, phares et mesures de profondeur près des côtes."
    )),
    ("representative_democracy", (r"democratie representative",), (
        "Dans une démocratie représentative, les citoyens élisent des représentants chargés de prendre des décisions publiques en leur nom pendant une période définie.",
        "Le principe est de déléguer le pouvoir politique par des élections, avec des règles constitutionnelles, des contre-pouvoirs et une responsabilité des élus qui varient selon les pays.",
        "Elle se distingue de la démocratie directe, où les citoyens votent eux-mêmes plus souvent sur les décisions politiques."
    )),
    ("four_stroke", (r"moteur.*quatre temps", r"quatre temps.*moteur"), (
        "Un moteur quatre temps enchaîne admission, compression, combustion-détente puis échappement. Le cycle complet demande deux tours de vilebrequin.",
        "Le piston aspire d'abord le mélange ou l'air, le comprime, reçoit ensuite l'énergie de la combustion, puis chasse les gaz brûlés.",
        "Les quatre temps décrivent les mouvements successifs du piston ; l'étincelle concerne un moteur essence, tandis qu'un diesel déclenche la combustion par forte compression."
    )),
    ("differential", (r"differentiel.*voiture", r"differentiel automobile", r"role.*differentiel"), (
        "Le différentiel transmet le couple aux roues motrices tout en leur permettant de tourner à des vitesses différentes, ce qui est indispensable dans un virage.",
        "Dans un virage, la roue extérieure parcourt plus de distance que la roue intérieure. Le différentiel permet cette différence sans forcer les pneus à glisser.",
        "Sans différentiel sur un essieu moteur classique, les deux roues seraient contraintes de tourner ensemble et la transmission comme les pneus subiraient de fortes contraintes en virage."
    )),
    ("alternator", (r"alternateur",), (
        "L'alternateur transforme une partie de l'énergie mécanique du moteur en électricité. Il alimente les équipements du véhicule et recharge la batterie quand le moteur tourne.",
        "Il produit un courant alternatif qui est redressé en courant continu pour le réseau électrique de la voiture. Un régulateur maintient la tension dans une plage adaptée.",
        "La batterie sert surtout au démarrage et aux besoins temporaires ; moteur en marche, l'alternateur prend normalement en charge l'alimentation électrique et la recharge."
    )),
    ("tire_pressure", (r"pression.*pneus?", r"pneus?.*pression"), (
        "Une pression correcte permet au pneu de conserver la forme de contact prévue avec la route. Trop basse ou trop haute, elle modifie tenue de route, usure, échauffement et consommation.",
        "Un pneu sous-gonflé se déforme davantage, chauffe plus et augmente la résistance au roulement. Un pneu surgonflé peut réduire le confort et modifier l'adhérence.",
        "La bonne valeur est celle recommandée par le constructeur pour le véhicule et la charge, mesurée de préférence à froid."
    )),
    ("bread_rise", (r"pain.*leve", r"levure.*pain"), (
        "La levure transforme des sucres en dioxyde de carbone et en alcool pendant la fermentation. Le gaz reste piégé dans le réseau de gluten et fait gonfler la pâte.",
        "Le pain lève parce que les levures produisent du CO2. Les bulles sont retenues par la structure de la pâte, puis la cuisson fixe cette structure.",
        "Température, quantité de levure, disponibilité des sucres et force du réseau de gluten influencent la vitesse et l'ampleur de la levée."
    )),
    ("steam_cooking", (r"cuisson.*vapeur", r"vapeur.*cuisson"), (
        "La cuisson à la vapeur chauffe les aliments grâce à de la vapeur d'eau chaude sans les immerger. Elle limite souvent les pertes de certains nutriments hydrosolubles par rapport à une cuisson dans beaucoup d'eau.",
        "La vapeur transfère efficacement sa chaleur aux aliments en se condensant à leur surface. La cuisson reste humide et ne produit pas le brunissement d'une cuisson sèche.",
        "Cuire à la vapeur consiste à placer l'aliment au-dessus d'une eau bouillante. La vapeur chaude cuit sans contact direct avec l'eau."
    )),
    ("rhythm_melody", (r"rythme.*melodie", r"melodie.*rythme"), (
        "Le rythme organise les durées et les accents dans le temps. La mélodie est une succession de hauteurs de notes perçue comme une ligne musicale.",
        "On peut battre le rythme d'un morceau sans en chanter les notes ; la mélodie correspond justement à l'enchaînement des notes que l'on peut fredonner.",
        "Rythme et mélodie sont complémentaires : l'un structure le temps, l'autre dessine le mouvement des hauteurs."
    )),
    ("speaker", (r"enceinte acoustique", r"haut[- ]parleur"), (
        "Un haut-parleur transforme un signal électrique en mouvement mécanique grâce à une bobine placée dans un champ magnétique. La membrane met ensuite l'air en vibration pour produire le son.",
        "Le courant audio traverse une bobine mobile, qui avance et recule dans le champ d'un aimant. Ce mouvement entraîne la membrane et crée des variations de pression dans l'air.",
        "Une enceinte acoustique combine un ou plusieurs haut-parleurs avec un coffret qui contrôle en partie leur rayonnement et les basses fréquences."
    )),
    ("stereo", (r"mono.*stereo", r"stereo.*mono", r"son stereo"), (
        "Le mono utilise essentiellement un seul canal audio. La stéréo en utilise au moins deux, généralement gauche et droite, ce qui permet de créer une sensation de largeur et de position.",
        "En mono, les mêmes informations principales sont regroupées dans un seul canal. En stéréo, des différences entre les canaux gauche et droit donnent une impression spatiale.",
        "La stéréo ne signifie pas forcément meilleur son, mais elle permet de reproduire une scène sonore latérale que le mono ne peut pas créer de la même façon."
    )),
    ("habits", (r"habitudes?.*difficiles?.*changer", r"changer.*habitudes"), (
        "Une habitude devient automatique parce qu'un comportement est répété dans un contexte stable et associé à une récompense ou à une réduction d'effort. La changer demande souvent de modifier le déclencheur, la routine ou la récompense.",
        "Les habitudes économisent de l'attention au cerveau. C'est utile, mais cela rend leur modification plus difficile quand le comportement est profondément lié à un contexte ou une émotion.",
        "Pour changer une habitude, il est souvent plus efficace de remplacer la routine par une autre action précise que de compter uniquement sur la volonté."
    )),
    ("opinion_fact", (r"opinion.*fait", r"fait.*opinion"), (
        "Un fait est une affirmation qui peut être vérifiée par des observations ou des sources fiables. Une opinion exprime un jugement, une préférence ou une interprétation.",
        "La phrase « l'eau pure gèle autour de zéro degré à pression normale » est vérifiable : c'est un fait. « L'hiver est la meilleure saison » relève d'une opinion.",
        "Une opinion peut s'appuyer sur des faits, mais elle reste un jugement. Pour les distinguer, demande si l'affirmation peut être testée indépendamment des préférences de la personne."
    )),
    ("multiple_sources", (r"plusieurs sources", r"verifier.*sources"), (
        "Comparer plusieurs sources réduit le risque de dépendre d'une erreur, d'un biais ou d'une information dépassée. Les sources indépendantes et proches du fait original sont particulièrement utiles.",
        "Une information répétée partout n'est pas automatiquement vraie si toutes les publications copient la même source initiale. Il faut chercher l'origine et la qualité des preuves.",
        "Vérifier plusieurs sources permet de repérer les contradictions, de dater l'information et de distinguer consensus solide, incertitude et simple rumeur."
    )),
    ("project_steps", (r"projet.*complique", r"decouper.*projet", r"etapes simples"), (
        "Pour rendre un projet compliqué gérable, commence par définir le résultat attendu, puis découpe-le en sous-objectifs indépendants et vérifiables. Chaque étape doit produire quelque chose que tu peux tester.",
        "Un bon découpage sépare conception, préparation, réalisation, test et validation. Cela permet de localiser les erreurs sans devoir tout recommencer.",
        "Plus une étape est risquée ou irréversible, plus il est utile de la tester isolément avant de l'intégrer au reste du projet."
    )),
    ("listening", (r"ecoute attentive", r"mieux ecouter", r"ecouter quelqu"), (
        "Bien écouter consiste à laisser l'autre finir, vérifier ce que l'on a compris et poser des questions précises plutôt que préparer sa réponse pendant qu'il parle.",
        "Reformuler brièvement les points importants aide à détecter les malentendus. Une bonne écoute ne signifie pas être d'accord, mais comprendre correctement avant de répondre.",
        "Quand un problème est complexe, noter les faits, les contraintes et les inconnues pendant l'explication évite d'oublier des éléments essentiels."
    )),
    ("test_before_deploy", (r"tester.*avant.*deploi", r"avant.*deployer", r"modification.*deployer"), (
        "Tester avant de déployer permet de détecter une erreur sur un environnement limité avant qu'elle n'affecte tout le système. Il faut aussi prévoir un retour arrière.",
        "Une modification qui fonctionne en théorie peut échouer à cause de dépendances, de données réelles ou d'un cas non prévu. Un test isolé réduit fortement ce risque.",
        "Pour un système critique, on valide d'abord la syntaxe, puis les tests à blanc, ensuite un essai contrôlé, et seulement après le déploiement général."
    )),
)

def answer_verified_general(message: str, session_id: str = "default") -> str | None:
    n = _norm(message)
    if not n or not _is_explanation_request(n):
        return None
    for topic, patterns, variants in _ENTRIES:
        if any(re.search(pattern, n) for pattern in patterns):
            return _pick(topic, n, session_id, variants)
    return None
