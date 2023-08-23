#!/usr/bin/env bash

cd ${0%/*}
cd ../
lync SERVE default.project.json 34873
