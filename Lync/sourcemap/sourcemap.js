const fs = require('fs')
const path = require('path')

const RBXM = require('./rbxm.js')
const RBXMX = require('./rbxmx.js')
const modelJSON = require('./model.json.js')

var cache = {}
var mTimes = {}

function readFileCached(localPath) {
	if (!(localPath in mTimes)) {
		const read = fs.readFileSync(localPath)
		cache[localPath] = read
		mTimes[localPath] = fs.statSync(localPath).mtimeMs
		return read
	} else {
		const mtime = fs.statSync(localPath).mtimeMs
		if (mTimes[localPath] != mtime) {
			const read = fs.readFileSync(localPath)
			cache[localPath] = read
			mTimes[localPath] = mtime
			return read
		} else {
			return cache[localPath]
		}
	}
}

module.exports.generateSourcemap = function(CONFIG, PROJECT_JSON, map, projectJson, red, yellow) {
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
				const mapping = map[key]
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

				// Expand models

				if (mapping.Path) {
					try {
						switch (mapping.Type) {
							case 'Model':
								const pathParsed = path.parse(mapping.Path)
								const pathExt = pathParsed.ext.toLowerCase()
								if (pathExt == '.rbxm') {
									RBXM.fill(target, readFileCached(mapping.Path))
								} else if (pathExt == '.rbxmx') {
									RBXMX.fill(target, readFileCached(mapping.Path))
								}
								break
							case 'JsonModel':
								modelJSON.fill(target, readFileCached(mapping.Path))
								break
						}
					} catch (err) {
						console.error(red('Sourcemap / Project error:'), err)
					}
				}

				// Write map info

				switch (mapping.Type) {
					case 'Instance':
						target.className = key == 'tree/Workspace/Terrain' && 'Terrain' || mapping.ClassName
						break
					case 'Lua':
						target.className = mapping.Context == 'Client' && 'LocalScript' || mapping.Context == 'Server' && 'Script' || 'ModuleScript'
						break
					case 'JSON':
					case 'YAML':
					case 'TOML':
					case 'Excel':
						target.className = 'ModuleScript'
						break
					case 'PlainText':
						target.className = 'StringValue'
						break
					case 'Localization':
						target.className = 'LocalizationTable'
				}

				if (mapping.Path)
					target.filePaths.push(mapping.Path)
				if (mapping.ProjectJson)
					target.filePaths.push(mapping.ProjectJson)
			}

			// Write Sourcemap JSON
			fs.writeFileSync(sourcemapJsonPath, JSON.stringify(sourcemapJson, null, '\t'))
		} catch (err) {
			console.error(red('Sourcemap error:'), err)
		}
	}
}