#!/usr/bin/env node

const [, , expected, actual] = process.argv

if (expected !== actual) {
  process.exit(1)
}
