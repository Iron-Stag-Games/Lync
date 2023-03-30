@echo off
title Lync Server

cd %~dp0/..
node "%LOCALAPPDATA%\Roblox\Lync\index.js" default.project.json OFFLINE
pause
