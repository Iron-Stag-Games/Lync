/*
	Lync Server - Alpha 12
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

if (process.platform != 'win32' && process.platform != 'darwin') process.exit()

const VERSION = 'Alpha 12'
const CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json')))
const ARGS = process.argv.slice(2)
const PROJECT_JSON = ARGS[0]
const PORT = ARGS[1]
const DEBUG = ARGS[2] == 'DEBUG' || ARGS[3] == 'DEBUG'
const DUMP_MAP = ARGS[2] == 'DUMP_MAP' || ARGS[3] == 'DUMP_MAP'
const SYNC_ONLY = ARGS[2] == 'SYNC_ONLY' || ARGS[3] == 'SYNC_ONLY'

var map = {}
var mTimes = {}
var modified = {}
var projectJson
var hardLinkPaths = []


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

function removeEmpty(obj) {
	const newObj = {}
	Object.keys(obj).forEach((key) => {
		if (obj[key] === Object(obj[key])) newObj[key] = removeEmpty(obj[key])
		else if (obj[key] !== undefined) newObj[key] = obj[key]
	})
	return newObj
}

function localPathExtensionIsMappable(localPath) {
	const localPathParsed = path.parse(localPath)
	return localPathParsed.ext == '.rbxm' || localPathParsed.ext == '.rbxmx' || localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau' || localPathParsed.ext == '.json' || localPathParsed.ext == '.txt' || localPathParsed.ext == '.csv'
}

function localPathIsInit(localPath) {
	const localPathParsed = path.parse(localPath)
	return (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau') && (localPathParsed.name == 'init' || localPathParsed.name == 'init.client' || localPathParsed.name == 'init.server' || localPathParsed.name.endsWith('.init') || localPathParsed.name.endsWith('.init.client') || localPathParsed.name.endsWith('.init.server'))
}

function jsonParse(fileRead, localPath) {
	try {
		return JSON.parse(fileRead)
	} catch (e) {
		console.error(red('Project error:'), cyan(localPath), yellow(e))
		return {}
	}
}

function assignMap(robloxPath, mapDetails, mtimeMs) {
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
	if (mapDetails.Path) mTimes[mapDetails.Path] = mtimeMs
	if (mapDetails.Meta) mTimes[mapDetails.Meta] = fs.statSync(mapDetails.Meta).mtimeMs // Meta File stats are never retrieved before this, so they aren't in a function parameter
}

function mapLua(localPath, robloxPath, properties, attributes, tags, metaLocalPath, initPath, mtimeMs) {
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
				let newRobloxPath = robloxPathParsed.dir + '/' + ((localPathParsed.name.endsWith('.client') || localPathParsed.name.endsWith('.server')) && localPathParsed.name.slice(0, -7) || localPathParsed.name)
				if (flag == 'Json') newRobloxPath = robloxPath
				mapLua(localPath, newRobloxPath, properties, attributes, tags, metaLocalPath, undefined, localPathStats.mtimeMs)

			// JSON (non-meta)
			} else if (localPathParsed.ext == '.json' && !localPathParsed.name.endsWith('.meta')) {

				// Model Files
				if (localPathParsed.name.endsWith('.model')) {
					assignMap(robloxPath.slice(0, -6), {
						'Type': 'JsonModel',
						'Path': localPath
					}, localPathStats.mtimeMs)

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
	} catch (e) {}
}

async function getAsync(url, responseType) {
	return new Promise ((resolve, reject) => {
		const req = https.get(url, {
			headers: { 'user-agent': 'node.js' }
		}, (res) => {
			let data = []
			res.on("data", (chunk) => {
				data.push(chunk)
			})
			res.on("end", () => {
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

(async function () {

	// Check for updates

	if (CONFIG.AutoUpdate) {
		console.log('Checking for updates . . .')
		const versionFile = path.resolve(__dirname, 'version')
		const configFile = path.resolve(__dirname, 'config.json')
		let currentId = 0
		try {
			currentId = fs.readFileSync(versionFile)
		} catch (e) {}
		try {
			// Grab latest version info
			const latest = await getAsync('https://api.github.com/repos/Iron-Stag-Games/Lync/releases/latest', 'json')
			if (latest.id != currentId) {
				const updateFile = path.resolve(__dirname, 'update.zip')
				const extractedFolder = path.resolve(__dirname, 'Lync-' + latest.tag_name)
				const updateFolder = path.resolve(extractedFolder, 'Lync')

				// Download latest version
				console.log(`Updating to ${latest.name} . . .`)
				const update = await getAsync(`https://github.com/Iron-Stag-Games/Lync/archive/refs/tags/${latest.tag_name}.zip`)
				fs.writeFileSync(updateFile, update, 'binary')
				await extract(updateFile, { dir: __dirname })

				// Write new version
				fs.writeFileSync(versionFile, latest.id.toString())

				// Delete old files
				fs.readdirSync(__dirname).forEach((dirNext) => {
					const next = path.resolve(__dirname, dirNext)
					if (next != versionFile && next != configFile && next != extractedFolder) {
						fs.rmSync(next, { force: true, recursive: true })
					}
				})

				// Move new files
				fs.readdirSync(updateFolder).forEach((dirNext) => {
					const next = path.resolve(updateFolder, dirNext)
					if (next != configFile) {
						fs.renameSync(next, path.resolve(__dirname, dirNext))
					}
				})

				// Cleanup
				fs.rmdirSync(extractedFolder, { force: true, recursive: true })

				// Restart Lync
				console.clear()
				spawnSync(process.argv.shift(), process.argv, {
					cwd: process.cwd(),
					detached: false,
					stdio: 'inherit'
				})
				process.exit()
			}
		} catch (e) {}
		console.clear()
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
	
	if (DUMP_MAP) {
		map = removeEmpty(map)
		console.log()
		console.log(map)
		//console.log(mTimes)
		process.exit()
	}
	
	// Copy plugin
	
	const pluginsPath = path.resolve(process.platform == 'win32' && CONFIG.RobloxPluginsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || process.platform == 'darwin' && CONFIG.RobloxPluginsPath_MacOS.replace('$HOME', process.env.HOME))
	if (!fs.existsSync(pluginsPath)) {
		if (DEBUG) console.log('Creating folder', cyan(pluginsPath))
		fs.mkdirSync(pluginsPath)
	}
	if (DEBUG) console.log('Copying', cyan(path.resolve(__dirname, 'Plugin.rbxm')), '->', cyan(path.resolve(pluginsPath, 'Lync.rbxm')))
	fs.copyFileSync(path.resolve(__dirname, 'Plugin.rbxm'), path.resolve(pluginsPath, 'Lync.rbxm'))
	if (DEBUG) console.log('Copying', cyan(projectJson.base), '->', cyan(projectJson.build))
	fs.copyFileSync(projectJson.base, projectJson.build)
	
	// Open Studio
	
	if (!SYNC_ONLY) {
		if (DEBUG) console.log('Opening', cyan(projectJson.build))
		spawn((process.platform == 'darwin' && 'open -n ' || '') + `"${projectJson.build}"`, [], { stdio: 'ignore', detached: true, shell: true, windowsHide: true })
	}
	
	// Sync file changes
	
	fs.watch(path.resolve(), { recursive: true }, function(event, localPath) {
		if (localPath) {
			localPath = path.relative(path.resolve(), localPath)
			if (path.resolve(localPath) != path.resolve(PROJECT_JSON)) {
				localPath = localPath.replace(/\\/g, '/')
				const parentPathString = path.relative(path.resolve(), path.resolve(localPath, '..')).replace(/\\/g, '/')
				let localPathStats; try { localPathStats = fs.statSync(localPath, { throwIfNoEntry: false }) } catch (e) { return }
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
								if (DEBUG) console.log('Deleted ProjectJson mapping', green(key))
							}
						}
						delete mTimes[localPath]
	
					// Changed
					} else if (localPathStats.isFile() && mTimes[localPath] != localPathStats.mtimeMs) {
						console.log('M', cyan(localPath))
						for (const key in map) {
							if (map[key].Meta == localPath || map[key].InitParent == parentPathString) {
								mapDirectory(parentPathString, key, 'Modified')
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
			}
		}
	})
	
	// Start server
	
	http.createServer(function(req, res) {
		let jsonString, read;
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
					} catch (e) {}
					hardLinkRecursive(hardLinkPath, path.resolve())
				}
	
				// Send map
				map.Version = VERSION
				map.Debug = DEBUG
				jsonString = JSON.stringify(map)
				delete map['SaveToFile']
				modified = {}
				res.writeHead(200)
				res.end(jsonString)
				break
			case 'Modified':
				jsonString = JSON.stringify(modified)
				modified = {}
				res.writeHead(200)
				res.end(jsonString)
				break
			case 'Source':
				try {
					read = fs.readFileSync(req.headers.path)
					res.writeHead(200)
					res.end(read)
				} catch (e) {
					console.error(red(e))
					res.writeHead(404)
					res.end()
				}
				break
			default:
				if ('type' in req.headers) {
					console.error(red('Unknown type header from Client; must be Map, Modified, or Source'))
					res.writeHead(400)
					res.end('Unknown type header')
				} else {
					console.error(red('Missing type header from Client; must be Map, Modified, or Source'))
					res.writeHead(400)
					res.end('Missing type header')
				}
		}
	})
	.on('error', function(e) {
		console.error(red(e))
	})
	.listen(PORT, function() {
		console.log(`\nSyncing ${green(projectJson.name)} on port ${yellow(PORT)}\n`)
	})	
})()
