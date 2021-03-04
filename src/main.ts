import {debug, setFailed} from '@actions/core'

async function run(): Promise<void> {
  try {
    debug('s')
  } catch (error) {
    setFailed(error.message)
  }
}

run()
