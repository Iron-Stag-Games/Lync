--!nocheck
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")

local pluginModel = roblox.deserializeModel(fs.readFile("Lync/RobloxPluginSource/Model.rbxm"))
local root = pluginModel[1]
root.Source = fs.readFile("Lync/RobloxPluginSource/Plugin.luau")
fs.writeFile("Lync/Plugin.rbxm", roblox.serializeModel(pluginModel))