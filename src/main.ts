import {setFailed, getInput} from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'
import crypto from 'crypto'
import recursive from 'recursive-readdir'

import {
  createBlobForFile,
  createBranch,
  createNewCommit,
  createNewTree,
  getCurrentCommit,
  // mergePullRequest,
  setBranchRefToCommit
} from './octokit'

async function run(): Promise<void> {
  try {
    const files = (await recursive('./docs')).map(file => {
      return {
        name: file,
        content: file.endsWith('.md')
          ? fs.readFileSync(`${file}`).toString()
          : fs.readFileSync(`${file}`)
      }
    })

    const client = github.getOctokit(getInput('repo-token'))
    const product = getInput('docs-product', {required: true})

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
      file => `docs/${product}/${file.name.replace('docs/', '')}`
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

    await client.pulls.create({
      owner,
      repo,
      title: `Docs incoming`,
      head: branchToPush,
      base: defaultBranch,
      body: 'docs incoming'
    })

    // await mergePullRequest(client, {owner, repo, pullNumber: pull.number})
  } catch (error) {
    setFailed(error)
    throw error
  }
}

run()
