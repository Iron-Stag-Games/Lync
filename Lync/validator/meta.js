const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

module.exports.validate = function(json, localPath) {
	let failed = false

	for (const key in json) {
		if (key == 'ignoreUnknownInstances') {
			console.error(fileWarning(localPath), 'Unsupported key', green('ignoreUnknownInstances') + '; must replace with', green('clearOnSync'))

		} else if (key == 'className' && (typeof json[key] != 'string')) {
			console.error(fileError(localPath), green('className') , yellow('must be a string'))
			failed = true

		} else if (key == 'properties' && !((typeof json[key] == 'object') && !Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('properties') , yellow('must be an object'))
			failed = true

		} else if (key == 'attributes' && !((typeof json[key] == 'object') && !Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('attributes') , yellow('must be an object'))
			failed = true

		} else if (key == 'tags' && !((typeof json[key] == 'object') && Array.isArray(json[key]))) {
			console.error(fileError(localPath), green('tags') , yellow('must be an array'))
			failed = true

		} else if (key == 'clearOnSync' && (typeof json[key] != 'boolean')) {
			console.error(fileError(localPath), green('clearOnSync') , yellow('must be a boolean'))
			failed = true

		} else if (key != 'className'
			&& key != 'properties'
			&& key != 'attributes'
			&& key != 'tags'
			&& key != 'clearOnSync'
		) {
			console.error(fileWarning(localPath), 'Unexpected key', green(key))
		}
	}

	if (failed) return
	return json
}
