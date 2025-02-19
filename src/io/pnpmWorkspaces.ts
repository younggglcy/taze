import type { Scalar } from 'yaml'
import type { CommonOptions, PnpmWorkspaceMeta, RawDep } from '../types'
import fs from 'node:fs/promises'
import _debug from 'debug'
import { resolve } from 'pathe'
import { coerce, valid } from 'semver'
import { isAlias, isScalar, parseDocument, visit, YAMLMap } from 'yaml'
import { convertVisitorPathToPackageMetaName, findAnchor, writeYaml } from '../utils/yaml'
import { dumpDependencies, parseDependency } from './dependencies'

const debug = _debug('taze:io:pnpmWorkspace')

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PnpmWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const rawText = await fs.readFile(filepath, 'utf-8')
  const document = parseDocument(rawText)
  const metaNameDepsMap = new Map<string, RawDep[]>()

  visit(document, {
    Pair: (_, pair, path) => {
      debugger
      const { key, value } = pair
      // e.g. react: ^18.2.0
      if (
        isScalar(value)
        && valid(coerce(value.toString()))
        && isScalar(key)
        && !value.anchor
      ) {
        const packageName = key.toString()
        const packageVersion = value.toString()
        const metaName = convertVisitorPathToPackageMetaName(path)
        loadPackage(packageName, packageVersion, metaName)
      }
      // e.g. react: *react
      else if (
        isAlias(value)
        && isScalar(key)
      ) {
        const anchor = findAnchor(document, value)
        if (!anchor) {
          debug(`can't find anchor for alias: ${value} in pnpm-workspace.yaml`)
          return
        }

        const packageName = key.toString()
        const packageVersion = anchor.value.toString()
        const metaName = convertVisitorPathToPackageMetaName(path)
        loadPackage(packageName, packageVersion, metaName)
      }
    },
    Seq: (_, seq, path) => {
      // e.g.
      // defines:  <- pair
      //   - &react ^18.2.0   <- seq
      debugger
    }
  })

  const workspaceMetadata = metaNameDepsMap.entries()
    .map(([name, deps]) => {
      return {
        name,
        deps,
        document,
        filepath,
        private: true,
        relative,
        resolved: [],
        type: 'pnpm-workspace.yaml',
        version: '',
        raw: null,
      } as PnpmWorkspaceMeta
    })
    .toArray()

  return workspaceMetadata

  function loadPackage(
    name: string,
    version: string,
    metaName: string,
  ) {
    const dep = parseDependency(
      name,
      version,
      'pnpm:catalog',
      shouldUpdate,
    )

    debug(`Found dependency: ${name} in ${metaName}, currentVersion: ${version}`)
    if (!metaNameDepsMap.has(metaName)) {
      metaNameDepsMap.set(metaName, [dep])
    }
    else {
      metaNameDepsMap.get(metaName)!.push(dep)
    }
  }
}

export async function writePnpmWorkspace(
  pkg: PnpmWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'pnpm:catalog')

  if (!Object.keys(versions).length)
    return

  const catalogName = pkg.name.replace('catalog:', '')
  const document = pkg.document.clone()
  let changed = false

  if (catalogName === 'default') {
    if (!document.has('catalog')) {
      document.set('catalog', new YAMLMap())
    }
    const catalog = document.get('catalog') as YAMLMap<Scalar.Parsed, Scalar.Parsed>
    updateCatalog(catalog)
  }
  else {
    if (!document.has('catalogs')) {
      document.set('catalogs', new YAMLMap())
    }
    const catalog = (document.get('catalogs') as YAMLMap).get(catalogName) as YAMLMap<Scalar.Parsed, Scalar.Parsed>
    updateCatalog(catalog)
  }

  if (changed)
    await writeYaml(pkg, document)

  // currently only support preserve yaml anchor and alias with single string value
  function updateCatalog(catalog: YAMLMap<Scalar.Parsed, Scalar.Parsed>) {
    for (const [key, targetVersion] of Object.entries(versions)) {
      const pair = catalog.items.find(i => i.key.value === key)
      if (!pair?.value || !pair.key) {
        debug(`Exception encountered while parsing pnpm-workspace.yaml, key: ${key}`)
        continue
      }

      if (isAlias(pair?.value)) {
        const anchor = findAnchor(document, pair.value)
        if (!anchor) {
          debug(`can't find anchor for alias: ${pair.value} in pnpm-workspace.yaml`)
          continue
        }
        else if (anchor.value !== targetVersion) {
          anchor.value = targetVersion
          changed = true
        }
      }
      else if (pair.value.value !== targetVersion) {
        pair.value.value = targetVersion
        changed = true
      }
    }
  }
}
