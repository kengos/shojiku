package jp.kengos.shojiku;

/**
 * What a client can sign with.
 *
 * <p>A marker. The operation a provider performs crosses package-private types (the engine and its
 * snapshot), so the hook itself lives on {@code EngineSigner} and the two providers this package
 * ships — {@link LocalPem} and {@link ExternalSigner} — are its implementations. A provider of your
 * own is a design change rather than a subclass.
 */
public interface SigningProvider {}
