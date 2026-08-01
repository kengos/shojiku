package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/**
 * What this client guarantees when several threads use it.
 *
 * <p>Stated, not assumed: the capi header's THREADING section says the operations are
 * concurrency-safe and a handle is single-owner, and this binding never shares a handle across a
 * call. What that buys an application is here.
 */
class ConcurrencyTest extends Fixtures {

  @Test
  void oneClientRendersFromFourThreadsAndTheBytesAgree()
      throws InterruptedException, ExecutionException {
    // The same assertion the capi's own suite makes, one layer up: four threads,
    // one client, byte-identical documents. A binding that shared a result handle
    // across calls would produce torn output here.
    ShojikuClient client = client().build();
    Map<String, Object> params = Map.of("customer", Map.of("name", "Yamada Shoji K.K."));
    byte[] expected = client.generate("receipt", params).unwrap().bytes();

    List<byte[]> produced = inParallel(() -> client.generate("receipt", params).unwrap().bytes());

    for (byte[] bytes : produced) {
      assertArrayEquals(expected, bytes);
    }
  }

  @Test
  void concurrentFailuresFreeTheirHandlesToo() throws InterruptedException, ExecutionException {
    // The failure path is the one a leak hides in: nothing reads a buffer, so
    // nothing notices the handle that was never released.
    ShojikuClient client = client().build();

    for (Boolean failed : inParallel(() -> client.generate("broken", null).failed())) {
      assertTrue(failed);
    }
  }

  private static <T> List<T> inParallel(Callable<T> work)
      throws InterruptedException, ExecutionException {
    try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
      List<Future<T>> futures = IntStream.range(0, 4).mapToObj(index -> pool.submit(work)).toList();
      List<T> results = new java.util.ArrayList<>();
      for (Future<T> future : futures) {
        results.add(future.get());
      }
      return results;
    }
  }
}
