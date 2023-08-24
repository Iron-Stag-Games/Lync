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
del "%UserProfile%\Documents\Project Documents\Git\lync-config.json"
call pkg package.json --no-bytecode --public-packages "*" --public
git update-index --add --chmod=+x lync-macos-x64
git update-index --add --chmod=+x lync-macos-arm64
git update-index --add --chmod=+x lync-linux-x64
git update-index --add --chmod=+x lync-linux-arm64
copy lync-win-x64.exe "%UserProfile%\Documents\Project Documents\Git\lync.exe"
copy lync-config.json "%UserProfile%\Documents\Project Documents\Git\lync-config.json"