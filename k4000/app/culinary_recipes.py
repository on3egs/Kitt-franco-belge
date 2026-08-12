#!/usr/bin/env python3
"""Recettes de référence du mode cuisine K-4000 (base : quatre personnes)."""

from __future__ import annotations

import re
import unicodedata


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", (text or "").lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


RECIPES = (
    {
        "aliases": ("pain perdu", "french toast"),
        "text": """Pain perdu classique pour quatre personnes, sans farine ajoutée.

Ingrédients : 6 tranches épaisses de pain rassis, 3 œufs, 250 millilitres de lait, 75 grammes de sucre, 1 sachet de sucre vanillé facultatif et du beurre pour la poêle. La farine est déjà présente dans le pain ; on n’en ajoute pas dans l’appareil classique.

Préparation :
1. Fouette les œufs avec le sucre, puis ajoute le lait.
2. Trempe chaque tranche de pain rassis dans le mélange, assez longtemps pour l’imbiber sans la désagréger.
3. Fais fondre un peu de beurre dans une poêle à feu moyen.
4. Fais dorer les tranches environ 2 à 3 minutes de chaque côté. Sers-les chaudes.

Conseil : utilise du pain rassis ou de la brioche rassise, qui absorbent mieux l’appareil. Allergènes : gluten, œufs et lait. Base vérifiée avec les recettes classiques Larousse et Marmiton.""",
    },
    {
        "aliases": ("crepe", "crepes"),
        "text": """Crêpes pour quatre personnes, environ douze crêpes.

Ingrédients : 250 grammes de farine, 4 œufs, 500 millilitres de lait, 40 grammes de beurre fondu ou 2 cuillères à soupe d’huile neutre, 1 pincée de sel. Pour une version sucrée, ajoute 1 à 2 cuillères à soupe de sucre et un peu de vanille.

Préparation :
1. Mets la farine et le sel dans un saladier, puis forme un puits.
2. Incorpore les œufs. Verse progressivement le lait en fouettant pour éviter les grumeaux.
3. Ajoute le beurre fondu. Laisse reposer la pâte 30 minutes si possible.
4. Chauffe une poêle légèrement graissée. Verse une petite louche, cuis environ 1 minute, retourne la crêpe puis cuis encore 30 secondes.

Conseil : si la pâte paraît trop épaisse après le repos, ajoute un peu de lait. Allergènes : gluten, œufs et lait.""",
    },
    {
        "aliases": ("quiche lorraine", "quiche"),
        "text": """Quiche lorraine pour quatre personnes.

Ingrédients : 1 pâte brisée, 200 grammes de lardons fumés, 3 œufs, 200 millilitres de crème entière, 200 millilitres de lait, poivre et une pincée de noix de muscade. La version lorraine traditionnelle ne contient pas obligatoirement de fromage.

Préparation :
1. Préchauffe le four à 180 degrés Celsius.
2. Fais revenir les lardons puis égoutte-les. Dispose la pâte dans un moule et pique le fond.
3. Bats les œufs avec la crème, le lait, le poivre et la muscade. Sale très peu, car les lardons le sont déjà.
4. Répartis les lardons, verse l’appareil et enfourne 35 à 40 minutes, jusqu’à ce que le centre soit pris et le dessus doré.

Conseil : laisse reposer 5 minutes avant de couper. Allergènes : gluten, œufs et lait.""",
    },
    {
        "aliases": ("ratatouille",),
        "text": """Ratatouille pour quatre personnes.

Ingrédients : 1 aubergine, 2 courgettes, 1 poivron rouge, 1 poivron jaune, 1 oignon, 2 gousses d’ail, 500 grammes de tomates, 3 cuillères à soupe d’huile d’olive, thym, laurier, sel et poivre.

Préparation :
1. Coupe les légumes en morceaux réguliers.
2. Fais revenir séparément l’aubergine, les courgettes et les poivrons pour conserver leur texture.
3. Fais fondre l’oignon, ajoute l’ail puis les tomates, le thym et le laurier.
4. Réunis tous les légumes et laisse mijoter doucement 30 à 40 minutes, sans les réduire en purée.

Conseil : elle est souvent meilleure réchauffée le lendemain. Cette recette ne contient naturellement ni gluten, ni œuf, ni lait, mais vérifie toujours les produits utilisés en cas d’allergie.""",
    },
    {
        "aliases": ("boeuf bourguignon", "bourguignon"),
        "text": """Bœuf bourguignon pour quatre personnes.

Ingrédients : 800 grammes de bœuf à braiser, 150 grammes de lardons, 750 millilitres de vin rouge, 2 carottes, 2 oignons, 2 gousses d’ail, 1 cuillère à soupe de farine, 250 millilitres de bouillon, 1 bouquet garni, 200 grammes de champignons, huile, sel et poivre.

Préparation :
1. Fais dorer la viande en plusieurs fois, puis les lardons et les oignons.
2. Remets la viande, ajoute la farine et mélange. Verse le vin et le bouillon, puis ajoute carottes, ail et bouquet garni.
3. Couvre et laisse mijoter très doucement environ 3 heures, ou cuis au four à 160 degrés Celsius, jusqu’à ce que la viande soit tendre.
4. Fais revenir les champignons séparément et ajoute-les pendant les 30 dernières minutes.

Conseil : prépare-le la veille pour développer les saveurs. Le vin ne convient pas automatiquement à toutes les personnes malgré la cuisson. Allergènes possibles : gluten dans la farine et le bouillon.""",
    },
    {
        "aliases": ("carbonara", "carbonara traditionnelle"),
        "text": """Pâtes carbonara traditionnelles pour quatre personnes.

Ingrédients : 320 grammes de spaghetti, 150 grammes de guanciale, 4 jaunes d’œufs plus 1 œuf entier, 100 grammes de pecorino romano finement râpé et beaucoup de poivre noir. Pas de crème dans la version traditionnelle.

Préparation :
1. Fais dorer doucement le guanciale dans une poêle, sans ajouter d’huile.
2. Mélange les œufs, le pecorino et le poivre dans un bol.
3. Fais cuire les pâtes al dente et conserve une tasse d’eau de cuisson.
4. Hors du feu, mélange les pâtes avec le guanciale, puis ajoute le mélange œufs-fromage. Détends progressivement avec un peu d’eau de cuisson pour obtenir une sauce crémeuse sans brouiller les œufs.

Conseil : retire impérativement la poêle du feu avant d’ajouter les œufs. Allergènes : gluten, œufs et lait.""",
    },
    {
        "aliases": ("tarte tatin", "tatin"),
        "text": """Tarte Tatin pour quatre à six personnes.

Ingrédients : 1,2 kilogramme de pommes fermes, 150 grammes de sucre, 80 grammes de beurre et 1 pâte feuilletée ou brisée.

Préparation :
1. Préchauffe le four à 180 degrés Celsius. Épluche les pommes et coupe-les en quartiers.
2. Fais un caramel blond avec le sucre dans un moule compatible avec la cuisson, puis ajoute prudemment le beurre.
3. Range les pommes bien serrées et cuis-les 10 à 15 minutes à feu doux.
4. Recouvre de pâte en rentrant les bords. Enfourne 35 à 40 minutes.
5. Attends environ 10 minutes, puis retourne la tarte avec précaution : le caramel est brûlant.

Conseil : choisis des pommes qui tiennent à la cuisson. Allergènes : gluten et lait selon la pâte et le beurre.""",
    },
)


def culinary_recipe_result(user_message: str, enabled: bool) -> dict | None:
    """Retourne une recette fiable lorsqu’un plat connu est demandé en mode cuisine."""
    if not enabled:
        return None
    norm = _normalize(user_message)
    culinary_question_markers = (
        "recette", "preparer", "cuisiner", "ingredient", "ingredients", "comment",
        "combien", "faut", "contient", "farine", "oeuf", "oeufs", "lait", "cuisson",
        "temperature", "temps",
    )
    asks_recipe = any(marker in norm for marker in culinary_question_markers)
    for recipe in RECIPES:
        if any(alias in norm for alias in recipe["aliases"]) and (asks_recipe or len(norm.split()) <= 6):
            return {"reply": recipe["text"], "action": "culinary_recipe"}
    return None
