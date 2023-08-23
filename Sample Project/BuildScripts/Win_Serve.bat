@echo off
title Lync Server

cd %~dp0/..
lync SERVE default.project.json 34873
pause
