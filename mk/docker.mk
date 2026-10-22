# docker/ — the runtime image (build, render-verify, scan) and the Docker
# resources the gates leave behind (clean)
#
# Every target defined here is named `docker:<job>` (public) or `_docker-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

## ---- job: docker -------------------------------------------------------

docker\:verify: ## build + render-verify + trivy scan
	@$(call gate,_docker-verify,docker:verify)

_docker-verify: _docker-build _docker-render _docker-scan

docker\:build: ## Build the runtime image (docker/Dockerfile)
	@$(call gate,_docker-build,docker:build)

_docker-build:
	@echo "== docker build =="
	docker build -f docker/Dockerfile -t $(IMAGE) .

docker\:render: ## Render the bundled example and assert it is a PDF
	@$(call gate,_docker-render,docker:render)

_docker-render:
	@echo "== docker render + verify =="
	@docker run --rm $(IMAGE) > out.pdf 2> stderr.txt; \
	if [ -s stderr.txt ]; then echo "render emitted diagnostics:"; cat stderr.txt; exit 1; fi; \
	head -c 5 out.pdf | grep -q '%PDF-' || { echo "not a PDF"; exit 1; }; \
	echo "rendered $$(wc -c < out.pdf) bytes -> out.pdf"

docker\:scan: ## Trivy scan of the image (mirrors CI: fixable CVEs fail)
	@$(call gate,_docker-scan,docker:scan)

# `.trivyignore.yaml` carries the accepted findings, each with a reason and an
# expiry; it is mounted in because trivy runs in its own container and would
# otherwise never see the repository.
_docker-scan:
	@echo "== trivy scan =="
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
		-v "$(CURDIR)/.trivyignore.yaml:/.trivyignore.yaml:ro" $(TRIVY_IMAGE) \
		image --exit-code 1 --ignore-unfixed --ignorefile /.trivyignore.yaml \
		--severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL $(IMAGE)

## ---- job: toolchain --------------------------------------------------

# The toolchain image the engine gates run is published from main
# (.github/workflows/toolchain-image.yml), so a change to
# docker/toolchain.Dockerfile is otherwise first built after its merge. This
# builds it here from the Dockerfile's ARG defaults, which the pins step first
# checks against the Makefile (the values the workflow builds with), and checks
# that the result holds what the Makefile pins. PLATFORM=linux/amd64 or
# linux/arm64 builds that half instead of the host's; Docker Desktop emulates
# the other one. The gates never run this build: they run TOOLCHAIN_DIGEST.
docker\:toolchain: ## Build docker/toolchain.Dockerfile locally and check its tool versions (PLATFORM=linux/amd64|linux/arm64)
	@$(call gate,_docker-toolchain,docker:toolchain)

_docker-toolchain:
	@echo "== toolchain pins =="
	@scripts/check-toolchain-pins.sh
	@echo "== toolchain image build$(if $(PLATFORM), ($(PLATFORM))) =="
	docker build $(if $(PLATFORM),--platform $(PLATFORM)) -f docker/toolchain.Dockerfile -t $(TOOLCHAIN_LOCAL_IMAGE) docker
	@echo "== toolchain image versions =="
	@scripts/check-toolchain-image.sh $(TOOLCHAIN_LOCAL_IMAGE) $(PLATFORM)

## ---- job: clean --------------------------------------------------------
#
# The Docker resources the gates leave behind. They remove things and prove
# nothing, so they do not go through `quiet`: each resource is reported on a
# `removed` or `kept` line (scripts/docker-clean.sh says what is kept and why).
# The files inside a working tree are `clean:*`, kept apart on purpose.

# The images a local gate run leaves behind. They are cheap to lose — each
# rebuilds from the layer cache in seconds — but there are twelve of them and
# together they run to gigabytes, so a machine that has run `make verify` a few
# times accumulates silently with nothing offering to clean up.
#
# Deliberately driven off the same variables the gates BUILD with, rather than
# a `docker images` name pattern: that makes it WORK_TAG-aware for free, so a
# parallel session that sets its own WORK_TAG removes exactly its own images.
# Trees that set none all share `local`. It also means a renamed image cannot
# be missed here.
BUILT_IMAGES := $(IMAGE) $(GUI_APP_IMAGE) $(APP_E2E_IMAGE) $(WASM_E2E_IMAGE) \
                $(PHP_IMAGE) $(GO_IMAGE) $(RUBY_IMAGE) $(PYTHON_IMAGE) \
                $(DOTNET_IMAGE) $(JAVA_IMAGE) $(JS_IMAGE) $(TOOLCHAIN_LOCAL_IMAGE)

# The toolchain image is REMOVED, unlike the other pulled images: only this
# repository runs it, and the next engine gate pulls it again. The plain rust
# image stays listed: docker/Dockerfile, engine/wasm/e2e and gui/designer-app
# build FROM it, and other repositories may use it too.
DOCKER_CLEAN = SHOJIKU_BUILT_IMAGES="$(BUILT_IMAGES)" \
	SHOJIKU_TOOLCHAIN_IMAGE="$(RUST_IMAGE)" \
	SHOJIKU_PULLED_IMAGES="rust:$(RUST_VERSION)-slim-bookworm $(NODE_IMAGE) $(NODE_FLOOR_IMAGE) $(TRIVY_IMAGE) $(SYFT_IMAGE)" \
	SHOJIKU_CACHE_VOLUMES="$(CARGO_VOLUME) $(PNPM_VOLUME)" \
	SHOJIKU_LEGACY_VOLUMES="$(LEGACY_CACHE_VOLUMES)" \
	SLOT="$(SLOT)" scripts/docker-clean.sh

docker\:clean\:containers: ## Remove stopped gate containers from any worktree (running ones are only listed)
	@$(DOCKER_CLEAN) containers

docker\:clean\:volumes: ## Drop the free pooled target volumes, the cargo/pnpm caches and the pre-toolchain-image cargo/rustup volumes (SLOT=<k>: that slot only)
	@$(DOCKER_CLEAN) volumes

docker\:clean\:images: ## Remove this WORK_TAG's built images and every pin of the toolchain image (other sessions' images, base images and the build cache are only listed)
	@$(DOCKER_CLEAN) images

docker\:clean\:all: ## All three above, reporting what was removed and what was kept
	@$(DOCKER_CLEAN) all
