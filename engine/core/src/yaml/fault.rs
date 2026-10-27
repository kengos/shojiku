//! What a typed read of a [`super::Value`] failed on, kept as `serde`
//! reported it rather than only as prose.
//!
//! `serde` reports a structural failure through one constructor per kind (an
//! unknown field, a wrong type, …). [`TreeError`] is the error of the tree's
//! `Deserializer`: it keeps that kind and its operands as a [`Fault`], and
//! its message in `serde`'s own wording, so a caller can compare two failures
//! without matching their text. [`of_parser`] reads the same kinds off the
//! parser's error, which keeps them as it rewords them, so a failure read from
//! the source and one read from the tree compare equal when they are the same.

use serde::de::{self, value::Error as SerdeError};
use std::fmt;

/// The kind of a typed-read failure, with what `serde` named in it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Fault {
    /// A message of the type's own (`D::Error::custom`).
    Custom(String),
    InvalidType {
        unexpected: String,
        expected: String,
    },
    InvalidValue {
        unexpected: String,
        expected: String,
    },
    InvalidLength {
        len: usize,
        expected: String,
    },
    /// A variant the enum does not have, and the ones it does: the list
    /// tells one enum from another that rejects the same name.
    UnknownVariant {
        variant: String,
        expected: Vec<&'static str>,
    },
    /// A key the struct does not have, as it was spelled in the document,
    /// and the keys it does have: the list tells one struct from another
    /// that rejects the same key.
    UnknownField {
        field: String,
        expected: Vec<&'static str>,
    },
    MissingField(String),
    DuplicateField(String),
}

/// The kind of a failure the parser reported for a typed read, when it is
/// one `serde` reports. `None` for the parser's own errors.
#[expect(
    clippy::disallowed_types,
    reason = "the door itself: the parser's error is read for what serde failed on"
)]
pub(super) fn of_parser(err: &serde_saphyr::Error) -> Option<Fault> {
    use serde_saphyr::Error as E;
    Some(match err.without_snippet() {
        E::Message { msg, .. } => Fault::Custom(msg.clone()),
        E::SerdeInvalidType {
            unexpected,
            expected,
            ..
        } => Fault::InvalidType {
            unexpected: unexpected.clone(),
            expected: expected.clone(),
        },
        E::SerdeInvalidValue {
            unexpected,
            expected,
            ..
        } => Fault::InvalidValue {
            unexpected: unexpected.clone(),
            expected: expected.clone(),
        },
        E::SerdeInvalidLength { len, expected, .. } => Fault::InvalidLength {
            len: *len,
            expected: expected.clone(),
        },
        E::SerdeUnknownVariant {
            variant, expected, ..
        } => Fault::UnknownVariant {
            variant: variant.clone(),
            expected: expected.clone(),
        },
        E::SerdeUnknownField {
            field, expected, ..
        } => Fault::UnknownField {
            field: field.clone(),
            expected: expected.clone(),
        },
        E::SerdeMissingField { field, .. } => Fault::MissingField((*field).to_owned()),
        _ => return None,
    })
}

/// The error of the tree's `Deserializer` (`&Value` implements serde's
/// `Deserializer`, so this is public; what it keeps is the crate's own).
/// It displays as serde's own wording.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeError {
    pub(crate) fault: Fault,
    pub(crate) message: String,
}

impl TreeError {
    /// `fault`, worded the way `serde`'s own error words it.
    fn worded(fault: Fault, wording: SerdeError) -> Self {
        TreeError {
            fault,
            message: wording.to_string(),
        }
    }
}

impl fmt::Display for TreeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for TreeError {}

impl de::Error for TreeError {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        let message = msg.to_string();
        TreeError {
            fault: Fault::Custom(message.clone()),
            message,
        }
    }

    fn invalid_type(unexp: de::Unexpected<'_>, exp: &dyn de::Expected) -> Self {
        let fault = Fault::InvalidType {
            unexpected: unexp.to_string(),
            expected: exp.to_string(),
        };
        Self::worded(fault, SerdeError::invalid_type(unexp, exp))
    }

    fn invalid_value(unexp: de::Unexpected<'_>, exp: &dyn de::Expected) -> Self {
        let fault = Fault::InvalidValue {
            unexpected: unexp.to_string(),
            expected: exp.to_string(),
        };
        Self::worded(fault, SerdeError::invalid_value(unexp, exp))
    }

    fn invalid_length(len: usize, exp: &dyn de::Expected) -> Self {
        let fault = Fault::InvalidLength {
            len,
            expected: exp.to_string(),
        };
        Self::worded(fault, SerdeError::invalid_length(len, exp))
    }

    fn unknown_variant(variant: &str, expected: &'static [&'static str]) -> Self {
        let fault = Fault::UnknownVariant {
            variant: variant.to_owned(),
            expected: expected.to_vec(),
        };
        Self::worded(fault, SerdeError::unknown_variant(variant, expected))
    }

    fn unknown_field(field: &str, expected: &'static [&'static str]) -> Self {
        let fault = Fault::UnknownField {
            field: field.to_owned(),
            expected: expected.to_vec(),
        };
        Self::worded(fault, SerdeError::unknown_field(field, expected))
    }

    fn missing_field(field: &'static str) -> Self {
        let fault = Fault::MissingField(field.to_owned());
        Self::worded(fault, SerdeError::missing_field(field))
    }

    fn duplicate_field(field: &'static str) -> Self {
        let fault = Fault::DuplicateField(field.to_owned());
        Self::worded(fault, SerdeError::duplicate_field(field))
    }
}
