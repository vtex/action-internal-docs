#!/usr/bin/env node

/* eslint-disable no-await-in-loop */
// @ts-check

const fs = require('fs/promises')
const path = require('path')

const io = require('@actions/io')
const exec = require('@actions/exec')
const recursiveReadDir = require('recursive-readdir')

async function run() {
  const branchesDir = path.resolve(__dirname, '..', 'branches')

  const paths = (await recursiveReadDir(branchesDir)).map((filePath) =>
    path.relative(branchesDir, filePath)
  )

  /** @type Record<string, Record<string, string>> */
  const directorySchema = {}

  for (const filePath of paths) {
    const [dirName, ...relativeFilePath] = filePath.split('/')

    if (!directorySchema[dirName]) {
      directorySchema[dirName] = {}
    }

    directorySchema[dirName][relativeFilePath.join('/')] = (
      await fs.readFile(path.join(branchesDir, filePath))
    ).toString()
  }

  for (const [branchName, directoryStructure] of Object.entries(
    directorySchema
  )) {
    await exec.exec('git', ['switch', '--orphan', `test-case/${branchName}`])

    for (const [filePath, content] of Object.entries(directoryStructure)) {
      const filePathDir = path.dirname(filePath)

      await io.mkdirP(filePathDir)

      await fs.writeFile(filePath, content)
      await exec.exec('git', ['add', filePath])
    }

    await exec.exec('git', [
      'commit',
      '-m',
      'Automatic synchronization of test-case branch',
    ])

    await exec.exec('git', ['push', '-f', 'origin', `test-case/${branchName}`])
  }
}

run()
