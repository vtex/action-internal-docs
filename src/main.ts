import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'

async function run(): Promise<void> {
  try {
    // const x = github.context.payload
    const x = getInput('repo-token')
    // eslint-disable-next-line no-console
    console.log(x)
    const ctx = github.context
    const fileList = fs.readdirSync('./docs')
    const files = fileList.map(file => {
      return {name: file, content: fs.readFileSync(`./docs/${file}`)}
    })
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(files))
    const client = github.getOctokit(getInput('repo-token'))

    const repo = await client.git.getRef({
      owner: ctx.repo.owner,
      repo: 'internal-documentation-portal',
      ref: 'heads/main'
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(fileList))
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(repo))
  } catch (error) {
    setFailed(error)
  }
}

run()
