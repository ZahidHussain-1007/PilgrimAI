# Owned temple footage (drop-in)

Place an **owned/licensed original** here for each temple that should use
clean HTML5 playback, named by that temple's ID:

```
public/videos/T0003.mp4     (or .webm / .ogv)
```

The same naming rule applies to every temple ID from T0001 through T0023.
Each file must be footage of its matching temple; do not reuse another
temple's video. This checkout currently contains no local video files, so
all temples use their registered YouTube source until matching originals
are provided.

When a matching file exists, the trip player automatically uses a clean
HTML5 `<video>` player without YouTube UI or hover title/channel overlay.
It has no native controls; the app provides playback and fullscreen controls.
In the fullscreen planning experience, `object-fit: cover` fills the viewport
without stretching, and may crop footage when source and viewport aspect
ratios differ.

When no file exists, the temple falls back to its mapped YouTube URL, where
YouTube's avatar, title, logo, internal aspect-ratio fitting and any
letterboxing/watermarks in the footage remain provider/content-controlled;
they are not removable by application CSS.

Prefer 16:9 masters (any resolution; 720p or higher recommended). If a
source is wider (e.g. 2.35:1), `cover` crops the edges; review the crop and
provide a correctly framed master if important details would be lost.
