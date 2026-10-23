//! Writes a value as YAML, through the same parser crate the door reads with.

use super::error::{YamlError, YamlErrorKind};
use serde::Serialize;

pub(super) fn to_string<T: Serialize + ?Sized>(value: &T) -> Result<String, YamlError> {
    serde_yaml::to_string(value)
        .map_err(|err| YamlError::new(YamlErrorKind::Write, err.to_string()))
}
