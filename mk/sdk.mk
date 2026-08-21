# sdk/ — the seven language packages, one container each
#
# Every target defined here is named `sdk:<job>` (public) or `_sdk-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

# sdk/js is the one that cannot install onto the mount. Its gates run in the
# purpose-built JS_IMAGE and link the image's store in with
# `ln -sfn /pkg/node_modules node_modules`; over a REAL directory that puts the
# symlink INSIDE it and `make sdk:js:verify` then resolves nothing. gui/ and site/
# already keep node_modules on the mount (their own gates put it there), so
# only this scope needs the detour: resolve in a scratch copy, carry back the
# lockfile alone.
SDK_JS_LOCK_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/sdk/js \
	-v "$(PNPM_VOLUME):/pnpm-store" \
	-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	$(NODE_IMAGE) sh -euc

# $(1) is the pnpm subcommand to run against the scratch copy.
define sdk_js_resolve
@$(SDK_JS_LOCK_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION_SDK) >/dev/null 2>&1; \
	pnpm config set store-dir /pnpm-store; \
	rm -rf /tmp/lockwork; mkdir -p /tmp/lockwork; \
	cp package.json pnpm-lock.yaml pnpm-workspace.yaml /tmp/lockwork/; \
	cd /tmp/lockwork; \
	$(1); \
	cp pnpm-lock.yaml /repo/sdk/js/pnpm-lock.yaml'
endef

sdk\:js\:lock: ## Re-resolve sdk/js/pnpm-lock.yaml after a package.json change
	@echo "== sdk:js:lock =="
	$(call sdk_js_resolve,pnpm install --lockfile-only)

sdk\:js\:update: ## Bump sdk/js deps within their package.json ranges
	@echo "== sdk:js:update =="
	$(call sdk_js_resolve,pnpm update -r)

## ---- job: sdk-php ------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
PHP_VER ?= 8.3
PHP_IMAGE := shojiku-sdk-php:$(PHP_VER)$(SDK_SUFFIX)

# The first SUBPROCESS SDK, so the injected binary is the `shojiku` CLI
# (`make engine:cli-bin`) rather than a library the package loads — but everything
# else is the shape the other five gates already have. The sidecar
# sdk/php/Dockerfile.dockerignore is what lets this build see dist/ at all;
# the root .dockerignore excludes sdk/ and never mentioned dist/cli/local.
#
# The package is installed from its own artifact into a scratch directory
# through a `path` repository with packagist turned OFF: composer resolves
# nothing over the network, which is both faster and the honest test — this
# package has no dependencies, and a gate that reached a registry would be
# proving something else.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk\:php\:verify: ## sdk/php gates: licenses + php-cs-fixer + phpstan + phpunit at 100% + composer install
	@$(call gate,_sdk-php-verify,sdk:php:verify)

_sdk-php-verify: _engine-cli-bin
	@sh scripts/check-php-licenses.sh
	@echo "== sdk php image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@echo "== sdk php (php-cs-fixer + phpstan + phpunit + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		php-cs-fixer check --diff ;\
		phpstan analyse --no-progress --memory-limit=512M ;\
		phpunit ;\
		php tools/coverage-gate.php ;\
		composer validate --strict ;\
		cp -r /repo/sdk/php /tmp/build ;\
		rm -rf /tmp/build/build /tmp/build/.phpunit.cache ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		export COMPOSER_ROOT_VERSION=1.0.0 ;\
		composer init --no-interaction --name=shojiku/consumer --quiet ;\
		composer config repositories.local path /tmp/build ;\
		composer config repositories.packagist.org false ;\
		composer require --no-interaction --quiet "shojiku/shojiku:@dev" ;\
		php -r "require \"vendor/autoload.php\"; exit(class_exists(\Shojiku\Client::class) ? 0 : 1);"'

sdk\:php\:test: ## sdk/php phpunit + coverage assertion
	@$(call gate,_sdk-php-test,sdk:php:test)

_sdk-php-test: _engine-cli-bin
	@echo "== sdk php test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		phpunit ;\
		php tools/coverage-gate.php'

# cli-bin even for lint: the image COPYs the binary in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:php\:lint: ## sdk/php php-cs-fixer + phpstan
	@$(call gate,_sdk-php-lint,sdk:php:lint)

_sdk-php-lint: _engine-cli-bin
	@echo "== sdk php lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		php-cs-fixer check --diff ;\
		phpstan analyse --no-progress --memory-limit=512M'

## ---- job: sdk-go -------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
GO_VER ?= 1.25
GO_IMAGE := shojiku-sdk-go:$(GO_VER)$(SDK_SUFFIX)

# The second SUBPROCESS SDK, so it shares php's injected binary (`make
# cli-bin`) rather than the cdylib the four FFI SDKs load. The sidecar
# sdk/go/Dockerfile.dockerignore is what lets this build see dist/ at all; the
# root .dockerignore excludes sdk/ and never mentioned dist/cli/local.
#
# The package is built from a scratch module through a `replace` directive with
# the module proxy turned OFF: nothing is resolved over the network, which is
# both faster and the honest test — this package has no dependencies, and a
# gate that reached a proxy would be proving something else. It is the go form
# of php's `path` repository with packagist disabled.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk\:go\:verify: ## sdk/go gates: gofmt + vet + golangci-lint + go test -race at 100% coverage + module build
	@$(call gate,_sdk-go-verify,sdk:go:verify)

_sdk-go-verify: _engine-cli-bin
	@echo "== sdk go image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@echo "== sdk go (gofmt + vet + golangci-lint + go test + module build) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		gofmt -l . > /tmp/fmt.txt ;\
		if [ -s /tmp/fmt.txt ]; then echo "gofmt would rewrite:"; cat /tmp/fmt.txt; exit 1; fi ;\
		go vet ./... ;\
		golangci-lint run ;\
		go test ./... -race -coverprofile=/tmp/cover.out ;\
		go tool cover -func=/tmp/cover.out | awk "/^total:/ {print; if (\$$3 != \"100.0%\") exit 1}" ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		export GOFLAGS=-mod=mod GOPROXY=off ;\
		go mod init consumer ;\
		go mod edit -require=github.com/kengos/shojiku/sdk/go@v0.0.0 ;\
		go mod edit -replace=github.com/kengos/shojiku/sdk/go=/repo/sdk/go ;\
		printf "package main\n\nimport shojiku \"github.com/kengos/shojiku/sdk/go\"\n\nfunc main() { _, _ = shojiku.NewClient() }\n" > main.go ;\
		go build ./...'

sdk\:go\:test: ## sdk/go go test -race + coverage assertion
	@$(call gate,_sdk-go-test,sdk:go:test)

_sdk-go-test: _engine-cli-bin
	@echo "== sdk go test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		go test ./... -race -coverprofile=/tmp/cover.out ;\
		go tool cover -func=/tmp/cover.out | awk "/^total:/ {print; if (\$$3 != \"100.0%\") exit 1}"'

# cli-bin even for lint: the image COPYs the binary in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:go\:lint: ## sdk/go gofmt + go vet + golangci-lint
	@$(call gate,_sdk-go-lint,sdk:go:lint)

_sdk-go-lint: _engine-cli-bin
	@echo "== sdk go lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		gofmt -l . > /tmp/fmt.txt ;\
		if [ -s /tmp/fmt.txt ]; then echo "gofmt would rewrite:"; cat /tmp/fmt.txt; exit 1; fi ;\
		go vet ./... ;\
		golangci-lint run'

# The engine library is INJECTED already compiled (capi-lib above); no
# language image ever builds Rust. The sidecar sdk/ruby/Dockerfile.dockerignore
# is what lets this build see sdk/ at all — the root .dockerignore excludes it.
sdk\:ruby\:verify: ## sdk/ruby gates: rubocop + rspec at 100% coverage + gem build/install
	@$(call gate,_sdk-ruby-verify,sdk:ruby:verify)

_sdk-ruby-verify: _engine-capi-lib
	@echo "== sdk ruby image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@echo "== sdk ruby (rubocop + rspec + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) sh -euc '\
		bundle exec rake lint spec ;\
		cd /tmp ;\
		cp -r /repo/sdk/ruby /tmp/build ;\
		cd /tmp/build ;\
		gem build shojiku.gemspec ;\
		gem install --local --no-document shojiku-*.gem ;\
		ruby -e "require \"shojiku\"; Shojiku::Client"'

sdk\:ruby\:test: ## sdk/ruby rspec only
	@$(call gate,_sdk-ruby-test,sdk:ruby:test)

_sdk-ruby-test: _engine-capi-lib
	@echo "== sdk ruby test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) bundle exec rake spec

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:ruby\:lint: ## sdk/ruby rubocop only
	@$(call gate,_sdk-ruby-lint,sdk:ruby:lint)

_sdk-ruby-lint: _engine-capi-lib
	@echo "== sdk ruby lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) bundle exec rake lint

## ---- job: sdk-python ---------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
PYTHON_VER ?= 3.11
PYTHON_IMAGE := shojiku-sdk-python:$(PYTHON_VER)$(SDK_SUFFIX)

# Same shape as sdk-ruby: the engine library is INJECTED already compiled
# (capi-lib); no language image ever builds Rust. The sidecar
# sdk/python/Dockerfile.dockerignore is what lets this build see dist/ at all —
# the root .dockerignore excludes sdk/ and never mentioned dist/capi/local.
#
# The wheel is built and installed in a scratch directory, NOT on the mount:
# installing from /repo would let the source tree satisfy the import and prove
# nothing about the artifact. The import check runs with PYTHONPATH cleared for
# the same reason.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain (POSIX: an AND-OR list), so
# `lint && test; package` reports the PACKAGE step's status and greens over a
# failed test run. This recipe shipped that way for one run and reported PASS
# while ruff had failed and pytest had never executed.
sdk\:python\:verify: ## sdk/python gates: ruff + mypy + pytest at 100% coverage + wheel build/install
	@$(call gate,_sdk-python-verify,sdk:python:verify)

_sdk-python-verify: _engine-capi-lib
	@echo "== sdk python image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@echo "== sdk python (ruff + mypy + pytest + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) sh -euc '\
		ruff format --check . ;\
		ruff check . ;\
		mypy ;\
		pytest ;\
		cp -r /repo/sdk/python /tmp/build ;\
		cd /tmp/build ;\
		python -m build --wheel --outdir /tmp/wheel ;\
		pip install --no-cache-dir --no-index /tmp/wheel/shojiku-*.whl ;\
		cd /tmp ;\
		PYTHONPATH= python -c "import shojiku; shojiku.Client"'

sdk\:python\:test: ## sdk/python pytest only
	@$(call gate,_sdk-python-test,sdk:python:test)

_sdk-python-test: _engine-capi-lib
	@echo "== sdk python test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) pytest

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:python\:lint: ## sdk/python static checks only (ruff + mypy)
	@$(call gate,_sdk-python-lint,sdk:python:lint)

_sdk-python-lint: _engine-capi-lib
	@echo "== sdk python lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) sh -euc '\
		ruff format --check . ;\
		ruff check . ;\
		mypy'

## ---- job: sdk-dotnet ---------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
DOTNET_VER ?= 10.0
DOTNET_IMAGE := shojiku-sdk-dotnet:$(DOTNET_VER)$(SDK_SUFFIX)

# Same shape as sdk-ruby and sdk-python: the engine library is INJECTED already
# compiled (capi-lib); no language image ever builds Rust. The sidecar
# sdk/dotnet/Dockerfile.dockerignore is what lets this build see the project
# manifests at all — the root .dockerignore excludes sdk/ and never mentioned
# dist/capi/local.
#
# The package is built and restored in a scratch directory, NOT on the mount:
# packing from /repo would leave obj/ and bin/ artifacts in the working tree,
# and restoring the package where the project already satisfies the reference
# would prove nothing about the artifact.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED for
# a failing command inside an `&&` chain (POSIX: an AND-OR list), so
# `format && test; pack` reports the PACK step's status and greens over a failed
# test run.
sdk\:dotnet\:verify: ## sdk/dotnet gates: dotnet format + xunit at 100% line coverage + pack/restore
	@$(call gate,_sdk-dotnet-verify,sdk:dotnet:verify)

_sdk-dotnet-verify: _engine-capi-lib
	@echo "== sdk dotnet image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@echo "== sdk dotnet (format + test + pack) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) sh -euc '\
		dotnet format --verify-no-changes ;\
		dotnet test ;\
		cp -r /repo/sdk/dotnet /tmp/build ;\
		cd /tmp/build ;\
		dotnet pack Shojiku/Shojiku.csproj -c Release -o /tmp/pkg ;\
		ls /tmp/pkg/Shojiku.*.nupkg'

sdk\:dotnet\:test: ## sdk/dotnet xunit only
	@$(call gate,_sdk-dotnet-test,sdk:dotnet:test)

_sdk-dotnet-test: _engine-capi-lib
	@echo "== sdk dotnet test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) dotnet test

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:dotnet\:lint: ## sdk/dotnet format + analyzers only
	@$(call gate,_sdk-dotnet-lint,sdk:dotnet:lint)

_sdk-dotnet-lint: _engine-capi-lib
	@echo "== sdk dotnet lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) sh -euc '\
		dotnet format --verify-no-changes ;\
		dotnet build Shojiku/Shojiku.csproj'

## ---- job: sdk-java -----------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
JAVA_VER ?= 21
JAVA_IMAGE := shojiku-sdk-java:$(JAVA_VER)$(SDK_SUFFIX)

# Same shape again. Two things this one had to get right beyond the others:
#
#   * `mvn -o` (offline) is what keeps a gate run from resolving a different
#     plugin than the change was tested against — but `dependency:go-offline`
#     alone does NOT fetch surefire's test-framework PROVIDER, which surefire
#     picks at test time. The image therefore runs the whole `verify` lifecycle
#     once over a throwaway test; see sdk/java/Dockerfile.
#   * `mvn verify` already IS the full bar here: spotless (validate), the
#     compiler's -Xlint -Werror, surefire, jacoco's 100% LINE rule, and the
#     sources + javadoc jars Maven Central requires. So the packaging step other
#     SDKs bolt on is not separate — it is the same lifecycle, and the jar list
#     below is what proves it produced all three.
sdk\:java\:verify: ## sdk/java gates: spotless + junit at 100% line coverage + jar/sources/javadoc
	@$(call gate,_sdk-java-verify,sdk:java:verify)

_sdk-java-verify: _engine-capi-lib
	@echo "== sdk java image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@echo "== sdk java (spotless + junit + jacoco + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) sh -euc '\
		mvn -B -o verify ;\
		ls target/shojiku-*.jar target/shojiku-*-sources.jar target/shojiku-*-javadoc.jar'

sdk\:java\:test: ## sdk/java junit only
	@$(call gate,_sdk-java-test,sdk:java:test)

_sdk-java-test: _engine-capi-lib
	@echo "== sdk java test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) \
		mvn -B -o -Dspotless.check.skip=true -Djacoco.skip=true test

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk\:java\:lint: ## sdk/java spotless + compiler lint only
	@$(call gate,_sdk-java-lint,sdk:java:lint)

_sdk-java-lint: _engine-capi-lib
	@echo "== sdk java lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) \
		mvn -B -o spotless:check test-compile

## ---- job: sdk-js -------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
NODE_VER ?= 22
JS_IMAGE := shojiku-sdk-js:$(NODE_VER)$(SDK_SUFFIX)

# Same shape as the other four SDK gates, with one difference that is the whole
# reason node needed its own transport: the injected binary is the NATIVE ADDON
# (`make engine:napi`), not the shared cdylib — node has no stdlib FFI to load one
# with. The sidecar sdk/js/Dockerfile.dockerignore is what lets this build see
# sdk/ and dist/ at all; the root .dockerignore excludes both.
#
# The tarball is packed and installed in a scratch directory, NOT on the mount:
# installing from /repo would let the source tree satisfy the import and prove
# nothing about the artifact.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk\:js\:verify: ## sdk/js gates: biome + tsc + vitest at 100% coverage + pack/install
	@$(call gate,_sdk-js-verify,sdk:js:verify)

_sdk-js-verify: _engine-napi
	@echo "== sdk js image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@echo "== sdk js (biome + tsc + vitest + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run lint ;\
		pnpm run typecheck ;\
		pnpm run test ;\
		cp -r /repo/sdk/js /tmp/build ;\
		cd /tmp/build ;\
		rm -rf node_modules ;\
		pnpm install --ignore-scripts --frozen-lockfile ;\
		pnpm run build ;\
		pnpm pack --pack-destination /tmp/pack ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		npm init -y >/dev/null ;\
		npm install --no-audit --no-fund /tmp/pack/shojiku-*.tgz ;\
		node --input-type=module -e "import { Client } from \"shojiku\"; if (typeof Client !== \"function\") { throw new Error(\"the package does not export Client\"); }"'

sdk\:js\:test: ## sdk/js vitest only
	@$(call gate,_sdk-js-test,sdk:js:test)

_sdk-js-test: _engine-napi
	@echo "== sdk js test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run test'

# napi even for lint: the image COPYs the addon in, so it cannot build without
# one. Cheap after the first run — cargo has nothing to redo.
sdk\:js\:lint: ## sdk/js static checks only (biome + tsc)
	@$(call gate,_sdk-js-lint,sdk:js:lint)

_sdk-js-lint: _engine-napi
	@echo "== sdk js lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run lint ;\
		pnpm run typecheck'

sdk\:js\:format: _engine-napi ## Apply biome fixes to sdk/js (the seconds-cheap format pass)
	@echo "== sdk js format =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run format'
