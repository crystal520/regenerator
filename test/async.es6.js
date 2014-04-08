/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
 * additional grant of patent rights can be found in the PATENTS file in
 * the same directory.
 */

var assert = require("assert");

describe("wrapGenerator", function() {
  it("should be defined globally", function() {
    var global = Function("return this")();
    assert.ok("wrapGenerator" in global);
    assert.strictEqual(global.wrapGenerator, wrapGenerator);
  });

  it("should be a function", function() {
    assert.strictEqual(typeof wrapGenerator, "function");
  });
});

describe("Promise", function() {
  it("should be defined globally", function() {
    var global = Function("return this")();
    assert.ok("Promise" in global);
    assert.strictEqual(global.Promise, Promise);
  });

  it("should be a function", function() {
    assert.strictEqual(typeof Promise, "function");
  });
});

describe("no-await async function", function() {
  it("should return a Promise", function(done) {
    var called = false;

    async function noAwait(value) {
      called = true;
      return value;
    }

    var promise = noAwait("asdf");
    assert.strictEqual(called, true);

    promise.done(function(value) {
      assert.strictEqual(called, true);
      assert.strictEqual(value, "asdf");
      done();
    });
  });
});

describe("one-await async function", function() {
  it("should finish asynchronously", function(done) {
    var flag1 = false;
    var flag2 = false;

    async function oneAwait(value) {
      flag1 = true;
      var result = await value;
      flag2 = true;
      return result;
    }

    var promise = oneAwait("asdf");
    assert.strictEqual(flag1, true);
    assert.strictEqual(flag2, false);

    promise.done(function(value) {
      assert.strictEqual(flag2, true);
      assert.strictEqual(value, "asdf");
      done();
    });
  });
});
