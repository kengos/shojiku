# docker/ — the runtime image: build, render-verify, scan
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

_docker-scan:
	@echo "== trivy scan =="
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock $(TRIVY_IMAGE) \
		image --exit-code 1 --ignore-unfixed \
		--severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL $(IMAGE)
