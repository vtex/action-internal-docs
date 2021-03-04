import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    // const x = github.context.payload
    const x = getInput('repo-token')
    // eslint-disable-next-line no-console
    console.log(x)
    const ctx = github.context
    const client = github.getOctokit(getInput('repo-token', {required: true}))
    const ref = await client.git.getRef({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      ref: ctx.ref
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(ref))
  } catch (error) {
    setFailed(error)
  }
}

run()
