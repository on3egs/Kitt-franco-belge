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
            Text = AppName + " — Installation";
            ClientSize = new Size(700, 610);
            MinimumSize = new Size(680, 590);
            AutoScaleMode = AutoScaleMode.Dpi;
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(9, 12, 18);
            ForeColor = Color.Gainsboro;
            Font = new Font("Segoe UI", 10f);
            try { Icon = Icon.ExtractAssociatedIcon(CurrentExe); } catch { }

            var stack = new FlowLayoutPanel {
                Dock = DockStyle.Fill, AutoScroll = true, WrapContents = false,
                FlowDirection = FlowDirection.TopDown, Padding = new Padding(28, 24, 28, 24),
                BackColor = Color.FromArgb(9, 12, 18)
            };
            Controls.Add(stack);

            Panel hero = new Panel {
                Height = 154, Margin = new Padding(0, 0, 0, 16),
                BackColor = Color.FromArgb(13, 18, 26)
            };
            hero.Paint += (s,e) => {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                using (var p = new Pen(Color.FromArgb(150, 225, 22, 45), 2)) e.Graphics.DrawLine(p, 24, 132, hero.Width - 24, 132);
                using (var f = new Font("Consolas", 17, FontStyle.Bold)) e.Graphics.DrawString("K I T T", f, Brushes.WhiteSmoke, 26, 20);
                using (var f = new Font("Consolas", 8, FontStyle.Regular)) e.Graphics.DrawString("FRANCO-BELGE  //  MANIX VOICE STUDIO", f, Brushes.IndianRed, 29, 54);
                using (var f = new Font("Segoe UI", 23, FontStyle.Bold)) e.Graphics.DrawString("Votre studio vocal", f, Brushes.White, 26, 82);
                using (var b = new SolidBrush(Color.FromArgb(220, 220, 25, 48))) e.Graphics.FillEllipse(b, hero.Width - 66, 28, 42, 18);
            };
            stack.Controls.Add(hero);

            var explain = new Label {
                Text = "Installez l’accès Windows à votre studio de création vocal.",
                Height = 38, Margin = new Padding(2, 0, 2, 7), AutoSize = false,
                TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font("Segoe UI", 14, FontStyle.Bold), ForeColor = Color.WhiteSmoke
            };
            stack.Controls.Add(explain);

            var details = new Label {
                Text = "Le studio s’ouvre dans une fenêtre dédiée et utilise le moteur sécurisé de votre AGX lorsqu’il est en ligne. Les modèles vocaux ne sont pas copiés sur le PC.",
                Height = 62, Margin = new Padding(2, 0, 2, 13), AutoSize = false,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.FromArgb(190, 200, 214), Font = new Font("Segoe UI", 10.5f)
            };
            stack.Controls.Add(details);

            var optionCard = new Panel {
                Height = 50, Margin = new Padding(0, 0, 0, 13),
                BackColor = Color.FromArgb(18, 24, 34), Padding = new Padding(13, 0, 13, 0)
            };
            desktop = new CheckBox {
                Text = "Créer aussi un raccourci sur le Bureau", Checked = true,
                Dock = DockStyle.Fill, AutoSize = false, ForeColor = Color.Gainsboro,
                TextAlign = ContentAlignment.MiddleLeft
            };
            optionCard.Controls.Add(desktop);
            stack.Controls.Add(optionCard);

            var legalCard = new Panel {
                Height = 64, Margin = new Padding(0, 0, 0, 15),
                BackColor = Color.FromArgb(15, 20, 29), Padding = new Padding(13, 8, 13, 8)
            };
            var legal = new Label {
                Text = "Les fichiers audio sont envoyés à l’AGX uniquement après ton action et ton consentement. Connexion Internet requise.",
                Dock = DockStyle.Fill, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.FromArgb(177, 184, 195), Font = new Font("Segoe UI", 9f)
            };
            legalCard.Controls.Add(legal);
            stack.Controls.Add(legalCard);

            var actions = new TableLayoutPanel {
                Height = 62, Margin = new Padding(0, 3, 0, 0),
                ColumnCount = 3, RowCount = 1, BackColor = Color.Transparent,
                Padding = Padding.Empty, AutoSize = false
            };
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 61f));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 12f));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 39f));
            actions.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            var install = new Button {
                Text = "INSTALLER L’APPLICATION", Dock = DockStyle.Fill,
                FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(142, 20, 37),
                ForeColor = Color.White, Font = new Font("Segoe UI", 10, FontStyle.Bold),
                Margin = new Padding(0), AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter, UseVisualStyleBackColor = false
            };
            install.FlatAppearance.BorderColor = Color.FromArgb(230, 60, 78);
            install.Click += (s,e) => DoInstall();
            var web = new Button {
                Text = "Ouvrir en ligne", Dock = DockStyle.Fill,
                FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(22, 28, 38),
                ForeColor = Color.Gainsboro, Margin = new Padding(0), AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter, UseVisualStyleBackColor = false
            };
            web.Click += (s,e) => Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true });
            actions.Controls.Add(install, 0, 0);
            actions.Controls.Add(new Panel { Dock = DockStyle.Fill }, 1, 0);
            actions.Controls.Add(web, 2, 0);
            stack.Controls.Add(actions);
            AcceptButton = install;

            EventHandler resizeContent = (s,e) => {
                int width = Math.Max(250, stack.ClientSize.Width - stack.Padding.Horizontal - (stack.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0));
                foreach (Control item in stack.Controls) item.Width = width;
                hero.Invalidate();
            };
            stack.Resize += resizeContent;
            Shown += (s,e) => resizeContent(stack, EventArgs.Empty);
        }
        void DoInstall() {
            try { Install(InstallRoot, desktop.Checked, true); MessageBox.Show("Installation terminée. Le raccourci Manix Voice Studio est dans le menu Démarrer.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information); Launch(); Close(); }
            catch (Exception ex) { MessageBox.Show("Installation impossible : " + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }
}
