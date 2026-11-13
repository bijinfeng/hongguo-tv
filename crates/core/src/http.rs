use reqwest::ClientBuilder;

pub(crate) fn client_builder() -> ClientBuilder {
    // reqwest's no-provider mode otherwise panics; retain a host's existing provider.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let builder = reqwest::Client::builder();
    // The embedded Android host has no rustls-platform-verifier JVM setup; verify with bundled roots.
    #[cfg(target_os = "android")]
    let builder = builder.tls_backend_preconfigured(
        rustls::ClientConfig::builder()
            .with_root_certificates(bundled_roots())
            .with_no_client_auth(),
    );
    builder
}

#[cfg(any(target_os = "android", test))]
fn bundled_roots() -> rustls::RootCertStore {
    webpki_roots::TLS_SERVER_ROOTS.iter().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::{
        client::{WebPkiServerVerifier, danger::ServerCertVerifier},
        pki_types::{CertificateDer, ServerName, UnixTime},
    };

    #[test]
    fn bundled_trust_rejects_an_untrusted_certificate() {
        let roots = bundled_roots();
        assert!(!roots.is_empty());
        let verifier = WebPkiServerVerifier::builder_with_provider(
            std::sync::Arc::new(roots),
            std::sync::Arc::new(rustls::crypto::ring::default_provider()),
        )
        .build()
        .unwrap();
        let result = verifier.verify_server_cert(
            &CertificateDer::from(include_bytes!("http-test-cert.der").to_vec()),
            &[],
            &ServerName::try_from("localhost").unwrap(),
            &[],
            UnixTime::since_unix_epoch(std::time::Duration::from_secs(1_798_761_600)),
        );
        assert!(matches!(
            result,
            Err(rustls::Error::InvalidCertificate(
                rustls::CertificateError::UnknownIssuer
            ))
        ));
    }
}
