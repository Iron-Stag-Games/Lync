/**
 * @param {Object} target
 * @param {Object} json
 */
function recurse(target, json) {
	target.className = json.className || 'Folder'

	if (json.children) {
		for (const key in json.children) {
			let nextTarget = target
			const jsonChild = json.children[key]

			// Map under existing child
			let hasChild = false
			for (const child of nextTarget.children) {
				if (child.name == jsonChild.name) {
					nextTarget = child
					hasChild = true
					break
				}
			}

			// Add new child
			if (!hasChild) {
				nextTarget = nextTarget.children[nextTarget.children.push({
					'name': jsonChild.name || jsonChild.className,
					'className': '',
					'filePaths': [],
					'children': []
				}) - 1]
			}

			recurse(nextTarget, jsonChild)
		}
	}
}

/**
 * @param {Object} target
 * @param {string} fileRead
 */
module.exports.fill = function(target, fileRead) {
	recurse(target, JSON.parse(fileRead))
}
