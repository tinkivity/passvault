# PassVault Email Template Design Manual

## Overview

PassVault uses HTML email templates stored in S3 at `templates/{language}/{type}.html`. Admins upload and manage them through the Admin UI under **Email > Templates**. When the system sends an email, it loads the appropriate template for the user's preferred language, replaces `{{variable}}` placeholders with actual values, and sends both the HTML and a plain-text fallback.

Templates are simple HTML files. No special tooling is required -- any text editor works.

## Template Types

| Type | Description | Variables |
|------|-------------|-----------|
| `invitation` | Welcome email with OTP for new users | `userName`, `otpCode`, `otpExpiryMinutes`, `verifyUrl`, `linkExpiryDays` |
| `otp-refresh` | New one-time password generated | `userName`, `otpCode`, `otpExpiryMinutes` |
| `account-reset` | Account reset by admin | `userName`, `otpCode` |
| `email-verification` | Verify email address | `verifyUrl`, `linkExpiryHours` |
| `email-change-verify` | Confirm email change | `verifyUrl`, `linkExpiryHours` |
| `email-change-notify` | Security alert: email change requested | `newEmail`, `lockUrl`, `linkExpiryHours` |
| `vault-export` | Encrypted vault export attached | `userName`, `exportDate`, `filename` |
| `vault-backup` | Scheduled vault backup attached | `userName`, `vaultName`, `backupDate`, `unsubscribeUrl`, `currentFrequency` |

## Common Variables

The following variables are automatically injected into every template. You do not need to pass them -- they are always available:

| Variable | Value |
|----------|-------|
| `{{appName}}` | `PassVault` |
| `{{appUrl}}` | Frontend URL for the current environment |
| `{{logoUrl}}` | URL to the application logo (PNG, served from frontend) |
| `{{recoveryGuideUrl}}` | Link to the Recovery Guide on GitHub |
| `{{year}}` | Current year (e.g. `2026`) |

## Design Guidelines

Templates follow a clean, professional aesthetic: minimal design, generous whitespace, and clear hierarchy.

### Layout

- Use a `<table>` layout with `max-width: 600px`, centered with `margin: 0 auto`
- Wrap content in a single-column table cell for maximum compatibility
- Use `role="presentation"` on layout tables and `role="module"` on content wrappers

### Typography

- Use system fonts only: `system-ui, 'Segoe UI', Inter, Roboto, sans-serif`
- Body text: `16px`, line-height `1.6`, color `#333333`
- Headings: `20-24px`, weight `600`, color `#111111`
- Links: color `#0066cc`, underline

### Colors

- Background: `#f5f5f7` (outer), `#ffffff` (content card)
- Border: `1px solid #e5e5e7` on the content card
- Accent/buttons: `#0066cc` background, `#ffffff` text, `border-radius: 8px`
- Footer text: `#86868b`, `12px`

### Spacing

- Outer padding: `40px 20px`
- Inner content padding: `40px`
- Between sections: `24px`

### Dark Mode (Optional)

Add a `<meta name="color-scheme" content="light dark">` tag and use `prefers-color-scheme` in a `<style>` block for clients that support it. Since some clients strip `<style>` blocks, the light theme must work standalone via inline CSS.

```html
<style>
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: #1a1a1a !important; }
    .email-card { background-color: #2a2a2a !important; border-color: #3a3a3a !important; }
    .email-text { color: #e0e0e0 !important; }
  }
</style>
```

### Responsive

- Use `width: 100%; max-width: 600px` so the template shrinks on mobile
- Keep font sizes at 16px minimum for body text (mobile readability)
- Use percentage widths for images if any (none recommended -- see Constraints)

## Editing Workflow

1. **Edit** the `.html` file in any text editor (VS Code, Sublime Text, or even Notepad).
2. **Preview** by opening the file directly in your browser (`file:///path/to/template.html`). The `{{variable}}` placeholders will show as literal text, which is fine -- they are replaced at send time.
3. **Use `{{variable}}` placeholders** wherever dynamic content belongs. At send time, each placeholder is replaced with its value. If a variable has no value, the placeholder is replaced with an empty string.
4. **Upload** via Admin UI > Email > Templates. Select the template type and language, then upload the file.

## Plain Text Fallback

Every template **must** include a plain-text version between special HTML comment markers. The system extracts this block and sends it as the `text/plain` MIME part for clients that don't render HTML.

Place the following anywhere in your HTML file (typically at the bottom, before the closing `</body>`):

```html
<!-- PLAIN_TEXT_START -->
PassVault

Hello {{userName}},

Your one-time password is: {{otpCode}}
It expires in {{otpExpiryMinutes}} minutes.

- The {{appName}} Team
{{appUrl}}
<!-- PLAIN_TEXT_END -->
```

Rules for the plain-text block:

- Everything between `<!-- PLAIN_TEXT_START -->` and `<!-- PLAIN_TEXT_END -->` is extracted verbatim
- Use the same `{{variable}}` placeholders as in the HTML body
- Keep lines under 78 characters for maximum compatibility
- Do not use HTML tags inside the plain-text block

## Internationalization (i18n)

PassVault supports multiple languages: `en` (English), `de` (German), `fr` (French), `ru` (Russian).

### How it works

Templates are stored in S3 with a language prefix: `templates/{language}/{type}.html`. When sending an email, the system:

1. Reads the user's `preferredLanguage` setting (set by admin during user creation, auto-detected on login, or changed by the user/admin later)
2. Attempts to load `templates/{language}/{type}.html`
3. If not found, falls back to `templates/en/{type}.html`

This means English templates are **required** (they are the fallback), while other languages are optional. You can translate one template at a time — untranslated templates will use the English version.

### Creating a language variant

1. Download the English template via **Admin UI > Email > Templates** (click the Download button on the EN tab)
2. Open the `.html` file in any text editor
3. Translate all user-visible text. **Do not translate:**
   - `{{variable}}` placeholders — these are replaced by the system
   - HTML tags and CSS styles
   - The `<!-- PLAIN_TEXT_START -->` and `<!-- PLAIN_TEXT_END -->` marker names
4. Translate the plain-text block between the markers as well
5. Upload via the Admin UI, selecting the target language tab (DE, FR, RU)

### Tips

- Keep the HTML structure identical across all languages — only change the text content
- Some languages (e.g., German) produce longer text. Test that the layout doesn't break with longer strings
- The `{{appName}}` variable is always "PassVault" regardless of language — it is a brand name and should not be translated
- Email subjects are currently not template-driven and remain in English. Subject localization may be added in a future version
- To preview a translated template, use the Preview button in the Admin UI — it works for all languages

## Testing

There are two ways to test templates:

1. **Admin UI Preview**: After uploading a template, use the preview button in Admin UI > Email > Templates. This renders the template with sample data so you can verify the layout and variable substitution.

2. **Live Test**: Set your own user's `preferredLanguage` to the target language, then trigger the relevant email flow. For example:
   - `invitation`: Create a new test user
   - `otp-refresh`: Refresh a user's OTP
   - `account-reset`: Reset a user's account
   - `email-verification`: Change a user's email to trigger verification
   - `vault-export`: Export a vault via email
   - `vault-backup`: Configure a scheduled backup and wait for it to fire

## Constraints

- **No external resources**: Do not reference external images, fonts, stylesheets, or scripts. Everything must be self-contained. Some email clients block external resources entirely; others show broken-image icons.
- **No JavaScript**: Email clients strip all `<script>` tags. Do not include any.
- **No `<style>` blocks** (as primary styling): Some clients (notably Gmail) strip `<style>` blocks entirely. All visual styling must be applied via inline `style=""` attributes. A `<style>` block is acceptable only for progressive enhancement (e.g. dark mode), not for core layout.
- **All CSS inline**: Use `style="..."` on every element that needs styling. This is the only reliable way to style HTML emails across all clients.
- **Max 500 KB**: Templates must not exceed 500 KB. This is enforced at upload time. In practice, a well-designed text-only template is typically 5-15 KB.

## Template Versioning

- Templates carry a version string (currently `1.0.0`, defined in `EMAIL_TEMPLATE_CONFIG.TEMPLATE_VERSION`)
- The version is bumped when the template structure changes (new variables, layout changes)
- On import, if the zip's version does not match the system version, a warning is shown
- Version mismatches do not block imports -- they are informational only
- The current version can be retrieved via `GET /api/admin/email-templates/version`

## Change Tracking

The system tracks which templates have been modified from the CDK-deployed originals.

- Modified templates show an "edited" badge in the Admin UI template list
- Hash comparison (SHA-256) determines modification status: the system computes a hash of each template and compares it against the hash of the original CDK-deployed version
- Re-deploying the system (via `cdk deploy`) updates the original baseline hashes
- The `modified` flag is returned in the template metadata from `GET /api/admin/email-templates`

## Bulk Export

Use the **Export** button in Admin UI > Email > Templates.

- **Modified only** checkbox (checked by default) exports only templates that differ from the CDK originals
- Uncheck to export all templates regardless of modification status
- The export produces a `.zip` file containing:
  - HTML files organized by `{language}/{type}.html`
  - A `_export.json` manifest with the template version and SHA-256 hashes for each file
- The zip filename includes the environment and a timestamp (e.g. `passvault-templates-beta-2026-04-06.zip`)
- The endpoint is `GET /api/admin/email-templates/export?modifiedOnly=true|false`

## Bulk Import

Use the **Import** button in Admin UI > Email > Templates.

1. Upload a `.zip` file in the same format as the export (HTML files in `{language}/{type}.html` paths)
2. The system performs the following validations:
   - **Version compatibility**: if the zip's `_export.json` contains a version that does not match the current system version, a warning is shown
   - **Placeholder validation**: all `{{variables}}` in each template are checked against the known variables for that template type (see Template Types table and Common Variables above)
   - Unknown placeholders trigger warnings but do not block the import
   - Invalid file paths, unrecognized template types, or unsupported languages are reported as errors and those files are skipped
3. After import, a summary shows the number of imported templates, any warnings, and any errors
4. The endpoint is `POST /api/admin/email-templates/import` with a JSON body containing `{ data: "<base64-encoded zip>" }`
