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
		if (key == 'name') {
			if (typeof json.name != 'string') {
				console.error(jsonError(localPath, root, json, 'name'), yellow('Must be a string'))
				failed = true
			}
	
		} else if (key == 'className') {
			if (typeof json.className != 'string') {
				console.error(jsonError(localPath, root, json, 'className'), yellow('Must be a string'))
				failed = true
			}

		} else if (key == 'properties') {
			if (!(typeof json.properties == 'object' && !Array.isArray(json.properties))) {
				console.error(jsonError(localPath, root, json, 'properties'), yellow('Must be an object'))
				failed = true
			} else {
				for (const property in json.properties) {
					if (typeof json.properties[property] == 'object' && Array.isArray(json.properties[property]) && json.properties[property].length > 1) {
						console.error(jsonError(localPath, root, json, property), yellow('Array with size > 1; check property syntax'))
						failed = true
					}
				}
			}

		} else if (key == 'children') {
			if (!(typeof json.children == 'object' && Array.isArray(json.children))) {
				console.error(jsonError(localPath, root, json, 'children') , yellow('Must be an array'))
				failed = true
			} else {
				for (const child of json.children) {
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
