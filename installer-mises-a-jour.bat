@echo off
rem Installe (une seule fois) l'assistant qui permet au bouton "Mettre a jour" de la fenetre d'Aquaman de remplacer l'extension.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0updater\install.ps1" %*
pause
