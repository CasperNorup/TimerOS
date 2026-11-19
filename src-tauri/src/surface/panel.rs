use std::ffi::c_void;
use std::ptr::{null, null_mut};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Gdi::*,
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::*,
};

pub(super) fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

pub(super) fn rgb(value: &str, fallback: u32) -> u32 {
    let Some(value) = value.strip_prefix('#') else { return fallback };
    u32::from_str_radix(value, 16).ok().filter(|_| value.len() == 6)
        .map(|c| ((c >> 16) & 255) | (c & 0xff00) | ((c & 255) << 16))
        .unwrap_or(fallback)
}

pub(super) fn mix(base: u32, target: u32, opacity: u8) -> u32 {
    [0, 8, 16].into_iter().map(|shift| {
        let alpha = u32::from(opacity);
        let channel = (((base >> shift) & 255) * (255 - alpha) + ((target >> shift) & 255) * alpha) / 255;
        channel << shift
    }).sum()
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Bounds {
    pub fn from_rect(rect: RECT) -> Self {
        Self { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
    }

    pub fn relative_position(self, window: Self, padding: i32) -> (f64, f64) {
        let span = |outer, size| i32::max(outer - size - 2 * padding, 1);
        let fraction = |offset, room| f64::clamp(offset as f64 / room as f64, 0.0, 1.0);
        (fraction(window.x - self.x - padding, span(self.width, window.width)),
         fraction(window.y - self.y - padding, span(self.height, window.height)))
    }

    pub fn place(self, width: i32, height: i32, padding: i32, x: f64, y: f64) -> Self {
        let width = width.clamp(1, (self.width - 2 * padding).max(1));
        let height = height.clamp(1, (self.height - 2 * padding).max(1));
        Self {
            x: self.x + padding + ((self.width - width - 2 * padding) as f64 * x.clamp(0.0, 1.0)).round() as i32,
            y: self.y + padding + ((self.height - height - 2 * padding) as f64 * y.clamp(0.0, 1.0)).round() as i32,
            width, height,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Paint {
    pub color: u32,
    pub text: u32,
    pub accent: u32,
    pub clock: String,
    pub detail: String,
    pub progress: Option<f64>,
    pub thin: bool,
    pub movable: bool,
    pub scale: f64,
    pub gradient: Option<(u32, bool)>,
    pub font: String,
    pub clock_scale: f64,
    pub clock_weight: i32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum Shape {
    #[default]
    Rect,
    Round(i32),
    Edge(i32),
}

// These windows are explicitly layered, hit-test transparent and non-activating.
pub(super) struct Panel {
    pub hwnd: HWND,
    position: Option<Bounds>,
    shape: Shape,
    opacity: Option<u8>,
    visible: bool,
}

impl Panel {
    pub fn new(title: &str) -> Option<Self> {
        unsafe {
            let instance = GetModuleHandleW(null());
            let class_name = wide("TimerOS.PassiveSurface");
            let class = WNDCLASSW {
                lpfnWndProc: Some(window_proc), hInstance: instance, lpszClassName: class_name.as_ptr(),
                ..Default::default()
            };
            // RegisterClassW can return zero when this class is already registered.
            RegisterClassW(&class);
            let paint = Box::into_raw(Box::<Paint>::default());
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
                class_name.as_ptr(), wide(title).as_ptr(), WS_POPUP,
                0, 0, 1, 1, null_mut(), null_mut(), instance, null::<c_void>(),
            );
            if hwnd.is_null() {
                drop(Box::from_raw(paint));
                return None;
            }
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, paint as isize);
            Some(Self { hwnd, position: None, shape: Shape::Rect, opacity: None, visible: false })
        }
    }

    pub fn draw(&mut self, paint: Paint) {
        unsafe {
            let old = GetWindowLongPtrW(self.hwnd, GWLP_USERDATA) as *mut Paint;
            if *old == paint { return; }
            if (*old).movable != paint.movable {
                let style = GetWindowLongPtrW(self.hwnd, GWL_EXSTYLE);
                let transparent = WS_EX_TRANSPARENT as isize;
                SetWindowLongPtrW(self.hwnd, GWL_EXSTYLE,
                    if paint.movable { style & !transparent } else { style | transparent });
            }
            *old = paint;
            InvalidateRect(self.hwnd, null(), 0);
        }
    }

    pub fn move_to(&mut self, bounds: Bounds, shape: Shape, move_allowed: bool) {
        let size_changed = self.position.is_none_or(|old| old.width != bounds.width || old.height != bounds.height);
        unsafe {
            if self.position != Some(bounds) && move_allowed {
                SetWindowPos(self.hwnd, HWND_TOPMOST, bounds.x, bounds.y, bounds.width, bounds.height,
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER);
                self.position = Some(bounds);
            }
            if size_changed || self.shape != shape {
                let region = match shape {
                    Shape::Rect => null_mut(),
                    Shape::Round(r) => CreateRoundRectRgn(0, 0, bounds.width + 1, bounds.height + 1, r, r),
                    Shape::Edge(w) => {
                        let outer = CreateRectRgn(0, 0, bounds.width, bounds.height);
                        let inner = CreateRectRgn(w, w, (bounds.width - w).max(w), (bounds.height - w).max(w));
                        CombineRgn(outer, outer, inner, RGN_DIFF);
                        DeleteObject(inner);
                        outer
                    }
                };
                if SetWindowRgn(self.hwnd, region, 1) == 0 && !region.is_null() {
                    DeleteObject(region);
                }
                self.shape = shape;
            }
        }
    }

    pub fn forget_position(&mut self) { self.position = None; }

    pub fn current_bounds(&self) -> Option<Bounds> {
        let mut rect = RECT::default();
        (unsafe { GetWindowRect(self.hwnd, &mut rect) } != 0).then(|| Bounds::from_rect(rect))
    }

    pub fn show(&mut self, visible: bool, opacity: u8) {
        unsafe {
            if self.opacity != Some(opacity) {
                SetLayeredWindowAttributes(self.hwnd, 0, opacity, LWA_ALPHA);
                self.opacity = Some(opacity);
            }
            if self.visible != visible {
                ShowWindow(self.hwnd, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
                self.visible = visible;
            }
        }
    }
}

impl Drop for Panel {
    fn drop(&mut self) { unsafe { DestroyWindow(self.hwnd) }; }
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    let paint = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Paint;
    if !paint.is_null() {
        match msg {
            WM_NCHITTEST => return if (*paint).movable { HTCAPTION as isize } else { HTTRANSPARENT as isize },
            WM_MOUSEACTIVATE => return MA_NOACTIVATE as isize,
            WM_ERASEBKGND => return 1,
            WM_NCDESTROY => {
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                drop(Box::from_raw(paint));
            }
            WM_PAINT => {
                let mut state = PAINTSTRUCT::default();
                let dc = BeginPaint(hwnd, &mut state);
                let mut rect = RECT::default();
                GetClientRect(hwnd, &mut rect);
                render(dc, rect, &*paint);
                EndPaint(hwnd, &state);
                return 0;
            }
            _ => {}
        }
    }
    DefWindowProcW(hwnd, msg, w, l)
}

unsafe fn fill(dc: HDC, rect: RECT, color: u32) {
    let brush = CreateSolidBrush(color);
    FillRect(dc, &rect, brush);
    DeleteObject(brush);
}

unsafe fn gradient(dc: HDC, rect: RECT, start: u32, end: u32, vertical: bool) {
    let width = (rect.right - rect.left).max(1);
    let height = (rect.bottom - rect.top).max(1);
    let span = if vertical { height } else { width };
    let mut pixels = Vec::with_capacity(span as usize);
    for pos in 0..span {
        let color = mix(start, end, (255 * pos / (span - 1).max(1)) as u8);
        pixels.push(((color & 255) << 16) | (color & 0xff00) | (color >> 16));
    }
    let (source_width, source_height) = if vertical { (1, height) } else { (width, 1) };
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: source_width,
        biHeight: -source_height, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB,
        ..Default::default()
    };
    StretchDIBits(dc, rect.left, rect.top, width, height, 0, 0, source_width, source_height,
        pixels.as_ptr().cast(), &info, DIB_RGB_COLORS, SRCCOPY);
}

unsafe fn text(dc: HDC, mut rect: RECT, value: &str, color: u32, size: i32, weight: i32, family: &str) {
    let font = CreateFontW(-size, 0, 0, 0, weight, 0, 0, 0, DEFAULT_CHARSET as u32,
        OUT_DEFAULT_PRECIS as u32, CLIP_DEFAULT_PRECIS as u32, CLEARTYPE_QUALITY as u32,
        DEFAULT_PITCH as u32, wide(family).as_ptr());
    let previous = SelectObject(dc, font);
    SetBkMode(dc, TRANSPARENT as i32);
    SetTextColor(dc, color);
    let mut value = wide(value);
    DrawTextW(dc, value.as_mut_ptr(), -1, &mut rect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS);
    SelectObject(dc, previous);
    DeleteObject(font);
}

unsafe fn render(dc: HDC, rect: RECT, data: &Paint) {
    if let Some((end, vertical)) = data.gradient { gradient(dc, rect, data.color, end, vertical); }
    else { fill(dc, rect, data.color); }
    if data.clock.is_empty() && data.detail.is_empty() && data.progress.is_none() { return; }
    let scale = |px: f64| (px * data.scale).round().max(1.0) as i32;
    let left = scale(11.0);
    let right = rect.right - left;
    let bar_height = if data.progress.is_some() { scale(if data.thin { 2.0 } else { 5.0 }) } else { 0 };
    let bar_bottom = if data.thin { rect.bottom } else { rect.bottom - scale(8.0) };
    let text_bottom = if bar_height == 0 { rect.bottom } else { bar_bottom - bar_height - scale(3.0) };
    let time_bottom = if data.detail.is_empty() { text_bottom } else { text_bottom - scale(14.0) };
    if !data.clock.is_empty() {
        text(dc, RECT { left, top: 0, right, bottom: time_bottom }, &data.clock, data.text,
            scale(21.0 * data.clock_scale), data.clock_weight, &data.font);
    }
    if !data.detail.is_empty() {
        text(dc, RECT { left, top: if data.clock.is_empty() { 0 } else { time_bottom }, right, bottom: text_bottom },
            &data.detail, data.text, scale(11.0), 450, &data.font);
    }
    if let Some(progress) = data.progress {
        let start = if data.thin { 0 } else { left };
        let end = if data.thin { rect.right } else { right };
        if data.clock.is_empty() && data.detail.is_empty() {
            let middle = rect.bottom / 2;
            fill(dc, RECT { left: start, top: middle - bar_height, right: end, bottom: middle + bar_height }, 0x0051463a);
            fill(dc, RECT { left: start, top: middle - bar_height,
                right: start + ((end - start) as f64 * progress) as i32, bottom: middle + bar_height }, data.accent);
        } else {
            fill(dc, RECT { left: start, top: bar_bottom - bar_height, right: end, bottom: bar_bottom }, 0x0051463a);
            fill(dc, RECT { left: start, top: bar_bottom - bar_height,
                right: start + ((end - start) as f64 * progress) as i32, bottom: bar_bottom }, data.accent);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_mini_in_work_area_at_mixed_dpi_and_negative_origin() {
        let left = Bounds { x: -1920, y: -120, width: 1920, height: 1040 };
        let placed = left.place(240, 84, 18, 1.0, 1.0);
        assert_eq!(placed, Bounds { x: -258, y: 818, width: 240, height: 84 });
        assert_eq!(left.relative_position(placed, 18), (1.0, 1.0));
        let fallback = Bounds { x: 0, y: 0, width: 1280, height: 680 };
        let restored = fallback.place(160, 56, 12, 1.0, 1.0);
        assert_eq!(restored, Bounds { x: 1108, y: 612, width: 160, height: 56 });
    }
}
