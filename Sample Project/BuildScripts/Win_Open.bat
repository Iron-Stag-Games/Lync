@echo off
title Lync Server

cd %~dp0/..
lync OPEN default.project.json 34873
pause
