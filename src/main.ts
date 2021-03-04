import {debug, setFailed} from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    const x = github.context.payload.action

    debug(x || '')
  } catch (error) {
    setFailed(error.message)
  }
}

run()
