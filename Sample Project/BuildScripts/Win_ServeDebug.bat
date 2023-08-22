@echo off
title Lync Server

cd %~dp0/..
lync default.project.json SERVE 34873 DEBUG
pause
