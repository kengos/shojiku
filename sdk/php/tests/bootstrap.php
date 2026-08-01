<?php

declare(strict_types=1);

/*
 * The suite's autoloader.
 *
 * Registered by hand rather than through `vendor/autoload.php`, for the same
 * reason the python gate puts `src/` on `PYTHONPATH`: the gate image installs
 * no dependencies for this package because it HAS none, and running
 * `composer install` on the mounted repository to produce an autoloader would
 * write into the source tree. That the real, composer-generated autoloader
 * works is proved separately, by the packaging step in `make sdk-php`, which
 * installs the package from its own artifact into a scratch directory.
 */

spl_autoload_register(static function (string $class): void {
    $roots = [
        'Shojiku\\Tests\\' => __DIR__.DIRECTORY_SEPARATOR,
        'Shojiku\\' => dirname(__DIR__).DIRECTORY_SEPARATOR.'src'.DIRECTORY_SEPARATOR,
    ];
    foreach ($roots as $prefix => $dir) {
        if (!str_starts_with($class, $prefix)) {
            continue;
        }
        $relative = substr($class, strlen($prefix));
        $path = $dir.str_replace('\\', DIRECTORY_SEPARATOR, $relative).'.php';
        if (is_file($path)) {
            require $path;
        }

        return;
    }
});
