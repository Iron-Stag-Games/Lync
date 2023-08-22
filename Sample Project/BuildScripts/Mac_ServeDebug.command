#!/usr/bin/env bash

cd ${0%/*}
cd ../
node $HOME/Documents/Roblox/Lync/index.js default.project.json SERVE 34873 DEBUG
