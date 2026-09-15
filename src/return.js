import { TextFlicker } from './flicker.js';

// Experimental return: randomly staggered characters resolve from Matrix glyphs.
export class ReturnTransition {
  constructor(now = performance.now(), duration = 500, flicker = new TextFlicker(Math.random,duration)) {
    this.started = now;
    this.duration = duration;
    this.flicker = flicker;
    this.flicker.reset();
  }
  done(now = performance.now()) { return now - this.started >= this.duration; }
  frame(term, rain, now = performance.now()) {
    return this.flicker.frame(term,0,now);
  }
}
