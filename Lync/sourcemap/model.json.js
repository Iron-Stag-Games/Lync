/**
 * @param {any} target 
 * @param {any} json 
 */
function recurse(target, json) {
	target.className = json.ClassName || 'Folder'

	if (json.Children) {
		for (const key in json.Children) {
			let nextTarget = target
			const jsonChild = json.Children[key]

			// Map under existing child
			let hasChild = false
			for (const child of nextTarget.children) {
				if (child.name == jsonChild.Name) {
					nextTarget = child
					hasChild = true
					break
				}
			}

			// Add new child
			if (!hasChild) {
				nextTarget = nextTarget.children[nextTarget.children.push({
					'name': jsonChild.Name,
					'className': 'Folder',
					'filePaths': [],
					'children': []
				}) - 1]
			}

			recurse(nextTarget, jsonChild)
		}
	}
}

/**
 * @param {any} target 
 * @param {string} fileRead 
 */
module.exports.fill = function(target, fileRead) {
	recurse(target, JSON.parse(fileRead))
}
