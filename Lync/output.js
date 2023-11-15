const process = require('process')

const drop = '\n └──'
const drop2 = '\n └─┬'
const drop3 = '\n   └──'

/**
 * @param {string} s
 * @returns {string}
 */
module.exports.red = function red(s) {
	return '\x1b[31m' + s + '\x1b[0m'
}

/**
 * @param {string} s
 * @returns {string}
 */
module.exports.yellow = function(s) {
	return '\x1b[33m' + s + '\x1b[0m'
}

/**
 * @param {string} s
 * @param {boolean?} hideQuotes
 * @returns {string}
 */
module.exports.green = function(s, hideQuotes) {
	return hideQuotes && ('\x1b[32m' + s + '\x1b[0m') || ('\x1b[32m\'' + s + '\'\x1b[0m')
}

/**
 * @param {string} s
 * @param {boolean?} hideBrackets
 * @returns {string}
 */
module.exports.cyan = function(s, hideBrackets) {
	if (process.platform == 'win32') {
		return hideBrackets && ('\x1b[36m' + s.replace(/\//g, '\\') + '\x1b[0m') || ('\x1b[36m[' + s.replace(/\//g, '\\') + ']\x1b[0m')
	} else {
		return hideBrackets && ('\x1b[36m' + s.replace(/\\/g, '/') + '\x1b[0m') || ('\x1b[36m[' + s.replace(/\\/g, '/') + ']\x1b[0m')
	}
}

/**
 * @param {Object} from
 * @param {Object} to
 * @param {string?} append
 * @returns {string}
 */
function iterRelative(from, to, append) {
	if (from == to) {
		return append
	}
	for (const key in from) {
		const value = from[key]
		if (typeof value == 'object') {
			if (value == to) {
				return key
			} else {
				const next = iterRelative(value, to)
				if (next != '') {
					return key + '\\' + next + (append && ('\\' + append) || '')
				}
			}
		}
	}
	return ''
}

/**
 * @param {string} s
 * @returns {string}
 */
module.exports.fileError = function(s) {
	if (process.platform == 'win32') {
		return module.exports.red('[' + s.replace(/\//g, '\\') + ']') + module.exports.yellow(drop)
	} else {
		return module.exports.red('[' + s.replace(/\\/g, '/') + ']') + module.exports.yellow(drop)
	}
}

/**
 * @param {string} s
 * @param {Object} from
 * @param {Object} to
 * @param {string?} key
 * @returns {string}
 */
module.exports.jsonError = function(s, from, to, key) {
	if (process.platform == 'win32') {
		return module.exports.red('[' + s.replace(/\//g, '\\') + ']') + module.exports.yellow(drop2) + ' ' + module.exports.green(iterRelative(from, to, key)) + module.exports.yellow(drop3)
	} else {
		return module.exports.red('[' + s.replace(/\\/g, '/') + ']') + module.exports.yellow(drop2) + ' ' + module.exports.green(iterRelative(from, to, key)) + module.exports.yellow(drop3)
	}
}
