#!/usr/bin/env zsh

cd -- "$(cd -- "$(dirname "$0")" && pwd -P)"

lune run Compile_Plugin.lua

cd Lync

rm -f lync-win-x64.exe \
      lync-macos-x64 \
      lync-macos-arm64 \
      lync-linux-x64 \
      lync-linux-arm64

pkg package.json --no-bytecode --public-packages "*" --public --targets node18-win-x64,node18-macos-arm64,node18-macos-x64,node18-linux-arm64,node18-linux-x64

echo "Build complete"
