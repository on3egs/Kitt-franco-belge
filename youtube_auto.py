"""
KITT Franco-Belge — YouTube Auto
Lance options 10 (désactiver Made for Kids) puis 9 (commentaires épinglés) sans interaction.
"""

import os
import pickle
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

CLIENT_SECRET_FILE = "client_secret_2_305166614659-a4djd1es96l8g7u58brr74ghr3cr3btv.apps.googleusercontent.com.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
TOKEN_FILE = "youtube_token.pickle"

PINNED_COMMENT = "Abonne-toi a la chaine et active la cloche pour suivre l'evolution du projet KITT Franco-Belge ! Nouvelles videos chaque semaine : construction, electronique, KARR, IA embarquee... https://www.youtube.com/@KITTK2000"

def get_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "wb") as f:
                pickle.dump(creds, f)
        else:
            print("[ERR] Token expiré — relance youtube_manager.py option 3 pour te reconnecter.")
            exit(1)
    return build("youtube", "v3", credentials=creds)

def get_all_videos(yt):
    videos = []
    ch = yt.channels().list(part="contentDetails", mine=True).execute()
    pl_id = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    next_page = None
    while True:
        pl = yt.playlistItems().list(part="contentDetails", playlistId=pl_id, maxResults=50, pageToken=next_page).execute()
        ids = [i["contentDetails"]["videoId"] for i in pl["items"]]
        vids = yt.videos().list(part="snippet,status", id=",".join(ids)).execute()
        videos.extend(vids["items"])
        next_page = pl.get("nextPageToken")
        if not next_page:
            break
    return videos

def step_10_disable_mfk(yt, videos):
    print("\n[ÉTAPE 1/2] Désactivation 'Made for Kids' sur toutes les vidéos...")
    ok = err = 0
    for v in videos:
        status = v.get("status", {})
        try:
            yt.videos().update(
                part="status",
                body={
                    "id": v["id"],
                    "status": {
                        "privacyStatus": status.get("privacyStatus", "public"),
                        "selfDeclaredMadeForKids": False
                    }
                }
            ).execute()
            mfk = " [ÉTAIT MFK]" if status.get("madeForKids") else ""
            print(f"  ✓{mfk} {v['snippet']['title'][:60]}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {v['snippet']['title'][:40]} : {e}")
            err += 1
    print(f"\n  → {ok} corrigées, {err} erreurs.")

def step_9_pinned_comments(yt, videos):
    print("\n[ÉTAPE 2/2] Ajout commentaires épinglés...")
    ok = err = 0
    for v in videos:
        try:
            res = yt.commentThreads().insert(
                part="snippet",
                body={
                    "snippet": {
                        "videoId": v["id"],
                        "topLevelComment": {
                            "snippet": {"textOriginal": PINNED_COMMENT}
                        }
                    }
                }
            ).execute()
            comment_id = res["snippet"]["topLevelComment"]["id"]
            yt.comments().setModerationStatus(id=comment_id, moderationStatus="published").execute()
            print(f"  ✓ {v['snippet']['title'][:60]}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {v['snippet']['title'][:40]} : {e}")
            err += 1
    print(f"\n  → {ok} commentaires ajoutés, {err} erreurs.")

if __name__ == "__main__":
    print("[KITT] YouTube Auto — Démarrage")
    yt = get_service()
    print("[OK] Connecté !\n")
    videos = get_all_videos(yt)
    print(f"[INFO] {len(videos)} vidéos trouvées.\n")
    step_10_disable_mfk(yt, videos)
    step_9_pinned_comments(yt, videos)
    print("\n[KITT] Terminé !")
