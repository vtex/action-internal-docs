import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'
import {
  createBlobForFile,
  createBranch,
  createNewCommit,
  createNewTree,
  getCurrentCommit,
  setBranchRefToCommit
} from './octokit'

async function run(): Promise<void> {
  try {
    // const x = github.context.payload
    const x = getInput('repo-token')
    // eslint-disable-next-line no-console
    console.log(x)

    const fileList = fs.readdirSync('./docs')
    const files = fileList.map(file => {
      return {name: file, content: fs.readFileSync(`./docs/${file}`).toString()}
    })
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(files))
    const client = github.getOctokit(getInput('repo-token'))
    const owner = 'vtex'
    const repo = 'internal-documentation-portal'
    const defaultBranch = 'main'

    const currentCommit = await getCurrentCommit(client, {
      owner,
      repo,
      branch: defaultBranch
    })

    const paths = files.map(file => file.name)

    const blobs = await Promise.all(
      files.map(async file => {
        const content = file.content

        return createBlobForFile(client, {owner, repo, content})
      })
    )

    const newTree = await createNewTree(client, {
      owner,
      repo,
      blobs,
      paths,
      parentTreeSha: currentCommit.treeSha
    })

    await createBranch(client, {
      owner,
      repo,
      branch: 'docs',
      parentSha: currentCommit.commitSha
    })

    const newCommit = await createNewCommit(client, {
      owner,
      repo,
      message: `docs`,
      treeSha: newTree.sha,
      currentCommitSha: currentCommit.commitSha
    })

    await setBranchRefToCommit(client, {
      owner,
      repo,
      branch: 'docs',
      commitSha: newCommit.sha
    })

    const pull = await client.pulls.create({
      owner,
      repo,
      title: `Docs incoming`,
      head: 'docs',
      base: defaultBranch,
      body: 'docs incoming'
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(pull))
  } catch (error) {
    setFailed(error)
  }
}

run()
