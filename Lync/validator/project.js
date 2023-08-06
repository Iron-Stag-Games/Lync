const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

function scan(json, localPath) {
	let failed = false

	for (const key in json) {
		if (key == '$ignoreUnknownInstances') {
			console.error(fileWarning(localPath), 'Unsupported key', green('$ignoreUnknownInstances') + '; must replace with', green('$clearOnSync'))

		} else if (key == '$className' && typeof json[key] != 'string') {
			console.error(fileError(localPath), green('$className') , yellow('must be a string'))
			failed = true

		} else if (key == '$properties' && !(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('$properties') , yellow('must be a dictionary'))
			failed = true

		} else if (key == '$attributes' && !(typeof json[key] == 'object' && !Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('$attributes') , yellow('must be a dictionary'))
			failed = true

		} else if (key == '$tags' && !(typeof json[key] == 'object' && Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('$tags') , yellow('must be an array'))
			failed = true

		} else if (key == '$clearOnSync' && (typeof json[key] != 'boolean')) {
			console.error(fileError(localPath), green('$clearOnSync') , yellow('must be a boolean'))
			failed = true

		} else if (typeof json[key] == 'object') {
			if (key == '$properties') {
				for (const property in json[key]) {
					if (typeof json[key][property] == 'object' && Array.isArray(json[key][property]) && json[key][property].length > 1) {
						console.error(fileError(localPath), yellow('Property'), green(property), yellow('is an array with size > 1; check property syntax'))
						failed = true
					}
				}
			}
			const scanFailed = scan(json[key], localPath)
			failed = failed || scanFailed
		}
	}

	return failed
}

module.exports.validate = function(type, json, localPath) {
	let failed = false

	if (type == 'MainProject') {
		if (!('name' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('name'))
			failed = true
		}
		if (!('base' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('base'))
			failed = true
		}
		if (!('build' in json)) {
			console.error(fileError(localPath), yellow('Missing key'), green('build'))
			failed = true
		}
	}

	const scanFailed = scan(json, localPath)
	failed = failed || scanFailed

	if (failed) return
	return json
}
