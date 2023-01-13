@echo off
title Lync Installer

rmdir %LOCALAPPDATA%\Roblox\Lync /s /q
xcopy Lync %LOCALAPPDATA%\Roblox\Lync\ /v /e
echo.
echo Lync has finished installing.
echo.
pause
