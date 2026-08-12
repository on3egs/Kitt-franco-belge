#!/usr/bin/env python3
"""Réponses techniques vérifiées pour les Pontiac liées au projet K-4000."""

from __future__ import annotations

import re
import unicodedata


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", (text or "").lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _result(parts: list[str]) -> dict | None:
    clean = [part.strip() for part in parts if part and part.strip()]
    return {"reply": "\n\n".join(clean), "action": "vehicle_specs_technical"} if clean else None


def vehicle_spec_result(user_message: str, technical_mode: bool = False) -> dict | None:
    """Répond sans extrapoler une pression, une huile ou une dimension manquante."""
    norm = _normalize(user_message)
    words = set(norm.split())

    mentions_trans_am = any(alias in norm for alias in ("trans am", "transam", "transame", "trans amme"))
    mentions_banshee = any(alias in norm for alias in ("banshee", "benchy", "benshee", "banshi", "banshe"))
    mentions_firebird = "firebird" in words
    mentions_k4000 = "k4000" in words or "k 4000" in norm or "k 4 pile" in norm

    asks_pressure = any(marker in norm for marker in (
        "pression", "pneu", "pneus", "gonflage", "combien de bar", "combien bar", "psi", "kpa",
    ))
    asks_oil = any(marker in norm for marker in (
        "huile", "viscosite", "5w30", "5 w 30", "10w30", "10 w 30", "30w05", "sae",
    ))
    asks_dimensions = bool(words & {"taille", "hauteur", "longueur", "largeur", "dimensions", "dimension", "gabarit"})
    asks_engine = bool(words & {"moteur", "moteurs", "motorisation", "v8"})
    asks_sources = bool(words & {"source", "sources", "preuve", "preuves", "reference", "references"})

    if not any((mentions_trans_am, mentions_banshee, mentions_firebird, mentions_k4000)):
        return None
    if not any((asks_pressure, asks_oil, asks_dimensions, asks_engine)):
        return None

    parts: list[str] = []

    if mentions_trans_am and ("1982" in norm or not any(year in norm for year in ("1993", "2001", "2002"))):
        if asks_engine:
            parts.append(
                "Trans Am 1982 : deux V8 Chevrolet 5,0 litres de 305 pouces cubes étaient proposés, "
                "le LG4 à carburateur quatre corps de 145 ch et le LU5 Cross-Fire à injection de 165 ch. "
                "Ce sont des V8 OHV à huit cylindres en V et seize soupapes, pas des quatre-cylindres en ligne."
            )
        if asks_dimensions:
            parts.append(
                "Trans Am 1982 : environ 4,821 mètres de long, 1,829 mètre de large et 1,265 mètre de haut, "
                "avec un empattement de 2,565 mètres. La brochure Pontiac précise que les équipements peuvent légèrement modifier ces dimensions."
            )
        if asks_pressure:
            parts.append(
                "Pression des pneus de la Trans Am 1982 : je ne possède pas de valeur quotidienne unique suffisamment vérifiée pour toutes les montes. "
                "Il faut utiliser la pression à froid inscrite sur la plaque pneumatique du véhicule, correspondant exactement aux pneus et aux jantes montés. "
                "Une pression à froid se contrôle après au moins trois heures à l’arrêt, et la valeur maximale inscrite sur le flanc du pneu ne remplace pas la consigne du véhicule."
            )
        if asks_oil:
            parts.append(
                "Huile du V8 5,0 litres 305 de 1982 : la référence de maintenance disponible donne la SAE 10W-30 comme viscosité préférée en usage courant. "
                "La SAE 5W-30 est indiquée par temps froid, sous environ moins 7 degrés Celsius. Je ne présenterai donc pas la 5W-30 comme universelle sans connaître la température, l’état du moteur et sa configuration exacte."
            )

    if mentions_firebird and not mentions_trans_am:
        if "1993" in norm:
            if asks_dimensions:
                parts.append(
                    "Firebird 1993 : la Firebird et la Formula mesurent 4,968 mètres de long et 1,321 mètre de haut ; "
                    "la Trans Am mesure 5,005 mètres de long et 1,312 mètre de haut. La largeur est de 1,893 mètre et l’empattement de 2,566 mètres."
                )
            if asks_oil:
                parts.append("Firebird 1993 : le manuel GM indique que la SAE 5W-30 est la viscosité préférée. La SAE 10W-30 est admise lorsque la température prévue est de moins 18 degrés Celsius ou plus.")
        elif "2001" in norm or "2002" in norm:
            if asks_dimensions:
                parts.append(
                    "Firebird 2001 : le coupé mesure 1,322 mètre de haut. La longueur est de 4,911 mètres pour Firebird ou Formula, "
                    "et 4,919 mètres pour Trans Am ou GT ; largeur 1,890 mètre, empattement 2,566 mètres."
                )
            if asks_oil:
                if "v6" in words or "3800" in words or "3 8" in norm:
                    parts.append(
                        "Firebird 2001 V6 3,8 litres : GM préfère la SAE 10W-30. "
                        "La SAE 5W-30 convient lorsque la température prévue reste sous 16 degrés Celsius, notamment par grand froid."
                    )
                elif "v8" in words or "5 7" in norm:
                    parts.append(
                        "Firebird 2001 V8 5,7 litres : GM recommande la SAE 5W-30. "
                        "La SAE 10W-30 est admise lorsque la température prévue est de moins 18 degrés Celsius ou plus."
                    )
                else:
                    parts.append(
                        "Firebird 2001 : pour le V8 5,7 litres, GM recommande la SAE 5W-30 et admet la 10W-30 lorsque la température prévue est de moins 18 degrés Celsius ou plus. "
                        "Pour le V6 3,8 litres, GM préfère la SAE 10W-30 ; la 5W-30 convient lorsque la température prévue reste sous 16 degrés Celsius."
                    )
        else:
            if asks_dimensions:
                parts.append("Firebird : donne-moi son année et sa version, car la hauteur et la longueur changent selon la génération et la carrosserie.")
            if asks_oil:
                parts.append("Huile Firebird : donne-moi l’année et le moteur exacts. Une 2001 V8 5,7 litres et une 2001 V6 3,8 litres ne reçoivent pas la même recommandation principale.")

        if asks_pressure:
            parts.append(
                "Pression Firebird : la valeur correcte est celle de l’étiquette Tire-Loading sur la porte conducteur, pneus froids. "
                "Les manuels GM imposent de suivre cette étiquette, car la pression varie avec l’année, la monte et la charge ; donne-moi ces éléments ou une photo de la plaque pour une valeur précise."
            )

    if mentions_banshee:
        if asks_dimensions:
            parts.append(
                "Pontiac Banshee IV de 1988 : environ 5,105 mètres de long, 2,032 mètres de large et 1,176 mètre de haut, "
                "avec un empattement de 2,667 mètres. C’est un prototype très bas, pas une Firebird de série."
            )
        if asks_engine:
            parts.append(
                "La Banshee IV utilise un prototype V8 4,0 litres à double arbre à cames en tête et injection, annoncé autour de 230 ch, "
                "avec une boîte manuelle Getrag à cinq rapports et une propulsion arrière."
            )
        if asks_pressure:
            parts.append(
                "Pression des pneus de la Banshee IV : INCONNUE dans les documents publics fiables consultés. "
                "Comme il s’agit d’un concept-car, je ne lui attribue ni la pression d’une Firebird ni celle de la Dodge Stealth du téléfilm."
            )
        if asks_oil:
            parts.append(
                "Huile de la Banshee IV : aucune viscosité SAE d’entretien vérifiée n’a été retrouvée pour ce moteur prototype. "
                "Le fait qu’il s’agisse d’un V8 4,0 litres ne suffit pas pour recommander de la 5W-30."
            )

    if mentions_k4000:
        if asks_dimensions:
            parts.append(
                "K-4000 de Frank : sa carrosserie a été profondément transformée ; sa hauteur et ses autres dimensions finales doivent être mesurées sur le véhicule réel. "
                "Je ne dois pas recopier automatiquement les dimensions de la Firebird donneuse."
            )
        if asks_pressure:
            parts.append(
                "K-4000 de Frank : la pression doit être déterminée à partir de la monte réellement installée, des charges par essieu et de la plaque du véhicule donneur, puis validée pour les modifications. "
                "Sans taille de pneus et plaque, je ne donne pas de nombre au hasard."
            )
        if asks_oil:
            parts.append(
                "K-4000 de Frank : il faut confirmer le moteur et son année avant de choisir une huile. La donnée V6 3,8 litres enregistrée reste provisoire ; je ne transforme donc pas une hypothèse en recommandation d’entretien."
            )

    if not parts:
        return None

    if asks_sources or technical_mode:
        parts.append(
            "Références utilisées : brochures Pontiac 1982 ; manuels officiels GM Firebird 1993 et 2001 ; documentation historique du concept Pontiac Banshee IV. "
            "Pour toute opération réelle, la plaque pneumatique et le manuel correspondant au numéro de châssis restent prioritaires."
        )

    return _result(parts)
