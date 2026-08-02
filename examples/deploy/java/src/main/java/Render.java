// Renders the vendored template with its bundled sample data and writes the
// PDF to stdout — swap the params line for data from your app.
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import jp.kengos.shojiku.ShojikuClient;

public final class Render {
  public static void main(String[] args) throws Exception {
    var client =
        ShojikuClient.builder()
            .templates("templates/")
            .fontDirs(List.of("packs/fonts"))
            .localeDirs(List.of("packs/locale"))
            .build();
    var params = Files.readString(Path.of("templates/receipt-ja/params.json"));
    var result = client.generate("receipt-ja", params);
    if (!result.success()) {
      System.err.println(
          "render failed: " + result.failure().kind() + " | " + result.failure().message());
      System.exit(1);
    }
    System.out.write(result.artifact().bytes());
    System.out.flush();
  }
}
