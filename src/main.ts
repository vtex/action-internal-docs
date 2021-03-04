import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    // const x = github.context.payload
    const x = getInput('repo-token')
    await exec.exec('ls')
    await exec.exec('tree')
    // eslint-disable-next-line no-console
    console.log(x)
    const ctx = github.context

    const client = github.getOctokit(getInput('repo-token'))
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(ctx.repo))
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(ctx.eventName))
    const ref = await client.git.getRef({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      ref: 'heads/main'
    })

    const repo = await client.git.getRef({
      owner: ctx.repo.owner,
      repo: 'internal-documentation-portal',
      ref: 'heads/main'
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(ref))
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(repo))
  } catch (error) {
    setFailed(error)
  }
}

run()
