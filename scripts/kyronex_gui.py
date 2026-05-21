#!/usr/bin/env python3
"""Kyronex Studio GUI - Knight Rider inspired yt-dlp front-end."""

from __future__ import annotations

import queue
import json
import math
import re
import shutil
import subprocess
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from PIL import Image, ImageTk


PROJECT_DIR = Path(__file__).resolve().parent.parent
MEDIA_DIR = PROJECT_DIR / "media"
STATE_DIR = PROJECT_DIR / "state"
HISTORY_FILE = STATE_DIR / "history.json"
THUMBNAIL_FILE = STATE_DIR / "last_preview.jpg"
PHOENIX_ASSET = PROJECT_DIR / "assets" / "burning_phoenix_wikimedia.png"
MEDIA_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".mp3", ".m4a", ".opus", ".wav", ".flac"}
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".opus", ".wav", ".flac", ".ogg"}

DOWNLOAD_PERCENT_RE = re.compile(r"\[download\]\s+(?P<percent>\d+(?:\.\d+)?)%")
DOWNLOAD_SIZE_RE = re.compile(r"\bof\s+(?P<size>\S+)")
DOWNLOAD_SPEED_RE = re.compile(r"\bat\s+(?P<speed>\S+/s)")
DOWNLOAD_ETA_RE = re.compile(r"\bETA\s+(?P<eta>\S+)")
ASTATS_RE = re.compile(r"lavfi\.astats\.(?P<channel>[12]|Overall)\.RMS_level=(?P<db>-inf|-?\d+(?:\.\d+)?)")


class NeonButton(tk.Canvas):
    def __init__(self, master: tk.Widget, text: str, command, width: int = 150) -> None:
        super().__init__(
            master,
            width=width,
            height=42,
            bg="#050607",
            highlightthickness=0,
            bd=0,
            cursor="hand2",
        )
        self.text = text
        self.command = command
        self.enabled = True
        self.hover = False
        self.bind("<Button-1>", self._click)
        self.bind("<Enter>", self._enter)
        self.bind("<Leave>", self._leave)
        self.draw()

    def configure_state(self, enabled: bool) -> None:
        self.enabled = enabled
        self.draw()

    def set_text(self, text: str) -> None:
        self.text = text
        self.draw()

    def _click(self, _event: tk.Event) -> None:
        if self.enabled:
            self.command()

    def _enter(self, _event: tk.Event) -> None:
        self.hover = True
        self.draw()

    def _leave(self, _event: tk.Event) -> None:
        self.hover = False
        self.draw()

    def draw(self) -> None:
        self.delete("all")
        w = int(self["width"])
        fill = "#e00017" if self.hover and self.enabled else "#8b0010"
        glow = "#ff3448" if self.enabled else "#341015"
        text = "#ffffff" if self.enabled else "#8a676c"
        self.create_polygon(10, 2, w - 2, 2, w - 12, 40, 2, 40, fill="#210408", outline=glow, width=2)
        self.create_polygon(16, 8, w - 12, 8, w - 20, 34, 8, 34, fill=fill, outline="")
        self.create_line(18, 8, w - 14, 8, fill="#ff9aa3", width=1)
        self.create_text(w // 2, 21, text=self.text, fill=text, font=("DejaVu Sans Mono", 10, "bold"))


class KyronexStudioApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Kyronex Studio")
        self.geometry("1200x1000")
        self.minsize(900, 560)
        self.configure(bg="#030405")

        self.url_var = tk.StringVar()
        self.mode_var = tk.StringVar(value="video")
        self.status_var = tk.StringVar(value="SYSTEM READY")
        self.percent_var = tk.StringVar(value="0%")
        self.speed_var = tk.StringVar(value="0 B/s")
        self.eta_var = tk.StringVar(value="--:--")
        self.size_var = tk.StringVar(value="-")
        self.output_queue: queue.Queue[str | None] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.process: subprocess.Popen[str] | None = None
        self.bg_photo: ImageTk.PhotoImage | None = None
        self.phoenix_photo: ImageTk.PhotoImage | None = None
        self.preview_photo: ImageTk.PhotoImage | None = None
        self.last_media: Path | None = None
        self.history: list[str] = []
        self.audio_levels: list[tuple[int, int]] = []
        self.audio_index = 0
        self.audio_analysis_media: Path | None = None
        self.audio_analysis_running = False
        self.scanner_x = 0
        self.scanner_direction = 1
        self.phase = 0
        self.is_busy = False

        # --- lecteur audio integre (VU pilote par le son reellement joue) ---
        self.playlist: list[Path] = []
        self.play_index = 0
        self.player_state = "stopped"          # stopped | playing | paused
        self.play_proc: subprocess.Popen | None = None
        self.play_offset = 0.0                 # position de depart du process
        self.play_started_at = 0.0
        self.track_duration = 0.0
        self.live_left = 0.0
        self.live_right = 0.0
        self.player_finished = False

        MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        self.history = self._load_history()
        self.last_media = self._latest_media()
        self._build_styles()
        self._load_images()
        self._build_ui()
        self._animate()
        self.after(100, self._drain_output)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(
            "Kyronex.TRadiobutton",
            background="#111216",
            foreground="#f5f5f5",
            font=("DejaVu Sans Mono", 10, "bold"),
            padding=(0, 4),
        )
        style.map(
            "Kyronex.TRadiobutton",
            background=[("active", "#111216")],
            foreground=[("active", "#ff5b69")],
        )
        style.configure(
            "Kyronex.Horizontal.TProgressbar",
            troughcolor="#07080a",
            background="#ff1e32",
            bordercolor="#2a080d",
            lightcolor="#ff5162",
            darkcolor="#6c000b",
        )

    def _load_images(self) -> None:
        if not PHOENIX_ASSET.exists():
            return
        image = Image.open(PHOENIX_ASSET).convert("RGBA")
        bg = image.copy()
        bg.thumbnail((620, 500), Image.Resampling.LANCZOS)
        alpha = bg.getchannel("A").point(lambda value: int(value * 0.18))
        bg.putalpha(alpha)
        self.bg_photo = ImageTk.PhotoImage(bg)

        small = image.copy()
        small.thumbnail((184, 80), Image.Resampling.LANCZOS)
        alpha = small.getchannel("A").point(lambda value: int(value * 0.78))
        small.putalpha(alpha)
        self.phoenix_photo = ImageTk.PhotoImage(small)

    def _build_ui(self) -> None:
        self.stage = tk.Canvas(self, bg="#030405", highlightthickness=0, bd=0,
                               yscrollincrement=2)
        self.stage.pack(fill="both", expand=True)
        self.stage.bind("<Configure>", lambda _event: self._draw_stage())

        self.content = tk.Frame(self.stage, bg="#030405")
        self.stage_window = self.stage.create_window(0, 0, anchor="nw", window=self.content)
        self.content.bind("<Configure>", lambda _event: self._draw_stage())
        self.bind_all("<Button-4>", self._on_wheel)
        self.bind_all("<Button-5>", self._on_wheel)

        header = tk.Frame(self.content, bg="#030405")
        header.pack(fill="x", padx=30, pady=(10, 6))
        header.columnconfigure(0, weight=1)

        title_box = tk.Frame(header, bg="#030405")
        title_box.grid(row=0, column=0, sticky="w")
        self.title_canvas = tk.Canvas(title_box, width=480, height=80, bg="#030405", highlightthickness=0)
        self.title_canvas.pack(anchor="w")

        self.phoenix_canvas = tk.Canvas(header, width=200, height=88, bg="#030405", highlightthickness=0)
        self.phoenix_canvas.grid(row=0, column=1, sticky="e")

        self.scanner = tk.Canvas(self.content, height=16, bg="#030405", highlightthickness=0)
        self.scanner.pack(fill="x", padx=30, pady=(6, 14))

        controls = self._panel(self.content)
        controls.pack(fill="x", padx=30, pady=(0, 16))

        tk.Label(
            controls,
            text="YOUTUBE TARGET URL",
            bg="#111216",
            fg="#ff5b69",
            font=("DejaVu Sans Mono", 10, "bold"),
        ).pack(anchor="w", padx=18, pady=(16, 6))

        input_row = tk.Frame(controls, bg="#111216")
        input_row.pack(fill="x", padx=18)
        self.url_entry = tk.Entry(
            input_row,
            textvariable=self.url_var,
            bg="#06070a",
            fg="#ffffff",
            insertbackground="#ff1e32",
            relief="flat",
            font=("DejaVu Sans Mono", 12),
            highlightthickness=2,
            highlightbackground="#3d1117",
            highlightcolor="#ff1e32",
        )
        self.url_entry.pack(side="left", fill="x", expand=True, ipady=12)
        self.paste_button = NeonButton(input_row, "COLLER", self._paste_url, 118)
        self.paste_button.pack(side="right", padx=(12, 0))
        self.url_entry.focus_set()

        options = tk.Frame(controls, bg="#111216")
        options.pack(fill="x", padx=18, pady=(14, 8))
        ttk.Radiobutton(
            options,
            text="VIDEO MP4 / BEST QUALITY",
            value="video",
            variable=self.mode_var,
            style="Kyronex.TRadiobutton",
        ).pack(side="left")
        ttk.Radiobutton(
            options,
            text="MP3 ONLY",
            value="mp3",
            variable=self.mode_var,
            style="Kyronex.TRadiobutton",
        ).pack(side="left", padx=(28, 0))

        command_row = tk.Frame(controls, bg="#111216")
        command_row.pack(fill="x", padx=18, pady=(0, 16))
        tk.Label(
            command_row,
            text=f"OUTPUT  {MEDIA_DIR}",
            bg="#111216",
            fg="#7c858d",
            font=("DejaVu Sans Mono", 8, "bold"),
        ).pack(side="left")
        self.open_button = NeonButton(command_row, "MEDIA", self._open_media_dir, 112)
        self.open_button.pack(side="right", padx=(10, 0))
        self.open_last_button = NeonButton(command_row, "OPEN LAST", self._open_last_media, 132)
        self.open_last_button.pack(side="right", padx=(10, 0))
        self.open_last_button.configure_state(self.last_media is not None)
        self.download_button = NeonButton(command_row, "DOWNLOAD", self._start_download, 150)
        self.download_button.pack(side="right", padx=(10, 0))
        self.cancel_button = NeonButton(command_row, "ABORT", self._cancel_download, 112)
        self.cancel_button.pack(side="right", padx=(10, 0))
        self.cancel_button.configure_state(False)

        self._build_player()

        lower = tk.Frame(self.content, bg="#030405")
        lower.pack(fill="both", expand=True, padx=30, pady=(0, 24))
        lower.columnconfigure(0, weight=1)
        lower.columnconfigure(1, weight=1)
        lower.rowconfigure(0, weight=1)

        telemetry = self._panel(lower)
        telemetry.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        log_panel = self._panel(lower)
        log_panel.grid(row=0, column=1, sticky="nsew", padx=(10, 0))

        tk.Label(
            telemetry,
            textvariable=self.status_var,
            bg="#111216",
            fg="#ff3348",
            font=("DejaVu Sans Mono", 11, "bold"),
        ).pack(anchor="w", padx=16, pady=(14, 8))

        self.gauge = tk.Canvas(telemetry, height=128, bg="#111216", highlightthickness=0)
        self.gauge.pack(fill="x", padx=16, pady=(0, 10))

        meter = tk.Frame(telemetry, bg="#111216")
        meter.pack(fill="x", padx=16, pady=(0, 12))
        for label, var in (
            ("PROGRESS", self.percent_var),
            ("SPEED", self.speed_var),
            ("ETA", self.eta_var),
            ("SIZE", self.size_var),
        ):
            box = tk.Frame(meter, bg="#07080a", highlightthickness=1, highlightbackground="#352026")
            box.pack(side="left", fill="x", expand=True, padx=(0, 8))
            tk.Label(box, text=label, bg="#07080a", fg="#7c858d", font=("DejaVu Sans Mono", 7, "bold")).pack(anchor="w", padx=8, pady=(6, 0))
            tk.Label(box, textvariable=var, bg="#07080a", fg="#ff5b69", font=("DejaVu Sans Mono", 12, "bold")).pack(anchor="w", padx=8, pady=(0, 6))

        self.progress = ttk.Progressbar(
            telemetry,
            mode="determinate",
            maximum=100,
            style="Kyronex.Horizontal.TProgressbar",
        )
        self.progress.pack(fill="x", padx=16, pady=(0, 16))

        preview_row = tk.Frame(telemetry, bg="#111216")
        preview_row.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.preview_canvas = tk.Canvas(preview_row, width=214, height=122, bg="#06070a", highlightthickness=1, highlightbackground="#352026")
        self.preview_canvas.pack(side="left", fill="both", expand=True, padx=(0, 12))
        self.vu_canvas = tk.Canvas(preview_row, width=270, height=122, bg="#06070a", highlightthickness=1, highlightbackground="#352026")
        self.vu_canvas.pack(side="right", fill="y")
        self._refresh_preview()

        log_header = tk.Frame(log_panel, bg="#111216")
        log_header.pack(fill="x", padx=16, pady=(14, 8))
        tk.Label(log_header, text="SYSTEM LOG", bg="#111216", fg="#ff5b69", font=("DejaVu Sans Mono", 11, "bold")).pack(side="left")
        self.clear_button = NeonButton(log_header, "CLEAR", self._clear_log, 104)
        self.clear_button.pack(side="right")

        log_frame = tk.Frame(log_panel, bg="#111216")
        log_frame.pack(fill="both", expand=True, padx=16, pady=(0, 10))
        self.log = tk.Text(
            log_frame,
            bg="#06070a",
            fg="#d8d8d8",
            insertbackground="#ffffff",
            relief="flat",
            wrap="word",
            font=("DejaVu Sans Mono", 9),
            height=10,
            highlightthickness=1,
            highlightbackground="#352026",
        )
        self.log.pack(side="left", fill="both", expand=True)
        scrollbar = ttk.Scrollbar(log_frame, command=self.log.yview)
        scrollbar.pack(side="right", fill="y")
        self.log.configure(yscrollcommand=scrollbar.set, state="disabled")

        history_header = tk.Frame(log_panel, bg="#111216")
        history_header.pack(fill="x", padx=16, pady=(0, 6))
        tk.Label(history_header, text="URL HISTORY", bg="#111216", fg="#ff5b69", font=("DejaVu Sans Mono", 9, "bold")).pack(side="left")
        self.history_list = tk.Listbox(
            log_panel,
            bg="#06070a",
            fg="#d8d8d8",
            selectbackground="#8b0010",
            selectforeground="#ffffff",
            relief="flat",
            font=("DejaVu Sans Mono", 8),
            height=4,
            highlightthickness=1,
            highlightbackground="#352026",
        )
        self.history_list.pack(fill="x", padx=16, pady=(0, 16))
        self.history_list.bind("<Double-Button-1>", self._use_history_selection)
        self._refresh_history_list()

    def _panel(self, master: tk.Widget) -> tk.Frame:
        frame = tk.Frame(master, bg="#111216", highlightthickness=1, highlightbackground="#3d1117")
        return frame

    def _draw_stage(self) -> None:
        w = max(self.stage.winfo_width(), 1)
        h = max(self.stage.winfo_height(), 1)
        ch = max(self.content.winfo_reqheight(), h)   # hauteur reelle du contenu
        self.stage.delete("bg")
        self.stage.coords(self.stage_window, 0, 0)
        self.stage.itemconfigure(self.stage_window, width=w)   # largeur seule
        self.stage.configure(scrollregion=(0, 0, w, ch))
        self.stage.create_rectangle(0, 0, w, ch, fill="#030405", outline="", tags="bg")
        for y in range(0, ch, 4):
            self.stage.create_line(0, y, w, y, fill="#06080a", tags="bg")
        for x in range(-ch, w, 72):
            self.stage.create_line(x, ch, x + ch // 2, 0, fill="#090305", tags="bg")
        self.stage.create_rectangle(0, 0, w, ch, outline="#24070b", width=8, tags="bg")
        if self.bg_photo:
            self.stage.create_image(w - 40, ch - 20, image=self.bg_photo,
                                    anchor="se", tags="bg")
        self.stage.tag_lower("bg")

    def _on_wheel(self, event: tk.Event) -> None:
        """Molette : defile la page, sauf au-dessus d'une liste / d'un journal."""
        widget = event.widget
        while widget is not None:
            if isinstance(widget, (tk.Listbox, tk.Text)):
                return
            widget = getattr(widget, "master", None)
        self.stage.yview_scroll(-30 if event.num == 4 else 30, "units")

    def _animate(self) -> None:
        self.phase = (self.phase + 1) % 10000
        self._draw_title()
        self._draw_phoenix()
        self._draw_scanner()
        self._draw_gauge()
        self._draw_vu()
        self._player_tick()
        self.after(35, self._animate)

    def _draw_title(self) -> None:
        self.title_canvas.delete("all")
        title = "KYRONEX STUDIO"
        # titre sobre : une seule ombre douce, pas de clignotement
        self.title_canvas.create_text(
            17, 30, text=title, anchor="w",
            fill="#360008", font=("DejaVu Sans Mono", 25, "bold"))
        self.title_canvas.create_text(
            15, 28, text=title, anchor="w",
            fill="#ff2a3a", font=("DejaVu Sans Mono", 25, "bold"))
        self.title_canvas.create_line(16, 49, 352, 49, fill="#6e0a12", width=1)
        # signature discrete
        self.title_canvas.create_text(
            16, 64, text="by Manix", anchor="w",
            fill="#8a6066", font=("DejaVu Sans Mono", 10, "italic"))
        self.title_canvas.create_text(
            96, 64, text="SYSOP 1990  -  KITT FRANCO-BELGE", anchor="w",
            fill="#3c7d86", font=("DejaVu Sans Mono", 8, "bold"))

    def _draw_phoenix(self) -> None:
        cv = self.phoenix_canvas
        cv.delete("all")
        w = max(cv.winfo_width(), 1)
        h = max(cv.winfo_height(), 88)
        if self.phoenix_photo:
            y = h // 2 + int(2 * math.sin(self.phase / 9.0))   # leger flottement
            cv.create_image(w - 4, y, image=self.phoenix_photo, anchor="e")
        cv.create_text(6, h - 8, text="PHOENIX FIRE", anchor="w",
                       fill="#7c3036", font=("DejaVu Sans Mono", 7, "bold"))

    def _draw_scanner(self) -> None:
        width = max(self.scanner.winfo_width(), 1)
        height = max(self.scanner.winfo_height(), 16)
        self.scanner.delete("all")
        # piste fine et sombre
        self.scanner.create_rectangle(0, 0, width, height, fill="#0a0305", outline="")
        self.scanner.create_line(0, height // 2, width, height // 2, fill="#1a0508")
        # lumiere qui balaie, halo doux du sombre vers le coeur clair
        glow = max(width // 7, 70)
        cx = self.scanner_x
        for i, color in enumerate(("#400308", "#8a0610", "#d11421", "#ff4150")):
            half = glow * (1.0 - i * 0.24) / 2.0
            inset = 2 + i
            self.scanner.create_rectangle(
                cx - half, inset, cx + half, height - inset,
                fill=color, outline="")
        speed = 16 if self.is_busy else 9
        self.scanner_x += self.scanner_direction * speed
        if self.scanner_x >= width or self.scanner_x <= 0:
            self.scanner_direction *= -1
            self.scanner_x = max(0, min(self.scanner_x, width))

    def _draw_gauge(self) -> None:
        w = max(self.gauge.winfo_width(), 1)
        h = max(self.gauge.winfo_height(), 128)
        value = float(self.progress["value"] or 0)
        self.gauge.delete("all")
        self.gauge.create_rectangle(0, 0, w, h, fill="#111216", outline="")
        self.gauge.create_text(14, 16, text="TRANSFER CORE", anchor="w", fill="#7c858d", font=("DejaVu Sans Mono", 9, "bold"))
        center_x, center_y = w // 2, 78
        radius = min(w // 2 - 24, 72)
        for i in range(0, 101, 10):
            angle = 210 - (i * 240 / 100)
            x1 = center_x + radius * 0.78 * self._cos(angle)
            y1 = center_y - radius * 0.78 * self._sin(angle)
            x2 = center_x + radius * self._cos(angle)
            y2 = center_y - radius * self._sin(angle)
            self.gauge.create_line(x1, y1, x2, y2, fill="#64232a", width=2)
        end_angle = 210 - (value * 240 / 100)
        self.gauge.create_arc(center_x - radius, center_y - radius, center_x + radius, center_y + radius, start=-30, extent=-(value * 2.4), outline="#ff1e32", width=7, style="arc")
        needle_x = center_x + radius * 0.75 * self._cos(end_angle)
        needle_y = center_y - radius * 0.75 * self._sin(end_angle)
        self.gauge.create_line(center_x, center_y, needle_x, needle_y, fill="#ffe45c", width=3)
        self.gauge.create_oval(center_x - 5, center_y - 5, center_x + 5, center_y + 5, fill="#ff1e32", outline="")
        self.gauge.create_text(center_x, center_y + 34, text=self.percent_var.get(), fill="#ff5b69", font=("DejaVu Sans Mono", 20, "bold"))
        if self.is_busy:
            pulse = 20 + (self.phase % 30)
            self.gauge.create_oval(center_x - pulse, center_y - pulse, center_x + pulse, center_y + pulse, outline="#3b0a10")

    def _draw_vu(self) -> None:
        cv = self.vu_canvas
        w = max(cv.winfo_width(), 1)
        h = max(cv.winfo_height(), 122)
        cv.delete("all")
        cv.create_rectangle(0, 0, w, h, fill="#070809", outline="")

        if self.player_state == "playing":
            mode_text = "LIVE"
        elif self.player_state == "paused":
            mode_text = "PAUSE"
        elif self.audio_analysis_running:
            mode_text = "ANALYSE"
        else:
            mode_text = "PRET"
        cv.create_text(10, 11, text="VU METRE  L / R", anchor="w",
                       fill="#ff5b69", font=("DejaVu Sans Mono", 8, "bold"))
        cv.create_text(w - 10, 11, text=mode_text, anchor="e",
                       fill="#35f8ff", font=("DejaVu Sans Mono", 7, "bold"))

        left, right = self._current_audio_levels()
        half = w // 2
        self._draw_vu_meter(3, 20, half - 4, h - 24, left, "L")
        self._draw_vu_meter(half + 1, 20, half - 4, h - 24, right, "R")

        if self.audio_levels:
            self.audio_index = (self.audio_index
                                + (2 if self.is_busy else 1)) % len(self.audio_levels)

    def _draw_vu_meter(self, x: int, y: int, w: int, h: int,
                       level: float, label: str) -> None:
        """Un vumetre analogique a aiguille (cadran), pilote par le son reel."""
        cv = self.vu_canvas
        cv.create_rectangle(x, y, x + w, y + h, fill="#0c0e11", outline="#352026")
        cx = x + w // 2
        cy = y + h - 16
        radius = min(w // 2 - 10, h - 34)
        if radius < 14:
            return
        start_deg, span = 150.0, 120.0
        box = (cx - radius, cy - radius, cx + radius, cy + radius)
        cv.create_arc(*box, start=30, extent=120, style="arc",
                      outline="#46505d", width=2)
        cv.create_arc(*box, start=30, extent=26, style="arc",
                      outline="#ff2a3a", width=3)
        for i in range(11):
            ang = start_deg - span * i / 10.0
            inner = radius - (9 if i % 5 == 0 else 5)
            color = "#ff3a48" if i >= 8 else "#6b7682"
            cv.create_line(
                cx + inner * self._cos(ang), cy - inner * self._sin(ang),
                cx + radius * self._cos(ang), cy - radius * self._sin(ang),
                fill=color, width=2)
        value = max(0.0, min(100.0, level))
        ang = start_deg - span * value / 100.0
        cv.create_line(
            cx, cy,
            cx + (radius - 6) * self._cos(ang),
            cy - (radius - 6) * self._sin(ang),
            fill="#ffe45c", width=2)
        cv.create_oval(cx - 5, cy - 5, cx + 5, cy + 5,
                       fill="#ff1e32", outline="#7c0610")
        cv.create_text(x + 9, y + 11, text=label, anchor="w",
                       fill="#d8d8d8", font=("DejaVu Sans Mono", 10, "bold"))
        decibels = int(value * 0.45 - 42)
        cv.create_text(x + w - 8, y + h - 8, text=f"{decibels:+d} dB",
                       anchor="e", fill="#ffe45c",
                       font=("DejaVu Sans Mono", 8, "bold"))

    def _current_audio_levels(self) -> tuple[int, int]:
        if self.player_state in ("playing", "paused"):
            return int(self.live_left), int(self.live_right)
        if self.audio_levels:
            return self.audio_levels[self.audio_index % len(self.audio_levels)]
        idle_left = 10 + int(10 * (0.5 + 0.5 * math.sin(self.phase / 14.0)))
        idle_right = 10 + int(10 * (0.5 + 0.5 * math.sin(self.phase / 17.0 + 0.8)))
        return idle_left, idle_right

    def _db_to_level(self, db: float) -> int:
        if db <= -60:
            return 0
        if db >= -6:
            return 100
        return max(0, min(100, int((db + 60) * 100 / 54)))

    def _cos(self, degrees: float) -> float:
        import math

        return math.cos(math.radians(degrees))

    def _sin(self, degrees: float) -> float:
        import math

        return math.sin(math.radians(degrees))

    def _append_log(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text)
        self.log.see("end")
        self.log.configure(state="disabled")

    def _set_busy(self, busy: bool) -> None:
        self.is_busy = busy
        self.download_button.configure_state(not busy)
        self.open_button.configure_state(not busy)
        self.open_last_button.configure_state((not busy) and self.last_media is not None)
        self.paste_button.configure_state(not busy)
        self.cancel_button.configure_state(busy)

    def _paste_url(self) -> None:
        try:
            text = self.clipboard_get().strip()
        except tk.TclError:
            text = ""
        if text:
            self.url_var.set(text)
            self.url_entry.icursor("end")

    def _clear_log(self) -> None:
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

    def _load_history(self) -> list[str]:
        if not HISTORY_FILE.exists():
            return []
        try:
            data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, str)][:20]

    def _save_history(self) -> None:
        HISTORY_FILE.write_text(json.dumps(self.history[:20], indent=2), encoding="utf-8")

    def _add_history(self, url: str) -> None:
        self.history = [item for item in self.history if item != url]
        self.history.insert(0, url)
        self.history = self.history[:20]
        self._save_history()
        self._refresh_history_list()

    def _refresh_history_list(self) -> None:
        if not hasattr(self, "history_list"):
            return
        self.history_list.delete(0, "end")
        for item in self.history[:8]:
            self.history_list.insert("end", item)

    def _use_history_selection(self, _event: tk.Event) -> None:
        selection = self.history_list.curselection()
        if not selection:
            return
        self.url_var.set(self.history_list.get(selection[0]))
        self.url_entry.icursor("end")

    def _cancel_download(self) -> None:
        if self.process and self.process.poll() is None:
            self.status_var.set("ABORTING TRANSFER")
            self.process.terminate()

    def _start_download(self) -> None:
        url = self.url_var.get().strip()
        if not url:
            messagebox.showwarning("Kyronex Studio", "Collez une URL YouTube avant de lancer.")
            return

        missing = [cmd for cmd in ("yt-dlp", "ffmpeg", "node") if shutil.which(cmd) is None]
        if missing:
            messagebox.showerror("Dependance manquante", "Commande introuvable: " + ", ".join(missing))
            return

        self._set_busy(True)
        self.status_var.set("TRANSFER ONLINE")
        self.percent_var.set("0%")
        self.speed_var.set("STARTING")
        self.eta_var.set("--:--")
        self.size_var.set("-")
        self.progress["value"] = 0
        self._append_log("\n--- KYRONEX TRANSFER INIT ---\n")
        self._add_history(url)
        self.worker = threading.Thread(target=self._download, args=(url, self.mode_var.get()), daemon=True)
        self.worker.start()

    def _download(self, url: str, mode: str) -> None:
        yt_dlp = shutil.which("yt-dlp") or "yt-dlp"
        node = shutil.which("node") or "node"
        output = "%(title).120s-%(id)s.%(ext)s"

        cmd = [
            yt_dlp,
            "--no-playlist",
            "--restrict-filenames",
            "--paths",
            str(MEDIA_DIR),
            "--output",
            output,
            "--newline",
            "--js-runtimes",
            f"node:{node}",
            "--remote-components",
            "ejs:github",
            "--continue",
            "--retries",
            "50",
            "--fragment-retries",
            "50",
            "--extractor-retries",
            "10",
            "--retry-sleep",
            "http:exp=1:60",
            "--retry-sleep",
            "fragment:exp=1:60",
        ]

        if mode == "mp3":
            cmd += ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"]
        else:
            cmd += ["--format", "bv*+ba/b", "--merge-output-format", "mp4"]

        cmd.append(url)

        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self.output_queue.put(line)
        code = self.process.wait()
        self.process = None
        self.output_queue.put(None if code == 0 else f"\nErreur: yt-dlp a termine avec le code {code}.\n")

    def _drain_output(self) -> None:
        try:
            while True:
                item = self.output_queue.get_nowait()
                if item is None:
                    self.progress["value"] = 100
                    self.percent_var.set("100%")
                    self.speed_var.set("COMPLETE")
                    self.eta_var.set("00:00")
                    self.status_var.set("TRANSFER COMPLETE")
                    self.last_media = self._latest_media()
                    self._refresh_preview()
                    self._scan_playlist()
                    self._set_busy(False)
                else:
                    self._append_log(item)
                    self._update_download_stats(item)
                    if item.startswith("\nErreur:"):
                        self.status_var.set("TRANSFER ERROR")
                        self._set_busy(False)
        except queue.Empty:
            pass
        self.after(100, self._drain_output)

    def _update_download_stats(self, line: str) -> None:
        percent_match = DOWNLOAD_PERCENT_RE.search(line)
        if not percent_match:
            if "[Merger]" in line:
                self.status_var.set("MERGING VIDEO + AUDIO")
            elif "[ExtractAudio]" in line:
                self.status_var.set("ENCODING MP3")
            return

        size_match = DOWNLOAD_SIZE_RE.search(line)
        speed_match = DOWNLOAD_SPEED_RE.search(line)
        eta_match = DOWNLOAD_ETA_RE.search(line)
        percent = float(percent_match.group("percent"))
        speed = speed_match.group("speed") if speed_match else self.speed_var.get()
        eta = eta_match.group("eta") if eta_match else self.eta_var.get()
        size = size_match.group("size") if size_match else self.size_var.get()

        self.progress["value"] = percent
        self.percent_var.set(f"{percent:.1f}%")
        self.speed_var.set(speed)
        self.eta_var.set(eta)
        self.size_var.set(size)
        self.status_var.set("TRANSFER ONLINE")

    def _open_media_dir(self) -> None:
        subprocess.Popen(["xdg-open", str(MEDIA_DIR)])

    def _open_last_media(self) -> None:
        if self.last_media and self.last_media.exists():
            subprocess.Popen(["xdg-open", str(self.last_media)])
        else:
            messagebox.showinfo("Kyronex Studio", "Aucun fichier media trouve.")

    def _latest_media(self) -> Path | None:
        files = [
            path
            for path in MEDIA_DIR.iterdir()
            if path.is_file()
            and path.suffix.lower() in MEDIA_EXTENSIONS
            and not path.name.endswith(".part")
        ]
        if not files:
            return None
        return max(files, key=lambda path: path.stat().st_mtime)

    def _refresh_preview(self) -> None:
        if not hasattr(self, "preview_canvas"):
            return
        self.preview_canvas.delete("all")
        self.preview_canvas.create_rectangle(0, 0, 1000, 1000, fill="#06070a", outline="")
        self.preview_canvas.create_text(12, 16, text="LAST MEDIA", anchor="w", fill="#7c858d", font=("DejaVu Sans Mono", 8, "bold"))
        media = self.last_media
        if not media or not media.exists():
            self.audio_levels = []
            self.preview_canvas.create_text(18, 64, text="NO FILE", anchor="w", fill="#ff3348", font=("DejaVu Sans Mono", 16, "bold"))
            return

        self._start_audio_analysis(media)
        if media.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}:
            self._generate_thumbnail(media)
            if THUMBNAIL_FILE.exists():
                image = Image.open(THUMBNAIL_FILE).convert("RGB")
                image.thumbnail((210, 88), Image.Resampling.LANCZOS)
                self.preview_photo = ImageTk.PhotoImage(image)
                self.preview_canvas.create_image(10, 28, image=self.preview_photo, anchor="nw")
        else:
            self.preview_canvas.create_text(18, 62, text="MP3", anchor="w", fill="#ff3348", font=("DejaVu Sans Mono", 26, "bold"))
            self.preview_canvas.create_line(18, 88, 190, 88, fill="#35f8ff", width=2)

        name = media.name[:34] + ("..." if len(media.name) > 34 else "")
        self.preview_canvas.create_text(12, 112, text=name, anchor="w", fill="#d8d8d8", font=("DejaVu Sans Mono", 8, "bold"))

    def _start_audio_analysis(self, media: Path) -> None:
        if self.audio_analysis_running or self.audio_analysis_media == media:
            return
        self.audio_analysis_running = True
        self.audio_analysis_media = media
        self.audio_levels = []
        thread = threading.Thread(target=self._analyse_audio_levels, args=(media,), daemon=True)
        thread.start()

    def _analyse_audio_levels(self, media: Path) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            self.audio_analysis_running = False
            return

        cmd = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-ss",
            "5",
            "-t",
            "180",
            "-i",
            str(media),
            "-vn",
            "-filter_complex",
            "aformat=channel_layouts=stereo,astats=metadata=1:reset=0.08,ametadata=print",
            "-f",
            "null",
            "-",
        ]
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError:
            self.audio_analysis_running = False
            return

        levels: list[tuple[int, int]] = []
        pending: dict[str, float] = {}
        assert process.stdout is not None
        for line in process.stdout:
            match = ASTATS_RE.search(line)
            if not match:
                continue
            channel = match.group("channel")
            db_text = match.group("db")
            pending[channel] = -90.0 if db_text == "-inf" else float(db_text)
            if "1" in pending and "2" in pending:
                levels.append((self._db_to_level(pending["1"]), self._db_to_level(pending["2"])))
                pending.clear()
            elif "Overall" in pending:
                level = self._db_to_level(pending["Overall"])
                levels.append((level, level))
                pending.clear()
            if len(levels) >= 1800:
                process.terminate()
                break

        process.wait()
        if levels:
            self.audio_levels = levels
            self.audio_index = 0
        self.audio_analysis_running = False

    def _generate_thumbnail(self, media: Path) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            return
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-loglevel",
                "error",
                "-ss",
                "00:00:03",
                "-i",
                str(media),
                "-frames:v",
                "1",
                "-vf",
                "scale=420:-1",
                str(THUMBNAIL_FILE),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )

    # ===================== LECTEUR AUDIO INTEGRE =========================
    def _build_player(self) -> None:
        """Panneau lecteur MP3 : liste media/, transport, barre de seek."""
        panel = self._panel(self.content)
        panel.pack(fill="x", padx=30, pady=(0, 22))

        head = tk.Frame(panel, bg="#111216")
        head.pack(fill="x", padx=16, pady=(12, 6))
        tk.Label(
            head,
            text="AUDIO PLAYER  -  SOURCE TEMPS REEL DU VU",
            bg="#111216",
            fg="#ff5b69",
            font=("DejaVu Sans Mono", 11, "bold"),
        ).pack(side="left")
        self.refresh_button = NeonButton(head, "REFRESH", self._scan_playlist, 118)
        self.refresh_button.pack(side="right")

        body = tk.Frame(panel, bg="#111216")
        body.pack(fill="x", padx=16, pady=(0, 14))

        list_frame = tk.Frame(body, bg="#111216")
        list_frame.pack(side="left", fill="both", expand=True, padx=(0, 14))
        self.playlist_box = tk.Listbox(
            list_frame,
            bg="#06070a",
            fg="#d8d8d8",
            selectbackground="#8b0010",
            selectforeground="#ffffff",
            relief="flat",
            font=("DejaVu Sans Mono", 8),
            height=5,
            highlightthickness=1,
            highlightbackground="#352026",
            activestyle="none",
        )
        self.playlist_box.pack(side="left", fill="both", expand=True)
        playlist_scroll = ttk.Scrollbar(list_frame, command=self.playlist_box.yview)
        playlist_scroll.pack(side="right", fill="y")
        self.playlist_box.configure(yscrollcommand=playlist_scroll.set)
        self.playlist_box.bind("<Double-Button-1>", self._on_track_pick)

        right = tk.Frame(body, bg="#111216")
        right.pack(side="right", fill="y")
        self.now_playing = tk.Label(
            right,
            text="NO TRACK LOADED",
            bg="#111216",
            fg="#35f8ff",
            font=("DejaVu Sans Mono", 9, "bold"),
            anchor="w",
        )
        self.now_playing.pack(fill="x", pady=(0, 6))

        transport = tk.Frame(right, bg="#111216")
        transport.pack(fill="x")
        self.prev_button = NeonButton(transport, "|< PREV", self._player_prev, 112)
        self.prev_button.pack(side="left", padx=(0, 6))
        self.play_button = NeonButton(transport, "> PLAY", self._player_toggle, 128)
        self.play_button.pack(side="left", padx=(0, 6))
        self.stop_button = NeonButton(transport, "[] STOP", self._player_stop, 112)
        self.stop_button.pack(side="left", padx=(0, 6))
        self.next_button = NeonButton(transport, "NEXT >|", self._player_next, 112)
        self.next_button.pack(side="left")

        seek_row = tk.Frame(right, bg="#111216")
        seek_row.pack(fill="x", pady=(8, 0))
        self.seek_canvas = tk.Canvas(
            seek_row,
            height=18,
            bg="#06070a",
            highlightthickness=1,
            highlightbackground="#352026",
        )
        self.seek_canvas.pack(side="left", fill="x", expand=True)
        self.seek_canvas.bind("<Button-1>", self._on_seek_click)
        self.time_label = tk.Label(
            seek_row,
            text="00:00 / 00:00",
            bg="#111216",
            fg="#ffe45c",
            font=("DejaVu Sans Mono", 10, "bold"),
        )
        self.time_label.pack(side="right", padx=(10, 0))

        self._scan_playlist()

    def _track_label(self, path: Path) -> str:
        """Nom lisible : retire le suffixe -<id YouTube> et l'extension."""
        name = re.sub(r"-[A-Za-z0-9_-]{11}(?=\.[^.]+$)", "", path.name)
        name = name.rsplit(".", 1)[0].replace("_", " ").strip()
        return name[:64] if name else path.name

    def _current_track_label(self) -> str:
        if 0 <= self.play_index < len(self.playlist):
            return self._track_label(self.playlist[self.play_index])
        return ""

    def _scan_playlist(self) -> None:
        """Recharge la liste des fichiers audio de media/ (piste courante conservee)."""
        current = None
        if self.playlist and 0 <= self.play_index < len(self.playlist):
            current = self.playlist[self.play_index]
        files = sorted(
            (
                path
                for path in MEDIA_DIR.iterdir()
                if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
            ),
            key=lambda path: path.name.lower(),
        )
        self.playlist = files
        self.playlist_box.delete(0, "end")
        for path in files:
            self.playlist_box.insert("end", "  " + self._track_label(path))
        if not files:
            self.playlist_box.insert("end", "  (aucun fichier audio dans media/)")
        if current is not None and current in files:
            self.play_index = files.index(current)
        elif self.play_index >= len(files):
            self.play_index = 0
        self._highlight_current()

    def _highlight_current(self) -> None:
        if not self.playlist:
            return
        self.playlist_box.selection_clear(0, "end")
        if 0 <= self.play_index < len(self.playlist):
            self.playlist_box.selection_set(self.play_index)
            self.playlist_box.see(self.play_index)

    def _on_track_pick(self, _event: tk.Event) -> None:
        selection = self.playlist_box.curselection()
        if not selection or selection[0] >= len(self.playlist):
            return
        self.play_index = selection[0]
        self._player_start()

    def _player_toggle(self) -> None:
        if self.player_state == "playing":
            self._player_pause()
        elif self.player_state == "paused":
            self._spawn_player(self.play_offset)
        else:
            selection = self.playlist_box.curselection()
            if selection and selection[0] < len(self.playlist):
                self.play_index = selection[0]
            self._player_start()

    def _player_start(self) -> None:
        if not self.playlist:
            return
        self.play_index %= len(self.playlist)
        self.play_offset = 0.0
        self.track_duration = self._probe_duration(self.playlist[self.play_index])
        self._spawn_player(0.0)

    def _player_pause(self) -> None:
        self.play_offset = self._player_position()
        self._kill_player()
        self.player_state = "paused"
        self.play_button.set_text("> PLAY")
        self.now_playing.configure(text="PAUSE  " + self._current_track_label())

    def _player_stop(self) -> None:
        self._kill_player()
        self.player_state = "stopped"
        self.play_offset = 0.0
        self.player_finished = False
        self.live_left = 0.0
        self.live_right = 0.0
        self.play_button.set_text("> PLAY")
        self.now_playing.configure(text="STOPPED")

    def _player_next(self) -> None:
        if not self.playlist:
            return
        active = self.player_state in ("playing", "paused")
        self.play_index = (self.play_index + 1) % len(self.playlist)
        if active:
            self._player_start()
        else:
            self._highlight_current()

    def _player_prev(self) -> None:
        if not self.playlist:
            return
        active = self.player_state in ("playing", "paused")
        self.play_index = (self.play_index - 1) % len(self.playlist)
        if active:
            self._player_start()
        else:
            self._highlight_current()

    def _spawn_player(self, offset: float) -> None:
        """Lance ffmpeg : lecture PulseAudio + RMS temps reel sur stdout."""
        self._kill_player()
        if not self.playlist:
            return
        track = self.playlist[self.play_index]
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            messagebox.showerror("Kyronex Studio", "Commande ffmpeg introuvable.")
            return
        command = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-ss",
            f"{max(0.0, offset):.2f}",
            "-i",
            str(track),
            "-vn",
            "-af",
            "astats=metadata=1:reset=1,ametadata=print:file=-",
            "-f",
            "pulse",
            "Kyronex Studio",
        ]
        try:
            proc = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            messagebox.showerror("Kyronex Studio", f"Lecture impossible : {exc}")
            return
        self.play_proc = proc
        self.play_started_at = time.time()
        self.player_state = "playing"
        self.player_finished = False
        self.play_button.set_text("|| PAUSE")
        self.now_playing.configure(text="PLAYING  " + self._current_track_label())
        self._highlight_current()
        threading.Thread(target=self._player_reader, args=(proc,), daemon=True).start()

    def _kill_player(self) -> None:
        proc = self.play_proc
        self.play_proc = None
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass

    def _player_reader(self, proc: subprocess.Popen) -> None:
        """Thread : lit les RMS emis par ffmpeg et alimente le VU en direct."""
        stream = proc.stdout
        if stream is None:
            return
        pending: dict[str, float] = {}
        for line in stream:
            if proc is not self.play_proc:
                return
            match = ASTATS_RE.search(line)
            if not match:
                continue
            channel = match.group("channel")
            db_text = match.group("db")
            value = -90.0 if db_text == "-inf" else float(db_text)
            pending[channel] = value
            if "1" in pending and "2" in pending:
                left = self._db_to_level(pending["1"])
                right = self._db_to_level(pending["2"])
                self.live_left = self.live_left * 0.5 + left * 0.5
                self.live_right = self.live_right * 0.5 + right * 0.5
                pending.clear()
            elif channel == "Overall" and "1" in pending and "2" not in pending:
                level = self._db_to_level(pending["Overall"])
                self.live_left = self.live_left * 0.5 + level * 0.5
                self.live_right = self.live_right * 0.5 + level * 0.5
                pending.clear()
        if proc is self.play_proc:
            self.player_finished = True

    def _probe_duration(self, track: Path) -> float:
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            return 0.0
        try:
            result = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=nk=1:nw=1",
                    str(track),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return max(0.0, float(result.stdout.strip()))
        except (OSError, ValueError, subprocess.SubprocessError):
            return 0.0

    def _player_position(self) -> float:
        if self.player_state == "playing":
            position = self.play_offset + (time.time() - self.play_started_at)
        else:
            position = self.play_offset
        if self.track_duration > 0:
            position = min(position, self.track_duration)
        return max(0.0, position)

    def _on_seek_click(self, event: tk.Event) -> None:
        if self.player_state not in ("playing", "paused"):
            return
        if self.track_duration <= 0:
            return
        width = max(self.seek_canvas.winfo_width(), 1)
        fraction = min(1.0, max(0.0, event.x / width))
        self.play_offset = fraction * self.track_duration
        if self.player_state == "playing":
            self._spawn_player(self.play_offset)

    def _player_tick(self) -> None:
        """Appele a chaque frame d'animation (thread principal Tk)."""
        if self.player_finished:
            self.player_finished = False
            if self.player_state == "playing":
                played = time.time() - self.play_started_at
                if played < 1.5:
                    self._player_stop()
                    self.now_playing.configure(text="LECTURE AUDIO IMPOSSIBLE")
                elif self.play_index + 1 < len(self.playlist):
                    self.play_index += 1
                    self._player_start()
                else:
                    self._player_stop()
                    self.now_playing.configure(text="PLAYLIST TERMINEE")
        position = self._player_position()
        self.time_label.configure(
            text=f"{self._fmt_time(position)} / {self._fmt_time(self.track_duration)}"
        )
        self._draw_seek(position, self.track_duration)

    def _draw_seek(self, position: float, duration: float) -> None:
        canvas = self.seek_canvas
        width = max(canvas.winfo_width(), 1)
        height = max(canvas.winfo_height(), 18)
        canvas.delete("all")
        canvas.create_rectangle(0, 0, width, height, fill="#06070a", outline="")
        fraction = (position / duration) if duration > 0 else 0.0
        fraction = min(1.0, max(0.0, fraction))
        filled = int(width * fraction)
        canvas.create_rectangle(0, 0, filled, height, fill="#52000a", outline="")
        canvas.create_rectangle(
            max(0, filled - 3), 0, filled, height, fill="#ff1e32", outline=""
        )
        for x in range(0, width, 36):
            canvas.create_line(x, 0, x, height, fill="#130407")

    @staticmethod
    def _fmt_time(seconds: float) -> str:
        seconds = max(0, int(seconds))
        return f"{seconds // 60:02d}:{seconds % 60:02d}"

    def _on_close(self) -> None:
        self._kill_player()
        self.destroy()


if __name__ == "__main__":
    app = KyronexStudioApp()
    app.mainloop()
