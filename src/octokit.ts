import type { GitHub } from '@actions/github/lib/utils'
import type { RestEndpointMethodTypes } from '@octokit/rest'

type Octo = InstanceType<typeof GitHub>

const DEFAULT_BRANCH = 'main'

export class TechDocsKit {
  constructor(
    private client: Octo,
    private owner: string,
    private repo: string
  ) {}

  public async getCurrentCommit({
    branch = DEFAULT_BRANCH,
  }: {
    branch?: string
  }) {
    const { data: refData } = await this.client.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    })

    const commitSha = refData.object.sha
    const { data: commitData } = await this.client.git.getCommit({
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
      sha: commitSha,
    })
  }

  public async mergePullRequest({ pullNumber }: { pullNumber: number }) {
    const response = await this.client.pulls.merge({
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
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
      owner: this.owner,
      repo: this.repo,
      issue_number: pullNumber,
      body: `
Closing pull request, reason: ${reason}
`.trim(),
    })

    await this.client.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
      state: 'closed',
    })

    await this.client.git.deleteRef({
      owner: this.owner,
      repo: this.repo,
      ref: `head/${head}`,
    })
  }
}
