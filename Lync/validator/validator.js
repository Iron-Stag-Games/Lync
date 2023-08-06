const TOML = require('toml')
const YAML = require('yaml')

const { red, yellow, green, cyan, fileError, fileWarning } = require('../output.js')

const meta = require('./meta.js')
const project = require('./project.js')
const model = require('./model.js')
const excel = require('./excel.js')

const UTF8 = new TextDecoder('utf-8')

module.exports.validateJson = function(type, localPath, fileRead) {
	let json;
	try {
		json = JSON.parse(fileRead)
	} catch (err) {
		console.error(red('Project error:'), yellow('Malformed JSON'), cyan(localPath), yellow(err))
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

module.exports.validateYaml = function(type, localPath, fileRead) {
	let json;
	try {
		json = YAML.parse(UTF8.decode(fileRead))
	} catch (err) {
		console.error(red('Project error:'), yellow('Malformed YAML'), cyan(localPath), yellow(err))
	}
	switch (type) {
		case 'Meta':
			return meta.validate(json, localPath)
		default:
			return json
	}
}

module.exports.validateToml = function(type, localPath, fileRead) {
	let json;
	try {
		json = TOML.parse(UTF8.decode(fileRead))
	} catch (err) {
		console.error(red('Project error:'), yellow('Malformed TOML'), cyan(localPath), yellow(err))
	}
	switch (type) {
		case 'Meta':
			return meta.validate(json, localPath)
		default:
			return json
	}
}
