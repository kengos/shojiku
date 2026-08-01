package shojiku

// Version is this package's version.
//
// It tracks the engine workspace version: all seven SDKs move together while
// everything is pre-1.0 and publish together at the first public release. A
// Go module takes its version from a repository tag rather than from source,
// so this constant is where an application reads it — and a test pins it
// against engine/Cargo.toml, which is what makes "in lockstep" a checked
// claim rather than an intention.
const Version = "0.1.0"
