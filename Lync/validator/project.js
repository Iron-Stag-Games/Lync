const path = require('path')

const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

/**
 * @param {Object} json
 * @param {string} localPath
 * @returns {boolean}
 */
function scan(json, localPath) {
	let failed = false

	for (const key in json) {
		if (key == '$className' && typeof json[key] != 'string') {
			console.error(fileError(localPath), green('$className'), yellow('must be a string'))
			failed = true

		} else if (key == '$properties') {
			if (!(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
				console.error(fileError(localPath), green('$properties'), yellow('must be an object'))
				failed = true
			} else {
				for (const property in json[key]) {
					if (typeof json[key][property] == 'object' && Array.isArray(json[key][property]) && json[key][property].length > 1) {
						console.error(fileError(localPath), yellow('Property'), green(property), yellow('is an array with size > 1; check property syntax'))
						failed = true
					}
				}
			}

		} else if (key == '$attributes' && !(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('$attributes'), yellow('must be an object'))
			failed = true

		} else if (key == '$tags' && !(typeof json[key] == 'object' && Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('$tags'), yellow('must be an array'))
			failed = true
		
		} else if (key == '$path') {
			if (typeof(json[key]) == 'object') {
				if ('optional' in json[key] && 'package' in json[key]) {
					console.error(fileError(localPath), green('$path'), yellow('cannot have both keys'), green('$path.optional'), yellow('and'), green('$path.package'))
					failed = true
				} else if ('optional' in json[key]) {
					if (typeof json[key].optional != 'string') {
						console.error(fileError(localPath), green('$path.optional'), yellow('must be a string'))
						failed = true
					}
				} else if ('package' in json[key]) {
					if (typeof json[key].package != 'string') {
						console.error(fileError(localPath), green('$path.package'), yellow('must be a string'))
						failed = true
					}
					if (json[key].type != 'repo' && json[key].type != 'zip' && json[key].type != 'lua' && json[key].type != 'luau' && json[key].type != 'rbxm' && json[key].type != 'rbxmx') {
						console.error(fileError(localPath), green('$path.type'), yellow('must be repo, zip, lua, luau, rbxm, or rbxmx'))
						failed = true
					}
				} else {
					console.error(fileError(localPath), green('$path'), yellow('is missing key'), green('$path.optional'), yellow('or'), green('$path.package'))
					failed = true
				}
			} else if (typeof(json[key]) != 'string') {
				console.error(fileError(localPath), green('$path'), yellow('must be a string or an object'))
				failed = true
			}

		} else if (key == '$clearOnSync' && (typeof json[key] != 'boolean')) {
			console.error(fileError(localPath), green('$clearOnSync'), yellow('must be a boolean'))
			failed = true

		} else if (key == '$ignoreUnknownInstances') {
			console.error(fileWarning(localPath), 'Unsupported key', green('$ignoreUnknownInstances') + '; must replace with', green('$clearOnSync'))

		} else if (typeof json[key] == 'object') {
			const scanFailed = scan(json[key], localPath)
			failed = failed || scanFailed
		}
	}

	return failed
}

/**
 * @param {string?} type
 * @param {Object} json
 * @param {string} localPath
 * @returns {Object | undefined}
 */
module.exports.validate = function(type, json, localPath) {
	let failed = false

	if (type == 'MainProject') {
		if (!('name' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('name'))
			failed = true
		} else if (typeof json.name != 'string') {
			console.error(fileError(localPath), green('name'), yellow('must be a string'))
			failed = true
		}

		if (!('base' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('base'))
			failed = true
		} else if (typeof json.base != 'string') {
			console.error(fileError(localPath), green('base'), yellow('must be a string'))
			failed = true
		}

		if (!('build' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('build'))
			failed = true
		} else if (typeof json.build != 'string') {
			console.error(fileError(localPath), green('build'), yellow('must be a string'))
			failed = true
		} else {
			const pathExt = path.parse(json.build).ext.toLowerCase()
			if (pathExt != '.rbxl' && pathExt != '.rbxlx') {
				console.error(fileError(localPath), green('build'), yellow('must point to an overwritable RBXL or RBXLX file'))
				failed = true
			}
		}

		if (!('port' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('port'))
			failed = true
		} else if (typeof json.port != 'number') {
			console.error(fileError(localPath), green('port'), yellow('must be a number'))
			failed = true
		}

		if (('remoteAddress' in json) && typeof json.remoteAddress != 'string') {
			console.error(fileError(localPath), green('remoteAddress'), yellow('must be a string'))
			failed = true
		}

		if ('sourcemapEnabled' in json) {
			if (!(typeof json.sourcemapEnabled == 'object' && !Array.isArray(json.sourcemapEnabled))) {
				console.error(fileError(localPath), green('sourcemapEnabled'), yellow('must be an object'))
				failed = true
			} else {
				for (const key in json.sourcemapEnabled) {
					if (key != 'RBXM'
						&& key != 'RBXMX'
					) {
						console.error(fileWarning(localPath), 'Unexpected key', green('sourcemapEnabled.' + key))
					} else {
						const value = json.sourcemapEnabled[key]
						if (typeof value != 'boolean') {
							console.error(fileError(localPath), green(key), yellow('must be a boolean'))
							failed = true
						}
					}
				}
			}
		}

		if ('sources' in json) {
			if (!(typeof json.sources == 'object' && Array.isArray(json.sources))) {
				console.error(fileError(localPath), green('sources'), yellow('must be an array'))
				failed = true
			} else {
				for (const index in json.sources) {
					const source = json.sources[index]

					if (!('name' in source)) {
						console.error(fileError(localPath), yellow('Missing key'), green('sources.name'))
						failed = true
					} else if (typeof source.name != 'string') {
						console.error(fileError(localPath), green('sources.name'), yellow('must be a string'))
						failed = true
					}

					if (!('url' in source)) {
						console.error(fileError(localPath), yellow('Missing key'), green('sources.url'))
						failed = true
					} else if (typeof source.url != 'string') {
						console.error(fileError(localPath), green('sources.url'), yellow('must be a string'))
						failed = true
					}

					if (!('type' in source)) {
						console.error(fileError(localPath), yellow('Missing key'), green('sources.type'))
						failed = true
					} else if (source.type != 'GET' && source.type != 'POST') {
						console.error(fileError(localPath), green('sources.type'), yellow('must be GET or POST'))
						failed = true
					}

					if (!('headers' in source)) {
						console.error(fileError(localPath), yellow('Missing key'), green('sources.headers'))
						failed = true
					} else if (!(typeof source.headers == 'object' && !Array.isArray(source.headers))) {
						console.error(fileError(localPath), green('sources.headers'), yellow('must be an object'))
						failed = true
					}

					if ('postData' in source) {
						if (typeof source.postData != 'string' && !(typeof source.postData == 'object' && !Array.isArray(source.postData))) {
							console.error(fileError(localPath), green('sources.postData'), yellow('must be a string or an object'))
							failed = true
						} else if (source.type != 'POST') {
							console.error(fileError(localPath), yellow('Cannot use key'), green('sources.postData'), yellow('with POST type'))
							failed = true
						}
					}

					if (!('path' in source)) {
						console.error(fileError(localPath), yellow('Missing key'), green('sources.path'))
						failed = true
					} else if (typeof source.path != 'string') {
						console.error(fileError(localPath), green('sources.path'), yellow('must be a string'))
						failed = true
					}

					for (const sourceKey in source) {
						if (sourceKey != 'name'
							&& sourceKey != 'url'
							&& sourceKey != 'type'
							&& sourceKey != 'headers'
							&& sourceKey != 'postData'
							&& sourceKey != 'path'
						) {
							console.error(fileWarning(localPath), 'Unexpected key', green('sources[' + index + '].' + sourceKey))
						}
					}
				}
			}
		}
	}

	const scanFailed = scan(json, localPath)
	failed = failed || scanFailed

	if (failed) return
	return json
}
