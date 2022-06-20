import type { GitHub } from '@actions/github/lib/utils'
import type { RestEndpointMethodTypes } from '@octokit/rest'

type Octo = InstanceType<typeof GitHub>

export const getCurrentCommit = async (
  octo: Octo,
  data: {
    owner: string
    repo: string
    branch?: string
  }
) => {
  const { owner, repo, branch = 'master' } = data
  const { data: refData } = await octo.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  })

  const commitSha = refData.object.sha
  const { data: commitData } = await octo.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  })

  return {
    commitSha,
    treeSha: commitData.tree.sha,
  }
}

export const createBlobForFile = async (
  octo: Octo,
  data: {
    owner: string
    repo: string
    content: string
  },
  encoding = 'utf-8'
) => {
  // const content = await getFileAsUTF8(filePath)
  const { owner, repo, content } = data
  const blobData = await octo.git.createBlob({
    owner,
    repo,
    content,
    encoding,
  })

  return blobData.data
}

export const createNewTree = async (
  octo: Octo,
  data: {
    owner: string
    repo: string
    blobs: Array<
      RestEndpointMethodTypes['git']['createBlob']['response']['data']
    >
    paths: string[]
    parentTreeSha: string
  }
) => {
  const { owner, repo, blobs, paths, parentTreeSha } = data
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

  const { data: treeData } = await octo.git.createTree({
    owner,
    repo,
    tree,
    base_tree: parentTreeSha,
  })

  return treeData
}

export const createBranch = async (
  octo: Octo,
  {
    owner,
    repo,
    branch,
    parentSha,
  }: { owner: string; repo: string; branch: string; parentSha: string }
) => {
  const response = await octo.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: parentSha,
  })

  return response.data.object.sha
}

export const createNewCommit = async (
  octo: Octo,
  data: {
    owner: string
    repo: string
    message: string
    treeSha: string
    currentCommitSha: string
  }
) => {
  const {
    owner,
    repo,
    message = 'Update to course',
    treeSha,
    currentCommitSha,
  } = data

  const { data: commitData } = await octo.git.createCommit({
    owner,
    repo,
    message,
    tree: treeSha,
    parents: [currentCommitSha],
  })

  return commitData
}

export const setBranchRefToCommit = async (
  octo: Octo,
  data: {
    owner: string
    repo: string
    branch?: string
    commitSha: string
  }
) => {
  const { owner, repo, branch = 'main', commitSha: sha } = data

  return octo.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha,
  })
}

export const mergePullRequest = async (
  octo: Octo,
  {
    owner,
    repo,
    pullNumber,
  }: { owner: string; repo: string; pullNumber: number }
) => {
  const response = await octo.pulls.merge({
    owner,
    repo,
    pull_number: pullNumber,
  })

  return response.data
}
