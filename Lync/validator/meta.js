const { red, yellow, green, cyan, fileError, jsonError } = require('../output.js')

/**
 * @param {Object} json
 * @param {string} localPath
 * @returns {Object | undefined}
 */
module.exports.validate = function(json, localPath) {
	let failed = false

	for (const key in json) {
		if (key == 'ignoreUnknownInstances') {
			console.error(fileError(localPath), 'Unsupported key', green('ignoreUnknownInstances') + '; must replace with', green('clearOnSync'))
			failed = true

		} else if (key == 'className') {
			if (typeof json[key] != 'string') {
				console.error(fileError(localPath), green('className') , yellow('must be a string'))
				failed = true
			}

		} else if (key == 'properties') {
			if (!((typeof json[key] == 'object') && !Array.isArray(json[key]))) {
				console.error(fileError(localPath), green('properties') , yellow('must be an object'))
				failed = true
			}

		} else if (key == 'attributes') {
			if (!((typeof json[key] == 'object') && !Array.isArray(json[key]))) {
				console.error(fileError(localPath), green('attributes') , yellow('must be an object'))
				failed = true
			}

		} else if (key == 'tags') {
			if (!((typeof json[key] == 'object') && Array.isArray(json[key]))) {
				console.error(fileError(localPath), green('tags') , yellow('must be an array'))
				failed = true
			}

		} else if (key == 'clearOnSync') {
			if (typeof json[key] != 'boolean') {
				console.error(fileError(localPath), green('clearOnSync') , yellow('must be a boolean'))
				failed = true
			}

		} else {
			console.error(fileError(localPath), 'Unexpected key', green(key))
		}
	}

	if (failed) return
	return json
}
