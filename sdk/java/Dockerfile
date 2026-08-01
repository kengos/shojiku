# The Java SDK's gate environment.
#
# Nobody needs a JDK or Maven installed to work on this package: `make sdk-java`
# builds and runs this image, exactly as the Rust, Node, Ruby, Python and .NET
# gates run in theirs.
#
# The engine library is INJECTED as a pre-compiled artifact (built once by
# `make capi-lib` through the pinned Rust image) rather than compiled from Rust
# source here. Seven language images each building the engine would make the
# gate grid unusable.
#
# Two things this file has to get right, both of which fail confusingly:
#
#   * the repository root `.dockerignore` excludes `sdk`, so this build sees
#     nothing of the package it exists to test. The sidecar
#     `Dockerfile.dockerignore` beside this file REPLACES that root file for
#     this build and re-admits what is needed.
#   * the library has to be able to LOAD against this image's libc. Temurin's
#     Debian base and the Rust image's bookworm agree; a musl (alpine) base
#     would load nothing.
#
# Java 21 is the FLOOR from docs/agents/sdk.md, and the floor is what the gate
# runs on. JNA is the decided transport precisely so the floor CAN be 21: the
# foreign-function API finalizes in 22, which would exclude the LTS the
# enterprise and systems-integrator segment actually runs.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk-java` gates on.
ARG JAVA_VERSION=21
FROM maven:3.9-eclipse-temurin-${JAVA_VERSION}

# openssl is the test-key generator's only dependency (scripts/gen-test-keys.sh,
# shared with the Rust suites). Nothing else is needed: the transport is JNA,
# and the ENGINE never compiles anywhere — the platform classifier jar carries
# it prebuilt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Outside /repo on purpose: the gate mounts the repository over /repo, and a
# library that lived there would be hidden by the mount. The Maven repository is
# outside for the same reason — a resolve that wrote into the mount would dirty
# the working tree and be thrown away between runs.
COPY dist/capi/local/ /opt/shojiku/lib/
ENV SHOJIKU_LIBRARY=/opt/shojiku/lib/libshojiku_capi.so
ENV MAVEN_OPTS="-Dmaven.repo.local=/opt/m2"
# A named locale and UTF-8, so the JVM and javadoc do not fall back to a bare
# environment's empty one — and so test fixtures with non-ASCII read correctly.
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# Only what resolves the dependency graph, so a change to src/ does not re-run
# the resolve.
#
# `dependency:go-offline` is NOT enough on its own: it fetches DEPENDENCIES, and
# the lifecycle's plugins — and worse, surefire's test-framework PROVIDER, which
# surefire resolves at test time from whichever framework it finds — are not
# dependencies. A warm layer that skipped tests therefore left
# `surefire-junit-platform` unfetched, and the offline gate died on it. So the
# whole `verify` lifecycle is run once here over one throwaway test, which is
# the only thing that makes surefire choose and download its provider.
WORKDIR /warm
COPY sdk/java/pom.xml ./
RUN <<'WARM'
set -eu
mkdir -p src/main/java/jp/kengos/shojiku src/test/java/jp/kengos/shojiku
cat > src/main/java/jp/kengos/shojiku/Warm.java <<'JAVA'
package jp.kengos.shojiku;

/** Exists only so this image build resolves the plugins and the surefire provider. */
final class Warm {
  int one() {
    return 1;
  }
}
JAVA
cat > src/test/java/jp/kengos/shojiku/WarmTest.java <<'JAVA'
package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class WarmTest {
  @Test
  void runs() {
    assertEquals(1, new Warm().one());
  }
}
JAVA
mvn -B dependency:go-offline
# javadoc is SKIPPED here and only here: the throwaway class is package-private,
# and javadoc exits non-zero with "no public or protected classes found to
# document". The plugin is still resolved — the skip is checked inside the mojo,
# after Maven has fetched it — which is all this layer is for.
mvn -B -Dmaven.javadoc.skip=true verify
cd /
rm -rf /warm
WARM

WORKDIR /repo/sdk/java
# One command per line, like the make recipes: under `sh -euc`, errexit is
# SUPPRESSED for a failing command inside an `&&` list, so a chain with anything
# after it reports the LAST step's status.
CMD ["sh", "-euc", "mvn -B -o verify"]
