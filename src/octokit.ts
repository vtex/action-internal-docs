import type { GitHub } from '@actions/github/lib/utils'
import type { RestEndpointMethodTypes } from '@octokit/rest'

type Octo = InstanceType<typeof GitHub>

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

  public async createBlobForFile(
    {
      content,
    }: {
      content: string
    },
    encoding = 'utf-8'
  ) {
    const blobData = await this.client.git.createBlob({
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
      file: RestEndpointMethodTypes['git']['createBlob']['response']['data']
    }>
  }) {
    const { data: refData } = await this.client.git.getRef({
      ...this.upstreamRepo,
      ref: `heads/${baseBranch}`,
    })

    const commitSha = refData.object.sha

    const {
      data: {
        tree: { sha: treeSha },
      },
    } = await this.client.git.getCommit({
      ...this.upstreamRepo,
      commit_sha: commitSha,
    })

    const mode = '100644' as const
    const type = 'blob' as const

    const tree = files.map(({ path, file }) => ({
      path,
      mode,
      type,
      sha: file.sha,
    }))

    const {
      data: { sha: newTreeSha },
    } = await this.client.git.createTree({
      ...this.upstreamRepo,
      tree,
      base_tree: treeSha,
    })

    const {
      data: { sha: newCommitSha },
    } = await this.client.git.createCommit({
      ...this.upstreamRepo,
      message,
      tree: newTreeSha,
      parents: [commitSha],
    })

    await this.client.git.createRef({
      ...this.upstreamRepo,
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha,
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
