--!strict
--!optimize 2
--!native
--[[
	Lync Client
	https://github.com/Iron-Stag-Games/Lync
	Copyright (C) 2025  Iron Stag Games

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
local VERSION = "Alpha 30"

if not plugin or game:GetService("RunService"):IsRunning() and game:GetService("RunService"):IsClient() then return end

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Dependencies
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local PhysicsService = game:GetService("PhysicsService")
local RunService = game:GetService("RunService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local Selection = game:GetService("Selection")
local SerializationService = game:GetService("SerializationService")
local TweenService = game:GetService("TweenService")

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Helper Variables
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

-- Constants
local IS_PLAYTEST_SERVER = if RunService:IsRunning() then "true" else nil
local SUPPRESSED_CLASSES = {
	"Terrain";
	"StarterCharacterScripts";
	"StarterPlayerScripts";
	"ChatWindowConfiguration";
	"ChatInputBarConfiguration";
	"BubbleChatConfiguration";
}
local SUPPRESSED_PROPERTIES = {
	"AbsoluteCanvasSize";
	"AbsoluteCellCount";
	"AbsoluteCellSize";
	"AbsoluteContentSize";
	"AbsolutePosition";
	"AbsoluteRotation";
	"AbsoluteSize";
	"AbsoluteWindowSize";
	"Archivable";
	"CollisionGroupId";
	"CurrentPhysicalProperties";
	"GuiState";
	"OpenTypeFeaturesError";
	"IsLoaded";
	"TextBounds";
	"TextFits";
	"TimeLength";
}
local BUTTON_TWEEN_INFO = TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local BUTTON_TWEEN_PROPERTIES = {Offset = Vector2.new(0.51, 0)}

-- Defines
local theme: StudioTheme = settings().Studio.Theme :: StudioTheme
local connected = false
local connecting = false
local serverKey = plugin:GetSetting("Lync_ServerKey")
local map: {
	info: {
		Version: number;
		Debug: boolean;
		CollisionGroupsFile: string;
		CollisionGroups: {[string]: {[string]: boolean}};
	};
	tree: {[string]: {[string]: any}};
};
local activeSourceRequests = 0
local updatingSource = setmetatable({} :: {[LuaSourceContainer]: true?}, {__mode = "k"})
local changedFiles = setmetatable({} :: {[Instance]: boolean?}, {__mode = "k"})
local changedCollisionGroupData = false
local syncDuringTest = plugin:GetSetting("Lync_SyncDuringTest") or false

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Widget setup
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

local mainWidget = plugin:CreateDockWidgetPluginGui("Lync_Main", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Left, true, false, 360 + 8, 40 + 8, 360 + 8, 40 + 8))
mainWidget.Name = "Lync Client"
mainWidget.Title = mainWidget.Name
mainWidget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local widgetFrame = script.WidgetGui.Frame
widgetFrame.Parent = mainWidget
widgetFrame.TopBar.Title.Version.Text = VERSION:lower()

local connect = widgetFrame.TopBar.Actions.Connect
local portTextBox = widgetFrame.TopBar.Actions.Port
portTextBox.Text = plugin:GetSetting("Lync_Port") or ""

local unsavedFilesFrame = widgetFrame.UnsavedFiles

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function getHost(): string
	return "http://localhost:" .. (portTextBox.Text ~= "" and portTextBox.Text or portTextBox.PlaceholderText)
end

function connectButtonColors(button: TextButton): ()
	button.MouseEnter:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("BackgroundHover") :: Color3
		button.TextColor3 = button:GetAttribute("TextHover") :: Color3
	end)
	button.MouseLeave:Connect(function()
		button.BackgroundColor3 = button:GetAttribute("Background") :: Color3
		button.TextColor3 = button:GetAttribute("Text") :: Color3
	end)
	button.MouseButton1Down:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("BackgroundPressed") :: Color3
		button.TextColor3 = button:GetAttribute("TextPressed") :: Color3
	end)
	button.MouseButton1Up:Connect(function()
		if not button.Active then return end
		button.BackgroundColor3 = button:GetAttribute("Background") :: Color3
		button.TextColor3 = button:GetAttribute("Text") :: Color3
	end)
end

function setScriptSourceLive(container: LuaSourceContainer, lua: string): ()
	local newContent = ({lua:gsub("\r", "")})[1]
	local document = ScriptEditorService:FindScriptDocument(container)
	local cursorLine: number, cursorChar: number, anchorLine: number, anchorChar: number;

	if document then
		cursorLine, cursorChar, anchorLine, anchorChar = document:GetSelection()
	end

	activeSourceRequests += 1
	ScriptEditorService:UpdateSourceAsync(container, function(oldContent: string): ()
		if oldContent ~= newContent then
			updatingSource[container] = true
		end
		return newContent
	end)
	activeSourceRequests -= 1

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

	if changedFiles[container] then
		changedFiles[container] = false
		updateChangedFilesUI()
	end
end

function getCurrentCollisionGroups(): {[string]: {[string]: boolean}}
	local currentCollisionGroups = {}
	for _, collisionGroup in PhysicsService:GetRegisteredCollisionGroups() do
		currentCollisionGroups[collisionGroup.name] = {}
		for _, otherCollisionGroup in PhysicsService:GetRegisteredCollisionGroups() do
			if not currentCollisionGroups[otherCollisionGroup.name] or currentCollisionGroups[otherCollisionGroup.name][collisionGroup.name] == nil then
				currentCollisionGroups[collisionGroup.name][otherCollisionGroup.name] = PhysicsService:CollisionGroupsAreCollidable(collisionGroup.name, otherCollisionGroup.name)
			end
		end
	end
	return currentCollisionGroups
end

function addChangedFileEntry(object: (Instance | "CollisionGroupData"), path: string): ()
	local fileEntry = script.UnsavedFileListItem:Clone()
	local fullName = if
		typeof(object) == "Instance" then map.tree[path].Path
		elseif object == "CollisionGroupData" then "< collision group data >"
		else object
	fileEntry.Name = fullName
	if typeof(object) == "Instance" then
		fileEntry.Instance.Value = object
	else
		fileEntry.Special.Value = object
	end
	fileEntry.SelectButton.TextLabel.Text = fullName
	fileEntry.Parent = unsavedFilesFrame

	-- Select
	do
		if typeof(object) == "Instance" then
			fileEntry.SelectButton.Activated:Connect(function()
				local data = map.tree[path]
				if data.Type == "Lua" and fileEntry:GetAttribute("Selected") then
					ScriptEditorService:OpenScriptDocumentAsync(object)
				end
				Selection:Set({object})
			end)
			fileEntry:GetAttributeChangedSignal("Selected"):Connect(function()
				if fileEntry:GetAttribute("Selected") then
					fileEntry.SelectButton.BackgroundColor3 = fileEntry.SelectButton:GetAttribute("BackgroundSelected")
					fileEntry.SelectButton.TextLabel.TextColor3 = fileEntry.SelectButton:GetAttribute("TextSelected")
				else
					fileEntry.SelectButton.BackgroundColor3 = fileEntry.SelectButton:GetAttribute("Background")
					fileEntry.SelectButton.TextLabel.TextColor3 = fileEntry.SelectButton:GetAttribute("Text")
				end
			end)
			fileEntry:SetAttribute("Selected", table.find(Selection:Get(), object))
		end
		fileEntry.SelectButton.MouseEnter:Connect(function()
			if not fileEntry:GetAttribute("Selected") then
				fileEntry.SelectButton.BackgroundColor3 = fileEntry.SelectButton:GetAttribute("BackgroundHover")
				fileEntry.SelectButton.TextLabel.TextColor3 = fileEntry.SelectButton:GetAttribute("TextHover")
			end
		end)
		fileEntry.SelectButton.MouseLeave:Connect(function()
			if not fileEntry:GetAttribute("Selected") then
				fileEntry.SelectButton.BackgroundColor3 = fileEntry.SelectButton:GetAttribute("Background")
				fileEntry.SelectButton.TextLabel.TextColor3 = fileEntry.SelectButton:GetAttribute("Text")
			end
		end)
	end

	-- Ignore
	if typeof(object) == "Instance" then
		local holdTween: Tween?;
	
		fileEntry.IgnoreButton.MouseButton1Down:Connect(function()
			if fileEntry.IgnoreButton.Active and not holdTween then
				local tween = TweenService:Create(fileEntry.IgnoreButton.TextLabel.UIGradient, BUTTON_TWEEN_INFO, BUTTON_TWEEN_PROPERTIES)
				holdTween = tween
				tween:Play()
				tween.Completed:Connect(function(playbackState: Enum.PlaybackState)
					if playbackState == Enum.PlaybackState.Completed then
						if typeof(object) == "Instance" then
							changedFiles[object] = false
						elseif object == "CollisionGroupData" then
							changedCollisionGroupData = false
						end
						updateChangedFilesUI()
					end
				end)
			end
		end)
	
		local function cancelRevert()
			if holdTween then
				holdTween:Cancel()
				holdTween = nil
			end
			fileEntry.IgnoreButton.TextLabel.Text = "Ignore"
			fileEntry.IgnoreButton.TextLabel.UIGradient.Offset = Vector2.new(-0.51, 0)
		end
		fileEntry.IgnoreButton.MouseButton1Up:Connect(cancelRevert)
		fileEntry.IgnoreButton.MouseLeave:Connect(cancelRevert)
	
		connectButtonColors(fileEntry.IgnoreButton)
	else
		fileEntry.IgnoreButton.Visible = false
		fileEntry.SelectButton.Size += UDim2.fromOffset(74, 0)
	end

	-- Revert
	do
		local holdTween: Tween?;
	
		fileEntry.RevertButton.MouseButton1Down:Connect(function()
			if fileEntry.RevertButton.Active and not holdTween then
				local tween = TweenService:Create(fileEntry.RevertButton.TextLabel.UIGradient, BUTTON_TWEEN_INFO, BUTTON_TWEEN_PROPERTIES)
				holdTween = tween
				tween:Play()
				tween.Completed:Connect(function(playbackState: Enum.PlaybackState)
					if playbackState == Enum.PlaybackState.Completed then
						if typeof(object) == "Instance" then
							local data = map.tree[path]
							local success, result = pcall(function()
								if data.Type == "Lua" then
									local source = HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
									setScriptSourceLive(data.Instance, source)
								elseif data.Type == "Model" then
									buildPath(path)
								end
							end)
							if success then
								print("[Lync] - Reverted file:", data.Path)
							else
								task.spawn(error, `[Lync] - Failed to revert file: {data.Path}\n{tostring(result)}`)
								fileEntry.RevertButton.TextLabel.Text = "Failed"
							end
						elseif object == "CollisionGroupData" then
							local currentCollisionGroups = getCurrentCollisionGroups()
							for collisionGroupName in currentCollisionGroups do
								if map.info.CollisionGroups[collisionGroupName] == nil then
									PhysicsService:UnregisterCollisionGroup(collisionGroupName)
								end
							end
							setCollisionGroups()
							print("[Lync] - Reverted collision group data")
						end
					end
				end)
			end
		end)
	
		local function cancelRevert()
			if holdTween then
				holdTween:Cancel()
				holdTween = nil
			end
			fileEntry.RevertButton.TextLabel.Text = "Revert"
			fileEntry.RevertButton.TextLabel.UIGradient.Offset = Vector2.new(-0.51, 0)
		end
		fileEntry.RevertButton.MouseButton1Up:Connect(cancelRevert)
		fileEntry.RevertButton.MouseLeave:Connect(cancelRevert)
	
		connectButtonColors(fileEntry.RevertButton)
	end

	-- Save
	do
		local holdTween: Tween?;
	
		fileEntry.SaveButton.MouseButton1Down:Connect(function()
			if fileEntry.SaveButton.Active and not holdTween then
				local tween = TweenService:Create(fileEntry.SaveButton.TextLabel.UIGradient, BUTTON_TWEEN_INFO, BUTTON_TWEEN_PROPERTIES)
				holdTween = tween
				tween:Play()
				tween.Completed:Connect(function(playbackState: Enum.PlaybackState)
					if playbackState == Enum.PlaybackState.Completed then
						if typeof(object) == "Instance" then
							local data = map.tree[path]
							local success, result = pcall(function()
								if data.Type == "Lua" then
									HttpService:PostAsync(getHost(), ScriptEditorService:GetEditorSource(data.Instance), Enum.HttpContentType.TextPlain, false, {Key = serverKey, Type = "ReverseSync", Path = data.Path})
								elseif data.Type == "Model" then
									HttpService:PostAsync(getHost(), buffer.tostring(SerializationService:SerializeInstancesAsync({object})), Enum.HttpContentType.TextPlain, false, {Key = serverKey, Type = "ReverseSync", Path = data.Path})
								end
							end)
							if success then
								print("[Lync] - Saved file:", data.Path)
							else
								task.spawn(error, `[Lync] - Failed to save file: {data.Path}\n{tostring(result)}`)
								fileEntry.SaveButton.TextLabel.Text = "Failed"
							end
						elseif object == "CollisionGroupData" then
							local currentCollisionGroups = getCurrentCollisionGroups()
							local success, result = pcall(function()
								HttpService:PostAsync(getHost(), HttpService:JSONEncode(currentCollisionGroups), Enum.HttpContentType.ApplicationJson, false, {Key = serverKey, Type = "ReverseSync", Path = map.info.CollisionGroupsFile})
							end)
							if success then
								map.info.CollisionGroups = currentCollisionGroups
								print("[Lync] - Saved collision group data")
							else
								task.spawn(error, `[Lync] - Failed to save collision group data\n{tostring(result)}`)
								fileEntry.SaveButton.TextLabel.Text = "Failed"
							end
						end
					end
				end)
			end
		end)
	
		local function cancelSave()
			if holdTween then
				holdTween:Cancel()
				holdTween = nil
			end
			fileEntry.SaveButton.TextLabel.Text = "Save"
			fileEntry.SaveButton.TextLabel.UIGradient.Offset = Vector2.new(-0.51, 0)
		end
		fileEntry.SaveButton.MouseButton1Up:Connect(cancelSave)
		fileEntry.SaveButton.MouseLeave:Connect(cancelSave)
	
		connectButtonColors(fileEntry.SaveButton)
	end
end

function updateChangedFilesUI(): ()
	-- Destroy hidden or old entries
	for _, fileEntry in unsavedFilesFrame:GetChildren() do
		if fileEntry:IsA("Frame") then
			if fileEntry:GetAttribute("CollisionGroupData") then
				if not changedCollisionGroupData then
					fileEntry:Destroy()
				end
			elseif not changedFiles[fileEntry.Instance.Value] then
				fileEntry:Destroy()
			end
		end
	end

	-- Make new entries
	for object, changed in changedFiles do
		if not changed then continue end

		-- Skip if entry already created
		local alreadyCreated = false
		for _, fileEntry in unsavedFilesFrame:GetChildren() do
			if fileEntry:IsA("Frame") and fileEntry.Instance.Value == object then
				alreadyCreated = true
				break
			end
		end
		if alreadyCreated then
			continue
		end

		for path in map.tree do
			if map.tree[path].Instance == object then
				addChangedFileEntry(object, path)
				break
			end
		end
	end

	if changedCollisionGroupData then
		local alreadyCreated = false
		for _, fileEntry in unsavedFilesFrame:GetChildren() do
			if fileEntry:IsA("Frame") and fileEntry.Special.Value == "CollisionGroupData" then
				alreadyCreated = true
				break
			end
		end
		if not alreadyCreated then
			addChangedFileEntry("CollisionGroupData", "")
		end
	end

	local anyChanged = false
	for object, changed in changedFiles do
		if not changed then continue end
		anyChanged = true
		break
	end
	widgetFrame.TextLabel.Visible = not anyChanged and not changedCollisionGroupData
end

function setConnectTheme(): ()
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

function setTheme(): ()
	-- Main Widget
	do
		widgetFrame.TopBar.Actions.BackgroundColor3 = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBackground)
		widgetFrame.TopBar.Actions.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.InputFieldBorder)
		connect.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
		portTextBox.PlaceholderColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
		portTextBox.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText)
		widgetFrame.TopBar.Title.Version.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
		local portBorderColor = Enum.StudioStyleGuideColor.InputFieldBorder
		widgetFrame.TopBar.Actions:SetAttribute("Border", theme:GetColor(portBorderColor))
		widgetFrame.TopBar.Actions:SetAttribute("BorderHover", theme:GetColor(portBorderColor, Enum.StudioStyleGuideModifier.Hover))
		widgetFrame.TopBar.Actions:SetAttribute("BorderSelected", theme:GetColor(portBorderColor, Enum.StudioStyleGuideModifier.Selected))
		widgetFrame.TopBar.Actions.UIStroke.Color = widgetFrame.TopBar.Actions:GetAttribute("Border")
		setConnectTheme()
	end

	-- Unsaved Files
	do
		widgetFrame.TextLabel.TextColor3 = theme:GetColor(Enum.StudioStyleGuideColor.MainText, Enum.StudioStyleGuideModifier.Disabled)
		local selectBackground = Enum.StudioStyleGuideColor.Item
		script.UnsavedFileListItem.SelectButton:SetAttribute("Background", theme:GetColor(selectBackground))
		script.UnsavedFileListItem.SelectButton:SetAttribute("BackgroundHover", theme:GetColor(selectBackground, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.SelectButton:SetAttribute("BackgroundSelected", theme:GetColor(selectBackground, Enum.StudioStyleGuideModifier.Selected))
		script.UnsavedFileListItem.SelectButton.BackgroundColor3 = script.UnsavedFileListItem.SelectButton:GetAttribute("Background")
		local selectText = Enum.StudioStyleGuideColor.ButtonText
		script.UnsavedFileListItem.SelectButton:SetAttribute("Text", theme:GetColor(selectText))
		script.UnsavedFileListItem.SelectButton:SetAttribute("TextHover", theme:GetColor(selectText, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.SelectButton:SetAttribute("TextSelected", theme:GetColor(selectText, Enum.StudioStyleGuideModifier.Selected))
		script.UnsavedFileListItem.SelectButton.TextLabel.TextColor3 = script.UnsavedFileListItem.SelectButton:GetAttribute("Text")
		local ignoreBackground = Enum.StudioStyleGuideColor.DialogButton
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("Background", theme:GetColor(ignoreBackground))
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("BackgroundHover", theme:GetColor(ignoreBackground, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("BackgroundPressed", theme:GetColor(ignoreBackground, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.IgnoreButton.BackgroundColor3 = script.UnsavedFileListItem.IgnoreButton:GetAttribute("Background")
		local ignoreText = Enum.StudioStyleGuideColor.DialogButtonText
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("Text", theme:GetColor(ignoreText))
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("TextHover", theme:GetColor(ignoreText, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.IgnoreButton:SetAttribute("TextPressed", theme:GetColor(ignoreText, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.IgnoreButton.TextColor3 = script.UnsavedFileListItem.IgnoreButton:GetAttribute("Text")
		script.UnsavedFileListItem.IgnoreButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
		local revertBackground = Enum.StudioStyleGuideColor.DialogButton
		script.UnsavedFileListItem.RevertButton:SetAttribute("Background", theme:GetColor(revertBackground))
		script.UnsavedFileListItem.RevertButton:SetAttribute("BackgroundHover", theme:GetColor(revertBackground, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.RevertButton:SetAttribute("BackgroundPressed", theme:GetColor(revertBackground, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.RevertButton.BackgroundColor3 = script.UnsavedFileListItem.RevertButton:GetAttribute("Background")
		local revertText = Enum.StudioStyleGuideColor.DialogButtonText
		script.UnsavedFileListItem.RevertButton:SetAttribute("Text", theme:GetColor(revertText))
		script.UnsavedFileListItem.RevertButton:SetAttribute("TextHover", theme:GetColor(revertText, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.RevertButton:SetAttribute("TextPressed", theme:GetColor(revertText, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.RevertButton.TextColor3 = script.UnsavedFileListItem.RevertButton:GetAttribute("Text")
		script.UnsavedFileListItem.RevertButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
		local saveBackground = Enum.StudioStyleGuideColor.DialogMainButton
		script.UnsavedFileListItem.SaveButton:SetAttribute("Background", theme:GetColor(saveBackground))
		script.UnsavedFileListItem.SaveButton:SetAttribute("BackgroundHover", theme:GetColor(saveBackground, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.SaveButton:SetAttribute("BackgroundPressed", theme:GetColor(saveBackground, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.SaveButton.BackgroundColor3 = script.UnsavedFileListItem.SaveButton:GetAttribute("Background")
		local saveText = Enum.StudioStyleGuideColor.DialogMainButtonText
		script.UnsavedFileListItem.SaveButton:SetAttribute("Text", theme:GetColor(saveText))
		script.UnsavedFileListItem.SaveButton:SetAttribute("TextHover", theme:GetColor(saveText, Enum.StudioStyleGuideModifier.Hover))
		script.UnsavedFileListItem.SaveButton:SetAttribute("TextPressed", theme:GetColor(saveText, Enum.StudioStyleGuideModifier.Pressed))
		script.UnsavedFileListItem.SaveButton.TextColor3 = script.UnsavedFileListItem.SaveButton:GetAttribute("Text")
		script.UnsavedFileListItem.SaveButton.UIStroke.Color = theme:GetColor(Enum.StudioStyleGuideColor.DialogButtonBorder)
	end

	for _, fileEntry in unsavedFilesFrame:GetChildren() do
		if fileEntry:IsA("Frame") then
			fileEntry:Destroy()
		end
	end
	updateChangedFilesUI()
end

function terminate(errorMessage: string): ()
	connecting = false
	if connected then
		task.spawn(error, "[Lync] - " .. errorMessage, 0)
	else
		error("[Lync] - Terminated: " .. errorMessage, 0)
	end
end

function lpcall(context: string, warning: boolean, func: any, ...): (boolean, any)
	local args = {...}
	return xpcall(function()
		return func(unpack(args))
	end, function(err: string): ()
		if not warning then
			task.spawn(error, "[Lync] - " .. context .. ": " .. err)
		else
			warn("[Lync] - " .. context .. ": " .. err)
		end
	end)
end

function deserialize(path: string, data: string): {Instance}?
	local success, result = lpcall(`Deserialize "{path}"`, false, SerializationService.DeserializeInstancesAsync, SerializationService, buffer.fromstring(data))
	return if success then result else nil
end

function makeDirty(object: Instance, property: string): ()
	if changedFiles[object] == false and object.Parent and not table.find(SUPPRESSED_PROPERTIES, property) then
		if map.info.Debug then print("[Lync] - Modified synced object:", object, property) end
		changedFiles[object] = true
		updateChangedFilesUI()
	end
end

function trim6(s: string): string
	return (if s:match('^()%s*$') then '' else s:match('^%s*(.*%S)')) :: string
end

function setCollisionGroups(): ()
	for collisionGroup, canCollideWith in map.info.CollisionGroups do
		if not PhysicsService:IsCollisionGroupRegistered(collisionGroup) then
			PhysicsService:RegisterCollisionGroup(collisionGroup)
		end
		for otherCollisionGroup, canCollide in canCollideWith do
			if not PhysicsService:IsCollisionGroupRegistered(otherCollisionGroup) then
				PhysicsService:RegisterCollisionGroup(otherCollisionGroup)
			end
			PhysicsService:CollisionGroupSetCollidable(collisionGroup, otherCollisionGroup, canCollide)
		end
	end
end

function validateLuaProperty(lua: string): boolean
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

function eval(value: any): any
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

function setDetails(target: any, data: any): ()
	if data.Context then
		lpcall("Set Context " .. data.Context, false, function()
			if data.Context == "Legacy" then
				target.RunContext = Enum.RunContext.Legacy
			elseif data.Context == "Client" then
				target.RunContext = Enum.RunContext.Client
			elseif data.Context == "Server" then
				target.RunContext = Enum.RunContext.Server
			end
		end)
	end
	if data.Properties then
		local warning = if target.Parent == game or table.find(SUPPRESSED_CLASSES, target.ClassName) then true else false
		for property, value in data.Properties do
			lpcall("Set Property", warning, function()
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
			lpcall("Set Attribute", false, function()
				target:SetAttribute(attribute, value)
			end)
		end
	end
	if data.Tags then
		for _, tag in data.Tags do
			lpcall("Set Tag", false, function()
				CollectionService:AddTag(target, tag)
			end)
		end
	end
end

function buildJsonModel(target: any, data: any): ()
	data.Properties = data.properties
	data.Attributes = data.attributes
	data.Tags = data.tags
	if data.children then
		for _, childData in data.children do
			local newInstance = Instance.new(childData.className or "Folder")
			if childData.name then
				newInstance.Name = childData.name
			end
			buildJsonModel(newInstance, childData)
			setDetails(newInstance, childData)
			newInstance.Parent = target
		end
	end
end

function finishBuild(target: any, data: any): ()
	data.Instance = target
	setDetails(target, data)

	if changedFiles[target] == nil then
		local mapType = data.Type

		-- Modification events
		if mapType == "Lua" then
			(target :: LuaSourceContainer):GetPropertyChangedSignal("Source"):Connect(function(): ()
				if updatingSource[target] then
					updatingSource[target] = nil
				else
					makeDirty(target, "Source")
				end
			end)

		elseif mapType == "Model" then
			target.Changed:Connect(function(property: string): ()
				if property ~= "Parent" then
					makeDirty(target, property)
				end
			end)
			target.AttributeChanged:Connect(function(attribute: string): ()
				makeDirty(target, "AttributeChanged")
			end)
			target.DescendantAdded:Connect(function(descendant: Instance): ()
				makeDirty(target, "DescendantAdded")
				descendant.Changed:Connect(function(property: string)
					makeDirty(target, property)
				end)
				descendant.AttributeChanged:Connect(function(attribute: string): ()
					makeDirty(target, "AttributeChanged")
				end)
			end)
			for _, descendant in target:GetDescendants() do
				descendant.Changed:Connect(function(property: string): ()
					makeDirty(target, property)
				end)
				descendant.AttributeChanged:Connect(function(attribute: string): ()
					makeDirty(target, "AttributeChanged")
				end)
			end
		end

		-- Clear on destruction
		target.Destroying:Connect(function()
			changedFiles[target] = nil
			updateChangedFilesUI()
		end)

		changedFiles[target] = false
	end
end

function buildPath(path: string): ()
	local data = map.tree[path]
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
					or data.Type == "Lua" and nextTarget.ClassName ~= (if data.Context == "ModuleScript" then "ModuleScript" elseif data.Context == "LocalScript" then "LocalScript" else "Script")
				then
					if not pcall(function()
						nextTarget.Parent = nil
						createInstance = true
						if data.Type == "Model" and changedFiles[nextTarget] then
							changedFiles[nextTarget] = false
							updateChangedFilesUI()
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
			terminate(`Path "{subpath}" not found in {target:GetFullName()}`)
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
			finishBuild(target, data)

		elseif data.Type == "Lua" then
			if createInstance then
				local newInstance = Instance.new(if data.Context == "ModuleScript" then "ModuleScript" elseif data.Context == "LocalScript" then "LocalScript" else "Script")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					setScriptSourceLive(target, result)
					finishBuild(target, data)
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		elseif data.Type == "Model" then
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					local objects = deserialize(data.Path, result)
					if objects then
						if #objects == 1 then
							objects[1].Name = name
							objects[1].Parent = target
							target = objects[1]
							finishBuild(target, data)
						else
							terminate(`"{data.Path}" cannot contain zero or multiple root Instances`)
						end
					end
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		elseif data.Type == "JSON" or data.Type == "YAML" or data.Type == "TOML" or data.Type == "Excel" then
			if createInstance then
				local newInstance = Instance.new("ModuleScript")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					setScriptSourceLive(target, result)
					finishBuild(target, data)
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		elseif data.Type == "JsonModel" then
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					local json = HttpService:JSONDecode(result)
					if createInstance then
						local newInstance = Instance.new(json.className or "Folder")
						newInstance.Name = name
						newInstance.Parent = target
						target = newInstance
					else
						target:ClearAllChildren()
					end
					buildJsonModel(target, json)
					finishBuild(target, data)
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		elseif data.Type == "PlainText" then
			if createInstance then
				local newInstance = Instance.new("StringValue")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					target.Value = result
					finishBuild(target, data)
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		elseif data.Type == "Localization" then
			if createInstance then
				local newInstance = Instance.new("LocalizationTable")
				newInstance.Name = name
				newInstance.Parent = target
				target = newInstance
			end
			task.spawn(function(): ()
				activeSourceRequests += 1
				local success, result = pcall(function()
					return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.Path, DataType = data.Type})
				end)
				activeSourceRequests -= 1
				if success then
					lpcall("Set Entries", false, function()
						target:SetEntries(HttpService:JSONDecode(result))
						finishBuild(target, data)
					end)
				else
					terminate(`The server did not return a source for "{data.Path}"`)
				end
			end)

		else
			finishBuild(target, data)
		end

		if data.TerrainRegion then
			if target == workspace.Terrain then
				task.spawn(function(): ()
					activeSourceRequests += 1
					local success, result = pcall(function()
						return HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Source", Path = data.TerrainRegion[1], DataType = data.Type})
					end)
					activeSourceRequests -= 1
					if success then
						local objects = deserialize(data.TerrainRegion[1], result)
						if objects then
							if #objects == 1 then
								lpcall("Set Terrain Region", false, function()
									workspace.Terrain:Clear()
									workspace.Terrain:PasteRegion(objects[1] :: TerrainRegion, eval(data.TerrainRegion[2]), data.TerrainRegion[3])
								end)
							else
								terminate(`"{data.TerrainRegion[1]}" cannot contain zero or multiple root Instances`)
							end
						end
					else
						terminate(`The server did not return a source for "{data.TerrainRegion[1]}"`)
					end
				end)
			else
				terminate("Cannot use $terrainRegion property with " .. tostring(target))
			end
		end

		if data.TerrainMaterialColors then
			if target == workspace.Terrain then
				for material, value in data.TerrainMaterialColors do
					lpcall("Set Terrain Material Color", false, function()
						workspace.Terrain:SetMaterialColor((Enum.Material :: any)[material], eval(value))
					end)
				end
			else
				terminate("Cannot use $terrainMaterialColors property with " .. tostring(target))
			end
		end
	end
end

function buildAll()
	-- Assign collision groups
	if map.info.CollisionGroups then
		setCollisionGroups()
	end

	-- Build place file
	local sortedPaths = {}
	for path in map.tree do
		table.insert(sortedPaths, path)
	end
	table.sort(sortedPaths)
	for _, path in sortedPaths do
		buildPath(path)
	end
end

function setConnected(newConnected: boolean)
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
					return HttpService:JSONDecode(HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Map", Playtest = IS_PLAYTEST_SERVER}))
				end)
				if success then
					if result.info.Version == VERSION then
						map = result
						if not IS_PLAYTEST_SERVER then
							if result.info.Debug then warn("[Lync] - Map:", result) end
							task.spawn(buildAll)
							repeat task.wait() until activeSourceRequests == 0
						end
					else
						task.spawn(error, `[Lync] - Version mismatch ({result.info.Version} ~= {VERSION}). Please restart Studio`)
						newConnected = false
					end
				else
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			else
				local success, result = pcall(function()
					HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Resume"})
				end)
				if not success then
					task.spawn(error, "[Lync] - " .. result)
					newConnected = false
				end
			end
		end

		connecting = false
		connected = newConnected
		workspace:SetAttribute("__lync_active", if newConnected then true else nil)
		portTextBox.TextEditable = not connected
		connect.Text = if connected then "Pause" elseif map then "Resume" else "Sync"
		setConnectTheme()

		if newConnected then
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
	do
		connect.Activated:Connect(function()
			setConnected(not connected)
		end)

		connectButtonColors(connect)
	end

	-- Port
	do
		portTextBox.MouseEnter:Connect(function()
			if not portTextBox.Active or portTextBox:IsFocused() then return end
			widgetFrame.TopBar.Actions.UIStroke.Color = widgetFrame.TopBar.Actions:GetAttribute("BorderHover")
		end)

		portTextBox.MouseLeave:Connect(function()
			if portTextBox:IsFocused() then return end
			widgetFrame.TopBar.Actions.UIStroke.Color = widgetFrame.TopBar.Actions:GetAttribute("Border")
		end)

		portTextBox.Focused:Connect(function()
			if not portTextBox.Active then return end
			widgetFrame.TopBar.Actions.UIStroke.Color = widgetFrame.TopBar.Actions:GetAttribute("BorderSelected")
		end)

		portTextBox.FocusLost:Connect(function(_enterPressed)
			local entry = math.clamp(tonumber(portTextBox.Text) or 0, 0, 65535)
			portTextBox.Text = entry > 0 and entry or ""
			widgetFrame.TopBar.Actions.UIStroke.Color = widgetFrame.TopBar.Actions:GetAttribute("Border")
			plugin:SetSetting("Lync_Port", entry > 0 and entry or nil)
		end)
	end

	-- Playtest Sync
	do
		local toggleSyncDuringTest = toolbar:CreateButton("Playtest Sync", "Apply changes to files during solo playtests", "rbxassetid://13771245795") :: PluginToolbarButton
		toggleSyncDuringTest.ClickableWhenViewportHidden = true
		toggleSyncDuringTest:SetActive(syncDuringTest)

		toggleSyncDuringTest.Click:Connect(function()
			syncDuringTest = not syncDuringTest
			plugin:SetSetting("Lync_SyncDuringTest", syncDuringTest)
			toggleSyncDuringTest:SetActive(syncDuringTest)
		end)
	end

	-- Save Terrain
	do
		local saveTerrain = toolbar:CreateButton("Save Terrain", "Save a copy of this place's Terrain as a TerrainRegion", "rbxassetid://13771218804") :: PluginToolbarButton
		saveTerrain.ClickableWhenViewportHidden = true

		saveTerrain.Click:Connect(function()
			local terrainRegion = workspace.Terrain:CopyRegion(workspace.Terrain.MaxExtents)
			terrainRegion.Parent = workspace
			Selection:Set({terrainRegion})
			plugin:PromptSaveSelection(terrainRegion.Name)
			terrainRegion:Destroy()
			--[[local terrainRegion = workspace.Terrain:CopyRegion(workspace.Terrain.MaxExtents)
			for path, data in map.tree do
				if data.TerrainRegion then
					HttpService:PostAsync(getHost(), buffer.tostring(SerializationService:SerializeInstancesAsync({terrainRegion})), Enum.HttpContentType.TextPlain, false, {Key = serverKey, Type = "ReverseSync", Path = data.Path})
					break
				end
			end]]
		end)
	end

	-- Selection Changed
	
	Selection.SelectionChanged:Connect(function()
		local selection = Selection:Get()
		for _, fileEntry in unsavedFilesFrame:GetChildren() do
			if fileEntry:IsA("Frame") then
				fileEntry:SetAttribute("Selected", table.find(selection, fileEntry.Instance.Value))
			end
		end
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

if not IS_PLAYTEST_SERVER and workspace:GetAttribute("__lync_active") then
	workspace:SetAttribute("__lync_active", nil)
end

if workspace:GetAttribute("__lync_port") and (not IS_PLAYTEST_SERVER or syncDuringTest  and workspace:GetAttribute("__lync_active")) then
	if syncDuringTest and IS_PLAYTEST_SERVER then warn("[Lync] - Playtest Sync is active.") end
	if workspace:GetAttribute("__lync_port") then
		assert(type(workspace:GetAttribute("__lync_port")) == "number", `Attribute "workspace.__lync_port" must be a number`)
		portTextBox.Text = ""
		portTextBox.PlaceholderText = workspace:GetAttribute("__lync_port")
		portTextBox.TextEditable = false
		portTextBox.Active = false
	end
	setConnected(true)
end

RunService.Heartbeat:Connect(function(_dt: number)
	if connected and map.info.CollisionGroups then
		local currentCollisionGroups = getCurrentCollisionGroups()

		local dirty = false
		for collisionGroupName in currentCollisionGroups do
			if map.info.CollisionGroups[collisionGroupName] == nil then
				dirty = true
				break
			end
		end
		if not dirty then
			for collisionGroupName in map.info.CollisionGroups do
				if currentCollisionGroups[collisionGroupName] == nil then
					dirty = true
					break
				end
			end
		end
		if not dirty then
			for collisionGroupName, collisionGroupData in map.info.CollisionGroups do
				if dirty then break end
				for otherCollisionGroupName in collisionGroupData do
					if
						not not (currentCollisionGroups[collisionGroupName][otherCollisionGroupName] or currentCollisionGroups[otherCollisionGroupName][collisionGroupName])
						~= not not (map.info.CollisionGroups[collisionGroupName][otherCollisionGroupName] or map.info.CollisionGroups[otherCollisionGroupName][collisionGroupName])
					then
						dirty = true
						break
					end
				end
			end
		end

		if changedCollisionGroupData ~= dirty then
			changedCollisionGroupData = dirty
			updateChangedFilesUI()
		end
	end
end)

while task.wait(0.5) do
	if connected then
		local success, result = pcall(function()
			local get = HttpService:GetAsync(getHost(), false, {Key = serverKey, Type = "Modified", Playtest = IS_PLAYTEST_SERVER})
			return get ~= "{}" and HttpService:JSONDecode(get) or nil
		end)
		if success then
			if result then
				if map.info.Debug then warn("[Lync] - Modified:", result) end
				for key, value in result do
					map.tree[key] = value or nil
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
