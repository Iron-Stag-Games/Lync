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
		if (key == 'Name') {
			if (typeof json.Name != 'string') {
				console.error(jsonError(localPath, root, json, 'Name'), yellow('Must be a string'))
				failed = true
			}
	
		} else if (key == 'ClassName') {
			if (typeof json.ClassName != 'string') {
				console.error(jsonError(localPath, root, json, 'ClassName'), yellow('Must be a string'))
				failed = true
			}

		} else if (key == 'Properties') {
			if (!(typeof json.Properties == 'object' && !Array.isArray(json.Properties))) {
				console.error(jsonError(localPath, root, json, 'Properties'), yellow('Must be an object'))
				failed = true
			} else {
				for (const property in json.Properties) {
					if (typeof json.Properties[property] == 'object' && Array.isArray(json.Properties[property]) && json.Properties[property].length > 1) {
						console.error(jsonError(localPath, root, json, property), yellow('Array with size > 1; check property syntax'))
						failed = true
					}
				}
			}

		} else if (key == 'Children') {
			if (!(typeof json.Children == 'object' && Array.isArray(json.Children))) {
				console.error(jsonError(localPath, root, json, 'Children') , yellow('Must be an array'))
				failed = true
			} else {
				for (const child of json.Children) {
					const scanFailed = scan(child, root, localPath)
					failed = failed || scanFailed
				}
			}

		} else {
			console.error(jsonError(localPath, root, json, key), yellow('Unexpected key'))
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
	if (scan(json, json, localPath)) return
	return json
}
