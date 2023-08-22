@echo off
title Lync Server

cd %~dp0/..
lync default.project.json OPEN 34873
pause
