"""
KITT Franco-Belge — YouTube Manager
Améliore automatiquement les titres, descriptions et tags des vidéos YouTube
"""

import os
import json
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# -- Config ------------------------------------------------------------------
CLIENT_SECRET_FILE = "client_secret_2_305166614659-a4djd1es96l8g7u58brr74ghr3cr3btv.apps.googleusercontent.com.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
TOKEN_FILE = "youtube_token.pickle"

# -- Style KITT pour les descriptions ----------------------------------------
DESCRIPTION_FOOTER = """
-----------------------------------------
[KITT] KITT Franco-Belge — Système Central
Projet Knight Rider by Manix

🌐 Site officiel : https://on3egs.github.io/Kitt-franco-belge/
🤖 Interface KYRONEX : https://on3egs.github.io/Kitt-franco-belge/kyronex/

#KITT #KnightRider #KITTFrancoBelge #ElectroniqueEmbarquee #PontiucTransAm #Manix
-----------------------------------------
"""

DEFAULT_TAGS = [
    "KITT", "Knight Rider", "KITT Franco-Belge", "Manix",
    "électronique embarquée", "Pontiac Trans Am", "voiture intelligente",
    "intelligence artificielle", "retro futuriste", "DIY auto",
    "Kyronex", "Jetson", "IA embarquée"
]

# -- Auth ---------------------------------------------------------------------
def get_authenticated_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "wb") as f:
            pickle.dump(creds, f)

    return build("youtube", "v3", credentials=creds)

# -- Lister les vidéos --------------------------------------------------------
def get_all_videos(youtube):
    videos = []
    # On passe par la chaîne
    channel_request = youtube.channels().list(part="contentDetails", mine=True)
    channel_response = channel_request.execute()
    uploads_playlist = channel_response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    next_page = None
    while True:
        pl_request = youtube.playlistItems().list(
            part="contentDetails",
            playlistId=uploads_playlist,
            maxResults=50,
            pageToken=next_page
        )
        pl_response = pl_request.execute()
        video_ids = [item["contentDetails"]["videoId"] for item in pl_response["items"]]

        vid_request = youtube.videos().list(part="snippet", id=",".join(video_ids))
        vid_response = vid_request.execute()
        videos.extend(vid_response["items"])

        next_page = pl_response.get("nextPageToken")
        if not next_page:
            break

    return videos

# -- Afficher les vidéos ------------------------------------------------------
def display_videos(videos):
    print("\n" + "="*60)
    print("  KITT FRANCO-BELGE — Vidéos YouTube")
    print("="*60)
    for i, v in enumerate(videos):
        snippet = v["snippet"]
        print(f"\n[{i+1}] {snippet['title']}")
        print(f"    ID      : {v['id']}")
        print(f"    Tags    : {', '.join(snippet.get('tags', [])) or '(aucun)'}")
        desc = snippet.get('description', '')
        print(f"    Desc    : {desc[:80]}{'...' if len(desc) > 80 else ''}")
    print("\n" + "="*60)

    # Sauvegarde dans un fichier lisible
    with open("videos_list.txt", "w", encoding="utf-8") as f:
        for i, v in enumerate(videos):
            snippet = v["snippet"]
            f.write(f"[{i+1}] {snippet['title']}\n")
            f.write(f"    ID   : {v['id']}\n")
            f.write(f"    Tags : {', '.join(snippet.get('tags', [])) or '(aucun)'}\n")
            f.write(f"    Desc : {snippet.get('description', '')[:200]}\n\n")
    print("  [OK] Liste sauvegardee dans videos_list.txt")

# -- Mettre à jour une vidéo --------------------------------------------------
def update_video(youtube, video, new_title=None, new_description=None, add_tags=True):
    snippet = video["snippet"]

    title = new_title if new_title else snippet["title"]

    # Ajoute le footer KITT à la description existante si pas déjà présent
    current_desc = snippet.get("description", "")
    if DESCRIPTION_FOOTER.strip() not in current_desc:
        description = (new_description if new_description else current_desc) + DESCRIPTION_FOOTER
    else:
        description = new_description if new_description else current_desc

    # Fusionne les tags
    existing_tags = snippet.get("tags", [])
    if add_tags:
        tags = list(set(existing_tags + DEFAULT_TAGS))
    else:
        tags = existing_tags

    body = {
        "id": video["id"],
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags,
            "categoryId": snippet.get("categoryId", "28")  # 28 = Science & Tech
        }
    }

    youtube.videos().update(part="snippet", body=body).execute()
    print(f"  [OK] Mise à jour : {title}")

# -- Menu principal -----------------------------------------------------------
def main():
    print("\n[KITT] KITT Franco-Belge — YouTube Manager")
    print("Connexion à YouTube...")
    youtube = get_authenticated_service()
    print("[OK] Connecté !\n")

    videos = get_all_videos(youtube)
    display_videos(videos)

    print("\nQue veux-tu faire ?")
    print("  [1] Ajouter le footer KITT + tags à TOUTES les vidéos")
    print("  [2] Modifier une vidéo spécifique")
    print("  [3] Juste afficher les vidéos")
    print("  [4] Mettre à jour les 3 Shorts KARR/KITT")
    print("  [5] Corriger le titre 'Altrernateur' -> 'Alternateur'")
    print("  [0] Quitter")

    choice = input("\nChoix : ").strip()

    if choice == "1":
        print("\nMise à jour de toutes les vidéos...")
        for v in videos:
            update_video(youtube, v)
        print("\n[OK] Toutes les vidéos ont été mises à jour !")

    elif choice == "2":
        num = int(input("Numéro de la vidéo : ")) - 1
        if 0 <= num < len(videos):
            v = videos[num]
            print(f"\nVidéo sélectionnée : {v['snippet']['title']}")
            new_title = input("Nouveau titre (Entrée = garder l'actuel) : ").strip()
            print("Nouvelle description (Entrée = garder l'actuelle) :")
            new_desc = input().strip()
            update_video(
                youtube, v,
                new_title=new_title if new_title else None,
                new_description=new_desc if new_desc else None
            )
            print("[OK] Vidéo mise à jour !")
        else:
            print("Numéro invalide.")

    elif choice == "3":
        pass  # déjà affiché

    elif choice == "4":
        # Mise à jour des 3 Shorts
        shorts = {
            "wNIHv_39V_8": {
                "title": "KARR Franco-Belge — Pare-choc mise en peinture #Shorts",
                "description": "Avancement de la mise en peinture du pare-choc KARR style Knight Rider 1982. Le dessus en noir mat comme KARR (le double maléfique de KITT), le dessous prévu en gris. Chaque coup de pinceau nous rapproche du look authentique de la série originale.\n\n#KARR #KITT #KnightRider #PareChoc #MiseEnPeinture #Pontiac #DIYAuto"
            },
            "-LZcgCjkEHs": {
                "title": "KITT Franco-Belge — Progression générale intérieur & extérieur #Shorts",
                "description": "Aperçu général de l'avancement du projet KITT Franco-Belge : électronique du dashboard style Knight Rider Saison 4, pare-choc avant en cours de ponçage et mise en peinture. Le projet prend forme !\n\n#KITT #KnightRider #Dashboard #ElectroniqueEmbarquee #DIYAuto #Pontiac"
            },
            "77MWglJ7wH0": {
                "title": "KARR Franco-Belge — Résultat peinture pare-choc noir & gris #Shorts",
                "description": "Quelques secondes après la mise en peinture du pare-choc KARR : dessus noir comme KARR dans Knight Rider 1982, dessous en gris à venir. Le rendu est fidèle à l'original !\n\n#KARR #KITT #KnightRider #Peinture #PareChoc #Pontiac #DIYAuto"
            }
        }

        print("\nMise à jour des 3 Shorts...")
        for v in videos:
            vid_id = v["id"]
            if vid_id in shorts:
                data = shorts[vid_id]
                update_video(youtube, v, new_title=data["title"], new_description=data["description"])
        print("\n[OK] Les 3 Shorts ont été mis à jour !")

    elif choice == "5":
        for v in videos:
            if v["id"] == "LGY_-kAH_do":
                update_video(youtube, v, new_title="Alternateur Firebird — Réparation CS130 ACDelco Remy")
                print("[OK] Titre corrigé !")
                break

    print("\n[KITT] KITT out.\n")

if __name__ == "__main__":
    main()
