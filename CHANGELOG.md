# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.0.0-rc.2](https://github.com/embrajs/reactivity/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2026-11-25)

### Features

* **skills:** add llms.txt generation from SKILL.md ([ba6faa5](https://github.com/embrajs/reactivity/commit/ba6faa528857b4ac5f92d5659ed7cdf43d2169b0))

### Bug Fixes

* **node:** correct prototype assignment for ValueNode and ComputedNode ([ba7cca0](https://github.com/embrajs/reactivity/commit/ba7cca0441d66e58797914f3bb3ef94a98b3e136))

## [1.0.0-rc.1](https://github.com/embrajs/reactivity/compare/v1.0.0-rc.0...v1.0.0-rc.1) (2026-11-23)

## 1.0.0-rc.0 (2026-11-23)

### Features

* add constants and runtime interfaces for reactivity ([4ebe31f](https://github.com/embrajs/reactivity/commit/4ebe31f5d0e1b91bccb97690fde7179988048293))
* add development spy for batch, compute, effect, and flush events ([cc705ca](https://github.com/embrajs/reactivity/commit/cc705caf139146ddad9d490dc1e697973487d66a))
* add export size configuration and update README ([4dc3243](https://github.com/embrajs/reactivity/commit/4dc32438928e52d0ed2c5ff2c14c473408b4288d))
* add flush and untrack utilities with tests ([9b96a25](https://github.com/embrajs/reactivity/commit/9b96a2549f9bb7b4d3137fa7220c0992c208041e))
* add LLM configuration to .gitignore ([24336b2](https://github.com/embrajs/reactivity/commit/24336b2377dea03098a349c00f638ce4ac91e6ae))
* add ReactiveSet and ReactiveMap implementations with tests ([8b31c2c](https://github.com/embrajs/reactivity/commit/8b31c2ca8a3a3dba7cad4e16a7e725114b251755))
* add toJSON, toString, and valueOf methods to reactive types ([4b02df9](https://github.com/embrajs/reactivity/commit/4b02df9114b9ebf605204cfd12c65a2124db4034))
* add useComputed, useComputedValue, useDerived, useDerivedValue hooks ([31577e8](https://github.com/embrajs/reactivity/commit/31577e8145ea49c93b086aa26d0bfa7f1ab3bfe9))
* **exports:** update export structure and improve titles ([3cba8ff](https://github.com/embrajs/reactivity/commit/3cba8ff774e1d2c6db79fcd776c943394a8228f7))
* **peek:** add peek method for untracked value access ([19495ab](https://github.com/embrajs/reactivity/commit/19495ab839c9ac5cc26f4a23bf84e306c8e7ba97))
* **publish:** add dist-tag determination for npm publish ([83dedb6](https://github.com/embrajs/reactivity/commit/83dedb63309b91f4779aef5bcfc0dcb42dd3c6a6))
* **reactivity:** enhance derived function with readSource support ([7124d91](https://github.com/embrajs/reactivity/commit/7124d913b4e04bd0b6e7161f17164bebea741137))
* **readme:** add until function to documentation ([5fc5e9d](https://github.com/embrajs/reactivity/commit/5fc5e9d5b5569f0bfffdb9a2b34622404bcb4b29))
* **until:** add until function for reactive value tracking ([a1ab167](https://github.com/embrajs/reactivity/commit/a1ab16739430e255e5e531764e6d3913a334a0a0))
* **writable:** add update method for value modification ([8c17790](https://github.com/embrajs/reactivity/commit/8c1779023f12dc100688f49a0afa75bc9903de49))

### Bug Fixes

* add 'docs/**' to ignorePaths in cspell configuration ([d339b2e](https://github.com/embrajs/reactivity/commit/d339b2ee6d4de1aaccfd8ff7b706fc207b5d7a5e))
* add arrayShallowEqual function and related types to utils ([50fc35a](https://github.com/embrajs/reactivity/commit/50fc35a610a7635c8f1be78ec09d9f89f0170dcf))
* add CHANGELOG.md to biome.json includes and adjust typescript dependency ([54a5248](https://github.com/embrajs/reactivity/commit/54a52487495800e3563517e3f87f4135f0e5cfa0))
* add coverage thresholds to vitest configuration ([9866d8f](https://github.com/embrajs/reactivity/commit/9866d8f4886365119a9d1e146793325949523acc))
* add missing navigation configuration in typedoc.json ([ee068e9](https://github.com/embrajs/reactivity/commit/ee068e9f0bd455de0f0b6b5d60ce0f30d66ac5ef))
* add noRedeclare rule to suspicious linter options ([fb223af](https://github.com/embrajs/reactivity/commit/fb223afdb3dc1d8f0e626625b6260e921458645c))
* adjust derived function to use isReadable for source validation ([0360d90](https://github.com/embrajs/reactivity/commit/0360d908a989a0ebd6c4947a0407b4109fcd220d))
* change error message from "circular computed dependency" to "loop detected" ([957694d](https://github.com/embrajs/reactivity/commit/957694d54cc32f455d55d0bbcfaf3a4654972214))
* **dependencies:** update export-size-svg to v0.0.8 ([aeb992d](https://github.com/embrajs/reactivity/commit/aeb992dbd9f270bea44833f1036c0d3e64c4fe8e))
* ensure consistent end of line settings in .editorconfig ([273c0f5](https://github.com/embrajs/reactivity/commit/273c0f58c2232f809bc9d4f30cad4ddc84fd0710))
* ensure license section is added to README.md for Embra projects ([02926e7](https://github.com/embrajs/reactivity/commit/02926e74a3d5bb7ec1b3d0abdfee5bb334fd2c14))
* implement appendDep function directly in addStaticDependency ([1d32137](https://github.com/embrajs/reactivity/commit/1d32137d9c862869424a3be3d7c97867f9cb28c4))
* rename template to reactivity and update related files ([89b93f7](https://github.com/embrajs/reactivity/commit/89b93f7267a314c48b30f62aa1f9eedffc2d8620))
* reorder and clarify enum Flags for better readability ([d3a0981](https://github.com/embrajs/reactivity/commit/d3a0981f73c09507d2dc333f38464d5c6ddc8da3))
* update GitHub Actions to use latest checkout and setup-node versions ([d7cb771](https://github.com/embrajs/reactivity/commit/d7cb771c15fcab6c36889fa00ea924eaeaa44e07))
* update imports to use the root path instead of specific files ([503b4dd](https://github.com/embrajs/reactivity/commit/503b4ddeabc5bb6c690beeab44a0c24b70770f1a))
* update minified size badge link to use deno.bundlejs.com ([b3e8c94](https://github.com/embrajs/reactivity/commit/b3e8c9448feaa2ec2a2d15fd4bc3cd649ae2c62a))
* update moduleResolution in tsconfig.json to use bundler ([6ce8372](https://github.com/embrajs/reactivity/commit/6ce8372f05b39149214d637280fae5f5c4e8a4a0))
* update repository field in package.json to include type and URL structure ([17a6c75](https://github.com/embrajs/reactivity/commit/17a6c75d27504c33cb015935ade4ef85b0b6e127))
* update typescript dependency to use scoped package ([a0493b0](https://github.com/embrajs/reactivity/commit/a0493b0204276b0ca6ebb673a6b47fc15f70d147))
