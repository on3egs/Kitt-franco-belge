using System;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

[assembly: AssemblyTitle("Manix Voice Studio")]
[assembly: AssemblyDescription("Application compagnon KITT Franco-Belge pour Manix Voice Studio")]
[assembly: AssemblyCompany("By Manix · KITT Franco-Belge")]
[assembly: AssemblyProduct("Manix Voice Studio")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Program {
    const string AppName = "Manix Voice Studio";
    const string AppExe = "ManixVoiceStudio.exe";
    const string AppUrl = "https://kitt-franco-belge.be/studio-voix";
    static readonly string InstallRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Manix Voice Studio");
    static readonly string StartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "KITT Franco-Belge");
    static readonly string DesktopLink = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Manix Voice Studio.lnk");
    static string CurrentExe { get { return Application.ExecutablePath; } }

    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        if (args.Length > 0 && args[0] == "--launch") { Launch(); return; }
        if (args.Length > 0 && args[0] == "--uninstall") { Uninstall(); return; }
        if (args.Length > 0 && args[0] == "--smoke-install") {
            if (args.Length < 2) Environment.Exit(2);
            try {
                Install(args[1], false, false);
                string installed = Path.Combine(args[1], AppExe);
                CreateShortcut(Path.Combine(args[1], "Smoke.lnk"), installed, "--launch", installed + ",0");
                Environment.Exit(File.Exists(installed) && File.Exists(Path.Combine(args[1], "Smoke.lnk")) ? 0 : 3);
            }
            catch { Environment.Exit(4); }
        }
        Application.Run(new SetupForm());
    }

    static void Launch() {
        string[] edgePaths = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (string edge in edgePaths) if (File.Exists(edge)) { Process.Start(edge, "--app=\"" + AppUrl + "\""); return; }
        Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true });
    }

    static void CreateShortcut(string shortcutPath, string target, string args, string icon) {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath));
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        dynamic shell = Activator.CreateInstance(shellType);
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = target; shortcut.Arguments = args; shortcut.WorkingDirectory = Path.GetDirectoryName(target);
        shortcut.IconLocation = icon; shortcut.Description = "Ouvrir Manix Voice Studio · KITT Franco-Belge"; shortcut.Save();
        Marshal.FinalReleaseComObject(shortcut); Marshal.FinalReleaseComObject(shell);
    }

    static void Install(string root, bool desktop, bool register) {
        Directory.CreateDirectory(root);
        string installed = Path.Combine(root, AppExe);
        if (!String.Equals(Path.GetFullPath(CurrentExe), Path.GetFullPath(installed), StringComparison.OrdinalIgnoreCase)) File.Copy(CurrentExe, installed, true);
        CreateShortcut(Path.Combine(StartMenu, "Manix Voice Studio.lnk"), installed, "--launch", installed + ",0");
        if (desktop) CreateShortcut(DesktopLink, installed, "--launch", installed + ",0");
        if (register) {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ManixVoiceStudio")) {
                key.SetValue("DisplayName", AppName); key.SetValue("DisplayVersion", "1.0.0"); key.SetValue("Publisher", "By Manix · KITT Franco-Belge");
                key.SetValue("InstallLocation", root); key.SetValue("DisplayIcon", installed + ",0");
                key.SetValue("UninstallString", "\"" + installed + "\" --uninstall"); key.SetValue("NoModify", 1, RegistryValueKind.DWord); key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
    }

    static void Uninstall() {
        DialogResult yes = MessageBox.Show("Désinstaller Manix Voice Studio de cet ordinateur ?", AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (yes != DialogResult.Yes) return;
        try {
            File.Delete(Path.Combine(StartMenu, "Manix Voice Studio.lnk"));
            if (Directory.Exists(StartMenu) && Directory.GetFileSystemEntries(StartMenu).Length == 0) Directory.Delete(StartMenu);
            File.Delete(DesktopLink);
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true)) if (key != null) key.DeleteSubKeyTree("ManixVoiceStudio", false);
            string root = InstallRoot;
            string script = "Start-Sleep -Seconds 2; Remove-Item -LiteralPath '" + root.Replace("'", "''") + "' -Recurse -Force -ErrorAction SilentlyContinue";
            Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -WindowStyle Hidden -Command \"" + script.Replace("\"", "\\\"") + "\"") { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
        } catch (Exception ex) { MessageBox.Show("La désinstallation a rencontré un problème : " + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    sealed class SetupForm : Form {
        CheckBox desktop;
        public SetupForm() {
            Text = AppName + " — Installation"; ClientSize = new Size(640, 520); MinimumSize = new Size(640, 520); MaximumSize = new Size(640, 520);
            StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(9, 12, 18); ForeColor = Color.Gainsboro; Font = new Font("Segoe UI", 10f);
            try { Icon = Icon.ExtractAssociatedIcon(CurrentExe); } catch { }
            Panel hero = new Panel { Dock = DockStyle.Top, Height = 190, BackColor = Color.FromArgb(13, 18, 26) }; hero.Paint += (s,e) => {
                using (var p = new Pen(Color.FromArgb(150, 225, 22, 45), 2)) e.Graphics.DrawLine(p, 25, 160, 615, 160);
                using (var f = new Font("Consolas", 17, FontStyle.Bold)) e.Graphics.DrawString("K I T T", f, Brushes.WhiteSmoke, 28, 30);
                using (var f = new Font("Consolas", 8, FontStyle.Regular)) e.Graphics.DrawString("FRANCO-BELGE  //  MANIX VOICE STUDIO", f, Brushes.IndianRed, 31, 66);
                using (var f = new Font("Segoe UI", 24, FontStyle.Bold)) e.Graphics.DrawString("Votre studio vocal", f, Brushes.White, 28, 94);
                using (var b = new SolidBrush(Color.FromArgb(220, 220, 25, 48))) e.Graphics.FillEllipse(b, 552, 33, 50, 22);
            }; Controls.Add(hero);
            Label explain = new Label { Text = "Installez l’accès Windows à votre studio de création vocal.", Location = new Point(32, 215), Size = new Size(570, 30), Font = new Font("Segoe UI", 12, FontStyle.Bold) }; Controls.Add(explain);
            Label details = new Label { Text = "Le logiciel s’ouvre dans une fenêtre dédiée et utilise le moteur sécurisé de votre AGX lorsqu’il est en ligne. Vos modèles vocaux ne sont pas copiés sur le PC.", Location = new Point(32, 255), Size = new Size(565, 68), ForeColor = Color.Silver }; Controls.Add(details);
            desktop = new CheckBox { Text = "Créer aussi un raccourci sur le Bureau", Checked = true, Location = new Point(33, 345), Size = new Size(390, 28), ForeColor = Color.Gainsboro }; Controls.Add(desktop);
            Label legal = new Label { Text = "Envoi des fichiers audio au moteur AGX après votre action et votre consentement. Connexion Internet requise.", Location = new Point(33, 385), Size = new Size(570, 38), ForeColor = Color.FromArgb(177, 184, 195), Font = new Font("Segoe UI", 8.5f) }; Controls.Add(legal);
            Button install = new Button { Text = "INSTALLER MANIX VOICE STUDIO", Location = new Point(32, 444), Size = new Size(360, 48), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(142, 20, 37), ForeColor = Color.White, Font = new Font("Segoe UI", 10, FontStyle.Bold) }; install.FlatAppearance.BorderColor = Color.FromArgb(230, 60, 78); install.Click += (s,e) => DoInstall(); Controls.Add(install);
            Button web = new Button { Text = "Ouvrir en ligne", Location = new Point(414, 444), Size = new Size(188, 48), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(22, 28, 38), ForeColor = Color.Gainsboro }; web.Click += (s,e) => Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true }); Controls.Add(web);
        }
        void DoInstall() {
            try { Install(InstallRoot, desktop.Checked, true); MessageBox.Show("Installation terminée. Le raccourci Manix Voice Studio est dans le menu Démarrer.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information); Launch(); Close(); }
            catch (Exception ex) { MessageBox.Show("Installation impossible : " + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }
}
