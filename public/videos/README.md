# Owned temple footage (drop-in)

Place **owned/licensed** video files here, named by temple id:

```
public/videos/T0010.mp4     (or .webm / .ogv)
public/videos/T0009.mp4
...
```

When a file exists for a temple, the trip page automatically plays it with a
clean HTML5 `<video>` player (no YouTube UI, no hover title/channel overlay,
no native controls — only the app's fullscreen button over the picture,
`object-fit: cover` fills the 16:9 frame).

When no file exists, the temple falls back to its mapped YouTube URL, where
YouTube's hover UI and the footage's own letterboxing/watermarks remain
(provider/content-controlled — not removable by CSS).

Current YouTube-backed temples awaiting originals:
T0001, T0006, T0009, T0010, T0011, T0014.

Prefer 16:9 masters (any resolution; ≥720p recommended). If a source is
wider (e.g. 2.35:1), `cover` crops the letterbox bars — review the crop on
the page and supply a pre-cropped master if framing matters.
