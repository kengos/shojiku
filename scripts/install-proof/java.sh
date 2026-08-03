#!/bin/sh
# Install proof, java: the engine inside a REAL platform classifier jar on the
# classpath — the shape whose absence shipped a package that could not load
# its own payload. The consumer classpath is exactly what a Maven resolve
# produces: the main jar, the platform classifier jar, and JNA.
# See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

JAVA_VER="${JAVA_VER:-21}"
IMG="maven:3.9-eclipse-temurin-${JAVA_VER}"
GATE_IMG="${GATE_IMG:-shojiku-sdk-java:${JAVA_VER}}"
require_artifact "$CAPI_LIB" capi-lib

case "$(uname -m)" in
  arm64|aarch64) PLATFORM=linux-arm64 ;;
  x86_64)        PLATFORM=linux-x64 ;;
  *) echo "install-proof: unmapped host architecture $(uname -m)" >&2; exit 1 ;;
esac

echo "== install proof (java, $IMG) =="

# The main jar is built in the GATE image, whose warmed offline Maven
# repository makes this seconds instead of a cold plugin download. Building
# there does not weaken the proof — the INSTALL environment below is clean.
DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION="$JAVA_VER" \
  -f "$ROOT/sdk/java/Dockerfile" -t "$GATE_IMG" "$ROOT" >/dev/null

cp -R "$ROOT/sdk/java" "$WORK/src"
docker run --rm -v "$WORK:/w" -w /w/src "$GATE_IMG" sh -euc '
  mvn -o -q -DskipTests -Dspotless.check.skip=true -Djacoco.skip=true \
    -Dmaven.javadoc.skip=true package
  cp target/shojiku-*.jar /w/ 2>/dev/null
  rm -f /w/*-sources.jar /w/*-javadoc.jar
  cp $(find /opt/m2 -name "jna-5*.jar" | head -1) /w/jna.jar'

# The classifier jar, assembled the way a release assembles it: the binary
# under native/ inside an archive. This is the artifact under test.
mkdir -p "$WORK/cj/native"
cp "$CAPI_LIB" "$WORK/cj/native/"
docker run --rm -v "$WORK:/w" -w /w/cj "$GATE_IMG" \
  jar cf "/w/shojiku-0.1.0-$PLATFORM.jar" native

cat > "$WORK/Proof.java" <<'JAVA'
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import jp.kengos.shojiku.ShojikuClient;

public final class Proof {
  public static void main(String[] args) throws Exception {
    if (System.getenv("SHOJIKU_LIBRARY") != null) {
      throw new IllegalStateException("void: a library was injected");
    }
    if (Files.exists(Path.of("/opt/shojiku"))) {
      throw new IllegalStateException("void: an engine exists outside the package");
    }
    var client =
        ShojikuClient.builder()
            .templates("/ex")
            .fontDirs(List.of("/packs/fonts"))
            .localeDirs(List.of("/packs/locale"))
            .build();
    var params = Files.readString(Path.of("/ex/receipt-ja/params.json"));
    var result = client.generate("receipt-ja", params);
    if (!result.success()) {
      System.err.println(
          "FAILED: " + result.failure().kind() + " | " + result.failure().message());
      System.exit(1);
    }
    Files.write(Path.of("/w/out.pdf"), result.artifact().bytes());
  }
}
JAVA

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  CP="$(ls /w/shojiku-0.1.0.jar):/w/shojiku-0.1.0-'"$PLATFORM"'.jar:/w/jna.jar"
  javac -cp "$CP" -d /w/classes /w/Proof.java
  java -cp "/w/classes:$CP" Proof'

assert_pdf "$WORK/out.pdf"
