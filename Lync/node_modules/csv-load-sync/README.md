# csv-load-sync

Sync loading routine for a small comma-separated values file (.csv). Returns an array of objects, takes property names from
the first line. Assumes everything is a string in quotes.

[![Package info][nodei.co]](https://npmjs.org/package/csv-load-sync)

[![ci status][ci image]][ci url]
[![semantic-release][semantic-image] ][semantic-url]

## Install

Requires nodejs

    npm install -S csv-load-sync

## Inputs

Example CSV file with two records

    "deviceId","description"
    "1","iPhone 4"
    "2","iPhone 4S"

Example CSV file with three records

    "id","firstName","lastName","country","lastLogin"
    "1","John","Smith","US","2013-08-04 23:57:38"
    "2","Greg","Smith","US","2013-07-12 13:27:18"
    "3","Harold","Smith","GB","2013-07-16 21:17:28"

## Simple example

```js
const {load} = require('csv-load-sync');
const csv = load('path/to/file.csv');
// csv is an Array of objects
```

## Convert values

You can convert every value from string to a desired type for the specified columns. For example to convert device IDs to an integer, while make the descriptions all uppercase:

```js
const {load} = require('csv-load-sync')
const csv = load('./phone.csv', {
  convert: {
    deviceId: parseInt,
    description: (s) => s.toUpperCase(),
  },
})
// objects:
// deviceId: 1, description: "IPHONE 4"
// deviceId: 2, description: "IPHONE 4S"
```

Useful conversions:

- to boolean: `(s) => (s === 'true' ? true : false)`
- to integer: `parseInt`
- to floats: `parseFloat`

## Custom line splitting

Sometimes CSV data includes commas naturally, for example the follwing file
has GPS location numbers which should be considered together.

    "place","location"
    "home",-41.20,20.11
    "work",-41.3,20.2

We need to split each record line differently. You can pass the line to columns splitter
function when calling `load`

```js
function split(line, lineNumber) {
  if (lineNumber === 0) { // title line
    return line.split(',')
  }
  // our line will be <location>,<lat>,<lon>
  // and we want to combine lat and lon
  var parts = line.split(',')
  return [parts[0], parts[1] + ',' + parts[2]];
}
var results = load(filename, {
  getColumns: split
});
/*
[{
  place: 'home',
  location: '-41.20,20.11'
}, {
  place: 'work',
  location: '-41.3,20.2'
}]
*/
```

## Comments

Blank lines and lines starting with `#` are skipped.

## Skip columns

Sometimes you want to skip certain columns. Use an option:

```js
const results = load(filename, {
  skip: ['lastLogin', 'country'],
})
```

## Parse given text

If you load the CSV text yourself, you can use `` to parse it

```js
const {parseCSV} = require('csv-load-sync')
// csv is your text to be parsed
const records = parseCSV(csv)
```

## Get columns

You can just get the header names from the CSV file

```js
const {getHeaders} = require('csv-load-sync')
const names = getHeaders('path/to/file.csv')
// names is an array of strings
```

### Fine print

Author: Gleb Bahmutov &copy; 2015

* [@bahmutov](https://twitter.com/bahmutov)
* [glebbahmutov.com](https://glebbahmutov.com)
* [blog](https://glebbahmutov.com/blog/)
* [video channel](https://www.youtube.com/glebbahmutov)

License: MIT - do anything with the code, but don't blame me if it does not work.

Spread the word: tweet, star on github, etc.

[nodei.co]: https://nodei.co/npm/csv-load-sync.png?downloads=true
[semantic-image]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-url]: https://github.com/semantic-release/semantic-release
[ci image]: https://github.com/bahmutov/csv-load-sync/workflows/ci/badge.svg?branch=master
[ci url]: https://github.com/bahmutov/csv-load-sync/actions
