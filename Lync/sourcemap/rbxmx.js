const XML = require('xml-js')

/**
 * @param {Object} target
 * @param {Object} xml
 */
function recurse(target, xml) {
	target.className = xml.attributes.class || 'Folder'

	for (const key in xml.elements) {
		let nextTarget = target
		const xmlChild = xml.elements[key]
		if (xmlChild.name != 'Item') continue

		let name;
		for (const property of xmlChild.elements[0].elements) {
			if (property.attributes.name == 'Name') {
				name = property.elements[0].text
				break
			}
		}

		// Map under existing child
		let hasChild = false
		for (const child of nextTarget.children) {
			if (child.name == name) {
				nextTarget = child
				hasChild = true
				break
			}
		}

		// Add new child
		if (!hasChild) {
			nextTarget = nextTarget.children[nextTarget.children.push({
				'name': name,
				'className': 'Folder',
				'filePaths': [],
				'children': []
			}) - 1]
		}

		recurse(nextTarget, xmlChild)
	}
}

/**
 * @param {Object} target
 * @param {string} fileRead
 */
module.exports.fill = function(target, fileRead) {
	const elements = JSON.parse(XML.xml2json(fileRead)).elements[0].elements
	for (const key in elements) {
		const element = elements[key]
		if (element.name == 'Item') {
			recurse(target, element)
			break
		}
	}
}
