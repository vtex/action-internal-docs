import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    core.debug('s')
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
