import type { GlobalPackageMeta, PackageJsonMeta, PackageMeta, PnpmWorkspaceMeta } from '../types'

export function isPackageJsonMeta(pkg: PackageMeta): pkg is PackageJsonMeta {
  return pkg.type === 'package.json'
}

export function isGlobalPackageMeta(pkg: PackageMeta): pkg is GlobalPackageMeta {
  return pkg.type === 'global'
}

export function isPnpmWorkspaceMeta(pkg: PackageMeta): pkg is PnpmWorkspaceMeta {
  return pkg.type === 'pnpm-workspace.yaml'
}
