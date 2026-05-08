"""Menu GPU / Power — température, fréquences, mode alimentation Jetson."""
import curses
import threading
from core.app     import BaseScreen
from core.colors  import cp, bar_color, C_DEFAULT, C_TITLE, C_BORDER, C_DIM, C_OK, C_WARN, C_ERROR, C_SELECTED, C_ALERT
from core.widgets import safe_addstr, draw_box, draw_hbar


POWER_MODES = ["MAXN", "10W", "15W", "SUPER"]


class GpuScreen(BaseScreen):
    name = "gpu"

    def __init__(self, app):
        super().__init__(app)
        self._sel    = 0
        self._status = ""

    def draw(self):
        s = self.stdscr
        h, w = s.getmaxyx()
        s.erase()
        self.draw_title_bar("GPU & POWER MONITOR", "Jetson Orin Nano Super")

        sys_d = self.mon["system"].get()
        gpu_d = self.mon["gpu"].get()

        cpu_pct  = sys_d.get("cpu_pct",      0)
        ram_pct  = sys_d.get("ram_pct",       0)
        ram_used = sys_d.get("ram_used_mb",   0)
        ram_tot  = sys_d.get("ram_total_mb",  1)
        swap_pct = sys_d.get("swap_pct",      0)
        swap_u   = sys_d.get("swap_used_mb",  0)
        swap_t   = sys_d.get("swap_total_mb", 1)
        temp_cpu = sys_d.get("temp_cpu",      0)
        temp_gpu = sys_d.get("temp_gpu",      0)
        temp_soc = sys_d.get("temp_soc",      0)
        load1    = sys_d.get("load1",         0)
        load5    = sys_d.get("load5",         0)

        gpu_pct  = gpu_d.get("gpu_pct",      0)
        freq_mhz = gpu_d.get("gpu_freq_mhz", 0)
        freq_max = gpu_d.get("gpu_freq_max", 0)
        vdd_cpu  = gpu_d.get("vdd_cpu_w",    0)
        vdd_gpu  = gpu_d.get("vdd_gpu_w",    0)
        power_m  = gpu_d.get("nvpmodel",     "?")

        # ── Panneau CPU / RAM ─────────────────────────────────────────────
        half = max(20, w//2 - 2)
        bar_w = max(8, half - 20)

        draw_box(s, 1, 1, 10, half, "CPU & RAM")

        safe_addstr(s, 2, 3, "CPU   ", cp(C_DIM))
        draw_hbar(s, 2, 9, bar_w, cpu_pct)
        safe_addstr(s, 2, 9+bar_w+1, f"{cpu_pct:.1f}%", bar_color(cpu_pct))

        safe_addstr(s, 3, 3, "RAM   ", cp(C_DIM))
        draw_hbar(s, 3, 9, bar_w, ram_pct)
        safe_addstr(s, 3, 9+bar_w+1, f"{ram_used}/{ram_tot}MB", bar_color(ram_pct))

        safe_addstr(s, 4, 3, "SWAP  ", cp(C_DIM))
        draw_hbar(s, 4, 9, bar_w, swap_pct)
        safe_addstr(s, 4, 9+bar_w+1, f"{swap_u}/{swap_t}MB", bar_color(swap_pct))

        safe_addstr(s, 5, 3, f"LOAD  {load1:.2f} / {load5:.2f}", cp(C_DEFAULT))

        # Températures
        t_cpu_col = cp(C_OK) if temp_cpu < 65 else (cp(C_WARN) if temp_cpu < 80 else cp(C_ERROR) | curses.A_BOLD)
        t_gpu_col = cp(C_OK) if temp_gpu < 65 else (cp(C_WARN) if temp_gpu < 80 else cp(C_ERROR) | curses.A_BOLD)

        safe_addstr(s, 7, 3, "TEMP CPU : ", cp(C_DIM))
        safe_addstr(s, 7, 14, f"{temp_cpu:.0f}°C", t_cpu_col | curses.A_BOLD)
        safe_addstr(s, 8, 3, "TEMP GPU : ", cp(C_DIM))
        safe_addstr(s, 8, 14, f"{temp_gpu:.0f}°C", t_gpu_col | curses.A_BOLD)
        safe_addstr(s, 9, 3, "TEMP SOC : ", cp(C_DIM))
        safe_addstr(s, 9, 14, f"{temp_soc:.0f}°C", cp(C_DEFAULT))

        # ── Panneau GPU ───────────────────────────────────────────────────
        draw_box(s, 1, half+2, 10, w-half-4, "GPU JETSON")
        gbar_w = max(8, w-half-24)

        safe_addstr(s, 2, half+4, "GPU   ", cp(C_DIM))
        draw_hbar(s, 2, half+10, gbar_w, gpu_pct)
        safe_addstr(s, 2, half+10+gbar_w+1, f"{gpu_pct:.1f}%", bar_color(gpu_pct))

        if freq_mhz:
            freq_pct = (freq_mhz / max(freq_max, 1)) * 100 if freq_max else 0
            safe_addstr(s, 3, half+4, "FREQ  ", cp(C_DIM))
            draw_hbar(s, 3, half+10, gbar_w, freq_pct)
            safe_addstr(s, 3, half+10+gbar_w+1, f"{freq_mhz}MHz", cp(C_DEFAULT))

        if vdd_cpu:
            safe_addstr(s, 5, half+4, f"VDD CPU : {vdd_cpu:.2f} W", cp(C_DEFAULT))
        if vdd_gpu:
            safe_addstr(s, 6, half+4, f"VDD GPU : {vdd_gpu:.2f} W", cp(C_DEFAULT))

        safe_addstr(s, 8, half+4, "MODE   : ", cp(C_DIM))
        safe_addstr(s, 8, half+13, power_m, cp(C_TITLE) | curses.A_BOLD)

        # ── Sélection mode alimentation ───────────────────────────────────
        pm_y = 11
        draw_box(s, pm_y, 1, 4, w-2, "MODE ALIMENTATION")

        x = 3
        for i, mode in enumerate(POWER_MODES):
            is_active = mode.upper() == power_m.upper()
            if i == self._sel:
                safe_addstr(s, pm_y+1, x, f"[{mode}]", cp(C_SELECTED) | curses.A_BOLD)
            elif is_active:
                safe_addstr(s, pm_y+1, x, f"[{mode}]", cp(C_OK) | curses.A_BOLD)
            else:
                safe_addstr(s, pm_y+1, x, f" {mode} ", cp(C_DIM))
            x += len(mode) + 4

        safe_addstr(s, pm_y+2, 3, "← → sélectionner   ENT = appliquer", cp(C_DIM))

        # ── Historique températures (ascii) ───────────────────────────────
        temp_graph_y = pm_y + 4
        if h - temp_graph_y > 5:
            draw_box(s, temp_graph_y, 1, h-temp_graph_y-2, w-2, "TEMPÉRATURES")
            # Diagramme simple
            temps = {"CPU": temp_cpu, "GPU": temp_gpu, "SOC": temp_soc}
            for ti, (name, val) in enumerate(temps.items()):
                ty = temp_graph_y + 1 + ti
                safe_addstr(s, ty, 3, f"{name}  ", cp(C_DIM))
                draw_hbar(s, ty, 9, min(30, w-25), val, max_val=100)
                col = cp(C_OK) if val < 60 else (cp(C_WARN) if val < 80 else cp(C_ERROR))
                safe_addstr(s, ty, 42, f"{val:.0f}°C", col | curses.A_BOLD)

        if self._status:
            safe_addstr(s, h-2, 3, self._status, cp(C_WARN))
        self.draw_nav_hint([("←→","MODE"), ("ENT","APPLIQUER"), ("R","REFRESH"), ("ESC","RETOUR")])
        s.noutrefresh()

    def handle_key(self, key: int):
        if key in (27, curses.KEY_F1, ord('q')):
            return {"type": "navigate", "screen": "dashboard"}
        if key == curses.KEY_LEFT:
            self._sel = (self._sel - 1) % len(POWER_MODES)
        elif key == curses.KEY_RIGHT:
            self._sel = (self._sel + 1) % len(POWER_MODES)
        elif key in (curses.KEY_ENTER, ord('\n'), ord('\r')):
            self._apply_mode()
        elif key == ord('r') or key == ord('R'):
            pass  # Les moniteurs se rafraîchissent tout seuls
        return None

    def _apply_mode(self):
        mode = POWER_MODES[self._sel]
        self._status = f"Application mode {mode}..."
        from monitors.gpu import GpuMonitor
        threading.Thread(
            target=lambda: self._do_apply(mode), daemon=True
        ).start()

    def _do_apply(self, mode: str):
        from monitors.gpu import GpuMonitor
        ok = GpuMonitor.set_power_mode(mode)
        self._status = f"{'✓ Mode ' + mode + ' appliqué' if ok else '✗ Erreur sudo'}"
