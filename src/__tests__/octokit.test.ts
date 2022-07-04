import * as github from '@actions/github'

import { TechDocsKit } from '../octokit'

const octokitClient = github.getOctokit('fake-token')

describe('TechDocs kit', () => {
  let techDocsKit: TechDocsKit

  beforeEach(() => {
    techDocsKit = new TechDocsKit({
      client: octokitClient,
      upstreamRepo: {
        owner: 'vtex',
        repo: 'internal-docs',
      },
      ownRepo: {
        owner: 'vtex',
        repo: 'action-internal-docs',
      },
    })
  })

  it('should use own repo owner and name for new branch', () => {
    const upstreamBranchName = techDocsKit.getNewUpstreamBranchName()

    expect(upstreamBranchName).toStrictEqual(
      expect.stringContaining('vtex-action-internal-docs')
    )
  })

  it('should use correct ref when deleting upstream branch', async () => {
    jest
      .spyOn(octokitClient.rest.issues, 'createComment')
      .mockImplementation(() => Promise.resolve({} as any))
    jest
      .spyOn(octokitClient.rest.pulls, 'update')
      .mockImplementation(() => Promise.resolve({} as any))
    const deleteRefSpy = jest
      .spyOn(octokitClient.rest.git, 'deleteRef')
      .mockImplementation(() => Promise.resolve({} as any))

    await techDocsKit.closePullRequestAndDeleteBranch({
      pullNumber: 1,
      head: 'docs-vtex-action-internal-docs-7a2fdbabd',
      reason: 'Failed to auto-merge pull-request',
    })

    expect(deleteRefSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'head/docs-vtex-action-internal-docs-7a2fdbabd',
      })
    )
  })
})
