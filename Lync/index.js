/*
	Lync Server - Alpha 19
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
*/

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const process = require('process')
const extract = require('extract-zip')
const { http, https } = require('follow-redirects')
const minimatch = require('minimatch')

if (process.platform != 'win32' && process.platform != 'darwin') process.exit()

const VERSION = 'Alpha 19'
const CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json')))
const ARGS = process.argv.slice(2)
const PROJECT_JSON = ARGS[0]
const DEBUG = ARGS[2] == 'DEBUG' || ARGS[3] == 'DEBUG'

// Sync args
const PORT = ARGS[1]
const SYNC_ONLY = ARGS[2] == 'SYNC_ONLY' || ARGS[3] == 'SYNC_ONLY'

// Offline build args
const OFFLINE = ARGS[1] == 'OFFLINE'

var securityKey = null
var map = {}
var mTimes = {}
var modified = {}
var modified_playtest = {}
var projectJson
var hardLinkPaths = []


// Output Functions

function red(s) {
	return '\x1b[31m' + s + '\x1b[0m'
}

function yellow(s) {
	return '\x1b[33m' + s + '\x1b[0m'
}

function green(s) {
	return '\x1b[32m\'' + s + '\'\x1b[0m'
}

function cyan(s) {
	if (process.platform == 'win32') {
		return '\x1b[36m[' + s.replace(/\//g, '\\') + ']\x1b[0m'
	} else if (process.platform == 'darwin') {
		return '\x1b[36m[' + s.replace(/\\/g, '/') + ']\x1b[0m'
	}
}


// Mapping Functions

function toEscapeSequence(str) {
	let escapeSequence = ''
	let i = str.length
	while (i--)
		escapeSequence = '\\' + str.charCodeAt(i) + escapeSequence
	return escapeSequence
}

function localPathExtensionIsMappable(localPath) {
	const localPathParsed = path.parse(localPath)
	return localPathParsed.ext == '.rbxm' || localPathParsed.ext == '.rbxmx' || localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau' || localPathParsed.ext == '.json' || localPathParsed.ext == '.txt' || localPathParsed.ext == '.csv'
}

function localPathIsInit(localPath) {
	const localPathParsed = path.parse(localPath)
	return (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau') && (localPathParsed.name == 'init' || localPathParsed.name == 'init.client' || localPathParsed.name == 'init.server' || localPathParsed.name.endsWith('.init') || localPathParsed.name.endsWith('.init.client') || localPathParsed.name.endsWith('.init.server'))
}

function localPathIsIgnored(localPath) {
	if (localPath != undefined && ('globIgnorePaths' in projectJson))
		for (const index in projectJson.globIgnorePaths)
			if (minimatch(localPath, projectJson.globIgnorePaths[index]))
				return true
	return false
}

function jsonParse(fileRead, localPath) {
	try {
		return JSON.parse(fileRead)
	} catch (err) {
		console.error(red('Project error:'), cyan(localPath), yellow(err))
		return {}
	}
}

function assignMap(robloxPath, mapDetails, mtimeMs) {
	if (localPathIsIgnored(mapDetails.Path)) return
	if (DEBUG) console.log('Mapping', mapDetails.Type, green(robloxPath), '->', cyan(mapDetails.Path || ''))
	if (robloxPath in map) {
		if (map[robloxPath].Path != mapDetails.Path && !map[robloxPath].ProjectJson) {
			console.warn(yellow(`Collision on '${robloxPath}'`))
			console.warn(map[robloxPath], '->', mapDetails)
		}
		if (map[robloxPath].ProjectJson) {
			mapDetails.ProjectJson = map[robloxPath].ProjectJson
		}
	}
	map[robloxPath] = mapDetails
	modified[robloxPath] = mapDetails
	modified_playtest[robloxPath] = mapDetails
	if (mapDetails.Path) mTimes[mapDetails.Path] = mtimeMs
	if (mapDetails.Meta) mTimes[mapDetails.Meta] = fs.statSync(mapDetails.Meta).mtimeMs // Meta File stats are never retrieved before this, so they aren't in a function parameter
}

function mapLua(localPath, robloxPath, properties, attributes, tags, metaLocalPath, initPath, mtimeMs) {
	if (localPathIsIgnored(localPath)) return
	const context = (localPath.endsWith('.client.lua') || localPath.endsWith('.client.luau')) && 'Client' || (localPath.endsWith('.server.lua') || localPath.endsWith('.server.luau')) && 'Server' || 'Module'
	assignMap(robloxPath, {
		'Type': 'Lua',
		'Context': context,
		'Properties': properties,
		'Attributes': attributes,
		'Tags': tags,
		'Path': localPath,
		'Meta': metaLocalPath,
		'InitParent': initPath
	}, mtimeMs)
}

function mapDirectory(localPath, robloxPath, flag) {
	if (localPathIsIgnored(localPath)) return
	const localPathStats = fs.statSync(localPath)
	if (localPathStats.isFile()) {
		const robloxPathParsed = path.parse(robloxPath)
		if (flag != 'Modified') robloxPath = robloxPathParsed.dir + '/' + robloxPathParsed.name
		if (localPathExtensionIsMappable(localPath)) {
			mTimes[localPath] = localPathStats.mtimeMs
			const localPathParsed = path.parse(localPath)
			let properties;
			let attributes;
			let tags;
			let metaLocalPath;

			// Lua Meta Files
			if (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau' || localPathParsed.ext == '.txt' || localPathParsed.ext == '.csv') {
				const title = (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau') && (localPathParsed.name.endsWith('.client') || localPathParsed.name.endsWith('.server')) && localPathParsed.name.slice(0, -7) || localPathParsed.name
				const metaLocalPathCheck = localPath.slice(0, localPath.lastIndexOf('/')) + '/' + title + '.meta.json'
				if (fs.existsSync(metaLocalPathCheck)) {
					const metaJson = jsonParse(fs.readFileSync(metaLocalPathCheck), metaLocalPathCheck)
					properties = metaJson['properties']
					attributes = metaJson['attributes']
					tags = metaJson['tags']
					metaLocalPath = metaLocalPathCheck
				}
			}

			// Models
			if (localPathParsed.ext == '.rbxm' || localPathParsed.ext == '.rbxmx') {
				assignMap(robloxPath, {
					'Type': 'Model',
					'Path': localPath,
					'Meta': metaLocalPath
				}, localPathStats.mtimeMs)

			// Lua
			} else if (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau') {
				let newRobloxPath = robloxPath
				if (flag != 'Json' && flag != 'Modified') newRobloxPath = robloxPathParsed.dir + '/' + ((localPathParsed.name.endsWith('.client') || localPathParsed.name.endsWith('.server')) && localPathParsed.name.slice(0, -7) || localPathParsed.name)
				mapLua(localPath, newRobloxPath, properties, attributes, tags, metaLocalPath, undefined, localPathStats.mtimeMs)

			// JSON (non-meta)
			} else if (localPathParsed.ext == '.json' && !localPathParsed.name.endsWith('.meta')) {

				// Model Files
				if (localPathParsed.name.endsWith('.model')) {
					assignMap(flag != 'Modified' && robloxPath.slice(0, -6) || robloxPath, {
						'Type': 'JsonModel',
						'Path': localPath
					}, localPathStats.mtimeMs)

				// Project Files
				} else if (localPathParsed.name.endsWith('.project')) {
					mTimes[localPath] = localPathStats.mtimeMs
					const subProjectJson = jsonParse(fs.readFileSync(localPath), localPath)
					const parentPathString = path.relative(path.resolve(), path.resolve(localPath, '..')).replace(/\\/g, '/')
					const externalPackageAppend = parentPathString != '' && parentPathString + '/' || ''
					mapJsonRecursive(localPath, subProjectJson, robloxPath, 'tree', true, externalPackageAppend, localPathStats.mtimeMs)

				// Modules
				} else {
					assignMap(robloxPath, {
						'Type': 'Json',
						'Path': localPath
					}, localPathStats.mtimeMs)
				}

			// Plain Text
			} else if (localPathParsed.ext == '.txt') {
				assignMap(robloxPath, {
					'Type': 'PlainText',
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'Path': localPath
				}, localPathStats.mtimeMs)

			// Localization Tables
			} else if (localPathParsed.ext == '.csv') {
				assignMap(robloxPath, {
					'Type': 'Localization',
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'Path': localPath
				}, localPathStats.mtimeMs)
			}
		} else if (flag == 'Json') {
			console.error(red('Project error:'), yellow(`File [${localPath}] is not a mappable file type`))
		}
	} else if (localPathStats.isDirectory()) {
		if (fs.existsSync(localPath + '/default.project.json')) {

			// Projects
			mTimes[localPath] = localPathStats.mtimeMs
			const subProjectJsonPath = localPath + '/default.project.json'
			const subProjectJson = jsonParse(fs.readFileSync(subProjectJsonPath), subProjectJsonPath)
			const subProjectJsonStats = fs.statSync(localPath + '/default.project.json')
			mapJsonRecursive(subProjectJsonPath, subProjectJson, robloxPath, 'tree', true, localPath + '/', subProjectJsonStats.mtimeMs)

		} else {

			mTimes[localPath] = localPathStats.mtimeMs
			const localPathParentName = localPath.split('/').pop()
			let className = 'Folder'
			let properties;
			let attributes;
			let tags;
			let clearOnSync;
			let metaLocalPath;

			// Init Meta Files
			const metaLocalPathCheck = localPath + '/init.meta.json'
			if (fs.existsSync(metaLocalPathCheck)) {
				const metaJson = jsonParse(fs.readFileSync(metaLocalPathCheck), metaLocalPathCheck)
				className = metaJson['className'] || 'Folder'
				properties = metaJson['properties']
				attributes = metaJson['attributes']
				tags = metaJson['tags']
				clearOnSync = metaJson['clearOnSync']
				metaLocalPath = metaLocalPathCheck
			}

			// Lync-Style Init Lua
			if (fs.existsSync(localPath + '/' + localPathParentName + '.init.lua')) {
				mapLua(localPath + '/' + localPathParentName + '.init.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.client.lua')) {
				mapLua(localPath + '/' + localPathParentName + '.init.client.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.server.lua')) {
				mapLua(localPath + '/' + localPathParentName + '.init.server.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.luau')) {
				mapLua(localPath + '/' + localPathParentName + '.init.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.client.luau')) {
				mapLua(localPath + '/' + localPathParentName + '.init.client.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.server.luau')) {
				mapLua(localPath + '/' + localPathParentName + '.init.server.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)

			// Rojo-Style Init Lua
			} else if (fs.existsSync(localPath + '/init.lua')) {
				mapLua(localPath + '/init.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.client.lua')) {
				mapLua(localPath + '/init.client.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.server.lua')) {
				mapLua(localPath + '/init.server.lua', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.luau')) {
				mapLua(localPath + '/init.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.client.luau')) {
				mapLua(localPath + '/init.client.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.server.luau')) {
				mapLua(localPath + '/init.server.luau', robloxPath, properties, attributes, tags, undefined, localPath, localPathStats.mtimeMs)

			// Folders
			} else if (flag != 'Json') {
				assignMap(robloxPath, {
					'Type': 'Instance',
					'ClassName': className,
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'ClearOnSync': clearOnSync,
					'Path': localPath,
					'Meta': metaLocalPath
				}, localPathStats.mtimeMs)
			}

			fs.readdirSync(localPath).forEach((dirNext) => {
				if (dirNext != localPathParentName + '.init.lua' && dirNext != localPathParentName + '.init.client.lua' && dirNext != localPathParentName + '.init.server.lua' && dirNext != localPathParentName + '.init.luau' && dirNext != localPathParentName + '.init.client.luau' && dirNext != localPathParentName + '.init.server.luau'
				&& dirNext != 'init.lua' && dirNext != 'init.client.lua' && dirNext != 'init.server.lua' && dirNext != 'init.luau' && dirNext != 'init.client.luau' && dirNext != 'init.server.luau'
				&& dirNext != 'init.meta.json') {
					const filePathNext = localPath + '/' + dirNext
					mapDirectory(filePathNext, robloxPath + '/' + dirNext)
				}
			})
		}
	}
}

function mapJsonRecursive(jsonPath, target, robloxPath, key, firstLoadingExternalPackage, externalPackageAppend, mtimeMs) {
	let nextRobloxPath = robloxPath + '/' + key
	if (firstLoadingExternalPackage) nextRobloxPath = robloxPath
	let localPath = target[key]['$path']
	if (externalPackageAppend && localPath) localPath = externalPackageAppend + localPath
	assignMap(nextRobloxPath, {
		'Type': 'Instance',
		'ClassName': robloxPath == 'tree' && key || target[key]['$className'] || 'Folder',
		'Properties': target[key]['$properties'],
		'Attributes': target[key]['$attributes'],
		'Tags': target[key]['$tags'],
		'Path': localPath,
		'ClearOnSync': target[key]['$clearOnSync'],
		'ProjectJson': jsonPath,
		'TerrainRegion': target[key]['$terrainRegion'],
		'TerrainMaterialColors': target[key]['$terrainMaterialColors']
	}, mtimeMs)
	for (const nextKey in target[key]) {
		if (nextKey[0] != '$' && typeof target[key][nextKey] != 'string' && !Array.isArray(target[key][nextKey])) {
			mapJsonRecursive(jsonPath, target[key], nextRobloxPath, nextKey, false, externalPackageAppend, mtimeMs)
		}
	}
	if (localPath) {
		if (fs.existsSync(localPath)) {
			mapDirectory(localPath, nextRobloxPath, 'Json')
		} else {
			console.error(red('Project error:'), yellow(`Path [${localPath}] does not exist`))
		}
	}
}

function changedJson() {
	if (DEBUG) console.log('Loading', cyan(PROJECT_JSON))
	projectJson = JSON.parse(fs.readFileSync(PROJECT_JSON))
	if (!fs.existsSync(projectJson.base)) {
		console.error(red('Project error:'), yellow(`Base [${projectJson.base}] does not exist`))
		process.exit()
	}
	if (DEBUG) console.log('Mapping', green(projectJson.name))
	map = {}
	const projectJsonStats = fs.statSync(PROJECT_JSON)
	for (const service in projectJson.tree) {
		if (service == '$className') continue // Fix for Roblox LSP source map
		mapJsonRecursive(PROJECT_JSON, projectJson.tree, 'tree', service, false, undefined, projectJsonStats.mtimeMs)
	}
}


// Sync Functions

function hardLinkRecursive(hardLinkPath, localPath) {
	try {
		const stats = fs.statSync(localPath)
		const target = path.resolve(hardLinkPath, path.relative(path.resolve(), localPath))
		if (stats.isDirectory()) {
			if (!fs.existsSync(target)) {
				fs.mkdirSync(target)
			}
			fs.readdirSync(localPath).forEach((dirNext) => {
				hardLinkRecursive(hardLinkPath, path.resolve(localPath, dirNext))
			})
		} else {
			if (fs.existsSync(target)) {
				fs.unlinkSync(target)
			}
			fs.linkSync(localPath, target)
		}
	} catch (err) {}
}

async function getAsync(url, responseType) {
	return new Promise ((resolve, reject) => {
		const req = https.get(url, {
			headers: { 'user-agent': 'node.js' }
		}, (res) => {
			let data = []
			res.on('data', (chunk) => {
				data.push(chunk)
			})
			res.on('end', () => {
				try {
					let buffer = Buffer.concat(data)
					switch (responseType) {
						case 'json':
							resolve(JSON.parse(buffer.toString()))
							break
						default:
							resolve(buffer)
					}
				} catch (err) {
					reject(err)
				}
			})
		})
		req.on('error', (err) => {
			reject(err)
		})
		req.end()
	})
}


// Sourcemap Functions

function generateSourcemap() {
	if (CONFIG.GenerateSourcemap) {
		try {
			const sourcemapJsonPath = path.resolve(PROJECT_JSON, '../sourcemap.json')
			let sourcemapJson = {
				'name': projectJson.name,
				'className': 'DataModel',
				'filePaths': [ PROJECT_JSON ],
				'children': []
			}

			for (const key in map) {
				let target = sourcemapJson
				let paths = key.split('/')
				paths.shift()

				for (const path of paths) {
					// Map under existing child
					let hasChild = false
					for (const child of target.children) {
						if (child.name == path) {
							target = child
							hasChild = true
							break
						}
					}

					// Add new child
					if (!hasChild) {
						target = target.children[target.children.push({
							'name': path,
							'className': 'Folder',
							'filePaths': [],
							'children': []
						}) - 1]
					}
				}

				// Write map info

				const mapping = map[key]

				if (mapping.Type == 'Instance')
					target.className = key == 'tree/Workspace/Terrain' && 'Terrain' || mapping.ClassName
				else if (mapping.Type == 'Lua')
					target.className = mapping.Context == 'Client' && 'LocalScript' || mapping.Context == 'Server' && 'Script' || 'ModuleScript'
				else if (mapping.Type == 'Model')
					target.className = 'Instance'
				else if (mapping.Type == 'Json')
					target.className = 'ModuleScript'
				else if (mapping.Type == 'JsonModel')
					target.className = JSON.parse(fs.readFileSync(mapping.Path)).ClassName || 'Instance'
				else if (mapping.Type == 'PlainText')
					target.className = 'StringValue'
				else if (mapping.Type == 'Localization')
					target.className = 'LocalizationTable'

				if (mapping.Path)
					target.filePaths.push(mapping.Path)
				if (mapping.ProjectJson)
					target.filePaths.push(mapping.ProjectJson)
			}

			// Write Sourcemap JSON
			fs.writeFileSync(sourcemapJsonPath, JSON.stringify(sourcemapJson, null, '\t'))
		} catch (err) {
			console.error(red('Sourcemap error:'), yellow(err))
		}
	}
}


// Main

(async function () {

	// Check for updates

	if (CONFIG.AutoUpdate) {
		console.log('Checking for updates . . .')
		const versionFile = path.resolve(__dirname, 'version')
		const configFile = path.resolve(__dirname, 'config.json')
		let currentId = 0
		try {
			currentId = fs.readFileSync(versionFile)
		} catch (err) {}
		try {
			// Grab latest version info
			let latest = await getAsync(`https://api.github.com/repos/${CONFIG.GithubUpdateRepo}/releases${!CONFIG.GithubUpdatePrereleases && '/latest' || ''}`, 'json')
			if (CONFIG.GithubUpdatePrereleases) latest = latest[0]
			if (latest.id != currentId) {
				const updateFile = path.resolve(__dirname, 'update.zip')
				const extractedFolder = path.resolve(__dirname, 'Lync-' + latest.tag_name)
				const updateFolder = path.resolve(extractedFolder, 'Lync')

				// Download latest version
				console.log(`Updating to ${latest.name} . . .`)
				const update = await getAsync(`https://github.com/${CONFIG.GithubUpdateRepo}/archive/refs/tags/${latest.tag_name}.zip`)
				fs.writeFileSync(updateFile, update, 'binary')
				await extract(updateFile, { dir: __dirname })

				// Write new version
				fs.writeFileSync(versionFile, latest.id.toString())

				// Delete old files
				fs.readdirSync(__dirname).forEach((dirNext) => {
					const next = path.resolve(__dirname, dirNext)
					if (next != versionFile && next != extractedFolder) {
						fs.rmSync(next, { force: true, recursive: true })
					}
				})

				// Move new files
				fs.readdirSync(updateFolder).forEach((dirNext) => {
					const oldPath = path.resolve(updateFolder, dirNext)
					const newPath = path.resolve(__dirname, dirNext)
					if (newPath == configFile) {
						const newConfig = JSON.parse(fs.readFileSync(oldPath))
						for (const key in CONFIG)
							newConfig[key] = CONFIG[key]
						fs.writeFileSync(oldPath, JSON.stringify(newConfig, null, '\t'))
					}
					fs.renameSync(oldPath, newPath)
				})

				// Cleanup
				fs.rmdirSync(extractedFolder, { force: true, recursive: true })
				fs.rmSync(updateFile, { force: true })

				// Restart Lync
				console.clear()
				spawnSync(process.argv.shift(), process.argv, {
					cwd: process.cwd(),
					detached: false,
					stdio: 'inherit'
				})
				process.exit()
			}
			console.clear()
		} catch (err) {
			console.clear()
			console.error(red('Failed to update:'), err)
			console.log()
		}
	}

	// Begin
	
	console.log('Path:', cyan(path.resolve()))
	console.log('Args:', ARGS)
	
	http.globalAgent.maxSockets = 65535
	
	// Check project file exists
	
	if (!fs.existsSync(PROJECT_JSON)) {
		console.error(red('Project error:'), yellow(`Project [${PROJECT_JSON}] does not exist`))
		process.exit()
	}
	
	// Map project
	
	changedJson()
	generateSourcemap()

	// Build

	if (OFFLINE) {
		const buildScriptPath = projectJson.build + '.luau'

		// Map loadstring calls (needed until Lune implements loadstring)
		let loadstringMapEntries = {}
		let loadstringMap = ''
		for (const key in map) {
			let mapping = map[key]
			if ('Properties' in mapping) {
				for (const property in mapping.Properties) {
					let value = mapping.Properties[property]
					if (Array.isArray(value) && !(value in loadstringMapEntries)) {
						loadstringMap += `\t[ "${toEscapeSequence('return ' + value)}" ] = ${value};\n`
						loadstringMapEntries[value] = true
					}
				}
			}
		}

		// Fetch script functions
		let pluginSource = fs.readFileSync(path.resolve(__dirname, 'RobloxPluginSource/Plugin.lua'), { encoding: 'utf8' })
		pluginSource = pluginSource.substring(pluginSource.indexOf('--offline-start') + 15, pluginSource.indexOf('--offline-end'))

		// Write validation script
		if (DEBUG) console.log('Writing validation script . . .')
		let validationScript = fs.readFileSync(path.resolve(__dirname, 'luneBuildTemplate.luau'))
		validationScript += `${pluginSource}\n`
		validationScript += `for _, lua in {\n`
		for (const entry in loadstringMapEntries) {
			validationScript += `\t"${toEscapeSequence(entry)}";\n`
		}
		validationScript += '} do\n\tlocal HttpService;\n\tif not validateLuaProperty(lua) then\n\t\terror(`Security - Lua string [ {lua} ] failed validation`)\n\tend\nend\n'
		if (fs.existsSync(buildScriptPath))
			fs.rmSync(buildScriptPath)
		fs.writeFileSync(buildScriptPath, validationScript)

		// Validate loadstrings
		if (DEBUG) console.log('Validating loadstrings . . .')
		if (spawnSync(`${CONFIG.LunePath}`, [ `${buildScriptPath}` ], {
			cwd: process.cwd(),
			detached: false,
			stdio: 'inherit'
		}).status != 0) {
			process.exit()
		}

		// Write build script
		if (DEBUG) console.log('Writing build script . . .')
		let buildScript = fs.readFileSync(path.resolve(__dirname, 'luneBuildTemplate.luau'))
		buildScript += `local game = roblox.deserializePlace(fs.readFile("${projectJson.base}"))\n`
		buildScript += 'local workspace = game:GetService("Workspace")\n'
		buildScript += `${pluginSource}\n`
		buildScript += `map = net.jsonDecode("${toEscapeSequence(JSON.stringify(map, null, '\t'))}")\n`
		buildScript += `loadstringMap = {\n${loadstringMap}}\n`
		buildScript += `buildAll()\n`
		buildScript += `fs.writeFile("${projectJson.build}", roblox.serializePlace(game))\n`
		if (fs.existsSync(buildScriptPath))
			fs.rmSync(buildScriptPath)
		fs.writeFileSync(buildScriptPath, buildScript)

		// Build RBXL
		if (DEBUG) console.log('Building RBXL . . .')
		if (spawnSync(`${CONFIG.LunePath}`, [ `${buildScriptPath}` ], {
			cwd: process.cwd(),
			detached: false,
			stdio: 'inherit'
		}).status != 0) {
			process.exit()
		}
		console.log('Build saved to', cyan(projectJson.build))

		// Open Studio (temporary)
		/*spawn((process.platform == 'darwin' && 'open -n ' || '') + `"${projectJson.build}"`, [], {
			stdio: 'ignore',
			detached: true,
			shell: true,
			windowsHide: true
		})*/

		// Cleanup
		fs.rmSync(buildScriptPath)
		process.exit()
	} else {
		if (DEBUG) console.log('Copying', cyan(projectJson.base), '->', cyan(projectJson.build))
		fs.copyFileSync(projectJson.base, projectJson.build)
	}

	// Copy plugin

	const pluginsPath = path.resolve(process.platform == 'win32' && CONFIG.RobloxPluginsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || process.platform == 'darwin' && CONFIG.RobloxPluginsPath_MacOS.replace('$HOME', process.env.HOME))
	if (!fs.existsSync(pluginsPath)) {
		if (DEBUG) console.log('Creating folder', cyan(pluginsPath))
		fs.mkdirSync(pluginsPath)
	}
	if (DEBUG) console.log('Copying', cyan(path.resolve(__dirname, 'Plugin.rbxm')), '->', cyan(path.resolve(pluginsPath, 'Lync.rbxm')))
	fs.copyFileSync(path.resolve(__dirname, 'Plugin.rbxm'), path.resolve(pluginsPath, 'Lync.rbxm'))

	// Open Studio

	if (!SYNC_ONLY) {
		if (DEBUG) console.log('Opening', cyan(projectJson.build))
		spawn((process.platform == 'darwin' && 'open -n ' || '') + `"${projectJson.build}"`, [], {
			stdio: 'ignore',
			detached: true,
			shell: true,
			windowsHide: true
		})
	}

	// Sync file changes

	fs.watch(path.resolve(), { recursive: true }, function(event, localPath) {
		if (localPath) {
			localPath = path.relative(path.resolve(), localPath)
			if (path.resolve(localPath) != path.resolve(PROJECT_JSON) && !localPathIsIgnored(localPath)) {
				localPath = localPath.replace(/\\/g, '/')
				const parentPathString = path.relative(path.resolve(), path.resolve(localPath, '..')).replace(/\\/g, '/')
				let localPathStats; try { localPathStats = fs.statSync(localPath, { throwIfNoEntry: false }) } catch (err) { return }
				if (localPath in mTimes) {

					// Deleted
					if (!localPathStats) {
						console.log('D', cyan(localPath))
						for (const key in map) {

							// Direct
							if (map[key].Path && (map[key].Path == localPath || map[key].Path.startsWith(localPath + '/'))) {
								if (!map[key].ProjectJson) {
									delete mTimes[map[key].Path]
									delete map[key]
									if (DEBUG) console.log('Deleted Path mapping', green(key))
								} else {
									if (DEBUG) console.log('Cannot delete Path mapping', cyan(map[key].Path), green(key))
								}
								modified[key] = false
								modified_playtest[key] = false
								if (localPathIsInit(localPath) && fs.existsSync(parentPathString)) {
									mapDirectory(parentPathString, key, 'Modified')
								}
							}

							// Meta
							if (key in map && map[key].Meta && (map[key].Meta == localPath || map[key].Meta.startsWith(localPath + '/'))) {
								if (!map[key].ProjectJson) {
									delete mTimes[map[key].Meta]
									delete map[key]
									if (DEBUG) console.log('Deleted Meta mapping', green(key))
								} else {
									if (DEBUG) console.log('Cannot delete Meta mapping', cyan(map[key].Meta), green(key))
								}
								modified[key] = false
								modified_playtest[key] = false
								if (fs.existsSync(parentPathString)) {
									mapDirectory(parentPathString, key, 'Modified')
								}
							}

							// Json member
							if (key in map && map[key].ProjectJson == localPath) {
								if (map[key].Path in mTimes) {
									delete mTimes[map[key].Path]
								}
								if (map[key].Meta in mTimes) {
									delete mTimes[map[key].Meta]
								}
								delete map[key]
								modified[key] = false
								modified_playtest[key] = false
								if (DEBUG) console.log('Deleted ProjectJson mapping', green(key))
							}
						}
						delete mTimes[localPath]

					// Changed
					} else if (localPathStats.isFile() && mTimes[localPath] != localPathStats.mtimeMs) {
						for (const hardLinkPath of hardLinkPaths) {
							hardLinkRecursive(hardLinkPath, localPath)
						}
						console.log('M', cyan(localPath))
						for (const key in map) {
							if (map[key].InitParent == parentPathString) {
								mapDirectory(parentPathString, key, 'Modified')
							} else if (map[key].Meta == localPath) {
								mapDirectory(map[key].Path, key, 'Modified')
							} else if (map[key].Path == localPath) {
								mapDirectory(localPath, key, 'Modified')
							}
						}
						mTimes[localPath] = localPathStats.mtimeMs
					}

				} else if (event == 'rename' && localPathStats) {

					// Added
					for (const hardLinkPath of hardLinkPaths) {
						hardLinkRecursive(hardLinkPath, localPath)
					}
					if (parentPathString in mTimes && (!localPathStats.isFile() || localPathExtensionIsMappable(localPath))) {
						console.log('A', cyan(localPath))
						for (const key in map) {
							if (map[key].Path == parentPathString || map[key].InitParent == parentPathString) {
								const localPathParsed = path.parse(localPath)

								// Remap adjacent matching file
								if (localPathParsed.name != 'init.meta'  && localPathParsed.name.endsWith('.meta') && localPathParsed.ext == '.json') {
									const title = localPathParsed.name.slice(0, -5)
									if (fs.existsSync(localPathParsed.dir + '/' + title + '.lua')) {
										delete map[key]
										mapDirectory(localPath, title + '.lua')
									} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.client.lua')) {
										delete map[key]
										mapDirectory(localPath, title + '.client.lua')
									} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.server.lua')) {
										delete map[key]
										mapDirectory(localPath, title + '.server.lua')
									} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.luau')) {
										delete map[key]
										mapDirectory(localPath, title + '.luau')
									} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.client.luau')) {
										delete map[key]
										mapDirectory(localPath, title + '.client.luau')
									} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.server.luau')) {
										delete map[key]
										mapDirectory(localPath, title + '.server.luau')
									} else {
										console.error(red('Project error:'), yellow(`Stray meta file [${localPath}]`))
										return
									}

								// Remap parent folder
								} else if (localPathIsInit(localPath) || localPathParsed.base == 'init.meta.json' || localPathParsed.base == 'default.project.json') {
									delete map[key]
									mapDirectory(parentPathString, key)

								// Map only file
								} else if (localPathStats.isFile()) {
									mapDirectory(localPath, key + '/' + localPathParsed.name)

								// Map only directory
								} else {
									mapDirectory(localPath, key + '/' + localPathParsed.base)
								}
							}
						}
						if (!mTimes[localPath]) console.error(red('Lync bug:'), yellow('Failed to add'), cyan(localPath))
					}
				}

				generateSourcemap()
			}
		}
	})

	// Start server

	http.createServer(function(req, res) {
		if (req.socket.remoteAddress != '::1' && req.socket.remoteAddress != '127.0.0.1' & req.socket.remoteAddress != '::ffff:127.0.0.1') {
			res.writeHead(403)
			res.end(`Network traffic must originate from the local host. (IP = ${req.socket.remoteAddress})`)
			return
		}
		if (!securityKey) {
			const pluginSettings = path.resolve(
				process.platform == 'win32' && CONFIG.RobloxPluginsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || process.platform == 'darwin' && CONFIG.RobloxPluginsPath_MacOS.replace('$HOME', process.env.HOME),
				`../${req.headers.userid}/InstalledPlugins/0/settings.json`
			)
			securityKey = JSON.parse(fs.readFileSync(pluginSettings)).Lync_ServerKey
			if (DEBUG) console.log('Client connected.')
		}
		if (req.headers.key != securityKey) {
			const errText = `Security key mismatch. The current session will now be terminated. (Key = ${req.headers.key})\nPlease check for any malicious plugins or scripts and try again.`
			console.error(red('Server error:'), yellow(errText))
			res.writeHead(403)
			res.end(errText)
			process.exit()
		}
		let jsonString;
		switch(req.headers.type) {
			case 'Map':
				// Create content hard links
				hardLinkPaths = []
				if (process.platform == 'win32') {
					const versionsPath = path.resolve(CONFIG.RobloxVersionsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA))
					fs.readdirSync(versionsPath).forEach((dirNext) => {
						const stats = fs.statSync(path.resolve(versionsPath, dirNext))
						if (stats.isDirectory() && fs.existsSync(path.resolve(versionsPath, dirNext, 'RobloxStudioBeta.exe'))) {
							const hardLinkPath = path.resolve(versionsPath, dirNext, 'content/lync')
							if (!fs.existsSync(hardLinkPath)) {
								fs.mkdirSync(hardLinkPath)
							}
							hardLinkPaths.push(hardLinkPath)
						}
					})
					// Studio Mod Manager
					const modManagerContentPath = path.resolve(CONFIG.StudioModManagerContentPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA))
					if (fs.existsSync(modManagerContentPath)) {
						const hardLinkPath = path.resolve(modManagerContentPath, 'lync')
						if (!fs.existsSync(hardLinkPath)) {
							fs.mkdirSync(hardLinkPath)
						}
						hardLinkPaths.push(hardLinkPath)
					}
				} else if (process.platform == 'darwin') {
					const contentPath = path.resolve(CONFIG.RobloxContentPath_MacOS)
					const hardLinkPath = path.resolve(contentPath, 'lync')
					if (!fs.existsSync(hardLinkPath)) {
						fs.mkdirSync(hardLinkPath)
					}
					hardLinkPaths.push(hardLinkPath)
				}
				for (const hardLinkPath of hardLinkPaths) {
					if (DEBUG) console.log('Creating hard link', cyan(hardLinkPath))
					try {
						fs.rmSync(hardLinkPath, { force: true, recursive: true })
					} catch (err) {}
					hardLinkRecursive(hardLinkPath, path.resolve())
				}

				// Send map
				map.Version = VERSION
				map.Debug = DEBUG
				map.ServePlaceIds = projectJson.servePlaceIds
				jsonString = JSON.stringify(map)
				delete map['Version']
				delete map['Debug']
				delete map['ServePlaceIds']
				if ('playtest' in req.headers) {
					modified_playtest = {}
				} else {
					modified = {}
				}
				res.writeHead(200)
				res.end(jsonString)
				break
			case 'Modified':
				if ('playtest' in req.headers) {
					jsonString = JSON.stringify(modified_playtest)
					modified_playtest = {}
				} else {
					jsonString = JSON.stringify(modified)
					modified = {}
				}
				res.writeHead(200)
				res.end(jsonString)
				break
			case 'Source':
				try {
					let read = fs.readFileSync(req.headers.path)
					res.writeHead(200)
					res.end(read)
				} catch (err) {
					console.error(red('Server error:'), yellow(err))
					res.writeHead(404)
					res.end(err.toString())
				}
				break
			case 'ReverseSync':
				let data = []
				req.on('data', (chunk) => {
					data.push(chunk)
				})
				req.on('end', () => {
					try {
						let buffer = Buffer.concat(data)
						fs.writeFileSync(req.headers.path, buffer.toString())
						res.writeHead(200)
						res.end()
					} catch (err) {
						console.error(red('Server error:'), yellow(err))
						res.writeHead(400)
						res.end(err.toString())
					}
				})
				break
			default:
				res.writeHead(400)
				res.end('Missing / invalid type header')
		}
	})
	.on('error', function(e) {
		console.error(red('Server error:'), yellow(e))
	})
	.listen(PORT, function() {
		console.log(`\nSyncing ${green(projectJson.name)} on port ${yellow(PORT)}\n`)
	})
})()
