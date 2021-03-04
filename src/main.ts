import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    // const x = github.context.payload
    const x = getInput('repo-token')
    // eslint-disable-next-line no-console
    console.log(x)
    const client = github.getOctokit(getInput('repo-token', {required: true}))
    const pulls = await client.pulls.list({
      owner: 'vtex',
      repo: 'action-internal-docs'
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(pulls))
  } catch (error) {
    setFailed(error.message)
  }
}

run()
