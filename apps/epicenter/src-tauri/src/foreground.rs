//! Foreground application identity and focused-field probing.
//!
//! One pull-based command answers two questions Whispering asks at two named
//! moments: which application is in front (sampled at recording start, to
//! route per-app behavior) and whether the focused UI element is a secure
//! text field (re-sampled immediately before delivery, to withhold a paste
//! into a password box).
//!
//! Identity is the smallest stable name per platform: the lowercased
//! executable file name on Windows, the bundle identifier on macOS. Window
//! titles are refused by design: they carry document names, URLs, and email
//! subjects, exactly the data class this capability must keep out of prompts,
//! logs, and synced rows.
//!
//! Detection is best-effort and fail-open. Every probe failure (elevated
//! target window, no frontmost app, missing macOS Accessibility grant,
//! UI Automation refusal) collapses to `None` / `Unknown`, which callers must
//! treat as "no rule matches, no guard fires".

/// What the focused UI element revealed about itself.
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FocusedFieldKind {
    /// The platform affirmatively reported a password/secure field.
    Secure,
    /// The platform affirmatively reported a non-secure element.
    NotSecure,
    /// The platform could not say. Callers treat this as not secure.
    Unknown,
}

/// A snapshot of what is in front of the user right now.
#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundContext {
    /// Stable per-platform identity: lowercased exe file name on Windows
    /// ("code.exe"), bundle identifier on macOS ("com.microsoft.VSCode").
    /// `None` when the OS refuses to say (elevated target, no frontmost app).
    pub app_id: Option<String>,
    /// Human-readable name for settings helper UI only. Never matched against.
    pub app_name: Option<String>,
    pub focused_field: FocusedFieldKind,
}

impl ForegroundContext {
    fn unknown() -> Self {
        Self {
            app_id: None,
            app_name: None,
            focused_field: FocusedFieldKind::Unknown,
        }
    }
}

/// Reports the foreground application and focused-field kind.
///
/// Never errors: every platform refusal degrades to `None` / `Unknown` so a
/// probe failure can never fail a dictation.
#[tauri::command]
#[specta::specta]
pub async fn get_foreground_context(app: tauri::AppHandle) -> ForegroundContext {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        // Win32 and COM calls block; keep them off the async runtime.
        tauri::async_runtime::spawn_blocking(windows_impl::probe)
            .await
            .unwrap_or_else(|_| ForegroundContext::unknown())
    }
    #[cfg(target_os = "macos")]
    {
        // The AX probe needs the same Accessibility trust the paste path
        // gates on; without it, only identity (which needs no grant) is
        // reported and the field stays `Unknown`.
        let ax_trusted = {
            use crate::keyboard::{DictationCapability, TapController};
            app.state::<TapController>().capability() == DictationCapability::Active
        };
        tauri::async_runtime::spawn_blocking(move || macos_impl::probe(ax_trusted))
            .await
            .unwrap_or_else(|_| ForegroundContext::unknown())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = app;
        ForegroundContext::unknown()
    }
}

/// Lowercased file name of an executable path ("C:\\...\\Code.exe" ->
/// "code.exe"), or `None` for a path with no file component.
#[cfg(any(target_os = "windows", test))]
fn app_id_from_image_path(path: &str) -> Option<String> {
    let file_name = path.rsplit(['\\', '/']).next()?;
    if file_name.is_empty() {
        return None;
    }
    Some(file_name.to_lowercase())
}

/// Display name for an executable file name ("code.exe" -> "code").
#[cfg(any(target_os = "windows", test))]
fn app_name_from_app_id(app_id: &str) -> String {
    app_id.strip_suffix(".exe").unwrap_or(app_id).to_string()
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{
        app_id_from_image_path, app_name_from_app_id, FocusedFieldKind, ForegroundContext,
    };
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    pub fn probe() -> ForegroundContext {
        let window = unsafe { GetForegroundWindow() };
        if window.is_invalid() {
            return ForegroundContext {
                app_id: None,
                app_name: None,
                focused_field: FocusedFieldKind::Unknown,
            };
        }
        let app_id = foreground_app_id(window);
        ForegroundContext {
            app_name: app_id.as_deref().map(app_name_from_app_id),
            app_id,
            focused_field: focused_field_kind(),
        }
    }

    /// Lowercased exe file name of the process owning the given window, or
    /// `None` when the process refuses inspection (elevated targets do).
    fn foreground_app_id(window: HWND) -> Option<String> {
        let mut process_id = 0u32;
        if unsafe { GetWindowThreadProcessId(window, Some(&mut process_id)) } == 0
            || process_id == 0
        {
            return None;
        }
        let process =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let queried = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };
        let _ = unsafe { CloseHandle(process) };
        queried.ok()?;
        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        app_id_from_image_path(&path)
    }

    /// Asks UI Automation whether the focused element is a password field.
    ///
    /// Any refusal along the way (COM, no focused element, an elevated target
    /// UIA cannot cross into) is `Unknown`, never an error: the guard is
    /// defense-in-depth against the common accident, not a security boundary.
    fn focused_field_kind() -> FocusedFieldKind {
        // Per-call COM init on this blocking-pool thread; S_FALSE (already
        // initialized) also counts as success and still needs the matching
        // CoUninitialize.
        let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if com.is_err() {
            return FocusedFieldKind::Unknown;
        }
        let kind = (|| {
            let automation: IUIAutomation =
                unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()?;
            let element = unsafe { automation.GetFocusedElement() }.ok()?;
            let is_password = unsafe { element.CurrentIsPassword() }.ok()?;
            Some(if is_password.as_bool() {
                FocusedFieldKind::Secure
            } else {
                FocusedFieldKind::NotSecure
            })
        })()
        .unwrap_or(FocusedFieldKind::Unknown);
        unsafe { CoUninitialize() };
        kind
    }
}

#[cfg(target_os = "macos")]
mod macos_impl {
    use super::{FocusedFieldKind, ForegroundContext};

    pub fn probe(ax_trusted: bool) -> ForegroundContext {
        let (app_id, app_name) = frontmost_application();
        ForegroundContext {
            app_id,
            app_name,
            focused_field: if ax_trusted {
                focused_field_kind()
            } else {
                FocusedFieldKind::Unknown
            },
        }
    }

    /// Bundle identifier and localized name of the frontmost application.
    /// Needs no Accessibility grant.
    fn frontmost_application() -> (Option<String>, Option<String>) {
        use objc2_app_kit::NSWorkspace;

        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let Some(application) = (unsafe { workspace.frontmostApplication() }) else {
            return (None, None);
        };
        let app_id = unsafe { application.bundleIdentifier() }.map(|id| id.to_string());
        let app_name = unsafe { application.localizedName() }.map(|name| name.to_string());
        (app_id, app_name)
    }

    /// Asks the Accessibility API whether the system-wide focused element is a
    /// secure text field. Only called when the process holds the grant; every
    /// AX refusal is `Unknown`.
    fn focused_field_kind() -> FocusedFieldKind {
        use accessibility_sys::{
            kAXErrorSuccess, kAXFocusedUIElementAttribute, kAXRoleAttribute,
            kAXSecureTextFieldRole, AXUIElementCopyAttributeValue, AXUIElementCreateSystemWide,
        };
        use core_foundation::base::TCFType;
        use core_foundation::string::CFString;
        use core_foundation_sys::base::{CFRelease, CFTypeRef};

        // SAFETY: system-wide element and attribute copies follow the CF
        // create rule; every non-null ref taken here is released before
        // return. The attribute name constants are static strings.
        unsafe {
            let system_wide = AXUIElementCreateSystemWide();
            if system_wide.is_null() {
                return FocusedFieldKind::Unknown;
            }

            let focused_attribute = CFString::new(kAXFocusedUIElementAttribute);
            let mut focused: CFTypeRef = std::ptr::null();
            let copied = AXUIElementCopyAttributeValue(
                system_wide,
                focused_attribute.as_concrete_TypeRef(),
                &mut focused,
            );
            CFRelease(system_wide as CFTypeRef);
            if copied != kAXErrorSuccess || focused.is_null() {
                return FocusedFieldKind::Unknown;
            }

            let role_attribute = CFString::new(kAXRoleAttribute);
            let mut role: CFTypeRef = std::ptr::null();
            let copied = AXUIElementCopyAttributeValue(
                focused as accessibility_sys::AXUIElementRef,
                role_attribute.as_concrete_TypeRef(),
                &mut role,
            );
            CFRelease(focused);
            if copied != kAXErrorSuccess || role.is_null() {
                return FocusedFieldKind::Unknown;
            }

            let role_name = CFString::wrap_under_create_rule(role as _).to_string();
            if role_name == kAXSecureTextFieldRole {
                FocusedFieldKind::Secure
            } else {
                FocusedFieldKind::NotSecure
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{app_id_from_image_path, app_name_from_app_id};

    #[test]
    fn app_id_is_the_lowercased_file_name() {
        assert_eq!(
            app_id_from_image_path(
                r"C:\Users\nico\AppData\Local\Programs\Microsoft VS Code\Code.exe"
            ),
            Some("code.exe".to_string())
        );
        assert_eq!(
            app_id_from_image_path(r"C:\WINDOWS\system32\notepad.exe"),
            Some("notepad.exe".to_string())
        );
        assert_eq!(
            app_id_from_image_path("/usr/bin/some-tool"),
            Some("some-tool".to_string())
        );
    }

    #[test]
    fn app_id_refuses_pathless_input() {
        assert_eq!(app_id_from_image_path(""), None);
        assert_eq!(app_id_from_image_path(r"C:\ends\with\separator\"), None);
    }

    #[test]
    fn app_name_drops_the_exe_suffix_only() {
        assert_eq!(app_name_from_app_id("code.exe"), "code");
        assert_eq!(app_name_from_app_id("wt.exe"), "wt");
        assert_eq!(app_name_from_app_id("some-tool"), "some-tool");
    }
}
