--!strict
--[[
	Lync Client - Alpha 13
	https://github.com/Iron-Stag-Games/Lync
	Copyright (C) 2022  Iron Stag Games

	This library is free software; you can redistribute it and/or
	modify it under the terms of the GNU Lesser General Public
	License as published by the Free Software Foundation; either
	version 2.1 of the License, or (at your option) any later version.

	This library is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
	Lesser General Public License for more details.

	You should have received a copy of the GNU Lesser General Public
	License along with this library; if not, write to the Free Software
	Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301
	USA
]]

if not plugin or game:GetService("RunService"):IsRunning() then return end

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

local VERSION = "Alpha 13"

local LuaCsv = require(script:WaitForChild("LuaCsv"))
local PrettyPrint = require(script:WaitForChild("PrettyPrint"))

local debugPrints
local theme: StudioTheme = settings().Studio.Theme :: StudioTheme
local connected = false
local connecting = false
local map = nil
local activeSourceRequests = 0

-- Gui

local widget = plugin:CreateDockWidgetPluginGui("Lync", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, true, 268 + 8, 40 + 8, 268 + 8, 40 + 8))
widget.Name = "Lync Client"
widget.Title = widget.Name

local frame = script:WaitForChild("ScreenGui"):WaitForChild("Frame")
frame.Parent = widget
frame:WaitForChild("Frame"):WaitForChild("Version").Text = VERSION:lower()

local connect = frame:WaitForChild("Frame"):WaitForChild("TextButton")
local port = frame:WaitForChild("Frame"):WaitForChild("TextBox")
port.Text = plugin:GetSetting("Port") or ""

-- Functions

local function lpcall(context: string, func: any, ...): (boolean, any)
	local args = {...}
	return xpcall(function()
		return func(unpack(args))
	end, function(err)
		task.spawn(error, "[Lync] - " .. context .. ": " .. err)
	end)
end

local function setActiveTheme()
	local connectBackground = (connecting or connected) and Enum.StudioStyleGuideColor.DialogButton or Enum.StudioStyleGuideColor.DialogMainButton
	connect:SetAttribute("Background", theme:GetColor(connectBackground))
	connect:SetAttribute("BackgroundHover", theme:GetColor(connectBackground, Enum.StudioStyleGuideModifier.Hover))
	connect:SetAttribute("BackgroundPressed", theme:GetColor(connectBackground, Enum.StudioStyleGuideModifier.Pressed))
	connect.BackgroundColor3 = connect:GetAttribute("Background")
	local connectText = (connecting or connected) and Enum.StudioStyleGuideColor.DialogButtonText or Enum.StudioStyleGuideColor.DialogMainButtonText
	connect:SetAttribute("Text", theme:GetColor(connectText))
	connect:SetAttribute("TextHover", theme:GetColor(connectText, Enum.StudioStyleGuideModifier.Hover))
	connect:SetAttribute("TextPressed", theme:GetColor(connectText, Enum.StudioStyleGuideModifier.Pressed))
	connect.TextColor3 = connect:GetAttribute("Text")
	connect.Frame.UIStroke.Color = connect:GetAttribute("Text")
end

local function setTheme()
	frame.Frame.BackgroundColor3 = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBackground)
	frame.Frame.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBorder)
	frame.Frame.TextBox.PlaceholderColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
	frame.Frame.TextBox.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText)
	frame.Frame.TextButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	frame.Frame.Version.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
	local PortBorder = Enum.StudioStyleGuideColor.InputFieldBorder
	frame.Frame:SetAttribute("Border", theme:GetColor(PortBorder))
	frame.Frame:SetAttribute("BorderHover", theme:GetColor(PortBorder, Enum.StudioStyleGuideModifier.Hover))
	frame.Frame:SetAttribute("BorderSelected", theme:GetColor(PortBorder, Enum.StudioStyleGuideModifier.Selected))
	frame.Frame.UIStroke.Color = frame.Frame:GetAttribute("Border")
	setActiveTheme()
end

local function terminate(ErrorMessage: string)
	connecting = false
	error("[Lync] - Terminated: " .. ErrorMessage, 0)
end

local function getPort(): string
	return port.Text ~= "" and port.Text or port.PlaceholderText
end

local function eval(value: any): any
	if type(value) == "table" then
		return (loadstring("return " .. value[1]) :: any)()
	else
		return value
	end
end

local function getObjects(url: string): {Instance}?
	local success, result = lpcall("Get Objects", game.GetObjects, game, url)
	return if success then result else nil
end

local function setDetails(target: any, data: any)
	if data.Properties then
		for property, value in data.Properties do
			lpcall("Set Property " .. property, function()
				if target:IsA("Model") and property == "Scale" then
					target:ScaleTo(eval(value))
				else
					target[property] = eval(value)
				end
			end)
		end
	end
	if data.Attributes then
		for attribute, value in data.Attributes do
			lpcall("Set Attribute", function()
				target:SetAttribute(attribute, value)
			end)
		end
	end
	if data.Tags then
		for _, tag in data.Tags do
			lpcall("Set Tag", function()
				CollectionService:AddTag(target, tag)
			end)
		end
	end
end

local function buildJsonModel(target: any, data: any)
	if data.Children then
		for _, childData in data.Children do
			local newInstance = Instance.new(childData.ClassName or "Folder")
			if childData.Name then
				newInstance.Name = childData.Name
			end
			buildJsonModel(newInstance, childData)
			newInstance.Parent = target
		end
	end
	setDetails(target, data)
end

local function buildPath(path: string)
	local data = map[path]
	local createInstance = false
	local target = game
	local subpaths = path:split("/")
	local name = subpaths[#subpaths]
	for index = 2, #subpaths do
		local subpath = subpaths[index]
		if target == game then
			target = game:GetService(subpath)
		elseif target:FindFirstChild(subpath) then
			local nextTarget = target:FindFirstChild(subpath)
			if nextTarget and target ~= game and index == #subpaths then
				if not data or data.Type ~= "Lua" or nextTarget.ClassName ~= (if data.Context == "Client" then "LocalScript" elseif data.Context == "Server" then "Script" else "ModuleScript") then
					if not pcall(function()
							nextTarget.Parent = nil
							createInstance = true
						end) then
						target = nextTarget
					end
				else
					target = nextTarget
				end
			else
				target = nextTarget
			end
		elseif index == #subpaths then
			createInstance = true
		elseif data then
			terminate(`Path '{subpath}' not found in {target:GetFullName()}`)
		end
	end
	if data then
		if data.ClearOnSync and not createInstance then
			for _, child in target:GetChildren() do
				pcall(child.Destroy, child)
			end
		end
		if data.Type == "Instance" then
			if createInstance then
				local newInstance = Instance.new(data.ClassName)
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
		elseif data.Type == "Lua" then
			if createInstance then
				local newInstance = Instance.new(if data.Context == "Client" then "LocalScript" elseif data.Context == "Server" then "Script" else "ModuleScript")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					target.Source = result
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "Model" then
			if target and not createInstance then
				local OriginalTarget = target
				target = target.Parent
				OriginalTarget.Parent = nil
			end
			local objects = getObjects("rbxasset://lync/" .. data.Path)
			if objects and #objects == 1 then
				objects[1].Name = name
				objects[1].Parent = target
			else
				task.spawn(error, `[Lync] - '{data.Path}' cannot contain zero or multiple root Instances`)
			end
		elseif data.Type == "Json" then
			if createInstance then
				local newInstance = Instance.new("ModuleScript")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					target.Source = "return " .. PrettyPrint(HttpService:JSONDecode(result))
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "JsonModel" then
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					local json = HttpService:JSONDecode(result)
					if createInstance then
						local newInstance = Instance.new(json.ClassName or "Folder")
						newInstance.Name = name
						newInstance.Parent = target
						target = newInstance
					else
						target:ClearAllChildren()
					end
					buildJsonModel(target, json)
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "PlainText" then
			if createInstance then
				local newInstance = Instance.new("StringValue")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					target.Value = result
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "Localization" then
			if createInstance then
				local newInstance = Instance.new("LocalizationTable")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					local entries = {}
					local lines = result:split("\n")
					local header = LuaCsv(lines[1])
					for lIndex = 2, #lines do
						local entry = LuaCsv(lines[lIndex])
						local values = {}
						for eIndex = 5, #entry do
							values[header[eIndex]] = entry[eIndex]
						end
						table.insert(entries, {Key = entry[1], Source = entry[2], Context = entry[3], Example = entry[4], Values = values})
					end
					lpcall("Set Entries", function()
						target:SetEntries(entries)
					end)
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		end
		setDetails(target, data)
		if data.TerrainRegion then
			if target == workspace.Terrain then
				local objects = getObjects("rbxasset://lync/" .. data.TerrainRegion[1])
				if objects and #objects == 1 then
					lpcall("Set Terrain Region", function()
						workspace.Terrain:Clear()
						workspace.Terrain:PasteRegion(objects[1], eval(data.TerrainRegion[2]), data.TerrainRegion[3])
					end)
				else
					task.spawn(error, `[Lync] - '{data.TerrainRegion[1]}' cannot contain zero or multiple root Instances`)
				end
			else
				task.spawn(error, "[Lync] - Cannot use $terrainRegion property with " .. tostring(target))
			end
		end
		if data.TerrainMaterialColors then
			if target == workspace.Terrain then
				for material, value in data.TerrainMaterialColors do
					lpcall("Set Terrain Material Color", function()
						workspace.Terrain:SetMaterialColor(material, eval(value))
					end)
				end
			else
				task.spawn(error, "[Lync] - Cannot use $terrainMaterialColors property with " .. tostring(target))
			end
		end
	end
end

local function buildAll()
	local sortedPaths = {}
	for path in pairs(map) do
		table.insert(sortedPaths, path)
	end
	table.sort(sortedPaths)
	for _, path in sortedPaths do
		buildPath(path)
	end
end

local function setConnected(newConnected: boolean)
	if connecting then return end
	if connected ~= newConnected then
		connecting = true
		port.TextEditable = false
		connect.Text = ""
		connect.Frame.Visible = true
		setActiveTheme()
		local Spin; Spin = RunService.RenderStepped:connect(function()
			if not connecting then
				Spin:Disconnect()
				connect.Frame.Visible = false
				return
			end
			connect.Frame.UIStroke.UIGradient.Rotation = (tick() % 1) * 360
		end)
		if newConnected then
			if not map then
				local success, result = pcall(function()
					local get = HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Map"})
					return get ~= "{}" and HttpService:JSONDecode(get) or nil
				end)
				if success then
					if result.Version == VERSION then
						debugPrints = result.Debug
						result.Debug = nil
						map = result
						if debugPrints then warn("[Lync] - Map:", result) end
						task.spawn(buildAll)
						repeat task.wait() until activeSourceRequests == 0
					else
						task.spawn(error, "[Lync] - Version mismatch. Please restart Studio")
						newConnected = false
					end
				else
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			else
				local success, result = pcall(function()
					HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Map"})
				end)
				if not success then
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			end
		end
		connecting = false
		connected = newConnected
		port.TextEditable = not connected
		connect.Text = connected and "Pause" or map and "Resume" or "Sync"
		setActiveTheme()
		if newConnected then
			workspace:SetAttribute("__lyncbuildfile", nil)
			ChangeHistoryService:ResetWaypoints()
			ChangeHistoryService:SetWaypoint("Initial Sync")
		end
	end
end

-- Toolbar

local toolbar = plugin:CreateToolbar("Lync " .. VERSION)
local toolbarButton = toolbar:CreateButton("Lync Client", "Toggle Lync Client widget", "rbxassetid://11619251438")

toolbarButton.ClickableWhenViewportHidden = true
toolbarButton:SetActive(widget.Enabled)

toolbarButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

-- Widget

do
	local widgetEnabled = plugin:GetSetting("Widget")
	widget.Enabled = widgetEnabled == nil or widgetEnabled
end
toolbarButton:SetActive(widget.Enabled)

widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toolbarButton:SetActive(not widget.Enabled)
	toolbarButton:SetActive(widget.Enabled)
	plugin:SetSetting("Widget", widget.Enabled)
end)

-- Connect

connect.Activated:Connect(function()
	setConnected(not connected)
end)

connect.MouseEnter:Connect(function()
	connect.BackgroundColor3 = connect:GetAttribute("BackgroundHover")
	connect.TextColor3 = connect:GetAttribute("TextHover")
end)

connect.MouseLeave:Connect(function()
	connect.BackgroundColor3 = connect:GetAttribute("Background")
	connect.TextColor3 = connect:GetAttribute("Text")
end)

connect.MouseButton1Down:Connect(function()
	connect.BackgroundColor3 = connect:GetAttribute("BackgroundPressed")
	connect.TextColor3 = connect:GetAttribute("TextPressed")
end)

connect.MouseButton1Up:Connect(function()
	connect.BackgroundColor3 = connect:GetAttribute("Background")
	connect.TextColor3 = connect:GetAttribute("Text")
end)

-- Port

port.MouseEnter:Connect(function()
	if port:IsFocused() then return end
	frame.Frame.UIStroke.Color = frame.Frame:GetAttribute("BorderHover")
end)

port.MouseLeave:Connect(function()
	if port:IsFocused() then return end
	frame.Frame.UIStroke.Color = frame.Frame:GetAttribute("Border")
end)

port.Focused:Connect(function()
	frame.Frame.UIStroke.Color = frame.Frame:GetAttribute("BorderSelected")
end)

port.FocusLost:Connect(function(_enterPressed)
	local entry = math.clamp(tonumber(port.Text) or 0, 0, 65535)
	port.Text = entry > 0 and entry or ""
	frame.Frame.UIStroke.Color = frame.Frame:GetAttribute("Border")
	plugin:SetSetting("Port", entry > 0 and entry or nil)
end)

-- Theme

setTheme()

settings().Studio.ThemeChanged:Connect(function()
	theme = settings().Studio.Theme :: StudioTheme
	setTheme()
end)

-- Sync

if workspace:GetAttribute("__lyncbuildfile") then
	setConnected(true)
end

while task.wait(0.5) do
	if connected then
		local success, result = pcall(function()
			local get = HttpService:GetAsync("http://localhost:" .. getPort(), false, {Type = "Modified"})
			return get ~= "{}" and HttpService:JSONDecode(get) or nil
		end)
		if success then
			if result then
				if debugPrints then warn("[Lync] - Modified:", result) end
				for key, value in result do
					map[key] = value or nil
				end
				local sortedPaths = {}
				for path in pairs(result) do
					table.insert(sortedPaths, path)
				end
				table.sort(sortedPaths)
				for _, path in sortedPaths do
					buildPath(path)
				end
				repeat task.wait() until activeSourceRequests == 0
				ChangeHistoryService:SetWaypoint("Sync")
			end
		else
			task.spawn(error, "[Lync] - " .. result)
			setConnected(false)
		end
	end
end
