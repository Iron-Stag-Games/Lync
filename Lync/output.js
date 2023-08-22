const process = require('process')

const drop = '\n └──'

module.exports.red = function red(s) {
	return '\x1b[31m' + s + '\x1b[0m'
}

module.exports.yellow = function(s) {
	return '\x1b[33m' + s + '\x1b[0m'
}

module.exports.green = function(s, hideQuotes) {
	return hideQuotes && ('\x1b[32m' + s + '\x1b[0m') || ('\x1b[32m\'' + s + '\'\x1b[0m')
}

module.exports.cyan = function(s, hideBrackets) {
	if (process.platform == 'win32') {
		return hideBrackets && ('\x1b[36m' + s.replace(/\//g, '\\') + '\x1b[0m') || ('\x1b[36m[' + s.replace(/\//g, '\\') + ']\x1b[0m')
	} else {
		return hideBrackets && ('\x1b[36m' + s.replace(/\\/g, '/') + '\x1b[0m') || ('\x1b[36m[' + s.replace(/\\/g, '/') + ']\x1b[0m')
	}
}

module.exports.fileError = function(s) {
	if (process.platform == 'win32') {
		return '\x1b[31m[' + s.replace(/\//g, '\\') + ']\x1b[0m' + module.exports.yellow(drop)
	} else {
		return '\x1b[31m[' + s.replace(/\\/g, '/') + ']\x1b[0m' + module.exports.yellow(drop)
	}
}

module.exports.fileWarning = function(s) {
	if (process.platform == 'win32') {
		return '\x1b[33m[' + s.replace(/\//g, '\\') + ']\x1b[0m' + drop
	} else {
		return '\x1b[33m[' + s.replace(/\\/g, '/') + ']\x1b[0m' + drop
	}
}
