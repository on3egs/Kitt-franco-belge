# Registre réseau des Jetson

La source unique des adresses inter-Jetson est `config/jetson_fleet.json`.
Les adresses ne doivent être ajoutées dans aucun script, prompt ou module.

Pour ajouter une machine, ajouter une entrée dans `machines` avec un identifiant
stable, un nom, le matériel, une `base_url`, un état (`active` ou `planned`) et
les alias éventuels. Les applications relisent ce fichier à chaque résolution.

Le module `jetson_network.py` fournit `get_base_url("machine_id")` pour HTTP,
`get_host("machine_id")` pour SSH/SCP, `get_peers("machine_locale")` pour la
découverte, `network_context("machine_locale")` pour la mémoire du prompt et
`registry_snapshot("machine_locale")` pour l'API.

Exemples :

```bash
python3 jetson_network.py url kitt_k4000
python3 jetson_network.py host karr_virginie
python3 jetson_network.py list
```

Chaque serveur expose aussi `GET /api/network/machines`. La variable
`KYRONEX_JETSON_NETWORK_CONFIG` permet de charger un registre temporaire lors
d'un test sans introduire d'adresse dans le code.
