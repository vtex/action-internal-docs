import type { GitHub } from '@actions/github/lib/utils'
import short from 'short-uuid'

type Octo = InstanceType<typeof GitHub>

interface Repo {
  owner: string
  repo: string
}

type TreeNode = {
  sha: string
  path: string
  type: string
}

export class TechDocsKit {
  private client: Octo
  private upstreamRepo: Repo
  private ownRepo: Repo

  constructor({
    client,
    upstreamRepo,
    ownRepo,
  }: {
    client: Octo
    upstreamRepo: Repo
    ownRepo: Repo
  }) {
    this.client = client
    this.upstreamRepo = upstreamRepo
    this.ownRepo = ownRepo
  }

  public get ownRepoOwner() {
    return this.ownRepo.owner
  }

  public get ownRepoName() {
    return this.ownRepo.repo
  }

  public get ownRepoFormatted() {
    return `${this.ownRepo.owner}/${this.ownRepo.repo}`
  }

  public get upstreamRepoFormatted() {
    return `${this.upstreamRepo.owner}/${this.upstreamRepo.repo}`
  }

  public getNewUpstreamBranchName() {
    const { owner, repo } = this.ownRepo

    const shortId = short.generate()

    return `docs-${owner}-${repo}-${shortId}`
  }

  public async createBlobForFile(
    {
      content,
    }: {
      content: string
    },
    encoding = 'utf-8'
  ) {
    const blobData = await this.client.rest.git.createBlob({
      ...this.upstreamRepo,
      content,
      encoding,
    })

    return blobData.data
  }

  public async createBranchAndCommit({
    message,
    branchName,
    baseBranch,
    files,
  }: {
    message: string
    branchName: string
    baseBranch: string
    files: Array<{
      path: string
      sha: string | null
    }>
  }) {
    const { data: refData } = await this.client.rest.git.getRef({
      ...this.upstreamRepo,
      ref: `heads/${baseBranch}`,
    })

    const commitSha = refData.object.sha

    const {
      data: {
        tree: { sha: treeSha },
      },
    } = await this.client.rest.git.getCommit({
      ...this.upstreamRepo,
      commit_sha: commitSha,
    })

    const mode = '100644' as const
    const type = 'blob' as const

    const tree = files.map(({ path, sha }) => ({
      path,
      mode,
      type,
      sha,
    }))

    const {
      data: { sha: newTreeSha },
    } = await this.client.rest.git.createTree({
      ...this.upstreamRepo,
      tree,
      base_tree: treeSha,
    })

    const {
      data: { sha: newCommitSha },
    } = await this.client.rest.git.createCommit({
      ...this.upstreamRepo,
      message,
      tree: newTreeSha,
      parents: [commitSha],
    })

    await this.client.rest.git.createRef({
      ...this.upstreamRepo,
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha,
    })
  }

  public async mergePullRequest({ pullNumber }: { pullNumber: number }) {
    const response = await this.client.rest.pulls.merge({
      ...this.upstreamRepo,
      pull_number: pullNumber,
      merge_method: 'rebase',
    })

    return response.data
  }

  public async createPullRequest({
    title,
    body,
    head,
    base,
  }: {
    title: string
    body: string
    head: string
    base: string
  }) {
    const response = await this.client.rest.pulls.create({
      ...this.upstreamRepo,
      title,
      head,
      base,
      body,
    })

    return response.data
  }

  public async closePullRequestAndDeleteBranch({
    pullNumber,
    head,
    reason,
  }: {
    pullNumber: number
    head: string
    reason: string
  }) {
    await this.client.rest.issues.createComment({
      ...this.upstreamRepo,
      issue_number: pullNumber,
      body: `
Closing pull request, reason: ${reason}
`.trim(),
    })

    await this.client.rest.pulls.update({
      ...this.upstreamRepo,
      pull_number: pullNumber,
      state: 'closed',
    })

    await this.client.rest.git.deleteRef({
      ...this.upstreamRepo,
      ref: `head/${head}`,
    })
  }

  public async getCompleteTree(branchName: string, pathPrefix: string) {
    const { data: branchRef } = await this.client.rest.git.getRef({
      ...this.upstreamRepo,
      ref: `heads/${branchName}`,
    })

    const branchTree = await this.getTreeFromSha(branchRef.object.sha)

    const completeTree = await this.getTreeRecursive(branchTree, pathPrefix)

    return completeTree
  }

  private async getTreeRecursive(
    tree: Array<Partial<TreeNode>>,
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
        const subTree = await this.getTreeFromSha(leaf.sha!)

        // eslint-disable-next-line no-await-in-loop
        const completeSubTree = await this.getTreeRecursive(
          subTree,
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

  private async getTreeFromSha(sha: string) {
    const {
      data: { tree },
    } = await this.client.rest.git.getTree({
      ...this.upstreamRepo,
      tree_sha: sha,
    })

    return tree
  }
}
