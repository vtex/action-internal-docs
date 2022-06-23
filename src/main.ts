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
import { sortByPath } from './utils'

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

    const { data: baseBranchRef } = await octokitClient.git.getRef({
      owner: upstreamRepoOwner,
      repo: upstreamRepoName,
      ref: `heads/${upstreamRepoBranch}`,
    })

    const { data: baseBranchTree } = await octokitClient.git.getTree({
      owner: upstreamRepoOwner,
      repo: upstreamRepoName,
      tree_sha: baseBranchRef.object.sha,
    })

    const completeTree = await getTreeRecursive(
      baseBranchTree.tree,
      (sha) =>
        octokitClient.git
          .getTree({
            owner: upstreamRepoOwner,
            repo: upstreamRepoName,
            tree_sha: sha,
          })
          .then(({ data }) => data.tree),
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
          .map(async ({ path, content }) => {
            let blob

            if (path.endsWith('png') || path.endsWith('jpg')) {
              blob = await kit.createBlobForFile({ content }, 'base64')
            } else {
              blob = await kit.createBlobForFile({ content })
            }

            return { path, file: { ...blob, content } }
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

type TreeNode = {
  sha: string
  path: string
  type: string
}

async function getTreeRecursive(
  tree: Array<Partial<TreeNode>>,
  getTree: (sha: string) => Promise<Array<Partial<TreeNode>>>,
  prefix: string
): Promise<TreeNode[]> {
  const result = []
  const prefixParts = prefix.split('/')

  const [treeHead] = prefixParts

  for (const leaf of tree) {
    if (leaf.type === 'tree') {
      if (treeHead && leaf.path !== treeHead) {
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const subTree = await getTree(leaf.sha!)

      // eslint-disable-next-line no-await-in-loop
      const completeSubTree = await getTreeRecursive(
        subTree,
        getTree,
        prefixParts.slice(1).join('/')
      )

      for (const subleaf of completeSubTree) {
        result.push({ ...subleaf, path: `${leaf.path}/${subleaf.path}` })
      }
    }

    result.push(leaf as TreeNode)
  }

  return result
}

run()
