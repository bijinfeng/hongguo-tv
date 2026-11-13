# T0 synthetic media

These two original test patterns contain no third-party footage. Each is 12 seconds,
640×360, 24 fps H.264/yuv420p with mono AAC (440 Hz / 880 Hz). They ship in the
technical APK so emulator playback requires no network or development server.

Generate with FFmpeg 9:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=12' \
  -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=12' \
  -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -c:a aac -b:a 48k \
  -movflags +faststart t0-a.mp4
ffmpeg -f lavfi -i 'smptebars=size=640x360:rate=24:duration=12' \
  -f lavfi -i 'sine=frequency=880:sample_rate=44100:duration=12' \
  -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -c:a aac -b:a 48k \
  -movflags +faststart t0-b.mp4
```

FFmpeg is only an optional fixture-authoring tool, not a build or runtime dependency.
