import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOP_REST, POP_LENGTH, STING_LENGTH, loopMark, popMark, popPose, prefersStill, stingPose } from '../public/core/motion.js';

const resting = (pose, label) => {
  assert.ok(Math.hypot(pose.x, pose.y) < 0.05, `${label} rests ${pose.x}, ${pose.y} away from the drawn mark`);
  assert.ok(Math.abs(pose.rot) < 0.5, `${label} rests turned ${pose.rot}°`);
  assert.ok(Math.abs(pose.stretch - 1) < 0.01, `${label} rests stretched ${pose.stretch}`);
  assert.ok(Math.abs(pose.hinge) < 0.5, `${label} rests with the fold at ${pose.hinge}°`);
};

const largestStep = (poseAt, length) => {
  let previous = poseAt(0);
  let largest = 0;
  for (let t = 1 / 60; t <= length; t += 1 / 60) {
    const pose = poseAt(t);
    largest = Math.max(largest, Math.hypot(pose.x - previous.x, pose.y - previous.y));
    previous = pose;
  }
  return largest;
};

test('the sting starts as the folded sheet on the drawn mark and lands exactly on it', () => {
  const first = stingPose(0);
  assert.equal(first.hinge, 180);
  assert.equal(Math.hypot(first.x, first.y), 0);
  assert.equal(first.rot, 0);
  assert.equal(first.stretch, 1);
  resting(stingPose(STING_LENGTH), 'the sting');
});

test('the pop starts and ends on the drawn mark', () => {
  assert.equal(popPose(0).hinge, 180);
  resting(popPose(POP_LENGTH), 'the pop');
});

test('the sting is a short flight that moves less than seven units between frames', () => {
  assert.ok(STING_LENGTH < 1.6);
  assert.ok(largestStep(stingPose, STING_LENGTH) < 7);
});

test('the pop stays in place and is over in under a second', () => {
  assert.ok(POP_LENGTH < 1);
  assert.equal(largestStep(popPose, POP_LENGTH), 0);
});

test('the loading loop rests between flights', () => {
  assert.ok(LOOP_REST >= 1);
});

test('without a motion preference to read, the mark stays still', () => {
  assert.equal(prefersStill(), true);
  assert.doesNotThrow(() => popMark(null, null));
  const loop = loopMark(null, null);
  assert.equal(typeof loop.stop, 'function');
  loop.stop();
});

test('the loading screen loops the mark and the brand link pops it', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /loopMark\(bootMark\.querySelector\('\.brand-ink'\), bootMark\.querySelector\('\.brand-fold'\)\)/);
  assert.match(app, /popOnHover\(document, '\.app-brand, \.signin-brand'/);
});
