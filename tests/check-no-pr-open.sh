#!/bin/bash

pr_number=$1

if [ ! -z "$pr_number" ]; then
  echo "Expected to not have opened a pull-request, but PR #$pr_number was opened"

  if [ -! -z "$CI" ]; then
    gh pr close $pr_number --delete-branch
  fi

  exit 1
fi
