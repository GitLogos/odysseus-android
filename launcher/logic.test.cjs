'use strict';

const assert = require('node:assert/strict');
const { destination, normalize } = require('./logic.js');

assert.equal(normalize('example.com'), 'http://example.com');
assert.equal(normalize(' https://example.com/path/ '), 'https://example.com/path');
assert.equal(normalize('http://192.168.1.20:7000/'), 'http://192.168.1.20:7000');
assert.equal(normalize('ftp://example.com'), '');
assert.equal(normalize('not a host'), '');

assert.equal(
  destination('https://example.com/base?mode=mobile', true),
  'https://example.com/base?mode=mobile&strict_chat=1',
);
assert.equal(
  destination('https://example.com/?strict_chat=1&mode=mobile', false),
  'https://example.com/?mode=mobile',
);

console.log('launcher logic tests passed');
