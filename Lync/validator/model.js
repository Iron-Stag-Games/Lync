const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

/**
 * @param {Object} json
 * @param {string} localPath
 * @returns {boolean}
 */
function scan(json, localPath) {
	let failed = false

	if (('Name' in json) && typeof json.Name != 'string') {
		console.error(fileError(localPath), green('Name'), yellow('must be a string'))
		failed = true
	}

	if (('ClassName' in json) && typeof json.ClassName != 'string') {
		console.error(fileError(localPath), green('ClassName'), yellow('must be a string'))
		failed = true
	}

	if (('Properties' in json) && !(typeof json.Properties == 'object' && !Array.isArray(json.Properties))) {
		console.error(fileError(localPath), green('Properties'), yellow('must be an object'))
		failed = true
	} else {
		for (const property in json.Properties) {
			if (typeof json.Properties[property] == 'object' && Array.isArray(json.Properties[property]) && json.Properties[property].length > 1) {
				console.error(fileError(localPath), yellow('Property'), green(property), yellow('is an array with size > 1; check property syntax'))
				failed = true
			}
		}
	}

	if ('Children' in json) {
		if (!(typeof json.Children == 'object' && Array.isArray(json.Children))) {
			console.error(fileError(localPath), green('Children') , yellow('must be an array'))
			failed = true
		} else {
			for (const child of json.Children) {
				const scanFailed = scan(child, localPath)
				failed = failed || scanFailed
			}
		}
	}

	return failed
}

/**
 * @param {Object} json
 * @param {string} localPath
 * @returns {Object | undefined}
 */
module.exports.validate = function(json, localPath) {
	if (scan(json, localPath)) return
	return json
}
