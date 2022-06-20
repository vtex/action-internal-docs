import crypto from 'crypto'

import { setFailed, getInput } from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs-extra'
import recursive from 'recursive-readdir'

import { TechDocsKit } from './octokit'
import {
  INTERNAL_DOCS_REPO_NAME,
  INTERNAL_DOCS_REPO_OWNER,
  INTERNAL_DOCS_DEFAULT_BRANCH,
} from './constants'

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

    const repoToken = getInput('repo-token')
    const product = getInput('docs-product', { required: true })

    const repoOwner = getInput('repo-owner') ?? INTERNAL_DOCS_REPO_OWNER
    const repoName = getInput('repo-name') ?? INTERNAL_DOCS_REPO_NAME

    const currentDate = new Date().valueOf().toString()
    const random = Math.random().toString()

    const hash = crypto
      .createHash('sha1')
      .update(currentDate + random)
      .digest('hex')

    const branchToPush = `docs-${hash}`

    const kit = new TechDocsKit(
      github.getOctokit(repoToken),
      repoOwner,
      repoName
    )

    const paths = files.map(
      (file) => `docs/${product}/${file.name.replace('docs/', '')}`
    )

    const blobs = await Promise.all(
      files.map(async (file) => {
        const { content } = file

        if (file.name.endsWith('png') || file.name.endsWith('jpg')) {
          return kit.createBlobForFile({ content }, 'base64')
        }

        return kit.createBlobForFile({ content })
      })
    )

    const currentCommit = await kit.getCurrentCommit({
      branch: INTERNAL_DOCS_DEFAULT_BRANCH,
    })

    const newTree = await kit.createNewTree({
      blobs,
      paths,
      parentTreeSha: currentCommit.treeSha,
    })

    await kit.createBranch({
      branch: branchToPush,
      parentSha: currentCommit.commitSha,
    })

    const newCommit = await kit.createNewCommit({
      message: `docs`,
      treeSha: newTree.sha,
      currentCommitSha: currentCommit.commitSha,
    })

    await kit.setBranchRefToCommit({
      branch: branchToPush,
      commitSha: newCommit.sha,
    })

    const { owner: currentOwner, repo: currentRepo } = github.context.repo

    const pull = await kit.createPullRequest({
      title: `Docs sync (${currentOwner}/${currentRepo})`,
      head: branchToPush,
      base: INTERNAL_DOCS_DEFAULT_BRANCH,
      body: `
Documentation synchronization from [GitHub action]

This update is refers to the following commit:

https://github.com/${currentOwner}/${currentRepo}/commit/${github.context.sha}

[GitHub action]: http://github.com/vtex/action-internal-docs
`.trim(),
    })

    try {
      await kit.mergePullRequest({
        pullNumber: pull.number,
      })
    } catch {
      await kit.closePullRequestAndDeleteBranch({
        pullNumber: pull.number,
        head: branchToPush,
        reason: `Failed to merge pull-request to branch "${INTERNAL_DOCS_DEFAULT_BRANCH}"`,
      })
    }
  } catch (error) {
    setFailed(error)
    throw error
  }
}

run()
