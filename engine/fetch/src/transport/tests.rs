//! Tests for the real ureq transport, driven over a loopback listener so no
//! internet (and no TLS setup) is needed. The scheme/host gate lives in
//! `policy`, above this layer, which is what makes plain http here safe to use.

use super::*;
use crate::read::hex;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

/// Serves ONE canned HTTP response on loopback and returns its URL.
fn serve(response: Vec<u8>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let url = format!("http://{}/face.ttf", listener.local_addr().expect("addr"));
    let handle = thread::spawn(move || {
        if let Ok((mut sock, _)) = listener.accept() {
            // Drain the request line/headers so the client is not left writing
            // into a closed socket.
            let mut buf = [0u8; 1024];
            let _ = sock.read(&mut buf);
            let _ = sock.write_all(&response);
            let _ = sock.flush();
        }
    });
    (url, handle)
}

fn http_response(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
    let mut out = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body);
    out
}

fn transport() -> HttpTransport {
    HttpTransport::new(Duration::from_secs(10))
}

#[test]
fn a_200_response_yields_body_and_digest() {
    let body = b"font bytes over the wire".to_vec();
    let (url, h) = serve(http_response("200 OK", "", &body));

    let got = transport().get(&url, MAX_FACE_BYTES).expect("get");

    assert_eq!(got.bytes, body);
    assert_eq!(got.sha256, hex(&Sha256::digest(&body)));
    h.join().expect("server");
}

#[test]
fn a_redirect_is_reported_not_followed() {
    // The whole point: ureq must hand the 3xx back so the caller can re-check
    // the policy against the Location.
    let (url, h) = serve(http_response(
        "302 Found",
        "Location: https://objects.githubusercontent.com/blob\r\n",
        b"",
    ));

    let err = transport().get(&url, MAX_FACE_BYTES).unwrap_err();

    assert!(
        matches!(err, TransportError::Redirect(ref to) if to == "https://objects.githubusercontent.com/blob"),
        "got: {err:?}"
    );
    h.join().expect("server");
}

#[test]
fn a_redirect_without_a_location_is_an_error() {
    let (url, h) = serve(http_response("302 Found", "", b""));
    let err = transport().get(&url, MAX_FACE_BYTES).unwrap_err();
    assert!(
        matches!(err, TransportError::RedirectNoLocation),
        "got: {err:?}"
    );
    h.join().expect("server");
}

#[test]
fn a_non_200_status_is_an_error() {
    let (url, h) = serve(http_response("404 Not Found", "", b"nope"));
    let err = transport().get(&url, MAX_FACE_BYTES).unwrap_err();
    assert!(matches!(err, TransportError::Status(404)), "got: {err:?}");
    h.join().expect("server");
}

#[test]
fn an_oversized_body_is_cut_off_at_the_cap() {
    let body = vec![0u8; 4096];
    let (url, h) = serve(http_response("200 OK", "", &body));

    let err = transport().get(&url, 1024).unwrap_err();

    assert!(
        matches!(err, TransportError::TooLarge(1024)),
        "got: {err:?}"
    );
    h.join().expect("server");
}

#[test]
fn a_refused_connection_surfaces_as_io() {
    // Bind, learn the port, then drop the listener so nothing is listening.
    let url = {
        let l = TcpListener::bind("127.0.0.1:0").expect("bind");
        format!("http://{}/face.ttf", l.local_addr().expect("addr"))
    };
    let err = transport().get(&url, MAX_FACE_BYTES).unwrap_err();
    assert!(matches!(err, TransportError::Io(_)), "got: {err:?}");
}

#[test]
fn the_default_transport_is_constructible() {
    // Exercises the real agent build: native cert loading + the ring provider.
    let _ = HttpTransport::default();
}
