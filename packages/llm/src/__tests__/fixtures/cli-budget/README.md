# Synthetic transport certificate

These self-signed localhost certificate and encrypted private-key files were
generated solely for the request-budget transport tests. They identify no real
user, service or account and must never be used outside tests.

The deliberately public test passphrase is `synthetic-fixture-passphrase`.
The certificate is valid from October 2026 through October 2036. Tests supply it
as their explicit trusted CA; it is never installed in a machine trust store.
