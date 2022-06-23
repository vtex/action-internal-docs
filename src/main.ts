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
  const ref = core.getInput('ref')

  if (ref) {
    core.info(`Switching to ref "${ref}"`)

    await exec('git', ['fetch', 'origin', ref], { silent: true })
    await exec('git', ['checkout', ref], { silent: true })
  }

  if (!fs.existsSync(DOCS_FOLDER)) {
    core.info(`Folder ${DOCS_FOLDER} does not exist, exiting.`)

    return
  }

  try {
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

    const upstreamRepoOwner =
      core.getInput('repo-owner') ?? INTERNAL_DOCS_REPO_OWNER

    const upstreamRepoName =
      core.getInput('repo-name') ?? INTERNAL_DOCS_REPO_NAME

    const upstreamRepoBranch =
      core.getInput('repo-branch') ?? INTERNAL_DOCS_DEFAULT_BRANCH

    const autoMergeEnabled = core.getInput('auto-merge')

    const kit = new TechDocsKit({
      client: github.getOctokit(repoToken),
      upstreamRepo: {
        owner: upstreamRepoOwner,
        repo: upstreamRepoName,
      },
      ownRepo: github.context.repo,
    })

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

    const branchToPush = kit.getNewUpstreamBranchName(github.context.sha)

    await kit.createBranchAndCommit({
      message: `
Documentation sync [from ${kit.ownRepoFormatted}]

Automatic synchronization triggered via GitHub Action.
This sync refers to the commit https://github.com/${kit.ownRepoFormatted}/commit/${github.context.sha}
`.trim(),
      baseBranch: upstreamRepoBranch,
      branchName: branchToPush,
      blobs,
      paths,
    })

    core.debug('Creating pull-request for branch')

    const pull = await kit.createPullRequest({
      title: `Docs sync (${kit.ownRepoFormatted})`,
      head: branchToPush,
      base: upstreamRepoBranch,
      body: `
Documentation synchronization from [GitHub action]

This update is refers to the following commit:

https://github.com/${kit.ownRepoFormatted}/commit/${github.context.sha}

[GitHub action]: http://github.com/vtex/action-internal-docs
`.trim(),
    })

    core.info(
      `Created pull-request https://github.com/${kit.upstreamRepoFormatted}/pull/${pull.number}`
    )

    core.setOutput('pull-request-number', pull.number)

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
        reason: `Failed to merge pull-request to branch "${upstreamRepoBranch}"`,
      })
    }
  } catch (error) {
    core.error('An unexpected error has ocurred')
    core.error(error)

    core.setFailed(error)
    throw error
  }
}

run()
