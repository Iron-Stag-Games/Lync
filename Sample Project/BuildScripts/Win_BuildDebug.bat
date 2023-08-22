@echo off
title Lync Server

cd %~dp0/..
lync default.project.json BUILD DEBUG
pause
