import type { Alias, Document, Node, Pair, Scalar, visitorFn } from 'yaml'
import type { PnpmWorkspaceMeta } from '../types'
import { writeFile } from 'node:fs/promises'
import { isMap, isPair, isSeq, visit } from 'yaml'

export function writeYaml(pkg: PnpmWorkspaceMeta, document: Document) {
  return writeFile(pkg.filepath, document.toString(), 'utf-8')
}

export function findAnchor(doc: Document, alias: Alias): Scalar<string> | null {
  const { source } = alias
  let anchor: Scalar<string> | null = null

  visit(doc, {
    Scalar: (_key, scalar, _path) => {
      if (
        scalar.anchor === source
        && typeof scalar.value === 'string'
      ) {
        anchor = scalar as Scalar<string>
        return visit.BREAK
      }
    },
  })

  return anchor
}

export function convertVisitorPathToPackageMetaName(path: Parameters<visitorFn<unknown>>[2]) {
  // path[0] is always the root document itself
  // `YAMLSeq` shouldn't be in the path, because
  // pnpm-workspace.yaml currently doesn't have any sequence
  const trimmedPath = (path
    .slice(1) as readonly (Node | Pair<unknown, unknown>)[])
    .filter(node => !isMap(node) && !isSeq(node)) as readonly (Alias | Scalar<string> | Pair<Scalar.Parsed, unknown>)[]

  const nameArr = trimmedPath
    .map((node) => {
      if (isPair(node)) {
        return node.key.toString()
      }
      return node.toString()
    })

  // aligned to pnpm `catalog:{xxx}` protocol
  if (nameArr[0] === 'catalogs' && nameArr.length > 1) {
    nameArr[0] = `catalog`
  }

  let name = nameArr.join(':')

  // aligned to pnpm `catalog:default` protocol
  if (name === 'catalog') {
    name += `:default`
  }
  return name
}
