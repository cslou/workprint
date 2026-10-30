# Upload consumer boundary

`initiateUpload` still sends metadata only; it never transfers or confirms a
selected file. A grant/PUT is not a version. Existing composer appearance and
feedback remain unchanged; unknown native contexts now receive nondisclosing
404, not an obsolete unavailable-operation response.

The framework-free `transferUpload` in `@workprint/api-client` is a separate
bounded mechanical PUT capability: captured Blob, exact supplied grant, 100 MiB
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

The built backend now supports explicit qualified local verification and owned
image/poster reads; absent media configuration still explicitly fails confirmation.
The chooser-to-verified-success UI remains pending under its approved Story4 scope;
existing consumer controls above are not yet that completed workflow. Emulator transport is not R2 qualification.
