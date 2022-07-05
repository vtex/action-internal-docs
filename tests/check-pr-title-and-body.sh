#!/bin/bash

pull_number=$1
commit_sha=$2

pr_json=$(echo -E `gh pr view $pull_number --json title,body`)

pr_title=$(echo "$pr_json" | jq .title)
pr_body=$(echo "$pr_json" | jq .body)

expected_title='"Docs sync (vtex/action-internal-docs)"'

if [[ "$expected_title" != "$pr_title" ]]; then
  echo "Failed to match expected PR title"
  exit 1
fi

expected_body=$(printf '"Documentation synchronization from [GitHub action]

This update is refers to the following commit:

https://github.com/vtex/action-internal-docs/commit/%s

[GitHub action]: http://github.com/vtex/action-internal-docs"' "$commit_sha")

if ./tests/assert-equals.js "$expected_body" "$pr_body"; then
  echo "Failed to match expected PR body"
  exit 1
fi
