//! Bounded raster inspection. Animation bytes retain their frames/timing/palettes.
use image::{AnimationDecoder, DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use orbit_application::ALLIANCE_MEDIA_MAX_BYTES;
use std::io::{Cursor, Write};

fn limits() -> Limits {
    let mut l = Limits::default();
    l.max_image_width = Some(4096);
    l.max_image_height = Some(4096);
    l.max_alloc = Some(128 * 1024 * 1024);
    l
}
fn err(_: impl std::fmt::Display) -> String {
    "This image could not be decoded. Choose a valid PNG, JPEG, GIF, or WebP.".into()
}
fn validate_frames(frames: image::Frames<'_>) -> Result<(), String> {
    let mut count = 0u32;
    let mut pixels = 0u64;
    for frame in frames {
        let frame = frame.map_err(err)?;
        count += 1;
        pixels += u64::from(frame.buffer().width()) * u64::from(frame.buffer().height());
        if count > 300 || pixels > 64 * 1024 * 1024 {
            return Err("Animation exceeds 300 frames or the decoded image budget. Use a smaller animation.".into());
        }
    }
    if count == 0 {
        return Err("This animation has no frames.".into());
    }
    Ok(())
}
fn still(bytes: &[u8], format: ImageFormat) -> Result<DynamicImage, String> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits());
    let mut decoder = reader.into_decoder().map_err(err)?;
    let orientation = decoder.orientation().map_err(err)?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(err)?;
    image.apply_orientation(orientation);
    Ok(image)
}
fn png(image: DynamicImage) -> Result<Vec<u8>, String> {
    let mut out = Cursor::new(Vec::new());
    image.write_to(&mut out, ImageFormat::Png).map_err(err)?;
    Ok(out.into_inner())
}

pub(crate) fn prepare(bytes: Vec<u8>) -> Result<(Vec<u8>, &'static str), String> {
    if bytes.is_empty() || bytes.len() as u64 > ALLIANCE_MEDIA_MAX_BYTES {
        return Err("Choose an image no larger than 20 MiB.".into());
    }
    let format = image::guess_format(&bytes).map_err(err)?;
    let (output, mime) = match format {
        ImageFormat::Gif => {
            let mut decoder =
                image::codecs::gif::GifDecoder::new(Cursor::new(&bytes)).map_err(err)?;
            decoder.set_limits(limits()).map_err(err)?;
            validate_frames(decoder.into_frames())?;
            (clean_gif(&bytes)?, "image/gif")
        }
        ImageFormat::WebP => {
            let mut decoder =
                image::codecs::webp::WebPDecoder::new(Cursor::new(&bytes)).map_err(err)?;
            decoder.set_limits(limits()).map_err(err)?;
            if decoder.has_animation() {
                validate_frames(decoder.into_frames())?;
            } else {
                still(&bytes, format)?;
            }
            (clean_webp(&bytes)?, "image/webp")
        }
        ImageFormat::Jpeg => {
            let image = still(&bytes, format)?;
            let mut out = Cursor::new(Vec::new());
            image.write_to(&mut out, ImageFormat::Jpeg).map_err(err)?;
            (out.into_inner(), "image/jpeg")
        }
        ImageFormat::Png => {
            // PNG animation is not silently flattened. GIF and WebP are supported.
            let mut pos = 8usize;
            while pos + 12 <= bytes.len() {
                let n = u32::from_be_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
                if &bytes[pos + 4..pos + 8] == b"acTL" {
                    return Err("For animated artwork, choose GIF or WebP.".into());
                }
                pos = pos.checked_add(n + 12).ok_or_else(|| err("size"))?;
            }
            (png(still(&bytes, format)?)?, "image/png")
        }
        _ => return Err("Choose a PNG, JPEG, GIF, or WebP image.".into()),
    };
    if output.len() as u64 > ALLIANCE_MEDIA_MAX_BYTES {
        return Err("The processed image exceeds 20 MiB. Reduce its dimensions.".into());
    }
    Ok((output, mime))
}

pub(crate) fn poster(bytes: &[u8], max_side: u32) -> Result<Vec<u8>, String> {
    let format = image::guess_format(bytes).map_err(err)?;
    let image = still(bytes, format)?;
    png(image.thumbnail(max_side, max_side))
}

pub(crate) fn card_background(bytes: &[u8], x: u8, y: u8) -> Result<Vec<u8>, String> {
    let format = image::guess_format(bytes).map_err(err)?;
    let image = still(bytes, format)?;
    let (width, height) = (image.width(), image.height());
    // Crop before resizing: a one-pixel-wide image must never allocate an
    // enormous intermediate cover image.
    let (crop_width, crop_height) = if u64::from(width) * 630 > u64::from(height) * 1200 {
        ((height * 1200 / 630).max(1).min(width), height)
    } else {
        (width, (width * 630 / 1200).max(1).min(height))
    };
    let left = (width - crop_width) * u32::from(x.min(100)) / 100;
    let top = (height - crop_height) * u32::from(y.min(100)) / 100;
    png(image
        .crop_imm(left, top, crop_width, crop_height)
        .resize_exact(1200, 630, image::imageops::FilterType::Triangle))
}

pub(crate) fn symbol_raster(bytes: &[u8], size: u32) -> Result<Vec<u8>, String> {
    let tree = resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default())
        .map_err(|e| e.to_string())?;
    let mut pixels = resvg::tiny_skia::Pixmap::new(size, size).ok_or("symbol allocation failed")?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(
            size as f32 / tree.size().width(),
            size as f32 / tree.size().height(),
        ),
        &mut pixels.as_mut(),
    );
    pixels.encode_png().map_err(|e| e.to_string())
}

/// Re-encode indexed GIF frames without re-quantizing colors. Comments and foreign
/// application extensions are omitted; frame disposal, timing and repeat survive.
fn clean_gif(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut options = gif::DecodeOptions::new();
    options.set_color_output(gif::ColorOutput::Indexed);
    let mut reader = options.read_info(Cursor::new(bytes)).map_err(err)?;
    let mut out = Vec::new();
    {
        let mut encoder = gif::Encoder::new(
            &mut out,
            reader.width(),
            reader.height(),
            reader.global_palette().unwrap_or(&[]),
        )
        .map_err(err)?;
        encoder.set_repeat(reader.repeat()).map_err(err)?;
        while let Some(frame) = reader.read_next_frame().map_err(err)? {
            encoder.write_frame(frame).map_err(err)?;
        }
    }
    Ok(out)
}
/// Preserve WebP's encoded frames. Drop ancillary metadata and clear its flags.
fn clean_webp(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(err("header"));
    }
    let mut out = b"RIFF\0\0\0\0WEBP".to_vec();
    let mut pos = 12usize;
    while pos + 8 <= bytes.len() {
        let kind = &bytes[pos..pos + 4];
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let end = pos
            .checked_add(8 + size + (size % 2))
            .filter(|n| *n <= bytes.len())
            .ok_or_else(|| err("chunk"))?;
        if matches!(
            kind,
            b"VP8X" | b"VP8 " | b"VP8L" | b"ALPH" | b"ANIM" | b"ANMF"
        ) {
            let start = out.len();
            out.write_all(&bytes[pos..end]).map_err(err)?;
            if kind == b"VP8X" && size > 0 {
                out[start + 8] &= !(0x20 | 0x08 | 0x04);
            }
        }
        pos = end;
    }
    if pos != bytes.len() {
        return Err(err("trailing bytes"));
    }
    let len = (out.len() - 8) as u32;
    out[4..8].copy_from_slice(&len.to_le_bytes());
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn share_card_crops_to_the_selected_edge_and_bounds_skinny_inputs() {
        let image = image::RgbaImage::from_fn(400, 100, |x, _| {
            image::Rgba(if x < 200 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 255, 255]
            })
        });
        let bytes = png(DynamicImage::ImageRgba8(image)).unwrap();
        for (x, expected) in [(0, [255, 0, 0, 255]), (100, [0, 0, 255, 255])] {
            let card = image::load_from_memory(&card_background(&bytes, x, 50).unwrap())
                .unwrap()
                .into_rgba8();
            assert_eq!(card.dimensions(), (1200, 630));
            assert_eq!(card.get_pixel(600, 315).0, expected);
        }
        let skinny = png(DynamicImage::new_rgb8(1, 4096)).unwrap();
        let card = image::load_from_memory(&card_background(&skinny, 50, 100).unwrap()).unwrap();
        assert_eq!((card.width(), card.height()), (1200, 630));
    }

    #[test]
    fn rejects_non_images_and_oversized_canvases() {
        assert!(prepare(b"<svg onload='alert(1)'/>".to_vec()).is_err());
        let im = DynamicImage::new_rgb8(4097, 1);
        let bytes = png(im).unwrap();
        assert!(prepare(bytes).is_err());
    }
    #[test]
    fn gif_frames_repeat_and_timing_survive_and_poster_is_still() {
        let mut original = Vec::new();
        {
            let mut e = gif::Encoder::new(&mut original, 2, 2, &[0, 0, 0, 255, 0, 0]).unwrap();
            e.set_repeat(gif::Repeat::Infinite).unwrap();
            for color in [0, 1] {
                let f = gif::Frame {
                    width: 2,
                    height: 2,
                    delay: 7,
                    buffer: std::borrow::Cow::Owned(vec![color; 4]),
                    ..Default::default()
                };
                e.write_frame(&f).unwrap();
            }
        }
        if let Ok(path) = std::env::var("ORBIT_ALLIANCE_GIF_CAPTURE") {
            std::fs::write(path, &original).unwrap();
        }
        let (clean, mime) = prepare(original).unwrap();
        assert_eq!(mime, "image/gif");
        let d = image::codecs::gif::GifDecoder::new(Cursor::new(&clean)).unwrap();
        let frames = d.into_frames().collect_frames().unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].delay().numer_denom_ms(), (70, 1));
        let p = poster(&clean, 96).unwrap();
        assert_eq!(image::guess_format(&p).unwrap(), ImageFormat::Png);
    }

    #[test]
    fn animated_webp_keeps_lossless_pixels_timing_and_frames_without_private_metadata() {
        fn chunk(tag: &[u8; 4], data: &[u8]) -> Vec<u8> {
            let mut out = tag.to_vec();
            out.extend((data.len() as u32).to_le_bytes());
            out.extend(data);
            if data.len() % 2 == 1 {
                out.push(0)
            }
            out
        }
        let mut original = b"RIFF\0\0\0\0WEBP".to_vec();
        original.extend(chunk(b"VP8X", &[6, 0, 0, 0, 1, 0, 0, 1, 0, 0]));
        original.extend(chunk(b"ANIM", &[0, 0, 0, 0, 0, 0]));
        for color in [[255, 0, 0, 255], [0, 255, 0, 255]] {
            let image =
                DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(2, 2, image::Rgba(color)));
            let mut encoded = Cursor::new(Vec::new());
            image.write_to(&mut encoded, ImageFormat::WebP).unwrap();
            let mut frame = vec![0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 70, 0, 0, 0];
            frame.extend(&encoded.into_inner()[12..]);
            original.extend(chunk(b"ANMF", &frame));
        }
        original.extend(chunk(b"XMP ", b"private fixture metadata"));
        let size = (original.len() - 8) as u32;
        original[4..8].copy_from_slice(&size.to_le_bytes());
        if let Ok(path) = std::env::var("ORBIT_ALLIANCE_WEBP_CAPTURE") {
            std::fs::write(path, &original).unwrap();
        }
        let original_frames = image::codecs::webp::WebPDecoder::new(Cursor::new(&original))
            .unwrap()
            .into_frames()
            .collect_frames()
            .unwrap();
        let (clean, mime) = prepare(original).unwrap();
        assert_eq!(mime, "image/webp");
        assert!(!clean.windows(7).any(|w| w == b"private"));
        let decoder = image::codecs::webp::WebPDecoder::new(Cursor::new(clean)).unwrap();
        let frames = decoder.into_frames().collect_frames().unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].delay().numer_denom_ms(), (70, 1));
        assert_eq!(frames[0].buffer(), original_frames[0].buffer());
        assert_eq!(frames[1].buffer(), original_frames[1].buffer());
    }
}
