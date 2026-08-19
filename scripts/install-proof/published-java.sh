#!/bin/sh
# Published-install proof, java: resolve `jp.kengos:shojiku` from Maven
# Central exactly as sdk/java/README.md tells a consumer to.
#
# It told them to declare the main artifact ALONE until 2026-08-02, when this
# proof showed that resolves the jar and JNA and no engine at all — Maven
# pulls a classifier only when a dependency names one, and the published POM
# has neither a profile nor a classifier dependency. So the README now says
# to declare BOTH, and this declares both: the proof tracks the documented
# path, which is the only one worth guarding.
#
# The classifier dependency below is PERMANENT, not a stopgap: carrying every
# platform in one jar was weighed and declined, because it is
# a cycle of arch-detection work to save consumers one line in an ecosystem
# where Netty and LWJGL ask for the same line.
# See published-python.sh for the rest of the rationale.
. "$(dirname "$0")/common.sh"

IMG="maven:${MAVEN_VER:-3-eclipse-temurin-21}"

# The classifier must match the architecture the CONTAINER runs as.
case "$(uname -m)" in
  arm64|aarch64) CLASSIFIER=linux-arm64 ;;
  x86_64)        CLASSIFIER=linux-x64 ;;
  *) echo "install-proof: unmapped host architecture $(uname -m)" >&2; exit 1 ;;
esac

echo "== published-install proof (java, $IMG, classifier $CLASSIFIER) =="

cat > "$WORK/pom.xml" <<XML
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>proof</groupId>
  <artifactId>proof</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>jp.kengos</groupId>
      <artifactId>shojiku</artifactId>
      <version>${PROOF_VERSION}</version>
    </dependency>
    <dependency>
      <groupId>jp.kengos</groupId>
      <artifactId>shojiku</artifactId>
      <version>${PROOF_VERSION}</version>
      <classifier>$CLASSIFIER</classifier>
    </dependency>
  </dependencies>
</project>
XML

mkdir -p "$WORK/src/main/java"
cat > "$WORK/src/main/java/Proof.java" <<'JAVA'
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

docker run --rm -v "$WORK:/w" -w /w \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  mvn -q -B dependency:resolve
  # What Central actually handed over. A classifier jar missing here is the
  # failure this proof exists for, and it is invisible until load time.
  mvn -B dependency:list 2>/dev/null | grep -i "jp.kengos\|net.java.dev.jna" || true
  mvn -q -B compile
  mvn -q -B exec:java -Dexec.mainClass=Proof'

assert_pdf "$WORK/out.pdf"
