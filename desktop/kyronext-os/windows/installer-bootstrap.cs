using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class InstallerBootstrap
{
    [STAThread]
    private static int Main(string[] args)
    {
        string temporaryRoot = null;
        bool selfTest = args.Length > 0 && String.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase);
        try
        {
            if (selfTest)
            {
                if (args.Length != 2) throw new ArgumentException("Usage : Setup.exe --self-test <fichier-rapport>");
                return RunSelfTest(args[1]);
            }

            temporaryRoot = ExtractBootstrap();
            string guiScript = Path.Combine(temporaryRoot, "installer-gui.ps1");
            string powerShell = GetPowerShellPath();
            if (!File.Exists(guiScript) || !File.Exists(powerShell))
                throw new FileNotFoundException("L'ecran d'installation ou Windows PowerShell est introuvable.");

            var start = new ProcessStartInfo
            {
                FileName = powerShell,
                Arguments = "-NoProfile -STA -ExecutionPolicy Bypass -File " + Quote(guiScript),
                WorkingDirectory = temporaryRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using (Process installer = Process.Start(start))
            {
                if (installer == null)
                    throw new InvalidOperationException("L'ecran d'installation n'a pas pu demarrer.");
                var output = new StringBuilder();
                var errors = new StringBuilder();
                installer.OutputDataReceived += (sender, eventArgs) => {
                    if (eventArgs.Data != null) lock (output) output.AppendLine(eventArgs.Data);
                };
                installer.ErrorDataReceived += (sender, eventArgs) => {
                    if (eventArgs.Data != null) lock (errors) errors.AppendLine(eventArgs.Data);
                };
                installer.BeginOutputReadLine();
                installer.BeginErrorReadLine();
                installer.WaitForExit();
                if (installer.ExitCode != 0)
                    throw new InvalidOperationException("Windows PowerShell a retourne " + installer.ExitCode + ".\r\n" + errors + output);
                return installer.ExitCode;
            }
        }
        catch (Exception ex)
        {
            if (selfTest && args.Length == 2)
            {
                try { File.WriteAllText(args[1], "ECHEC\r\n" + ex, Encoding.UTF8); }
                catch { }
            }
            else
            {
                MessageBox.Show("KYRONEXT OS n'a pas pu demarrer son installation.\r\n\r\n" + ex.Message,
                    "Installateur KYRONEXT OS - By Manix", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return 1;
        }
        finally
        {
            if (!String.IsNullOrEmpty(temporaryRoot))
            {
                try { Directory.Delete(temporaryRoot, true); }
                catch { /* Laisser le nettoyage temporaire a Windows si un fichier est encore ouvert. */ }
            }
        }
    }

    private static int RunSelfTest(string reportPath)
    {
        string bootstrapRoot = null;
        string testRoot = null;
        var report = new StringBuilder();
        try
        {
            bootstrapRoot = ExtractBootstrap();
            string zip = Path.Combine(bootstrapRoot, "payload.zip");
            string installerCore = Path.Combine(bootstrapRoot, "installer-core.ps1");
            string uninstaller = Path.Combine(bootstrapRoot, "uninstall-kx.ps1");
            string image = Path.Combine(bootstrapRoot, "kyronext-kitt-installer-art.png");
            if (!File.Exists(zip) || !File.Exists(installerCore) || !File.Exists(uninstaller) || !File.Exists(image))
                throw new FileNotFoundException("Le bootstrap embarque est incomplet.");
            report.AppendLine("EXE: lancement et extraction du contenu embarque OK.");

            testRoot = Path.Combine(Path.GetTempPath(), "KYRONEXT-OS-Install-Test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(testRoot);
            File.WriteAllText(Path.Combine(testRoot, ".kx-install-test-marker"), "KYRONEXT isolated test");
            string installDir = Path.Combine(testRoot, "InstallTest");

            string installArgs = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(installerCore) +
                " -PayloadZip " + Quote(zip) + " -InstallDir " + Quote(installDir) + " -CreateDesktop:$false -PortableTest";
            string installOutput = RunPowerShell(installArgs);
            RequireFile(Path.Combine(installDir, "app", "index.html"));
            RequireFile(Path.Combine(installDir, "app", "kyronext-games.js"));
            RequireFile(Path.Combine(installDir, "app", "audio", "guy-greetings", "phrases.json"));
            RequireFile(Path.Combine(installDir, "launch-kx.vbs"));
            report.AppendLine("INSTALLATION: extraction vers le dossier temporaire isole OK.");
            if (!String.IsNullOrWhiteSpace(installOutput)) report.AppendLine(installOutput.Trim());

            string uninstallArgs = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(uninstaller) +
                " -PortableTestInstallDir " + Quote(installDir);
            string uninstallOutput = RunPowerShell(uninstallArgs);
            if (Directory.Exists(installDir)) throw new IOException("Le desinstallateur de test n'a pas retire son dossier.");
            report.AppendLine("DESINSTALLATION: dossier temporaire retire et verifie OK.");
            if (!String.IsNullOrWhiteSpace(uninstallOutput)) report.AppendLine(uninstallOutput.Trim());
            report.AppendLine("Aucun raccourci, profil Edge ou dossier Windows reel n'a ete modifie.");
            File.WriteAllText(reportPath, report.ToString(), Encoding.UTF8);
            return 0;
        }
        catch (Exception ex)
        {
            report.AppendLine("ECHEC");
            report.AppendLine(ex.ToString());
            try { File.WriteAllText(reportPath, report.ToString(), Encoding.UTF8); }
            catch { }
            return 1;
        }
        finally
        {
            if (!String.IsNullOrEmpty(testRoot))
            {
                try { Directory.Delete(testRoot, true); }
                catch { }
            }
            if (!String.IsNullOrEmpty(bootstrapRoot))
            {
                try { Directory.Delete(bootstrapRoot, true); }
                catch { }
            }
        }
    }

    private static string ExtractBootstrap()
    {
        string root = Path.Combine(Path.GetTempPath(), "KYRONEXT-OS-Setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("KYRONEXT.Bootstrap.zip"))
        {
            if (resource == null) throw new InvalidOperationException("Le contenu de l'installateur est introuvable.");
            string archivePath = Path.Combine(root, "bootstrap.zip");
            using (FileStream archive = File.Create(archivePath)) resource.CopyTo(archive);
            ZipFile.ExtractToDirectory(archivePath, root);
            File.Delete(archivePath);
        }
        return root;
    }

    private static string RunPowerShell(string arguments)
    {
        var start = new ProcessStartInfo
        {
            FileName = GetPowerShellPath(),
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        using (Process process = Process.Start(start))
        {
            if (process == null) throw new InvalidOperationException("Windows PowerShell n'a pas demarre.");
            string output = process.StandardOutput.ReadToEnd();
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            if (process.ExitCode != 0)
                throw new InvalidOperationException("Windows PowerShell a retourne " + process.ExitCode + ": " + error + output);
            return output;
        }
    }

    private static void RequireFile(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("Fichier attendu absent du paquet extrait.", path);
    }

    private static string GetPowerShellPath()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
