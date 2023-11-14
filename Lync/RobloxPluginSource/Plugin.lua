--!strict
--[[
	Lync Client
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
local VERSION = "Alpha 25"

if not plugin or game:GetService("RunService"):IsRunning() and game:GetService("RunService"):IsClient() then return end

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Dependencies
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local CollectionService = game:GetService("CollectionService")
local CoreGui = game:GetService("CoreGui")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local Selection = game:GetService("Selection")
local StudioService = game:GetService("StudioService")
local TweenService = game:GetService("TweenService")

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Helper Variables
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

-- Constants
local IS_PLAYTEST_SERVER = if game:GetService("RunService"):IsRunning() then "true" else nil

-- Defines
local isBuildScript = false
local debugPrints = false
local theme: StudioTheme = settings().Studio.Theme :: StudioTheme
local connected = false
local connecting = false
local serverKey = plugin:GetSetting("Lync_ServerKey")
local map: {[string]: {[string]: any}}
local activeSourceRequests = 0
local changedModels: {[Instance]: boolean} = {}
local syncDuringTest = plugin:GetSetting("Lync_SyncDuringTest") or false

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Widget setup
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

-- Main Widget

local mainWidget = plugin:CreateDockWidgetPluginGui("Lync_Main", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Left, true, false, 268 + 8, 40 + 8, 268 + 8, 40 + 8))
mainWidget.Name = "Lync Client"
mainWidget.Title = mainWidget.Name

local mainWidgetFrame = script.WidgetGui.Frame
mainWidgetFrame.Parent = mainWidget
mainWidgetFrame.Frame.Version.Text = VERSION:lower()

local connect = mainWidgetFrame.Frame.Connect
local portTextBox = mainWidgetFrame.Frame.Port
portTextBox.Text = plugin:GetSetting("Lync_Port") or ""
local saveScript = mainWidgetFrame.SaveScript
local revertScript = mainWidgetFrame.RevertScript

-- Unsaved Model Widget

local unsavedModelWidget = plugin:CreateDockWidgetPluginGui("Lync_UnsavedModel", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 512, 256, 256, 128))
unsavedModelWidget.Name = "Lync - Unsaved Models"
unsavedModelWidget.Title = unsavedModelWidget.Name
unsavedModelWidget.Enabled = false

local unsavedModelWidgetFrame = script.UnsavedModelListGui.ScrollingFrame
unsavedModelWidgetFrame.Parent = unsavedModelWidget

-- Unsaved Model Warning

local unsavedModelWarning = script.UnsavedModelWarningGui
unsavedModelWarning.Parent = CoreGui

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

local function connectButtonColors(button: TextButton)
	button.MouseEnter:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("BackgroundHover")
		button.TextColor3 = button:GetAttribute("TextHover")
	end)
	button.MouseLeave:Connect(function()
		button.BackgroundColor3 = button:GetAttribute("Background")
		button.TextColor3 = button:GetAttribute("Text")
	end)
	button.MouseButton1Down:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("BackgroundPressed")
		button.TextColor3 = button:GetAttribute("TextPressed")
	end)
	button.MouseButton1Up:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("Background")
		button.TextColor3 = button:GetAttribute("Text")
	end)
end

local function updateChangedModelUi()
	-- Destroy hidden or old entries
	for _, modelEntry in unsavedModelWidgetFrame:GetChildren() do
		if modelEntry:IsA("Frame") then
			if not changedModels[modelEntry.Object.Value] then
				modelEntry:Destroy()
			end
		end
	end

	-- Make new entries
	for object, changed in changedModels do
		if changed then
			-- Skip if entry already created
			local alreadyCreated = false
			for _, modelEntry in unsavedModelWidgetFrame:GetChildren() do
				if modelEntry:IsA("Frame") and modelEntry.Object.Value == object then
					alreadyCreated = true
					break
				end
			end
			if alreadyCreated then
				continue
			end

			local fullName = object:GetFullName()
			local modelEntry = script.UnsavedModelListItem:Clone()
			modelEntry.Name = fullName
			modelEntry.Object.Value = object
			modelEntry.SelectButton.TextLabel.Text = fullName
			modelEntry.Parent = unsavedModelWidgetFrame

			modelEntry.SelectButton.Activated:Connect(function()
				Selection:Set({object})
			end)

			modelEntry.IgnoreButton.Activated:Connect(function()
				changedModels[object] = nil
				updateChangedModelUi()
			end)
			connectButtonColors(modelEntry.IgnoreButton)

			modelEntry.SaveButton.Activated:Connect(function()
				Selection:Set({object})
				if next(Selection:Get()) and plugin:PromptSaveSelection(object.Name) then
					changedModels[object] = nil
					updateChangedModelUi()
				end
			end)
			connectButtonColors(modelEntry.SaveButton)

			unsavedModelWarning.Enabled = true
		end
	end

	-- Hide UI if empty
	if not next(changedModels) then
		unsavedModelWidget.Enabled = false
		unsavedModelWarning.Enabled = false
	end
end

local function setConnectTheme()
	local backgroundColor = if (connecting or connected) then Enum.StudioStyleGuideColor.DialogButton else Enum.StudioStyleGuideColor.DialogMainButton
	connect:SetAttribute("Background", theme:GetColor(backgroundColor))
	connect:SetAttribute("BackgroundHover", theme:GetColor(backgroundColor, Enum.StudioStyleGuideModifier.Hover))
	connect:SetAttribute("BackgroundPressed", theme:GetColor(backgroundColor, Enum.StudioStyleGuideModifier.Pressed))
	connect.BackgroundColor3 = connect:GetAttribute("Background")
	local textColor = if (connecting or connected) then Enum.StudioStyleGuideColor.DialogButtonText else Enum.StudioStyleGuideColor.DialogMainButtonText
	connect:SetAttribute("Text", theme:GetColor(textColor))
	connect:SetAttribute("TextHover", theme:GetColor(textColor, Enum.StudioStyleGuideModifier.Hover))
	connect:SetAttribute("TextPressed", theme:GetColor(textColor, Enum.StudioStyleGuideModifier.Pressed))
	connect.TextColor3 = connect:GetAttribute("Text")
	connect.Frame.UIStroke.Color = connect:GetAttribute("Text")
end

local function setScriptActionsTheme()
	local enabled = saveScript.Active
	local idleModifier = if enabled then Enum.StudioStyleGuideModifier.Default else Enum.StudioStyleGuideModifier.Disabled

	local saveScriptBackgroundColor = Enum.StudioStyleGuideColor.DialogMainButton
	saveScript:SetAttribute("Background", theme:GetColor(saveScriptBackgroundColor, idleModifier))
	saveScript:SetAttribute("BackgroundHover", theme:GetColor(saveScriptBackgroundColor, Enum.StudioStyleGuideModifier.Hover))
	saveScript:SetAttribute("BackgroundPressed", theme:GetColor(saveScriptBackgroundColor, Enum.StudioStyleGuideModifier.Pressed))
	saveScript.BackgroundColor3 = saveScript:GetAttribute("Background")
	local saveScriptTextColor = Enum.StudioStyleGuideColor.DialogMainButtonText
	saveScript:SetAttribute("Text", theme:GetColor(saveScriptTextColor, idleModifier))
	saveScript:SetAttribute("TextHover", theme:GetColor(saveScriptTextColor, Enum.StudioStyleGuideModifier.Hover))
	saveScript:SetAttribute("TextPressed", theme:GetColor(saveScriptTextColor, Enum.StudioStyleGuideModifier.Pressed))
	saveScript.TextColor3 = saveScript:GetAttribute("Text")

	local revertScriptBackgroundColor = Enum.StudioStyleGuideColor.DialogButton
	revertScript:SetAttribute("Background", theme:GetColor(revertScriptBackgroundColor, idleModifier))
	revertScript:SetAttribute("BackgroundHover", theme:GetColor(revertScriptBackgroundColor, Enum.StudioStyleGuideModifier.Hover))
	revertScript:SetAttribute("BackgroundPressed", theme:GetColor(revertScriptBackgroundColor, Enum.StudioStyleGuideModifier.Pressed))
	revertScript.BackgroundColor3 = revertScript:GetAttribute("Background")
	local revertScriptTextColor = Enum.StudioStyleGuideColor.DialogButtonText
	revertScript:SetAttribute("Text", theme:GetColor(revertScriptTextColor, idleModifier))
	revertScript:SetAttribute("TextHover", theme:GetColor(revertScriptTextColor, Enum.StudioStyleGuideModifier.Hover))
	revertScript:SetAttribute("TextPressed", theme:GetColor(revertScriptTextColor, Enum.StudioStyleGuideModifier.Pressed))
	revertScript.TextColor3 = revertScript:GetAttribute("Text")
end

local function setTheme()
	-- Main Widget
	mainWidgetFrame.Frame.BackgroundColor3 = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBackground)
	mainWidgetFrame.Frame.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBorder)
	connect.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	portTextBox.PlaceholderColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
	portTextBox.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText)
	mainWidgetFrame.Frame.Version.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
	local portBorderColor = Enum.StudioStyleGuideColor.InputFieldBorder
	mainWidgetFrame.Frame:SetAttribute("Border", theme:GetColor(portBorderColor))
	mainWidgetFrame.Frame:SetAttribute("BorderHover", theme:GetColor(portBorderColor, Enum.StudioStyleGuideModifier.Hover))
	mainWidgetFrame.Frame:SetAttribute("BorderSelected", theme:GetColor(portBorderColor, Enum.StudioStyleGuideModifier.Selected))
	mainWidgetFrame.Frame.UIStroke.Color = mainWidgetFrame.Frame:GetAttribute("Border")
	saveScript.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	revertScript.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	setConnectTheme()
	setScriptActionsTheme()

	-- Unsaved Model Widget
	script.UnsavedModelListItem.SelectButton.TextLabel.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText)
	local ignoreBackground = Enum.StudioStyleGuideColor.DialogButton
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("Background", theme:GetColor(ignoreBackground))
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("BackgroundHover", theme:GetColor(ignoreBackground, Enum.StudioStyleGuideModifier.Hover))
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("BackgroundPressed", theme:GetColor(ignoreBackground, Enum.StudioStyleGuideModifier.Pressed))
	script.UnsavedModelListItem.IgnoreButton.BackgroundColor3 = script.UnsavedModelListItem.IgnoreButton:GetAttribute("Background")
	local ignoreText = Enum.StudioStyleGuideColor.DialogButtonText
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("Text", theme:GetColor(ignoreText))
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("TextHover", theme:GetColor(ignoreText, Enum.StudioStyleGuideModifier.Hover))
	script.UnsavedModelListItem.IgnoreButton:SetAttribute("TextPressed", theme:GetColor(ignoreText, Enum.StudioStyleGuideModifier.Pressed))
	script.UnsavedModelListItem.IgnoreButton.TextColor3 = script.UnsavedModelListItem.IgnoreButton:GetAttribute("Text")
	script.UnsavedModelListItem.IgnoreButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	local saveBackground = Enum.StudioStyleGuideColor.DialogMainButton
	script.UnsavedModelListItem.SaveButton:SetAttribute("Background", theme:GetColor(saveBackground))
	script.UnsavedModelListItem.SaveButton:SetAttribute("BackgroundHover", theme:GetColor(saveBackground, Enum.StudioStyleGuideModifier.Hover))
	script.UnsavedModelListItem.SaveButton:SetAttribute("BackgroundPressed", theme:GetColor(saveBackground, Enum.StudioStyleGuideModifier.Pressed))
	script.UnsavedModelListItem.SaveButton.BackgroundColor3 = script.UnsavedModelListItem.SaveButton:GetAttribute("Background")
	local saveText = Enum.StudioStyleGuideColor.DialogMainButtonText
	script.UnsavedModelListItem.SaveButton:SetAttribute("Text", theme:GetColor(saveText))
	script.UnsavedModelListItem.SaveButton:SetAttribute("TextHover", theme:GetColor(saveText, Enum.StudioStyleGuideModifier.Hover))
	script.UnsavedModelListItem.SaveButton:SetAttribute("TextPressed", theme:GetColor(saveText, Enum.StudioStyleGuideModifier.Pressed))
	script.UnsavedModelListItem.SaveButton.TextColor3 = script.UnsavedModelListItem.SaveButton:GetAttribute("Text")
	script.UnsavedModelListItem.SaveButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)

	for _, modelEntry in unsavedModelWidgetFrame:GetChildren() do
		if modelEntry:IsA("Frame") then
			modelEntry:Destroy()
		end
	end
	updateChangedModelUi()
end

local function getPort(): string
	return portTextBox.Text ~= "" and portTextBox.Text or portTextBox.PlaceholderText
end

local function terminate(errorMessage: string)
	connecting = false
	if connected then
		task.spawn(error, "[Lync] - " .. errorMessage, 0)
	else
		error("[Lync] - Terminated: " .. errorMessage, 0)
	end
end

local function lpcall(context: string, func: any, ...): (boolean, any)
	local args = {...}
	return xpcall(function()
		return func(unpack(args))
	end, function(err)
		task.spawn(error, "[Lync] - " .. context .. ": " .. err)
	end)
end

local function getObjects(url: string): {Instance}?
	local success, result = lpcall("Get Objects", game.GetObjects, game, url)
	return if success then result else nil
end

local function makeDirty(object: Instance, descendant: any, property: string?)
	if not changedModels[object] and object.Parent and (not property or property ~= "Archivable" and pcall(function() descendant[property] = descendant[property] end)) then
		if debugPrints then warn("[Lync] - Modified synced object:", object, property) end
		changedModels[object] = true
		updateChangedModelUi()
	end
end

local function listenForChanges(object: Instance)
	if not changedModels[object] then
		-- Modification events
		object.Changed:Connect(function(property)
			if property == "Name" or property == "Parent" then
				for _, modelEntry in unsavedModelWidgetFrame:GetChildren() do
					if modelEntry:IsA("Frame") and modelEntry.Object.Value == object then
						local fullName = object:GetFullName()
						modelEntry.Name = fullName
						modelEntry.SelectButton.TextLabel.Text = fullName
						break
					end
				end
			end
			if property ~= "Parent" then
				makeDirty(object, object, property)
			end
		end)
		object.AttributeChanged:Connect(function(_)
			makeDirty(object, object)
		end)
		object.DescendantAdded:Connect(function(descendant)
			makeDirty(object, object)
			descendant.Changed:Connect(function(property)
				makeDirty(object, descendant, property)
			end)
			descendant.AttributeChanged:Connect(function(_)
				makeDirty(object, descendant)
			end)
		end)
		for _, descendant in object:GetDescendants() do
			descendant.Changed:Connect(function(property)
				makeDirty(object, descendant, property)
			end)
			descendant.AttributeChanged:Connect(function(_)
				makeDirty(object, descendant)
			end)
		end

		-- Clear on destruction
		object.Destroying:Connect(function()
			changedModels[object] = nil
			updateChangedModelUi()
		end)
	end
end

--offline-start

local function trim6(s: string): string
	return (if s:match('^()%s*$') then '' else s:match('^%s*(.*%S)')) :: string
end

local function validateLuaProperty(lua: string): boolean
	-- Constructor
	if lua:match([[^[A-Z][0-9A-Za-z]+%.[0-9A-Za-z]+%(.*%)$]]) then
		local valid = true
		local paramStart, paramEnd = lua:find([[%(.*%)$]])
		local params = lua:sub(paramStart :: number + 1, paramEnd :: number - 1)
		while valid do
			local paramTestStart, paramTestEnd = params:find([[%([^()]+%)]])
			if paramTestStart and paramTestEnd then
				local param = params:sub(paramTestStart + 1, paramTestEnd - 1)
				valid = validateLuaProperty(`a.a({param})`)
				params = params:sub(1, paramTestStart - 1) .. "()" .. params:sub(paramTestEnd + 1, -1)
			end
			if not valid then break end
			local tableTestStart, tableTestEnd = params:find([[{[^{}]+}]])
			if tableTestStart and tableTestEnd then
				local value = params:sub(tableTestStart + 1, tableTestEnd - 1)
				valid = validateLuaProperty(`a.a({value})`)
				params = params:sub(1, tableTestStart - 1) .. params:sub(tableTestEnd + 1, -1)
			end
			if not paramTestStart and not tableTestStart then break end
		end
		if params == "" then
			return valid
		end
		for _, param in params:split(",") do
			if valid then
				valid = validateLuaProperty(trim6(param))
			else
				break
			end
		end
		return valid

	-- Enum
	elseif lua:match([[^Enum%.[0-9A-Za-z_]+%.[0-9A-Za-z_]+$]]) then
		return true

	-- Nil
	elseif lua:match([[^nil$]]) then
		return true

	-- Boolean
	elseif lua:match([[^true$]]) or lua:match([[^false$]]) then
		return true

	-- Number
	elseif lua:match([[^[0-9A-Fa-fXx_.+%-*/^%%#() ]+$]]) then
		return true

	-- String
	elseif lua:match([[^"[^"]*"$]]) or lua:match([[^'[^']*'$]]) then
		return true
	end

	return false
end

local function eval(value: any): any
	if type(value) == "table" then
		if validateLuaProperty(value[1]) then
			return (loadstring("return " .. value[1]) :: any)()
		else
			terminate(`Lua string [ {value[1]} ] doesn't match the JSON property format`)
			return
		end
	else
		return value
	end
end

local function setDetails(target: any, data: any)
	if data.Properties then
		for property, value in data.Properties do
			lpcall("Set Property " .. property, function()
				if not isBuildScript and target:IsA("Model") and property == "Scale" then
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

local function setScriptSourceLive(container: LuaSourceContainer, lua: string)
	local document = ScriptEditorService:FindScriptDocument(container)
	local cursorLine: number, cursorChar: number, anchorLine: number, anchorChar: number;
	if document then
		cursorLine, cursorChar, anchorLine, anchorChar = document:GetSelection()
	end
	ScriptEditorService:UpdateSourceAsync(container, function(_oldContent: string)
		return lua
	end)
	if document then
		local maxLine = document:GetLineCount()
		local maxCursorChar = document:GetLine(math.min(cursorLine, maxLine)):len() + 1
		local maxAnchorChar = document:GetLine(math.min(anchorLine, maxLine)):len() + 1
		document:ForceSetSelectionAsync(
			math.min(cursorLine, maxLine),
			math.min(cursorChar, maxCursorChar),
			math.min(anchorLine, maxLine),
			math.min(anchorChar, maxAnchorChar)
		)
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
	local target: any = game
	local subpaths = path:split("/")
	local name = subpaths[#subpaths]
	for index = 2, #subpaths do
		local subpath = subpaths[index]
		local nextTarget = target:FindFirstChild(subpath)
		if target == game then
			target = game:GetService(subpath :: any)
		elseif nextTarget then
			if target ~= game and index == #subpaths then
				if
					not data
					or data.Type == "Model" or data.Type == "JsonModel"
					or data.Type == "Instance" and nextTarget.ClassName ~= data.ClassName
					or data.Type == "Lua" and nextTarget.ClassName ~= (if data.Context == "Client" then "LocalScript" elseif data.Context == "Server" then "Script" else "ModuleScript")
				then
					if not pcall(function()
						nextTarget.Parent = nil
						createInstance = true
						if data.Type == "Model" and changedModels[nextTarget] then
							changedModels[nextTarget] = nil
							updateChangedModelUi()
						end
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
		if path == "tree/Workspace/Camera" then
			data.ClassName = "Camera"
		elseif path == "tree/Workspace/Terrain" then
			data.ClassName = "Terrain"
		elseif path == "tree/StarterPlayer/StarterCharacterScripts" then
			data.ClassName = "StarterCharacterScripts"
		elseif path == "tree/StarterPlayer/StarterPlayerScripts" then
			data.ClassName = "StarterPlayerScripts"
		elseif path == "tree/TextChatService/ChatWindowConfiguration" then
			data.ClassName = "ChatWindowConfiguration"
		elseif path == "tree/TextChatService/ChatInputBarConfiguration" then
			data.ClassName = "ChatInputBarConfiguration"
		elseif path == "tree/TextChatService/BubbleChatConfiguration" then
			data.ClassName = "BubbleChatConfiguration"
		end
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
			data.Instance = target
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path})
				end)
				activeSourceRequests -= 1
				if success then
					if isBuildScript then
						target.Source = result
					else
						setScriptSourceLive(target, result)
					end
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "Model" then
			local objects = getObjects("rbxasset://lync/" .. data.Path)
			if objects then
				if #objects == 1 then
					objects[1].Name = name
					objects[1].Parent = target
					listenForChanges(objects[1])
				else
					terminate(`'{data.Path}' cannot contain zero or multiple root Instances`)
				end
			end
		elseif data.Type == "JSON" or data.Type == "YAML" or data.Type == "TOML" or data.Type == "Excel" then
			if createInstance then
				local newInstance = Instance.new("ModuleScript")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					if isBuildScript then
						target.Source = result
					else
						setScriptSourceLive(target, result)
					end
				else
					terminate(`The server did not return a source for '{data.Path}'`)
				end
			end)
		elseif data.Type == "JsonModel" then
			task.spawn(function()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path})
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
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path})
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
					return HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = "Localization"})
				end)
				activeSourceRequests -= 1
				if success then
					lpcall("Set Entries", function()
						if isBuildScript then
							-- Temporary. Awaiting rbx-dom / Lune update.
							print("Localization entries unimplemented!")
						else
							target:SetEntries(HttpService:JSONDecode(result))
						end
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
				if objects then
					if #objects == 1 then
						lpcall("Set Terrain Region", function()
							if isBuildScript then
								-- Temporary. Awaiting rbx-dom / Lune update.
								workspace.Terrain.SmoothGrid = (objects[1] :: any).SmoothGrid
							else
								workspace.Terrain:Clear()
								workspace.Terrain:PasteRegion(objects[1] :: TerrainRegion, eval(data.TerrainRegion[2]), data.TerrainRegion[3])
							end
						end)
					else
						terminate(`'{data.TerrainRegion[1]}' cannot contain zero or multiple root Instances`)
					end
				end
			else
				terminate("Cannot use $terrainRegion property with " .. tostring(target))
			end
		end
		if data.TerrainMaterialColors then
			if target == workspace.Terrain then
				for material, value in data.TerrainMaterialColors do
					lpcall("Set Terrain Material Color", function()
						workspace.Terrain:SetMaterialColor((Enum.Material :: any)[material], eval(value))
					end)
				end
			else
				terminate("Cannot use $terrainMaterialColors property with " .. tostring(target))
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

--offline-end

local function setConnected(newConnected: boolean)
	if connecting then return end

	if connected ~= newConnected then
		connecting = true
		portTextBox.TextEditable = false
		connect.Text = ""
		connect.Frame.Visible = true
		setConnectTheme()

		local Spin; Spin = RunService.RenderStepped:Connect(function()
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
					local get = HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Map", Playtest = IS_PLAYTEST_SERVER})
					return get ~= "{}" and HttpService:JSONDecode(get) or nil
				end)
				if success then
					if result.Version == VERSION then
						debugPrints = result.Debug
						result.Debug = nil
						map = result
						if not IS_PLAYTEST_SERVER then
							if debugPrints then warn("[Lync] - Map:", result) end
							task.spawn(buildAll)
							repeat task.wait() until activeSourceRequests == 0
						end
					else
						task.spawn(error, `[Lync] - Version mismatch ({result.Version} ~= {VERSION}). Please restart Studio`)
						newConnected = false
					end

					if result.ServePlaceIds then
						local placeIdMatch = false
						for _, placeId in result.ServePlaceIds do
							if placeId == game.PlaceId then
								placeIdMatch = true
								break
							end
						end
						if not placeIdMatch then
							task.spawn(error, `[Lync] - PlaceId '{game.PlaceId}' not found in ServePlaceIds`)
							newConnected = false
						end
					end
				else
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			else
				local success, result = pcall(function()
					HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Resume"})
				end)
				if not success then
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			end
		end

		connecting = false
		connected = newConnected
		workspace:SetAttribute("__lyncactive", if newConnected then true else nil)
		portTextBox.TextEditable = not connected
		connect.Text = if connected then "Pause" elseif map then "Resume" else "Sync"
		setConnectTheme()

		if newConnected then
			workspace:SetAttribute("__lyncbuildfile", nil)
			ChangeHistoryService:ResetWaypoints()
			ChangeHistoryService:SetWaypoint("Initial Sync")
		end
	end
end

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Toolbar
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

if not IS_PLAYTEST_SERVER then

	-- Lync Client

	local toolbar = plugin:CreateToolbar("Lync " .. VERSION)
	local widgetButton = toolbar:CreateButton("Lync Client", "Toggle Lync Client widget", "rbxassetid://11619251438")

	widgetButton.ClickableWhenViewportHidden = true
	widgetButton:SetActive(mainWidget.Enabled)

	widgetButton.Click:Connect(function()
		mainWidget.Enabled = not mainWidget.Enabled
	end)

	mainWidget:GetPropertyChangedSignal("Enabled"):Connect(function()
		widgetButton:SetActive(mainWidget.Enabled)
	end)

	-- Connect

	connect.Activated:Connect(function()
		setConnected(not connected)
	end)

	connectButtonColors(connect)

	-- Port

	portTextBox.MouseEnter:Connect(function()
		if portTextBox:IsFocused() then return end
		mainWidgetFrame.Frame.UIStroke.Color = mainWidgetFrame.Frame:GetAttribute("BorderHover")
	end)

	portTextBox.MouseLeave:Connect(function()
		if portTextBox:IsFocused() then return end
		mainWidgetFrame.Frame.UIStroke.Color = mainWidgetFrame.Frame:GetAttribute("Border")
	end)

	portTextBox.Focused:Connect(function()
		mainWidgetFrame.Frame.UIStroke.Color = mainWidgetFrame.Frame:GetAttribute("BorderSelected")
	end)

	portTextBox.FocusLost:Connect(function(_enterPressed)
		local entry = math.clamp(tonumber(portTextBox.Text) or 0, 0, 65535)
		portTextBox.Text = entry > 0 and entry or ""
		mainWidgetFrame.Frame.UIStroke.Color = mainWidgetFrame.Frame:GetAttribute("Border")
		plugin:SetSetting("Lync_Port", entry > 0 and entry or nil)
	end)

	-- Save Script

	local saveScriptHeldTween: Tween?;

	saveScript.MouseButton1Down:Connect(function()
		if saveScript.Active and not saveScriptHeldTween then
			local tween = TweenService:Create(saveScript.TextLabel.UIGradient, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Offset = Vector2.new(0.51, 0)})
			saveScriptHeldTween = tween
			tween:Play()
			tween.Completed:Connect(function(playbackState: Enum.PlaybackState)
				if playbackState == Enum.PlaybackState.Completed then
					for _, data in map do
						if data.Instance == StudioService.ActiveScript then
							local success, result = pcall(function()
								HttpService:PostAsync("http://localhost:" .. getPort(), ScriptEditorService:GetEditorSource(StudioService.ActiveScript :: LuaSourceContainer), Enum.HttpContentType.TextPlain, false, {Key = serverKey, Type = "ReverseSync", Path = data.Path})
							end)
							if success then
								print("[Lync] - Saved script:", data.Path)
								if saveScript.TextLabel.Text == "Saving..." then
									saveScript.TextLabel.Text = "Saved!"
								end
							else
								task.spawn(error, `[Lync] - Failed to save script: {data.Path}\n{tostring(result)}`)
								if saveScript.TextLabel.Text == "Saving..." then
									saveScript.TextLabel.Text = "Failed"
								end
							end
							break
						end
					end
				end
			end)
		end
	end)

	local function cancelSaveScript()
		if saveScriptHeldTween then
			saveScriptHeldTween:Cancel()
			saveScriptHeldTween = nil
		end
		saveScript.TextLabel.Text = "Saving..."
		saveScript.TextLabel.UIGradient.Offset = Vector2.new(-0.51, 0)
	end

	saveScript.MouseButton1Up:Connect(cancelSaveScript)

	saveScript.MouseLeave:Connect(cancelSaveScript)

	connectButtonColors(saveScript)

	-- Revert Script

	local revertScriptHeldTween: Tween?;

	revertScript.MouseButton1Down:Connect(function()
		if revertScript.Active and not revertScriptHeldTween then
			local tween = TweenService:Create(revertScript.TextLabel.UIGradient, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Offset = Vector2.new(0.51, 0)})
			revertScriptHeldTween = tween
			tween:Play()
			tween.Completed:Connect(function(playbackState: Enum.PlaybackState)
				if playbackState == Enum.PlaybackState.Completed then
					for _, data in map do
						if data.Instance == StudioService.ActiveScript then
							local success, result = pcall(function()
								local source = HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Source", Path = data.Path})
								setScriptSourceLive(data.Instance, source)
							end)
							if success then
								print("[Lync] - Reverted script:", data.Path)
								if revertScript.TextLabel.Text == "Reverting..." then
									revertScript.TextLabel.Text = "Reverted!"
								end
							else
								task.spawn(error, `[Lync] - Failed to revert script: {data.Path}\n{tostring(result)}`)
								if revertScript.TextLabel.Text == "Reverting..." then
									revertScript.TextLabel.Text = "Failed"
								end
							end
							break
						end
					end
				end
			end)
		end
	end)

	local function cancelRevertScript()
		if revertScriptHeldTween then
			revertScriptHeldTween:Cancel()
			revertScriptHeldTween = nil
		end
		revertScript.TextLabel.Text = "Reverting..."
		revertScript.TextLabel.UIGradient.Offset = Vector2.new(-0.51, 0)
	end

	revertScript.MouseButton1Up:Connect(cancelRevertScript)

	revertScript.MouseLeave:Connect(cancelRevertScript)

	connectButtonColors(revertScript)

	-- Enable Save / Revert Script

	StudioService:GetPropertyChangedSignal("ActiveScript"):Connect(function()
		local syncedScriptActive = false

		if StudioService.ActiveScript and map then
			for _, data in map do
				if data.Instance == StudioService.ActiveScript then
					syncedScriptActive = true
					break
				end
			end
		end

		saveScript.Active = syncedScriptActive
		revertScript.Active = syncedScriptActive
		setScriptActionsTheme()
	end)

	-- Playtest Sync

	local toggleSyncDuringTest = toolbar:CreateButton("Playtest Sync", "Apply changes to files during solo playtests", "rbxassetid://13771245795") :: PluginToolbarButton

	toggleSyncDuringTest.ClickableWhenViewportHidden = true
	toggleSyncDuringTest:SetActive(syncDuringTest)

	toggleSyncDuringTest.Click:Connect(function()
		syncDuringTest = not syncDuringTest
		plugin:SetSetting("Lync_SyncDuringTest", syncDuringTest)
		toggleSyncDuringTest:SetActive(syncDuringTest)
	end)

	-- Save Terrain

	local saveTerrain = toolbar:CreateButton("Save Terrain", "Save a copy of this place's Terrain as a TerrainRegion", "rbxassetid://13771218804") :: PluginToolbarButton

	saveTerrain.ClickableWhenViewportHidden = true

	saveTerrain.Click:Connect(function()
		local terrainRegion = workspace.Terrain:CopyRegion(workspace.Terrain.MaxExtents);
		terrainRegion.Parent = workspace
		Selection:Set({terrainRegion})
		plugin:PromptSaveSelection(terrainRegion.Name)
		terrainRegion:Destroy()
	end)

	-- Changed Model Widget

	unsavedModelWarning.MainButton.Activated:Connect(function()
		unsavedModelWidget.Enabled = true
	end)

	-- Theme

	setTheme()

	settings().Studio.ThemeChanged:Connect(function()
		theme = settings().Studio.Theme :: StudioTheme
		setTheme()
	end)
end

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Main Loop
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

if not serverKey then
	serverKey = HttpService:GenerateGUID(false)
	plugin:SetSetting("Lync_ServerKey", serverKey)
end

if not IS_PLAYTEST_SERVER and workspace:GetAttribute("__lyncactive") then
	workspace:SetAttribute("__lyncactive", nil)
end

if workspace:GetAttribute("__lyncbuildfile") and not IS_PLAYTEST_SERVER or syncDuringTest and IS_PLAYTEST_SERVER and workspace:GetAttribute("__lyncactive") then
	if syncDuringTest and IS_PLAYTEST_SERVER then warn("[Lync] - Playtest Sync is active.") end
	setConnected(true)
end

while task.wait(0.5) do
	if connected then
		local success, result = pcall(function()
			local get = HttpService:GetAsync("http://localhost:" .. getPort(), false, {Key = serverKey, Type = "Modified", Playtest = IS_PLAYTEST_SERVER})
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
