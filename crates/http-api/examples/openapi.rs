//! Export the contract without binding a port or starting the server.
fn main() {
    println!(
        "{}",
        hongguo_http_api::openapi()
            .to_pretty_json()
            .expect("serialize OpenAPI")
    );
}
