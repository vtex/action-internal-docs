import 'dotenv/config'
import os from 'os'
import { mkdtemp } from 'fs/promises'
import * as fs from 'fs'
import path from 'path'

import * as github from '@actions/github'
import * as core from '@actions/core'
import recursive from 'recursive-readdir'
import { exec } from '@actions/exec'

import { TechDocsKit } from './octokit'
import {
  INTERNAL_DOCS_REPO_NAME,
  INTERNAL_DOCS_REPO_OWNER,
  INTERNAL_DOCS_DEFAULT_BRANCH,
  DOCS_FOLDER,
} from './constants'
import { sortByPath } from './utils'

async function run(): Promise<void> {
  const ref = core.getInput('ref')

  let docsFolder = DOCS_FOLDER

  if (ref && ref !== process.env.GITHUB_REF_NAME) {
    core.info(`Using git ref ${ref}`)

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'docs-repo'))

    const serverUrl = new URL(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      process.env.GITHUB_SERVER_URL || 'https://github.com'
    )

    const encodedOnwer = encodeURIComponent(github.context.repo.owner)
    const encodedRepo = encodeURIComponent(github.context.repo.repo)

    const remoteUrl = `${serverUrl.origin}/${encodedOnwer}/${encodedRepo}.git`

    await core.group(
      `Creating local repository copy from ref "${ref}"`,
      async () => {
        await exec('git', ['init'], { cwd: tempDir })
        await exec('git', ['remote', 'add', 'origin', remoteUrl], {
          cwd: tempDir,
        })
        await exec('git', ['fetch', 'origin', ref], { cwd: tempDir })
        await exec('git', ['checkout', ref], { cwd: tempDir })
      }
    )

    docsFolder = path.join(tempDir, DOCS_FOLDER)
  }

  if (!fs.existsSync(docsFolder)) {
    core.info(`Folder ${DOCS_FOLDER} does not exist, exiting.`)

    return
  }

  try {
    const files = (await recursive(docsFolder)).map((file) => {
      return {
        name: path.relative(docsFolder, file),
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
      core.getInput('repo-owner') || INTERNAL_DOCS_REPO_OWNER

    const upstreamRepoName =
      core.getInput('repo-name') || INTERNAL_DOCS_REPO_NAME

    const upstreamRepoBranch =
      core.getInput('repo-branch') || INTERNAL_DOCS_DEFAULT_BRANCH

    const autoMergeEnabled = core.getInput('auto-merge')

    const octokitClient = github.getOctokit(repoToken)

    const kit = new TechDocsKit({
      client: octokitClient,
      upstreamRepo: {
        owner: upstreamRepoOwner,
        repo: upstreamRepoName,
      },
      ownRepo: github.context.repo,
    })

    const completeTree = await kit.getCompleteTree(
      upstreamRepoBranch,
      `docs/${product}`
    )

    const existingFiles = (
      await Promise.all(
        completeTree.filter(
          (leaf) =>
            leaf.path?.startsWith(`docs/${product}`) && leaf.type === 'blob'
        )
      )
    ).sort(sortByPath)

    const updatedFiles = (
      await Promise.all(
        files
          .map((file) => ({
            path: `docs/${product}/${file.name.replace('docs/', '')}`,
            content: file.content,
          }))
          .map(async ({ path: filePath, content }) => {
            let blob

            if (filePath.endsWith('png') || filePath.endsWith('jpg')) {
              blob = await kit.createBlobForFile({ content }, 'base64')
            } else {
              blob = await kit.createBlobForFile({ content })
            }

            return { path: filePath, file: { ...blob, content } }
          })
      )
    ).sort(sortByPath)

    // Check if diff is equal
    if (existingFiles.length === updatedFiles.length) {
      const areEqual = existingFiles.every(
        (file, index) =>
          file.path === updatedFiles[index].path &&
          file.sha === updatedFiles[index].file.sha
      )

      if (areEqual) {
        core.info(
          "Documentation haven't been changed, skipping docs pull-request"
        )

        return
      }
    }

    const branchToPush = kit.getNewUpstreamBranchName()

    try {
      await kit.createBranchAndCommit({
        message: `
Documentation sync [from ${kit.ownRepoFormatted}]

Automatic synchronization triggered via GitHub Action.
This sync refers to the commit https://github.com/${kit.ownRepoFormatted}/commit/${github.context.sha}
`.trim(),
        baseBranch: upstreamRepoBranch,
        branchName: branchToPush,
        files: updatedFiles,
      })
    } catch (err) {
      core.error(`Failed to create and push commits to branch ${branchToPush}`)
      core.setFailed(err)

      return
    }

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

    core.setFailed(error)
  }
}

run()
