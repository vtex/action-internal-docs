import type { GitHub } from '@actions/github/lib/utils'
import type { RestEndpointMethodTypes } from '@octokit/rest'

type Octo = InstanceType<typeof GitHub>

const DEFAULT_BRANCH = 'main'
const SHORT_SHA_LENGTH = 8

interface Repo {
  owner: string
  repo: string
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

  public getNewUpstreamBranchName(sha1: string) {
    const { owner, repo } = this.ownRepo

    const shortSha1 = sha1.slice(0, SHORT_SHA_LENGTH)

    return `docs-${owner}-${repo}-${shortSha1}`
  }

  public async getCurrentCommit({
    branch = DEFAULT_BRANCH,
  }: {
    branch?: string
  }) {
    const { data: refData } = await this.client.git.getRef({
      ...this.upstreamRepo,
      ref: `heads/${branch}`,
    })

    const commitSha = refData.object.sha
    const { data: commitData } = await this.client.git.getCommit({
      ...this.upstreamRepo,
      commit_sha: commitSha,
    })

    return {
      commitSha,
      treeSha: commitData.tree.sha,
    }
  }

  public async createBlobForFile(
    {
      content,
    }: {
      content: string
    },
    encoding = 'utf-8'
  ) {
    // const content = await getFileAsUTF8(filePath)
    const blobData = await this.client.git.createBlob({
      ...this.upstreamRepo,
      content,
      encoding,
    })

    return blobData.data
  }

  public async createNewTree({
    blobs,
    paths,
    parentTreeSha,
  }: {
    blobs: Array<
      RestEndpointMethodTypes['git']['createBlob']['response']['data']
    >
    paths: string[]
    parentTreeSha: string
  }) {
    const mode = '100644' as const
    const type = 'blob' as const

    if (!blobs.length || blobs.length !== paths.length) {
      throw new Error('You should provide the same number of blobs and paths')
    }

    const tree = blobs.map(({ sha }, index) => ({
      path: paths[index],
      mode,
      type,
      sha,
    }))

    const { data: treeData } = await this.client.git.createTree({
      ...this.upstreamRepo,
      tree,
      base_tree: parentTreeSha,
    })

    return treeData
  }

  public async createBranch({
    branch,
    parentSha,
  }: {
    branch: string
    parentSha: string
  }) {
    const response = await this.client.git.createRef({
      ...this.upstreamRepo,
      ref: `refs/heads/${branch}`,
      sha: parentSha,
    })

    return response.data.object.sha
  }

  public async createNewCommit({
    message = 'Update to course',
    treeSha,
    currentCommitSha,
  }: {
    message?: string
    treeSha: string
    currentCommitSha: string
  }) {
    const { data: commitData } = await this.client.git.createCommit({
      ...this.upstreamRepo,
      message,
      tree: treeSha,
      parents: [currentCommitSha],
    })

    return commitData
  }

  public async setBranchRefToCommit({
    branch = DEFAULT_BRANCH,
    commitSha,
  }: {
    branch?: string
    commitSha: string
  }) {
    return this.client.git.updateRef({
      ...this.upstreamRepo,
      ref: `heads/${branch}`,
      sha: commitSha,
    })
  }

  public async mergePullRequest({ pullNumber }: { pullNumber: number }) {
    const response = await this.client.pulls.merge({
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
    const response = await this.client.pulls.create({
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
    await this.client.issues.createComment({
      ...this.upstreamRepo,
      issue_number: pullNumber,
      body: `
Closing pull request, reason: ${reason}
`.trim(),
    })

    await this.client.pulls.update({
      ...this.upstreamRepo,
      pull_number: pullNumber,
      state: 'closed',
    })

    await this.client.git.deleteRef({
      ...this.upstreamRepo,
      ref: `head/${head}`,
    })
  }
}
