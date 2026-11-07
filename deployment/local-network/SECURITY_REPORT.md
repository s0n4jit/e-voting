# Campus E-Voting: Election Security Verification Report

**Subject**: Local Network TLS Hardening, mDNS Isolation, and Infrastructure Security  
**Environment**: Windows 11 Election Officer Host & Multi-Platform Booths (Windows & Ubuntu)  
**Standard**: Campus Election Security Guidelines (Zero-Trust Local Network Boundary)

---

## 1. Executive Summary

This report documents the security posture, isolation boundaries, and cryptographic controls implemented for the local network deployment of Campus E-Voting under `https://evoting.local`.

All requirements specified under Section 9 have been verified with zero security regressions.

---

## 2. Security Controls Verification Matrix

| # | Security Requirement | Implementation & Architectural Control | Verification Status |
|---|---|---|---|
| **1** | **Voter Credential Protection in Transit** | Plain HTTP is strictly forbidden for authentication and voting. Port 80 unconditionally issues HTTP 301/308 redirects to `https://evoting.local`. HSTS (`Strict-Transport-Security`) is enforced on all responses. | **Enforced** |
| **2** | **Network Boundary & Service Isolation** | PostgreSQL database (`db`) and backend Gunicorn API (`backend`) are attached exclusively to the internal Docker network (`evoting_default`). Port 5432 has no host mapping. Port 5000 is bound strictly to `127.0.0.1:5000` (localhost only). Only Caddy's ports (80 and 443) accept external LAN traffic. | **Enforced** |
| **3** | **Docker API & Management Protection** | No Docker daemon TCP sockets (`2375` or `2376`) or named pipes are exposed to the election LAN. Docker Engine communicates solely over local named pipe `//./pipe/dockerDesktopLinuxEngine`. | **Enforced** |
| **4** | **CA Private Key Isolation** | Caddy's internal Root CA private key (`root.key`) is stored in the Docker internal volume `caddy_data` (`/data/caddy/pki/authorities/local/root.key`) with strict POSIX permissions (`0600`). Only the public certificate (`root.crt`) is exported for distribution to voting booths. | **Enforced** |
| **5** | **Cryptographic Identity Assurance & MITM Prevention** | Trust is rooted in the specific, pre-verified public CA certificate (`evoting-ca.crt`). The booth setup scripts verify the SHA-256 fingerprint before importing the certificate into the machine root store. Self-signed or rogue certificates on the LAN are rejected automatically. | **Enforced** |
| **6** | **Windows Defender Firewall Scoping** | Inbound firewall rules created on the Windows 11 host (`CampusEVoting-HTTP-HTTPS` and `CampusEVoting-mDNS-In`) are restricted exclusively to the **Private** network profile. If the laptop connects to an untrusted Public network, the ports remain automatically blocked. | **Enforced** |
| **7** | **mDNS Spoofing & Conflict Handling** | `evoting-mdns-responder.py` performs interface and IP conflict probes before registering. In the event of a rogue device announcing `evoting.local`, the responder logs a critical conflict alert. Booths require matching HTTPS certificate SANs, rendering DNS spoofing ineffective without the CA private key. | **Enforced** |
| **8** | **Preservation of Existing Application Controls** | All database transactions, slip generation locking (`with_for_update`), bcrypt PIN hashing, TOTP booth approvals, and audit log tamper protections remain completely active. | **Enforced** |

---

## 3. Cryptographic Specifications

- **Key Exchange**: TLS 1.3 / TLS 1.2 with ECDHE
- **Cipher Suites**: Modern AEAD ciphers (`CHACHA20-POLY1305`, `AES-128-GCM`, `AES-256-GCM`)
- **CA Key Algorithm**: ECDSA (Curve P-256)
- **Leaf Certificate SAN**: `evoting.local`
- **Certificate Validity**: Dynamic short-lived leaf certificates with automatic rotation by Caddy.

---

## 4. Conclusion

The local network architecture provides end-to-end transport encryption, trusted server identity, and complete internal database isolation on an ordinary Windows 11 laptop, satisfying all election security and compliance standards.
