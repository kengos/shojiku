# Production shape: a Maven build with the Shojiku jar + the PLATFORM
# CLASSIFIER jar (the one deliberate line — Maven never resolves a
# classifier on its own; pick the classifier of the image you run on).
#
#   docker build -t receipt-renderer .
#   docker run --rm receipt-renderer > receipt.pdf
FROM maven:3-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src/ src/
RUN mvn -q package dependency:copy-dependencies -DoutputDirectory=/deps

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/renderer-1.jar app.jar
COPY --from=build /deps/ deps/
COPY templates/ templates/
COPY packs/ packs/
CMD ["java", "-cp", "app.jar:deps/*", "Render"]
