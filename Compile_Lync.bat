@echo off
cd %~dp0
lune Compile_Plugin.lua
cd Lync
del lync-win.exe
del lync-macos
del lync-linux
del "%UserProfile%\Documents\Project Documents\Git\lync.exe"
del "%UserProfile%\Documents\Project Documents\Git\lync-config.json"
call pkg package.json
copy lync-win.exe "%UserProfile%\Documents\Project Documents\Git\lync.exe"
copy lync-config.json "%UserProfile%\Documents\Project Documents\Git\lync-config.json"