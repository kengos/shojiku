# install proofs — local artifacts and the published registry copies
#
# Every target defined here is named `proof:<job>` (public) or `_proof-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

## ---- job: install proofs (scripts/install-proof/) -----------------------

# What no SDK gate can prove: that a package reaches the engine THROUGH ITS
# OWN PACKAGING. Every gate injects the engine; these embed the host-arch
# payload the way a release does, build the real package, install it into a
# CLEAN floor-version container and render through it. One platform on
# purpose — the defect class is about SHAPE, and shape does not vary across
# the matrix. Needs network (each proof installs its packaging toolchain), so
# `verify` does not include them; CI runs them as their own job matrix.
proof\:python: ## Install proof: wheel with the cdylib as package data
	@$(call gate,_proof-python,proof:python)

_proof-python: _engine-capi-lib
	@PYTHON_VER=$(PYTHON_VER) sh scripts/install-proof/python.sh
proof\:ruby: ## Install proof: platform gem carrying the cdylib
	@$(call gate,_proof-ruby,proof:ruby)

_proof-ruby: _engine-capi-lib
	@RUBY_VER=$(RUBY_VER) sh scripts/install-proof/ruby.sh
proof\:dotnet: ## Install proof: nupkg with a RID native asset
	@$(call gate,_proof-dotnet,proof:dotnet)

_proof-dotnet: _engine-capi-lib
	@DOTNET_VER=$(DOTNET_VER) sh scripts/install-proof/dotnet.sh
proof\:java: ## Install proof: platform classifier jar on a consumer classpath
	@$(call gate,_proof-java,proof:java)

_proof-java: _engine-capi-lib
	@JAVA_VER=$(JAVA_VER) GATE_IMG=$(JAVA_IMAGE) sh scripts/install-proof/java.sh
proof\:js: ## Install proof: napi addon inside a platform package
	@$(call gate,_proof-js,proof:js)

_proof-js: _engine-napi
	@NODE_VER=$(NODE_VER) sh scripts/install-proof/js.sh
proof\:php: ## Install proof: composer package driving a PATH-found CLI
	@$(call gate,_proof-php,proof:php)

_proof-php: _engine-cli-bin
	@PHP_VER=$(PHP_VER) sh scripts/install-proof/php.sh
proof\:go: ## Install proof: go module driving a PATH-found CLI
	@$(call gate,_proof-go,proof:go)

_proof-go: _engine-cli-bin
	@GO_VER=$(GO_VER) sh scripts/install-proof/go.sh

proof: ## All seven install proofs
	@$(call gate,_proof,proof)

_proof: _proof-python _proof-ruby _proof-dotnet _proof-java _proof-js _proof-php _proof-go

# PUBLISHED-install proofs: the same question asked of the REGISTRY copy
# instead of a package built here. They take no artifact prerequisite — the
# point is that nothing local is involved — and they only mean anything once
# the version is actually published. SHOJIKU_VERSION=x.y.z pins one; unset takes
# THIS TREE's own [workspace.package] version (resolved once in
# scripts/install-proof/common.sh), so a bare run asks about the version being
# shipped and fails loudly when it is not published yet. It used to take
# whatever the registry called latest, which during a release is the PREVIOUS
# release — six proofs once went green that way and read as proof of the new
# one. go is the one language with
# no arm here and needs none: its publish IS a repo tag, so there is no
# registry copy that could differ from the tree. php takes BOTH of its halves
# from publish channels — the composer package from Packagist and the CLI from
# the GitHub Release — because the package drives a binary rather than
# carrying one.
proof\:published\:python: ## Published-install proof: pip install shojiku from PyPI
	@$(call gate,_proof-published-python,proof:published:python)

_proof-published-python:
	@PYTHON_VER=$(PYTHON_VER) sh scripts/install-proof/published-python.sh
proof\:published\:ruby: ## Published-install proof: gem install shojiku from rubygems.org
	@$(call gate,_proof-published-ruby,proof:published:ruby)

_proof-published-ruby:
	@RUBY_VER=$(RUBY_VER) sh scripts/install-proof/published-ruby.sh
proof\:published\:dotnet: ## Published-install proof: dotnet add package Shojiku from nuget.org
	@$(call gate,_proof-published-dotnet,proof:published:dotnet)

_proof-published-dotnet:
	@DOTNET_VER=$(DOTNET_VER) sh scripts/install-proof/published-dotnet.sh
proof\:published\:java: ## Published-install proof: jp.kengos:shojiku from Maven Central
	@$(call gate,_proof-published-java,proof:published:java)

_proof-published-java:
	@sh scripts/install-proof/published-java.sh
proof\:published\:js: ## Published-install proof: npm install shojiku from npmjs.com
	@$(call gate,_proof-published-js,proof:published:js)

_proof-published-js:
	@NODE_VER=$(NODE_VER) sh scripts/install-proof/published-js.sh
proof\:published\:php: ## Published-install proof: composer require shojiku/shojiku from Packagist
	@$(call gate,_proof-published-php,proof:published:php)

_proof-published-php:
	@PHP_VER=$(PHP_VER) sh scripts/install-proof/published-php.sh
proof\:published\:crates: ## Published-install proof: cargo install shojiku-cli from crates.io
	@$(call gate,_proof-published-crates,proof:published:crates)

_proof-published-crates:
	@RUST_VER=$(RUST_VERSION) sh scripts/install-proof/published-crates.sh

proof\:published: ## All published-install proofs
	@$(call gate,_proof-published,proof:published)

_proof-published: _proof-published-python _proof-published-ruby _proof-published-dotnet _proof-published-java _proof-published-js _proof-published-php _proof-published-crates

proof\:deploy: ## Run every deploy-recipe proof against the public registries (network; on demand)
	@$(call gate,_proof-deploy,proof:deploy)

_proof-deploy:
	@for l in python ruby node dotnet java; do scripts/install-proof/deploy-$$l.sh || exit 1; done
