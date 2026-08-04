<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * How a key signs, in the spelling the engine accepts.
 *
 * A BACKED enum so the wire spelling IS the value: a caller reading a name out
 * of a configuration file passes the string, a caller writing code passes the
 * case, and neither needs a translation table.
 */
enum Algorithm: string
{
    /**
     * RSA PKCS#1 v1.5 over SHA-256. The signature is the raw operation
     * output.
     */
    case RsaPkcs1Sha256 = 'rsa-pkcs1-sha256';

    /**
     * ECDSA on P-256 over SHA-256. The signature is an ASN.1 DER SEQUENCE,
     * which is what both major cloud key services return.
     */
    case EcdsaP256Sha256 = 'ecdsa-p256-sha256';
}
