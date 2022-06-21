# Action Development

This document aims to outline a few important points in developing this GitHub 
Action. Since we are running on GitHub, we have a few files that are important 
to make this repository recognizable as an Action.

The primary file for this is the [`action.yml`](./action.yml), which contains 
some important definitions, such as action inputs and outputs. The only inputs 
that are needed for this Action to be functional is the `repo-token` and 
`docs-product` (you can find more about them in the README and the actual 
action file), the others are optional and currently only used for e2e testing.

## Getting started

This repository is a simple Node.js app, written in [TypeScript]. You must have 
Node.js and Yarn installed on your machine, and then you can install the 
dependencies using the following command:

```sh
yarn install
```

This will install all runtime and development dependencies for this project. 
You can run our unit tests using the command `yarn test`, and create a bundled 
build using `yarn build` (which uses both `tsc` – the typescript compiler - and 
`ncc` – a simple bundler).

## Running and e2e tests

Since this is a GitHub Action, to actually run it we must setup a workflow file 
in a GitHub repository. This is exactly what we do for our e2e tests, and use 
this very own repository as a sandbox to test our changes. You can see this 
workflow file in [`.github/workflows/test.yml`](https://github.com/vtex/action-internal-docs/blob/main/.github/workflows/test.yml).

We created protected branches prefixed by `test-case/` which contain some files 
that are used by the e2e test suite to verify the action behavior, and under 
the `tests/` directory you can find some of our script files that assert on the 
expected output.

Once you open a pull-request, the workflow file will be triggered and a new run 
for the test suite will be started. If everything goes well, the workflow will 
be run to completion and the pull-request marked with a green check.

## Building and deploying

GitHub Actions are based on GitHub repositories, and most Actions use git tags 
to "deploy" and to follow semver (e.g. using the tag `v1` to always be updated 
in that major, but without breaking changes).

This repository isn't configured yet with the tag system, and existing 
repositories using it already point to the `main` branch (using the
`vtex/action-internal-docs@main` syntax). So we must be careful with landing 
breaking changes on the main branch, and if we need to do this we must manually 
update all repositories using it (or we could risk breaking other team's 
repos).

So, in order to deploy, we can simply create a pull-request and merge it into 
the `main` branch. So easy, right? It is also important to note that you 
**must** run the `yarn build` command before merging (there is also a workflow 
that checks for this). This is because the entrypoint GitHub Actions uses is 
actually `dist/index.js`, and it must contain all our code "compiled" into one 
file (and in JavaScript). And this is exactly what the build command does, it 
runs the TypeScript compiler `tsc` and then uses `ncc` to compile the output of 
`tsc` (located under the `./lib` directory) into `dist/index.js`. All the heavy 
lifting is done by these two tools.

[TypeScript]: https://www.typescriptlang.org/
