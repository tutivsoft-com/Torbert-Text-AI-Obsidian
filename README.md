# Torbert Text AI

Apply the existing text transformations and AI writing commands to selected text or notes.

## Use

Install or update Torbert Text AI through Obsidian Community plugins and enable it. In the command palette, search for Torbert Text AI and choose a transformation. Most editor commands use the selected text or the whole note if nothing is selected. For Markdown files, use the Torbert Text AI menu in the file explorer.

Commands apply changes immediately. Use **Restore last change** to recover the latest recorded edit. Open **Show AI request queue** to see the active request or clear waiting requests.

## Account and billing

Connect your Constance account in plugin settings. If you create an account, confirm the email link and then connect again. Authentication, current offers, free allowance, purchased balance and payment confirmation use the Constance v2 service at https://app.tutivsoft.com.

Current paid names, descriptions, prices, currencies and included units come from the payment provider through Constance. Refresh the displayed offers before buying. If current pricing cannot be verified, buying is unavailable. Only canonical payment fulfillment grants credits. A completed purchase stays saved until the refreshed balance is saved and acknowledged. Pending requests retain their original identity after a retry or restart. Account and Buy credits use separate theme-aware sections with standard Obsidian controls. Balance summaries stay with Account. Purchase progress and elapsed time appear directly below the offers. Automatic checks begin after three seconds, then every five seconds for up to five minutes. Check payment and Cancel current purchase are the only purchase-status actions. Completion requires canonical fulfillment, a saved refreshed balance and acknowledgement of the original purchase. A browser return or timer does not grant credits.

New purchases use Paddle and USD. Existing historical purchases retain their original provider. No payment credentials are bundled in the plugin.

## Privacy and recovery

Account requests send authentication and billing information to Constance. Passwords are not saved. Session credentials and recovery state are kept in local plugin settings. Billing requests do not contain note or image contents. Local transformations stay in your vault. When you run an AI action, Torbert sends the input directly to OpenRouter. Basic usage events go to Matomo without note contents.

The plugin sends startup and error reports to Datadog separately from the local diagnostic buffer. Reports include the plugin version and platform. Error reports also include recent action names and error details, which can include file paths or content. Recognized credential patterns in those details are redacted.

Uncertain older billing records are retained and are never replayed as new v2 charges. Connect the original account and contact support if an earlier operation needs recovery.

## Version 5.8.86

Stop queued edits when the note or selection changes. Restore the original note and only changes the batch applied. Count successful writes in the completion notice.

Requires Obsidian 1.5.0 or later. [GitHub releases](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian/releases).

## Support

Use **Open Help** in plugin settings or **Open documentation** in the command palette. For a billing problem, keep the original purchase or operation ID and open the [Constance account page](https://app.tutivsoft.com). Do not share passwords or session tokens.
