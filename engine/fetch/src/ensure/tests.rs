//! Shared fixtures for the fetch-orchestration tests. The transport is faked
//! and counts calls, so "did this touch the network at all?" is itself an
//! assertion. Cases live in the submodules: `resolve` (which source a face
//! comes from) and `security` (what a hostile manifest or server cannot do).

use super::*;
use crate::read::hex;
use sha2::{Digest, Sha256};
use shojiku_core::{FontStyle, FontWeight};
use std::cell::RefCell;
use std::path::{Path, PathBuf};

const FONT: &[u8] = b"pretend font bytes";

fn sha_of(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

/// Serves canned replies keyed by URL and records every request.
#[derive(Default)]
struct FakeTransport {
    replies: Vec<(String, Reply)>,
    calls: RefCell<Vec<String>>,
}

enum Reply {
    Body(Vec<u8>),
    Redirect(String),
}

impl FakeTransport {
    fn with(replies: Vec<(&str, Reply)>) -> Self {
        Self {
            replies: replies
                .into_iter()
                .map(|(u, r)| (u.to_string(), r))
                .collect(),
            calls: RefCell::new(Vec::new()),
        }
    }
    fn calls(&self) -> Vec<String> {
        self.calls.borrow().clone()
    }
}

impl Transport for FakeTransport {
    fn get(&self, url: &str, _cap: u64) -> Result<crate::read::Hashed, TransportError> {
        self.calls.borrow_mut().push(url.to_string());
        match self.replies.iter().find(|(u, _)| u == url) {
            Some((_, Reply::Body(b))) => Ok(crate::read::Hashed {
                sha256: sha_of(b),
                bytes: b.clone(),
            }),
            Some((_, Reply::Redirect(to))) => Err(TransportError::Redirect(to.clone())),
            None => Err(TransportError::Status(404)),
        }
    }
}

fn temp_root(tag: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("shojiku-fetch-ensure-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn spec(path: PathBuf, sha: &str, url: Option<&str>) -> FaceSpec {
    FaceSpec {
        id: "sans".into(),
        path,
        family: "sans".into(),
        weight: FontWeight::Normal,
        style: FontStyle::Normal,
        sha256: sha.into(),
        embedding_attested: false,
        url: url.map(str::to_string),
        pack: "my-pack".into(),
    }
}

fn run(
    specs: Vec<FaceSpec>,
    root: &Path,
    transport: &dyn Transport,
    mode: Mode,
) -> Result<(Vec<FaceSpec>, FetchReport), FetchError> {
    ensure_faces(
        specs,
        &FontCache::new(root.to_path_buf()),
        &FetchPolicy::default(),
        transport,
        mode,
    )
}

mod resolve;
mod security;
