//! Box-model padding/margin end to end — deliberately cross-cutting
//! (text/rect/image/container/band/repeat all take `box.margin` /
//! `box.padding`); split by property.

mod margin;
mod padding;
