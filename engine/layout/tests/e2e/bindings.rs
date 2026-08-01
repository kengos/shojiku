//! Named binding declarations (`bindings:`) end to end. "Resolution has
//! ONE choke point" is a claim about today's code, not something the wire
//! guarantees, so the suite proves each CARRIER separately, then the
//! scopes a declaration can reach and the precedence rules it follows.

mod carriers;
mod precedence;
mod scopes;
