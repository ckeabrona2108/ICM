import assert from "node:assert/strict";
import test from "node:test";

import { canonicalAudioContentType, resolveAudioContentType } from "@/lib/audio-content-type";
import { TrackUploadQueue, isPendingLocalAudioIssue } from "@/lib/track-upload-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("TrackUploadQueue joins a running upload of the same file", async () => {
  const queue = new TrackUploadQueue<string>();
  const file = { name: "a.wav" };
  const pending = deferred<string>();
  let starts = 0;
  const progress: number[] = [];

  const first = queue.run("t1", file, (emit) => {
    starts += 1;
    emit(10, 100);
    return pending.promise;
  });
  const second = queue.run("t1", file, () => {
    starts += 1;
    return Promise.resolve("other");
  }, (loaded) => progress.push(loaded));

  pending.resolve("key-1");
  assert.equal(await first, "key-1");
  assert.equal(await second, "key-1");
  assert.equal(starts, 1);
  assert.deepEqual(progress, [10]);
  assert.equal(queue.isRunning("t1"), false);
});

test("TrackUploadQueue starts again for a replaced file and after a failure", async () => {
  const queue = new TrackUploadQueue<string>();
  const oldFile = {};
  const newFile = {};
  let starts = 0;

  const failing = queue.run("t1", oldFile, async () => {
    starts += 1;
    throw new Error("network");
  });
  await assert.rejects(failing, /network/u);

  const retried = await queue.run("t1", oldFile, async () => {
    starts += 1;
    return "key-old";
  });
  const replaced = await queue.run("t1", newFile, async () => {
    starts += 1;
    return "key-new";
  });

  assert.equal(retried, "key-old");
  assert.equal(replaced, "key-new");
  assert.equal(starts, 3);
});

test("isPendingLocalAudioIssue only skips missing audio of locally attached tracks", () => {
  const tracks = [{ localAudioFile: new Blob(["x"]) }, { localAudioFile: null }];
  const missing = (index: number) => ({
    code: "required",
    field: `tracks.${index}.audioFile`,
    message: `Загрузите аудиофайл для трека №${index + 1}.`
  });

  assert.equal(isPendingLocalAudioIssue(missing(0), tracks), true);
  assert.equal(isPendingLocalAudioIssue(missing(1), tracks), false);
  assert.equal(
    isPendingLocalAudioIssue({ code: "invalid", field: "tracks.0.audioFile", message: "" }, tracks),
    false
  );
  assert.equal(
    isPendingLocalAudioIssue({ code: "required", field: "tracks.0.title", message: "" }, tracks),
    false
  );
});

test("resolveAudioContentType prefers the extension over browser aliases", () => {
  assert.equal(resolveAudioContentType("Трек 01.FLAC", "audio/x-flac"), "audio/flac");
  assert.equal(resolveAudioContentType("mix.wav", "audio/wave"), "audio/wav");
  assert.equal(resolveAudioContentType("mix.wav", ""), "audio/wav");
  assert.equal(resolveAudioContentType("noext", "audio/vnd.wave"), "audio/wav");
  assert.equal(resolveAudioContentType("noext", ""), "application/octet-stream");
  assert.equal(canonicalAudioContentType("Audio/X-FLAC; codecs=flac"), "audio/flac");
  assert.equal(canonicalAudioContentType("image/png"), "image/png");
});
