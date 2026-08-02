#!/bin/sh
# Deploy-recipe proof, java: examples/deploy/java builds and renders against
# the PUBLIC registry. The recipe pins the linux-x64 classifier (the common
# production case, and the documented pick-your-platform line); the proof
# rewrites it to the CONTAINER's architecture, exactly like
# published-java.sh does.
. "$(dirname "$0")/common.sh"
. "$(dirname "$0")/deploy-common.sh"
case "$(uname -m)" in
  arm64|aarch64) CLASSIFIER=linux-arm64 ;;
  x86_64)        CLASSIFIER=linux-x64 ;;
  *) echo "deploy-proof: unmapped host architecture $(uname -m)" >&2; exit 1 ;;
esac
stage_recipe java
sed -i.bak "s/<classifier>linux-x64<\/classifier>/<classifier>$CLASSIFIER<\/classifier>/" "$WORK/pom.xml"
rm -f "$WORK/pom.xml.bak"
echo "== deploy-recipe proof (java, classifier $CLASSIFIER) =="
docker build -q -t shojiku-deploy-java:proof "$WORK"
docker run --rm shojiku-deploy-java:proof > "$WORK/out.pdf"
assert_pdf "$WORK/out.pdf"
