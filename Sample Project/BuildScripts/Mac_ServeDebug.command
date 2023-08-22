#!/usr/bin/env bash

cd ${0%/*}
cd ../
lync default.project.json SERVE 34873 DEBUG
