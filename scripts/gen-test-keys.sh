#!/bin/sh
# Generates the key material the signing tests run against.
#
# Nothing this writes is committed, and nothing it writes is reusable: every
# run makes fresh keys, so a repository checkout never contains a private key
# and a leaked test key is worth nothing. That is the whole reason this is a
# script rather than a fixtures directory.
#
# The tests invoke it (see engine/signing/src/key/tests.rs) with a per-process
# output directory. Everything it needs is in the toolchain image already:
# POSIX sh plus the openssl command.
#
# Usage: gen-test-keys.sh <output-dir>
#
# What lands in <output-dir>:
#
#   passphrase.txt      the passphrase the encrypted keys below use
#   rsa2048.key.pem     unencrypted PKCS#8, within the signing bounds
#   rsa2048.enc.pem     the same key as encrypted PKCS#8 (PBES2, AES-256-CBC)
#   rsa2048.cert.pem    a self-signed certificate for it
#   ec256.key.pem       unencrypted PKCS#8 on P-256
#   ec256.enc.pem       the same key as encrypted PKCS#8
#   ec256.cert.pem      a self-signed certificate for it
#   rsa4096.key.pem     the LARGEST modulus the backend signs with, with a
#   rsa4096.cert.pem    certificate to match: together they make the biggest
#                       container this release can produce, which is what the
#                       default signature window has to be able to hold
#   rsa1024.key.pem     BELOW the backend's signing floor (a rejection case)
#   rsa5120.key.pem     ABOVE the backend's signing ceiling (a rejection case)
#   rsa2048-e3.key.pem  in-range modulus, but a public exponent the backend
#                       refuses — the case our own size check cannot catch
#   ec384.key.pem       a curve this release does not sign with
#   ed25519.key.pem     an algorithm this release does not sign with
#
# And the chain material the VERIFIER's tests need. The certificates above are
# all self-signed, which only exercises "the signer's certificate IS the
# anchor"; a real chain check needs an issuer that is not the signer:
#
#   ca.key.pem          a certificate authority (basicConstraints CA:TRUE)
#   ca.cert.pem
#   leaf.key.pem        a signer whose certificate `ca` issued
#   leaf.cert.pem
#   leaf-expired.cert.pem  the SAME leaf key, certified for two days in 2020 —
#                       an expired chain that is otherwise perfectly valid
#   other-ca.key.pem    a second authority that signed nothing here: the
#   other-ca.cert.pem   wrong-anchor case
set -eu

out="${1:?usage: gen-test-keys.sh <output-dir>}"
mkdir -p "$out"

# A sentinel written last, so a half-finished directory is never mistaken for
# a complete one by a second caller.
if [ -f "$out/.complete" ]; then
	exit 0
fi

passphrase='shojiku test passphrase'
printf '%s' "$passphrase" >"$out/passphrase.txt"

# $1 = base name, $2 = openssl genpkey arguments (word-split ON PURPOSE, the
# one place in this script where it is wanted).
generate_key() {
	name="$1"
	shift
	openssl genpkey "$@" -out "$out/$name.key.pem" 2>/dev/null
}

generate_key rsa2048 -algorithm RSA -pkeyopt rsa_keygen_bits:2048
generate_key rsa1024 -algorithm RSA -pkeyopt rsa_keygen_bits:1024
generate_key rsa5120 -algorithm RSA -pkeyopt rsa_keygen_bits:5120
generate_key rsa2048-e3 -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
	-pkeyopt rsa_keygen_pubexp:3
generate_key rsa4096 -algorithm RSA -pkeyopt rsa_keygen_bits:4096
generate_key ec256 -algorithm EC -pkeyopt ec_paramgen_curve:P-256
generate_key ec384 -algorithm EC -pkeyopt ec_paramgen_curve:P-384
generate_key ed25519 -algorithm ED25519

# Encrypted PKCS#8 is what `openssl` writes for a password-protected key by
# default, so it is the format a caller most often has on disk.
for name in rsa2048 ec256; do
	openssl pkcs8 -topk8 -v2 aes-256-cbc \
		-in "$out/$name.key.pem" -out "$out/$name.enc.pem" \
		-passout "pass:$passphrase" 2>/dev/null
done

for name in rsa2048 ec256 rsa4096; do
	openssl req -x509 -new -sha256 -days 3650 \
		-key "$out/$name.key.pem" -out "$out/$name.cert.pem" \
		-subj "/CN=Shojiku Signing Test/O=Shojiku" 2>/dev/null
done

# --- chain material for the verifier -------------------------------------
#
# The two authorities are self-signed with basicConstraints CA:TRUE, because
# the verifier refuses an issuer that is not marked as one — name chaining
# alone would let anyone who copies a subject name insert themselves.
generate_key ca -algorithm RSA -pkeyopt rsa_keygen_bits:2048
generate_key other-ca -algorithm RSA -pkeyopt rsa_keygen_bits:2048
generate_key leaf -algorithm RSA -pkeyopt rsa_keygen_bits:2048

for name in ca other-ca; do
	openssl req -x509 -new -sha256 -days 3650 \
		-key "$out/$name.key.pem" -out "$out/$name.cert.pem" \
		-subj "/CN=Shojiku Test $name/O=Shojiku" \
		-addext "basicConstraints=critical,CA:TRUE" 2>/dev/null
done

# The expired certificate is issued through `openssl ca` rather than
# `openssl x509 -req`, because the `-not_before`/`-not_after` flags that would
# make this a one-liner do not exist before OpenSSL 3.3 and the toolchain
# image ships 3.0 — where they are silently rejected with a usage message and
# no output file. `-startdate`/`-enddate` on `openssl ca` have been there all
# along, at the price of the little database this sets up.
db="$out/ca-db"
mkdir -p "$db/newcerts"
: >"$db/index.txt"
printf '01\n' >"$db/serial"
cat >"$db/ca.cnf" <<EOF
[ca]
default_ca = CA_default
[CA_default]
dir = $db
database = \$dir/index.txt
new_certs_dir = \$dir/newcerts
serial = \$dir/serial
default_md = sha256
policy = policy_any
email_in_dn = no
rand_serial = no
unique_subject = no
[policy_any]
commonName = supplied
EOF

openssl req -new -key "$out/leaf.key.pem" -out "$db/leaf.csr" \
	-subj "/CN=Shojiku Test leaf" 2>/dev/null

openssl ca -batch -config "$db/ca.cnf" \
	-cert "$out/ca.cert.pem" -keyfile "$out/ca.key.pem" \
	-days 3650 -in "$db/leaf.csr" -out "$out/leaf.cert.pem" -notext 2>/dev/null

openssl ca -batch -config "$db/ca.cnf" \
	-cert "$out/ca.cert.pem" -keyfile "$out/ca.key.pem" \
	-startdate 20200101000000Z -enddate 20200102000000Z \
	-in "$db/leaf.csr" -out "$out/leaf-expired.cert.pem" -notext 2>/dev/null

printf 'ok\n' >"$out/.complete"

# Prove what was produced rather than exiting quietly: a generator that
# silently made nothing would leave every test failing for the wrong reason.
#
# `-maxdepth 1` on purpose: `openssl ca` also drops a copy of every certificate
# it issues into its own `newcerts` directory, and counting those would make
# the total drift with the CA database rather than with what the tests use.
count=$(find "$out" -maxdepth 1 -name '*.pem' | wc -l | tr -d ' ')
printf 'gen-test-keys: wrote %s PEM files to %s\n' "$count" "$out"
if [ "$count" -ne 20 ]; then
	printf 'gen-test-keys: expected 20 PEM files, got %s\n' "$count" >&2
	exit 1
fi
