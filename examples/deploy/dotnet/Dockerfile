# Production shape: publish a trimmed console app with the Shojiku NuGet
# package (native engine per RID under runtimes/), then run it on the
# runtime-only image.
#
#   docker build -t receipt-renderer .
#   docker run --rm receipt-renderer > receipt.pdf
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Renderer.csproj Program.cs ./
RUN dotnet publish -c Release -o /out

FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app
COPY --from=build /out ./
COPY templates/ templates/
COPY packs/ packs/
CMD ["dotnet", "Renderer.dll"]
