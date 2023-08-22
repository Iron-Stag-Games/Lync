@echo off
title Lync Server

cd %~dp0/..
node "%LOCALAPPDATA%\Roblox\Lync\index.js" default.project.json OPEN 34873 DEBUG
pause
