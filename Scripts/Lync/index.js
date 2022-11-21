/*
	Lync Server
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

const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')
const process = require('process')

if (process.platform != 'win32' && process.platform != 'darwin') process.exit()

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
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json')))


const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

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
	let newObj = {}
	Object.keys(obj).forEach((key) => {
		if (obj[key] === Object(obj[key])) newObj[key] = removeEmpty(obj[key])
		else if (obj[key] !== undefined) newObj[key] = obj[key]
	})
	return newObj
}

function filePathExtensionIsMappable(localPath) {
	let localPathParsed = path.parse(localPath)
	return localPathParsed.ext == '.rbxm' || localPathParsed.ext == '.rbxmx' || localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau' || localPathParsed.ext == '.json' || localPathParsed.ext == '.txt' || localPathParsed.ext == '.csv'
}

function localPathIsInit(localPath) {
	let localPathParsed = path.parse(localPath)
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
	let context = (localPath.endsWith('.client.lua') || localPath.endsWith('.client.luau')) && 'Client' || (localPath.endsWith('.server.lua') || localPath.endsWith('.server.luau')) && 'Server' || 'Module'
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
	let localPathStats = fs.statSync(localPath)
	if (localPathStats.isFile()) {
		let robloxPathParsed = path.parse(robloxPath)
		if (flag != 'Modified') robloxPath = robloxPathParsed.dir + '/' + robloxPathParsed.name
		if (filePathExtensionIsMappable(localPath)) {
			mTimes[localPath] = localPathStats.mtimeMs
			let localPathParsed = path.parse(localPath)
			let properties;
			let attributes;
			let tags;
			let metaLocalPath;

			// Lua Meta Files
			if (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau' || localPathParsed.ext == '.txt' || localPathParsed.ext == '.csv') {
				let title = (localPathParsed.ext == '.lua' || localPathParsed.ext == '.luau') && (localPathParsed.name.endsWith('.client') || localPathParsed.name.endsWith('.server')) && localPathParsed.name.slice(0, -7) || localPathParsed.name
				let metaLocalPathCheck = localPath.slice(0, localPath.lastIndexOf('/')) + '/' + title + '.meta.json'
				if (fs.existsSync(metaLocalPathCheck)) {
					let metaJson = jsonParse(fs.readFileSync(metaLocalPathCheck), metaLocalPathCheck)
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
				let robloxPathParsed = path.parse(robloxPath)
				mapLua(localPath, robloxPathParsed.dir + '/' + ((localPathParsed.name.endsWith('.client') || localPathParsed.name.endsWith('.server')) && localPathParsed.name.slice(0, -7) || localPathParsed.name), properties, attributes, tags, metaLocalPath, undefined, localPathStats.mtimeMs)

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
			let subProjectJsonPath = localPath + '/default.project.json'
			let subProjectJson = jsonParse(fs.readFileSync(subProjectJsonPath), subProjectJsonPath)
			let subProjectJsonStats = fs.statSync(localPath + '/default.project.json')
			mapJsonRecursive(subProjectJsonPath, subProjectJson, robloxPath, 'tree', true, localPath + '/', subProjectJsonStats.mtimeMs)

		} else {

			mTimes[localPath] = localPathStats.mtimeMs
			let localPathParentName = localPath.split('/').pop()
			let className = 'Folder'
			let properties;
			let attributes;
			let tags;
			let metaLocalPath;

			// Init Meta Files
			let metaLocalPathCheck = localPath + '/init.meta.json'
			if (fs.existsSync(metaLocalPathCheck)) {
				let metaJson = jsonParse(fs.readFileSync(metaLocalPathCheck), metaLocalPathCheck)
				className = metaJson['className'] || 'Folder'
				properties = metaJson['properties']
				attributes = metaJson['attributes']
				tags = metaJson['tags']
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
			} else if (robloxPath.slice(0, robloxPath.lastIndexOf('/')) != 'tree') {
				assignMap(robloxPath, {
					'Type': 'Instance',
					'ClassName': className,
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'Path': localPath,
					'Meta': metaLocalPath
				}, localPathStats.mtimeMs)
			}

			fs.readdirSync(localPath).forEach((dirNext) => {
				if (dirNext != localPathParentName + '.init.lua' && dirNext != localPathParentName + '.init.client.lua' && dirNext != localPathParentName + '.init.server.lua' && dirNext != localPathParentName + '.init.luau' && dirNext != localPathParentName + '.init.client.luau' && dirNext != localPathParentName + '.init.server.luau'
				&& dirNext != 'init.lua' && dirNext != 'init.client.lua' && dirNext != 'init.server.lua' && dirNext != 'init.luau' && dirNext != 'init.client.luau' && dirNext != 'init.server.luau'
				&& dirNext != 'init.meta.json') {
					let filePathNext = localPath + '/' + dirNext
					mapDirectory(filePathNext, robloxPath + '/' + dirNext)
				}
			})
		}
	}
}

function mapJsonRecursive(jsonPath, target, robloxPath, key, loadingThirdpartyProject, thirdpartyProjectAppend, mtimeMs) {
	let nextRobloxPath = robloxPath + '/' + key
	if (loadingThirdpartyProject) nextRobloxPath = robloxPath
	let localPath = target[key]['$path']
	if (localPath) localPath = thirdpartyProjectAppend + localPath
	assignMap(nextRobloxPath, {
		'Type': 'Instance',
		'ClassName': robloxPath == 'tree' && key || target[key]['$className'] || 'Folder',
		'Properties': target[key]['$properties'],
		'Attributes': target[key]['$attributes'],
		'Tags': target[key]['$tags'],
		'Path': localPath,
		'ProjectJson': jsonPath,
		'TerrainRegion': target[key]['$terrainRegion'],
		'TerrainMaterialColors': target[key]['$terrainMaterialColors']
	}, mtimeMs)
	for (let nextKey in target[key]) {
		if (nextKey[0] != '$' && typeof target[key][nextKey] != 'string' && !Array.isArray(target[key][nextKey])) {
			mapJsonRecursive(jsonPath, target[key], nextRobloxPath, nextKey, false, thirdpartyProjectAppend, mtimeMs)
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
	let projectJsonStats = fs.statSync(PROJECT_JSON)
	for (let service in projectJson.tree) {
		mapJsonRecursive(PROJECT_JSON, projectJson.tree, 'tree', service, false, '', projectJsonStats.mtimeMs)
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

if (DUMP_MAP) {
	map = removeEmpty(map)
	console.log()
	console.log(map)
	//console.log(mTimes)
	process.exit()
}

// Create content symlinks

if (process.platform == 'win32') {
	const versionsPath = path.resolve(config.RobloxVersionsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA))
	fs.readdirSync(versionsPath).forEach((dirNext) => {
		const stats = fs.statSync(path.resolve(versionsPath, dirNext))
		if (stats.isDirectory() && fs.existsSync(path.resolve(versionsPath, dirNext, 'RobloxStudioBeta.exe'))) {
			const symlinkPath = path.resolve(versionsPath, dirNext, 'content/symlink')
			if (fs.existsSync(symlinkPath)) {
				fs.unlinkSync(symlinkPath)
				if (DEBUG) console.log('Removed symlink', cyan(symlinkPath))
			}
			fs.symlink(path.resolve(), symlinkPath, 'junction', (e) => {
				if (e) {
					console.error(red(e))
					process.exit()
				}
			})
			if (DEBUG) console.log('Created symlink', cyan(symlinkPath))
		}
	})
	// Studio Mod Manager
	const modManagerContentPath = path.resolve(config.StudioModManagerContentPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA))
	if (fs.existsSync(modManagerContentPath)) {
		const symlinkPath = path.resolve(modManagerContentPath, 'symlink')
		if (fs.existsSync(symlinkPath)) {
			fs.unlinkSync(symlinkPath)
			if (DEBUG) console.log('Removed symlink', cyan(symlinkPath))
		}
		fs.symlink(path.resolve(), symlinkPath, 'junction', (e) => {
			if (e) {
				console.error(red(e))
				process.exit()
			}
		})
		if (DEBUG) console.log('Created symlink', cyan(symlinkPath))
	}
} else if (process.platform == 'darwin') {
	const contentPath = path.resolve(config.RobloxContentPath_MacOS)
	const symlinkPath = path.resolve(contentPath, 'symlink')
	if (fs.existsSync(symlinkPath)) {
		fs.unlinkSync(symlinkPath)
		if (DEBUG) console.log('Removed symlink', cyan(symlinkPath))
	}
	fs.symlink(path.resolve(), symlinkPath, 'junction', (e) => {
		if (e) {
			console.error(red(e))
			process.exit()
		}
	})
	if (DEBUG) console.log('Created symlink', cyan(symlinkPath))
}

// Copy plugin

let pluginsPath = path.resolve(process.platform == 'win32' && config.RobloxPluginsPath_Windows.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || process.platform == 'darwin' && config.RobloxPluginsPath_MacOS.replace('%HOME%', process.env.HOME))
if (!fs.existsSync(pluginsPath)) {
	fs.mkdirSync(pluginsPath)
	if (DEBUG) console.log('Created folder', cyan(pluginsPath))
}
fs.copyFileSync(path.resolve(__dirname, 'Plugin.rbxm'), path.resolve(pluginsPath, 'Lync.rbxm'))
if (DEBUG) console.log('Copied', cyan(path.resolve(__dirname, 'Plugin.rbxm')), '->', cyan(path.resolve(pluginsPath, 'Lync.rbxm')))
fs.copyFileSync(projectJson.base, projectJson.build)
if (DEBUG) console.log('Copied', cyan(projectJson.base), '->', cyan(projectJson.build))

// Open Studio

if (!SYNC_ONLY) {
	if (DEBUG) console.log('Opening', cyan(projectJson.build))
	spawn((process.platform == 'darwin' && 'open -n ' || '') + `"${projectJson.build}"`, [], { shell: true, windowsHide: true })
}

// Sync file changes

fs.watch(path.resolve(), { recursive: true }, async (event, localPath) => {
	if (localPath) {
		await delay(100) // existsSync is inaccurate when using git if no delay is used
		if (path.resolve(localPath) != path.resolve(PROJECT_JSON)) {
			localPath = localPath.replace(/\\/g, '/')
			let parentPathString = path.relative(path.resolve(), path.resolve(localPath, '..')).replace(/\\/g, '/')
			let localPathStats;
			if (fs.existsSync(localPath)) localPathStats = fs.statSync(localPath)
			if (localPath in mTimes) {

				// Deleted
				if (!fs.existsSync(localPath)) {
					console.log('D', cyan(localPath))
					for (let key in map) {

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
					for (let key in map) {
						if (map[key].Meta == localPath || map[key].InitParent == parentPathString) {
							mapDirectory(parentPathString, key, 'Modified')
						} else if (map[key].Path == localPath) {
							mapDirectory(localPath, key, 'Modified')
						}
					}
					mTimes[localPath] = localPathStats.mtimeMs
				}

			} else if (event == 'rename' && fs.existsSync(localPath)) {

				// Added
				if (parentPathString in mTimes) {
					console.log('A', cyan(localPath))
					for (let key in map) {
						if (map[key].Path == parentPathString || map[key].InitParent == parentPathString) {
							let localPathParsed = path.parse(localPath)

							// Remap adjacent matching file
							if (localPathParsed.name != 'init.meta'  && localPathParsed.name.endsWith('.meta') && localPathParsed.ext == '.json') {
								let title = localPathParsed.name.slice(0, -5)
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
