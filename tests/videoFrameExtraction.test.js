import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import * as media from '../server/videoAnalysisCore.js';

const run = promisify(execFile);

test('sampled frames cover the clip in order and bound portrait dimensions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'via-frames-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'portrait.mp4');
  // Six one-second sections; seeking to the wrong part repeats a color.
  const colors = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
  const args = ['-y'];
  for (const color of colors) args.push('-f', 'lavfi', '-i', `color=c=${color}:s=120x160:r=10:d=1`);
  args.push('-filter_complex', '[0:v][1:v][2:v][3:v][4:v][5:v]concat=n=6:v=1:a=0',
    '-c:v', 'libx264', '-threads', '1', source);
  await run(ffmpeg, args, { timeout: 15000 });
  const frames = await media.extractFrames(source, directory, 6);
  assert.equal(frames.length, 6);
  const expected = [[255, 0, 0], [0, 128, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255]];
  for (const [index, frame] of frames.entries()) {
    const bytes = Buffer.from(frame.base64, 'base64');
    assert.ok(bytes.length > 100);
    const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', frame.path], { encoding: 'utf8' }).catch(error => error);
    const dimensions = stderr.match(/Video:.*?\b(\d+)x(\d+)\b/);
    assert.ok(dimensions);
    assert.ok(Number(dimensions[1]) <= 1024 && Number(dimensions[2]) <= 1024, 'Both image dimensions must fit the cloud media budget');
    const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', frame.path, '-vf', 'scale=1:1',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
    expected[index].forEach((value, channel) => assert.ok(Math.abs(stdout[channel] - value) < 15, `Wrong color at sample ${index}`));
  }
});

test('undecodable media reports a decode failure without exposing the source path', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'via-invalid-frames-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'private-source.mp4');
  await writeFile(source, 'not a video');
  const diagnostics = [];
  t.mock.method(console, 'warn', (...values) => diagnostics.push(values));
  await assert.rejects(media.extractFrames(source, directory, 6), error => {
    assert.equal(error.status, 422);
    assert.equal(error.code, 'invalid_video');
    assert.match(error.message, /failed to decode or extract/);
    assert.doesNotMatch(error.message, /private-source/);
    return true;
  });
  assert.equal(diagnostics[0][1].stage, 'frames');
  assert.equal(diagnostics[0][1].timedOut, false);
  assert.equal(diagnostics[0][1].code, 1);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-source/);
});
