--!nocheck
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")

local pluginModel = roblox.deserializeModel(fs.readFile("Lync/RobloxPluginSource/Model.rbxm"))
local root = pluginModel[1]
root.Source = fs.readFile("Lync/RobloxPluginSource/Plugin.lua")
root.LuaCsv.Source = fs.readFile("Lync/RobloxPluginSource/LuaCsv.lua")
fs.writeFile("Lync/Plugin.rbxm", roblox.serializeModel(pluginModel))