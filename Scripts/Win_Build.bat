@echo off
title Lync Server

cd %~dp0/..
node "%~dp0Lync\index.js" default.project.json 34872
pause
