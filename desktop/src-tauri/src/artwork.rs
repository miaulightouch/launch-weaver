use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs, path::Path};

/// Artwork comes only from discovered launcher metadata, never a frontend path.
/// Local files must stay within that launcher's directory; only raster images
/// are exposed to the webview. Missing or unsupported artwork uses a UI fallback.
pub fn load(source: &str, root: &Path) -> Option<String> {
    if source.starts_with("https://") {
        return Some(source.to_owned());
    }
    let path = Path::new(source.strip_prefix("file://").unwrap_or(source));
    let path = if path.is_absolute() {
        path.to_owned()
    } else {
        root.join(path)
    };
    let path = path.canonicalize().ok()?;
    let root = root.canonicalize().ok()?;
    if !path.starts_with(root) {
        return None;
    }
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > 8 * 1024 * 1024 {
        return None;
    }
    let bytes = super::read(&path).ok()?;
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else {
        return None;
    };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loads_only_raster_files_inside_launcher_root() {
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("cover.png");
        fs::write(&image, include_bytes!("../icons/32x32.png")).unwrap();
        assert!(load(image.to_str().unwrap(), dir.path())
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let other = tempfile::tempdir().unwrap();
        assert!(load(image.to_str().unwrap(), other.path()).is_none());
        fs::write(&image, b"<svg onload='unsafe()'/>").unwrap();
        assert!(load(image.to_str().unwrap(), dir.path()).is_none());
        assert!(load("missing.png", dir.path()).is_none());
        assert!(load("http://example.com/cover.png", dir.path()).is_none());
        assert_eq!(
            load("https://example.com/cover.png", dir.path()).as_deref(),
            Some("https://example.com/cover.png")
        );
    }
}
