/*
	Lync Server
	https://github.com/Iron-Stag-Games/Lync
	Copyright (C) 2024  Iron Stag Games

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
const VERSION = 'Alpha 29'

const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const process = require('process')

const chokidar = require('chokidar')
const { parseCSV } = require('csv-load-sync')
const extractZIP = require('extract-zip')
const { http, https } = require('follow-redirects')
const LUA = require('lua-json')
const picomatch = require('picomatch')
const XLSX = require('xlsx')

const { red, yellow, green, cyan, fileError, jsonError } = require('./output.js')
const { generateSourcemap } = require('./sourcemap/sourcemap.js')
const { validateJson, validateYaml, validateToml } = require('./validator/validator.js')

if (!process.pkg) process.exit()

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const UTF8 = new TextDecoder('utf-8')
const PLATFORM = process.platform == 'win32' && 'windows' || process.platform == 'darwin' && 'macos' || 'linux'
const LYNC_INSTALL_DIR = path.dirname(process.execPath)


// Config

const CONFIG_PATH = path.resolve(LYNC_INSTALL_DIR, 'lync-config.json')
let CONFIG;
try {
	CONFIG = {
		Debug: false,
		GenerateSourcemap: true,
		GithubAccessToken: '',
		AutoUpdate: false,
		AutoUpdate_UsePrereleases: false,
		AutoUpdate_Repo: 'Iron-Stag-Games/Lync',
		AutoUpdate_LatestId: 0,
		Path_RobloxVersions: '',
		Path_RobloxContent: '',
		Path_RobloxPlugins: '',
		Path_StudioModManagerContent: '',
		Path_Lune: 'lune',
		JobCommands: {}
	}
	if (PLATFORM == 'windows') {
		CONFIG.Path_RobloxVersions = '%LOCALAPPDATA%/Roblox/Versions'
		CONFIG.Path_RobloxPlugins = '%LOCALAPPDATA%/Roblox/Plugins'
		CONFIG.Path_StudioModManagerContent = '%LOCALAPPDATA%/Roblox Studio/content'
		delete CONFIG.Path_RobloxContent
	} else if (PLATFORM == 'macos') {
		CONFIG.Path_RobloxContent = '/Applications/RobloxStudio.app/Contents/Resources/content'
		CONFIG.Path_RobloxPlugins = '$HOME/Documents/Roblox/Plugins'
		delete CONFIG.Path_RobloxVersions
		delete CONFIG.Path_StudioModManagerContent
	} else {
		CONFIG.Path_RobloxVersions = ''
		CONFIG.Path_RobloxPlugins = ''
		delete CONFIG.Path_RobloxContent
		delete CONFIG.Path_StudioModManagerContent
	}
	if (fs.existsSync(CONFIG_PATH)) {
		const oldConfig = JSON.parse(fs.readFileSync(CONFIG_PATH))
		for (const key in oldConfig)
			if (key in CONFIG)
				CONFIG[key] = oldConfig[key]
	}
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, '\t'))
} catch (err) {
	console.error(red(err))
	process.exit(-1)
}
const DEBUG = CONFIG.Debug


// Args

/**
 * @param {string?} err
 * @returns {never}
 */
function argHelp(err) {
	if (err) console.error(red('Argument error:'), yellow(err) + '\n')
	console.log(`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ LYNC HELP                  Displays the list of available arguments.              ┃
┃      CONFIG                Opens the config file.                                 ┃
┃      SERVE ${cyan('project.json', true)}?   Syncs the project.                                     ┃
┃      OPEN  ${cyan('project.json', true)}?   Builds, syncs, and opens the project in Roblox Studio. ┃
┃      BUILD ${cyan('project.json', true)}?   Builds the project to file.                            ┃
┃      FETCH ${cyan('project.json', true)}?   Downloads the list of sources in the project file.     ┃
┣╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍┫
┃ ${cyan('project.json', true)}?   The project file to read from and serve.                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ 
`)
	process.exit(err && -1 || 0)
}
const ARGS = process.argv.slice(2)
const MODE = (ARGS[0] || '').toLowerCase()
if (MODE == '' || MODE == 'help') {
	argHelp()
} else if (MODE == 'config' || (MODE == 'serve' || MODE == 'open') && PLATFORM == 'linux' && (CONFIG.Path_RobloxVersions == '' || CONFIG.Path_RobloxPlugins == '')) {
	spawn((PLATFORM == 'macos' && 'open -n ' || '') + `"${CONFIG_PATH}"`, [], {
		stdio: 'ignore',
		detached: true,
		shell: true,
		windowsHide: true
	})
	process.exit(0)
}
if (MODE != 'serve' && MODE != 'open' && MODE != 'build' && MODE != 'fetch') argHelp('Mode must be SERVE, OPEN, BUILD, or FETCH')
if (MODE == 'open' && PLATFORM != 'windows' && PLATFORM != 'macos') argHelp('Cannot use OPEN mode on Linux')
const PROJECT_JSON = ARGS[1] && ARGS[1].replace(/\\/g, '/') || 'default.project.json'

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Globals
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const mTimes = {}
var securityKey = null
var firstMapped = false
var map = { info: {}, tree: {} }
var modified = {}
var modified_playtest = {}
var modified_sourcemap = {}
var projectJson;
var globIgnorePathsPicoMatch;
var hardLinkPaths;

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Common Functions
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * @param {string} localPath
 * @returns {boolean}
 */
function localPathExtensionIsMappable(localPath) {
	const localPathExt = path.parse(localPath).ext.toLowerCase()
	return localPathExt == '.rbxm' || localPathExt == '.rbxmx' || localPathExt == '.lua' || localPathExt == '.luau' || localPathExt == '.json' || localPathExt == '.yaml' || localPathExt == '.toml' || localPathExt == '.txt' || localPathExt == '.csv'
}

/**
 * @param {string} localPath
 * @returns {boolean}
 */
function localPathIsInit(localPath) {
	const localPathParsed = path.parse(localPath)
	const localPathName = localPathParsed.name.toLowerCase()
	const localPathExt = localPathParsed.ext.toLowerCase()
	return (localPathExt == '.lua' || localPathExt == '.luau') && (localPathName == 'init' || localPathName.endsWith('.init'))
}

/**
 * @param {string} localPath
 * @returns {boolean}
 */
function localPathIsIgnored(localPath) {
	localPath = path.relative(process.cwd(), localPath)
	return globIgnorePathsPicoMatch(localPath.replace(/\\/g, '/'))
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Sync Functions
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * @param {string} sourcePath
 * @param {string} hardLinkRootPath
 */
function hardLinkRecursive(sourcePath, hardLinkRootPath) {
	if (localPathIsIgnored(sourcePath)) return
	const hardLinkPath = path.resolve(hardLinkRootPath, path.parse(process.cwd()).name, PROJECT_JSON, path.relative(process.cwd(), sourcePath))
	if (process.cwd() == sourcePath) {
		try {
			fs.rmSync(hardLinkPath, { force: true, recursive: true })
		} catch (err) {
			console.error(red('Hard link error:'), yellow(err))
		}
	}
	const stats = fs.statSync(sourcePath)
	const parentPath = path.resolve(hardLinkPath, '..')
	try {
		if (!fs.existsSync(parentPath)) {
			fs.mkdirSync(parentPath, { recursive: true })
		}
		if (stats.isDirectory()) {
			if (!fs.existsSync(hardLinkPath)) {
				fs.mkdirSync(hardLinkPath)
			}
			fs.readdirSync(sourcePath).forEach((dirNext) => {
				hardLinkRecursive(path.resolve(sourcePath, dirNext), hardLinkRootPath)
			})
		} else {
			if (fs.existsSync(hardLinkPath)) {
				fs.unlinkSync(hardLinkPath)
			}
			fs.linkSync(sourcePath, hardLinkPath)
		}
	} catch (err) {
		console.error(red('Hard link error:'), yellow(err))
	}
}

/**
 * @param {string} url
 * @param {OutgoingHttpHeaders} headers
 * @param {string} responseType
 * @returns {Promise}
 */
async function getAsync(url, headers, responseType) {
	const newHeaders = { 'user-agent': 'node.js' }
	for (const header in headers) {
		newHeaders[header] = headers[header]
	}
	return new Promise ((resolve, reject) => {
		const req = https.get(url, {
			headers: newHeaders
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

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Mapping Functions
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * @param {string} robloxPath
 * @param {Object} mapDetails
 * @param {number} mtimeMs
 */
function assignMap(robloxPath, mapDetails, mtimeMs) {
	let localPath = mapDetails.Path
	if (localPath != undefined) {
		if (typeof localPath == 'object') {
			if ('optional' in localPath) {
				mapDetails.Path = localPath.optional
				localPath = mapDetails.Path
			} else if ('package' in localPath) {
				mapDetails.Path = localPath.package
				localPath = mapDetails.Path
			}
		}
		if (localPathIsIgnored(localPath)) return
	}
	if (DEBUG) console.log('Mapping', mapDetails.Type, green(robloxPath), '->', cyan(localPath || ''))
	if (robloxPath in map.tree) {
		if (map.tree[robloxPath].Path != localPath && !map.tree[robloxPath].ProjectJson) {
			console.error(yellow(`Collision on '${robloxPath}'`))
			if (DEBUG) console.error(map.tree[robloxPath], '->', mapDetails)
		}
		if (map.tree[robloxPath].ProjectJson) {
			mapDetails.ProjectJson = map.tree[robloxPath].ProjectJson
		}
	}
	map.tree[robloxPath] = mapDetails
	modified[robloxPath] = mapDetails
	modified_playtest[robloxPath] = mapDetails
	modified_sourcemap[robloxPath] = mapDetails
	if (localPath) mTimes[localPath] = mtimeMs
	if (mapDetails.Meta) mTimes[mapDetails.Meta] = fs.statSync(mapDetails.Meta).mtimeMs // Meta File stats are never retrieved before this, so they aren't in a function parameter
	if (MODE != 'build' && !firstMapped && localPath) {
		runJobs('start', localPath)
	}
}

/**
 * @param {string} localPath
 * @param {string} robloxPath
 * @param {Object} attributes
 * @param {string[]} tags
 * @param {string?} metaLocalPath
 * @param {string?} initPath
 * @param {number} mtimeMs
 */
function mapLua(localPath, robloxPath, attributes, tags, metaLocalPath, initPath, mtimeMs) {
	if (localPathIsIgnored(localPath)) return

	const properties = {}
	let context = 'ModuleScript'

	// Scan for directives (run context, disabled)
	try {
		const directives = fs.readFileSync(localPath, { encoding: 'utf-8' }).split(/[\r\n]+/)
		for (const index in directives) {
			const line = directives[index].toLowerCase()
			if (line.startsWith('--@')) {
				if (line.startsWith('--@script:')) {
					if (line == '--@script:legacy') {
						context = 'Legacy'
					} else if (line == '--@script:server') {
						context = 'Server'
					} else if (line == '--@script:client') {
						context = 'Client'
					} else if (line == '--@script:localscript') {
						context = 'LocalScript'
					} else {
						console.error(fileError(localPath), yellow('Invalid run context directive'), green(line))
					}
				} else if (line == '--@script') { // Redundancy for '--@script:legacy'
					context = 'Legacy'
				} else if (line == '--@localscript') { // Redundancy for '--@script:localscript'
					context = 'LocalScript'
				} else if (line == '--@disabled') {
					properties.Enabled = false
				} else {
					console.error(fileError(localPath), 'Unknown directive', green(line))
				}
			} else if (!line.startsWith('--!')) {
				break
			}
		}
	} catch (err) {
		console.error(fileError(localPath), yellow(err))
	}

	if (context == 'ModuleScript') {
		if ('Enabled' in properties) {
			delete properties.Enabled
			console.error(fileError(localPath), yellow('Cannot use'), green('--@disabled'), yellow('directive on ModuleScripts'))
		}
	} else {
		if (!('Enabled' in properties)) properties.Enabled = true
	}

	const localPathLower = localPath.toLowerCase()
	if (localPathLower.endsWith('.server.lua') || localPathLower.endsWith('.server.luau')) {
		console.error(fileError(localPath), yellow('Unsupported file name; must add'), green('--@script'), yellow('directive to the beginning of the file'))
	} else if (localPathLower.endsWith('.client.lua') || localPathLower.endsWith('.client.luau')) {
		console.error(fileError(localPath), yellow('Unsupported file name; must add'), green('--@localscript'), yellow('directive to the beginning of the file'))
	}

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

/**
 * @param {string} localPath
 * @param {string} robloxPath
 * @param {string?} flag
 */
async function mapDirectory(localPath, robloxPath, flag) {
	if (localPathIsIgnored(localPath)) return

	// Update hard link (doesn't trigger during initial mapping)
	if (hardLinkPaths)
		for (const hardLinkPath of hardLinkPaths)
			hardLinkRecursive(localPath, hardLinkPath)

	const localPathStats = fs.statSync(localPath)
	if (localPathStats.isFile()) {
		const robloxPathParsed = path.parse(robloxPath)
		if (flag != 'Modified') robloxPath = robloxPathParsed.dir + '/' + robloxPathParsed.name
		if (localPathExtensionIsMappable(localPath)) {
			mTimes[localPath] = localPathStats.mtimeMs
			const localPathParsed = path.parse(localPath)
			const localPathName = localPathParsed.name.toLowerCase()
			const localPathExt = localPathParsed.ext.toLowerCase()
			let properties;
			let attributes;
			let tags;
			let metaLocalPath;

			// Lua Meta Files
			if (localPathExt == '.lua' || localPathExt == '.luau' || localPathExt == '.txt' || localPathExt == '.csv') {
				let luaMeta;
				const metaLocalPathJson = localPath.slice(0, localPath.lastIndexOf('/')) + '/' + localPathParsed.name + '.meta.json'
				const metaLocalPathYaml = localPath.slice(0, localPath.lastIndexOf('/')) + '/' + localPathParsed.name + '.meta.yaml'
				const metaLocalPathToml = localPath.slice(0, localPath.lastIndexOf('/')) + '/' + localPathParsed.name + '.meta.toml'
				if (fs.existsSync(metaLocalPathJson)) {
					luaMeta = validateJson('Meta', metaLocalPathJson, fs.readFileSync(metaLocalPathJson, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathJson
				} else if (fs.existsSync(metaLocalPathYaml)) {
					luaMeta = validateYaml('Meta', metaLocalPathYaml, fs.readFileSync(metaLocalPathYaml, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathYaml
				} else if (fs.existsSync(metaLocalPathToml)) {
					luaMeta = validateToml('Meta', metaLocalPathToml, fs.readFileSync(metaLocalPathToml, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathToml
				}
				if (luaMeta) {
					properties = luaMeta['properties']
					attributes = luaMeta['attributes']
					tags = luaMeta['tags']
				} else {
					metaLocalPath = undefined
				}
			}

			// Lua
			if (localPathExt == '.lua' || localPathExt == '.luau') {
				let newRobloxPath = robloxPath
				if (flag != 'JSON' && flag != 'Modified') newRobloxPath = robloxPathParsed.dir + '/' + localPathParsed.name
				mapLua(localPath, newRobloxPath, attributes, tags, metaLocalPath, undefined, localPathStats.mtimeMs)

			// Models
			} else if (localPathExt == '.rbxm' || localPathExt == '.rbxmx') {
				assignMap(robloxPath, {
					'Type': 'Model',
					'Path': localPath,
					'Meta': metaLocalPath
				}, localPathStats.mtimeMs)

			// JSON (non-meta)
			} else if (localPathExt == '.json' && !localPathName.endsWith('.meta')) {

				// Project Files
				if (localPathName.endsWith('.project')) {
					mTimes[localPath] = localPathStats.mtimeMs
					const subProjectJson = validateJson('SubProject', localPath, fs.readFileSync(localPath, { encoding: 'utf-8' }))
					if (subProjectJson) {
						const parentPathString = path.relative(process.cwd(), path.resolve(localPath, '..')).replace(/\\/g, '/')
						const externalPackageAppend = parentPathString != '' && parentPathString + '/' || ''
						await mapJsonRecursive(localPath, subProjectJson, robloxPath, 'tree', true, externalPackageAppend, localPathStats.mtimeMs)
					}

				// Model Files
				} else if (localPathName.endsWith('.model')) {
					if (validateJson('Model', localPath, fs.readFileSync(localPath, { encoding: 'utf-8' })))
						assignMap(flag != 'Modified' && robloxPath.slice(0, -6) || robloxPath, {
							'Type': 'JsonModel',
							'Path': localPath
						}, localPathStats.mtimeMs)

				// Excel Tables
				} else if (localPathName.endsWith('.excel')) {
					const excel = validateJson('Excel', localPath, fs.readFileSync(localPath, { encoding: 'utf-8' }))
					if (excel)
						assignMap(flag != 'Modified' && robloxPath.slice(0, -6) || robloxPath, {
							'Type': 'Excel',
							'Path': localPath,
							'Meta': path.relative(process.cwd(), path.resolve(localPath, '..', excel.spreadsheet)).replace(/\\/g, '/')
						}, localPathStats.mtimeMs)

				// Modules
				} else {
					assignMap(robloxPath, {
						'Type': 'JSON',
						'Path': localPath
					}, localPathStats.mtimeMs)
				}

			// YAML (non-meta)
			} else if (localPathExt == '.yaml' && !localPathName.endsWith('.meta')) {
				assignMap(robloxPath, {
					'Type': 'YAML',
					'Path': localPath
				}, localPathStats.mtimeMs)

			// TOML (non-meta)
			} else if (localPathExt == '.toml' && !localPathName.endsWith('.meta')) {
				assignMap(robloxPath, {
					'Type': 'TOML',
					'Path': localPath
				}, localPathStats.mtimeMs)

			// Plain Text
			} else if (localPathExt == '.txt') {
				assignMap(robloxPath, {
					'Type': 'PlainText',
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'Path': localPath
				}, localPathStats.mtimeMs)

			// Localization Tables
			} else if (localPathExt == '.csv') {
				assignMap(robloxPath, {
					'Type': 'Localization',
					'Properties': properties,
					'Attributes': attributes,
					'Tags': tags,
					'Path': localPath
				}, localPathStats.mtimeMs)
			}
		} else if (flag == 'JSON') {
			console.error(fileError(localPath), yellow('File is not of a mappable file type'))
		}
	} else if (localPathStats.isDirectory()) {
		if (fs.existsSync(localPath + '/default.project.json')) {

			// Projects
			mTimes[localPath] = localPathStats.mtimeMs
			const subProjectJsonPath = localPath + '/default.project.json'
			const subProjectJson = validateJson('SubProject', subProjectJsonPath, fs.readFileSync(subProjectJsonPath, { encoding: 'utf-8' }))
			if (subProjectJson) {
				const subProjectJsonStats = fs.statSync(localPath + '/default.project.json')
				await mapJsonRecursive(subProjectJsonPath, subProjectJson, robloxPath, 'tree', true, localPath + '/', subProjectJsonStats.mtimeMs)
			}

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
			{
				let initMeta;
				const metaLocalPathJson = localPath + '/init.meta.json'
				const metaLocalPathYaml = localPath + '/init.meta.yaml'
				const metaLocalPathToml = localPath + '/init.meta.toml'
				if (fs.existsSync(metaLocalPathJson)) {
					initMeta = validateJson('Meta', metaLocalPathJson, fs.readFileSync(metaLocalPathJson, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathJson
				} else if (fs.existsSync(metaLocalPathYaml)) {
					initMeta = validateYaml('Meta', metaLocalPathYaml, fs.readFileSync(metaLocalPathYaml, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathYaml
				} else if (fs.existsSync(metaLocalPathToml)) {
					initMeta = validateToml('Meta', metaLocalPathToml, fs.readFileSync(metaLocalPathToml, { encoding: 'utf-8' }))
					metaLocalPath = metaLocalPathToml
				}
				if (initMeta) {
					className = initMeta['className'] || 'Folder'
					properties = initMeta['properties']
					attributes = initMeta['attributes']
					tags = initMeta['tags']
					clearOnSync = initMeta['clearOnSync']
				} else {
					metaLocalPath = undefined
				}
			}

			// Lync-Style Init Lua
			if (fs.existsSync(localPath + '/' + localPathParentName + '.init.lua')) {
				mapLua(localPath + '/' + localPathParentName + '.init.lua', robloxPath, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/' + localPathParentName + '.init.luau')) {
				mapLua(localPath + '/' + localPathParentName + '.init.luau', robloxPath, attributes, tags, undefined, localPath, localPathStats.mtimeMs)

			// Rojo-Style Init Lua
			} else if (fs.existsSync(localPath + '/init.lua')) {
				mapLua(localPath + '/init.lua', robloxPath, attributes, tags, undefined, localPath, localPathStats.mtimeMs)
			} else if (fs.existsSync(localPath + '/init.luau')) {
				mapLua(localPath + '/init.luau', robloxPath, attributes, tags, undefined, localPath, localPathStats.mtimeMs)

			// Folders
			} else if (flag != 'JSON') {
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

			if (flag != 'Modified') {
				fs.readdirSync(localPath).forEach(async function(dirNext) {
					const dirNextLower = dirNext.toLowerCase()
					const localPathParentNameLower = localPathParentName.toLowerCase()
					// Do not map Init files. They were just mapped on this run of mapDirectory.
					switch (dirNextLower) {
						case 'init.meta.json':
						case 'init.meta.yaml':
						case 'init.meta.toml':
						case localPathParentNameLower + '.init.lua':
						case localPathParentNameLower + '.init.luau':
						case 'init.lua':
						case 'init.luau':
							break
						default:
							const filePathNext = localPath + '/' + dirNext
							await mapDirectory(filePathNext, robloxPath + '/' + dirNext)
					}
				})
			}
		}
	}
}

/**
 * @param {string} jsonPath
 * @param {Object} target
 * @param {string} robloxPath
 * @param {string} key
 * @param {boolean} firstLoadingExternalPackage
 * @param {string?} externalPackageAppend
 * @param {number} mtimeMs
 */
async function mapJsonRecursive(jsonPath, target, robloxPath, key, firstLoadingExternalPackage, externalPackageAppend, mtimeMs) {
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
			await mapJsonRecursive(jsonPath, target[key], nextRobloxPath, nextKey, false, externalPackageAppend, mtimeMs)
		}
	}

	if (localPath) {
		if (typeof localPath == 'object') {

			// Optional path
			if ('optional' in localPath) {
				await mapDirectory(localPath.optional, nextRobloxPath, 'JSON')

			// Package
			} else if ('package' in localPath) {
				const package = localPath.package.split('@')
				const owner_repo = package[0].split('/')
				const owner = owner_repo[0]
				const repo = owner_repo[1]
				let tag = package[1] || 'latest'
				const assetFolder = `.lync-packages/${owner}/${repo}`
				let assetFile = assetFolder + `/${tag}`
				const assetExt = localPath.type != 'repo' && '.' + localPath.type || ''
				try {
					if (!(fs.existsSync(assetFile + assetExt) || fs.existsSync(assetFile)) || tag == 'latest') {

						// Get release info
						if (DEBUG) console.log(`Getting latest version for ${green(localPath.package)} . . .`)
						const release = await getAsync(`https://api.github.com/repos/${owner}/${repo}/releases/${tag == 'latest' && tag || 'tags/' + tag}`, {
							Accept: 'application/vnd.github+json',
							Authorization: CONFIG.GithubAccessToken != '' && 'Bearer ' + CONFIG.GithubAccessToken,
							['X-GitHub-Api-Version']: '2022-11-28'
						}, 'json')
						if (!release || !('id' in release)) throw 'Failed to get release info'
						if (tag == 'latest') {
							tag = release.tag_name
							assetFile = assetFolder + `/${tag}`
						}

						// Download release asset
						if (!fs.existsSync(assetFile + assetExt)) {
							if (DEBUG) console.log(`Downloading ${green(localPath.package)} . . .`)

							let matchingAssetInfo;
							if (localPath.type != 'repo') {
								for (const assetInfo of release.assets) {
									if ('.' + assetInfo.name.split('.').slice(-1)[0] == assetExt) {
										matchingAssetInfo = assetInfo
									}
								}
								if (!matchingAssetInfo) throw 'No release assets matched type ' + localPath.type
							}

							// Repo / ZIP
							if (localPath.type == 'repo' || localPath.type == 'zip') {
								const asset = await getAsync(localPath.type == 'repo' && `https://api.github.com/repos/${owner}/${repo}/zipball/${tag}` || `https://api.github.com/repos/${owner}/${repo}/releases/assets/${matchingAssetInfo.id}`, {
									Accept: localPath.type == 'repo' && 'application/vnd.github+json' || 'application/octet-stream',
									Authorization: CONFIG.GithubAccessToken != '' && 'Bearer ' + CONFIG.GithubAccessToken,
									['X-GitHub-Api-Version']: '2022-11-28'
								})
								if (UTF8.decode(asset.subarray(0, 2)) != 'PK') throw 'Failed to download release asset'
								const assetZip = assetFile + '.zip'
								const assetUnzip = assetFile + '-unzipped'
								fs.mkdirSync(assetUnzip, { 'recursive': true })
								fs.writeFileSync(assetZip, asset)
								await extractZIP(assetZip, { dir: path.resolve(assetFile + '-unzipped') })
								fs.rmSync(assetFile, { force: true, recursive: true })
								fs.readdirSync(assetUnzip).forEach((dirNext) => {
									fs.renameSync(path.resolve(assetUnzip, dirNext), assetFile)
								})
								fs.rmSync(assetZip, { force: true })
								fs.rmSync(assetUnzip, { force: true, recursive: true })
								console.log(`Downloaded ${green(localPath.package)} to ${cyan(assetFile)}`)

							// LUA / LUAU / RBXM / RBXMX
							} else {
								const asset = await getAsync(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${matchingAssetInfo.id}`, {
									Accept: 'application/octet-stream',
									Authorization: CONFIG.GithubAccessToken != '' && 'Bearer ' + CONFIG.GithubAccessToken,
									['X-GitHub-Api-Version']: '2022-11-28'
								})
								fs.mkdirSync(assetFolder, { 'recursive': true })
								fs.writeFileSync(assetFile + assetExt, asset)
								console.log(`Downloaded ${green(localPath.package)} to ${cyan(assetFile + assetExt)}`)
							}
						} else {
							console.log(`Package ${green(localPath.package)} is up to date`)
						}
					}
				} catch (err) {
					console.error(red('Failed to download package'), green(localPath.package) + red(':'), yellow(err))
				}
				map.tree[nextRobloxPath].Path.package = assetFile
				if (fs.existsSync(assetFile + assetExt)) {
					await mapDirectory(assetFile + assetExt, nextRobloxPath, 'JSON')
				}
			}

		} else if (fs.existsSync(localPath)) {
			await mapDirectory(localPath, nextRobloxPath, 'JSON')
		} else {
			console.error(fileError(localPath), yellow('Path does not exist'))
		}
	}
}

async function changedJson() {
	if (!fs.existsSync(PROJECT_JSON)) {
		console.error(red('Terminated:'), yellow('Project'), cyan(PROJECT_JSON), yellow('does not exist'))
		process.exit()
	}
	if (DEBUG) console.log('Loading', cyan(PROJECT_JSON))
	projectJson = validateJson('MainProject', PROJECT_JSON, fs.readFileSync(PROJECT_JSON, { encoding: 'utf-8' }))
	if (!projectJson) {
		console.error(red('Terminated:'), yellow('Project'), cyan(PROJECT_JSON), yellow('is invalid'))
		process.exit()
	}
	process.chdir(path.resolve(PROJECT_JSON, '..'))
	if (MODE != 'serve' && MODE != 'open' && MODE != 'build') return
	let globIgnorePathsArr = [
		PROJECT_JSON,
		path.relative(process.cwd(), path.resolve(PROJECT_JSON, '../sourcemap.json')).replace(/\\/g, '/'),
		'*.lock',
		'.git/*',
		'~$*'
	]
	if (projectJson.globIgnorePaths)
		globIgnorePathsArr.push(projectJson.globIgnorePaths)
	globIgnorePaths = `{${globIgnorePathsArr.join(',')}}`
	globIgnorePathsPicoMatch = picomatch(globIgnorePaths)

	if (DEBUG) console.log('Mapping', green(projectJson.name || path.parse(process.cwd()).name))

	map = { info: {}, tree: {} }
	map.info.Version = VERSION
	map.info.Debug = DEBUG
	map.info.ContentRoot = path.join('lync', path.parse(process.cwd()).name, PROJECT_JSON).replaceAll('\\', '/') + '/'
	if ('collisionGroups' in projectJson) {
		map.info.CollisionGroupsFile = projectJson.collisionGroups
		map.info.CollisionGroups = JSON.parse(fs.readFileSync(projectJson.collisionGroups))
	}
	map.info.ServePlaceIds = projectJson.servePlaceIds

	const projectJsonStats = fs.statSync(PROJECT_JSON)
	for (const service in projectJson.tree) {
		if (service != '$className') await mapJsonRecursive(PROJECT_JSON, projectJson.tree, 'tree', service, false, undefined, projectJsonStats.mtimeMs)
	}
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Automated Job Functions
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * @param {string} event
 * @param {string} localPath
 */
function runJobs(event, localPath) {
	if ('jobs' in projectJson) {
		for (const index in projectJson.jobs) {
			const job = projectJson.jobs[index]
			if (job.on.includes(event) && picomatch(job.globPath)(localPath.replace(/\\/g, '/'))) {
				console.log('Running job command', green(job.commandName))
				if (job.commandName in CONFIG.JobCommands) {
					spawn(CONFIG.JobCommands[job.commandName], [], {
						stdio: 'ignore',
						detached: true,
						shell: true,
						windowsHide: true
					})
				} else {
					console.error(fileError(CONFIG_PATH), yellow("Missing job command"), green(job.commandName))
				}
			}
		}
	}
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Automated Download Functions
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function fetchSources() {
	if (!('sources' in projectJson) || projectJson.length == 0) console.log('Nothing to download')
	for (const index in projectJson.sources) {
		const source = projectJson.sources[index]
		console.log('Fetching source', green(source.name), '. . .')
		try {
			let contents;
			if (source.type == 'GET') {
				contents = await getAsync(source.url, source.headers)
			} else if (source.type == 'POST') {
				contents = await postAsync(source.url, source.headers, source.postData)
			}
			fs.writeFileSync(source.path, contents)
			console.log(green(source.name), 'saved to', cyan(source.path))
		} catch (err) {
			console.error(red('Fetch error:'), yellow(err))
		}
	}
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

(async function () {

	// Check for updates

	if (MODE != 'fetch' && CONFIG.AutoUpdate) {
		console.log('Checking for updates . . .')
		try {
			// Grab latest version info
			let latest = await getAsync(`https://api.github.com/repos/${CONFIG.AutoUpdate_Repo}/releases${!CONFIG.AutoUpdate_UsePrereleases && '/latest' || ''}`, {
				Accept: 'application/vnd.github+json',
				Authorization: CONFIG.GithubAccessToken != '' && 'Bearer ' + CONFIG.GithubAccessToken,
				['X-GitHub-Api-Version']: '2022-11-28'
			}, 'json')
			if (CONFIG.AutoUpdate_UsePrereleases) latest = latest[0]
			if (!latest || !('id' in latest)) throw 'Failed to get update release info'

			if (latest.id != CONFIG.AutoUpdate_LatestId) {
				const updateFile = path.resolve(LYNC_INSTALL_DIR, `Lync-${latest.tag_name}.zip`)
				const updateFolder = path.resolve(LYNC_INSTALL_DIR, 'Lync-' + latest.tag_name)

				// Download latest version
				console.log(`Updating to ${green(latest.name)} . . .`)
				const assetName = `lync-${latest.tag_name}-${PLATFORM}-${os.arch()}.zip`
				let assetId;
				for (const index in latest.assets) {
					const asset = latest.assets[index]
					if (asset.name == assetName) {
						assetId = asset.id
						break
					}
				}
				if (!assetId) throw `Failed to find update release asset with name '${assetName}'`
				const update = await getAsync(`https://api.github.com/repos/${CONFIG.AutoUpdate_Repo}/releases/assets/${assetId}`, {
					Accept: 'application/octet-stream',
					Authorization: CONFIG.GithubAccessToken != '' && 'Bearer ' + CONFIG.GithubAccessToken,
					['X-GitHub-Api-Version']: '2022-11-28'
				})
				if (UTF8.decode(update.subarray(0, 2)) != 'PK') throw 'Failed to download update release asset'
				fs.writeFileSync(updateFile, update)
				await extractZIP(updateFile, { dir: updateFolder })
				fs.rmSync(updateFile, { force: true })

				// Write new version
				CONFIG.AutoUpdate_LatestId = latest.id
				fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, '\t'))

				// Copy Lync binary and restart
				const executable = process.execPath
				const tempExecutable = executable + '.temp'
				if (fs.existsSync(tempExecutable))
					fs.rmSync(tempExecutable, { force: true })
				fs.renameSync(executable, executable + '.temp')
				if (PLATFORM == 'windows') {
					fs.renameSync(path.resolve(updateFolder, 'lync.exe'), path.resolve(LYNC_INSTALL_DIR, path.parse(executable).base))
				} else {
					fs.renameSync(path.resolve(updateFolder, 'lync'), path.resolve(LYNC_INSTALL_DIR, path.parse(executable).base))
				}

				// Cleanup
				fs.rmSync(updateFolder, { force: true, recursive: true })

				// Restart Lync
				console.clear()
				process.argv.shift()
				spawnSync(executable, process.argv, {
					cwd: process.cwd(),
					detached: false,
					stdio: 'inherit'
				})
				process.exit()
			}
			console.clear()
		} catch (err) {
			console.error(red('Failed to update:'), yellow(err))
			console.log()
		}
	}

	// Begin

	console.log('Path:', cyan(process.cwd()))
	console.log('Args:', ARGS)

	http.globalAgent.maxSockets = 65535

	// Map project

	await changedJson()
	firstMapped = true
	console.log()

	// Download sources
	if (MODE == 'fetch') {
		await fetchSources()
		process.exit()
	}
	
	// Build
	if (MODE == 'open' && !('base' in projectJson) || MODE == 'build') {
		const buildScriptPath = projectJson.build + '.luau'
		const lunePath = PLATFORM == 'windows' && CONFIG.Path_Lune.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA)
			|| PLATFORM == 'macos' && CONFIG.Path_Lune.replace('$HOME', process.env.HOME)
			|| CONFIG.Path_Lune

		// Map loadstring calls (needed until Lune implements loadstring)
		let loadstringMapEntries = {}
		let loadstringMap = ''

		function toEscapeSequence(str) {
			let escapeSequence = ''
			let i = str.length
			while (i--)
				escapeSequence = '\\' + str.charCodeAt(i) + escapeSequence
			return escapeSequence
		}

		function mapProperties(properties) {
			for (const property in properties) {
				let value = properties[property]
				if (Array.isArray(value) && !(value in loadstringMapEntries)) {
					loadstringMap += `\t[ "${toEscapeSequence('return ' + value)}" ] = ${value};\n`
					loadstringMapEntries[value] = true
				}
			}
		}

		for (const key in map.tree) {
			const mapping = map.tree[key]
			if (mapping.Type == 'JsonModel') {
				function mapJsonModel(json) {
					for (const key in json) {
						const jsonModelMapping = json[key]
						if (typeof jsonModelMapping == 'object') {
							if ('Properties' in jsonModelMapping)
								mapProperties(jsonModelMapping.Properties)
							mapJsonModel(jsonModelMapping)
						}
					}
				}
				const jsonModel = validateJson('Model', mapping.Path, fs.readFileSync(mapping.Path, { encoding: 'utf-8' }))
				if (jsonModel) mapJsonModel(jsonModel)
			} else if ('Properties' in mapping)
				mapProperties(mapping.Properties)
			if ('TerrainMaterialColors' in mapping)
				mapProperties(mapping.TerrainMaterialColors)
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
		const validationStatus = spawnSync(lunePath, [ 'run', `${buildScriptPath}` ], {
			cwd: process.cwd(),
			detached: false,
			stdio: 'inherit'
		}).status
		if (validationStatus == null) {
			console.error(red('Build error:'), yellow('Lune executable not found:'), cyan(lunePath))
			process.exit(1)
		} else if (validationStatus != 0) {
			console.error(red('Build error:'), yellow('Validation script failed with status', validationStatus))
			process.exit(2)
		}

		// Write build script
		if (DEBUG) console.log('Writing build script . . .')
		let buildScript = fs.readFileSync(path.resolve(__dirname, 'luneBuildTemplate.luau'))
		+ `\nworkspace:SetAttribute("__lyncbuildfile", ${projectJson.port})\n`
		+ `${pluginSource}\n`
		+ `map = net.jsonDecode("${toEscapeSequence(JSON.stringify(map, null, '\t'))}")\n`
		+ `map.info.ContentRoot = ""\n`
		+ `buildAll()\n`
		+ `fs.writeFile("${projectJson.build}", roblox.serializePlace(game))\n`
		if (fs.existsSync(buildScriptPath))
			fs.rmSync(buildScriptPath)
		fs.writeFileSync(buildScriptPath, buildScript)

		// Build RBXL
		if (DEBUG) console.log('Building RBXL . . .')
		const build = spawn(lunePath, [ 'run', `${buildScriptPath}` ], {
			cwd: process.cwd(),
			detached: false,
			stdio: 'inherit'
		})
		build.on('close', (status) => {
			if (status == null) {
				console.error(red('Build error:'), yellow('Lune executable not found:'), cyan(lunePath))
				process.exit(1)
			} else if (status != 0) {
				console.error(red('Build error:'), yellow('Build script failed with status'), status)
				process.exit(3)
			}
			console.log('Build saved to', cyan(projectJson.build))
			fs.rmSync(buildScriptPath)
			if (MODE == 'build') {
				process.exit()
			} else {
				// Open Studio
				securityKey = null
				if (PLATFORM == 'windows' || PLATFORM == 'macos') {
					if (DEBUG) console.log('Opening', cyan(projectJson.build))
					spawn((PLATFORM == 'macos' && 'open -n ' || '') + `"${projectJson.build}"`, [], {
						stdio: 'ignore',
						detached: true,
						shell: true,
						windowsHide: true
					})
				}
			}
		})
	}

	// Copy base file
	if (MODE == 'open' && ('base' in projectJson)) {
		if (DEBUG) console.log('Copying', cyan(projectJson.base), '->', cyan(projectJson.build))
		fs.copyFileSync(projectJson.base, projectJson.build)

		// Open Studio
		securityKey = null
		if (PLATFORM == 'windows' || PLATFORM == 'macos') {
			if (DEBUG) console.log('Opening', cyan(projectJson.build))
			spawn((PLATFORM == 'macos' && 'open -n ' || '') + `"${projectJson.build}"`, [], {
				stdio: 'ignore',
				detached: true,
				shell: true,
				windowsHide: true
			})
		}
	}

	// Sync
	if (MODE == 'serve' || MODE == 'open') {

		// Copy plugin
		const pluginsPath = path.resolve(PLATFORM == 'windows' && CONFIG.Path_RobloxPlugins.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || PLATFORM == 'macos' && CONFIG.Path_RobloxPlugins.replace('$HOME', process.env.HOME) || CONFIG.Path_RobloxPlugins)
		if (!fs.existsSync(pluginsPath)) {
			if (DEBUG) console.log('Creating folder', cyan(pluginsPath))
			fs.mkdirSync(pluginsPath)
		}
		const pluginPath = path.resolve(pluginsPath, 'Lync.rbxm')
		const currentHash = fs.existsSync(pluginPath) && crypto.createHash('md5').update(fs.readFileSync(pluginPath)).digest('hex')
		const newHash = crypto.createHash('md5').update(fs.readFileSync(path.resolve(__dirname, 'Plugin.rbxm'))).digest('hex')
		if (currentHash != newHash) {
			if (DEBUG) console.log('Copying', cyan(path.resolve(__dirname, 'Plugin.rbxm')), '->', cyan(pluginPath))
			fs.copyFileSync(path.resolve(__dirname, 'Plugin.rbxm'), pluginPath)
		}

		// Sync file changes
		chokidar.watch('.', {
			cwd: process.cwd(),
			disableGlobbing: true,
			ignoreInitial: true,
			persistent: true,
			ignorePermissionErrors: true,
			alwaysStat: true,
			usePolling: true
		}).on('all', async function(event, localPath, localPathStats) {
			if (!globIgnorePathsPicoMatch(localPath.replace(/\\/g, '/'))) {
				if (DEBUG) console.log('E', yellow(event), cyan(localPath))
				try {
					if (localPath) {
						localPath = path.relative(process.cwd(), localPath)

						if (!localPathIsIgnored(localPath)) {
							localPath = localPath.replace(/\\/g, '/')
							const parentPathString = path.relative(process.cwd(), path.resolve(localPath, '..')).replace(/\\/g, '/')

							if (localPath in mTimes) {
		
								// Deleted
								if (!localPathStats) {
									console.log('D', cyan(localPath))
									for (const key in map.tree) {
		
										// Direct, non-Init
										if (map.tree[key].Path == localPath && map.tree[key].InitParent != parentPathString) {
											delete mTimes[localPath]
											delete mTimes[map.tree[key].Path]
											delete map.tree[key]
											modified[key] = false
											modified_playtest[key] = false
											modified_sourcemap[key] = false
										}

										// Init
										if (key in map.tree && map.tree[key].InitParent == parentPathString && localPathIsInit(localPath)) {
											if (fs.existsSync(parentPathString)) {
												delete mTimes[localPath]
												delete map.tree[key]
												await mapDirectory(parentPathString, key)
											}
										}

										// Meta
										if (key in map.tree && map.tree[key].Meta && (map.tree[key].Meta == localPath || map.tree[key].Meta.startsWith(localPath + '/'))) {
											if (fs.existsSync(map.tree[key].Path)) {
												delete mTimes[localPath]
												await mapDirectory(map.tree[key].Path, key, 'Modified')
											}
										}

										// JSON member
										if (key in map.tree && map.tree[key].ProjectJson == localPath) {
											if (fs.existsSync(map.tree[key].Path)) {
												await mapDirectory(map.tree[key].Path, key, 'Modified')
											}
										}
									}

								// Changed
								} else if (localPathStats.isFile() && mTimes[localPath] != localPathStats.mtimeMs) {
									console.log('M', cyan(localPath))
									for (const key in map.tree) {
										if (localPathIsInit(localPath) && map.tree[key].InitParent == parentPathString) {
											await mapDirectory(parentPathString, key, 'Modified')
										} else if (map.tree[key].Meta == localPath) {
											await mapDirectory(map.tree[key].Path, key, 'Modified')
										} else if (map.tree[key].Path == localPath) {
											await mapDirectory(localPath, key, 'Modified')
										}
									}
									mTimes[localPath] = localPathStats.mtimeMs
								}

							} else if ((event == 'add' | event == 'addDir') && localPathStats) {

								// Added
								if (parentPathString in mTimes && (!localPathStats.isFile() || localPathExtensionIsMappable(localPath))) {
									console.log('A', cyan(localPath))
									for (const key in map.tree) {
										if (map.tree[key].Path == parentPathString || map.tree[key].InitParent == parentPathString) {
											const localPathParsed = path.parse(localPath)
											const localPathName = localPathParsed.name.toLowerCase()
											const localPathExt = localPathParsed.ext.toLowerCase()

											// Remap adjacent matching file
											if (localPathName != 'init.meta' && localPathName.endsWith('.meta') && (localPathExt == '.json' || localPathExt == '.yaml' || localPathExt == '.toml')) {
												const title = localPathParsed.name.slice(0, -5)
												if (fs.existsSync(localPathParsed.dir + '/' + title + '.lua')) {
													delete map.tree[key]
													await mapDirectory(localPath, title + '.lua')
												} else if (fs.existsSync(localPathParsed.dir + '/' + title + '.luau')) {
													delete map.tree[key]
													await mapDirectory(localPath, title + '.luau')
												} else {
													console.error(fileError(localPath), yellow('Stray meta file'))
													return
												}

											// Remap parent folder
											} else if (localPathIsInit(localPath) || localPathName == 'init.meta' && (localPathExt == '.json' || localPathExt == '.yaml' || localPathExt == '.toml') || localPathParsed.base == 'default.project.json') {
												delete map.tree[key]
												await mapDirectory(parentPathString, key)

											// Map only file or directory
											} else {
												await mapDirectory(localPath, key + '/' + localPathParsed.base)
											}
										}
									}
									if (!mTimes[localPath]) console.error(red('Lync bug:'), yellow('Failed to add'), cyan(localPath))
								}
							}

							// Modify sourcemap
							if (CONFIG.GenerateSourcemap && Object.keys(modified_sourcemap).length > 0) {
								generateSourcemap(PROJECT_JSON, modified_sourcemap, projectJson)
								modified_sourcemap = {}
							}
						}
					}
				} catch (err) {
					console.error(red('Sync error:'), err)
				}
			}
			runJobs(event, localPath)
		})
	}

	// Start server

	http.createServer(function(req, res) {
		if (MODE != 'build') {
			if (securityKey == null) {
				if (!('key' in req.headers)) {
					const errText = 'Missing Key header'
					console.error(red('Server error:'), yellow(errText))
					console.log('Headers:', req.headers)
					res.writeHead(403)
					res.end(errText)
					return
				}
				securityKey = req.headers.key
				console.log(`Client connected: ${yellow(req.socket.remoteAddress)}`)
			} else if (req.headers.key != securityKey) {
				const errText = `Security key mismatch. The current session will now be terminated. (Key = ${req.headers.key})\nPlease check for any malicious plugins or scripts and try again.`
				console.error(red('Terminated:'), yellow(errText))
				res.writeHead(403)
				res.end(errText)
				process.exit()
			}
		}

		switch (req.headers.type) {
			case 'Map':
				// Create content hard links

				hardLinkPaths = []
				if (PLATFORM == 'windows' || PLATFORM == 'linux') {
					const versionsPath = path.resolve(PLATFORM == 'windows' && CONFIG.Path_RobloxVersions.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA) || CONFIG.Path_RobloxVersions)
					try {
						fs.accessSync(versionsPath, fs.constants.R_OK | fs.constants.W_OK)
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
					} catch (err) {
						console.error(red('Hard link error:'), yellow(err))
					}
					if (PLATFORM == 'windows') {
						// Studio Mod Manager
						const modManagerContentPath = path.resolve(CONFIG.Path_StudioModManagerContent.replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA))
						if (fs.existsSync(modManagerContentPath)) {
							try {
								fs.accessSync(modManagerContentPath, fs.constants.R_OK | fs.constants.W_OK)
								const hardLinkPath = path.resolve(modManagerContentPath, 'lync')
								if (!fs.existsSync(hardLinkPath)) {
									fs.mkdirSync(hardLinkPath)
								}
								hardLinkPaths.push(hardLinkPath)
							} catch (err) {
								console.error(red('Hard link error:'), yellow(err))
							}
						}
					}
				} else if (PLATFORM == 'macos') {
					const contentPath = path.resolve(CONFIG.Path_RobloxContent)
					const hardLinkPath = path.resolve(contentPath, 'lync')
					if (!fs.existsSync(hardLinkPath)) {
						fs.mkdirSync(hardLinkPath)
					}
					hardLinkPaths.push(hardLinkPath)
				}
				for (const hardLinkPath of hardLinkPaths) {
					if (DEBUG) console.log('Creating hard link', cyan(hardLinkPath))
					hardLinkRecursive(process.cwd(), hardLinkPath)
				}
				if (hardLinkPaths.length == 0) {
					console.error(red('Hard link error:'), yellow('No hard link paths found'))
				}

				// Send map
				const mapJsonString = JSON.stringify(map)
				if ('playtest' in req.headers) {
					modified_playtest = {}
				} else {
					modified = {}
				}
				res.writeHead(200)
				res.end(mapJsonString)
				break

			case 'Modified':
				let modifiedJsonString;
				if ('playtest' in req.headers) {
					modifiedJsonString = JSON.stringify(modified_playtest)
					modified_playtest = {}
				} else {
					modifiedJsonString = JSON.stringify(modified)
					modified = {}
				}
				res.writeHead(200)
				res.end(modifiedJsonString)
				break

			case 'Source':
				try {
					let read = fs.readFileSync(req.headers.path, { encoding: 'utf8' })

					// Parse JSON
					if (req.headers.datatype == 'JSON') {
						const json = validateJson(null, req.headers.path, read)
						if (json) read = LUA.format(json, { singleQuote: false, spaces: '\t' })

					// Convert YAML to JSON
					} else if (req.headers.datatype == 'YAML') {
						const yaml = validateYaml(null, req.headers.path, read)
						if (yaml) read = LUA.format(yaml, { singleQuote: false, spaces: '\t' })

					// Convert TOML to JSON
					} else if (req.headers.datatype == 'TOML') {
						const toml = validateToml(null, req.headers.path, read)
						if (toml) read = LUA.format(toml, { singleQuote: false, spaces: '\t' })

					// Read and convert Excel Tables to JSON
					} else if (req.headers.datatype == 'Excel') {
						let tableDefinitions = validateJson('Excel', req.headers.path, read)
						if (tableDefinitions) {
							const excelFilePath = path.resolve(req.headers.path, '..', tableDefinitions.spreadsheet)

							if (!fs.existsSync(excelFilePath)) {
								console.error(fileError(excelFilePath), yellow('Excel file does not exist'))
							} else {
								const excelFile = XLSX.readFile(excelFilePath)

								// Convert Excel 'Defined Name' to 'Ref'
								for (const definedName of excelFile.Workbook.Names) {
									if (definedName.Name == tableDefinitions.ref) {
										tableDefinitions.ref = definedName.Ref
										break
									}
								}
		
								// Find current sheet and range to read from
								let sheet;
								let range;
								if (tableDefinitions.ref.includes('!')) {
									const ref = tableDefinitions.ref.split('!')
									sheet = excelFile.Sheets[ref[0].replace('=', '').replaceAll('\'', '')]
									range = XLSX.utils.decode_range(ref[1])
								} else {
									sheet = excelFile.Sheets[excelFile.SheetNames[0]]
									range = XLSX.utils.decode_range(tableDefinitions.ref.replace('=', ''))
								}

								// Support undefined start and end rows
								const hasHeader = tableDefinitions.hasHeader
								if (range.s.r == -1)
									range.s.r = 0
								if (range.e.r == -1)
									range.e.r = parseInt(sheet['!ref'].split(':')[1].replaceAll(/[^0-9]/gm, '')) - 1
		
								// Convert cells to dict
								const sheetJson = XLSX.utils.sheet_to_json(sheet, {
									range: range,
									header: 1,
									defval: null
								})
								const entries = tableDefinitions.numColumnKeys > 0 && {} || []
								const startRow = hasHeader && 1 || 0
								const startColumn = tableDefinitions.numColumnKeys
								const lastColumnKeyUsesIndices = tableDefinitions.lastColumnKeyUsesIndices
								const header = sheetJson[0]
								for (let row = startRow; row < sheetJson.length; row++) {
									for (let column = startColumn; column < header.length; column++) {
										const key = hasHeader && header[column] || (column - startColumn)
										let target = entries
										if (startColumn > 0) {
											for (let columnKeyIndex = 0; columnKeyIndex < startColumn; columnKeyIndex++) {
												const columnKey = sheetJson[row][columnKeyIndex]
												if (!columnKey) {
													target = null
													break
												}
												if (lastColumnKeyUsesIndices && columnKeyIndex == startColumn - 1) {
													if (!(columnKey in target))
														target[columnKey] = []
													target = target[columnKey]
													if (!(target[row]))
														target[row] = {}
													target = target[row]
												} else {
													if (!(columnKey in target))
														target[columnKey] = hasHeader && {} || []
													target = target[columnKey]
												}
											}
										} else {
											const indexKey = row - startRow
											if (!target[indexKey])
												target[indexKey] = hasHeader && {} || []
											target = target[indexKey]
										}
										if (target)
											target[key] = sheetJson[row][column]
									}
								}
								read = LUA.format(entries, { singleQuote: false, spaces: '\t' }).replaceAll(/^\n/gm, '') // Regex removes blank newlines
							}
						}

					// Convert Localization CSV to JSON
					} else if (req.headers.datatype == 'Localization') {
						let entries = []
						const csv = parseCSV(read)
						for (let index = 0; index < csv.length; index++) {
							const entry = csv[index]
							const values = {}
							for (const key in entry) {
								switch (key) {
									case 'Key':
									case 'Source':
									case 'Context':
									case 'Example':
										break
									default:
										values[key] = entry[key]
								}
							}
							entries.push({ Key: entry.Key, Source: entry.Source, Context: entry.Context, Example: entry.Example, Values: values })
						}
						read = JSON.stringify(entries)
					}

					res.writeHead(200)
					res.end(read)
				} catch (err) {
					console.error(red('Server error:'), err)
					res.writeHead(500)
					res.end(err.toString())
				}
				break

			case 'ReverseSync':
				const workingDir = process.cwd()
				if (path.resolve(req.headers.path).substring(0, workingDir.length) != workingDir) {
					res.writeHead(403)
					res.end('File not located in project directory')
					break
				}
				const localPathExt = path.parse(req.headers.path).ext.toLowerCase()
				if (localPathExt != '.lua' && localPathExt != '.luau' && localPathExt != '.json') {
					res.writeHead(403)
					res.end('File extension must be lua, luau, or json')
					break
				}
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
						console.error(red('Server error:'), err)
						res.writeHead(400)
						res.end(err.toString())
					}
				})
				break

			case 'Resume':
				res.writeHead(200)
				res.end()
				break

			case 'FetchSources':
				res.writeHead(200)
				res.end()
				fetchSources()
				break

			default:
				res.writeHead(400)
				res.end('Missing / invalid type header')
		}
	})
	.on('error', function(err) {
		console.error(red('Terminated: Server error:'), err)
		process.exit()
	})
	.listen(projectJson.port, function() {
		if (MODE != 'build') console.log(`Serving ${green(projectJson.name || path.parse(process.cwd()).name)} on port ${yellow(projectJson.port)}`)

		// Generate sourcemap

		if (CONFIG.GenerateSourcemap) {
			const startTime = Date.now()
			if (DEBUG) console.log('Generating', cyan('sourcemap.json'), '. . .')
			generateSourcemap(PROJECT_JSON, map.tree, projectJson)
			if (DEBUG) console.log('Generated', cyan('sourcemap.json'), 'in', (Date.now() - startTime) / 1000, 'seconds')
			modified_sourcemap = {}
		}
	})
})()
