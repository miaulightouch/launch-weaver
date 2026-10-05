/// Return a physical client size that fits the monitor work area at its current
/// scale. Hidden/Wayland windows may not report decorations yet, so reserve a
/// title bar even when the measured frame is zero.
pub fn fit_size(
    requested: (u32, u32),
    work_area: (u32, u32),
    scale: f64,
    frame: (u32, u32),
) -> (u32, u32) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let margin = (32.0 * scale).ceil() as u32;
    let frame_width = frame.0.max((8.0 * scale).ceil() as u32);
    let frame_height = frame.1.max((48.0 * scale).ceil() as u32);
    (
        requested.0.min(
            work_area
                .0
                .saturating_sub(margin.saturating_add(frame_width))
                .max(1),
        ),
        requested.1.min(
            work_area
                .1
                .saturating_sub(margin.saturating_add(frame_height))
                .max(1),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fits_default_window_at_175_percent_with_desktop_panel() {
        assert_eq!(
            fit_size((1925, 1365), (1920, 1027), 1.75, (0, 0)),
            (1850, 887)
        );
    }
    #[test]
    fn retains_small_windows_and_respects_measured_decorations() {
        assert_eq!(fit_size((800, 400), (1920, 1027), 1.75, (0, 0)), (800, 400));
        assert_eq!(fit_size((1100, 780), (800, 600), 1.0, (10, 60)), (758, 508));
    }
    #[test]
    fn handles_tiny_work_areas_without_underflow() {
        assert_eq!(fit_size((1100, 780), (20, 20), 2.0, (0, 0)), (1, 1));
    }
}
