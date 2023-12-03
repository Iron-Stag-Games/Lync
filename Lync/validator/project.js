const path = require('path')

const { red, yellow, green, cyan, fileError, jsonError } = require('../output.js')

/**
 * @param {Object} json
 * @param {Object} root
 * @param {string} localPath
 * @returns {boolean}
 */
function scan(json, root, localPath) {
	let failed = false

	for (const key in json) {
		if (key == '$className' && typeof json[key] != 'string') {
			console.error(jsonError(localPath, root, json, '$className'), yellow('Must be a string'))
			failed = true

		} else if (key == '$properties') {
			if (!(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
				console.error(jsonError(localPath, root, json, '$properties'), yellow('Must be an object'))
				failed = true
			} else {
				for (const property in json[key]) {
					if (typeof json[key][property] == 'object' && Array.isArray(json[key][property]) && json[key][property].length > 1) {
						console.error(jsonError(localPath, root, json, '$properties\\' + property), yellow('Array with size > 1; check property syntax'))
						failed = true
					}
				}
			}

		} else if (key == '$attributes' && !(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
			console.error(jsonError(localPath, root, json, '$attributes'), yellow('Must be an object'))
			failed = true

		} else if (key == '$tags' && !(typeof json[key] == 'object' && Array.isArray(json[key]))) {
			console.error(jsonError(localPath, root, json, '$tags'), yellow('Must be an array'))
			failed = true
		
		} else if (key == '$path') {
			if (typeof(json[key]) == 'object') {
				if ('optional' in json[key] && 'package' in json[key]) {
					console.error(jsonError(localPath, root, json, '$path'), yellow('Cannot have both keys'), green('$path\\optional'), yellow('and'), green('$path\\package'))
					failed = true
				} else if ('optional' in json[key]) {
					if (typeof json[key].optional != 'string') {
						console.error(jsonError(localPath, root, json, '$path\\optional'), yellow('Must be a string'))
						failed = true
					}
				} else if ('package' in json[key]) {
					if (typeof json[key].package != 'string') {
						console.error(jsonError(localPath, root, json, '$path\\package'), yellow('Must be a string'))
						failed = true
					}
					if (json[key].type != 'repo' && json[key].type != 'zip' && json[key].type != 'lua' && json[key].type != 'luau' && json[key].type != 'rbxm' && json[key].type != 'rbxmx') {
						console.error(jsonError(localPath, root, json, '$path\\type'), yellow('Must be repo, zip, lua, luau, rbxm, or rbxmx'))
						failed = true
					}
				} else {
					console.error(jsonError(localPath, root, json, '$path'), yellow('Missing key'), green('$path\\optional'), yellow('or'), green('$path\\package'))
					failed = true
				}
			} else if (typeof(json[key]) != 'string') {
				console.error(jsonError(localPath, root, json, '$path'), yellow('Must be a string or an object'))
				failed = true
			}

		} else if (key == '$clearOnSync' && (typeof json[key] != 'boolean')) {
			console.error(jsonError(localPath, root, json, '$clearOnSync'), yellow('Must be a boolean'))
			failed = true

		} else if (key == '$ignoreUnknownInstances') {
			console.error(jsonError(localPath, root, json, '$ignoreUnknownInstances'), 'Unsupported key; must replace with', green('$clearOnSync'))
			failed = true

		} else if (typeof json[key] == 'object') {
			const scanFailed = scan(json[key], root, localPath)
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
			console.error(jsonError(localPath, json, json, 'name'), yellow('Must be a string'))
			failed = true
		}

		if (('base' in json) && typeof json.base != 'string') {
			console.error(jsonError(localPath, json, json, 'base'), yellow('Must be a string'))
			failed = true
		}

		if (!('build' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('build'))
			failed = true
		} else if (typeof json.build != 'string') {
			console.error(jsonError(localPath, json, json, 'build'), yellow('Must be a string'))
			failed = true
		} else {
			const pathExt = path.parse(json.build).ext.toLowerCase()
			if (pathExt != '.rbxl' && pathExt != '.rbxlx') {
				console.error(jsonError(localPath, json, json, 'build'), yellow('Must point to an overwritable RBXL or RBXLX file'))
				failed = true
			}
		}

		if (!('port' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('port'))
			failed = true
		} else if (typeof json.port != 'number') {
			console.error(jsonError(localPath, json, json, 'port'), yellow('Must be a number'))
			failed = true
		}

		if (('remoteAddress' in json) && typeof json.remoteAddress != 'string') {
			console.error(jsonError(localPath, json, json, 'remoteAddress'), yellow('Must be a string'))
			failed = true
		}

		if ('globIgnorePaths' in json) {
			if (!(typeof json.globIgnorePaths == 'object' && Array.isArray(json.globIgnorePaths))) {
				console.error(jsonError(localPath, json, json, 'globIgnorePaths'), yellow('Must be an array'))
				failed = true
			} else {
				for (const index in json.globIgnorePaths) {
					if (typeof json.globIgnorePaths[index] != 'string') {
						console.error(jsonError(localPath, json, json.globIgnorePaths, index), yellow('Must be a string'))
						failed = true
					}
				}
			}
		}

		if ('sourcemapEnabled' in json) {
			if (!(typeof json.sourcemapEnabled == 'object' && !Array.isArray(json.sourcemapEnabled))) {
				console.error(jsonError(localPath, json, json, 'sourcemapEnabled'), yellow('Must be an object'))
				failed = true
			} else {
				for (const key in json.sourcemapEnabled) {
					if (key != 'RBXM'
						&& key != 'RBXMX'
					) {
						console.error(jsonError(localPath, json, json.sourcemapEnabled, key), yellow('Unexpected key'))
					} else {
						const value = json.sourcemapEnabled[key]
						if (typeof value != 'boolean') {
							console.error(jsonError(localPath, json, json.sourcemapEnabled, key), yellow('Must be a boolean'))
							failed = true
						}
					}
				}
			}
		}

		if ('sources' in json) {
			if (!(typeof json.sources == 'object' && Array.isArray(json.sources))) {
				console.error(jsonError(localPath, json, json, 'sources'), yellow('Must be an array'))
				failed = true
			} else {
				for (const index in json.sources) {
					const source = json.sources[index]

					if (!('name' in source)) {
						console.error(jsonError(localPath, json, source), yellow('Missing key'), green('name'))
						failed = true
					} else if (typeof source.name != 'string') {
						console.error(jsonError(localPath, json, source, 'name'), yellow('Must be a string'))
						failed = true
					}

					if (!('url' in source)) {
						console.error(jsonError(localPath, json, source), yellow('Missing key'), green('url'))
						failed = true
					} else if (typeof source.url != 'string') {
						console.error(jsonError(localPath, json, source, 'url'), yellow('Must be a string'))
						failed = true
					}

					if (!('type' in source)) {
						console.error(jsonError(localPath, json, source), yellow('Missing key'), green('type'))
						failed = true
					} else if (source.type != 'GET' && source.type != 'POST') {
						console.error(jsonError(localPath, json, source, 'type'), yellow('Must be GET or POST'))
						failed = true
					}

					if (!('headers' in source)) {
						console.error(jsonError(localPath, json, source), yellow('Missing key'), green('headers'))
						failed = true
					} else if (!(typeof source.headers == 'object' && !Array.isArray(source.headers))) {
						console.error(jsonError(localPath, json, source, 'headers'), green('sources.headers'), yellow('must be an object'))
						failed = true
					}

					if ('postData' in source) {
						if (typeof source.postData != 'string' && !(typeof source.postData == 'object' && !Array.isArray(source.postData))) {
							console.error(jsonError(localPath, json, source, 'postData'), yellow('must be a string or an object'))
							failed = true
						} else if (source.type != 'POST') {
							console.error(jsonError(localPath, json, source, 'postData'), yellow('Cannot use key with POST type'))
							failed = true
						}
					}

					if (!('path' in source)) {
						console.error(jsonError(localPath, json, source), yellow('Missing key'), green('path'))
						failed = true
					} else if (typeof source.path != 'string') {
						console.error(jsonError(localPath, json, source, 'path'), yellow('Must be a string'))
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
							console.error(jsonError(localPath, json, source, sourceKey), yellow('Unexpected key'))
						}
					}
				}
			}
		}

		if ('jobs' in json) {
			if (!(typeof json.jobs == 'object' && Array.isArray(json.jobs))) {
				console.error(jsonError(localPath, json, json, 'jobs'), yellow('Must be an array'))
				failed = true
			} else {
				for (const index in json.jobs) {
					const job = json.jobs[index]

					if (!('globPath' in job)) {
						console.error(jsonError(localPath, json, job), yellow('Missing key'), green('globPath'))
						failed = true
					} else if (typeof job.globPath != 'string') {
						console.error(jsonError(localPath, json, job, 'globPath'), yellow('Must be a string'))
						failed = true
					}

					if (!('on' in job)) {
						console.error(jsonError(localPath, json, job), yellow('Missing key'), green('on'))
						failed = true
					} else if (!(typeof job.on == 'object' && Array.isArray(job.on))) {
						console.error(jsonError(localPath, json, job, 'on'), yellow('Must be an array'))
						failed = true
					} else {
						for (const onIndex in job.on) {
							if (typeof job.on[onIndex] != 'string') {
								console.error(jsonError(localPath, json, job.on, onIndex), yellow('Must be a string'))
								failed = true
							}
						}
					}

					if (!('commandName' in job)) {
						console.error(jsonError(localPath, json, job), yellow('Missing key'), green('commandName'))
						failed = true
					} else if (typeof job.commandName != 'string') {
						console.error(jsonError(localPath, json, job, 'commandName'), yellow('Must be a string'))
						failed = true
					}

					for (const jobKey in job) {
						if (jobKey != 'globPath'
							&& jobKey != 'on'
							&& jobKey != 'commandName'
						) {
							console.error(jsonError(localPath, json, job, jobKey), yellow('Unexpected key'))
						}
					}
				}
			}
		}
	}

	const scanFailed = scan(json, json, localPath)
	failed = failed || scanFailed

	if (failed) return
	return json
}
