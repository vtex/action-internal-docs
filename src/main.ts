import {debug, setFailed} from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    const x = github.context.payload
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(x))
    debug(x || '')
  } catch (error) {
    setFailed(error.message)
  }
}

run()
