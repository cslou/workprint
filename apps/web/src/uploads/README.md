# Upload consumer boundary

`initiateUpload` still sends metadata only; it never transfers or confirms a
selected file. A grant/PUT is not a version. Existing composer appearance and
feedback remain unchanged; unknown native contexts now receive nondisclosing
404, not an obsolete unavailable-operation response.

The framework-free `transferUpload` in `@workprint/api-client` is a separate
bounded mechanical PUT capability: captured Blob, exact supplied grant, 64 MiB
maximum, two active transfers/no queue, at most 30 seconds, explicit cancellation,
no automatic retry/reacquisition/confirmation. It has no token provider and sends
only Content-Type with credentials omitted, no referrer and no redirects. A PUT
acknowledgement is not media verification or publication. Failed/cancelled
observation cannot promise server rollback or absence of stored bytes.

The isolated test composition exercises actual API authorization, private PUT
and no-verifier confirmation, plus scope teardown, without adding a product
control or working-upload success state. Its exact consumable observer matches
signed requests in memory while redacting signature/credential query values and
never retaining private transfer bodies; traces/video are disabled. API bearer
and cookie absence is checked at the actual browser storage request.

Production has no media verifier: confirmation explicitly fails and creates no
usable version/use. Completed chooser-to-verified-success UI and decoding belong
to their separately approved owner. Emulator transport is not R2 qualification.
