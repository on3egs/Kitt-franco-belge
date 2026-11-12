@echo off
setlocal
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Ethernet-Direct.ps1"
if errorlevel 1 (
 echo Le lancement a echoue. Consultez le fichier LISEZ-MOI.txt.
 pause
)
