const fs = require('fs')
const path = require('path')

const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

/**
 * @param {Object} json
 * @param {string} localPath
 * @returns {Object | undefined}
 */
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

	if (!('numColumnKeys' in json)) {
		console.error(fileError(localPath), yellow('Missing key'), green('numColumnKeys'))
		failed = true
	} else if (typeof json.numColumnKeys != 'number') {
		console.error(fileError(localPath), green('numColumnKeys'), yellow('must be a number'))
		failed = true
	}

	if (failed) return
	return json
}
