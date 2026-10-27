Option Explicit
Dim sh, fso, baseDir, edgePath, appPath, appUrl, stateDir, profileDir, command
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
edgePath = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
If Not fso.FileExists(edgePath) Then edgePath = sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
If Not fso.FileExists(edgePath) Then
  MsgBox "Microsoft Edge est introuvable. Installe Microsoft Edge puis relance KYRONEXT OS.", vbExclamation, "KYRONEXT OS"
  WScript.Quit 2
End If
appPath = fso.GetAbsolutePathName(baseDir & "\app\index.html")
If Not fso.FileExists(appPath) Then
  MsgBox "Les fichiers locaux du cockpit sont introuvables. Réinstalle KYRONEXT OS.", vbCritical, "KYRONEXT OS"
  WScript.Quit 3
End If
appUrl = "file:///" & Replace(appPath, "\", "/")
appUrl = Replace(appUrl, " ", "%20")
stateDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\KYRONEXT OS")
profileDir = stateDir & "\BrowserProfile"
If Not fso.FolderExists(stateDir) Then fso.CreateFolder(stateDir)
If Not fso.FolderExists(profileDir) Then fso.CreateFolder(profileDir)
command = Chr(34) & edgePath & Chr(34) & " --app=" & Chr(34) & appUrl & Chr(34) & " --user-data-dir=" & Chr(34) & profileDir & Chr(34) & " --no-first-run --no-default-browser-check"
sh.Run command, 0, False
Set fso = Nothing
Set sh = Nothing
