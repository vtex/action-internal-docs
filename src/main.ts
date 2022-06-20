import * as github from '@actions/github'
import * as core from '@actions/core'
import * as fs from 'fs-extra'
import recursive from 'recursive-readdir'
import { exec } from '@actions/exec'

import { TechDocsKit } from './octokit'
import {
  INTERNAL_DOCS_REPO_NAME,
  INTERNAL_DOCS_REPO_OWNER,
  INTERNAL_DOCS_DEFAULT_BRANCH,
  DOCS_FOLDER,
} from './constants'

async function run(): Promise<void> {
  try {
    const ref = core.getInput('ref')

    if (ref) {
      await exec('git', ['fetch', 'origin', ref])
      await exec('git', ['checkout', ref])
    }

    if (!fs.existsSync(DOCS_FOLDER)) {
      core.info(`Folder ${DOCS_FOLDER} does not exist, exiting.`)

      return
    }

    const files = (await recursive(DOCS_FOLDER)).map((file) => {
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

    const repoToken = core.getInput('repo-token')
    const product = core.getInput('docs-product', { required: true })

    const repoOwner = core.getInput('repo-owner') ?? INTERNAL_DOCS_REPO_OWNER
    const repoName = core.getInput('repo-name') ?? INTERNAL_DOCS_REPO_NAME
    const repoBranch =
      core.getInput('repo-branch') ?? INTERNAL_DOCS_DEFAULT_BRANCH

    const autoMergeEnabled = core.getInput('auto-merge')

    const { owner: currentOwner, repo: currentRepo } = github.context.repo
    const ownRepoCommitSha = github.context.sha.slice(0, 8)

    const branchToPush = `docs-${currentOwner}-${currentRepo}-${ownRepoCommitSha}`

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

    core.debug(`Getting current commit for branch ${repoBranch}`)

    const currentCommit = await kit.getCurrentCommit({
      branch: repoBranch,
    })

    core.debug(
      `Creating tree for paths with parent ${
        currentCommit.treeSha
      }\n${paths.join('\n')}`
    )

    const newTree = await kit.createNewTree({
      blobs,
      paths,
      parentTreeSha: currentCommit.treeSha,
    })

    core.debug(`Creating branch ${branchToPush}`)

    await kit.createBranch({
      branch: branchToPush,
      parentSha: currentCommit.commitSha,
    })

    core.debug(`Creating commit in tree ${newTree.sha}`)

    const newCommit = await kit.createNewCommit({
      message: `docs`,
      treeSha: newTree.sha,
      currentCommitSha: currentCommit.commitSha,
    })

    core.debug(`Set branch ref to commit ${newCommit.sha}`)

    await kit.setBranchRefToCommit({
      branch: branchToPush,
      commitSha: newCommit.sha,
    })

    core.debug('Creating pull-request for branch')

    const pull = await kit.createPullRequest({
      title: `Docs sync (${currentOwner}/${currentRepo})`,
      head: branchToPush,
      base: repoBranch,
      body: `
Documentation synchronization from [GitHub action]

This update is refers to the following commit:

https://github.com/${currentOwner}/${currentRepo}/commit/${github.context.sha}

[GitHub action]: http://github.com/vtex/action-internal-docs
`.trim(),
    })

    try {
      core.debug('Trying to automatically merge pull-request')

      if (autoMergeEnabled === 'true') {
        await kit.mergePullRequest({
          pullNumber: pull.number,
        })
      } else {
        core.info('Auto merge skipped due to action configuration')
      }
    } catch (error) {
      core.debug('Pull-request auto merge failed')
      core.debug(error)

      await kit.closePullRequestAndDeleteBranch({
        pullNumber: pull.number,
        head: branchToPush,
        reason: `Failed to merge pull-request to branch "${repoBranch}"`,
      })
    }
  } catch (error) {
    core.debug('An unexpected error has ocurred')
    core.debug(error)

    core.setFailed(error)
    throw error
  }
}

run()
