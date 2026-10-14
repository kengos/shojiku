//! The bounded pack-file read: a regular file inside the cap is read whole,
//! and a device, a FIFO, a directory or an oversize file is refused without
//! its content being read.

use super::read_pack_file;
use std::io::ErrorKind;
use std::path::PathBuf;

fn tmp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("shojiku-packread").join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

#[test]
fn a_regular_file_inside_the_cap_is_read_and_a_missing_one_is_not_found() {
    let dir = tmp("regular");
    let file = dir.join("manifest.yml");
    std::fs::write(&file, "version: 1\n").expect("write");
    assert_eq!(read_pack_file(&file).expect("read"), "version: 1\n");
    let err = read_pack_file(&dir.join("absent.yml")).expect_err("missing");
    assert_eq!(err.kind(), ErrorKind::NotFound);
}

#[test]
fn a_path_that_is_not_a_regular_file_is_refused_unread() {
    let dir = tmp("special");
    // A symlink to an endless device: read whole, it never ends.
    let zero = dir.join("zero.yml");
    std::os::unix::fs::symlink("/dev/zero", &zero).expect("symlink");
    // A FIFO with no writer: opening it for reading blocks forever.
    let fifo = dir.join("fifo.yml");
    let made = std::process::Command::new("mkfifo")
        .arg(&fifo)
        .status()
        .expect("mkfifo runs");
    assert!(made.success());
    for path in [zero, fifo, dir.clone()] {
        let err = read_pack_file(&path).expect_err("refused");
        assert_eq!(err.kind(), ErrorKind::InvalidInput, "{}", path.display());
    }
}

#[test]
fn an_oversize_or_non_utf8_file_is_invalid_data() {
    let dir = tmp("oversize");
    let big = dir.join("big.yml");
    // Sparse: refused from its recorded size, before any byte is read.
    let file = std::fs::File::create(&big).expect("create");
    file.set_len(shojiku_core::MAX_INPUT_BYTES as u64 + 1)
        .expect("set_len");
    let err = read_pack_file(&big).expect_err("oversize");
    assert_eq!(err.kind(), ErrorKind::InvalidData);
    assert!(err.to_string().contains("input cap"), "{err}");
    // Positive control: at the cap the same file is read.
    file.set_len(shojiku_core::MAX_INPUT_BYTES as u64)
        .expect("set_len");
    let at_cap = read_pack_file(&big).expect("at the cap");
    assert_eq!(at_cap.len(), shojiku_core::MAX_INPUT_BYTES);
    let latin1 = dir.join("latin1.yml");
    std::fs::write(&latin1, b"id: \xe9\n").expect("write");
    let err = read_pack_file(&latin1).expect_err("not UTF-8");
    assert_eq!(err.kind(), ErrorKind::InvalidData);
}
