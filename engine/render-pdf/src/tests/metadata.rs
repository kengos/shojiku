//! Document metadata on the PDF backend: what reaches the `/Info`
//! dictionary and the XMP packet, and what deliberately does not.

use super::*;

fn lossy(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}

fn body() -> &'static str {
    concat!(
        "page: { margin: 0 }\n",
        "sections:\n",
        "  body:\n",
        "    type: flow\n",
        "    box: { x: 0, y: 0, w: 500, h: 600 }\n",
        "    items:\n",
        "      - type: text\n",
        "        text: x\n",
    )
}

#[test]
fn metadata_reaches_the_info_dictionary_and_the_xmp_packet() {
    let bytes = render_template(
        &format!(
            concat!(
                "document:\n",
                "  title: Monthly Invoice\n",
                "  description: Invoice for January\n",
                "  keywords: [invoice, billing]\n",
                "  language: en-US\n",
                "  authors: [Accounting, Shojiku]\n",
                "{}"
            ),
            body()
        ),
        json!({}),
    );
    let content = lossy(&bytes);
    // /Info: title, subject (description), keywords, author.
    assert!(content.contains("/Title(Monthly Invoice)"), "no /Title");
    assert!(
        content.contains("/Subject(Invoice for January)"),
        "no /Subject"
    );
    assert!(
        content.contains("/Keywords(invoice, billing)"),
        "no /Keywords"
    );
    assert!(
        content.contains("/Author(Accounting, Shojiku)"),
        "no /Author"
    );
    // The language is the one field that does NOT ride /Info: it becomes the
    // catalog's `/Lang` (what a screen reader reads) and the XMP language.
    assert!(content.contains("/Lang(en-US)"), "no catalog /Lang");
    // XMP: the same facts in the metadata packet a search index reads.
    assert!(content.contains("<dc:title>"), "no dc:title");
    assert!(content.contains("Invoice for January"), "no description");
    assert!(content.contains("<dc:language>"), "no dc:language");
    assert!(content.contains("<pdf:Keywords>"), "no pdf:Keywords");
}

#[test]
fn a_template_without_metadata_keeps_its_name_as_the_title_alone() {
    let bytes = render_template(&format!("name: receipt_ja\n{}", body()), json!({}));
    let content = lossy(&bytes);
    assert!(content.contains("/Title(receipt_ja)"), "no /Title");
    // Nothing else is invented: a document that says nothing carries
    // nothing, so the output of every pre-`document:` template is unmoved.
    assert!(!content.contains("/Subject"), "unexpected /Subject");
    assert!(!content.contains("/Keywords"), "unexpected /Keywords");
    assert!(!content.contains("/Author"), "unexpected /Author");
}

#[test]
fn hostile_metadata_cannot_break_the_xmp_packet() {
    // XML metacharacters are legitimate title text. They must survive into
    // the PDF *escaped* — the packet stays well-formed, and the injected
    // element never appears.
    let bytes = render_template(
        &format!(
            "document:\n  title: \"Q&A <rdf:li>evil</rdf:li>\"\n{}",
            body()
        ),
        json!({}),
    );
    let content = lossy(&bytes);
    let packet_start = content.find("<x:xmpmeta").expect("an XMP packet");
    let packet_end = content.find("</x:xmpmeta>").expect("packet end");
    let packet = &content[packet_start..packet_end];
    assert!(packet.contains("&lt;rdf:li&gt;evil"), "title not escaped");
    assert!(packet.contains("Q&amp;A"), "ampersand not escaped");
    assert!(!packet.contains("<rdf:li>evil"), "raw element injected");
}

#[test]
fn no_creation_date_is_written_and_two_renders_are_byte_identical() {
    // Determinism: krilla writes a date only when given one, and the
    // engine never gives it one — "same inputs ⇒ same bytes" is what
    // sign/verify rests on.
    let template = format!("document:\n  title: Fixed\n{}", body());
    let first = render_template(&template, json!({}));
    let second = render_template(&template, json!({}));
    assert_eq!(first, second, "two renders differ");
    let content = lossy(&first);
    assert!(!content.contains("/CreationDate"), "a date was written");
    assert!(!content.contains("/ModDate"), "a modification date");
}
