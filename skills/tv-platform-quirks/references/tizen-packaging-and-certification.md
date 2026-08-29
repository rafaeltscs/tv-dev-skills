# Tizen Packaging and Certification

Samsung's packaging diverges from webOS in two ways that matter up front:

1. The manifest is **`config.xml`** (a W3C Widget manifest with
   `tizen:` extensions), not `appinfo.json`, and the package is a
   **signed `.wgt`**, not an `.ipk`.
2. **Signing is mandatory even to side-load.** You cannot install an
   unsigned `.wgt` on a real TV; the signature also pins device access
   and update identity.

## config.xml

Lives at the package root. Key entries for a TV app:

| Entry | Purpose |
|---|---|
| `<widget id="http://yourdomain/AppName">` | W3C widget id (URI form). |
| `<tizen:application id="XXXXXXXXXX.AppName" package="XXXXXXXXXX" required_version="2.4"/>` | **Tizen application ID** (`<10-char package>.<name>`), package id, and `required_version` = the API/Tizen version floor that gates which TV model years can install it. |
| `<name>` / `<tizen:name>` | Title; the default-language name must match the Seller Office title. |
| `<content src="index.html"/>` | Entry document. |
| `<icon src="icon.png"/>` | App icon. |
| `<tizen:profile name="tv"/>` | Target profile. |
| `<feature name="http://tizen.org/feature/screen.size.all"/>` or a specific `screensize` | Screen size support — required by the launch checklist. |
| `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>` etc. | **Every `tizen.*` / `webapis.*` namespace you call needs its privilege listed** or the call throws `SecurityError` at runtime — and undeclared privileges are also a submission rejection. |
| `<tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" .../>` | Runtime settings. |
| `<access origin="*" subdomains="true"/>` | Network allowlist (CSP-adjacent; scope it down for review). |

Version format: `[0-255].[0-255].[0-65535]`. Each store submission must
have a strictly higher version than the last.

## Certificates

A **certificate profile** = one **author certificate** + one or more
**distributor certificates**, managed in Tizen Studio's Certificate
Manager. The active profile signs the `.wgt` at package time.

- **Author certificate** — identifies you. **Updates must be signed with
  the same author certificate as the original** submission; lose it and
  you cannot update the published app.
- **Samsung distributor certificate** — for **side-loading to real TVs**.
  It embeds a **DUID allowlist**: only the TVs whose Device Unique ID you
  registered (TV: *Menu → Support → About This TV / Contact Samsung →
  Unique Device ID*, or auto-filled from a connected device) will install
  that build. Test-farm churn means keeping this list updated is ongoing.
- **Tizen distributor certificate** — the public one used for **store
  submission**; obtained through the Samsung developer account flow.
- Certificates expire — track the dates; an expired author cert at update
  time is a real problem.

## Build tooling

**Tizen Studio** (IDE) or the **Tizen CLI**:

```
tizen build-web -- <projectDir>                     # produce .buildResult
tizen package -t wgt -s <certificate-profile> -- <buildDir>   # sign → .wgt
tizen install -n <App>.wgt -t <device-name>         # side-load
tizen run -n <appId> -t <device-name>
```

- Register a target with `sdb connect <tv-ip>` after enabling
  **Developer Mode** on the TV (Apps screen → enter `12345` → set host
  PC IP → toggle on). The dev session must be re-enabled periodically.
- The required files inside a valid `.wgt` are `config.xml` (or
  `tizen-manifest.xml`), `author-signature.xml`, and `signature1.xml`.

## Emulator vs TV

- **TV Emulator** (x86 VM image per Tizen version) — good for layout/JS
  iteration; **no AVPlay hardware path, no DRM, no real remote key
  behaviour, no memory-pressure realism.**
- Certify-critical testing (playback, DRM, performance, real key codes,
  HDR) is on hardware, across the **model years** your `required_version`
  claims to support — Samsung's function test runs on multiple sets.

## Samsung Apps TV — Seller Office submission

Account and submission portal: **Samsung Apps TV Seller Office**
(`seller.samsungapps.com`).

Run Samsung's **launch checklist** before submitting. Package needs:

- The signed `.wgt`.
- **App UI Description** document (Samsung's testers follow it to
  exercise the app — vague scenarios get rejected pre-test).
- **Four screenshots**, JPEG, < 500 kB each, 1280×720 or 1920×1080.
- Logo and background images with transparency.
- Multi-language titles/descriptions; the default-language title must
  match `<name>` in `config.xml`.
- **Privacy policy URL**, VOC (customer-contact) email.
- **Test credentials** with full access for the reviewers.
- Declared privilege APIs for any of: in-app ads (`adinfo`), Samsung
  Checkout billing (`sso.partner` / `billing` / `productinfo`),
  microphone (`smartcontroller.microphone`, contact required).

### Recurring rejection causes

- Undeclared privilege for an API the app calls.
- Back at the root traps the user / doesn't exit; Back skips levels.
- A screen not operable in D-pad mode (pointer-only control).
- `webapis.js` not included → runtime `webapis is undefined` on the TV.
- Crash or black screen on resume from background (resources not
  released/rebuilt).
- Playback fails on the second session (leaked AVPlay / DRM session).
- Layout broken under overscan or at 720p.
- `required_version` claims model years the app was never tested on.

### Updates

Reuse the **same Tizen application ID** and the **same author
certificate**; bump the version. Every submission is re-reviewed from
scratch. Budget review time into release planning and keep the oldest
supported Tizen version in the regression pass — that's where review
fails you.
