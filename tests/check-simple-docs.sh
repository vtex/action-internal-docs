#!/bin/sh

pull_number=$1

if [ -z "$pull_number" ]; then
  echo "Missing pull-request number from args"
  exit 1
fi

expected_diff="diff --git a/docs/Internal Docs Test/index.md b/docs/Internal Docs Test/index.md
new file mode 100644
index 0000000..25ec6d6
--- /dev/null
+++ b/docs/Internal Docs Test/index.md
@@ -0,0 +1,3 @@
+# Test file
+
+this is a file used for e2e tests, do not remove."

pr_diff=$(gh pr diff $pull_number --color never)

if [ ! -z "$CI" ]; then
  gh pr close $pull_number --delete-branch
fi

if [ "$expected_diff" = "$pr_diff" ]; then
  echo "Pull-request diff for PR #$pull_number does not match the expected output"

  exit 1
fi;
