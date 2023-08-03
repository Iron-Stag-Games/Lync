const fs = require('fs')
const path = require('path')

const RBXM = require('./rbxm.js')
const RBXMX = require('./rbxmx.js')
const modelJSON = require('./model.json.js')

var sourcemapJson;

module.exports.generateSourcemap = function(PROJECT_JSON, map, projectJson, red) {
	try {
		const sourcemapJsonPath = path.resolve(PROJECT_JSON, '../sourcemap.json')
		sourcemapJson = sourcemapJson ?? {
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

			// Mapping was deleted
			if (!mapping) {
				let targetParent;
				let targetKey;
				for (const path of paths) {
					for (const childKey in target.children) {
						const child = target.children[childKey]
						if (child.name == path) {
							targetParent = target
							targetKey = childKey
							target = child
							break
						}
					}
				}
				targetParent.children.splice(targetKey, 1)
				continue
			}

			// Set target object
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
								RBXM.fill(target, fs.readFileSync(mapping.Path))
							} else if (pathExt == '.rbxmx') {
								RBXMX.fill(target, fs.readFileSync(mapping.Path))
							}
							break
						case 'JsonModel':
							modelJSON.fill(target, fs.readFileSync(mapping.Path))
							break
					}
				} catch (err) {
					console.error(red('Sourcemap / Project error:'), err)
				}
			}

			// Write className and filePaths
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
			target.filePaths = []
			if (mapping.Path)
				target.filePaths.push(mapping.Path)
			if (mapping.Meta)
				target.filePaths.push(mapping.Meta)
			if (mapping.ProjectJson)
				target.filePaths.push(mapping.ProjectJson)
		}

		// Write Sourcemap JSON
		fs.writeFileSync(sourcemapJsonPath, JSON.stringify(sourcemapJson, null, '\t'))
	} catch (err) {
		console.error(red('Sourcemap error:'), err)
	}
}