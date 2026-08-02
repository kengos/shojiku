#!/bin/sh
# Deploy-recipe proof, java: examples/deploy/java builds and renders
# against the PUBLIC registry (see deploy-common.sh; python additionally
# proves the SQLite-params shape).
. "$(dirname "$0")/common.sh"
. "$(dirname "$0")/deploy-common.sh"
run_recipe java
