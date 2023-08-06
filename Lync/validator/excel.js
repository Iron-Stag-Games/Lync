const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

const fs = require('fs')
const path = require('path')

module.exports.validate = function(json, localPath) {
	let failed = false

	if (!('spreadsheet' in json)) {
		console.error(fileError(localPath), yellow('Missing key'), green('spreadsheet'))
		failed = true
	} else if (typeof json.spreadsheet != 'string') {
		console.error(fileError(localPath), green('spreadsheet'), yellow('must be a string'))
		failed = true
	} else if (!fs.existsSync(path.resolve(localPath, '..', json.spreadsheet))) {
		console.error(fileError(localPath), yellow('Spreadsheet'), cyan(json.spreadsheet), yellow('does not exist'))
		failed = true
	}

	if (!('ref' in json)) {
		console.error(fileError(localPath), yellow('Missing key'), green('ref'))
		failed = true
	} else if (typeof json.ref != 'string') {
		console.error(fileError(localPath), green('ref'), yellow('must be a string'))
		failed = true
	}

	if (!('hasHeader' in json)) {
		console.error(fileError(localPath), yellow('Missing key'), green('hasHeader'))
		failed = true
	} else if (typeof json.hasHeader != 'boolean') {
		console.error(fileError(localPath), green('hasHeader'), yellow('must be a boolean'))
		failed = true
	}

	if (!('firstValueIsKey' in json)) {
		console.error(fileError(localPath), yellow('Missing key'), green('firstValueIsKey'))
		failed = true
	} else if (typeof json.firstValueIsKey != 'boolean') {
		console.error(fileError(localPath), green('firstValueIsKey'), yellow('must be a boolean'))
		failed = true
	}

	if (failed) return
	return json
}
