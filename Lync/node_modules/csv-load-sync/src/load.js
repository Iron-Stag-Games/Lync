var check = require('check-more-types')
var fs = require('fs')
const { join } = require('path')
var eol = '\n'

const isContentLine = (line) => {
  line = line.trim()
  if (!line) {
    // skip blank lines
    return false
  }
  if (line[0] === '#') {
    // skip comments
    return false
  }
  return true
}

const skipComments = (lines) => {
  return lines.filter(isContentLine)
}

const getLinesFromText = (text) => {
  var lines = text.split(eol)
  console.assert(lines.length > 1, 'invalid number of lines ' + lines.length)
  const filteredLines = skipComments(lines)
  console.assert(
    lines.length > 1,
    'invalid number of filtered lines ' + filteredLines.length,
  )
  return filteredLines
}

const readFile = (filename) => {
  check.verify.string(filename, 'missing filename')
  const content = fs.readFileSync(filename, 'utf-8')
  check.verify.string(content, 'missing content from ' + filename)

  return getLinesFromText(content)
}

const getHeadersFromLines = (filteredLines, splitToColumns) => {
  const columns = stripQuotes(splitToColumns(filteredLines[0], 0))
  return columns
}

const getHeaders = (filename, options) => {
  options = options || {}
  const splitToColumns = check.fn(options.getColumns)
    ? options.getColumns
    : getColumns

  const filteredLines = readFile(filename)
  return getHeadersFromLines(filteredLines, splitToColumns)
}

function parseLines(filteredLines, options) {
  options = options || {}
  const convert = options.convert || {}
  let skip = options.skip || []
  if (typeof skip === 'string') {
    skip = [skip]
  }
  check.verify.strings(skip, 'expected list of columns to skip')
  const skipColumns = {}
  skip.forEach((s) => {
    skipColumns[s] = true
  })

  const splitToColumns = check.fn(options.getColumns)
    ? options.getColumns
    : getColumns

  console.assert(
    filteredLines.length > 1,
    'invalid number of filtered lines ' + filteredLines.length,
  )

  const results = []
  const columns = getHeadersFromLines(filteredLines, splitToColumns)

  check.verify.array(
    columns,
    'could not get columns from first line ' + filteredLines[0],
  )

  filteredLines.forEach(function (line, index) {
    if (index === 0) {
      return // we already have columns
    }

    var obj = {}
    var values = stripQuotes(splitToColumns(line, index))

    check.verify.array(values, 'could not get values from line ' + line)
    console.assert(
      values.length === columns.length,
      'expected values from line ' +
        line +
        ' to match property names ' +
        ' from first line ' +
        filteredLines[0],
    )

    values.forEach(function (value, columnIndex) {
      const key = columns[columnIndex]
      if (skipColumns[key]) {
        return
      }
      if (check.fn(convert[key])) {
        obj[key] = convert[key](value)
      } else {
        obj[key] = value
      }
    })
    results.push(obj)
  })

  return results
}

function parseCSV(text, options) {
  const filteredLines = getLinesFromText(text)
  return parseLines(filteredLines, options)
}

function load(filename, options) {
  const filteredLines = readFile(filename)
  return parseLines(filteredLines, options)
}

function getColumns(line) {
  check.verify.string(line, 'missing header line')

  const regex = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g

  const columns = []
  do {
    m = regex.exec(line)
    if (m) {
      if (typeof m[2] === 'undefined') {
        // check if match group 3 is set (e.g. for booleans)
        if (typeof m[3] !== 'undefined') {
          columns.push(m[3])
        } else {
          // add empty value since column seems to be empty
          columns.push('')
        }
      } else {
        columns.push(m[2])
      }
    }
  } while (m)

  console.assert(
    columns.length >= 1,
    'invalid columns ' + JSON.stringify(columns) + ' from line ' + line,
  )
  return columns
}

function stripQuotes(words) {
  check.verify.array(words, 'missing an array')
  return words.map(function (word) {
    check.verify.string(word, 'expected string, found ' + word)
    word = word.trim()
    return word.replace(/"/g, '')
  })
}

module.exports = { load, getHeaders, parseCSV }
