//! Unit tests for the template model, grouped by concern.

mod authorability;
mod bindings;
mod char_grid;
mod formats;
mod imposition_flags;
mod items;
mod located_errors;
mod model;
mod page_sizes;
mod parse;
mod repeat;
mod repeat_flow;
mod ruby;
mod spans;
mod table;
mod table_cells;
mod table_rows;

use super::*;
use crate::geometry::{Orientation, PageMargin, PageSize};
use crate::length::Length;
use crate::style::{LineBreak, TextAlign};
