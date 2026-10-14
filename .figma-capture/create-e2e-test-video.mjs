import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const output = resolve(".figma-capture/via-e2e-synthetic-20261014.mp4");
const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=6",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=6",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", output], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Video generation failed");
console.log(JSON.stringify({output, synthetic:true, durationSeconds:6}));
