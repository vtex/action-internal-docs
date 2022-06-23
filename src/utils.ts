export function sortByPath(
  { path: pathA }: { path: string },
  { path: pathB }: { path: string }
) {
  if (pathA < pathB) {
    return -1
  }

  if (pathA > pathB) {
    return 1
  }

  return 0
}
