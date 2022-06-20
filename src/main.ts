import crypto from 'crypto'

import { setFailed, getInput } from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'
import recursive from 'recursive-readdir'

import {
  createBlobForFile,
  createBranch,
  createNewCommit,
  createNewTree,
  getCurrentCommit,
  mergePullRequest,
  setBranchRefToCommit,
} from './octokit'

async function run(): Promise<void> {
  try {
    const files = (await recursive('./docs')).map((file) => {
      return {
        name: file,
        content:
          file.endsWith('png') ||
          file.endsWith('jpg') ||
          file.endsWith('gif') ||
          file.endsWith('jpeg')
            ? Buffer.from(
                fs.readFileSync(file, { encoding: 'binary' }),
                'binary'
              ).toString('base64')
            : fs.readFileSync(file).toString(),
      }
    })

    const client = github.getOctokit(getInput('repo-token'))
    const product = getInput('docs-product', { required: true })

    const owner = 'vtex'
    const repo = 'internal-docs'
    const defaultBranch = 'main'

    const currentDate = new Date().valueOf().toString()
    const random = Math.random().toString()

    const hash = crypto
      .createHash('sha1')
      .update(currentDate + random)
      .digest('hex')

    const branchToPush = `docs-${hash}`

    const currentCommit = await getCurrentCommit(client, {
      owner,
      repo,
      branch: defaultBranch,
    })

    const paths = files.map(
      (file) => `docs/${product}/${file.name.replace('docs/', '')}`
    )

    const blobs = await Promise.all(
      files.map(async (file) => {
        const { content } = file

        if (file.name.endsWith('png') || file.name.endsWith('jpg')) {
          return createBlobForFile(client, { owner, repo, content }, 'base64')
        }

        return createBlobForFile(client, { owner, repo, content })
      })
    )

    const newTree = await createNewTree(client, {
      owner,
      repo,
      blobs,
      paths,
      parentTreeSha: currentCommit.treeSha,
    })

    await createBranch(client, {
      owner,
      repo,
      branch: branchToPush,
      parentSha: currentCommit.commitSha,
    })

    const newCommit = await createNewCommit(client, {
      owner,
      repo,
      message: `docs`,
      treeSha: newTree.sha,
      currentCommitSha: currentCommit.commitSha,
    })

    await setBranchRefToCommit(client, {
      owner,
      repo,
      branch: branchToPush,
      commitSha: newCommit.sha,
    })

    const pull = (
      await client.pulls.create({
        owner,
        repo,
        title: `Docs incoming`,
        head: branchToPush,
        base: defaultBranch,
        body: 'docs incoming',
      })
    ).data

    await mergePullRequest(client, { owner, repo, pullNumber: pull.number })
  } catch (error) {
    setFailed(error)
    throw error
  }
}

run()
