//! Development API. Binds loopback only; never accesses legacy user data.
use hongguo_http_api::{DevPolicy, router};
use std::{error::Error, io::Write};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut port = 0_u16;
    let mut origin = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => port = args.next().ok_or("--port needs a value")?.parse()?,
            "--allow-origin" => {
                let value = args.next().ok_or("--allow-origin needs a value")?;
                let raw_port = value
                    .strip_prefix("http://127.0.0.1:")
                    .ok_or("only loopback development origins are supported")?;
                if raw_port.parse::<u16>()? == 0 {
                    return Err("origin port must be nonzero".into());
                }
                origin = Some(value.parse()?);
            }
            _ => return Err(format!("Unknown argument: {arg}").into()),
        }
    }
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let address = listener.local_addr()?;
    let app = router(DevPolicy::new(address.port(), origin))?;
    println!(
        "{}",
        serde_json::json!({"event":"ready", "origin":format!("http://{address}")})
    );
    std::io::stdout().flush()?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
