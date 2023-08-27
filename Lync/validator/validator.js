const TOML = require('toml')
const YAML = require('yaml')

const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

const meta = require('./meta.js')
const project = require('./project.js')
const model = require('./model.js')
const excel = require('./excel.js')

/**
 * @param {string?} type
 * @param {string} localPath
 * @param {string} fileRead
 * @returns {Object | undefined}
 */
module.exports.validateJson = function(type, localPath, fileRead) {
	let json;
	try {
		json = JSON.parse(fileRead)
	} catch (err) {
		console.error(fileError(localPath), yellow('Malformed JSON:'), yellow(err))
	}
	switch (type) {
		case 'Meta':
			return meta.validate(json, localPath)
		case 'MainProject':
		case 'SubProject':
			return project.validate(type, json, localPath)
		case 'Model':
			return model.validate(json, localPath)
		case 'Excel':
			return excel.validate(json, localPath)
		default:
			return json
	}
}

/**
 * @param {string?} type
 * @param {string} localPath
 * @param {string} fileRead
 * @returns {Object | undefined}
 */
module.exports.validateYaml = function(type, localPath, fileRead) {
	let json;
	try {
		json = YAML.parse(fileRead)
	} catch (err) {
		console.error(fileError(localPath), yellow('Malformed YAML:'), yellow(err))
	}
	switch (type) {
		case 'Meta':
			return meta.validate(json, localPath)
		default:
			return json
	}
}

/**
 * @param {string?} type
 * @param {string} localPath
 * @param {string} fileRead
 * @returns {Object | undefined}
 */
module.exports.validateToml = function(type, localPath, fileRead) {
	let json;
	try {
		json = TOML.parse(fileRead)
	} catch (err) {
		console.error(fileError(localPath), yellow('Malformed TOML:'), yellow(err))
	}
	switch (type) {
		case 'Meta':
			return meta.validate(json, localPath)
		default:
			return json
	}
}
