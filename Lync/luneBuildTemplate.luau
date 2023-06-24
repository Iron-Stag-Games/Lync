--!nocheck
local fs = require("@lune/fs")
local net = require("@lune/net")
local roblox = require("@lune/roblox")

local Instance = roblox.Instance
local Axes = roblox.Axes
local BrickColor = roblox.BrickColor
local CFrame = roblox.CFrame
local Color3 = roblox.Color3
local ColorSequence = roblox.ColorSequence
local ColorSequenceKeypoint = roblox.ColorSequenceKeypoint
local Enum = roblox.Enum
local Faces = roblox.Faces
local Font = roblox.Font
local NumberRange = roblox.NumberRange
local NumberSequence = roblox.NumberSequence
local NumberSequenceKeypoint = roblox.NumberSequenceKeypoint
local PhysicalProperties = roblox.PhysicalProperties
local Ray = roblox.Ray
local Rect = roblox.Rect
local Region3 = roblox.Region3
local Region3int16 = roblox.Region3int16
local UDim = roblox.UDim
local UDim2 = roblox.UDim2
local Vector2 = roblox.Vector2
local Vector2int16 = roblox.Vector2int16
local Vector3 = roblox.Vector3
local Vector3int16 = roblox.Vector3int16

local map = {}
local loadstringMap = {}
local activeSourceRequests = 0

local terminate = error

local task = {
	spawn = function(func, ...)
		if func == error then
			func = terminate
		end
		func(...)
	end
}

local HttpService = {
	GetAsync = function(_, _, _, filePath)
		local success, result = pcall(fs.readFile, filePath.Path)
		return if success then result else nil
	end;
	JSONDecode = function(_, json)
		return net.jsonDecode(json)
	end
}

local function loadstring(luau)
	return function()
		return loadstringMap[luau]
	end
end

local function lpcall(_context, func, ...)
	return true, func(...)
end

local function getObjects(url)
	return roblox.deserializeModel(fs.readFile(url:sub(17)))
end

local function listenForChanges()
end

local function getPort()
	return ""
end

local function LuaCsv(_)
	return ""
end
