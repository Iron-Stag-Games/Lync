@echo off
title Lync Server

cd %~dp0/..
lync FETCH default.project.json
pause
