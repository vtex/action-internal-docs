#!/bin/bash

pull_number=$1

if [ -z "$pull_number" ]; then
  echo "Missing pull-request number from args"
  exit 1
fi

expected_diff="diff --git a/docs/Internal Docs Test/index.md b/docs/Internal Docs Test/index.md
deleted file mode 100644
index 25ec6d6..0000000
--- a/docs/Internal Docs Test/index.md
+++ /dev/null
@@ -1,3 +0,0 @@
-# Test file
-
-this is a file used for e2e tests, do not remove.
diff --git a/docs/Internal Docs Test/readme.md b/docs/Internal Docs Test/readme.md
new file mode 100644
index 0000000..d477370
--- /dev/null
+++ b/docs/Internal Docs Test/readme.md
@@ -0,0 +1,7 @@
+# Test file
+
+this is a file used for e2e tests, do not remove.
+
+## Development
+
+this is where we should add steps on how to start this project locally"

pr_diff=$(gh pr diff $pull_number --color never)

if [ ! -z "$CI" ]; then
  gh pr close $pull_number --delete-branch
fi

if ./tests/assert-equals.js "$expected_diff" "$pr_diff"; then
  echo "Pull-request diff for PR #$pull_number does not match the expected output"

  exit 1
fi;
