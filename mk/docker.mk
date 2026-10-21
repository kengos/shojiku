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

## ---- job: clean --------------------------------------------------------
#
# The Docker resources the gates leave behind. They remove things and prove
# nothing, so they do not go through `quiet`. The files inside a working tree
# are `clean:*`, kept apart on purpose.

# The images a local gate run leaves behind. They are cheap to lose — each
# rebuilds from the layer cache in seconds — but there are eleven of them and
# together they run to gigabytes, so a machine that has run `make verify` a few
# times accumulates silently with nothing offering to clean up.
#
# Deliberately driven off the same variables the gates BUILD with, rather than
# a `docker images` name pattern: that makes it WORK_TAG-aware for free, so a
# parallel session removes exactly its own images and cannot reach another
# session's. It also means a renamed image cannot be missed here.
BUILT_IMAGES := $(IMAGE) $(GUI_APP_IMAGE) $(APP_E2E_IMAGE) $(WASM_E2E_IMAGE) \
                $(PHP_IMAGE) $(GO_IMAGE) $(RUBY_IMAGE) $(PYTHON_IMAGE) \
                $(DOTNET_IMAGE) $(JAVA_IMAGE) $(JS_IMAGE)

docker\:clean\:images: ## Remove the docker images this tree's gates build (keeps the cache volumes)
	@docker rmi $(BUILT_IMAGES) 2>/dev/null || true
	@echo "removed this tree's built images (WORK_TAG=$(WORK_TAG)); cache and target volumes kept — 'make docker:clean:volumes' drops those"

# The pooled target volumes no gate is using and the cargo/rustup/pnpm caches.
# A slot another tree is using is reported and kept. SLOT=<k> drops that one
# slot and nothing else — the reset for a slot that went bad, which must not
# cost the caches minutes to refill.
docker\:clean\:volumes: ## Drop the free pooled target volumes and the cargo/rustup/pnpm caches (SLOT=<k>: that slot only)
	@$(GATE_LOCK) scripts/target-slot.sh clean $(SLOT)
	$(if $(SLOT),,-docker volume rm $(CARGO_VOLUME) $(RUSTUP_VOLUME) $(PNPM_VOLUME))
