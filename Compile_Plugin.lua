--!nocheck
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")

local pluginModel = roblox.deserializeModel(fs.readFile("Lync/Plugin.source.rbxm"))
pluginModel.Source = fs.readFile("Lync/Plugin.source.lua")
fs.writeFile("Lync/Plugin.rbxm", roblox.serializeModel(pluginModel))