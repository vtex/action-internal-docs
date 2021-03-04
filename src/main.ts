import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'
import crypto from 'crypto'

import {
  createBlobForFile,
  createBranch,
  createNewCommit,
  createNewTree,
  getCurrentCommit,
  setBranchRefToCommit
} from './octokit'
import {context} from '@actions/github/lib/utils'

async function run(): Promise<void> {
  try {
    const fileList = fs.readdirSync('./docs')
    const files = fileList.map(file => {
      return {name: file, content: fs.readFileSync(`./docs/${file}`).toString()}
    })
    const client = github.getOctokit(getInput('repo-token'))
    const owner = 'vtex'
    const repo = 'internal-documentation-portal'
    const defaultBranch = 'main'

    const current_date = new Date().valueOf().toString()
    const random = Math.random().toString()

    const hash = crypto
      .createHash('sha1')
      .update(current_date + random)
      .digest('hex')

    const branchToPush = `docs-${hash}`

    const currentCommit = await getCurrentCommit(client, {
      owner,
      repo,
      branch: defaultBranch
    })

    const paths = files.map(
      file => `docs/${context.repo.owner}-${context.repo.repo}/${file.name}`
    )

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
      branch: branchToPush,
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
      branch: branchToPush,
      commitSha: newCommit.sha
    })

    const pull = await client.pulls.create({
      owner,
      repo,
      title: `Docs incoming`,
      head: branchToPush,
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
