@echo off
cd %~dp0\Lync
del lync-win.exe
del lync-macos
del lync-linux
call pkg package.json
copy lync-win.exe "%UserProfile%\Documents\Project Documents\Git\lync.exe"
copy config.json "%UserProfile%\Documents\Project Documents\Git\config.json"