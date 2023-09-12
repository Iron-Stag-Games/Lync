@echo off
cd %~dp0
lune Compile_Plugin.lua
cd Lync
del lync-win-x64.exe
del lync-macos-x64
del lync-macos-arm64
del lync-linux-x64
del lync-linux-arm64
del "%UserProfile%\Documents\Project Documents\Git\lync.exe"
del "%UserProfile%\Documents\Project Documents\Git\lync.exe.temp"
call pkg package.json --no-bytecode --public-packages "*" --public
copy lync-win-x64.exe "%UserProfile%\Documents\Project Documents\Git\lync.exe"