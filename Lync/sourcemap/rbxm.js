const LZ4 = require("lz4js")
const ZSTD = require('fzstd')

const UTF8 = new TextDecoder('utf-8')

/**
 * @type {Buffer | Uint8Array}
 */
let buf;
/**
 * @type {number}
 */
let start;

/**
 * @param {number} bytes 
 * @returns {Buffer | Uint8Array}
 */
function readBytes(bytes) {
	const read = buf.subarray(start, start + bytes)
	start += bytes
	return read
}

/**
 * @param {number} bytes 
 * @returns {string}
 */
function readUTF8(bytes) {
	const read = buf.subarray(start, start + bytes)
	start += bytes
	return UTF8.decode(read)
}

/**
 * @returns {number}
 */
function readUInt8() {
	const read = buf.readUInt8(start)
	start += 1
	return read
}

/**
 * @returns {number}
 */
function readUInt32LE() {
	const read = buf.readUInt32LE(start)
	start += 4
	return read
}

/**
 * @param {number} value 
 * @returns {number}
 */
function untransform_i32(value) {
	if (value % 2 == 0) {
		return value / 2
	} else {
		return -(value + 1) / 2
	}
}

/**
 * @param {Int32Array} arr 
 * @returns {Buffer} 
 */
function read_interleaved_i32_array(arr) {
	const output = Buffer.alloc(arr.length)
	const len = arr.length / 4
	for (let i = 0; i < len; i++) {
		const buf = Buffer.from([ arr[i], arr[i + len], arr[i + len * 2], arr[i + len * 3] ])
		const untransformed = untransform_i32(buf.readInt32BE())
		output.writeInt32LE(untransformed, i * 4)
	}
	return output
}

/**
 * @param {number} length 
 * @returns {number[]} 
 */
function readReferentArray(length) {
	const output = []
	let referent = 0
	let referentStart = 0
	const referentArr = read_interleaved_i32_array(readBytes(length * 4))
	for (let i = 0; i < length; i++) {
		referent += referentArr.readInt32LE(referentStart)
		output.push(referent)
		referentStart += 4
	}
	return output
}

/**
 * @param {any} target 
 * @param {any[]} instances 
 * @param {any} rbxm 
 */
function recurse(target, instances, rbxm) {
	target.className = rbxm.className

	for (const childReferent of rbxm.children) {
		let nextTarget = target
		const rbxmChild = instances[childReferent]
		const name = rbxmChild.name
		const className = rbxmChild.className

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
				'className': className,
				'filePaths': [],
				'children': []
			}) - 1]
		}

		recurse(nextTarget, instances, rbxmChild)
	}
}

/**
 * @param {any} target 
 * @param {Uint8Array} fileRead 
 */
module.exports.fill = function(target, fileRead) {
	const instances = {}

	buf = fileRead
	start = 0

	start += 32 //const header = readBytes(32)
	//console.log('header:', header)
	while (start < fileRead.length) {
		const chunkName = readUTF8(4)
		const compressedLength = readUInt32LE()
		const uncompressedLength = readUInt32LE()
		start += 4 //const reserved = readBytes(4)
		//console.log('chunkName:', chunkName)
		//console.log('\tcompressedLength:', compressedLength)
		//console.log('\tuncompressedLength:', uncompressedLength)
		//console.log('\treserved:', reserved)

		let chunkData;
		if (compressedLength == 0) {
			chunkData = readBytes(uncompressedLength)
			//console.log('\tchunkData (uncompressed):', chunkData)
		} else {
			const magicNumber = buf.subarray(start, start + 4)
			if (magicNumber.equals(Buffer.from([ 0x28, 0xb5, 0x2f, 0xfd ]))) {
				chunkData = ZSTD.decompress(readBytes(compressedLength))
				//console.log('\tchunkData (ZSTD):', chunkData)
			} else {
				chunkData = Buffer.alloc(uncompressedLength)
				LZ4.decompressBlock(readBytes(compressedLength), chunkData, 0, compressedLength, 0)
				//console.log('\tchunkData (LZ4):', chunkData)
			}
		}

		const prevStart = start
		buf = chunkData
		start = 0

		if (chunkName == 'INST') {
			const classId = readUInt32LE()
			const classNameLength = readUInt32LE(4)
			const className = readUTF8(classNameLength)
			start += 1 //const objectFormat = readUInt8()
			const instanceCount = readUInt32LE()
			const referents = readReferentArray(instanceCount)
			//console.log('\t\tclassId:', classId)
			//console.log('\t\tclassNameLength:', classNameLength)
			//console.log('\t\tclassName:', className)
			//console.log('\t\tobjectFormat:', objectFormat)
			//console.log('\t\tinstanceCount:', instanceCount)
			//console.log('\t\tinstanceCount:', instanceCount)
			//console.log('\t\treferents:', referents)
			for (const referent of referents) {
				instances[referent] = {
					classId: classId,
					className: className,
					name: '',
					parent: -1,
					children: []
				}
			}
		} else if (chunkName == 'PROP') {
			const classId = readUInt32LE()
			const propertyNameLength = readUInt32LE(4)
			const propertyName = readUTF8(propertyNameLength)
			start += 1 //const typeId = readUInt8()
			//console.log('\t\tclassId:', classId)
			//console.log('\t\tpropertyNameLength:', propertyNameLength)
			//console.log('\t\tpropertyName:', propertyName)
			//console.log('\t\ttypeId:', typeId)
			if (propertyName == 'Name') {
				let numInstances = 0
				for (const referent in instances) {
					const instance = instances[referent]
					if (instance.classId == classId) {
						numInstances += 1
					}
				}
				//console.log('\t\t\tnumInstances:', numInstances)
				for (let index = 0; index < numInstances; index++) {
					const stringLength = readUInt32LE()
					const string = readUTF8(stringLength)
					//console.log('\t\t\tstringLength:', stringLength)
					//console.log('\t\t\tstring:', string)
					let nextIndex = 0
					for (const referent in instances) {
						const instance = instances[referent]
						if (instance.classId == classId) {
							if (index == nextIndex) {
								instance.name = string
								break
							}
							nextIndex += 1
						}
					}
				}
			}
		} else if (chunkName == 'PRNT') {
			start += 1 //const version = readUInt8()
			const instanceCount = readUInt32LE()
			const childReferents = readReferentArray(instanceCount)
			const parentReferents = readReferentArray(instanceCount)
			//console.log('\t\tversion:', version)
			//console.log('\t\tinstanceCount:', instanceCount)
			//console.log('\t\tchildReferents:', childReferents)
			//console.log('\t\tparentReferents:', parentReferents)
			for (let index = 0; index < instanceCount; index++) {
				instances[childReferents[index]].parent = parentReferents[index]
				if (parentReferents[index] >= 0)
					instances[parentReferents[index]].children.push(childReferents[index])
			}
		}

		buf = fileRead
		start = prevStart
	}

	//console.log(instances)

	for (const referent in instances) {
		const instance = instances[referent]
		if (instance.parent == -1) {
			recurse(target, instances, instance)
			break
		}
	}

	//console.log(target)
}
